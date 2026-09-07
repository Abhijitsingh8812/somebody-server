import { Server as SocketIOServer, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { JwtPayload } from '../../types';
import { getDb, schema } from '../../database';
import { ChatsService } from '../../modules/chats/chats.service';
import { BlocksService } from '../../modules/blocks/blocks.service';
import { NotificationService } from '../../modules/notifications/notification.service';

export class SocketService {
  private static io: SocketIOServer | null = null;

  static initialize(fastify: FastifyInstance) {
    if (!fastify.io) {
      console.warn('Socket.IO is not attached to Fastify instance');
      return;
    }
    this.io = fastify.io;
    const io = this.io;

    // Socket JWT Authentication Middleware
    io.use((socket: Socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      try {
        const decoded = fastify.jwt.verify<JwtPayload>(token);
        (socket as any).user = decoded;
        next();
      } catch {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    io.on('connection', (socket: Socket) => {
      const user = (socket as any).user as JwtPayload;
      console.log(`Socket connected: User ${user.userId} (${socket.id})`);

      // Bind user to personal socket room & broadcast presence
      socket.join(`user:${user.userId}`);
      io.emit('user:presence', { userId: user.userId, status: 'online' });

      // Join Chat Room
      socket.on('chat:join', async (data: { chatId: string }) => {
        try {
          if (!data?.chatId) return;
          await ChatsService.getChatById(data.chatId, user.userId);
          socket.join(`chat:${data.chatId}`);
          console.log(`User ${user.userId} joined room chat:${data.chatId}`);
        } catch (err: any) {
          socket.emit('error', { code: 'CHAT_JOIN_DENIED', message: err.message });
        }
      });

      // Leave Chat Room
      socket.on('chat:leave', (data: { chatId: string }) => {
        if (data?.chatId) {
          socket.leave(`chat:${data.chatId}`);
        }
      });

      // Send Message Event (Supports TEXT & VOICE)
      socket.on('message:send', async (data: {
        chatId: string;
        messageType?: 'TEXT' | 'VOICE';
        content?: string;
        storageObjectKey?: string;
        voiceDuration?: number;
      }) => {
        try {
          if (!data?.chatId) return;

          const msgType = data.messageType || 'TEXT';

          // Verify chat participant
          const chat = await ChatsService.getChatById(data.chatId, user.userId);

          // Check block status
          const otherUserId = chat.userA === user.userId ? chat.userB : chat.userA;
          const isBlocked = await BlocksService.isBlockedPair(user.userId, otherUserId);
          if (isBlocked) {
            return socket.emit('error', { code: 'USER_BLOCKED', message: 'Cannot send message to blocked user' });
          }

          let content: string | null = null;
          let storageObjectKey: string | null = null;
          let voiceDuration: number | null = null;
          let lastMessagePreview = '';

          if (msgType === 'VOICE') {
            if (!data.storageObjectKey || typeof data.storageObjectKey !== 'string') {
              return socket.emit('error', { code: 'MESSAGE_INVALID', message: 'Voice message storage key is required' });
            }

            // Key ownership validation: Must start with voice/<chatId>/
            const expectedPrefix = `voice/${data.chatId}/`;
            if (!data.storageObjectKey.startsWith(expectedPrefix)) {
              return socket.emit('error', { code: 'MESSAGE_INVALID', message: 'Invalid storage object key structure' });
            }

            if (typeof data.voiceDuration !== 'number' || data.voiceDuration <= 0 || data.voiceDuration > 60) {
              return socket.emit('error', { code: 'MESSAGE_INVALID', message: 'Voice duration must be between 1 and 60 seconds' });
            }

            storageObjectKey = data.storageObjectKey;
            voiceDuration = Math.round(data.voiceDuration);
            lastMessagePreview = `🎤 Voice Note (${voiceDuration}s)`;
          } else {
            // TEXT Message validation
            if (!data.content || typeof data.content !== 'string') {
              return socket.emit('error', { code: 'MESSAGE_INVALID', message: 'Message content required' });
            }
            const trimmed = data.content.trim();
            if (trimmed.length === 0 || trimmed.length > 2000) {
              return socket.emit('error', { code: 'MESSAGE_INVALID', message: 'Message content invalid' });
            }
            content = trimmed;
            lastMessagePreview = trimmed.slice(0, 100);
          }

          const db = getDb();
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // Default 1 hour lifetime

          // Insert message into Neon
          const [insertedMsg] = await db
            .insert(schema.messages)
            .values({
              chatId: data.chatId,
              senderId: user.userId,
              messageType: msgType,
              content,
              storageObjectKey,
              voiceDuration,
              createdAt: now,
              expiresAt,
            })
            .returning();

          // Update last message metadata on chat
          await db
            .update(schema.chats)
            .set({
              lastMessage: lastMessagePreview,
              lastMessageAt: now,
              updatedAt: now,
            })
            .where(eq(schema.chats.id, data.chatId));

          const payload = {
            id: insertedMsg.id,
            chatId: insertedMsg.chatId,
            senderId: insertedMsg.senderId,
            messageType: insertedMsg.messageType,
            content: insertedMsg.content,
            storageObjectKey: insertedMsg.storageObjectKey,
            voiceDuration: insertedMsg.voiceDuration,
            createdAt: insertedMsg.createdAt.toISOString(),
            expiresAt: insertedMsg.expiresAt.toISOString(),
          };

          // Broadcast to chat room & recipient user room
          io.to(`chat:${data.chatId}`).emit('message:new', payload);
          io.to(`user:${otherUserId}`).emit('message:new', payload);

          // Duplicate Notification Prevention: Check if recipient is actively in chat room
          const chatRoom = io.sockets.adapter.rooms.get(`chat:${data.chatId}`);
          const recipientUserRoom = io.sockets.adapter.rooms.get(`user:${otherUserId}`);
          
          let recipientInChat = false;
          if (chatRoom && recipientUserRoom) {
            for (const socketId of recipientUserRoom) {
              if (chatRoom.has(socketId)) {
                recipientInChat = true;
                break;
              }
            }
          }

          if (!recipientInChat) {
            // Fetch sender profile name safely
            const [senderProfile] = await db
              .select({ displayName: schema.profiles.displayName })
              .from(schema.profiles)
              .where(eq(schema.profiles.userId, user.userId))
              .limit(1);

            const senderName = senderProfile?.displayName || 'SomeBody User';
            const notifTitle = senderName;
            const notifBody = msgType === 'VOICE' 
              ? '🎙️ Voice message received' 
              : (content ? (content.length > 60 ? `${content.slice(0, 60)}...` : content) : 'Sent you a message');

            NotificationService.sendPushNotification(otherUserId, notifTitle, notifBody, {
              type: 'chat',
              chatId: data.chatId,
              senderId: user.userId,
            }).catch(() => {});
          }
        } catch (err: any) {
          socket.emit('error', { code: 'MESSAGE_SEND_FAILED', message: err.message });
        }
      });

      // Typing Indicators
      socket.on('typing:start', async (data: { chatId: string }) => {
        if (!data?.chatId) return;
        socket.to(`chat:${data.chatId}`).emit('typing:start', { chatId: data.chatId, userId: user.userId });
      });

      socket.on('typing:stop', async (data: { chatId: string }) => {
        if (!data?.chatId) return;
        socket.to(`chat:${data.chatId}`).emit('typing:stop', { chatId: data.chatId, userId: user.userId });
      });

      // Disconnect Lifecycle
      socket.on('disconnect', () => {
        console.log(`Socket disconnected: User ${user.userId}`);
        io.emit('user:presence', { userId: user.userId, status: 'offline' });
      });
    });
  }

  static emitToChat(chatId: string, event: string, payload: any) {
    if (this.io) {
      this.io.to(`chat:${chatId}`).emit(event, payload);
    }
  }

  static emitToUser(userId: string, event: string, payload: any) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, payload);
    }
  }
}

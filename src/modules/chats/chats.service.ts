import { eq, or, and, gt, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../../database';
import { ConnectionsService } from '../connections/connections.service';
import { BlocksService } from '../blocks/blocks.service';
import { SocketService } from '../../services/realtime/socket.service';

export class ChatsService {
  static async uploadVoiceMessage(
    chatId: string,
    senderId: string,
    durationSeconds: number,
    mimeType: string,
    audioBuffer: Buffer
  ) {
    const chat = await this.getChatById(chatId, senderId);

    const otherUserId = chat.userA === senderId ? chat.userB : chat.userA;
    const isBlocked = await BlocksService.isBlockedPair(senderId, otherUserId);
    if (isBlocked) {
      throw new Error('Cannot send message to blocked user');
    }

    const duration = Math.round(durationSeconds);
    if (isNaN(duration) || duration < 1 || duration > 60) {
      throw new Error('Voice duration must be between 1 and 60 seconds');
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Audio payload is empty');
    }

    const db = getDb();
    const now = new Date();

    // Query sender profile preferences for message expiration time
    const senderProfiles = await db
      .select({ preferences: schema.profiles.preferences })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, senderId))
      .limit(1);

    const senderPrefs = (senderProfiles[0]?.preferences && typeof senderProfiles[0].preferences === 'object')
      ? (senderProfiles[0].preferences as Record<string, any>)
      : {};
    const expirationMinutes = Number(senderPrefs.messageExpirationMinutes) || 60;
    const expiresAt = new Date(now.getTime() + expirationMinutes * 60 * 1000);

    const [insertedMsg] = await db
      .insert(schema.messages)
      .values({
        chatId,
        senderId,
        messageType: 'VOICE',
        content: null,
        audioData: audioBuffer,
        audioMimeType: mimeType || 'audio/m4a',
        audioSizeBytes: audioBuffer.byteLength,
        voiceDuration: duration,
        createdAt: now,
        expiresAt,
      })
      .returning();

    await db
      .update(schema.chats)
      .set({
        lastMessage: `🎤 Voice Note (${duration}s)`,
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(schema.chats.id, chatId));

    await SocketService.broadcastNewMessage(chatId, senderId, insertedMsg).catch(() => {});


    return {
      id: insertedMsg.id,
      chatId: insertedMsg.chatId,
      senderId: insertedMsg.senderId,
      messageType: insertedMsg.messageType,
      content: null,
      storageObjectKey: null,
      voiceDuration: insertedMsg.voiceDuration,
      createdAt: insertedMsg.createdAt.toISOString(),
      expiresAt: insertedMsg.expiresAt.toISOString(),
    };
  }

  static async sendMessage(chatId: string, senderId: string, content: string) {
    if (!content || typeof content !== 'string') {
      throw new Error('Message content is required');
    }
    const trimmed = content.trim();
    if (trimmed.length === 0 || trimmed.length > 2000) {
      throw new Error('Message content must be between 1 and 2000 characters');
    }

    const chat = await this.getChatById(chatId, senderId);
    const otherUserId = chat.userA === senderId ? chat.userB : chat.userA;

    const isBlocked = await BlocksService.isBlockedPair(senderId, otherUserId);
    if (isBlocked) {
      throw new Error('Cannot send message to blocked user');
    }

    const db = getDb();
    const now = new Date();

    const senderProfiles = await db
      .select({ preferences: schema.profiles.preferences })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, senderId))
      .limit(1);

    const senderPrefs = (senderProfiles[0]?.preferences && typeof senderProfiles[0].preferences === 'object')
      ? (senderProfiles[0].preferences as Record<string, any>)
      : {};
    const expirationMinutes = Number(senderPrefs.messageExpirationMinutes) || 60;
    const expiresAt = new Date(now.getTime() + expirationMinutes * 60 * 1000);

    const [insertedMsg] = await db
      .insert(schema.messages)
      .values({
        chatId,
        senderId,
        messageType: 'TEXT',
        content: trimmed,
        createdAt: now,
        expiresAt,
      })
      .returning();

    await db
      .update(schema.chats)
      .set({
        lastMessage: trimmed.slice(0, 100),
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(eq(schema.chats.id, chatId));

    await SocketService.broadcastNewMessage(chatId, senderId, insertedMsg).catch(() => {});

    return {
      id: insertedMsg.id,
      chatId: insertedMsg.chatId,
      senderId: insertedMsg.senderId,
      messageType: insertedMsg.messageType,
      content: insertedMsg.content,
      storageObjectKey: null,
      voiceDuration: null,
      createdAt: insertedMsg.createdAt.toISOString(),
      expiresAt: insertedMsg.expiresAt.toISOString(),
    };
  }

  static async createOrGetChat(currentUserId: string, targetUserId: string) {

    const db = getDb();

    if (currentUserId === targetUserId) {
      throw new Error('Cannot create a conversation with yourself');
    }

    // Check block
    const isBlocked = await BlocksService.isBlockedPair(currentUserId, targetUserId);
    if (isBlocked) {
      throw new Error('Cannot create a conversation with a blocked user');
    }

    // Check accepted connection
    const connected = await ConnectionsService.areConnected(currentUserId, targetUserId);
    if (!connected) {
      throw new Error('You must have an accepted connection to start a chat');
    }

    // Canonical lexicographical ordering for CHECK (user_a < user_b) constraint
    const [userA, userB] = currentUserId < targetUserId
      ? [currentUserId, targetUserId]
      : [targetUserId, currentUserId];

    // Check existing chat
    const existing = await db
      .select()
      .from(schema.chats)
      .where(and(eq(schema.chats.userA, userA), eq(schema.chats.userB, userB)))
      .limit(1);

    if (existing.length > 0) {
      return await this.hydrateChat(existing[0], currentUserId);
    }

    // Create new chat
    const [newChat] = await db
      .insert(schema.chats)
      .values({
        userA,
        userB,
      })
      .returning();

    return await this.hydrateChat(newChat, currentUserId);
  }

  static async getUserChats(userId: string) {
    const db = getDb();

    const chatRows = await db
      .select()
      .from(schema.chats)
      .where(or(eq(schema.chats.userA, userId), eq(schema.chats.userB, userId)))
      .orderBy(sql`${schema.chats.lastMessageAt} DESC NULLS LAST`, sql`${schema.chats.createdAt} DESC`);

    const hydratedList = [];
    for (const chat of chatRows) {
      hydratedList.push(await this.hydrateChat(chat, userId));
    }

    return hydratedList;
  }

  static async getChatById(chatId: string, userId: string) {
    const db = getDb();

    const [chat] = await db
      .select()
      .from(schema.chats)
      .where(eq(schema.chats.id, chatId))
      .limit(1);

    if (!chat) {
      throw new Error('Chat not found');
    }

    if (chat.userA !== userId && chat.userB !== userId) {
      throw new Error('Access denied to this chat');
    }

    return await this.hydrateChat(chat, userId);
  }

  static async getChatMessages(chatId: string, userId: string) {
    const db = getDb();
    const now = new Date();

    // Verify participant
    await this.getChatById(chatId, userId);

    // Query unexpired messages (expiresAt > NOW() AND expiredAt IS NULL)
    const messageRows = await db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.chatId, chatId),
          gt(schema.messages.expiresAt, now),
          isNull(schema.messages.expiredAt)
        )
      )
      .orderBy(sql`${schema.messages.createdAt} ASC`);

    return messageRows.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      senderId: m.senderId,
      messageType: m.messageType,
      content: m.content,
      storageObjectKey: m.storageObjectKey,
      voiceDuration: m.voiceDuration,
      createdAt: m.createdAt.toISOString(),
      expiresAt: m.expiresAt.toISOString(),
    }));
  }

  private static async hydrateChat(chat: any, currentUserId: string) {
    const db = getDb();
    const otherUserId = chat.userA === currentUserId ? chat.userB : chat.userA;

    const [profile] = await db
      .select({
        id: schema.profiles.id,
        userId: schema.users.id,
        displayName: schema.profiles.displayName,
        avatarUrl: schema.profiles.avatarUrl,
        about: schema.profiles.about,
        uniqueCode: schema.users.uniqueCode,
        lastSeen: schema.profiles.lastSeen,
      })
      .from(schema.profiles)
      .innerJoin(schema.users, eq(schema.profiles.userId, schema.users.id))
      .where(eq(schema.users.id, otherUserId))
      .limit(1);

    return {
      id: chat.id,
      userA: chat.userA,
      userB: chat.userB,
      lastMessage: chat.lastMessage,
      lastMessageAt: chat.lastMessageAt ? chat.lastMessageAt.toISOString() : null,
      createdAt: chat.createdAt.toISOString(),
      otherUser: profile ? {
        ...profile,
        lastSeen: profile.lastSeen.toISOString(),
      } : null,
    };
  }
}

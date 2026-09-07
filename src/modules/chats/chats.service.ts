import { eq, or, and, gt, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../../database';
import { ConnectionsService } from '../connections/connections.service';
import { BlocksService } from '../blocks/blocks.service';

export class ChatsService {
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

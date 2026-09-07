import { nanoid } from 'nanoid';
import { StorageService } from '../../services/storage/r2.service';
import { ChatsService } from '../chats/chats.service';
import { BlocksService } from '../blocks/blocks.service';
import { getDb, schema } from '../../database';
import { eq, and, gt, isNull } from 'drizzle-orm';

export class StorageModuleService {
  static async requestUploadUrl(userId: string, chatId: string, contentType = 'audio/m4a') {
    // 1. Verify chat participant
    const chat = await ChatsService.getChatById(chatId, userId);

    // 2. Check block status between participants
    const isBlocked = await BlocksService.isBlockedPair(chat.userA, chat.userB);
    if (isBlocked) {
      throw new Error('Cannot upload media in a conversation with a blocked user');
    }

    // 3. Generate secure R2 object key
    const fileExt = contentType.includes('mp4') ? 'mp4' : 'm4a';
    const storageKey = `voice/${chatId}/${nanoid()}.${fileExt}`;

    // 4. Generate presigned upload URL (300 seconds)
    const uploadUrl = await StorageService.generateUploadUrl(storageKey, contentType, 300);

    return {
      uploadUrl,
      key: storageKey,
      expiresAt: new Date(Date.now() + 300 * 1000).toISOString(),
    };
  }

  static async requestDownloadUrl(userId: string, chatId: string, storageObjectKey: string) {
    // 1. Verify chat participant
    await ChatsService.getChatById(chatId, userId);

    // 2. Verify message exists and is not expired
    const db = getDb();
    const now = new Date();
    const [msg] = await db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.chatId, chatId),
          eq(schema.messages.storageObjectKey, storageObjectKey),
          gt(schema.messages.expiresAt, now),
          isNull(schema.messages.expiredAt)
        )
      )
      .limit(1);

    if (!msg) {
      throw new Error('Voice message not found or expired');
    }

    // 3. Generate presigned download URL (900 seconds)
    const downloadUrl = await StorageService.generateDownloadUrl(storageObjectKey, 900);

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + 900 * 1000).toISOString(),
    };
  }
}

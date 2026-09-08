import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../database';
import { ChatsService } from '../chats/chats.service';
import { BlocksService } from '../blocks/blocks.service';

export class MessagesService {
  static async getVoiceAudio(messageId: string, userId: string) {
    const db = getDb();
    const now = new Date();

    const [message] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, messageId))
      .limit(1);

    if (!message || message.messageType !== 'VOICE') {
      const err: any = new Error('Voice message not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (message.expiresAt <= now || message.expiredAt !== null) {
      const err: any = new Error('Voice message has expired');
      err.statusCode = 410;
      err.code = 'EXPIRED';
      throw err;
    }

    let chat: any;
    try {
      chat = await ChatsService.getChatById(message.chatId, userId);
    } catch (err: any) {
      const accessErr: any = new Error(err.message || 'Access denied to this chat');
      accessErr.statusCode = 403;
      accessErr.code = 'ACCESS_DENIED';
      throw accessErr;
    }

    const otherUserId = chat.userA === userId ? chat.userB : chat.userA;


    const isBlocked = await BlocksService.isBlockedPair(userId, otherUserId);
    if (isBlocked) {
      const err: any = new Error('Access denied');
      err.statusCode = 403;
      err.code = 'ACCESS_DENIED';
      throw err;
    }

    if (!message.audioData) {
      const err: any = new Error('Audio payload missing');
      err.statusCode = 404;
      err.code = 'AUDIO_MISSING';
      throw err;
    }

    return {
      audioData: message.audioData,
      mimeType: message.audioMimeType || 'audio/m4a',
      sizeBytes: message.audioSizeBytes || message.audioData.length,
    };
  }
}

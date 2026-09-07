import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { lt, sql, and, isNull } from 'drizzle-orm';
import { config } from '../../config';
import { getDb, schema } from '../../database';
import { StorageService } from '../storage/r2.service';
import { SocketService } from '../realtime/socket.service';

export class ExpirationWorker {
  private static queue: Queue | null = null;
  private static worker: Worker | null = null;

  static initialize() {
    if (!config.redis.url) {
      console.warn('Redis URL not configured. BullMQ Expiration Worker disabled.');
      return;
    }

    try {
      const redisConnection = new Redis(config.redis.url, {
        maxRetriesPerRequest: null,
      });

      this.queue = new Queue('message-expiration', { connection: redisConnection });

      this.worker = new Worker(
        'message-expiration',
        async (job: Job) => {
          await this.processExpiredMessages();
        },
        { connection: redisConnection }
      );

      console.log('BullMQ Message Expiration Worker initialized.');
    } catch (err) {
      console.error('Failed to initialize Redis/BullMQ worker:', err);
    }
  }

  // Core Expiration Engine: Cleans DB records AND removes binary audio blobs from Cloudflare R2!
  static async processExpiredMessages() {
    const db = getDb();
    const now = new Date();

    try {
      // 1. Fetch unpurged expired messages from Neon PostgreSQL
      const expired = await db
        .select()
        .from(schema.messages)
        .where(
          and(
            lt(schema.messages.expiresAt, now),
            isNull(schema.messages.expiredAt)
          )
        );

      if (expired.length === 0) return;

      for (const msg of expired) {
        // 2. If message is a voice note with a storage key, delete binary object from Cloudflare R2!
        if (msg.messageType === 'VOICE' && msg.storageObjectKey) {
          try {
            await StorageService.deleteObject(msg.storageObjectKey);
          } catch (err) {
            console.error(`Failed to delete storage file for message ${msg.id}:`, err);
          }
        }

        // 3. Delete database record from Neon PostgreSQL
        await db.delete(schema.messages).where(sql`${schema.messages.id} = ${msg.id}`);

        // 4. Emit realtime event via Socket.IO
        SocketService.emitToChat(msg.chatId, 'message:expired', { id: msg.id, chatId: msg.chatId });
      }
    } catch (err) {
      console.error('Error during message expiration job:', err);
    }
  }

  static async shutdown() {
    await this.worker?.close();
    await this.queue?.close();
  }
}

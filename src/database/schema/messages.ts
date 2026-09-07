import { pgTable, uuid, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { chats } from './chats';
import { users } from './users';

export const messageTypeEnum = pgEnum('message_type', ['TEXT', 'VOICE']);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    messageType: messageTypeEnum('message_type').default('TEXT').notNull(),
    content: text('content'),
    storageObjectKey: text('storage_object_key'),
    voiceDuration: integer('voice_duration'),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .default(sql`(NOW() + INTERVAL '1 hour')`)
      .notNull(),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    chatCreatedIdx: index('idx_messages_chat_created').on(table.chatId, table.createdAt),
    expiresAtIdx: index('idx_messages_expires_at').on(table.expiresAt),
    senderIdIdx: index('idx_messages_sender_id').on(table.senderId),
  })
);

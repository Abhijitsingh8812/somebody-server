import { pgTable, uuid, text, integer, timestamp, pgEnum, index, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { chats } from './chats';
import { users } from './users';

export const messageTypeEnum = pgEnum('message_type', ['TEXT', 'VOICE']);

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    messageType: messageTypeEnum('message_type').default('TEXT').notNull(),
    content: text('content'),
    storageObjectKey: text('storage_object_key'),
    audioData: bytea('audio_data'),
    audioMimeType: text('audio_mime_type'),
    audioSizeBytes: integer('audio_size_bytes'),
    voiceDuration: integer('voice_duration'),
    readAt: timestamp('read_at', { withTimezone: true }),
    expirationMinutes: integer('expiration_minutes'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    chatCreatedIdx: index('idx_messages_chat_created').on(table.chatId, table.createdAt),
    expiresAtIdx: index('idx_messages_expires_at').on(table.expiresAt),
    senderIdIdx: index('idx_messages_sender_id').on(table.senderId),
    chatReadIdx: index('idx_messages_chat_read').on(table.chatId, table.readAt),
  })
);


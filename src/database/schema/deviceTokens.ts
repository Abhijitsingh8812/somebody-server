import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    pushToken: text('push_token').notNull(),
    platform: text('platform').default('android').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('idx_device_tokens_user_id').on(table.userId),
    userPushTokenUnique: unique('uniq_user_push_token').on(table.userId, table.pushToken),
  })
);

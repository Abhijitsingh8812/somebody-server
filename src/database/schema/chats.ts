import { pgTable, uuid, text, timestamp, check, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const chats = pgTable(
  'chats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userA: uuid('user_a').notNull().references(() => users.id, { onDelete: 'cascade' }),
    userB: uuid('user_b').notNull().references(() => users.id, { onDelete: 'cascade' }),
    lastMessage: text('last_message'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    chatUsersOrdered: check('chat_users_ordered', sql`${table.userA} < ${table.userB}`),
    uniqueUsersPair: uniqueIndex('idx_chats_user_a_user_b').on(table.userA, table.userB),
    lastMessageAtIdx: index('idx_chats_last_message_at').on(table.lastMessageAt),
  })
);

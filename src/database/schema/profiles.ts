import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').default('New User').notNull(),
    avatarUrl: text('avatar_url'),
    about: text('about'),
    preferences: jsonb('preferences').default({}).notNull(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('idx_profiles_user_id').on(table.userId),
  })
);

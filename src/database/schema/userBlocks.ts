import { pgTable, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userBlocks = pgTable(
  'user_blocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueBlock: uniqueIndex('idx_user_blocks_pair').on(table.blockerId, table.blockedId),
    blockerIdx: index('idx_user_blocks_blocker').on(table.blockerId),
    blockedIdx: index('idx_user_blocks_blocked').on(table.blockedId),
  })
);

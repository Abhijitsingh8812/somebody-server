import { pgTable, uuid, pgEnum, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const connectionStatusEnum = pgEnum('connection_status', ['PENDING', 'ACCEPTED', 'REJECTED']);

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: connectionStatusEnum('status').default('PENDING').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (table) => ({
    uniquePair: uniqueIndex('idx_connections_pair').on(table.requesterId, table.recipientId),
    requesterIdx: index('idx_connections_requester').on(table.requesterId),
    recipientIdx: index('idx_connections_recipient').on(table.recipientId),
    statusIdx: index('idx_connections_status').on(table.status),
  })
);

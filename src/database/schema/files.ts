import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const files = pgTable(
  'files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    storageObjectKey: text('storage_object_key').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index('idx_files_owner_id').on(table.ownerId),
  })
);

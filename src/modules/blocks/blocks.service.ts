import { eq, or, and } from 'drizzle-orm';
import { getDb, schema } from '../../database';

export class BlocksService {
  static async blockUser(blockerId: string, targetUserId: string) {
    const db = getDb();

    if (blockerId === targetUserId) {
      throw new Error('Cannot block yourself');
    }

    const [targetUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      throw new Error('Target user not found');
    }

    // Insert block record (ignore if existing)
    const existing = await db
      .select()
      .from(schema.userBlocks)
      .where(
        and(
          eq(schema.userBlocks.blockerId, blockerId),
          eq(schema.userBlocks.blockedId, targetUserId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.userBlocks).values({
        blockerId,
        blockedId: targetUserId,
      });
    }

    // Clean up any active/pending connections between the users
    await db
      .delete(schema.connections)
      .where(
        or(
          and(eq(schema.connections.requesterId, blockerId), eq(schema.connections.recipientId, targetUserId)),
          and(eq(schema.connections.requesterId, targetUserId), eq(schema.connections.recipientId, blockerId))
        )
      );

    return { success: true, message: 'User blocked successfully' };
  }

  static async unblockUser(blockerId: string, targetUserId: string) {
    const db = getDb();

    await db
      .delete(schema.userBlocks)
      .where(
        and(
          eq(schema.userBlocks.blockerId, blockerId),
          eq(schema.userBlocks.blockedId, targetUserId)
        )
      );

    return { success: true, message: 'User unblocked successfully' };
  }

  static async getBlockedUsers(blockerId: string) {
    const db = getDb();

    const blockRows = await db
      .select({
        id: schema.userBlocks.id,
        createdAt: schema.userBlocks.createdAt,
        userId: schema.users.id,
        displayName: schema.profiles.displayName,
        avatarUrl: schema.profiles.avatarUrl,
        uniqueCode: schema.users.uniqueCode,
      })
      .from(schema.userBlocks)
      .innerJoin(schema.users, eq(schema.userBlocks.blockedId, schema.users.id))
      .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
      .where(eq(schema.userBlocks.blockerId, blockerId));

    return blockRows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  static async isBlockedPair(userA: string, userB: string): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.userBlocks)
      .where(
        or(
          and(eq(schema.userBlocks.blockerId, userA), eq(schema.userBlocks.blockedId, userB)),
          and(eq(schema.userBlocks.blockerId, userB), eq(schema.userBlocks.blockedId, userA))
        )
      )
      .limit(1);

    return rows.length > 0;
  }
}

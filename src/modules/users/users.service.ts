import { eq, ilike, and, ne, notInArray } from 'drizzle-orm';
import { getDb, schema } from '../../database';

export class UsersService {
  static async getUserByUniqueCode(uniqueCode: string, currentUserId: string) {
    const db = getDb();
    const formattedCode = uniqueCode.trim().toUpperCase();

    // Check if target user exists
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.uniqueCode, formattedCode))
      .limit(1);

    if (!user) {
      throw new Error('User not found');
    }

    if (user.id === currentUserId) {
      throw new Error('Cannot lookup own profile via unique code search');
    }

    // Check blocks between users
    const blocks = await db
      .select()
      .from(schema.userBlocks)
      .where(
        and(
          eq(schema.userBlocks.blockerId, user.id),
          eq(schema.userBlocks.blockedId, currentUserId)
        )
      );

    if (blocks.length > 0) {
      throw new Error('User not found');
    }

    // Fetch Profile
    const [profile] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, user.id))
      .limit(1);

    return {
      id: user.id,
      uniqueCode: user.uniqueCode,
      displayName: profile?.displayName || 'SomeBody User',
      avatarUrl: profile?.avatarUrl || null,
      about: profile?.about || null,
    };
  }

  static async searchUsers(query: string, currentUserId: string) {
    const db = getDb();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      throw new Error('Search query must be at least 2 characters long');
    }

    // Fetch user IDs who blocked currentUserId
    const blockerRows = await db
      .select({ blockerId: schema.userBlocks.blockerId })
      .from(schema.userBlocks)
      .where(eq(schema.userBlocks.blockedId, currentUserId));

    const blockedByIds = blockerRows.map((r) => r.blockerId);
    blockedByIds.push(currentUserId); // Exclude self

    const results = await db
      .select({
        id: schema.users.id,
        uniqueCode: schema.users.uniqueCode,
        displayName: schema.profiles.displayName,
        avatarUrl: schema.profiles.avatarUrl,
        about: schema.profiles.about,
      })
      .from(schema.profiles)
      .innerJoin(schema.users, eq(schema.profiles.userId, schema.users.id))
      .where(
        and(
          ilike(schema.profiles.displayName, `%${trimmed}%`),
          notInArray(schema.users.id, blockedByIds)
        )
      )
      .limit(20);

    return results;
  }
}

import { eq, or, and } from 'drizzle-orm';
import { getDb, schema } from '../../database';
import { NotificationService } from '../notifications/notification.service';

export class ConnectionsService {
  static async requestConnection(requesterId: string, targetUserId: string) {
    const db = getDb();

    if (requesterId === targetUserId) {
      throw new Error('Cannot connect with yourself');
    }

    // Target user check
    const [targetUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      throw new Error('Target user not found');
    }

    // Check blocks
    const blocks = await db
      .select()
      .from(schema.userBlocks)
      .where(
        or(
          and(eq(schema.userBlocks.blockerId, requesterId), eq(schema.userBlocks.blockedId, targetUserId)),
          and(eq(schema.userBlocks.blockerId, targetUserId), eq(schema.userBlocks.blockedId, requesterId))
        )
      );

    if (blocks.length > 0) {
      throw new Error('Connection blocked');
    }

    // Check existing connection
    const existing = await db
      .select()
      .from(schema.connections)
      .where(
        or(
          and(eq(schema.connections.requesterId, requesterId), eq(schema.connections.recipientId, targetUserId)),
          and(eq(schema.connections.requesterId, targetUserId), eq(schema.connections.recipientId, requesterId))
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const conn = existing[0];
      if (conn.status === 'ACCEPTED') {
        throw new Error('Already connected with this user');
      }
      if (conn.status === 'PENDING') {
        return conn;
      }
    }

    const [newConnection] = await db
      .insert(schema.connections)
      .values({
        requesterId,
        recipientId: targetUserId,
        status: 'PENDING',
      })
      .returning();

    // Dispatch push notification to target user
    const [reqProfile] = await db
      .select({ displayName: schema.profiles.displayName })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, requesterId))
      .limit(1);

    const senderName = reqProfile?.displayName || 'Someone';
    NotificationService.sendPushNotification(
      targetUserId,
      'SomeBody',
      `👤 ${senderName} sent you a connection request`,
      { type: 'connection_request', connectionId: newConnection.id, requesterId }
    ).catch(() => {});

    return newConnection;
  }

  static async getConnections(userId: string) {
    const db = getDb();

    // Fetch all connections involving userId
    const allConns = await db
      .select()
      .from(schema.connections)
      .where(
        or(
          eq(schema.connections.requesterId, userId),
          eq(schema.connections.recipientId, userId)
        )
      );

    const incomingPending: any[] = [];
    const outgoingPending: any[] = [];
    const accepted: any[] = [];

    for (const conn of allConns) {
      const otherUserId = conn.requesterId === userId ? conn.recipientId : conn.requesterId;

      // Hydrate profile
      const [profile] = await db
        .select({
          id: schema.profiles.id,
          userId: schema.users.id,
          displayName: schema.profiles.displayName,
          avatarUrl: schema.profiles.avatarUrl,
          about: schema.profiles.about,
          uniqueCode: schema.users.uniqueCode,
          lastSeen: schema.profiles.lastSeen,
        })
        .from(schema.profiles)
        .innerJoin(schema.users, eq(schema.profiles.userId, schema.users.id))
        .where(eq(schema.users.id, otherUserId))
        .limit(1);

      const item = {
        id: conn.id,
        status: conn.status,
        createdAt: conn.createdAt.toISOString(),
        user: profile ? {
          ...profile,
          lastSeen: profile.lastSeen.toISOString(),
        } : null,
      };

      if (conn.status === 'ACCEPTED') {
        accepted.push(item);
      } else if (conn.status === 'PENDING') {
        if (conn.recipientId === userId) {
          incomingPending.push(item);
        } else {
          outgoingPending.push(item);
        }
      }
    }

    return {
      incomingPending,
      outgoingPending,
      accepted,
    };
  }

  static async acceptConnection(connectionId: string, userId: string) {
    const db = getDb();

    const [conn] = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, connectionId))
      .limit(1);

    if (!conn) {
      throw new Error('Connection request not found');
    }

    if (conn.recipientId !== userId) {
      throw new Error('Only the recipient can accept a connection request');
    }

    if (conn.status !== 'PENDING') {
      throw new Error('Connection is not in pending status');
    }

    const [updated] = await db
      .update(schema.connections)
      .set({
        status: 'ACCEPTED',
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.connections.id, connectionId))
      .returning();

    // Dispatch push notification to requester
    const [recProfile] = await db
      .select({ displayName: schema.profiles.displayName })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1);

    const acceptorName = recProfile?.displayName || 'Someone';
    NotificationService.sendPushNotification(
      conn.requesterId,
      'SomeBody',
      `🤝 ${acceptorName} accepted your connection request`,
      { type: 'connection_accepted', connectionId, recipientId: userId }
    ).catch(() => {});

    return updated;
  }

  static async rejectConnection(connectionId: string, userId: string) {
    const db = getDb();

    const [conn] = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, connectionId))
      .limit(1);

    if (!conn) {
      throw new Error('Connection request not found');
    }

    if (conn.recipientId !== userId) {
      throw new Error('Only the recipient can reject a connection request');
    }

    if (conn.status !== 'PENDING') {
      throw new Error('Connection is not in pending status');
    }

    const [updated] = await db
      .update(schema.connections)
      .set({
        status: 'REJECTED',
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.connections.id, connectionId))
      .returning();

    return updated;
  }

  static async deleteConnection(connectionId: string, userId: string) {
    const db = getDb();

    const [conn] = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, connectionId))
      .limit(1);

    if (!conn) {
      throw new Error('Connection not found');
    }

    if (conn.requesterId !== userId && conn.recipientId !== userId) {
      throw new Error('Not authorized to delete this connection');
    }

    await db.delete(schema.connections).where(eq(schema.connections.id, connectionId));
    return { success: true };
  }

  static async areConnected(userA: string, userB: string): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.connections)
      .where(
        and(
          eq(schema.connections.status, 'ACCEPTED'),
          or(
            and(eq(schema.connections.requesterId, userA), eq(schema.connections.recipientId, userB)),
            and(eq(schema.connections.requesterId, userB), eq(schema.connections.recipientId, userA))
          )
        )
      )
      .limit(1);

    return rows.length > 0;
  }

  /**
   * Returns the current relationship status between currentUserId and targetUserId.
   * Used by the Search screen to render the correct action button.
   */
  static async getRelationshipStatus(
    currentUserId: string,
    targetUserId: string
  ): Promise<{ status: 'NOT_CONNECTED' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'CONNECTED'; connectionId: string | null }> {
    const db = getDb();

    const [conn] = await db
      .select()
      .from(schema.connections)
      .where(
        or(
          and(eq(schema.connections.requesterId, currentUserId), eq(schema.connections.recipientId, targetUserId)),
          and(eq(schema.connections.requesterId, targetUserId), eq(schema.connections.recipientId, currentUserId))
        )
      )
      .limit(1);

    if (!conn) {
      return { status: 'NOT_CONNECTED', connectionId: null };
    }

    if (conn.status === 'ACCEPTED') {
      return { status: 'CONNECTED', connectionId: conn.id };
    }

    if (conn.status === 'PENDING') {
      if (conn.requesterId === currentUserId) {
        return { status: 'REQUEST_SENT', connectionId: conn.id };
      } else {
        return { status: 'REQUEST_RECEIVED', connectionId: conn.id };
      }
    }

    // REJECTED — treat as not connected (allow re-request)
    return { status: 'NOT_CONNECTED', connectionId: null };
  }
}

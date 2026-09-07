import { eq, and, sql } from 'drizzle-orm';
import { getDb, schema } from '../../database';

export class NotificationService {
  // Register or update device push token for user
  static async registerPushToken(userId: string, pushToken: string, platform = 'android') {
    if (!pushToken || typeof pushToken !== 'string') {
      throw new Error('Valid push token required');
    }

    const db = getDb();
    const now = new Date();

    // Upsert into device_tokens table
    const existing = await db
      .select()
      .from(schema.deviceTokens)
      .where(
        and(
          eq(schema.deviceTokens.userId, userId),
          eq(schema.deviceTokens.pushToken, pushToken)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(schema.deviceTokens)
        .set({ updatedAt: now, platform })
        .where(eq(schema.deviceTokens.id, existing[0].id));
      return existing[0];
    }

    const [inserted] = await db
      .insert(schema.deviceTokens)
      .values({
        userId,
        pushToken,
        platform,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return inserted;
  }

  // Remove push token on logout or invalid token cleanup
  static async removePushToken(userId: string, pushToken: string) {
    const db = getDb();
    await db
      .delete(schema.deviceTokens)
      .where(
        and(
          eq(schema.deviceTokens.userId, userId),
          eq(schema.deviceTokens.pushToken, pushToken)
        )
      );
  }

  // Fetch all registered push tokens for a user
  static async getUserPushTokens(userId: string): Promise<string[]> {
    const db = getDb();
    const rows = await db
      .select({ pushToken: schema.deviceTokens.pushToken })
      .from(schema.deviceTokens)
      .where(eq(schema.deviceTokens.userId, userId));

    return rows.map((r) => r.pushToken);
  }

  // Dispatch Expo Push Notifications to target user
  static async sendPushNotification(
    targetUserId: string,
    title: string,
    body: string,
    dataPayload: Record<string, any> = {}
  ): Promise<boolean> {
    try {
      const tokens = await this.getUserPushTokens(targetUserId);
      if (tokens.length === 0) return false;

      // Filter valid Expo push tokens (starts with ExponentPushToken or ExpoPushToken)
      const validTokens = tokens.filter(
        (t) => typeof t === 'string' && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))
      );

      if (validTokens.length === 0) return false;

      const messages = validTokens.map((token) => ({
        to: token,
        sound: 'default',
        priority: 'high',
        title,
        body,
        data: dataPayload,
      }));

      // Call Expo Push REST API endpoint
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        console.warn('Expo push service returned non-200 status:', response.status);
        return false;
      }

      const resData = (await response.json()) as {
        data?: Array<{ status?: string; details?: { error?: string } }>;
      };

      // Check for DeviceNotRegistered errors and remove invalid tokens
      if (Array.isArray(resData?.data)) {
        for (let i = 0; i < resData.data.length; i++) {
          const item = resData.data[i];
          if (item?.status === 'error' && item?.details?.error === 'DeviceNotRegistered') {
            const invalidToken = validTokens[i];
            if (invalidToken) {
              await this.removePushToken(targetUserId, invalidToken).catch(() => {});
            }
          }
        }
      }

      return true;
    } catch (err: any) {
      console.warn('Push notification delivery failed:', err.message);
      return false;
    }
  }
}

import { eq, and, gt } from 'drizzle-orm';
import { getDb, schema } from '../../database';
import { hashPassword, verifyPassword, hashToken } from '../../utils/hash';
import { generateUniqueCode } from '../../utils/codeGenerator';
import { UserProfileResponse } from '../../types';
import crypto from 'crypto';

export class AuthService {
  static async createUser(email: string, passwordPlain: string, displayName?: string) {
    const db = getDb();

    // Check if user already exists
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('User with this email already exists');
    }

    const passwordHash = await hashPassword(passwordPlain);
    
    // Unique code collision check & generation
    let uniqueCode = generateUniqueCode();
    let collision = true;
    let attempts = 0;
    while (collision && attempts < 5) {
      const found = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.uniqueCode, uniqueCode))
        .limit(1);

      if (found.length === 0) {
        collision = false;
      } else {
        uniqueCode = generateUniqueCode();
        attempts++;
      }
    }

    // Transactional creation: Create user + profile
    const [user] = await db
      .insert(schema.users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        uniqueCode,
      })
      .returning();

    const [profile] = await db
      .insert(schema.profiles)
      .values({
        userId: user.id,
        displayName: displayName || email.split('@')[0],
      })
      .returning();

    return { user, profile };
  }

  static async validateUser(email: string, passwordPlain: string) {
    const db = getDb();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const valid = await verifyPassword(user.passwordHash, passwordPlain);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    const [profile] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, user.id))
      .limit(1);

    return { user, profile };
  }

  static async getProfileByUserId(userId: string): Promise<UserProfileResponse> {
    const db = getDb();
    const [row] = await db
      .select({
        id: schema.profiles.id,
        userId: schema.profiles.userId,
        email: schema.users.email,
        displayName: schema.profiles.displayName,
        avatarUrl: schema.profiles.avatarUrl,
        about: schema.profiles.about,
        preferences: schema.profiles.preferences,
        uniqueCode: schema.users.uniqueCode,
        lastSeen: schema.profiles.lastSeen,
        createdAt: schema.profiles.createdAt,
      })
      .from(schema.profiles)
      .innerJoin(schema.users, eq(schema.profiles.userId, schema.users.id))
      .where(eq(schema.profiles.userId, userId))
      .limit(1);

    if (!row) {
      throw new Error('User profile not found');
    }

    return {
      id: row.id,
      userId: row.userId,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      about: row.about || null,
      preferences: row.preferences || {},
      uniqueCode: row.uniqueCode,
      lastSeen: row.lastSeen.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  static async createRefreshToken(userId: string, deviceInfo?: string): Promise<string> {
    const db = getDb();
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHashValue = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.insert(schema.refreshTokens).values({
      userId,
      tokenHash: tokenHashValue,
      deviceInfo: deviceInfo || 'Unknown Device',
      expiresAt,
    });

    return rawToken;
  }

  static async rotateRefreshToken(rawRefreshToken: string, deviceInfo?: string) {
    const db = getDb();
    const tokenHashValue = hashToken(rawRefreshToken);

    const [existingToken] = await db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, tokenHashValue))
      .limit(1);

    if (!existingToken) {
      throw new Error('Invalid or expired refresh token');
    }

    // Token Reuse Detection Security check:
    // If presented token was already revoked, revoke ALL active sessions for this user to prevent hijacking
    if (existingToken.revoked) {
      await db
        .update(schema.refreshTokens)
        .set({ revoked: true })
        .where(eq(schema.refreshTokens.userId, existingToken.userId));
      throw new Error('Invalid or expired refresh token');
    }

    // Check expiration
    if (new Date(existingToken.expiresAt) <= new Date()) {
      throw new Error('Invalid or expired refresh token');
    }

    // Revoke old refresh token
    await db
      .update(schema.refreshTokens)
      .set({ revoked: true })
      .where(eq(schema.refreshTokens.id, existingToken.id));

    // Generate new refresh token
    const newRawToken = crypto.randomBytes(40).toString('hex');
    const newTokenHash = hashToken(newRawToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.insert(schema.refreshTokens).values({
      userId: existingToken.userId,
      tokenHash: newTokenHash,
      deviceInfo: deviceInfo || existingToken.deviceInfo || 'Unknown Device',
      expiresAt,
    });

    // Fetch user + profile
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, existingToken.userId))
      .limit(1);

    const profile = await this.getProfileByUserId(existingToken.userId);

    return { user, profile, newRefreshToken: newRawToken };
  }

  static async revokeRefreshToken(userId: string, rawRefreshToken?: string) {
    const db = getDb();

    if (rawRefreshToken) {
      const tokenHashValue = hashToken(rawRefreshToken);
      await db
        .update(schema.refreshTokens)
        .set({ revoked: true })
        .where(
          and(
            eq(schema.refreshTokens.userId, userId),
            eq(schema.refreshTokens.tokenHash, tokenHashValue)
          )
        );
    } else {
      // Revoke all active sessions for this user
      await db
        .update(schema.refreshTokens)
        .set({ revoked: true })
        .where(
          and(
            eq(schema.refreshTokens.userId, userId),
            eq(schema.refreshTokens.revoked, false)
          )
        );
    }
  }
}

import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../database';
import { UserProfileResponse } from '../../types';
import { AuthService } from '../auth/auth.service';

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string | null;
  about?: string | null;
  preferences?: Record<string, any>;
}

export class ProfilesService {
  static async getProfileByUserId(userId: string): Promise<UserProfileResponse> {
    return await AuthService.getProfileByUserId(userId);
  }

  static async getPreferences(userId: string): Promise<Record<string, any>> {
    const profile = await this.getProfileByUserId(userId);
    return profile.preferences || {};
  }

  static async updatePreferences(userId: string, incomingPreferences: Record<string, any>): Promise<UserProfileResponse> {
    return await this.updateProfile(userId, { preferences: incomingPreferences });
  }

  static async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfileResponse> {
    const db = getDb();
    const currentProfile = await this.getProfileByUserId(userId);

    // Input Validations
    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (input.displayName !== undefined) {
      const trimmed = input.displayName.trim();
      if (trimmed.length < 2 || trimmed.length > 50) {
        throw new Error('Display name must be between 2 and 50 characters long');
      }
      updates.displayName = trimmed;
    }

    if (input.about !== undefined) {
      if (input.about && input.about.length > 250) {
        throw new Error('About bio must not exceed 250 characters');
      }
      updates.about = input.about ? input.about.trim() : null;
    }

    if (input.avatarUrl !== undefined) {
      if (input.avatarUrl && typeof input.avatarUrl === 'string' && input.avatarUrl.trim().length > 0) {
        const url = input.avatarUrl.trim();
        // Validate avatar reference: must be HTTPS/HTTP URL, base64 Data URL, relative path, or valid storage object key
        const isHttpUrl = url.startsWith('http://') || url.startsWith('https://');
        const isDataUrl = url.startsWith('data:image/');
        const isRelativeUrl = url.startsWith('/');
        const isObjectKey = /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_.-]+)+$/.test(url);

        if (!isHttpUrl && !isDataUrl && !isRelativeUrl && !isObjectKey) {
          throw new Error('Invalid avatar URL or object key format');
        }
        updates.avatarUrl = url;
      } else {
        updates.avatarUrl = null;
      }
    }

    if (input.preferences !== undefined) {
      if (typeof input.preferences !== 'object' || Array.isArray(input.preferences) || input.preferences === null) {
        throw new Error('Preferences must be a valid JSON object');
      }

      // Safely merge existing preferences with incoming preferences
      const existingPrefs = (currentProfile.preferences && typeof currentProfile.preferences === 'object')
        ? currentProfile.preferences
        : {};

      const mergedPreferences = {
        ...existingPrefs,
        ...input.preferences,
      };

      // Validate messageExpirationMinutes if specified
      if (mergedPreferences.messageExpirationMinutes !== undefined) {
        const minutes = Number(mergedPreferences.messageExpirationMinutes);
        if (![15, 30, 60].includes(minutes)) {
          throw new Error('messageExpirationMinutes must be one of: 15, 30, or 60');
        }
        mergedPreferences.messageExpirationMinutes = minutes;
      }

      updates.preferences = mergedPreferences;
    }

    await db
      .update(schema.profiles)
      .set(updates)
      .where(eq(schema.profiles.userId, userId));

    return await this.getProfileByUserId(userId);
  }
}

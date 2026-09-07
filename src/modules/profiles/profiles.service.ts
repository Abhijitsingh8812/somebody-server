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

  static async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfileResponse> {
    const db = getDb();

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
      if (input.avatarUrl && typeof input.avatarUrl === 'string') {
        // Validate avatar reference: must be presigned Cloudflare R2 path or HTTPS URL
        if (!input.avatarUrl.startsWith('http://') && !input.avatarUrl.startsWith('https://') && !input.avatarUrl.startsWith('avatars/')) {
          throw new Error('Invalid avatar URL or object key format');
        }
      }
      updates.avatarUrl = input.avatarUrl || null;
    }

    if (input.preferences !== undefined) {
      if (typeof input.preferences !== 'object' || Array.isArray(input.preferences)) {
        throw new Error('Preferences must be a valid JSON object');
      }
      updates.preferences = input.preferences;
    }

    await db
      .update(schema.profiles)
      .set(updates)
      .where(eq(schema.profiles.userId, userId));

    return await this.getProfileByUserId(userId);
  }
}

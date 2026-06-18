import { ProfileNotFoundError } from '../errors';
import type { ProfileRepository } from '../ports';
import type { UserProfileDTO } from '@smriti/shared-types';

export class GetUserProfileUseCase {
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(userId: string): Promise<UserProfileDTO> {
    const row = await this.profiles.get(userId);
    if (!row) {
      throw new ProfileNotFoundError(userId);
    }
    return {
      userId,
      profile: row.profile,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

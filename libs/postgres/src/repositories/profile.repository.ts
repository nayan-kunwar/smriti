import type { ProfileRepository } from '@smriti/memory-core';
import type { UserProfile } from '@smriti/shared-types';
import type { Db } from '../connection';

export class PostgresProfileRepository implements ProfileRepository {
  constructor(private readonly db: Db) {}

  async upsert(userId: string, profile: UserProfile): Promise<void> {
    const json = profile as unknown as Record<string, unknown>;
    await this.db
      .insertInto('user_profiles')
      .values({ user_id: userId, profile: json, updated_at: new Date() })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({ profile: json, updated_at: new Date() }),
      )
      .execute();
  }

  async get(userId: string): Promise<{ profile: UserProfile; updatedAt: Date } | null> {
    const row = await this.db
      .selectFrom('user_profiles')
      .select(['profile', 'updated_at'])
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!row) {
      return null;
    }
    return {
      profile: row.profile as unknown as UserProfile,
      updatedAt: new Date(row.updated_at),
    };
  }
}

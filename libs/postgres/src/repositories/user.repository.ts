import type { NewUser, User, UserRepository } from '@smriti/memory-core';
import type { Selectable } from 'kysely';
import type { Db } from '../connection';
import type { UsersTable } from '../schema';

function toDomain(row: Selectable<UsersTable>): User {
  return {
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at),
  };
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async insert(user: NewUser): Promise<User> {
    const row = await this.db
      .insertInto('users')
      .values({ id: user.id, name: user.name, created_at: user.createdAt })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async listIds(limit = 1000): Promise<string[]> {
    const rows = await this.db.selectFrom('users').select('id').limit(limit).execute();
    return rows.map((row) => row.id);
  }
}

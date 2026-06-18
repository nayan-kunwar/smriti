import { randomUUID as uuid } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../connection';
import { runMigrations } from '../migrator';
import { PostgresUserRepository } from './user.repository';

const enabled = process.env.SMRITI_INTEGRATION === '1' && Boolean(process.env.POSTGRES_URL);

describe.skipIf(!enabled)('PostgresUserRepository (integration)', () => {
  let db: Db;
  let pool: { end: () => Promise<void> };

  beforeAll(async () => {
    const conn = createDb({ url: process.env.POSTGRES_URL as string });
    db = conn.db;
    pool = conn.pool;
    await runMigrations(db);
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
      await pool.end();
    }
  });

  it('creates and reads a user', async () => {
    const repo = new PostgresUserRepository(db);
    const id = uuid();
    const created = await repo.insert({ id, name: 'Integration User', createdAt: new Date() });
    expect(created.id).toBe(id);

    const found = await repo.findById(id);
    expect(found?.name).toBe('Integration User');

    await db.deleteFrom('users').where('id', '=', id).execute();
  });
});

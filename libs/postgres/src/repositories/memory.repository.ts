import type { Memory, MemoryRepository, NewMemory } from '@smriti/memory-core';
import type { ListOptions } from '@smriti/shared-types';
import type { Selectable } from 'kysely';
import type { Db } from '../connection';
import type { MemoriesTable } from '../schema';

function toDomain(row: Selectable<MemoriesTable>): Memory {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    content: row.content,
    importance: row.importance,
    status: row.status,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export class PostgresMemoryRepository implements MemoryRepository {
  constructor(private readonly db: Db) {}

  async insert(memory: NewMemory): Promise<Memory> {
    const row = await this.db
      .insertInto('memories')
      .values({
        id: memory.id,
        user_id: memory.userId,
        type: memory.type,
        content: memory.content,
        status: memory.status,
        metadata: memory.metadata,
        created_at: memory.createdAt,
        updated_at: memory.createdAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(id: string): Promise<Memory | null> {
    const row = await this.db
      .selectFrom('memories')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async listByUser(userId: string, options: ListOptions): Promise<Memory[]> {
    const rows = await this.db
      .selectFrom('memories')
      .selectAll()
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'desc')
      .limit(options.limit)
      .offset(options.offset)
      .execute();
    return rows.map(toDomain);
  }

  async updateContent(id: string, content: string): Promise<Memory> {
    const now = new Date();
    const row = await this.db
      .updateTable('memories')
      .set({ content, updated_at: now })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async applyDecayImportance(cutoffDate: Date, decayFactor: number): Promise<number> {
    const result = await this.db
      .updateTable('memories')
      .set((eb) => ({
        importance: eb('importance', '*', decayFactor),
        updated_at: new Date(),
      }))
      .where('deleted_at', 'is', null)
      .where('status', '=', 'active')
      .where('created_at', '<', cutoffDate)
      .where('importance', '>', 0.01)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0);
  }

  async archiveLowImportance(threshold: number): Promise<number> {
    const result = await this.db
      .updateTable('memories')
      .set({ status: 'archived', updated_at: new Date() })
      .where('deleted_at', 'is', null)
      .where('status', '=', 'active')
      .where('importance', '<', threshold)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0);
  }

  async softDelete(id: string): Promise<void> {
    const now = new Date();
    await this.db
      .updateTable('memories')
      .set({ status: 'deleted', deleted_at: now, updated_at: now })
      .where('id', '=', id)
      .execute();
  }

  async setImportance(id: string, importance: number): Promise<void> {
    await this.db
      .updateTable('memories')
      .set({ importance, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async setStatus(id: string, status: Memory['status']): Promise<void> {
    await this.db
      .updateTable('memories')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
  }

  /** Distinct user ids that have at least one live memory. Used by scheduler. */
  async distinctActiveUserIds(limit = 1000): Promise<string[]> {
    const rows = await this.db
      .selectFrom('memories')
      .select('user_id')
      .where('deleted_at', 'is', null)
      .distinct()
      .limit(limit)
      .execute();
    return rows.map((row) => row.user_id);
  }
}

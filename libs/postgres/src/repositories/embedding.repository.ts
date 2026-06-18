import { sql } from 'kysely';
import type { Db } from '../connection';
import { toVectorLiteral } from '../connection';

export interface UpsertEmbeddingInput {
  memoryId: string;
  provider: string;
  model: string;
  dimensions: number;
  embedding: number[];
  contentHash: string;
}

export class PostgresEmbeddingRepository {
  constructor(private readonly db: Db) {}

  /** Idempotent upsert keyed by memory_id; skips if content hash is unchanged. */
  async upsert(input: UpsertEmbeddingInput): Promise<void> {
    const literal = toVectorLiteral(input.embedding);
    await this.db
      .insertInto('memory_embeddings')
      .values({
        memory_id: input.memoryId,
        provider: input.provider,
        model: input.model,
        dimensions: input.dimensions,
        embedding: sql<string>`${literal}::vector`,
        content_hash: input.contentHash,
      })
      .onConflict((oc) =>
        oc.column('memory_id').doUpdateSet({
          provider: input.provider,
          model: input.model,
          dimensions: input.dimensions,
          embedding: sql<string>`${literal}::vector`,
          content_hash: input.contentHash,
        }),
      )
      .execute();
  }

  async existsForHash(memoryId: string, contentHash: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('memory_embeddings')
      .select('memory_id')
      .where('memory_id', '=', memoryId)
      .where('content_hash', '=', contentHash)
      .executeTakeFirst();
    return Boolean(row);
  }

  async listByMemoryIds(memoryIds: string[]): Promise<Map<string, number[]>> {
    if (memoryIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('memory_embeddings')
      .select(['memory_id', 'embedding'])
      .where('memory_id', 'in', memoryIds)
      .execute();

    const out = new Map<string, number[]>();
    for (const row of rows) {
      out.set(row.memory_id, parseVector(row.embedding));
    }
    return out;
  }
}

function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(Number);
  }
  if (typeof value === 'string') {
    return value
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => !Number.isNaN(n));
  }
  return [];
}

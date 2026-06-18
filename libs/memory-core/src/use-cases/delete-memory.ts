import { MemoryNotFoundError } from '../errors';
import type { ContextCacheInvalidator, EventPublisher, MemoryRepository } from '../ports';

export interface DeleteMemoryDeps {
  memories: MemoryRepository;
  events: EventPublisher;
  cache?: ContextCacheInvalidator;
}

/**
 * Soft-delete a memory and publish `memory-deleted` so downstream stores (e.g.
 * embeddings, profiles) can react.
 */
export class DeleteMemoryUseCase {
  constructor(private readonly deps: DeleteMemoryDeps) {}

  async execute(id: string, traceparent?: string): Promise<void> {
    const existing = await this.deps.memories.findById(id);
    if (!existing || existing.status === 'deleted') {
      throw new MemoryNotFoundError(id);
    }

    await this.deps.memories.softDelete(id);

    await this.deps.events.publish({
      eventName: 'memory-deleted',
      partitionKey: existing.userId,
      payload: { memoryId: id, userId: existing.userId },
      traceparent,
    });

    if (this.deps.cache) {
      await this.deps.cache.invalidateUser(existing.userId);
    }
  }
}

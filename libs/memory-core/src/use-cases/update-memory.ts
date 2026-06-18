import type { MemoryDTO } from '@smriti/shared-types';
import { MemoryNotFoundError, ValidationError } from '../errors';
import { toMemoryDTO } from '../mappers';
import type { ContextCacheInvalidator, EventPublisher, MemoryRepository } from '../ports';

export interface UpdateMemoryDeps {
  memories: MemoryRepository;
  events: EventPublisher;
  cache?: ContextCacheInvalidator;
}

export class UpdateMemoryUseCase {
  constructor(private readonly deps: UpdateMemoryDeps) {}

  async execute(id: string, content: string, traceparent?: string): Promise<MemoryDTO> {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new ValidationError('content must not be empty');
    }

    const existing = await this.deps.memories.findById(id);
    if (!existing || existing.status === 'deleted') {
      throw new MemoryNotFoundError(id);
    }

    if (existing.content === trimmed) {
      return toMemoryDTO(existing);
    }

    const memory = await this.deps.memories.updateContent(id, trimmed);
    await this.deps.memories.setStatus(id, 'pending');

    await this.deps.events.publish({
      eventName: 'memory-updated',
      partitionKey: memory.userId,
      payload: {
        memoryId: memory.id,
        userId: memory.userId,
        content: memory.content,
      },
      traceparent,
    });

    if (this.deps.cache) {
      await this.deps.cache.invalidateUser(memory.userId);
    }

    return toMemoryDTO({ ...memory, status: 'pending' });
  }
}

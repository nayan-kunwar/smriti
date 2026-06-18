import type { CreateMemoryRequest, MemoryDTO } from '@smriti/shared-types';
import { toMemoryDTO } from '../mappers';
import { ValidationError } from '../errors';
import type { Clock, ContextCacheInvalidator, EventPublisher, IdGenerator, MemoryRepository } from '../ports';

export interface CreateMemoryDeps {
  memories: MemoryRepository;
  events: EventPublisher;
  clock: Clock;
  ids: IdGenerator;
  cache?: ContextCacheInvalidator;
}

/**
 * Persist a new memory in `pending` state and publish `memory-created` so the
 * embedding and importance workers can process it asynchronously.
 */
export class CreateMemoryUseCase {
  constructor(private readonly deps: CreateMemoryDeps) {}

  async execute(input: CreateMemoryRequest, traceparent?: string): Promise<MemoryDTO> {
    const content = input.content?.trim();
    if (!content) {
      throw new ValidationError('content must not be empty');
    }

    const memory = await this.deps.memories.insert({
      id: this.deps.ids.next(),
      userId: input.userId,
      type: input.type,
      content,
      status: 'pending',
      metadata: input.metadata ?? {},
      createdAt: this.deps.clock.now(),
    });

    await this.deps.events.publish({
      eventName: 'memory-created',
      partitionKey: memory.userId,
      payload: {
        memoryId: memory.id,
        userId: memory.userId,
        type: memory.type,
        content: memory.content,
      },
      traceparent,
    });

    if (this.deps.cache) {
      await this.deps.cache.invalidateUser(memory.userId);
    }

    return toMemoryDTO(memory);
  }
}

import { describe, expect, it } from 'vitest';
import type { Memory, NewMemory } from '../domain';
import type { Clock, EventPublisher, IdGenerator, MemoryRepository } from '../ports';
import { ValidationError } from '../errors';
import { CreateMemoryUseCase } from './create-memory';

class InMemoryRepo implements MemoryRepository {
  readonly rows: Memory[] = [];

  async insert(memory: NewMemory): Promise<Memory> {
    const row: Memory = {
      ...memory,
      importance: 0,
      updatedAt: memory.createdAt,
      deletedAt: null,
    };
    this.rows.push(row);
    return row;
  }
  async findById(id: string): Promise<Memory | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listByUser(): Promise<Memory[]> {
    return this.rows;
  }
  async updateContent(id: string, content: string): Promise<Memory> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error('not found');
    row.content = content;
    return row;
  }
  async softDelete(): Promise<void> {}
  async setImportance(): Promise<void> {}
  async setStatus(): Promise<void> {}
  async applyDecayImportance(): Promise<number> {
    return 0;
  }
  async distinctActiveUserIds(): Promise<string[]> {
    return [];
  }
}

class CapturingPublisher implements EventPublisher {
  readonly events: Array<Record<string, unknown>> = [];
  async publish(event: Record<string, unknown>): Promise<void> {
    this.events.push(event);
  }
}

const fixedClock: Clock = { now: () => new Date('2026-01-01T00:00:00.000Z') };
const fixedIds: IdGenerator = { next: () => '11111111-1111-1111-1111-111111111111' };

describe('CreateMemoryUseCase', () => {
  it('persists a pending memory and publishes memory-created', async () => {
    const memories = new InMemoryRepo();
    const events = new CapturingPublisher();
    const useCase = new CreateMemoryUseCase({
      memories,
      events,
      clock: fixedClock,
      ids: fixedIds,
    });

    const dto = await useCase.execute({
      userId: '22222222-2222-2222-2222-222222222222',
      type: 'semantic',
      content: '  Learning Kafka  ',
    });

    expect(dto.status).toBe('pending');
    expect(dto.content).toBe('Learning Kafka');
    expect(memories.rows).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      eventName: 'memory-created',
      partitionKey: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('rejects empty content', async () => {
    const useCase = new CreateMemoryUseCase({
      memories: new InMemoryRepo(),
      events: new CapturingPublisher(),
      clock: fixedClock,
      ids: fixedIds,
    });

    await expect(
      useCase.execute({ userId: 'u', type: 'semantic', content: '   ' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

import { randomUUID as uuid } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { dlqTopic } from '@smriti/events';
import { ConsumerRuntime } from './consumer';
import type { MemoryCreatedEvent } from '@smriti/events';
import { memoryCreatedSchema } from '@smriti/events';

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

describe('ConsumerRuntime DLQ routing', () => {
  it('routes invalid payloads to the DLQ', async () => {
    const publishEnvelope = vi.fn().mockResolvedValue(undefined);
    const producer = { connect: vi.fn(), publishEnvelope, publish: vi.fn() };
    const metrics = {
      eventsProcessed: { inc: vi.fn() },
      eventsDlq: { inc: vi.fn() },
    };

    const runtime = new ConsumerRuntime<MemoryCreatedEvent>({
      kafka: { consumer: () => ({ connect: vi.fn(), subscribe: vi.fn(), run: vi.fn(), disconnect: vi.fn() }) } as never,
      producer: producer as never,
      topic: 'memory-created',
      groupId: 'test-group',
      validate: (value) => memoryCreatedSchema.parse(value) as MemoryCreatedEvent,
      handler: vi.fn(),
      logger: createLogger() as never,
      metrics: metrics as never,
    });

    await (runtime as unknown as { process: (raw: string) => Promise<void> }).process('not-json');

    expect(metrics.eventsDlq.inc).toHaveBeenCalledWith({ topic: 'memory-created' });
    expect(publishEnvelope).toHaveBeenCalledWith(
      dlqTopic('memory-created'),
      expect.objectContaining({ eventName: 'unparseable' }),
    );
  });

  it('routes exhausted retries to the DLQ', async () => {
    const publishEnvelope = vi.fn().mockResolvedValue(undefined);
    const producer = { connect: vi.fn(), publishEnvelope, publish: vi.fn() };
    const metrics = {
      eventsProcessed: { inc: vi.fn() },
      eventsDlq: { inc: vi.fn() },
    };

    const runtime = new ConsumerRuntime<MemoryCreatedEvent>({
      kafka: { consumer: () => ({ connect: vi.fn(), subscribe: vi.fn(), run: vi.fn(), disconnect: vi.fn() }) } as never,
      producer: producer as never,
      topic: 'memory-created',
      groupId: 'test-group',
      maxAttempts: 1,
      validate: (value) => memoryCreatedSchema.parse(value) as MemoryCreatedEvent,
      handler: vi.fn().mockRejectedValue(new Error('boom')),
      idempotency: { claim: vi.fn().mockResolvedValue(true) },
      logger: createLogger() as never,
      metrics: metrics as never,
    });

    const envelope = {
      eventId: uuid(),
      eventName: 'memory-created' as const,
      version: 1,
      occurredAt: new Date().toISOString(),
      partitionKey: uuid(),
      payload: {
        memoryId: uuid(),
        userId: uuid(),
        type: 'semantic' as const,
        content: 'test content',
      },
      attempt: 1,
    };

    await (runtime as unknown as { process: (raw: string) => Promise<void> }).process(
      JSON.stringify(envelope),
    );

    expect(metrics.eventsDlq.inc).toHaveBeenCalledWith({ topic: 'memory-created' });
    expect(publishEnvelope).toHaveBeenCalledWith(
      dlqTopic('memory-created'),
      expect.objectContaining({ attempt: 2 }),
    );
  });
});

import { createHash } from 'node:crypto';
import { loadConfig } from '@smriti/config';
import { createEmbeddingProvider } from '@smriti/embedding';
import {
  memoryCreatedSchema,
  memoryUpdatedSchema,
  TOPICS,
  type MemoryCreatedEvent,
  type MemoryUpdatedEvent,
} from '@smriti/events';
import { ConsumerRuntime, createKafka, KafkaProducer } from '@smriti/kafka';
import { createLogger, getMetrics, registerShutdown, startMetricsServer } from '@smriti/observability';
import {
  createDb,
  PostgresEmbeddingRepository,
  PostgresMemoryRepository,
  PostgresProcessedEventsRepository,
} from '@smriti/postgres';

const GROUP = 'embedding-worker';

interface EmbedPayload {
  memoryId: string;
  userId: string;
  content: string;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: `${config.otel.serviceName}-embedding-worker` });
  const metrics = getMetrics();
  const metricsServer = startMetricsServer(metrics, config.workerMetricsPort);

  const { db } = createDb({ url: config.postgres.url, poolSize: config.postgres.poolSize });
  const embeddings = new PostgresEmbeddingRepository(db);
  const memories = new PostgresMemoryRepository(db);
  const processed = new PostgresProcessedEventsRepository(db);
  const provider = createEmbeddingProvider(config.embedding);

  const kafka = createKafka({ brokers: config.kafka.brokers, clientId: config.kafka.clientId });
  const producer = new KafkaProducer(kafka);

  const embedMemory = async (payload: EmbedPayload, traceparent?: string): Promise<void> => {
    const { memoryId, userId, content } = payload;
    const contentHash = createHash('sha256').update(content).digest('hex');

    if (await embeddings.existsForHash(memoryId, contentHash)) {
      logger.debug({ memoryId }, 'embedding already current, skipping');
      return;
    }

    const stop = metrics.embeddingDuration.startTimer({
      provider: provider.name,
      model: provider.model,
    });
    const vector = await provider.embed(content);
    stop();

    await embeddings.upsert({
      memoryId,
      provider: provider.name,
      model: provider.model,
      dimensions: provider.dimensions,
      embedding: vector,
      contentHash,
    });

    await memories.setStatus(memoryId, 'active');

    await producer.publish({
      eventName: TOPICS.embeddingGenerated,
      partitionKey: userId,
      payload: {
        memoryId,
        userId,
        provider: provider.name,
        model: provider.model,
        dimensions: provider.dimensions,
      },
      traceparent,
    });
  };

  const createdRuntime = new ConsumerRuntime<MemoryCreatedEvent>({
    kafka,
    producer,
    topic: TOPICS.memoryCreated,
    groupId: GROUP,
    idempotency: processed,
    logger,
    metrics,
    validate: (value) => memoryCreatedSchema.parse(value) as MemoryCreatedEvent,
    handler: async (event) => embedMemory(event.payload, event.traceparent),
  });

  const updatedRuntime = new ConsumerRuntime<MemoryUpdatedEvent>({
    kafka,
    producer,
    topic: TOPICS.memoryUpdated,
    groupId: `${GROUP}-updated`,
    idempotency: processed,
    logger,
    metrics,
    validate: (value) => memoryUpdatedSchema.parse(value) as MemoryUpdatedEvent,
    handler: async (event) => embedMemory(event.payload, event.traceparent),
  });

  await Promise.all([createdRuntime.start(), updatedRuntime.start()]);
  registerShutdown(async () => {
    await Promise.all([createdRuntime.stop(), updatedRuntime.stop()]);
    await producer.disconnect();
    metricsServer?.close();
    await db.destroy();
  }, logger);
}

main().catch((error) => {
  console.error('Failed to start embedding-worker:', error);
  process.exit(1);
});

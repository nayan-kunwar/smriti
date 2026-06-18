import { loadConfig } from '@smriti/config';
import { memoryCreatedSchema, TOPICS, type MemoryCreatedEvent } from '@smriti/events';
import { ConsumerRuntime, createKafka, KafkaProducer } from '@smriti/kafka';
import { scoreImportance } from '@smriti/memory-core';
import { createLogger, getMetrics, registerShutdown, startMetricsServer } from '@smriti/observability';
import {
  createDb,
  PostgresMemoryRepository,
  PostgresProcessedEventsRepository,
} from '@smriti/postgres';

const GROUP = 'importance-worker';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: `${config.otel.serviceName}-importance-worker` });
  const metrics = getMetrics();
  const metricsServer = startMetricsServer(metrics, config.workerMetricsPort);

  const { db } = createDb({ url: config.postgres.url, poolSize: config.postgres.poolSize });
  const memories = new PostgresMemoryRepository(db);
  const processed = new PostgresProcessedEventsRepository(db);

  const kafka = createKafka({ brokers: config.kafka.brokers, clientId: config.kafka.clientId });
  const producer = new KafkaProducer(kafka);

  const runtime = new ConsumerRuntime<MemoryCreatedEvent>({
    kafka,
    producer,
    topic: TOPICS.memoryCreated,
    groupId: GROUP,
    idempotency: processed,
    logger,
    metrics,
    validate: (value) => memoryCreatedSchema.parse(value) as MemoryCreatedEvent,
    handler: async (event) => {
      const { memoryId, userId, content } = event.payload;
      const importance = scoreImportance(content);
      await memories.setImportance(memoryId, importance);

      await producer.publish({
        eventName: TOPICS.memoryScored,
        partitionKey: userId,
        payload: { memoryId, userId, importance },
        traceparent: event.traceparent,
      });
    },
  });

  await runtime.start();
  registerShutdown(async () => {
    await runtime.stop();
    await producer.disconnect();
    metricsServer?.close();
    await db.destroy();
  }, logger);
}

main().catch((error) => {
  console.error('Failed to start importance-worker:', error);
  process.exit(1);
});

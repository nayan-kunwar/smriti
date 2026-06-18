import { loadConfig } from '@smriti/config';
import {
  scheduleSummarizeSchema,
  TOPICS,
  type EventEnvelope,
  type ScheduleUserPayload,
} from '@smriti/events';
import { createLlmProvider } from '@smriti/llm';
import { ConsumerRuntime, createKafka, KafkaProducer } from '@smriti/kafka';
import { buildSummary } from '@smriti/memory-core';
import { createLogger, getMetrics, registerShutdown, startMetricsServer } from '@smriti/observability';
import {
  createDb,
  PostgresMemoryRepository,
  PostgresProcessedEventsRepository,
  PostgresSummaryRepository,
} from '@smriti/postgres';
import { v4 as uuid } from 'uuid';

type ScheduleSummarizeEvent = EventEnvelope<'schedule-summarize', ScheduleUserPayload>;

const GROUP = 'summarizer-worker';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: `${config.otel.serviceName}-summarizer-worker` });
  const metrics = getMetrics();
  const metricsServer = startMetricsServer(metrics, config.workerMetricsPort);

  const { db } = createDb({ url: config.postgres.url, poolSize: config.postgres.poolSize });
  const memories = new PostgresMemoryRepository(db);
  const summaries = new PostgresSummaryRepository(db);
  const processed = new PostgresProcessedEventsRepository(db);
  const llm = config.llm.provider === 'mock' ? null : createLlmProvider(config.llm);

  const kafka = createKafka({ brokers: config.kafka.brokers, clientId: config.kafka.clientId });
  const producer = new KafkaProducer(kafka);

  const runtime = new ConsumerRuntime<ScheduleSummarizeEvent>({
    kafka,
    producer,
    topic: TOPICS.scheduleSummarize,
    groupId: GROUP,
    idempotency: processed,
    logger,
    metrics,
    validate: (value) => scheduleSummarizeSchema.parse(value) as ScheduleSummarizeEvent,
    handler: async (event) => {
      const { userId } = event.payload;
      const recent = await memories.listByUser(userId, { limit: 100, offset: 0 });
      const summary = await buildSummary(
        recent.map((memory) => memory.content),
        llm,
      );
      const summaryId = uuid();

      await summaries.insert({ id: summaryId, userId, summary, summaryType: 'rolling' });

      await producer.publish({
        eventName: TOPICS.summaryGenerated,
        partitionKey: userId,
        payload: { userId, summaryId, summaryType: 'rolling' },
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
  console.error('Failed to start summarizer-worker:', error);
  process.exit(1);
});

import { loadConfig } from '@smriti/config';
import {
  scheduleProfileSchema,
  summaryGeneratedSchema,
  TOPICS,
  type EventEnvelope,
  type ScheduleUserPayload,
  type SummaryGeneratedEvent,
} from '@smriti/events';
import { createLlmProvider } from '@smriti/llm';
import { ConsumerRuntime, createKafka, KafkaProducer } from '@smriti/kafka';
import { buildProfile } from '@smriti/memory-core';
import { createLogger, getMetrics, registerShutdown, startMetricsServer } from '@smriti/observability';
import {
  createDb,
  PostgresMemoryRepository,
  PostgresProcessedEventsRepository,
  PostgresProfileRepository,
  PostgresSummaryRepository,
} from '@smriti/postgres';

type ScheduleProfileEvent = EventEnvelope<'schedule-profile', ScheduleUserPayload>;

const GROUP = 'profile-worker';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: `${config.otel.serviceName}-profile-worker` });
  const metrics = getMetrics();
  const metricsServer = startMetricsServer(metrics, config.workerMetricsPort);

  const { db } = createDb({ url: config.postgres.url, poolSize: config.postgres.poolSize });
  const memories = new PostgresMemoryRepository(db);
  const summaries = new PostgresSummaryRepository(db);
  const profiles = new PostgresProfileRepository(db);
  const processed = new PostgresProcessedEventsRepository(db);
  const llm = config.llm.provider === 'mock' ? null : createLlmProvider(config.llm);

  const kafka = createKafka({ brokers: config.kafka.brokers, clientId: config.kafka.clientId });
  const producer = new KafkaProducer(kafka);

  const generateProfile = async (userId: string, traceparent?: string): Promise<void> => {
    const recent = await memories.listByUser(userId, { limit: 200, offset: 0 });
    const [latestSummary] = await summaries.latestForUser(userId, 1);

    const profile = await buildProfile(
      recent.map((memory) => memory.content),
      latestSummary?.summary,
      llm,
    );
    await profiles.upsert(userId, profile);

    await producer.publish({
      eventName: TOPICS.profileGenerated,
      partitionKey: userId,
      payload: { userId },
      traceparent,
    });
  };

  const summaryRuntime = new ConsumerRuntime<SummaryGeneratedEvent>({
    kafka,
    producer,
    topic: TOPICS.summaryGenerated,
    groupId: GROUP,
    idempotency: processed,
    logger,
    metrics,
    validate: (value) => summaryGeneratedSchema.parse(value) as SummaryGeneratedEvent,
    handler: async (event) => generateProfile(event.payload.userId, event.traceparent),
  });

  const scheduleRuntime = new ConsumerRuntime<ScheduleProfileEvent>({
    kafka,
    producer,
    topic: TOPICS.scheduleProfile,
    groupId: `${GROUP}-schedule`,
    idempotency: processed,
    logger,
    metrics,
    validate: (value) => scheduleProfileSchema.parse(value) as ScheduleProfileEvent,
    handler: async (event) => generateProfile(event.payload.userId, event.traceparent),
  });

  await Promise.all([summaryRuntime.start(), scheduleRuntime.start()]);
  registerShutdown(async () => {
    await Promise.all([summaryRuntime.stop(), scheduleRuntime.stop()]);
    await producer.disconnect();
    metricsServer?.close();
    await db.destroy();
  }, logger);
}

main().catch((error) => {
  console.error('Failed to start profile-worker:', error);
  process.exit(1);
});

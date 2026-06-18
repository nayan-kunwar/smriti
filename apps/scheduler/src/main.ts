import { loadConfig } from '@smriti/config';
import { TOPICS } from '@smriti/events';
import { createKafka, KafkaProducer } from '@smriti/kafka';
import { createLogger, registerShutdown } from '@smriti/observability';
import { createDb, PostgresMemoryRepository, PostgresUserRepository } from '@smriti/postgres';

/**
 * Emits periodic per-user trigger events. Workers (summarizer, consolidation,
 * profile, decay) consume these. Keeping scheduling here means the heavy work
 * stays off the request path and is driven by a single, observable cron-like service.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: `${config.otel.serviceName}-scheduler` });

  const { db } = createDb({ url: config.postgres.url, poolSize: config.postgres.poolSize });
  const memories = new PostgresMemoryRepository(db);
  const users = new PostgresUserRepository(db);

  const kafka = createKafka({ brokers: config.kafka.brokers, clientId: config.kafka.clientId });
  const producer = new KafkaProducer(kafka);
  await producer.connect();

  const fanOut = async (eventName: string): Promise<void> => {
    const userIds = await memories.distinctActiveUserIds();
    await Promise.all(
      userIds.map((userId) =>
        producer.publish({ eventName, partitionKey: userId, payload: { userId } }),
      ),
    );
    logger.info({ eventName, users: userIds.length }, 'scheduled fan-out');
  };

  const fanOutAllUsers = async (eventName: string): Promise<void> => {
    const userIds = await users.listIds();
    await Promise.all(
      userIds.map((userId) =>
        producer.publish({ eventName, partitionKey: userId, payload: { userId } }),
      ),
    );
    logger.info({ eventName, users: userIds.length }, 'scheduled fan-out (all users)');
  };

  const runDecay = async (): Promise<void> => {
    const cutoff = new Date(
      Date.now() - config.memory.decayAgeDays * 24 * 60 * 60 * 1000,
    );
    const updated = await memories.applyDecayImportance(cutoff, config.memory.decayFactor);
    const archived = await memories.archiveLowImportance(config.memory.archiveThreshold);
    logger.info({ updated, archived, cutoff: cutoff.toISOString() }, 'memory decay applied');
  };

  const summarizeTimer = setInterval(() => {
    void fanOut(TOPICS.scheduleSummarize).catch((error) =>
      logger.error({ err: String(error) }, 'summarize fan-out failed'),
    );
  }, config.scheduler.summarizeMs);

  const consolidateTimer = setInterval(() => {
    void fanOut(TOPICS.scheduleConsolidate).catch((error) =>
      logger.error({ err: String(error) }, 'consolidate fan-out failed'),
    );
  }, config.scheduler.consolidateMs);

  const profileTimer = setInterval(() => {
    void fanOutAllUsers(TOPICS.scheduleProfile).catch((error) =>
      logger.error({ err: String(error) }, 'profile fan-out failed'),
    );
  }, config.scheduler.profileMs);

  const decayTimer = setInterval(() => {
    void runDecay().catch((error) => logger.error({ err: String(error) }, 'decay job failed'));
  }, config.scheduler.decayMs);

  logger.info(
    {
      summarizeMs: config.scheduler.summarizeMs,
      consolidateMs: config.scheduler.consolidateMs,
      profileMs: config.scheduler.profileMs,
      decayMs: config.scheduler.decayMs,
    },
    'scheduler started',
  );

  registerShutdown(async () => {
    clearInterval(summarizeTimer);
    clearInterval(consolidateTimer);
    clearInterval(profileTimer);
    clearInterval(decayTimer);
    await producer.disconnect();
    await db.destroy();
  }, logger);
}

main().catch((error) => {
  console.error('Failed to start scheduler:', error);
  process.exit(1);
});

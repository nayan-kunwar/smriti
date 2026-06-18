import { loadConfig, type AppConfig } from '@smriti/config';
import { createEmbeddingProvider } from '@smriti/embedding';
import { createKafka, KafkaProducer } from '@smriti/kafka';
import {
  CreateMemoryUseCase,
  CreateUserUseCase,
  DeleteMemoryUseCase,
  GetUserProfileUseCase,
  GetUserUseCase,
  ListMemoriesUseCase,
  systemClock,
  UpdateMemoryUseCase,
  type EventPublisher,
} from '@smriti/memory-core';
import { createLogger, getMetrics } from '@smriti/observability';
import {
  createDb,
  PostgresMemoryRepository,
  PostgresProfileRepository,
  PostgresUserRepository,
  PostgresVectorSearch,
} from '@smriti/postgres';
import { ContextCache, createRedis, WorkingMemoryStore } from '@smriti/redis';
import { RetrieveContextUseCase } from '@smriti/retrieval-core';
import type { Provider } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { TOKENS } from './tokens';

/**
 * Composition root: every dependency is constructed here via factory providers
 * and exposed through explicit tokens. Controllers stay thin and depend only on
 * use cases.
 */
export function buildProviders(): Provider[] {
  return [
    { provide: TOKENS.Config, useFactory: (): AppConfig => loadConfig() },
    {
      provide: TOKENS.Logger,
      inject: [TOKENS.Config],
      useFactory: (config: AppConfig) =>
        createLogger({ service: `${config.otel.serviceName}-api` }),
    },
    { provide: TOKENS.Metrics, useFactory: () => getMetrics() },
    {
      provide: TOKENS.Pool,
      inject: [TOKENS.Config],
      useFactory: (config: AppConfig) =>
        createDb({ url: config.postgres.url, poolSize: config.postgres.poolSize }),
    },
    {
      provide: TOKENS.Db,
      inject: [TOKENS.Pool],
      useFactory: (conn: ReturnType<typeof createDb>) => conn.db,
    },
    {
      provide: TOKENS.Redis,
      inject: [TOKENS.Config],
      useFactory: (config: AppConfig) => createRedis(config.redis.url),
    },
    {
      provide: TOKENS.KafkaProducer,
      inject: [TOKENS.Config],
      useFactory: (config: AppConfig) =>
        new KafkaProducer(
          createKafka({ brokers: config.kafka.brokers, clientId: config.kafka.clientId }),
        ),
    },
    {
      provide: TOKENS.EmbeddingProvider,
      inject: [TOKENS.Config],
      useFactory: (config: AppConfig) => createEmbeddingProvider(config.embedding),
    },
    {
      provide: TOKENS.MemoryRepository,
      inject: [TOKENS.Db],
      useFactory: (db: ReturnType<typeof createDb>['db']) => new PostgresMemoryRepository(db),
    },
    {
      provide: TOKENS.UserRepository,
      inject: [TOKENS.Db],
      useFactory: (db: ReturnType<typeof createDb>['db']) => new PostgresUserRepository(db),
    },
    {
      provide: TOKENS.ProfileRepository,
      inject: [TOKENS.Db],
      useFactory: (db: ReturnType<typeof createDb>['db']) => new PostgresProfileRepository(db),
    },
    {
      provide: TOKENS.ContextCache,
      inject: [TOKENS.Redis],
      useFactory: (redis: ReturnType<typeof createRedis>) => new ContextCache(redis),
    },
    {
      provide: TOKENS.WorkingMemory,
      inject: [TOKENS.Redis],
      useFactory: (redis: ReturnType<typeof createRedis>) => new WorkingMemoryStore(redis),
    },
    {
      provide: TOKENS.CreateUserUseCase,
      inject: [TOKENS.UserRepository],
      useFactory: (users: PostgresUserRepository) =>
        new CreateUserUseCase({
          users,
          clock: systemClock,
          ids: { next: () => uuid() },
        }),
    },
    {
      provide: TOKENS.GetUserUseCase,
      inject: [TOKENS.UserRepository],
      useFactory: (users: PostgresUserRepository) => new GetUserUseCase(users),
    },
    {
      provide: TOKENS.GetUserProfileUseCase,
      inject: [TOKENS.ProfileRepository],
      useFactory: (profiles: PostgresProfileRepository) => new GetUserProfileUseCase(profiles),
    },
    {
      provide: TOKENS.CreateMemoryUseCase,
      inject: [TOKENS.MemoryRepository, TOKENS.KafkaProducer, TOKENS.ContextCache],
      useFactory: (
        memories: PostgresMemoryRepository,
        producer: KafkaProducer,
        cache: ContextCache,
      ) =>
        new CreateMemoryUseCase({
          memories,
          events: toEventPublisher(producer),
          clock: systemClock,
          ids: { next: () => uuid() },
          cache,
        }),
    },
    {
      provide: TOKENS.UpdateMemoryUseCase,
      inject: [TOKENS.MemoryRepository, TOKENS.KafkaProducer, TOKENS.ContextCache],
      useFactory: (
        memories: PostgresMemoryRepository,
        producer: KafkaProducer,
        cache: ContextCache,
      ) =>
        new UpdateMemoryUseCase({
          memories,
          events: toEventPublisher(producer),
          cache,
        }),
    },
    {
      provide: TOKENS.ListMemoriesUseCase,
      inject: [TOKENS.MemoryRepository],
      useFactory: (memories: PostgresMemoryRepository) => new ListMemoriesUseCase(memories),
    },
    {
      provide: TOKENS.DeleteMemoryUseCase,
      inject: [TOKENS.MemoryRepository, TOKENS.KafkaProducer, TOKENS.ContextCache],
      useFactory: (
        memories: PostgresMemoryRepository,
        producer: KafkaProducer,
        cache: ContextCache,
      ) =>
        new DeleteMemoryUseCase({ memories, events: toEventPublisher(producer), cache }),
    },
    {
      provide: TOKENS.RetrieveContextUseCase,
      inject: [TOKENS.EmbeddingProvider, TOKENS.Db, TOKENS.ContextCache, TOKENS.WorkingMemory],
      useFactory: (
        embedder: ReturnType<typeof createEmbeddingProvider>,
        db: ReturnType<typeof createDb>['db'],
        cache: ContextCache,
        workingMemory: WorkingMemoryStore,
      ) =>
        new RetrieveContextUseCase({
          embedder: { embed: (text) => embedder.embed(text) },
          vectorSearch: new PostgresVectorSearch(db),
          cache,
          workingMemory,
        }),
    },
  ];
}

function toEventPublisher(producer: KafkaProducer): EventPublisher {
  return {
    publish: (event) =>
      producer.publish({
        eventName: event.eventName,
        partitionKey: event.partitionKey,
        payload: event.payload,
        traceparent: event.traceparent,
      }),
  };
}

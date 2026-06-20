import { z } from 'zod';

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  HTTP_HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().positive().default(3000),

  POSTGRES_URL: z.string().min(1),
  POSTGRES_POOL_SIZE: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.string().min(1),

  KAFKA_BROKERS: z.string().min(1),
  KAFKA_CLIENT_ID: z.string().default('smriti'),
  KAFKA_GROUP_ID: z.string().default('smriti-workers'),
  KAFKA_SSL: z.coerce.boolean().default(false),
  KAFKA_SASL_MECHANISM: z.enum(['scram-sha-256', 'plain']).default('scram-sha-256'),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),

  EMBEDDING_PROVIDER: z.enum(['openai', 'gemini', 'mock']).default('mock'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  LLM_PROVIDER: z.enum(['openai', 'gemini', 'mock']).default('mock'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),

  API_KEY: z.string().optional(),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  WORKER_METRICS_PORT: z.coerce.number().int().nonnegative().default(0),

  SCHEDULE_SUMMARIZE_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  SCHEDULE_CONSOLIDATE_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  SCHEDULE_PROFILE_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
  SCHEDULE_DECAY_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  MEMORY_DECAY_FACTOR: z.coerce.number().positive().max(1).default(0.95),
  MEMORY_DECAY_AGE_DAYS: z.coerce.number().int().positive().default(7),
  MEMORY_ARCHIVE_THRESHOLD: z.coerce.number().positive().max(1).default(0.05),
  CONSOLIDATION_SIMILARITY_THRESHOLD: z.coerce.number().positive().max(1).default(0.92),

  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
  OTEL_SERVICE_NAME: z.string().default('smriti'),
});

export type RawEnv = z.infer<typeof envSchema>;

export interface AppConfig {
  nodeEnv: RawEnv['NODE_ENV'];
  http: { host: string; port: number };
  postgres: { url: string; poolSize: number };
  redis: { url: string };
  kafka: {
    brokers: string[];
    clientId: string;
    groupId: string;
    ssl: boolean;
    sasl?: { mechanism: 'scram-sha-256' | 'plain'; username: string; password: string };
  };
  embedding: {
    provider: RawEnv['EMBEDDING_PROVIDER'];
    model: string;
    dimensions: number;
    openaiApiKey?: string;
    geminiApiKey?: string;
  };
  llm: {
    provider: RawEnv['LLM_PROVIDER'];
    model: string;
    openaiApiKey?: string;
    geminiApiKey?: string;
  };
  auth: {
    apiKey?: string;
    enforceApiKey: boolean;
  };
  rateLimit: { ttlMs: number; max: number };
  workerMetricsPort: number;
  scheduler: {
    summarizeMs: number;
    consolidateMs: number;
    profileMs: number;
    decayMs: number;
  };
  memory: {
    decayFactor: number;
    decayAgeDays: number;
    archiveThreshold: number;
    consolidationSimilarityThreshold: number;
  };
  otel: { exporterUrl: string; serviceName: string };
}

/**
 * Parse and validate configuration once at startup. Throws (fail-fast) when the
 * environment is invalid, instead of failing lazily at first use.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const e = parsed.data;
  const enforceApiKey = e.NODE_ENV === 'production';

  if (enforceApiKey && !e.API_KEY) {
    throw new Error('API_KEY is required when NODE_ENV=production');
  }

  const hasSaslUsername = Boolean(e.KAFKA_SASL_USERNAME);
  const hasSaslPassword = Boolean(e.KAFKA_SASL_PASSWORD);
  if (hasSaslUsername !== hasSaslPassword) {
    throw new Error(
      'KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD must both be set when using SASL authentication',
    );
  }

  const sasl = hasSaslUsername
    ? {
        mechanism: e.KAFKA_SASL_MECHANISM,
        username: e.KAFKA_SASL_USERNAME as string,
        password: e.KAFKA_SASL_PASSWORD as string,
      }
    : undefined;

  return {
    nodeEnv: e.NODE_ENV,
    http: { host: e.HTTP_HOST, port: e.HTTP_PORT },
    postgres: { url: e.POSTGRES_URL, poolSize: e.POSTGRES_POOL_SIZE },
    redis: { url: e.REDIS_URL },
    kafka: {
      brokers: csv(e.KAFKA_BROKERS),
      clientId: e.KAFKA_CLIENT_ID,
      groupId: e.KAFKA_GROUP_ID,
      ssl: e.KAFKA_SSL || Boolean(sasl),
      sasl,
    },
    embedding: {
      provider: e.EMBEDDING_PROVIDER,
      model: e.EMBEDDING_MODEL,
      dimensions: e.EMBEDDING_DIMENSIONS,
      openaiApiKey: e.OPENAI_API_KEY,
      geminiApiKey: e.GEMINI_API_KEY,
    },
    llm: {
      provider: e.LLM_PROVIDER,
      model: e.LLM_MODEL,
      openaiApiKey: e.OPENAI_API_KEY,
      geminiApiKey: e.GEMINI_API_KEY,
    },
    auth: {
      apiKey: e.API_KEY,
      enforceApiKey,
    },
    rateLimit: { ttlMs: e.RATE_LIMIT_TTL_MS, max: e.RATE_LIMIT_MAX },
    workerMetricsPort: e.WORKER_METRICS_PORT,
    scheduler: {
      summarizeMs: e.SCHEDULE_SUMMARIZE_MS,
      consolidateMs: e.SCHEDULE_CONSOLIDATE_MS,
      profileMs: e.SCHEDULE_PROFILE_MS,
      decayMs: e.SCHEDULE_DECAY_MS,
    },
    memory: {
      decayFactor: e.MEMORY_DECAY_FACTOR,
      decayAgeDays: e.MEMORY_DECAY_AGE_DAYS,
      archiveThreshold: e.MEMORY_ARCHIVE_THRESHOLD,
      consolidationSimilarityThreshold: e.CONSOLIDATION_SIMILARITY_THRESHOLD,
    },
    otel: { exporterUrl: e.OTEL_EXPORTER_OTLP_ENDPOINT, serviceName: e.OTEL_SERVICE_NAME },
  };
}

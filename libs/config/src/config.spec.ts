import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = {
  POSTGRES_URL: 'postgres://localhost:5432/smriti',
  REDIS_URL: 'redis://localhost:6379',
  KAFKA_BROKERS: 'localhost:9092,localhost:9093',
};

describe('loadConfig', () => {
  it('parses a valid environment with defaults applied', () => {
    const config = loadConfig(base as NodeJS.ProcessEnv);
    expect(config.http.port).toBe(3000);
    expect(config.kafka.brokers).toEqual(['localhost:9092', 'localhost:9093']);
    expect(config.embedding.provider).toBe('mock');
  });

  it('throws on missing required values', () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(/Invalid environment/);
  });

  it('coerces numeric values', () => {
    const config = loadConfig({ ...base, HTTP_PORT: '8080' } as NodeJS.ProcessEnv);
    expect(config.http.port).toBe(8080);
  });

  it('requires API_KEY in production', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/API_KEY is required/);
  });
});

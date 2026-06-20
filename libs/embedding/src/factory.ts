import type { AppConfig } from '@smriti/config';
import { MockEmbeddingProvider } from './mock-provider';
import { OpenAIEmbeddingProvider } from './openai-provider';
import { GeminiEmbeddingProvider } from './gemini-provider';
import type { EmbeddingProvider } from './provider';

/** Build the configured embedding provider. Fails fast on misconfiguration. */
export function createEmbeddingProvider(config: AppConfig['embedding']): EmbeddingProvider {
  switch (config.provider) {
    case 'openai': {
      if (!config.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
      }
      return new OpenAIEmbeddingProvider({
        apiKey: config.openaiApiKey,
        model: config.model,
        dimensions: config.dimensions,
      });
    }
    case 'gemini': {
      if (!config.geminiApiKey) {
        throw new Error('GEMINI_API_KEY is required when EMBEDDING_PROVIDER=gemini');
      }
      return new GeminiEmbeddingProvider({
        apiKey: config.geminiApiKey,
        model: config.model,
        dimensions: config.dimensions,
      });
    }
    case 'mock':
      return new MockEmbeddingProvider(config.dimensions);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unsupported embedding provider: ${String(exhaustive)}`);
    }
  }
}

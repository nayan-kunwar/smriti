import type { AppConfig } from '@smriti/config';
import { MockLlmProvider } from './mock-provider';
import { OpenAiLlmProvider } from './openai-provider';
import { GeminiLlmProvider } from './gemini-provider';
import type { LlmProvider } from './provider';

/** Build the configured LLM provider. Fails fast on misconfiguration. */
export function createLlmProvider(config: AppConfig['llm']): LlmProvider {
  switch (config.provider) {
    case 'openai': {
      if (!config.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
      }
      return new OpenAiLlmProvider({ apiKey: config.openaiApiKey, model: config.model });
    }
    case 'gemini': {
      if (!config.geminiApiKey) {
        throw new Error('GEMINI_API_KEY is required when LLM_PROVIDER=gemini');
      }
      return new GeminiLlmProvider({ apiKey: config.geminiApiKey, model: config.model });
    }
    case 'mock':
      return new MockLlmProvider(config.model);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unsupported LLM provider: ${String(exhaustive)}`);
    }
  }
}

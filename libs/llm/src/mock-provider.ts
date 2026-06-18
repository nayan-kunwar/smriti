import type { LlmProvider } from './provider';

/** Deterministic mock LLM for tests and local development. */
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model: string;

  constructor(model = 'mock-llm') {
    this.model = model;
  }

  async complete(prompt: string): Promise<string> {
    const trimmed = prompt.trim();
    if (trimmed.includes('JSON profile')) {
      return JSON.stringify({
        skills: ['TypeScript', 'PostgreSQL'],
        interests: ['Backend', 'AI Engineering'],
        summary: 'Mock profile derived from memories.',
      });
    }
    return `Summary:\n- ${trimmed.slice(0, 200).replace(/\n/g, ' ')}`;
  }
}

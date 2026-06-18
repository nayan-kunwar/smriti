import type { LlmProvider } from './provider';

export interface OpenAiLlmOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/** OpenAI chat completions via REST `fetch`. */
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: OpenAiLlmOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  }

  async complete(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI chat failed (${response.status}): ${detail}`);
    }

    const json = (await response.json()) as {
      choices: Array<{ message: { content: string | null } }>;
    };
    const content = json.choices[0]?.message.content;
    if (!content) {
      throw new Error('OpenAI chat returned empty content');
    }
    return content;
  }
}

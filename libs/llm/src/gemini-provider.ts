import type { LlmProvider } from './provider';

export interface GeminiLlmOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/** Google Gemini chat completions via REST `fetch`. */
export class GeminiLlmProvider implements LlmProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: GeminiLlmOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    // Base URL defaults to Google Generative Language API
    this.baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  async complete(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Gemini LLM completion failed (${response.status}): ${detail}`);
    }

    const json = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (content === undefined || content === null) {
      throw new Error('Gemini LLM completion returned empty content');
    }
    return content;
  }
}

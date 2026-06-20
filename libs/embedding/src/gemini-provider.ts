import type { EmbeddingProvider } from './provider';

export interface GeminiEmbeddingOptions {
  apiKey: string;
  model: string;
  dimensions: number;
  baseUrl?: string;
}

/** Google Gemini embeddings via REST `fetch`. */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: GeminiEmbeddingOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.dimensions = options.dimensions;
    // Base URL defaults to Google Generative Language API
    this.baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  private getModelPath(): string {
    return this.model.startsWith('models/') ? this.model : `models/${this.model}`;
  }

  async embed(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/${this.getModelPath()}:embedContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
        outputDimensionality: this.dimensions,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Gemini embedding failed (${response.status}): ${detail}`);
    }

    const json = (await response.json()) as {
      embedding?: {
        values?: number[];
      };
    };

    const values = json.embedding?.values;
    if (!values) {
      throw new Error('Gemini embedding returned empty vector');
    }
    return values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // For a single item, we can fall back to the single embed endpoint or use batch.
    // Let's use batch for consistency if length > 0.
    const url = `${this.baseUrl}/${this.getModelPath()}:batchEmbedContents?key=${this.apiKey}`;
    
    const requests = texts.map((text) => ({
      model: this.getModelPath(),
      content: {
        parts: [{ text }],
      },
      outputDimensionality: this.dimensions,
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Gemini batch embedding failed (${response.status}): ${detail}`);
    }

    const json = (await response.json()) as {
      embeddings?: Array<{
        values?: number[];
      }>;
    };

    const embeddings = json.embeddings;
    if (!embeddings || embeddings.length !== texts.length) {
      throw new Error('Gemini batch embedding returned invalid responses');
    }

    return embeddings.map((item, index) => {
      const values = item.values;
      if (!values) {
        throw new Error(`Gemini batch embedding at index ${index} returned empty vector`);
      }
      return values;
    });
  }
}

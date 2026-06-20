import { describe, expect, it, vi } from 'vitest';
import { GeminiEmbeddingProvider } from './gemini-provider';

describe('GeminiEmbeddingProvider', () => {
  it('sends correct request payload and returns embedding for single input', async () => {
    const mockResponse = {
      embedding: {
        values: [0.1, 0.2, 0.3],
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(url).toContain('models/text-embedding-004:embedContent?key=test-key');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init?.body as string);
      expect(body.content.parts[0].text).toBe('hello');
      expect(body.outputDimensionality).toBe(3);

      return {
        ok: true,
        json: async () => mockResponse,
      } as Response;
    });

    const provider = new GeminiEmbeddingProvider({
      apiKey: 'test-key',
      model: 'text-embedding-004',
      dimensions: 3,
    });
    const result = await provider.embed('hello');
    expect(result).toEqual([0.1, 0.2, 0.3]);
    fetchSpy.mockRestore();
  });

  it('sends correct request payload and returns embeddings for batch input', async () => {
    const mockResponse = {
      embeddings: [
        { values: [0.1, 0.2] },
        { values: [0.3, 0.4] },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(url).toContain('models/text-embedding-004:batchEmbedContents?key=test-key');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init?.body as string);
      expect(body.requests).toHaveLength(2);
      expect(body.requests[0].model).toBe('models/text-embedding-004');
      expect(body.requests[0].content.parts[0].text).toBe('hello');
      expect(body.requests[0].outputDimensionality).toBe(2);
      expect(body.requests[1].content.parts[0].text).toBe('world');

      return {
        ok: true,
        json: async () => mockResponse,
      } as Response;
    });

    const provider = new GeminiEmbeddingProvider({
      apiKey: 'test-key',
      model: 'text-embedding-004',
      dimensions: 2,
    });
    const result = await provider.embedBatch(['hello', 'world']);
    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    fetchSpy.mockRestore();
  });

  it('throws error when response is not ok', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Error message',
    } as Response);

    const provider = new GeminiEmbeddingProvider({
      apiKey: 'test-key',
      model: 'text-embedding-004',
      dimensions: 3,
    });
    await expect(provider.embed('hello')).rejects.toThrow('Gemini embedding failed (400): Error message');
    fetchSpy.mockRestore();
  });
});

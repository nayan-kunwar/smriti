import { describe, expect, it, vi } from 'vitest';
import { GeminiLlmProvider } from './gemini-provider';

describe('GeminiLlmProvider', () => {
  it('sends correct request payload and returns content', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Summarized content' }],
          },
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(url).toContain('models/gemini-1.5-flash:generateContent?key=test-key');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init?.body as string);
      expect(body.contents[0].parts[0].text).toBe('Test prompt');
      expect(body.generationConfig.temperature).toBe(0.2);

      return {
        ok: true,
        json: async () => mockResponse,
      } as Response;
    });

    const provider = new GeminiLlmProvider({ apiKey: 'test-key', model: 'gemini-1.5-flash' });
    const result = await provider.complete('Test prompt');
    expect(result).toBe('Summarized content');
    fetchSpy.mockRestore();
  });

  it('throws error when response is not ok', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid model name',
    } as Response);

    const provider = new GeminiLlmProvider({ apiKey: 'test-key', model: 'invalid-model' });
    await expect(provider.complete('hello')).rejects.toThrow('Gemini LLM completion failed (400): Invalid model name');
    fetchSpy.mockRestore();
  });
});

import { MistralClientService } from './mistral-client.service';
import { postMistralOcr } from './mistral-ocr-transport';

jest.mock('./mistral-ocr-transport', () => ({
  DEFAULT_MISTRAL_OCR_TIMEOUT_MS: 120_000,
  postMistralOcr: jest.fn(),
}));

describe('MistralClientService OCR markdown', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.mocked(postMistralOcr).mockReset();
    jest.restoreAllMocks();
  });

  it('inlines OCR tables referenced from page markdown', async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ mistralApiKey: 'test-key' }) },
    };
    jest.mocked(postMistralOcr).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        pages: [
          {
            markdown:
              '## Recipe ingredients\n\n[tbl-0.md](tbl-0.md)\n\n## Preparation instructions',
            tables: [
              { id: 'tbl-0.md', content: '| PRODUCT | AMOUNT |\n| --- | --- |\n| Water | 720 g |' },
            ],
          },
        ],
      }),
    });

    const result = await new MistralClientService(prisma as any).ocrMarkdown('org-1', {
      buffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
      withAnnotation: true,
    });

    expect(result.markdown).toContain('| Water | 720 g |');
    expect(result.markdown).not.toContain('[tbl-0.md](tbl-0.md)');
    expect(postMistralOcr).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({ model: 'mistral-ocr-latest' }),
      120_000,
    );
  });

  it('retries OCR without annotations after a provider validation error', async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ mistralApiKey: 'test-key' }) },
    };
    jest
      .mocked(postMistralOcr)
      .mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ pages: [{ markdown: 'Document lisible' }] }),
      });

    const result = await new MistralClientService(prisma as any).ocrMarkdown('org-1', {
      buffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
      withAnnotation: true,
    });

    expect(result.markdown).toBe('Document lisible');
    expect(postMistralOcr).toHaveBeenCalledTimes(2);
    expect(jest.mocked(postMistralOcr).mock.calls[0][1]).toEqual(
      expect.objectContaining({ table_format: 'markdown' }),
    );
    expect(jest.mocked(postMistralOcr).mock.calls[1][1]).not.toHaveProperty('table_format');
  });

  it('retries in JSON mode when Mistral rejects a strict schema', async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ mistralApiKey: 'test-key' }) },
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid JSON schema' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"value":42}' } }],
        }),
      }) as any;

    const result = await new MistralClientService(prisma as any).chatJson<{ value: number }>(
      'org-1',
      [{ role: 'user', content: 'Retourne la valeur.' }],
      'test_schema',
      {
        type: 'object',
        additionalProperties: false,
        required: ['value'],
        properties: { value: { type: 'number' } },
      },
      { fallbackToJsonObject: true },
    );

    expect(result).toEqual({ value: 42 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const secondRequest = JSON.parse(String((global.fetch as jest.Mock).mock.calls[1][1].body));
    expect(secondRequest.response_format).toEqual({ type: 'json_object' });
    expect(secondRequest.messages[0].content).toContain('conforme à ce schéma');
  });

  it('reports the configured timeout instead of a generic aborted operation', async () => {
    jest.useFakeTimers();
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ mistralApiKey: 'test-key' }) },
    };
    global.fetch = jest.fn((_url, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('This operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }) as any;

    try {
      const result = new MistralClientService(prisma as any).chatJson(
        'org-1',
        [{ role: 'user', content: 'Retourne la valeur.' }],
        'test_schema',
        { type: 'object' },
        { timeoutMs: 25 },
      );
      const expectation = expect(result).rejects.toThrow('Délai Mistral dépassé après 25 ms');
      await jest.advanceTimersByTimeAsync(25);

      await expectation;
    } finally {
      jest.useRealTimers();
    }
  });
});

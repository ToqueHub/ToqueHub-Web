import { MistralClientService } from './mistral-client.service';

describe('MistralClientService OCR markdown', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('inlines OCR tables referenced from page markdown', async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ mistralApiKey: 'test-key' }) },
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
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
    }) as any;

    const result = await new MistralClientService(prisma as any).ocrMarkdown('org-1', {
      buffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
      withAnnotation: true,
    });

    expect(result.markdown).toContain('| Water | 720 g |');
    expect(result.markdown).not.toContain('[tbl-0.md](tbl-0.md)');
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
});

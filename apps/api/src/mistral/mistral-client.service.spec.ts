import { MistralClientService } from './mistral-client.service';

describe('MistralClientService OCR markdown', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('inlines OCR tables referenced from page markdown', async () => {
    const prisma = { organization: { findUnique: jest.fn().mockResolvedValue({ mistralApiKey: 'test-key' }) } };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pages: [{
          markdown: '## Recipe ingredients\n\n[tbl-0.md](tbl-0.md)\n\n## Preparation instructions',
          tables: [{ id: 'tbl-0.md', content: '| PRODUCT | AMOUNT |\n| --- | --- |\n| Water | 720 g |' }],
        }],
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
});

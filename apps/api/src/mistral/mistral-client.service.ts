import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type MistralOcrInput = {
  buffer: Buffer;
  mimeType: string;
  model?: string;
  timeoutMs?: number;
  withAnnotation?: boolean;
  documentAnnotationPrompt?: string;
  documentAnnotationFormat?: Record<string, unknown>;
};

@Injectable()
export class MistralClientService {
  constructor(private readonly prisma: PrismaService) {}

  async ocrMarkdown(organizationId: string, input: MistralOcrInput) {
    const apiKey = await this.apiKey(organizationId);
    if (!apiKey) throw new BadRequestException('Clé API Mistral absente');
    const model = input.model || process.env.OCR_MISTRAL_MODEL || 'mistral-ocr-latest';
    const mimeType = input.mimeType || 'application/pdf';
    const isPdf = mimeType === 'application/pdf';
    const dataUrl = `data:${mimeType};base64,${input.buffer.toString('base64')}`;
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? Number(process.env.OCR_TIMEOUT_MS ?? 60_000));
    try {
      let response = await fetch('https://api.mistral.ai/v1/ocr', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(this.ocrRequestBody(model, isPdf, dataUrl, input)),
        signal: controller.signal,
      });
      let json: any = await response.json().catch(() => ({}));
      if (!response.ok && input.withAnnotation && (response.status === 400 || response.status === 422)) {
        response = await fetch('https://api.mistral.ai/v1/ocr', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(this.ocrRequestBody(model, isPdf, dataUrl, { ...input, withAnnotation: false })),
          signal: controller.signal,
        });
        json = await response.json().catch(() => ({}));
      }
      if (!response.ok) throw new BadRequestException('Le document n’a pas pu être analysé. Vérifiez qu’il est lisible et réessayez.');
      const pages = Array.isArray(json?.pages) ? json.pages : [];
      return {
        rawJson: json,
        markdown: pages.map((page: any) => this.pageMarkdown(page)).filter(Boolean).join('\n\n'),
        pageCount: pages.length || json?.usage_info?.pages_processed || null,
        durationMs: Date.now() - started,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`OCR Mistral indisponible: ${error?.message || 'erreur réseau'}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async chatJson<T>(organizationId: string, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, schemaName: string, schema: Record<string, unknown>, options: { temperature?: number } = {}): Promise<T> {
    const apiKey = await this.apiKey(organizationId);
    if (!apiKey) throw new BadRequestException('Clé API Mistral absente');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.MISTRAL_CHAT_TIMEOUT_MS ?? 60_000));
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ model: process.env.STOCK_ASSISTANT_MISTRAL_MODEL || process.env.OCR_MISTRAL_AI_MODEL || 'mistral-large-latest', temperature: options.temperature ?? 0, messages, response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } } }),
      });
      const json: any = await response.json().catch(() => ({}));
      if (!response.ok) throw new BadRequestException(`Mistral a refusé la demande (${response.status})`);
      const content = json?.choices?.[0]?.message?.content;
      if (!content) throw new BadRequestException('Réponse Mistral vide');
      return typeof content === 'string' ? JSON.parse(content) : content;
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Mistral indisponible: ${error?.message || 'erreur réseau'}`);
    } finally { clearTimeout(timeout); }
  }

  private ocrRequestBody(model: string, isPdf: boolean, dataUrl: string, input: MistralOcrInput) {
    const body: Record<string, unknown> = {
      model,
      document: isPdf ? { type: 'document_url', document_url: dataUrl } : { type: 'image_url', image_url: dataUrl },
      include_image_base64: false,
    };
    if (input.withAnnotation) {
      body.table_format = 'markdown';
      body.confidence_scores_granularity = 'page';
      if (input.documentAnnotationPrompt) body.document_annotation_prompt = input.documentAnnotationPrompt;
      if (input.documentAnnotationFormat) body.document_annotation_format = input.documentAnnotationFormat;
    }
    return body;
  }

  private pageMarkdown(page: any) {
    let markdown = String(page?.markdown || page?.text || '');
    const tables = Array.isArray(page?.tables) ? page.tables : [];
    for (const table of tables) {
      const id = String(table?.id || '').trim();
      const content = String(table?.content || '').trim();
      if (!id || !content) continue;
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reference = new RegExp(`\\[${escapedId}\\]\\(${escapedId}\\)`, 'g');
      if (reference.test(markdown)) markdown = markdown.replace(reference, content);
      else markdown += `\n\n${content}`;
    }
    return markdown;
  }

  private async apiKey(organizationId: string) {
    const envKey = process.env.MISTRAL_API_KEY || process.env.OCR_MISTRAL_API_KEY;
    if (envKey) return envKey;
    return (await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { mistralApiKey: true } }))?.mistralApiKey?.trim() || null;
  }
}

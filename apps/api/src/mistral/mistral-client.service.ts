import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MistralClientService {
  constructor(private readonly prisma: PrismaService) {}

  async chatJson<T>(organizationId: string, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, schemaName: string, schema: Record<string, unknown>): Promise<T> {
    const apiKey = await this.apiKey(organizationId);
    if (!apiKey) throw new BadRequestException('Clé API Mistral absente');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.MISTRAL_CHAT_TIMEOUT_MS ?? 60_000));
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ model: process.env.STOCK_ASSISTANT_MISTRAL_MODEL || process.env.OCR_MISTRAL_AI_MODEL || 'mistral-large-latest', temperature: 0, messages, response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } } }),
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

  private async apiKey(organizationId: string) {
    const envKey = process.env.MISTRAL_API_KEY || process.env.OCR_MISTRAL_API_KEY;
    if (envKey) return envKey;
    return (await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { mistralApiKey: true } }))?.mistralApiKey?.trim() || null;
  }
}

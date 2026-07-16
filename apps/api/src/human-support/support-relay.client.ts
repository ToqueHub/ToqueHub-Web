import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';

const INSTANCE_ID_KEY = 'discovery.instanceId';
const SECRET_KEY = 'human-support.relay-secret';
const RELAY_INSTANCE_KEY = 'human-support.relay-instance-id';

@Injectable()
export class SupportRelayClient implements OnModuleInit {
  private readonly logger = new Logger(SupportRelayClient.name);
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() { void this.request('/v1/installations/enroll', { kind: 'bootstrap' }).catch((error) => this.logger.debug(`Relais support en attente: ${error instanceof Error ? error.message : String(error)}`)); }

  async openTicket(ticket: any) { const result = await this.request('/v1/tickets', { ticketId: ticket.id, organizationId: ticket.organizationId, organizationName: await this.organizationName(ticket.organizationId), userId: ticket.userId, contactEmail: ticket.contactEmail, contactPhone: ticket.contactPhone, transcript: ticket.transcript, message: ticket.messages?.[0] ? await this.messagePayload(ticket.messages[0]) : null }); if (ticket.messages?.[0]) await (this.prisma as any).humanSupportMessage.update({ where: { id: ticket.messages[0].id }, data: { deliveryStatus: 'SENT', deliveryError: null } }); return result; }
  async sendMessage(ticket: any, message: any) { const result = await this.request(`/v1/tickets/${encodeURIComponent(ticket.relayTicketId || ticket.id)}/messages`, { ticketId: ticket.id, message: await this.messagePayload(message) }); await (this.prisma as any).humanSupportMessage.update({ where: { id: message.id }, data: { deliveryStatus: 'SENT', deliveryError: null } }); return result; }
  async closeTicket(ticket: any) { const result = await this.request(`/v1/tickets/${encodeURIComponent(ticket.relayTicketId || ticket.id)}/close`, { ticketId: ticket.id }); await (this.prisma as any).humanSupportTicket.update({ where: { id: ticket.id }, data: { relayError: null } }); return result; }
  async pullEvents() { const result: any = await this.request('/v1/events/pull', {}); return Array.isArray(result?.events) ? result.events : []; }
  async acknowledgeEvents(eventIds: string[]) { if (!eventIds.length) return; await this.request('/v1/events/ack', { eventIds }); }

  private async messagePayload(message: any) { return { id: message.id, content: message.content, createdAt: message.createdAt, attachments: (message.attachments || []).map((file: any) => ({ id: file.id, filename: file.filename, mimeType: file.mimeType, size: file.size, contentBase64: readFileSync(file.storagePath).toString('base64') })) }; }
  private async organizationName(organizationId: string) { return (await (this.prisma as any).organization.findUnique({ where: { id: organizationId }, select: { name: true } }).catch(() => null))?.name || null; }

  private async request(path: string, payload: Record<string, unknown>) {
    const baseUrl = (process.env.TOQUEHUB_SUPPORT_RELAY_URL || 'https://toquehub-support-relay.fly.dev').replace(/\/$/, '');
    const identity = await this.identity();
    const body = JSON.stringify({ ...payload, instanceId: identity.instanceId, relayInstanceId: identity.relayInstanceId, enrollmentSecret: identity.secret });
    const timestamp = String(Date.now()); const nonce = randomUUID();
    const signature = createHmac('sha256', identity.secret).update(`${timestamp}.${nonce}.${body}`).digest('hex');
    const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ToqueHub-Instance': identity.instanceId, 'X-ToqueHub-Timestamp': timestamp, 'X-ToqueHub-Nonce': nonce, 'X-ToqueHub-Signature': signature }, body, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Relais support indisponible (${response.status})`);
    const result: any = await response.json().catch(() => ({}));
    if (result.relayTicketId && payload.ticketId) await (this.prisma as any).humanSupportTicket.update({ where: { id: payload.ticketId }, data: { relayTicketId: result.relayTicketId, relayError: null } }).catch(() => undefined);
    return result;
  }

  private async identity() {
    const [instance, secret, relayInstance] = await Promise.all([this.setting(INSTANCE_ID_KEY, () => randomUUID()), this.setting(SECRET_KEY, () => randomBytes(32).toString('base64url')), this.setting(RELAY_INSTANCE_KEY, () => randomUUID())]);
    return { instanceId: instance, secret, relayInstanceId: relayInstance };
  }

  private async setting(key: string, create: () => string) {
    const existing = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (existing?.value) return existing.value;
    const value = create();
    try { return (await this.prisma.systemSetting.create({ data: { key, value } })).value; }
    catch { return (await this.prisma.systemSetting.findUnique({ where: { key } }))?.value || value; }
  }
}

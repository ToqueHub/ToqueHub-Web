import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HumanSupportDeliveryStatus, HumanSupportMessageAuthor, HumanSupportTicketStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { MobilePushService } from '../mobile/mobile-push.service';
import { SupportRelayClient } from './support-relay.client';

type Actor = { id: string; email: string; organizationId: string | null };
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const MIME_BY_EXTENSION: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic', '.pdf': 'application/pdf', '.txt': 'text/plain', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

@Injectable()
export class HumanSupportService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;
  private syncTimer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly relay: SupportRelayClient, private readonly push: MobilePushService) {}

  onModuleInit() { void this.cleanupExpired(); void this.syncRelay(); this.cleanupTimer = setInterval(() => void this.cleanupExpired(), 24 * 60 * 60 * 1000); this.cleanupTimer.unref?.(); this.syncTimer = setInterval(() => void this.syncRelay(), 15_000); this.syncTimer.unref?.(); }
  onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); if (this.syncTimer) clearInterval(this.syncTimer); }

  async active(actor: Actor) {
    const ticket = await (this.prisma as any).humanSupportTicket.findFirst({ where: { organizationId: this.org(actor), userId: actor.id, status: { in: [HumanSupportTicketStatus.OPEN, HumanSupportTicketStatus.IN_PROGRESS] } }, orderBy: { updatedAt: 'desc' }, include: this.include() });
    return ticket ? this.serialize(ticket) : null;
  }

  async unreadCount(actor: Actor) {
    const ticket = await (this.prisma as any).humanSupportTicket.findFirst({ where: { organizationId: this.org(actor), userId: actor.id, status: { in: [HumanSupportTicketStatus.OPEN, HumanSupportTicketStatus.IN_PROGRESS] } }, orderBy: { updatedAt: 'desc' } });
    if (!ticket) return { unread: 0 };
    const unread = await (this.prisma as any).humanSupportMessage.count({ where: { ticketId: ticket.id, author: HumanSupportMessageAuthor.VOLUNTEER, createdAt: { gt: ticket.lastReadAt || new Date(0) } } });
    return { unread };
  }

  async create(actor: Actor, input: { content: string; email: string; phone?: string; transcript?: string }, file?: any) {
    const organizationId = this.org(actor);
    const content = input.content?.trim();
    if (!content) throw new BadRequestException('Décrivez votre demande pour contacter un bénévole.');
    const existing = await (this.prisma as any).humanSupportTicket.findFirst({ where: { organizationId, userId: actor.id, status: { in: [HumanSupportTicketStatus.OPEN, HumanSupportTicketStatus.IN_PROGRESS] } } });
    if (existing) return this.get(actor, existing.id);
    await this.assertRateLimit(organizationId, actor.id);
    const ticket = await (this.prisma as any).humanSupportTicket.create({ data: { organizationId, userId: actor.id, contactEmail: input.email.trim().toLowerCase(), contactPhone: input.phone?.trim() || null, transcript: this.safeTranscript(input.transcript), messages: { create: { author: HumanSupportMessageAuthor.USER, content } } }, include: this.include() });
    const message = ticket.messages[0];
    if (file) await this.saveAttachment(ticket.id, message.id, file);
    const hydrated = await this.ticket(ticket.id);
    void this.relay.openTicket(hydrated).catch((error) => this.markRelayError(ticket.id, error));
    return this.serialize(hydrated);
  }

  async get(actor: Actor, id: string) { return this.serialize(await this.owned(actor, id)); }
  async messages(actor: Actor, id: string, after?: string) {
    await this.owned(actor, id);
    const parsedAfter = after ? new Date(after) : null;
    const rows = await (this.prisma as any).humanSupportMessage.findMany({ where: { ticketId: id, ...(parsedAfter && !Number.isNaN(parsedAfter.getTime()) ? { createdAt: { gt: parsedAfter } } : {}) }, orderBy: { createdAt: 'asc' }, include: { attachments: true } });
    return rows.map((message: any) => this.serializeMessage(message));
  }

  async send(actor: Actor, ticketId: string, content?: string, file?: any) {
    const ticket = await this.owned(actor, ticketId);
    if (ticket.status === HumanSupportTicketStatus.CLOSED) throw new BadRequestException('Cette discussion est fermée.');
    const text = content?.trim() || '';
    if (!text && !file) throw new BadRequestException('Ajoutez un message ou un fichier.');
    await this.assertRateLimit(this.org(actor), actor.id);
    const message = await (this.prisma as any).humanSupportMessage.create({ data: { ticketId, author: HumanSupportMessageAuthor.USER, content: text || 'Pièce jointe', deliveryStatus: HumanSupportDeliveryStatus.PENDING } });
    if (file) await this.saveAttachment(ticketId, message.id, file);
    const hydrated = await this.message(message.id);
    void this.relay.sendMessage(ticket, hydrated).catch((error) => this.markMessageFailed(message.id, error));
    return this.serializeMessage(hydrated);
  }

  async markRead(actor: Actor, id: string) { await this.owned(actor, id); await (this.prisma as any).humanSupportTicket.update({ where: { id }, data: { lastReadAt: new Date() } }); return { ok: true }; }

  async close(actor: Actor, id: string) {
    const ticket = await this.owned(actor, id);
    if (ticket.status === HumanSupportTicketStatus.CLOSED) return this.serialize(ticket);
    const closedAt = new Date();
    const updated = await (this.prisma as any).humanSupportTicket.update({ where: { id }, data: { status: HumanSupportTicketStatus.CLOSED, closedAt, expiresAt: new Date(closedAt.getTime() + 90 * 24 * 60 * 60 * 1000) }, include: this.include() });
    void this.relay.closeTicket(updated).catch((error) => this.markRelayError(id, error));
    return this.serialize(updated);
  }

  async attachmentForDownload(actor: Actor, attachmentId: string) {
    const attachment = await (this.prisma as any).humanSupportAttachment.findFirst({ where: { id: attachmentId }, include: { message: { include: { ticket: true } } } });
    if (!attachment || attachment.message.ticket.organizationId !== this.org(actor) || attachment.message.ticket.userId !== actor.id) throw new NotFoundException('Pièce jointe introuvable');
    if (!existsSync(attachment.storagePath)) throw new NotFoundException('Fichier indisponible');
    return attachment;
  }

  async acceptRelayEvent(event: any) {
    const ticket = await (this.prisma as any).humanSupportTicket.findFirst({ where: { relayTicketId: event.ticketId } });
    if (!ticket) return { ignored: true };
    if (event.type === 'ticket_status') {
      await (this.prisma as any).humanSupportTicket.update({ where: { id: ticket.id }, data: { status: event.status, assignedVolunteer: event.volunteerName || null, relayCursor: event.cursor || ticket.relayCursor } });
      return { ok: true };
    }
    if (event.type === 'ticket_closed') {
      await (this.prisma as any).humanSupportTicket.update({ where: { id: ticket.id }, data: { status: HumanSupportTicketStatus.CLOSED, closedAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000), relayCursor: event.cursor || ticket.relayCursor } });
      return { ok: true };
    }
    if (event.type === 'message' && event.messageId) {
      const present = await (this.prisma as any).humanSupportMessage.findFirst({ where: { relayMessageId: event.messageId } });
      if (present) return { duplicate: true };
      const message = await (this.prisma as any).humanSupportMessage.create({ data: { ticketId: ticket.id, author: HumanSupportMessageAuthor.VOLUNTEER, volunteerName: String(event.volunteerName || 'Bénévole').slice(0, 100), content: String(event.content || ''), relayMessageId: event.messageId, deliveryStatus: HumanSupportDeliveryStatus.SENT, metadata: event.metadata || null } });
      for (const attachment of event.attachments || []) await this.saveAttachment(ticket.id, message.id, { buffer: Buffer.from(String(attachment.contentBase64 || ''), 'base64'), originalname: attachment.filename, mimetype: attachment.mimeType, size: attachment.size });
      await (this.prisma as any).humanSupportTicket.update({ where: { id: ticket.id }, data: { status: HumanSupportTicketStatus.IN_PROGRESS, assignedVolunteer: event.volunteerName || ticket.assignedVolunteer, relayCursor: event.cursor || ticket.relayCursor } });
      void this.push.sendToUser(ticket.organizationId, ticket.userId, { title: 'Kokki · Bénévole', body: String(event.content || 'Vous avez reçu une réponse.'), data: { screen: 'kokki-human', ticketId: ticket.id } });
      return { ok: true, messageId: message.id };
    }
    return { ignored: true };
  }

  private include() { return { messages: { orderBy: { createdAt: 'asc' }, include: { attachments: true } } }; }
  private async ticket(id: string) { return (this.prisma as any).humanSupportTicket.findUniqueOrThrow({ where: { id }, include: this.include() }); }
  private async message(id: string) { return (this.prisma as any).humanSupportMessage.findUniqueOrThrow({ where: { id }, include: { attachments: true } }); }
  private async owned(actor: Actor, id: string) { const ticket = await (this.prisma as any).humanSupportTicket.findFirst({ where: { id, organizationId: this.org(actor), userId: actor.id }, include: this.include() }); if (!ticket) throw new NotFoundException('Discussion humaine introuvable'); return ticket; }
  private org(actor: Actor) { if (!actor.organizationId) throw new BadRequestException('Organisation requise'); return actor.organizationId; }
  private safeTranscript(value?: string) { return String(value || 'Aucun historique IA disponible.').slice(0, 500_000); }

  private async assertRateLimit(organizationId: string, userId: string) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recent = await (this.prisma as any).humanSupportMessage.count({ where: { author: HumanSupportMessageAuthor.USER, createdAt: { gte: tenMinutesAgo }, ticket: { organizationId, userId } } });
    if (recent >= 30) throw new HttpException('Vous avez envoyé trop de messages. Réessayez dans quelques minutes.', HttpStatus.TOO_MANY_REQUESTS);
  }

  private async saveAttachment(ticketId: string, messageId: string, file: any) {
    if (!file?.buffer || !file?.originalname) throw new BadRequestException('Fichier invalide');
    if (Number(file.size || file.buffer.length) > MAX_FILE_SIZE) throw new BadRequestException('Le fichier dépasse 20 Mo.');
    const daily = await (this.prisma as any).humanSupportAttachment.aggregate({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, _sum: { size: true } });
    if (Number(daily?._sum?.size || 0) + Number(file.size || file.buffer.length) > 100 * 1024 * 1024) throw new HttpException('La limite quotidienne de fichiers support est atteinte.', HttpStatus.TOO_MANY_REQUESTS);
    const extension = extname(file.originalname).toLowerCase();
    const expected = MIME_BY_EXTENSION[extension];
    const declared = String(file.mimetype || '').toLowerCase();
    if (!expected || !SUPPORTED_TYPES.has(expected) || (declared && declared !== expected && !(expected === 'image/heic' && declared === 'image/heif'))) throw new BadRequestException('Type de fichier non autorisé.');
    if (!this.looksLike(file.buffer, expected)) throw new BadRequestException('Le contenu du fichier ne correspond pas à son type.');
    const root = resolve(process.env.HUMAN_SUPPORT_UPLOAD_DIR || join(process.env.UPLOAD_DIR || 'uploads', 'human-support'));
    const dir = join(root, ticketId); mkdirSync(dir, { recursive: true });
    const stored = `${randomUUID()}${extension}`; const storagePath = join(dir, stored); writeFileSync(storagePath, file.buffer);
    await (this.prisma as any).humanSupportAttachment.create({ data: { messageId, filename: basename(file.originalname).replace(/[\\/\0]/g, '_').slice(0, 180), mimeType: expected, size: Number(file.size || file.buffer.length), storagePath } });
  }

  private looksLike(buffer: Buffer, mime: string) {
    if (mime === 'image/jpeg') return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mime === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
    if (mime === 'text/plain') return !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0);
    if (mime === 'image/heic') return buffer.subarray(4, 12).toString().includes('ftyp');
    if (mime.includes('openxmlformats')) return buffer.subarray(0, 2).equals(Buffer.from([0x50, 0x4b]));
    return false;
  }
  private async markRelayError(ticketId: string, error: unknown) { await (this.prisma as any).humanSupportTicket.update({ where: { id: ticketId }, data: { relayError: String(error instanceof Error ? error.message : error).slice(0, 2000) } }).catch(() => undefined); }
  private async markMessageFailed(messageId: string, error: unknown) { await (this.prisma as any).humanSupportMessage.update({ where: { id: messageId }, data: { deliveryStatus: HumanSupportDeliveryStatus.FAILED, deliveryError: String(error instanceof Error ? error.message : error).slice(0, 2000) } }).catch(() => undefined); }
  private serialize(ticket: any) { return { ...ticket, messages: ticket.messages?.map((message: any) => this.serializeMessage(message)) || [] }; }
  private serializeMessage(message: any) { return { ...message, attachments: message.attachments?.map((attachment: any) => ({ id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, createdAt: attachment.createdAt })) || [] }; }
  private async cleanupExpired() {
    const expired = await (this.prisma as any).humanSupportTicket.findMany({ where: { expiresAt: { lte: new Date() } }, include: { messages: { include: { attachments: true } } } });
    for (const ticket of expired) { for (const message of ticket.messages) for (const attachment of message.attachments) { try { rmSync(attachment.storagePath, { force: true }); } catch {} } await (this.prisma as any).humanSupportTicket.delete({ where: { id: ticket.id } }); }
  }
  private async syncRelay() { try { await this.retryOutbound(); const acknowledgements: string[] = []; for (const envelope of await this.relay.pullEvents()) { await this.acceptRelayEvent(envelope.payload); if (envelope.id) acknowledgements.push(String(envelope.id)); } await this.relay.acknowledgeEvents(acknowledgements); } catch { /* Le relais est externe : les envois locaux restent disponibles hors ligne. */ } }
  private async retryOutbound() {
    const tickets = await (this.prisma as any).humanSupportTicket.findMany({ where: { OR: [{ status: { in: [HumanSupportTicketStatus.OPEN, HumanSupportTicketStatus.IN_PROGRESS] } }, { status: HumanSupportTicketStatus.CLOSED, relayError: { not: null } }] }, include: this.include(), orderBy: { updatedAt: 'asc' }, take: 50 });
    for (const ticket of tickets) {
      try {
        if (ticket.status === HumanSupportTicketStatus.CLOSED) { if (ticket.relayTicketId) await this.relay.closeTicket(ticket); continue; }
        if (!ticket.relayTicketId) { await this.relay.openTicket(ticket); continue; }
        for (const message of ticket.messages.filter((item: any) => item.author === HumanSupportMessageAuthor.USER && [HumanSupportDeliveryStatus.PENDING, HumanSupportDeliveryStatus.FAILED].includes(item.deliveryStatus))) await this.relay.sendMessage(ticket, message);
      } catch (error) { await this.markRelayError(ticket.id, error); break; }
    }
  }
}

import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { RelayPrismaService } from './prisma.service';

@Injectable()
export class RelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RelayService.name);
  private cleanupTimer?: NodeJS.Timeout;
  constructor(private readonly prisma: RelayPrismaService) {}
  onModuleInit() { void this.cleanup(); void this.configureTelegramWebhook(); this.cleanupTimer = setInterval(() => void this.cleanup(), 24 * 60 * 60 * 1000); this.cleanupTimer.unref?.(); }
  onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }

  async enroll(headers: Record<string, string | undefined>, body: any) { const installation = await this.installation(headers, body); return { installationId: installation.id, status: 'registered' }; }
  async installations(adminToken?: string) { this.assertAdmin(adminToken); return this.prisma.supportRelayInstallation.findMany({ select: { id: true, instanceId: true, blockedAt: true, createdAt: true, updatedAt: true, _count: { select: { tickets: true } } }, orderBy: { createdAt: 'desc' }, take: 500 }); }
  async setInstallationBlocked(instanceId: string, blocked: boolean, adminToken?: string) { this.assertAdmin(adminToken); return this.prisma.supportRelayInstallation.update({ where: { instanceId }, data: { blockedAt: blocked ? new Date() : null }, select: { instanceId: true, blockedAt: true } }); }

  async open(headers: Record<string, string | undefined>, body: any) {
    const installation = await this.installation(headers, body);
    await this.assertQuota(installation.id, body.message);
    const localTicketId = String(body.ticketId || ''); if (!localTicketId) throw new ForbiddenException('Ticket manquant');
    const present = await this.prisma.supportRelayTicket.findUnique({ where: { installationId_localTicketId: { installationId: installation.id, localTicketId } } });
    if (present) return { relayTicketId: present.id };
    const topic = await this.telegram('createForumTopic', { chat_id: this.chatId(), name: this.topicName(body) });
    const ticket = await this.prisma.supportRelayTicket.create({ data: { installationId: installation.id, localTicketId, telegramTopicId: String(topic.message_thread_id), payload: this.ticketPayload(body), expiresAt: null } });
    await this.telegramMessage(ticket, this.openingText(body), [[{ text: 'Prendre en charge', callback_data: `take:${ticket.id}` }, { text: 'Reprendre', callback_data: `takeover:${ticket.id}` }, { text: 'Fermer', callback_data: `close:${ticket.id}` }]]);
    await this.telegramTextDocument(ticket, body.transcript);
    // Le message initial est déjà inclus dans openingText. On l'enregistre donc sans
    // le republier, tout en transférant ses éventuelles pièces jointes.
    if (body.message) await this.storeOutbound(ticket.id, body.message, false);
    return { relayTicketId: ticket.id };
  }

  async message(headers: Record<string, string | undefined>, relayTicketId: string, body: any) {
    const installation = await this.installation(headers, body); await this.assertQuota(installation.id, body.message); const ticket = await this.prisma.supportRelayTicket.findFirst({ where: { id: relayTicketId, installationId: installation.id } });
    if (!ticket) throw new ForbiddenException('Ticket introuvable'); if (ticket.status === 'CLOSED') throw new ForbiddenException('Ticket fermé');
    await this.storeOutbound(ticket.id, body.message); return { ok: true };
  }

  async close(headers: Record<string, string | undefined>, relayTicketId: string, body: any) {
    const installation = await this.installation(headers, body); const ticket = await this.prisma.supportRelayTicket.findFirst({ where: { id: relayTicketId, installationId: installation.id } }); if (!ticket) throw new ForbiddenException('Ticket introuvable');
    await this.closeTicket(ticket, 'Utilisateur'); return { ok: true };
  }

  async pull(headers: Record<string, string | undefined>, body: any) {
    const installation = await this.installation(headers, body); const events = await this.prisma.supportRelayEvent.findMany({ where: { deliveredAt: null, ticket: { installationId: installation.id } }, orderBy: { createdAt: 'asc' }, take: 100 });
    return { events: events.map((event) => ({ id: event.id, payload: event.payload })) };
  }
  async acknowledge(headers: Record<string, string | undefined>, body: any) { const installation = await this.installation(headers, body); const ids = Array.isArray(body.eventIds) ? body.eventIds.map(String).slice(0, 100) : []; if (ids.length) await this.prisma.supportRelayEvent.updateMany({ where: { id: { in: ids }, ticket: { installationId: installation.id } }, data: { deliveredAt: new Date() } }); return { ok: true }; }

  async telegramUpdate(update: any, secret?: string) {
    if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) throw new UnauthorizedException();
    if (update.callback_query) return this.callback(update.callback_query);
    const message = update.message;
    if (!message) return { ignored: true };
    const text = String(message.text || '').trim();
    const command = text.split(/\s+/, 1)[0].split('@', 1)[0].toLowerCase();
    if (message.chat?.type === 'private' && command === '/whoami') {
      await this.telegram('sendMessage', { chat_id: message.chat.id, text: `Votre identifiant Telegram : ${message.from?.id}` });
      return { ok: true };
    }
    if ((message.chat?.type === 'group' || message.chat?.type === 'supergroup') && text.toLowerCase().startsWith('/chatid')) {
      await this.telegram('sendMessage', { chat_id: message.chat.id, ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}), text: `Identifiant du groupe : ${message.chat.id}` });
      return { ok: true };
    }
    if (!process.env.TELEGRAM_SUPPORT_CHAT_ID && (message.chat?.type === 'group' || message.chat?.type === 'supergroup')) this.logger.log(`Groupe Telegram en attente de configuration : ${message.chat.id}`);
    if (String(message.chat?.id) !== this.chatId() || !message.message_thread_id) return { ignored: true };
    const ticket = await this.prisma.supportRelayTicket.findFirst({ where: { telegramTopicId: String(message.message_thread_id), status: { not: 'CLOSED' } }, include: { installation: true } }); if (!ticket || !this.isOperator(message.from?.id)) return { ignored: true };
    if (ticket.assignedTelegramId !== String(message.from.id)) return { ignored: true };
    const content = String(message.text || message.caption || '').trim(); const attachments = await this.incomingAttachments(message); if (!content && !attachments.length) return { ignored: true };
    await this.prisma.supportRelayMessage.upsert({ where: { ticketId_telegramMessageId: { ticketId: ticket.id, telegramMessageId: String(message.message_id) } }, create: { ticketId: ticket.id, telegramMessageId: String(message.message_id), author: 'VOLUNTEER', content }, update: {} });
    await this.event(ticket.id, `telegram:${message.message_id}`, { type: 'message', ticketId: ticket.id, messageId: `telegram:${message.message_id}`, volunteerName: this.name(message.from), content: content || 'Pièce jointe', attachments });
    return { ok: true };
  }

  private async callback(query: any) {
    if (!this.isOperator(query.from?.id)) return { ignored: true }; const [action, id] = String(query.data || '').split(':'); const ticket = await this.prisma.supportRelayTicket.findUnique({ where: { id }, include: { installation: true } }); if (!ticket) return { ignored: true };
    if (action === 'take' || action === 'takeover') { const volunteerName = this.name(query.from); await this.prisma.supportRelayTicket.update({ where: { id }, data: { status: 'IN_PROGRESS', assignedTelegramId: String(query.from.id), assignedVolunteer: volunteerName } }); await this.event(id, `${action}:${query.id}`, { type: 'ticket_status', ticketId: id, status: 'IN_PROGRESS', volunteerName }); await this.telegramMessage(ticket, action === 'takeover' ? `🔄 ${volunteerName} a repris la demande.` : `✅ ${volunteerName} a pris la demande en charge.`); await this.telegram('answerCallbackQuery', { callback_query_id: query.id, text: action === 'takeover' ? 'Ticket repris' : 'Ticket pris en charge', show_alert: false }); return { ok: true }; }
    if (action === 'close') { await this.closeTicket(ticket, this.name(query.from)); await this.telegram('answerCallbackQuery', { callback_query_id: query.id, text: 'Ticket fermé' }); return { ok: true }; }
    return { ignored: true };
  }

  private async closeTicket(ticket: any, actor: string) { if (ticket.status === 'CLOSED') return; await this.prisma.supportRelayTicket.update({ where: { id: ticket.id }, data: { status: 'CLOSED', closedAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000) } }); await this.event(ticket.id, `closed:${ticket.id}`, { type: 'ticket_closed', ticketId: ticket.id, actor }); if (ticket.telegramTopicId) { await this.telegramMessage(ticket, `✅ Demande fermée par ${actor}.`).catch(() => undefined); await this.telegram('closeForumTopic', { chat_id: this.chatId(), message_thread_id: Number(ticket.telegramTopicId) }).catch(() => undefined); } }
  private async storeOutbound(ticketId: string, message: any, publishText = true) { if (!message?.id) return; const existing = await this.prisma.supportRelayMessage.findFirst({ where: { ticketId, localMessageId: String(message.id) } }); if (existing) return; await this.prisma.supportRelayMessage.create({ data: { ticketId, localMessageId: String(message.id), author: 'USER', content: String(message.content || ''), payload: message } }); const ticket = await this.prisma.supportRelayTicket.findUniqueOrThrow({ where: { id: ticketId } }); if (publishText && message.content) await this.telegramMessage(ticket, String(message.content)); for (const file of message.attachments || []) await this.telegramFile(ticket, file); }
  private async event(ticketId: string, eventKey: string, payload: any) { await this.prisma.supportRelayEvent.upsert({ where: { eventKey }, create: { ticketId, eventKey, payload }, update: {} }); }
  private async installation(headers: Record<string, string | undefined>, body: any) { const instanceId = headers['x-toquehub-instance']; const timestamp = headers['x-toquehub-timestamp']; const nonce = headers['x-toquehub-nonce']; const signature = headers['x-toquehub-signature']; if (!instanceId || !timestamp || !nonce || !signature || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) throw new UnauthorizedException('Signature requise'); let installation = await this.prisma.supportRelayInstallation.findUnique({ where: { instanceId } }); if (!installation) { const secret = String(body.enrollmentSecret || ''); if (secret.length < 32) throw new UnauthorizedException('Inscription invalide'); installation = await this.prisma.supportRelayInstallation.create({ data: { instanceId, secret } }); } if (installation.blockedAt) throw new ForbiddenException('Installation bloquée'); const raw = JSON.stringify(body); const expected = createHmac('sha256', installation.secret).update(`${timestamp}.${nonce}.${raw}`).digest('hex'); if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new UnauthorizedException('Signature invalide'); try { await this.prisma.supportRelayNonce.create({ data: { installationId: installation.id, nonce, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } }); } catch { throw new UnauthorizedException('Requête déjà reçue'); } return installation; }
  private async telegramMessage(ticket: any, text: string, inline_keyboard?: any[][]) { return this.telegram('sendMessage', { chat_id: this.chatId(), message_thread_id: Number(ticket.telegramTopicId), text: text.slice(0, 4000), ...(inline_keyboard ? { reply_markup: { inline_keyboard } } : {}) }); }
  private async telegramTextDocument(ticket: any, transcript: unknown) { const content = String(transcript || '').trim(); if (!content) return; const body = new FormData(); body.append('chat_id', this.chatId()); body.append('message_thread_id', String(ticket.telegramTopicId)); body.append('caption', 'Historique complet de la conversation Kokki'); body.append('document', new Blob([content], { type: 'text/plain;charset=utf-8' }), 'historique-kokki.txt'); const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) throw new Error('TELEGRAM_BOT_TOKEN absent'); const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body }); const result: any = await response.json().catch(() => ({})); if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${response.status}`); }
  private async telegramFile(ticket: any, file: any) { if (!file?.contentBase64 || Number(file.size || 0) > 20 * 1024 * 1024) throw new Error('Pièce jointe support invalide'); const body = new FormData(); body.append('chat_id', this.chatId()); body.append('message_thread_id', String(ticket.telegramTopicId)); body.append('document', new Blob([Buffer.from(String(file.contentBase64), 'base64')], { type: String(file.mimeType || 'application/octet-stream') }), String(file.filename || 'piece-jointe')); const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) throw new Error('TELEGRAM_BOT_TOKEN absent'); const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body }); const result: any = await response.json().catch(() => ({})); if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${response.status}`); return result.result; }
  private async incomingAttachments(message: any) { const source = message.document || (Array.isArray(message.photo) ? message.photo.at(-1) : null); if (!source?.file_id || Number(source.file_size || 0) > 20 * 1024 * 1024) return []; const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) return []; const info: any = await this.telegram('getFile', { file_id: source.file_id }); if (!info?.file_path) return []; const response = await fetch(`https://api.telegram.org/file/bot${token}/${info.file_path}`); if (!response.ok) return []; const bytes = Buffer.from(await response.arrayBuffer()); const filename = String(message.document?.file_name || `photo-${message.message_id}.jpg`); const mimeType = String(message.document?.mime_type || (message.photo ? 'image/jpeg' : 'application/octet-stream')); return [{ filename, mimeType, size: bytes.length, contentBase64: bytes.toString('base64') }]; }
  private async telegram(method: string, payload: any) { const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) throw new Error('TELEGRAM_BOT_TOKEN absent'); const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const body: any = await response.json().catch(() => ({})); if (!response.ok || !body.ok) throw new Error(body.description || `Telegram ${response.status}`); return body.result; }
  private async configureTelegramWebhook() {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET) return;
    const url = process.env.TELEGRAM_WEBHOOK_URL || 'https://toquehub-support-relay.fly.dev/v1/telegram/webhook';
    try {
      await this.telegram('setWebhook', { url, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'] });
      this.logger.log(`Webhook Telegram configuré vers ${url}`);
    } catch (error) {
      this.logger.error(`Impossible de configurer le webhook Telegram : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private chatId() { const id = process.env.TELEGRAM_SUPPORT_CHAT_ID; if (!id) throw new Error('TELEGRAM_SUPPORT_CHAT_ID absent'); return id; }
  private isOperator(id: unknown) { return (process.env.TELEGRAM_OPERATOR_IDS || '').split(',').map((value) => value.trim()).filter(Boolean).includes(String(id)); }
  private assertAdmin(token?: string) { const expected = process.env.SUPPORT_RELAY_ADMIN_TOKEN; if (!expected || !token || expected.length !== token.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(token))) throw new UnauthorizedException('Accès administrateur requis'); }
  private name(user: any) { return String(user?.first_name || user?.username || 'Bénévole').slice(0, 100); }
  private topicName(body: any) { const establishment = String(body.organizationName || body.contactEmail || 'Établissement').replace(/\s+/g, ' ').trim(); const summary = String(body.message?.content || 'Demande de support').replace(/\s+/g, ' ').trim(); return `${establishment.slice(0, 58)} · ${summary.slice(0, 62)}`.slice(0, 128); }
  private openingText(body: any) { return [`Nouvelle demande Kokki`, `Établissement : ${body.organizationName || 'Non renseigné'}`, `Email : ${body.contactEmail}`, body.contactPhone ? `Téléphone : ${body.contactPhone}` : null, '', `Message :\n${body.message?.content || ''}`, '', 'L’historique complet Kokki est joint au sujet.'].filter((value) => value !== null).join('\n'); }
  private ticketPayload(body: any) { return { organizationId: body.organizationId, organizationName: body.organizationName || null, userId: body.userId, contactEmail: body.contactEmail, contactPhone: body.contactPhone || null }; }
  private async assertQuota(installationId: string, message: any) { const recent = await this.prisma.supportRelayMessage.count({ where: { author: 'USER', createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, ticket: { installationId } } }); if (recent >= 30) throw new ForbiddenException('Limite de messages support atteinte.'); const rows = await this.prisma.supportRelayMessage.findMany({ where: { author: 'USER', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, ticket: { installationId } }, select: { payload: true } }); const used = rows.reduce((total, row: any) => total + (Array.isArray(row.payload?.attachments) ? row.payload.attachments.reduce((sum: number, file: any) => sum + Number(file.size || 0), 0) : 0), 0); const next = Array.isArray(message?.attachments) ? message.attachments.reduce((sum: number, file: any) => sum + Number(file.size || 0), 0) : 0; if (used + next > 100 * 1024 * 1024) throw new ForbiddenException('Limite quotidienne de fichiers support atteinte.'); }
  private async cleanup() { const now = new Date(); const expired = await this.prisma.supportRelayTicket.findMany({ where: { expiresAt: { lte: now } } }); for (const ticket of expired) { if (ticket.telegramTopicId) await this.telegram('deleteForumTopic', { chat_id: this.chatId(), message_thread_id: Number(ticket.telegramTopicId) }).catch(() => undefined); await this.prisma.supportRelayTicket.delete({ where: { id: ticket.id } }); } await this.prisma.supportRelayNonce.deleteMany({ where: { expiresAt: { lte: now } } }); }
}

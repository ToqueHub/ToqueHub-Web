import { HumanSupportService } from './human-support.service';

describe('HumanSupportService', () => {
  const actor = { id: 'user-1', email: 'user@example.test', organizationId: 'org-1' };
  const relay = { openTicket: jest.fn(), sendMessage: jest.fn(), closeTicket: jest.fn(), pullEvents: jest.fn().mockResolvedValue([]) };
  function service(prisma: any) { return new HumanSupportService(prisma, relay as any); }

  it('refuses an empty initial request', async () => {
    const prisma: any = { humanSupportTicket: { findFirst: jest.fn() } };
    await expect(service(prisma).create(actor, { content: ' ', email: actor.email })).rejects.toThrow('Décrivez votre demande');
  });

  it('does not create a second open ticket', async () => {
    const existing = { id: 'ticket-1' };
    const hydrated = { ...existing, organizationId: 'org-1', userId: 'user-1', messages: [] };
    const prisma: any = { humanSupportTicket: { findFirst: jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(hydrated) } };
    const result = await service(prisma).create(actor, { content: 'Aide', email: actor.email });
    expect(result.id).toBe('ticket-1');
  });

  it('rejects another user reading a ticket', async () => {
    const prisma: any = { humanSupportTicket: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(service(prisma).get(actor, 'missing')).rejects.toThrow('Discussion humaine introuvable');
  });

  it('retries a failed outbound user message after the relay becomes reachable', async () => {
    const failedMessage = { id: 'message-1', author: 'USER', deliveryStatus: 'FAILED', attachments: [] };
    const prisma: any = { humanSupportTicket: { findMany: jest.fn().mockResolvedValue([{ id: 'ticket-1', relayTicketId: 'relay-1', status: 'OPEN', messages: [failedMessage] }]) } };
    relay.sendMessage.mockResolvedValue({ ok: true });
    await (service(prisma) as any).retryOutbound();
    expect(relay.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'ticket-1' }), failedMessage);
  });
});

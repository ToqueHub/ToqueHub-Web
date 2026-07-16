import { RelayService } from './relay.service';
import { createHmac } from 'node:crypto';

describe('RelayService', () => {
  const ticket = { id: 'relay-ticket', installationId: 'installation-1', telegramTopicId: '99', status: 'OPEN', assignedTelegramId: null, assignedVolunteer: null, installation: { id: 'installation-1' } };
  const prisma: any = {
    supportRelayTicket: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    supportRelayEvent: { upsert: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    supportRelayInstallation: { findUnique: jest.fn(), create: jest.fn() },
    supportRelayNonce: { create: jest.fn(), deleteMany: jest.fn() },
    supportRelayMessage: { upsert: jest.fn(), count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  };
  const service = () => new RelayService(prisma);

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.TELEGRAM_OPERATOR_IDS = '111,222';
    process.env.TELEGRAM_SUPPORT_CHAT_ID = '-100123';
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'hook-secret';
    (global.fetch as any) = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: {} }) });
  });

  it('rejects a Telegram callback from an unapproved operator', async () => {
    await expect(service().telegramUpdate({ callback_query: { from: { id: 999 }, data: 'take:relay-ticket' } }, 'hook-secret')).resolves.toEqual({ ignored: true });
    expect(prisma.supportRelayTicket.findUnique).not.toHaveBeenCalled();
  });

  it('assigns the volunteer through the take action and emits an idempotent event', async () => {
    prisma.supportRelayTicket.findUnique.mockResolvedValue(ticket);
    await expect(service().telegramUpdate({ callback_query: { id: 'callback-1', from: { id: 111, first_name: 'Paul' }, data: 'take:relay-ticket' } }, 'hook-secret')).resolves.toEqual({ ok: true });
    expect(prisma.supportRelayTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assignedTelegramId: '111', assignedVolunteer: 'Paul', status: 'IN_PROGRESS' }) }));
    expect(prisma.supportRelayEvent.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { eventKey: 'take:callback-1' } }));
  });

  it('only forwards a Telegram message from the assigned volunteer', async () => {
    prisma.supportRelayTicket.findFirst.mockResolvedValue({ ...ticket, status: 'IN_PROGRESS', assignedTelegramId: '111' });
    await expect(service().telegramUpdate({ message: { chat: { id: -100123 }, message_thread_id: 99, message_id: 77, from: { id: 111, first_name: 'Paul' }, text: 'Je regarde.' } }, 'hook-secret')).resolves.toEqual({ ok: true });
    expect(prisma.supportRelayMessage.upsert).toHaveBeenCalled();
    expect(prisma.supportRelayEvent.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { eventKey: 'telegram:77' } }));
  });

  it('returns the group id when the command explicitly names the bot', async () => {
    await expect(service().telegramUpdate({ message: { chat: { id: -100987, type: 'supergroup' }, message_id: 44, text: '/chatid@kokkihelpbot' } }, 'hook-secret')).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/sendMessage'), expect.objectContaining({ body: expect.stringContaining('-100987') }));
  });

  it('publishes the initial request once and preserves its attachments', async () => {
    const body = {
      ticketId: 'local-ticket', organizationId: 'org-1', userId: 'user-1', contactEmail: 'user@example.test', transcript: 'Historique Kokki',
      message: { id: 'first-message', content: 'Je ne trouve pas mon stock.', attachments: [] },
    };
    const timestamp = String(Date.now()); const nonce = 'nonce-open'; const secret = 'installation-secret';
    const signature = createHmac('sha256', secret).update(`${timestamp}.${nonce}.${JSON.stringify(body)}`).digest('hex');
    prisma.supportRelayInstallation.findUnique.mockResolvedValue({ id: 'installation-1', secret, blockedAt: null });
    prisma.supportRelayTicket.findUnique.mockResolvedValue(null);
    prisma.supportRelayTicket.create.mockResolvedValue(ticket);
    prisma.supportRelayTicket.findUniqueOrThrow.mockResolvedValue(ticket);
    prisma.supportRelayMessage.findFirst.mockResolvedValue(null);
    prisma.supportRelayMessage.count.mockResolvedValue(0);
    prisma.supportRelayMessage.findMany.mockResolvedValue([]);

    await expect(service().open({ 'x-toquehub-instance': 'instance-1', 'x-toquehub-timestamp': timestamp, 'x-toquehub-nonce': nonce, 'x-toquehub-signature': signature }, body)).resolves.toEqual({ relayTicketId: 'relay-ticket' });

    const sendMessages = (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).endsWith('/sendMessage'));
    expect(sendMessages).toHaveLength(1);
    expect(JSON.parse(sendMessages[0][1].body).text).toContain('Je ne trouve pas mon stock.');
    expect((global.fetch as jest.Mock).mock.calls.some(([url]) => String(url).endsWith('/sendDocument'))).toBe(true);
  });
});

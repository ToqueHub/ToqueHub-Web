jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

import nodemailer from 'nodemailer';
import { PurchasingEmailConnectionService } from './purchasing-email-connection.service';

const smtpConnection = {
  id: 'connection-1',
  organizationId: 'org-1',
  provider: 'SMTP',
  status: 'CONNECTED',
  senderEmail: 'achats@restaurant.example',
  senderName: 'Le Bistrot — Achats',
  smtpHost: 'smtp.restaurant.example',
  smtpPort: 465,
  smtpSecure: true,
  smtpUsername: 'achats@restaurant.example',
  secretCiphertext: 'encrypted-password',
  oauthRefreshToken: null,
  oauthAccountId: null,
  lastTestedAt: null,
  lastError: null,
};

function harness() {
  const prisma = {
    purchasingEmailConnection: {
      findUnique: jest.fn().mockResolvedValue(smtpConnection),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...smtpConnection, ...data })),
    },
    purchasingSettings: { findUnique: jest.fn().mockResolvedValue({ activeEmailProvider: 'SMTP' }) },
  };
  const crypto = { encrypt: jest.fn((value: string) => `encrypted:${value}`), decrypt: jest.fn(() => 'app-password') };
  const resend = { getResendSecret: jest.fn() };
  return { prisma, crypto, service: new PurchasingEmailConnectionService(prisma as never, crypto as never, resend as never) };
}

describe('PurchasingEmailConnectionService SMTP', () => {
  afterEach(() => jest.clearAllMocks());

  it('tests the SMTP mailbox over TLS and sends the verification email to the connected address', async () => {
    const transport = { verify: jest.fn().mockResolvedValue(undefined), sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-test-1' }) };
    (nodemailer.createTransport as jest.Mock).mockReturnValue(transport);
    const { service } = harness();

    await service.test('org-1', 'SMTP' as never);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.restaurant.example', port: 465, secure: true,
      auth: { user: 'achats@restaurant.example', pass: 'app-password' },
      tls: { minVersion: 'TLSv1.2' },
    }));
    expect(transport.verify).toHaveBeenCalledTimes(1);
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Le Bistrot — Achats <achats@restaurant.example>',
      to: 'achats@restaurant.example',
      subject: 'Test ToqueHub Achats',
    }));
  });

  it('sends the supplier order with its PDF through the active SMTP connection', async () => {
    const transport = { verify: jest.fn(), sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-order-1' }) };
    (nodemailer.createTransport as jest.Mock).mockReturnValue(transport);
    const { service } = harness();

    const result = await service.send({
      organizationId: 'org-1', recipient: 'commandes@fournisseur.example', subject: 'Commande CA-42',
      text: 'Bonjour, votre commande est en pièce jointe.', pdf: Buffer.from('pdf-content'), filename: 'CA-42.pdf',
    });

    expect(result).toEqual(expect.objectContaining({ provider: 'SMTP', messageId: 'smtp-order-1', fromEmail: 'achats@restaurant.example' }));
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'commandes@fournisseur.example', subject: 'Commande CA-42',
      attachments: [expect.objectContaining({ filename: 'CA-42.pdf', content: Buffer.from('pdf-content') })],
    }));
  });
});

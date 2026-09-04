import { PurchasingMailCryptoService } from './purchasing-mail-crypto.service';

describe('PurchasingMailCryptoService', () => {
  const previousEmailKey = process.env.PURCHASING_EMAIL_ENCRYPTION_KEY;
  const previousResendKey = process.env.PURCHASING_RESEND_ENCRYPTION_KEY;

  afterEach(() => {
    if (previousEmailKey === undefined) delete process.env.PURCHASING_EMAIL_ENCRYPTION_KEY;
    else process.env.PURCHASING_EMAIL_ENCRYPTION_KEY = previousEmailKey;
    if (previousResendKey === undefined) delete process.env.PURCHASING_RESEND_ENCRYPTION_KEY;
    else process.env.PURCHASING_RESEND_ENCRYPTION_KEY = previousResendKey;
  });

  it('encrypts and decrypts an SMTP password with an installation key', () => {
    process.env.PURCHASING_EMAIL_ENCRYPTION_KEY = 'email-key-with-at-least-32-random-characters';
    delete process.env.PURCHASING_RESEND_ENCRYPTION_KEY;
    const crypto = new PurchasingMailCryptoService();

    const encrypted = crypto.encrypt('smtp-password');

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('smtp-password');
    expect(crypto.decrypt(encrypted)).toBe('smtp-password');
  });

  it('rejects a public installation placeholder', () => {
    process.env.PURCHASING_EMAIL_ENCRYPTION_KEY =
      'replace-with-a-32-byte-minimum-random-secret';
    delete process.env.PURCHASING_RESEND_ENCRYPTION_KEY;

    expect(() => new PurchasingMailCryptoService().encrypt('smtp-password')).toThrow(
      'PURCHASING_EMAIL_ENCRYPTION_KEY',
    );
  });
});

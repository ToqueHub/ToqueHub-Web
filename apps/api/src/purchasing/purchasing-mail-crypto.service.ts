import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class PurchasingMailCryptoService {
  private key?: Buffer;

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(payload?: string | null) {
    if (!payload) return null;
    const [version, iv, tag, ciphertext] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || !ciphertext)
      throw new InternalServerErrorException('Secret e-mail invalide.');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  private encryptionKey() {
    if (this.key) return this.key;
    const raw = process.env.PURCHASING_EMAIL_ENCRYPTION_KEY?.trim() || process.env.PURCHASING_RESEND_ENCRYPTION_KEY?.trim();
    if (!raw || raw.length < 32)
      throw new BadRequestException('PURCHASING_EMAIL_ENCRYPTION_KEY (32 caractères minimum) est requis pour connecter une messagerie.');
    this.key = createHash('sha256').update(raw).digest();
    return this.key;
  }
}

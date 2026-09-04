import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class BackupCloudCryptoService {
  private key?: Buffer;

  encrypt(value: string) {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(payload?: string | null) {
    if (!payload) return null;
    const [version, iv, tag, ciphertext] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || !ciphertext) {
      throw new InternalServerErrorException('Secret cloud invalide.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  assertConfigured() {
    this.encryptionKey();
  }

  private encryptionKey() {
    if (this.key) return this.key;
    const raw = process.env.BACKUP_CLOUD_ENCRYPTION_KEY?.trim();
    if (!raw) throw new BadRequestException('BACKUP_CLOUD_ENCRYPTION_KEY est requis pour configurer la sauvegarde cloud.');
    if (raw.length < 32) throw new BadRequestException('BACKUP_CLOUD_ENCRYPTION_KEY doit contenir au moins 32 caractères.');
    this.key = createHash('sha256').update(raw).digest();
    return this.key;
  }
}

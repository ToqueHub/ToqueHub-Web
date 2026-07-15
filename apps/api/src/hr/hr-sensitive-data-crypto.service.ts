import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class HrSensitiveDataCryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(payload?: string | null) {
    if (!payload) return undefined;
    const [version, iv, tag, ciphertext] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || !ciphertext) throw new BadRequestException('Donnée RH sensible illisible.');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  private key() {
    const dedicatedKey = this.config.get<string>('HR_SENSITIVE_DATA_ENCRYPTION_KEY')?.trim();
    const jwtFallback = this.config.get<string>('JWT_SECRET')?.trim();
    const raw = dedicatedKey || jwtFallback;
    if (!raw) throw new BadRequestException('HR_SENSITIVE_DATA_ENCRYPTION_KEY doit être configuré pour enregistrer les identifiants personnels.');
    if (dedicatedKey && dedicatedKey.length < 32) {
      throw new BadRequestException('HR_SENSITIVE_DATA_ENCRYPTION_KEY doit contenir au moins 32 caractères.');
    }
    if (this.config.get<string>('NODE_ENV') === 'production' && !dedicatedKey) {
      throw new BadRequestException('HR_SENSITIVE_DATA_ENCRYPTION_KEY est requis en production pour enregistrer les identifiants personnels.');
    }
    return createHash('sha256').update(raw).digest();
  }
}

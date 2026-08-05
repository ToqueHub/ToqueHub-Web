import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const CIPHER_VERSION = 1;
const CIPHER_PREFIX = `v${CIPHER_VERSION}`;

@Injectable()
export class FennoaSecretService {
  constructor(private readonly config: ConfigService) {}

  encrypt(secret: string) {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      CIPHER_PREFIX,
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string) {
    const [version, ivValue, tagValue, encryptedValue] = payload.split(':');
    if (version !== CIPHER_PREFIX || !ivValue || !tagValue || !encryptedValue) {
      throw new ServiceUnavailableException('Format de secret Finance chiffré non reconnu.');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(ivValue, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException(
        'Impossible de déchiffrer le secret Finance avec la clé serveur configurée.',
      );
    }
  }

  mask(secret: string) {
    if (secret.length <= 10) return '••••';
    return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
  }

  private encryptionKey() {
    const dedicated = this.config.get<string>('FINANCE_SECRETS_ENCRYPTION_KEY')?.trim();
    const developmentFallback =
      this.config.get<string>('NODE_ENV') === 'production'
        ? undefined
        : this.config.get<string>('JWT_SECRET')?.trim();
    const configured = dedicated || developmentFallback;
    if (!configured) {
      throw new ServiceUnavailableException(
        'La clé serveur FINANCE_SECRETS_ENCRYPTION_KEY doit être configurée avant d’enregistrer un connecteur Finance.',
      );
    }
    return createHash('sha256').update(configured, 'utf8').digest();
  }
}

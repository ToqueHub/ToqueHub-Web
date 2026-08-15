import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

const CIPHER_VERSION = 1;
const CIPHER_PREFIX = `v${CIPHER_VERSION}`;

type ResendSecretRecord = {
  resendApiKey: string | null;
  resendApiKeyEncrypted: string | null;
  resendApiKeyMask: string | null;
  resendApiKeyUpdatedAt: Date | null;
};

@Injectable()
export class OrganizationApiKeySecretService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getResendSecret(organizationId: string): Promise<string | null> {
    const record = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        resendApiKey: true,
        resendApiKeyEncrypted: true,
        resendApiKeyMask: true,
        resendApiKeyUpdatedAt: true,
      },
    });
    if (!record) throw new BadRequestException('Organisation introuvable.');
    if (record.resendApiKeyEncrypted) return this.decrypt(record.resendApiKeyEncrypted);
    if (!record.resendApiKey) return null;

    const key = this.encryptionKey(false);
    if (key) await this.migrateLegacySecret(organizationId, record.resendApiKey, key);
    return record.resendApiKey;
  }

  async setResendSecret(organizationId: string, rawSecret: string | null): Promise<ResendSecretRecord> {
    const secret = rawSecret?.trim() || null;
    if (!secret) {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.organization.update({
          where: { id: organizationId },
          data: {
            resendApiKey: null,
            resendApiKeyEncrypted: null,
            resendApiKeyMask: null,
            resendApiKeyCipherVersion: null,
            resendApiKeyUpdatedAt: null,
          },
          select: {
            resendApiKey: true,
            resendApiKeyEncrypted: true,
            resendApiKeyMask: true,
            resendApiKeyUpdatedAt: true,
          },
        });
        await tx.purchasingSettings.updateMany({
          where: { organizationId },
          data: { resendVerifiedAt: null, resendLastTestEmailId: null },
        });
        return updated;
      });
    }

    const encrypted = this.encrypt(secret, this.encryptionKey(true)!);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: {
          resendApiKey: null,
          resendApiKeyEncrypted: encrypted,
          resendApiKeyMask: this.mask(secret),
          resendApiKeyCipherVersion: CIPHER_VERSION,
          resendApiKeyUpdatedAt: new Date(),
        },
        select: {
          resendApiKey: true,
          resendApiKeyEncrypted: true,
          resendApiKeyMask: true,
          resendApiKeyUpdatedAt: true,
        },
      });
      await tx.purchasingSettings.updateMany({
        where: { organizationId },
        data: { resendVerifiedAt: null, resendLastTestEmailId: null },
      });
      return updated;
    });
  }

  publicSummary(record: ResendSecretRecord) {
    const configured = Boolean(record.resendApiKeyEncrypted || record.resendApiKey);
    return {
      configured,
      masked: configured
        ? record.resendApiKeyMask ?? (record.resendApiKey ? this.mask(record.resendApiKey) : 're_••••')
        : null,
      updatedAt: record.resendApiKeyUpdatedAt ?? null,
    };
  }

  private async migrateLegacySecret(organizationId: string, secret: string, key: Buffer) {
    const encrypted = this.encrypt(secret, key);
    const verified = this.decryptWithKey(encrypted, key);
    if (verified !== secret) throw new ServiceUnavailableException('Migration sécurisée Resend impossible.');
    await this.prisma.organization.updateMany({
      where: { id: organizationId, resendApiKey: secret, resendApiKeyEncrypted: null },
      data: {
        resendApiKeyEncrypted: encrypted,
        resendApiKeyMask: this.mask(secret),
        resendApiKeyCipherVersion: CIPHER_VERSION,
        resendApiKey: null,
      },
    });
  }

  private encryptionKey(required: boolean): Buffer | null {
    const configured = this.config.get<string>('PURCHASING_RESEND_ENCRYPTION_KEY')?.trim();
    const invalid =
      !configured ||
      configured.length < 32 ||
      configured.startsWith('replace-with-') ||
      configured.startsWith('change-me-');
    if (invalid) {
      if (required)
        throw new ServiceUnavailableException(
          'Une clé serveur aléatoire PURCHASING_RESEND_ENCRYPTION_KEY (32 caractères minimum) doit être configurée avant d’enregistrer Resend.',
        );
      return null;
    }
    return createHash('sha256').update(configured, 'utf8').digest();
  }

  private encrypt(secret: string, key: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [CIPHER_PREFIX, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  private decrypt(payload: string) {
    const key = this.encryptionKey(true);
    return this.decryptWithKey(payload, key!);
  }

  private decryptWithKey(payload: string, key: Buffer) {
    const [version, ivValue, tagValue, ciphertextValue] = payload.split(':');
    if (version !== CIPHER_PREFIX || !ivValue || !tagValue || !ciphertextValue)
      throw new ServiceUnavailableException('Format de clé Resend chiffrée non reconnu.');
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException(
        'Impossible de déchiffrer la clé Resend avec la clé serveur configurée.',
      );
    }
  }

  private mask(secret: string) {
    if (secret.length <= 10) return '••••';
    return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
  }
}

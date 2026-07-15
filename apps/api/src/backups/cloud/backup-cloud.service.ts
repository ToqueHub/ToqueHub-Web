import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BackupCloudConnection, BackupCloudConnectionStatus, BackupCloudProvider } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupCloudCryptoService } from './backup-cloud-crypto.service';
import { ConfigureGoogleDriveBackupDto } from './dto/backup-cloud.dto';
import { GoogleDriveBackupProvider } from './google-drive-backup.provider';
import type { BackupCloudUploadInput, BackupStorageProvider } from './backup-cloud.types';

@Injectable()
export class BackupCloudService {
  private readonly providers: Record<BackupCloudProvider, BackupStorageProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BackupCloudCryptoService,
    private readonly googleDrive: GoogleDriveBackupProvider,
  ) {
    this.providers = {
      [BackupCloudProvider.GOOGLE_DRIVE]: googleDrive,
    };
  }

  async status(organizationId: string) {
    const connection = await this.connection(organizationId, BackupCloudProvider.GOOGLE_DRIVE);
    return {
      googleDrive: this.serializeConnection(connection),
      encryptionConfigured: Boolean(process.env.BACKUP_CLOUD_ENCRYPTION_KEY?.trim()),
    };
  }

  async configureGoogleDrive(organizationId: string, dto: ConfigureGoogleDriveBackupDto) {
    this.crypto.assertConfigured();
    const existing = await this.connection(organizationId, BackupCloudProvider.GOOGLE_DRIVE);
    const nextClientId = dto.clientId.trim();
    const nextRedirectUri = dto.redirectUri.trim();
    const configChanged = !existing || existing.clientId !== nextClientId || existing.redirectUri !== nextRedirectUri || Boolean(dto.clientSecret?.trim());
    if (!dto.clientSecret?.trim() && !existing?.clientSecretCiphertext) {
      throw new BadRequestException('Le client secret Google est requis.');
    }
    const connection = await this.prisma.backupCloudConnection.upsert({
      where: { organizationId_provider: { organizationId, provider: BackupCloudProvider.GOOGLE_DRIVE } },
      create: {
        organizationId,
        provider: BackupCloudProvider.GOOGLE_DRIVE,
        status: BackupCloudConnectionStatus.CONFIGURED,
        clientId: nextClientId,
        clientSecretCiphertext: this.crypto.encrypt(dto.clientSecret!.trim()),
        redirectUri: nextRedirectUri,
      },
      update: {
        clientId: nextClientId,
        redirectUri: nextRedirectUri,
        ...(dto.clientSecret?.trim() ? { clientSecretCiphertext: this.crypto.encrypt(dto.clientSecret.trim()) } : {}),
        ...(configChanged ? {
          status: BackupCloudConnectionStatus.CONFIGURED,
          refreshTokenCiphertext: null,
          accountEmail: null,
          driveFolderId: null,
          lastError: null,
        } : {}),
      },
    });
    return this.serializeConnection(connection);
  }

  async startGoogleConnect(organizationId: string, userId: string) {
    const connection = await this.requireConfiguredConnection(organizationId, BackupCloudProvider.GOOGLE_DRIVE);
    const state = randomBytes(32).toString('base64url');
    await this.prisma.backupCloudOAuthState.create({
      data: {
        organizationId,
        userId,
        provider: BackupCloudProvider.GOOGLE_DRIVE,
        stateHash: this.hashState(state),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    return { authUrl: this.googleDrive.buildAuthUrl(connection, state) };
  }

  async completeGoogleConnect(code: string, state: string) {
    const oauthState = await this.prisma.backupCloudOAuthState.findUnique({ where: { stateHash: this.hashState(state) } });
    if (!oauthState || oauthState.consumedAt || oauthState.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Session OAuth Google expirée ou invalide.');
    }
    await this.prisma.backupCloudOAuthState.update({ where: { id: oauthState.id }, data: { consumedAt: new Date() } });
    const connection = await this.requireConfiguredConnection(oauthState.organizationId, BackupCloudProvider.GOOGLE_DRIVE);
    const connected = await this.googleDrive.exchangeCode(connection, code);
    return this.serializeConnection(connected);
  }

  async testGoogleDrive(organizationId: string) {
    const connection = await this.requireConfiguredConnection(organizationId, BackupCloudProvider.GOOGLE_DRIVE);
    try {
      const result = await this.googleDrive.test(connection);
      const updated = await this.prisma.backupCloudConnection.update({
        where: { id: connection.id },
        data: {
          status: BackupCloudConnectionStatus.CONNECTED,
          accountEmail: result.accountEmail,
          driveFolderId: result.folderId,
          lastTestAt: new Date(),
          lastError: null,
        },
      });
      return { ok: true, connection: this.serializeConnection(updated) };
    } catch (err) {
      const message = this.errorMessage(err);
      const updated = await this.prisma.backupCloudConnection.update({
        where: { id: connection.id },
        data: { status: BackupCloudConnectionStatus.ERROR, lastTestAt: new Date(), lastError: message },
      });
      void updated;
      throw new BadRequestException(message);
    }
  }

  async disconnectGoogleDrive(organizationId: string) {
    const connection = await this.connection(organizationId, BackupCloudProvider.GOOGLE_DRIVE);
    if (!connection) return this.serializeConnection(null);
    await this.googleDrive.revoke(connection).catch(() => undefined);
    const updated = await this.prisma.backupCloudConnection.update({
      where: { id: connection.id },
      data: {
        status: connection.clientSecretCiphertext ? BackupCloudConnectionStatus.CONFIGURED : BackupCloudConnectionStatus.DISCONNECTED,
        refreshTokenCiphertext: null,
        accountEmail: null,
        driveFolderId: null,
        lastError: null,
      },
    });
    return this.serializeConnection(updated);
  }

  async replicateBackup(input: BackupCloudUploadInput, retentionDays: number) {
    const connections = await this.prisma.backupCloudConnection.findMany({
      where: {
        organizationId: input.organizationId,
        status: BackupCloudConnectionStatus.CONNECTED,
        refreshTokenCiphertext: { not: null },
      },
    });
    for (const connection of connections) {
      await this.uploadToConnection(connection, input);
      await this.applyRetention(connection, retentionDays);
    }
  }

  async replicateBackupToGoogleDrive(input: BackupCloudUploadInput, retentionDays: number) {
    const connection = await this.connection(input.organizationId, BackupCloudProvider.GOOGLE_DRIVE);
    if (!connection?.refreshTokenCiphertext || connection.status !== BackupCloudConnectionStatus.CONNECTED) {
      throw new BadRequestException('Compte Google Drive non connecté.');
    }
    await this.uploadToConnection(connection, input, true);
    await this.applyRetention(connection, retentionDays);
    const updated = await this.connection(input.organizationId, BackupCloudProvider.GOOGLE_DRIVE);
    return this.serializeConnection(updated);
  }

  private async uploadToConnection(connection: BackupCloudConnection, input: BackupCloudUploadInput, throwOnError = false) {
    try {
      const result = await this.providers[connection.provider].upload(connection, input);
      await this.prisma.backupCloudObject.create({
        data: {
          organizationId: input.organizationId,
          connectionId: connection.id,
          provider: connection.provider,
          backupId: input.backupId,
          filename: input.filename,
          remoteFileId: result.remoteFileId,
          sizeBytes: BigInt(input.sizeBytes),
          checksumSha256: input.checksumSha256 ?? null,
          syncedAt: new Date(),
        },
      });
      await this.prisma.backupCloudConnection.update({
        where: { id: connection.id },
        data: { status: BackupCloudConnectionStatus.CONNECTED, lastSyncAt: new Date(), lastError: null },
      });
    } catch (err) {
      const message = this.errorMessage(err);
      console.error('Backup cloud replication failed', { provider: connection.provider, backupId: input.backupId, message });
      await this.prisma.backupCloudObject.create({
        data: {
          organizationId: input.organizationId,
          connectionId: connection.id,
          provider: connection.provider,
          backupId: input.backupId,
          filename: input.filename,
          sizeBytes: BigInt(input.sizeBytes),
          checksumSha256: input.checksumSha256 ?? null,
          error: message,
        },
      }).catch(() => undefined);
      await this.prisma.backupCloudConnection.update({
        where: { id: connection.id },
        data: { status: BackupCloudConnectionStatus.ERROR, lastError: message },
      }).catch(() => undefined);
      if (throwOnError) throw new BadRequestException(message);
    }
  }

  private async applyRetention(connection: BackupCloudConnection, retentionDays: number) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const expired = await this.prisma.backupCloudObject.findMany({
      where: {
        connectionId: connection.id,
        provider: connection.provider,
        remoteFileId: { not: null },
        syncedAt: { lt: cutoff },
        deletedAt: null,
      },
      orderBy: { syncedAt: 'asc' },
    });
    for (const object of expired) {
      try {
        await this.providers[connection.provider].deleteObject(connection, object.remoteFileId!);
        await this.prisma.backupCloudObject.update({ where: { id: object.id }, data: { deletedAt: new Date(), error: null } });
      } catch (err) {
        const message = this.errorMessage(err);
        console.error('Backup cloud retention failed', { provider: connection.provider, remoteFileId: object.remoteFileId, message });
        await this.prisma.backupCloudObject.update({ where: { id: object.id }, data: { error: message } }).catch(() => undefined);
        await this.prisma.backupCloudConnection.update({ where: { id: connection.id }, data: { lastError: message } }).catch(() => undefined);
      }
    }
  }

  private async requireConfiguredConnection(organizationId: string, provider: BackupCloudProvider) {
    const connection = await this.connection(organizationId, provider);
    if (!connection?.clientId || !connection.clientSecretCiphertext || !connection.redirectUri) {
      throw new NotFoundException('Configuration Google Drive introuvable.');
    }
    return connection;
  }

  private connection(organizationId: string, provider: BackupCloudProvider) {
    return this.prisma.backupCloudConnection.findUnique({ where: { organizationId_provider: { organizationId, provider } } });
  }

  private serializeConnection(connection: BackupCloudConnection | null) {
    return {
      provider: BackupCloudProvider.GOOGLE_DRIVE,
      status: connection?.status ?? BackupCloudConnectionStatus.DISCONNECTED,
      configured: Boolean(connection?.clientId && connection.clientSecretCiphertext && connection.redirectUri),
      connected: Boolean(connection?.refreshTokenCiphertext && connection.status === BackupCloudConnectionStatus.CONNECTED),
      clientId: connection?.clientId ?? null,
      redirectUri: connection?.redirectUri ?? null,
      accountEmail: connection?.accountEmail ?? null,
      driveFolderId: connection?.driveFolderId ?? null,
      lastSyncAt: connection?.lastSyncAt ?? null,
      lastTestAt: connection?.lastTestAt ?? null,
      lastError: connection?.lastError ?? null,
      updatedAt: connection?.updatedAt ?? null,
    };
  }

  private hashState(state: string) {
    return createHash('sha256').update(state).digest('hex');
  }

  private errorMessage(err: unknown) {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err && 'message' in err) return String((err as { message?: unknown }).message);
    return String(err);
  }
}

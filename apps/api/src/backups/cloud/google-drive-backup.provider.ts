import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BackupCloudConnection, BackupCloudConnectionStatus, BackupCloudProvider } from '@prisma/client';
import { createReadStream } from 'node:fs';
import { google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupCloudCryptoService } from './backup-cloud-crypto.service';
import type { BackupCloudTestResult, BackupCloudUploadInput, BackupCloudUploadResult, BackupStorageProvider } from './backup-cloud.types';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
];

@Injectable()
export class GoogleDriveBackupProvider implements BackupStorageProvider {
  readonly provider = BackupCloudProvider.GOOGLE_DRIVE;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BackupCloudCryptoService,
  ) {}

  buildAuthUrl(connection: BackupCloudConnection, state: string) {
    const oauth = this.oauthClient(connection);
    return oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
      state,
    });
  }

  async exchangeCode(connection: BackupCloudConnection, code: string) {
    const oauth = this.oauthClient(connection);
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) {
      throw new BadRequestException('Google n’a pas renvoyé de refresh token. Reconnectez le compte en acceptant le consentement Google.');
    }
    oauth.setCredentials(tokens);
    const accountEmail = await this.accountEmail(oauth);
    const folderId = await this.ensureBackupFolder(oauth, connection.driveFolderId);
    return this.prisma.backupCloudConnection.update({
      where: { id: connection.id },
      data: {
        status: BackupCloudConnectionStatus.CONNECTED,
        refreshTokenCiphertext: this.crypto.encrypt(tokens.refresh_token),
        accountEmail,
        driveFolderId: folderId,
        lastError: null,
      },
    });
  }

  async ensureReady(connection: BackupCloudConnection) {
    const oauth = this.authenticatedClient(connection);
    const accountEmail = await this.accountEmail(oauth);
    const folderId = await this.ensureBackupFolder(oauth, connection.driveFolderId);
    if (folderId !== connection.driveFolderId || accountEmail !== connection.accountEmail || connection.status !== BackupCloudConnectionStatus.CONNECTED) {
      return this.prisma.backupCloudConnection.update({
        where: { id: connection.id },
        data: {
          status: BackupCloudConnectionStatus.CONNECTED,
          accountEmail,
          driveFolderId: folderId,
          lastError: null,
        },
      });
    }
    return connection;
  }

  async upload(connection: BackupCloudConnection, input: BackupCloudUploadInput): Promise<BackupCloudUploadResult> {
    const ready = await this.ensureReady(connection);
    if (!ready.driveFolderId) throw new InternalServerErrorException('Dossier Google Drive introuvable.');
    const drive = google.drive({ version: 'v3', auth: this.authenticatedClient(ready) });
    const response = await drive.files.create({
      requestBody: {
        name: input.filename,
        parents: [ready.driveFolderId],
        appProperties: {
          toquehubBackup: 'true',
          backupId: input.backupId,
          checksumSha256: input.checksumSha256 ?? '',
        },
      },
      media: {
        mimeType: 'application/gzip',
        body: createReadStream(input.absolutePath),
      },
      fields: 'id',
    });
    if (!response.data.id) throw new InternalServerErrorException('Google Drive n’a pas renvoyé d’identifiant fichier.');
    return { remoteFileId: response.data.id, folderId: ready.driveFolderId };
  }

  async test(connection: BackupCloudConnection): Promise<BackupCloudTestResult> {
    const ready = await this.ensureReady(connection);
    return { ok: true, accountEmail: ready.accountEmail, folderId: ready.driveFolderId };
  }

  async deleteObject(connection: BackupCloudConnection, remoteFileId: string) {
    const drive = google.drive({ version: 'v3', auth: this.authenticatedClient(connection) });
    await drive.files.update({
      fileId: remoteFileId,
      requestBody: { trashed: true },
      fields: 'id,trashed',
    });
  }

  async revoke(connection: BackupCloudConnection) {
    const refreshToken = this.crypto.decrypt(connection.refreshTokenCiphertext);
    if (!refreshToken) return;
    await this.oauthClient(connection).revokeToken(refreshToken).catch(() => undefined);
  }

  private oauthClient(connection: BackupCloudConnection) {
    if (!connection.clientId || !connection.clientSecretCiphertext || !connection.redirectUri) {
      throw new BadRequestException('Configuration Google Drive incomplète.');
    }
    const clientSecret = this.crypto.decrypt(connection.clientSecretCiphertext);
    if (!clientSecret) throw new BadRequestException('Client secret Google Drive introuvable.');
    return new google.auth.OAuth2(
      connection.clientId,
      clientSecret,
      connection.redirectUri,
    );
  }

  private authenticatedClient(connection: BackupCloudConnection) {
    const oauth = this.oauthClient(connection);
    const refreshToken = this.crypto.decrypt(connection.refreshTokenCiphertext);
    if (!refreshToken) throw new BadRequestException('Compte Google Drive non connecté.');
    oauth.setCredentials({ refresh_token: refreshToken });
    return oauth;
  }

  private async accountEmail(auth: ReturnType<GoogleDriveBackupProvider['oauthClient']>) {
    const response = await google.oauth2({ version: 'v2', auth }).userinfo.get();
    return response.data.email ?? null;
  }

  private async ensureBackupFolder(auth: ReturnType<GoogleDriveBackupProvider['oauthClient']>, currentFolderId?: string | null) {
    const drive = google.drive({ version: 'v3', auth });
    if (currentFolderId) {
      const existing = await drive.files.get({ fileId: currentFolderId, fields: 'id,trashed' }).catch(() => undefined);
      if (existing?.data.id && !existing.data.trashed) return existing.data.id;
    }
    const rootId = await this.findOrCreateFolder(drive, 'ToqueHub');
    return this.findOrCreateFolder(drive, 'Backups', rootId);
  }

  private async findOrCreateFolder(drive: ReturnType<typeof google.drive>, name: string, parentId?: string) {
    const parentQuery = parentId ? ` and '${parentId}' in parents` : '';
    const found = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false${parentQuery}`,
      spaces: 'drive',
      fields: 'files(id,name)',
      pageSize: 1,
    });
    const existing = found.data.files?.[0]?.id;
    if (existing) return existing;
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      },
      fields: 'id',
    });
    if (!created.data.id) throw new InternalServerErrorException(`Création du dossier Google Drive ${name} impossible.`);
    return created.data.id;
  }
}

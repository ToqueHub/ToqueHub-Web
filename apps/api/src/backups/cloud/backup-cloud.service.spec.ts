import { BackupCloudConnectionStatus, BackupCloudProvider } from '@prisma/client';
import { BackupCloudCryptoService } from './backup-cloud-crypto.service';
import { BackupCloudService } from './backup-cloud.service';

const connection = {
  id: 'connection-1',
  organizationId: 'org-1',
  provider: BackupCloudProvider.GOOGLE_DRIVE,
  status: BackupCloudConnectionStatus.CONNECTED,
  clientId: 'client-id',
  clientSecretCiphertext: 'secret',
  redirectUri: 'http://localhost:3000/api/backups/cloud/google/callback',
  refreshTokenCiphertext: 'refresh',
  accountEmail: 'admin@example.com',
  driveFolderId: 'folder-1',
  lastSyncAt: null,
  lastTestAt: null,
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockPrisma(overrides?: any): any {
  return {
    backupCloudConnection: {
      findMany: jest.fn().mockResolvedValue([connection]),
      update: jest.fn().mockResolvedValue(connection),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    backupCloudObject: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    backupCloudOAuthState: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ...(overrides || {}),
  };
}

describe('BackupCloudCryptoService', () => {
  const originalKey = process.env.BACKUP_CLOUD_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.BACKUP_CLOUD_ENCRYPTION_KEY = originalKey;
  });

  it('encrypts and decrypts secrets with a dedicated key', () => {
    process.env.BACKUP_CLOUD_ENCRYPTION_KEY = '12345678901234567890123456789012';
    const service = new BackupCloudCryptoService();
    const encrypted = service.encrypt('refresh-token');

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('refresh-token');
    expect(service.decrypt(encrypted)).toBe('refresh-token');
  });
});

describe('BackupCloudService replication', () => {
  const input = {
    organizationId: 'org-1',
    backupId: 'toquehub-backup-20260627-163000',
    filename: 'toquehub-backup-20260627-163000.tar.gz',
    absolutePath: '/tmp/archive.tar.gz',
    sizeBytes: 42,
    checksumSha256: 'checksum',
  };

  it('does not throw when provider upload fails', async () => {
    const prisma = mockPrisma();
    const provider: any = { provider: BackupCloudProvider.GOOGLE_DRIVE, upload: jest.fn().mockRejectedValue(new Error('Drive down')) };
    const service = new BackupCloudService(prisma, {} as any, provider);

    await expect(service.replicateBackup(input, 14)).resolves.toBeUndefined();
    expect(prisma.backupCloudObject.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ backupId: input.backupId, error: 'Drive down' }),
    }));
    expect(prisma.backupCloudConnection.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: BackupCloudConnectionStatus.ERROR, lastError: 'Drive down' }),
    }));
  });

  it('applies retention only to tracked cloud objects', async () => {
    const expired = {
      id: 'object-1',
      remoteFileId: 'drive-file-1',
      provider: BackupCloudProvider.GOOGLE_DRIVE,
      connectionId: connection.id,
      syncedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const prisma = mockPrisma({
      backupCloudObject: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([expired]),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const provider: any = {
      provider: BackupCloudProvider.GOOGLE_DRIVE,
      upload: jest.fn().mockResolvedValue({ remoteFileId: 'drive-file-new' }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new BackupCloudService(prisma, {} as any, provider);

    await service.replicateBackup(input, 1);

    expect(provider.deleteObject).toHaveBeenCalledWith(connection, 'drive-file-1');
    expect(prisma.backupCloudObject.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'object-1' },
      data: expect.objectContaining({ deletedAt: expect.any(Date), error: null }),
    }));
  });
});

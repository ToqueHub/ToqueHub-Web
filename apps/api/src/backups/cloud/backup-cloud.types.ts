import type { BackupCloudConnection, BackupCloudProvider } from '@prisma/client';

export interface BackupCloudUploadInput {
  organizationId: string;
  backupId: string;
  filename: string;
  absolutePath: string;
  sizeBytes: number;
  checksumSha256?: string | null;
}

export interface BackupCloudUploadResult {
  remoteFileId: string;
  folderId?: string | null;
}

export interface BackupCloudTestResult {
  ok: boolean;
  accountEmail?: string | null;
  folderId?: string | null;
}

export interface BackupStorageProvider {
  readonly provider: BackupCloudProvider;
  ensureReady(connection: BackupCloudConnection): Promise<BackupCloudConnection>;
  upload(connection: BackupCloudConnection, input: BackupCloudUploadInput): Promise<BackupCloudUploadResult>;
  test(connection: BackupCloudConnection): Promise<BackupCloudTestResult>;
  deleteObject(connection: BackupCloudConnection, remoteFileId: string): Promise<void>;
  revoke(connection: BackupCloudConnection): Promise<void>;
}

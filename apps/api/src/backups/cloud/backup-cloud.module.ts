import { Module } from '@nestjs/common';
import { BackupCloudController } from './backup-cloud.controller';
import { BackupCloudCryptoService } from './backup-cloud-crypto.service';
import { BackupCloudService } from './backup-cloud.service';
import { GoogleDriveBackupProvider } from './google-drive-backup.provider';

@Module({
  controllers: [BackupCloudController],
  providers: [BackupCloudCryptoService, BackupCloudService, GoogleDriveBackupProvider],
  exports: [BackupCloudService],
})
export class BackupCloudModule {}

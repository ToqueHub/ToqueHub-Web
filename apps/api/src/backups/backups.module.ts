import { Module } from '@nestjs/common';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { SystemModule } from '../system/system.module';
import { BackupCloudModule } from './cloud/backup-cloud.module';

@Module({
  imports: [SystemModule, BackupCloudModule],
  controllers: [BackupsController],
  providers: [BackupsService],
  exports: [BackupsService],
})
export class BackupsModule {}

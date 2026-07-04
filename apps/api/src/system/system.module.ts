import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemUpdateService } from './system-update.service';
import { SystemService } from './system.service';

@Module({
  controllers: [SystemController],
  providers: [SystemService, SystemUpdateService],
  exports: [SystemService],
})
export class SystemModule {}

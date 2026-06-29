import { Module } from '@nestjs/common';
import { HaccpController } from './haccp.controller';
import { HaccpService } from './haccp.service';

@Module({
  controllers: [HaccpController],
  providers: [HaccpService],
  exports: [HaccpService],
})
export class HaccpModule {}

import { Module } from '@nestjs/common';
import { HaccpController } from './haccp.controller';
import { HaccpService } from './haccp.service';
import { HaccpIotModule } from './iot/haccp-iot.module';
import { ProductionModule } from '../production/production.module';

@Module({
  imports: [HaccpIotModule, ProductionModule],
  controllers: [HaccpController],
  providers: [HaccpService],
  exports: [HaccpService],
})
export class HaccpModule {}

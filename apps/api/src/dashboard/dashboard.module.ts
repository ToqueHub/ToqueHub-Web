import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardExternalService } from './dashboard-external.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardExternalService],
  exports: [DashboardService],
})
export class DashboardModule {}

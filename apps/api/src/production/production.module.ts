import { Module } from '@nestjs/common';
import { ProductionController } from './production.controller';
import { ProductionExecutionService } from './production-execution.service';
import { ProductionPlanningService } from './production-planning.service';
import { ProductionService } from './production.service';

@Module({
  controllers: [ProductionController],
  providers: [ProductionService, ProductionPlanningService, ProductionExecutionService],
  exports: [ProductionService, ProductionPlanningService, ProductionExecutionService],
})
export class ProductionModule {}

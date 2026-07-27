import { Module } from '@nestjs/common';
import { ProductionController } from './production.controller';
import { ProductionExecutionService } from './production-execution.service';
import { ProductionPlanningService } from './production-planning.service';
import { ProductionService } from './production.service';
import { OperationalTasksService } from './operational-tasks.service';
import { ProductionDayClosureService } from './production-day-closure.service';

@Module({
  controllers: [ProductionController],
  providers: [
    ProductionService,
    ProductionPlanningService,
    ProductionExecutionService,
    OperationalTasksService,
    ProductionDayClosureService,
  ],
  exports: [
    ProductionService,
    ProductionPlanningService,
    ProductionExecutionService,
    OperationalTasksService,
    ProductionDayClosureService,
  ],
})
export class ProductionModule {}

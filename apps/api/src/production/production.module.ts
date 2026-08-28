import { Module } from '@nestjs/common';
import { ProductionController } from './production.controller';
import { ProductionExecutionService } from './production-execution.service';
import { ProductionPlanningService } from './production-planning.service';
import { ProductionService } from './production.service';
import { OperationalTasksService } from './operational-tasks.service';
import { ProductionDayClosureService } from './production-day-closure.service';
import { ProductionOperationalExportService } from './production-operational-export.service';
import { CatererEventLifecycleService } from './caterer-event-lifecycle.service';
import { ProductionIngredientTraceabilityService } from './production-ingredient-traceability.service';
import { OperationalTaskPresetsService } from './operational-task-presets.service';

@Module({
  controllers: [ProductionController],
  providers: [
    ProductionService,
    ProductionPlanningService,
    ProductionExecutionService,
    OperationalTasksService,
    OperationalTaskPresetsService,
    ProductionDayClosureService,
    ProductionOperationalExportService,
    CatererEventLifecycleService,
    ProductionIngredientTraceabilityService,
  ],
  exports: [
    ProductionService,
    ProductionPlanningService,
    ProductionExecutionService,
    OperationalTasksService,
    OperationalTaskPresetsService,
    ProductionDayClosureService,
    ProductionOperationalExportService,
    CatererEventLifecycleService,
    ProductionIngredientTraceabilityService,
  ],
})
export class ProductionModule {}

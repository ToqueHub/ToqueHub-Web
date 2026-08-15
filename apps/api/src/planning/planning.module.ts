import { Module } from '@nestjs/common';
import { HrModule } from '../hr/hr.module';
import { PlanningCodeDictionaryService } from './planning-code-dictionary.service';
import { PlanningController } from './planning.controller';
import { PlanningSelfController } from './planning-self.controller';
import { PlanningReadGuard, PlanningWriteGuard } from './planning-access';
import { PlanningAttendanceService } from './planning-attendance.service';
import { PlanningDayStatusService } from './planning-day-status.service';
import { PlanningPolicyService } from './planning-policy.service';
import { PlanningService } from './planning.service';

@Module({
  imports: [HrModule],
  controllers: [PlanningController, PlanningSelfController],
  providers: [PlanningService, PlanningDayStatusService, PlanningCodeDictionaryService, PlanningPolicyService, PlanningAttendanceService, PlanningReadGuard, PlanningWriteGuard],
  exports: [PlanningService, PlanningDayStatusService, PlanningCodeDictionaryService, PlanningPolicyService, PlanningAttendanceService],
})
export class PlanningModule {}

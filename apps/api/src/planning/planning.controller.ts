import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AcceptReplacementDto, ApplyPlanningRotationDto, ApplyPlanningTemplateDto, GeneratePlanningDto, MovePlanningAssignmentDto, PlanningAttendanceQueryDto, PlanningContextQueryDto, PlanningDayStatusQueryDto, PlanningPeriodActionDto, PlanningQueryDto, PlanningRotationPreviewDto, PrepareExportDto, SetEmployeePlanningTemplatesDto, SetEmployeeSkillsDto, UpsertDayPlanningAssignmentDto, UpsertDayPresetDto, UpsertHrAbsenceDto, UpsertHrSkillDto, UpsertPlanningAssignmentDto, UpsertPlanningAttendanceDto, UpsertPlanningCodeDictionaryDto, UpsertPlanningDayStatusDto, UpsertPlanningNeedDto, UpsertPlanningPolicyProfileDto, UpsertPlanningTemplateDto, UpsertWeeklyRotationDto, UpsertWorkTimeRegulationDto, ValidatePlanningAttendanceDto } from './dto/planning.dto';
import { PlanningAttendanceService } from './planning-attendance.service';
import { PlanningCodeDictionaryService } from './planning-code-dictionary.service';
import { PlanningDayStatusService } from './planning-day-status.service';
import { PlanningPolicyService } from './planning-policy.service';
import { PlanningService } from './planning.service';
import { WorkTimeRegulationService } from './work-time-regulation.service';

@ApiTags('planning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('planning')
export class PlanningController {
  constructor(
    private readonly planningService: PlanningService,
    private readonly dayStatusService: PlanningDayStatusService,
    private readonly codeDictionaryService: PlanningCodeDictionaryService,
    private readonly policyService: PlanningPolicyService,
    private readonly attendanceService: PlanningAttendanceService,
    private readonly workTimeRegulationService: WorkTimeRegulationService,
  ) {}
  private org(user: AuthenticatedUser) { if (!user.organizationId) throw new BadRequestException('Organization setup is required before using Planning endpoints'); return user.organizationId; }
  private actor(user: AuthenticatedUser) { return { id: user.id, role: user.role }; }

  @Get('bootstrap') bootstrap(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningContextQueryDto) { return this.planningService.bootstrap(this.org(user), q); }
  @Get('context') context(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningContextQueryDto) { return this.planningService.context(this.org(user), q); }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningContextQueryDto) { return this.planningService.dashboard(this.org(user), q); }
  @Post('period/control') controlPeriod(@CurrentUser() user: AuthenticatedUser, @Body() dto: PlanningPeriodActionDto) { return this.planningService.controlPeriod(this.org(user), this.actor(user), dto); }
  @Post('period/publish') publishPeriod(@CurrentUser() user: AuthenticatedUser, @Body() dto: PlanningPeriodActionDto) { return this.planningService.publishPeriod(this.org(user), this.actor(user), dto); }
  @Post('period/lock') lockPeriod(@CurrentUser() user: AuthenticatedUser, @Body() dto: PlanningPeriodActionDto) { return this.planningService.lockPeriod(this.org(user), this.actor(user), dto); }

  @Get('day-statuses') dayStatuses(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningDayStatusQueryDto) { return this.dayStatusService.list(this.org(user), q); }
  @Post('day-statuses') upsertDayStatus(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPlanningDayStatusDto) { return this.dayStatusService.upsert(this.org(user), this.actor(user), dto); }
  @Patch('day-statuses/:id') updateDayStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertPlanningDayStatusDto) { return this.dayStatusService.update(this.org(user), this.actor(user), id, dto); }

  @Get('attendance') attendance(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningAttendanceQueryDto) { return this.attendanceService.list(this.org(user), q); }
  @Get('attendance/:employeeId') employeeAttendance(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Query() q: PlanningAttendanceQueryDto) { return this.attendanceService.employee(this.org(user), employeeId, q); }
  @Post('attendance') createAttendance(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPlanningAttendanceDto) { return this.attendanceService.create(this.org(user), this.actor(user), dto); }
  @Patch('attendance/:id') updateAttendance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertPlanningAttendanceDto) { return this.attendanceService.update(this.org(user), this.actor(user), id, dto); }
  @Patch('attendance/:id/validate') validateAttendance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ValidatePlanningAttendanceDto) { return this.attendanceService.validate(this.org(user), this.actor(user), id, dto); }

  @Get('code-dictionary') codeDictionary(@CurrentUser() user: AuthenticatedUser) { return this.codeDictionaryService.list(this.org(user)); }
  @Post('code-dictionary') createCodeDictionary(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPlanningCodeDictionaryDto) { return this.codeDictionaryService.create(this.org(user), this.actor(user), dto); }
  @Patch('code-dictionary/:id') updateCodeDictionary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertPlanningCodeDictionaryDto) { return this.codeDictionaryService.update(this.org(user), this.actor(user), id, dto); }

  @Get('policy-profiles') policyProfiles(@CurrentUser() user: AuthenticatedUser) { return this.policyService.list(this.org(user)); }
  @Post('policy-profiles') createPolicyProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPlanningPolicyProfileDto) { return this.policyService.create(this.org(user), this.actor(user), dto); }
  @Patch('policy-profiles/:id') updatePolicyProfile(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertPlanningPolicyProfileDto) { return this.policyService.update(this.org(user), this.actor(user), id, dto); }

  @Get('work-time-regulation') workTimeRegulation(@CurrentUser() user: AuthenticatedUser) { return this.workTimeRegulationService.get(this.org(user)); }
  @Patch('work-time-regulation') updateWorkTimeRegulation(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertWorkTimeRegulationDto) { return this.workTimeRegulationService.upsert(this.org(user), this.actor(user), dto); }
  @Get('work-time-regulation/position-mapping/preview') workTimePositionMappingPreview(@CurrentUser() user: AuthenticatedUser) { return this.workTimeRegulationService.positionMappingPreview(this.org(user)); }

  @Get('assignments') assignments(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listAssignments(this.org(user), q); }
  @Post('assignments') createAssignment(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPlanningAssignmentDto) { return this.planningService.createAssignment(this.org(user), this.actor(user), dto); }
  @Post('assignments/upsert-day') upsertDayAssignment(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertDayPlanningAssignmentDto) { return this.planningService.upsertDayAssignment(this.org(user), this.actor(user), dto); }
  @Get('assignments/:id') assignment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.getAssignment(this.org(user), id); }
  @Patch('assignments/:id') updateAssignment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertPlanningAssignmentDto) { return this.planningService.updateAssignment(this.org(user), this.actor(user), id, dto); }
  @Patch('assignments/:id/move') moveAssignment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MovePlanningAssignmentDto) { return this.planningService.moveAssignment(this.org(user), this.actor(user), id, dto); }
  @Delete('assignments/:id') deleteAssignment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.deleteAssignment(this.org(user), this.actor(user), id); }

  @Get('requirements') requirements(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listNeeds(this.org(user), q); }
  @Post('requirements') createRequirement(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPlanningNeedDto) { return this.planningService.createNeed(this.org(user), this.actor(user), dto); }
  @Patch('requirements/:id') updateRequirement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertPlanningNeedDto) { return this.planningService.updateNeed(this.org(user), this.actor(user), id, dto); }
  @Delete('requirements/:id') deleteRequirement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.deleteNeed(this.org(user), this.actor(user), id); }
  @Get('needs') needs(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listNeeds(this.org(user), q); }

  @Get('absences') absences(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listAbsences(this.org(user), q); }
  @Post('absences') createAbsence(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertHrAbsenceDto) { return this.planningService.createAbsence(this.org(user), this.actor(user), dto); }
  @Patch('absences/:id') updateAbsence(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertHrAbsenceDto) { return this.planningService.updateAbsence(this.org(user), this.actor(user), id, dto); }

  @Get('replacements') replacements(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listReplacements(this.org(user), q); }
  @Post('replacements/propose') proposeReplacements(@CurrentUser() user: AuthenticatedUser) { return this.planningService.proposeReplacements(this.org(user), this.actor(user)); }
  @Post('replacements/:id/accept') acceptReplacement(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AcceptReplacementDto) { return this.planningService.acceptReplacement(this.org(user), this.actor(user), id, dto); }

  @Get('templates') templates(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listTemplates(this.org(user), q); }
  @Post('templates') createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPlanningTemplateDto) { return this.planningService.createTemplate(this.org(user), this.actor(user), dto); }
  @Get('templates/day-presets') dayPresets(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listDayPresets(this.org(user), q); }
  @Post('templates/day-presets') createDayPreset(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertDayPresetDto) { return this.planningService.createDayPreset(this.org(user), this.actor(user), dto); }
  @Patch('templates/day-presets/:id') updateDayPreset(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertDayPresetDto) { return this.planningService.updateDayPreset(this.org(user), this.actor(user), id, dto); }
  @Delete('templates/day-presets/:id') deleteDayPreset(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.archiveTemplate(this.org(user), this.actor(user), id, 'DAY_PRESET'); }
  @Get('templates/weekly-rotations') weeklyRotations(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listWeeklyRotationTemplates(this.org(user), q); }
  @Post('templates/weekly-rotations') createWeeklyRotation(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertWeeklyRotationDto) { return this.planningService.createWeeklyRotationTemplate(this.org(user), this.actor(user), dto); }
  @Patch('templates/weekly-rotations/:id') updateWeeklyRotation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertWeeklyRotationDto) { return this.planningService.updateWeeklyRotationTemplate(this.org(user), this.actor(user), id, dto); }
  @Delete('templates/weekly-rotations/:id') deleteWeeklyRotation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.archiveTemplate(this.org(user), this.actor(user), id, 'WEEKLY_ROTATION'); }
  @Post('templates/employee-assignments') setEmployeeTemplates(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetEmployeePlanningTemplatesDto) { return this.planningService.setEmployeeTemplateAssignments(this.org(user), this.actor(user), dto); }
  @Patch('templates/:id') updateTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertPlanningTemplateDto) { return this.planningService.updateTemplate(this.org(user), this.actor(user), id, dto); }
  @Delete('templates/:id') deleteTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.archiveTemplate(this.org(user), this.actor(user), id); }
  @Post('templates/:id/apply') applyTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ApplyPlanningTemplateDto) { return this.planningService.applyTemplate(this.org(user), this.actor(user), id, dto); }

  @Post('generate') generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: GeneratePlanningDto) { return this.planningService.generate(this.org(user), this.actor(user), dto); }
  @Post('generate/:id/apply') applyGeneration(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.applyGeneration(this.org(user), this.actor(user), id); }

  @Get('history') history(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listHistory(this.org(user), q); }
  @Post('history/archive') archiveHistory(@CurrentUser() user: AuthenticatedUser, @Body() body: { startDate: string; endDate: string }) { return this.planningService.archiveHistory(this.org(user), this.actor(user), body.startDate, body.endDate); }

  @Get('notifications') notifications(@CurrentUser() user: AuthenticatedUser) { return this.planningService.listNotifications(this.org(user), user.id); }
  @Post('notifications/:id/read') readNotification(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.markNotificationRead(this.org(user), id); }

  @Post('exports') prepareExport(@CurrentUser() user: AuthenticatedUser, @Body() dto: PrepareExportDto) { return this.planningService.prepareExport(this.org(user), this.actor(user), dto); }

  @Get('rotations') rotations(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listPlanningRotations(this.org(user), q); }
  @Get('employees/:id/rotations') employeeRotations(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.getEmployeePlanningRotations(this.org(user), id); }
  @Post('rotations/:id/preview') rotationPreview(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PlanningRotationPreviewDto) { return this.planningService.applyWeeklyRotationPreview(this.org(user), id, dto); }
  @Post('rotations/:id/apply') rotationApply(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ApplyPlanningRotationDto) { return this.planningService.applyWeeklyRotation(this.org(user), this.actor(user), id, dto); }

  @Get('skills') skills(@CurrentUser() user: AuthenticatedUser) { return this.planningService.listSkills(this.org(user)); }
  @Post('skills') createSkill(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertHrSkillDto) { return this.planningService.createSkill(this.org(user), this.actor(user), dto); }
  @Post('employees/:id/skills') setEmployeeSkills(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetEmployeeSkillsDto) { return this.planningService.setEmployeeSkills(this.org(user), this.actor(user), id, dto.skillIds); }
}

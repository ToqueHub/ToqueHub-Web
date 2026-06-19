import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AcceptReplacementDto, ApplyPlanningTemplateDto, GeneratePlanningDto, MovePlanningAssignmentDto, PlanningQueryDto, PrepareExportDto, SetEmployeeSkillsDto, UpsertHrAbsenceDto, UpsertHrSkillDto, UpsertPlanningAssignmentDto, UpsertPlanningNeedDto, UpsertPlanningTemplateDto } from './dto/planning.dto';
import { PlanningService } from './planning.service';

@ApiTags('planning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('planning')
export class PlanningController {
  constructor(private readonly planningService: PlanningService) {}
  private org(user: AuthenticatedUser) { if (!user.organizationId) throw new BadRequestException('Organization setup is required before using Planning endpoints'); return user.organizationId; }
  private actor(user: AuthenticatedUser) { return { id: user.id, role: user.role }; }

  @Get('bootstrap') bootstrap(@CurrentUser() user: AuthenticatedUser) { return this.planningService.bootstrap(this.org(user)); }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) { return this.planningService.dashboard(this.org(user)); }

  @Get('assignments') assignments(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listAssignments(this.org(user), q); }
  @Post('assignments') createAssignment(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPlanningAssignmentDto) { return this.planningService.createAssignment(this.org(user), this.actor(user), dto); }
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
  @Post('templates/:id/apply') applyTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ApplyPlanningTemplateDto) { return this.planningService.applyTemplate(this.org(user), this.actor(user), id, dto); }

  @Post('generate') generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: GeneratePlanningDto) { return this.planningService.generate(this.org(user), this.actor(user), dto); }
  @Post('generate/:id/apply') applyGeneration(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.applyGeneration(this.org(user), this.actor(user), id); }

  @Get('history') history(@CurrentUser() user: AuthenticatedUser, @Query() q: PlanningQueryDto) { return this.planningService.listHistory(this.org(user), q); }
  @Post('history/archive') archiveHistory(@CurrentUser() user: AuthenticatedUser, @Body() body: { startDate: string; endDate: string }) { return this.planningService.archiveHistory(this.org(user), this.actor(user), body.startDate, body.endDate); }

  @Get('notifications') notifications(@CurrentUser() user: AuthenticatedUser) { return this.planningService.listNotifications(this.org(user), user.id); }
  @Post('notifications/:id/read') readNotification(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.planningService.markNotificationRead(this.org(user), id); }

  @Post('exports') prepareExport(@CurrentUser() user: AuthenticatedUser, @Body() dto: PrepareExportDto) { return this.planningService.prepareExport(this.org(user), this.actor(user), dto); }

  @Get('skills') skills(@CurrentUser() user: AuthenticatedUser) { return this.planningService.listSkills(this.org(user)); }
  @Post('skills') createSkill(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertHrSkillDto) { return this.planningService.createSkill(this.org(user), this.actor(user), dto); }
  @Post('employees/:id/skills') setEmployeeSkills(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetEmployeeSkillsDto) { return this.planningService.setEmployeeSkills(this.org(user), this.actor(user), id, dto.skillIds); }
}

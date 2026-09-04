import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlanningReadGuard } from './planning-access';
import { PlanningAttendanceService } from './planning-attendance.service';
import { MyPlanningExportPdfQueryDto, PlanningAttendanceQueryDto, SubmitMyPlanningAttendanceDto } from './dto/planning.dto';
import { PlanningService } from './planning.service';

@ApiTags('planning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlanningReadGuard)
@Controller('planning/me')
export class PlanningSelfController {
  constructor(
    private readonly attendanceService: PlanningAttendanceService,
    private readonly planningService: PlanningService,
  ) {}

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required before using Planning endpoints');
    return user.organizationId;
  }

  private actor(user: AuthenticatedUser) {
    return { id: user.id, role: user.role, permissions: user.permissions, employeeId: user.employeeId };
  }

  @Get()
  schedule(@CurrentUser() user: AuthenticatedUser, @Query() query: PlanningAttendanceQueryDto) {
    return this.attendanceService.mySchedule(this.org(user), this.actor(user), query);
  }

  @Get('exports/pdf')
  async exportPdf(@CurrentUser() user: AuthenticatedUser, @Query() query: MyPlanningExportPdfQueryDto, @Res() res: Response) {
    const file = await this.planningService.exportMyPlanningPdf(this.org(user), this.actor(user), query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }

  @Post('assignments/:id/check-in')
  checkIn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.attendanceService.checkIn(this.org(user), this.actor(user), id);
  }

  @Post('assignments/:id/check-out')
  checkOut(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.attendanceService.checkOut(this.org(user), this.actor(user), id);
  }

  @Post('assignments/:id/submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SubmitMyPlanningAttendanceDto) {
    return this.attendanceService.submitMine(this.org(user), this.actor(user), id, dto);
  }
}

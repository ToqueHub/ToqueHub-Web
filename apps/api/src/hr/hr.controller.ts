import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AssignHrRotationDto, ChangeEmployeeRotationDto, HrListQueryDto, RemoveHrRotationDto, UpsertHrEmployeeDto, UpsertHrReferenceDto, UpsertHrRotationDto } from './dto/hr.dto';
import { HrService } from './hr.service';

@ApiTags('hr')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('hr')
export class HrController {
  constructor(private readonly hrService: HrService) {}
  private org(user: AuthenticatedUser) { if (!user.organizationId) throw new BadRequestException('Organization setup is required before using RH endpoints'); return user.organizationId; }
  private actor(user: AuthenticatedUser) { return { id: user.id, role: user.role }; }

  @Post('install') install(@CurrentUser() user: AuthenticatedUser) { return this.hrService.installDefaults(this.org(user), this.actor(user)); }
  @Post('uninstall') uninstall(@CurrentUser() user: AuthenticatedUser) { return this.hrService.uninstall(this.org(user), this.actor(user)); }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) { return this.hrService.dashboard(this.org(user)); }
  @Get('org-chart') orgChart(@CurrentUser() user: AuthenticatedUser, @Query('departmentId') departmentId?: string) { return this.hrService.orgChart(this.org(user), departmentId); }
  @Get('users/available') users(@CurrentUser() user: AuthenticatedUser) { return this.hrService.listAssignableUsers(this.org(user)); }

  @Get('departments') departments(@CurrentUser() user: AuthenticatedUser, @Query() q: HrListQueryDto) { return this.hrService.listDepartments(this.org(user), q); }
  @Post('departments') createDepartment(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertHrReferenceDto) { return this.hrService.createDepartment(this.org(user), this.actor(user), dto); }
  @Patch('departments/:id') updateDepartment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertHrReferenceDto) { return this.hrService.updateDepartment(this.org(user), this.actor(user), id, dto); }
  @Post('departments/:id/archive') archiveDepartment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.hrService.archiveDepartment(this.org(user), this.actor(user), id); }

  @Get('positions') positions(@CurrentUser() user: AuthenticatedUser, @Query() q: HrListQueryDto) { return this.hrService.listPositions(this.org(user), q); }
  @Post('positions') createPosition(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertHrReferenceDto) { return this.hrService.createPosition(this.org(user), this.actor(user), dto); }
  @Patch('positions/:id') updatePosition(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertHrReferenceDto) { return this.hrService.updatePosition(this.org(user), this.actor(user), id, dto); }
  @Post('positions/:id/archive') archivePosition(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.hrService.archivePosition(this.org(user), this.actor(user), id); }

  @Get('rotations/available-employees') availableEmployees(@CurrentUser() user: AuthenticatedUser, @Query('rotationId') rotationId: string) { return this.hrService.listAvailableEmployeesForRotation(this.org(user), rotationId); }
  @Get('rotations') rotations(@CurrentUser() user: AuthenticatedUser, @Query() q: HrListQueryDto) { return this.hrService.listRotations(this.org(user), q); }
  @Get('rotations/:id') rotation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.hrService.getRotation(this.org(user), id); }
  @Post('rotations') createRotation(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertHrRotationDto) { return this.hrService.createRotation(this.org(user), this.actor(user), dto); }
  @Patch('rotations/:id') updateRotation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertHrRotationDto) { return this.hrService.updateRotation(this.org(user), this.actor(user), id, dto); }
  @Post('rotations/:id/archive') archiveRotation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.hrService.archiveRotation(this.org(user), this.actor(user), id); }
  @Get('rotations/:id/available-employees') availableEmployeesForRotation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.hrService.listAvailableEmployeesForRotation(this.org(user), id); }
  @Get('rotations/:id/assignments') rotationAssignments(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.hrService.listRotationAssignments(this.org(user), id); }
  @Post('rotations/:id/assignments') assignRotation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AssignHrRotationDto) { return this.hrService.assignRotation(this.org(user), this.actor(user), id, dto); }
  @Post('rotations/:id/assignments/:employeeId/remove') removeRotationAssignment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('employeeId') employeeId: string, @Body() dto: RemoveHrRotationDto) { return this.hrService.removeRotationAssignment(this.org(user), this.actor(user), id, employeeId, dto); }
  @Delete('rotations/:id/assignments/:employeeId') deleteRotationAssignment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('employeeId') employeeId: string) { return this.hrService.removeRotationAssignment(this.org(user), this.actor(user), id, employeeId, {}); }

  @Get('employees') employees(@CurrentUser() user: AuthenticatedUser, @Query() q: HrListQueryDto) { return this.hrService.listEmployees(this.org(user), q); }
  @Get('employees/:id') employee(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.hrService.getEmployee(this.org(user), id); }
  @Post('employees') createEmployee(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertHrEmployeeDto) { return this.hrService.createEmployee(this.org(user), this.actor(user), dto); }
  @Patch('employees/:id') updateEmployee(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertHrEmployeeDto) { return this.hrService.updateEmployee(this.org(user), this.actor(user), id, dto); }
  @Patch('employees/:id/rotation') setEmployeeRotation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ChangeEmployeeRotationDto) { return this.hrService.changeEmployeeRotation(this.org(user), this.actor(user), id, dto); }
  @Delete('employees/:id/rotation') removeEmployeeRotation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.hrService.removeEmployeeRotation(this.org(user), this.actor(user), id); }
  @Post('employees/:id/archive') archiveEmployee(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.hrService.archiveEmployee(this.org(user), this.actor(user), id); }
}

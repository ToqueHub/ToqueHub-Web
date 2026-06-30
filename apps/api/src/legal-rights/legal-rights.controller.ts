import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { ActivateLegalRightDto, ApplicableEmployeeRightsQueryDto, CalculateLegalRightsDto, EstablishmentRightsRecommendationsQueryDto, LegalProfileDto, LegalRightsSearchQueryDto, PlanningComplianceCheckDto } from './dto/legal-rights.dto';
import { LegalRightsService } from './legal-rights.service';

@ApiTags('rights')
@ApiBearerAuth()
@UseGuards(OptionalJwtAuthGuard)
@Controller('rights/onboarding')
export class LegalRightsOnboardingController {
  constructor(private readonly legalRightsService: LegalRightsService) {}

  @Get('recommendations')
  recommendations(@CurrentUser() user: AuthenticatedUser | null, @Query() q: EstablishmentRightsRecommendationsQueryDto) {
    return this.legalRightsService.establishmentRightsRecommendations(q, user?.organizationId ?? undefined);
  }
}

@ApiTags('rights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rights')
export class LegalRightsController {
  constructor(private readonly legalRightsService: LegalRightsService) {}

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required before using rights endpoints');
    return user.organizationId;
  }

  @Get('search')
  search(@CurrentUser() user: AuthenticatedUser, @Query() q: LegalRightsSearchQueryDto) {
    return this.legalRightsService.search(q, user.organizationId ?? undefined);
  }

  @Get('diagnostics')
  diagnostics(@CurrentUser() user: AuthenticatedUser) {
    return this.legalRightsService.diagnostics(user.organizationId ?? undefined);
  }

  @Post('calculate')
  calculate(@CurrentUser() user: AuthenticatedUser, @Body() dto: CalculateLegalRightsDto) {
    return this.legalRightsService.calculate(this.org(user), dto);
  }

  @Get('employees/:employeeId/applicable')
  employeeApplicableRights(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Query() q: ApplicableEmployeeRightsQueryDto) {
    return this.legalRightsService.employeeApplicableRights(this.org(user), employeeId, q);
  }

  @Get('employees/:employeeId/overview')
  employeeRightsOverview(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Query() q: ApplicableEmployeeRightsQueryDto) {
    return this.legalRightsService.employeeRightsOverview(this.org(user), employeeId, q);
  }

  @Get('employees/:employeeId/profile')
  employeeProfile(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Query('effectiveDate') effectiveDate?: string) {
    return this.legalRightsService.employeeProfile(this.org(user), employeeId, effectiveDate);
  }

  @Put('employees/:employeeId/profile')
  upsertEmployeeProfile(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string, @Body() dto: LegalProfileDto) {
    return this.legalRightsService.upsertEmployeeProfile(this.org(user), employeeId, dto);
  }

  @Post('import/fr-v1')
  importFranceV1() {
    return this.legalRightsService.importFranceV1();
  }

  @Post(':id/activate')
  activate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ActivateLegalRightDto) {
    return this.legalRightsService.activateRight(this.org(user), { id: user.id, role: user.role }, id, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.legalRightsService.detail(id, user.organizationId ?? undefined);
  }
}

@ApiTags('planning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('planning/compliance')
export class PlanningComplianceController {
  constructor(private readonly legalRightsService: LegalRightsService) {}

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required before using Planning endpoints');
    return user.organizationId;
  }

  @Post('check')
  check(@CurrentUser() user: AuthenticatedUser, @Body() dto: PlanningComplianceCheckDto) {
    return this.legalRightsService.planningCompliance(this.org(user), dto);
  }
}

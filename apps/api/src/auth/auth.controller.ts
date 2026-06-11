import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from './authenticated-user';
import { AuthService } from './auth.service';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { SetupOrganizationDto } from './dto/setup-organization.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { LoginDto } from './dto/login.dto';

export class PrefillStocksDto {
  @IsOptional()
  @IsBoolean()
  categories?: boolean;

  @IsOptional()
  @IsBoolean()
  units?: boolean;

  @IsOptional()
  @IsBoolean()
  sites?: boolean;

  @IsOptional()
  @IsBoolean()
  locations?: boolean;

  @IsOptional()
  @IsBoolean()
  examples?: boolean;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap-admin')
  @ApiOkResponse({ description: 'Creates the first system administrator. Disabled once an admin exists.' })
  bootstrapAdmin(@Body() dto: BootstrapAdminDto) {
    return this.authService.bootstrapAdmin(dto);
  }

  @Post('setup-organization')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Creates the first organization and attaches it to the current administrator.' })
  setupOrganization(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetupOrganizationDto) {
    return this.authService.setupOrganization(user, dto);
  }

  @Post('complete-onboarding')
  @ApiOkResponse({ description: 'Creates the first administrator, organization and main site in one premium onboarding transaction.' })
  completeOnboarding(@Body() dto: CompleteOnboardingDto) {
    return this.authService.completeOnboarding(dto);
  }

  @Get('dashboard-summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Returns organization, installed apps and onboarding progress for the dashboard.' })
  dashboardSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getDashboardSummary(user);
  }

  @Post('apps/stocks/install')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Installs the Stocks application for the current organization.' })
  installStocks(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.installStocksApplication(user);
  }

  @Post('apps/stocks/prefill')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Prefills Stocks reference data for the current organization.' })
  prefillStocks(@CurrentUser() user: AuthenticatedUser, @Body() dto: PrefillStocksDto) {
    return this.authService.prefillStocksApplication(user, dto);
  }

  @Post('apps/stocks/uninstall')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Uninstalls the Stocks application for the current organization without deleting business data.' })
  uninstallStocks(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.uninstallStocksApplication(user);
  }

  @Post('login')
  @ApiOkResponse({ description: 'Returns a JWT access token.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentSession(user);
  }
}

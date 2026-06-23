import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from './authenticated-user';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
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
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

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

  @Post('apps/hr/install')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Installs the RH application and starts the guided setup.' })
  installHr(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.installHrApplication(user);
  }

  @Post('apps/hr/uninstall')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Uninstalls RH from navigation while preserving collaborators.' })
  uninstallHr(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.uninstallHrApplication(user);
  }

  @Post('apps/planning/install')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Installs the Planning application for the current organization.' })
  installPlanning(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.installPlanningApplication(user);
  }

  @Post('apps/planning/uninstall')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Uninstalls Planning from navigation while preserving planning data.' })
  uninstallPlanning(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.uninstallPlanningApplication(user);
  }

  @Post('apps/production/install')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Installs Production after Stocks and Technical Sheets without duplicating source repositories.' })
  installProduction(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.installProductionApplication(user);
  }

  @Post('apps/production/uninstall')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Uninstalls Production from navigation while preserving orders and audit history.' })
  uninstallProduction(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.uninstallProductionApplication(user);
  }

  @Post('apps/rnm-prices/install')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Installs the Cours des Produits application for the current organization.' })
  installRnmPrices(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.installRnmPricesApplication(user);
  }

  @Post('apps/rnm-prices/uninstall')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Uninstalls Cours des Produits from navigation while preserving user favorites.' })
  uninstallRnmPrices(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.uninstallRnmPricesApplication(user);
  }

  @Get('dev-switch/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Returns development/demo user switch availability.' })
  devSwitchConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getDevSwitchConfig(user);
  }

  @Post('dev-switch/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Switches current session to another organization user when enabled for development/demo.' })
  devSwitch(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.usersService.devSwitch(user, userId);
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

import { Body, BadRequestException, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required before using dashboard endpoints');
    return user.organizationId;
  }

  @Get()
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getDashboard(user.id, this.org(user));
  }

  @Get('address-suggestions')
  addressSuggestions(@Query('q') query = '', @Query('country') country = 'FR') {
    return this.dashboardService.addressSuggestions(query, country);
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.dashboardService.updatePreferences(user.id, this.org(user), body);
  }

  @Post('preferences/reset')
  resetPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.resetPreferences(user.id, this.org(user));
  }
}

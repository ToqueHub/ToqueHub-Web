import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/authenticated-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AssignSensorDto, ListSensorReadingsDto, PairingStartDto, RenameSensorDto, UpdateSensorDto, UpdateSensorNotificationSettingsDto } from './dto/haccp-sensors.dto';
import { HaccpSensorsService } from './haccp-sensors.service';

@ApiTags('haccp-sensors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('haccp/sensors')
export class HaccpSensorsController {
  constructor(private readonly service: HaccpSensorsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.service.summary(this.org(user));
  }

  @Get('gateway/status')
  gatewayStatus() {
    return this.service.gatewayStatus();
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(this.org(user));
  }

  @Get('alerts/temperature')
  temperatureAlerts(@CurrentUser() user: AuthenticatedUser) {
    return this.service.temperatureAlerts(this.org(user));
  }

  @Get('alerts/notification-settings')
  notificationSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.service.notificationSettings(this.org(user));
  }

  @Patch('alerts/notification-settings')
  updateNotificationSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateSensorNotificationSettingsDto) {
    return this.service.updateNotificationSettings(this.org(user), dto);
  }

  @Post('alerts/:alertId/test-push')
  testAlertPush(@CurrentUser() user: AuthenticatedUser, @Param('alertId') alertId: string) {
    return this.service.testTemperatureAlertPush(this.org(user), alertId);
  }

  @Post('pairing/start')
  startPairing(@CurrentUser() user: AuthenticatedUser, @Body() dto: PairingStartDto) {
    return this.service.startPairing(this.org(user), this.actor(user), dto);
  }

  @Post('pairing/stop')
  stopPairing(@CurrentUser() user: AuthenticatedUser) {
    return this.service.stopPairing(this.org(user), this.actor(user));
  }

  @Get('pairing/current')
  currentPairing(@CurrentUser() user: AuthenticatedUser) {
    return this.service.currentPairing(this.org(user));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.get(this.org(user), id);
  }

  @Get(':id/readings')
  readings(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: ListSensorReadingsDto) {
    return this.service.readings(this.org(user), id, query);
  }

  @Get(':id/events')
  events(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.events(this.org(user), id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSensorDto) {
    return this.service.update(this.org(user), id, dto);
  }

  @Post(':id/assign')
  assign(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AssignSensorDto) {
    return this.service.assign(this.org(user), this.actor(user), id, dto);
  }

  @Post(':id/unassign')
  unassign(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.unassign(this.org(user), this.actor(user), id);
  }

  @Post(':id/rename')
  rename(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RenameSensorDto) {
    return this.service.rename(this.org(user), this.actor(user), id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query('removeFromNetwork') removeFromNetwork?: string) {
    return this.service.remove(this.org(user), this.actor(user), id, removeFromNetwork === 'true');
  }

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required before using HACCP sensor endpoints');
    return user.organizationId;
  }

  private actor(user: AuthenticatedUser) {
    return { id: user.id, role: user.role };
  }
}

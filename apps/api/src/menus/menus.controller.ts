import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GenerateProductionsDto, GuestForecastDto, HistoryQueryDto, MenuQueryDto, PrepareMenuExportDto, ReplicateCycleDto, UpdateGuestForecastsDto, UpdateMenuStatusDto, UpsertCycleDto, UpsertDietDto, UpsertGuestGroupDto, UpsertMenuDto, UpsertMenuVariantDto } from './dto/menus.dto';
import { MenusService } from './menus.service';

@ApiTags('menus')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('menus')
export class MenusController {
  constructor(private readonly service: MenusService) {}
  private org(user: AuthenticatedUser) { if (!user.organizationId) throw new BadRequestException('Organization setup is required'); return user.organizationId; }
  private actor(user: AuthenticatedUser) { return { id: user.id, role: user.role }; }

  @Post('install') install(@CurrentUser() user: AuthenticatedUser) { return this.service.install(this.org(user), this.actor(user)); }
  @Post('uninstall') uninstall(@CurrentUser() user: AuthenticatedUser) { return this.service.uninstall(this.org(user), this.actor(user)); }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) { return this.service.dashboard(this.org(user)); }

  @Get('menus') listMenus(@CurrentUser() user: AuthenticatedUser, @Query() q: MenuQueryDto) { return this.service.listMenus(this.org(user), q); }
  @Post('menus') createMenu(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertMenuDto) { return this.service.createMenu(this.org(user), this.actor(user), dto); }
  @Get('menus/:id') getMenu(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getMenu(this.org(user), id); }
  @Patch('menus/:id') updateMenu(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertMenuDto) { return this.service.updateMenu(this.org(user), this.actor(user), id, dto); }
  @Post('menus/:id/status') changeStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateMenuStatusDto) { return this.service.changeStatus(this.org(user), this.actor(user), id, dto); }
  @Post('menus/:id/guests') updateGuests(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateGuestForecastsDto) { return this.service.updateGuests(this.org(user), this.actor(user), id, dto); }
  @Post('menus/:id/variants') createVariant(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertMenuVariantDto) { return this.service.upsertVariant(this.org(user), this.actor(user), id, dto); }
  @Patch('menus/:id/variants/:variantId') updateVariant(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('variantId') variantId: string, @Body() dto: UpsertMenuVariantDto) { return this.service.upsertVariant(this.org(user), this.actor(user), id, dto, variantId); }
  @Post('menus/:id/generate-productions') generateProductions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: GenerateProductionsDto) { return this.service.generateProductions(this.org(user), this.actor(user), id, dto); }

  @Get('calendar') calendar(@CurrentUser() user: AuthenticatedUser, @Query() q: MenuQueryDto) { return this.service.calendar(this.org(user), q); }

  @Get('cycles') cycles(@CurrentUser() user: AuthenticatedUser, @Query() q: MenuQueryDto) { return this.service.cycles(this.org(user), q); }
  @Post('cycles') createCycle(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertCycleDto) { return this.service.upsertCycle(this.org(user), this.actor(user), dto); }
  @Patch('cycles/:id') updateCycle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertCycleDto) { return this.service.upsertCycle(this.org(user), this.actor(user), dto, id); }
  @Post('cycles/:id/replicate') replicateCycle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReplicateCycleDto) { return this.service.replicateCycle(this.org(user), this.actor(user), id, dto); }

  @Get('diets') diets(@CurrentUser() user: AuthenticatedUser) { return this.service.diets(this.org(user)); }
  @Post('diets') createDiet(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertDietDto) { return this.service.upsertDiet(this.org(user), this.actor(user), dto); }
  @Patch('diets/:id') updateDiet(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertDietDto) { return this.service.upsertDiet(this.org(user), this.actor(user), dto, id); }

  @Get('guest-groups') guestGroups(@CurrentUser() user: AuthenticatedUser) { return this.service.guestGroups(this.org(user)); }
  @Post('guest-groups') createGuestGroup(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertGuestGroupDto) { return this.service.upsertGuestGroup(this.org(user), this.actor(user), dto); }
  @Patch('guest-groups/:id') updateGuestGroup(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertGuestGroupDto) { return this.service.upsertGuestGroup(this.org(user), this.actor(user), dto, id); }

  @Get('exports') exports(@CurrentUser() user: AuthenticatedUser, @Query() q: MenuQueryDto) { return this.service.exports(this.org(user), q); }
  @Post('exports') prepareExport(@CurrentUser() user: AuthenticatedUser, @Body() dto: PrepareMenuExportDto) { return this.service.prepareExport(this.org(user), this.actor(user), dto); }
  @Get('history') history(@CurrentUser() user: AuthenticatedUser, @Query() q: HistoryQueryDto) { return this.service.historyList(this.org(user), q); }
}

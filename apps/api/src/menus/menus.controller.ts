import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CatererClientQueryDto, CatererEventQueryDto, GenerateCatererEventProductionsDto, GenerateProductionsDto, HistoryQueryDto, MenuAvailabilityQueryDto, MenuQueryDto, PlanMenuShortagesDto, PrepareMenuExportDto, ReplicateCycleDto, UpdateCatererEventStatusDto, UpdateGuestForecastsDto, UpdateMenuDispatchStatusDto, UpdateMenuSettingsDto, UpdateMenuStatusDto, UpsertCatererClientDto, UpsertCatererEventDto, UpsertCycleDto, UpsertDietDto, UpsertGuestGroupDto, UpsertMenuCategoryDto, UpsertMenuDto, UpsertMenuVariantDto } from './dto/menus.dto';
import { CatererMenusService } from './caterer-menus.service';
import { MenuExportsService } from './menu-exports.service';
import { MenusService } from './menus.service';

@ApiTags('menus')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('menus')
export class MenusController {
  constructor(private readonly service: MenusService, private readonly exportService: MenuExportsService, private readonly caterer: CatererMenusService) {}
  private org(user: AuthenticatedUser) { if (!user.organizationId) throw new BadRequestException('Organization setup is required'); return user.organizationId; }
  private actor(user: AuthenticatedUser) { return { id: user.id, role: user.role }; }

  @Post('install') install(@CurrentUser() user: AuthenticatedUser) { return this.service.install(this.org(user), this.actor(user)); }
  @Post('uninstall') uninstall(@CurrentUser() user: AuthenticatedUser) { return this.service.uninstall(this.org(user), this.actor(user)); }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthenticatedUser, @Query('activity') activity?: string) { return this.service.dashboard(this.org(user), activity); }
  @Get('settings') settings(@CurrentUser() user: AuthenticatedUser) { return this.service.settings(this.org(user)); }
  @Patch('settings') updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMenuSettingsDto) { return this.service.updateSettings(this.org(user), this.actor(user), dto); }
  @Get('categories') categories(@CurrentUser() user: AuthenticatedUser) { return this.service.categories(this.org(user)); }
  @Post('categories') createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertMenuCategoryDto) { return this.service.upsertCategory(this.org(user), this.actor(user), dto); }
  @Patch('categories/:id') updateCategory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertMenuCategoryDto) { return this.service.upsertCategory(this.org(user), this.actor(user), dto, id); }

  @Get('menus') listMenus(@CurrentUser() user: AuthenticatedUser, @Query() q: MenuQueryDto) { return this.service.listMenus(this.org(user), q); }
  @Post('menus') createMenu(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertMenuDto) { return this.service.createMenu(this.org(user), this.actor(user), dto); }
  @Get('menus/:id') getMenu(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getMenu(this.org(user), id); }
  @Patch('menus/:id') updateMenu(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertMenuDto) { return this.service.updateMenu(this.org(user), this.actor(user), id, dto); }
  @Post('menus/:id/status') changeStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateMenuStatusDto) { return this.service.changeStatus(this.org(user), this.actor(user), id, dto); }
  @Post('menus/:id/guests') updateGuests(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateGuestForecastsDto) { return this.service.updateGuests(this.org(user), this.actor(user), id, dto); }
  @Post('menus/:id/variants') createVariant(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertMenuVariantDto) { return this.service.upsertVariant(this.org(user), this.actor(user), id, dto); }
  @Patch('menus/:id/variants/:variantId') updateVariant(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('variantId') variantId: string, @Body() dto: UpsertMenuVariantDto) { return this.service.upsertVariant(this.org(user), this.actor(user), id, dto, variantId); }
  @Post('menus/:id/generate-productions') generateProductions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: GenerateProductionsDto) { return this.service.generateProductions(this.org(user), this.actor(user), id, dto); }
  @Get('menus/:id/availability') availability(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() q: MenuAvailabilityQueryDto) { return this.service.availability(this.org(user), id, q.siteId); }
  @Post('menus/:id/plan-shortages') planShortages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PlanMenuShortagesDto) { return this.service.planShortages(this.org(user), this.actor(user), id, dto); }
  @Get('menus/:id/central-document/:kind') async centralDocument(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('kind') kind: string, @Res() response: Response) {
    const file = await this.service.centralDocument(this.org(user), this.actor(user), id, kind.toUpperCase());
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', this.contentDisposition('attachment', file.filename));
    response.send(file.buffer);
  }

  @Get('calendar') calendar(@CurrentUser() user: AuthenticatedUser, @Query() q: MenuQueryDto) { return this.service.calendar(this.org(user), q); }

  @Get('cycles') cycles(@CurrentUser() user: AuthenticatedUser, @Query() q: MenuQueryDto) { return this.service.cycles(this.org(user), q); }
  @Post('cycles') createCycle(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertCycleDto) { return this.service.upsertCycle(this.org(user), this.actor(user), dto); }
  @Patch('cycles/:id') updateCycle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertCycleDto) { return this.service.upsertCycle(this.org(user), this.actor(user), dto, id); }
  @Post('cycles/:id/replicate') replicateCycle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReplicateCycleDto) { return this.service.replicateCycle(this.org(user), this.actor(user), id, dto); }
  @Get('dispatches') dispatches(@CurrentUser() user: AuthenticatedUser, @Query() q: any) { return this.service.dispatches(this.org(user), q); }
  @Patch('dispatches/:id/status') updateDispatchStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateMenuDispatchStatusDto) { return this.service.updateDispatchStatus(this.org(user), this.actor(user), id, dto.status); }

  @Get('caterer/dashboard') catererDashboard(@CurrentUser() user: AuthenticatedUser) { return this.caterer.dashboard(this.org(user)); }
  @Get('caterer/clients') catererClients(@CurrentUser() user: AuthenticatedUser, @Query() q: CatererClientQueryDto) { return this.caterer.clients(this.org(user), q); }
  @Post('caterer/clients') createCatererClient(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertCatererClientDto) { return this.caterer.upsertClient(this.org(user), this.actor(user), dto); }
  @Patch('caterer/clients/:id') updateCatererClient(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertCatererClientDto) { return this.caterer.upsertClient(this.org(user), this.actor(user), dto, id); }
  @Get('caterer/events') catererEvents(@CurrentUser() user: AuthenticatedUser, @Query() q: CatererEventQueryDto) { return this.caterer.events(this.org(user), q); }
  @Post('caterer/events') createCatererEvent(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertCatererEventDto) { return this.caterer.upsertEvent(this.org(user), this.actor(user), dto); }
  @Get('caterer/events/:id') catererEvent(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.caterer.getEvent(this.org(user), id); }
  @Patch('caterer/events/:id') updateCatererEvent(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertCatererEventDto) { return this.caterer.upsertEvent(this.org(user), this.actor(user), dto, id); }
  @Patch('caterer/events/:id/status') updateCatererEventStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCatererEventStatusDto) { return this.caterer.changeStatus(this.org(user), this.actor(user), id, dto.status); }
  @Get('caterer/events/:id/readiness') catererEventReadiness(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.caterer.readiness(this.org(user), id); }
  @Post('caterer/events/:id/generate-productions') generateCatererEventProductions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: GenerateCatererEventProductionsDto) { return this.caterer.generateProductions(this.org(user), this.actor(user), id, dto); }
  @Get('caterer/events/:id/documents/:kind') async catererEventDocument(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('kind') kind: string, @Res() response: Response) {
    const file = await this.caterer.document(this.org(user), this.actor(user), id, kind.toUpperCase());
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', this.contentDisposition('attachment', file.filename));
    response.send(file.buffer);
  }

  @Get('diets') diets(@CurrentUser() user: AuthenticatedUser) { return this.service.diets(this.org(user)); }
  @Post('diets') createDiet(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertDietDto) { return this.service.upsertDiet(this.org(user), this.actor(user), dto); }
  @Patch('diets/:id') updateDiet(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertDietDto) { return this.service.upsertDiet(this.org(user), this.actor(user), dto, id); }

  @Get('guest-groups') guestGroups(@CurrentUser() user: AuthenticatedUser) { return this.service.guestGroups(this.org(user)); }
  @Post('guest-groups') createGuestGroup(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertGuestGroupDto) { return this.service.upsertGuestGroup(this.org(user), this.actor(user), dto); }
  @Patch('guest-groups/:id') updateGuestGroup(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertGuestGroupDto) { return this.service.upsertGuestGroup(this.org(user), this.actor(user), dto, id); }

  @Get('display-templates') displayTemplates(@CurrentUser() user: AuthenticatedUser) { return this.exportService.templates(this.org(user)); }
  @Post('display-templates')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 20 * 1024 * 1024 } }))
  uploadDisplayTemplate(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: any, @Body('name') name?: string) { return this.exportService.uploadTemplate(this.org(user), this.actor(user), name, file); }
  @Patch('display-templates/:id/default') setDefaultDisplayTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.exportService.setDefaultTemplate(this.org(user), this.actor(user), id); }
  @Delete('display-templates/:id') archiveDisplayTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.exportService.archiveTemplate(this.org(user), this.actor(user), id); }
  @Get('display-templates/:id/source') async displayTemplateSource(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() response: Response) {
    const file = await this.exportService.templateSource(this.org(user), id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', this.contentDisposition('inline', file.filename));
    response.send(file.buffer);
  }

  @Get('exports') exports(@CurrentUser() user: AuthenticatedUser, @Query('menuId') menuId?: string, @Query('activity') activity?: string) { return this.exportService.list(this.org(user), { menuId, activity }); }
  @Post('exports') prepareExport(@CurrentUser() user: AuthenticatedUser, @Body() dto: PrepareMenuExportDto) { return this.exportService.prepare(this.org(user), this.actor(user), dto); }
  @Get('exports/:id/download') async downloadExport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() response: Response) {
    const file = await this.exportService.download(this.org(user), id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', this.contentDisposition('attachment', file.filename));
    response.send(file.buffer);
  }
  @Get('history') history(@CurrentUser() user: AuthenticatedUser, @Query() q: HistoryQueryDto) { return this.service.historyList(this.org(user), q); }

  private contentDisposition(disposition: 'inline' | 'attachment', filename: string) {
    const fallback = String(filename || 'document.pdf')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'document.pdf';
    return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
}

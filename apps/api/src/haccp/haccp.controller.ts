import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AnalyzeImageDto,
  CleaningZoneDto,
  CompleteCleaningSessionDto,
  CompleteProcessSessionDto,
  CreateTemperatureEquipmentDto,
  CreateTemperatureReadingDto,
  HaccpProductDto,
  ListHaccpQueryDto,
  MarkSurfaceDto,
  OilEquipmentDto,
  OilSessionDto,
  ProcessEquipmentDto,
  ProcessSessionDto,
  ProductionSessionDto,
  ReceptionDto,
  TraceabilityDto,
  UpdateHaccpProductDto,
  UpdateOilEquipmentDto,
  UpdateProcessEquipmentDto,
  UpdateProcessSessionDto,
  UpdateReceptionDto,
  UpdateTraceabilityDto,
} from './dto/haccp.dto';
import { HaccpService } from './haccp.service';

@ApiTags('haccp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class HaccpController {
  constructor(private readonly service: HaccpService) {}

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required before using HACCP endpoints');
    return user.organizationId;
  }

  private actor(user: AuthenticatedUser) {
    return { id: user.id, role: user.role };
  }

  @Get('haccp/dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) { return this.service.dashboard(this.org(user)); }
  @Post('haccp/sync') sync(@CurrentUser() user: AuthenticatedUser, @Body() dto: any) { return this.service.syncOperations(this.org(user), this.actor(user), dto); }

  @Get('temperature/equipment') listTemperatureEquipment(@CurrentUser() user: AuthenticatedUser) { return this.service.listTemperatureEquipment(this.org(user)); }
  @Post('temperature/equipment') createTemperatureEquipment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTemperatureEquipmentDto) { return this.service.createTemperatureEquipment(this.org(user), this.actor(user), dto); }
  @Delete('temperature/equipment/:id') deleteTemperatureEquipment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteTemperatureEquipment(this.org(user), id); }
  @Get('temperature/readings') listTemperatureReadings(@CurrentUser() user: AuthenticatedUser) { return this.service.listTemperatureReadings(this.org(user)); }
  @Post('temperature/readings') createTemperatureReading(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTemperatureReadingDto) { return this.service.createTemperatureReading(this.org(user), this.actor(user), dto); }
  @Get('temperature/readings/:id') getTemperatureReading(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getTemperatureReading(this.org(user), id); }

  @Get('receptions') listReceptions(@CurrentUser() user: AuthenticatedUser) { return this.service.listReceptions(this.org(user)); }
  @Get('receptions/history') receptionHistory(@CurrentUser() user: AuthenticatedUser) { return this.service.listReceptions(this.org(user)); }
  @Post('receptions') createReception(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReceptionDto) { return this.service.createReception(this.org(user), this.actor(user), dto); }
  @Get('receptions/:id') getReception(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getReception(this.org(user), id); }
  @Put('receptions/:id') updateReception(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateReceptionDto) { return this.service.updateReception(this.org(user), id, dto); }
  @Delete('receptions/:id') deleteReception(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteReception(this.org(user), id); }

  @Get('traceability') listTraceability(@CurrentUser() user: AuthenticatedUser) { return this.service.listTraceability(this.org(user)); }
  @Post('traceability') createTraceability(@CurrentUser() user: AuthenticatedUser, @Body() dto: TraceabilityDto) { return this.service.createTraceability(this.org(user), this.actor(user), dto); }
  @Post('traceability/analyze-image') analyzeImage(@CurrentUser() user: AuthenticatedUser, @Body() dto: AnalyzeImageDto) { return this.service.analyzeImage(this.org(user), dto); }
  @Get('traceability/:id') getTraceability(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getTraceability(this.org(user), id); }
  @Put('traceability/:id') updateTraceability(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTraceabilityDto) { return this.service.updateTraceability(this.org(user), id, dto); }
  @Delete('traceability/:id') deleteTraceability(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteTraceability(this.org(user), id); }

  @Get('haccp-products') listProducts(@CurrentUser() user: AuthenticatedUser, @Query() q: ListHaccpQueryDto) { return this.service.listProducts(this.org(user), q.type); }
  @Post('haccp-products') createProduct(@CurrentUser() user: AuthenticatedUser, @Body() dto: HaccpProductDto) { return this.service.createProduct(this.org(user), this.actor(user), dto); }
  @Get('haccp-products/:id') getProduct(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getProduct(this.org(user), id); }
  @Put('haccp-products/:id') updateProduct(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateHaccpProductDto) { return this.service.updateProduct(this.org(user), id, dto); }
  @Delete('haccp-products/:id') deleteProduct(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteProduct(this.org(user), id); }

  @Get('cooling-equipment') listProcessEquipment(@CurrentUser() user: AuthenticatedUser, @Query() q: ListHaccpQueryDto) { return this.service.listProcessEquipment(this.org(user), q.type); }
  @Post('cooling-equipment') createProcessEquipment(@CurrentUser() user: AuthenticatedUser, @Body() dto: ProcessEquipmentDto) { return this.service.createProcessEquipment(this.org(user), this.actor(user), dto); }
  @Get('cooling-equipment/:id') getProcessEquipment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getProcessEquipment(this.org(user), id); }
  @Put('cooling-equipment/:id') updateProcessEquipment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateProcessEquipmentDto) { return this.service.updateProcessEquipment(this.org(user), id, dto); }
  @Delete('cooling-equipment/:id') deleteProcessEquipment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteProcessEquipment(this.org(user), id); }

  @Get('cooling/:type/sessions') listProcessSessions(@CurrentUser() user: AuthenticatedUser, @Param('type') type: string) { return this.service.listProcessSessions(this.org(user), type); }
  @Get('cooling/:type/sessions/today') listTodayProcessSessions(@CurrentUser() user: AuthenticatedUser, @Param('type') type: string) { return this.service.listTodayProcessSessions(this.org(user), type); }
  @Get('cooling/:type/available-productions') availableProcessProductions(@CurrentUser() user: AuthenticatedUser, @Param('type') type: string) { return this.service.listAvailableProcessProductions(this.org(user), type); }
  @Post('cooling/:type/sessions') createProcessSession(@CurrentUser() user: AuthenticatedUser, @Param('type') type: string, @Body() dto: ProcessSessionDto) { return this.service.createProcessSession(this.org(user), this.actor(user), type, dto); }
  @Get('cooling/sessions/:id') getProcessSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getProcessSession(this.org(user), id); }
  @Put('cooling/sessions/:id') updateProcessSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateProcessSessionDto) { return this.service.updateProcessSession(this.org(user), id, dto); }
  @Put('cooling/sessions/:id/complete') completeProcessSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CompleteProcessSessionDto) { return this.service.completeProcessSession(this.org(user), id, dto.endTemperature); }
  @Delete('cooling/sessions/:id') deleteProcessSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteProcessSession(this.org(user), id); }

  @Get('oil-equipment') listOilEquipment(@CurrentUser() user: AuthenticatedUser) { return this.service.listOilEquipment(this.org(user)); }
  @Post('oil-equipment') createOilEquipment(@CurrentUser() user: AuthenticatedUser, @Body() dto: OilEquipmentDto) { return this.service.createOilEquipment(this.org(user), this.actor(user), dto); }
  @Get('oil-equipment/:id') getOilEquipment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getOilEquipment(this.org(user), id); }
  @Put('oil-equipment/:id') updateOilEquipment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateOilEquipmentDto) { return this.service.updateOilEquipment(this.org(user), id, dto); }
  @Delete('oil-equipment/:id') deleteOilEquipment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteOilEquipment(this.org(user), id); }

  @Get('oil/sessions') listOilSessions(@CurrentUser() user: AuthenticatedUser, @Query() q: ListHaccpQueryDto) { return this.service.listOilSessions(this.org(user), q); }
  @Get('oil/sessions/today') listTodayOilSessions(@CurrentUser() user: AuthenticatedUser) { return this.service.listTodayOilSessions(this.org(user)); }
  @Post('oil/sessions') createOilSession(@CurrentUser() user: AuthenticatedUser, @Body() dto: OilSessionDto) { return this.service.createOilSession(this.org(user), this.actor(user), dto); }
  @Get('oil/sessions/:id') getOilSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getOilSession(this.org(user), id); }
  @Delete('oil/sessions/:id') deleteOilSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteOilSession(this.org(user), id); }
  @Post('oil/sessions/:id/photo') @UseInterceptors(FileInterceptor('photo')) uploadOilPhoto(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFile() file: any) { return this.service.uploadOilPhoto(this.org(user), this.actor(user), id, file); }

  @Get('cleaning/zones') listCleaningZones(@CurrentUser() user: AuthenticatedUser) { return this.service.listCleaningZones(this.org(user)); }
  @Post('cleaning/zones') createCleaningZone(@CurrentUser() user: AuthenticatedUser, @Body() dto: CleaningZoneDto) { return this.service.createCleaningZone(this.org(user), this.actor(user), dto); }
  @Put('cleaning/zones/:id') updateCleaningZone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CleaningZoneDto) { return this.service.updateCleaningZone(this.org(user), this.actor(user), id, dto); }
  @Delete('cleaning/zones/:id') deleteCleaningZone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteCleaningZone(this.org(user), id); }
  @Post('cleaning/sessions/start') startCleaningSession(@CurrentUser() user: AuthenticatedUser) { return this.service.startCleaningSession(this.org(user), this.actor(user)); }
  @Get('cleaning/sessions/active') activeCleaningSession(@CurrentUser() user: AuthenticatedUser) { return this.service.getActiveCleaningSession(this.org(user)); }
  @Post('cleaning/sessions/mark-surface') markSurface(@CurrentUser() user: AuthenticatedUser, @Body() dto: MarkSurfaceDto) { return this.service.markSurfaceCleaned(this.org(user), this.actor(user), dto); }
  @Post('cleaning/sessions/complete') completeCleaningSession(@CurrentUser() user: AuthenticatedUser, @Body() dto: CompleteCleaningSessionDto) { return this.service.completeCleaningSession(this.org(user), dto); }
  @Get('cleaning/sessions/history') cleaningHistory(@CurrentUser() user: AuthenticatedUser, @Query() q: ListHaccpQueryDto) { return this.service.listCleaningHistory(this.org(user), q); }
  @Delete('cleaning/sessions/:id') deleteCleaningSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteCleaningSession(this.org(user), id); }
  @Get('cleaning/today-surfaces') todayCleaningSurfaces(@CurrentUser() user: AuthenticatedUser) { return this.service.todayCleaningSurfaces(this.org(user)); }

  @Get('production/sessions') listProductionSessions(@CurrentUser() user: AuthenticatedUser, @Query() q: ListHaccpQueryDto) { return this.service.listProductionSessions(this.org(user), q); }
  @Get('production/sessions/today') listTodayProductionSessions(@CurrentUser() user: AuthenticatedUser) { return this.service.listTodayProductionSessions(this.org(user)); }
  @Post('production/sessions') createProductionSession(@CurrentUser() user: AuthenticatedUser, @Body() dto: ProductionSessionDto) { return this.service.createProductionSession(this.org(user), this.actor(user), dto); }
  @Get('production/sessions/:id') getProductionSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getProductionSession(this.org(user), id); }
  @Put('production/sessions/:id/complete') completeProductionSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.completeProductionSession(this.org(user), id); }
  @Delete('production/sessions/:id') deleteProductionSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteProductionSession(this.org(user), id); }
  @Post('production/sessions/:id/photos') @UseInterceptors(FilesInterceptor('photos', 8)) addProductionPhotos(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFiles() files: any[]) { return this.service.addProductionPhotos(this.org(user), this.actor(user), id, files); }

  @Post('daily-reports/generate') generateReport(@CurrentUser() user: AuthenticatedUser) { return this.service.generateDailyReport(this.org(user), this.actor(user)); }
  @Get('daily-reports/today') todayReport(@CurrentUser() user: AuthenticatedUser) { return this.service.todayReport(this.org(user)); }
  @Get('daily-reports') listReports(@CurrentUser() user: AuthenticatedUser, @Query() q: ListHaccpQueryDto) { return this.service.listReports(this.org(user), q); }
  @Get('daily-reports/history') reportHistory(@CurrentUser() user: AuthenticatedUser) { return this.service.historyReports(this.org(user)); }
  @Get('daily-reports/stats') reportStats(@CurrentUser() user: AuthenticatedUser) { return this.service.reportStats(this.org(user)); }
  @Get('daily-reports/:id') getReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getReport(this.org(user), id); }
  @Delete('daily-reports/:id') deleteReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.deleteReport(this.org(user), id); }
  @Post('daily-reports/:id/regenerate') regenerateReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.regenerateReport(this.org(user), this.actor(user), id); }
  @Get('daily-reports/:id/download')
  @Header('Content-Type', 'application/octet-stream')
  async downloadReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.service.downloadReport(this.org(user), id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return file.stream;
  }
}

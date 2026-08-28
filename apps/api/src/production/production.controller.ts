import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  BadRequestException,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  ChangeProductionStatusDto,
  CloseProductionRealizationDto,
  ConfirmDestockingDto,
  CreateProductionOrderDto,
  PrepareProductionExportDto,
  ProductionQueryDto,
  UpdateProductionOrderDto,
  UpsertProductionAssignmentDto,
} from './dto/production.dto';
import {
  CreateProductionNeedDto,
  ProductionPlanningQueryDto,
  SimulateProductionSuggestionDto,
  UpsertProductionProfileDto,
} from './dto/production-planning.dto';
import {
  CompleteProductionBatchDto,
  CreateProductionCampaignDto,
  ProductionDayValidationQueryDto,
  ProductionOperationalExportQueryDto,
  ProductionStockQueryDto,
  StartProductionBatchDto,
  TransitionProductionStockDto,
  UpdateProductionCampaignDto,
  UpdateProductionOperationDto,
  ValidateProductionCampaignDto,
  ValidateProductionDayDto,
} from './dto/production-execution.dto';
import { ProductionExecutionService } from './production-execution.service';
import { ProductionPlanningService } from './production-planning.service';
import { ProductionService } from './production.service';
import { OperationalTasksService } from './operational-tasks.service';
import {
  GenerateOperationalTasksFromMenuDto,
  OperationalTaskAssigneeQueryDto,
  OperationalTaskOptionsQueryDto,
  OperationalTaskQueryDto,
  UpdateOperationalTaskDto,
  UpdateOperationalTaskStatusDto,
  UpsertOperationalTaskDto,
} from './dto/operational-task.dto';
import {
  CloseProductionDayDto,
  ProductionDayClosureQueryDto,
} from './dto/production-day-closure.dto';
import { ProductionDayClosureService } from './production-day-closure.service';
import { ProductionOperationalExportService } from './production-operational-export.service';
import { ProductionIngredientTraceabilityService } from './production-ingredient-traceability.service';
import { OperationalTaskPresetsService } from './operational-task-presets.service';
import {
  OperationalTaskPresetQueryDto,
  UpsertOperationalTaskPresetDto,
} from './dto/operational-task-preset.dto';

@ApiTags('production')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('production')
export class ProductionController {
  constructor(
    private readonly service: ProductionService,
    private readonly planning: ProductionPlanningService,
    private readonly execution: ProductionExecutionService,
    private readonly operationalTasks: OperationalTasksService,
    private readonly dayClosures: ProductionDayClosureService,
    private readonly operationalExport: ProductionOperationalExportService,
    private readonly ingredientTraceability: ProductionIngredientTraceabilityService,
    private readonly operationalTaskPresets: OperationalTaskPresetsService,
  ) {}
  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required');
    return user.organizationId;
  }
  private actor(user: AuthenticatedUser) {
    return {
      id: user.id,
      role: user.role,
      permissions: user.permissions,
      employeeId: user.employeeId,
    };
  }

  @Post('install') install(@CurrentUser() user: AuthenticatedUser) {
    return this.service.install(this.org(user), this.actor(user));
  }
  @Post('uninstall') uninstall(@CurrentUser() user: AuthenticatedUser) {
    return this.service.uninstall(this.org(user), this.actor(user));
  }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.service.dashboard(this.org(user));
  }

  @Get('tasks') tasks(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalTaskQueryDto,
  ) {
    return this.operationalTasks.list(this.org(user), this.actor(user), query);
  }

  @Get('task-presets/options') taskPresetOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.operationalTaskPresets.options(this.org(user), this.actor(user));
  }

  @Get('task-presets') taskPresets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalTaskPresetQueryDto,
  ) {
    return this.operationalTaskPresets.list(this.org(user), this.actor(user), query);
  }

  @Post('task-presets') createTaskPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertOperationalTaskPresetDto,
  ) {
    return this.operationalTaskPresets.create(this.org(user), this.actor(user), dto);
  }

  @Patch('task-presets/:id') updateTaskPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertOperationalTaskPresetDto,
  ) {
    return this.operationalTaskPresets.update(this.org(user), this.actor(user), id, dto);
  }

  @Delete('task-presets/:id') archiveTaskPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.operationalTaskPresets.archive(this.org(user), this.actor(user), id);
  }
  @Get('tasks/context') taskContext(@CurrentUser() user: AuthenticatedUser) {
    return this.operationalTasks.context(this.org(user), this.actor(user));
  }
  @Get('tasks/options') taskOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalTaskOptionsQueryDto,
  ) {
    return this.operationalTasks.options(this.org(user), this.actor(user), query);
  }
  @Get('tasks/export.pdf')
  async exportOperationalTasksPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProductionOperationalExportQueryDto,
    @Res() response: Response,
  ) {
    const file = await this.operationalExport.exportDayPdf(this.org(user), this.actor(user), query);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.buffer);
  }
  @Get('tasks/:id/execution') taskExecution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.operationalTasks.execution(this.org(user), this.actor(user), id);
  }
  @Get('tasks/assignees') taskAssignees(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalTaskAssigneeQueryDto,
  ) {
    return this.operationalTasks.assignees(this.org(user), this.actor(user), query);
  }
  @Post('tasks/from-menu') tasksFromMenu(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateOperationalTasksFromMenuDto,
  ) {
    return this.operationalTasks.generateFromMenu(this.org(user), this.actor(user), dto);
  }
  @Post('tasks') createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertOperationalTaskDto,
  ) {
    return this.operationalTasks.create(this.org(user), this.actor(user), dto);
  }
  @Post('tasks/:id/split-steps') splitProductionRecipeTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.operationalTasks.splitProductionRecipeTask(this.org(user), this.actor(user), id);
  }
  @Post('tasks/:id/merge-recipe') mergeProductionRecipeTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.operationalTasks.mergeProductionRecipeTask(this.org(user), this.actor(user), id);
  }
  @Patch('tasks/:id') updateTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOperationalTaskDto,
  ) {
    return this.operationalTasks.update(this.org(user), this.actor(user), id, dto);
  }
  @Patch('tasks/:id/status') updateTaskStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOperationalTaskStatusDto,
  ) {
    return this.operationalTasks.updateStatus(this.org(user), this.actor(user), id, dto);
  }

  @Get('day-closures/preview') dayClosurePreview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProductionDayClosureQueryDto,
  ) {
    return this.dayClosures.preview(this.org(user), query);
  }
  @Get('day-closures/carry-over') dayClosureCarryOver(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProductionDayClosureQueryDto,
  ) {
    return this.dayClosures.carryOver(this.org(user), query);
  }
  @Post('day-closures') closeProductionDay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CloseProductionDayDto,
  ) {
    return this.dayClosures.close(this.org(user), this.actor(user), dto);
  }
  @Get('day-validation/preview') productionDayValidationPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProductionDayValidationQueryDto,
  ) {
    return this.execution.previewProductionDay(this.org(user), this.actor(user), query);
  }
  @Post('day-validation/complete') validateProductionDay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidateProductionDayDto,
  ) {
    return this.execution.validateProductionDay(this.org(user), this.actor(user), dto);
  }

  @Get('orders') listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ProductionQueryDto,
  ) {
    return this.service.listOrders(this.org(user), q);
  }
  @Post('orders') createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductionOrderDto,
  ) {
    return this.service.createOrder(this.org(user), this.actor(user), dto);
  }
  @Get('orders/:id') getOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getOrder(this.org(user), id);
  }
  @Patch('orders/:id') updateOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductionOrderDto,
  ) {
    return this.service.updateOrder(this.org(user), this.actor(user), id, dto);
  }
  @Post('orders/:id/status') changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeProductionStatusDto,
  ) {
    return this.service.changeStatus(this.org(user), this.actor(user), id, dto);
  }
  @Post('orders/:id/recalculate') recalculate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.recalculateOrder(this.org(user), this.actor(user), id);
  }

  @Post('orders/:id/assignments') assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertProductionAssignmentDto,
  ) {
    return this.service.assignEmployee(this.org(user), this.actor(user), id, dto);
  }
  @Delete('orders/:id/assignments/:assignmentId') removeAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.service.removeAssignment(this.org(user), this.actor(user), id, assignmentId);
  }
  @Post('orders/:id/realization') closeRealization(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseProductionRealizationDto,
  ) {
    return this.service.closeRealization(this.org(user), this.actor(user), id, dto);
  }
  @Post('orders/:id/destocking/propose') proposeDestocking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.proposeDestocking(this.org(user), this.actor(user), id);
  }
  @Post('destocking/:proposalId/confirm') confirmDestocking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('proposalId') proposalId: string,
    @Body() dto: ConfirmDestockingDto,
  ) {
    return this.service.confirmDestocking(this.org(user), this.actor(user), proposalId, dto);
  }

  @Get('needs') listNeeds(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProductionPlanningQueryDto,
  ) {
    return this.planning.listNeeds(this.org(user), query);
  }
  @Post('needs') createNeed(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductionNeedDto,
  ) {
    return this.planning.createNeed(this.org(user), this.actor(user), dto);
  }
  @Get('profiles') listProfiles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProductionPlanningQueryDto,
  ) {
    return this.planning.listProfiles(this.org(user), query);
  }
  @Post('profiles') createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertProductionProfileDto,
  ) {
    return this.planning.createProfile(this.org(user), this.actor(user), dto);
  }
  @Patch('profiles/:id') updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertProductionProfileDto,
  ) {
    return this.planning.updateProfile(this.org(user), this.actor(user), id, dto);
  }
  @Post('simulations/suggestions') simulateSuggestion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SimulateProductionSuggestionDto,
  ) {
    return this.planning.simulateSuggestion(this.org(user), dto);
  }

  @Post('campaigns/expire-unassigned')
  expireUnassignedCampaigns(@CurrentUser() user: AuthenticatedUser) {
    return this.execution.cancelExpiredUnassignedCampaigns(this.org(user), this.actor(user));
  }
  @Post('campaigns') createCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductionCampaignDto,
  ) {
    return this.execution.createCampaign(this.org(user), this.actor(user), dto);
  }
  @Get('campaigns') listCampaigns(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProductionQueryDto,
  ) {
    return this.execution.listCampaigns(this.org(user), query);
  }
  @Get('campaigns/:id') getCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.execution.getCampaign(this.org(user), id);
  }
  @Patch('campaigns/:id') updateCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductionCampaignDto,
  ) {
    return this.execution.rescheduleCampaign(this.org(user), this.actor(user), id, dto);
  }
  @Post('campaigns/:id/validate') validateCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ValidateProductionCampaignDto,
  ) {
    return this.execution.validateCampaign(this.org(user), this.actor(user), id, dto);
  }
  @Post('batches/:id/start') startBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StartProductionBatchDto,
  ) {
    return this.execution.startBatch(this.org(user), this.actor(user), id, dto);
  }
  @Post('batches/:id/restart') restartBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.execution.restartBatch(this.org(user), this.actor(user), id);
  }
  @Post('batches/:id/complete') completeBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteProductionBatchDto,
  ) {
    return this.execution.completeBatch(this.org(user), this.actor(user), id, dto);
  }
  @Get('batches/:id/traceability')
  batchTraceability(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ingredientTraceability.get(this.org(user), id);
  }
  @Put('batches/:id/traceability/:ingredientKey')
  @UseInterceptors(
    FilesInterceptor('photos', 3, {
      limits: { fileSize: 8 * 1024 * 1024, files: 3 },
    }),
  )
  saveBatchTraceability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('ingredientKey') ingredientKey: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: any[],
  ) {
    return this.ingredientTraceability.save(
      this.org(user),
      this.actor(user),
      id,
      ingredientKey,
      body,
      files,
    );
  }
  @Patch('operations/:id') updateOperation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductionOperationDto,
  ) {
    return this.execution.updateOperation(this.org(user), this.actor(user), id, dto);
  }
  @Get('stock') productionStock(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProductionStockQueryDto,
  ) {
    return this.execution.listProductionStock(this.org(user), query);
  }
  @Post('stock/:stockId/transition') transitionStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stockId') stockId: string,
    @Body() dto: TransitionProductionStockDto,
  ) {
    return this.execution.transitionStock(this.org(user), this.actor(user), stockId, dto);
  }
  @Get('traceability/lots/:lotId') traceLot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lotId') lotId: string,
  ) {
    return this.execution.traceLot(this.org(user), lotId);
  }

  @Get('materials') materials(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ProductionQueryDto,
  ) {
    return this.service.materialRequirements(this.org(user), q);
  }
  @Get('today') today(@CurrentUser() user: AuthenticatedUser, @Query() q: ProductionQueryDto) {
    return this.service.today(this.org(user), q);
  }
  @Get('calendar') calendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ProductionQueryDto,
  ) {
    return this.service.calendar(this.org(user), q);
  }
  @Get('history') history(@CurrentUser() user: AuthenticatedUser, @Query() q: ProductionQueryDto) {
    return this.service.history(this.org(user), q);
  }
  @Get('exports') exports(@CurrentUser() user: AuthenticatedUser, @Query() q: ProductionQueryDto) {
    return this.service.exports(this.org(user), q);
  }
  @Post('exports') prepareExport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PrepareProductionExportDto,
  ) {
    return this.service.prepareExport(this.org(user), this.actor(user), dto);
  }
}

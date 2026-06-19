import { Body, Controller, Delete, Get, Param, Patch, Post, Query, BadRequestException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChangeProductionStatusDto, CloseProductionRealizationDto, ConfirmDestockingDto, CreateProductionOrderDto, PrepareProductionExportDto, ProductionQueryDto, UpdateProductionOrderDto, UpsertProductionAssignmentDto } from './dto/production.dto';
import { ProductionService } from './production.service';

@ApiTags('production')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('production')
export class ProductionController {
  constructor(private readonly service: ProductionService) {}
  private org(user: AuthenticatedUser) { if (!user.organizationId) throw new BadRequestException('Organization setup is required'); return user.organizationId; }
  private actor(user: AuthenticatedUser) { return { id: user.id, role: user.role }; }

  @Post('install') install(@CurrentUser() user: AuthenticatedUser) { return this.service.install(this.org(user), this.actor(user)); }
  @Post('uninstall') uninstall(@CurrentUser() user: AuthenticatedUser) { return this.service.uninstall(this.org(user), this.actor(user)); }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) { return this.service.dashboard(this.org(user)); }

  @Get('orders') listOrders(@CurrentUser() user: AuthenticatedUser, @Query() q: ProductionQueryDto) { return this.service.listOrders(this.org(user), q); }
  @Post('orders') createOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductionOrderDto) { return this.service.createOrder(this.org(user), this.actor(user), dto); }
  @Get('orders/:id') getOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getOrder(this.org(user), id); }
  @Patch('orders/:id') updateOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateProductionOrderDto) { return this.service.updateOrder(this.org(user), this.actor(user), id, dto); }
  @Post('orders/:id/status') changeStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ChangeProductionStatusDto) { return this.service.changeStatus(this.org(user), this.actor(user), id, dto); }
  @Post('orders/:id/recalculate') recalculate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.recalculateOrder(this.org(user), this.actor(user), id); }

  @Post('orders/:id/assignments') assign(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpsertProductionAssignmentDto) { return this.service.assignEmployee(this.org(user), this.actor(user), id, dto); }
  @Delete('orders/:id/assignments/:assignmentId') removeAssignment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('assignmentId') assignmentId: string) { return this.service.removeAssignment(this.org(user), this.actor(user), id, assignmentId); }
  @Post('orders/:id/realization') closeRealization(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CloseProductionRealizationDto) { return this.service.closeRealization(this.org(user), this.actor(user), id, dto); }
  @Post('orders/:id/destocking/propose') proposeDestocking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.proposeDestocking(this.org(user), this.actor(user), id); }
  @Post('destocking/:proposalId/confirm') confirmDestocking(@CurrentUser() user: AuthenticatedUser, @Param('proposalId') proposalId: string, @Body() dto: ConfirmDestockingDto) { return this.service.confirmDestocking(this.org(user), this.actor(user), proposalId, dto); }

  @Get('materials') materials(@CurrentUser() user: AuthenticatedUser, @Query() q: ProductionQueryDto) { return this.service.materialRequirements(this.org(user), q); }
  @Get('today') today(@CurrentUser() user: AuthenticatedUser, @Query() q: ProductionQueryDto) { return this.service.today(this.org(user), q); }
  @Get('calendar') calendar(@CurrentUser() user: AuthenticatedUser, @Query() q: ProductionQueryDto) { return this.service.calendar(this.org(user), q); }
  @Get('history') history(@CurrentUser() user: AuthenticatedUser, @Query() q: ProductionQueryDto) { return this.service.history(this.org(user), q); }
  @Get('exports') exports(@CurrentUser() user: AuthenticatedUser, @Query() q: ProductionQueryDto) { return this.service.exports(this.org(user), q); }
  @Post('exports') prepareExport(@CurrentUser() user: AuthenticatedUser, @Body() dto: PrepareProductionExportDto) { return this.service.prepareExport(this.org(user), this.actor(user), dto); }
}

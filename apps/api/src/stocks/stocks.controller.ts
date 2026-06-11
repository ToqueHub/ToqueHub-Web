import { BadRequestException, Body, Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateInventoryDto, UpdateInventoryCountsDto } from './dto/inventory.dto';
import { ListQueryDto, UpsertCategoryDto, UpsertLocationDto, UpsertLotDto, UpsertProductDto, UpsertSiteDto, UpsertSupplierDto, UpsertUnitConversionDto, UpsertUnitDto } from './dto/stocks-reference.dto';
import { StocksService } from './stocks.service';

@ApiTags('stocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required before using stock endpoints');
    return user.organizationId;
  }
  private actor(user: AuthenticatedUser) { return { id: user.id, role: user.role }; }

  @Post('stocks/install') install(@CurrentUser() user: AuthenticatedUser) { return this.stocksService.installDefaults(this.org(user), this.actor(user)); }
  @Post('stocks/uninstall') uninstall(@CurrentUser() user: AuthenticatedUser) { return this.stocksService.uninstallFromInterface(this.org(user), this.actor(user)); }
  @Get('stocks/dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) { return this.stocksService.dashboard(this.org(user)); }

  @Get('categories') listCategories(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listCategories(this.org(u), q); }
  @Post('categories') createCategory(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertCategoryDto) { return this.stocksService.createCategory(this.org(u), this.actor(u), d); }
  @Patch('categories/:id') updateCategory(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpsertCategoryDto) { return this.stocksService.updateCategory(this.org(u), this.actor(u), id, d); }
  @Post('categories/:id/archive') archiveCategory(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.stocksService.archiveCategory(this.org(u), this.actor(u), id); }

  @Get('units') listUnits(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listUnits(this.org(u), q); }
  @Post('units') createUnit(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertUnitDto) { return this.stocksService.createUnit(this.org(u), this.actor(u), d); }
  @Patch('units/:id') updateUnit(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpsertUnitDto) { return this.stocksService.updateUnit(this.org(u), this.actor(u), id, d); }
  @Post('units/:id/archive') archiveUnit(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.stocksService.archiveUnit(this.org(u), this.actor(u), id); }
  @Post('unit-conversions') upsertConversion(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertUnitConversionDto) { return this.stocksService.upsertConversion(this.org(u), this.actor(u), d); }

  @Get('suppliers') listSuppliers(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listSuppliers(this.org(u), q); }
  @Post('suppliers') createSupplier(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertSupplierDto) { return this.stocksService.createSupplier(this.org(u), this.actor(u), d); }
  @Patch('suppliers/:id') updateSupplier(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpsertSupplierDto) { return this.stocksService.updateSupplier(this.org(u), this.actor(u), id, d); }
  @Post('suppliers/:id/archive') archiveSupplier(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.stocksService.archiveSupplier(this.org(u), this.actor(u), id); }

  @Get('products') listProducts(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listProducts(this.org(u), q); }
  @Post('products') createProduct(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertProductDto) { return this.stocksService.createProduct(this.org(u), this.actor(u), d); }
  @Patch('products/:id') updateProduct(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpsertProductDto) { return this.stocksService.updateProduct(this.org(u), this.actor(u), id, d); }
  @Post('products/:id/archive') archiveProduct(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.stocksService.archiveProduct(this.org(u), this.actor(u), id); }

  @Get('sites') listSites(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listSites(this.org(u), q); }
  @Post('sites') createSite(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertSiteDto) { return this.stocksService.createSite(this.org(u), this.actor(u), d); }
  @Patch('sites/:id') updateSite(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpsertSiteDto) { return this.stocksService.updateSite(this.org(u), this.actor(u), id, d); }
  @Post('sites/:id/archive') archiveSite(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.stocksService.archiveSite(this.org(u), this.actor(u), id); }

  @Get('locations') listLocations(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listLocations(this.org(u), q); }
  @Post('locations') createLocation(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertLocationDto) { return this.stocksService.createLocation(this.org(u), this.actor(u), d); }
  @Patch('locations/:id') updateLocation(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpsertLocationDto) { return this.stocksService.updateLocation(this.org(u), this.actor(u), id, d); }
  @Post('locations/:id/archive') archiveLocation(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.stocksService.archiveLocation(this.org(u), this.actor(u), id); }

  @Get('lots') listLots(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listLots(this.org(u), q); }
  @Post('lots') createLot(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertLotDto) { return this.stocksService.createLot(this.org(u), this.actor(u), d); }

  @Get('stocks') @ApiOkResponse({ description: 'Read-only projected stock levels.' }) listStocks(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listStocks(this.org(u), q); }
  @Get('stock-movements') listMovements(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listMovements(this.org(u), q); }
  @Post('stock-movements') @ApiCreatedResponse({ description: 'Create a movement and update projection.' }) createMovement(@CurrentUser() u: AuthenticatedUser, @Body() d: CreateStockMovementDto) { return this.stocksService.createMovement(this.org(u), this.actor(u), d); }

  @Get('inventories') listInventories(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listInventories(this.org(u), q); }
  @Post('inventories') createInventory(@CurrentUser() u: AuthenticatedUser, @Body() d: CreateInventoryDto) { return this.stocksService.createInventory(this.org(u), this.actor(u), d); }
  @Patch('inventories/:id/counts') updateCounts(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() d: UpdateInventoryCountsDto) { return this.stocksService.updateInventoryCounts(this.org(u), this.actor(u), id, d); }
  @Post('inventories/:id/validate') validateInventory(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.stocksService.validateInventory(this.org(u), this.actor(u), id); }

  @Get('audit') listAudit(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) { return this.stocksService.listAudit(this.org(u), q); }
  @Get('audit.csv') @Header('Content-Type', 'text/csv; charset=utf-8') auditCsv(@CurrentUser() u: AuthenticatedUser) { return this.stocksService.auditCsv(this.org(u)); }
}

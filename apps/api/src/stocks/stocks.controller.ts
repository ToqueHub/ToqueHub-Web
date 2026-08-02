import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ProductKind } from '@prisma/client';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdjustProductStockDto } from './dto/adjust-product-stock.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateInventoryDto, UpdateInventoryCountsDto } from './dto/inventory.dto';
import {
  GenerateMarginReportDto,
  MarginsQueryDto,
  UpdateMarginSettingsDto,
} from './dto/stocks-margins.dto';
import { AnalyzeBatchDto, SaveOcrCorrectionDto } from './dto/stocks-ocr.dto';
import {
  BulkAssignProductSitesDto,
  CommitProductImportDto,
  ProductCreatorRowsDto,
} from './dto/stocks-product-import.dto';
import {
  ListArticlesQueryDto,
  ListQueryDto,
  UpsertCategoryDto,
  UpsertLocationDto,
  UpsertLotDto,
  UpsertProductDto,
  UpsertSiteDto,
  UpsertSupplierDto,
  UpsertUnitConversionDto,
  UpsertUnitDto,
} from './dto/stocks-reference.dto';
import { StocksMarginsService } from './stocks-margins.service';
import { StocksOcrService } from './stocks-ocr.service';
import { StocksProductImportService } from './stocks-product-import.service';
import { StocksService } from './stocks.service';

@ApiTags('stocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class StocksController {
  constructor(
    private readonly stocksService: StocksService,
    private readonly stocksOcrService: StocksOcrService,
    private readonly stocksMarginsService: StocksMarginsService,
    private readonly stocksProductImportService: StocksProductImportService,
  ) {}

  private org(user: AuthenticatedUser) {
    if (!user.organizationId)
      throw new BadRequestException('Organization setup is required before using stock endpoints');
    return user.organizationId;
  }
  private actor(user: AuthenticatedUser) {
    return { id: user.id, role: user.role };
  }

  @Post('stocks/install') install(@CurrentUser() user: AuthenticatedUser) {
    return this.stocksService.installDefaults(this.org(user), this.actor(user));
  }
  @Post('stocks/uninstall') uninstall(@CurrentUser() user: AuthenticatedUser) {
    return this.stocksService.uninstallFromInterface(this.org(user), this.actor(user));
  }
  @Get('stocks/dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.stocksService.dashboard(this.org(user));
  }

  @Post('stocks/ocr/documents')
  @UseInterceptors(
    FilesInterceptor('files', 8, { limits: { files: 8, fileSize: 20 * 1024 * 1024 } }),
  )
  uploadOcrDocuments(@CurrentUser() user: AuthenticatedUser, @UploadedFiles() files: any[]) {
    return this.stocksOcrService.uploadDocuments(this.org(user), this.actor(user), files);
  }

  @Get('stocks/ocr/config')
  ocrConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.stocksOcrService.getOcrConfig(this.org(user), this.actor(user));
  }

  @Get('stocks/documents/:documentId/download')
  async downloadStocksDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const { document, absolutePath } = await this.stocksOcrService.getDocumentForDownload(
      this.org(user),
      this.actor(user),
      documentId,
    );
    res.setHeader('Content-Type', document.mimeType);
    return res.download(absolutePath, document.originalName);
  }

  @Post('stocks/ocr/documents/:documentId/analyze')
  analyzeOcrDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
  ) {
    return this.stocksOcrService.analyzeDocument(this.org(user), this.actor(user), documentId);
  }

  @Post('stocks/ocr/documents/analyze-batch')
  analyzeOcrBatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: AnalyzeBatchDto) {
    return this.stocksOcrService.analyzeBatch(this.org(user), this.actor(user), dto.documentIds);
  }

  @Get('stocks/ocr/documents/statuses')
  ocrDocumentStatuses(@CurrentUser() user: AuthenticatedUser) {
    return this.stocksOcrService.listStatuses(this.org(user), this.actor(user));
  }

  @Get('stocks/ocr/documents/:documentId/status')
  ocrDocumentStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
  ) {
    return this.stocksOcrService.getStatus(this.org(user), this.actor(user), documentId);
  }

  @Get('stocks/ocr/extractions/:extractionId')
  ocrExtraction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('extractionId') extractionId: string,
  ) {
    return this.stocksOcrService.getExtraction(this.org(user), this.actor(user), extractionId);
  }

  @Post('stocks/ocr/extractions/:extractionId/reanalyze-ai')
  reanalyzeOcrExtractionWithAi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('extractionId') extractionId: string,
  ) {
    return this.stocksOcrService.reanalyzeExtractionWithAi(
      this.org(user),
      this.actor(user),
      extractionId,
    );
  }

  @Patch('stocks/ocr/extractions/:extractionId/corrections')
  saveOcrCorrections(
    @CurrentUser() user: AuthenticatedUser,
    @Param('extractionId') extractionId: string,
    @Body() dto: SaveOcrCorrectionDto,
  ) {
    return this.stocksOcrService.saveCorrections(
      this.org(user),
      this.actor(user),
      extractionId,
      dto,
    );
  }

  @Post('stocks/ocr/extractions/:extractionId/reception')
  createReceptionFromOcr(
    @CurrentUser() user: AuthenticatedUser,
    @Param('extractionId') extractionId: string,
    @Body() dto: SaveOcrCorrectionDto,
  ) {
    return this.stocksOcrService.createReceptionFromExtraction(
      this.org(user),
      this.actor(user),
      extractionId,
      dto,
    );
  }

  @Post('stocks/receptions/validate')
  createManualReception(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveOcrCorrectionDto) {
    return this.stocksOcrService.createManualReception(this.org(user), this.actor(user), dto);
  }

  @Get('equipment/categories')
  listEquipmentCategories(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: ListQueryDto,
  ) {
    return this.stocksService.listCategories(this.org(u), {
      ...q,
      kind: ProductKind.EQUIPMENT,
    });
  }

  @Post('equipment/categories')
  createEquipmentCategory(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpsertCategoryDto,
  ) {
    return this.stocksService.createCategory(this.org(u), this.actor(u), {
      ...d,
      kind: ProductKind.EQUIPMENT,
    });
  }

  @Get('categories') listCategories(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) {
    return this.stocksService.listCategories(this.org(u), q);
  }
  @Post('categories') createCategory(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpsertCategoryDto,
  ) {
    return this.stocksService.createCategory(this.org(u), this.actor(u), d);
  }
  @Patch('categories/:id') updateCategory(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() d: UpsertCategoryDto,
  ) {
    return this.stocksService.updateCategory(this.org(u), this.actor(u), id, d);
  }
  @Post('categories/:id/archive') archiveCategory(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.stocksService.archiveCategory(this.org(u), this.actor(u), id);
  }

  @Get('units') listUnits(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) {
    return this.stocksService.listUnits(this.org(u), q);
  }
  @Post('units') createUnit(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertUnitDto) {
    return this.stocksService.createUnit(this.org(u), this.actor(u), d);
  }
  @Patch('units/:id') updateUnit(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() d: UpsertUnitDto,
  ) {
    return this.stocksService.updateUnit(this.org(u), this.actor(u), id, d);
  }
  @Post('units/:id/archive') archiveUnit(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.stocksService.archiveUnit(this.org(u), this.actor(u), id);
  }
  @Post('unit-conversions') upsertConversion(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpsertUnitConversionDto,
  ) {
    return this.stocksService.upsertConversion(this.org(u), this.actor(u), d);
  }

  @Get('suppliers') listSuppliers(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) {
    return this.stocksService.listSuppliers(this.org(u), q);
  }
  @Post('suppliers') createSupplier(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpsertSupplierDto,
  ) {
    return this.stocksService.createSupplier(this.org(u), this.actor(u), d);
  }
  @Patch('suppliers/:id') updateSupplier(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() d: UpsertSupplierDto,
  ) {
    return this.stocksService.updateSupplier(this.org(u), this.actor(u), id, d);
  }
  @Post('suppliers/:id/archive') archiveSupplier(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.stocksService.archiveSupplier(this.org(u), this.actor(u), id);
  }

  @Get('products') listProducts(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) {
    return this.stocksService.listProducts(this.org(u), q);
  }
  @Get('articles') listArticles(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: ListArticlesQueryDto,
  ) {
    return this.stocksService.listArticles(this.org(u), q);
  }
  @Get('products/ocr-label/imports/statuses')
  productLabelImportStatuses(@CurrentUser() u: AuthenticatedUser) {
    return this.stocksOcrService.listProductLabelImportStatuses(this.org(u), this.actor(u));
  }
  @Post('products') createProduct(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpsertProductDto,
  ) {
    return this.stocksService.createProduct(this.org(u), this.actor(u), d);
  }
  @Post('products/:id/ocr-label/imports')
  @UseInterceptors(
    FilesInterceptor('files', 8, { limits: { files: 8, fileSize: 20 * 1024 * 1024 } }),
  )
  uploadProductLabelImports(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFiles() files: any[],
  ) {
    return this.stocksOcrService.uploadProductLabelImports(this.org(u), this.actor(u), id, files);
  }
  @Post('products/:id/ocr-label/imports/:batchId/reviewed')
  reviewProductLabelImport(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('batchId') batchId: string,
  ) {
    return this.stocksOcrService.reviewProductLabelImport(this.org(u), this.actor(u), id, batchId);
  }
  @Post('products/:id/ocr-label')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 20 * 1024 * 1024 } }))
  analyzeProductLabel(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    return this.stocksOcrService.analyzeProductLabel(this.org(u), this.actor(u), id, file);
  }
  @Patch('products/:id') updateProduct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() d: UpsertProductDto,
  ) {
    return this.stocksService.updateProduct(this.org(u), this.actor(u), id, d);
  }
  @Post('products/:id/stock-adjustment') adjustProductStock(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() d: AdjustProductStockDto,
  ) {
    return this.stocksService.adjustProductStock(this.org(u), this.actor(u), id, d);
  }
  @Post('products/:id/archive') archiveProduct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.stocksService.archiveProduct(this.org(u), this.actor(u), id);
  }
  @Get('products/import/template.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="modele-import-produits.csv"')
  productImportTemplate(@CurrentUser() u: AuthenticatedUser) {
    this.org(u);
    return this.stocksProductImportService.templateCsv();
  }
  @Post('products/import/analyze')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 5 * 1024 * 1024 } }))
  analyzeProductImport(@CurrentUser() u: AuthenticatedUser, @UploadedFile() file: any) {
    return this.stocksProductImportService.analyzeProductImport(this.org(u), this.actor(u), file);
  }
  @Post('products/import/commit')
  commitProductImport(@CurrentUser() u: AuthenticatedUser, @Body() dto: CommitProductImportDto) {
    return this.stocksProductImportService.commitProductImport(this.org(u), this.actor(u), dto);
  }
  @Post('products/sites/assign')
  assignProductSites(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: BulkAssignProductSitesDto,
  ) {
    return this.stocksProductImportService.assignProductSites(
      this.org(u),
      this.actor(u),
      dto,
    );
  }
  @Post('products/csv-creator/preview')
  previewProductCreator(@CurrentUser() u: AuthenticatedUser, @Body() dto: ProductCreatorRowsDto) {
    return this.stocksProductImportService.previewProductRows(this.org(u), this.actor(u), dto.rows);
  }
  @Post('products/csv-creator/ocr')
  @UseInterceptors(
    FilesInterceptor('files', 8, { limits: { files: 8, fileSize: 20 * 1024 * 1024 } }),
  )
  async analyzeProductCreatorOcr(
    @CurrentUser() u: AuthenticatedUser,
    @UploadedFiles() files: any[],
  ) {
    const result = await this.stocksOcrService.uploadCatalogDocuments(
      this.org(u),
      this.actor(u),
      files,
    );
    const preview = await this.stocksProductImportService.previewProductRows(
      this.org(u),
      this.actor(u),
      result.items.map((fields, index) => ({ rowNumber: index + 2, fields })),
    );
    return { documents: result.documents, preview };
  }
  @Post('products/csv-creator/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="produits-crees.csv"')
  exportProductCreator(@CurrentUser() u: AuthenticatedUser, @Body() dto: ProductCreatorRowsDto) {
    this.org(u);
    return this.stocksProductImportService.creatorCsv(dto.rows);
  }

  @Get('sites') listSites(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) {
    return this.stocksService.listSites(this.org(u), q);
  }
  @Post('sites') createSite(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertSiteDto) {
    return this.stocksService.createSite(this.org(u), this.actor(u), d);
  }
  @Patch('sites/:id') updateSite(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() d: UpsertSiteDto,
  ) {
    return this.stocksService.updateSite(this.org(u), this.actor(u), id, d);
  }
  @Post('sites/:id/archive') archiveSite(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.stocksService.archiveSite(this.org(u), this.actor(u), id);
  }

  @Get('locations') listLocations(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) {
    return this.stocksService.listLocations(this.org(u), q);
  }
  @Post('locations') createLocation(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpsertLocationDto,
  ) {
    return this.stocksService.createLocation(this.org(u), this.actor(u), d);
  }
  @Patch('locations/:id') updateLocation(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() d: UpsertLocationDto,
  ) {
    return this.stocksService.updateLocation(this.org(u), this.actor(u), id, d);
  }
  @Post('locations/:id/archive') archiveLocation(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.stocksService.archiveLocation(this.org(u), this.actor(u), id);
  }

  @Get('lots') listLots(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) {
    return this.stocksService.listLots(this.org(u), q);
  }
  @Post('lots') createLot(@CurrentUser() u: AuthenticatedUser, @Body() d: UpsertLotDto) {
    return this.stocksService.createLot(this.org(u), this.actor(u), d);
  }

  @Get('stocks') @ApiOkResponse({ description: 'Read-only projected stock levels.' }) listStocks(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: ListQueryDto,
  ) {
    return this.stocksService.listStocks(this.org(u), q);
  }
  @Get('stock-movements') listMovements(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: ListQueryDto,
  ) {
    return this.stocksService.listMovements(this.org(u), q);
  }
  @Post('stock-movements')
  @ApiCreatedResponse({ description: 'Create a movement and update projection.' })
  createMovement(@CurrentUser() u: AuthenticatedUser, @Body() d: CreateStockMovementDto) {
    return this.stocksService.createMovement(this.org(u), this.actor(u), d);
  }

  @Get('stocks/margins/settings') marginSettings(@CurrentUser() u: AuthenticatedUser) {
    return this.stocksMarginsService.settings(this.org(u));
  }
  @Patch('stocks/margins/settings') updateMarginSettings(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpdateMarginSettingsDto,
  ) {
    return this.stocksMarginsService.updateSettings(this.org(u), d);
  }
  @Get('stocks/margins/dashboard') marginsDashboard(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: MarginsQueryDto,
  ) {
    return this.stocksMarginsService.dashboard(this.org(u), q);
  }
  @Get('stocks/margins/products/:id') marginProduct(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.stocksMarginsService.product(this.org(u), id);
  }
  @Get('stocks/margins/suppliers/:id') marginSupplier(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.stocksMarginsService.supplier(this.org(u), id);
  }
  @Get('stocks/margins/alerts') marginAlerts(@CurrentUser() u: AuthenticatedUser) {
    return this.stocksMarginsService.alerts(this.org(u));
  }
  @Get('stocks/margins/search') marginSearch(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: MarginsQueryDto,
  ) {
    return this.stocksMarginsService.search(this.org(u), q);
  }
  @Get('stocks/margins/reports') marginReports(@CurrentUser() u: AuthenticatedUser) {
    return this.stocksMarginsService.reports(this.org(u));
  }
  @Post('stocks/margins/reports') generateMarginReport(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: GenerateMarginReportDto,
  ) {
    return this.stocksMarginsService.generateReport(this.org(u), this.actor(u), d);
  }
  @Get('stocks/margins/reports/:id.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  marginReportCsv(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.stocksMarginsService.reportCsv(this.org(u), id);
  }

  @Get('inventories') listInventories(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: ListQueryDto,
  ) {
    return this.stocksService.listInventories(this.org(u), q);
  }
  @Post('inventories') createInventory(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: CreateInventoryDto,
  ) {
    return this.stocksService.createInventory(this.org(u), this.actor(u), d);
  }
  @Patch('inventories/:id/counts') updateCounts(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() d: UpdateInventoryCountsDto,
  ) {
    return this.stocksService.updateInventoryCounts(this.org(u), this.actor(u), id, d);
  }
  @Post('inventories/:id/validate') validateInventory(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.stocksService.validateInventory(this.org(u), this.actor(u), id);
  }

  @Get('audit') listAudit(@CurrentUser() u: AuthenticatedUser, @Query() q: ListQueryDto) {
    return this.stocksService.listAudit(this.org(u), q);
  }
  @Get('audit.csv') @Header('Content-Type', 'text/csv; charset=utf-8') auditCsv(
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.stocksService.auditCsv(this.org(u));
  }
}

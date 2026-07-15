import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { StocksOcrService } from '../stocks/stocks-ocr.service';
import {
  CreatePurchaseOrderDto,
  CreatePurchaseReceiptDto,
  CreateReceiptFromExtractionDto,
  PurchaseOrderReasonDto,
  PurchasingListQueryDto,
  PurchasingReferenceQueryDto,
  SendPurchaseOrderDto,
  UpdatePurchaseOrderDto,
  UpdatePurchaseReceiptDto,
  UpdatePurchasingOnboardingDto,
  UpdatePurchasingSettingsDto,
} from './dto/purchasing.dto';
import { PurchaseHistoryService } from './purchase-history.service';
import { PurchaseOrderCommandService } from './purchase-order-command.service';
import { PurchaseOrderDispatchService } from './purchase-order-dispatch.service';
import { PurchaseOrderQueryService } from './purchase-order-query.service';
import { PurchaseReceiptService } from './purchase-receipt.service';
import { PurchaseReceiptValidationService } from './purchase-receipt-validation.service';
import { PurchasingDashboardService } from './purchasing-dashboard.service';
import { PurchasingInstallationService } from './purchasing-installation.service';
import { PurchasingSettingsService } from './purchasing-settings.service';
import { PurchasingSuggestionService } from './purchasing-suggestion.service';

type PurchasingUploadedFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

@ApiTags('purchasing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('purchasing')
export class PurchasingController {
  constructor(
    private readonly installation: PurchasingInstallationService,
    private readonly settingsService: PurchasingSettingsService,
    private readonly dashboardService: PurchasingDashboardService,
    private readonly orderQueries: PurchaseOrderQueryService,
    private readonly orderCommands: PurchaseOrderCommandService,
    private readonly suggestionService: PurchasingSuggestionService,
    private readonly orderDispatch: PurchaseOrderDispatchService,
    private readonly receiptsService: PurchaseReceiptService,
    private readonly receiptValidation: PurchaseReceiptValidationService,
    private readonly historyService: PurchaseHistoryService,
    private readonly stocksOcr: StocksOcrService,
  ) {}

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required');
    return user.organizationId;
  }
  private ocrActor(user: AuthenticatedUser) {
    return { id: user.id, role: user.role, permissions: user.permissions };
  }

  @Post('install') install(@CurrentUser() user: AuthenticatedUser) {
    return this.installation
      .install(this.org(user), user)
      .then(() => this.settingsService.bootstrap(this.org(user), user));
  }
  @Post('uninstall') uninstall(@CurrentUser() user: AuthenticatedUser) {
    return this.installation.uninstall(this.org(user), user);
  }
  @Get('bootstrap') bootstrap(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.bootstrap(this.org(user), user);
  }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.get(this.org(user), user);
  }

  @Patch('settings') settings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePurchasingSettingsDto,
  ) {
    return this.settingsService.update(this.org(user), user, dto);
  }
  @Post('settings/resend/test') testResend(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.testResend(this.org(user), user);
  }
  @Patch('onboarding') onboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePurchasingOnboardingDto,
  ) {
    return this.settingsService.updateOnboarding(this.org(user), user, dto);
  }

  @Get('suppliers/:supplierId/delivery-options') deliveryOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('supplierId') supplierId: string,
    @Query('from') from?: string,
  ) {
    return this.settingsService.deliveryOptions(this.org(user), user, supplierId, from);
  }

  @Get('references/suppliers') suppliers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PurchasingReferenceQueryDto,
  ) {
    return this.orderQueries.suppliers(this.org(user), user, query);
  }

  @Get('references/products') products(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PurchasingReferenceQueryDto,
  ) {
    return this.orderQueries.products(this.org(user), user, query);
  }

  @Get('references/categories') categories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PurchasingReferenceQueryDto,
  ) {
    return this.orderQueries.categories(this.org(user), user, query);
  }

  @Get('references/products/highlights') productHighlights(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PurchasingReferenceQueryDto,
  ) {
    return this.orderQueries.productHighlights(this.org(user), user, query);
  }

  @Get('orders') orders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PurchasingListQueryDto,
  ) {
    return this.orderQueries.list(this.org(user), user, query);
  }
  @Get('orders/suggestions') suggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.suggestionService.list(this.org(user), user, supplierId);
  }
  @Post('orders') createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.orderCommands.create(this.org(user), user, dto);
  }
  @Get('orders/:id') order(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orderQueries.detail(this.org(user), user, id);
  }
  @Patch('orders/:id') updateOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.orderCommands.update(this.org(user), user, id, dto);
  }
  @Post('orders/:id/duplicate') duplicateOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.orderCommands.duplicate(this.org(user), user, id);
  }
  @Post('orders/:id/send') sendOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendPurchaseOrderDto,
  ) {
    return this.orderDispatch.send(this.org(user), user, id, dto.idempotencyKey, dto.recipient);
  }
  @Post('orders/:id/acknowledge') acknowledgeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.orderCommands.acknowledge(this.org(user), user, id);
  }
  @Post('orders/:id/cancel') cancelOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PurchaseOrderReasonDto,
  ) {
    return this.orderCommands.cancel(this.org(user), user, id, dto.reason);
  }
  @Post('orders/:id/close') closeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PurchaseOrderReasonDto,
  ) {
    return this.orderCommands.close(this.org(user), user, id, dto.reason);
  }
  @Get('orders/:id/pdf') async pdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const pdf = await this.orderDispatch.document(this.org(user), user, id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    return response.send(pdf.buffer);
  }

  @Get('receipts') receipts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('orderId') orderId?: string,
  ) {
    return this.receiptsService.list(this.org(user), user, orderId);
  }
  @Get('receipts/page') receiptPage(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PurchasingListQueryDto,
  ) {
    return this.receiptsService.listPage(this.org(user), user, query);
  }
  @Get('receipts/:id') receipt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.receiptsService.detail(this.org(user), user, id);
  }
  @Post('orders/:orderId/receipts') createReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreatePurchaseReceiptDto,
  ) {
    return this.receiptsService.create(this.org(user), user, orderId, dto);
  }
  @Patch('receipts/:id') updateReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseReceiptDto,
  ) {
    return this.receiptsService.update(this.org(user), user, id, dto);
  }
  @Post('receipts/:id/validate') validateReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.receiptValidation.validate(this.org(user), user, id);
  }
  @Post('orders/:orderId/receipts/from-extraction') fromExtraction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreateReceiptFromExtractionDto,
  ) {
    return this.receiptsService.createFromExtraction(
      this.org(user),
      user,
      orderId,
      dto.extractionId,
      dto.siteId,
      dto.locationId,
    );
  }

  @Post('orders/:orderId/delivery-notes')
  @UseInterceptors(
    FilesInterceptor('files', 4, { limits: { files: 4, fileSize: 20 * 1024 * 1024 } }),
  )
  async uploadDeliveryNotes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @UploadedFiles() files: PurchasingUploadedFile[],
  ) {
    const organizationId = this.org(user);
    await this.settingsService.assertReceiptUpload(organizationId, user, orderId);
    const uploaded = await this.stocksOcr.uploadPurchasingDocuments(
      organizationId,
      this.ocrActor(user),
      files,
    );
    const jobs = [];
    for (const document of uploaded.documents)
      jobs.push(
        await this.stocksOcr.analyzeDocument(organizationId, this.ocrActor(user), document.id),
      );
    return { documents: uploaded.documents, jobs };
  }

  @Get('delivery-notes/:documentId/status') status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
  ) {
    return this.stocksOcr.getStatus(this.org(user), this.ocrActor(user), documentId);
  }
  @Get('documents/:documentId/download') async downloadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ) {
    const result = await this.stocksOcr.getDocumentForDownload(
      this.org(user),
      this.ocrActor(user),
      documentId,
    );
    response.setHeader('Content-Type', result.document.mimeType);
    return response.download(result.absolutePath, result.document.originalName);
  }

  @Get('history') history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PurchasingListQueryDto,
  ) {
    return this.historyService.list(this.org(user), user, query);
  }
}

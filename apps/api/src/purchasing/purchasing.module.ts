import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks/stocks.module';
import { PurchasingController } from './purchasing.controller';
import { PurchasingEmailOAuthController } from './purchasing-email-oauth.controller';
import { ResendPurchasingGateway } from './resend-purchasing.gateway';
import { PurchaseOrderPdfService } from './purchase-order-pdf.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { PurchasingDeliveryService } from './purchasing-delivery.service';
import { PurchaseReceiptMatchingService } from './purchase-receipt-matching.service';
import { PurchaseDispatchService } from './purchase-dispatch.service';
import { PurchaseOrderQueryService } from './purchase-order-query.service';
import { PurchaseHistoryService } from './purchase-history.service';
import { PurchaseOrderNumberService } from './purchase-order-number.service';
import { PurchasingInstallationService } from './purchasing-installation.service';
import { PurchasingDashboardService } from './purchasing-dashboard.service';
import { PurchasingContextService } from './purchasing-context.service';
import { PurchasingSettingsService } from './purchasing-settings.service';
import { PurchasingSuggestionService } from './purchasing-suggestion.service';
import { PurchaseOrderCommandService } from './purchase-order-command.service';
import { PurchaseOrderDispatchService } from './purchase-order-dispatch.service';
import { PurchaseReceiptService } from './purchase-receipt.service';
import { PurchaseReceiptValidationService } from './purchase-receipt-validation.service';
import { PURCHASING_EMAIL_TRANSPORT } from './purchasing-email.transport';
import { PurchasingMailCryptoService } from './purchasing-mail-crypto.service';
import { PurchasingEmailConnectionService } from './purchasing-email-connection.service';
import { PurchasingEmailTemplateService } from './purchasing-email-template.service';

@Module({
  imports: [StocksModule],
  controllers: [PurchasingController, PurchasingEmailOAuthController],
  providers: [
    ResendPurchasingGateway,
    PurchaseOrderPdfService,
    PurchaseOrderPolicy,
    PurchasingDeliveryService,
    PurchaseReceiptMatchingService,
    PurchaseDispatchService,
    PurchaseOrderQueryService,
    PurchaseHistoryService,
    PurchaseOrderNumberService,
    PurchasingInstallationService,
    PurchasingDashboardService,
    PurchasingContextService,
    PurchasingSettingsService,
    PurchasingSuggestionService,
    PurchaseOrderCommandService,
    PurchaseOrderDispatchService,
    PurchaseReceiptService,
    PurchaseReceiptValidationService,
    PurchasingMailCryptoService,
    PurchasingEmailConnectionService,
    PurchasingEmailTemplateService,
    { provide: PURCHASING_EMAIL_TRANSPORT, useExisting: ResendPurchasingGateway },
  ],
})
export class PurchasingModule {}

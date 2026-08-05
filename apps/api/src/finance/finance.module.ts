import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceInstallationService } from './finance-installation.service';
import { FinancePolicy } from './finance.policy';
import { FinanceService } from './finance.service';
import { FinanceAnalyticsService } from './finance-analytics.service';
import { FinanceImportParserService } from './finance-import-parser.service';
import { FennoaClientService } from './fennoa-client.service';
import { FennoaSecretService } from './fennoa-secret.service';
import { FennoaSyncService } from './fennoa-sync.service';
import { FinanceAiService } from './finance-ai.service';
import { MistralModule } from '../mistral/mistral.module';
import { FinanceSalesInsightsService } from './finance-sales-insights.service';
import { FlatpayCredentialsService } from './flatpay-credentials.service';
import { FlatpayAutomationService } from './flatpay-automation.service';
import { PosApiCredentialsService } from './pos-api-credentials.service';
import { PosApiSyncService } from './pos-api-sync.service';
import { FinanceDocumentOcrService } from './finance-document-ocr.service';
import { FinanceExportService } from './finance-export.service';

@Module({
  imports: [MistralModule],
  controllers: [FinanceController],
  providers: [
    FinancePolicy,
    FinanceInstallationService,
    FinanceService,
    FinanceAnalyticsService,
    FinanceImportParserService,
    FennoaClientService,
    FennoaSecretService,
    FennoaSyncService,
    FinanceAiService,
    FinanceSalesInsightsService,
    FlatpayCredentialsService,
    FlatpayAutomationService,
    PosApiCredentialsService,
    PosApiSyncService,
    FinanceDocumentOcrService,
    FinanceExportService,
  ],
})
export class FinanceModule {}

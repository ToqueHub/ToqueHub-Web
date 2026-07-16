import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { StocksModule } from './stocks/stocks.module';
import { SystemModule } from './system/system.module';
import { ArchitectureModule } from './architecture/architecture.module';
import { UsersModule } from './users/users.module';
import { RnmPricesModule } from './rnm-prices/rnm-prices.module';
import { HrModule } from './hr/hr.module';
import { PlanningModule } from './planning/planning.module';
import { TechnicalSheetsModule } from './technical-sheets/technical-sheets.module';
import { ProductionModule } from './production/production.module';
import { MenusModule } from './menus/menus.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BackupsModule } from './backups/backups.module';
import { DocumentsModule } from './documents/documents.module';
import { HaccpModule } from './haccp/haccp.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { MobileModule } from './mobile/mobile.module';
import { MistralModule } from './mistral/mistral.module';
import { StockAssistantModule } from './stock-assistant/stock-assistant.module';
import { TechnicalSheetAssistantModule } from './technical-sheet-assistant/technical-sheet-assistant.module';
import { HaccpAssistantModule } from './haccp-assistant/haccp-assistant.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { SecretsModule } from './common/secrets/secrets.module';
import { HumanSupportModule } from './human-support/human-support.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    SecretsModule,
    AuthModule,
    StocksModule,
    SystemModule,
    ArchitectureModule,
    UsersModule,
    RnmPricesModule,
    HrModule,
    PlanningModule,
    TechnicalSheetsModule,
    ProductionModule,
    MenusModule,
    DashboardModule,
    BackupsModule,
    DocumentsModule,
    HaccpModule,
    DiscoveryModule,
    MobileModule,
    MistralModule,
    StockAssistantModule,
    TechnicalSheetAssistantModule,
    HaccpAssistantModule,
    PurchasingModule,
    HumanSupportModule,
  ],
})
export class AppModule {}

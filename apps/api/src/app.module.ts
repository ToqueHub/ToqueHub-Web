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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
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
  ],
})
export class AppModule {}

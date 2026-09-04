import { Module } from '@nestjs/common';
import { MistralModule } from '../mistral/mistral.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductionModule } from '../production/production.module';
import { TechnicalSheetsModule } from '../technical-sheets/technical-sheets.module';
import { MenusController } from './menus.controller';
import { MenuExportsService } from './menu-exports.service';
import { MenusService } from './menus.service';
import { CatererMenusService } from './caterer-menus.service';
import { CatererClientImportService } from './caterer-client-import.service';

@Module({
  imports: [PrismaModule, ProductionModule, TechnicalSheetsModule, MistralModule],
  controllers: [MenusController],
  providers: [MenusService, MenuExportsService, CatererMenusService, CatererClientImportService],
})
export class MenusModule {}

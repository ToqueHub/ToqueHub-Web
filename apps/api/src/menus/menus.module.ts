import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductionModule } from '../production/production.module';
import { MenusController } from './menus.controller';
import { MenuExportsService } from './menu-exports.service';
import { MenusService } from './menus.service';

@Module({
  imports: [PrismaModule, ProductionModule],
  controllers: [MenusController],
  providers: [MenusService, MenuExportsService],
})
export class MenusModule {}

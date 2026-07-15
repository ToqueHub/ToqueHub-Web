import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

@Module({
  imports: [PrismaModule],
  controllers: [MenusController],
  providers: [MenusService],
})
export class MenusModule {}

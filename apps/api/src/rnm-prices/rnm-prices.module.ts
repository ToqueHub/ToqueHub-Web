import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RnmPricesController } from './rnm-prices.controller';
import { RnmPricesService } from './rnm-prices.service';

@Module({
  imports: [PrismaModule],
  controllers: [RnmPricesController],
  providers: [RnmPricesService],
})
export class RnmPricesModule {}

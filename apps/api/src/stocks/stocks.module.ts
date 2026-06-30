import { Module } from '@nestjs/common';
import { RnmPricesModule } from '../rnm-prices/rnm-prices.module';
import { StocksController } from './stocks.controller';
import { StocksMarginsService } from './stocks-margins.service';
import { StocksOcrService } from './stocks-ocr.service';
import { StocksService } from './stocks.service';

@Module({
  imports: [RnmPricesModule],
  controllers: [StocksController],
  providers: [StocksService, StocksOcrService, StocksMarginsService],
  exports: [StocksService, StocksMarginsService],
})
export class StocksModule {}

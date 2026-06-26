import { Module } from '@nestjs/common';
import { StocksController } from './stocks.controller';
import { StocksOcrService } from './stocks-ocr.service';
import { StocksService } from './stocks.service';

@Module({
  controllers: [StocksController],
  providers: [StocksService, StocksOcrService],
  exports: [StocksService],
})
export class StocksModule {}

import { Module } from '@nestjs/common';
import { TechnicalSheetsController } from './technical-sheets.controller';
import { TechnicalSheetsService } from './technical-sheets.service';

@Module({
  controllers: [TechnicalSheetsController],
  providers: [TechnicalSheetsService],
  exports: [TechnicalSheetsService],
})
export class TechnicalSheetsModule {}

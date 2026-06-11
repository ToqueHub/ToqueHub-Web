import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks/stocks.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [StocksModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}

import { Module } from '@nestjs/common';
import { MistralModule } from '../mistral/mistral.module';
import { StocksModule } from '../stocks/stocks.module';
import { ProductMatchingService } from './product-matching.service';
import { StockAgentService } from './stock-agent.service';
import { StockAssistantController } from './stock-assistant.controller';
import { StockAssistantService } from './stock-assistant.service';

@Module({ imports: [StocksModule, MistralModule], controllers: [StockAssistantController], providers: [StockAssistantService, StockAgentService, ProductMatchingService] })
export class StockAssistantModule {}

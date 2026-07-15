import { Module } from '@nestjs/common';
import { MistralModule } from '../mistral/mistral.module';
import { TechnicalSheetsModule } from '../technical-sheets/technical-sheets.module';
import { TechnicalSheetAgentHarnessService } from './technical-sheet-agent-harness.service';
import { TechnicalSheetAssistantController } from './technical-sheet-assistant.controller';
import { TechnicalSheetAssistantService } from './technical-sheet-assistant.service';

@Module({ imports: [TechnicalSheetsModule, MistralModule], controllers: [TechnicalSheetAssistantController], providers: [TechnicalSheetAssistantService, TechnicalSheetAgentHarnessService] })
export class TechnicalSheetAssistantModule {}

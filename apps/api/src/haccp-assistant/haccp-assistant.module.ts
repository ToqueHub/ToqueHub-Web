import { Module } from '@nestjs/common';
import { HaccpModule } from '../haccp/haccp.module';
import { HaccpIotModule } from '../haccp/iot/haccp-iot.module';
import { MistralModule } from '../mistral/mistral.module';
import { HaccpAgentHarnessService } from './haccp-agent-harness.service';
import { HaccpAssistantController } from './haccp-assistant.controller';
import { HaccpAssistantService } from './haccp-assistant.service';
@Module({ imports: [HaccpModule, HaccpIotModule, MistralModule], controllers: [HaccpAssistantController], providers: [HaccpAssistantService, HaccpAgentHarnessService] }) export class HaccpAssistantModule {}

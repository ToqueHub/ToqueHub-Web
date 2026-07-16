import { Module } from '@nestjs/common';
import { MobileModule } from '../mobile/mobile.module';
import { HumanSupportController } from './human-support.controller';
import { HumanSupportService } from './human-support.service';
import { SupportRelayClient } from './support-relay.client';

@Module({ imports: [MobileModule], controllers: [HumanSupportController], providers: [HumanSupportService, SupportRelayClient], exports: [HumanSupportService] })
export class HumanSupportModule {}

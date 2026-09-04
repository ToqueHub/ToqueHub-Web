import { Module } from '@nestjs/common';
import { HumanSupportController } from './human-support.controller';
import { HumanSupportService } from './human-support.service';
import { SupportRelayClient } from './support-relay.client';

@Module({ controllers: [HumanSupportController], providers: [HumanSupportService, SupportRelayClient], exports: [HumanSupportService] })
export class HumanSupportModule {}

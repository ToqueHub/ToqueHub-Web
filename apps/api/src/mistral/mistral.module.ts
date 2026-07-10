import { Global, Module } from '@nestjs/common';
import { MistralClientService } from './mistral-client.service';

@Global()
@Module({ providers: [MistralClientService], exports: [MistralClientService] })
export class MistralModule {}

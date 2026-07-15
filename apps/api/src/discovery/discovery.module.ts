import { Module } from '@nestjs/common';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { MdnsPublisher } from './mdns-publisher';

@Module({
  controllers: [DiscoveryController],
  providers: [DiscoveryService, MdnsPublisher],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}

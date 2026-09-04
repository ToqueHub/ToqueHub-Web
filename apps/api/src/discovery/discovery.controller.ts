import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';

@ApiTags('discovery')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get()
  @ApiOkResponse({ description: 'Returns public local-network discovery metadata for this ToqueHub instance.' })
  getDiscoveryInfo() {
    return this.discoveryService.getDiscoveryInfo();
  }
}

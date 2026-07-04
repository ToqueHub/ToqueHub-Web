import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('status')
  @ApiOkResponse({
    description: 'Returns first-start initialization status for the local ToqueHub instance.',
  })
  status() {
    return this.systemService.getStatus();
  }

  @Get('instance')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({
    description: 'Returns diagnostic information for the local ToqueHub instance without exposing secrets.',
  })
  instance() {
    return this.systemService.getInstanceInfo();
  }
}

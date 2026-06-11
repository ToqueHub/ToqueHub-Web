import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
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
}

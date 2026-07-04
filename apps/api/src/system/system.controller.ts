import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SystemUpdateService } from './system-update.service';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(
    private readonly systemService: SystemService,
    private readonly systemUpdateService: SystemUpdateService,
  ) {}

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

  @Get('update/status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOkResponse({
    description: 'Returns current stable release update status for this ToqueHub instance.',
  })
  updateStatus() {
    return this.systemUpdateService.getStatus();
  }

  @Post('update/check')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOkResponse({
    description: 'Forces a GitHub Releases check for the latest stable ToqueHub version.',
  })
  checkForUpdate() {
    return this.systemUpdateService.checkNow();
  }

  @Post('update/apply')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOkResponse({
    description: 'Starts an update operation through the internal updater service.',
  })
  applyUpdate() {
    return this.systemUpdateService.applyUpdate();
  }

  @Get('update/operations/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOkResponse({
    description: 'Returns the status and logs for an update operation.',
  })
  updateOperation(@Param('id') id: string) {
    return this.systemUpdateService.getOperation(id);
  }
}

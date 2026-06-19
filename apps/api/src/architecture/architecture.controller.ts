import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ArchitectureService } from './architecture.service';

@ApiTags('architecture')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('architecture')
export class ArchitectureController {
  constructor(private readonly architectureService: ArchitectureService) {}

  @Get()
  @ApiOkResponse({ description: 'Aggregated architecture analysis.' })
  @ApiForbiddenResponse({ description: 'Administrators only.' })
  getArchitecture(@CurrentUser() user: AuthenticatedUser) {
    return this.architectureService.getArchitecture(user);
  }

  @Get('summary')
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.architectureService.getSummaryOnly(user);
  }

  @Get('modules')
  async getModules(@CurrentUser() user: AuthenticatedUser) {
    return (await this.architectureService.getArchitecture(user)).modules;
  }

  @Get('data-map')
  async getDataMap(@CurrentUser() user: AuthenticatedUser) {
    return (await this.architectureService.getArchitecture(user)).dataMap;
  }

  @Get('relations')
  async getRelations(@CurrentUser() user: AuthenticatedUser) {
    return (await this.architectureService.getArchitecture(user)).relations;
  }

  @Get('schema')
  async getSchema(@CurrentUser() user: AuthenticatedUser) {
    return (await this.architectureService.getArchitecture(user)).schema;
  }

  @Get('duplicates')
  async getDuplicates(@CurrentUser() user: AuthenticatedUser) {
    return (await this.architectureService.getArchitecture(user)).duplicates;
  }

  @Get('impact')
  async getImpact(@CurrentUser() user: AuthenticatedUser) {
    return (await this.architectureService.getArchitecture(user)).impact;
  }

  @Get('impact/:module')
  async getModuleImpact(@CurrentUser() user: AuthenticatedUser, @Param('module') module: string) {
    const impact = (await this.architectureService.getArchitecture(user)).impact;
    return impact.find((item) => item.module.toLowerCase() === module.toLowerCase() || item.module.toLowerCase() === module.toLowerCase());
  }

  @Get('documentation')
  async getDocumentation(@CurrentUser() user: AuthenticatedUser) {
    return (await this.architectureService.getArchitecture(user)).documentation;
  }
}

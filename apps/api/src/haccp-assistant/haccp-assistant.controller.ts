import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SendHaccpAssistantMessageDto } from './dto/haccp-assistant.dto';
import { HaccpAssistantService } from './haccp-assistant.service';
@ApiTags('haccp-assistant') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller('haccp-assistant')
export class HaccpAssistantController {
  constructor(private readonly service: HaccpAssistantService) {}
  private org(u: AuthenticatedUser) { if (!u.organizationId) throw new BadRequestException('Organisation requise'); return u.organizationId; }
  private actor(u: AuthenticatedUser) { return { id: u.id, role: u.role }; }
  @Post('conversations') create(@CurrentUser() u: AuthenticatedUser) { return this.service.create(this.org(u), this.actor(u)); }
  @Get('conversations/:id') conversation(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.service.conversation(this.org(u), this.actor(u), id); }
  @Post('conversations/:id/messages') message(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendHaccpAssistantMessageDto) { return this.service.message(this.org(u), this.actor(u), id, dto.content); }
  @Get('drafts/:id') draft(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.service.draft(this.org(u), this.actor(u), id); }
  @Post('drafts/:id/apply') apply(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.service.apply(this.org(u), this.actor(u), id); }
}

import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SendTechnicalSheetAssistantMessageDto } from './dto/technical-sheet-assistant.dto';
import { TechnicalSheetAssistantService } from './technical-sheet-assistant.service';

@ApiTags('technical-sheet-assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('technical-sheet-assistant')
export class TechnicalSheetAssistantController {
  constructor(private readonly service: TechnicalSheetAssistantService) {}
  private org(user: AuthenticatedUser) { if (!user.organizationId) throw new BadRequestException('Organisation requise'); return user.organizationId; }
  private actor(user: AuthenticatedUser) { return { id: user.id, role: user.role }; }
  @Post('conversations') create(@CurrentUser() user: AuthenticatedUser) { return this.service.createConversation(this.org(user), this.actor(user)); }
  @Get('conversations/:id') conversation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getConversation(this.org(user), this.actor(user), id); }
  @Post('conversations/:id/messages') message(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendTechnicalSheetAssistantMessageDto) { return this.service.message(this.org(user), this.actor(user), id, dto.content); }
  @Post('conversations/:id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 20 * 1024 * 1024 } }))
  attachment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFile() file: any) { return this.service.attachment(this.org(user), this.actor(user), id, file); }
  @Get('drafts/:id') draft(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.getDraft(this.org(user), this.actor(user), id); }
  @Post('drafts/:id/applied') applied(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.markApplied(this.org(user), this.actor(user), id); }
  @Post('drafts/:id/discard') discard(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.discardDraft(this.org(user), this.actor(user), id); }
}

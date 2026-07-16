import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CreateHumanSupportTicketDto, SendHumanSupportMessageDto } from './dto/human-support.dto';
import { HumanSupportService } from './human-support.service';

@ApiTags('human-support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('human-support')
export class HumanSupportController {
  constructor(private readonly service: HumanSupportService) {}
  private actor(user: AuthenticatedUser) { return { id: user.id, email: user.email, organizationId: user.organizationId }; }
  @Get('active') active(@CurrentUser() user: AuthenticatedUser) { return this.service.active(this.actor(user)); }
  @Get('unread-count') unread(@CurrentUser() user: AuthenticatedUser) { return this.service.unreadCount(this.actor(user)); }
  @Post('tickets') @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 20 * 1024 * 1024 } })) create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateHumanSupportTicketDto, @UploadedFile() file: any) { return this.service.create(this.actor(user), dto, file); }
  @Get('tickets/:id/messages') messages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query('after') after?: string) { return this.service.messages(this.actor(user), id, after); }
  @Get('tickets/:id') get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.get(this.actor(user), id); }
  @Post('tickets/:id/messages') @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 20 * 1024 * 1024 } })) send(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendHumanSupportMessageDto, @UploadedFile() file: any) { return this.service.send(this.actor(user), id, dto.content, file); }
  @Post('tickets/:id/read') read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.markRead(this.actor(user), id); }
  @Post('tickets/:id/close') close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.close(this.actor(user), id); }
  @Get('attachments/:id/download') async download(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() response: Response) { const attachment = await this.service.attachmentForDownload(this.actor(user), id); response.setHeader('Content-Type', attachment.mimeType); return response.download(attachment.storagePath, attachment.filename); }
}

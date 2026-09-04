import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApplyProposalDto, CreateAliasDto, CreateConversationDto, SendAssistantMessageDto, UpdateProposalDto } from './dto/stock-assistant.dto';
import { StockAssistantService } from './stock-assistant.service';

@ApiTags('stock-assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock-assistant')
export class StockAssistantController {
  constructor(private readonly service: StockAssistantService) {}
  private org(user: AuthenticatedUser) { if (!user.organizationId) throw new BadRequestException('Organisation requise'); return user.organizationId; }
  private actor(user: AuthenticatedUser) { return { id: user.id, role: user.role }; }
  @Post('conversations') create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateConversationDto) { return this.service.createConversation(this.org(u), this.actor(u), dto.locationId); }
  @Post('conversations/:conversationId/messages') message(@CurrentUser() u: AuthenticatedUser, @Param('conversationId') id: string, @Body() dto: SendAssistantMessageDto) { return this.service.handleTextMessage(this.org(u), this.actor(u), id, dto.content, dto.locationId); }
  @Get('conversations/:conversationId') conversation(@CurrentUser() u: AuthenticatedUser, @Param('conversationId') id: string) { return this.service.getConversation(this.org(u), this.actor(u), id); }
  @Post('documents/:documentId/proposals') invoice(@CurrentUser() u: AuthenticatedUser, @Param('documentId') documentId: string, @Body() dto: CreateConversationDto) { return this.service.createProposalFromInvoice(this.org(u), this.actor(u), documentId, dto.locationId); }
  @Post('invoice-attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 20 * 1024 * 1024 } }))
  invoiceAttachment(@CurrentUser() u: AuthenticatedUser, @UploadedFile() file: any, @Body() dto: CreateConversationDto) {
    return this.service.createProposalFromInvoiceAttachment(this.org(u), this.actor(u), file, dto.locationId, dto.conversationId);
  }
  @Get('proposals/:proposalId') proposal(@CurrentUser() u: AuthenticatedUser, @Param('proposalId') id: string) { return this.service.getProposal(this.org(u), id); }
  @Patch('proposals/:proposalId') update(@CurrentUser() u: AuthenticatedUser, @Param('proposalId') id: string, @Body() dto: UpdateProposalDto) { return this.service.updateProposal(this.org(u), this.actor(u), id, dto); }
  @Post('proposals/:proposalId/apply') apply(@CurrentUser() u: AuthenticatedUser, @Param('proposalId') id: string, @Body() dto: ApplyProposalDto) { return this.service.applyProposal(this.org(u), this.actor(u), id, dto.version); }
  @Post('proposals/:proposalId/reject') reject(@CurrentUser() u: AuthenticatedUser, @Param('proposalId') id: string) { return this.service.rejectProposal(this.org(u), this.actor(u), id); }
  @Post('product-aliases') alias(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateAliasDto) { return this.service.createAlias(this.org(u), this.actor(u), dto); }
  @Get('product-suggestions') suggestions(@CurrentUser() u: AuthenticatedUser, @Query('q') q: string) { return this.service.suggestions(this.org(u), q || ''); }
}

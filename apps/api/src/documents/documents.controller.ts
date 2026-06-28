import { BadRequestException, Body, Controller, Get, Param, Patch, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required before using documents');
    return user.organizationId;
  }

  @Get()
  listDocuments(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.documentsService.list(this.org(user), query);
  }

  @Get(':documentId/download')
  async downloadDocument(@CurrentUser() user: AuthenticatedUser, @Param('documentId') documentId: string, @Res() res: Response) {
    const { document, absolutePath } = await this.documentsService.getForDownload(this.org(user), documentId);
    res.setHeader('Content-Type', document.mimeType);
    return res.download(absolutePath, document.originalName);
  }

  @Patch(':documentId')
  updateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Body() body: { originalName: string }
  ) {
    return this.documentsService.update(this.org(user), documentId, body);
  }
}

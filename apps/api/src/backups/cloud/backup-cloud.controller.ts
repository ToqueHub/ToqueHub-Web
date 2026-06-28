import { BadRequestException, Body, Controller, Delete, Get, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../auth/authenticated-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BackupCloudService } from './backup-cloud.service';
import { ConfigureGoogleDriveBackupDto } from './dto/backup-cloud.dto';

@ApiTags('backup-cloud')
@Controller('backups/cloud')
export class BackupCloudController {
  constructor(private readonly backupCloudService: BackupCloudService) {}

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.backupCloudService.status(this.organizationId(user));
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Put('google/config')
  configureGoogleDrive(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfigureGoogleDriveBackupDto) {
    return this.backupCloudService.configureGoogleDrive(this.organizationId(user), dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post('google/connect')
  connectGoogleDrive(@CurrentUser() user: AuthenticatedUser) {
    return this.backupCloudService.startGoogleConnect(this.organizationId(user), user.id);
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string | undefined, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (error) {
      return res.send(this.callbackHtml('Connexion Google Drive annulée.', error, false));
    }
    if (!code || !state) {
      return res.send(this.callbackHtml('Connexion Google Drive impossible.', 'Le callback Google ne contient pas de code ou d’état OAuth valide.', false));
    }
    try {
      await this.backupCloudService.completeGoogleConnect(code, state);
      return res.send(this.callbackHtml('Google Drive connecté.', 'Vous pouvez fermer cet onglet et revenir dans ToqueHub.', true));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connexion Google Drive impossible.';
      return res.send(this.callbackHtml('Connexion Google Drive impossible.', message, false));
    }
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post('google/test')
  testGoogleDrive(@CurrentUser() user: AuthenticatedUser) {
    return this.backupCloudService.testGoogleDrive(this.organizationId(user));
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Delete('google')
  disconnectGoogleDrive(@CurrentUser() user: AuthenticatedUser) {
    return this.backupCloudService.disconnectGoogleDrive(this.organizationId(user));
  }

  private organizationId(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organisation introuvable pour cet utilisateur.');
    return user.organizationId;
  }

  private callbackHtml(title: string, message: string, ok: boolean) {
    const safeTitle = this.escapeHtml(title);
    const safeMessage = this.escapeHtml(message);
    return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; display: grid; min-height: 100vh; place-items: center; margin: 0; }
    main { background: white; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 20px 60px rgba(15,23,42,.08); max-width: 520px; padding: 32px; text-align: center; }
    .dot { width: 14px; height: 14px; border-radius: 999px; display: inline-block; background: ${ok ? '#10b981' : '#ef4444'}; margin-bottom: 16px; }
    h1 { font-size: 24px; margin: 0 0 12px; }
    p { color: #64748b; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <main>
    <span class="dot"></span>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
  </main>
  <script>
    if (window.opener) window.opener.postMessage({ type: 'toquehub:backup-cloud-google', ok: ${ok ? 'true' : 'false'} }, '*');
  </script>
</body>
</html>`;
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
  }
}

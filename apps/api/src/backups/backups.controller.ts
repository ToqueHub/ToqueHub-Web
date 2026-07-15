import { Body, Controller, Get, Param, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { resolve } from 'node:path';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SystemService } from '../system/system.service';
import { BackupScheduleDto, RestoreBackupDto } from './dto/backups.dto';
import { BackupsService } from './backups.service';

const uploadDestination = resolve(process.env.BACKUP_DIR || 'backups', 'imports');
const backupUploadInterceptor = FileInterceptor('file', {
  dest: uploadDestination,
  limits: { fileSize: Number(process.env.BACKUP_UPLOAD_MAX_BYTES || 2 * 1024 * 1024 * 1024) },
});

@ApiTags('backups')
@Controller('backups')
export class BackupsController {
  constructor(
    private readonly backupsService: BackupsService,
    private readonly systemService: SystemService,
  ) {}

  @Post('bootstrap/inspect')
  @UseInterceptors(backupUploadInterceptor)
  async inspectBootstrapUpload(@UploadedFile() file: any) {
    await this.assertNotInitialized();
    return this.backupsService.inspectUploadedArchive(file);
  }

  @Post('bootstrap/restore')
  @UseInterceptors(backupUploadInterceptor)
  async restoreBootstrapUpload(@UploadedFile() file: any, @Body() dto: RestoreBackupDto) {
    await this.assertNotInitialized();
    return this.backupsService.restoreUploadedArchive(dto, file);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Get()
  listBackups() {
    return this.backupsService.listBackups();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post()
  createBackup(@CurrentUser() user: AuthenticatedUser) {
    return this.backupsService.createBackup({ userId: user.id, organizationId: user.organizationId, mode: 'manual' });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Get('schedule')
  getSchedule() {
    return this.backupsService.getSchedule();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Patch('schedule')
  updateSchedule(@Body() dto: BackupScheduleDto) {
    return this.backupsService.updateSchedule(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post('upload/inspect')
  @UseInterceptors(backupUploadInterceptor)
  inspectUpload(@UploadedFile() file: any) {
    return this.backupsService.inspectUploadedArchive(file);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post('upload/restore')
  @UseInterceptors(backupUploadInterceptor)
  restoreUpload(@UploadedFile() file: any, @Body() dto: RestoreBackupDto) {
    return this.backupsService.restoreUploadedArchive(dto, file);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Get(':id/download')
  async downloadBackup(@Param('id') id: string, @Res() res: Response) {
    const backup = await this.backupsService.getBackupForDownload(id);
    res.setHeader('Content-Type', 'application/gzip');
    return res.download(backup.absolutePath, backup.filename);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post(':id/cloud/google')
  sendBackupToGoogleDrive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.backupsService.sendLocalBackupToGoogleDrive(id, user.organizationId);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post(':id/restore')
  restoreLocalBackup(@Param('id') id: string, @Body() dto: RestoreBackupDto) {
    return this.backupsService.restoreLocalBackup(id, dto);
  }

  private async assertNotInitialized() {
    const status = await this.systemService.getStatus();
    this.backupsService.assertBootstrapRestoreAllowed(status);
  }
}

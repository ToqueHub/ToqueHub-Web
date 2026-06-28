import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RestoreBackupDto {
  @IsString()
  confirmationPhrase!: string;

  @IsOptional()
  @IsString()
  uploadId?: string;
}

export class BackupScheduleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['daily', 'weekly'])
  frequency!: 'daily' | 'weekly';

  @IsString()
  time!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  weekday?: number;

  @IsInt()
  @Min(1)
  retentionDays!: number;
}

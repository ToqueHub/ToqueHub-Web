import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class ConfigureGoogleDriveBackupDto {
  @IsString()
  @MaxLength(1024)
  clientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  clientSecret?: string;

  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  redirectUri!: string;
}

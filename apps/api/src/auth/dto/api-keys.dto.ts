import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationApiKeysDto {
  @ApiPropertyOptional({ description: 'Mistral API key used by backend OCR processing.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mistralApiKey?: string;

  @ApiPropertyOptional({ description: 'Resend API key used by the Purchasing module.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resendApiKey?: string;

  @ApiPropertyOptional({ description: 'GitHub token used to read private repository releases for updates and changelog.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  githubToken?: string;
}

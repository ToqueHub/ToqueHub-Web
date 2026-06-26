import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationApiKeysDto {
  @ApiPropertyOptional({ description: 'Mistral API key used by backend OCR processing.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mistralApiKey?: string;
}


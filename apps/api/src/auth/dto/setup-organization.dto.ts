import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const ESTABLISHMENT_TYPES = ['Restaurant', 'EHPAD', 'Collectivité', 'Hôtel', 'Traiteur', 'Cuisine centrale', 'Autre'];
const TEAM_SIZES = ['1-5', '6-10', '11-20', '20+'];
const HR_COUNTRY_CODES = ['FR', 'FI'];

export class SetupOrganizationDto {
  @ApiProperty({ example: 'Bistrot des Halles' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'bistrot-halles' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'code can only contain letters, numbers, dots, dashes and underscores',
  })
  code?: string;

  @ApiPropertyOptional({ example: 'Restaurant', enum: ESTABLISHMENT_TYPES })
  @IsOptional()
  @IsString()
  @IsIn(ESTABLISHMENT_TYPES)
  establishmentType?: string;

  @ApiPropertyOptional({ example: 'FR', enum: HR_COUNTRY_CODES, description: 'Pays du cadre RH utilisé, indépendant de la langue de l’interface.' })
  @IsOptional()
  @IsString()
  @IsIn(HR_COUNTRY_CODES)
  hrCountryCode?: string;

  @ApiPropertyOptional({ example: 'FR', enum: HR_COUNTRY_CODES, description: 'Pays RH utilisé pour les congés payés ou annuels.' })
  @IsOptional()
  @IsString()
  @IsIn(HR_COUNTRY_CODES)
  regulatoryCountryCode?: string;

  @ApiPropertyOptional({ example: '6-10', enum: TEAM_SIZES })
  @IsOptional()
  @IsString()
  @IsIn(TEAM_SIZES)
  teamSize?: string;

  @ApiPropertyOptional({ description: 'Logo encoded as a data URL', example: 'data:image/png;base64,...' })
  @IsOptional()
  @IsString()
  @MaxLength(750_000)
  logoDataUrl?: string;

  @ApiPropertyOptional({ example: 'Site principal' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  primarySiteName?: string;

  @ApiPropertyOptional({ type: [String], example: ['Cousamo', 'Oulu'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(180, { each: true })
  secondarySiteNames?: string[];

  @ApiPropertyOptional({ description: 'Optional Mistral API key used for OCR imports.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mistralApiKey?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const ESTABLISHMENT_TYPES = [
  'Restaurant',
  'EHPAD',
  'Collectivité',
  'Hôtel',
  'Traiteur',
  'Cuisine centrale',
  'Autre',
] as const;

export const TEAM_SIZES = ['1-5', '6-10', '11-20', '20+'] as const;
export const HR_COUNTRY_CODES = ['FR', 'FI'] as const;

export class CompleteOnboardingDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'username can only contain letters, numbers, dots, dashes and underscores',
  })
  username!: string;

  @ApiProperty({ example: 'Paul' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Breton' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({ example: 'admin@toquehub.local' })
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @ApiProperty({ example: 'ToqueHub-2026!' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message: 'password must contain uppercase, lowercase, number and special character',
  })
  password!: string;

  @ApiProperty({ example: 'EHPAD Les Tilleuls' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  organizationName!: string;

  @ApiPropertyOptional({ enum: ESTABLISHMENT_TYPES, example: 'EHPAD' })
  @IsOptional()
  @IsString()
  @IsIn(ESTABLISHMENT_TYPES)
  establishmentType?: string;

  @ApiPropertyOptional({ enum: HR_COUNTRY_CODES, example: 'FR', description: 'Pays du cadre RH utilisé, indépendant de la langue de l’interface.' })
  @IsOptional()
  @IsString()
  @IsIn(HR_COUNTRY_CODES)
  hrCountryCode?: string;

  @ApiPropertyOptional({ enum: HR_COUNTRY_CODES, example: 'FR', description: 'Pays RH utilisé pour les congés payés ou annuels.' })
  @IsOptional()
  @IsString()
  @IsIn(HR_COUNTRY_CODES)
  regulatoryCountryCode?: string;

  @ApiPropertyOptional({ enum: TEAM_SIZES, example: '6-10' })
  @IsOptional()
  @IsString()
  @IsIn(TEAM_SIZES)
  teamSize?: string;

  @ApiPropertyOptional({ description: 'Logo encoded as a data URL.' })
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

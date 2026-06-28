import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const REGULATORY_COUNTRY_CODES = ['FR', 'FI'] as const;

export class UpdateRegulatoryCountryDto {
  @ApiPropertyOptional({
    enum: REGULATORY_COUNTRY_CODES,
    nullable: true,
    description: 'Pays juridique/réglementaire de l’organisation. Indépendant de la langue de l’interface.',
  })
  @IsOptional()
  @IsString()
  @IsIn(REGULATORY_COUNTRY_CODES)
  regulatoryCountryCode?: string | null;
}

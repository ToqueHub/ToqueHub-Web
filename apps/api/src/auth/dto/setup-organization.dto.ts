import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const ESTABLISHMENT_TYPES = ['Restaurant', 'EHPAD', 'Collectivité', 'Hôtel', 'Traiteur', 'Cuisine centrale', 'Autre'];
const TEAM_SIZES = ['1-5', '6-10', '11-20', '20+'];

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
}

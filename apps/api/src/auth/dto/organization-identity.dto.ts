import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ESTABLISHMENT_TYPES, TEAM_SIZES } from './complete-onboarding.dto';

export class UpdateOrganizationIdentityDto {
  @ApiPropertyOptional({ example: 'The French Café' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ESTABLISHMENT_TYPES, example: 'Restaurant' })
  @IsOptional()
  @IsString()
  @IsIn(ESTABLISHMENT_TYPES)
  establishmentType?: string | null;

  @ApiPropertyOptional({ enum: TEAM_SIZES, example: '6-10' })
  @IsOptional()
  @IsString()
  @IsIn(TEAM_SIZES)
  teamSize?: string | null;
}

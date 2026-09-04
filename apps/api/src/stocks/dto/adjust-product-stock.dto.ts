import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class AdjustProductStockDto {
  @ApiPropertyOptional({
    description: 'Projection de stock précise à corriger lorsqu’elle existe déjà.',
  })
  @IsOptional()
  @IsUUID()
  stockId?: string;

  @ApiPropertyOptional({ description: 'Site à utiliser pour créer une première projection.' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Emplacement à utiliser pour la projection.' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiProperty({ example: 200000, description: 'Quantité physique réellement constatée.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity!: number;

  @ApiPropertyOptional({ example: 'Stock initial contrôlé à l’ouverture du compte' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

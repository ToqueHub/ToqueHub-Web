import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateStockMovementDto {
  @ApiProperty({ example: 'uuid-produit' })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({ example: 'uuid-lot' })
  @IsOptional()
  @IsUUID()
  lotId?: string;

  @ApiPropertyOptional({ example: 'uuid-fournisseur' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiProperty({ enum: [StockMovementType.IN, StockMovementType.OUT, StockMovementType.LOSS, StockMovementType.TRANSFER], example: StockMovementType.IN })
  @IsEnum(StockMovementType)
  @IsIn([StockMovementType.IN, StockMovementType.OUT, StockMovementType.LOSS, StockMovementType.TRANSFER], { message: 'La saisie manuelle accepte uniquement Entrée, Sortie, Perte ou Transfert.' })
  type!: StockMovementType;

  @ApiProperty({ example: 25 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @ApiPropertyOptional({ example: 'uuid-unite-compatible' })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ example: 'uuid-site-source' })
  @IsOptional()
  @IsUUID()
  sourceSiteId?: string;

  @ApiPropertyOptional({ example: 'uuid-emplacement-source' })
  @IsOptional()
  @IsUUID()
  sourceLocationId?: string;

  @ApiPropertyOptional({ example: 'uuid-site-destination' })
  @IsOptional()
  @IsUUID()
  destinationSiteId?: string;

  @ApiPropertyOptional({ example: 'uuid-emplacement-destination' })
  @IsOptional()
  @IsUUID()
  destinationLocationId?: string;

  @ApiPropertyOptional({ example: 'Réception commande Metro' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: '2026-06-11T12:00:00.000Z' })
  @IsOptional()
  @IsString()
  movementDate?: string;
}

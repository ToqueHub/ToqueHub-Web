import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Farine' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'FARINE-T55' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string | null;

  @ApiPropertyOptional({ example: 'Farine de blé T55' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({ example: 'uuid-unite' })
  @IsUUID()
  unitId!: string;

  @ApiPropertyOptional({ example: 'uuid-categorie' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'uuid-fournisseur' })
  @IsOptional()
  @IsUUID()
  primarySupplierId?: string | null;

  @ApiPropertyOptional({ example: 3.25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  averagePrice?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minimumStock?: number;

  @ApiPropertyOptional({ example: '6410401234567' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  gtin?: string | null;

  @ApiPropertyOptional({ example: 'Finlande' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  originCountry?: string | null;

  @ApiPropertyOptional({ example: 'Carton 12 x 1 L' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  packageLabel?: string | null;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  unitsPerPackage?: number | null;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  unitWeightGrams?: number | null;

  @ApiPropertyOptional({ example: 12000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  netWeightGrams?: number | null;

  @ApiPropertyOptional({ example: 'Lait, ferments lactiques.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  ingredients?: string | null;

  @ApiPropertyOptional({ example: ['Lait'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  allergensPresent?: string[];

  @ApiPropertyOptional({ example: ['Fruits à coque'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  possibleTraces?: string[];

  @ApiPropertyOptional({ example: ['Sans gluten', 'Bio'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  dietaryTags?: string[];

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  energyKj?: number | null;

  @ApiPropertyOptional({ example: 29 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  energyKcal?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  fatGrams?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  saturatedFatGrams?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  carbohydratesGrams?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  sugarsGrams?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  fiberGrams?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  proteinGrams?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  saltGrams?: number | null;

  @ApiPropertyOptional({ example: 'Réfrigéré' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  storageType?: string | null;

  @ApiPropertyOptional({ example: '3 jours' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  shelfLifeAfterOpening?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  storageInstructions?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  preparationInstructions?: string | null;
}

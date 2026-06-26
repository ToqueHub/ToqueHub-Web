import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { UnitType } from '@prisma/client';

export class ListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;
}

export class UpsertCategoryDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpsertUnitDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(24)
  symbol!: string;

  @IsOptional()
  @IsEnum(UnitType)
  type?: UnitType;
}

export class UpsertSupplierDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpsertProductDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsUUID()
  unitId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsUUID()
  primarySupplierId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  averagePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minimumStock?: number;
}

export class UpsertSiteDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpsertLocationDto extends UpsertSiteDto {
  @IsUUID()
  siteId!: string;
}

export class UpsertUnitConversionDto {
  @IsUUID()
  fromUnitId!: string;

  @IsUUID()
  toUnitId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  factor!: number;
}

export class UpsertLotDto {
  @IsString()
  @MaxLength(120)
  lotNumber!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

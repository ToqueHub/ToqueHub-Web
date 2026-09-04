import {
  ProductionNeedSource,
  ProductionNeedStatus,
  ProductionPriority,
  ProductionProfileMode,
  ProductionRoundingMode,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DECIMAL_OPTIONS = { decimal_digits: '0,3', force_decimal: false } as const;

export class ProductionPlanningQueryDto {
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsUUID() technicalSheetId?: string;
  @IsOptional() @IsEnum(ProductionNeedStatus) status?: ProductionNeedStatus;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class CreateProductionNeedDto {
  @IsUUID() siteId!: string;
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsUUID() unitId!: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsEnum(ProductionNeedSource) source!: ProductionNeedSource;
  @IsOptional() @IsString() @MaxLength(80) sourceReferenceType?: string;
  @IsOptional() @IsString() @MaxLength(160) sourceReferenceId?: string;
  @IsDecimal(DECIMAL_OPTIONS) quantity!: string;
  @IsString() neededAt!: string;
  @IsOptional() @IsEnum(ProductionPriority) priority?: ProductionPriority;
  @IsOptional() @IsEnum(ProductionNeedStatus) status?: ProductionNeedStatus;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class UpsertProductionProfileDto {
  @IsUUID() siteId!: string;
  @IsUUID() technicalSheetId!: string;
  @IsUUID() outputProductId!: string;
  @IsOptional() @IsUUID() outputVariantId?: string;
  @IsUUID() yieldUnitId!: string;
  @IsOptional() @IsEnum(ProductionProfileMode) mode?: ProductionProfileMode;
  @IsDecimal(DECIMAL_OPTIONS) referenceYield!: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) minimumQuantity?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) optimalQuantity?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) maximumQuantity?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) stepQuantity?: string;
  @IsOptional() @IsArray() @IsDecimal(DECIMAL_OPTIONS, { each: true }) allowedFormats?: string[];
  @IsOptional() @IsBoolean() allowHalfBatch?: boolean;
  @IsOptional() @IsBoolean() allowDoubleBatch?: boolean;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) averageLossPercent?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) safetyMarginPercent?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) quantityPerMold?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) quantityPerTray?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) quantityPerContainer?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) quantityPerCycle?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maximumCycles?: number;
  @IsOptional() @IsBoolean() canFreeze?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) shelfLifeHours?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) frozenShelfLifeHours?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) shelfLifeAfterThawHours?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) thawingTimeMinutes?: number;
  @IsOptional() @IsBoolean() canRefreeze?: boolean;
  @IsOptional() @IsEnum(ProductionRoundingMode) roundingMode?: ProductionRoundingMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}

export class SimulateProductionSuggestionDto {
  @IsUUID() profileId!: string;
  @IsDecimal(DECIMAL_OPTIONS) grossRequirement!: string;
  @IsString() neededAt!: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) storageCapacity?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) optimizedTarget?: string;
}

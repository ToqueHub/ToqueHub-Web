import {
  ConservationState,
  ProductionOperationStatus,
  ProductionPriority,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDecimal,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DECIMAL_OPTIONS = { decimal_digits: '0,3', force_decimal: false } as const;

export class CreateProductionCampaignDto {
  @IsUUID() profileId!: string;
  @IsDecimal(DECIMAL_OPTIONS) grossRequirement!: string;
  @IsString() neededAt!: string;
  @IsOptional() @IsString() @MaxLength(8) plannedTime?: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsEnum(ProductionPriority) priority?: ProductionPriority;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() responsibleEmployeeId?: string;
  @IsOptional() @IsUUID() destinationLocationId?: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) needIds?: string[];
  @IsOptional() @IsIn(['RECOMMENDED', 'MINIMAL', 'OPTIMIZED']) scenarioKind?:
    | 'RECOMMENDED'
    | 'MINIMAL'
    | 'OPTIMIZED';
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) storageCapacity?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) optimizedTarget?: string;
  @IsOptional() @IsBoolean() createSubRecipeNeeds?: boolean;
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
}

export class UpdateProductionCampaignDto {
  @IsDecimal(DECIMAL_OPTIONS) grossRequirement!: string;
  @IsString() @MaxLength(8) plannedTime!: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) targetPortions?: string;
}

export class ValidateProductionCampaignDto {
  @IsOptional() @IsBoolean() allowShortage?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) overrideReason?: string;
  @IsOptional() @IsString() @MaxLength(120) idempotencyKey?: string;
}

export class StartProductionBatchDto {
  @IsOptional() @IsString() @MaxLength(120) idempotencyKey?: string;
}

export class CompleteProductionBatchDto {
  @IsDecimal(DECIMAL_OPTIONS) actualQuantity!: string;
  @IsOptional() @IsDecimal(DECIMAL_OPTIONS) lostQuantity?: string;
  @IsOptional() @IsUUID() destinationLocationId?: string;
  @IsOptional() @IsEnum(ConservationState) conservationState?: ConservationState;
  @IsOptional() @IsString() expiresAt?: string;
  @IsString() @MaxLength(120) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateProductionOperationDto {
  @IsEnum(ProductionOperationStatus) status!: ProductionOperationStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsUUID() responsibleEmployeeId?: string;
}

export class ProductionStockQueryDto {
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsEnum(ConservationState) state?: ConservationState;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class TransitionProductionStockDto {
  @IsDecimal(DECIMAL_OPTIONS) quantity!: string;
  @IsEnum(ConservationState) destinationState!: ConservationState;
  @IsOptional() @IsString() availableAt?: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsString() @MaxLength(120) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

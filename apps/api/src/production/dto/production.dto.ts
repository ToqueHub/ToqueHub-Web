import { Type, Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ProductionExportFormat, ProductionExportType, ProductionOrderStatus, ProductionPriority } from '@prisma/client';

export class ProductionQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsEnum(ProductionOrderStatus) status?: ProductionOrderStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class CreateProductionOrderDto {
  @IsUUID() technicalSheetId!: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsString() productionDate!: string;
  @IsString() @MaxLength(8) plannedTime!: string;
  @Type(() => Number) @Min(0.001) plannedPortions!: number;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() responsibleEmployeeId?: string;
  @IsOptional() @IsEnum(ProductionPriority) priority?: ProductionPriority;
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
}

export class UpdateProductionOrderDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() productionDate?: string;
  @IsOptional() @IsString() @MaxLength(8) plannedTime?: string;
  @IsOptional() @Type(() => Number) @Min(0.001) plannedPortions?: number;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() responsibleEmployeeId?: string;
  @IsOptional() @IsEnum(ProductionPriority) priority?: ProductionPriority;
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
}

export class ChangeProductionStatusDto {
  @IsEnum(ProductionOrderStatus) status!: ProductionOrderStatus;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() confirmCriticalOverride?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) overrideReason?: string;
}

export class UpsertProductionAssignmentDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsUUID() planningAssignmentId?: string;
  @IsOptional() @IsString() @MaxLength(500) mission?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1440) plannedMinutes?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isLead?: boolean;
}

export class CloseProductionRealizationDto {
  @Type(() => Number) @Min(0) realizedPortions!: number;
  @IsOptional() @IsString() actualStartTime?: string;
  @IsOptional() @IsString() actualEndTime?: string;
  @IsOptional() @Type(() => Number) @Min(0) losses?: number;
  @IsOptional() variance?: unknown;
  @IsOptional() @Type(() => Number) @Min(0) yieldPercent?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() qualityControlDone?: boolean;
  @IsOptional() qualityControlDetails?: unknown;
  @IsOptional() @IsString() @MaxLength(2000) varianceCauses?: string;
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() managerValidated?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() confirmDestocking?: boolean;
}

export class PrepareProductionExportDto {
  @IsEnum(ProductionExportType) type!: ProductionExportType;
  @IsEnum(ProductionExportFormat) format!: ProductionExportFormat;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() filters?: unknown;
}

export class ConfirmDestockingDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

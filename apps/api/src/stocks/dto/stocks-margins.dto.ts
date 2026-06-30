import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MarginsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() period?: 'week' | 'month' | 'year';
  @IsOptional() @Type(() => Number) @IsNumber() page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() pageSize?: number;
}

export class UpdateMarginSettingsDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(1000) priceIncreaseThresholdPct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(1000) anomalyThresholdPct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(1000) quantityAnomalyThresholdPct?: number;
}

export class GenerateMarginReportDto {
  @IsOptional() @IsString() period?: 'week' | 'month' | 'year';
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}

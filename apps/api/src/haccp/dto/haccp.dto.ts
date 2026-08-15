import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

const toNumber = ({ value }: { value: unknown }) => value === '' || value == null ? undefined : Number(value);
const toBool = ({ value }: { value: unknown }) => value === true || value === 'true';

export class ListHaccpQueryDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
}

export class TemperatureRangeDto {
  @Transform(toNumber) @IsNumber() min!: number;
  @Transform(toNumber) @IsNumber() max!: number;
}

export class CreateTemperatureEquipmentDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() type!: string;
  @IsOptional() @ValidateNested() @Type(() => TemperatureRangeDto) temperatureRange?: TemperatureRangeDto;
}

export class CreateTemperatureReadingDto {
  @IsString() @IsNotEmpty() equipmentId!: string;
  @Transform(toNumber) @IsNumber() temperature!: number;
  @IsString() @IsNotEmpty() date!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() user?: string;
}

export class ReceptionDto {
  @IsString() @IsNotEmpty() supplier!: string;
  @IsString() @IsNotEmpty() productName!: string;
  @IsOptional() @IsString() productType?: string;
  @IsString() @IsNotEmpty() temperature!: string;
  @IsOptional() @IsString() lotNumber?: string;
  @Transform(toNumber) @IsNumber() quantity!: number;
  @IsString() @IsNotEmpty() unit!: string;
  @Transform(toNumber) @IsOptional() @IsNumber() unitPrice?: number;
  @IsOptional() @IsString() photo?: string;
  @IsString() @IsNotEmpty() date!: string;
}

export class UpdateReceptionDto {
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsString() productType?: string;
  @IsOptional() @IsString() temperature?: string;
  @IsOptional() @IsString() lotNumber?: string;
  @Transform(toNumber) @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() unit?: string;
  @Transform(toNumber) @IsOptional() @IsNumber() unitPrice?: number;
  @IsOptional() @IsString() photo?: string;
  @IsOptional() @IsString() date?: string;
}

export class TraceabilityDto {
  @IsString() @IsNotEmpty() photo!: string;
  @IsString() @IsNotEmpty() productName!: string;
  @IsString() @IsNotEmpty() lotNumber!: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() date?: string;
}

export class UpdateTraceabilityDto {
  @IsOptional() @IsString() photo?: string;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsString() lotNumber?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() date?: string;
}

export class AnalyzeImageDto {
  @IsString() @IsNotEmpty() image!: string;
}

export class HaccpProductDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() type!: string;
  @IsOptional() @IsString() sourceProductId?: string;
  @IsOptional() @IsString() dlc?: string;
  @Transform(toNumber) @IsOptional() @IsInt() @Min(0) dlcDays?: number;
  @IsOptional() @IsString() description?: string;
  @Transform(toNumber) @IsOptional() @IsNumber() price?: number;
  @Transform(toNumber) @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() unit?: string;
}

export class UpdateHaccpProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() dlc?: string;
  @Transform(toNumber) @IsOptional() @IsInt() @Min(0) dlcDays?: number;
  @IsOptional() @IsString() description?: string;
  @Transform(toNumber) @IsOptional() @IsNumber() price?: number;
  @Transform(toNumber) @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() unit?: string;
}

export class ProcessEquipmentDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() type!: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @ValidateNested() @Type(() => TemperatureRangeDto) temperatureRange?: TemperatureRangeDto;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class UpdateProcessEquipmentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @ValidateNested() @Type(() => TemperatureRangeDto) temperatureRange?: TemperatureRangeDto;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class ProcessSessionDto {
  @IsString() @IsNotEmpty() productId!: string;
  @IsOptional() @IsString() productionSessionId?: string;
  @IsString() @IsNotEmpty() equipmentId!: string;
  @Transform(toNumber) @IsNumber() startTemperature!: number;
  @Transform(toNumber) @IsOptional() @IsNumber() endTemperature?: number;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateProcessSessionDto {
  @Transform(toNumber) @IsOptional() @IsNumber() endTemperature?: number;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CompleteProcessSessionDto {
  @Transform(toNumber) @IsNumber() endTemperature!: number;
}

export class OilEquipmentDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() type!: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class UpdateOilEquipmentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class OilSessionDto {
  @IsString() @IsNotEmpty() equipmentId!: string;
  @IsString() @IsNotEmpty() testMethod!: string;
  @IsString() @IsNotEmpty() action!: string;
  @IsOptional() @IsString() notes?: string;
}

export class CleaningSurfaceDto {
  @IsOptional() @IsString() _id?: string;
  @IsOptional() @IsString() id?: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() frequency!: string;
  @IsOptional() @IsString() lastCleaned?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class CleaningZoneDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CleaningSurfaceDto) surfaces?: CleaningSurfaceDto[];
}

export class MarkSurfaceDto {
  @IsString() @IsNotEmpty() surfaceId!: string;
  @IsString() @IsNotEmpty() surfaceName!: string;
  @IsString() @IsNotEmpty() zoneId!: string;
  @IsString() @IsNotEmpty() zoneName!: string;
  @IsOptional() @IsString() notes?: string;
}

export class CompleteCleaningSessionDto {
  @IsOptional() @IsString() notes?: string;
}

export class ProductionSessionDto {
  @IsString() @IsNotEmpty() lotNumber!: string;
  @IsString() @IsNotEmpty() finishedProductId!: string;
  @Transform(toNumber) @IsNumber() quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() photos?: unknown;
}

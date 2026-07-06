import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListSensorReadingsDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class UpdateSensorDto {
  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  temperatureMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  temperatureMax?: number;
}

export class RenameSensorDto {
  @IsString()
  name!: string;
}

export class AssignSensorDto {
  @IsString()
  haccpTemperatureEquipmentId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PairingStartDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(30)
  @Max(900)
  durationSeconds?: number;
}

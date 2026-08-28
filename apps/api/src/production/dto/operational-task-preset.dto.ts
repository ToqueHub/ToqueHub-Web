import { OperationalTaskCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class OperationalTaskPresetQueryDto {
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() siteId?: string;
}

export class UpsertOperationalTaskPresetDto {
  @IsString() @MaxLength(180) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsEnum(OperationalTaskCategory) category!: OperationalTaskCategory;
  @IsUUID() departmentId!: string;
  @IsOptional() @IsUUID() siteId?: string | null;
  @IsUUID() assignedEmployeeId!: string;
  @IsOptional() @IsUUID() technicalSheetId?: string | null;
  @IsOptional() @IsUUID() technicalSheetStepId?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  serviceWeekdays!: number[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(14)
  leadDays!: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.001) quantity?: number | null;
  @IsOptional() @IsString() @MaxLength(40) unitLabel?: string | null;
  @IsOptional() @IsDateString() startsOn?: string | null;
  @IsOptional() @IsDateString() endsOn?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

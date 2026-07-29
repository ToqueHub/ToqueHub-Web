import {
  OperationalTaskCategory,
  OperationalTaskSource,
  OperationalTaskStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class OperationalTaskQueryDto {
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsEnum(OperationalTaskStatus) status?: OperationalTaskStatus;
}

export class OperationalTaskAssigneeQueryDto {
  @IsUUID() departmentId!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsUUID() taskId?: string;
}

export class OperationalTaskOptionsQueryDto {
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() technicalSheetId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class UpsertOperationalTaskDto {
  @IsString() @MaxLength(180) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsEnum(OperationalTaskCategory) category!: OperationalTaskCategory;
  @IsUUID() departmentId!: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() assignedEmployeeId?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assignedEmployeeIds?: string[];
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsBoolean() isTimeScheduled?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsString() @MaxLength(40) unitLabel?: string;
  @IsOptional() @IsEnum(OperationalTaskSource) source?: OperationalTaskSource;
  @IsOptional() @IsUUID() menuId?: string;
  @IsOptional() @IsUUID() technicalSheetId?: string;
  @IsOptional() @IsUUID() technicalSheetStepId?: string;
  @IsOptional() @IsUUID() productionBatchId?: string;
  @IsOptional() @IsUUID() productionOperationId?: string;
  @IsOptional() @IsString() @MaxLength(80) positionTaskPresetId?: string;
}

export class UpdateOperationalTaskDto {
  @IsOptional() @IsString() @MaxLength(180) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsEnum(OperationalTaskCategory) category?: OperationalTaskCategory;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string | null;
  @IsOptional() @IsUUID() siteId?: string | null;
  @IsOptional() @IsUUID() assignedEmployeeId?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assignedEmployeeIds?: string[];
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() isTimeScheduled?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number | null;
  @IsOptional() @IsString() @MaxLength(40) unitLabel?: string | null;
  @IsOptional() @IsEnum(OperationalTaskSource) source?: OperationalTaskSource;
  @IsOptional() @IsUUID() menuId?: string | null;
  @IsOptional() @IsUUID() technicalSheetId?: string | null;
  @IsOptional() @IsUUID() technicalSheetStepId?: string | null;
  @IsOptional() @IsUUID() productionBatchId?: string | null;
  @IsOptional() @IsUUID() productionOperationId?: string | null;
  @IsOptional() @IsString() @MaxLength(80) positionTaskPresetId?: string | null;
}

export class UpdateOperationalTaskStatusDto {
  @IsEnum(OperationalTaskStatus) status!: OperationalTaskStatus;
}

export class GenerateOperationalTasksFromMenuDto {
  @IsUUID() menuId!: string;
  @IsUUID() departmentId!: string;
  @IsDateString() date!: string;
  @IsString() serviceTime!: string;
  @IsOptional() @IsUUID() siteId?: string;
}

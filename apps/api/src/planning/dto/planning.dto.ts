import { Type, Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { HrAbsenceStatus, HrAbsenceType, PlanningAssignmentOrigin, PlanningAssignmentStatus, PlanningExportFormat, PlanningExportScope, PlanningNeedPriority, PlanningReplacementStatus } from '@prisma/client';

export class PlanningQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) month?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() seasonalTemplateId?: string;
  @IsOptional() @IsEnum(PlanningAssignmentStatus) status?: PlanningAssignmentStatus;
  @IsOptional() @IsEnum(PlanningReplacementStatus) replacementStatus?: PlanningReplacementStatus;
  @IsOptional() @IsEnum(HrAbsenceStatus) absenceStatus?: HrAbsenceStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class PlanningContextQueryDto extends PlanningQueryDto {}

export class UpsertPlanningAssignmentDto {
  @IsUUID() employeeId!: string;
  @IsUUID() departmentId!: string;
  @IsUUID() positionId!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() rotationId?: string;
  @IsString() date!: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(720) breakMinutes?: number;
  @IsOptional() @IsEnum(PlanningAssignmentStatus) status?: PlanningAssignmentStatus;
  @IsOptional() @IsEnum(PlanningAssignmentOrigin) origin?: PlanningAssignmentOrigin;
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() allowCriticalOverride?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) overrideReason?: string;
}

export class UpsertDayPlanningAssignmentDto extends UpsertPlanningAssignmentDto {
  @IsOptional() @IsUUID() templateId?: string;
}

export class MovePlanningAssignmentDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() allowCriticalOverride?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) overrideReason?: string;
}

export class UpsertPlanningNeedDto {
  @IsUUID() departmentId!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() requiredSkillId?: string;
  @IsOptional() @IsString() @MaxLength(160) label?: string;
  @IsOptional() @IsString() @MaxLength(40) season?: string;
  @IsOptional() @IsString() @MaxLength(40) timeSlot?: string;
  @IsString() startDate!: string;
  @IsOptional() @IsString() endDate?: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) requiredCount!: number;
  @IsOptional() @IsEnum(PlanningNeedPriority) priority?: PlanningNeedPriority;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class UpsertPlanningTemplateDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(60) periodType?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() content?: unknown;
}

export class UpsertDayPresetDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(720) breakMinutes?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() paidBreak?: boolean;
  @IsOptional() @IsString() @MaxLength(40) businessStatus?: string;
}

export class UpsertWeeklyRotationDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() days?: unknown;
}

export class SetEmployeePlanningTemplatesDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) dayPresetIds?: string[];
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) weeklyRotationIds?: string[];
  @IsOptional() @IsUUID() defaultWeeklyRotationId?: string;
}

export class ApplyPlanningTemplateDto {
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() apply?: boolean;
}

export class GeneratePlanningDto {
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() apply?: boolean;
}

export class PlanningRotationPreviewDto {
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() siteId?: string;
}

export class ApplyPlanningRotationDto extends PlanningRotationPreviewDto {
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() replaceExisting?: boolean;
}

export class PlanningPeriodActionDto {
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() force?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class AcceptReplacementDto {
  @IsUUID() replacementEmployeeId!: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class UpsertHrAbsenceDto {
  @IsUUID() employeeId!: string;
  @IsEnum(HrAbsenceType) type!: HrAbsenceType;
  @IsOptional() @IsEnum(HrAbsenceStatus) status?: HrAbsenceStatus;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class UpsertHrSkillDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class SetEmployeeSkillsDto {
  @IsArray() @IsUUID(undefined, { each: true }) skillIds!: string[];
}

export class PrepareExportDto {
  @IsEnum(PlanningExportFormat) format!: PlanningExportFormat;
  @IsEnum(PlanningExportScope) scope!: PlanningExportScope;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() filters?: unknown;
}

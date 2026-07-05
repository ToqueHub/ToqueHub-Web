import { Type, Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { HrAbsenceStatus, HrAbsenceType, PlanningAssignmentOrigin, PlanningAssignmentStatus, PlanningAttendanceStatus, HrTimeAccountDirection, PlanningDayStatusSourceType, PlanningExportFormat, PlanningExportScope, PlanningNeedPriority, PlanningReplacementStatus, PlanningTimeUnit, PlanningVisibilityLevel } from '@prisma/client';

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

export class PlanningDayStatusQueryDto extends PlanningQueryDto {
  @IsOptional() @IsString() statusCode?: string;
  @IsOptional() @IsEnum(PlanningDayStatusSourceType) sourceType?: PlanningDayStatusSourceType;
}

export class UpsertPlanningDayStatusDto {
  @IsUUID() employeeId!: string;
  @IsString() date!: string;
  @IsString() @MaxLength(80) statusCode!: string;
  @IsString() @MaxLength(160) label!: string;
  @IsOptional() @IsEnum(PlanningDayStatusSourceType) sourceType?: PlanningDayStatusSourceType;
  @IsOptional() @IsString() @MaxLength(160) sourceId?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() affectsPlanning?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() affectsCounters?: boolean;
  @IsOptional() @IsEnum(PlanningVisibilityLevel) visibilityLevel?: PlanningVisibilityLevel;
  @IsOptional() metadata?: unknown;
}

export class PlanningCounterQueryDto extends PlanningQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) periodYear?: number;
  @IsOptional() @IsString() accountType?: string;
  @IsOptional() @IsString() code?: string;
}

export class RecomputePlanningCountersDto {
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() dryRun?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeAssignments?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeDayStatuses?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeHrAbsences?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeAttendance?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class AdjustPlanningCounterDto {
  @IsUUID() employeeId!: string;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) periodYear!: number;
  @IsString() @MaxLength(80) code!: string;
  @IsOptional() @IsString() @MaxLength(80) accountType?: string;
  @IsString() @MaxLength(160) label!: string;
  @IsEnum(PlanningTimeUnit) unit!: PlanningTimeUnit;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsEnum(HrTimeAccountDirection) direction!: HrTimeAccountDirection;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @IsOptional() metadata?: unknown;
}

export class PlanningAttendanceQueryDto {
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) month?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
  @IsOptional() @IsEnum(PlanningAttendanceStatus) status?: PlanningAttendanceStatus;
}

export class UpsertPlanningAttendanceDto {
  @IsOptional() @IsUUID() assignmentId?: string;
  @IsUUID() employeeId!: string;
  @IsString() date!: string;
  @IsOptional() @IsString() plannedStartTime?: string;
  @IsOptional() @IsString() plannedEndTime?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) plannedMinutes?: number;
  @IsOptional() @IsString() declaredStartTime?: string;
  @IsOptional() @IsString() declaredEndTime?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) declaredMinutes?: number;
  @IsOptional() @IsEnum(PlanningAttendanceStatus) status?: PlanningAttendanceStatus;
  @IsOptional() @IsString() @MaxLength(80) source?: string;
  @IsOptional() metadata?: unknown;
}

export class ValidatePlanningAttendanceDto {
  @IsOptional() @IsString() validatedStartTime?: string;
  @IsOptional() @IsString() validatedEndTime?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) validatedMinutes?: number;
  @IsOptional() @IsEnum(PlanningAttendanceStatus) status?: PlanningAttendanceStatus;
  @IsOptional() metadata?: unknown;
}

export class UpsertPlanningCodeDictionaryDto {
  @IsString() @MaxLength(80) rawCode!: string;
  @IsOptional() @IsString() @MaxLength(80) normalizedCode?: string;
  @IsString() @MaxLength(160) label!: string;
  @IsString() @MaxLength(80) category!: string;
  @IsOptional() @IsString() @MaxLength(80) defaultStatusCode?: string;
  @IsOptional() @IsString() @MaxLength(80) accountType?: string;
  @IsOptional() @IsEnum(PlanningTimeUnit) unit?: PlanningTimeUnit;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) defaultQuantity?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() affectsWorkedTime?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() affectsPaidTime?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() affectsLeaveBalance?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() visibleInPlanning?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() visibleInCounters?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() requiresAdminValidation?: boolean;
  @IsOptional() metadata?: unknown;
}

export class UpsertPlanningPolicyProfileDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) sector?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) annualReferenceMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) defaultWeeklyMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) defaultDailyMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) defaultBreakMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxDailyMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxWeeklyMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minDailyRestMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minWeeklyRestMinutes?: number;
  @IsOptional() @IsEnum(PlanningTimeUnit) leaveUnit?: PlanningTimeUnit;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() attendanceEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isDefault?: boolean;
  @IsOptional() customRules?: unknown;
}

export class UpsertPlanningAssignmentDto {
  @IsUUID() employeeId!: string;
  @IsUUID() departmentId!: string;
  @IsUUID() positionId!: string;
  @IsOptional() @IsUUID() siteId?: string;
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

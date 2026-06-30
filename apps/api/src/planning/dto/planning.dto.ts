import { Type, Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { HrAbsenceStatus, HrAbsenceType, PlanningAssignmentOrigin, PlanningAssignmentStatus, PlanningAttendanceStatus, HrTimeAccountDirection, PlanningDayStatusSourceType, HrEntitlementAccrualFrequency, PlanningExportFormat, PlanningExportScope, PlanningNeedPriority, PlanningReplacementStatus, PlanningTimeUnit, PlanningVisibilityLevel } from '@prisma/client';

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

export class UpsertHrEntitlementRuleDto {
  @IsString() @MaxLength(80) code!: string;
  @IsString() @MaxLength(160) label!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() @MaxLength(80) accountType!: string;
  @IsEnum(PlanningTimeUnit) unit!: PlanningTimeUnit;
  @IsOptional() @IsEnum(HrEntitlementAccrualFrequency) accrualFrequency?: HrEntitlementAccrualFrequency;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) accrualQuantity?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() startsAfterTrialPeriod?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minimumSeniorityMonths?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() prorateByContractTime?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxBalance?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() carryOverEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() enabled?: boolean;
  @IsOptional() metadata?: unknown;
}

export class UpsertHrEmployeeEntitlementDto {
  @IsOptional() @IsString() @MaxLength(80) code?: string;
  @IsOptional() @IsString() @MaxLength(160) label?: string;
  @IsOptional() @IsString() @MaxLength(80) accountType?: string;
  @IsOptional() @IsEnum(PlanningTimeUnit) unit?: PlanningTimeUnit;
  @IsOptional() @IsUUID() entitlementRuleId?: string;
  @IsOptional() @IsUUID() policyProfileId?: string;
  @IsOptional() @Type(() => Number) @IsInt() openingBalance?: number;
  @IsOptional() @IsString() openingBalanceDate?: string;
  @IsOptional() @IsString() effectiveFrom?: string;
  @IsOptional() @IsString() effectiveTo?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() enabled?: boolean;
  @IsOptional() metadata?: unknown;
}

export class AdjustHrEmployeeEntitlementDto {
  @IsString() @MaxLength(80) code!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsEnum(HrTimeAccountDirection) direction!: HrTimeAccountDirection;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class AdjustHrEmployeeEntitlementByIdDto {
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsEnum(HrTimeAccountDirection) direction!: HrTimeAccountDirection;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export const PLANNING_HR_COUNTRY_CODES = ['FR', 'FI'] as const;
export const PLANNING_ENTITLEMENT_TARGET_MODES = ['NONE', 'ALL_ACTIVE', 'DEPARTMENT', 'POSITION', 'MANUAL'] as const;
export const PLANNING_EMPLOYMENT_FRAMEWORKS = ['PRIVATE', 'PUBLIC', 'MIXED', 'LOCAL', 'CUSTOM'] as const;

export class PlanningEntitlementCatalogQueryDto {
  @IsOptional() @IsIn(PLANNING_HR_COUNTRY_CODES) countryCode?: 'FR' | 'FI';
  @IsOptional() @IsIn(PLANNING_EMPLOYMENT_FRAMEWORKS) employmentFramework?: 'PRIVATE' | 'PUBLIC' | 'MIXED' | 'LOCAL' | 'CUSTOM';
  @IsOptional() @IsString() @MaxLength(80) organizationType?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() advanced?: boolean;
}

export class PreparePlanningEntitlementCatalogDto {
  @IsIn(PLANNING_HR_COUNTRY_CODES) countryCode!: 'FR' | 'FI';
  @IsOptional() @IsIn(PLANNING_EMPLOYMENT_FRAMEWORKS) employmentFramework?: 'PRIVATE' | 'PUBLIC' | 'MIXED' | 'LOCAL' | 'CUSTOM';
  @IsOptional() @IsString() @MaxLength(80) organizationType?: string;
}

export class ActivatePlanningEntitlementCatalogDto {
  @IsOptional() @IsIn(PLANNING_ENTITLEMENT_TARGET_MODES) targetMode?: 'NONE' | 'ALL_ACTIVE' | 'DEPARTMENT' | 'POSITION' | 'MANUAL';
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) employeeIds?: string[];
  @IsOptional() @Type(() => Number) @IsInt() openingBalance?: number;
  @IsOptional() @IsString() openingBalanceDate?: string;
  @IsOptional() @IsString() effectiveFrom?: string;
}

export class ActivatePlanningEntitlementCatalogSelectionDto extends ActivatePlanningEntitlementCatalogDto {
  @IsArray() @IsUUID(undefined, { each: true }) catalogItemIds!: string[];
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
  @IsOptional() @IsString() @MaxLength(80) overtimeMode?: string;
  @IsOptional() @IsString() @MaxLength(80) rttMode?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() annualizationEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() countersEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() attendanceEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isDefault?: boolean;
  @IsOptional() customRules?: unknown;
}

export class UpsertWorkTimeRegulationDto {
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() nightWorkEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(5) nightWorkStartTime?: string;
  @IsOptional() @IsString() @MaxLength(5) nightWorkEndTime?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() publicHolidayWorkEnabled?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) publicHolidayDates?: string[];
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() weekendWorkEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() saturdayWorkAllowed?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() sundayWorkAllowed?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() compensationsEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() teleworkEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(5) teleworkStartTime?: string;
  @IsOptional() @IsString() @MaxLength(5) teleworkEndTime?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) teleworkMinBreakMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) teleworkDailyQuotaMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) teleworkMaxDaysPerWeek?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) teleworkMaxDaysPerYearFullTime?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) teleworkMaxDaysPerYearPartTime?: number;
  @IsOptional() @IsString() @MaxLength(120) internalRulesSourceDocumentId?: string;
  @IsOptional() @IsString() @MaxLength(240) sourceDocumentName?: string;
  @IsOptional() sourceDocumentMetadata?: unknown;
  @IsOptional() extractedRules?: unknown;
  @IsOptional() rulesToConfirm?: unknown;
  @IsOptional() positionMapping?: unknown;
  @IsOptional() @IsString() @MaxLength(80) validationStatus?: string;
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

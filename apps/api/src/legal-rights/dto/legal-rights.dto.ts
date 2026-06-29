import { Type, Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class LegalRightsSearchQueryDto {
  @IsOptional() @IsString() @MaxLength(160) query?: string;
  @IsOptional() @IsString() @MaxLength(2) country?: string;
  @IsOptional() @IsIn(['private', 'public', 'common', 'all']) regime?: 'private' | 'public' | 'common' | 'all';
  @IsOptional() @IsString() @MaxLength(40) idcc?: string;
  @IsOptional() @IsString() @MaxLength(40) publicRegime?: string;
  @IsOptional() @IsString() @MaxLength(120) job?: string;
  @IsOptional() @IsString() @MaxLength(120) establishmentType?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsString() @MaxLength(120) tag?: string;
  @IsOptional() @IsIn(['active', 'requires_review', 'all']) status?: 'active' | 'requires_review' | 'all';
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeRequiresReview?: boolean;
  @IsOptional() @IsString() effectiveDate?: string;
}

export class ActivateLegalRightDto {
  @IsOptional() @IsUUID() ruleVersionId?: string;
  @IsOptional() localSettingsJson?: unknown;
  @IsOptional() @IsString() @MaxLength(500) overrideReason?: string;
}

export class LegalProfileDto {
  @IsOptional() @IsIn(['private', 'public', 'common']) regimeType?: 'private' | 'public' | 'common';
  @IsOptional() @IsString() @MaxLength(40) idcc?: string;
  @IsOptional() @IsString() @MaxLength(40) publicRegime?: string;
  @IsOptional() @IsUUID() agreementId?: string;
  @IsOptional() @IsUUID() publicRegimeId?: string;
  @IsOptional() @IsUUID() establishmentId?: string;
  @IsOptional() @IsString() @MaxLength(80) contractType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(80) weeklyHours?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(3000) annualHours?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(2) fullTimeEquivalent?: number;
  @IsOptional() @IsString() seniorityStartDate?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isSeasonal?: boolean;
  @IsOptional() localAgreementJson?: unknown;
  @IsOptional() @IsString() effectiveFrom?: string;
  @IsOptional() @IsString() effectiveTo?: string;
}

export class PlanningComplianceShiftDto {
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsString() date!: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(720) breakMinutes?: number;
  @IsOptional() @IsString() @MaxLength(80) status?: string;
}

export class CalculateLegalRightsDto {
  @IsOptional() @IsUUID() employee_id?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsString() period_start?: string;
  @IsOptional() @IsString() periodStart?: string;
  @IsOptional() @IsString() period_end?: string;
  @IsOptional() @IsString() periodEnd?: string;
  @IsOptional() @IsString() effectiveDate?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlanningComplianceShiftDto) shifts?: PlanningComplianceShiftDto[];
  @IsOptional() planningData?: unknown;
  @IsOptional() absenceData?: unknown;
  @IsOptional() context?: unknown;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() persist?: boolean;
}

export class ApplicableEmployeeRightsQueryDto {
  @IsOptional() @IsString() period_start?: string;
  @IsOptional() @IsString() periodStart?: string;
  @IsOptional() @IsString() period_end?: string;
  @IsOptional() @IsString() periodEnd?: string;
  @IsOptional() @IsString() effectiveDate?: string;
}

export class PlanningComplianceCheckDto {
  @IsOptional() @IsUUID() employee_id?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsString() period_start?: string;
  @IsOptional() @IsString() periodStart?: string;
  @IsOptional() @IsString() period_end?: string;
  @IsOptional() @IsString() periodEnd?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PlanningComplianceShiftDto) shifts!: PlanningComplianceShiftDto[];
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { HrEmployeeStatus } from '@prisma/client';

export class HrListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeArchived?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) pageSize?: number;
  @IsOptional() @IsEnum(HrEmployeeStatus) status?: HrEmployeeStatus;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() rotationId?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() linkedToUser?: boolean;
}

export class UpsertHrReferenceDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(6000) description?: string;
  @IsOptional() @IsUUID() departmentId?: string;
}

export class CreateHrReferencesDto {
  @IsArray() @IsString({ each: true }) names!: string[];
  @IsOptional() @ValidateNested({ each: true }) @Type(() => UpsertHrReferenceDto) @IsArray() references?: UpsertHrReferenceDto[];
}

export class CompleteHrServicesDto {
  @IsOptional() @IsArray() @IsString({ each: true }) names?: string[];
}

export class UpsertHrEmployeeDto {
  @IsString() @MaxLength(120) firstName!: string;
  @IsString() @MaxLength(120) lastName!: string;
  @IsOptional() @IsString() photoDataUrl?: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;
  @IsOptional() @IsString() @MaxLength(60) phone?: string;
  @IsOptional() @IsString() @MaxLength(1000) address?: string;
  @IsOptional() @IsString() @MaxLength(40) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsString() @MaxLength(80) primaryLanguage?: string;
  @IsOptional() @IsString() @MaxLength(80) secondaryLanguage?: string;
  @IsOptional() @IsString() @MaxLength(1000) emergencyContact?: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsString() hireDate!: string;
  @IsUUID() departmentId!: string;
  @IsUUID() positionId!: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) secondaryPositionIds?: string[];
  @IsOptional() @IsUUID() mainSiteId?: string;
  @IsOptional() @IsString() @MaxLength(80) employeeNumber?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsEnum(HrEmployeeStatus) status?: HrEmployeeStatus;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @IsString() contractType?: string;
  @IsOptional() @IsString() contractEndDate?: string;
  @IsOptional() @IsString() trialEndDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) contractWeeklyMinutes?: number;
  @IsOptional() @Type(() => Number) hourlyRate?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() rateEffectiveDate?: string;
  @IsOptional() @IsString() nextReviewDate?: string;
  @IsOptional() @IsString() reviewFrequency?: string;
}

export class HrRotationDayDto {
  @IsString() @IsIn(['WORK', 'REST']) type!: 'WORK' | 'REST';
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(720) breakMinutes?: number;
}

export class HrRotationWeekDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(4) weekNumber!: number;
  @ValidateNested({ each: true }) @Type(() => HrRotationDayDto) @IsArray() days!: HrRotationDayDto[];
}

export class UpsertHrRotationDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(4) cycleLengthWeeks!: number;
  @ValidateNested({ each: true }) @Type(() => HrRotationWeekDto) @IsArray() weeks!: HrRotationWeekDto[];
}

export class AssignHrRotationDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsString() startDate?: string;
}

export class ChangeEmployeeRotationDto {
  @IsOptional() @IsUUID() rotationId?: string;
  @IsOptional() @IsString() startDate?: string;
}

export class RemoveHrRotationDto {
  @IsOptional() @IsString() endDate?: string;
}

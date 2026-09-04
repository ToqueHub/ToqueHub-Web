import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { HrEmployeeStatus, OperationalTaskCategory } from '@prisma/client';
import { CoreRoleName } from '../../users/dto/user-management.dto';

export class CreateHrToqueHubAccountDto {
  @IsEnum(CoreRoleName) role!: CoreRoleName;
  @IsString() @MinLength(8) temporaryPassword!: string;
}

export class HrPositionTaskPresetDto {
  @IsOptional() @IsString() @MaxLength(80) id?: string;
  @IsString() @MaxLength(180) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsEnum(OperationalTaskCategory) category!: OperationalTaskCategory;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) defaultDurationMinutes?: number;
  @IsOptional() @IsBoolean() requiresTechnicalSheet?: boolean;
}

export class HrListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeArchived?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) pageSize?: number;
  @IsOptional() @IsEnum(HrEmployeeStatus) status?: HrEmployeeStatus;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() linkedToUser?: boolean;
}

export class UpsertHrReferenceDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(6000) description?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => HrPositionTaskPresetDto) @IsArray() taskPresets?: HrPositionTaskPresetDto[];
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
  @IsOptional() @IsString() @MaxLength(120) emergencyContactFirstName?: string;
  @IsOptional() @IsString() @MaxLength(120) emergencyContactLastName?: string;
  @IsOptional() @IsString() @MaxLength(60) emergencyContactPhone?: string;
  @IsOptional() @IsEmail() @MaxLength(180) emergencyContactEmail?: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsString() @MaxLength(80) personalIdentityNumber?: string;
  @IsString() hireDate!: string;
  @IsUUID() departmentId!: string;
  @IsUUID() positionId!: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) secondaryPositionIds?: string[];
  @IsOptional() @IsUUID() mainSiteId?: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) secondarySiteIds?: string[];
  @IsOptional() @IsString() @MaxLength(80) employeeNumber?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsEnum(HrEmployeeStatus) status?: HrEmployeeStatus;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @ValidateNested() @Type(() => CreateHrToqueHubAccountDto) toqueHubAccount?: CreateHrToqueHubAccountDto;
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @IsString() contractType?: string;
  @IsOptional() @IsString() contractEndDate?: string;
  @IsOptional() @IsString() trialEndDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) contractWeeklyMinutes?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) trainingNames?: string[];
  @IsOptional() @Type(() => Number) hourlyRate?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() rateEffectiveDate?: string;
  @IsOptional() @IsString() nextReviewDate?: string;
  @IsOptional() @IsString() reviewFrequency?: string;
  @IsOptional() @IsBoolean() revaluationEnabled?: boolean;
}

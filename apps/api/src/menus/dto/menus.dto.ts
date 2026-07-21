import { Type, Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { MenuCatalogType, MenuExportAudience, MenuExportFormat, MenuGuestGroupType, MenuHistoryAction, MenuKind, MenuProductionGenerationMode, MenuSectionType, MenuServiceType, MenuStatus, MenuUsageProfile, MenuVariantMode } from '@prisma/client';

export class MenuQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsEnum(MenuServiceType) service?: MenuServiceType;
  @IsOptional() @IsEnum(MenuStatus) status?: MenuStatus;
  @IsOptional() @IsEnum(MenuKind) kind?: MenuKind;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class MenuItemDto {
  @IsEnum(MenuSectionType) section!: MenuSectionType;
  @IsOptional() @IsUUID() menuCategoryId?: string;
  @IsOptional() @IsUUID() technicalSheetId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @Type(() => Number) @Min(0.001) portionsOverride?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.001) servingQuantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) targetReadyQuantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lowStockThreshold?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() availabilityEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpsertMenuDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() date?: string;
  @IsEnum(MenuServiceType) service!: MenuServiceType;
  @IsOptional() @IsEnum(MenuKind) kind?: MenuKind;
  @IsOptional() @IsEnum(MenuCatalogType) catalogType?: MenuCatalogType;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() activeFrom?: string;
  @IsOptional() @IsString() activeUntil?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isPrimary?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedGuests?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MenuItemDto) items?: MenuItemDto[];
}

export class UpdateMenuSettingsDto {
  @IsEnum(MenuUsageProfile) usageProfile!: MenuUsageProfile;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() catalogEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() scheduledMenusEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() eventsEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() cyclesEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() dietsEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() guestForecastsEnabled?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() targetStockEnabled?: boolean;
}

export class UpsertMenuCategoryDto {
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @IsEnum(MenuCatalogType) catalogType?: MenuCatalogType;
}

export class MenuAvailabilityQueryDto {
  @IsOptional() @IsUUID() siteId?: string;
}

export class PlanMenuShortagesDto {
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) itemIds?: string[];
  @IsOptional() @IsString() neededAt?: string;
}

export class UpdateMenuStatusDto {
  @IsEnum(MenuStatus) status!: MenuStatus;
}

export class VariantReplacementDto {
  @IsOptional() @IsUUID() menuItemId?: string;
  @IsOptional() @IsEnum(MenuSectionType) section?: MenuSectionType;
  @IsUUID() replacementTechnicalSheetId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpsertMenuVariantDto {
  @IsUUID() dietId!: string;
  @IsEnum(MenuVariantMode) mode!: MenuVariantMode;
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedGuests?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => VariantReplacementDto) replacements?: VariantReplacementDto[];
}

export class UpsertDietDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isArchived?: boolean;
}

export class UpsertGuestGroupDto {
  @IsString() @MaxLength(120) name!: string;
  @IsEnum(MenuGuestGroupType) type!: MenuGuestGroupType;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isArchived?: boolean;
}

export class GuestForecastDto {
  @IsUUID() guestGroupId!: string;
  @IsOptional() @IsUUID() dietId?: string;
  @Type(() => Number) @IsInt() @Min(0) count!: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateGuestForecastsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => GuestForecastDto) forecasts!: GuestForecastDto[];
}

export class CycleItemDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(8) weekNumber!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(7) dayOfWeek!: number;
  @IsEnum(MenuServiceType) service!: MenuServiceType;
  @IsEnum(MenuSectionType) section!: MenuSectionType;
  @IsUUID() technicalSheetId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpsertCycleDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(52) durationWeeks!: number;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CycleItemDto) items?: CycleItemDto[];
}

export class ReplicateCycleDto {
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedGuests?: number;
}

export class GenerateProductionsDto {
  @IsEnum(MenuProductionGenerationMode) mode!: MenuProductionGenerationMode;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() force?: boolean;
  @IsOptional() @IsString() @MaxLength(8) plannedTime?: string;
}

export class PrepareMenuExportDto {
  @IsEnum(MenuExportFormat) format!: MenuExportFormat;
  @IsEnum(MenuExportAudience) audience!: MenuExportAudience;
  @IsOptional() @IsUUID() menuId?: string;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() filters?: unknown;
}

export class HistoryQueryDto extends MenuQueryDto {
  @IsOptional() @IsUUID() menuId?: string;
  @IsOptional() @IsUUID() cycleId?: string;
  @IsOptional() @IsEnum(MenuHistoryAction) action?: MenuHistoryAction;
}

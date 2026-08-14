import { Type, Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CatererEventStatus,
  CatererFulfillmentMode,
  MenuActivity,
  MenuCatalogType,
  MenuDispatchStatus,
  MenuExportAudience,
  MenuExportFormat,
  MenuGuestGroupType,
  MenuHistoryAction,
  MenuKind,
  MenuProductionGenerationMode,
  MenuSectionType,
  MenuServiceType,
  MenuStatus,
  MenuUsageProfile,
  MenuVariantMode,
} from '@prisma/client';

export class MenuQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsEnum(MenuServiceType) service?: MenuServiceType;
  @IsOptional() @IsEnum(MenuStatus) status?: MenuStatus;
  @IsOptional() @IsEnum(MenuKind) kind?: MenuKind;
  @IsOptional() @IsEnum(MenuActivity) activity?: MenuActivity;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class MenuItemDto {
  @IsOptional() @IsUUID() id?: string;
  @IsEnum(MenuSectionType) section!: MenuSectionType;
  @IsOptional() @IsUUID() menuCategoryId?: string;
  @IsOptional() @IsUUID() technicalSheetId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() dietId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @Type(() => Number) @Min(0.001) portionsOverride?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.001) servingQuantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) targetReadyQuantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lowStockThreshold?: number;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  availabilityEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpsertMenuDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() date?: string;
  @IsEnum(MenuServiceType) service!: MenuServiceType;
  @IsOptional() @IsEnum(MenuKind) kind?: MenuKind;
  @IsOptional() @IsEnum(MenuActivity) activity?: MenuActivity;
  @IsOptional() @IsEnum(MenuCatalogType) catalogType?: MenuCatalogType;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() activeFrom?: string;
  @IsOptional() @IsString() activeUntil?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isPrimary?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedGuests?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  items?: MenuItemDto[];
}

export class UpdateMenuSettingsDto {
  @IsEnum(MenuUsageProfile) usageProfile!: MenuUsageProfile;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  catalogEnabled?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  scheduledMenusEnabled?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  eventsEnabled?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  cyclesEnabled?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  dietsEnabled?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  guestForecastsEnabled?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  targetStockEnabled?: boolean;
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
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantReplacementDto)
  replacements?: VariantReplacementDto[];
}

export class UpsertDietDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isArchived?: boolean;
}

export class UpsertGuestGroupDto {
  @IsString() @MaxLength(120) name!: string;
  @IsEnum(MenuGuestGroupType) type!: MenuGuestGroupType;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isArchived?: boolean;
}

export class GuestForecastDto {
  @IsUUID() guestGroupId!: string;
  @IsOptional() @IsUUID() dietId?: string;
  @IsOptional() @IsUUID() destinationSiteId?: string;
  @IsOptional() @IsUUID() dispatchId?: string;
  @Type(() => Number) @IsInt() @Min(0) count!: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateGuestForecastsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuestForecastDto)
  forecasts!: GuestForecastDto[];
}

export class CycleItemDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(8) weekNumber!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(7) dayOfWeek!: number;
  @IsEnum(MenuServiceType) service!: MenuServiceType;
  @IsEnum(MenuSectionType) section!: MenuSectionType;
  @IsUUID() technicalSheetId!: string;
  @IsOptional() @IsUUID() dietId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CycleForecastDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(52) weekNumber!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(7) dayOfWeek!: number;
  @IsEnum(MenuServiceType) service!: MenuServiceType;
  @IsUUID() destinationSiteId!: string;
  @IsUUID() guestGroupId!: string;
  @IsOptional() @IsUUID() dietId?: string;
  @Type(() => Number) @IsInt() @Min(0) count!: number;
  @IsOptional() @IsString() @MaxLength(8) departureTime?: string;
  @IsOptional() @IsString() @MaxLength(8) deliveryTime?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpsertCycleDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(52) durationWeeks!: number;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CycleItemDto)
  items?: CycleItemDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CycleForecastDto)
  forecasts?: CycleForecastDto[];
}

export class ReplicateCycleDto {
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedGuests?: number;
}

export class CatererClientQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}

export class UpsertCatererClientDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(160) name2?: string;
  @IsOptional() @IsString() @MaxLength(160) contactName?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(60) phone?: string;
  @IsOptional() @IsString() @MaxLength(60) fax?: string;
  @IsOptional() @IsString() @MaxLength(300) website?: string;
  @IsOptional() @IsString() @MaxLength(4000) address?: string;
  @IsOptional() @IsString() @MaxLength(30) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(8) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(80) businessId?: string;
  @IsOptional() @IsString() @MaxLength(80) vatNumber?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) accountTypeId?: number;
  @IsOptional() @IsString() @MaxLength(30) accountCode?: string;
  @IsOptional() @IsString() @MaxLength(80) customerNumber?: string;
  @IsOptional() @IsString() @MaxLength(300) eInvoiceAddress?: string;
  @IsOptional() @IsString() @MaxLength(120) eInvoiceOperatorId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) eInvoiceUnitNumber?: number;
  @IsOptional() @IsString() @MaxLength(60) invoiceDeliveryMethod?: string;
  @IsOptional() @IsString() @MaxLength(8) localeCode?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) paymentTermId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) salesPriceListId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) salesTaxClassId?: number;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  invoiceIncludesVat?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) factoringPartnerId?: number;
  @IsOptional() @IsString() @MaxLength(160) ourReference?: string;
  @IsOptional() @IsString() @MaxLength(160) yourReference?: string;
  @IsOptional() @IsString() @MaxLength(160) shippingName?: string;
  @IsOptional() @IsString() @MaxLength(160) shippingName2?: string;
  @IsOptional() @IsString() @MaxLength(4000) shippingAddress?: string;
  @IsOptional() @IsString() @MaxLength(30) shippingPostalCode?: string;
  @IsOptional() @IsString() @MaxLength(120) shippingCity?: string;
  @IsOptional() @IsString() @MaxLength(8) shippingCountryCode?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  autoReminderOverride?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  autoReminderEnabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) autoReminderInterval?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) autoReminderLastStep?: number;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  salesIsRefused?: boolean;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isArchived?: boolean;
}

export class CatererPrestationDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @MaxLength(160) name!: string;
  @IsEnum(MenuServiceType) service!: MenuServiceType;
  @IsOptional() @IsString() readyAt?: string;
  @IsOptional() @IsString() handoffAt?: string;
  @IsOptional() @IsString() serviceAt?: string;
  @Type(() => Number) @IsInt() @Min(0) expectedGuests!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  items?: MenuItemDto[];
}

export class UpsertCatererEventDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() productionSiteId?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(200) venueName?: string;
  @IsOptional() @IsString() @MaxLength(4000) address?: string;
  @IsOptional() @IsString() @MaxLength(4000) accessNotes?: string;
  @IsEnum(CatererFulfillmentMode) fulfillmentMode!: CatererFulfillmentMode;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatererPrestationDto)
  prestations?: CatererPrestationDto[];
}

export class CatererEventQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(CatererEventStatus) status?: CatererEventStatus;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsUUID() clientId?: string;
}

export class UpdateCatererEventStatusDto {
  @IsEnum(CatererEventStatus) status!: CatererEventStatus;
}

export class GenerateCatererEventProductionsDto {
  @IsOptional() @IsEnum(MenuProductionGenerationMode) mode?: MenuProductionGenerationMode;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  force?: boolean;
  @IsOptional() @IsUUID() serviceId?: string;
}

export class CatererProductionPlanLineDto {
  @IsUUID() menuItemId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) portions!: number;
  @IsDateString() productionDate!: string;
  @IsString() @MaxLength(8) plannedTime!: string;
}

export class CatererLogisticsPlanLineDto {
  @IsString() @MaxLength(180) key!: string;
  @Transform(({ value }) => value === true || value === 'true') @IsBoolean() enabled!: boolean;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
}

export class SaveCatererProductionPlanDto {
  @IsUUID() serviceId!: string;
  @IsOptional() @IsUUID() logisticsDepartmentId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatererProductionPlanLineDto)
  lines!: CatererProductionPlanLineDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatererLogisticsPlanLineDto)
  logistics?: CatererLogisticsPlanLineDto[];
}

export class GenerateMenuProductionLineDto {
  @IsUUID() menuItemId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) portions!: number;
  @IsOptional() @IsDateString() productionDate?: string;
  @IsOptional() @IsString() @MaxLength(8) plannedTime?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  targetPortions?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  openingCarryOverPortions?: number;
}

export class PlanCatalogProductionDayLineDto {
  @IsUUID() menuItemId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) targetPortions!: number;
  @IsOptional() @IsString() @MaxLength(8) plannedTime?: string;
}

export class PlanCatalogProductionDayDto {
  @IsUUID() siteId!: string;
  @IsString() date!: string;
  @IsUUID() serviceId!: string;
  @IsOptional() @IsString() @MaxLength(8) plannedTime?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanCatalogProductionDayLineDto)
  lines!: PlanCatalogProductionDayLineDto[];
}

export class UpdateMenuDispatchStatusDto {
  @IsEnum(MenuDispatchStatus) status!: MenuDispatchStatus;
}

export class GenerateProductionsDto {
  @IsEnum(MenuProductionGenerationMode) mode!: MenuProductionGenerationMode;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  force?: boolean;
  @IsOptional() @IsString() @MaxLength(8) plannedTime?: string;
  @IsOptional() @IsDateString() neededAt?: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GenerateMenuProductionLineDto)
  lines?: GenerateMenuProductionLineDto[];
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

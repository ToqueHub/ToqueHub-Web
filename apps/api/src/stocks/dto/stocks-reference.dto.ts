import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
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
  EquipmentAcquisitionMode,
  EquipmentCondition,
  ProductKind,
  PurchasingDeliveryMode,
  UnitType,
} from '@prisma/client';

export class ListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional({ enum: ProductKind })
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;
}

export class ListArticlesQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Site dont le stock et le catalogue doivent être affichés.' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: ['NORMAL', 'LOW', 'OUT', 'NEGATIVE', 'NO_STOCK'] })
  @IsOptional()
  @IsIn(['NORMAL', 'LOW', 'OUT', 'NEGATIVE', 'NO_STOCK'])
  status?: 'NORMAL' | 'LOW' | 'OUT' | 'NEGATIVE' | 'NO_STOCK';
}

export class UpsertCategoryDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Taux de TVA de la catégorie, en pourcentage.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @ApiPropertyOptional({ enum: ProductKind, default: ProductKind.UNSPECIFIED })
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  responsibleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  responsiblePhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  responsibleEmail?: string;
}

export class UpsertUnitDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(24)
  symbol!: string;

  @IsOptional()
  @IsEnum(UnitType)
  type?: UnitType;
}

export class SupplierPurchasingSettingsDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  orderEmail?: string;

  @IsEnum(PurchasingDeliveryMode)
  deliveryMode!: PurchasingDeliveryMode;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  deliveryWeekdays!: number[];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumOrder!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveryFee!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  leadTimeDays?: number;

  @IsOptional() @IsString() @MaxLength(300) emailSubjectTemplate?: string;
  @IsOptional() @IsString() @MaxLength(8000) emailBodyTemplate?: string;
  @IsOptional() @IsString() @MaxLength(2000) emailSignature?: string;
}

export class UpsertSupplierDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SupplierPurchasingSettingsDto)
  purchasing?: SupplierPurchasingSettingsDto;
}

export class UpsertEquipmentProfileDto {
  @IsOptional() @IsString() @MaxLength(120) brand?: string | null;
  @IsOptional() @IsString() @MaxLength(120) model?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) purchaseUrl?: string | null;
  @IsOptional() @IsDateString() purchasedAt?: string | null;
  @IsOptional() @IsDateString() warrantyEndsAt?: string | null;
  @IsOptional() @IsEnum(EquipmentCondition) condition?: EquipmentCondition;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  targetQuantity?: number | null;

  @IsOptional()
  @IsEnum(EquipmentAcquisitionMode)
  acquisitionMode?: EquipmentAcquisitionMode;

  @IsOptional() @IsString() @MaxLength(180) financingProvider?: string | null;
  @IsOptional() @IsDateString() financingStart?: string | null;
  @IsOptional() @IsDateString() financingEnd?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyPayment?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  financedAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  buyoutValue?: number | null;

  @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
}

export class UpsertProductDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsUUID()
  unitId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsUUID()
  primarySupplierId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  averagePrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  priceDisplayUnit?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  gtin?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  productUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  originCountry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  packageLabel?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  unitsPerPackage?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  unitWeightGrams?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  netWeightGrams?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  ingredients?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  allergensPresent?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  possibleTraces?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  dietaryTags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  energyKj?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  energyKcal?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  fatGrams?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  saturatedFatGrams?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  carbohydratesGrams?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  sugarsGrams?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  fiberGrams?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  proteinGrams?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  saltGrams?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  storageType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  shelfLifeAfterOpening?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  storageInstructions?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  preparationInstructions?: string | null;

  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertEquipmentProfileDto)
  equipment?: UpsertEquipmentProfileDto | null;
}

export class UpdateProductFavoriteDto {
  @IsBoolean()
  isFavorite!: boolean;
}

export class UpsertSiteDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  responsibleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  responsiblePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  responsibleEmail?: string;
}

export class UpsertLocationDto extends UpsertSiteDto {
  @IsUUID()
  siteId!: string;
}

export class UpsertUnitConversionDto {
  @IsUUID()
  fromUnitId!: string;

  @IsUUID()
  toUnitId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  factor!: number;
}

export class UpsertLotDto {
  @IsString()
  @MaxLength(120)
  lotNumber!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

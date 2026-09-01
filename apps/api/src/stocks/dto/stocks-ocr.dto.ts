import { EquipmentAcquisitionMode, ProductKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AnalyzeBatchDto {
  @IsArray()
  @IsUUID('4', { each: true })
  documentIds!: string[];

  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;
}

export class AnalyzeOcrContextDto {
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;
}

export class CorrectedReceptionLineDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsBoolean()
  ignored?: boolean;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsBoolean()
  createProduct?: boolean;

  @IsOptional()
  @IsEnum(ProductKind)
  productKind?: ProductKind;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lineType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  model?: string;

  @IsOptional()
  @IsEnum(EquipmentAcquisitionMode)
  acquisitionMode?: EquipmentAcquisitionMode;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  financingProvider?: string;

  @IsOptional()
  @IsDateString()
  financingStart?: string;

  @IsOptional()
  @IsDateString()
  financingEnd?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  monthlyPayment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  financedAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  buyoutValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  equipmentNotes?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryName?: string;

  @IsOptional()
  @IsUUID()
  suggestedCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  suggestedCategoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  ocrLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  nameOriginal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descriptionOriginal?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  documentedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  deliveredQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  acceptedQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  listUnitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  lineTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lotNumber?: string;

  @IsOptional()
  @IsDateString()
  bestBeforeDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lineStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  lineConfidence?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  packageDescription?: string;
}

export class OcrSupplierIdentifierDto {
  @IsString()
  @MaxLength(40)
  kind!: string;

  @IsString()
  @MaxLength(120)
  value!: string;
}

export class EquipmentFinancingContractDto {
  @IsEnum(EquipmentAcquisitionMode)
  acquisitionMode!: EquipmentAcquisitionMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  financingProvider?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  termMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  installmentAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  paymentFrequency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyPayment?: number;

  @IsOptional()
  @IsDateString()
  financingStart?: string;

  @IsOptional()
  @IsDateString()
  financingEnd?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  financedAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  buyoutValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  sourceConfidence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  documentIds?: string[];
}

export class SaveOcrCorrectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  supplierName?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OcrSupplierIdentifierDto)
  supplierIdentifiers?: OcrSupplierIdentifierDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deliveryNoteNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  purchaseOrderNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  receiptNumber?: string;

  @IsOptional()
  @IsDateString()
  documentDate?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  totalExcludingTax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  totalTax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  totalIncludingTax?: number;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  deliveryTemperature?: number;

  @IsOptional()
  @IsBoolean()
  controlConforming?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  controlNotes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  documentConfidence?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestedActions?: string[];

  @IsOptional()
  @IsObject()
  aiAnalysis?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => EquipmentFinancingContractDto)
  financingContract?: EquipmentFinancingContractDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorrectedReceptionLineDto)
  lines!: CorrectedReceptionLineDto[];
}

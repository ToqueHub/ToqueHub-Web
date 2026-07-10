import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class AnalyzeBatchDto {
  @IsArray()
  @IsUUID('4', { each: true })
  documentIds!: string[];
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
  quantity?: number;

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

export class SaveOcrCorrectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  supplierName?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorrectedReceptionLineDto)
  lines!: CorrectedReceptionLineDto[];
}

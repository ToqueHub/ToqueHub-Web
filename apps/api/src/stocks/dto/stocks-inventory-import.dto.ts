import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AnalyzeInventoryImportDto {
  @IsUUID()
  siteId!: string;
}

export class InventoryImportRowDto {
  @IsString()
  @MaxLength(220)
  sourceId!: string;

  @IsString()
  @MaxLength(300)
  sourceName!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  countedQuantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  unitLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  unitPriceExVat?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  categoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  supplierName?: string;

  @IsIn(['MATCH', 'CREATE', 'IGNORE'])
  action!: 'MATCH' | 'CREATE' | 'IGNORE';

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsBoolean()
  selected?: boolean;
}

export class CommitInventoryImportDto {
  @IsUUID()
  siteId!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsDateString()
  inventoryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsBoolean()
  updatePrices?: boolean;

  @IsOptional()
  @IsBoolean()
  createMissingCategories?: boolean;

  @IsOptional()
  @IsBoolean()
  createMissingSuppliers?: boolean;

  @IsOptional()
  @IsBoolean()
  learnAliases?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => InventoryImportRowDto)
  rows!: InventoryImportRowDto[];
}

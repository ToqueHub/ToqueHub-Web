import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductImportOptionsDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  siteIds?: string[];

  @IsOptional()
  @IsBoolean()
  createMissingCategories?: boolean;

  @IsOptional()
  @IsBoolean()
  createMissingSuppliers?: boolean;

  @IsOptional()
  @IsUUID()
  defaultSupplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  defaultSupplierName?: string;
}

export class ProductImportRowDto {
  @IsInt()
  @Min(2)
  @Max(1002)
  rowNumber!: number;

  @IsObject()
  fields!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  selected?: boolean;
}

export class CommitProductImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImportRowDto)
  rows!: ProductImportRowDto[];

  @IsOptional()
  @IsObject()
  mapping?: Record<string, string>;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductImportOptionsDto)
  options?: ProductImportOptionsDto;
}

export class ProductCreatorRowsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImportRowDto)
  rows!: ProductImportRowDto[];
}

export class BulkAssignProductSitesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  siteIds!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsBoolean()
  onlyUnassigned?: boolean;
}

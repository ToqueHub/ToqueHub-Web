import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, Max, Min, ValidateNested } from 'class-validator';

export class ProductImportOptionsDto {
  @IsOptional()
  @IsBoolean()
  createMissingCategories?: boolean;

  @IsOptional()
  @IsBoolean()
  createMissingSuppliers?: boolean;
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

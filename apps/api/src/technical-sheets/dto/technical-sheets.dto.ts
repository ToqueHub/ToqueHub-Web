import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { TechnicalSheetStatus } from '@prisma/client';

export class TechnicalSheetListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() includeArchived?: boolean;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(TechnicalSheetStatus) status?: TechnicalSheetStatus;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) pageSize?: number;
}

export class UpsertRecipeCategoryDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(32) color?: string;
}

export class UpsertAllergenDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class UpsertIngredientDto {
  @IsUUID() productId!: string;
  @IsUUID() unitId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) order?: number;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) allergenIds?: string[];
}

export class UpsertStepDto {
  @Type(() => Number) @IsNumber() @Min(0) order!: number;
  @IsString() @MaxLength(180) title!: string;
  @IsString() @MaxLength(5000) description!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedMinutes?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedTimeMinutes?: number;
}

export class UpsertTechnicalSheetDto {
  @IsString() @MaxLength(220) name!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(2000) photoUrl?: string;
  @IsOptional() @IsString() photoDataUrl?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) referencePortions!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) preparationTimeMinutes?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) prepTimeMinutes?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cookingTimeMinutes?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cookTimeMinutes?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalTimeMinutes?: number;
  @IsOptional() @IsEnum(TechnicalSheetStatus) status?: TechnicalSheetStatus;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => UpsertIngredientDto) ingredients?: UpsertIngredientDto[];
  @IsOptional() @ValidateNested({ each: true }) @Type(() => UpsertStepDto) steps?: UpsertStepDto[];
}

export class DuplicateTechnicalSheetDto {
  @IsOptional() @IsString() @MaxLength(220) name?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() copyGeneral?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() copyPhoto?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() copyIngredients?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() copySteps?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() copyAllergens?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() copyCategory?: boolean;
}

export class ProductionSimulationDto {
  @IsOptional() @IsUUID() technicalSheetId?: string;
  @IsOptional() @IsUUID() recipeId?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) requestedPortions!: number;
}

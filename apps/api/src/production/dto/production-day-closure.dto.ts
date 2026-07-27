import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductionDayClosureQueryDto {
  @IsUUID() siteId!: string;
  @IsDateString() date!: string;
}

export class ProductionDayClosureItemDto {
  @IsUUID() orderId!: string;
  @Type(() => Number) @IsNumber() @Min(0) remainingPortions!: number;
  @Type(() => Number) @IsNumber() @Min(0) discardedPortions!: number;
  @Type(() => Number) @IsNumber() @Min(0) carryOverNextPortions!: number;
  @IsOptional() @IsString() @MaxLength(1000) lossReason?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CloseProductionDayDto extends ProductionDayClosureQueryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionDayClosureItemDto)
  items!: ProductionDayClosureItemDto[];

  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

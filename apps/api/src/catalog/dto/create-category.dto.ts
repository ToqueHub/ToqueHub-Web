import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductKind } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Épicerie' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Produits secs et denrées non périssables' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: ProductKind, default: ProductKind.UNSPECIFIED })
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;
}

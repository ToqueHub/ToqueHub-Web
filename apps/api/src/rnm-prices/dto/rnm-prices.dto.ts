import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RnmProductsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() secteur?: string;
  @IsOptional() @IsString() sector?: string;
  @IsOptional() @IsString() categorie?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
  @IsOptional() @IsString() pageSize?: string;
  @IsOptional() @IsString() offset?: string;
}

export class RnmHistoryQueryDto {
  @IsOptional() @IsString() product?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() produit?: string;
  @IsOptional() @IsString() market?: string;
  @IsOptional() @IsString() marche?: string;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() stade?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() dateDebut?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() dateFin?: string;
  @IsOptional() @IsString() period?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
  @IsOptional() @IsString() pageSize?: string;
  @IsOptional() @IsString() offset?: string;
}

export class UpsertRnmFavoriteDto {
  @IsString()
  @MaxLength(160)
  rnmProductId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  productName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sector?: string;
}

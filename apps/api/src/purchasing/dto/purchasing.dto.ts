import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseReceiptLineStatus, PurchasingEmailProvider } from '@prisma/client';

export class PurchasingListQueryDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsISO8601() dateFrom?: string;
  @IsOptional() @IsISO8601() dateTo?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  receivable?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class PurchasingReferenceQueryDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class UpdatePurchasingSettingsDto {
  @IsOptional() @Length(3, 3) defaultCurrency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) replenishmentDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(7) @Max(365) consumptionWindowDays?: number;
  @IsOptional() @IsEmail() @MaxLength(255) fromEmail?: string;
  @IsOptional() @IsString() @MaxLength(160) fromName?: string;
  @IsOptional() @IsEmail() @MaxLength(255) replyTo?: string;
  @IsOptional() @IsString() @MaxLength(300) emailSubjectTemplate?: string;
  @IsOptional() @IsString() @MaxLength(8000) emailBodyTemplate?: string;
  @IsOptional() @IsString() @MaxLength(2000) emailSignature?: string;
}

export class UpdatePurchasingOnboardingDto {
  @IsString() @MaxLength(40) currentStep!: string;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(12) completedSteps!: string[];
  @IsOptional() @IsBoolean() skippedEmailSetup?: boolean;
  @IsOptional() @IsBoolean() completed?: boolean;
}

export class PurchaseOrderLineDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsString() @MaxLength(120) supplierReference?: string;
  @IsOptional() @IsString() @MaxLength(240) supplierLabel?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity!: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  unitsPerOrderUnit?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) unitPrice?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID() supplierId!: string;
  @IsUUID() siteId!: string;
  @IsOptional() @IsString() expectedDeliveryDate?: string;
  @IsOptional() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsString() @MaxLength(4000) supplierMessage?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  @ArrayMaxSize(500)
  lines!: PurchaseOrderLineDto[];
}

export class UpdatePurchaseOrderDto extends CreatePurchaseOrderDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class SendPurchaseOrderDto {
  @IsString() @MaxLength(120) idempotencyKey!: string;
  @IsOptional() @IsEmail() recipient?: string;
  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsOptional() @IsString() @MaxLength(12000) body?: string;
}

export class ConfigurePurchasingEmailConnectionDto {
  @IsEnum(PurchasingEmailProvider) provider!: PurchasingEmailProvider;
  @IsOptional() @IsEmail() @MaxLength(255) senderEmail?: string;
  @IsOptional() @IsString() @MaxLength(160) senderName?: string;
  @IsOptional() @IsString() @MaxLength(255) smtpHost?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) smtpPort?: number;
  @IsOptional() @IsBoolean() smtpSecure?: boolean;
  @IsOptional() @IsString() @MaxLength(255) smtpUsername?: string;
  @IsOptional() @IsString() @MaxLength(1000) smtpPassword?: string;
}

export class ConfigurePurchasingOAuthDto {
  @IsEnum(PurchasingEmailProvider) provider!: PurchasingEmailProvider;
  @IsString() @MaxLength(1024) clientId!: string;
  @IsOptional() @IsString() @MaxLength(2048) clientSecret?: string;
  @IsOptional() @IsString() @MaxLength(120) tenantId?: string;
}

export class PurchaseOrderReasonDto {
  @IsString() @MaxLength(2000) reason!: string;
}

export class PurchaseReceiptLineDto {
  @IsOptional() @IsUUID() purchaseOrderLineId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsString() @MaxLength(240) label!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) deliveredQuantity!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) acceptedQuantity!: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  unitsPerOrderUnit?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) unitPrice?: number;
  @IsOptional() @IsEnum(PurchaseReceiptLineStatus) status?: PurchaseReceiptLineStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreatePurchaseReceiptDto {
  @IsUUID() siteId!: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() deliveryNoteDocumentId?: string;
  @IsOptional() @IsUUID() extractionId?: string;
  @IsOptional() @IsString() @MaxLength(120) deliveryNoteNumber?: string;
  @IsOptional() @IsString() deliveryDate?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseReceiptLineDto)
  @ArrayMaxSize(500)
  lines!: PurchaseReceiptLineDto[];
}

export class UpdatePurchaseReceiptDto extends CreatePurchaseReceiptDto {}

export class CreateReceiptFromExtractionDto {
  @IsUUID() extractionId!: string;
  @IsUUID() siteId!: string;
  @IsOptional() @IsUUID() locationId?: string;
}

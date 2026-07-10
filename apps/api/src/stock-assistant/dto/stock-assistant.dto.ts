import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateConversationDto { @IsOptional() @IsUUID() locationId?: string; @IsOptional() @IsUUID() conversationId?: string; }
export class SendAssistantMessageDto { @IsString() @MaxLength(4000) content!: string; @IsOptional() @IsUUID() locationId?: string; }
export class ProposalLineDto {
  @IsOptional() @IsUUID() id?: string; @IsOptional() @IsUUID() productId?: string | null; @IsString() @MaxLength(500) rawLabel!: string;
  @Type(() => Number) @IsNumber() @Min(0.001) quantity!: number; @IsOptional() @IsString() purchaseUnit?: string | null; @IsOptional() @IsUUID() inputUnitId?: string | null;
  @IsOptional() @IsString() supplierSku?: string | null; @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPriceExVat?: number | null;
  @IsOptional() @IsString() lotNumber?: string | null; @IsOptional() @IsString() expiryDate?: string | null; @IsOptional() @IsString() notes?: string | null;
}
export class UpdateProposalDto {
  @IsInt() version!: number; @IsOptional() @IsUUID() locationId?: string | null; @IsOptional() @IsUUID() sourceLocationId?: string | null; @IsOptional() @IsUUID() destinationLocationId?: string | null; @IsOptional() @IsUUID() supplierId?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) duplicateOverrideReason?: string; @IsArray() @ValidateNested({ each: true }) @Type(() => ProposalLineDto) lines!: ProposalLineDto[];
}
export class ApplyProposalDto { @IsInt() version!: number; }
export class CreateAliasDto { @IsString() @MaxLength(500) alias!: string; @IsUUID() productId!: string; @IsOptional() @IsUUID() supplierId?: string; @IsOptional() @IsString() supplierSku?: string; @IsOptional() @IsString() purchaseUnit?: string; }

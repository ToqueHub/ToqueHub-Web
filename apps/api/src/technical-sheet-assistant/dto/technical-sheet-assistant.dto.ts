import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendTechnicalSheetAssistantMessageDto {
  @IsString() @MaxLength(6000) content!: string;
}

export class CreateTechnicalSheetAssistantDraftDto {
  @IsOptional() @IsUUID() targetTechnicalSheetId?: string;
}

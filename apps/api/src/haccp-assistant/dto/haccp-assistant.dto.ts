import { IsString, MaxLength } from 'class-validator';
export class SendHaccpAssistantMessageDto { @IsString() @MaxLength(6000) content!: string; }

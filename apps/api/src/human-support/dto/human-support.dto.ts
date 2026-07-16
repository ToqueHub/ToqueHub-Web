import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHumanSupportTicketDto {
  @IsString() @MaxLength(6000) content!: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsOptional() @IsString() @MaxLength(60) phone?: string;
  @IsOptional() @IsString() @MaxLength(500_000) transcript?: string;
}

export class SendHumanSupportMessageDto {
  @IsOptional() @IsString() @MaxLength(6000) content?: string;
}

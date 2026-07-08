import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterMobilePushTokenDto {
  @IsString()
  @MaxLength(512)
  token!: string;

  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  deviceId?: string;
}


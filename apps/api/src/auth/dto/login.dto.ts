import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@toquehub.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'toquehub' })
  @IsString()
  @MinLength(6)
  password!: string;
}

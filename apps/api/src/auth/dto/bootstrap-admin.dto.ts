import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class BootstrapAdminDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'username can only contain letters, numbers, dots, dashes and underscores',
  })
  username!: string;

  @ApiProperty({ example: 'Paul' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Breton' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({ example: 'admin@toquehub.local' })
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @ApiProperty({ example: 'ToqueHub-2026!' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message: 'password must contain uppercase, lowercase, number and special character',
  })
  password!: string;
}

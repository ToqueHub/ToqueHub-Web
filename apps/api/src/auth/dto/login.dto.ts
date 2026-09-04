import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@mon-etablissement.fr' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Votre-mot-de-passe' })
  @IsString()
  @MinLength(6)
  password!: string;
}

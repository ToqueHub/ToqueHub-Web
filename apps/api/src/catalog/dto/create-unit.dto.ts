import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: 'Kilogramme' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  symbol!: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationRemoteAccessDto {
  @ApiPropertyOptional({ description: 'Whether remote access through Tailscale is enabled for this organization.' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Tailscale machine hostname for this ToqueHub instance.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tailscaleHostname?: string | null;

  @ApiPropertyOptional({ description: 'Remote ToqueHub URL reachable through Tailscale.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  tailscaleUrl?: string | null;

  @ApiPropertyOptional({ description: 'Tailscale IPv4 address for this ToqueHub instance.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tailscaleIp?: string | null;
}

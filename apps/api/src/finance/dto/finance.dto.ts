import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { FinanceAccountCategory } from '@prisma/client';

export const FINANCE_PERIOD_PRESETS = [
  'current_month',
  'last_30_days',
  'current_quarter',
  'fiscal_year',
] as const;

export class FinanceBootstrapQueryDto {
  @IsOptional()
  @IsIn(FINANCE_PERIOD_PRESETS)
  preset?: (typeof FINANCE_PERIOD_PRESETS)[number];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class SetSalesSourceInclusionDto {
  @IsBoolean()
  enabled!: boolean;
}

export class ConfigureFennoaDto {
  @IsString()
  @MaxLength(200)
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsIn(['v1', 'v2'])
  apiVersion?: 'v1' | 'v2';
}

export class ConfigureFlatpayDto {
  @IsUUID()
  siteId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  password?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(500)
  portalUrl?: string;
}

export class InstallFlatpayAutomationDto {
  @IsUUID()
  siteId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true })
  schedule?: string[];

  @IsOptional()
  @IsDateString()
  historyStart?: string;
}

export class ConfigurePosApiDto {
  @IsUUID()
  siteId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  secret?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsDateString()
  historyStart?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true })
  schedule?: string[];
}

export class SyncPosApiDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class MapFinanceSourceSiteDto {
  @IsUUID()
  siteId!: string;
}

export class FinanceSalesInsightsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class SyncFennoaDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsBoolean()
  full?: boolean;
}

export class UpdateFinanceAccountDto {
  @IsEnum(FinanceAccountCategory)
  category!: FinanceAccountCategory;
}

export class UpdateFinancePreferencesDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  dashboardKpis!: string[];
}

export class FinanceAiAnalysisDto {
  @IsOptional()
  @IsIn(['annual', 'monthly', 'daily', 'sales'])
  view?: 'annual' | 'monthly' | 'daily' | 'sales';

  @IsOptional()
  @IsDateString()
  asOf?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;
}

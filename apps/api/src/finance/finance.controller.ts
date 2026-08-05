import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FinanceInstallationService } from './finance-installation.service';
import { FinanceService, type FinanceUploadedFile } from './finance.service';
import {
  ConfigureFennoaDto,
  ConfigureFlatpayDto,
  ConfigurePosApiDto,
  FinanceAiAnalysisDto,
  FinanceBootstrapQueryDto,
  FinanceExportQueryDto,
  FinanceSalesInsightsQueryDto,
  InstallFlatpayAutomationDto,
  MapFinanceSourceSiteDto,
  SetSalesSourceInclusionDto,
  SyncFennoaDto,
  SyncPosApiDto,
  UpdateFinanceAccountDto,
  UpdateFinancePreferencesDto,
} from './dto/finance.dto';
import { FennoaSyncService } from './fennoa-sync.service';
import { FinanceAiService } from './finance-ai.service';
import { FinanceSalesInsightsService } from './finance-sales-insights.service';
import { FlatpayCredentialsService } from './flatpay-credentials.service';
import { FlatpayAutomationService } from './flatpay-automation.service';
import { PosApiCredentialsService, posApiProvider } from './pos-api-credentials.service';
import { PosApiSyncService } from './pos-api-sync.service';
import { FinanceExportService } from './finance-export.service';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly installation: FinanceInstallationService,
    private readonly finance: FinanceService,
    private readonly fennoa: FennoaSyncService,
    private readonly financeAi: FinanceAiService,
    private readonly salesInsights: FinanceSalesInsightsService,
    private readonly flatpayCredentials: FlatpayCredentialsService,
    private readonly flatpayAutomation: FlatpayAutomationService,
    private readonly posApiCredentials: PosApiCredentialsService,
    private readonly posApiSync: PosApiSyncService,
    private readonly financeExport: FinanceExportService,
  ) {}

  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required');
    return user.organizationId;
  }

  @Post('install')
  install(@CurrentUser() user: AuthenticatedUser) {
    return this.installation
      .install(this.org(user), user)
      .then(() => this.finance.bootstrap(this.org(user), user));
  }

  @Post('uninstall')
  uninstall(@CurrentUser() user: AuthenticatedUser) {
    return this.installation.uninstall(this.org(user), user);
  }

  @Get('bootstrap')
  bootstrap(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceBootstrapQueryDto) {
    return this.finance.bootstrap(this.org(user), user, query);
  }

  @Get('exports/pdf')
  async exportPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FinanceExportQueryDto,
    @Res() response: Response,
  ) {
    const file = await this.financeExport.generate(this.org(user), user, query);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.filename)}"`,
    );
    response.setHeader('Content-Length', String(file.buffer.length));
    response.send(file.buffer);
  }

  @Patch('fennoa/configuration')
  configureFennoa(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfigureFennoaDto) {
    return this.fennoa.configure(this.org(user), user, dto);
  }

  @Get('fennoa/configuration')
  fennoaConfiguration(@CurrentUser() user: AuthenticatedUser) {
    return this.fennoa.publicSettings(this.org(user));
  }

  @Post('fennoa/test')
  testFennoa(@CurrentUser() user: AuthenticatedUser) {
    return this.fennoa.test(this.org(user), user);
  }

  @Post('fennoa/sync')
  syncFennoa(@CurrentUser() user: AuthenticatedUser, @Body() dto: SyncFennoaDto) {
    return this.fennoa.sync(this.org(user), user, dto);
  }

  @Patch('flatpay/configuration')
  configureFlatpay(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfigureFlatpayDto) {
    return this.flatpayCredentials.configure(this.org(user), user, dto);
  }

  @Get('flatpay/configuration')
  flatpayConfiguration(@CurrentUser() user: AuthenticatedUser) {
    return this.flatpayCredentials.publicSettings(this.org(user));
  }

  @Post('flatpay/automation/install')
  installFlatpayAutomation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InstallFlatpayAutomationDto,
  ) {
    return this.flatpayAutomation.install(this.org(user), user, dto);
  }

  @Post('flatpay/automation/reconnect')
  reconnectFlatpayAutomation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MapFinanceSourceSiteDto,
  ) {
    return this.flatpayAutomation.reconnect(this.org(user), user, dto.siteId);
  }

  @Get('pos/configuration')
  posConfiguration(@CurrentUser() user: AuthenticatedUser) {
    return this.posApiCredentials.publicSettings(this.org(user));
  }

  @Patch('pos/:provider/configuration')
  configurePos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
    @Body() dto: ConfigurePosApiDto,
  ) {
    return this.posApiCredentials.configure(this.org(user), user, posApiProvider(provider), dto);
  }

  @Post('pos/:provider/test')
  testPos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.posApiSync.test(this.org(user), user, posApiProvider(provider), siteId);
  }

  @Post('pos/:provider/sync')
  syncPos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
    @Body() dto: SyncPosApiDto,
  ) {
    return this.posApiSync.sync(this.org(user), user, posApiProvider(provider), dto);
  }

  @Get('sales-insights')
  async salesAnalysis(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FinanceSalesInsightsQueryDto,
  ) {
    await this.finance.assertReadable(this.org(user), user);
    return this.salesInsights.build(this.org(user), query);
  }

  @Post('sources/:id/primary-sales')
  setPrimarySalesSource(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.finance.setPrimarySalesSource(this.org(user), user, id);
  }

  @Post('sources/:id/primary-pos')
  setPrimaryPosSource(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.finance.setPrimaryPosSource(this.org(user), user, id);
  }

  @Patch('sources/:id/sales-inclusion')
  setSalesSourceInclusion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetSalesSourceInclusionDto,
  ) {
    return this.finance.setSalesSourceInclusion(this.org(user), user, id, dto.enabled);
  }

  @Patch('sources/:id/site')
  mapSourceSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MapFinanceSourceSiteDto,
  ) {
    return this.finance.mapSourceSite(this.org(user), user, id, dto.siteId);
  }

  @Get('accounts')
  accounts(@CurrentUser() user: AuthenticatedUser) {
    return this.finance.accounts(this.org(user), user);
  }

  @Patch('accounts/:code')
  updateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() dto: UpdateFinanceAccountDto,
  ) {
    return this.finance.updateAccount(this.org(user), user, code, dto);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateFinancePreferencesDto,
  ) {
    return this.finance.updatePreferences(this.org(user), user, dto);
  }

  @Post('analysis/ai')
  analyzeWithMistral(@CurrentUser() user: AuthenticatedUser, @Body() dto: FinanceAiAnalysisDto) {
    return this.financeAi.analyze(this.org(user), user, dto);
  }

  @Post('imports')
  @UseInterceptors(FileInterceptor('file'))
  importFile(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: FinanceUploadedFile,
    @Body('siteId') siteId?: string,
  ) {
    return this.finance.importFile(this.org(user), user, file, { siteId });
  }
}

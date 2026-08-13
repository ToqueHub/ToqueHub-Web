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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TechnicalSheetExportFormat } from '@prisma/client';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CompleteTechnicalSheetOnboardingCategoriesDto,
  DuplicateTechnicalSheetDto,
  ProductionSimulationDto,
  ReassignTechnicalSheetCategoryDto,
  TechnicalSheetListQueryDto,
  UpdateTechnicalSheetPricingDto,
  UpsertAllergenDto,
  UpsertRecipeCategoryDto,
  UpsertTechnicalSheetDto,
} from './dto/technical-sheets.dto';
import { TechnicalSheetsService } from './technical-sheets.service';

@ApiTags('technical-sheets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('technical-sheets')
export class TechnicalSheetsController {
  constructor(private readonly service: TechnicalSheetsService) {}
  private org(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required');
    return user.organizationId;
  }
  private actor(user: AuthenticatedUser) {
    return { id: user.id, role: user.role };
  }

  @Post('install') install(@CurrentUser() user: AuthenticatedUser) {
    return this.service.install(this.org(user), this.actor(user));
  }
  @Post('uninstall') uninstall(@CurrentUser() user: AuthenticatedUser) {
    return this.service.uninstall(this.org(user), this.actor(user));
  }
  @Get('dashboard') dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.service.dashboard(this.org(user));
  }
  @Get('onboarding') onboarding(@CurrentUser() user: AuthenticatedUser) {
    return this.service.onboarding(this.org(user));
  }
  @Post('onboarding/categories') completeOnboardingCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteTechnicalSheetOnboardingCategoriesDto,
  ) {
    return this.service.completeOnboardingCategories(this.org(user), this.actor(user), dto.names);
  }

  @Get('categories') listCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: TechnicalSheetListQueryDto,
  ) {
    return this.service.listCategories(this.org(user), q);
  }
  @Post('categories') createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertRecipeCategoryDto,
  ) {
    return this.service.createCategory(this.org(user), dto);
  }
  @Patch('categories/:id') updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertRecipeCategoryDto,
  ) {
    return this.service.updateCategory(this.org(user), id, dto);
  }
  @Post('categories/:id/archive') archiveCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.archiveCategory(this.org(user), id);
  }

  @Get('allergens') listAllergens(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: TechnicalSheetListQueryDto,
  ) {
    return this.service.listAllergens(this.org(user), q);
  }
  @Post('allergens') createAllergen(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertAllergenDto,
  ) {
    return this.service.createAllergen(this.org(user), dto);
  }
  @Patch('allergens/:id') updateAllergen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertAllergenDto,
  ) {
    return this.service.updateAllergen(this.org(user), id, dto);
  }
  @Post('allergens/:id/archive') archiveAllergen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.archiveAllergen(this.org(user), id);
  }

  @Get('recipes') listRecipes(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: TechnicalSheetListQueryDto,
  ) {
    return this.service.listRecipes(this.org(user), q);
  }
  @Post('recipes') createRecipe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertTechnicalSheetDto,
  ) {
    return this.service.createRecipe(this.org(user), this.actor(user), dto);
  }
  @Post('recipes/import-pdf')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 20 * 1024 * 1024 } }))
  importRecipePdf(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: any) {
    return this.service.importRecipePdf(this.org(user), file);
  }
  @Post('recipes/imports')
  @UseInterceptors(
    FilesInterceptor('files', 10, { limits: { files: 10, fileSize: 20 * 1024 * 1024 } }),
  )
  uploadRecipeImports(@CurrentUser() user: AuthenticatedUser, @UploadedFiles() files: any[]) {
    return this.service.uploadRecipeImports(this.org(user), this.actor(user), files);
  }
  @Get('recipes/imports/statuses')
  listRecipeImportStatuses(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listRecipeImportStatuses(this.org(user));
  }
  @Post('recipes/imports/:documentId/reviewed')
  reviewRecipeImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
  ) {
    return this.service.reviewRecipeImport(this.org(user), documentId);
  }
  @Get('recipes/:id/export.pdf')
  async exportRecipePdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.service.exportRecipePdf(this.org(user), this.actor(user), id);
    this.sendExport(res, file);
  }
  @Get('recipes/:id') getRecipe(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getRecipe(this.org(user), id);
  }
  @Patch('recipes/:id') updateRecipe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertTechnicalSheetDto,
  ) {
    return this.service.updateRecipe(this.org(user), this.actor(user), id, dto);
  }
  @Patch('recipes/:id/category') reassignRecipeCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReassignTechnicalSheetCategoryDto,
  ) {
    return this.service.reassignRecipeCategory(
      this.org(user),
      this.actor(user),
      id,
      dto.categoryId,
    );
  }
  @Patch('recipes/:id/pricing') updateRecipePricing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTechnicalSheetPricingDto,
  ) {
    return this.service.updateRecipePricing(this.org(user), this.actor(user), id, dto);
  }
  @Post('recipes/:id/archive') archiveRecipe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.archiveRecipe(this.org(user), this.actor(user), id);
  }
  @Post('recipes/:id/delete') deleteRecipe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.deleteRecipe(this.org(user), id);
  }
  @Post('recipes/:id/duplicate') duplicateRecipe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DuplicateTechnicalSheetDto,
  ) {
    return this.service.duplicateRecipe(this.org(user), this.actor(user), id, dto);
  }
  @Post('recipes/:id/recalculate-cost') recalculate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.recalculateCost(this.org(user), this.actor(user), id);
  }
  @Get('recipes/:id/history') history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() q: TechnicalSheetListQueryDto,
  ) {
    return this.service.historyList(this.org(user), id, q);
  }

  @Get('costs') costs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: TechnicalSheetListQueryDto,
  ) {
    return this.service.costs(this.org(user), q);
  }
  @Post('production/simulate') simulate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ProductionSimulationDto,
  ) {
    return this.service.simulate(this.org(user), this.actor(user), dto);
  }
  @Get('production/:id/export.csv')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.service.exportSimulation(
      this.org(user),
      this.actor(user),
      id,
      TechnicalSheetExportFormat.CSV,
    );
    this.sendExport(res, file);
  }
  @Get('production/:id/export.pdf')
  async exportPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.service.exportSimulation(
      this.org(user),
      this.actor(user),
      id,
      TechnicalSheetExportFormat.PDF,
    );
    this.sendExport(res, file);
  }

  private sendExport(
    res: Response,
    file: { filename: string; contentType: string; body: string | Buffer },
  ) {
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.send(file.body);
  }
}

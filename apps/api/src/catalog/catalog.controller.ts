import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CatalogService } from './catalog.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateUnitDto } from './dto/create-unit.dto';

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  private requireOrganization(user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization setup is required before using catalog endpoints');
    }
    return user.organizationId;
  }

  @Get('categories')
  @ApiOkResponse({ description: 'List product categories for the current organization.' })
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.catalogService.listCategories(this.requireOrganization(user));
  }

  @Post('categories')
  @ApiCreatedResponse({ description: 'Create a product category.' })
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(this.requireOrganization(user), dto);
  }

  @Get('units')
  @ApiOkResponse({ description: 'List units for the current organization.' })
  listUnits(@CurrentUser() user: AuthenticatedUser) {
    return this.catalogService.listUnits(this.requireOrganization(user));
  }

  @Post('units')
  @ApiCreatedResponse({ description: 'Create a unit.' })
  createUnit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUnitDto) {
    return this.catalogService.createUnit(this.requireOrganization(user), dto);
  }

  @Get('products')
  @ApiOkResponse({ description: 'List products for the current organization.' })
  listProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.catalogService.listProducts(this.requireOrganization(user));
  }

  @Post('products')
  @ApiCreatedResponse({ description: 'Create a product linked to a unit and optional category.' })
  createProduct(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(this.requireOrganization(user), dto);
  }

  @Get('suppliers')
  @ApiOkResponse({ description: 'List suppliers for the current organization.' })
  listSuppliers(@CurrentUser() user: AuthenticatedUser) {
    return this.catalogService.listSuppliers(this.requireOrganization(user));
  }

  @Post('suppliers')
  @ApiCreatedResponse({ description: 'Create a supplier.' })
  createSupplier(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierDto) {
    return this.catalogService.createSupplier(this.requireOrganization(user), dto);
  }
}

import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RnmHistoryQueryDto, RnmProductsQueryDto, UpsertRnmFavoriteDto } from './dto/rnm-prices.dto';
import { RnmPricesService } from './rnm-prices.service';

@ApiTags('rnm-prices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rnm-prices')
export class RnmPricesController {
  constructor(private readonly service: RnmPricesService) {}

  private ensureOrg(user: AuthenticatedUser) {
    if (!user.organizationId) throw new BadRequestException('Organization setup is required before using Cours des Produits');
  }

  @Post('install') async install(@CurrentUser() user: AuthenticatedUser) { await this.service.install(user); return this.service.dashboardSummary(user); }
  @Post('uninstall') async uninstall(@CurrentUser() user: AuthenticatedUser) { await this.service.uninstall(user); return this.service.dashboardSummary(user); }

  @Get('stats') @ApiOkResponse({ description: 'Aggregated live RNM statistics for dashboard cards.' }) stats(@CurrentUser() user: AuthenticatedUser) { this.ensureOrg(user); return this.service.stats(); }
  @Get('products') products(@CurrentUser() user: AuthenticatedUser, @Query() query: RnmProductsQueryDto) { this.ensureOrg(user); return this.service.products(query); }
  @Get('products/:id') product(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { this.ensureOrg(user); return this.service.product(id); }
  @Get('products/:id/history') productHistory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: RnmHistoryQueryDto) { this.ensureOrg(user); return this.service.history(query, id); }
  @Get('history') history(@CurrentUser() user: AuthenticatedUser, @Query() query: RnmHistoryQueryDto) { this.ensureOrg(user); return this.service.history(query); }

  @Get('favorites') favorites(@CurrentUser() user: AuthenticatedUser) { return this.service.listFavorites(user); }
  @Post('favorites') addFavorite(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertRnmFavoriteDto) { return this.service.addFavorite(user, dto); }
  @Delete('favorites/:productId') removeFavorite(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) { return this.service.removeFavorite(user, productId); }
}

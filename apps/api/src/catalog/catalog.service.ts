import { Injectable } from '@nestjs/common';
import { StocksService } from '../stocks/stocks.service';
import { UpsertCategoryDto, UpsertUnitDto, UpsertProductDto, UpsertSupplierDto } from '../stocks/dto/stocks-reference.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly stocksService: StocksService) {}

  listCategories(organizationId: string) {
    return this.stocksService.listCategories(organizationId, {});
  }

  createCategory(organizationId: string, dto: UpsertCategoryDto) {
    return this.stocksService.createCategory(organizationId, { id: '', role: 'SUPER_ADMIN' }, dto);
  }

  listUnits(organizationId: string) {
    return this.stocksService.listUnits(organizationId, {});
  }

  createUnit(organizationId: string, dto: UpsertUnitDto) {
    return this.stocksService.createUnit(organizationId, { id: '', role: 'SUPER_ADMIN' }, dto);
  }

  listProducts(organizationId: string) {
    return this.stocksService.listProducts(organizationId, {});
  }

  createProduct(organizationId: string, dto: UpsertProductDto) {
    return this.stocksService.createProduct(organizationId, { id: '', role: 'SUPER_ADMIN' }, dto);
  }

  listSuppliers(organizationId: string) {
    return this.stocksService.listSuppliers(organizationId, {});
  }

  createSupplier(organizationId: string, dto: UpsertSupplierDto) {
    return this.stocksService.createSupplier(organizationId, { id: '', role: 'SUPER_ADMIN' }, dto);
  }
}

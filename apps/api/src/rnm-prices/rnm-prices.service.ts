import { BadGatewayException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RnmHistoryQueryDto, RnmProductsQueryDto, UpsertRnmFavoriteDto } from './dto/rnm-prices.dto';

const DEFAULT_RNM_URL = 'https://toquehub-rnm.fly.dev';
const TIMEOUT_MS = 8000;

type Actor = { id: string; organizationId: string | null };

type RnmProduct = {
  id: string;
  name: string;
  category?: string | null;
  sector?: string | null;
  latestQuotationDate?: string | null;
  averagePrice?: number | null;
  variation?: number | null;
  raw?: unknown;
};

@Injectable()
export class RnmPricesService {
  private readonly baseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.baseUrl = (config.get<string>('RNM_API_URL') || DEFAULT_RNM_URL).replace(/\/$/, '');
  }

  private org(user: Actor): string {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before using Cours des Produits');
    return user.organizationId;
  }

  async install(user: Actor) {
    const organizationId = this.org(user);
    await this.prisma.organization.update({ where: { id: organizationId }, data: { rnmPricesInstalledAt: new Date() } });
    await this.prisma.auditLog.create({ data: { organizationId, userId: user.id, action: 'MODULE_RNM_PRICES_INSTALLED', entityType: 'Module', entityId: 'rnm-prices', entityName: 'Cours des Produits' } as any });
    return { installed: true };
  }

  async uninstall(user: Actor) {
    const organizationId = this.org(user);
    await this.prisma.organization.update({ where: { id: organizationId }, data: { rnmPricesInstalledAt: null } });
    await this.prisma.auditLog.create({ data: { organizationId, userId: user.id, action: 'MODULE_RNM_PRICES_UNINSTALLED', entityType: 'Module', entityId: 'rnm-prices', entityName: 'Cours des Produits' } as any });
    return { installed: false };
  }

  async dashboardSummary(user: Actor) {
    const organizationId = this.org(user);
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    return {
      installedApplications: [
        ...(organization?.stocksInstalledAt ? ['stocks'] : []),
        ...(organization?.rnmPricesInstalledAt ? ['rnm-prices'] : []),
      ],
    };
  }

  listFavorites(user: Actor) {
    return this.prisma.rnmProductFavorite.findMany({ where: { userId: user.id, organizationId: this.org(user) }, orderBy: { createdAt: 'desc' } });
  }

  async addFavorite(user: Actor, dto: UpsertRnmFavoriteDto) {
    const organizationId = this.org(user);
    return this.prisma.rnmProductFavorite.upsert({
      where: { userId_rnmProductId: { userId: user.id, rnmProductId: dto.rnmProductId } },
      update: { productName: dto.productName, category: dto.category, sector: dto.sector },
      create: { organizationId, userId: user.id, rnmProductId: dto.rnmProductId, productName: dto.productName, category: dto.category, sector: dto.sector },
    });
  }

  async removeFavorite(user: Actor, productId: string) {
    const organizationId = this.org(user);
    const existing = await this.prisma.rnmProductFavorite.findFirst({ where: { userId: user.id, organizationId, rnmProductId: productId } });
    if (!existing) throw new NotFoundException('RNM favorite not found');
    await this.prisma.rnmProductFavorite.delete({ where: { id: existing.id } });
    return { removed: true, rnmProductId: productId };
  }

  async products(query: RnmProductsQueryDto) {
    const data = await this.tryProxy(['/api/rnm/products'], this.clean({
      search: query.search,
      secteur: query.secteur ?? query.sector,
      sector: query.sector ?? query.secteur,
      categorie: query.categorie ?? query.category,
      category: query.category ?? query.categorie,
      limit: query.limit ?? query.pageSize ?? '1000',
      offset: query.offset,
    }));
    const normalized = this.normalizeProducts(data, query);
    return this.enrichProductsWithCurrentPrices(normalized);
  }

  async product(id: string) {
    const data = await this.tryProxy([`/api/rnm/products/${encodeURIComponent(id)}`]) as any;
    const payload = data?.success && data?.data ? data.data : data;
    const productSource = payload?.product ? {
      ...payload.product,
      latestQuotationDate: payload.latestQuotationDate,
      varietiesCount: Array.isArray(payload.varieties) ? payload.varieties.length : undefined,
    } : payload;
    const quotations = this.extractArray(payload, ['latestPrices', 'quotations', 'quotes', 'cotations', 'prices', 'data', 'results']).map((q) => this.normalizeQuotation(q, productSource));
    const product = this.normalizeProduct(productSource) ?? { id, name: String(id), raw: productSource };
    const pricedProduct = this.withPriceSnapshot(product, quotations);
    return { ...pricedProduct, varietiesCount: productSource?.varietiesCount ?? quotations.length, quotations, quotes: quotations };
  }

  async history(query: RnmHistoryQueryDto, productId?: string) {
    const params = this.clean({
      product: productId ?? query.product ?? query.productId ?? query.produit,
      productId: productId ?? query.productId ?? query.produit,
      produit: productId ?? query.produit ?? query.productId,
      market: query.market ?? query.marche,
      marche: query.marche ?? query.market,
      stage: query.stage ?? query.stade,
      stade: query.stade ?? query.stage,
      dateFrom: query.dateFrom ?? query.startDate ?? query.dateDebut,
      startDate: query.startDate ?? query.dateDebut,
      dateDebut: query.dateDebut ?? query.startDate,
      dateTo: query.dateTo ?? query.endDate ?? query.dateFin,
      endDate: query.endDate ?? query.dateFin,
      dateFin: query.dateFin ?? query.endDate,
      period: query.period,
      limit: query.limit ?? query.pageSize,
      offset: query.offset,
    });
    const data = await this.tryProxy(['/api/rnm/prices'], params);
    return this.normalizeHistory(data);
  }

  async stats() {
    const [productsList, hierarchy, prices] = await Promise.all([
      this.products({ limit: '1000' }),
      this.tryProxy(['/api/rnm/hierarchy']).catch(() => ({ data: [] })),
      this.history({ limit: '500' }).catch(() => ({ items: [] })),
    ]);
    const products = productsList.items;
    const sectors = this.extractArray(hierarchy, ['data', 'items', 'sectors']);
    const latestQuotationDate = prices.items.map((p) => p.date).filter(Boolean).sort().at(-1) ?? products.map((p) => p.latestQuotationDate).filter(Boolean).sort().at(-1) ?? null;
    const movements = this.aggregateMovers(prices.items);
    return {
      productCount: productsList.total ?? products.length,
      sectorCount: sectors.length || new Set(products.map((p) => p.sector).filter(Boolean)).size,
      marketCount: this.countDistinct(prices.items.map((p: any) => p.market)),
      latestQuotationDate,
      topRisers: movements.risers,
      topFallers: movements.fallers,
    };
  }

  private aggregateMovers(items: ReturnType<RnmPricesService['normalizeQuotation']>[]) {
    const byProduct = new Map<string, { id: string; name: string; averagePrices: number[]; variations: number[]; unit?: string | null; latestQuotationDate?: string | null }>();
    for (const item of items) {
      const raw = item.raw as { productSlug?: unknown; product?: unknown; unit?: unknown } | undefined;
      const id = String(item.productId ?? raw?.productSlug ?? item.productName ?? item.variety ?? 'produit');
      const name = String(item.productName ?? raw?.product ?? item.variety ?? id);
      const current = byProduct.get(id) ?? { id, name, averagePrices: [] as number[], variations: [] as number[], unit: raw?.unit ? String(raw.unit) : null, latestQuotationDate: item.date };
      if (typeof item.averagePrice === 'number' && Number.isFinite(item.averagePrice)) current.averagePrices.push(item.averagePrice);
      if (typeof item.variation === 'number' && Number.isFinite(item.variation)) current.variations.push(item.variation);
      if (item.date && (!current.latestQuotationDate || item.date > current.latestQuotationDate)) current.latestQuotationDate = item.date;
      byProduct.set(id, current);
    }

    const products = [...byProduct.values()]
      .map((item) => ({
        id: item.id,
        name: item.name,
        averagePrice: item.averagePrices.length ? item.averagePrices.reduce((sum, value) => sum + value, 0) / item.averagePrices.length : null,
        variation: item.variations.length ? item.variations.reduce((sum, value) => sum + value, 0) / item.variations.length : null,
        unit: item.unit,
        latestQuotationDate: item.latestQuotationDate,
      }))
      .filter((item) => item.variation !== null);

    return {
      risers: products.filter((p) => Number(p.variation) > 0).sort((a, b) => Number(b.variation) - Number(a.variation)).slice(0, 5),
      fallers: products.filter((p) => Number(p.variation) < 0).sort((a, b) => Number(a.variation) - Number(b.variation)).slice(0, 5),
    };
  }

  private async tryProxy(paths: string[], params: Record<string, string | undefined> = {}) {
    let lastError: unknown;
    for (const path of paths) {
      try { return await this.fetchRnm(path, params); } catch (error: any) {
        lastError = error;
        if (error?.status && error.status !== 404) break;
      }
    }
    if (lastError instanceof ServiceUnavailableException || lastError instanceof BadGatewayException) throw lastError;
    throw new BadGatewayException({ title: 'Données temporairement indisponibles', message: 'Impossible de récupérer les données RNM actuellement. Veuillez réessayer ultérieurement.' });
  }

  private async fetchRnm(path: string, params: Record<string, string | undefined> = {}) {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    Object.entries(params).forEach(([key, value]) => { if (value != null && value !== '') url.searchParams.set(key, String(value)); });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) {
        const error: any = new Error(`RNM API ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new ServiceUnavailableException({ title: 'Données temporairement indisponibles', message: 'Délai RNM dépassé. Veuillez réessayer ultérieurement.' });
      if (error?.status === 404) throw error;
      throw new BadGatewayException({ title: 'Données temporairement indisponibles', message: 'Impossible de récupérer les données RNM actuellement. Veuillez réessayer ultérieurement.' });
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeProducts(data: any, query: RnmProductsQueryDto) {
    const rawItems = this.extractArray(data, ['items', 'products', 'produits', 'data', 'results']);
    let items = rawItems.map((item) => this.normalizeProduct(item)).filter(Boolean) as RnmProduct[];
    const search = query.search?.toLowerCase();
    if (search) items = items.filter((p) => [p.name, p.category, p.sector].some((v) => v?.toLowerCase().includes(search)));
    const category = this.normalizeFilter(query.category ?? query.categorie);
    if (category) items = items.filter((p) => {
      const raw = p.raw as { category?: { name?: unknown } } | undefined;
      return this.normalizeFilter(p.category) === category || this.normalizeFilter(raw?.category?.name) === category;
    });
    const sector = this.normalizeFilter(query.sector ?? query.secteur);
    if (sector) items = items.filter((p) => {
      const raw = p.raw as { category?: { sector?: { name?: unknown } } } | undefined;
      return this.normalizeFilter(p.sector) === sector || this.normalizeFilter(raw?.category?.sector?.name) === sector;
    });
    return {
      items,
      page: Number(data?.page ?? query.page ?? 1),
      pageSize: Number(data?.pageSize ?? data?.limit ?? data?.pagination?.limit ?? query.pageSize ?? query.limit ?? items.length),
      total: Number(data?.total ?? data?.count ?? data?.pagination?.total ?? items.length),
      categories: [...new Set(items.map((p) => p.category).filter(Boolean))],
      sectors: [...new Set(items.map((p) => p.sector).filter(Boolean))],
    };
  }

  private normalizeProduct(item: any): RnmProduct | null {
    if (!item || typeof item !== 'object') return null;
    const id = item.slug ?? item.name ?? item.id ?? item.code ?? item.productId ?? item.produitId ?? item.libelle ?? item.nom;
    const name = item.label ?? item.name ?? item.nom ?? item.libelle ?? item.produit ?? item.productName ?? id;
    if (!id || !name) return null;
    return {
      id: String(id),
      name: this.restoreFrenchAccents(String(name)) || String(id),
      category: this.restoreFrenchAccents(this.cleanLabel(item.category?.label ?? item.categoryLabel ?? item.category ?? item.categorie ?? item.famille ?? null)),
      sector: this.restoreFrenchAccents(this.cleanLabel(item.category?.sector?.label ?? item.sector?.label ?? item.sectorLabel ?? item.sector ?? item.secteur ?? item.filiere ?? null)),
      latestQuotationDate: item.latestQuotationDate ?? item.lastQuotationDate ?? item.derniereCotation ?? item.date ?? item.dateCotation ?? null,
      averagePrice: this.num(item.averagePrice ?? item.avgPrice ?? item.prixMoyen ?? item.moyenne ?? item.price),
      variation: this.num(item.variation ?? item.evolution ?? item.var),
      raw: item,
    };
  }

  private normalizeHistory(data: any) {
    const rows = this.extractArray(data, ['items', 'history', 'historique', 'cotations', 'latestPrices', 'data', 'results']).map((r) => this.normalizeQuotation(r));
    return { items: rows, page: Number(data?.page ?? 1), pageSize: Number(data?.pageSize ?? data?.limit ?? data?.pagination?.limit ?? rows.length), total: Number(data?.total ?? data?.count ?? data?.pagination?.total ?? rows.length) };
  }

  private normalizeQuotation(q: any, productContext?: any) {
    const market = this.restoreFrenchAccents(q?.market ?? q?.marche ?? q?.libelleMarche ?? null);
    return {
      date: q?.date ?? q?.dateCotation ?? q?.jour ?? null,
      productId: q?.productSlug ?? q?.productId ?? q?.produitId ?? q?.codeProduit ?? null,
      productName: this.restoreFrenchAccents(q?.product ?? q?.productName ?? q?.produit ?? q?.nomProduit ?? null),
      variety: this.restoreFrenchAccents(q?.variety ?? q?.variete ?? q?.libelleVariete ?? null),
      market: this.normalizeMarketLabel(market, q?.marketCode ?? q?.codeMarche ?? null, productContext),
      marketCode: q?.marketCode ?? q?.codeMarche ?? null,
      stage: this.restoreFrenchAccents(q?.stage ?? q?.stade ?? q?.stadeCommercial ?? null),
      averagePrice: this.num(q?.avgPrice ?? q?.averagePrice ?? q?.prixMoyen ?? q?.moyenne ?? q?.prix),
      minPrice: this.num(q?.minPrice ?? q?.prixMin ?? q?.minimum),
      maxPrice: this.num(q?.maxPrice ?? q?.prixMax ?? q?.maximum),
      variation: this.num(q?.variation ?? q?.evolution ?? q?.var),
      raw: q,
    };
  }

  private async enrichProductsWithCurrentPrices(response: ReturnType<RnmPricesService['normalizeProducts']>) {
    const visibleProducts = response.items.slice(0, 24);
    const enriched = await Promise.all(visibleProducts.map(async (product) => {
      const raw = product.raw as { name?: unknown; label?: unknown } | undefined;
      const slug = String(raw?.name ?? product.id);
      try {
        const data = await this.tryProxy([`/api/rnm/products/${encodeURIComponent(slug)}`]) as any;
        const payload = data?.success && data?.data ? data.data : data;
        const productSource = payload?.product ?? product.raw;
        const quotations = this.extractArray(payload, ['latestPrices', 'quotations', 'quotes', 'cotations', 'prices', 'data', 'results']).map((q) => this.normalizeQuotation(q, productSource));
        return this.withPriceSnapshot(product, quotations);
      } catch {
        return product;
      }
    }));
    return { ...response, items: [...enriched, ...response.items.slice(visibleProducts.length)] };
  }

  private withPriceSnapshot(product: RnmProduct, quotations: ReturnType<RnmPricesService['normalizeQuotation']>[]): RnmProduct {
    const validPrices = quotations.map((q) => q.averagePrice).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const validVariations = quotations.map((q) => q.variation).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const latestQuotationDate = quotations.map((q) => q.date).filter(Boolean).sort().at(-1) ?? product.latestQuotationDate;
    return {
      ...product,
      averagePrice: product.averagePrice ?? (validPrices.length ? validPrices.reduce((sum, value) => sum + value, 0) / validPrices.length : null),
      variation: product.variation ?? (validVariations.length ? validVariations.reduce((sum, value) => sum + value, 0) / validVariations.length : null),
      latestQuotationDate,
      raw: product.raw,
    };
  }

  private normalizeMarketLabel(market: string | null, marketCode?: string | null, productContext?: any): string | null {
    if (!market) return null;

    // Le scraper génère parfois un code stable depuis les 10 premiers caractères du libellé
    // quand RNM ne fournit pas de code explicite. Plusieurs lignes comme
    // "MIN de Rungis : fruits et légumes", "MIN de Rungis : veau" partagent alors
    // le même code M_MINDERUNGI et l'upsert garde le dernier libellé rencontré.
    // Pour l'affichage ToqueHub, on expose donc le marché physique canonique.
    const canonicalByGeneratedCode: Record<string, string> = {
      M_MINDERUNGI: 'MIN de Rungis',
    };
    if (marketCode && canonicalByGeneratedCode[marketCode]) return canonicalByGeneratedCode[marketCode];

    const generatedCodePrefix = marketCode && /^M_(MINDE|MIND|MARCHDE|BASSIN|CADRAN)/.test(marketCode);
    if (generatedCodePrefix && market.includes(':')) return market.split(':')[0].trim();

    const productText = this.normalizeFilter([
      productContext?.label,
      productContext?.name,
      productContext?.category,
      productContext?.sector,
      productContext?.category?.label,
      productContext?.category?.sector?.label,
    ].filter(Boolean).join(' '));
    const normalizedMarket = this.normalizeFilter(market);

    const productIsMeat = /viande|veau|boeuf|bovin|ovin|porc|volaille|agneau/.test(productText);
    const productIsSeafood = /peche|aquaculture|poisson|coquillage|crustace|cephalopode|mer/.test(productText);
    const productIsFruitVegetable = /fruit|legume/.test(productText);
    const productIsDairy = /beurre|oeuf|fromage|lait|creme|bof/.test(productText);

    const incoherentRungisSuffix =
      (normalizedMarket.includes(': veau') && !productIsMeat) ||
      (normalizedMarket.includes('fruits et legumes') && !productIsFruitVegetable) ||
      (normalizedMarket.includes('poisson') && !productIsSeafood) ||
      (normalizedMarket.includes('maree') && !productIsSeafood) ||
      (normalizedMarket.includes('fromage') && !productIsDairy);

    if (market.toLowerCase().includes('min de rungis') && incoherentRungisSuffix) {
      return 'MIN de Rungis';
    }
    return market;
  }

  private extractArray(data: any, keys: string[]): any[] {
    if (Array.isArray(data)) return data;
    if (data?.success && Array.isArray(data?.data)) return data.data;
    for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
    return [];
  }

  private normalizeFilter(v: unknown): string {
    return String(v ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&gt;/g, '>')
      .replace(/^>\s*/, '')
      .trim();
  }
  private cleanLabel(v: unknown): string | null { return typeof v === 'string' ? v.replace(/&gt;/g, '>').replace(/^>\s*/, '').trim() : v == null ? null : String(v); }
  private clean(obj: Record<string, string | undefined>) { return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')) as Record<string, string | undefined>; }
  private num(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  private countDistinct(values: unknown[]) { return new Set(values.filter(Boolean).map(String)).size; }

  private restoreFrenchAccents(text?: string | null): string | null {
    if (text === undefined || text === null) return null;
    let result = String(text);
    const replacements: Array<[RegExp, string]> = [
      [/\uFFFDUFS/g, 'ŒUFS'],
      [/\uFFFDufs/g, 'œufs'],
      [/\uFFFDOEUFS/g, 'ŒUFS'],
      [/\uFFFDoeufs/g, 'œufs'],
      [/B\uFFFDUFS/g, 'BŒUFS'],
      [/b\uFFFDufs/g, 'bœufs'],
      [/FRA\uFFFDCHE/g, 'FRAÎCHE'],
      [/fra\uFFFDche/g, 'fraîche'],
      [/CR\uFFFDM/g, 'CRÈM'],
      [/cr\uFFFDm/g, 'crèm'],
      [/ISRA\uFFFDL/g, 'ISRAËL'],
      [/isra\uFFFDl/g, 'israël'],
      [/FRAN\uFFFDAIS/g, 'FRANÇAIS'],
      [/fran\uFFFDAis/g, 'français'],
      [/FRAN\uFFFDAISE/g, 'FRANÇAISE'],
      [/fran\uFFFDAise/g, 'française'],
      [/PR\uFFFDS/g, 'PRÈS'],
      [/pr\uFFFDs/g, 'près'],
      [/PI\uFFFDC/g, 'PIÈC'],
      [/pi\uFFFDc/g, 'pièc'],
      [/M\uFFFDR/g, 'MÛR'],
      [/m\uFFFDr/g, 'mûr'],
      [/P\uFFFDCHE/g, 'PÊCHE'],
      [/p\uFFFDche/g, 'pêche'],
      [/ASPAR\uFFFDE/g, 'ASPARÈGE'],
      [/aspar\uFFFDe/g, 'asparège'],
      [/MANI\uFFFDR/g, 'MANIÈRE'],
      [/mani\uFFFDr/g, 'manière'],
      [/LI\uFFFDEG/g, 'LIÈG'],
      [/li\uFFFDeg/g, 'lièg'],
    ];

    for (const [regex, replacement] of replacements) {
      result = result.replace(regex, replacement);
    }

    result = result.replace(/\uFFFD([A-Z]+)/g, 'É$1');
    result = result.replace(/\uFFFD([a-z]+)/g, 'é$1');

    result = result.replace(/([a-zA-Z]+)\uFFFD/g, (match, wordPart) => {
      const isUppercase = wordPart === wordPart.toUpperCase();
      return wordPart + (isUppercase ? 'É' : 'é');
    });

    result = result.replace(/\uFFFD/g, 'é');
    return result;
  }
}

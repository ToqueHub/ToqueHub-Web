import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FinanceProvider, FinanceSourceStatus, FinanceSourceType, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import type { SyncPosApiDto } from './dto/finance.dto';
import { FinancePolicy } from './finance.policy';
import {
  normalizeLoyverseReceipts,
  normalizeZettlePurchases,
  type NormalizedPosLocation,
  type NormalizedPosRow,
} from './pos-api-normalizers';
import { PosApiCredentialsService, type PosApiProvider } from './pos-api-credentials.service';

const DAY = 86_400_000;
const MAX_LOYVERSE_WINDOW_DAYS = 14;
const DEFAULT_HISTORY_DAYS = 31;
const ZETTLE_HISTORY_DAYS = 3 * 366;
const REQUEST_TIMEOUT_MS = 30_000;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function date(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new BadRequestException('Période de synchronisation invalide.');
  return parsed;
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function endOfDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999),
  );
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Erreur inconnue pendant la synchronisation.';
}

@Injectable()
export class PosApiSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PosApiSyncService.name);
  private readonly running = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: FinancePolicy,
    private readonly credentialsService: PosApiCredentialsService,
  ) {}

  onModuleInit() {
    // Le planificateur vit dans l'API ToqueHub locale : aucun navigateur ni processus séparé requis.
    this.timer = setInterval(() => void this.runScheduled(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async test(
    organizationId: string,
    actor: AuthenticatedUser,
    provider: PosApiProvider,
    siteId?: string,
  ) {
    this.policy.assertPermission(actor, 'finance.manage');
    const credentials = await this.credentialsService.credentials(organizationId, provider, siteId);
    if (provider === FinanceProvider.LOYVERSE) {
      const response = await this.fetchJson(`${credentials.apiBaseUrl}/stores?limit=1`, {
        headers: { Authorization: `Bearer ${credentials.secret}` },
      });
      return {
        ok: true,
        provider,
        message: 'Connexion Loyverse réussie.',
        storesDetected: this.collection(response, 'stores').length,
      };
    }
    const accessToken = await this.zettleAccessToken(credentials.clientId, credentials.secret);
    await this.fetchJson('https://products.izettle.com/organizations/self/products/v2?limit=1', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { ok: true, provider, message: 'Connexion PayPal POS/Zettle réussie.' };
  }

  async sync(
    organizationId: string,
    actor: AuthenticatedUser,
    provider: PosApiProvider,
    dto: SyncPosApiDto = {},
  ) {
    this.policy.assertPermission(actor, 'finance.manage');
    return this.syncInternal(organizationId, provider, dto);
  }

  private async syncInternal(
    organizationId: string,
    provider: PosApiProvider,
    dto: SyncPosApiDto = {},
  ) {
    const credentials = await this.credentialsService.credentials(
      organizationId,
      provider,
      dto.siteId,
    );
    const key = `${organizationId}:${provider}:${credentials.defaultSiteId}`;
    if (this.running.has(key)) {
      throw new BadRequestException('Une synchronisation de cette caisse est déjà en cours.');
    }
    this.running.add(key);
    try {
      const now = new Date();
      const fallbackFrom = credentials.lastSyncedAt
        ? new Date(credentials.lastSyncedAt.getTime() - 2 * DAY)
        : (credentials.historyStart ?? new Date(now.getTime() - DEFAULT_HISTORY_DAYS * DAY));
      let from = startOfDay(date(dto.from, fallbackFrom));
      const to = endOfDay(date(dto.to, now));
      if (provider === FinanceProvider.PAYPAL_POS) {
        const earliest = startOfDay(new Date(now.getTime() - ZETTLE_HISTORY_DAYS * DAY));
        if (from < earliest) from = earliest;
      }
      if (from > to)
        throw new BadRequestException('La date de début doit précéder la date de fin.');

      const locations =
        provider === FinanceProvider.LOYVERSE
          ? await this.loyverse(credentials.apiBaseUrl, credentials.secret, from, to)
          : await this.zettle(
              credentials.clientId,
              credentials.secret,
              credentials.apiBaseUrl,
              from,
              to,
            );
      const result = await this.persist(
        organizationId,
        provider,
        credentials.defaultSiteId,
        locations,
      );
      await this.credentialsService.recordSync(organizationId, provider, credentials.defaultSiteId);
      return {
        ok: true,
        provider,
        period: { from, to },
        ...result,
        message:
          result.transactions > 0
            ? `${result.transactions} ticket(s) et ${result.productRows} ligne(s) produit synchronisés.`
            : 'Connexion réussie, mais aucun ticket trouvé sur cette période.',
      };
    } catch (error) {
      const message = errorMessage(error);
      await this.credentialsService
        .recordSync(organizationId, provider, credentials.defaultSiteId, message)
        .catch(() => undefined);
      throw error instanceof BadRequestException || error instanceof ServiceUnavailableException
        ? error
        : new ServiceUnavailableException(message);
    } finally {
      this.running.delete(key);
    }
  }

  private async loyverse(baseUrl: string, token: string, from: Date, to: Date) {
    const headers = { Authorization: `Bearer ${token}` };
    const [storesResponse, paymentsResponse, categoriesResponse, itemsResponse] = await Promise.all(
      [
        this.paginatedLoyverse(baseUrl, '/stores', headers),
        this.paginatedLoyverse(baseUrl, '/payment_types', headers),
        this.paginatedLoyverse(baseUrl, '/categories', headers, { show_deleted: 'true' }),
        this.paginatedLoyverse(baseUrl, '/items', headers, { show_deleted: 'true' }),
      ],
    );
    const stores = new Map(
      storesResponse.map((value) => {
        const entry = object(value);
        return [text(entry.id), text(entry.name) || `Magasin ${text(entry.id)}`];
      }),
    );
    const payments = new Map(
      paymentsResponse.map((value) => {
        const entry = object(value);
        return [text(entry.id), text(entry.name) || text(entry.type)];
      }),
    );
    const categories = new Map(
      categoriesResponse.map((value) => {
        const entry = object(value);
        return [text(entry.id), text(entry.name)];
      }),
    );
    const products = new Map<string, { name: string; category?: string }>();
    for (const value of itemsResponse) {
      const item = object(value);
      const itemId = text(item.id);
      const product = {
        name: text(item.item_name) || text(item.name),
        category: categories.get(text(item.category_id)),
      };
      if (itemId) products.set(itemId, product);
      for (const rawVariant of array(item.variants)) {
        const variant = object(rawVariant);
        const variantId = text(variant.variant_id) || text(variant.id);
        if (variantId) products.set(variantId, product);
      }
    }
    const receipts: unknown[] = [];
    for (
      let cursor = from.getTime();
      cursor <= to.getTime();
      cursor += MAX_LOYVERSE_WINDOW_DAYS * DAY
    ) {
      const windowFrom = new Date(cursor);
      const windowTo = new Date(
        Math.min(to.getTime(), cursor + MAX_LOYVERSE_WINDOW_DAYS * DAY - 1),
      );
      receipts.push(
        ...(await this.paginatedLoyverse(baseUrl, '/receipts', headers, {
          created_at_min: windowFrom.toISOString(),
          created_at_max: windowTo.toISOString(),
        })),
      );
    }
    return normalizeLoyverseReceipts(receipts, { stores, payments, products });
  }

  private async paginatedLoyverse(
    baseUrl: string,
    path: string,
    headers: Record<string, string>,
    params: Record<string, string> = {},
  ) {
    const rows: unknown[] = [];
    let cursor = '';
    const seen = new Set<string>();
    do {
      const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
      url.searchParams.set('limit', '250');
      Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
      if (cursor) url.searchParams.set('cursor', cursor);
      const response = await this.fetchJson(url.toString(), { headers });
      rows.push(...this.collection(response, path.slice(1)));
      cursor = text(object(response).cursor);
      if (!cursor || seen.has(cursor)) break;
      seen.add(cursor);
    } while (true);
    return rows;
  }

  private async zettle(
    clientId: string | null,
    apiKey: string,
    purchaseBaseUrl: string,
    from: Date,
    to: Date,
  ) {
    const accessToken = await this.zettleAccessToken(clientId, apiKey);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [productsResponse, categoriesResponse] = await Promise.all([
      this.fetchJson('https://products.izettle.com/organizations/self/products/v2', {
        headers,
      }).catch(() => ({})),
      this.fetchJson('https://products.izettle.com/organizations/self/categories/v2', {
        headers,
      }).catch(() => ({})),
    ]);
    const categories = new Map<string, string>();
    for (const value of this.collection(categoriesResponse, 'categories')) {
      const category = object(value);
      categories.set(text(category.uuid) || text(category.id), text(category.name));
    }
    const catalog = new Map<string, { name: string; category?: string }>();
    for (const value of this.collection(productsResponse, 'products')) {
      const product = object(value);
      const productId = text(product.uuid) || text(product.id);
      const details = {
        name: text(product.name),
        category: categories.get(text(product.categoryUuid) || text(product.category_id)),
      };
      if (productId) catalog.set(productId, details);
      for (const rawVariant of array(product.variants)) {
        const variant = object(rawVariant);
        const variantId = text(variant.uuid) || text(variant.id);
        if (variantId) catalog.set(variantId, details);
      }
    }
    const purchases: unknown[] = [];
    let lastPurchaseHash = '';
    const seen = new Set<string>();
    do {
      const url = new URL(`${purchaseBaseUrl.replace(/\/$/, '')}/purchases/v2`);
      url.searchParams.set('startDate', from.toISOString());
      url.searchParams.set('endDate', to.toISOString());
      url.searchParams.set('limit', '1000');
      if (lastPurchaseHash) url.searchParams.set('lastPurchaseHash', lastPurchaseHash);
      const response = await this.fetchJson(url.toString(), { headers });
      purchases.push(...this.collection(response, 'purchases'));
      lastPurchaseHash = text(object(response).lastPurchaseHash);
      if (!lastPurchaseHash || seen.has(lastPurchaseHash)) break;
      seen.add(lastPurchaseHash);
    } while (true);
    return normalizeZettlePurchases(purchases, catalog);
  }

  private async zettleAccessToken(clientId: string | null, apiKey: string) {
    if (!clientId) throw new BadRequestException('Le Client ID PayPal POS/Zettle est manquant.');
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: clientId,
      assertion: apiKey,
    });
    const response = await this.fetchJson('https://oauth.zettle.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const token = text(object(response).access_token);
    if (!token)
      throw new ServiceUnavailableException('PayPal POS/Zettle n’a pas fourni de jeton d’accès.');
    return token;
  }

  private async persist(
    organizationId: string,
    provider: PosApiProvider,
    siteId: string,
    locations: NormalizedPosLocation[],
  ) {
    let transactions = 0;
    let productRows = 0;
    let rowsWritten = 0;
    const sourceIds: string[] = [];
    for (const location of locations) {
      const source = await this.sourceForLocation(organizationId, provider, siteId, location);
      sourceIds.push(source.id);
      const rows = location.rows;
      transactions += rows.reduce((sum, row) => sum + row.transactionCount, 0);
      productRows += rows.filter((row) => !row.isRevenueRecord).length;
      for (const group of chunks(rows, 150)) {
        await this.prisma.$transaction(
          group.map((row) =>
            this.prisma.financeDailySales.upsert({
              where: {
                organizationId_sourceId_externalKey: {
                  organizationId,
                  sourceId: source.id,
                  externalKey: row.externalKey,
                },
              },
              update: { importBatchId: null, ...this.saleData(row) },
              create: {
                organizationId,
                sourceId: source.id,
                externalKey: row.externalKey,
                ...this.saleData(row),
              },
            }),
          ),
        );
        rowsWritten += group.length;
      }
      const dates = rows.map((row) => row.saleDate.getTime());
      if (dates.length) {
        await this.prisma.financeDataSource.update({
          where: { id: source.id },
          data: {
            status: FinanceSourceStatus.READY,
            lastSyncedAt: new Date(),
            coverageStart: new Date(
              Math.min(...dates, source.coverageStart?.getTime() ?? Infinity),
            ),
            coverageEnd: new Date(Math.max(...dates, source.coverageEnd?.getTime() ?? -Infinity)),
          },
        });
      }
    }
    return {
      locations: locations.length,
      sources: sourceIds,
      transactions,
      productRows,
      rowsWritten,
    };
  }

  private saleData(row: NormalizedPosRow) {
    return {
      saleDate: row.saleDate,
      grossAmount: new Prisma.Decimal(row.grossAmount),
      netAmount: new Prisma.Decimal(row.netAmount),
      vatAmount: new Prisma.Decimal(row.vatAmount),
      refundAmount: new Prisma.Decimal(row.refundAmount),
      costAmount: row.costAmount == null ? null : new Prisma.Decimal(row.costAmount),
      transactionCount: row.transactionCount,
      paymentMethod: row.paymentMethod ?? null,
      productCategory: row.productCategory ?? null,
      isRevenueRecord: row.isRevenueRecord,
      metadata: row.metadata as Prisma.InputJsonValue,
    };
  }

  private async sourceForLocation(
    organizationId: string,
    provider: PosApiProvider,
    siteId: string,
    location: NormalizedPosLocation,
  ) {
    const baseName = provider === FinanceProvider.LOYVERSE ? 'Loyverse' : 'PayPal POS';
    const locationLabel = location.name.replace(/^Loyverse · |^PayPal POS · /, '').trim();
    const preferredName =
      locationLabel && locationLabel !== baseName ? `${baseName} · ${locationLabel}` : baseName;
    const exact = await this.prisma.financeDataSource.findFirst({
      where: {
        organizationId,
        provider,
        siteId,
        externalLocationId: location.externalLocationId,
      },
    });
    if (exact) {
      const canRename =
        exact.name === baseName &&
        preferredName !== baseName &&
        !(await this.prisma.financeDataSource.findFirst({
          where: { organizationId, provider, name: preferredName, id: { not: exact.id } },
          select: { id: true },
        }));
      return this.prisma.financeDataSource.update({
        where: { id: exact.id },
        data: {
          ...(canRename ? { name: preferredName } : {}),
          sourceType: FinanceSourceType.POS_API,
          status: FinanceSourceStatus.READY,
          isPrimarySales: true,
        },
      });
    }
    const placeholder = await this.prisma.financeDataSource.findFirst({
      where: { organizationId, provider, siteId, externalLocationId: null },
      orderBy: { createdAt: 'asc' },
    });
    if (placeholder) {
      const nameCollision = await this.prisma.financeDataSource.findFirst({
        where: { organizationId, provider, name: preferredName, id: { not: placeholder.id } },
        select: { id: true },
      });
      return this.prisma.financeDataSource.update({
        where: { id: placeholder.id },
        data: {
          ...(!nameCollision ? { name: preferredName } : {}),
          siteId,
          externalLocationId: location.externalLocationId,
          sourceType: FinanceSourceType.POS_API,
          status: FinanceSourceStatus.READY,
          isPrimarySales: true,
        },
      });
    }
    let name = preferredName;
    const collision = await this.prisma.financeDataSource.findUnique({
      where: { organizationId_provider_name: { organizationId, provider, name } },
    });
    if (collision) name = `${name} · ${location.externalLocationId.slice(0, 8)}`;
    return this.prisma.financeDataSource.create({
      data: {
        organizationId,
        siteId,
        provider,
        name,
        externalLocationId: location.externalLocationId,
        sourceType: FinanceSourceType.POS_API,
        status: FinanceSourceStatus.READY,
        isPrimarySales: true,
      },
    });
  }

  private collection(response: unknown, key: string) {
    if (Array.isArray(response)) return response;
    const value = object(response)[key];
    if (Array.isArray(value)) return value;
    const plural = object(response)[`${key}s`];
    return Array.isArray(plural) ? plural : [];
  }

  private async fetchJson(url: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const raw = await response.text();
      let payload: unknown = {};
      if (raw) {
        try {
          payload = JSON.parse(raw) as unknown;
        } catch {
          if (response.ok) {
            throw new ServiceUnavailableException(
              'Le service POS a renvoyé une réponse illisible.',
            );
          }
        }
      }
      if (!response.ok) {
        const details = object(payload);
        const message =
          text(details.message) ||
          text(details.error_description) ||
          text(details.error) ||
          response.statusText;
        throw new ServiceUnavailableException(
          `Le service POS a répondu ${response.status}${message ? ` : ${message}` : ''}.`,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof SyntaxError) {
        throw new ServiceUnavailableException('Le service POS a renvoyé une réponse illisible.');
      }
      throw new ServiceUnavailableException(
        error instanceof Error && error.name === 'AbortError'
          ? 'Le service POS ne répond pas dans le délai prévu.'
          : `Connexion au service POS impossible : ${errorMessage(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async runScheduled() {
    const connections = await this.prisma.financePosConnection.findMany().catch((error) => {
      this.logger.warn(`Planification POS indisponible : ${errorMessage(error)}`);
      return [];
    });
    const now = new Date();
    for (const connection of connections) {
      const settings = await this.prisma.financeSettings.findUnique({
        where: { organizationId: connection.organizationId },
        select: { timezone: true },
      });
      const time = new Intl.DateTimeFormat('fr-FR', {
        timeZone: settings?.timezone || 'Europe/Helsinki',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(now);
      if (!connection.schedule.includes(time)) continue;
      if (connection.lastSyncedAt && now.getTime() - connection.lastSyncedAt.getTime() < 55_000)
        continue;
      void this.syncInternal(connection.organizationId, connection.provider as PosApiProvider, {
        siteId: connection.defaultSiteId,
      }).catch((error) =>
        this.logger.error(`Synchronisation ${connection.provider} : ${errorMessage(error)}`),
      );
    }
  }
}

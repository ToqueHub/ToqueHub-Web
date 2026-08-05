import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  ProductionAlertSeverity,
  ProductionDestockingStatus,
  ProductionOrderStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  deduplicateCrossSourceSales,
  resolveContributingSalesSourceIds,
} from '../finance/finance-sales-dedupe';
import { DashboardExternalService } from './dashboard-external.service';

type Zone = 'kpi' | 'activity' | 'analytics' | 'alerts';
type WidgetSize = 'sm' | 'md' | 'lg' | 'xl';
type AppId =
  | 'core'
  | 'stocks'
  | 'rnm-prices'
  | 'hr'
  | 'planning'
  | 'technical-sheets'
  | 'production'
  | 'menus'
  | 'haccp'
  | 'purchasing'
  | 'quality'
  | 'finance';

type RegistryWidget = {
  id: string;
  appId: AppId;
  moduleLabel: string;
  title: string;
  description: string;
  zone: Zone;
  defaultOrder: number;
  size: WidgetSize;
  requiredPermission?: string;
  comingSoon?: boolean;
  coreDefault?: boolean;
};

type Widget = RegistryWidget & {
  pinned: boolean;
  hidden: boolean;
  available: boolean;
  status: 'ready' | 'empty' | 'coming_soon';
  data: unknown;
  emptyState?: { title: string; description: string; actionLabel?: string; actionHref?: string };
};

type DashboardPreferences = {
  layout: Record<Zone, string[]>;
  hiddenWidgetIds: string[];
  pinnedWidgetIds: string[];
  autoHideSidebar: boolean;
};

type OrganizationInstallState = {
  name: string;
  mainSiteName: string | null;
  primarySiteId: string | null;
  stocksInstalledAt: Date | null;
  rnmPricesInstalledAt: Date | null;
  hrInstalledAt: Date | null;
  planningInstalledAt: Date | null;
  technicalSheetsInstalledAt: Date | null;
  productionInstalledAt: Date | null;
  menusInstalledAt: Date | null;
  haccpInstalledAt: Date | null;
  purchasingInstalledAt: Date | null;
  financeInstalledAt: Date | null;
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const ZONES: Zone[] = ['kpi', 'activity', 'analytics', 'alerts'];
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'Administrateur']);

const APP_PERMISSIONS: Partial<Record<AppId, string>> = {
  stocks: 'stocks.read',
  'rnm-prices': 'rnm-prices.read',
  hr: 'hr.read',
  planning: 'planning.read',
  'technical-sheets': 'technical-sheets.read',
  production: 'production.read',
  menus: 'menus.read',
  haccp: 'haccp.read',
  purchasing: 'purchasing.read',
  finance: 'finance.read',
};

const INSTALL_FIELDS: Partial<Record<AppId, keyof OrganizationInstallState>> = {
  stocks: 'stocksInstalledAt',
  'rnm-prices': 'rnmPricesInstalledAt',
  hr: 'hrInstalledAt',
  planning: 'planningInstalledAt',
  'technical-sheets': 'technicalSheetsInstalledAt',
  production: 'productionInstalledAt',
  menus: 'menusInstalledAt',
  haccp: 'haccpInstalledAt',
  purchasing: 'purchasingInstalledAt',
  finance: 'financeInstalledAt',
};

const REGISTRY: RegistryWidget[] = [
  {
    id: 'core.welcome',
    appId: 'core',
    moduleLabel: 'Core',
    title: 'Bienvenue',
    description: 'Synthèse ToqueHub et raccourcis principaux.',
    zone: 'activity',
    defaultOrder: 10,
    size: 'lg',
    coreDefault: true,
  },
  {
    id: 'core.installed-apps',
    appId: 'core',
    moduleLabel: 'Core',
    title: 'Applications installées',
    description: 'État des modules activés pour votre établissement.',
    zone: 'kpi',
    defaultOrder: 10,
    size: 'md',
    coreDefault: true,
  },
  {
    id: 'core.recent-activity',
    appId: 'core',
    moduleLabel: 'Core',
    title: 'Activité récente',
    description: 'Dernières actions tracées.',
    zone: 'activity',
    defaultOrder: 20,
    size: 'lg',
    coreDefault: true,
  },
  {
    id: 'core.users',
    appId: 'core',
    moduleLabel: 'Core',
    title: 'Utilisateurs',
    description: 'Comptes actifs et invités.',
    zone: 'kpi',
    defaultOrder: 20,
    size: 'md',
    coreDefault: true,
  },

  {
    id: 'stocks.stock-value',
    appId: 'stocks',
    moduleLabel: 'Stocks',
    title: 'Valeur de stock',
    description: 'Valorisation estimée des produits stockés.',
    zone: 'kpi',
    defaultOrder: 30,
    size: 'md',
  },
  {
    id: 'stocks.low-stock-alerts',
    appId: 'stocks',
    moduleLabel: 'Stocks',
    title: 'Alertes stock',
    description: 'Produits sous seuil ou stock négatif.',
    zone: 'alerts',
    defaultOrder: 10,
    size: 'lg',
  },
  {
    id: 'stocks.latest-movements',
    appId: 'stocks',
    moduleLabel: 'Stocks',
    title: 'Derniers mouvements',
    description: 'Entrées, sorties et corrections récentes.',
    zone: 'activity',
    defaultOrder: 30,
    size: 'lg',
  },
  {
    id: 'stocks.top-consumed',
    appId: 'stocks',
    moduleLabel: 'Stocks',
    title: 'Produits les plus consommés',
    description: 'Consommations cumulées par produit.',
    zone: 'analytics',
    defaultOrder: 10,
    size: 'lg',
  },

  {
    id: 'rnm-prices.market-watch',
    appId: 'rnm-prices',
    moduleLabel: 'Cours des produits',
    title: 'Veille RNM',
    description: 'Favoris et cours disponibles.',
    zone: 'analytics',
    defaultOrder: 20,
    size: 'md',
  },

  {
    id: 'hr.headcount',
    appId: 'hr',
    moduleLabel: 'RH',
    title: 'Effectif',
    description: 'Collaborateurs actifs et rattachements.',
    zone: 'kpi',
    defaultOrder: 40,
    size: 'md',
  },
  {
    id: 'hr.latest-employees',
    appId: 'hr',
    moduleLabel: 'RH',
    title: 'Collaborateurs récents',
    description: 'Derniers collaborateurs ajoutés.',
    zone: 'activity',
    defaultOrder: 40,
    size: 'lg',
  },

  {
    id: 'planning.today',
    appId: 'planning',
    moduleLabel: 'Planning',
    title: 'Planning du jour',
    description: 'Présences, absences et services couverts.',
    zone: 'kpi',
    defaultOrder: 50,
    size: 'lg',
  },
  {
    id: 'planning.alerts',
    appId: 'planning',
    moduleLabel: 'Planning',
    title: 'Alertes planning',
    description: 'Conflits et besoins de remplacement.',
    zone: 'alerts',
    defaultOrder: 20,
    size: 'lg',
  },
  {
    id: 'planning.coverage',
    appId: 'planning',
    moduleLabel: 'Planning',
    title: 'Couverture opérationnelle',
    description: 'Services sous-staffés ou non planifiés.',
    zone: 'analytics',
    defaultOrder: 40,
    size: 'lg',
  },

  {
    id: 'technical-sheets.recipes',
    appId: 'technical-sheets',
    moduleLabel: 'Fiches techniques',
    title: 'Fiches techniques',
    description: 'Recettes, catégories et coût moyen.',
    zone: 'kpi',
    defaultOrder: 60,
    size: 'lg',
  },
  {
    id: 'technical-sheets.latest',
    appId: 'technical-sheets',
    moduleLabel: 'Fiches techniques',
    title: 'Fiches modifiées',
    description: 'Dernières fiches mises à jour.',
    zone: 'activity',
    defaultOrder: 50,
    size: 'lg',
  },
  {
    id: 'technical-sheets.top-products',
    appId: 'technical-sheets',
    moduleLabel: 'Fiches techniques',
    title: 'Produits utilisés',
    description: 'Ingrédients les plus utilisés.',
    zone: 'analytics',
    defaultOrder: 50,
    size: 'lg',
  },

  {
    id: 'production.today',
    appId: 'production',
    moduleLabel: 'Production',
    title: 'Production du jour',
    description: 'Ordres planifiés, en cours et terminés.',
    zone: 'kpi',
    defaultOrder: 70,
    size: 'lg',
  },
  {
    id: 'production.alerts',
    appId: 'production',
    moduleLabel: 'Production',
    title: 'Alertes production',
    description: 'Alertes critiques et avertissements actifs.',
    zone: 'alerts',
    defaultOrder: 30,
    size: 'lg',
  },
  {
    id: 'production.destocking',
    appId: 'production',
    moduleLabel: 'Production',
    title: 'Déstockage production',
    description: 'Propositions de déstockage à confirmer.',
    zone: 'activity',
    defaultOrder: 60,
    size: 'md',
  },

  {
    id: 'menus.week',
    appId: 'menus',
    moduleLabel: 'Menus',
    title: 'Menus de la semaine',
    description: 'Menus publiés et à valider.',
    zone: 'analytics',
    defaultOrder: 60,
    size: 'lg',
  },
  {
    id: 'menus.today',
    appId: 'menus',
    moduleLabel: 'Menus',
    title: 'Menus du jour',
    description: 'Services menus prévus aujourd’hui.',
    zone: 'activity',
    defaultOrder: 70,
    size: 'lg',
  },

  {
    id: 'haccp.score',
    appId: 'haccp',
    moduleLabel: 'HACCP',
    title: 'Score HACCP',
    description: 'Conformité du jour sur les contrôles sanitaires.',
    zone: 'kpi',
    defaultOrder: 80,
    size: 'md',
  },
  {
    id: 'haccp.alerts',
    appId: 'haccp',
    moduleLabel: 'HACCP',
    title: 'Alertes HACCP',
    description: 'Contrôles manquants et anomalies à traiter.',
    zone: 'alerts',
    defaultOrder: 40,
    size: 'lg',
  },
  {
    id: 'haccp.today',
    appId: 'haccp',
    moduleLabel: 'HACCP',
    title: 'Contrôles du jour',
    description: 'Activité HACCP enregistrée aujourd’hui.',
    zone: 'activity',
    defaultOrder: 80,
    size: 'lg',
  },

  {
    id: 'purchasing.orders',
    appId: 'purchasing',
    moduleLabel: 'Achats',
    title: 'Commandes fournisseurs',
    description: 'Brouillons, commandes ouvertes et réceptions à traiter.',
    zone: 'analytics',
    defaultOrder: 70,
    size: 'lg',
  },
  {
    id: 'quality.coming-soon',
    appId: 'quality',
    moduleLabel: 'Qualité',
    title: 'Qualité',
    description: 'PMS, contrôles et non-conformités.',
    zone: 'alerts',
    defaultOrder: 900,
    size: 'md',
    comingSoon: true,
  },
  {
    id: 'finance.data-quality',
    appId: 'finance',
    moduleLabel: 'Finance',
    title: 'Pilotage financier',
    description: 'État des sources, imports à contrôler et couverture des données.',
    zone: 'kpi',
    defaultOrder: 90,
    size: 'md',
  },
];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly external: DashboardExternalService,
  ) {}

  async getDashboard(userId: string, organizationId: string) {
    const context = await this.getContext(userId, organizationId);
    const preferences = await this.getOrCreatePreferences(userId, organizationId);
    const visibleRegistry = REGISTRY.filter((widget) => this.canSeeWidget(widget, context));
    const widgets = await Promise.all(
      visibleRegistry.map((widget) =>
        this.hydrateWidget(widget, organizationId, context, preferences),
      ),
    );
    return {
      ...this.serializeDashboard(widgets, preferences, context),
      cockpit: await this.cockpit(organizationId, context, preferences),
    };
  }

  private async cockpit(
    organizationId: string,
    context: Awaited<ReturnType<DashboardService['getContext']>>,
    preferences: DashboardPreferences,
  ) {
    const has = (appId: AppId) =>
      appId === 'core' ||
      this.canSeeWidget(
        {
          id: `cockpit.${appId}`,
          appId,
          moduleLabel: appId,
          title: appId,
          description: '',
          zone: 'kpi',
          defaultOrder: 0,
          size: 'md',
        },
        context,
      );
    const primarySite = context.organization.primarySiteId
      ? await this.prisma.site.findFirst({
          where: { id: context.organization.primarySiteId, organizationId, isArchived: false },
        })
      : await this.prisma.site.findFirst({
          where: { organizationId, isArchived: false },
          orderBy: { createdAt: 'asc' },
        });
    const external = await this.external.get(
      primarySite?.address,
      primarySite?.name ?? context.organization.mainSiteName,
    );
    const [
      stockValue,
      stockAlerts,
      movements,
      consumed,
      headcount,
      employees,
      planning,
      planningAlerts,
      coverage,
      recipes,
      latestRecipes,
      topProducts,
      haccp,
      haccpAlerts,
      haccpToday,
      todayRevenues,
    ] = await Promise.all([
      has('stocks') ? this.stockValue(organizationId) : null,
      has('stocks') ? this.stockAlerts(organizationId) : null,
      has('stocks') ? this.latestMovements(organizationId) : null,
      has('stocks') ? this.topConsumed(organizationId) : null,
      has('hr') ? this.hrHeadcount(organizationId) : null,
      has('hr') ? this.latestEmployees(organizationId) : null,
      has('planning') ? this.planningToday(organizationId) : null,
      has('planning') ? this.planningAlerts(organizationId) : null,
      has('planning') ? this.planningCoverage(organizationId) : null,
      has('technical-sheets') ? this.recipeStats(organizationId) : null,
      has('technical-sheets') ? this.latestRecipes(organizationId) : null,
      has('technical-sheets') ? this.recipeTopProducts(organizationId) : null,
      has('haccp') ? this.haccpScore(organizationId) : null,
      has('haccp') ? this.haccpAlerts(organizationId) : null,
      has('haccp') ? this.haccpToday(organizationId) : null,
      has('finance') ? this.financeTodayRevenues(organizationId) : null,
    ]);
    const card = (
      id: string,
      module: string,
      title: string,
      value: string | number,
      description: string,
      href: string,
      tone = 'emerald',
      items?: any[],
      progress?: number,
      critical = false,
    ) => ({ id, module, title, value, description, href, tone, items, progress, critical });
    const urgent = [
      ...(stockAlerts?.alerts ?? []).map((a: any) =>
        card(
          `stock-alert-${a.productId}`,
          'stocks',
          a.productName,
          `${a.quantity} ${a.unit}`,
          a.severity === 'critical'
            ? 'Stock négatif — action immédiate'
            : `Seuil minimum : ${a.minimumStock}`,
          '/stocks',
          a.severity === 'critical' ? 'rose' : 'amber',
          undefined,
          undefined,
          true,
        ),
      ),
      ...(planningAlerts?.alerts ?? []).map((a: any) =>
        card(
          `planning-alert-${a.id}`,
          'planning',
          'Conflit planning',
          a.level === 'critical' ? 'Critique' : 'À traiter',
          a.message ?? a.title ?? 'Conflit non résolu',
          '/planning',
          a.level === 'critical' ? 'rose' : 'amber',
          undefined,
          undefined,
          true,
        ),
      ),
      ...(haccpAlerts?.alerts ?? []).map((a: any, index: number) =>
        card(
          `haccp-alert-${index}`,
          'haccp',
          'HACCP',
          a.level === 'critical' ? 'Critique' : 'À traiter',
          a.message,
          '/haccp',
          a.level === 'critical' ? 'rose' : 'amber',
          undefined,
          undefined,
          true,
        ),
      ),
    ];
    const formatRevenueCard = (
      revenue: NonNullable<typeof todayRevenues>['sites'][number],
      id: string,
      title: string,
    ) => ({
      ...card(
        id,
        'finance',
        title,
        revenue.grossAmount == null
          ? '—'
          : new Intl.NumberFormat('fr-FR', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            }).format(revenue.grossAmount),
        revenue.grossAmount == null
          ? `${revenue.providerLabel} · en attente des ventes du jour`
          : `TTC · ${revenue.transactions} ticket(s) · ${revenue.providerLabel} · màj ${revenue.updatedAtLabel}`,
        '/finance/daily',
        'blue',
      ),
      trend: revenue.trend,
    });
    const financeRevenueCards = todayRevenues
      ? [
          ...(todayRevenues.total
            ? [
                formatRevenueCard(
                  todayRevenues.total,
                  'finance.today-revenue',
                  'CA du jour · Tous les sites',
                ),
              ]
            : []),
          ...todayRevenues.sites.map((revenue) =>
            formatRevenueCard(
              revenue,
              todayRevenues.sites.length === 1
                ? 'finance.today-revenue'
                : `finance.today-revenue.site.${revenue.siteId}`,
              `CA du jour · ${revenue.siteName}`,
            ),
          ),
        ]
      : [];
    const overview = [
      ...financeRevenueCards,
      ...(haccp
        ? [
            card(
              'haccp.score',
              'haccp',
              'Conformité HACCP',
              `${haccp.score}%`,
              `Grade ${haccp.grade} · ${haccpToday?.total ?? 0} contrôles aujourd’hui`,
              '/haccp',
              haccp.score < 75 ? 'rose' : haccp.score < 90 ? 'amber' : 'emerald',
              undefined,
              haccp.score,
            ),
          ]
        : []),
      ...(planning
        ? [
            card(
              'planning.today',
              'planning',
              'Équipe aujourd’hui',
              planning.presentToday,
              `${planning.absentToday} absent(s) · ${planning.replacementsNeeded} remplacement(s)`,
              '/planning',
              'blue',
            ),
          ]
        : []),
      ...(headcount
        ? [
            card(
              'hr.headcount',
              'hr',
              'Effectif actif',
              headcount.employees,
              `${headcount.departments} service(s) · ${headcount.linked} compte(s) lié(s)`,
              '/hr',
              'violet',
            ),
          ]
        : []),
      ...(stockValue
        ? [
            card(
              'stocks.stock-value',
              'stocks',
              'Valeur de stock',
              `${stockValue.value.toFixed(0)} €`,
              `${stockValue.products} produits · ${stockValue.suppliers} fournisseurs`,
              '/stocks',
              'emerald',
            ),
          ]
        : []),
      ...(recipes
        ? [
            card(
              'technical-sheets.recipes',
              'technical-sheets',
              'Fiches techniques',
              recipes.recipeCount,
              `${recipes.categoryCount} catégories · coût moyen ${recipes.averageMaterialCost.toFixed(2)} €`,
              '/technical-sheets',
              'orange',
            ),
          ]
        : []),
    ];
    const activity = [
      ...(movements
        ? [
            card(
              'stocks.latest-movements',
              'stocks',
              'Derniers mouvements',
              movements.length,
              'Flux stock récents',
              '/stocks',
              'emerald',
              movements.map((m: any) => ({
                title: m.product?.name ?? 'Produit',
                detail: `${m.type} · ${Math.abs(Number(m.quantity))} ${m.unit?.symbol ?? ''}`,
              })),
            ),
          ]
        : []),
      ...(employees
        ? [
            card(
              'hr.latest-employees',
              'hr',
              'Collaborateurs récents',
              employees.length,
              'Derniers profils ajoutés',
              '/hr',
              'violet',
              employees.map((e: any) => ({
                title: [e.firstName, e.lastName].filter(Boolean).join(' '),
                detail: e.department?.name ?? 'Sans service',
              })),
            ),
          ]
        : []),
      ...(latestRecipes
        ? [
            card(
              'technical-sheets.latest',
              'technical-sheets',
              'Fiches modifiées',
              latestRecipes.length,
              'Dernières modifications',
              '/technical-sheets',
              'orange',
              latestRecipes.map((r: any) => ({
                title: r.name,
                detail: r.category?.name ?? 'Sans catégorie',
              })),
            ),
          ]
        : []),
    ];
    const insights = [
      ...(coverage
        ? [
            card(
              'planning.coverage',
              'planning',
              'Couverture services',
              `${coverage.coveredDepartments}/${coverage.totalDepartments}`,
              coverage.uncoveredDepartments.length
                ? `À couvrir : ${coverage.uncoveredDepartments.join(', ')}`
                : 'Tous les services sont couverts',
              '/planning',
              coverage.uncoveredDepartments.length ? 'amber' : 'blue',
              undefined,
              coverage.totalDepartments
                ? Math.round((coverage.coveredDepartments / coverage.totalDepartments) * 100)
                : 100,
            ),
          ]
        : []),
      ...(consumed
        ? [
            card(
              'stocks.top-consumed',
              'stocks',
              'Produits consommés',
              consumed.items.length,
              'Principaux produits sortis du stock',
              '/stocks',
              'emerald',
              consumed.items.map((i: any) => ({
                title: i.product?.name ?? 'Produit',
                detail: `${i.quantity} ${i.product?.unit?.symbol ?? ''}`,
              })),
            ),
          ]
        : []),
      ...(topProducts
        ? [
            card(
              'technical-sheets.top-products',
              'technical-sheets',
              'Ingrédients clés',
              topProducts.items.length,
              'Les plus utilisés dans les fiches',
              '/technical-sheets',
              'orange',
              topProducts.items.map((i: any) => ({
                title: i.product?.name ?? 'Produit',
                detail: `${i.count} fiche(s)`,
              })),
            ),
          ]
        : []),
    ];
    const hidden = new Set(preferences.hiddenWidgetIds);
    const visible = (cards: any[], force = false) =>
      cards.filter(
        (item) =>
          force ||
          (!hidden.has(item.id) &&
            !(
              item.id.startsWith('finance.today-revenue.site.') &&
              hidden.has('finance.today-revenue')
            )),
      );
    return {
      version: 2,
      generatedAt: new Date().toISOString(),
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      organizationName: context.organization.name,
      primarySite: primarySite
        ? { id: primarySite.id, name: primarySite.name, address: primarySite.address }
        : null,
      weather: external.weather,
      urgent: visible(urgent, true),
      overview: visible(overview),
      activity: visible(activity),
      insights: visible(insights),
      news: { local: external.localNews, industry: external.industryNews },
    };
  }

  async updatePreferences(userId: string, organizationId: string, body: unknown) {
    if (
      body &&
      typeof body === 'object' &&
      'autoHideSidebar' in body &&
      (body as { autoHideSidebar?: unknown }).autoHideSidebar !== undefined &&
      typeof (body as { autoHideSidebar?: unknown }).autoHideSidebar !== 'boolean'
    ) {
      throw new BadRequestException('autoHideSidebar doit être un booléen');
    }
    const current = await this.getOrCreatePreferences(userId, organizationId);
    const next = this.normalizePreferences({
      ...current,
      ...((body as Partial<DashboardPreferences>) ?? {}),
    });
    await (this.prisma as any).dashboardPreference.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      update: {
        layout: next.layout as Prisma.InputJsonValue,
        hiddenWidgetIds: next.hiddenWidgetIds,
        pinnedWidgetIds: next.pinnedWidgetIds,
        autoHideSidebar: next.autoHideSidebar,
      },
      create: {
        userId,
        organizationId,
        layout: next.layout as Prisma.InputJsonValue,
        hiddenWidgetIds: next.hiddenWidgetIds,
        pinnedWidgetIds: next.pinnedWidgetIds,
        autoHideSidebar: next.autoHideSidebar,
      },
    });
    return this.getDashboard(userId, organizationId);
  }

  async resetPreferences(userId: string, organizationId: string) {
    await (this.prisma as any).dashboardPreference.deleteMany({
      where: { userId, organizationId },
    });
    return this.getDashboard(userId, organizationId);
  }

  async addressSuggestions(query: string, country: string) {
    return this.external.addressSuggestions(query, country);
  }

  private async getContext(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        organization: true,
      },
    });
    if (!user) throw new BadRequestException('Utilisateur introuvable dans cette organisation');
    const permissions = new Set(user.role.permissions.map((rp) => rp.permission.key));
    return {
      user,
      organization: user.organization as OrganizationInstallState,
      permissions,
      isAdmin: ADMIN_ROLES.has(user.role.name),
    };
  }

  private async getOrCreatePreferences(
    userId: string,
    organizationId: string,
  ): Promise<DashboardPreferences> {
    const row = await (this.prisma as any).dashboardPreference.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!row) return this.defaultPreferences();
    return this.normalizePreferences({
      layout: row.layout,
      hiddenWidgetIds: row.hiddenWidgetIds,
      pinnedWidgetIds: row.pinnedWidgetIds,
      autoHideSidebar: row.autoHideSidebar,
    });
  }

  private serializeDashboard(
    widgets: Widget[],
    preferences: DashboardPreferences,
    context: Awaited<ReturnType<DashboardService['getContext']>>,
  ) {
    const zones = Object.fromEntries(
      ZONES.map((zone) => [
        zone,
        this.sortZone(
          widgets.filter((widget) => widget.zone === zone && !widget.hidden),
          preferences,
        ),
      ]),
    );
    return {
      generatedAt: new Date().toISOString(),
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      version: 1,
      zones,
      widgets,
      preferences,
      registry: REGISTRY,
      installedApplications: this.installedApplications(context.organization),
      permissions: [...context.permissions].sort(),
      constraints: {
        fixedZones: ZONES,
        freeDragAndDrop: false,
        v2Ready: true,
        customizationScope: 'user',
      },
    };
  }

  private canSeeWidget(
    widget: RegistryWidget,
    context: Awaited<ReturnType<DashboardService['getContext']>>,
  ) {
    if (widget.appId === 'core' || widget.comingSoon) return true;
    const field = INSTALL_FIELDS[widget.appId];
    if (!field || !context.organization?.[field]) return false;
    const permission = widget.requiredPermission ?? APP_PERMISSIONS[widget.appId];
    return !permission || context.isAdmin || context.permissions.has(permission);
  }

  private async hydrateWidget(
    widget: RegistryWidget,
    organizationId: string,
    context: Awaited<ReturnType<DashboardService['getContext']>>,
    preferences: DashboardPreferences,
  ): Promise<Widget> {
    const data = widget.comingSoon
      ? null
      : await this.widgetData(widget.id, organizationId, context);
    const empty = this.isEmpty(data);
    return {
      ...widget,
      pinned: preferences.pinnedWidgetIds.includes(widget.id),
      hidden: preferences.hiddenWidgetIds.includes(widget.id),
      available: !widget.comingSoon,
      status: widget.comingSoon ? 'coming_soon' : empty ? 'empty' : 'ready',
      data,
      emptyState: widget.comingSoon
        ? { title: 'À venir', description: 'Ce module sera disponible dans une prochaine version.' }
        : empty
          ? this.emptyState(widget)
          : undefined,
    };
  }

  private async widgetData(
    id: string,
    organizationId: string,
    context: Awaited<ReturnType<DashboardService['getContext']>>,
  ) {
    switch (id) {
      case 'core.welcome':
        return {
          organizationName: context.user.organization?.name,
          userName:
            [context.user.firstName, context.user.lastName].filter(Boolean).join(' ') ||
            context.user.email,
        };
      case 'core.installed-apps':
        return {
          installed: this.installedApplications(context.organization),
          totalAvailable: Object.keys(INSTALL_FIELDS).length,
        };
      case 'core.users':
        return this.coreUsers(organizationId);
      case 'core.recent-activity':
        return this.recentActivity(organizationId);
      case 'stocks.stock-value':
        return this.stockValue(organizationId);
      case 'stocks.low-stock-alerts':
        return this.stockAlerts(organizationId);
      case 'stocks.latest-movements':
        return this.latestMovements(organizationId);
      case 'stocks.top-consumed':
        return this.topConsumed(organizationId);
      case 'rnm-prices.market-watch':
        return this.rnmSummary(organizationId, context.user.id);
      case 'hr.headcount':
        return this.hrHeadcount(organizationId);
      case 'hr.latest-employees':
        return this.latestEmployees(organizationId);
      case 'planning.today':
        return this.planningToday(organizationId);
      case 'planning.alerts':
        return this.planningAlerts(organizationId);
      case 'planning.coverage':
        return this.planningCoverage(organizationId);
      case 'technical-sheets.recipes':
        return this.recipeStats(organizationId);
      case 'technical-sheets.latest':
        return this.latestRecipes(organizationId);
      case 'technical-sheets.top-products':
        return this.recipeTopProducts(organizationId);
      case 'production.today':
        return this.productionToday(organizationId);
      case 'production.alerts':
        return this.productionAlerts(organizationId);
      case 'production.destocking':
        return this.productionDestocking(organizationId);
      case 'menus.week':
        return this.menusWeek(organizationId);
      case 'menus.today':
        return this.menusToday(organizationId);
      case 'haccp.score':
        return this.haccpScore(organizationId);
      case 'haccp.alerts':
        return this.haccpAlerts(organizationId);
      case 'haccp.today':
        return this.haccpToday(organizationId);
      case 'purchasing.orders':
        return this.purchasingSummary(organizationId);
      case 'finance.data-quality':
        return this.financeSummary(organizationId);
      default:
        return null;
    }
  }

  private defaultPreferences(): DashboardPreferences {
    return this.normalizePreferences({
      layout: Object.fromEntries(
        ZONES.map((zone) => [
          zone,
          REGISTRY.filter((w) => w.zone === zone)
            .sort((a, b) => a.defaultOrder - b.defaultOrder)
            .map((w) => w.id),
        ]),
      ) as Record<Zone, string[]>,
      hiddenWidgetIds: [],
      pinnedWidgetIds: [],
    });
  }

  private normalizePreferences(input: Partial<DashboardPreferences>): DashboardPreferences {
    const ids = new Set(REGISTRY.map((w) => w.id));
    const layout = Object.fromEntries(
      ZONES.map((zone) => [
        zone,
        [...new Set((input.layout?.[zone] ?? []).filter((id) => ids.has(id)))],
      ]),
    ) as Record<Zone, string[]>;
    return {
      layout,
      hiddenWidgetIds: [...new Set(input.hiddenWidgetIds ?? [])].filter((id) => ids.has(id)),
      pinnedWidgetIds: [...new Set(input.pinnedWidgetIds ?? [])].filter((id) => ids.has(id)),
      autoHideSidebar: input.autoHideSidebar === true,
    };
  }

  private sortZone(widgets: Widget[], preferences: DashboardPreferences) {
    return [...widgets].sort((a, b) => {
      const pinned = Number(b.pinned) - Number(a.pinned);
      if (pinned) return pinned;
      const zoneOrder = preferences.layout[a.zone] ?? [];
      const ai = zoneOrder.includes(a.id) ? zoneOrder.indexOf(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = zoneOrder.includes(b.id) ? zoneOrder.indexOf(b.id) : Number.MAX_SAFE_INTEGER;
      return ai - bi || a.defaultOrder - b.defaultOrder || a.title.localeCompare(b.title);
    });
  }

  private installedApplications(org: OrganizationInstallState) {
    return (Object.entries(INSTALL_FIELDS) as [AppId, keyof OrganizationInstallState][])
      .filter(([, field]) => !!org?.[field])
      .map(([appId]) => appId);
  }

  private isEmpty(data: unknown) {
    if (data == null) return true;
    if (Array.isArray(data)) return data.length === 0;
    if (typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.items)) return obj.items.length === 0;
      if (Array.isArray(obj.alerts)) return obj.alerts.length === 0;
      if (Array.isArray(obj.rows)) return obj.rows.length === 0;
      return Object.values(obj).every(
        (value) => value === 0 || value == null || (Array.isArray(value) && value.length === 0),
      );
    }
    return false;
  }

  private emptyState(widget: RegistryWidget) {
    return {
      title: 'Aucune donnée',
      description: `Aucune donnée disponible pour ${widget.title}.`,
      actionLabel: `Ouvrir ${widget.moduleLabel}`,
      actionHref: widget.appId === 'core' ? '/' : `/${widget.appId}`,
    };
  }

  private async coreUsers(organizationId: string) {
    const [active, invited, disabled] = await Promise.all([
      this.prisma.user.count({
        where: { organizationId, status: UserStatus.ACTIVE, isActive: true },
      }),
      this.prisma.user.count({ where: { organizationId, status: UserStatus.INVITED } }),
      this.prisma.user.count({
        where: { organizationId, OR: [{ status: UserStatus.DISABLED }, { isActive: false }] },
      }),
    ]);
    return { active, invited, disabled };
  }

  private recentActivity(organizationId: string) {
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
  }

  private async purchasingSummary(organizationId: string) {
    const [drafts, open, receipts, month] = await Promise.all([
      this.prisma.purchaseOrder.count({ where: { organizationId, status: 'DRAFT' } }),
      this.prisma.purchaseOrder.count({
        where: { organizationId, status: { in: ['SENT', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'] } },
      }),
      this.prisma.purchaseReceipt.count({
        where: { organizationId, status: { in: ['DRAFT', 'REVIEW_NEEDED'] } },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: {
          organizationId,
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          status: { not: 'CANCELLED' },
        },
        _sum: { totalIncludingTax: true },
      }),
    ]);
    return {
      drafts,
      open,
      receiptsToReview: receipts,
      monthlyAmount: Number(month._sum.totalIncludingTax ?? 0),
    };
  }

  private async financeSummary(organizationId: string) {
    const [sources, readySources, pendingImports, latestImport] = await Promise.all([
      this.prisma.financeDataSource.count({ where: { organizationId } }),
      this.prisma.financeDataSource.count({ where: { organizationId, status: 'READY' } }),
      this.prisma.financeImportBatch.count({ where: { organizationId, status: 'NEEDS_REVIEW' } }),
      this.prisma.financeImportBatch.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: { fileName: true, createdAt: true, status: true },
      }),
    ]);
    return { sources, readySources, pendingImports, latestImport };
  }

  private async financeTodayRevenues(organizationId: string) {
    const [sites, sources] = await Promise.all([
      this.prisma.site.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.financeDataSource.findMany({
        where: {
          organizationId,
          sourceType: { not: 'ACCOUNTING_API' },
        },
        orderBy: [{ isPrimaryPos: 'desc' }, { lastSyncedAt: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          provider: true,
          name: true,
          siteId: true,
          isPrimaryPos: true,
          isPrimarySales: true,
          lastSyncedAt: true,
        },
      }),
    ]);
    const contributingSourceIds = resolveContributingSalesSourceIds(sources);
    const contributingSourceIdSet = new Set(contributingSourceIds);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const importedRows = contributingSourceIds.length
      ? await this.prisma.financeDailySales.findMany({
          where: {
            organizationId,
            sourceId: { in: contributingSourceIds },
            isRevenueRecord: true,
            saleDate: { gte: start, lt: end },
          },
          select: {
            sourceId: true,
            saleDate: true,
            grossAmount: true,
            transactionCount: true,
            paymentMethod: true,
            metadata: true,
            createdAt: true,
            source: {
              select: { provider: true, siteId: true, isPrimaryPos: true },
            },
          },
          orderBy: { saleDate: 'asc' },
        })
      : [];
    const rows = deduplicateCrossSourceSales(importedRows).rows;
    const contributingSources = sources.filter(({ id }) => contributingSourceIdSet.has(id));
    const hasUnassignedSource = contributingSources.some(({ siteId }) => !siteId);
    const displayedSites = [
      ...sites,
      ...(hasUnassignedSource ? [{ id: 'unassigned', name: 'Non attribué' }] : []),
    ];
    const checkpoints = [7, 15, 19, 23];
    const providerName = (provider: string, fallback: string) =>
      provider === 'FLATPAY'
        ? 'FlatPay'
        : provider === 'PAYPAL_POS'
          ? 'PayPal POS'
          : provider === 'LOYVERSE'
            ? 'Loyverse'
            : fallback;
    const formatTime = (value: Date | null) =>
      value
        ? new Intl.DateTimeFormat('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          }).format(value)
        : '—';
    const summaries = displayedSites.map((site) => {
      const siteId = site.id === 'unassigned' ? null : site.id;
      const siteSources = contributingSources.filter((source) => source.siteId === siteId);
      const siteRows = rows.filter((row) => row.source?.siteId === siteId);
      const grossAmount = siteRows.length
        ? siteRows.reduce((sum, row) => sum + Number(row.grossAmount), 0)
        : null;
      const transactions = siteRows.reduce((sum, row) => sum + row.transactionCount, 0);
      const trend = checkpoints.map((hour) =>
        siteRows
          .filter(({ saleDate }) => saleDate.getHours() < hour)
          .reduce((sum, row) => sum + Number(row.grossAmount), 0),
      );
      const providerLabel = [
        ...new Set(
          siteRows.length
            ? siteRows.map((row) =>
                providerName(row.source?.provider ?? '', row.source?.provider ?? 'Caisse'),
              )
            : siteSources.map(({ provider, name }) => providerName(provider, name)),
        ),
      ].join(' + ');
      const dataUpdatedAt = siteRows.reduce<Date | null>(
        (latest, row) => (!latest || row.createdAt > latest ? row.createdAt : latest),
        null,
      );
      const sourceUpdatedAt = siteSources.reduce<Date | null>(
        (latest, source) =>
          source.lastSyncedAt && (!latest || source.lastSyncedAt > latest)
            ? source.lastSyncedAt
            : latest,
        null,
      );
      return {
        siteId: site.id,
        siteName: site.name,
        grossAmount,
        transactions,
        trend,
        providerLabel: providerLabel || 'Aucune caisse active',
        updatedAtLabel: formatTime(dataUpdatedAt ?? sourceUpdatedAt),
        updatedAt: dataUpdatedAt ?? sourceUpdatedAt,
      };
    });
    const sitesWithRevenue = summaries.filter(({ grossAmount }) => grossAmount != null);
    const total =
      sitesWithRevenue.length > 1
        ? {
            siteId: 'all',
            siteName: 'Tous les sites',
            grossAmount: sitesWithRevenue.reduce((sum, site) => sum + (site.grossAmount ?? 0), 0),
            transactions: sitesWithRevenue.reduce((sum, site) => sum + site.transactions, 0),
            trend: checkpoints.map((_, index) =>
              sitesWithRevenue.reduce((sum, site) => sum + site.trend[index], 0),
            ),
            providerLabel: `${sitesWithRevenue.length} établissements`,
            updatedAtLabel: formatTime(
              sitesWithRevenue.reduce<Date | null>(
                (latest, site) =>
                  site.updatedAt && (!latest || site.updatedAt > latest) ? site.updatedAt : latest,
                null,
              ),
            ),
            updatedAt: sitesWithRevenue.reduce<Date | null>(
              (latest, site) =>
                site.updatedAt && (!latest || site.updatedAt > latest) ? site.updatedAt : latest,
              null,
            ),
          }
        : null;
    return summaries.length ? { sites: summaries, total } : null;
  }

  private async stockValue(organizationId: string) {
    const [products, suppliers, stockRows] = await Promise.all([
      this.prisma.product.count({ where: { organizationId, isArchived: false } }),
      this.prisma.supplier.count({ where: { organizationId, isArchived: false } }),
      this.prisma.stock.findMany({ where: { organizationId }, include: { product: true } }),
    ]);
    return {
      products,
      suppliers,
      value: stockRows.reduce(
        (sum, row) => sum + Number(row.quantity.mul(row.product.averagePrice)),
        0,
      ),
    };
  }

  private async stockAlerts(organizationId: string) {
    const rows = await this.prisma.stock.findMany({
      where: { organizationId },
      include: { product: { include: { unit: true } } },
      take: 200,
    });
    return {
      alerts: rows
        .filter((row) => row.quantity.lessThanOrEqualTo(row.product.minimumStock))
        .slice(0, 12)
        .map((row) => ({
          productId: row.productId,
          productName: row.product.name,
          quantity: Number(row.quantity),
          minimumStock: Number(row.product.minimumStock),
          unit: row.product.unit.symbol,
          severity: row.quantity.isNegative() ? 'critical' : 'warning',
        })),
    };
  }

  private latestMovements(organizationId: string) {
    return this.prisma.stockMovement.findMany({
      where: { organizationId },
      include: { product: true, unit: true },
      orderBy: { movementDate: 'desc' },
      take: 8,
    });
  }

  private async topConsumed(organizationId: string) {
    const consumed = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { organizationId, quantity: { lt: 0 } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'asc' } },
      take: 8,
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: consumed.map((row) => row.productId) } },
      include: { unit: true },
    });
    return {
      items: consumed.map((row) => ({
        product: products.find((product) => product.id === row.productId),
        quantity: Math.abs(Number(row._sum.quantity ?? 0)),
      })),
    };
  }

  private async rnmSummary(organizationId: string, userId: string) {
    const favoriteCount = await this.prisma.rnmProductFavorite.count({
      where: { organizationId, userId },
    });
    return {
      favoriteCount,
      message: favoriteCount ? 'Favoris RNM configurés' : 'Aucun favori RNM configuré',
    };
  }

  private async hrHeadcount(organizationId: string) {
    const [employees, departments, linked] = await Promise.all([
      this.prisma.hrEmployee.count({ where: { organizationId, isArchived: false } }),
      this.prisma.hrDepartment.count({ where: { organizationId, isArchived: false } }),
      this.prisma.hrEmployee.count({
        where: { organizationId, isArchived: false, userId: { not: null } },
      }),
    ]);
    return { employees, departments, linked };
  }

  private latestEmployees(organizationId: string) {
    return this.prisma.hrEmployee.findMany({
      where: { organizationId, isArchived: false },
      include: { department: true, position: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
  }

  private async planningToday(organizationId: string) {
    const { start, end } = this.todayRange();
    const [presentToday, absentToday, replacementsNeeded] = await Promise.all([
      this.prisma.planningAssignment.count({
        where: { organizationId, date: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
      }),
      this.prisma.hrAbsence.count({
        where: {
          organizationId,
          status: 'APPROVED',
          startDate: { lte: end },
          endDate: { gte: start },
        },
      }),
      this.prisma.planningReplacement.count({
        where: { organizationId, status: { in: ['TO_PROCESS', 'PROPOSED'] } },
      }),
    ]);
    return { presentToday, absentToday, replacementsNeeded };
  }

  private async planningAlerts(organizationId: string) {
    const conflicts = await this.prisma.planningConflict.findMany({
      where: { organizationId, resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    return {
      alerts: conflicts.map((conflict) => ({
        ...conflict,
        level: conflict.severity === 'BLOCKING' ? 'critical' : 'warning',
      })),
    };
  }

  private async planningCoverage(organizationId: string) {
    const { start, end } = this.todayRange();
    const [departments, assignments] = await Promise.all([
      this.prisma.hrDepartment.findMany({ where: { organizationId, isArchived: false } }),
      this.prisma.planningAssignment.findMany({
        where: { organizationId, date: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
        select: { departmentId: true },
      }),
    ]);
    const covered = new Set(assignments.map((assignment) => assignment.departmentId));
    return {
      coveredDepartments: departments.filter((department) => covered.has(department.id)).length,
      totalDepartments: departments.length,
      uncoveredDepartments: departments
        .filter((department) => !covered.has(department.id))
        .map((department) => department.name),
    };
  }

  private async recipeStats(organizationId: string) {
    const [recipeCount, categoryCount, sheets] = await Promise.all([
      this.prisma.technicalSheet.count({ where: { organizationId, isArchived: false } }),
      this.prisma.technicalSheetCategory.count({ where: { organizationId, isArchived: false } }),
      this.prisma.technicalSheet.findMany({
        where: { organizationId, isArchived: false },
        select: { totalCost: true },
      }),
    ]);
    return {
      recipeCount,
      categoryCount,
      averageMaterialCost: sheets.length
        ? sheets.reduce((sum, sheet) => sum + Number(sheet.totalCost), 0) / sheets.length
        : 0,
    };
  }

  private latestRecipes(organizationId: string) {
    return this.prisma.technicalSheet.findMany({
      where: { organizationId },
      include: { category: true },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    });
  }

  private async recipeTopProducts(organizationId: string) {
    const used = await this.prisma.technicalSheetIngredient.groupBy({
      by: ['productId'],
      where: { organizationId },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 8,
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: used.map((row) => row.productId) } },
      include: { unit: true },
    });
    return {
      items: used.map((row) => ({
        product: products.find((product) => product.id === row.productId),
        count: row._count.productId,
      })),
    };
  }

  private async productionToday(organizationId: string) {
    const { start, end } = this.todayRange();
    const orders = await this.prisma.productionOrder.findMany({
      where: { organizationId, productionDate: { gte: start, lt: end } },
      orderBy: { plannedTime: 'asc' },
      take: 20,
    });
    return {
      plannedToday: orders.length,
      inProgress: orders.filter((order) => order.status === ProductionOrderStatus.IN_PROGRESS)
        .length,
      completed: orders.filter((order) => order.status === ProductionOrderStatus.COMPLETED).length,
      plannedPortionsToday: orders.reduce((sum, order) => sum + Number(order.plannedPortions), 0),
      items: orders,
    };
  }

  private async productionAlerts(organizationId: string) {
    const alerts = await this.prisma.productionAlert.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    return {
      alerts: alerts.map((alert) => ({
        ...alert,
        level:
          alert.severity === ProductionAlertSeverity.CRITICAL
            ? 'critical'
            : alert.severity === ProductionAlertSeverity.WARNING
              ? 'warning'
              : 'info',
      })),
    };
  }

  private async productionDestocking(organizationId: string) {
    const [pending, latest] = await Promise.all([
      this.prisma.productionDestockingProposal.count({
        where: { organizationId, status: ProductionDestockingStatus.PROPOSED },
      }),
      this.prisma.productionDestockingProposal.findMany({
        where: { organizationId, status: ProductionDestockingStatus.PROPOSED },
        include: { order: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ]);
    return { pending, items: latest };
  }

  private async menusWeek(organizationId: string) {
    const { start, end } = this.weekRange();
    const [published, validated, draft] = await Promise.all([
      this.prisma.menu.count({
        where: { organizationId, date: { gte: start, lte: end }, status: 'PUBLISHED' },
      }),
      this.prisma.menu.count({
        where: { organizationId, date: { gte: start, lte: end }, status: 'VALIDATED' },
      }),
      this.prisma.menu.count({
        where: { organizationId, date: { gte: start, lte: end }, status: 'DRAFT' },
      }),
    ]);
    return { published, validated, draft };
  }

  private menusToday(organizationId: string) {
    const { start, end } = this.todayRange();
    return this.prisma.menu.findMany({
      where: { organizationId, date: { gte: start, lte: end } },
      include: { items: { include: { technicalSheet: true } }, site: true },
      orderBy: [{ service: 'asc' }, { date: 'asc' }],
      take: 8,
    });
  }

  private async haccpScore(organizationId: string) {
    const { start, end } = this.todayRange();
    const [temperatureEquipment, temperature, dueCleaning, cleaned, reports] = await Promise.all([
      this.prisma.haccpTemperatureEquipment.count({ where: { organizationId, isActive: true } }),
      this.prisma.haccpTemperatureReading.count({
        where: { organizationId, date: { gte: start, lte: end } },
      }),
      this.prisma.haccpCleaningSurface.count({
        where: { organizationId, isActive: true, zone: { isActive: true } },
      }),
      this.prisma.haccpCleanedSurface.count({
        where: { organizationId, cleanedAt: { gte: start, lte: end } },
      }),
      this.prisma.haccpDailyReport.count({
        where: { organizationId, reportDate: { gte: start, lte: end } },
      }),
    ]);
    const temperatureScore = temperatureEquipment
      ? Math.min(1, temperature / temperatureEquipment)
      : 1;
    const cleaningScore = dueCleaning ? Math.min(1, cleaned / dueCleaning) : 1;
    const reportScore = reports ? 1 : 0;
    const score = Math.round(
      (temperatureScore * 0.4 + cleaningScore * 0.4 + reportScore * 0.2) * 100,
    );
    return {
      score,
      grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D',
      temperature,
      temperatureEquipment,
      cleaned,
      dueCleaning,
      reportGenerated: reports > 0,
    };
  }

  private async haccpAlerts(organizationId: string) {
    const score = await this.haccpScore(organizationId);
    const alerts = [
      ...(score.temperature < score.temperatureEquipment
        ? [
            {
              level: 'critical',
              message: `${score.temperatureEquipment - score.temperature} relevé(s) température manquant(s).`,
            },
          ]
        : []),
      ...(score.cleaned < score.dueCleaning
        ? [
            {
              level: 'warning',
              message: `${score.dueCleaning - score.cleaned} surface(s) à nettoyer.`,
            },
          ]
        : []),
      ...(!score.reportGenerated
        ? [{ level: 'info', message: 'Rapport HACCP quotidien à générer.' }]
        : []),
    ];
    return { alerts };
  }

  private async haccpToday(organizationId: string) {
    const { start, end } = this.todayRange();
    const [temperature, traceability, receptions, cleaning, process, oil, production] =
      await Promise.all([
        this.prisma.haccpTemperatureReading.count({
          where: { organizationId, date: { gte: start, lte: end } },
        }),
        this.prisma.haccpTraceability.count({
          where: { organizationId, date: { gte: start, lte: end } },
        }),
        this.prisma.haccpReception.count({
          where: { organizationId, date: { gte: start, lte: end } },
        }),
        this.prisma.haccpCleaningSession.count({
          where: { organizationId, sessionDate: { gte: start, lte: end } },
        }),
        this.prisma.haccpProcessSession.count({
          where: { organizationId, sessionDate: { gte: start, lte: end } },
        }),
        this.prisma.haccpOilSession.count({
          where: { organizationId, sessionDate: { gte: start, lte: end } },
        }),
        this.prisma.haccpProductionSession.count({
          where: { organizationId, productionDate: { gte: start, lte: end } },
        }),
      ]);
    return {
      total: temperature + traceability + receptions + cleaning + process + oil + production,
      temperature,
      traceability,
      receptions,
      cleaning,
      process,
      oil,
      production,
    };
  }

  private todayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  private weekRange() {
    const start = new Date();
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
}

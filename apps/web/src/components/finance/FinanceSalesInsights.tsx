import { activeLocale } from '../../i18n/runtime';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  BarChart3,
  BrainCircuit,
  CalendarRange,
  ChevronDown,
  Clock3,
  LoaderCircle,
  PackageSearch,
  Search,
  Sparkles,
  Tags,
  UsersRound,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import type { FinanceAiAnalysis, FinanceSalesInsights } from '../../types';

type Props = {
  token: string;
  currency: string;
  asOf: string;
  siteId?: string;
};

type PeriodPreset = 'day' | 'week' | 'month' | 'custom';
type ActivityMetric = 'transactions' | 'revenue';
type AxisScale = { maximum: number; ticks: number[] };

const SALES_INSIGHTS_CACHE_MS = 90_000;
const salesInsightsCache = new Map<
  string,
  { expiresAt: number; request: Promise<FinanceSalesInsights> }
>();

function salesInsightsFor(token: string, from: string, to: string, siteId?: string) {
  const key = `${token}:${siteId || 'all-sites'}:${from}:${to}`;
  const cached = salesInsightsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  for (const [cachedKey, entry] of salesInsightsCache) {
    if (entry.expiresAt <= Date.now()) salesInsightsCache.delete(cachedKey);
  }
  if (salesInsightsCache.size >= 24) {
    const oldestKey = salesInsightsCache.keys().next().value as string | undefined;
    if (oldestKey) salesInsightsCache.delete(oldestKey);
  }
  const request = api.financeSalesInsights(token, from, to, siteId).catch((error) => {
    salesInsightsCache.delete(key);
    throw error;
  });
  salesInsightsCache.set(key, { expiresAt: Date.now() + SALES_INSIGHTS_CACHE_MS, request });
  return request;
}

export function prefetchFinanceSalesInsights(
  token: string,
  referenceDate: string,
  siteId?: string,
) {
  const range = rangeFor('month', referenceDate, '', '');
  void salesInsightsFor(token, range.from, range.to, siteId).catch(() => undefined);
}

export function clearFinanceSalesInsightsCache() {
  salesInsightsCache.clear();
}

function iso(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rangeFor(
  preset: PeriodPreset,
  referenceDate: string,
  customFrom: string,
  customTo: string,
) {
  const safeReference = /^20\d{2}-\d{2}-\d{2}$/.test(referenceDate)
    ? referenceDate
    : iso(new Date());
  if (preset === 'custom') {
    const from = customFrom || customTo || safeReference;
    const to = customTo || customFrom || safeReference;
    return from <= to ? { from, to } : { from: to, to: from };
  }
  if (preset === 'month') {
    const selectedMonth = safeReference.slice(0, 7);
    const from = `${selectedMonth}-01`;
    return { from, to: safeReference };
  }
  const to = new Date(`${safeReference}T12:00:00`);
  if (preset === 'day') return { from: iso(to), to: iso(to) };
  if (preset === 'week') {
    const from = new Date(to);
    from.setDate(from.getDate() - 6);
    return { from: iso(from), to: iso(to) };
  }
  return { from: iso(to), to: iso(to) };
}

function money(value: number | null | undefined, currency: string) {
  if (value == null) return '—';
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number | null | undefined) {
  return value == null ? '—' : value.toLocaleString(activeLocale(), { maximumFractionDigits: 1 });
}

function niceAxis(maximum: number): AxisScale {
  if (!Number.isFinite(maximum) || maximum <= 0) {
    return { maximum: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }
  const roughStep = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const factor =
    normalizedStep <= 1
      ? 1
      : normalizedStep <= 2
        ? 2
        : normalizedStep <= 2.5
          ? 2.5
          : normalizedStep <= 5
            ? 5
            : 10;
  const step = factor * magnitude;
  const axisMaximum = Math.ceil(maximum / step) * step;
  const ticks = Array.from({ length: Math.round(axisMaximum / step) + 1 }, (_, index) =>
    Number((index * step).toPrecision(12)),
  );
  return { maximum: axisMaximum, ticks };
}

function axisValue(value: number, metric: ActivityMetric, currency: string) {
  if (metric === 'transactions') {
    return value.toLocaleString(activeLocale(), { maximumFractionDigits: 0 });
  }
  return (
    new Intl.NumberFormat(activeLocale(), {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value) + ` ${currency === 'EUR' ? '€' : currency}`
  );
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString(activeLocale(), { timeZone: 'UTC' });
}

function comparable(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase(activeLocale());
}

function variation(value: number | null) {
  if (value == null) return <span className="neutral">Comparaison indisponible</span>;
  return (
    <span className={value >= 0 ? 'positive' : 'negative'}>
      {value >= 0 ? '+' : ''}
      {value.toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} %
    </span>
  );
}

function ChartFrame({
  scale,
  formatTick,
  axisLabel,
  children,
}: {
  scale: AxisScale;
  formatTick: (value: number) => string;
  axisLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="finance-axis-chart">
      <div className="finance-chart-y-axis" aria-label={axisLabel}>
        {scale.ticks.map((tick) => (
          <span key={tick} style={{ bottom: `${(tick / scale.maximum) * 100}%` }}>
            {formatTick(tick)}
          </span>
        ))}
      </div>
      <div className="finance-chart-content">
        <div className="finance-axis-grid" aria-hidden="true">
          {scale.ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / scale.maximum) * 100}%` }} />
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

export function FinanceSalesInsightsView({ token, currency, asOf, siteId }: Props) {
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [customFrom, setCustomFrom] = useState(`${asOf.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(asOf);
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('all');
  const [metric, setMetric] = useState<ActivityMetric>('transactions');
  const [data, setData] = useState<FinanceSalesInsights>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [analysis, setAnalysis] = useState<FinanceAiAnalysis>();
  const [analyzing, setAnalyzing] = useState(false);
  const maximumDate = asOf || iso(new Date());
  const range = useMemo(
    () => rangeFor(preset, maximumDate, customFrom, customTo),
    [customFrom, customTo, maximumDate, preset],
  );

  useEffect(() => {
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(asOf)) return;
    setCustomFrom(`${asOf.slice(0, 7)}-01`);
    setCustomTo(asOf);
  }, [asOf]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setAnalysis(undefined);
    salesInsightsFor(token, range.from, range.to, siteId)
      .then((result) => active && setData(result))
      .catch(
        (reason) =>
          active && setError(reason instanceof Error ? reason.message : 'Analyse indisponible.'),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [range.from, range.to, siteId, token]);

  if (loading && !data)
    return (
      <div className="finance-loading">
        <LoaderCircle className="spin" size={22} /> Analyse des tickets et des produits…
      </div>
    );
  if (error || !data)
    return (
      <div className="alert-modern error">
        <AlertCircle size={18} /> {error || 'Aucune donnée de vente exploitable.'}
      </div>
    );

  const visibleHourly = data.hourly.filter(({ hour }) => hour >= 6 && hour <= 23);
  const hourlyTotal = visibleHourly.reduce((sum, item) => sum + item[metric], 0);
  const hourlyShares = visibleHourly.map((item) => ({
    item,
    share: hourlyTotal ? (item[metric] / hourlyTotal) * 100 : 0,
  }));
  const hourlyAxis = niceAxis(Math.max(0, ...hourlyShares.map(({ share }) => share)));
  const dailyAxis = niceAxis(Math.max(0, ...data.daily.map((item) => item[metric])));
  const productPeriod = data.quality.productPeriod;
  const categories = [...new Set(data.products.map(({ category }) => category))].sort(
    (left, right) => left.localeCompare(right, 'fr'),
  );
  const normalizedSearch = comparable(productSearch.trim());
  const filteredProducts = data.products
    .filter(
      (product) =>
        (productCategory === 'all' || product.category === productCategory) &&
        (!normalizedSearch ||
          comparable(`${product.name} ${product.category}`).includes(normalizedSearch)),
    )
    .sort((left, right) => right.gross - left.gross);
  const filteredProductGross = filteredProducts.reduce((sum, product) => sum + product.gross, 0);
  const filteredProductQuantity = filteredProducts.reduce(
    (sum, product) => sum + product.quantity,
    0,
  );
  const filteredCategories = [
    ...filteredProducts
      .reduce((map, product) => {
        const current = map.get(product.category) ?? {
          category: product.category,
          quantity: 0,
          gross: 0,
        };
        current.quantity += product.quantity;
        current.gross += product.gross;
        map.set(product.category, current);
        return map;
      }, new Map<string, { category: string; quantity: number; gross: number }>())
      .values(),
  ].sort((left, right) => right.gross - left.gross);
  const productSubtitle = productPeriod
    ? `Sales Overview retenu · ${dateLabel(productPeriod.from)} au ${dateLabel(productPeriod.to)} · couverture ${data.quality.productCoveragePercent} %`
    : 'Aucun Sales Overview précis pour cette période';

  const runAnalysis = async () => {
    setAnalyzing(true);
    setError(undefined);
    try {
      setAnalysis(
        await api.financeAiAnalysis(token, 'sales', {
          from: range.from,
          asOf: range.to,
          siteId,
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Analyse Mistral indisponible.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="finance-page finance-sales-page">
      <section className="finance-period-title finance-sales-title">
        <div>
          <span>Données opérationnelles consolidées</span>
          <h2>Ventes & affluence</h2>
          <p>
            Du {dateLabel(data.period.from)} au {dateLabel(data.period.to)} · fuseau{' '}
            {data.period.timeZone}
          </p>
        </div>
        <div className="finance-sales-period-tools">
          <div className="finance-sales-filters">
            {(
              [
                ['day', '1 jour'],
                ['week', '7 jours'],
                ['month', 'Mensuel'],
                ['custom', 'Personnalisée'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={preset === id ? 'active' : ''}
                onClick={() => setPreset(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="finance-sales-date-controls">
            {preset === 'custom' && (
              <>
                <label>
                  <span>Du</span>
                  <input
                    type="date"
                    value={customFrom}
                    max={maximumDate}
                    onChange={(event) => setCustomFrom(event.target.value)}
                  />
                </label>
                <label>
                  <span>Au</span>
                  <input
                    type="date"
                    value={customTo}
                    max={maximumDate}
                    onChange={(event) => setCustomTo(event.target.value)}
                  />
                </label>
              </>
            )}
            {loading && <LoaderCircle className="spin" size={16} aria-label="Actualisation" />}
          </div>
        </div>
      </section>

      <section className="finance-sales-kpis">
        <SalesKpi
          icon={BarChart3}
          label="Chiffre d’affaires TTC"
          value={money(data.summary.revenue, currency)}
        >
          {variation(data.comparisons.previousPeriod.revenueVariationPercent)} vs période précédente
        </SalesKpi>
        <SalesKpi icon={UsersRound} label="Transactions" value={number(data.summary.transactions)}>
          {variation(data.comparisons.previousPeriod.transactionVariationPercent)} vs période
          précédente
        </SalesKpi>
        <SalesKpi
          icon={CalendarRange}
          label="Ticket moyen"
          value={money(data.summary.averageTicket, currency)}
        >
          {variation(data.comparisons.previousPeriod.averageTicketVariationPercent)} vs période
          précédente
        </SalesKpi>
        <SalesKpi
          icon={Clock3}
          label="Heure la plus active"
          value={data.summary.peakHour?.label ?? '—'}
        >
          {data.summary.peakHour
            ? `${data.summary.peakHour.transactions} tickets · ${data.summary.peakHour.sharePercent} % de l’activité`
            : 'Pas assez de tickets horodatés'}
        </SalesKpi>
      </section>

      <section className="finance-panel finance-sales-comparison">
        <SectionTitle
          icon={CalendarRange}
          title="Comparer la période"
          subtitle="Même durée, puis mêmes dates un an plus tôt"
        />
        <div className="finance-sales-comparison-grid">
          <ComparisonColumn
            label="Période actuelle"
            revenue={data.summary.revenue}
            transactions={data.summary.transactions}
            ticket={data.summary.averageTicket}
            currency={currency}
            current
          />
          <ComparisonColumn
            label="Période précédente"
            revenue={data.comparisons.previousPeriod.revenue}
            transactions={data.comparisons.previousPeriod.transactions}
            ticket={data.comparisons.previousPeriod.averageTicket}
            currency={currency}
          />
          <ComparisonColumn
            label="Même période N-1"
            revenue={data.comparisons.previousYear.revenue}
            transactions={data.comparisons.previousYear.transactions}
            ticket={data.comparisons.previousYear.averageTicket}
            currency={currency}
          />
        </div>
      </section>

      <section className="finance-panel">
        <div className="finance-sales-section-heading">
          <SectionTitle
            icon={Clock3}
            title="Affluence par heure"
            subtitle="Pourcentage du total de la période réparti par heure"
          />
          <MetricToggle value={metric} onChange={setMetric} />
        </div>
        <ChartFrame
          scale={hourlyAxis}
          formatTick={(tick) => `${tick.toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} %`}
          axisLabel="Pourcentage du total de la période"
        >
          <div className="finance-hour-bars">
            {hourlyShares.map(({ item, share }) => (
              <div
                key={item.hour}
                className="finance-chart-point"
                tabIndex={0}
                aria-label={`${item.label} · ${share.toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} % du total · ${item.transactions} tickets · ${money(item.revenue, currency)}`}
              >
                <span
                  className="finance-chart-bar"
                  style={{
                    height: `${share > 0 ? Math.max(2, (share / hourlyAxis.maximum) * 100) : 0}%`,
                  }}
                />
                <span className="finance-chart-tooltip" role="tooltip">
                  {item.label} · {share.toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} % du
                  total · {item.transactions} tickets · {money(item.revenue, currency)}
                </span>
                <small>{String(item.hour).padStart(2, '0')}h</small>
              </div>
            ))}
          </div>
        </ChartFrame>
      </section>

      <section className="finance-panel">
        <div className="finance-sales-section-heading">
          <SectionTitle
            icon={BarChart3}
            title="Évolution jour par jour"
            subtitle={
              metric === 'transactions'
                ? 'Nombre de transactions par date · échelle adaptée au maximum de la période'
                : 'Chiffre d’affaires par date · échelle adaptée au maximum de la période'
            }
          />
          <MetricToggle value={metric} onChange={setMetric} />
        </div>
        <ChartFrame
          scale={dailyAxis}
          formatTick={(tick) => axisValue(tick, metric, currency)}
          axisLabel={metric === 'transactions' ? 'Nombre de transactions' : "Chiffre d'affaires"}
        >
          <div className="finance-daily-sales-chart">
            {data.daily.map((item) => (
              <div
                key={item.date}
                className="finance-chart-point"
                tabIndex={0}
                aria-label={`${item.date} · ${item.transactions} tickets · ${money(item.revenue, currency)}`}
              >
                <span
                  className="finance-chart-bar"
                  style={{
                    height: `${item[metric] > 0 ? Math.max(2, (item[metric] / dailyAxis.maximum) * 100) : 0}%`,
                  }}
                />
                <span className="finance-chart-tooltip" role="tooltip">
                  {new Date(`${item.date}T12:00:00`).toLocaleDateString(activeLocale())} ·{' '}
                  {item.transactions} tickets · {money(item.revenue, currency)}
                </span>
                <small>
                  {new Date(`${item.date}T12:00:00`).toLocaleDateString(activeLocale(), {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </small>
              </div>
            ))}
          </div>
        </ChartFrame>
      </section>

      {data.staffing.available && (
        <section className="finance-panel">
          <SectionTitle
            icon={UsersRound}
            title="Affluence & effectif planifié"
            subtitle="Rapproche les passages aux heures planifiées lorsque le module RH contient un planning"
          />
          <div className="finance-staffing-analysis">
            <div className="finance-staffing-summary">
              <span>
                <small>Heures planifiées</small>
                <strong>{number(data.staffing.plannedHours)} h</strong>
              </span>
              <span>
                <small>CA / heure planifiée</small>
                <strong>{money(data.staffing.revenuePerPlannedHour, currency)}</strong>
              </span>
              <span>
                <small>Services analysés</small>
                <strong>{number(data.staffing.assignments)}</strong>
              </span>
            </div>
            <div className="finance-staffing-hours">
              {data.staffing.hourly
                .filter(({ plannedHours }) => plannedHours > 0)
                .map((item) => (
                  <div key={item.hour}>
                    <strong>{String(item.hour).padStart(2, '0')}h</strong>
                    <span>{number(item.transactions)} tickets</span>
                    <span>{number(item.plannedHours)} h planifiées</span>
                    <b>{number(item.transactionsPerPlannedHour)} tickets/h</b>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      <section className="finance-panel finance-product-explorer">
        <div className="finance-sales-section-heading">
          <SectionTitle
            icon={PackageSearch}
            title="Analyse des produits"
            subtitle={productSubtitle}
          />
          <div className="finance-product-filter-bar">
            <label className="finance-product-search-control">
              <Search size={16} />
              <span className="finance-visually-hidden">Rechercher un produit</span>
              <input
                type="search"
                value={productSearch}
                placeholder="Rechercher un produit…"
                onChange={(event) => setProductSearch(event.target.value)}
              />
            </label>
            <label className="finance-product-category-control">
              <Tags size={16} />
              <span className="finance-visually-hidden">Filtrer par catégorie</span>
              <select
                value={productCategory}
                aria-label="Filtrer par catégorie"
                onChange={(event) => setProductCategory(event.target.value)}
              >
                <option value="all">Toutes les catégories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <ChevronDown className="finance-product-category-chevron" size={15} />
            </label>
            {(productSearch || productCategory !== 'all') && (
              <button
                type="button"
                className="finance-product-filter-reset"
                onClick={() => {
                  setProductSearch('');
                  setProductCategory('all');
                }}
              >
                <X size={14} /> Réinitialiser
              </button>
            )}
          </div>
        </div>

        <div className="finance-product-summary">
          <span>
            <small>Produits trouvés</small>
            <strong>{filteredProducts.length}</strong>
          </span>
          <span>
            <small>Quantité vendue</small>
            <strong>{number(filteredProductQuantity)}</strong>
          </span>
          <span>
            <small>Chiffre d’affaires produits</small>
            <strong>{money(filteredProductGross, currency)}</strong>
          </span>
          <span>
            <small>Couverture de la période</small>
            <strong>{data.quality.productCoveragePercent} %</strong>
          </span>
        </div>

        {data.quality.productCoveragePercent < 100 && (
          <div className="finance-product-coverage-note">
            <AlertCircle size={16} />
            <span>
              {data.quality.productCoveragePercent === 0
                ? 'Aucun rapport produit exact pour cette période : aucun ancien résultat n’est mélangé à votre recherche.'
                : `Résultats calculés sur ${data.quality.productCoverageDays} jour(s) de rapports parmi ${data.period.days}. Un jour fermé compte comme couvert dès qu’il figure dans un rapport.`}
            </span>
          </div>
        )}

        <div className="finance-product-comparison-note">
          <CalendarRange size={15} />
          <span>
            <strong>Évolution des quantités :</strong> période sélectionnée comparée à la période
            précédente de même durée, du {dateLabel(data.comparisons.previousPeriod.from)} au{' '}
            {dateLabel(data.comparisons.previousPeriod.to)}.
          </span>
        </div>

        <div className="finance-product-results">
          <div className="finance-sales-table">
            <div className="head">
              <span>Produit</span>
              <span>Qté</span>
              <span>CA</span>
              <span>Marge</span>
              <span>Part</span>
              <span>Évol. quantité</span>
            </div>
            {filteredProducts.map((product) => (
              <div key={`${product.name}-${product.category}`}>
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.category}</small>
                </span>
                <span>{number(product.quantity)}</span>
                <span>{money(product.gross, currency)}</span>
                <span>
                  {product.margin == null
                    ? '—'
                    : `${money(product.margin, currency)} · ${number(product.marginRate)} %`}
                </span>
                <span>{product.sharePercent.toLocaleString(activeLocale())} %</span>
                <span>{variation(product.quantityVariationPercent)}</span>
              </div>
            ))}
            {!filteredProducts.length && (
              <div className="finance-product-empty">
                <PackageSearch size={22} />
                <strong>Aucun produit pour ces critères</strong>
                <span>
                  Modifiez la période, la catégorie ou la recherche pour afficher d’autres ventes.
                </span>
              </div>
            )}
          </div>

          <aside className="finance-product-categories">
            <SectionTitle
              icon={Tags}
              title="Mix des catégories"
              subtitle="Répartition des produits filtrés"
            />
            <div className="finance-category-list">
              {filteredCategories.slice(0, 12).map((category) => {
                const sharePercent = filteredProductGross
                  ? (category.gross / filteredProductGross) * 100
                  : 0;
                return (
                  <div key={category.category}>
                    <header>
                      <strong>{category.category}</strong>
                      <span>
                        {number(category.quantity)} vente(s) · {money(category.gross, currency)}
                      </span>
                    </header>
                    <i>
                      <span style={{ width: `${Math.min(100, sharePercent)}%` }} />
                    </i>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </section>

      <section className="finance-panel finance-quality-card">
        <SectionTitle
          icon={AlertCircle}
          title="Qualité et traçabilité"
          subtitle="Ce que ToqueHub a réellement pu consolider"
        />
        <dl>
          <div>
            <dt>Tickets analysés</dt>
            <dd>{data.quality.transactionRows.toLocaleString(activeLocale())}</dd>
          </div>
          <div>
            <dt>Doublons inter-caisses écartés</dt>
            <dd>{data.quality.crossSourceDuplicatesExcluded}</dd>
          </div>
          <div>
            <dt>Couverture produits</dt>
            <dd>{data.quality.productCoveragePercent} %</dd>
          </div>
          <div>
            <dt>Rapports produits retenus</dt>
            <dd>{data.quality.selectedProductReports}</dd>
          </div>
          <div>
            <dt>Chevauchements écartés</dt>
            <dd>{data.quality.overlappingProductReportsExcluded}</dd>
          </div>
        </dl>
        {data.quality.limitations.map((item) => (
          <p key={item}>
            <AlertCircle size={14} /> {item}
          </p>
        ))}
      </section>

      <section className="finance-panel finance-ai-panel">
        <div className="finance-ai-heading">
          <SectionTitle
            icon={BrainCircuit}
            title="Analyste Mistral · ventes"
            subtitle="Produits, catégories, heures, comparaisons et limites de couverture sont transmis sous forme d’agrégats vérifiés"
          />
          <button
            className="btn btn-primary"
            disabled={analyzing}
            onClick={() => void runAnalysis()}
          >
            {analyzing ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{' '}
            {analysis ? 'Régénérer' : 'Analyser'}
          </button>
        </div>
        {analysis && (
          <div className="finance-ai-result">
            <div className={`finance-ai-summary ${analysis.status}`}>
              <strong>{analysis.summary}</strong>
            </div>
            <div className="finance-ai-columns">
              <div>
                <h4>Signaux</h4>
                <ul>
                  {[...analysis.strengths, ...analysis.risks].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Actions proposées</h4>
                <ul>
                  {analysis.actions.map((item) => (
                    <li key={`${item.priority}-${item.title}`}>
                      <strong>
                        {item.priority} · {item.title}
                      </strong>{' '}
                      — {item.detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SalesKpi({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <article>
      <header>
        <span>
          <Icon size={18} />
        </span>
        <strong>{label}</strong>
      </header>
      <b>{value}</b>
      <p>{children}</p>
    </article>
  );
}

function ComparisonColumn({
  label,
  revenue,
  transactions,
  ticket,
  currency,
  current = false,
}: {
  label: string;
  revenue: number;
  transactions: number;
  ticket: number | null;
  currency: string;
  current?: boolean;
}) {
  return (
    <div className={current ? 'current' : ''}>
      <strong>{label}</strong>
      <dl>
        <div>
          <dt>CA</dt>
          <dd>{money(revenue, currency)}</dd>
        </div>
        <div>
          <dt>Transactions</dt>
          <dd>{number(transactions)}</dd>
        </div>
        <div>
          <dt>Ticket moyen</dt>
          <dd>{money(ticket, currency)}</dd>
        </div>
      </dl>
    </div>
  );
}

function MetricToggle({
  value,
  onChange,
}: {
  value: ActivityMetric;
  onChange: (value: ActivityMetric) => void;
}) {
  return (
    <div className="finance-metric-toggle">
      <button
        className={value === 'transactions' ? 'active' : ''}
        onClick={() => onChange('transactions')}
      >
        Transactions
      </button>
      <button className={value === 'revenue' ? 'active' : ''} onClick={() => onChange('revenue')}>
        Chiffre d’affaires
      </button>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof BarChart3;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="finance-panel-header">
      <span>
        <Icon size={17} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

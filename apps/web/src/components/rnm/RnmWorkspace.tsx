import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  GitCompareArrows,
  Grid2X2,
  History,
  Info,
  Layers3,
  List,
  LoaderCircle,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { activeLocale } from '../../i18n/runtime';
import type { RnmFavorite, RnmHistoryPoint, RnmProduct } from '../../types';
import { RnmPriceChart } from './RnmPriceChart';
import { RnmProductModal } from './RnmProductModal';
import './rnmTranslations';
import './RnmApp.css';

export type RnmTab = 'dashboard' | 'products' | 'favorites' | 'history' | 'compare' | 'about';

type Props = {
  token: string;
  initialTab?: RnmTab;
  initialProductId?: string;
  onNavigate?: (tab: RnmTab) => void;
};

type ViewMode = 'cards' | 'table';
type SortMode = 'name' | 'price-asc' | 'price-desc' | 'variation-desc' | 'variation-asc';

const PAGE_SIZE = 24;
const COMPARISON_COLORS = ['#10b981', '#2563eb', '#f59e0b', '#8b5cf6'];
const QUICK_SEARCHES = ['Tomate', 'Carotte', 'Cabillaud', 'Poulet', 'Farine', 'Beurre'];
const COMPARISON_STORAGE_KEY = 'toquehub_rnm_comparison';

const TABS: Array<{ id: Exclude<RnmTab, 'about'>; label: string; icon: typeof BarChart3 }> = [
  { id: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
  { id: 'products', label: 'Catalogue', icon: Layers3 },
  { id: 'favorites', label: 'Favoris', icon: Star },
  { id: 'compare', label: 'Comparateur', icon: GitCompareArrows },
  { id: 'history', label: 'Historique', icon: History },
];

function idOf(product: Pick<RnmProduct, 'id' | 'code'>) {
  return String(product.id ?? product.code ?? '');
}

function favoriteId(favorite: RnmFavorite) {
  return String(favorite.productId ?? favorite.rnmProductId ?? '');
}

function money(value?: number | null, unit?: string | null) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const formatted = new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(Number(value));
  return unit ? `${formatted} / ${unit}` : formatted;
}

function date(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(activeLocale());
}

function variation(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return 'Stable';
  const formatted = Number(value).toLocaleString(activeLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${Number(value) > 0 ? '+' : ''}${formatted} %`;
}

function productFromFavorite(favorite: RnmFavorite): RnmProduct {
  return {
    id: favoriteId(favorite),
    name: favorite.productName || favoriteId(favorite),
    category: favorite.category,
    sector: favorite.sector,
  };
}

function loadComparison() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPARISON_STORAGE_KEY) ?? '{}') as Record<
      string,
      RnmProduct
    >;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function Kpi({ icon, value, label, tone }: { icon: ReactNode; value: ReactNode; label: string; tone: string }) {
  return (
    <div className={`metric-card-modern tone-${tone}`}>
      <div className="metric-header">
        <div className={`metric-icon-wrapper-modern tone-${tone}`}>{icon}</div>
      </div>
      <div className="metric-body-modern">
        <span className="metric-value-modern">{value}</span>
        <span className="metric-label-modern">{label}</span>
      </div>
      <div className="metric-shine" />
    </div>
  );
}

function TrendBadge({ value }: { value?: number | null }) {
  const numeric = Number(value ?? 0);
  const tone = numeric > 0 ? 'up' : numeric < 0 ? 'down' : 'stable';
  return (
    <span className={`rnm-redesign-trend ${tone}`}>
      {numeric > 0 ? <ArrowUpRight size={14} /> : numeric < 0 ? <ArrowDownRight size={14} /> : null}
      {variation(value)}
    </span>
  );
}

function LoadingState({ label = 'Chargement des données RNM…' }: { label?: string }) {
  return (
    <div className="rnm-redesign-loading">
      <LoaderCircle size={26} className="spin" />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rnm-redesign-empty">
      <span><BarChart3 size={26} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="rnm-redesign-pagination" aria-label="Pagination du catalogue">
      <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={16} /> Précédent
      </button>
      <span><strong>{page}</strong> / {pages}<small>Page {page} sur {pages}</small></span>
      <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Suivant <ChevronRight size={16} />
      </button>
    </nav>
  );
}

function ProductCard({
  product,
  favorite,
  compared,
  onOpen,
  onFavorite,
  onCompare,
}: {
  product: RnmProduct;
  favorite: boolean;
  compared: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  onCompare: () => void;
}) {
  return (
    <article className="rnm-redesign-product-card" onClick={onOpen}>
      <header>
        <div>
          <span>{product.sector || 'Marché RNM'}</span>
          <h3>{product.name}</h3>
          <small>{product.category || 'Catégorie non renseignée'}</small>
        </div>
        <button
          type="button"
          className={`rnm-redesign-star-button${favorite ? ' is-active' : ''}`}
          aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={(event) => { event.stopPropagation(); onFavorite(); }}
        >
          <Star size={18} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </header>
      <div className="rnm-redesign-product-price">
        <span>Prix moyen</span>
        <strong>{money(product.averagePrice, product.unit)}</strong>
        {product.minPrice != null || product.maxPrice != null ? (
          <div className="rnm-redesign-price-range">
            <span>Min. {money(product.minPrice, product.unit)}</span>
            <span>Max. {money(product.maxPrice, product.unit)}</span>
          </div>
        ) : null}
        <small>Dernière cotation : {date(product.latestQuotationDate ?? product.lastQuotationDate)}</small>
      </div>
      <footer>
        <TrendBadge value={product.variation} />
        <button
          type="button"
          className={compared ? 'is-selected' : ''}
          onClick={(event) => { event.stopPropagation(); onCompare(); }}
        >
          {compared ? <Check size={14} /> : <GitCompareArrows size={14} />}
          {compared ? 'Sélectionné' : 'Comparer'}
        </button>
      </footer>
    </article>
  );
}

function ProductTable({
  products,
  favoriteIds,
  comparisonIds,
  onOpen,
  onFavorite,
  onCompare,
}: {
  products: RnmProduct[];
  favoriteIds: Set<string>;
  comparisonIds: Set<string>;
  onOpen: (id: string) => void;
  onFavorite: (product: RnmProduct) => void;
  onCompare: (product: RnmProduct) => void;
}) {
  return (
    <div className="table-wrapper rnm-redesign-table-wrapper">
      <table className="table-modern rnm-redesign-table">
        <thead><tr><th>Produit</th><th>Secteur</th><th>Prix moyen</th><th>Minimum / maximum</th><th>Variation</th><th>Dernière cotation</th><th>Actions</th></tr></thead>
        <tbody>
          {products.map((product) => {
            const id = idOf(product);
            const favorite = favoriteIds.has(id);
            const compared = comparisonIds.has(id);
            return (
              <tr key={id} onClick={() => onOpen(id)}>
                <td><strong>{product.name}</strong><small>{product.category || 'Catégorie non renseignée'}</small></td>
                <td>{product.sector || '—'}</td>
                <td><strong>{money(product.averagePrice, product.unit)}</strong></td>
                <td>{money(product.minPrice, product.unit)} / {money(product.maxPrice, product.unit)}</td>
                <td><TrendBadge value={product.variation} /></td>
                <td>{date(product.latestQuotationDate ?? product.lastQuotationDate)}</td>
                <td>
                  <div className="rnm-redesign-row-actions">
                    <button type="button" className={`rnm-redesign-star-button${favorite ? ' is-active' : ''}`} onClick={(event) => { event.stopPropagation(); onFavorite(product); }} aria-label="Favori"><Star size={17} fill={favorite ? 'currentColor' : 'none'} /></button>
                    <button type="button" className={compared ? 'is-selected' : ''} onClick={(event) => { event.stopPropagation(); onCompare(product); }} aria-label="Comparer"><GitCompareArrows size={17} /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RnmWorkspace({ token, initialTab = 'dashboard', initialProductId, onNavigate }: Props) {
  const initialVisibleTab = initialTab === 'about' ? 'dashboard' : initialTab;
  const [activeTab, setActiveTab] = useState<Exclude<RnmTab, 'about'>>(initialVisibleTab);
  const [aboutOpen, setAboutOpen] = useState(initialTab === 'about');
  const [productId, setProductId] = useState(initialProductId ?? '');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [sector, setSector] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortMode>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [comparison, setComparison] = useState<Record<string, RnmProduct>>(loadComparison);
  const [comparisonNotice, setComparisonNotice] = useState('');
  const internalNavigation = useRef<RnmTab | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (internalNavigation.current === initialTab) {
      internalNavigation.current = null;
      return;
    }
    if (initialTab === 'about') {
      setAboutOpen(true);
      return;
    }
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    localStorage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(comparison));
  }, [comparison]);

  useEffect(() => setPage(1), [deferredSearch, sector, category, favoriteOnly]);

  const statsQuery = useQuery({
    queryKey: ['rnm', 'stats'],
    queryFn: () => api.rnmStats(token),
    staleTime: 5 * 60_000,
  });
  const favoritesQuery = useQuery({
    queryKey: ['rnm', 'favorites'],
    queryFn: () => api.rnmFavorites(token),
    staleTime: 60_000,
  });
  const catalogQuery = useQuery({
    queryKey: ['rnm', 'catalog', deferredSearch, sector, category, page],
    queryFn: () => api.rnmProducts(token, {
      search: deferredSearch || undefined,
      sector: sector || undefined,
      category: category || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });

  const favorites = favoritesQuery.data ?? [];
  const favoriteIds = useMemo(() => new Set(favorites.map(favoriteId).filter(Boolean)), [favorites]);
  const favoriteProductsQuery = useQuery({
    queryKey: ['rnm', 'favorite-products', [...favoriteIds].join('|')],
    queryFn: async () => Promise.all(favorites.map(async (favorite) => {
      try {
        return await api.rnmProduct(token, favoriteId(favorite));
      } catch {
        return productFromFavorite(favorite);
      }
    })),
    enabled: favorites.length > 0,
    staleTime: 5 * 60_000,
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (product: RnmProduct) => {
      if (favoriteIds.has(idOf(product))) {
        await api.removeRnmFavorite(token, idOf(product));
        return;
      }
      await api.addRnmFavorite(token, {
        productId: idOf(product),
        productName: product.name,
        category: product.category,
        sector: product.sector,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rnm', 'favorites'] });
    },
  });

  const catalogProducts = catalogQuery.data?.items ?? [];
  const favoriteProducts = favoriteProductsQuery.data ?? favorites.map(productFromFavorite);
  const filteredFavoriteProducts = useMemo(() => favoriteProducts.filter((product) => {
    const searchTerms = [product.name, product.category, product.sector]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase(activeLocale());
    return (!deferredSearch || searchTerms.includes(deferredSearch.toLocaleLowerCase(activeLocale())))
      && (!sector || product.sector === sector)
      && (!category || product.category === category);
  }), [favoriteProducts, deferredSearch, sector, category]);
  const displayedProducts = favoriteOnly ? filteredFavoriteProducts : catalogProducts;
  const sortedProducts = useMemo(() => [...displayedProducts].sort((left, right) => {
    if (sort === 'price-asc') return Number(left.averagePrice ?? Number.POSITIVE_INFINITY) - Number(right.averagePrice ?? Number.POSITIVE_INFINITY);
    if (sort === 'price-desc') return Number(right.averagePrice ?? Number.NEGATIVE_INFINITY) - Number(left.averagePrice ?? Number.NEGATIVE_INFINITY);
    if (sort === 'variation-desc') return Number(right.variation ?? Number.NEGATIVE_INFINITY) - Number(left.variation ?? Number.NEGATIVE_INFINITY);
    if (sort === 'variation-asc') return Number(left.variation ?? Number.POSITIVE_INFINITY) - Number(right.variation ?? Number.POSITIVE_INFINITY);
    return left.name.localeCompare(right.name, activeLocale(), { sensitivity: 'base' });
  }), [displayedProducts, sort]);
  const comparisonIds = useMemo(() => new Set(Object.keys(comparison)), [comparison]);
  const topRisers = ((statsQuery.data?.topRisers ?? []) as RnmProduct[]).slice(0, 5);
  const topFallers = ((statsQuery.data?.topFallers ?? []) as RnmProduct[]).slice(0, 5);
  const availableSectors = catalogQuery.data?.filters?.sectors ?? catalogQuery.data?.sectors ?? [];
  const availableCategories = catalogQuery.data?.filters?.categories ?? catalogQuery.data?.categories ?? [];
  const totalPages = favoriteOnly ? 1 : Math.max(1, catalogQuery.data?.pages ?? 1);
  const totalProducts = favoriteOnly ? filteredFavoriteProducts.length : (catalogQuery.data?.total ?? sortedProducts.length);

  function navigate(next: Exclude<RnmTab, 'about'>) {
    setActiveTab(next);
    const externalTab: RnmTab = next === 'products' || next === 'compare' ? 'dashboard' : next;
    internalNavigation.current = externalTab;
    onNavigate?.(externalTab);
  }

  function openAbout() {
    setAboutOpen(true);
    internalNavigation.current = 'about';
    onNavigate?.('about');
  }

  function closeAbout() {
    setAboutOpen(false);
    if (initialTab === 'about') {
      internalNavigation.current = 'dashboard';
      onNavigate?.('dashboard');
    }
  }

  function toggleCompare(product: RnmProduct) {
    const id = idOf(product);
    if (!id) return;
    setComparison((current) => {
      if (current[id]) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (Object.keys(current).length >= 4) {
        setComparisonNotice('Le comparateur accepte jusqu’à quatre produits simultanément.');
        return current;
      }
      setComparisonNotice('');
      return { ...current, [id]: product };
    });
  }

  function refresh() {
    void Promise.all([
      statsQuery.refetch(),
      favoritesQuery.refetch(),
      catalogQuery.refetch(),
    ]);
  }

  const loading = statsQuery.isLoading || catalogQuery.isLoading || favoritesQuery.isLoading;
  const error = statsQuery.error || catalogQuery.error || favoritesQuery.error;

  return (
    <div className="rnm-redesign-workspace">
      <motion.section
        className="welcome-hero theme-emerald rnm-redesign-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="rnm-redesign-hero-copy">
          <span className="welcome-tag"><BarChart3 size={14} /> Veille économique alimentaire</span>
          <h1 className="welcome-title">Cours des produits</h1>
          <p className="welcome-desc">Suivez les cotations officielles du marché, repérez les tendances et anticipez vos achats.</p>
        </div>
        <div className="toquehub-hero-actions rnm-redesign-hero-actions">
          <button type="button" className="btn btn-secondary btn-outline" onClick={openAbout}><Info size={16} /> À propos des données</button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('products')}><Search size={16} /> Parcourir le catalogue</button>
        </div>
      </motion.section>

      <nav className="hr-tabs stocks-module-tabs rnm-redesign-tabs" aria-label="Navigation Cours des produits">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={activeTab === id ? 'active' : ''} onClick={() => navigate(id)}>
            <Icon size={16} /> {label}
            {id === 'favorites' && favorites.length ? <span>{favorites.length}</span> : null}
            {id === 'compare' && comparisonIds.size ? <span>{comparisonIds.size}</span> : null}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="alert-modern error rnm-redesign-alert">
          <AlertTriangle size={18} />
          <div><strong>Données momentanément indisponibles</strong><span>Le service RNM n’a pas répondu correctement.</span></div>
          <button type="button" className="btn btn-secondary" onClick={refresh}>Réessayer</button>
        </div>
      ) : null}

      {loading && !catalogQuery.data ? <LoadingState /> : null}

      {!loading || catalogQuery.data ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="rnm-redesign-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
          >
            {activeTab === 'dashboard' ? (
              <DashboardView
                stats={statsQuery.data}
                favorites={favoriteProducts}
                favoriteIds={favoriteIds}
                topRisers={topRisers}
                topFallers={topFallers}
                onCatalog={() => navigate('products')}
                onFavorites={() => navigate('favorites')}
                onSearch={(value) => { setSearch(value); navigate('products'); }}
                onOpen={setProductId}
                onFavorite={(product) => toggleFavoriteMutation.mutate(product)}
                onCompare={toggleCompare}
                comparisonIds={comparisonIds}
              />
            ) : null}

            {activeTab === 'products' ? (
              <CatalogView
                search={search}
                onSearch={setSearch}
                sector={sector}
                onSector={setSector}
                category={category}
                onCategory={setCategory}
                sectors={availableSectors}
                categories={availableCategories}
                sort={sort}
                onSort={setSort}
                favoriteOnly={favoriteOnly}
                onFavoriteOnly={setFavoriteOnly}
                viewMode={viewMode}
                onViewMode={setViewMode}
                products={sortedProducts}
                total={totalProducts}
                loading={catalogQuery.isFetching || (favoriteOnly && favoriteProductsQuery.isFetching)}
                favoriteIds={favoriteIds}
                comparisonIds={comparisonIds}
                onOpen={setProductId}
                onFavorite={(product) => toggleFavoriteMutation.mutate(product)}
                onCompare={toggleCompare}
                page={page}
                pages={totalPages}
                onPage={setPage}
                onReset={() => { setSearch(''); setSector(''); setCategory(''); setFavoriteOnly(false); setSort('name'); }}
              />
            ) : null}

            {activeTab === 'favorites' ? (
              <FavoritesView
                products={favoriteProducts}
                loading={favoriteProductsQuery.isLoading}
                comparisonIds={comparisonIds}
                onCatalog={() => navigate('products')}
                onOpen={setProductId}
                onFavorite={(product) => toggleFavoriteMutation.mutate(product)}
                onCompare={toggleCompare}
              />
            ) : null}

            {activeTab === 'compare' ? (
              <ComparisonView token={token} products={Object.values(comparison)} onCatalog={() => navigate('products')} onRemove={toggleCompare} />
            ) : null}

            {activeTab === 'history' ? <HistoryView token={token} onOpen={setProductId} /> : null}
          </motion.div>
        </AnimatePresence>
      ) : null}

      {comparisonNotice ? (
        <div className="rnm-redesign-comparison-notice" role="status"><CircleHelp size={16} /> {comparisonNotice}<button type="button" onClick={() => setComparisonNotice('')}><X size={14} /></button></div>
      ) : null}

      {activeTab !== 'compare' && comparisonIds.size ? (
        <ComparisonTray products={Object.values(comparison)} onRemove={toggleCompare} onClear={() => setComparison({})} onCompare={() => navigate('compare')} />
      ) : null}

      {productId ? (
        <RnmProductModal
          token={token}
          productId={productId}
          favorite={favoriteIds.has(productId)}
          compared={comparisonIds.has(productId)}
          onClose={() => setProductId('')}
          onToggleFavorite={(product) => toggleFavoriteMutation.mutate(product)}
          onToggleCompare={toggleCompare}
        />
      ) : null}

      {aboutOpen ? <AboutModal onClose={closeAbout} /> : null}
    </div>
  );
}

function DashboardView({
  stats,
  favorites,
  favoriteIds,
  topRisers,
  topFallers,
  comparisonIds,
  onCatalog,
  onFavorites,
  onSearch,
  onOpen,
  onFavorite,
  onCompare,
}: {
  stats?: Awaited<ReturnType<typeof api.rnmStats>>;
  favorites: RnmProduct[];
  favoriteIds: Set<string>;
  topRisers: RnmProduct[];
  topFallers: RnmProduct[];
  comparisonIds: Set<string>;
  onCatalog: () => void;
  onFavorites: () => void;
  onSearch: (value: string) => void;
  onOpen: (id: string) => void;
  onFavorite: (product: RnmProduct) => void;
  onCompare: (product: RnmProduct) => void;
}) {
  return (
    <>
      <div className="metrics-grid rnm-redesign-kpis">
        <Kpi icon={<Layers3 size={20} />} value={stats?.productCount?.toLocaleString(activeLocale()) ?? '—'} label="Produits disponibles" tone="emerald" />
        <Kpi icon={<MapPin size={20} />} value={stats?.marketCount?.toLocaleString(activeLocale()) ?? '—'} label="Marchés suivis" tone="blue" />
        <Kpi icon={<Star size={20} />} value={favorites.length} label="Produits favoris" tone="orange" />
        <Kpi icon={<CalendarDays size={20} />} value={date(stats?.latestQuotationDate)} label="Dernière cotation" tone="purple" />
      </div>

      <section className="card-modern rnm-redesign-quick-search">
        <div><span>Recherche rapide</span><strong>Quel produit souhaitez-vous surveiller ?</strong></div>
        <div>{QUICK_SEARCHES.map((item) => <button type="button" key={item} onClick={() => onSearch(item)}>{item}</button>)}</div>
      </section>

      <div className="rnm-redesign-movers-grid">
        <MoverPanel title="Principales hausses" icon={<TrendingUp size={19} />} products={topRisers} tone="up" onOpen={onOpen} />
        <MoverPanel title="Principales baisses" icon={<TrendingDown size={19} />} products={topFallers} tone="down" onOpen={onOpen} />
      </div>

      <section className="card-modern rnm-redesign-favorites-panel">
        <div className="rnm-redesign-panel-heading">
          <div><span>Surveillance personnelle</span><h2>Mes produits favoris</h2><p>Retrouvez rapidement les produits que vous consultez le plus.</p></div>
          <button type="button" className="btn btn-secondary" onClick={onFavorites}>Voir tous les favoris</button>
        </div>
        {favorites.length ? (
          <div className="rnm-redesign-product-grid compact">
            {favorites.slice(0, 4).map((product) => (
              <ProductCard key={idOf(product)} product={product} favorite={favoriteIds.has(idOf(product))} compared={comparisonIds.has(idOf(product))} onOpen={() => onOpen(idOf(product))} onFavorite={() => onFavorite(product)} onCompare={() => onCompare(product)} />
            ))}
          </div>
        ) : (
          <EmptyState title="Aucun produit favori" description="Ajoutez une étoile depuis le catalogue pour construire votre sélection." action={<button type="button" className="btn btn-primary" onClick={onCatalog}>Parcourir le catalogue</button>} />
        )}
      </section>
    </>
  );
}

function MoverPanel({ title, icon, products, tone, onOpen }: { title: string; icon: ReactNode; products: RnmProduct[]; tone: 'up' | 'down'; onOpen: (id: string) => void }) {
  return (
    <section className={`card-modern rnm-redesign-mover-panel ${tone}`}>
      <div className="rnm-redesign-panel-heading compact"><div><span>{icon} Tendance du marché</span><h2>{title}</h2></div></div>
      {products.length ? <div className="rnm-redesign-mover-list">{products.map((product, index) => (
        <button type="button" key={`${idOf(product)}-${index}`} onClick={() => onOpen(idOf(product))}>
          <span><i>{index + 1}</i><strong>{product.name}</strong></span><span><em>{money(product.averagePrice, product.unit)}</em><TrendBadge value={product.variation} /></span>
        </button>
      ))}</div> : <EmptyState title="Aucun mouvement significatif" description="Les prochaines variations publiées apparaîtront ici." />}
    </section>
  );
}

function CatalogView({
  search,
  onSearch,
  sector,
  onSector,
  category,
  onCategory,
  sectors,
  categories,
  sort,
  onSort,
  favoriteOnly,
  onFavoriteOnly,
  viewMode,
  onViewMode,
  products,
  total,
  loading,
  favoriteIds,
  comparisonIds,
  onOpen,
  onFavorite,
  onCompare,
  page,
  pages,
  onPage,
  onReset,
}: {
  search: string; onSearch: (value: string) => void; sector: string; onSector: (value: string) => void;
  category: string; onCategory: (value: string) => void; sectors: string[]; categories: string[];
  sort: SortMode; onSort: (value: SortMode) => void; favoriteOnly: boolean; onFavoriteOnly: (value: boolean) => void;
  viewMode: ViewMode; onViewMode: (value: ViewMode) => void; products: RnmProduct[]; total: number; loading: boolean;
  favoriteIds: Set<string>; comparisonIds: Set<string>; onOpen: (id: string) => void;
  onFavorite: (product: RnmProduct) => void; onCompare: (product: RnmProduct) => void;
  page: number; pages: number; onPage: (page: number) => void; onReset: () => void;
}) {
  return (
    <>
      <section className="card-modern rnm-redesign-catalog-toolbar">
        <div className="rnm-redesign-toolbar-heading"><div><span>Catalogue officiel</span><h2>{total.toLocaleString(activeLocale())} produit{total > 1 ? 's' : ''}</h2></div>{loading ? <small><LoaderCircle size={14} className="spin" /> Actualisation…</small> : null}</div>
        <div className="rnm-redesign-filter-grid">
          <label className="rnm-redesign-search"><span>Rechercher</span><div><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Nom, catégorie ou secteur…" />{search ? <button type="button" onClick={() => onSearch('')}><X size={14} /></button> : null}</div></label>
          <label><span>Secteur</span><select value={sector} onChange={(event) => onSector(event.target.value)}><option value="">Tous les secteurs</option>{sectors.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <label><span>Catégorie</span><select value={category} onChange={(event) => onCategory(event.target.value)}><option value="">Toutes les catégories</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <label><span>Trier par</span><select value={sort} onChange={(event) => onSort(event.target.value as SortMode)}><option value="name">Nom</option><option value="price-asc">Prix croissant</option><option value="price-desc">Prix décroissant</option><option value="variation-desc">Plus forte hausse</option><option value="variation-asc">Plus forte baisse</option></select></label>
        </div>
        <div className="rnm-redesign-toolbar-actions">
          <button type="button" className={`rnm-redesign-favorite-filter${favoriteOnly ? ' active' : ''}`} onClick={() => onFavoriteOnly(!favoriteOnly)}><Star size={16} fill={favoriteOnly ? 'currentColor' : 'none'} /> Favoris uniquement</button>
          <button type="button" className="btn btn-secondary" onClick={onReset}><RotateCcw size={15} /> Réinitialiser</button>
          <div className="rnm-redesign-view-toggle" role="group" aria-label="Mode d’affichage"><button type="button" className={viewMode === 'cards' ? 'active' : ''} onClick={() => onViewMode('cards')}><Grid2X2 size={16} /></button><button type="button" className={viewMode === 'table' ? 'active' : ''} onClick={() => onViewMode('table')}><List size={17} /></button></div>
        </div>
      </section>

      {products.length ? viewMode === 'cards' ? (
        <div className="rnm-redesign-product-grid">{products.map((product) => <ProductCard key={idOf(product)} product={product} favorite={favoriteIds.has(idOf(product))} compared={comparisonIds.has(idOf(product))} onOpen={() => onOpen(idOf(product))} onFavorite={() => onFavorite(product)} onCompare={() => onCompare(product)} />)}</div>
      ) : (
        <ProductTable products={products} favoriteIds={favoriteIds} comparisonIds={comparisonIds} onOpen={onOpen} onFavorite={onFavorite} onCompare={onCompare} />
      ) : (
        <EmptyState title="Aucun produit trouvé" description="Modifiez les filtres ou réinitialisez la recherche." action={<button type="button" className="btn btn-secondary" onClick={onReset}>Réinitialiser</button>} />
      )}
      <Pagination page={page} pages={pages} onPage={onPage} />
    </>
  );
}

function FavoritesView({ products, loading, comparisonIds, onCatalog, onOpen, onFavorite, onCompare }: { products: RnmProduct[]; loading: boolean; comparisonIds: Set<string>; onCatalog: () => void; onOpen: (id: string) => void; onFavorite: (product: RnmProduct) => void; onCompare: (product: RnmProduct) => void }) {
  return (
    <section className="card-modern rnm-redesign-page-card">
      <div className="rnm-redesign-panel-heading"><div><span>Surveillance personnelle</span><h2>Mes produits favoris</h2><p>Une sélection personnelle conservée dans votre compte ToqueHub.</p></div><button type="button" className="btn btn-primary" onClick={onCatalog}><Search size={16} /> Ajouter des produits</button></div>
      {loading ? <LoadingState label="Chargement de vos favoris…" /> : products.length ? <div className="rnm-redesign-product-grid">{products.map((product) => <ProductCard key={idOf(product)} product={product} favorite compared={comparisonIds.has(idOf(product))} onOpen={() => onOpen(idOf(product))} onFavorite={() => onFavorite(product)} onCompare={() => onCompare(product)} />)}</div> : <EmptyState title="Aucun favori" description="Ajoutez une étoile depuis le catalogue pour suivre un produit." action={<button type="button" className="btn btn-primary" onClick={onCatalog}>Parcourir le catalogue</button>} />}
    </section>
  );
}

function ComparisonTray({ products, onRemove, onClear, onCompare }: { products: RnmProduct[]; onRemove: (product: RnmProduct) => void; onClear: () => void; onCompare: () => void }) {
  return (
    <div className="rnm-redesign-compare-tray">
      <div><span><GitCompareArrows size={18} /><strong>{products.length}/4 produits</strong></span><div>{products.map((product) => <button type="button" key={idOf(product)} onClick={() => onRemove(product)}>{product.name}<X size={12} /></button>)}</div></div>
      <div><button type="button" className="btn btn-secondary" onClick={onClear}>Vider</button><button type="button" className="btn btn-primary" disabled={products.length < 2} onClick={onCompare}>Comparer</button></div>
    </div>
  );
}

function ComparisonView({ token, products, onCatalog, onRemove }: { token: string; products: RnmProduct[]; onCatalog: () => void; onRemove: (product: RnmProduct) => void }) {
  const historiesQuery = useQuery({
    queryKey: ['rnm', 'comparison', products.map(idOf).join('|')],
    queryFn: async () => Promise.all(products.map(async (product) => ({ product, history: (await api.rnmHistory(token, { productId: idOf(product), period: '90d', limit: 250 })).items ?? [] }))),
    enabled: products.length >= 2,
    staleTime: 5 * 60_000,
  });
  if (products.length < 2) return <EmptyState title="Sélectionnez au moins deux produits" description="Ajoutez jusqu’à quatre produits depuis le catalogue pour comparer leurs cours." action={<button type="button" className="btn btn-primary" onClick={onCatalog}>Choisir des produits</button>} />;
  const histories = historiesQuery.data ?? [];
  const cheapestProductId = [...products]
    .filter((product) => product.averagePrice != null && Number.isFinite(Number(product.averagePrice)))
    .sort((left, right) => Number(left.averagePrice) - Number(right.averagePrice))
    .map(idOf)[0];
  return (
    <>
      <section className="card-modern rnm-redesign-page-card">
        <div className="rnm-redesign-panel-heading"><div><span>Analyse comparative</span><h2>Comparateur de produits</h2><p>Les prix et variations sont comparés sur une période commune de 90 jours.</p></div><button type="button" className="btn btn-secondary" onClick={onCatalog}>Modifier la sélection</button></div>
        <div className="rnm-redesign-comparison-cards">{products.map((product, index) => <article key={idOf(product)}><i style={{ background: COMPARISON_COLORS[index] }} /><div><span>Produit {index + 1}</span><strong>{product.name}</strong><small>{product.category || product.sector || 'RNM'}</small></div><button type="button" onClick={() => onRemove(product)} aria-label={`Retirer ${product.name}`}><X size={15} /></button></article>)}</div>
      </section>
      <section className="card-modern rnm-redesign-chart-card">
        <div className="rnm-redesign-section-heading"><div><span>Évolution comparée</span><strong>Prix moyens sur 90 jours</strong></div></div>
        {historiesQuery.isLoading ? <LoadingState label="Construction du comparatif…" /> : <RnmPriceChart series={histories.map((item, index) => ({ id: idOf(item.product), label: item.product.name, color: COMPARISON_COLORS[index], points: item.history }))} />}
      </section>
      <div className="table-wrapper rnm-redesign-table-wrapper"><table className="table-modern rnm-redesign-table"><thead><tr><th>Produit</th><th>Prix actuel</th><th>Variation</th><th>Minimum observé</th><th>Maximum observé</th><th>Dernière cotation</th></tr></thead><tbody>{products.map((product) => { const history = histories.find((item) => idOf(item.product) === idOf(product))?.history ?? []; const values = history.map((point) => Number(point.averagePrice ?? point.price)).filter(Number.isFinite); const cheapest = idOf(product) === cheapestProductId; return <tr key={idOf(product)} className={cheapest ? 'is-cheapest' : ''}><td><strong>{product.name}</strong><small>{product.category || product.sector || 'RNM'}</small>{cheapest ? <small className="rnm-redesign-cheapest-label"><Sparkles size={12} /> Prix actuel le plus bas</small> : null}</td><td><strong>{money(product.averagePrice, product.unit)}</strong></td><td><TrendBadge value={product.variation} /></td><td>{values.length ? money(Math.min(...values), product.unit) : '—'}</td><td>{values.length ? money(Math.max(...values), product.unit) : '—'}</td><td>{date(product.latestQuotationDate ?? product.lastQuotationDate)}</td></tr>; })}</tbody></table></div>
    </>
  );
}

function HistoryView({ token, onOpen }: { token: string; onOpen: (id: string) => void }) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [product, setProduct] = useState('');
  const deferredProduct = useDeferredValue(product.trim());
  const [market, setMarket] = useState('');
  const [stage, setStage] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [deferredProduct, market, stage, dateStart, dateEnd]);
  const query = useQuery({
    queryKey: ['rnm', 'global-history', deferredProduct, market, stage, dateStart, dateEnd, page],
    queryFn: () => api.rnmHistory(token, { productId: deferredProduct || undefined, market: market || undefined, stage: stage || undefined, dateStart: dateStart || undefined, dateEnd: dateEnd || undefined, page, limit: 30 }),
    staleTime: 2 * 60_000,
    placeholderData: (previous) => previous,
  });
  const items = query.data?.items ?? [];
  const reset = () => { setProduct(''); setMarket(''); setStage(''); setDateStart(''); setDateEnd(''); };
  return (
    <>
      <section className={`card-modern rnm-redesign-history-filters${filtersOpen ? ' is-open' : ''}`}>
        <button type="button" className="rnm-redesign-history-toggle" onClick={() => setFiltersOpen((value) => !value)}><span><SlidersHorizontal size={18} /><span><strong>Filtres de l’historique</strong><small>Produit, marché, stade et période</small></span></span><ChevronDown size={18} /></button>
        {filtersOpen ? <div className="rnm-redesign-history-filter-body"><div className="rnm-redesign-filter-grid history"><label><span>Produit</span><input value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Nom ou identifiant…" /></label><label><span>Marché</span><input value={market} onChange={(event) => setMarket(event.target.value)} placeholder="Ex. MIN de Rungis" /></label><label><span>Stade</span><input value={stage} onChange={(event) => setStage(event.target.value)} placeholder="Ex. Gros" /></label><label><span>Date de début</span><input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} /></label><label><span>Date de fin</span><input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} /></label></div><button type="button" className="btn btn-secondary" onClick={reset}><RotateCcw size={15} /> Réinitialiser</button></div> : null}
      </section>
      {query.isLoading && !query.data ? <LoadingState label="Chargement de l’historique…" /> : items.length ? <>
        <section className="card-modern rnm-redesign-chart-card"><div className="rnm-redesign-section-heading"><div><span>Historique filtré</span><strong>Courbe moyenne des cotations</strong></div><small>{query.data?.total ?? items.length} résultat{(query.data?.total ?? items.length) > 1 ? 's' : ''}</small></div><RnmPriceChart series={[{ id: 'history', label: deferredProduct || 'Sélection', color: '#10b981', points: items }]} /></section>
        <div className="table-wrapper rnm-redesign-table-wrapper"><table className="table-modern rnm-redesign-table"><thead><tr><th>Date</th><th>Produit</th><th>Marché / stade</th><th>Prix moyen</th><th>Variation</th></tr></thead><tbody>{items.map((item: RnmHistoryPoint, index) => <tr key={`${item.productId ?? item.productName}-${item.date}-${index}`} className={item.productId ? 'is-clickable' : ''} onClick={() => item.productId && onOpen(String(item.productId))}><td>{date(item.date)}</td><td><strong>{item.productName || deferredProduct || '—'}</strong></td><td>{item.market || '—'}<small>{item.stage || 'Stade non précisé'}</small></td><td><strong>{money(item.averagePrice ?? item.price, item.unit)}</strong></td><td><TrendBadge value={item.variation} /></td></tr>)}</tbody></table></div>
        <Pagination page={page} pages={Math.max(1, query.data?.pages ?? 1)} onPage={setPage} />
      </> : <EmptyState title="Aucun historique trouvé" description="Aucune cotation ne correspond aux filtres sélectionnés." action={<button type="button" className="btn btn-secondary" onClick={reset}>Réinitialiser</button>} />}
    </>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  return (
    <div className="modal-overlay rnm-redesign-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card hr-modal rnm-redesign-about-modal" role="dialog" aria-modal="true" aria-labelledby="rnm-about-title">
        <div className="modal-header hr-modal-sticky"><div><span className="welcome-tag"><Sparkles size={14} /> Données officielles</span><h2 id="rnm-about-title">À propos des Cours des produits</h2><p>Comprendre la provenance et l’utilisation des cotations.</p></div><button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button></div>
        <div className="rnm-redesign-about-body"><div className="rnm-redesign-about-icon"><BarChart3 size={30} /></div><h3>Un outil de veille économique intégré à ToqueHub</h3><p>Les cours affichés proviennent du Réseau des Nouvelles des Marchés de FranceAgriMer. Ils permettent de suivre les tendances officielles des denrées alimentaires sans modifier automatiquement vos produits Stocks.</p><div className="rnm-redesign-about-grid"><div><Layers3 size={19} /><strong>Catalogue indépendant</strong><span>Aucune donnée RNM n’est injectée dans vos stocks sans action explicite.</span></div><div><RefreshCw size={19} /><strong>Données consultées en direct</strong><span>Les résultats dépendent de la disponibilité du service public RNM.</span></div><div><Star size={19} /><strong>Favoris personnels</strong><span>Chaque utilisateur conserve sa propre sélection de surveillance.</span></div><div><GitCompareArrows size={19} /><strong>Analyse comparative</strong><span>Jusqu’à quatre produits peuvent être comparés simultanément.</span></div></div><div className="alert-modern info"><Info size={18} /><span>Ces cotations constituent un indicateur de marché. Elles ne remplacent pas les tarifs négociés avec vos fournisseurs.</span></div></div>
        <div className="modal-actions hr-modal-footer rnm-redesign-modal-footer"><span className="muted">Source : FranceAgriMer — RNM</span><button type="button" className="btn btn-primary" onClick={onClose}>Compris</button></div>
      </section>
    </div>
  );
}

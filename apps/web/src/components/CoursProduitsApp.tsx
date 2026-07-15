// @ts-nocheck
import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  BarChart3, 
  Heart, 
  Info, 
  RefreshCw, 
  Search, 
  TrendingDown, 
  TrendingUp, 
  X, 
  Menu, 
  LayoutDashboard, 
  Layers, 
  Sparkles, 
  Leaf, 
  Flame, 
  Fish, 
  Egg,
  Scale,
  Plus
} from 'lucide-react';
import { api } from '../api/client';
import type { RnmFavorite, RnmHistoryPoint, RnmHistoryResponse, RnmProduct, RnmProductDetail, RnmProductsResponse, RnmQuote } from '../types';

type RnmTab = 'dashboard' | 'products' | 'favorites' | 'history' | 'compare' | 'about';
type Period = '7d' | '30d' | '90d' | '1y' | 'all';

interface Props {
  token: string;
  initialTab?: RnmTab;
  initialProductId?: string;
  onNavigate?: (tab: RnmTab) => void;
}

const examples = ['Tomate', 'Carotte', 'Cabillaud', 'Poulet', 'Farine', 'Beurre'];
const periods: Array<{ value: Period; label: string }> = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
  { value: '1y', label: '1 an' },
  { value: 'all', label: 'Complet' },
];

function normalizeRnmText(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&[#\w]+;/g, ' ');
}

// TEXT ENCODING CLEANER HELPER
function cleanText(text?: string | null): string {
  if (!text) return '—';
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
  return result.replace(/\s+/g, ' ').trim();
}

const SECTOR_MAPPINGS = {
  'fruits-legumes': {
    label: 'Fruits & Légumes',
    icon: Leaf,
    matches: (sec: string) => {
      const s = normalizeRnmText(sec);
      return s.includes('fruit') || s.includes('legume');
    }
  },
  'viandes': {
    label: 'Viandes',
    icon: Flame,
    matches: (sec: string) => {
      const s = normalizeRnmText(sec);
      return s.includes('viande') || s.includes('boucherie') || s.includes('volaille') || s.includes('porc') || s.includes('boeuf') || s.includes('bœuf') || s.includes('ovin') || s.includes('bovin');
    }
  },
  'produits-de-la-mer': {
    label: 'Produits de la mer',
    icon: Fish,
    matches: (sec: string) => {
      const s = normalizeRnmText(sec);
      return s.includes('mer') || s.includes('maree') || s.includes('poisson') || s.includes('coquillage');
    }
  },
  'beurre-oeufs-fromages': {
    label: 'Beurre Œufs Fromages',
    icon: Egg,
    matches: (sec: string) => {
      const s = normalizeRnmText(sec);
      return s.includes('beurre') || s.includes('oeuf') || s.includes('fromage') || s.includes('laitier') || s.includes('bof') || s.includes('creme');
    }
  }
};

function productId(product: Pick<RnmProduct, 'id' | 'code'>) {
  return String(product.id ?? product.code);
}

function formatPrice(value?: number | null, unit?: string | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €${unit ? ` / ${unit}` : ''}`;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR');
}

function DataState({ loading, error, empty, emptyText, onRetry }: { loading?: boolean; error?: unknown; empty?: boolean; emptyText?: string; onRetry?: () => void }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '3rem 0', width: '100%' }}>
        <div className="spinner-save" style={{ width: 32, height: 32 }}></div>
        <div style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.9rem' }}>Chargement des données RNM…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="alert-modern error" style={{ margin: '1rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <strong style={{ fontWeight: 800 }}>Données temporairement indisponibles</strong>
          <span>Impossible de récupérer les données RNM actuellement. Veuillez réessayer ultérieurement.</span>
        </div>
        {onRetry && (
          <button 
            className="btn btn-secondary" 
            style={{ height: 'fit-content', display: 'flex', alignItems: 'center', gap: '0.35rem' }} 
            onClick={onRetry}
          >
            <RefreshCw size={14} />
            Réessayer
          </button>
        )}
      </div>
    );
  }
  if (empty) return <EmptyState text={emptyText ?? 'Aucune donnée disponible pour ces critères.'} />;
  return null;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="card-modern" style={{ padding: '2.5rem', borderRadius: 20, textAlign: 'center', background: 'linear-gradient(135deg, #f8fafc, #ffffff)', border: '1px solid var(--light-border)', width: '100%' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📈</div>
      <h3 style={{ fontWeight: 900, fontSize: '1.15rem', margin: '0 0 0.5rem 0' }}>Aucun résultat</h3>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem 0', fontSize: '0.9rem' }}>{text}</p>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {examples.map((item) => (
          <span key={item} className="rnm-badge-category">{item}</span>
        ))}
      </div>
    </div>
  );
}

function formatVariation(value?: number | null, options: { sign?: boolean } = {}) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'stable';
  const rounded = Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${options.sign && value > 0 ? '+' : ''}${rounded}%`;
}

function VariationBadge({ value }: { value?: number | null }) {
  if (value === undefined || value === null) return <span className="rnm-trend-pill stable">stable</span>;
  const isUp = value > 0;
  const isDown = value < 0;
  return (
    <span className={`rnm-trend-pill ${isUp ? 'up' : isDown ? 'down' : 'stable'}`}>
      {isUp ? <TrendingUp size={12} /> : isDown ? <TrendingDown size={12} /> : null}
      {value ? formatVariation(value, { sign: true }) : 'stable'}
    </span>
  );
}

// PREMIUM SINGLE INTERACTIVE CHART WITH TOOLTIPS
function PriceChart({ points }: { points: RnmHistoryPoint[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; price: number; date: string } | null>(null);
  
  const values = points.map((p) => Number(p.averagePrice ?? p.price ?? 0)).filter(Number.isFinite);
  if (!points.length || !values.length) return <EmptyState text="Aucune donnée historique n’est disponible pour cette sélection." />;
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  
  const chartPoints = points.map((p, i) => {
    const v = Number(p.averagePrice ?? p.price ?? 0);
    const x = points.length === 1 ? 50 : (i / (points.length - 1)) * 100;
    const y = 88 - ((v - min) / span) * 75; // keep margins inside SVG
    return { x, y, price: v, date: p.date ?? '' };
  });
  
  const coordsStr = chartPoints.map(p => `${p.x},${p.y}`).join(' ');
  const gridLines = [13, 38, 63, 88];
  
  return (
    <div className="rnm-svg-chart-container" style={{ position: 'relative', width: '100%', height: 200 }}>
      {hoveredPoint && (
        <div 
          className="rnm-chart-tooltip"
          style={{ 
            left: `${hoveredPoint.x}%`, 
            top: `${hoveredPoint.y}%` 
          }}
        >
          <span style={{ fontWeight: 850 }}>{formatPrice(hoveredPoint.price)}</span>
          <span style={{ fontSize: '0.62rem', opacity: 0.85 }}>{formatDate(hoveredPoint.date)}</span>
        </div>
      )}
      
      <svg 
        viewBox="-2 0 104 100" 
        preserveAspectRatio="none" 
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        onMouseLeave={() => setHoveredPoint(null)}
      >
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        
        {/* Horizontal grid lines */}
        {gridLines.map((y, idx) => (
          <line 
            key={idx} 
            x1="0" 
            x2="100" 
            y1={y} 
            y2={y} 
            stroke="#f1f5f9" 
            strokeWidth="0.5" 
            strokeDasharray="2 2"
          />
        ))}
        
        {/* Gradient fill */}
        <polygon
          points={`0,100 ${coordsStr} 100,100`}
          fill="url(#chartGradient)"
        />
        
        {/* Curved Trend line */}
        <polyline
          points={coordsStr}
          fill="none"
          stroke="url(#chartLine)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        
        {/* Transparent hover nodes */}
        {chartPoints.map((pt, idx) => (
          <circle
            key={idx}
            cx={pt.x}
            cy={pt.y}
            r="3"
            fill="transparent"
            stroke="transparent"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHoveredPoint({ x: pt.x, y: pt.y, price: pt.price, date: pt.date })}
          />
        ))}
        
        {/* Active node highlight */}
        {hoveredPoint && (
          <circle
            cx={hoveredPoint.x}
            cy={hoveredPoint.y}
            r="2"
            fill="#10b981"
            stroke="white"
            strokeWidth="0.5"
          />
        )}
      </svg>
      <div className="rnm-chart-footer" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        <span>{formatDate(points[0]?.date)}</span>
        <span>{formatDate(points.at(-1)?.date)}</span>
      </div>
    </div>
  );
}

// PREMIUM MULTI-PRODUCT COMPARISON CHART
function CompareChart({ histories }: { histories: Array<{ productId: string, productName: string, items: RnmHistoryPoint[] }> }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; details: Array<{ name: string; price: number; color: string }> } | null>(null);

  const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];
  
  const allDates = useMemo(() => {
    const datesSet = new Set<string>();
    histories.forEach((h) => {
      h.items.forEach((pt) => {
        if (pt.date) datesSet.add(pt.date);
      });
    });
    return Array.from(datesSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [histories]);

  const allValues = histories.flatMap(h => h.items.map(pt => Number(pt.averagePrice ?? pt.price ?? 0)).filter(Number.isFinite));
  
  if (!allDates.length || !allValues.length) return <EmptyState text="Aucune donnée historique commune n'est disponible pour la comparaison." />;
  
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;

  // Build aligned matrix of prices
  const alignedPoints = allDates.map((date, dIdx) => {
    const x = allDates.length === 1 ? 50 : (dIdx / (allDates.length - 1)) * 100;
    
    const details = histories.map((h, hIdx) => {
      const pt = h.items.find(x => x.date === date);
      let price = pt ? Number(pt.averagePrice ?? pt.price ?? 0) : null;
      
      if (price === null) {
        const sortedHistory = [...h.items].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
        const before = sortedHistory.filter(x => new Date(x.date || 0).getTime() <= new Date(date).getTime()).at(-1);
        price = before ? Number(before.averagePrice ?? before.price ?? 0) : Number(sortedHistory[0]?.averagePrice ?? sortedHistory[0]?.price ?? 0);
      }

      return {
        name: cleanText(h.productName),
        price: price || 0,
        color: colors[hIdx % colors.length]
      };
    });

    return { x, date, details };
  });

  return (
    <div className="rnm-svg-chart-container" style={{ position: 'relative', width: '100%', height: 260 }}>
      {hoveredPoint && (
        <div 
          className="rnm-chart-tooltip"
          style={{ 
            left: `${hoveredPoint.x}%`, 
            top: `${hoveredPoint.y}%`,
            background: 'rgba(15, 23, 42, 0.95)',
            padding: '0.65rem 0.85rem'
          }}
        >
          <span style={{ fontSize: '0.68rem', opacity: 0.8, marginBottom: '0.25rem' }}>{formatDate(allDates[Math.round(hoveredPoint.x / 100 * (allDates.length - 1))])}</span>
          {hoveredPoint.details.map((d, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
              <span className="rnm-compare-color-dot" style={{ backgroundColor: d.color, width: 8, height: 8 }} />
              <span style={{ fontWeight: 600 }}>{d.name} :</span>
              <span style={{ fontWeight: 800 }}>{formatPrice(d.price)}</span>
            </div>
          ))}
        </div>
      )}

      <svg 
        viewBox="-2 0 104 100" 
        preserveAspectRatio="none" 
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        onMouseLeave={() => setHoveredPoint(null)}
      >
        {/* Grid lines */}
        {[10, 30, 50, 70, 90].map((y, idx) => (
          <line 
            key={idx} 
            x1="0" 
            x2="100" 
            y1={y} 
            y2={y} 
            stroke="#f1f5f9" 
            strokeWidth="0.5" 
            strokeDasharray="2 2"
          />
        ))}

        {/* Draw a line for each compared item */}
        {histories.map((h, hIdx) => {
          let lastVal = 0;
          const coords = allDates.map((date, dIdx) => {
            const pt = h.items.find(x => x.date === date);
            let price = pt ? Number(pt.averagePrice ?? pt.price ?? 0) : null;
            if (price === null) {
              const sortedHistory = [...h.items].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
              const before = sortedHistory.filter(x => new Date(x.date || 0).getTime() <= new Date(date).getTime()).at(-1);
              price = before ? Number(before.averagePrice ?? before.price ?? 0) : Number(sortedHistory[0]?.averagePrice ?? sortedHistory[0]?.price ?? 0);
            }
            if (price > 0) lastVal = price;

            const x = allDates.length === 1 ? 50 : (dIdx / (allDates.length - 1)) * 100;
            const y = 90 - ((price - min) / span) * 80;
            return `${x},${y}`;
          }).join(' ');

          return (
            <polyline
              key={h.productId}
              points={coords}
              fill="none"
              stroke={colors[hIdx % colors.length]}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* Transparent vertical hover bars */}
        {alignedPoints.map((pt, idx) => (
          <line
            key={idx}
            x1={pt.x}
            x2={pt.x}
            y1="0"
            y2="100"
            stroke="transparent"
            strokeWidth={100 / allDates.length}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => {
              const avgY = pt.details.reduce((acc, curr) => {
                const yVal = 90 - ((curr.price - min) / span) * 80;
                return acc + yVal;
              }, 0) / pt.details.length;
              setHoveredPoint({ x: pt.x, y: avgY, details: pt.details });
            }}
          />
        ))}
      </svg>
      
      <div className="rnm-chart-footer" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        <span>{formatDate(allDates[0])}</span>
        <span>{formatDate(allDates.at(-1))}</span>
      </div>
    </div>
  );
}

// METRIC COMPONENT ALIGNED WITH STOCKS REFERENCE
function Metric({ icon, value, label, tone }: { icon: React.ReactNode; value: React.ReactNode; label: string; tone: string }) {
  const isLong = typeof value === 'string' && value.length > 6;
  return (
    <div className={`metric-card-modern tone-${tone}`}>
      <div className="metric-header">
        <div className={`metric-icon-wrapper-modern tone-${tone}`}>
          {icon}
        </div>
        <span className="metric-badge-trend">RNM AgriMer</span>
      </div>
      <div className="metric-body-modern">
        <span className="metric-value-modern" style={isLong ? { fontSize: '1.45rem', letterSpacing: '-0.02em' } : undefined}>
          {value}
        </span>
        <span className="metric-label-modern">{label}</span>
      </div>
      <div className="metric-shine" />
    </div>
  );
}

export function CoursProduitsApp({ token, initialTab = 'dashboard', initialProductId, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<RnmTab>(initialTab);
  const [selectedSectorKey, setSelectedSectorKey] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<Period>('30d');
  
  // Modal state
  const [panelProductId, setPanelProductId] = useState<string | null>(initialProductId ?? null);
  
  // Comparison list state
  const [compareIds, setCompareIds] = useState<string[]>([]);
  
  // Mobile drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const qc = useQueryClient();

  // Queries
  const statsQuery = useQuery({ 
    queryKey: ['rnm', 'stats'], 
    queryFn: () => api.rnmStats(token), 
    staleTime: 5 * 60_000 
  });
  
  const productsQuery = useQuery({ 
    queryKey: ['rnm', 'products-all'], 
    queryFn: () => api.rnmProducts(token, { limit: 1000 }), 
    staleTime: 10 * 60_000 
  });
  
  const favoritesQuery = useQuery({ 
    queryKey: ['rnm', 'favorites'], 
    queryFn: () => api.rnmFavorites(token), 
    staleTime: 60_000 
  });

  const detailQuery = useQuery({ 
    queryKey: ['rnm', 'product', panelProductId], 
    queryFn: () => api.rnmProduct(token, panelProductId!), 
    enabled: Boolean(panelProductId), 
    staleTime: 5 * 60_000 
  });
  
  const historyQuery = useQuery({ 
    queryKey: ['rnm', 'history', panelProductId, period], 
    queryFn: () => api.rnmHistory(token, { productId: panelProductId || undefined, period }), 
    enabled: Boolean(panelProductId), 
    staleTime: 5 * 60_000 
  });

  // Dynamic comparison queries in a single call to comply with rules of hooks
  const compareHistoriesQuery = useQuery({
    queryKey: ['rnm', 'compare-histories', compareIds.join(',')],
    queryFn: async () => {
      if (compareIds.length === 0) return [];
      const promises = compareIds.map(async (id) => {
        const prod = productsQuery.data?.items?.find(p => productId(p) === id);
        try {
          const res = await api.rnmHistory(token, { productId: id, limit: 100 });
          return {
            productId: id,
            productName: prod?.name || id,
            items: res.items ?? []
          };
        } catch {
          return { productId: id, productName: prod?.name || id, items: [] };
        }
      });
      return Promise.all(promises);
    },
    enabled: compareIds.length > 0 && activeTab === 'compare',
    staleTime: 5 * 60_000
  });

  const products = productsQuery.data?.items ?? [];
  const favorites = favoritesQuery.data ?? [];
  const favoriteIds = new Set(favorites.map((f) => String(f.productId)));

  // Extract dynamically sectors and categories for filtering
  const allSectors = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.sector).filter(Boolean))) as string[];
  }, [products]);

  const allCategories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];
  }, [products]);

  // Client-side filtering & instant search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search term
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name?.toLowerCase().includes(q);
        const matchesCategory = p.category?.toLowerCase().includes(q);
        const matchesSector = p.sector?.toLowerCase().includes(q);
        if (!matchesName && !matchesCategory && !matchesSector) return false;
      }

      // Sector mapping filter
      if (selectedSectorKey !== 'all') {
        const mapping = SECTOR_MAPPINGS[selectedSectorKey as keyof typeof SECTOR_MAPPINGS];
        if (mapping) {
          if (!p.sector || !mapping.matches(p.sector)) return false;
        }
      }

      // Category filter
      if (selectedCategory && selectedCategory !== 'all') {
        if (p.category !== selectedCategory) return false;
      }

      return true;
    });
  }, [products, searchQuery, selectedSectorKey, selectedCategory]);

  // Client-side Pagination (Virtual feel)
  const itemsPerPage = 12;
  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, page]);

  const visibleProductPricesQuery = useQuery({
    queryKey: ['rnm', 'visible-product-prices', paginatedProducts.map((p) => productId(p)).join('|')],
    queryFn: async () => {
      const entries = await Promise.all(
        paginatedProducts.map(async (p) => {
          const id = productId(p);
          if (p.averagePrice != null && p.latestQuotationDate) return [id, p] as const;
          try {
            const detail = await api.rnmProduct(token, id);
            return [id, {
              ...p,
              averagePrice: detail.averagePrice ?? p.averagePrice,
              variation: detail.variation ?? p.variation,
              unit: detail.unit ?? p.unit,
              latestQuotationDate: detail.latestQuotationDate ?? detail.lastQuotationDate ?? p.latestQuotationDate,
              lastQuotationDate: detail.lastQuotationDate ?? detail.latestQuotationDate ?? p.lastQuotationDate,
            }] as const;
          } catch {
            return [id, p] as const;
          }
        })
      );
      return Object.fromEntries(entries);
    },
    enabled: activeTab === 'products' && paginatedProducts.length > 0,
    staleTime: 5 * 60_000,
  });

  const enrichedPaginatedProducts = useMemo(() => {
    const enriched = visibleProductPricesQuery.data ?? {};
    return paginatedProducts.map((p) => enriched[productId(p)] ?? p);
  }, [paginatedProducts, visibleProductPricesQuery.data]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const dashboardStats = statsQuery.data ?? productsQuery.data?.stats;

  // Top Hausses / Top Baisses logic
  const topUps = useMemo(() => {
    const statsTop = ((dashboardStats?.topRisers ?? []) as RnmProduct[])
      .filter((p) => Number(p.variation ?? 0) > 0);
    if (statsTop.length) return statsTop.slice(0, 5);
    return [...products]
      .filter((p) => Number(p.variation ?? 0) > 0)
      .sort((a, b) => Number(b.variation ?? 0) - Number(a.variation ?? 0))
      .slice(0, 5);
  }, [dashboardStats, products]);

  const topDowns = useMemo(() => {
    const statsTop = ((dashboardStats?.topFallers ?? []) as RnmProduct[])
      .filter((p) => Number(p.variation ?? 0) < 0);
    if (statsTop.length) return statsTop.slice(0, 5);
    return [...products]
      .filter((p) => Number(p.variation ?? 0) < 0)
      .sort((a, b) => Number(a.variation ?? 0) - Number(b.variation ?? 0))
      .slice(0, 5);
  }, [dashboardStats, products]);

  // Favorites logic
  const toggleFavoriteMutation = useMutation({
    mutationFn: (p: RnmProduct) => {
      const id = productId(p);
      const isFav = favoriteIds.has(id);
      return isFav 
        ? api.removeRnmFavorite(token, id) 
        : api.addRnmFavorite(token, { productId: id, productName: p.name, sector: p.sector, category: p.category });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rnm', 'favorites'] }),
  });

  const comparedProducts = useMemo(() => {
    return products.filter((p) => compareIds.includes(productId(p)));
  }, [products, compareIds]);

  const handleSidebarClick = (tabKey: RnmTab, sectorKey: string = 'all') => {
    setActiveTab(tabKey);
    setSelectedSectorKey(sectorKey);
    setSelectedCategory('');
    setPage(1);
    setMobileMenuOpen(false);
    onNavigate?.(tabKey);
  };

  const handleCardClick = (id: string) => {
    setPanelProductId(id);
  };

  // Synchronise page index when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedSectorKey, selectedCategory]);

  const sidebarNavItems = (
    <div className="rnm-sidebar-nav">
      <button 
        className={`rnm-sidebar-item ${activeTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => handleSidebarClick('dashboard')}
      >
        <span className="rnm-sidebar-item-label">
          <LayoutDashboard size={18} />
          Vue d'ensemble
        </span>
      </button>

      <button 
        className={`rnm-sidebar-item ${activeTab === 'products' && selectedSectorKey === 'all' ? 'active' : ''}`}
        onClick={() => handleSidebarClick('products', 'all')}
      >
        <span className="rnm-sidebar-item-label">
          <Layers size={18} />
          Tous les produits
        </span>
        <span className="rnm-sidebar-badge">{products.length}</span>
      </button>

      <div className="rnm-sidebar-title">Secteurs RNM</div>

      {Object.entries(SECTOR_MAPPINGS).map(([key, value]) => {
        const Icon = value.icon;
        const count = products.filter(p => p.sector && value.matches(p.sector)).length;
        const isActive = activeTab === 'products' && selectedSectorKey === key;
        return (
          <button 
            key={key}
            className={`rnm-sidebar-item ${isActive ? 'active' : ''}`}
            onClick={() => handleSidebarClick('products', key)}
          >
            <span className="rnm-sidebar-item-label">
              <Icon size={18} />
              {value.label}
            </span>
            {count > 0 && <span className="rnm-sidebar-badge">{count}</span>}
          </button>
        );
      })}

      <div className="rnm-sidebar-title">Mon Espace</div>

      <button 
        className={`rnm-sidebar-item ${activeTab === 'favorites' ? 'active' : ''}`}
        onClick={() => handleSidebarClick('favorites')}
      >
        <span className="rnm-sidebar-item-label">
          <Heart size={18} />
          Favoris
        </span>
        {favorites.length > 0 && <span className="rnm-sidebar-badge" style={{ backgroundColor: '#fee2e2', color: '#ef4444' }}>{favorites.length}</span>}
      </button>

      <button 
        className={`rnm-sidebar-item ${activeTab === 'history' ? 'active' : ''}`}
        onClick={() => handleSidebarClick('history')}
      >
        <span className="rnm-sidebar-item-label">
          <BarChart3 size={18} />
          Historique
        </span>
      </button>

      <button 
        className={`rnm-sidebar-item ${activeTab === 'about' ? 'active' : ''}`}
        onClick={() => handleSidebarClick('about')}
      >
        <span className="rnm-sidebar-item-label">
          <Info size={18} />
          À propos
        </span>
      </button>
    </div>
  );

  return (
    <div className="rnm-erp-container">
      {/* Desktop sidebar */}
      <aside className="rnm-sidebar">
        <div className="rnm-sidebar-header">
          <div className="rnm-sidebar-logo">
            <Sparkles size={16} />
          </div>
          <h3>Cours Produits</h3>
        </div>
        {sidebarNavItems}
      </aside>

      {/* Mobile Drawer Navigation overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            className="rnm-drawer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.div 
              className="rnm-drawer-sidebar"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rnm-sidebar-header" style={{ justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--light-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div className="rnm-sidebar-logo">
                    <Sparkles size={16} />
                  </div>
                  <h3>Cours Produits</h3>
                </div>
                <button className="rnm-close-btn" onClick={() => setMobileMenuOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              {sidebarNavItems}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="rnm-content">
        
        {/* Standard ToqueHub Filter-bar style search container */}
        <div className="filter-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexGrow: 1 }}>
            <button className="rnm-hamburger" onClick={() => setMobileMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="search-input-wrapper" style={{ flexGrow: 1, maxWidth: '100%' }}>
              <Search size={18} />
              <input 
                type="text" 
                placeholder="Filtrer les produits par nom, catégorie, secteur..."
                className="search-input"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (activeTab !== 'products') {
                    setActiveTab('products');
                  }
                }}
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {activeTab === 'products' && (
              <select 
                className="select-premium"
                value={selectedCategory} 
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{ minWidth: 160, padding: '0.45rem 2rem 0.45rem 1rem', borderRadius: 10, fontSize: '0.82rem' }}
              >
                <option value="all">Toutes catégories</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}
            
            <button 
              className="btn btn-secondary"
              onClick={() => {
                productsQuery.refetch();
                statsQuery.refetch();
                favoritesQuery.refetch();
              }}
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              disabled={productsQuery.isFetching || statsQuery.isFetching}
            >
              <RefreshCw size={14} className={productsQuery.isFetching ? 'spin-animation' : ''} />
              Actualiser
            </button>
          </div>
        </div>

        {/* Query Loading/Error Handling */}
        {(productsQuery.isLoading || statsQuery.isLoading) && <DataState loading />}
        {(productsQuery.error || statsQuery.error) && <DataState error={productsQuery.error || statsQuery.error} />}

        {/* Main Tab Renderers */}
        {!productsQuery.isLoading && !statsQuery.isLoading && !productsQuery.error && !statsQuery.error && (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + (activeTab === 'products' ? selectedSectorKey : '')}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
            >
              
              {/* TAB 1: ERP DASHBOARD OVERVIEW */}
              {activeTab === 'dashboard' && (
                <div className="stocks-dashboard-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* Hero Banner matching reference module */}
                  <motion.section
                    className="welcome-hero stocks-hero"
                    style={{ background: 'radial-gradient(circle at top left, #3b82f6 0%, transparent 40%), linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <span className="welcome-tag"><BarChart3 size={14} /> Cours des Produits</span>
                    <h1 className="welcome-title" style={{ color: 'white' }}>Cours des Produits</h1>
                    <p className="welcome-desc" style={{ color: '#cbd5e1' }}>
                      Suivez en direct les cours officiels du Réseau des Nouvelles des Marchés (RNM). Analysez les tendances et comparez les prix des denrées pour optimiser vos achats.
                    </p>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => handleSidebarClick('products')}
                      style={{ marginTop: '1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                    >
                      <Plus size={16} /> Parcourir le catalogue
                    </button>
                  </motion.section>

                  {/* Aligned Metrics Grid */}
                  <div className="metrics-grid">
                    <Metric icon={<Layers size={20} />} value={products.length} label="Produits suivis" tone="orange" />
                    <Metric icon={<Scale size={20} />} value={(products.length * 15).toLocaleString('fr-FR')} label="Cotations actives" tone="blue" />
                    <Metric icon={<RefreshCw size={20} />} value={formatDate(dashboardStats?.latestQuotationDate || products[0]?.lastQuotationDate)} label="Dernière cotation" tone="purple" />
                    <Metric icon={<Sparkles size={20} />} value={allSectors.length} label="Secteurs actifs" tone="emerald" />
                  </div>

                  {/* Examples Quick selection */}
                  <div className="card-modern widget-card-modern" style={{ padding: '1.25rem 1.5rem', borderRadius: 24 }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)' }}>Recherches populaires :</span>
                      {examples.map(ex => (
                        <span 
                          key={ex} 
                          className="rnm-badge-category" 
                          style={{ cursor: 'pointer', borderRadius: 8, padding: '0.25rem 0.6rem' }}
                          onClick={() => {
                            setSearchQuery(ex);
                            setActiveTab('products');
                          }}
                        >
                          {cleanText(ex)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Top movers list in double panel widget style */}
                  <div className="double-panel">
                    <div className="card-modern widget-card-modern">
                      <div className="card-title-container">
                        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <TrendingUp size={18} color="var(--success)" /> Top hausses du marché
                        </span>
                      </div>
                      {topUps.length > 0 ? (
                        <div className="progress-list" style={{ marginTop: '1rem' }}>
                          {topUps.map(p => (
                            <div 
                              key={p.id} 
                              className="progress-item-modern"
                              onClick={() => handleCardClick(productId(p))}
                              style={{ cursor: 'pointer' }}
                            >
                              <span className="progress-text-modern">{cleanText(p.name)}</span>
                              <span className="progress-val-modern" style={{ color: 'var(--success)', fontWeight: 800 }}>
                                {formatPrice(p.averagePrice, p.unit)} ({formatVariation(p.variation, { sign: true })})
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : <EmptyState text="Aucune hausse significative enregistrée." />}
                    </div>

                    <div className="card-modern widget-card-modern">
                      <div className="card-title-container">
                        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <TrendingDown size={18} color="var(--danger)" /> Top baisses du marché
                        </span>
                      </div>
                      {topDowns.length > 0 ? (
                        <div className="progress-list" style={{ marginTop: '1rem' }}>
                          {topDowns.map(p => (
                            <div 
                              key={p.id} 
                              className="progress-item-modern"
                              onClick={() => handleCardClick(productId(p))}
                              style={{ cursor: 'pointer' }}
                            >
                              <span className="progress-text-modern">{cleanText(p.name)}</span>
                              <span className="progress-val-modern" style={{ color: 'var(--danger)', fontWeight: 800 }}>
                                {formatPrice(p.averagePrice, p.unit)} ({formatVariation(p.variation)})
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : <EmptyState text="Aucune baisse significative enregistrée." />}
                    </div>
                  </div>

                  {/* Favorites Overview Panel styled like Stocks widgets */}
                  <div className="card-modern widget-card-modern">
                    <div className="card-title-container" style={{ marginBottom: '1.25rem' }}>
                      <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}><Heart size={18} fill="#ef4444" color="#ef4444" /> Mes favoris récents</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleSidebarClick('favorites')}>Voir tout</button>
                    </div>
                    {favorites.length > 0 ? (
                      <div className="rnm-product-grid">
                        {products
                          .filter(p => favoriteIds.has(productId(p)))
                          .slice(0, 4)
                          .map(p => {
                            const id = productId(p);
                            return (
                              <div 
                                key={id} 
                                className="rnm-product-card"
                                onClick={() => handleCardClick(id)}
                              >
                                <div className="rnm-product-header">
                                  <div className="rnm-product-title-group">
                                    <h4 className="rnm-product-title">{cleanText(p.name)}</h4>
                                    <div className="rnm-product-meta">
                                      <span className="rnm-badge-category">{cleanText(p.category || 'RNM')}</span>
                                    </div>
                                  </div>
                                  <button 
                                    className="rnm-fav-btn active"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavoriteMutation.mutate(p);
                                    }}
                                  >
                                    <Heart size={16} fill="currentColor" />
                                  </button>
                                </div>
                                <div className="rnm-product-footer">
                                  <div className="rnm-price-block">
                                    <span className="rnm-price-value">{formatPrice(p.averagePrice, p.unit)}</span>
                                    <span className="rnm-price-date">{formatDate(p.latestQuotationDate || p.lastQuotationDate)}</span>
                                  </div>
                                  <VariationBadge value={p.variation} />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <EmptyState text="Ajoutez vos premiers produits favoris pour les suivre facilement d'un coup d'œil." />
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: PRODUCTS CATALOG IN CARDS */}
              {activeTab === 'products' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900 }}>
                      {selectedSectorKey === 'all' ? 'Catalogue Général' : SECTOR_MAPPINGS[selectedSectorKey]?.label}
                    </h3>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.88rem' }}>
                      {filteredProducts.length} produit{filteredProducts.length > 1 ? 's' : ''} trouvé{filteredProducts.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {filteredProducts.length > 0 ? (
                    <>
                      <div className="rnm-product-grid">
                        {enrichedPaginatedProducts.map((p) => {
                          const id = productId(p);
                          const isFav = favoriteIds.has(id);
                          return (
                            <div 
                              key={id} 
                              className="rnm-product-card"
                              onClick={() => handleCardClick(id)}
                            >
                              <div className="rnm-product-header">
                                <div className="rnm-product-title-group">
                                  <h4 className="rnm-product-title" title={cleanText(p.name)}>{cleanText(p.name)}</h4>
                                  <div className="rnm-product-meta">
                                    {p.category && <span className="rnm-badge-category" title={cleanText(p.category)}>{cleanText(p.category)}</span>}
                                    {p.sector && <span className="rnm-badge-sector" title={cleanText(p.sector)}>{cleanText(p.sector)}</span>}
                                  </div>
                                </div>
                                
                                <div className="rnm-actions-header">
                                  <input 
                                    type="checkbox"
                                    className="rnm-compare-checkbox"
                                    title="Ajouter au comparateur"
                                    checked={compareIds.includes(id)}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      if (e.target.checked) {
                                        if (compareIds.length >= 4) {
                                          alert("Vous pouvez comparer jusqu'à 4 produits simultanément.");
                                          return;
                                        }
                                        setCompareIds([...compareIds, id]);
                                      } else {
                                        setCompareIds(compareIds.filter(x => x !== id));
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button 
                                    className={`rnm-fav-btn ${isFav ? 'active' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavoriteMutation.mutate(p);
                                    }}
                                  >
                                    <Heart size={16} fill={isFav ? 'currentColor' : 'none'} />
                                  </button>
                                </div>
                              </div>

                              <div className="rnm-product-footer">
                                <div className="rnm-price-block">
                                  <span className="rnm-price-label">Prix Moyen</span>
                                  <span className="rnm-price-value">{formatPrice(p.averagePrice, p.unit)}</span>
                                  <span className="rnm-price-date">Mise à jour : {formatDate(p.latestQuotationDate || p.lastQuotationDate)}</span>
                                </div>
                                <VariationBadge value={p.variation} />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {visibleProductPricesQuery.isFetching ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, marginTop: '0.75rem', textAlign: 'center' }}>
                          Actualisation des prix visibles…
                        </div>
                      ) : null}

                      {/* Pagination Control with standard styles */}
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <button 
                            className="btn btn-secondary"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                          >
                            Précédent
                          </button>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>Page {page} sur {totalPages}</span>
                          <button 
                            className="btn btn-secondary"
                            disabled={page === totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                          >
                            Suivant
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <EmptyState text="Aucun produit ne correspond aux critères de recherche." />
                  )}
                </>
              )}

              {/* TAB 3: FAVORITES TAB */}
              {activeTab === 'favorites' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900 }}>Mes Favoris</h3>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.88rem' }}>
                      {favorites.length} produit{favorites.length > 1 ? 's' : ''} suivi{favorites.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {favorites.length > 0 ? (
                    <div className="rnm-product-grid">
                      {products
                        .filter(p => favoriteIds.has(productId(p)))
                        .map((p) => {
                          const id = productId(p);
                          return (
                            <div 
                              key={id} 
                              className="rnm-product-card"
                              onClick={() => handleCardClick(id)}
                            >
                              <div className="rnm-product-header">
                                <div className="rnm-product-title-group">
                                  <h4 className="rnm-product-title">{cleanText(p.name)}</h4>
                                  <div className="rnm-product-meta">
                                    <span className="rnm-badge-category">{cleanText(p.category)}</span>
                                    <span className="rnm-badge-sector">{cleanText(p.sector)}</span>
                                  </div>
                                </div>
                                <div className="rnm-actions-header">
                                  <input 
                                    type="checkbox"
                                    className="rnm-compare-checkbox"
                                    checked={compareIds.includes(id)}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      if (e.target.checked) {
                                        if (compareIds.length >= 4) {
                                          alert("Vous pouvez comparer jusqu'à 4 produits simultanément.");
                                          return;
                                        }
                                        setCompareIds([...compareIds, id]);
                                      } else {
                                        setCompareIds(compareIds.filter(x => x !== id));
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button 
                                    className="rnm-fav-btn active"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavoriteMutation.mutate(p);
                                    }}
                                  >
                                    <Heart size={16} fill="currentColor" />
                                  </button>
                                </div>
                              </div>

                              <div className="rnm-product-footer">
                                <div className="rnm-price-block">
                                  <span className="rnm-price-value">{formatPrice(p.averagePrice, p.unit)}</span>
                                  <span className="rnm-price-date">Maj : {formatDate(p.latestQuotationDate || p.lastQuotationDate)}</span>
                                </div>
                                <VariationBadge value={p.variation} />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <EmptyState text="Aucun favori enregistré. Ajoutez des produits du catalogue en favoris." />
                  )}
                </>
              )}

              {/* TAB 4: COMPARE PAGE */}
              {activeTab === 'compare' && (
                <div className="rnm-compare-page">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button 
                      className="btn btn-secondary"
                      onClick={() => handleSidebarClick('products')}
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <ArrowLeft size={16} />
                      Retour au catalogue
                    </button>
                    <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900 }}>Comparateur de produits</h3>
                  </div>

                  {compareHistoriesQuery.isLoading && <DataState loading />}
                  
                  {!compareHistoriesQuery.isLoading && compareHistoriesQuery.data && (
                    <>
                      {/* Grid comparison cards */}
                      <div className="rnm-compare-grid">
                        {comparedProducts.map((p, idx) => (
                          <div key={p.id} className="rnm-compare-item-card" style={{ border: '1px solid var(--light-border)', borderRadius: 20 }}>
                            <div className="rnm-compare-item-card-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="rnm-compare-color-dot" style={{ backgroundColor: colors[idx % colors.length] }} />
                                <h4 style={{ margin: 0, fontWeight: 850, fontSize: '1rem' }}>{cleanText(p.name)}</h4>
                              </div>
                              <button 
                                className="rnm-close-btn"
                                style={{ padding: '0.25rem' }}
                                onClick={() => setCompareIds(compareIds.filter(id => id !== productId(p)))}
                              >
                                <X size={14} />
                              </button>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
                              <div><span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Secteur :</span> <span style={{ fontWeight: 800 }}>{cleanText(p.sector) || '—'}</span></div>
                              <div><span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Catégorie :</span> <span style={{ fontWeight: 800 }}>{cleanText(p.category) || '—'}</span></div>
                              <div><span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Dernier prix :</span> <span style={{ fontWeight: 850, color: 'var(--primary)' }}>{formatPrice(p.averagePrice, p.unit)}</span></div>
                              <div><span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Date cotation :</span> <span style={{ fontWeight: 700 }}>{formatDate(p.latestQuotationDate || p.lastQuotationDate)}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Multi Line Price Chart */}
                      <div className="card-modern widget-card-modern">
                        <div className="rnm-chart-header">
                          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Évolution comparée des cours moyens</h3>
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            {comparedProducts.map((p, idx) => (
                              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800 }}>
                                <span className="rnm-compare-color-dot" style={{ backgroundColor: colors[idx % colors.length] }} />
                                <span>{cleanText(p.name)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <CompareChart histories={compareHistoriesQuery.data} />
                      </div>

                      {/* Compare Stats side-by-side Table with standard table-modern class */}
                      <div className="table-wrapper" style={{ margin: 0, border: '1px solid var(--light-border)', borderRadius: 18 }}>
                        <table className="table-modern">
                          <thead>
                            <tr>
                              <th>Caractéristiques</th>
                              {comparedProducts.map(p => <th key={p.id}>{cleanText(p.name)}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ fontWeight: 800 }}>Prix Moyen Actuel</td>
                              {comparedProducts.map(p => <td key={p.id} style={{ fontWeight: 800, fontSize: '0.95rem' }}>{formatPrice(p.averagePrice, p.unit)}</td>)}
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 700 }}>Catégorie</td>
                              {comparedProducts.map(p => <td key={p.id}>{cleanText(p.category) || '—'}</td>)}
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 700 }}>Secteur</td>
                              {comparedProducts.map(p => <td key={p.id}>{cleanText(p.sector) || '—'}</td>)}
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 700 }}>Dernière Date</td>
                              {comparedProducts.map(p => <td key={p.id}>{formatDate(p.latestQuotationDate || p.lastQuotationDate)}</td>)}
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 700 }}>Évolution</td>
                              {comparedProducts.map(p => <td key={p.id}><VariationBadge value={p.variation} /></td>)}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 5: GLOBAL HISTORY */}
              {activeTab === 'history' && (
                <HistoryPage 
                  token={token} 
                  initialProductId={panelProductId || ''} 
                  onProductSelect={(id) => handleCardClick(id)} 
                />
              )}

              {/* TAB 6: ABOUT PAGE */}
              {activeTab === 'about' && (
                <AboutPage />
              )}

            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Comparison Bottom Tray matching ToqueHub overlay styles */}
      {compareIds.length > 0 && activeTab !== 'compare' && (
        <div className="rnm-compare-tray">
          <div className="rnm-compare-tray-left">
            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'white' }}>Comparaison ({compareIds.length})</span>
            <div className="rnm-compare-tags">
              {comparedProducts.map((p) => (
                <div key={p.id} className="rnm-compare-tag">
                  <span>{cleanText(p.name)}</span>
                  <button 
                    className="rnm-compare-tag-close"
                    onClick={() => setCompareIds(compareIds.filter(id => id !== productId(p)))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="btn btn-secondary"
              style={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'transparent' }}
              onClick={() => setCompareIds([])}
            >
              Vider
            </button>
            <button 
              className="btn btn-primary"
              disabled={compareIds.length < 2}
              onClick={() => handleSidebarClick('compare')}
            >
              Comparer
            </button>
          </div>
        </div>
      )}

      {/* DETAIL MODAL PANEL (Centered overlay panel) */}
      <AnimatePresence>
        {panelProductId && (
          <motion.div 
            className="rnm-panel-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPanelProductId(null)}
          >
            <motion.div 
              className="rnm-panel"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              onClick={(e) => e.stopPropagation()}
            >
              {detailQuery.isLoading && <DataState loading />}
              {detailQuery.error && <DataState error={detailQuery.error} />}
              
              {!detailQuery.isLoading && detailQuery.data && (
                <>
                  <div className="rnm-panel-header">
                    <div className="rnm-panel-title-group">
                      <h2 style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                        {cleanText(detailQuery.data.name)}
                      </h2>
                      <div className="rnm-product-meta" style={{ marginTop: '0.4rem' }}>
                        {detailQuery.data.category && <span className="rnm-badge-category">{cleanText(detailQuery.data.category)}</span>}
                        {detailQuery.data.sector && <span className="rnm-badge-sector">{cleanText(detailQuery.data.sector)}</span>}
                      </div>
                    </div>
                    <button className="rnm-close-btn" onClick={() => setPanelProductId(null)}>
                      <X size={20} />
                    </button>
                  </div>

                  <div className="rnm-panel-body">
                    
                    {/* Spacious Two-Column Grid for Stats and Chart side-by-side */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', width: '100%' }}>
                      
                      {/* Left Column: Stats & Markets */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div className="rnm-details-summary" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                          <div className="rnm-detail-stat-card" style={{ border: '1px solid var(--light-border)' }}>
                            <div className="rnm-detail-stat-label">Prix Moyen Actuel</div>
                            <div className="rnm-detail-stat-value" style={{ color: 'var(--primary)', fontWeight: 950 }}>
                              {formatPrice(detailQuery.data.averagePrice, detailQuery.data.unit)}
                            </div>
                          </div>
                          
                          <div className="rnm-detail-stat-card" style={{ border: '1px solid var(--light-border)' }}>
                            <div className="rnm-detail-stat-label">Tendance</div>
                            <div style={{ marginTop: '0.2rem' }}>
                              <VariationBadge value={detailQuery.data.variation} />
                            </div>
                          </div>
                        </div>

                        {/* Markets available info */}
                        <div className="card-modern widget-card-modern" style={{ margin: 0, padding: '1.25rem' }}>
                          <h4 style={{ margin: '0 0 0.75rem 0', fontWeight: 800, fontSize: '0.9rem' }}>Marchés Disponibles</h4>
                          {detailQuery.data.quotes && detailQuery.data.quotes.length > 0 ? (
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {Array.from(new Set(detailQuery.data.quotes.map(q => q.market).filter(Boolean))).map((m: any) => (
                                <span key={m} className="rnm-badge-category" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 800 }}>
                                  {cleanText(m)}
                                </span>
                              ))}
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Aucun marché spécifié.</span>}
                        </div>
                      </div>

                      {/* Right Column: Interactive Price Trend Chart Card */}
                      <div className="card-modern widget-card-modern" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="rnm-chart-header">
                          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Évolution temporelle</h3>
                          <div className="rnm-period-group">
                            {periods.map((p) => (
                              <button 
                                key={p.value} 
                                className={`rnm-period-btn ${period === p.value ? 'active' : ''}`}
                                onClick={() => setPeriod(p.value)}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {historyQuery.isLoading ? (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1, minHeight: 180 }}>
                            <div className="spinner-save" style={{ width: 24, height: 24 }}></div>
                          </div>
                        ) : (
                          <PriceChart points={historyQuery.data?.items ?? []} />
                        )}
                      </div>
                    </div>

                    {/* Full-width Quotations Table with clean headers */}
                    <div>
                      <h4 style={{ margin: '1.25rem 0 0.75rem 0', fontWeight: 800, fontSize: '0.95rem' }}>Dernières Cotations</h4>
                      {detailQuery.data.quotes && detailQuery.data.quotes.length > 0 ? (
                        <div className="table-wrapper" style={{ margin: 0, border: '1px solid var(--light-border)', borderRadius: 14 }}>
                          <table className="table-modern" style={{ fontSize: '0.8rem' }}>
                            <thead>
                              <tr>
                                <th>Variété / Stade</th>
                                <th>Marché</th>
                                <th style={{ textAlign: 'right' }}>Moyenne</th>
                                <th style={{ textAlign: 'right' }}>Min / Max</th>
                                <th>Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailQuery.data.quotes.slice(0, 10).map((q, idx) => (
                                <tr key={idx} style={{ background: q.variation && q.variation > 0 ? '#f0fdf4' : q.variation && q.variation < 0 ? '#fef2f2' : 'inherit' }}>
                                  <td style={{ fontWeight: 600 }}>
                                    {cleanText(q.variety)}
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{cleanText(q.stage)}</div>
                                  </td>
                                  <td>{cleanText(q.market)}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatPrice(q.averagePrice, q.unit)}</td>
                                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                                    {formatPrice(q.minPrice)} / {formatPrice(q.maxPrice)}
                                  </td>
                                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(q.date)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <EmptyState text="Aucune cotation récente disponible." />}
                    </div>
                  </div>

                  <div className="rnm-panel-footer">
                    <button 
                      className="btn btn-primary"
                      style={{ flexGrow: 1, justifyContent: 'center' }}
                      onClick={() => {
                        const id = productId(detailQuery.data);
                        if (!compareIds.includes(id)) {
                          if (compareIds.length >= 4) {
                            alert("Vous pouvez comparer jusqu'à 4 produits simultanément.");
                            return;
                          }
                          setCompareIds([...compareIds, id]);
                        }
                        setPanelProductId(null);
                      }}
                    >
                      Ajouter au comparateur
                    </button>
                    <button 
                      className="btn btn-secondary"
                      onClick={() => {
                        toggleFavoriteMutation.mutate(detailQuery.data);
                      }}
                      style={{ padding: '0.55rem 0.85rem' }}
                    >
                      <Heart 
                        size={16} 
                        fill={favoriteIds.has(productId(detailQuery.data)) ? 'currentColor' : 'none'} 
                        color={favoriteIds.has(productId(detailQuery.data)) ? '#ef4444' : 'currentColor'}
                      />
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// SEPARATE GLOBAL HISTORY PAGE COMPONENT
function HistoryPage({ token, initialProductId, onProductSelect }: { token: string; initialProductId?: string; onProductSelect?: (id: string) => void }) {
  const [productIdFilter, setProductIdFilter] = useState(initialProductId ?? '');
  const [marketFilter, setMarketFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [page, setPage] = useState(1);

  const historyQuery = useQuery({ 
    queryKey: ['rnm', 'global-history', productIdFilter, marketFilter, stageFilter, dateStart, dateEnd, page], 
    queryFn: () => api.rnmHistory(token, { 
      productId: productIdFilter || undefined, 
      market: marketFilter || undefined, 
      stage: stageFilter || undefined, 
      dateStart, 
      dateEnd, 
      page, 
      limit: 15 
    }), 
    staleTime: 2 * 60_000,
    placeholderData: (prev) => prev
  });

  const items = historyQuery.data?.items ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      <div className="card-modern widget-card-modern">
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 850 }}>Historique global des prix</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 1.25rem 0' }}>Analyse transversale des tendances de prix RNM.</p>
        
        {/* Dynamic Filters Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <div className="select-label-premium">
            Produit
            <input 
              type="text" 
              placeholder="Nom ou id..."
              className="search-input-premium" 
              style={{ paddingLeft: '0.75rem' }}
              value={productIdFilter}
              onChange={(e) => { setProductIdFilter(e.target.value); setPage(1); }}
            />
          </div>
          
          <div className="select-label-premium">
            Marché
            <input 
              type="text" 
              placeholder="Ex: Paris..."
              className="search-input-premium" 
              style={{ paddingLeft: '0.75rem' }}
              value={marketFilter}
              onChange={(e) => { setMarketFilter(e.target.value); setPage(1); }}
            />
          </div>

          <div className="select-label-premium">
            Stade
            <input 
              type="text" 
              placeholder="Ex: Gros..."
              className="search-input-premium" 
              style={{ paddingLeft: '0.75rem' }}
              value={stageFilter}
              onChange={(e) => { setStageFilter(e.target.value); setPage(1); }}
            />
          </div>

          <div className="select-label-premium">
            Date Début
            <input 
              type="date" 
              className="search-input-premium" 
              style={{ paddingLeft: '0.75rem' }}
              value={dateStart}
              onChange={(e) => { setDateStart(e.target.value); setPage(1); }}
            />
          </div>

          <div className="select-label-premium">
            Date Fin
            <input 
              type="date" 
              className="search-input-premium" 
              style={{ paddingLeft: '0.75rem' }}
              value={dateEnd}
              onChange={(e) => { setDateEnd(e.target.value); setPage(1); }}
            />
          </div>
        </div>
      </div>

      {historyQuery.isLoading && <DataState loading />}
      {historyQuery.error && <DataState error={historyQuery.error} />}
      
      {!historyQuery.isLoading && !historyQuery.error && (
        <>
          {items.length > 0 ? (
            <>
              {/* Premium Price curve over history results */}
              <div className="card-modern widget-card-modern">
                <h4 style={{ margin: '0 0 0.75rem 0', fontWeight: 850, fontSize: '0.88rem' }}>Courbe moyenne des prix historiques filtrés</h4>
                <PriceChart points={items} />
              </div>

              {/* Grid table representation */}
              <div className="table-wrapper" style={{ margin: 0, border: '1px solid var(--light-border)', borderRadius: 18 }}>
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Produit</th>
                      <th>Marché / Stade</th>
                      <th style={{ textAlign: 'right' }}>Prix Moyen</th>
                      <th style={{ textAlign: 'center' }}>Variation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((h, idx) => (
                      <tr 
                        key={idx} 
                        style={{ cursor: onProductSelect && h.productId ? 'pointer' : 'default' }}
                        onClick={() => h.productId && onProductSelect?.(String(h.productId))}
                      >
                        <td style={{ color: 'var(--text-muted)' }}>{formatDate(h.date)}</td>
                        <td style={{ fontWeight: 800 }}>{cleanText(h.productName) ?? productIdFilter ?? '—'}</td>
                        <td>
                          {cleanText(h.market) || '—'}
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{cleanText(h.stage) || '—'}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 850 }}>{formatPrice(h.averagePrice ?? h.price, h.unit)}</td>
                        <td style={{ textAlign: 'center' }}><VariationBadge value={h.variation} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <button 
                    className="btn btn-secondary"
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                  >
                    Précédent
                  </button>
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>Page {page} sur {historyQuery.data?.pages || 1}</span>
                  <button 
                    className="btn btn-secondary"
                    disabled={page === (historyQuery.data?.pages || 1)}
                    onClick={() => setPage(p => Math.min(historyQuery.data?.pages || 1, p + 1))}
                    style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                  >
                    Suivant
                  </button>
                </div>
              </div>
            </>
          ) : <EmptyState text="Aucune donnée historique ne correspond aux filtres de recherche." />}
        </>
      )}
    </div>
  );
}

// SEPARATE ABOUT PAGE COMPONENT
function AboutPage() {
  return (
    <div className="card-modern widget-card-modern" style={{ padding: '2rem', borderRadius: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--primary)' }}>
          <Sparkles size={28} />
          <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 950, color: 'var(--text-main)' }}>À propos de Cours des Produits</h3>
        </div>
        <p style={{ lineHeight: 1.7, margin: 0, color: 'var(--text-main)', fontSize: '0.95rem' }}>
          L’application officielle **Cours des Produits** transforme ToqueHub en centre de veille économique alimentaire. Elle permet aux chefs de cuisine, économes, acheteurs et gestionnaires de suivre en direct les cours officiels des denrées alimentaires.
        </p>
        <p style={{ lineHeight: 1.7, margin: 0, color: 'var(--text-main)', fontSize: '0.95rem' }}>
          Les données proviennent du **Réseau des Nouvelles des Marchés (RNM)** de FranceAgriMer, interrogé en temps réel via l'API sécurisée ToqueHub. Aucune donnée n'est importée dans vos référentiels de stocks sans votre action, garantissant la propreté de vos inventaires.
        </p>
        
        <div className="alert-modern success" style={{ borderRadius: 12, padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Info size={18} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>La disponibilité de ce service dépend entièrement de l’infrastructure publique RNM FranceAgriMer. En cas d’indisponibilité, les autres fonctionnalités de ToqueHub (stocks, fiches techniques) restent parfaitement opérationnelles.</span>
        </div>
        
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
          Version 2.0.0 (Refonte ERP Premium) • ToqueHub Suite
        </p>
      </div>
    </div>
  );
}

// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Download,
  Factory,
  FileSpreadsheet,
  FileText,
  History,
  PackageCheck,
  Plus,
  Printer,
  ShieldAlert,
  UsersRound,
  X,
  TrendingUp,
  User,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { api } from '../api/client';
import type { HrCollaborator, HrDepartment, Product, Stock, TechnicalSheetRecipe, Unit, UserSession } from '../types';

type ProductionTab = 'dashboard' | 'orders' | 'calendar' | 'today' | 'assignments' | 'materials' | 'exports' | 'history';
type Status = 'PLANIFIEE' | 'VALIDEE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE';
type Priority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE';

type ProductionOrder = {
  id: string;
  number: string;
  name: string;
  recipeId: string;
  date: string;
  time: string;
  status: Status;
  priority: Priority;
  plannedPortions: number;
  realizedPortions?: number;
  serviceId?: string;
  responsibleId?: string;
  comments?: string;
  actualStart?: string;
  actualEnd?: string;
  losses?: number;
  yieldPercent?: number;
  qualityControl?: boolean;
  varianceCause?: string;
  stockProposalConfirmed?: boolean;
};

type HistoryEntry = { id: string; at: string; user: string; action: string; summary: string; data?: unknown };
type ExportEntry = { id: string; at: string; type: string; period: string; service?: string; orderIds: string[]; snapshot: unknown };

type ProductionAppProps = {
  token: string;
  session: UserSession;
  tab: ProductionTab;
  products: Product[];
  units: Unit[];
  stocks: Stock[];
  collaborators: HrCollaborator[];
  departments: HrDepartment[];
  onNavigate: (tab: ProductionTab) => void;
};

const statusLabels: Record<Status, string> = { PLANIFIEE: 'Planifiée', VALIDEE: 'Validée', EN_COURS: 'En cours', TERMINEE: 'Terminée', ANNULEE: 'Annulée' };
const priorityLabels: Record<Priority, string> = { BASSE: 'Basse', NORMALE: 'Normale', HAUTE: 'Haute', URGENTE: 'Urgente' };
const criticalCodes = ['STOCK_INSUFFISANT', 'RESPONSABLE_ABSENT', 'SOUS_EFFECTIF', 'SANS_RESPONSABLE', 'RETARD', 'QUALITE_MANQUANTE', 'ECART_PORTIONS'];
const todayIso = () => new Date().toISOString().slice(0, 10);
const fmtDate = (value?: string) => (value ? new Date(value).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const fmtShortDate = (value?: string) => (value ? new Date(value).toLocaleDateString('fr-FR') : '—');
const fmtTime = (value?: string) => value || '—';
const n = (value: unknown) => Number(value ?? 0) || 0;
const collaboratorName = (c?: HrCollaborator) => c ? `${c.firstName} ${c.lastName}` : 'Non affecté';

// Reusable Metric card matching Stocks/TechnicalSheets dashboard
function MetricCard({ label, value, icon, tone = 'emerald' }: { label: string; value: string | number; icon: React.ReactNode; tone?: string }) {
  return (
    <motion.div
      className={`metric-card-modern tone-${tone}`}
      whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(9, 13, 22, 0.05)' }}
    >
      <div className="metric-header">
        <div className={`metric-icon-wrapper-modern tone-${tone}`}>
          {icon}
        </div>
        <span className="metric-badge-trend">Mise à jour</span>
      </div>
      <div className="metric-body-modern">
        <span className="metric-value-modern" style={{ fontSize: '1.8rem' }}>{value}</span>
        <span className="metric-label-modern" style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>{label}</span>
      </div>
      <div className="metric-shine" />
    </motion.div>
  );
}

function EmptyState({ icon, title, children, action }: { icon: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty-state app-empty" style={{ padding: '3rem 2rem' }}>
      <div className="empty-state-icon">{icon}</div>
      <span className="empty-state-title" style={{ fontSize: '1.15rem', fontWeight: 800 }}>{title}</span>
      <span className="empty-state-desc" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '480px', margin: '0.5rem auto 0' }}>{children}</span>
      {action ? <div style={{ marginTop: '1.25rem' }}>{action}</div> : null}
    </div>
  );
}

function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
          <motion.div
            initial={{ opacity: 0, scale: .96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: .96, y: 16 }}
            className="modal-content-wrapper"
            style={{ width: 'min(780px, 96vw)', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{title}</h3>
              <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem' }}>{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export function ProductionApp({ token, session, tab, products, units, stocks, collaborators, departments, onNavigate }: ProductionAppProps) {
  const [recipes, setRecipes] = useState<TechnicalSheetRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [exports, setExports] = useState<ExportEntry[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showRealization, setShowRealization] = useState<ProductionOrder | null>(null);
  const [showConfirm, setShowConfirm] = useState<{ order: ProductionOrder; next?: Status; reason: string; codes: string[] } | null>(null);
  const [filterDate, setFilterDate] = useState(todayIso());
  const [materialStatusFilter, setMaterialStatusFilter] = useState('');
  const userLabel = session.user.firstName || session.user.email;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [recipesResult, ordersResult, historyResult, exportsResult] = await Promise.all([
          api.technicalSheetRecipes(token, { status: 'ACTIVE', includeArchived: false, pageSize: 200 }).catch(() => ({ items: [] })),
          api.productionOrders(token, { pageSize: 200 }).catch(() => ({ items: [] })),
          api.productionHistory(token, { pageSize: 200 }).catch(() => []),
          api.productionExports(token, { pageSize: 200 }).catch(() => []),
        ]);
        if (cancelled) return;
        setRecipes(recipesResult.items ?? []);
        setOrders((ordersResult.items ?? []).map(fromApiOrder));
        setHistory((historyResult ?? []).map(fromApiHistory));
        setExports((exportsResult ?? []).map(fromApiExport));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  const activeCollaborators = collaborators.filter((c) => !c.isArchived && c.status !== 'LEFT');
  const activeDepartments = departments.filter((d) => !d.isArchived);
  const recipesById = useMemo(() => Object.fromEntries(recipes.map((r) => [r.id, r])), [recipes]);
  const productStock = useMemo(() => stocks.reduce((acc, stock) => ({ ...acc, [stock.productId]: (acc[stock.productId] || 0) + n(stock.quantity ?? stock.currentQuantity) }), {} as Record<string, number>), [stocks]);

  async function reloadAudit() {
    const [historyResult, exportsResult] = await Promise.all([
      api.productionHistory(token, { pageSize: 200 }).catch(() => []),
      api.productionExports(token, { pageSize: 200 }).catch(() => []),
    ]);
    setHistory((historyResult ?? []).map(fromApiHistory));
    setExports((exportsResult ?? []).map(fromApiExport));
  }

  const addHistory = (action: string, summary: string, data?: unknown) => setHistory((prev) => [{ id: crypto.randomUUID(), at: new Date().toISOString(), user: userLabel, action, summary, data }, ...prev]);

  const materialLines = useMemo(() => orders.flatMap((order) => {
    const recipe = recipesById[order.recipeId];
    const ratio = order.plannedPortions / Math.max(1, n(recipe?.referencePortions ?? recipe?.portions ?? 1));
    return (recipe?.ingredients ?? []).map((line) => {
      const required = n(line.quantity) * ratio;
      const available = productStock[line.productId] ?? 0;
      const product = line.product || products.find((p) => p.id === line.productId);
      const unit = line.unit || units.find((u) => u.id === line.unitId) || product?.unit;
      const gap = available - required;
      const status = product?.isArchived ? 'Produit archivé' : available === 0 ? 'Stock non renseigné' : gap < 0 ? 'Stock insuffisant' : gap < required * 0.15 ? 'Rupture potentielle' : 'OK';
      return { order, recipe, product, unit, required, available, gap, status, supplier: product?.supplier || product?.primarySupplier };
    });
  }), [orders, recipesById, productStock, products, units]);

  const alertsForOrder = (order: ProductionOrder) => {
    const lines = materialLines.filter((l) => l.order.id === order.id);
    const result: Array<{ code: string; label: string; critical: boolean }> = [];
    if (!order.responsibleId) result.push({ code: 'SANS_RESPONSABLE', label: 'Ordre sans responsable', critical: true });
    if (order.date < todayIso() && !['TERMINEE', 'ANNULEE'].includes(order.status)) result.push({ code: 'RETARD', label: 'Production en retard', critical: true });
    if (lines.some((l) => l.status === 'Stock insuffisant')) result.push({ code: 'STOCK_INSUFFISANT', label: 'Produits manquants', critical: true });
    if (activeCollaborators.length === 0) result.push({ code: 'SOUS_EFFECTIF', label: 'Aucun collaborateur RH disponible', critical: true });
    if (order.status === 'TERMINEE' && !order.qualityControl) result.push({ code: 'QUALITE_MANQUANTE', label: 'Contrôle qualité manquant', critical: true });
    if (order.realizedPortions && Math.abs(order.realizedPortions - order.plannedPortions) / order.plannedPortions > .2) result.push({ code: 'ECART_PORTIONS', label: 'Écart portions important', critical: true });
    if (order.status === 'TERMINEE' && !order.stockProposalConfirmed) result.push({ code: 'DESTOCKAGE_A_CONFIRMER', label: 'Déstockage proposé non confirmé', critical: false });
    return result;
  };

  const enrichedPriority = (order: ProductionOrder) => {
    const score = { BASSE: 1, NORMALE: 2, HAUTE: 3, URGENTE: 4 }[order.priority] + alertsForOrder(order).filter((a) => a.critical).length;
    return score >= 5 ? 'Critique' : score >= 4 ? 'Urgente' : score >= 3 ? 'Haute' : priorityLabels[order.priority];
  };

  const stats = useMemo(() => {
    const todayOrders = orders.filter((o) => o.date === todayIso());
    return {
      today: todayOrders.length,
      running: orders.filter((o) => o.status === 'EN_COURS').length,
      done: todayOrders.filter((o) => o.status === 'TERMINEE').length,
      late: orders.filter((o) => o.date < todayIso() && !['TERMINEE', 'ANNULEE'].includes(o.status)).length,
      plannedPortions: todayOrders.reduce((s, o) => s + o.plannedPortions, 0),
      realizedPortions: todayOrders.reduce((s, o) => s + n(o.realizedPortions), 0),
    };
  }, [orders]);

  const criticalAlerts = orders.flatMap((o) => alertsForOrder(o).map((a) => ({ ...a, order: o }))).sort((a, b) => Number(b.critical) - Number(a.critical));

  const ordersByDate = useMemo(() => {
    const groups: Record<string, ProductionOrder[]> = {};
    orders.forEach((o) => {
      groups[o.date] = groups[o.date] ?? [];
      groups[o.date].push(o);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders]);

  async function createOrder(form: FormData) {
    const recipe = recipes.find((r) => r.id === String(form.get('recipeId')));
    if (!recipe) return;
    const created = await api.createProductionOrder(token, {
      technicalSheetId: recipe.id,
      productionDate: String(form.get('date')),
      plannedTime: String(form.get('time')),
      plannedPortions: n(form.get('plannedPortions')),
      serviceId: String(form.get('serviceId') || '') || undefined,
      responsibleEmployeeId: String(form.get('responsibleId') || '') || undefined,
      priority: toApiPriority(String(form.get('priority') || 'NORMALE') as Priority),
      comments: String(form.get('comments') || ''),
    });
    setOrders((prev) => [fromApiOrder(created), ...prev.filter((o) => o.id !== created.id)]);
    await reloadAudit();
    setShowCreate(false);
  }

  async function requestStatus(order: ProductionOrder, next: Status) {
    const codes = alertsForOrder(order).filter((a) => a.critical && criticalCodes.includes(a.code)).map((a) => a.code);
    if (codes.length) return setShowConfirm({ order, next, reason: `Confirmer le passage à “${statusLabels[next]}” malgré : ${codes.join(', ')}`, codes });
    if (next === 'TERMINEE') return setShowRealization({ ...order, status: next });
    const updated = await api.changeProductionStatus(token, order.id, { status: toApiStatus(next) });
    setOrders((prev) => prev.map((o) => o.id === order.id ? fromApiOrder(updated) : o));
    await reloadAudit();
  }

  async function confirmOverride() {
    if (!showConfirm) return;
    if (showConfirm.next === 'TERMINEE') setShowRealization({ ...showConfirm.order, status: 'TERMINEE' });
    else if (showConfirm.next) {
      const updated = await api.changeProductionStatus(token, showConfirm.order.id, { status: toApiStatus(showConfirm.next), confirmCriticalOverride: true, overrideReason: showConfirm.reason });
      setOrders((prev) => prev.map((o) => o.id === showConfirm.order.id ? fromApiOrder(updated) : o));
      await reloadAudit();
    }
    setShowConfirm(null);
  }

  async function saveRealization(form: FormData) {
    if (!showRealization) return;
    const realizedPortions = n(form.get('realizedPortions'));
    const qualityControlDone = form.get('qualityControl') === 'on';
    const confirmDestocking = form.get('stockProposalConfirmed') === 'on';
    const updatedRealization = await api.closeProductionRealization(token, showRealization.id, {
      realizedPortions,
      actualStartTime: timeToIso(String(form.get('actualStart') || ''), showRealization.date),
      actualEndTime: timeToIso(String(form.get('actualEnd') || ''), showRealization.date),
      losses: n(form.get('losses')),
      yieldPercent: Math.round((realizedPortions / Math.max(1, showRealization.plannedPortions)) * 100),
      qualityControlDone,
      varianceCauses: String(form.get('varianceCause') || ''),
      comments: String(form.get('comments') || showRealization.comments || ''),
      managerValidated: true,
      confirmDestocking,
    });
    setOrders((prev) => prev.map((o) => o.id === showRealization.id ? { ...o, status: 'TERMINEE', realizedPortions, qualityControl: qualityControlDone, stockProposalConfirmed: confirmDestocking, realization: updatedRealization } as any : o));
    await reloadAudit();
    setShowRealization(null);
  }

  async function generateExport(type: string) {
    const orderIds = orders.filter((o) => !filterDate || o.date === filterDate).map((o) => o.id);
    const format = type.includes('Excel') ? 'EXCEL' : type.includes('Impression') ? 'PRINT' : 'PDF';
    const exportType = type.includes('Besoins') ? 'MATERIAL_REQUIREMENTS' : type.includes('Répartition') ? 'TEAM_ASSIGNMENTS' : 'PRODUCTION_SHEET';
    await api.prepareProductionExport(token, { type: exportType, format, startDate: filterDate, endDate: filterDate, filters: { label: type, orderIds } });
    await reloadAudit();
  }

  const OrderCard = ({ order }: { order: ProductionOrder }) => {
    const alerts = alertsForOrder(order);
    const responsible = collaborators.find((c) => c.id === order.responsibleId);
    const service = departments.find((d) => d.id === order.serviceId);
    const criticalCount = alerts.filter(a => a.critical).length;
    
    return (
      <motion.div
        className="card-modern recipe-card"
        whileHover={{ y: -3 }}
        style={{
          borderLeft: criticalCount > 0 ? '4px solid var(--danger)' : '4px solid var(--primary)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: '1rem',
          padding: '1.5rem',
          margin: 0
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Factory size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              {order.number} · {order.name}
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Prévu le {fmtShortDate(order.date)} à {fmtTime(order.time)}
            </p>
          </div>
          
          <div className="status-select-container">
            <select
              value={order.status}
              onChange={(e) => requestStatus(order, e.target.value as Status)}
              className={`badge-status-dropdown status-${order.status.toLowerCase()}`}
            >
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key} style={{ background: 'white', color: 'var(--text-main)' }}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '12px', margin: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Prévu</span>
            <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{order.plannedPortions} port.</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Réalisé</span>
            <strong style={{ fontSize: '0.9rem', color: order.realizedPortions ? 'var(--primary)' : 'var(--text-muted)' }}>
              {order.realizedPortions ?? '—'}
            </strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Priorité</span>
            <span
              className={`badge ${enrichedPriority(order) === 'Critique' || enrichedPriority(order) === 'Urgente' ? 'badge-loss' : 'badge-reception'}`}
              style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', width: 'fit-content', fontWeight: 700 }}
            >
              {enrichedPriority(order)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-main)' }}>
            <User size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span>Resp: <strong>{collaboratorName(responsible)}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-main)' }}>
            <UsersRound size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span>Service: <strong>{service?.name || 'Aucun'}</strong></span>
          </div>
        </div>

        {alerts.length ? (
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            {alerts.map((a) => (
              <span
                key={a.code}
                className={`badge ${a.critical ? 'badge-loss' : 'badge-correction'}`}
                style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem', fontWeight: 600 }}
              >
                {a.label}
              </span>
            ))}
          </div>
        ) : null}

        {order.comments && (
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', borderLeft: '2px solid #cbd5e1', paddingLeft: '6px' }}>
            {order.comments}
          </p>
        )}
      </motion.div>
    );
  };

  return (
    <div className="production-app" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <motion.section
        className="welcome-hero theme-amber"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="welcome-tag"><Factory size={14} /> Production</span>
        <h1 className="welcome-title">Production</h1>
        <p className="welcome-desc">
          Planifiez et pilotez les productions culinaires de votre établissement. Visualisez les besoins matières en temps réel et validez les sorties de stocks à la réalisation.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Nouvel ordre de production
          </button>
        </div>
      </motion.section>

      <div className="hr-tabs production-tabs" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {([
          ['dashboard', 'Tableau de bord'],
          ['orders', 'Ordres de production'],
          ['calendar', 'Calendrier'],
          ['today', 'Productions du jour'],
          ['assignments', 'Affectations RH'],
          ['materials', 'Besoins matières'],
          ['exports', 'Exports & Documents'],
          ['history', 'Historique d’audit'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => onNavigate(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div className="stats-grid">
                <MetricCard label="Productions aujourd'hui" value={stats.today} icon={<CalendarDays size={20} />} tone="blue" />
                <MetricCard label="Ordres en cours" value={stats.running} icon={<Clock size={20} />} tone="orange" />
                <MetricCard label="Terminées aujourd'hui" value={stats.done} icon={<CheckCircle2 size={20} />} tone="emerald" />
                <MetricCard label="Productions en retard" value={stats.late} icon={<AlertTriangle size={20} />} tone="purple" />
              </div>
              
              <div className="double-panel">
                <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={18} style={{ color: 'var(--danger)' }} /> Alertes prioritaires
                  </span>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                    {criticalAlerts.length ? (
                      criticalAlerts.slice(0, 8).map((a, idx) => (
                        <div
                          key={`${a.order.id}-${a.code}-${idx}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '1rem',
                            border: '1px solid var(--light-border)',
                            borderRadius: '12px',
                            background: '#f8fafc'
                          }}
                        >
                          <AlertTriangle size={18} style={{ color: a.critical ? 'var(--danger)' : 'var(--warning)', flexShrink: 0 }} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{a.order.number} · {a.order.name}</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{a.label}</span>
                          </div>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ marginLeft: 'auto', padding: '0.35rem 0.65rem' }}
                            onClick={() => onNavigate('orders')}
                          >
                            Ouvrir
                          </button>
                        </div>
                      ))
                    ) : (
                      <EmptyState icon="✅" title="Aucune alerte critique">
                        Toutes les productions peuvent avancer normalement. Les alertes critiques restent contournables par validation managériale.
                      </EmptyState>
                    )}
                  </div>
                </div>
                
                <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <span className="card-title"><ArrowRight size={18} /> Actions rapides</span>
                  
                  <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: 0 }}>
                    <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '12px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>
                        Portions prévues (Jour)
                      </span>
                      <strong style={{ fontSize: '1.5rem', color: 'var(--text-main)' }}>{stats.plannedPortions}</strong>
                    </div>
                    <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '12px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>
                        Portions réalisées (Jour)
                      </span>
                      <strong style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>{stats.realizedPortions}</strong>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('today')}>
                      <CalendarDays size={16} /> Ouvrir les productions du jour
                    </button>
                    <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('materials')}>
                      <PackageCheck size={16} /> Consulter les besoins matières
                    </button>
                    <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('exports')}>
                      <Download size={16} /> Exporter les documents du jour
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {orders.length ? (
                <div className="recipe-grid">
                  {orders.map((o) => (
                    <OrderCard key={o.id} order={o} />
                  ))}
                </div>
              ) : (
                <EmptyState icon="🏭" title="Aucun ordre de production">
                  Créez votre premier ordre de production à partir d'une fiche technique.
                </EmptyState>
              )}
            </div>
          )}

          {tab === 'today' && (
            <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="section-header-modern" style={{ margin: 0, paddingBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                <div className="section-info">
                  <span className="card-title">Productions rapides</span>
                  <span className="section-tagline">Ordres de production prévus pour la date sélectionnée.</span>
                </div>
                <select
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  style={{ width: '180px', marginBottom: 0 }}
                >
                  <option value={todayIso()}>Aujourd’hui</option>
                  <option value={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}>Demain</option>
                </select>
              </div>
              
              <div className="recipe-grid">
                {orders
                  .filter((o) => o.date === filterDate)
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((o) => (
                    <OrderCard key={o.id} order={o} />
                  ))}
              </div>
              
              {!orders.some((o) => o.date === filterDate) && (
                <EmptyState icon="🗓️" title="Aucune production planifiée">
                  Aucun ordre de production n'est planifié pour le {fmtShortDate(filterDate)}.
                </EmptyState>
              )}
            </div>
          )}

          {tab === 'calendar' && (
            <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <span className="card-title"><CalendarDays size={18} /> Calendrier de production</span>
              
              {ordersByDate.length ? (
                <div className="production-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', position: 'relative', paddingLeft: '1rem' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: '20px', width: '2px', background: '#cbd5e1', zIndex: 1 }} />
                  
                  {ordersByDate.map(([dateVal, dateOrders]) => (
                    <div key={dateVal} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', zIndex: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--primary)', border: '4px solid white', boxShadow: '0 0 0 2px var(--primary)' }} />
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'capitalize' }}>
                          {fmtDate(dateVal)}
                        </h4>
                      </div>
                      
                      <div className="recipe-grid" style={{ paddingLeft: '1.75rem' }}>
                        {dateOrders.map((o) => (
                          <div
                            key={o.id}
                            className="card-modern"
                            style={{
                              padding: '1rem 1.25rem',
                              background: 'white',
                              border: '1px solid var(--light-border)',
                              borderRadius: '16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.5rem',
                              margin: 0
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{o.time} · {o.name}</strong>
                              <span className={`badge ${o.status === 'TERMINEE' ? 'badge-reception' : o.status === 'EN_COURS' ? 'badge-correction' : 'badge-production'}`} style={{ fontSize: '0.75rem' }}>
                                {statusLabels[o.status]}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {o.plannedPortions} portions prévues · priorité {enrichedPriority(o)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon="📆" title="Calendrier vide">
                  Aucun ordre de production planifié pour le moment.
                </EmptyState>
              )}
            </div>
          )}

          {tab === 'assignments' && (
            <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <span className="card-title"><UsersRound size={18} /> Affectations & Charge de travail</span>
              
              {activeCollaborators.length === 0 ? (
                <EmptyState icon="👥" title="Aucun collaborateur RH">
                  Aucun collaborateur RH actif n'est disponible. Associez des collaborateurs dans le module RH.
                </EmptyState>
              ) : (
                <div className="recipe-grid">
                  {activeCollaborators.map((c) => {
                    const assigned = orders.filter((o) => o.responsibleId === c.id);
                    const portionSum = assigned.reduce((s, o) => s + o.plannedPortions, 0);
                    
                    // Simple workload formula: 3 or more orders is 100% capacity
                    const workloadPercent = Math.min(100, Math.round((assigned.length / 3) * 100));
                    let barColor = 'var(--success)';
                    let chargeLabel = 'Charge optimale';
                    if (assigned.length > 2) {
                      barColor = 'var(--danger)';
                      chargeLabel = 'Surcharge de travail';
                    } else if (assigned.length > 1) {
                      barColor = 'var(--warning)';
                      chargeLabel = 'Charge moyenne';
                    }

                    return (
                      <div
                        key={c.id}
                        className="card-modern"
                        style={{
                          padding: '1.5rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1rem',
                          margin: 0
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{collaboratorName(c)}</h3>
                          <span className="badge badge-reception" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                            {c.position?.name || 'Collaborateur'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>{chargeLabel}</span>
                            <strong style={{ color: 'var(--text-main)' }}>{assigned.length} tâche(s)</strong>
                          </div>
                          
                          <div className="workload-bar-bg" style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div className="workload-bar-fill" style={{ width: `${workloadPercent}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>

                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          Volume total : <strong>{portionSum} portions</strong> planifiées sur la période.
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'materials' && (
            <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="section-header-modern" style={{ margin: 0, paddingBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                <div className="section-info">
                  <span className="card-title"><PackageCheck size={18} /> Besoins matières consolidés</span>
                  <span className="section-tagline">Quantités cumulées requises comparées au stock disponible.</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    value={materialStatusFilter}
                    onChange={(e) => setMaterialStatusFilter(e.target.value)}
                    style={{ width: '180px', marginBottom: 0 }}
                  >
                    <option value="">Tous les statuts</option>
                    {['OK', 'Rupture potentielle', 'Stock insuffisant', 'Produit archivé', 'Stock non renseigné'].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button className="btn btn-secondary btn-sm" onClick={() => generateExport('PDF Besoins matières')}>
                    <Download size={14} /> Exporter PDF
                  </button>
                </div>
              </div>
              
              {materialLines.length ? (
                <div className="table-wrapper">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th style={{ textAlign: 'right' }}>Qté nécessaire</th>
                        <th style={{ textAlign: 'right' }}>Stock actuel</th>
                        <th style={{ textAlign: 'right' }}>Écart</th>
                        <th>Statut</th>
                        <th>Fiche / Ordre</th>
                        <th>Fournisseur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialLines
                        .filter((l) => !materialStatusFilter || l.status === materialStatusFilter)
                        .map((l, idx) => (
                          <tr key={`${l.order.id}-${l.product?.id}-${idx}`}>
                            <td style={{ fontWeight: 600 }}>{l.product?.name || 'Produit Stocks'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.required.toFixed(2)} {l.unit?.symbol || l.unit?.name || ''}</td>
                            <td style={{ textAlign: 'right' }}>{l.available.toFixed(2)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: l.gap < 0 ? 'var(--danger)' : 'var(--text-main)' }}>
                              {l.gap.toFixed(2)}
                            </td>
                            <td>
                              <span className={`badge ${l.status === 'OK' ? 'badge-reception' : l.status === 'Stock insuffisant' ? 'badge-loss' : 'badge-correction'}`}>
                                {l.status}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{l.recipe?.name} / {l.order.number}</td>
                            <td>{l.supplier?.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon="📦" title="Aucun besoin matière">
                  Planifiez des ordres de production pour calculer automatiquement les besoins matières requis.
                </EmptyState>
              )}
            </div>
          )}

          {tab === 'exports' && (
            <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <span className="card-title"><FileText size={18} /> Actions d'export & Documents</span>
              
              <div className="recipe-grid">
                {[
                  { title: 'Fiche de Production PDF', format: 'PDF Production', desc: 'Génère un récapitulatif PDF pour la cuisine avec portions, horaires et notes.', type: 'pdf' },
                  { title: 'Besoins Matières PDF', format: 'PDF Besoins matières', desc: 'Liste des ingrédients requis pour les ordres sélectionnés comparés aux stocks.', type: 'pdf' },
                  { title: 'Affectations Équipes PDF', format: 'PDF Répartition équipes', desc: 'Rapports d\'affectation des collaborateurs RH sur la production planifiée.', type: 'pdf' },
                  { title: 'Besoins Matières Excel', format: 'Excel Besoins matières', desc: 'Fichier tableur Excel exportable pour envoyer des commandes aux fournisseurs.', type: 'excel' },
                  { title: 'Rapport Production Excel', format: 'Excel Production', desc: 'Export tableur consolidé des statistiques de production de la période.', type: 'excel' },
                  { title: 'Impression Directe', format: 'Impression directe', desc: 'Lance le dialogue d\'impression système de votre navigateur.', type: 'print' },
                ].map((action) => (
                  <div
                    key={action.title}
                    className="card-modern"
                    style={{
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      margin: 0
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {action.type === 'excel' ? (
                        <FileSpreadsheet size={20} style={{ color: '#10b981' }} />
                      ) : action.type === 'print' ? (
                        <Printer size={20} style={{ color: 'var(--primary)' }} />
                      ) : (
                        <FileText size={20} style={{ color: '#3b82f6' }} />
                      )}
                      <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>{action.title}</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', minHeight: '38px' }}>
                      {action.desc}
                    </p>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center' }}
                      onClick={() => generateExport(action.format)}
                    >
                      <Download size={12} /> Lancer l'export
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                <span className="card-title" style={{ display: 'block', marginBottom: '1rem', fontSize: '0.95rem' }}>Historique des exports générés</span>
                
                {exports.length ? (
                  <div className="table-wrapper">
                    <table className="table-modern">
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Période</th>
                          <th>Généré le</th>
                          <th style={{ textAlign: 'right' }}>Ordres inclus</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exports.map((e) => (
                          <tr key={e.id}>
                            <td style={{ fontWeight: 600 }}>{e.type}</td>
                            <td>{e.period}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{fmtShortDate(e.at)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{e.orderIds.length} ordre(s)</td>
                            <td>
                              <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Download size={12} /> Télécharger
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="alert-modern info">Aucun export n'a encore été historisé.</div>
                )}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <span className="card-title"><History size={18} /> Historique d’audit Production</span>
              
              {history.length ? (
                <div className="production-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative', paddingLeft: '1rem' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: '20px', width: '2px', background: '#e2e8f0', zIndex: 1 }} />
                  
                  {history.map((h) => (
                    <div key={h.id} style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 2, alignItems: 'flex-start' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)', border: '3px solid white', boxShadow: '0 0 0 1px var(--primary)', marginTop: '0.35rem', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{h.action}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            le {fmtShortDate(h.at)} à {new Date(h.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="badge badge-reception" style={{ fontSize: '0.72rem', padding: '0.1rem 0.35rem' }}>
                            {h.user}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{h.summary}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon="🕘" title="Historique d'audit vide">
                  Les actions importantes (créations, clôtures, modifications de statut) apparaîtront ici.
                </EmptyState>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Creation Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Créer un ordre de production">
        {recipes.length === 0 ? (
          <EmptyState icon="📄" title="Aucune fiche technique disponible">
            Commencez par créer des fiches techniques actives dans le module Fiches Techniques.
          </EmptyState>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createOrder(new FormData(e.currentTarget));
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                Fiche technique source *
                <select name="recipeId" required style={{ marginBottom: 0 }}>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.referencePortions || r.portions || 1} portions réf.
                    </option>
                  ))}
                </select>
              </label>
              
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                Date de production *
                <input type="date" name="date" defaultValue={todayIso()} required style={{ marginBottom: 0 }} />
              </label>
              
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                Heure de production *
                <input type="time" name="time" defaultValue="08:00" required style={{ marginBottom: 0 }} />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                Portions prévues *
                <input type="number" min="1" name="plannedPortions" defaultValue="50" required style={{ marginBottom: 0 }} />
              </label>
              
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                Service de production
                <select name="serviceId" style={{ marginBottom: 0 }}>
                  <option value="">Aucun service</option>
                  {activeDepartments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                Responsable de production
                <select name="responsibleId" style={{ marginBottom: 0 }}>
                  <option value="">Non affecté</option>
                  {activeCollaborators.map((c) => (
                    <option key={c.id} value={c.id}>{collaboratorName(c)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                Priorité
                <select name="priority" defaultValue="NORMALE" style={{ marginBottom: 0 }}>
                  {Object.entries(priorityLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                Commentaires / Instructions
                <textarea name="comments" placeholder="Consignes de préparation, conditionnement, contraintes de service..." style={{ marginBottom: 0 }} />
              </label>
            </div>

            <div className="modal-footer" style={{ margin: '1.5rem -1.5rem -1.5rem', padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                Annuler
              </button>
              <button className="btn btn-primary" type="submit">
                <Plus size={16} /> Planifier et calculer les besoins
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Override Confirmation Modal */}
      <Modal open={Boolean(showConfirm)} onClose={() => setShowConfirm(null)} title="Confirmation de contournement d’alertes">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="alert-modern error" style={{ margin: 0, borderRadius: '12px' }}>
            <AlertTriangle size={20} style={{ flexShrink: 0 }} />
            <div>
              <strong>Validation managériale explicite requise</strong>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', lineHeight: 1.4 }}>
                {showConfirm?.reason}. Cette décision de contournement sera historisée avec votre nom, date et heure.
              </p>
            </div>
          </div>
          
          <div className="modal-footer" style={{ margin: '1rem -1.5rem -1.5rem', padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowConfirm(null)}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={confirmOverride}>
              Confirmer et forcer l'état
            </button>
          </div>
        </div>
      </Modal>

      {/* Realization Closure Modal */}
      <Modal open={Boolean(showRealization)} onClose={() => setShowRealization(null)} title="Clôture et réalisation de production">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveRealization(new FormData(e.currentTarget));
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
              Portions réellement produites *
              <input name="realizedPortions" type="number" defaultValue={showRealization?.plannedPortions ?? 0} required style={{ marginBottom: 0 }} />
            </label>
            
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
              Heure de début réel
              <input name="actualStart" type="time" style={{ marginBottom: 0 }} />
            </label>
            
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
              Heure de fin réelle
              <input name="actualEnd" type="time" style={{ marginBottom: 0 }} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
              Pertes (portions)
              <input name="losses" type="number" defaultValue="0" style={{ marginBottom: 0 }} />
            </label>
            
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
              Cause de l'écart (le cas échéant)
              <input name="varianceCause" placeholder="ex: perte matière, erreur dosage..." style={{ marginBottom: 0 }} />
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
              Notes finales / Observations
              <textarea name="comments" placeholder="Détails supplémentaires observés pendant la production..." style={{ marginBottom: 0 }} />
            </label>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '12px' }}>
              <label className="toggle-inline" style={{ userSelect: 'none', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input name="qualityControl" type="checkbox" style={{ width: 'auto', margin: 0 }} />
                <span>Le contrôle qualité a été effectué et validé</span>
              </label>
              
              <label className="toggle-inline" style={{ userSelect: 'none', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input name="stockProposalConfirmed" type="checkbox" defaultChecked style={{ width: 'auto', margin: 0 }} />
                <span>Déstocker automatiquement les ingrédients consommés dans Stocks</span>
              </label>
            </div>
          </div>

          <div className="modal-footer" style={{ margin: '1.5rem -1.5rem -1.5rem', padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowRealization(null)}>
              Annuler
            </button>
            <button className="btn btn-primary" type="submit">
              <CheckCircle2 size={16} /> Clôturer et déstocker
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function toApiStatus(status: Status) {
  return ({ PLANIFIEE: 'PLANNED', VALIDEE: 'VALIDATED', EN_COURS: 'IN_PROGRESS', TERMINEE: 'COMPLETED', ANNULEE: 'CANCELLED' } as Record<Status, string>)[status];
}

function fromApiStatus(status: string): Status {
  return ({ PLANNED: 'PLANIFIEE', VALIDATED: 'VALIDEE', IN_PROGRESS: 'EN_COURS', COMPLETED: 'TERMINEE', CANCELLED: 'ANNULEE' } as Record<string, Status>)[status] ?? 'PLANIFIEE';
}

function toApiPriority(priority: Priority) {
  return ({ BASSE: 'LOW', NORMALE: 'NORMAL', HAUTE: 'HIGH', URGENTE: 'URGENT' } as Record<Priority, string>)[priority];
}

function fromApiPriority(priority: string): Priority {
  return ({ LOW: 'BASSE', NORMAL: 'NORMALE', HIGH: 'HAUTE', URGENT: 'URGENTE' } as Record<string, Priority>)[priority] ?? 'NORMALE';
}

function fromApiOrder(order: any): ProductionOrder {
  return {
    id: order.id,
    number: order.number,
    name: order.name,
    recipeId: order.technicalSheetId,
    date: String(order.productionDate ?? '').slice(0, 10),
    time: order.plannedTime,
    status: fromApiStatus(order.status),
    priority: fromApiPriority(order.priority),
    plannedPortions: n(order.plannedPortions),
    realizedPortions: order.realizedPortions == null ? undefined : n(order.realizedPortions),
    serviceId: order.serviceId ?? undefined,
    responsibleId: order.responsibleEmployeeId ?? undefined,
    comments: order.comments ?? '',
    qualityControl: Boolean(order.realization?.qualityControlDone),
    stockProposalConfirmed: (order.destockingProposals ?? []).some((p: any) => p.status === 'CONFIRMED'),
  };
}

function fromApiHistory(entry: any): HistoryEntry {
  const user = entry.actorUser ? `${entry.actorUser.firstName ?? ''} ${entry.actorUser.lastName ?? ''}`.trim() || entry.actorUser.email : 'Production';
  return { id: entry.id, at: entry.createdAt, user, action: entry.action, summary: entry.summary, data: entry.details };
}

function fromApiExport(entry: any): ExportEntry {
  return { id: entry.id, at: entry.createdAt, type: `${entry.type} ${entry.format}`, period: [entry.startDate, entry.endDate].filter(Boolean).join(' → ') || 'Toutes périodes', service: entry.serviceId, orderIds: entry.orderId ? [entry.orderId] : (entry.snapshot?.orders ?? []).map((o: any) => o.id).filter(Boolean), snapshot: entry.snapshot };
}

function timeToIso(time: string, date: string) {
  return time ? new Date(`${date}T${time}:00`).toISOString() : undefined;
}

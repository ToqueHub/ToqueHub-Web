import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  Droplets,
  Factory,
  FileText,
  Flame,
  Package,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  Snowflake,
  Thermometer,
  Trash2,
  Truck,
} from 'lucide-react';
import { api } from '../api/client';

export type HaccpTab = 'dashboard' | 'temperatures' | 'cleaning' | 'traceability' | 'receptions' | 'process' | 'oil' | 'production' | 'products' | 'labels' | 'reports';

type Props = {
  token: string;
  tab: HaccpTab;
};

type HaccpDashboard = {
  score: number;
  grade: string;
  alerts: Array<{ module: string; severity: 'critical' | 'warning' | 'info'; message: string }>;
  modules: Array<{ id: string; label: string; weight: number; completed: number; expected: number; issues: number; score: number; description: string }>;
  today: Record<string, number | boolean>;
  activities: Array<{ id: string; module: string; label: string; detail: string; at: string }>;
  products: HaccpItem[];
  reports: HaccpItem[];
};

type HaccpItem = Record<string, any> & { _id?: string; id?: string; name?: string };

type SectionId = Exclude<HaccpTab, 'dashboard' | 'labels'>;

const PROCESS_TYPES = [
  { id: 'refroidissement', label: 'Refroidissement', icon: Snowflake },
  { id: 'congelation', label: 'Congélation', icon: Snowflake },
  { id: 'rechauffement', label: 'Remise en température', icon: Flame },
];

const SECTIONS: Array<{ id: SectionId; label: string; icon: typeof Thermometer }> = [
  { id: 'temperatures', label: 'Températures', icon: Thermometer },
  { id: 'cleaning', label: 'Nettoyage', icon: ShieldCheck },
  { id: 'traceability', label: 'Traçabilité', icon: ScanLine },
  { id: 'receptions', label: 'Réceptions', icon: Truck },
  { id: 'process', label: 'Processus', icon: Snowflake },
  { id: 'oil', label: 'Huiles', icon: Droplets },
  { id: 'production', label: 'Production', icon: Factory },
  { id: 'products', label: 'Produits', icon: Package },
  { id: 'reports', label: 'Rapports', icon: FileText },
];

const emptyForm = {
  name: '',
  type: '',
  temperature: '',
  equipmentId: '',
  supplier: '',
  productName: '',
  productType: '',
  lotNumber: '',
  quantity: '',
  unit: 'kg',
  unitPrice: '',
  photo: '',
  barcode: '',
  description: '',
  dlcDays: '',
  notes: '',
  surfaces: '',
  productId: '',
  finishedProductId: '',
  startTemperature: '',
  endTemperature: '',
  testMethod: 'bandelette',
  action: 'controle_ok',
};

export function HaccpApp({ token, tab }: Props) {
  const [dashboard, setDashboard] = useState<HaccpDashboard | null>(null);
  const [activeTab, setActiveTab] = useState<HaccpTab>(tab);
  const [items, setItems] = useState<Record<string, HaccpItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<SectionId | null>(null);
  const [processType, setProcessType] = useState<'refroidissement' | 'congelation' | 'rechauffement'>('refroidissement');
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => setActiveTab(tab), [tab]);
  useEffect(() => { void refreshAll(); }, [token, processType]);

  const products = items.products ?? [];
  const temperatureEquipment = items.temperatureEquipment ?? [];
  const processEquipment = items.processEquipment ?? [];
  const oilEquipment = items.oilEquipment ?? [];

  const currentRows = useMemo(() => {
    if (activeTab === 'dashboard' || activeTab === 'labels') return [];
    if (activeTab === 'temperatures') return items.temperatureReadings ?? [];
    if (activeTab === 'cleaning') return items.cleaningZones ?? [];
    if (activeTab === 'process') return items.processSessions ?? [];
    if (activeTab === 'oil') return items.oilSessions ?? [];
    if (activeTab === 'production') return items.productionSessions ?? [];
    if (activeTab === 'reports') return items.reports ?? [];
    return items[activeTab] ?? [];
  }, [activeTab, items]);

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || activeTab === 'dashboard' || activeTab === 'labels') return currentRows;
    return currentRows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
  }, [activeTab, currentRows, searchQuery]);

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      const [
        dashboardData,
        equipment,
        readings,
        zones,
        traceability,
        receptions,
        processEquipments,
        processSessions,
        oils,
        oilSessions,
        productionSessions,
        productList,
        reports,
      ] = await Promise.all([
        api.haccpDashboard(token),
        api.haccpList(token, '/temperature/equipment'),
        api.haccpList(token, '/temperature/readings'),
        api.haccpList(token, '/cleaning/zones'),
        api.haccpList(token, '/traceability'),
        api.haccpList(token, '/receptions'),
        api.haccpList(token, `/cooling-equipment?type=${processType}`),
        api.haccpList(token, `/cooling/${processType}/sessions`),
        api.haccpList(token, '/oil-equipment'),
        api.haccpList(token, '/oil/sessions?limit=50'),
        api.haccpList(token, '/production/sessions'),
        api.haccpList(token, '/haccp-products'),
        api.haccpList(token, '/daily-reports?limit=50'),
      ]);
      setDashboard(dashboardData);
      setItems({
        temperatureEquipment: equipment.data ?? [],
        temperatureReadings: readings.data ?? [],
        cleaningZones: zones.data ?? [],
        traceability: traceability.data ?? [],
        receptions: receptions.data ?? [],
        processEquipment: processEquipments.data ?? [],
        processSessions: processSessions.data ?? [],
        oilEquipment: oils.data ?? [],
        oilSessions: oilSessions.data ?? [],
        productionSessions: productionSessions.data ?? [],
        products: productList.data ?? [],
        reports: reports.data ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement HACCP impossible.');
    } finally {
      setLoading(false);
    }
  }

  function openCreate(section: SectionId) {
    setForm(emptyForm);
    setModal(section);
  }

  function setField(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!modal) return;
    setSaving(true);
    setError(null);
    try {
      if (modal === 'temperatures') {
        if (!form.equipmentId) {
          const created = await api.haccpCreate(token, '/temperature/equipment', { name: form.name, type: form.type || 'enceinte_positive' });
          form.equipmentId = created.data?._id;
        }
        await api.haccpCreate(token, '/temperature/readings', { equipmentId: form.equipmentId, temperature: Number(form.temperature), date: new Date().toISOString(), notes: form.notes });
      }
      if (modal === 'cleaning') {
        await api.haccpCreate(token, '/cleaning/zones', {
          name: form.name,
          description: form.description,
          surfaces: form.surfaces.split(',').map((name) => name.trim()).filter(Boolean).map((name) => ({ name, frequency: 'daily' })),
        });
      }
      if (modal === 'traceability') {
        await api.haccpCreate(token, '/traceability', { photo: form.photo || 'web-manual-entry', productName: form.productName, lotNumber: form.lotNumber, barcode: form.barcode, date: new Date().toISOString() });
      }
      if (modal === 'receptions') {
        await api.haccpCreate(token, '/receptions', { supplier: form.supplier, productName: form.productName, productType: form.productType, temperature: form.temperature, lotNumber: form.lotNumber, quantity: Number(form.quantity || 1), unit: form.unit, unitPrice: Number(form.unitPrice || 0), photo: form.photo, date: new Date().toISOString() });
      }
      if (modal === 'process') {
        await api.haccpCreate(token, `/cooling/${processType}/sessions`, { productId: form.productId, equipmentId: form.equipmentId, startTemperature: Number(form.startTemperature), endTemperature: form.endTemperature ? Number(form.endTemperature) : undefined, notes: form.notes });
      }
      if (modal === 'oil') {
        if (!form.equipmentId) {
          const created = await api.haccpCreate(token, '/oil-equipment', { name: form.name, type: form.type || 'friteuse' });
          form.equipmentId = created.data?._id;
        }
        await api.haccpCreate(token, '/oil/sessions', { equipmentId: form.equipmentId, testMethod: form.testMethod, action: form.action, notes: form.notes });
      }
      if (modal === 'production') {
        await api.haccpCreate(token, '/production/sessions', { lotNumber: form.lotNumber, finishedProductId: form.finishedProductId, quantity: Number(form.quantity || 1), unit: form.unit, notes: form.notes });
      }
      if (modal === 'products') {
        await api.haccpCreate(token, '/haccp-products', { name: form.name, type: form.type || 'preparation', dlcDays: form.dlcDays ? Number(form.dlcDays) : undefined, description: form.description, quantity: form.quantity ? Number(form.quantity) : undefined, unit: form.unit });
      }
      setModal(null);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(section: HaccpTab, item: HaccpItem) {
    const id = item._id ?? item.id;
    if (!id) return;
    const endpoints: Partial<Record<HaccpTab, string>> = {
      temperatures: `/temperature/equipment/${id}`,
      cleaning: `/cleaning/zones/${id}`,
      traceability: `/traceability/${id}`,
      receptions: `/receptions/${id}`,
      process: `/cooling/sessions/${id}`,
      oil: `/oil/sessions/${id}`,
      production: `/production/sessions/${id}`,
      products: `/haccp-products/${id}`,
      reports: `/daily-reports/${id}`,
    };
    const endpoint = endpoints[section];
    if (!endpoint) return;
    await api.haccpDelete(token, endpoint);
    await refreshAll();
  }

  async function generateReport() {
    setSaving(true);
    try {
      await api.haccpGenerateDailyReport(token);
      await refreshAll();
    } finally {
      setSaving(false);
    }
  }

  async function analyzeImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = await api.haccpAnalyzeTraceabilityImage(token, String(reader.result));
      const data = result.data ?? {};
      setForm((current) => ({ ...current, photo: String(reader.result), productName: data.productName ?? current.productName, lotNumber: data.lotNumber ?? current.lotNumber, barcode: data.barcode ?? current.barcode }));
      setModal('traceability');
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="module-page haccp-module">
      <div className="haccp-topbar">
        <div>
          <p className="eyebrow">Qualité & Hygiène</p>
          <h1>Tableau de bord HACCP</h1>
          <p className="muted">Contrôles sanitaires, traçabilité, productions et rapports quotidiens.</p>
        </div>
        <div className="haccp-header-actions">
          <button className="btn secondary" onClick={generateReport} disabled={saving}><FileText size={16} /> Générer rapport</button>
          <button className="btn secondary" onClick={() => void refreshAll()} disabled={loading}><RefreshCw size={16} /> Actualiser</button>
        </div>
      </div>

      {error && <div className="alert error"><AlertCircle size={16} /> {error}</div>}

      {activeTab === 'dashboard' ? <DashboardView dashboard={dashboard} loading={loading} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onGenerateReport={generateReport} /> : null}
      {activeTab === 'labels' ? <LabelsView products={products} onCreate={() => openCreate('products')} /> : null}
      {activeTab !== 'dashboard' && activeTab !== 'labels' ? (
        <SectionView
          section={activeTab}
          rows={visibleRows}
          products={products}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          processType={processType}
          onProcessType={setProcessType}
          onCreate={() => openCreate(activeTab)}
          onDelete={(item) => void remove(activeTab, item)}
          onAnalyzeImage={analyzeImage}
          onGenerateReport={generateReport}
          saving={saving}
        />
      ) : null}

      {modal ? (
        <div className="modal-overlay haccp-modal-overlay">
          <form className="modal-content-wrapper modal-md" onSubmit={submit}>
            <div className="modal-header">
              <h2>Ajouter {labelFor(modal).toLowerCase()}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setModal(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <FormFields section={modal} form={form} setField={setField} products={products} temperatureEquipment={temperatureEquipment} processEquipment={processEquipment} oilEquipment={oilEquipment} processType={processType} />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn btn-primary" disabled={saving}><Plus size={16} /> Enregistrer</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function DashboardView({ dashboard, loading, searchQuery, setSearchQuery, onGenerateReport }: { dashboard: HaccpDashboard | null; loading: boolean; searchQuery: string; setSearchQuery: (value: string) => void; onGenerateReport: () => void }) {
  if (loading && !dashboard) return <div className="empty-state">Chargement HACCP...</div>;
  if (!dashboard) return <div className="empty-state">Aucune donnée HACCP disponible.</div>;
  const filteredModules = dashboard.modules.filter((module) => {
    const query = searchQuery.trim().toLowerCase();
    return !query || `${module.label} ${module.description} ${module.score}`.toLowerCase().includes(query);
  });
  const coveredModules = dashboard.modules.filter((module) => module.completed > 0).length;
  const criticalCount = dashboard.alerts.filter((alert) => alert.severity === 'critical').length;
  const warningCount = dashboard.alerts.filter((alert) => alert.severity === 'warning').length;

  const formatActivityTime = (atStr: string) => {
    if (!atStr) return '';
    try {
      const d = new Date(atStr);
      if (isNaN(d.getTime())) return atStr;
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return atStr;
    }
  };

  return (
    <div className="haccp-dashboard">
      <div className="haccp-summary-grid">
        <MetricCard 
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          } 
          label="Modules actifs" 
          value={dashboard.modules.length} 
          detail={`${coveredModules} couverts aujourd'hui`} 
          tone="success" 
        />
        <MetricCard 
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={criticalCount ? '#ef4444' : warningCount ? '#f59e0b' : '#10b981'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          } 
          label="Contrôles manquants" 
          value={criticalCount + warningCount} 
          detail={`${criticalCount} critiques, ${warningCount} à surveiller`} 
          tone={criticalCount ? 'danger' : warningCount ? 'warning' : 'success'} 
        />
        <div className="haccp-sync-card">
          <div className="haccp-card-header">
            <span className="haccp-card-label">Couverture conformité</span>
            <span className="haccp-card-icon tone-info">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </span>
          </div>
          <div className="haccp-card-body haccp-sync-body">
            <div className="haccp-card-value-row">
              <strong className="haccp-card-value">
                {Math.round((coveredModules / Math.max(dashboard.modules.length, 1)) * 100)}%
              </strong>
              <span className="haccp-card-detail">{coveredModules} / {dashboard.modules.length} modules</span>
            </div>
            <div className="haccp-progress-track">
              <span style={{ width: `${Math.round((coveredModules / Math.max(dashboard.modules.length, 1)) * 100)}%` }} />
            </div>
          </div>
        </div>
        <div className="haccp-score-card">
          <div className="haccp-card-header">
            <span className="haccp-card-label">Score HACCP</span>
            <span className="haccp-card-icon tone-success">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
          </div>
          <div className="haccp-card-body haccp-score-body">
            <div className="haccp-score-content-row">
              <ScoreGauge score={dashboard.score} />
              <div className="haccp-score-badge-col">
                <span className="haccp-score-desc">score de conformité aujourd'hui</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="haccp-main-grid">
        <div className="haccp-list-panel">
          <div className="haccp-list-header">
            <div>
              <h2>Liste des contrôles HACCP</h2>
              <p className="muted">Modules, scores, anomalies et dernière couverture.</p>
            </div>
            <div className="haccp-search">
              <Search size={15} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Rechercher" />
            </div>
          </div>
          <div className="table-wrapper haccp-table-wrapper">
            <table className="table-modern haccp-control-table">
              <thead>
                <tr><th>Module</th><th>Catégorie</th><th>Score</th><th>Statut</th><th>Contrôles</th><th>Poids</th></tr>
              </thead>
              <tbody>
                {filteredModules.map((module) => <ControlRow key={module.id} module={module} />)}
              </tbody>
            </table>
          </div>
        </div>

        <div className="haccp-side-stack">
          <div className="haccp-side-card">
            <div className="haccp-side-title"><AlertCircle size={17} /> Alertes</div>
            <div className="haccp-alert-list">
              {dashboard.alerts.slice(0, 5).map((alert, index) => (
                <div className={`haccp-alert-item ${alert.severity}`} key={`${alert.module}-${index}`}>
                  <div className="haccp-alert-icon-wrapper">
                    <AlertCircle size={14} />
                  </div>
                  <div className="haccp-alert-content">
                    <span className="haccp-alert-module">{alert.module}</span>
                    <p className="haccp-alert-message">{alert.message}</p>
                  </div>
                </div>
              ))}
              {!dashboard.alerts.length && <div className="haccp-ok-state"><CheckCircle2 size={18} /> Aucune alerte active.</div>}
            </div>
          </div>
          <div className="haccp-side-card">
            <div className="haccp-side-title"><Clock size={17} /> Activité récente</div>
            <div className="haccp-activity-timeline">
              {dashboard.activities.slice(0, 6).map((activity) => (
                <div key={activity.id} className="haccp-timeline-item">
                  <div className="haccp-timeline-badge" />
                  <div className="haccp-timeline-content">
                    <div className="haccp-timeline-header">
                      <strong>{activity.module}</strong>
                      <small className="haccp-timeline-time">{formatActivityTime(activity.at)}</small>
                    </div>
                    <span className="haccp-timeline-label">{activity.label}</span>
                    <p className="haccp-timeline-detail">{activity.detail}</p>
                  </div>
                </div>
              ))}
              {!dashboard.activities.length && <div className="empty-mini">Aucune activité aujourd'hui.</div>}
            </div>
          </div>
          <button className="btn primary haccp-report-button" onClick={onGenerateReport}><FileText size={16} /> Générer le rapport</button>
        </div>
      </div>
    </div>
  );
}

function SectionView({ section, rows, products, searchQuery, setSearchQuery, processType, onProcessType, onCreate, onDelete, onAnalyzeImage, onGenerateReport, saving }: {
  section: SectionId;
  rows: HaccpItem[];
  products: HaccpItem[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  processType: 'refroidissement' | 'congelation' | 'rechauffement';
  onProcessType: (value: 'refroidissement' | 'congelation' | 'rechauffement') => void;
  onCreate: () => void;
  onDelete: (item: HaccpItem) => void;
  onAnalyzeImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onGenerateReport: () => void;
  saving: boolean;
}) {
  return (
    <div className="card-modern">
      <div className="section-header-modern">
        <div className="section-info">
          <span className="card-title">{labelFor(section)}</span>
          <span className="section-tagline">{rows.length} entrée(s) enregistrée(s)</span>
        </div>
        <div className="haccp-filter-right">
          {section === 'traceability' ? (
            <label className="btn btn-secondary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M4 3h4v4H4zM16 3h4v4h-4zM4 17h4v4H4zM16 17h4v4h-4z" />
              </svg>
              OCR
              <input type="file" accept="image/*" onChange={onAnalyzeImage} hidden />
            </label>
          ) : null}
          {section === 'reports' ? (
            <button type="button" className="btn btn-secondary" onClick={onGenerateReport} disabled={saving}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Générer le rapport
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Ajouter
          </button>
        </div>
      </div>
      <div className="haccp-filter-bar">
        <div className="haccp-filter-left">
          <div className="haccp-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Rechercher..." />
          </div>
          {section === 'process' ? (
            <select value={processType} onChange={(event) => onProcessType(event.target.value as any)}>
              {PROCESS_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          ) : null}
        </div>
      </div>
      <SimpleTable rows={rows} columns={columnsFor(section)} onDelete={onDelete} section={section} />
    </div>
  );
}

function MetricCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string | number | boolean; detail: string; tone: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="haccp-metric-card">
      <div className="haccp-card-header">
        <span className="haccp-card-label">{label}</span>
        <span className={`haccp-card-icon tone-${tone}`}>{icon}</span>
      </div>
      <div className="haccp-card-body">
        <strong className="haccp-card-value">{String(value)}</strong>
        <span className="haccp-card-detail">{detail}</span>
      </div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const normalized = Math.max(0, Math.min(100, score));
  const r = 26;
  const circ = 2 * Math.PI * r;
  const strokeDashoffset = circ - (normalized / 100) * circ;
  
  return (
    <div className="haccp-score-ring">
      <svg viewBox="0 0 60 60">
        <circle cx="30" cy="30" r={r} className="track" />
        <circle cx="30" cy="30" r={r} className="value" 
          style={{ 
            strokeDasharray: circ, 
            strokeDashoffset: strokeDashoffset,
            transform: 'rotate(-90deg)',
            transformOrigin: '30px 30px'
          }} 
        />
      </svg>
      <div className="haccp-ring-value">
        <strong>{score}</strong><span className="percent">%</span>
      </div>
    </div>
  );
}

function ControlRow({ module }: { module: HaccpDashboard['modules'][number] }) {
  const status = module.issues > 0 ? module.score < 60 ? 'Critique' : 'À vérifier' : 'Conforme';
  const badgeClass = status === 'Conforme' ? 'ok' : status === 'À vérifier' ? 'warning' : 'danger';
  return (
    <tr>
      <td><strong>{module.label}</strong><small>{module.description}</small></td>
      <td>Contrôle HACCP</td>
      <td><span className={`haccp-score-pill ${badgeClass}`}>{module.score}%</span></td>
      <td>
        <span className={`haccp-status-pill ${badgeClass}`}>
          <span className="status-dot" />
          {status}
        </span>
      </td>
      <td>{module.completed}/{module.expected}</td>
      <td>{module.weight}%</td>
    </tr>
  );
}

function FormFields({ section, form, setField, products, temperatureEquipment, processEquipment, oilEquipment, processType }: {
  section: SectionId;
  form: Record<string, string>;
  setField: (key: string, value: string) => void;
  products: HaccpItem[];
  temperatureEquipment: HaccpItem[];
  processEquipment: HaccpItem[];
  oilEquipment: HaccpItem[];
  processType: string;
}) {
  if (section === 'temperatures') return (
    <div className="haccp-form-grid">
      <SelectInput className="full-width" label="Équipement existant" value={form.equipmentId} onChange={(value) => setField('equipmentId', value)} options={temperatureEquipment.map((item) => ({ value: item._id ?? item.id, label: `${item.name} (${item.type})` }))} empty="Créer un nouvel équipement" />
      {!form.equipmentId && (
        <>
          <TextInput label="Nom équipement" value={form.name} onChange={(value) => setField('name', value)} />
          <TextInput label="Type" value={form.type} onChange={(value) => setField('type', value)} placeholder="enceinte_positive" />
        </>
      )}
      <TextInput label="Température" value={form.temperature} onChange={(value) => setField('temperature', value)} type="number" required />
      <TextInput className="full-width" label="Notes" value={form.notes} onChange={(value) => setField('notes', value)} />
    </div>
  );
  if (section === 'cleaning') return (
    <div className="haccp-form-grid">
      <TextInput label="Zone" value={form.name} onChange={(value) => setField('name', value)} required />
      <TextInput label="Surfaces" value={form.surfaces} onChange={(value) => setField('surfaces', value)} placeholder="Plan de travail, Sol, Four" />
      <TextInput className="full-width" label="Description" value={form.description} onChange={(value) => setField('description', value)} />
    </div>
  );
  if (section === 'traceability') return (
    <div className="haccp-form-grid">
      <TextInput label="Produit" value={form.productName} onChange={(value) => setField('productName', value)} required />
      <TextInput label="Lot" value={form.lotNumber} onChange={(value) => setField('lotNumber', value)} required />
      <TextInput label="Code-barres" value={form.barcode} onChange={(value) => setField('barcode', value)} />
      <TextInput label="Photo/OCR" value={form.photo} onChange={(value) => setField('photo', value)} />
    </div>
  );
  if (section === 'receptions') return (
    <div className="haccp-form-grid">
      <TextInput label="Fournisseur" value={form.supplier} onChange={(value) => setField('supplier', value)} required />
      <TextInput label="Produit" value={form.productName} onChange={(value) => setField('productName', value)} required />
      <TextInput label="Température" value={form.temperature} onChange={(value) => setField('temperature', value)} required />
      <TextInput label="Lot" value={form.lotNumber} onChange={(value) => setField('lotNumber', value)} />
      <TextInput className="full-width" label="Quantité" value={form.quantity} onChange={(value) => setField('quantity', value)} type="number" />
    </div>
  );
  if (section === 'process') return (
    <div className="haccp-form-grid">
      <SelectInput className="full-width" label="Produit HACCP" value={form.productId} onChange={(value) => setField('productId', value)} options={products.map((item) => ({ value: item._id ?? item.id, label: item.name ?? 'Produit' }))} />
      <SelectInput className="full-width" label={`Équipement ${processType}`} value={form.equipmentId} onChange={(value) => setField('equipmentId', value)} options={processEquipment.map((item) => ({ value: item._id ?? item.id, label: item.name ?? 'Équipement' }))} />
      <TextInput label="Température départ" value={form.startTemperature} onChange={(value) => setField('startTemperature', value)} type="number" required />
      <TextInput label="Température fin" value={form.endTemperature} onChange={(value) => setField('endTemperature', value)} type="number" />
    </div>
  );
  if (section === 'oil') return (
    <div className="haccp-form-grid">
      <SelectInput className="full-width" label="Équipement huile" value={form.equipmentId} onChange={(value) => setField('equipmentId', value)} options={oilEquipment.map((item) => ({ value: item._id ?? item.id, label: item.name ?? 'Équipement' }))} empty="Créer un nouvel équipement" />
      {!form.equipmentId && (
        <>
          <TextInput label="Nom équipement" value={form.name} onChange={(value) => setField('name', value)} />
          <TextInput label="Type" value={form.type} onChange={(value) => setField('type', value)} />
        </>
      )}
      <TextInput label="Méthode" value={form.testMethod} onChange={(value) => setField('testMethod', value)} />
      <TextInput label="Action" value={form.action} onChange={(value) => setField('action', value)} />
    </div>
  );
  if (section === 'production') return (
    <div className="haccp-form-grid">
      <SelectInput className="full-width" label="Produit fini" value={form.finishedProductId} onChange={(value) => setField('finishedProductId', value)} options={products.map((item) => ({ value: item._id ?? item.id, label: item.name ?? 'Produit' }))} />
      <TextInput label="Lot" value={form.lotNumber} onChange={(value) => setField('lotNumber', value)} required />
      <TextInput label="Quantité" value={form.quantity} onChange={(value) => setField('quantity', value)} type="number" required />
      <TextInput className="full-width" label="Unité" value={form.unit} onChange={(value) => setField('unit', value)} />
    </div>
  );
  return (
    <div className="haccp-form-grid">
      <TextInput className="full-width" label="Nom" value={form.name} onChange={(value) => setField('name', value)} required />
      <TextInput label="Type" value={form.type} onChange={(value) => setField('type', value)} required />
      <TextInput label="DLC jours" value={form.dlcDays} onChange={(value) => setField('dlcDays', value)} type="number" />
      <TextInput label="Unité" value={form.unit} onChange={(value) => setField('unit', value)} />
      <TextInput className="full-width" label="Description" value={form.description} onChange={(value) => setField('description', value)} />
    </div>
  );
}

function LabelsView({ products, onCreate }: { products: HaccpItem[]; onCreate: () => void }) {
  return (
    <div className="card-modern">
      <div className="section-header-modern">
        <div className="section-info">
          <span className="card-title">Étiquettes DLC</span>
          <span className="section-tagline">Génération et impression d'étiquettes de traçabilité et de DLC secondaires.</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nouveau produit
        </button>
      </div>
      <div className="haccp-labels-grid">
        {products.map((product) => (
          <div className="haccp-label-card" key={product._id ?? product.id}>
            <div className="haccp-label-header">
              <span className="haccp-label-title">{product.name}</span>
              <span className="haccp-label-subtitle">{product.type}</span>
            </div>
            <span className="haccp-label-days">DLC : {product.dlcDays ?? '-'} jours</span>
            <div className="haccp-label-footer">
              <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Imprimer
              </button>
            </div>
          </div>
        ))}
        {!products.length && (
          <div className="haccp-empty-state" style={{ gridColumn: '1 / -1' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 17h6" />
              <path d="M9 13h6" />
              <path d="M9 9h6" />
            </svg>
            <p>Aucun produit enregistré pour l'impression des étiquettes.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SimpleTable({ rows, columns, onDelete, section }: { rows: HaccpItem[]; columns: string[]; onDelete?: (item: HaccpItem) => void; section?: HaccpTab }) {
  if (!rows.length) {
    return (
      <div className="haccp-empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M9 17h6" />
          <path d="M9 13h6" />
          <path d="M9 9h6" />
        </svg>
        <p>Aucune donnée enregistrée pour le moment.</p>
      </div>
    );
  }
  return (
    <div className="table-wrapper">
      <table className="table-modern">
        <thead><tr>{columns.map((column) => <th key={column}>{headerFor(column)}</th>)}{onDelete ? <th></th> : null}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row._id ?? row.id ?? index}>
              {columns.map((column) => <td key={column}>{formatCell(row, column, section)}</td>)}
              {onDelete ? (
                <td>
                  <button type="button" className="haccp-action-btn" onClick={() => onDelete(row)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextInput({ label, value, onChange, type = 'text', required, placeholder, className }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string; className?: string }) {
  return (
    <label className={`form-field ${className || ''}`}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} required={required} placeholder={placeholder} />
    </label>
  );
}

function SelectInput({ label, value, onChange, options, empty = 'Sélectionner', className }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value?: string; label: string }>; empty?: string; className?: string }) {
  return (
    <label className={`form-field ${className || ''}`}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{empty}</option>
        {options.filter((option) => option.value).map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function labelFor(section: HaccpTab) {
  return ({ temperatures: 'Températures', cleaning: 'Nettoyage', traceability: 'Traçabilité', receptions: 'Réceptions', process: 'Processus', oil: 'Huiles', production: 'Production', products: 'Produits', labels: 'Étiquettes', reports: 'Rapports', dashboard: 'Dashboard' } as Record<HaccpTab, string>)[section];
}

function columnsFor(section: HaccpTab) {
  const columns: Record<string, string[]> = {
    temperatures: ['equipment.name', 'equipment.type', 'temperature', 'date', 'notes'],
    cleaning: ['name', 'description', 'surfaces.length', 'updatedAt'],
    traceability: ['productName', 'lotNumber', 'barcode', 'date'],
    receptions: ['supplier', 'productName', 'temperature', 'lotNumber', 'quantity', 'date'],
    process: ['product.name', 'equipment.name', 'startTemperature', 'endTemperature', 'status', 'sessionDate'],
    oil: ['equipment.name', 'testMethod', 'action', 'sessionDate'],
    production: ['finishedProduct.name', 'lotNumber', 'quantity', 'unit', 'status', 'productionDate'],
    products: ['name', 'type', 'dlcDays', 'quantity', 'unit'],
    reports: ['reportDate', 'status', 'generatedAt'],
  };
  return columns[section] ?? ['name', 'type', 'createdAt'];
}

function headerFor(column: string) {
  return column.split('.').at(-1)?.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase()) ?? column;
}

function formatCell(row: HaccpItem, column: string, section?: HaccpTab) {
  const value = column.split('.').reduce<any>((current, key) => current?.[key], row);
  if (column.endsWith('.length')) {
    const target = column.replace('.length', '').split('.').reduce<any>((current, key) => current?.[key], row);
    return Array.isArray(target) ? target.length : 0;
  }
  if (column === 'temperature' || column.includes('Temperature')) return value != null ? `${Number(value)}°C` : '-';
  if (column.toLowerCase().includes('date') || column.endsWith('At')) return value ? new Date(value).toLocaleString('fr-FR') : '-';
  if (section === 'reports' && column === 'status') return value === 'completed' ? 'Terminé' : value ?? '-';
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  return value ?? '-';
}

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  Archive,
  ArrowRight,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Download,
  FileText,
  History,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import { ApiError, api } from '../api/client';
import type {
  MenuCalendarView,
  MenuCycle,
  MenuCyclePayload,
  MenuDiet,
  MenuExport,
  MenuExportPayload,
  MenuGuestGroup,
  MenuGuestForecast,
  MenuHistoryEntry,
  MenuItemPayload,
  MenuModuleDashboard,
  MenuPlan,
  MenuPlanPayload,
  MenuProductionGenerationPayload,
  MenuProductionGenerationResult,
  MenuSection,
  MenuServiceType,
  MenuStatus,
  Site,
  TechnicalSheetRecipe,
  UserSession,
} from '../types';

type MenusTab = 'dashboard' | 'menus' | 'calendar' | 'cycles' | 'diets' | 'guests' | 'exports' | 'history';

interface MenusAppProps {
  token: string;
  session: UserSession;
  tab: MenusTab;
  sites: Site[];
  canManage: boolean;
  onNavigate: (tab: MenusTab) => void;
  onInstalled?: (apps?: string[]) => void;
}

const services: Array<{ value: MenuServiceType; label: string }> = [
  { value: 'BREAKFAST', label: 'Petit-déjeuner' },
  { value: 'LUNCH', label: 'Déjeuner' },
  { value: 'DINNER', label: 'Dîner' },
  { value: 'SNACK', label: 'Collation' },
  { value: 'EVENT', label: 'Événement' },
  { value: 'BUFFET', label: 'Buffet' },
];

const sections: Array<{ value: MenuSection; label: string }> = [
  { value: 'STARTER', label: 'Entrée' },
  { value: 'MAIN', label: 'Plat principal' },
  { value: 'SIDE', label: 'Accompagnement' },
  { value: 'CHEESE', label: 'Fromage' },
  { value: 'DESSERT', label: 'Dessert' },
  { value: 'DRINK', label: 'Boisson' },
  { value: 'OTHER', label: 'Autre' },
];

const statusLabels: Record<MenuStatus, string> = {
  DRAFT: 'Brouillon',
  VALIDATED: 'Validé',
  PUBLISHED: 'Publié',
  ARCHIVED: 'Archivé',
};

const calendarViews: Array<{ value: MenuCalendarView; label: string }> = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' },
];

const initialMenuForm = (): MenuPlanPayload => ({
  name: '',
  date: new Date().toISOString().slice(0, 10),
  service: 'LUNCH',
  siteId: '',
  description: '',
  expectedGuests: 0,
  items: [],
  guestForecasts: [],
});

export function MenusApp({ token, session, tab, sites, canManage, onNavigate, onInstalled }: MenusAppProps) {
  const [dashboard, setDashboard] = useState<MenuModuleDashboard>();
  const [menus, setMenus] = useState<MenuPlan[]>([]);
  const [cycles, setCycles] = useState<MenuCycle[]>([]);
  const [diets, setDiets] = useState<MenuDiet[]>([]);
  const [guestGroups, setGuestGroups] = useState<MenuGuestGroup[]>([]);
  const [exportsList, setExportsList] = useState<MenuExport[]>([]);
  const [history, setHistory] = useState<MenuHistoryEntry[]>([]);
  const [recipes, setRecipes] = useState<TechnicalSheetRecipe[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string>();
  const [calendarView, setCalendarView] = useState<MenuCalendarView>('week');
  const [search, setSearch] = useState('');
  const [menuForm, setMenuForm] = useState<MenuPlanPayload>(initialMenuForm);
  const [cycleForm, setCycleForm] = useState<MenuCyclePayload>({ name: '', description: '', durationWeeks: 4, siteId: '', status: 'ACTIVE' });
  const [dietForm, setDietForm] = useState({ name: '', description: '' });
  const [guestForm, setGuestForm] = useState({ menuId: '', guestGroupId: '', dietId: '', count: 0 });
  const [generationMode, setGenerationMode] = useState<'DETAILED' | 'GROUPED'>('DETAILED');
  const [generationResult, setGenerationResult] = useState<MenuProductionGenerationResult>();
  const [exportKind, setExportKind] = useState<MenuExportPayload['kind']>('PUBLIC_DISPLAY');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const selectedMenu = useMemo(() => menus.find((menu) => menu.id === selectedMenuId) ?? menus[0], [menus, selectedMenuId]);
  const filteredMenus = useMemo(() => menus.filter((menu) => [menu.name, menu.site?.name, serviceLabel(menu.service), statusLabel(menu.status)].join(' ').toLowerCase().includes(search.toLowerCase())), [menus, search]);
  const activeRecipes = useMemo(() => recipes.filter((recipe) => !recipe.isArchived && recipe.status !== 'ARCHIVED'), [recipes]);
  const canGenerateSelected = Boolean(selectedMenu && ['VALIDATED', 'PUBLISHED'].includes(selectedMenu.status) && Number(selectedMenu.expectedGuests ?? selectedMenu.guestCount ?? 0) > 0 && !selectedMenu.hasBlockingAlerts);

  async function refresh() {
    setLoading(true);
    setError(undefined);
    try {
      const [dashboardResult, menusResult, cyclesResult, dietsResult, groupsResult, exportsResult, historyResult, recipesResult] = await Promise.all([
        api.menusDashboard(token).catch(() => undefined),
        api.menusList(token).catch(() => []),
        api.menuCycles(token).catch(() => []),
        api.menuDiets(token).catch(() => []),
        api.menuGuestGroups(token).catch(() => []),
        api.menuExports(token).catch(() => []),
        api.menuHistory(token).catch(() => []),
        api.technicalSheetRecipes(token, { includeArchived: true, pageSize: 200 }).then((result) => result.items).catch(() => []),
      ]);
      setDashboard(dashboardResult);
      setMenus(menusResult);
      setCycles(cyclesResult);
      setDiets(dietsResult);
      setGuestGroups(groupsResult);
      setExportsList(exportsResult);
      setHistory(historyResult);
      setRecipes(recipesResult);
      if (!selectedMenuId && menusResult[0]) setSelectedMenuId(menusResult[0].id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError('Le backend Menus n’est pas encore disponible. Installez/relancez le module Menus côté API.');
      else setError(err instanceof Error ? err.message : 'Chargement du module Menus impossible.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function installMenus() {
    await run(async () => {
      const result = await api.installMenus(token);
      if ('installedApplications' in result) onInstalled?.(result.installedApplications);
      await refresh();
    }, 'Module Menus installé. Fiches Techniques et Production restent les référentiels consommés.');
  }

  async function createMenu(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (!menuForm.items?.length) {
      setError('Ajoutez au moins une fiche technique existante à la composition du menu.');
      return;
    }
    await run(async () => {
      const created = await api.createMenu(token, { ...menuForm, siteId: menuForm.siteId || undefined });
      setMenuForm(initialMenuForm());
      setSelectedMenuId(created.id);
      await refresh();
    }, 'Menu créé en brouillon à partir de fiches techniques existantes.');
  }

  async function changeStatus(menu: MenuPlan, status: MenuStatus) {
    await run(async () => {
      await api.changeMenuStatus(token, menu.id, status);
      await refresh();
    }, `Menu ${statusLabel(status).toLowerCase()}.`);
  }

  async function generateProductions() {
    if (!selectedMenu) return;
    const payload: MenuProductionGenerationPayload = { mode: generationMode, confirmRegeneration: false };
    await run(async () => {
      const result = await api.generateMenuProductions(token, selectedMenu.id, payload);
      setGenerationResult(result);
      await refresh();
    }, generationMode === 'DETAILED' ? 'Productions détaillées générées.' : 'Production regroupée générée.');
  }

  async function createCycle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await api.createMenuCycle(token, { ...cycleForm, siteId: cycleForm.siteId || undefined });
      setCycleForm({ name: '', description: '', durationWeeks: 4, siteId: '', status: 'ACTIVE' });
      await refresh();
    }, 'Cycle créé comme modèle réplicable et traçable.');
  }

  async function replicateCycle(cycle: MenuCycle) {
    const startDate = window.prompt('Date de début de réplication (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!startDate) return;
    await run(async () => {
      await api.replicateMenuCycle(token, cycle.id, { startDate, weeks: cycle.durationWeeks ?? 4 });
      await refresh();
    }, 'Cycle répliqué en menus indépendants traçables.');
  }

  async function createDiet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await api.createMenuDiet(token, dietForm);
      setDietForm({ name: '', description: '' });
      await refresh();
    }, 'Régime alimentaire ajouté au référentiel Menus.');
  }

  async function saveGuestForecast(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await api.upsertMenuGuestForecast(token, guestForm.menuId, { guestGroupId: guestForm.guestGroupId, dietId: guestForm.dietId || undefined, count: Number(guestForm.count) });
      await refresh();
    }, 'Prévision de convives enregistrée par groupe, sans donnée nominative.');
  }

  async function prepareExport() {
    if (!selectedMenu) return;
    await run(async () => {
      await api.prepareMenuExport(token, { menuId: selectedMenu.id, kind: exportKind, format: exportKind === 'EXCEL' ? 'XLSX' : 'PDF' });
      await refresh();
    }, 'Export préparé et historisé avec snapshot figé.');
  }

  async function run(handler: () => Promise<void>, message: string) {
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await handler();
      setSuccess(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action Menus impossible.');
    } finally {
      setSaving(false);
    }
  }

  function addMenuItem(item: MenuItemPayload) {
    setMenuForm((prev) => ({ ...prev, items: [...(prev.items ?? []), item] }));
  }

  function removeMenuItem(index: number) {
    setMenuForm((prev) => ({
      ...prev,
      items: (prev.items ?? []).filter((_, idx) => idx !== index),
    }));
  }

  if (loading) {
    return (
      <div className="card-modern" style={{ padding: '3rem', textAlign: 'center' }}>
        <span className="card-title" style={{ justifyContent: 'center', gap: '0.75rem' }}>
          <ChefHat className="animate-spin" size={24} /> Chargement Menus…
        </span>
      </div>
    );
  }

  return (
    <div className="menus-app" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <motion.section
        className="welcome-hero theme-blue"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="welcome-tag"><ChefHat size={14} /> Menus & Planification</span>
        <h1 className="welcome-title">Menus</h1>
        <p className="welcome-desc">
          Planifiez vos repas, concevez des cycles de menus et anticipez vos productions culinaires en toute simplicité. Les compositions référencent uniquement des fiches techniques existantes.
        </p>
      </motion.section>

      <div className="hr-tabs menus-tabs" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {([
          ['dashboard', 'Tableau de bord'],
          ['menus', 'Menus planifiés'],
          ['calendar', 'Calendrier'],
          ['cycles', 'Cycles'],
          ['diets', 'Régimes'],
          ['guests', 'Convives par groupes'],
          ['exports', 'Exports & Documents'],
          ['history', 'Historique d’audit'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => onNavigate(id as MenusTab)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <div className="menus-alert critical"><AlertCircle size={18} /><strong>Erreur : </strong>{error}</div> : null}
      {success ? <div className="menus-alert success"><CheckCircle2 size={18} /><strong>Succès : </strong>{success}</div> : null}

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
              <div className="menus-grid">
                <MetricCard
                  icon={<ChefHat />}
                  label="Menus actifs"
                  value={dashboard?.stats?.activeMenus ?? menus.filter((m) => m.status !== 'ARCHIVED').length}
                  tone="blue"
                />
                <MetricCard
                  icon={<CalendarDays />}
                  label="Menus de la semaine"
                  value={dashboard?.stats?.weekMenus ?? menus.length}
                  tone="purple"
                />
                <MetricCard
                  icon={<RefreshCw />}
                  label="Cycles actifs"
                  value={dashboard?.stats?.activeCycles ?? cycles.filter((c) => c.status !== 'ARCHIVED').length}
                  tone="emerald"
                />
                <MetricCard
                  icon={<UsersRound />}
                  label="Convives aujourd’hui"
                  value={dashboard?.stats?.todayGuests ?? menus.reduce((sum, m) => sum + Number(m.expectedGuests ?? m.guestCount ?? 0), 0)}
                  tone="orange"
                />
                <MetricCard
                  icon={<FileText />}
                  label="Coût moyen / repas"
                  value={`${money(dashboard?.stats?.averageCostPerMeal ?? averageCost(menus))} €`}
                  tone="emerald"
                />
              </div>

              <div className="menus-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
                <div className="card-modern">
                  <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={18} /> Alertes Menus
                  </span>
                  <div className="menus-alert-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem' }}>
                    {(dashboard?.alerts?.length ? dashboard.alerts : buildAlerts(menus)).map((alert, index) => (
                      <div key={index} className={`menus-alert ${alert.severity ?? 'warning'}`}>
                        <AlertCircle size={16} />
                        <span>{alert.message}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card-modern">
                  <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Sparkles size={18} /> Actions rapides
                  </span>
                  <div className="quick-actions-grid">
                    <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('menus')}>
                      <Plus size={16} /> Créer un menu
                    </button>
                    <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('calendar')}>
                      <Calendar size={16} /> Calendrier
                    </button>
                    <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('cycles')}>
                      <RefreshCw size={16} /> Créer un cycle
                    </button>
                    <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('diets')}>
                      <UsersRound size={16} /> Gérer les régimes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'menus' && (
            <div className="double-panel layout-stacked" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div className="card-modern">
                <div className="section-header-modern compact">
                  <span className="card-title"><ClipboardList size={18} /> Menus planifiés</span>
                  <div className="search-input-wrapper">
                    <Search size={16} />
                    <input className="search-input" placeholder="Rechercher menu, site, statut…" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </div>
                </div>
                <div className="table-wrapper">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Nom</th>
                        <th>Date</th>
                        <th>Service</th>
                        <th>Site</th>
                        <th>Convives</th>
                        <th>Coût</th>
                        <th>Statut</th>
                        <th>Production</th>
                        <th>Allergènes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMenus.length === 0 ? (
                        <tr>
                          <td colSpan={10}>
                            <EmptyState title="Aucun menu" desc="Créez un menu et composez-le exclusivement avec des fiches techniques actives." />
                          </td>
                        </tr>
                      ) : (
                        filteredMenus.map((menu) => (
                          <tr key={menu.id} onClick={() => setSelectedMenuId(menu.id)} style={{ cursor: 'pointer', background: selectedMenuId === menu.id ? 'rgba(59, 130, 246, 0.04)' : undefined }}>
                            <td><strong>{menu.name}</strong></td>
                            <td>{dateFr(menu.date)}</td>
                            <td>{serviceLabel(menu.service)}</td>
                            <td>{menu.site?.name ?? 'Tous sites'}</td>
                            <td>{menu.expectedGuests ?? menu.guestCount ?? 0}</td>
                            <td>{money(menu.estimatedCostTotal ?? menu.costTotal)} €</td>
                            <td>
                              <span className={`badge badge-${menu.status.toLowerCase()}`}>
                                {statusLabel(menu.status)}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${menu.productionGeneratedAt ? 'badge-published' : 'badge-draft'}`}>
                                {menu.productionGeneratedAt ? '✅ Générée' : 'À générer'}
                              </span>
                            </td>
                            <td>{allergenLabel(menu.allergens)}</td>
                            <td>
                              <MenuStatusActions menu={menu} disabled={!canManage || saving} onStatus={changeStatus} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="double-panel">
                <div className="card-modern">
                  <span className="card-title"><Plus size={18} /> Créer un menu</span>
                  <form className="menus-form-grid" onSubmit={createMenu}>
                    <label>Nom
                      <input value={menuForm.name} onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })} required placeholder="Ex: Menu du Terroir" />
                    </label>
                    <label>Date
                      <input type="date" value={menuForm.date} onChange={(e) => setMenuForm({ ...menuForm, date: e.target.value })} required />
                    </label>
                    <label>Service
                      <select value={menuForm.service} onChange={(e) => setMenuForm({ ...menuForm, service: e.target.value as MenuServiceType })}>
                        {services.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </label>
                    <label>Site
                      <select value={menuForm.siteId ?? ''} onChange={(e) => setMenuForm({ ...menuForm, siteId: e.target.value })}>
                        <option value="">Tous sites</option>
                        {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                      </select>
                    </label>
                    <label className="menus-form-span">Convives prévus
                      <input type="number" min={0} value={menuForm.expectedGuests ?? 0} onChange={(e) => setMenuForm({ ...menuForm, expectedGuests: Number(e.target.value) })} />
                    </label>
                    <label className="menus-form-span">Description
                      <textarea rows={2} value={menuForm.description ?? ''} onChange={(e) => setMenuForm({ ...menuForm, description: e.target.value })} placeholder="Détails du menu, notes particulières..." />
                    </label>
                    
                    <span className="menus-form-span" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.5rem' }}>Composition du menu</span>
                    <CompositionBuilder recipes={activeRecipes} onAdd={addMenuItem} />
                    
                    <div className="menus-form-span menus-item-list">
                      {menuForm.items?.length === 0 ? (
                        <span className="muted" style={{ fontSize: '0.8rem', paddingLeft: '0.5rem' }}>Aucune fiche technique ajoutée pour le moment.</span>
                      ) : (
                        menuForm.items?.map((item, idx) => (
                          <span key={idx} className="badge badge-reception" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            {sectionLabel(item.section)} · {activeRecipes.find((r) => r.id === item.technicalSheetId)?.name ?? item.technicalSheetId}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeMenuItem(idx); }}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    
                    <button className="btn btn-primary menus-form-span" type="submit" disabled={!canManage || saving} style={{ marginTop: '0.5rem' }}>
                      <Plus size={16} /> Créer le brouillon
                    </button>
                  </form>
                </div>

                <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="card-title"><ChefHat size={18} /> Générer les productions</span>
                    {selectedMenu ? (
                      <div style={{ marginTop: '1.25rem' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                          Menu sélectionné : <strong>{selectedMenu.name}</strong>
                        </p>
                        <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                          Statut : <span className={`badge badge-${selectedMenu.status.toLowerCase()}`} style={{ fontSize: '0.72rem', padding: '0.1rem 0.35rem' }}>{statusLabel(selectedMenu.status)}</span> · {selectedMenu.expectedGuests ?? selectedMenu.guestCount ?? 0} convives
                        </p>
                      </div>
                    ) : (
                      <p className="muted" style={{ marginTop: '1.25rem' }}>Sélectionnez un menu validé ou publié pour lancer la production.</p>
                    )}
                  </div>
                  
                  <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>
                      Mode de génération
                      <select value={generationMode} onChange={(e) => setGenerationMode(e.target.value as 'DETAILED' | 'GROUPED')} style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--light-border)', background: '#f8fafc' }}>
                        <option value="DETAILED">Détaillé · 1 ordre par fiche technique</option>
                        <option value="GROUPED">Regroupé · 1 ordre par menu/service</option>
                      </select>
                    </label>
                    
                    <button className="btn btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} disabled={!canGenerateSelected || saving || !canManage} onClick={generateProductions}>
                      <ChefHat size={16} /> Générer les productions
                    </button>
                  </div>

                  {generationResult ? (
                    <div className="menus-alert success" style={{ marginTop: '1rem' }}>
                      <CheckCircle2 size={16} />
                      <span>{generationResult.createdOrdersCount ?? generationResult.orders?.length ?? 0} ordre(s) créé(s). Origine Menus conservée.</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {tab === 'calendar' && (
            <div className="card-modern">
              <div className="section-header-modern compact">
                <span className="card-title"><Calendar size={18} /> Calendrier Menus</span>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {calendarViews.map((view) => (
                    <button key={view.value} className={`btn ${calendarView === view.value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCalendarView(view.value)}>
                      {view.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="menus-calendar-grid">
                {groupMenusForCalendar(menus, calendarView).map((bucket) => (
                  <div key={bucket.label} className="menus-calendar-day">
                    <strong>{bucket.label}</strong>
                    {bucket.items.length === 0 ? (
                      <span className="muted" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>Aucun repas planifié</span>
                    ) : (
                      bucket.items.map((menu) => (
                        <div key={menu.id} className={`menus-calendar-event status-${menu.status.toLowerCase()}`} onClick={() => { setSelectedMenuId(menu.id); onNavigate('menus'); }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <ChefHat size={12} />
                            {serviceLabel(menu.service)} · {menu.name}
                          </span>
                          <small>
                            {menu.site?.name ?? 'Tous sites'} · {menu.expectedGuests ?? 0} convives · {money(menu.estimatedCostTotal ?? menu.costTotal)} €
                            {menu.productionGeneratedAt && <span style={{ display: 'block', color: '#059669', fontWeight: 600, marginTop: '0.15rem' }}>✓ Prod. générée</span>}
                          </small>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'cycles' && (
            <div className="double-panel">
              <div className="card-modern">
                <span className="card-title"><RefreshCw size={18} /> Cycles de menus</span>
                <p className="muted" style={{ marginTop: '0.25rem', marginBottom: '1.25rem' }}>Cycles configurables pour planifier des rotations de repas sur plusieurs semaines.</p>
                
                {cycles.length === 0 ? (
                  <EmptyState title="Aucun cycle" desc="Créez un cycle récurrent pour vos menus." />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                    {cycles.map((cycle) => (
                      <motion.div
                        key={cycle.id}
                        className="card-modern"
                        whileHover={{ y: -4, boxShadow: '0 8px 20px rgba(0,0,0,0.06)' }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid var(--light-border)', padding: '1.25rem' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>{cycle.name}</h3>
                          <span className={`badge ${cycle.status === 'ARCHIVED' ? 'badge-archived' : 'badge-published'}`} style={{ fontSize: '0.7rem' }}>
                            {cycle.status === 'ARCHIVED' ? 'Archivé' : 'Actif'}
                          </span>
                        </div>
                        <p className="muted" style={{ fontSize: '0.8rem', margin: 0, flexGrow: 1 }}>
                          {cycle.description || `${cycle.durationWeeks} semaines · modèle réplicable`}
                        </p>
                        <button className="btn btn-secondary btn-sm" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', marginTop: '0.5rem' }} disabled={!canManage} onClick={() => replicateCycle(cycle)}>
                          <RefreshCw size={12} /> Répliquer
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card-modern">
                <span className="card-title"><Plus size={18} /> Créer un cycle</span>
                <form className="menus-form-grid" onSubmit={createCycle}>
                  <label className="menus-form-span">Nom du cycle
                    <input value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} required placeholder="Ex: Printemps - Automne" />
                  </label>
                  <label>Durée du cycle
                    <select value={cycleForm.durationWeeks} onChange={(e) => setCycleForm({ ...cycleForm, durationWeeks: Number(e.target.value) })}>
                      {[2, 4, 6, 8].map((w) => <option key={w} value={w}>Cycle {w} semaines</option>)}
                      <option value={1}>Personnalisé (1 semaine)</option>
                    </select>
                  </label>
                  <label>Site
                    <select value={cycleForm.siteId ?? ''} onChange={(e) => setCycleForm({ ...cycleForm, siteId: e.target.value })}>
                      <option value="">Périmètre global</option>
                      {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                    </select>
                  </label>
                  <label className="menus-form-span">Description
                    <textarea rows={3} value={cycleForm.description ?? ''} onChange={(e) => setCycleForm({ ...cycleForm, description: e.target.value })} placeholder="Détails du cycle, typologie de convives cibles..." />
                  </label>
                  <button className="btn btn-primary menus-form-span" type="submit" disabled={!canManage || saving} style={{ marginTop: '0.5rem' }}>
                    <Plus size={16} /> Créer le cycle
                  </button>
                </form>
              </div>
            </div>
          )}

          {tab === 'diets' && (
            <div className="double-panel">
              <div className="card-modern">
                <span className="card-title"><UsersRound size={18} /> Régimes alimentaires</span>
                <p className="muted" style={{ marginTop: '0.25rem', marginBottom: '1.25rem' }}>Référentiel des déclinaisons alimentaires applicables aux menus de l'établissement.</p>
                
                {diets.length === 0 ? (
                  <EmptyState title="Aucun régime" desc="Ajoutez un régime de référence (ex: Sans Sel, Végétarien)." />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                    {diets.map((diet) => (
                      <div key={diet.id} className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid var(--light-border)', padding: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>{diet.name}</h4>
                          <span className={`badge ${diet.isArchived ? 'badge-archived' : 'badge-published'}`} style={{ fontSize: '0.7rem' }}>
                            {diet.isArchived ? 'Archivé' : 'Actif'}
                          </span>
                        </div>
                        <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                          {diet.description || 'Utilisable pour variantes et convives.'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card-modern">
                <span className="card-title"><Plus size={18} /> Ajouter un régime</span>
                <form className="menus-form-grid" onSubmit={createDiet}>
                  <label className="menus-form-span">Nom du régime
                    <input value={dietForm.name} onChange={(e) => setDietForm({ ...dietForm, name: e.target.value })} required placeholder="Ex: Végétarien, Hyposodé" />
                  </label>
                  <label className="menus-form-span">Description
                    <textarea rows={3} value={dietForm.description} onChange={(e) => setDietForm({ ...dietForm, description: e.target.value })} placeholder="Restrictions, ingrédients exclus ou recommandations cliniques..." />
                  </label>
                  <button className="btn btn-primary menus-form-span" type="submit" disabled={!canManage || saving} style={{ marginTop: '0.5rem' }}>
                    Créer le régime
                  </button>
                </form>
              </div>
            </div>
          )}

          {tab === 'guests' && (
            <div className="double-panel">
              <div className="card-modern">
                <span className="card-title"><UsersRound size={18} /> Convives par groupes</span>
                <p className="muted" style={{ marginTop: '0.25rem', marginBottom: '1.25rem' }}>Renseignez les prévisions de fréquentation par type de public pour affiner le dimensionnement des ordres de production.</p>
                <div className="table-wrapper">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Menu</th>
                        <th>Groupe</th>
                        <th>Régime</th>
                        <th>Convives</th>
                      </tr>
                    </thead>
                    <tbody>
                      {menus.flatMap((m) => m.guestForecasts ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={4}>
                            <EmptyState title="Aucune prévision" desc="Renseignez les convives par groupes, sans nominatif." />
                          </td>
                        </tr>
                      ) : (
                        menus.flatMap((m) => (m.guestForecasts ?? []).map((forecast) => (
                          <GuestRow key={forecast.id ?? `${m.id}-${forecast.guestGroupId}-${forecast.dietId}`} menu={m} forecast={forecast} />
                        )))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card-modern">
                <span className="card-title"><Plus size={18} /> Prévoir des convives</span>
                <form className="menus-form-grid" onSubmit={saveGuestForecast}>
                  <label className="menus-form-span">Menu planifié
                    <select value={guestForm.menuId} onChange={(e) => setGuestForm({ ...guestForm, menuId: e.target.value })} required>
                      <option value="">Choisir…</option>
                      {menus.map((m) => <option key={m.id} value={m.id}>{m.name} ({dateFr(m.date)})</option>)}
                    </select>
                  </label>
                  <label className="menus-form-span">Groupe de convives
                    <select value={guestForm.guestGroupId} onChange={(e) => setGuestForm({ ...guestForm, guestGroupId: e.target.value })} required>
                      <option value="">Choisir…</option>
                      {guestGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </label>
                  <label className="menus-form-span">Régime associé
                    <select value={guestForm.dietId} onChange={(e) => setGuestForm({ ...guestForm, dietId: e.target.value })}>
                      <option value="">Standard / non précisé</option>
                      {diets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                  <label className="menus-form-span">Nombre attendu
                    <input type="number" min={0} value={guestForm.count} onChange={(e) => setGuestForm({ ...guestForm, count: Number(e.target.value) })} required />
                  </label>
                  <button className="btn btn-primary menus-form-span" type="submit" disabled={!canManage || saving} style={{ marginTop: '0.5rem' }}>
                    Enregistrer la prévision
                  </button>
                </form>
              </div>
            </div>
          )}

          {tab === 'exports' && (
            <div className="double-panel">
              <div className="card-modern">
                <span className="card-title"><Download size={18} /> Préparer un export</span>
                <p className="muted" style={{ marginTop: '0.25rem', marginBottom: '1.25rem' }}>Générez des fiches ou des exports globaux consolidés à partir de vos menus planifiés.</p>
                
                <form className="menus-form-grid" onSubmit={(e) => { e.preventDefault(); void prepareExport(); }}>
                  <label className="menus-form-span">Menu ciblé
                    <select value={selectedMenuId ?? ''} onChange={(e) => setSelectedMenuId(e.target.value)} required>
                      <option value="">Choisir un menu...</option>
                      {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
                  <label className="menus-form-span">Modèle d'affichage / Document
                    <select value={exportKind} onChange={(e) => setExportKind(e.target.value as MenuExportPayload['kind'])}>
                      <option value="KITCHEN">Fiche Cuisine</option>
                      <option value="DINING_ROOM">Fiche Salle</option>
                      <option value="RESIDENTS">Fiche Résidents</option>
                      <option value="PATIENTS">Fiche Patients</option>
                      <option value="PUBLIC_DISPLAY">Affichage public</option>
                      <option value="EXCEL">Format Excel complet</option>
                    </select>
                  </label>
                  
                  <button className="btn btn-primary menus-form-span" type="submit" disabled={!selectedMenu || !canManage || saving} style={{ marginTop: '0.5rem' }}>
                    <Download size={16} /> Préparer l'export
                  </button>
                </form>
                
                <p className="muted" style={{ fontSize: '0.8rem', marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AlertCircle size={14} /> Les PDF et affichages publics sont figés ; Excel est généré à la demande et historisé.
                </p>
              </div>

              <div className="card-modern">
                <span className="card-title"><History size={18} /> Exports historisés</span>
                <p className="muted" style={{ marginTop: '0.25rem', marginBottom: '1.25rem' }}>Historique des snapshots générés.</p>
                
                <div className="table-wrapper">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Format</th>
                        <th>Menu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportsList.length === 0 ? (
                        <tr>
                          <td colSpan={4}>
                            <EmptyState title="Aucun export" desc="Les documents générés apparaîtront ici." />
                          </td>
                        </tr>
                      ) : (
                        exportsList.map((item) => (
                          <tr key={item.id}>
                            <td>{dateFr(item.createdAt)}</td>
                            <td>
                              <span className="badge badge-reception" style={{ fontSize: '0.75rem' }}>{item.kind}</span>
                            </td>
                            <td>
                              <span className="badge badge-production" style={{ fontSize: '0.75rem' }}>{item.format}</span>
                            </td>
                            <td>{item.menu?.name ?? item.menuId ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <span className="card-title"><History size={18} /> Historique d’audit Menus</span>
              
              {history.length ? (
                <div className="menus-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative', paddingLeft: '1rem' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: '20px', width: '2px', background: '#e2e8f0', zIndex: 1 }} />
                  
                  {history.map((entry) => (
                    <div key={entry.id} style={{ display: 'flex', gap: '1.5rem', position: 'relative', zIndex: 2, alignItems: 'flex-start' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)', border: '3px solid white', boxShadow: '0 0 0 1px var(--primary)', marginTop: '0.35rem', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{entry.action}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            le {dateFr(entry.createdAt)} {entry.createdAt ? `à ${new Date(entry.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                          </span>
                          <span className="badge badge-reception" style={{ fontSize: '0.72rem', padding: '0.1rem 0.35rem' }}>
                            {entry.user?.email ?? 'Système'}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {entry.context ?? entry.summary ?? '—'}
                          {entry.menu?.name && ` (Menu: ${entry.menu.name})`}
                          {entry.cycle?.name && ` (Cycle: ${entry.cycle.name})`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Historique vide" desc="Aucun log d’activité pour le module Menus." />
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {dashboard?.installed === false ? (
        <div className="card-modern" style={{ marginTop: '2rem' }}>
          <span className="card-title"><Archive size={18} /> Installation requise</span>
          <p className="muted" style={{ margin: '0.5rem 0 1rem 0' }}>Le module Menus requiert d’être connecté aux référentiels de Fiches Techniques et de Production.</p>
          <button className="btn btn-primary" disabled={!canManage || saving} onClick={installMenus}>
            Installer le module Menus
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CompositionBuilder({ recipes, onAdd }: { recipes: TechnicalSheetRecipe[]; onAdd: (item: MenuItemPayload) => void }) {
  const [section, setSection] = useState<MenuSection>('MAIN');
  const [technicalSheetId, setTechnicalSheetId] = useState('');
  const [portionsMultiplier, setPortionsMultiplier] = useState(1);
  return (
    <div className="menus-form-span composition-builder">
      <label>Section
        <select value={section} onChange={(e) => setSection(e.target.value as MenuSection)}>
          {sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label>Fiche technique existante
        <select value={technicalSheetId} onChange={(e) => setTechnicalSheetId(e.target.value)}>
          <option value="">Choisir…</option>
          {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
        </select>
      </label>
      <label>Coef. portions
        <input type="number" step="0.1" min="0.1" value={portionsMultiplier} onChange={(e) => setPortionsMultiplier(Number(e.target.value))} />
      </label>
      <button type="button" className="btn btn-secondary" disabled={!technicalSheetId} onClick={() => { onAdd({ section, technicalSheetId, portionsMultiplier }); setTechnicalSheetId(''); }}>
        <Plus size={16} /> Ajouter
      </button>
    </div>
  );
}

function MenuStatusActions({ menu, disabled, onStatus }: { menu: MenuPlan; disabled: boolean; onStatus: (menu: MenuPlan, status: MenuStatus) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
      <button className="btn btn-secondary btn-sm" disabled={disabled || menu.status !== 'DRAFT'} onClick={(e) => { e.stopPropagation(); onStatus(menu, 'VALIDATED'); }}>
        Valider
      </button>
      <button className="btn btn-secondary btn-sm" disabled={disabled || menu.status !== 'VALIDATED'} onClick={(e) => { e.stopPropagation(); onStatus(menu, 'PUBLISHED'); }}>
        Publier
      </button>
      <button className="btn btn-secondary btn-sm" disabled={disabled || menu.status === 'ARCHIVED'} onClick={(e) => { e.stopPropagation(); onStatus(menu, 'ARCHIVED'); }}>
        Archiver
      </button>
    </div>
  );
}

function GuestRow({ menu, forecast }: { menu: MenuPlan; forecast: MenuGuestForecast }) {
  return (
    <tr>
      <td><strong>{menu.name}</strong></td>
      <td>{forecast.group?.name ?? forecast.guestGroup?.name ?? forecast.guestGroupId}</td>
      <td>
        <span className="badge badge-reception" style={{ fontSize: '0.75rem' }}>
          {forecast.diet?.name ?? 'Standard'}
        </span>
      </td>
      <td><strong>{forecast.count}</strong></td>
    </tr>
  );
}

function MetricCard({ label, value, icon, tone = 'blue' }: { label: string; value: string | number; icon: React.ReactNode; tone?: string }) {
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

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="empty-state" style={{ padding: '3rem 2rem' }}>
      <div className="empty-state-icon">🍽️</div>
      <span className="empty-state-title" style={{ fontSize: '1.15rem', fontWeight: 800 }}>{title}</span>
      <span className="empty-state-desc" style={{ fontSize: '0.85rem' }}>{desc}</span>
    </div>
  );
}

function serviceLabel(service?: string) { return services.find((s) => s.value === service)?.label ?? service ?? '—'; }
function sectionLabel(section?: string) { return sections.find((s) => s.value === section)?.label ?? section ?? '—'; }
function statusLabel(status?: string) { return statusLabels[(status as MenuStatus) ?? 'DRAFT'] ?? status ?? 'Brouillon'; }
function allergenLabel(allergens?: MenuPlan['allergens']) { return allergens?.map((a) => typeof a === 'string' ? a : a.name ?? 'Allergène').join(', ') || '—'; }
function money(value?: number | string | null) { const n = Number(value ?? 0); return Number.isFinite(n) ? n.toFixed(2) : '0.00'; }
function averageCost(menus: MenuPlan[]) { const values = menus.map((m) => Number(m.costPerGuest ?? m.estimatedCostPerGuest ?? 0)).filter((n) => Number.isFinite(n) && n > 0); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function dateFr(value?: string | null) { return value ? new Date(value).toLocaleDateString('fr-FR') : '—'; }
function buildAlerts(menus: MenuPlan[]) { const alerts = []; if (menus.some((m) => (m.items?.length ?? 0) === 0)) alerts.push({ message: 'Menus incomplets : certaines compositions sont vides.', severity: 'warning' }); if (menus.some((m) => !(m.expectedGuests ?? m.guestCount))) alerts.push({ message: 'Menus sans estimation de convives.', severity: 'warning' }); if (menus.some((m) => ['VALIDATED', 'PUBLISHED'].includes(m.status) && !m.productionGeneratedAt)) alerts.push({ message: 'Menus validés ou publiés non générés en Production.', severity: 'warning' }); if (alerts.length === 0) alerts.push({ message: 'Aucune alerte bloquante détectée.', severity: 'success' }); return alerts; }
function groupMenusForCalendar(menus: MenuPlan[], view: MenuCalendarView) { const size = view === 'day' ? 1 : view === 'week' ? 7 : view === 'month' ? 31 : 12; return Array.from({ length: Math.min(size, 12) }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); const label = view === 'year' ? date.toLocaleDateString('fr-FR', { month: 'long' }) : date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }); return { label, items: menus.filter((m) => view === 'year' ? new Date(m.date).getMonth() === date.getMonth() : new Date(m.date).toDateString() === date.toDateString()) }; }); }

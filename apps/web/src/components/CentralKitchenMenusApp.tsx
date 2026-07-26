import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Building2, CalendarDays, CheckCircle2, ChefHat, Factory, FileText, PackageCheck, Plus, RefreshCw, Settings, Truck, UsersRound, X } from 'lucide-react';
import { api } from '../api/client';
import type { MenuCycle, MenuCyclePayload, MenuDiet, MenuDispatch, MenuDispatchStatus, MenuGuestGroup, MenuPlan, MenuSection, MenuServiceType, Site, TechnicalSheetRecipe } from '../types';

type CentralTab = 'dashboard' | 'cycles' | 'planning' | 'distribution' | 'documents';
const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const serviceLabels: Record<MenuServiceType, string> = { BREAKFAST: 'Petit-déjeuner', LUNCH: 'Déjeuner', DINNER: 'Dîner', SNACK: 'Collation', EVENT: 'Événement', BUFFET: 'Buffet' };
const sectionLabels: Record<MenuSection, string> = { STARTER: 'Entrée', MAIN: 'Plat', SIDE: 'Accompagnement', CHEESE: 'Fromage', DESSERT: 'Dessert', DRINK: 'Boisson', OTHER: 'Autre' };
const dispatchLabels: Record<MenuDispatchStatus, string> = { PLANNED: 'Planifiée', PREPARED: 'Préparée', DISPATCHED: 'Partie', DELIVERED: 'Livrée', CANCELLED: 'Annulée' };

const initialCycle = (siteId = ''): MenuCyclePayload => ({ name: '', description: '', durationWeeks: 4, siteId, items: [], forecasts: [] });

export function CentralKitchenMenusApp({ token, sites, canManage, onProfileSettings, onHybridBack }: {
  token: string; sites: Site[]; canManage: boolean; onProfileSettings: () => void; onHybridBack?: () => void;
}) {
  const [tab, setTab] = useState<CentralTab>('dashboard');
  const [cycles, setCycles] = useState<MenuCycle[]>([]);
  const [menus, setMenus] = useState<MenuPlan[]>([]);
  const [dispatches, setDispatches] = useState<MenuDispatch[]>([]);
  const [recipes, setRecipes] = useState<TechnicalSheetRecipe[]>([]);
  const [groups, setGroups] = useState<MenuGuestGroup[]>([]);
  const [diets, setDiets] = useState<MenuDiet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [cycleForm, setCycleForm] = useState<MenuCyclePayload>(() => initialCycle(sites[0]?.id));
  const [replication, setReplication] = useState({ cycleId: '', startDate: new Date().toISOString().slice(0, 10), weeks: 4 });
  const [selectedMenuId, setSelectedMenuId] = useState('');

  const centralMenus = useMemo(() => menus.filter((menu) => menu.activity === 'CENTRAL_KITCHEN' || menu.kind === 'CYCLE'), [menus]);
  const selectedMenu = centralMenus.find((menu) => menu.id === selectedMenuId) ?? centralMenus[0];

  async function refresh() {
    setLoading(true);
    try {
      const [cycleResult, menuResult, dispatchResult, recipeResult, groupResult, dietResult] = await Promise.all([
        api.menuCycles(token),
        api.menusList(token, { activity: 'CENTRAL_KITCHEN' }),
        api.menuDispatches(token),
        api.technicalSheetRecipes(token, { pageSize: 200 }).then((result) => result.items),
        api.menuGuestGroups(token),
        api.menuDiets(token),
      ]);
      setCycles(cycleResult);
      setMenus(menuResult);
      setDispatches(dispatchResult);
      setRecipes(recipeResult.filter((recipe) => recipe.status === 'ACTIVE' && !recipe.isArchived && recipe.outputProductId));
      setGroups(groupResult.filter((group) => !group.isArchived));
      setDiets(dietResult.filter((diet) => !diet.isArchived));
      setSelectedMenuId((current) => current || menuResult[0]?.id || '');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function run(action: () => Promise<void>, message: string) {
    setSaving(true); setError(undefined); setSuccess(undefined);
    try { await action(); setSuccess(message); }
    catch (caught) { setError(messageOf(caught)); }
    finally { setSaving(false); }
  }

  async function saveCycle() {
    await run(async () => { await api.createMenuCycle(token, cycleForm); setBuilderOpen(false); setCycleForm(initialCycle(sites[0]?.id)); await refresh(); }, 'Cycle créé avec sa grille et ses effectifs de base.');
  }

  async function replicate() {
    const cycle = cycles.find((item) => item.id === replication.cycleId);
    if (!cycle) return;
    await run(async () => {
      const result = await api.replicateMenuCycle(token, cycle.id, { startDate: replication.startDate, weeks: replication.weeks, siteId: cycle.siteId ?? undefined });
      await refresh();
      setSuccess(`${result.createdMenus} menu(s) créé(s). Les brouillons existants ont été actualisés et les menus verrouillés conservés.`);
    }, 'Cycle répliqué.');
  }

  async function generate(menu: MenuPlan) {
    await run(async () => { await api.generateMenuProductions(token, menu.id, { mode: 'GROUPED', confirmRegeneration: Boolean(menu.productionGeneratedAt) }); await refresh(); }, 'Production globale générée.');
  }

  async function validateMenu(menu: MenuPlan) {
    await run(async () => { await api.changeMenuStatus(token, menu.id, 'VALIDATED'); await refresh(); }, 'Menu validé pour la production.');
  }

  async function saveDailyForecasts(menu: MenuPlan) {
    await run(async () => {
      await api.updateMenuGuestForecasts(token, menu.id, (menu.guestForecasts ?? []).map((forecast) => ({
        guestGroupId: forecast.guestGroupId,
        dietId: forecast.dietId ?? undefined,
        destinationSiteId: forecast.destinationSiteId ?? undefined,
        dispatchId: forecast.dispatchId ?? undefined,
        count: Number(forecast.count),
      })));
      await refresh();
    }, 'Effectifs du jour actualisés. La production a été marquée à recalculer si nécessaire.');
  }

  function updateForecastCount(menuId: string, forecastIndex: number, count: number) {
    setMenus((current) => current.map((menu) => menu.id !== menuId ? menu : {
      ...menu,
      guestForecasts: (menu.guestForecasts ?? []).map((forecast, index) => index === forecastIndex ? { ...forecast, count } : forecast),
    }));
  }

  async function changeDispatch(dispatch: MenuDispatch, status: MenuDispatchStatus) {
    await run(async () => { await api.updateMenuDispatchStatus(token, dispatch.id, status); await refresh(); }, `Distribution ${dispatchLabels[status].toLocaleLowerCase('fr')}.`);
  }

  async function download(kind: 'PRODUCTION' | 'PACKING' | 'DISPATCH') {
    if (!selectedMenu) return;
    await run(async () => {
      const file = await api.downloadCentralMenuDocument(token, selectedMenu.id, kind);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url; link.download = file.filename; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'Document téléchargé.');
  }

  if (loading) return <div className="card-modern" style={{ padding: '3rem', textAlign: 'center' }}><Factory className="animate-spin" /> Chargement de la Cuisine centrale…</div>;

  return <div className="menus-app" style={{ display: 'grid', gap: '1.5rem' }}>
    <section className="welcome-hero" style={{ background: 'linear-gradient(135deg,#78350f,#b45309)', color: 'white' }}>
      <span className="welcome-tag" style={{ color: '#fef3c7' }}><Factory size={14} /> Espace Cuisine centrale</span>
      <h1 className="welcome-title" style={{ color: 'white' }}>Cycles, effectifs & distribution</h1>
      <p className="welcome-desc" style={{ color: '#fef3c7' }}>Planifiez les rotations, agrégez les besoins de tous les sites et suivez chaque départ sans créer de mouvement de stock automatique.</p>
      <div style={{ display: 'flex', gap: '.6rem', marginTop: '.9rem', flexWrap: 'wrap' }}>
        {onHybridBack ? <button className="btn btn-secondary btn-sm" onClick={onHybridBack}><ArrowLeft size={14} /> Espaces d’activité</button> : null}
        <button className="btn btn-secondary btn-sm" onClick={onProfileSettings}><Settings size={14} /> Adapter mon activité</button>
        <button className="btn btn-primary btn-sm" onClick={() => setBuilderOpen(true)}><Plus size={14} /> Nouveau cycle</button>
      </div>
    </section>

    <nav className="hr-tabs menus-tabs" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>{([
      ['dashboard', 'Tableau de bord'], ['cycles', 'Cycles'], ['planning', 'Menus datés'], ['distribution', 'Distribution'], ['documents', 'Documents'],
    ] as Array<[CentralTab, string]>).map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {error ? <div className="menus-alert critical"><AlertCircle size={17} />{error}</div> : null}
    {success ? <div className="menus-alert success"><CheckCircle2 size={17} />{success}</div> : null}

    {tab === 'dashboard' ? <div style={{ display: 'grid', gap: '1.3rem' }}><div className="menus-grid"><Metric icon={<RefreshCw />} value={cycles.filter((cycle) => cycle.status !== 'ARCHIVED').length} label="Cycles actifs" /><Metric icon={<CalendarDays />} value={centralMenus.filter((menu) => sameWeek(menu.date)).length} label="Menus cette semaine" /><Metric icon={<UsersRound />} value={centralMenus.filter((menu) => sameDay(menu.date)).reduce((sum, menu) => sum + Number(menu.expectedGuests ?? 0), 0)} label="Repas aujourd’hui" /><Metric icon={<Truck />} value={dispatches.filter((item) => ['PLANNED', 'PREPARED'].includes(item.status)).length} label="Départs à préparer" /></div><div className="card-modern"><span className="card-title"><Truck size={18} /> Prochains départs</span><DispatchTable dispatches={dispatches.slice(0, 8)} saving={saving} onStatus={changeDispatch} /></div></div> : null}

    {tab === 'cycles' ? <div className="double-panel"><div className="card-modern"><div className="section-header-modern compact"><span className="card-title"><RefreshCw size={18} /> Cycles de menus</span><button className="btn btn-primary" onClick={() => setBuilderOpen(true)}><Plus size={14} /> Créer</button></div><div style={{ display: 'grid', gap: '.8rem', marginTop: '1rem' }}>{cycles.map((cycle) => <div key={cycle.id} style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 14, padding: '1rem' }}><strong>{cycle.name}</strong><span className="muted" style={{ display: 'block', marginTop: '.25rem' }}>{cycle.durationWeeks} semaine(s) · {cycle.site?.name ?? 'Site de production à préciser'} · {cycle.items?.length ?? 0} composition(s) · {cycle.forecasts?.length ?? 0} prévision(s)</span></div>)}{!cycles.length ? <Empty title="Aucun cycle" text="Construisez votre première rotation multi-sites." /> : null}</div></div><div className="card-modern"><span className="card-title"><CalendarDays size={18} /> Répliquer un cycle</span><div className="menus-form-grid"><label className="menus-form-span">Cycle<select value={replication.cycleId} onChange={(event) => setReplication({ ...replication, cycleId: event.target.value })}><option value="">Choisir…</option>{cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</select></label><label>Date de départ<input type="date" value={replication.startDate} onChange={(event) => setReplication({ ...replication, startDate: event.target.value })} /></label><label>Durée<select value={replication.weeks} onChange={(event) => setReplication({ ...replication, weeks: Number(event.target.value) })}>{[1,2,4,6,8].map((week) => <option key={week} value={week}>{week} semaine(s)</option>)}</select></label><button className="btn btn-primary menus-form-span" disabled={!replication.cycleId || saving} onClick={replicate}><RefreshCw size={14} /> Répliquer sans doublon</button></div></div></div> : null}

    {tab === 'planning' ? <div style={{ display: 'grid', gap: '1rem' }}><div className="card-modern"><span className="card-title"><ChefHat size={18} /> Menus datés & production globale</span><div className="table-wrapper" style={{ marginTop: '1rem' }}><table className="table-modern"><thead><tr><th>Date</th><th>Menu</th><th>Cuisine</th><th>Repas</th><th>Sites livrés</th><th>Production</th><th>Action</th></tr></thead><tbody>{centralMenus.map((menu) => { const menuDispatches = dispatches.filter((item) => item.menuId === menu.id); return <tr key={menu.id} onClick={() => setSelectedMenuId(menu.id)} style={{ cursor: 'pointer', background: selectedMenu?.id === menu.id ? '#fffbeb' : undefined }}><td>{dateLabel(menu.date)}</td><td><strong>{menu.name}</strong></td><td>{menu.site?.name ?? '—'}</td><td>{menu.expectedGuests ?? 0}</td><td>{menuDispatches.length}</td><td><span className={`badge ${menu.productionDirtySince ? 'badge-warning' : menu.productionGeneratedAt ? 'badge-published' : 'badge-draft'}`}>{menu.productionDirtySince ? 'À actualiser' : menu.productionGeneratedAt ? 'Générée' : 'À générer'}</span></td><td><div style={{ display: 'flex', gap: '.35rem' }}>{menu.status === 'DRAFT' ? <button className="btn btn-secondary btn-sm" disabled={saving} onClick={(event) => { event.stopPropagation(); void validateMenu(menu); }}>Valider</button> : null}<button className="btn btn-primary btn-sm" disabled={saving || !['VALIDATED','PUBLISHED'].includes(menu.status)} onClick={(event) => { event.stopPropagation(); void generate(menu); }}><ChefHat size={13} /> Générer</button></div></td></tr>; })}</tbody></table></div>{!centralMenus.length ? <Empty title="Aucun menu daté" text="Répliquez un cycle pour créer les menus et distributions." /> : null}</div>{selectedMenu?.guestForecasts?.length ? <div className="card-modern"><div className="section-header-modern compact"><div><span className="card-title"><UsersRound size={18} /> Ajuster les effectifs du {dateLabel(selectedMenu.date)}</span><span className="muted">La base du cycle reste inchangée ; seules les prévisions de cette date sont corrigées.</span></div><button className="btn btn-primary" disabled={saving} onClick={() => void saveDailyForecasts(selectedMenu)}>Enregistrer les effectifs</button></div><div className="table-wrapper" style={{ marginTop: '1rem' }}><table className="table-modern"><thead><tr><th>Site</th><th>Groupe</th><th>Régime</th><th>Repas</th></tr></thead><tbody>{selectedMenu.guestForecasts.map((forecast,index) => <tr key={forecast.id ?? index}><td>{dispatches.find((item) => item.id === forecast.dispatchId)?.destinationSite?.name ?? 'Site'}</td><td>{forecast.guestGroup?.name ?? forecast.group?.name ?? 'Groupe'}</td><td>{forecast.diet?.name ?? 'Standard'}</td><td><input type="number" min={0} value={forecast.count} onChange={(event) => updateForecastCount(selectedMenu.id,index,Number(event.target.value))} style={{ width: 100 }} /></td></tr>)}</tbody></table></div></div> : null}</div> : null}

    {tab === 'distribution' ? <div className="card-modern"><span className="card-title"><Truck size={18} /> Distribution par site</span><DispatchTable dispatches={dispatches} saving={saving} onStatus={changeDispatch} /></div> : null}

    {tab === 'documents' ? <div className="card-modern"><span className="card-title"><FileText size={18} /> Documents de production et distribution</span><label style={{ display: 'grid', gap: '.4rem', marginTop: '1rem' }}>Menu daté<select value={selectedMenu?.id ?? ''} onChange={(event) => setSelectedMenuId(event.target.value)}>{centralMenus.map((menu) => <option key={menu.id} value={menu.id}>{dateLabel(menu.date)} · {menu.name}</option>)}</select></label><div className="menus-grid" style={{ marginTop: '1rem' }}><Document title="Plan de production global" text="Composition et quantités agrégées sur tous les sites." onClick={() => download('PRODUCTION')} /><Document title="Fiche de conditionnement" text="Ventilation par site, groupe et régime." onClick={() => download('PACKING')} /><Document title="Bons de distribution" text="Départ, livraison et effectifs de chaque site satellite." onClick={() => download('DISPATCH')} /></div><p className="muted">Ces PDF reposent sur les menus et distributions historisés. Aucun mouvement de stock n’est déclenché au changement de statut.</p></div> : null}

    {builderOpen ? <CycleBuilder form={cycleForm} sites={sites} recipes={recipes} groups={groups} diets={diets} saving={saving} onForm={setCycleForm} onSave={saveCycle} onClose={() => setBuilderOpen(false)} /> : null}
  </div>;
}

function CycleBuilder({ form, sites, recipes, groups, diets, saving, onForm, onSave, onClose }: { form: MenuCyclePayload; sites: Site[]; recipes: TechnicalSheetRecipe[]; groups: MenuGuestGroup[]; diets: MenuDiet[]; saving: boolean; onForm: (form: MenuCyclePayload) => void; onSave: () => void; onClose: () => void }) {
  const [item, setItem] = useState({ weekNumber: 1, dayOfWeek: 1, service: 'LUNCH' as MenuServiceType, section: 'MAIN' as MenuSection, technicalSheetId: '', dietId: '' });
  const [forecast, setForecast] = useState({ weekNumber: 1, dayOfWeek: 1, service: 'LUNCH' as MenuServiceType, destinationSiteId: '', guestGroupId: '', dietId: '', count: 0, departureTime: '09:00', deliveryTime: '10:30' });
  return <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', padding: '1rem' }}><div className="card-modern" style={{ width: 'min(1100px,96vw)', maxHeight: '92vh', overflow: 'auto' }}><div className="section-header-modern compact"><div><small style={{ color: '#b45309', fontWeight: 800 }}>CONSTRUCTEUR DE CYCLE</small><h2 style={{ margin: '.2rem 0' }}>Composition et effectifs habituels</h2></div><button className="btn btn-secondary" onClick={onClose}><X size={16} /></button></div><div className="menus-form-grid"><label>Nom<input value={form.name} onChange={(event) => onForm({ ...form, name: event.target.value })} /></label><label>Durée<select value={form.durationWeeks} onChange={(event) => onForm({ ...form, durationWeeks: Number(event.target.value) })}>{[1,2,4,6,8].map((week) => <option key={week} value={week}>{week} semaine(s)</option>)}</select></label><label className="menus-form-span">Cuisine de production<select value={form.siteId ?? ''} onChange={(event) => onForm({ ...form, siteId: event.target.value })}><option value="">Choisir…</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label></div>
  <div className="double-panel" style={{ marginTop: '1rem' }}><div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '1rem' }}><strong>Grille des recettes</strong><div className="menus-form-grid"><label>Semaine<input type="number" min={1} max={form.durationWeeks} value={item.weekNumber} onChange={(event) => setItem({ ...item, weekNumber: Number(event.target.value) })} /></label><label>Jour<select value={item.dayOfWeek} onChange={(event) => setItem({ ...item, dayOfWeek: Number(event.target.value) })}>{days.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label><label>Service<select value={item.service} onChange={(event) => setItem({ ...item, service: event.target.value as MenuServiceType })}><option value="LUNCH">Déjeuner</option><option value="DINNER">Dîner</option><option value="BREAKFAST">Petit-déjeuner</option><option value="SNACK">Collation</option></select></label><label>Section<select value={item.section} onChange={(event) => setItem({ ...item, section: event.target.value as MenuSection })}>{Object.entries(sectionLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Régime de la recette<select value={item.dietId} onChange={(event) => setItem({ ...item, dietId: event.target.value })}><option value="">Standard</option>{diets.map((diet) => <option key={diet.id} value={diet.id}>{diet.name}</option>)}</select></label><label className="menus-form-span">Fiche technique<select value={item.technicalSheetId} onChange={(event) => setItem({ ...item, technicalSheetId: event.target.value })}><option value="">Choisir…</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select></label><button className="btn btn-secondary menus-form-span" disabled={!item.technicalSheetId} onClick={() => { onForm({ ...form, items: [...(form.items ?? []), { ...item, dietId: item.dietId || undefined, position: form.items?.length ?? 0 }] }); setItem({ ...item, technicalSheetId: '' }); }}><Plus size={14} /> Ajouter à la grille</button></div><div style={{ display: 'grid', gap: '.35rem' }}>{form.items?.map((line,index) => <div key={index} className="badge badge-draft" style={{ display: 'flex', justifyContent: 'space-between' }}><span>S{line.weekNumber} · {days[line.dayOfWeek-1]} · {serviceLabels[line.service]} · {recipes.find((recipe) => recipe.id === line.technicalSheetId)?.name} · {diets.find((diet) => diet.id === line.dietId)?.name ?? 'Standard'}</span><button style={{ border: 0, background: 'none' }} onClick={() => onForm({ ...form, items: form.items?.filter((_,lineIndex) => lineIndex !== index) })}><X size={13} /></button></div>)}</div></div>
  <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '1rem' }}><strong>Effectifs habituels par site</strong><div className="menus-form-grid"><label>Semaine<input type="number" min={1} max={form.durationWeeks} value={forecast.weekNumber} onChange={(event) => setForecast({ ...forecast, weekNumber: Number(event.target.value) })} /></label><label>Jour<select value={forecast.dayOfWeek} onChange={(event) => setForecast({ ...forecast, dayOfWeek: Number(event.target.value) })}>{days.map((day,index) => <option key={day} value={index+1}>{day}</option>)}</select></label><label>Service<select value={forecast.service} onChange={(event) => setForecast({ ...forecast, service: event.target.value as MenuServiceType })}><option value="LUNCH">Déjeuner</option><option value="DINNER">Dîner</option><option value="BREAKFAST">Petit-déjeuner</option><option value="SNACK">Collation</option></select></label><label>Site livré<select value={forecast.destinationSiteId} onChange={(event) => setForecast({ ...forecast, destinationSiteId: event.target.value })}><option value="">Choisir…</option>{sites.filter((site) => site.id !== form.siteId).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label>Groupe<select value={forecast.guestGroupId} onChange={(event) => setForecast({ ...forecast, guestGroupId: event.target.value })}><option value="">Choisir…</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>Régime<select value={forecast.dietId} onChange={(event) => setForecast({ ...forecast, dietId: event.target.value })}><option value="">Standard</option>{diets.map((diet) => <option key={diet.id} value={diet.id}>{diet.name}</option>)}</select></label><label>Effectif<input type="number" min={0} value={forecast.count} onChange={(event) => setForecast({ ...forecast, count: Number(event.target.value) })} /></label><label>Départ<input type="time" value={forecast.departureTime} onChange={(event) => setForecast({ ...forecast, departureTime: event.target.value })} /></label><label>Livraison<input type="time" value={forecast.deliveryTime} onChange={(event) => setForecast({ ...forecast, deliveryTime: event.target.value })} /></label><button className="btn btn-secondary" disabled={!forecast.destinationSiteId || !forecast.guestGroupId} onClick={() => onForm({ ...form, forecasts: [...(form.forecasts ?? []), { ...forecast, dietId: forecast.dietId || undefined }] })}><Plus size={14} /> Ajouter</button></div><div style={{ display: 'grid', gap: '.35rem' }}>{form.forecasts?.map((line,index) => <div key={index} className="badge badge-draft" style={{ display: 'flex', justifyContent: 'space-between' }}><span>S{line.weekNumber} · {days[line.dayOfWeek-1]} · {sites.find((site) => site.id === line.destinationSiteId)?.name} · {line.count} repas</span><button style={{ border: 0, background: 'none' }} onClick={() => onForm({ ...form, forecasts: form.forecasts?.filter((_,lineIndex) => lineIndex !== index) })}><X size={13} /></button></div>)}</div></div></div>
  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}><button className="btn btn-primary" disabled={!form.name || !form.siteId || !form.items?.length || saving} onClick={onSave}>{saving ? 'Enregistrement…' : 'Créer le cycle'}</button></div></div></div>;
}

function DispatchTable({ dispatches, saving, onStatus }: { dispatches: MenuDispatch[]; saving: boolean; onStatus: (dispatch: MenuDispatch, status: MenuDispatchStatus) => void }) { if (!dispatches.length) return <Empty title="Aucune distribution" text="Les départs apparaîtront après réplication d’un cycle." />; return <div className="table-wrapper" style={{ marginTop: '1rem' }}><table className="table-modern"><thead><tr><th>Départ</th><th>Livraison</th><th>Destination</th><th>Menu</th><th>Repas</th><th>Statut</th><th>Action</th></tr></thead><tbody>{dispatches.map((dispatch) => <tr key={dispatch.id}><td>{dateLabel(dispatch.departureAt)}</td><td>{dateLabel(dispatch.deliveryAt)}</td><td><strong>{dispatch.destinationSite?.name ?? '—'}</strong></td><td>{dispatch.menu?.name ?? '—'}</td><td>{dispatch.forecasts?.reduce((sum,forecast) => sum + Number(forecast.count),0) ?? 0}</td><td><span className={`badge ${dispatch.status === 'DELIVERED' ? 'badge-published' : dispatch.status === 'CANCELLED' ? 'badge-archived' : 'badge-draft'}`}>{dispatchLabels[dispatch.status]}</span></td><td><select disabled={saving} value={dispatch.status} onChange={(event) => onStatus(dispatch, event.target.value as MenuDispatchStatus)}>{Object.entries(dispatchLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></td></tr>)}</tbody></table></div>; }
function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) { return <div className="card-modern" style={{ padding: '1rem' }}><span style={{ color: '#b45309' }}>{icon}</span><strong style={{ display: 'block', fontSize: '1.7rem', marginTop: '.4rem' }}>{value}</strong><span className="muted">{label}</span></div>; }
function Document({ title, text, onClick }: { title: string; text: string; onClick: () => void }) { return <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '1rem' }}><FileText color="#b45309" /><strong style={{ display: 'block', marginTop: '.5rem' }}>{title}</strong><p className="muted">{text}</p><button className="btn btn-secondary" onClick={onClick}>Télécharger le PDF</button></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div style={{ textAlign: 'center', padding: '2rem' }}><PackageCheck color="#94a3b8" /><strong style={{ display: 'block', marginTop: '.5rem' }}>{title}</strong><span className="muted">{text}</span></div>; }
function dateLabel(value?: string | null) { return value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; }
function sameDay(value?: string | null) { if (!value) return false; return new Date(value).toDateString() === new Date().toDateString(); }
function sameWeek(value?: string | null) { if (!value) return false; const now = new Date(); const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); start.setHours(0,0,0,0); const end = new Date(start); end.setDate(end.getDate()+7); const date = new Date(value); return date >= start && date < end; }
function messageOf(error: unknown) { if (error && typeof error === 'object' && 'message' in error) return String(error.message); return 'Action Cuisine centrale impossible.'; }

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  Archive,
  ArrowRight,
  BookOpen,
  Boxes,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Download,
  FileText,
  Factory,
  History,
  LayoutDashboard,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Utensils,
  UsersRound,
  Wine,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { ApiError, api } from '../api/client';
import type {
  MenuCalendarView,
  MenuCatalogType,
  MenuAvailabilityComponent,
  MenuAvailabilityReport,
  MenuCategory,
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
  MenuSettings,
  MenuServiceType,
  MenuStatus,
  MenuUsageProfile,
  Product,
  Site,
  TechnicalSheetRecipe,
  UserSession,
} from '../types';

type MenusTab = 'dashboard' | 'catalog' | 'menus' | 'calendar' | 'cycles' | 'diets' | 'guests' | 'exports' | 'history';

interface MenusAppProps {
  token: string;
  session: UserSession;
  tab: MenusTab;
  sites: Site[];
  canManage: boolean;
  onNavigate: (tab: MenusTab) => void;
  onInstalled?: (apps?: string[]) => void;
  onSettingsChanged?: (settings: MenuSettings) => void;
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

const initialMenuForm = (siteId = ''): MenuPlanPayload => ({
  name: '',
  date: new Date().toISOString().slice(0, 10),
  service: 'LUNCH',
  siteId,
  description: '',
  expectedGuests: 0,
  items: [],
  guestForecasts: [],
});

const initialCatalogForm = (siteId = ''): MenuPlanPayload => ({
  name: 'Carte principale',
  kind: 'CATALOG',
  service: 'SNACK',
  siteId,
  description: '',
  isPrimary: true,
  items: [],
});

const catalogCategoryPresets: Record<MenuCatalogType, Array<{ name: string; color: string; icon: string }>> = {
  FOOD: [
    { name: 'Entrées', color: '#0f766e', icon: 'starter' },
    { name: 'Plats', color: '#dc2626', icon: 'dish' },
    { name: 'Desserts', color: '#b45309', icon: 'cake' },
    { name: 'Sous-desserts', color: '#c2410c', icon: 'cookie' },
    { name: 'Amuse-bouches', color: '#7c3aed', icon: 'sparkles' },
    { name: 'Mignardises', color: '#be185d', icon: 'candy' },
  ],
  DRINKS: [
    { name: 'Vins blancs', color: '#ca8a04', icon: 'wine' },
    { name: 'Vins rouges', color: '#991b1b', icon: 'wine' },
    { name: 'Vins rosés', color: '#e11d48', icon: 'wine' },
    { name: 'Champagnes & effervescents', color: '#a16207', icon: 'glass' },
    { name: 'Cocktails', color: '#7c3aed', icon: 'cocktail' },
    { name: 'Bières', color: '#b45309', icon: 'beer' },
    { name: 'Spiritueux', color: '#713f12', icon: 'glass' },
    { name: 'Softs & jus', color: '#ea580c', icon: 'bottle' },
    { name: 'Cafés & boissons chaudes', color: '#78350f', icon: 'coffee' },
    { name: 'Thés & infusions', color: '#15803d', icon: 'tea' },
    { name: 'Eaux', color: '#2563eb', icon: 'water' },
  ],
};

const normalizeCatalogLookup = (value?: string | null) => (value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('fr')
  .trim();

export function MenusApp({ token, session, tab, sites, canManage, onNavigate, onInstalled, onSettingsChanged }: MenusAppProps) {
  const primarySite = sites.find((site) => site.id === session.user.primarySiteId)
    ?? sites.find((site) => site.isPrimary || site.isMain)
    ?? sites[0];
  const defaultSiteId = primarySite?.id ?? '';
  const [dashboard, setDashboard] = useState<MenuModuleDashboard>();
  const [settings, setSettings] = useState<MenuSettings>();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [availability, setAvailability] = useState<MenuAvailabilityReport>();
  const [menus, setMenus] = useState<MenuPlan[]>([]);
  const [cycles, setCycles] = useState<MenuCycle[]>([]);
  const [diets, setDiets] = useState<MenuDiet[]>([]);
  const [guestGroups, setGuestGroups] = useState<MenuGuestGroup[]>([]);
  const [exportsList, setExportsList] = useState<MenuExport[]>([]);
  const [history, setHistory] = useState<MenuHistoryEntry[]>([]);
  const [recipes, setRecipes] = useState<TechnicalSheetRecipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string>();
  const [calendarView, setCalendarView] = useState<MenuCalendarView>('week');
  const [search, setSearch] = useState('');
  const [menuForm, setMenuForm] = useState<MenuPlanPayload>(() => initialMenuForm(defaultSiteId));
  const [catalogForm, setCatalogForm] = useState<MenuPlanPayload>(() => initialCatalogForm(defaultSiteId));
  const [catalogItemForm, setCatalogItemForm] = useState({ sourceType: 'TECHNICAL_SHEET' as 'TECHNICAL_SHEET' | 'PRODUCT', technicalSheetId: '', productId: '', menuCategoryId: '', servingQuantity: 1, targetReadyQuantity: 0 });
  const [catalogSourceSearch, setCatalogSourceSearch] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [catalogWizardOpen, setCatalogWizardOpen] = useState(false);
  const [catalogWizardDismissed, setCatalogWizardDismissed] = useState(false);
  const [catalogWizardStep, setCatalogWizardStep] = useState<1 | 2 | 3>(1);
  const [catalogType, setCatalogType] = useState<MenuCatalogType>();
  const [selectedPresetCategories, setSelectedPresetCategories] = useState<string[]>([]);
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
  const [showProfileSettings, setShowProfileSettings] = useState(false);

  const selectedMenu = useMemo(() => menus.find((menu) => menu.id === selectedMenuId) ?? menus[0], [menus, selectedMenuId]);
  const catalogs = useMemo(() => menus.filter((menu) => menu.kind === 'CATALOG'), [menus]);
  const selectedCatalog = useMemo(() => catalogs.find((menu) => menu.id === selectedMenuId) ?? catalogs[0], [catalogs, selectedMenuId]);
  const filteredMenus = useMemo(() => menus.filter((menu) => menu.kind !== 'CATALOG' && [menu.name, menu.site?.name, serviceLabel(menu.service), statusLabel(menu.status)].join(' ').toLowerCase().includes(search.toLowerCase())), [menus, search]);
  const activeRecipes = useMemo(() => recipes.filter((recipe) => !recipe.isArchived && recipe.status === 'ACTIVE'), [recipes]);
  const menuEligibleRecipes = useMemo(() => activeRecipes.filter((recipe) => recipe.outputProductId), [activeRecipes]);
  const activeProducts = useMemo(() => products.filter((product) => !product.isArchived).sort((a, b) => a.name.localeCompare(b.name, 'fr')), [products]);
  const catalogProductOptions = useMemo(() => {
    const query = normalizeCatalogLookup(catalogSourceSearch);
    return activeProducts
      .filter((product) => !selectedCatalog?.items?.some((item) => item.productId === product.id))
      .filter((product) => !query || normalizeCatalogLookup([
        product.name,
        product.sku,
        product.gtin,
        product.category?.name,
        product.primarySupplier?.name,
      ].filter(Boolean).join(' ')).includes(query))
      .slice(0, 100)
      .map((product) => ({
        id: product.id,
        label: product.name,
        detail: [product.sku, product.category?.name, product.unit?.symbol].filter(Boolean).join(' · '),
      }));
  }, [activeProducts, catalogSourceSearch, selectedCatalog?.items]);
  const catalogRecipeOptions = useMemo(() => {
    const query = normalizeCatalogLookup(catalogSourceSearch);
    return menuEligibleRecipes
      .filter((recipe) => !selectedCatalog?.items?.some((item) => item.technicalSheetId === recipe.id))
      .filter((recipe) => !query || normalizeCatalogLookup([
        recipe.name,
        recipe.category?.name,
        recipe.description,
        recipe.mode === 'PRODUCTION' ? 'fabrication preparation' : 'assemblage produit fini',
      ].filter(Boolean).join(' ')).includes(query))
      .slice(0, 100)
      .map((recipe) => ({
        id: recipe.id,
        label: recipe.name,
        detail: `${recipe.mode === 'PRODUCTION' ? 'Fabrication / préparation' : 'Assemblage / produit fini'}${recipe.category?.name ? ` · ${recipe.category.name}` : ''}`,
      }));
  }, [menuEligibleRecipes, catalogSourceSearch, selectedCatalog?.items]);
  const catalogCategories = useMemo(() => {
    if (!selectedCatalog?.catalogType) return categories;
    return categories.filter((category) => category.catalogType === selectedCatalog.catalogType);
  }, [categories, selectedCatalog?.catalogType]);
  const canGenerateSelected = Boolean(selectedMenu && ['VALIDATED', 'PUBLISHED'].includes(selectedMenu.status) && Number(selectedMenu.expectedGuests ?? selectedMenu.guestCount ?? 0) > 0 && !selectedMenu.hasBlockingAlerts);

  async function refresh() {
    setLoading(true);
    setError(undefined);
    try {
      const [dashboardResult, settingsResult, categoriesResult, menusResult, cyclesResult, dietsResult, groupsResult, exportsResult, historyResult, recipesResult, productsResult] = await Promise.all([
        api.menusDashboard(token).catch(() => undefined),
        api.menuSettings(token).catch(() => undefined),
        api.menuCategories(token).catch(() => []),
        api.menusList(token).catch(() => []),
        api.menuCycles(token).catch(() => []),
        api.menuDiets(token).catch(() => []),
        api.menuGuestGroups(token).catch(() => []),
        api.menuExports(token).catch(() => []),
        api.menuHistory(token).catch(() => []),
        api.technicalSheetRecipes(token, { includeArchived: true, pageSize: 200 }).then((result) => result.items).catch(() => []),
        api.allProducts(token).catch(() => []),
      ]);
      setDashboard(dashboardResult);
      setSettings(settingsResult);
      setCategories(categoriesResult);
      setMenus(menusResult);
      setCycles(cyclesResult);
      setDiets(dietsResult);
      setGuestGroups(groupsResult);
      setExportsList(exportsResult);
      setHistory(historyResult);
      setRecipes(recipesResult);
      setProducts(productsResult);
      if (!selectedMenuId && menusResult[0]) setSelectedMenuId(menusResult.find((menu) => menu.kind === 'CATALOG')?.id ?? menusResult[0].id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError('Le backend Menus n’est pas encore disponible. Installez/relancez le module Menus côté API.');
      else setError(err instanceof Error ? err.message : 'Chargement du module Menus impossible.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!defaultSiteId) return;
    setCatalogForm((current) => current.siteId ? current : { ...current, siteId: defaultSiteId });
  }, [defaultSiteId]);

  useEffect(() => {
    if (!['catalog', 'dashboard'].includes(tab) || !selectedCatalog) {
      setAvailability(undefined);
      return;
    }
    void api.menuAvailability(token, selectedCatalog.id, selectedCatalog.siteId || undefined)
      .then(setAvailability)
      .catch((err) => setError(err instanceof Error ? err.message : 'Calcul des disponibilités impossible.'));
  }, [tab, selectedCatalog?.id, selectedCatalog?.updatedAt]);

  useEffect(() => {
    if (tab === 'catalog' && settings?.onboardingCompletedAt && catalogs.length === 0 && !catalogWizardDismissed) setCatalogWizardOpen(true);
  }, [tab, settings?.onboardingCompletedAt, catalogs.length, catalogWizardDismissed]);

  async function installMenus() {
    await run(async () => {
      const result = await api.installMenus(token);
      if ('installedApplications' in result) onInstalled?.(result.installedApplications);
      await refresh();
    }, 'Module Menus installé. Fiches Techniques et Production restent les référentiels consommés.');
  }

  async function configureProfile(usageProfile: MenuUsageProfile) {
    await run(async () => {
      const configured = await api.updateMenuSettings(token, { usageProfile });
      setSettings(configured);
      onSettingsChanged?.(configured);
      setCategories(configured.categories ?? []);
      await refresh();
      setShowProfileSettings(false);
    }, 'Le module Menu est maintenant adapté à votre activité.');
  }

  async function createCatalog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalogType || !selectedPresetCategories.length) return;
    await run(async () => {
      for (const name of selectedPresetCategories) {
        const preset = catalogCategoryPresets[catalogType].find((category) => category.name === name);
        const existing = categories.find((category) => category.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'));
        const payload = { name, position: catalogCategoryPresets[catalogType].findIndex((category) => category.name === name), color: preset?.color, icon: preset?.icon, catalogType };
        if (existing) await api.updateMenuCategory(token, existing.id, payload);
        else await api.createMenuCategory(token, payload);
      }
      const created = await api.createMenu(token, { ...catalogForm, siteId: catalogForm.siteId || defaultSiteId || undefined, kind: 'CATALOG', catalogType, items: [] });
      setSelectedMenuId(created.id);
      setCatalogForm(initialCatalogForm(defaultSiteId));
      setCatalogWizardOpen(false);
      setCatalogWizardDismissed(false);
      setCatalogWizardStep(1);
      setCatalogType(undefined);
      setSelectedPresetCategories([]);
      await refresh();
    }, 'Votre carte est créée. Ajoutez maintenant des produits Stocks ou des fiches d’assemblage.');
  }

  function openCatalogWizard() {
    setCatalogWizardDismissed(false);
    setCatalogWizardStep(1);
    setCatalogType(undefined);
    setSelectedPresetCategories([]);
    setCatalogForm(initialCatalogForm(defaultSiteId));
    setCatalogWizardOpen(true);
  }

  function chooseCatalogType(type: MenuCatalogType) {
    setCatalogType(type);
    setSelectedPresetCategories(catalogCategoryPresets[type].map((category) => category.name));
    setCatalogForm((current) => ({ ...current, name: type === 'FOOD' ? 'Carte nourriture' : 'Carte des boissons' }));
    setCatalogWizardStep(2);
  }

  function menuItemsPayload(menu: MenuPlan) {
    return (menu.items ?? []).map((item, index) => ({
      section: item.section ?? 'OTHER',
      menuCategoryId: item.menuCategoryId || undefined,
      technicalSheetId: item.technicalSheetId || undefined,
      productId: item.productId || undefined,
      position: item.order ?? index,
      portionsOverride: item.portionsOverride ?? undefined,
      servingQuantity: item.servingQuantity ?? 1,
      targetReadyQuantity: item.targetReadyQuantity ?? undefined,
      lowStockThreshold: item.lowStockThreshold ?? undefined,
      availabilityEnabled: item.availabilityEnabled ?? true,
    }));
  }

  async function saveCatalogItems(items: MenuItemPayload[], message: string) {
    if (!selectedCatalog) return;
    await run(async () => {
      await api.updateMenu(token, selectedCatalog.id, {
        name: selectedCatalog.name,
        kind: 'CATALOG',
        catalogType: selectedCatalog.catalogType || undefined,
        service: selectedCatalog.service,
        siteId: selectedCatalog.siteId || undefined,
        description: selectedCatalog.description || undefined,
        activeFrom: selectedCatalog.activeFrom || undefined,
        activeUntil: selectedCatalog.activeUntil || undefined,
        isPrimary: selectedCatalog.isPrimary,
        items,
      });
      await refresh();
    }, message);
  }

  async function addCatalogItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceId = catalogItemForm.sourceType === 'PRODUCT' ? catalogItemForm.productId : catalogItemForm.technicalSheetId;
    if (!selectedCatalog || !sourceId) return;
    await saveCatalogItems([
      ...menuItemsPayload(selectedCatalog),
      { section: selectedCatalog.catalogType === 'DRINKS' ? 'DRINK' : 'OTHER', technicalSheetId: catalogItemForm.sourceType === 'TECHNICAL_SHEET' ? catalogItemForm.technicalSheetId : undefined, productId: catalogItemForm.sourceType === 'PRODUCT' ? catalogItemForm.productId : undefined, menuCategoryId: catalogItemForm.menuCategoryId || undefined, servingQuantity: Number(catalogItemForm.servingQuantity), targetReadyQuantity: Number(catalogItemForm.targetReadyQuantity), availabilityEnabled: true },
    ], catalogItemForm.sourceType === 'PRODUCT' ? 'Produit Stocks ajouté à la carte.' : 'Fiche d’assemblage ajoutée à la carte.');
    setCatalogItemForm({ sourceType: catalogItemForm.sourceType, technicalSheetId: '', productId: '', menuCategoryId: catalogCategories[0]?.id ?? '', servingQuantity: 1, targetReadyQuantity: 0 });
    setCatalogSourceSearch('');
  }

  async function updateCatalogTarget(itemId: string, targetReadyQuantity: number) {
    if (!selectedCatalog) return;
    const items = menuItemsPayload(selectedCatalog).map((item, index) => ({
      ...item,
      targetReadyQuantity: selectedCatalog.items?.[index]?.id === itemId ? Math.max(targetReadyQuantity, 0) : item.targetReadyQuantity,
    }));
    await saveCatalogItems(items, 'Objectif de disponibilité mis à jour.');
  }

  async function removeCatalogItem(itemId: string) {
    if (!selectedCatalog) return;
    const items = menuItemsPayload(selectedCatalog).filter((_, index) => selectedCatalog.items?.[index]?.id !== itemId);
    await saveCatalogItems(items, 'Article retiré de la carte.');
  }

  async function createCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    await run(async () => {
      await api.createMenuCategory(token, { name: categoryName.trim(), position: catalogCategories.length, catalogType: selectedCatalog?.catalogType || undefined });
      setCategoryName('');
      await refresh();
    }, 'Rubrique ajoutée à votre carte.');
  }

  async function planCatalogShortages() {
    if (!selectedCatalog) return;
    await run(async () => {
      const result = await api.planMenuShortages(token, selectedCatalog.id, { siteId: selectedCatalog.siteId || undefined });
      setAvailability(result.report);
    }, 'Les besoins manquants ont été préparés en brouillon dans Production.');
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

  if (settings && !settings.onboardingCompletedAt) {
    return <MenuProfileSetup saving={saving} onSelect={configureProfile} />;
  }

  return (
    <div className="menus-app" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <motion.section
        className="welcome-hero theme-blue"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="welcome-tag"><ChefHat size={14} /> Carte, Menus & Production</span>
        <h1 className="welcome-title">{settings?.usageProfile === 'RESTAURANT_CAFE' ? 'Ma carte' : 'Menus'}</h1>
        <p className="welcome-desc">
          Reliez ce que vous proposez aux fiches techniques, visualisez ce qui est disponible et préparez uniquement les productions manquantes.
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowProfileSettings(true)} style={{ marginTop: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Settings size={14} /> Adapter le module à mon activité</button>
      </motion.section>

      {showProfileSettings ? <MenuProfileSetup compact saving={saving} onSelect={configureProfile} onClose={() => setShowProfileSettings(false)} /> : null}
      {catalogWizardOpen ? (
        <CatalogWizard
          step={catalogWizardStep}
          type={catalogType}
          selectedCategories={selectedPresetCategories}
          form={catalogForm}
          sites={sites}
          saving={saving}
          canManage={canManage}
          onChooseType={chooseCatalogType}
          onToggleCategory={(name) => setSelectedPresetCategories((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])}
          onBack={() => setCatalogWizardStep((current) => current === 3 ? 2 : 1)}
          onContinue={() => setCatalogWizardStep(3)}
          onForm={setCatalogForm}
          onSubmit={createCatalog}
          onClose={() => { setCatalogWizardOpen(false); setCatalogWizardDismissed(true); }}
        />
      ) : null}

      <div className="hr-tabs menus-tabs" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {(settings?.usageProfile === 'RESTAURANT_CAFE' ? [
          ['dashboard', 'Tableau de bord'], ['catalog', 'Carte'], ['exports', 'Exports & Documents'], ['history', 'Historique & audit'],
        ] : [
          ['dashboard', 'Tableau de bord'],
          ...(settings?.catalogEnabled ? [['catalog', 'Carte & disponibilités']] : []),
          ...(settings?.scheduledMenusEnabled ? [['menus', 'Menus planifiés'], ['calendar', 'Calendrier']] : []),
          ...(settings?.cyclesEnabled ? [['cycles', 'Cycles']] : []),
          ...(settings?.dietsEnabled ? [['diets', 'Régimes']] : []),
          ...(settings?.guestForecastsEnabled ? [['guests', 'Convives par groupes']] : []),
          ['exports', 'Exports & Documents'], ['history', 'Historique d’audit'],
        ] as Array<[MenusTab, string]>).map(([id, label]) => (
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
              {settings?.catalogEnabled ? (
                <div className="card-modern" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, #ecfdf5, #ffffff)', border: '1px solid #a7f3d0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ color: '#047857', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Vue opérationnelle</span>
                      <h2 style={{ margin: '0.25rem 0', color: '#0f172a', fontSize: '1.3rem' }}>{selectedCatalog?.name ?? 'Créez votre première carte'}</h2>
                      <span className="muted">{availability ? `${availability.summary.ready} article(s) disponibles · ${availability.summary.toProduce} à produire · ${availability.summary.blocked} bloqué(s)` : 'Suivez le stock de vos produits finis et de leurs préparations.'}</span>
                    </div>
                    <button className="btn btn-primary" onClick={() => onNavigate('catalog')}><BookOpen size={16} /> Ouvrir la carte</button>
                  </div>
                </div>
              ) : null}
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
                    {settings?.usageProfile === 'RESTAURANT_CAFE' ? <>
                      <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('catalog')}><BookOpen size={16} /> Ouvrir la carte</button>
                      <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('exports')}><Download size={16} /> Exports & Documents</button>
                      <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('history')}><History size={16} /> Historique & audit</button>
                    </> : <>
                      <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('menus')}><Plus size={16} /> Créer un menu</button>
                      <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('calendar')}><Calendar size={16} /> Calendrier</button>
                      <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('cycles')}><RefreshCw size={16} /> Créer un cycle</button>
                      <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={() => onNavigate('diets')}><UsersRound size={16} /> Gérer les régimes</button>
                    </>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'catalog' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {catalogs.length === 0 ? (
                <div className="card-modern" style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
                  <div style={{ width: 58, height: 58, borderRadius: 18, background: '#ecfdf5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}><BookOpen size={28} /></div>
                  <h2 style={{ margin: 0 }}>Créez votre première carte</h2>
                  <p className="muted" style={{ lineHeight: 1.6, maxWidth: 540, margin: '0.75rem auto 1.25rem' }}>Choisissez d’abord une carte nourriture ou boissons. Vous pourrez ensuite ajouter chaque article depuis Stocks ou depuis une fiche technique active.</p>
                  <button type="button" className="btn btn-primary" disabled={!canManage} onClick={openCatalogWizard}><Plus size={16} /> Créer une carte</button>
                </div>
              ) : (
                <>
                  <div className="card-modern" style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 13, background: '#ecfdf5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BookOpen size={23} /></div>
                        <div>
                          <select value={selectedCatalog?.id ?? ''} onChange={(event) => setSelectedMenuId(event.target.value)} style={{ border: 0, fontSize: '1.15rem', fontWeight: 800, padding: 0, color: '#0f172a', background: 'transparent' }}>
                            {catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.name}</option>)}
                          </select>
                          <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>{selectedCatalog?.site?.name ?? primarySite?.name ?? 'Site non défini'} · disponibilité en temps réel</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" onClick={() => selectedCatalog && api.menuAvailability(token, selectedCatalog.id, selectedCatalog.siteId || undefined).then(setAvailability)}><RefreshCw size={15} /> Actualiser</button>
                        <button className="btn btn-secondary" disabled={!canManage} onClick={openCatalogWizard}><Plus size={15} /> Nouvelle carte</button>
                        <button className="btn btn-primary" disabled={saving || !canManage || !availability?.summary.toProduce} onClick={planCatalogShortages}><Factory size={16} /> Planifier les manquants</button>
                      </div>
                    </div>
                  </div>

                  {availability ? (
                    <div className="menus-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))' }}>
                      <MetricCard label="Articles suivis" value={availability.summary.total} icon={<Boxes />} tone="blue" />
                      <MetricCard label="Disponibles" value={availability.summary.ready} icon={<PackageCheck />} tone="emerald" />
                      <MetricCard label="À produire" value={availability.summary.toProduce} icon={<Factory />} tone="orange" />
                      <MetricCard label="À vérifier" value={availability.summary.blocked} icon={<AlertCircle />} tone="purple" />
                    </div>
                  ) : null}

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 0.8fr)', gap: '1.5rem', alignItems: 'start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {!availability ? (
                        <div className="card-modern" style={{ padding: '2rem', textAlign: 'center' }}><RefreshCw className="animate-spin" size={22} /> Calcul des disponibilités…</div>
                      ) : availability.items.length === 0 ? (
                        <div className="card-modern"><EmptyState title="Carte vide" desc="Ajoutez votre premier article à droite. Les produits Stocks et les fiches actives suivies dans Production sont proposés." /></div>
                      ) : (
                        catalogCategories.map((category) => {
                          const categoryItems = availability.items.filter((item) => item.category?.id === category.id);
                          if (!categoryItems.length) return null;
                          return (
                            <section key={category.id} className="card-modern" style={{ padding: '1.25rem' }}>
                              <h3 style={{ margin: '0 0 1rem', color: category.color || '#0f172a', fontSize: '1rem' }}>{category.name} <span className="muted" style={{ fontWeight: 500 }}>· {categoryItems.length}</span></h3>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {categoryItems.map((item) => <CatalogAvailabilityCard key={item.id} item={item} target={selectedCatalog?.items?.find((menuItem) => menuItem.id === item.id)?.targetReadyQuantity ?? item.targetPortions} saving={saving} onTarget={updateCatalogTarget} onRemove={removeCatalogItem} />)}
                              </div>
                            </section>
                          );
                        })
                      )}
                      {availability?.items.some((item) => !item.category) ? (
                        <section className="card-modern" style={{ padding: '1.25rem' }}>
                          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Autres</h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {availability.items.filter((item) => !item.category).map((item) => <CatalogAvailabilityCard key={item.id} item={item} target={selectedCatalog?.items?.find((menuItem) => menuItem.id === item.id)?.targetReadyQuantity ?? item.targetPortions} saving={saving} onTarget={updateCatalogTarget} onRemove={removeCatalogItem} />)}
                          </div>
                        </section>
                      ) : null}
                    </div>

                    <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'sticky', top: '1rem' }}>
                      <div className="card-modern" style={{ padding: '1.25rem' }}>
                        <span className="card-title"><Plus size={17} /> Ajouter un article</span>
                        <form onSubmit={addCatalogItem} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#334155', marginBottom: '0.45rem' }}>L’article vient de</span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                              <button type="button" className={`btn ${catalogItemForm.sourceType === 'PRODUCT' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setCatalogSourceSearch(''); setCatalogItemForm({ ...catalogItemForm, sourceType: 'PRODUCT', productId: '', technicalSheetId: '' }); }}><Boxes size={14} /> Stocks</button>
                              <button type="button" className={`btn ${catalogItemForm.sourceType === 'TECHNICAL_SHEET' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setCatalogSourceSearch(''); setCatalogItemForm({ ...catalogItemForm, sourceType: 'TECHNICAL_SHEET', productId: '', technicalSheetId: '' }); }}><ChefHat size={14} /> Fiche technique</button>
                            </div>
                          </div>
                          {catalogItemForm.sourceType === 'PRODUCT' ? (
                            <CatalogSourceAutocomplete
                              label="Produit Stocks"
                              placeholder="Rechercher parmi vos produits…"
                              options={catalogProductOptions}
                              value={catalogItemForm.productId}
                              search={catalogSourceSearch}
                              onSearch={(value) => { setCatalogSourceSearch(value); setCatalogItemForm((current) => ({ ...current, productId: '' })); }}
                              onSelect={(option) => { setCatalogSourceSearch(option?.label ?? ''); setCatalogItemForm((current) => ({ ...current, productId: option?.id ?? '' })); }}
                              emptyText="Aucun produit Stocks trouvé"
                              helper="Pour un vin, une eau, un soft ou tout article vendu tel quel. Commencez à écrire pour consulter les résultats."
                            />
                          ) : (
                            <CatalogSourceAutocomplete
                              label="Fiche technique active"
                              placeholder="Rechercher une fiche technique…"
                              options={catalogRecipeOptions}
                              value={catalogItemForm.technicalSheetId}
                              search={catalogSourceSearch}
                              onSearch={(value) => { setCatalogSourceSearch(value); setCatalogItemForm((current) => ({ ...current, technicalSheetId: '' })); }}
                              onSelect={(option) => { setCatalogSourceSearch(option?.label ?? ''); setCatalogItemForm((current) => ({ ...current, technicalSheetId: option?.id ?? '' })); }}
                              emptyText="Aucune fiche technique active trouvée"
                              helper="Toutes les fiches actives avec une sortie suivie dans Production sont disponibles."
                            />
                          )}
                          <label>Rubrique
                            <select value={catalogItemForm.menuCategoryId} onChange={(event) => setCatalogItemForm({ ...catalogItemForm, menuCategoryId: event.target.value })}>
                              <option value="">Autres</option>
                              {catalogCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                            </select>
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                            <label>Qté par portion
                              <input type="number" min="0.001" step="any" value={catalogItemForm.servingQuantity} onChange={(event) => setCatalogItemForm({ ...catalogItemForm, servingQuantity: Number(event.target.value) })} />
                            </label>
                            <label>Objectif prêt
                              <input type="number" min="0" step="any" value={catalogItemForm.targetReadyQuantity} onChange={(event) => setCatalogItemForm({ ...catalogItemForm, targetReadyQuantity: Number(event.target.value) })} />
                            </label>
                          </div>
                          <button className="btn btn-primary" disabled={saving || !canManage || !(catalogItemForm.sourceType === 'PRODUCT' ? catalogItemForm.productId : catalogItemForm.technicalSheetId)}><Plus size={15} /> Ajouter à la carte</button>
                          {catalogItemForm.sourceType === 'TECHNICAL_SHEET' && !menuEligibleRecipes.length ? <span className="muted" style={{ fontSize: '0.75rem' }}>Créez et activez d’abord une fiche technique.</span> : null}
                        </form>
                      </div>

                      <div className="card-modern" style={{ padding: '1.25rem' }}>
                        <span className="card-title"><Settings size={17} /> Rubriques</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.9rem 0' }}>{catalogCategories.map((category) => <span key={category.id} className="badge badge-draft" style={{ color: category.color || undefined }}>{category.name}</span>)}</div>
                        <form onSubmit={createCategory} style={{ display: 'flex', gap: '0.5rem' }}>
                          <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Nouvelle rubrique" style={{ minWidth: 0 }} />
                          <button className="btn btn-secondary" disabled={!categoryName.trim() || saving}><Plus size={14} /></button>
                        </form>
                      </div>
                    </aside>
                  </div>
                </>
              )}
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
                    <CompositionBuilder recipes={menuEligibleRecipes} onAdd={addMenuItem} />
                    
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

type CatalogSourceOption = { id: string; label: string; detail?: string };

function CatalogSourceAutocomplete({ label, placeholder, options, value, search, onSearch, onSelect, emptyText, helper }: {
  label: string;
  placeholder: string;
  options: CatalogSourceOption[];
  value: string;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (option?: CatalogSourceOption) => void;
  emptyText: string;
  helper: string;
}) {
  const [open, setOpen] = useState(false);
  const visibleOptions = options.slice(0, 12);
  return (
    <div className="custom-autocomplete-wrapper" style={{ position: 'relative' }}>
      <label style={{ display: 'block' }}>{label}</label>
      <div style={{ position: 'relative', marginTop: '0.35rem' }}>
        <input
          value={search}
          onChange={(event) => { onSearch(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          style={{ width: '100%', paddingRight: value ? '2.25rem' : undefined }}
        />
        {value ? <button type="button" aria-label="Effacer la sélection" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(undefined); setOpen(true); }} style={{ position: 'absolute', right: '0.55rem', top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: '0.2rem' }}><X size={15} /></button> : null}
      </div>
      {open ? (
        <div className="custom-autocomplete-dropdown" role="listbox" style={{ position: 'absolute', top: 'calc(100% - 1.55rem)', left: 0, right: 0, zIndex: 1400, maxHeight: 280, overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff', boxShadow: '0 14px 32px rgba(15, 23, 42, 0.16)' }}>
          {visibleOptions.length ? visibleOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(option);
                setOpen(false);
              }}
              style={{ width: '100%', border: 0, borderBottom: '1px solid #f1f5f9', background: option.id === value ? '#ecfdf5' : '#fff', padding: '0.7rem 0.8rem', textAlign: 'left', cursor: 'pointer' }}
            >
              <strong style={{ display: 'block', color: '#0f172a', fontSize: '0.84rem' }}>{option.label}</strong>
              {option.detail ? <span style={{ display: 'block', color: '#64748b', fontSize: '0.73rem', marginTop: '0.15rem' }}>{option.detail}</span> : null}
            </button>
          )) : <div style={{ padding: '0.85rem', color: '#64748b', fontSize: '0.8rem' }}>{emptyText}</div>}
          {options.length > visibleOptions.length ? <div style={{ padding: '0.55rem 0.8rem', color: '#64748b', fontSize: '0.72rem', background: '#f8fafc' }}>{options.length - visibleOptions.length} autre(s) résultat(s) — précisez votre recherche.</div> : null}
        </div>
      ) : null}
      <small className="muted" style={{ display: 'block', marginTop: '0.4rem' }}>{helper}</small>
    </div>
  );
}

function CatalogWizard({ step, type, selectedCategories, form, sites, saving, canManage, onChooseType, onToggleCategory, onBack, onContinue, onForm, onSubmit, onClose }: {
  step: 1 | 2 | 3;
  type?: MenuCatalogType;
  selectedCategories: string[];
  form: MenuPlanPayload;
  sites: Site[];
  saving: boolean;
  canManage: boolean;
  onChooseType: (type: MenuCatalogType) => void;
  onToggleCategory: (name: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onForm: (form: MenuPlanPayload) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const labels = ['Type de carte', 'Catégories', 'Informations'];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
      <div className="card-modern" style={{ width: 'min(880px, 100%)', maxHeight: '92vh', overflowY: 'auto', padding: '1.75rem', position: 'relative' }}>
        <button type="button" aria-label="Fermer" onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', border: 0, background: '#f1f5f9', color: '#475569', borderRadius: 9, padding: '0.45rem', cursor: 'pointer' }}><X size={18} /></button>
        <div style={{ maxWidth: 650, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.3rem', paddingRight: '2.5rem' }}>
            {labels.map((label, index) => {
              const number = index + 1;
              const active = number === step;
              const complete = number < step;
              return <div key={label} style={{ display: 'flex', alignItems: 'center', flex: index === labels.length - 1 ? '0 0 auto' : 1, gap: '0.4rem' }}><span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: '0.75rem', fontWeight: 800, background: active || complete ? '#10b981' : '#e2e8f0', color: active || complete ? '#fff' : '#64748b' }}>{complete ? '✓' : number}</span><span style={{ fontSize: '0.75rem', fontWeight: active ? 800 : 600, color: active ? '#0f172a' : '#64748b' }}>{label}</span>{index < labels.length - 1 ? <span style={{ height: 1, background: complete ? '#6ee7b7' : '#e2e8f0', flex: 1 }} /> : null}</div>;
            })}
          </div>

          {step === 1 ? (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}><h2 style={{ margin: 0 }}>Quelle carte souhaitez-vous créer ?</h2><p className="muted">Ce choix prépare les bonnes catégories sans vous imposer une configuration complexe.</p></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
                <button type="button" onClick={() => onChooseType('FOOD')} style={{ border: '1px solid #d1fae5', borderRadius: 16, padding: '1.5rem', background: '#f0fdf4', textAlign: 'left', cursor: 'pointer' }}><span style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: '#fff', color: '#047857', marginBottom: '0.9rem' }}><Utensils size={25} /></span><strong style={{ display: 'block', fontSize: '1.08rem', color: '#0f172a' }}>Carte nourriture</strong><span style={{ display: 'block', marginTop: '0.35rem', color: '#475569', lineHeight: 1.5 }}>Entrées, plats, desserts, amuse-bouches et mignardises.</span></button>
                <button type="button" onClick={() => onChooseType('DRINKS')} style={{ border: '1px solid #dbeafe', borderRadius: 16, padding: '1.5rem', background: '#eff6ff', textAlign: 'left', cursor: 'pointer' }}><span style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: '#fff', color: '#2563eb', marginBottom: '0.9rem' }}><Wine size={25} /></span><strong style={{ display: 'block', fontSize: '1.08rem', color: '#0f172a' }}>Carte des boissons</strong><span style={{ display: 'block', marginTop: '0.35rem', color: '#475569', lineHeight: 1.5 }}>Vins, eaux, softs, cafés, cocktails et boissons chaudes.</span></button>
              </div>
            </div>
          ) : null}

          {step === 2 && type ? (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}><h2 style={{ margin: 0 }}>Choisissez vos catégories</h2><p className="muted">Les catégories courantes sont déjà sélectionnées. Décochez simplement celles que vous n’utilisez pas.</p></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.7rem' }}>
                {catalogCategoryPresets[type].map((category) => {
                  const checked = selectedCategories.includes(category.name);
                  return <label key={category.name} style={{ border: `1px solid ${checked ? category.color : '#e2e8f0'}`, borderRadius: 12, padding: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.7rem', cursor: 'pointer', background: checked ? `${category.color}0D` : '#fff' }}><input type="checkbox" checked={checked} onChange={() => onToggleCategory(category.name)} /><span style={{ width: 10, height: 10, borderRadius: 999, background: category.color }} /><strong style={{ color: '#334155', fontSize: '0.86rem' }}>{category.name}</strong></label>;
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1.4rem' }}><button type="button" className="btn btn-secondary" onClick={onBack}>Retour</button><button type="button" className="btn btn-primary" disabled={!selectedCategories.length} onClick={onContinue}>Valider les catégories <ArrowRight size={15} /></button></div>
            </div>
          ) : null}

          {step === 3 && type ? (
            <form onSubmit={onSubmit}>
              <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}><h2 style={{ margin: 0 }}>Dernières informations</h2><p className="muted">Votre espace de carte sera prêt dès la validation.</p></div>
              <div className="menus-form-grid">
                <label className="menus-form-span">Nom de la carte
                  <input value={form.name} onChange={(event) => onForm({ ...form, name: event.target.value })} required placeholder={type === 'FOOD' ? 'Ex. Carte nourriture' : 'Ex. Carte des boissons'} />
                </label>
                <label>Site suivi
                  <select value={form.siteId ?? ''} onChange={(event) => onForm({ ...form, siteId: event.target.value })} required>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
                </label>
                <label>Début de validité
                  <input type="date" value={form.activeFrom ?? ''} onChange={(event) => onForm({ ...form, activeFrom: event.target.value })} />
                </label>
                <label className="menus-form-span">Description
                  <textarea rows={3} value={form.description ?? ''} onChange={(event) => onForm({ ...form, description: event.target.value })} placeholder="Saison, salle, terrasse, emplacement…" />
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1.4rem' }}><button type="button" className="btn btn-secondary" onClick={onBack}>Retour</button><button className="btn btn-primary" disabled={saving || !canManage || !form.name.trim()}>{saving ? 'Création…' : 'Créer la carte'} <CheckCircle2 size={15} /></button></div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MenuProfileSetup({ saving, onSelect, compact = false, onClose }: { saving: boolean; onSelect: (profile: MenuUsageProfile) => void; compact?: boolean; onClose?: () => void }) {
  const profiles: Array<{ id: MenuUsageProfile; title: string; description: string; examples: string; icon: React.ReactNode; color: string; background: string }> = [
    { id: 'RESTAURANT_CAFE', title: 'Restaurant ou café', description: 'Carte permanente ou saisonnière avec disponibilité des produits finis.', examples: 'Café, restaurant, boulangerie', icon: <BookOpen size={25} />, color: '#047857', background: '#ecfdf5' },
    { id: 'CATERER', title: 'Traiteur', description: 'Événements datés, quantités par prestation et heure de livraison.', examples: 'Cocktail, buffet, mariage', icon: <CalendarDays size={25} />, color: '#7c3aed', background: '#f5f3ff' },
    { id: 'CENTRAL_KITCHEN', title: 'Cuisine centrale', description: 'Cycles, sites, régimes et groupes de convives.', examples: 'École, santé, collectivité', icon: <Factory size={25} />, color: '#b45309', background: '#fffbeb' },
    { id: 'CUSTOM', title: 'Organisation hybride', description: 'Combine les parcours restaurant, traiteur et cuisine centrale.', examples: 'Plusieurs activités dans une organisation', icon: <Settings size={25} />, color: '#2563eb', background: '#eff6ff' },
  ];
  return (
    <div style={compact ? { position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' } : { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(135deg, #f8fafc, #ecfdf5)', borderRadius: '18px' }}>
      <div className="card-modern" style={{ width: 'min(980px, 100%)', padding: '2rem', position: 'relative' }}>
        {onClose ? <button type="button" onClick={onClose} style={{ position: 'absolute', right: '1rem', top: '1rem', border: 0, background: '#f1f5f9', borderRadius: 8, padding: '0.4rem', cursor: 'pointer' }}><X size={17} /></button> : null}
        <div style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto 1.5rem' }}>
          <span style={{ color: '#047857', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase' }}>Configuration guidée</span>
          <h1 style={{ margin: '0.35rem 0', fontSize: '1.7rem', color: '#0f172a' }}>Comment utilisez-vous vos menus ?</h1>
          <p className="muted" style={{ lineHeight: 1.55 }}>Choisissez le fonctionnement principal. Les outils utiles seront mis en avant et ce choix restera modifiable.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
          {profiles.map((profile) => (
            <button key={profile.id} type="button" disabled={saving} onClick={() => onSelect(profile.id)} style={{ textAlign: 'left', border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: '1.25rem', cursor: saving ? 'wait' : 'pointer', display: 'flex', gap: '1rem' }}>
              <span style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 14, background: profile.background, color: profile.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{profile.icon}</span>
              <span><strong style={{ display: 'block', color: '#0f172a', fontSize: '1rem', marginBottom: '0.3rem' }}>{profile.title}</strong><span style={{ display: 'block', color: '#475569', fontSize: '0.82rem', lineHeight: 1.45 }}>{profile.description}</span><small style={{ display: 'block', color: profile.color, marginTop: '0.5rem', fontWeight: 700 }}>{profile.examples}</small></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CatalogAvailabilityCard({ item, target, saving, onTarget, onRemove }: { item: MenuAvailabilityReport['items'][number]; target: number; saving: boolean; onTarget: (id: string, target: number) => void; onRemove: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [targetValue, setTargetValue] = useState(Number(target ?? 0));
  useEffect(() => setTargetValue(Number(target ?? 0)), [target]);
  const status = availabilityStatus(item.status);
  return (
    <div style={{ border: `1px solid ${status.border}`, borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) repeat(3, minmax(90px, 0.65fr)) auto', gap: '0.85rem', alignItems: 'center', padding: '0.9rem 1rem' }}>
        <div>
          <strong style={{ color: '#0f172a', display: 'block' }}>{item.name}</strong>
          <small className="muted">{item.sourceType === 'PRODUCT' ? 'Produit Stocks' : 'Fiche technique'}</small>
          <span style={{ display: 'inline-flex', marginTop: '0.3rem', padding: '0.15rem 0.45rem', borderRadius: 999, background: status.background, color: status.color, fontSize: '0.7rem', fontWeight: 800 }}>{status.label}</span>
          {item.message ? <small style={{ display: 'block', color: '#b45309', marginTop: '0.35rem' }}>{item.message}</small> : null}
        </div>
        <AvailabilityNumber label="Disponible" value={item.availablePortions ?? 0} suffix="port." color="#047857" />
        <AvailabilityNumber label={item.sourceType === 'PRODUCT' ? 'Réservé en production' : 'En production'} value={item.servingQuantity ? Math.floor(Number(item.inProductionQuantity ?? 0) / item.servingQuantity) : 0} suffix="port." color="#2563eb" />
        <AvailabilityNumber label={item.sourceType === 'PRODUCT' ? 'À approvisionner' : 'À produire'} value={item.sourceType === 'PRODUCT' ? Math.ceil(Number(item.missingStockQuantity ?? 0) / item.servingQuantity) : item.toProducePortions ?? 0} suffix="port." color={Number(item.sourceType === 'PRODUCT' ? item.missingStockQuantity : item.toProducePortions) > 0 ? '#c2410c' : '#64748b'} />
        <div style={{ display: 'flex', alignItems: 'end', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>Objectif
            <input type="number" min="0" step="any" value={targetValue} onChange={(event) => setTargetValue(Number(event.target.value))} style={{ width: 70, padding: '0.35rem', marginTop: '0.2rem' }} />
          </label>
          <button className="btn btn-secondary btn-sm" disabled={saving || targetValue === Number(target ?? 0)} onClick={() => onTarget(item.id, targetValue)}>OK</button>
          <button type="button" title="Retirer de la carte" disabled={saving} onClick={() => onRemove(item.id)} style={{ border: 0, background: '#fef2f2', color: '#dc2626', borderRadius: 7, padding: '0.4rem', cursor: 'pointer' }}><X size={14} /></button>
        </div>
      </div>
      {item.components?.length ? (
        <div style={{ borderTop: '1px solid #e2e8f0' }}>
          <button type="button" onClick={() => setExpanded(!expanded)} style={{ width: '100%', border: 0, background: '#f8fafc', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700 }}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {item.sourceType === 'PRODUCT' ? 'Détail du stock' : 'Situation des préparations et matières'}</button>
          {expanded ? <div style={{ padding: '0.65rem 1rem 0.85rem' }}>{item.components.map((component, index) => <AvailabilityComponentRow key={`${component.kind}-${component.technicalSheetId || component.productId}-${index}`} component={component} />)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function AvailabilityNumber({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: string }) {
  return <div><span style={{ display: 'block', fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>{label}</span><strong style={{ color, fontSize: '1rem' }}>{Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} <small>{suffix}</small></strong></div>;
}

function AvailabilityComponentRow({ component, depth = 0 }: { component: MenuAvailabilityComponent; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = Boolean(component.children?.length);
  return (
    <div style={{ marginLeft: depth ? '0.8rem' : 0, borderLeft: depth ? '2px solid #dbeafe' : undefined, paddingLeft: depth ? '0.65rem' : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.4rem 0', fontSize: '0.76rem' }}>
        <button type="button" onClick={() => hasChildren && setExpanded(!expanded)} style={{ border: 0, background: 'transparent', padding: 0, color: '#334155', cursor: hasChildren ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '0.3rem', textAlign: 'left' }}>{hasChildren ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : <span style={{ width: 13 }} />}<strong>{component.kind === 'SUB_RECIPE' ? 'Préparation · ' : ''}{component.name}</strong></button>
        <span style={{ color: component.missingQuantity > 0 ? '#c2410c' : '#047857', whiteSpace: 'nowrap' }}>{component.missingQuantity > 0 ? `Manque ${Number(component.missingQuantity).toLocaleString('fr-FR', { maximumFractionDigits: 3 })}` : 'Disponible'} {component.unit}</span>
      </div>
      {component.reason ? <div style={{ color: '#b91c1c', fontSize: '0.7rem', marginLeft: '1rem' }}>{component.reason}</div> : null}
      {expanded ? component.children?.map((child, index) => <AvailabilityComponentRow key={`${child.kind}-${child.technicalSheetId || child.productId}-${index}`} component={child} depth={depth + 1} />) : null}
    </div>
  );
}

function availabilityStatus(status: string) {
  if (status === 'READY') return { label: 'Disponible', color: '#047857', background: '#ecfdf5', border: '#a7f3d0' };
  if (status === 'LOW_STOCK') return { label: 'Production en cours', color: '#1d4ed8', background: '#eff6ff', border: '#bfdbfe' };
  if (status === 'TO_PRODUCE') return { label: 'À produire', color: '#c2410c', background: '#fff7ed', border: '#fed7aa' };
  if (status === 'COMPONENT_MISSING') return { label: 'Préparation à refaire', color: '#a16207', background: '#fefce8', border: '#fde68a' };
  if (status === 'NOT_CONFIGURED') return { label: 'À configurer', color: '#7c3aed', background: '#f5f3ff', border: '#ddd6fe' };
  return { label: 'Matière manquante', color: '#b91c1c', background: '#fef2f2', border: '#fecaca' };
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
function buildAlerts(menus: MenuPlan[]) { const planned = menus.filter((menu) => menu.kind !== 'CATALOG'); const alerts = []; if (menus.some((m) => (m.items?.length ?? 0) === 0)) alerts.push({ message: 'Certaines cartes ou menus sont encore vides.', severity: 'warning' }); if (planned.some((m) => !(m.expectedGuests ?? m.guestCount))) alerts.push({ message: 'Menus sans estimation de convives.', severity: 'warning' }); if (planned.some((m) => ['VALIDATED', 'PUBLISHED'].includes(m.status) && !m.productionGeneratedAt)) alerts.push({ message: 'Menus validés ou publiés non générés en Production.', severity: 'warning' }); if (alerts.length === 0) alerts.push({ message: 'Aucune alerte bloquante détectée.', severity: 'success' }); return alerts; }
function groupMenusForCalendar(menus: MenuPlan[], view: MenuCalendarView) { const datedMenus = menus.filter((menu) => menu.date); const size = view === 'day' ? 1 : view === 'week' ? 7 : view === 'month' ? 31 : 12; return Array.from({ length: Math.min(size, 12) }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); const label = view === 'year' ? date.toLocaleDateString('fr-FR', { month: 'long' }) : date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }); return { label, items: datedMenus.filter((m) => view === 'year' ? new Date(m.date!).getMonth() === date.getMonth() : new Date(m.date!).toDateString() === date.toDateString()) }; }); }

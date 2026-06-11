import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Package,
  History,
  ChefHat,
  UsersRound,
  FileText,
  Calendar,
  Thermometer,
  ShoppingCart,
  ShoppingBag,
  LogOut,
  Plus,
  Search,
  X,
  Menu,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  Clock,
  ArrowRight,
  Info,
  Layers,
  Scale,
  Settings,
  Boxes,
  Trash2,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  MapPin,
  Archive,
  Download,
  ClipboardList,
  Warehouse,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  Category,
  DashboardSummary,
  AuditEntry,
  Inventory,
  Location,
  Product,
  Site,
  Stock,
  StockMovement,
  StockMovementType,
  Supplier,
  Unit,
  UserSession,
} from '../types';

const movementLabels: Record<StockMovementType, string> = {
  RECEPTION: 'Réception',
  IN: 'Entrée',
  ENTRY: 'Entrée',
  OUT: 'Sortie',
  EXIT: 'Sortie',
  PRODUCTION: 'Production',
  LOSS: 'Perte',
  CORRECTION: 'Correction',
  INVENTORY: 'Inventaire',
  TRANSFER: 'Transfert',
};

const apps = [
  {
    id: 'stocks',
    icon: Package,
    title: 'Stocks',
    category: 'Logistique & Inventaire',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    developer: 'ToqueHub Core',
    rating: '4.9',
    ratingCount: '128',
    ageLimit: '3+',
    size: '1.2 Mo',
    tagline: 'Gérez vos stocks, inventaires et mouvements en temps réel.',
    description: 'Le module de gestion des stocks est l\'épine dorsale de votre cuisine ToqueHub. Il vous permet de suivre l\'intégralité de vos marchandises avec précision.\n\nFonctionnalités clés :\n- Suivi de l\'inventaire en temps réel par produit et par catégorie.\n- Enregistrement des mouvements d\'entrée (Réception) et de sortie (Perte, Correction, Production).\n- Fiches produits complètes avec SKU et unités de mesure.\n- Traçabilité et historique complet des flux physiques de votre cuisine.',
    screenshots: ['Inventaire', 'Flux de stocks', 'Fiche produit'],
    changelog: 'Optimisation du temps de chargement des fiches et filtres par catégories.',
    version: 'v1.4.2',
    compatibility: 'ToqueHub Core v0.1.0+',
    status: 'Disponible',
  },
  {
    id: 'recipes',
    icon: FileText,
    title: 'Recettes',
    category: 'Fiches Techniques',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    developer: 'ToqueHub Core',
    rating: '4.8',
    ratingCount: '94',
    ageLimit: '3+',
    size: '2.4 Mo',
    tagline: 'Fiches techniques de cuisine et calcul automatique des coûts de revient.',
    description: 'Le module de Recettes vous permet de structurer vos préparations culinaires de manière professionnelle.\n\nFonctionnalités clés :\n- Création de fiches techniques avec ingrédients liés à votre inventaire.\n- Calcul instantané des coûts matières et de la marge brute par portion.\n- Gestion des allergènes et valeurs nutritionnelles.\n- Export PDF élégant pour impression en cuisine.',
    screenshots: ['Fiche technique', 'Coûts de revient', 'Base de recettes'],
    changelog: 'Optimisation de l\'affichage sur tablette de cuisine.',
    version: 'v0.9.1',
    compatibility: 'ToqueHub Core v0.1.0+',
    status: 'Bientôt disponible',
  },
  {
    id: 'production',
    icon: Calendar,
    title: 'Production',
    category: 'Planification',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    developer: 'ToqueHub Core',
    rating: '4.7',
    ratingCount: '48',
    ageLimit: '3+',
    size: '3.1 Mo',
    tagline: 'Planifiez vos sessions de production et automatisez vos bons d\'économat.',
    description: 'Planifiez votre production quotidienne ou hebdomadaire en fonction de vos prévisions de vente.\n\nFonctionnalités clés :\n- Planification de production de recettes à grande échelle.\n- Calcul automatique des besoins en matières premières (Bons d\'économat).\n- Suivi de la réalisation et des rendements de production.\n- Historique des sessions de préparation culinaire.',
    screenshots: ['Calendrier de production', 'Bon d\'économat', 'Suivi de rendement'],
    changelog: 'Intégration avec le module de planification hebdomadaire.',
    version: 'v0.8.0',
    compatibility: 'ToqueHub Core v0.1.0+',
    status: 'Bientôt disponible',
  },
  {
    id: 'haccp',
    icon: Thermometer,
    title: 'HACCP',
    category: 'Qualité & Hygiène',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    developer: 'ToqueHub Core',
    rating: '4.95',
    ratingCount: '162',
    ageLimit: '3+',
    size: '1.8 Mo',
    tagline: 'Traçabilité sanitaire, relevés de températures et contrôles de nettoyage.',
    description: 'Garantissez la conformité réglementaire de votre cuisine avec le plan de maîtrise sanitaire (PMS) digitalisé.\n\nFonctionnalités clés :\n- Relevés de température automatiques et manuels pour enceintes froides.\n- Traçabilité des étiquettes produits en fin de service (appareil photo).\n- Enregistrement des plannings de nettoyage de la cuisine.\n- alertes immédiates en cas d\'anomalie de température.',
    screenshots: ['Enregistrement température', 'Photo d\'étiquettes', 'Nettoyage des zones'],
    changelog: 'Ajout de la prise en charge des capteurs Bluetooth connectés.',
    version: 'v1.1.0',
    compatibility: 'ToqueHub Core v0.1.0+',
    status: 'Bientôt disponible',
  },
  {
    id: 'purchasing',
    icon: ShoppingCart,
    title: 'Achats',
    category: 'Approvisionnement',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
    developer: 'ToqueHub Core',
    rating: '4.6',
    ratingCount: '37',
    ageLimit: '3+',
    size: '2.9 Mo',
    tagline: 'Commandes fournisseurs simplifiées et réceptions de marchandises.',
    description: 'Gérez vos relations d\'achat et automatisez les approvisionnements de matières premières.\n\nFonctionnalités clés :\n- Génération de bons de commande fournisseurs basés sur les stocks minimums.\n- Envoi automatique des commandes par e-mail.\n- Réception de marchandises en un clic avec intégration immédiate en stock.\n- Suivi des factures et des écarts de prix de livraison.',
    screenshots: ['Bon de commande', 'Réception livraison', 'Analyses achats'],
    changelog: 'Ajout du filtre de facturation fournisseurs.',
    version: 'v0.7.2',
    compatibility: 'ToqueHub Core v0.1.0+',
    status: 'Bientôt disponible',
  },
  {
    id: 'hr',
    icon: UsersRound,
    title: 'RH',
    category: 'Ressources Humaines',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #64748b 0%, #334155 100%)',
    developer: 'ToqueHub Core',
    rating: '4.5',
    ratingCount: '23',
    ageLimit: '3+',
    size: '1.5 Mo',
    tagline: 'Gérez vos équipes de cuisine, plannings et rôles.',
    description: 'Organisez les plannings et rôles de votre personnel en cuisine pour optimiser la productivité.',
    screenshots: ['Plannings', 'Profils équipe', 'Rôles'],
    changelog: 'Ajustements mineurs d\'ergonomie de planning.',
    version: 'v0.5.0',
    compatibility: 'ToqueHub Core v0.1.0+',
    status: 'Bientôt disponible',
  }
];

type ActiveTab = 'overview' | 'applications' | 'settings' | 'stocks-dashboard' | 'inventory' | 'movements' | 'products' | 'categories' | 'units' | 'suppliers' | 'inventories' | 'locations' | 'audit';
type Confirmation = 'install-stocks' | 'uninstall-stocks' | null;

interface DashboardProps {
  session: UserSession;
  onLogout: () => void;
}

export function Dashboard({ session, onLogout }: DashboardProps) {
  const token = session.accessToken;
  
  // Data State
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>();
  
  // UI State
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [isLoading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [installedApps, setInstalledApps] = useState<string[]>(session.user.installedApplications ?? []);

  // Modal Visibility State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showPrefillWizard, setShowPrefillWizard] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [appActionLoading, setAppActionLoading] = useState(false);
  const [selectedStoreApp, setSelectedStoreApp] = useState<AppDefinition | null>(null);
  const [installingAppId, setInstallingAppId] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState(0);

  // Dashboard Customization State
  const [dashboardTheme, setDashboardTheme] = useState<'emerald' | 'blue' | 'amber' | 'dark'>(() => {
    return (localStorage.getItem('toquehub_dashboard_theme') as any) || 'emerald';
  });
  const [visibleWidgets, setVisibleWidgets] = useState<{ metrics: boolean; progress: boolean; apps: boolean }>(() => {
    try {
      const stored = localStorage.getItem('toquehub_dashboard_widgets');
      return stored ? JSON.parse(stored) : { metrics: true, progress: true, apps: true };
    } catch {
      return { metrics: true, progress: true, apps: true };
    }
  });
  const [layoutMode, setLayoutMode] = useState<'split' | 'stacked'>(() => {
    return (localStorage.getItem('toquehub_dashboard_layout') as any) || 'split';
  });
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);

  // Search & Filter States
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [unitSearch, setUnitSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [inventorySessionSearch, setInventorySessionSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(undefined);
    try {
      const [summaryResult, nextCategories, nextUnits, nextProducts, nextSuppliers, nextStocks, nextMovements, nextSites, nextLocations, nextInventories, nextAuditEntries] =
        await Promise.all([
          api.dashboardSummary(token).catch(() => undefined),
          api.categories(token),
          api.units(token),
          api.products(token),
          api.suppliers(token),
          api.stocks(token),
          api.movements(token),
          api.sites(token).catch(() => []),
          api.locations(token).catch(() => []),
          api.inventories(token).catch(() => []),
          api.audit(token).catch(() => []),
        ]);
      if (summaryResult) {
        setDashboardSummary(summaryResult);
        setInstalledApps(summaryResult.installedApplications ?? []);
      }
      setCategories(nextCategories);
      setUnits(nextUnits);
      setProducts(nextProducts);
      setSuppliers(nextSuppliers);
      setStocks(nextStocks);
      setMovements(nextMovements);
      setSites(nextSites);
      setLocations(nextLocations);
      setInventories(nextInventories);
      setAuditEntries(nextAuditEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);


  const stocksInstalled = installedApps.includes('stocks');
  const organizationName = session.user.organizationName ?? 'votre établissement';
  const firstName = session.user.firstName?.trim() || session.user.username?.trim() || 'Bienvenue';
  
  const totalStock = useMemo(
    () => stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0),
    [stocks],
  );

  const progressItems = [
    { label: 'Installer une application', done: installedApps.length > 0 },
    { label: 'Créer votre premier produit', done: products.length > 0 },
    { label: 'Ajouter un fournisseur', done: suppliers.length > 0 },
    { label: 'Effectuer un mouvement de stock', done: movements.length > 0 },
  ];
  
  const completed = dashboardSummary?.progress ? Math.round((dashboardSummary.progress.percent / 100) * progressItems.length) : progressItems.filter((item) => item.done).length;
  const progress = dashboardSummary?.progress?.percent ?? Math.round((completed / progressItems.length) * 100);

  async function installStocks() {
    setAppActionLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const summary = await api.installStocks(token);
      setDashboardSummary(summary);
      setInstalledApps(summary.installedApplications ?? ['stocks']);
      setSuccess('L’application Stocks a été installée. Les menus métier sont maintenant visibles pour toute l’organisation.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation de Stocks impossible.');
    } finally {
      setAppActionLoading(false);
      setConfirmation(null);
    }
  }

  async function uninstallStocks() {
    setAppActionLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const summary = await api.uninstallStocks(token);
      setDashboardSummary(summary);
      setInstalledApps(summary.installedApplications ?? []);
      if (['stocks-dashboard', 'inventory', 'movements', 'products', 'categories', 'units', 'suppliers', 'inventories', 'locations', 'audit'].includes(activeTab)) {
        setActiveTab('applications');
      }
      setSuccess('L’application Stocks a été supprimée de l’interface. Les données métier existantes sont conservées.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression de Stocks impossible.');
    } finally {
      setAppActionLoading(false);
      setConfirmation(null);
    }
  }

  async function triggerInstallApp(appId: string) {
    if (appId !== 'stocks') return;
    setInstallingAppId(appId);
    setInstallProgress(0);

    const interval = setInterval(() => {
      setInstallProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 100);

    setTimeout(async () => {
      setAppActionLoading(true);
      setError(undefined);
      setSuccess(undefined);
      try {
        const summary = await api.installStocks(token);
        setDashboardSummary(summary);
        setInstalledApps(summary.installedApplications ?? ['stocks']);
        setSuccess('L’application Stocks a été installée avec succès. Lancez l’assistant de préremplissage pour ajouter catégories, unités et emplacements métier.');
        setShowPrefillWizard(true);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors de l’installation.');
      } finally {
        setAppActionLoading(false);
        setInstallingAppId(null);
        setInstallProgress(0);
        setSelectedStoreApp(null);
      }
    }, 1100);
  }

  function goToTab(tab: ActiveTab) {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  }

  function manageApplications() {
    goToTab('applications');
  }

  async function submit(handler: () => Promise<unknown>, message: string) {
    setError(undefined);
    setSuccess(undefined);
    try {
      await handler();
      setSuccess(message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'enregistrement.');
      throw err;
    }
  }

  // Submit wrappers
  async function handleCreateCategory(payload: { name: string; description?: string }) {
    await submit(() => api.createCategory(token, payload), 'Catégorie créée avec succès.');
    setShowCategoryModal(false);
  }

  async function handleCreateUnit(payload: { name: string; symbol: string; type?: string; baseFactor?: number }) {
    await submit(() => api.createUnit(token, payload), 'Unité créée avec succès.');
    setShowUnitModal(false);
  }

  async function handleCreateProduct(payload: { name: string; sku?: string; unitId: string; categoryId?: string }) {
    await submit(() => api.createProduct(token, payload), 'Produit créé avec succès.');
    setShowProductModal(false);
  }

  async function handleCreateSupplier(payload: { name: string; contactName?: string; email?: string; phone?: string }) {
    await submit(() => api.createSupplier(token, payload), 'Fournisseur créé avec succès.');
    setShowSupplierModal(false);
  }

  async function handleCreateMovement(payload: { productId: string; supplierId?: string; type: StockMovementType; quantity: number; reason?: string; unitId?: string; lotId?: string; sourceSiteId?: string; sourceLocationId?: string; destinationSiteId?: string; destinationLocationId?: string; date?: string }) {
    await submit(() => api.createMovement(token, payload), 'Mouvement de stock enregistré.');
    setShowMovementModal(false);
  }

  async function handleCreateSite(payload: { name: string; description?: string }) {
    await submit(() => api.createSite(token, payload), 'Site créé avec succès.');
    setShowSiteModal(false);
  }

  async function handleCreateLocation(payload: { name: string; siteId: string; description?: string }) {
    await submit(() => api.createLocation(token, payload), 'Emplacement créé avec succès.');
    setShowLocationModal(false);
  }

  async function handleCreateInventory(payload: { name: string; date?: string; comment?: string; siteId?: string; locationId?: string }) {
    await submit(() => api.createInventory(token, payload), 'Inventaire complet créé.');
    setShowInventoryModal(false);
  }

  async function handlePrefillStocks(payload: { categories?: boolean; units?: boolean; sites?: boolean; locations?: boolean; examples?: boolean }) {
    await submit(() => api.prefillStocks(token, payload), 'Référentiel Stocks prérempli.');
    setShowPrefillWizard(false);
  }

  const activeProducts = useMemo(() => products.filter(p => showArchived || !isArchived(p)), [products, showArchived]);
  const activeCategories = useMemo(() => categories.filter(c => showArchived || !isArchived(c)), [categories, showArchived]);
  const activeUnits = useMemo(() => units.filter(u => showArchived || !isArchived(u)), [units, showArchived]);
  const activeSuppliers = useMemo(() => suppliers.filter(s => showArchived || !isArchived(s)), [suppliers, showArchived]);
  const activeSites = useMemo(() => sites.filter(s => showArchived || !isArchived(s)), [sites, showArchived]);
  const activeLocations = useMemo(() => locations.filter(l => showArchived || !isArchived(l)), [locations, showArchived]);

  // Local filtered queries
  const filteredStocks = useMemo(() => {
    return stocks.filter(stock => {
      const matchesSearch = stock.product.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
                            (stock.product.sku && stock.product.sku.toLowerCase().includes(inventorySearch.toLowerCase())) ||
                            (stock.lot?.lotNumber && stock.lot.lotNumber.toLowerCase().includes(inventorySearch.toLowerCase())) ||
                            (stock.site?.name && stock.site.name.toLowerCase().includes(inventorySearch.toLowerCase())) ||
                            (stock.location?.name && stock.location.name.toLowerCase().includes(inventorySearch.toLowerCase()));
      const matchesCategory = !inventoryCategoryFilter || stock.product.categoryId === inventoryCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [stocks, inventorySearch, inventoryCategoryFilter]);

  const filteredUnits = useMemo(() => activeUnits.filter(u => u.name.toLowerCase().includes(unitSearch.toLowerCase()) || u.symbol.toLowerCase().includes(unitSearch.toLowerCase())), [activeUnits, unitSearch]);
  const filteredLocations = useMemo(() => activeLocations.filter(l => l.name.toLowerCase().includes(locationSearch.toLowerCase()) || l.site?.name?.toLowerCase().includes(locationSearch.toLowerCase())), [activeLocations, locationSearch]);
  const filteredInventories = useMemo(() => inventories.filter(i => i.name.toLowerCase().includes(inventorySessionSearch.toLowerCase()) || (i.status ?? '').toLowerCase().includes(inventorySessionSearch.toLowerCase())), [inventories, inventorySessionSearch]);
  const filteredAudit = useMemo(() => auditEntries.filter(a => `${a.action} ${a.entityType ?? ''} ${a.user?.email ?? ''}`.toLowerCase().includes(auditSearch.toLowerCase())), [auditEntries, auditSearch]);

  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      const matchesSearch = m.product.name.toLowerCase().includes(movementSearch.toLowerCase()) ||
                            (m.reason && m.reason.toLowerCase().includes(movementSearch.toLowerCase())) ||
                            (m.comment && m.comment.toLowerCase().includes(movementSearch.toLowerCase())) ||
                            (m.createdBy?.email && m.createdBy.email.toLowerCase().includes(movementSearch.toLowerCase()));
      const matchesType = !movementTypeFilter || m.type === movementTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [movements, movementSearch, movementTypeFilter]);

  const filteredProducts = useMemo(() => {
    return activeProducts.filter(p => {
      return p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
             (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase())) ||
             (p.category?.name && p.category.name.toLowerCase().includes(productSearch.toLowerCase()));
    });
  }, [activeProducts, productSearch]);

  const filteredSuppliers = useMemo(() => {
    return activeSuppliers.filter(s => {
      return s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
             (s.email && s.email.toLowerCase().includes(supplierSearch.toLowerCase())) ||
             (s.contactName && s.contactName.toLowerCase().includes(supplierSearch.toLowerCase())) ||
             (s.contact && s.contact.toLowerCase().includes(supplierSearch.toLowerCase()));
    });
  }, [activeSuppliers, supplierSearch]);

  const tabTitle = {
    overview: 'Dashboard',
    applications: 'Toque Store',
    settings: 'Paramètres',
    'stocks-dashboard': 'Stocks',
    inventory: 'Stocks',
    movements: 'Mouvements',
    products: 'Produits',
    categories: 'Catégories',
    units: 'Unités',
    suppliers: 'Fournisseurs',
    inventories: 'Inventaires',
    locations: 'Sites & emplacements',
    audit: 'Audit',
  }[activeTab];

  return (
    <div className="app-layout">
      {/* Mobile Header */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ChefHat size={24} color="#10b981" />
          <span className="sidebar-title" style={{ fontSize: '1.1rem' }}>TOQUE<span>HUB</span></span>
        </div>
        <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <ChefHat />
          </div>
          <span className="sidebar-title">TOQUE<span>HUB</span></span>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-title">Pilotage</div>
          <div
            className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => goToTab('overview')}
          >
            <LayoutDashboard />
            Dashboard
          </div>
          <div
            className={`sidebar-item ${activeTab === 'applications' ? 'active' : ''}`}
            onClick={() => goToTab('applications')}
          >
            <ShoppingBag />
            Toque Store
          </div>
          <div
            className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => goToTab('settings')}
          >
            <Settings />
            Paramètres
          </div>

          {stocksInstalled ? (
            <>
              <div className="sidebar-section-title">Stocks</div>
              <div
                className={`sidebar-item ${activeTab === 'stocks-dashboard' ? 'active' : ''}`}
                onClick={() => goToTab('stocks-dashboard')}
              >
                <LayoutDashboard />
                Stocks
              </div>
              <div
                className={`sidebar-item ${activeTab === 'products' ? 'active' : ''}`}
                onClick={() => goToTab('products')}
              >
                <ChefHat />
                Produits
              </div>
              <div
                className={`sidebar-item ${activeTab === 'categories' ? 'active' : ''}`}
                onClick={() => goToTab('categories')}
              >
                <Layers />
                Catégories
              </div>
              <div
                className={`sidebar-item ${activeTab === 'units' ? 'active' : ''}`}
                onClick={() => goToTab('units')}
              >
                <Scale />
                Unités
              </div>
              <div
                className={`sidebar-item ${activeTab === 'suppliers' ? 'active' : ''}`}
                onClick={() => goToTab('suppliers')}
              >
                <UsersRound />
                Fournisseurs
              </div>
              <div
                className={`sidebar-item ${activeTab === 'inventory' ? 'active' : ''}`}
                onClick={() => goToTab('inventory')}
              >
                <Package />
                Stocks lecture seule
              </div>
              <div
                className={`sidebar-item ${activeTab === 'inventories' ? 'active' : ''}`}
                onClick={() => goToTab('inventories')}
              >
                <ClipboardList />
                Inventaires
              </div>
              <div
                className={`sidebar-item ${activeTab === 'movements' ? 'active' : ''}`}
                onClick={() => goToTab('movements')}
              >
                <ArrowRight />
                Mouvements
              </div>
              <div
                className={`sidebar-item ${activeTab === 'locations' ? 'active' : ''}`}
                onClick={() => goToTab('locations')}
              >
                <MapPin />
                Sites & emplacements
              </div>
              <div
                className={`sidebar-item ${activeTab === 'audit' ? 'active' : ''}`}
                onClick={() => goToTab('audit')}
              >
                <ShieldCheck />
                Audit
              </div>
            </>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {firstName.substring(0, 2).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{firstName}</span>
              <span className="sidebar-user-org">{organizationName}</span>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={onLogout} style={{ width: '100%', justifyContent: 'center' }}>
            <LogOut size={16} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        <header className="topbar-modern">
          <h2 className="topbar-title">{tabTitle}</h2>
          <div className="topbar-actions">
            {activeTab === 'overview' && (
              <button
                className="btn btn-secondary"
                onClick={() => setShowCustomizeModal(true)}
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <SlidersHorizontal size={14} />
                Personnaliser
              </button>
            )}
            <div className="status-badge">
              <div className="status-dot"></div>
              Instance Locale
            </div>
          </div>
        </header>

        {/* Global Loading Line */}
        {isLoading && (
          <div style={{ height: '3px', width: '100%', background: '#f1f5f9', position: 'relative', overflow: 'hidden' }}>
            <motion.div
              initial={{ left: '-100%' }}
              animate={{ left: '100%' }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              style={{ height: '100%', width: '40%', background: '#10b981', position: 'absolute' }}
            />
          </div>
        )}

        <div className="workspace-modern">
          {error && (
            <div className="alert-modern error">
              <AlertCircle />
              <div>
                <strong>Erreur : </strong> {error}
              </div>
            </div>
          )}
          {success && (
            <div className="alert-modern success">
              <CheckCircle2 />
              <div>
                <strong>Succès : </strong> {success}
              </div>
            </div>
          )}

          {/* ACTIVE TAB RENDERER */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              className="tab-content"
            >
              {/* TAB OVERVIEW */}
              {activeTab === 'overview' && (
                <>
                  <div className={`welcome-hero theme-${dashboardTheme}`}>
                    <span className="welcome-tag">ToqueHub · Plateforme Cuisine</span>
                    <h1 className="welcome-title">Bonjour {firstName} 👋</h1>
                    <p className="welcome-desc">
                      Bienvenue dans l'espace de gestion de <strong>{organizationName}</strong>. Votre ERP de cuisine open source local et souverain est entièrement fonctionnel.
                    </p>
                  </div>

                  {stocksInstalled && visibleWidgets.metrics && (
                    <StocksDashboardPage
                      products={products}
                      suppliers={suppliers}
                      stocks={stocks}
                      movements={movements}
                      onCreateMovement={() => setShowMovementModal(true)}
                      onOpenStocks={() => setActiveTab('inventory')}
                    />
                  )}

                  {(visibleWidgets.progress || visibleWidgets.apps) && (
                    <div className={`double-panel ${layoutMode === 'stacked' ? 'layout-stacked' : ''}`}>
                      {/* Setup Progress */}
                      {visibleWidgets.progress && (
                        <div className="card-modern">
                          <div className="card-title-container">
                            <span className="card-title"><Clock size={18} /> Progression du paramétrage</span>
                            <span className="badge badge-reception" style={{ fontSize: '0.8rem' }}>{progress}%</span>
                          </div>
                          <div className="progress-bar-bg" style={{ marginBottom: '1.5rem' }}>
                            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                          </div>
                          <div className="progress-list">
                            {progressItems.map((item, idx) => (
                              <div key={idx} className={`progress-item ${item.done ? 'done' : ''}`}>
                                <div className="progress-icon">{item.done ? '✓' : idx + 1}</div>
                                <span className="progress-text">{item.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Applications Installed */}
                      {visibleWidgets.apps && (
                        <div className="card-modern">
                          <span className="card-title" style={{ marginBottom: '1.25rem' }}><Boxes size={18} /> Applications installées</span>
                          <div className="installed-app-summary">
                            <div className="metric-icon-wrapper emerald">
                              <Package />
                            </div>
                            <div>
                              <strong>{installedApps.length > 0 ? `${installedApps.length} application active` : 'Aucune application active'}</strong>
                              <p style={{ color: 'var(--text-muted)', marginTop: '0.35rem', fontSize: '0.9rem' }}>
                                {stocksInstalled ? '📦 Stocks est installé pour votre organisation.' : 'Démarrez en installant votre première application métier.'}
                              </p>
                            </div>
                          </div>
                          <button className="btn btn-primary" style={{ marginTop: '1.25rem' }} onClick={manageApplications}>
                            Gérer les applications <ArrowRight size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* TAB APPLICATIONS */}
              {activeTab === 'applications' && (
                <ApplicationsPage
                  installedApps={installedApps}
                  appActionLoading={appActionLoading}
                  onSelectApp={(app) => setSelectedStoreApp(app)}
                  onInstallApp={(appId) => triggerInstallApp(appId)}
                  installingAppId={installingAppId}
                  installProgress={installProgress}
                  onUninstallApp={() => setConfirmation('uninstall-stocks')}
                />
              )}

              {/* TAB SETTINGS */}
              {activeTab === 'settings' && (
                <SettingsPage session={session} dashboardSummary={dashboardSummary} />
              )}

              {/* TAB STOCKS DASHBOARD */}
              {activeTab === 'stocks-dashboard' && (
                <StocksDashboardPage
                  products={products}
                  suppliers={suppliers}
                  stocks={stocks}
                  movements={movements}
                  onCreateMovement={() => setShowMovementModal(true)}
                  onOpenStocks={() => setActiveTab('inventory')}
                />
              )}

              {/* TAB CATEGORIES */}
              {activeTab === 'categories' && (
                <div className="card-modern">
                  <div className="section-header-modern">
                    <div className="section-info">
                      <span className="card-title">Catégories</span>
                      <span className="section-tagline">Familles de produits conservées dans votre organisation ToqueHub. Les éléments archivés restent dans les historiques.</span>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowCategoryModal(true)}>
                      <Plus size={16} /> Ajouter une catégorie
                    </button>
                  </div>
                  <div className="apps-grid compact-grid">
                    {categories.length === 0 ? (
                      <div className="empty-state app-empty">
                        <div className="empty-state-icon">🏷️</div>
                        <span className="empty-state-title">Aucune catégorie</span>
                        <span className="empty-state-desc">Créez vos familles de produits dès que Stocks est installé.</span>
                      </div>
                    ) : categories.map((category) => (
                      <motion.div key={category.id} className="app-card compact-card" whileHover={{ y: -3 }}>
                        <div className="app-card-icon"><Layers size={20} /></div>
                        <h3>{category.name}</h3>
                        <p>{category.description || 'Catégorie de produits'}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB INVENTORY */}
              {activeTab === 'inventory' && (
                <div className="card-modern">
                  <div className="section-header-modern">
                    <div className="section-info">
                      <span className="card-title">Inventaire des Stocks</span>
                      <span className="section-tagline">Quantités actuelles en stock par produit.</span>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowMovementModal(true)}>
                      <Plus size={16} /> Enregistrer un mouvement
                    </button>
                  </div>

                  <div className="filter-bar">
                    <div className="search-input-wrapper">
                      <Search />
                      <input
                        type="text"
                        placeholder="Rechercher un produit ou un SKU..."
                        className="search-input"
                        value={inventorySearch}
                        onChange={(e) => setInventorySearch(e.target.value)}
                      />
                    </div>
                    <select
                      value={inventoryCategoryFilter}
                      onChange={(e) => setInventoryCategoryFilter(e.target.value)}
                      style={{ maxWidth: '200px' }}
                    >
                      <option value="">Toutes les catégories</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="table-wrapper">
                    <table className="table-modern">
                      <thead>
                        <tr>
                           <th>Produit</th>
                           <th>Catégorie</th>
                           <th>Site / emplacement</th>
                           <th>Lot / DLC</th>
                           <th style={{ textAlign: 'right' }}>Stock actuel</th>
                           <th style={{ textAlign: 'right' }}>Valeur</th>
                           <th>Seuil minimum</th>
                           <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStocks.length === 0 ? (
                          <tr>
                            <td colSpan={4}>
                              <div className="empty-state">
                                <div className="empty-state-icon">📦</div>
                                <span className="empty-state-title">Aucun produit en stock</span>
                                <span className="empty-state-desc">Aucun produit ne correspond à vos filtres ou aucun mouvement de stock n'a été enregistré.</span>
                                <button className="btn btn-primary" onClick={() => setShowMovementModal(true)}>
                                  <Plus size={16} /> Ajouter un mouvement
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredStocks.map((stock) => (
                            <tr key={stock.id}>
                              <td style={{ fontWeight: 600 }}>{stock.product.name}</td>
                              <td>
                                {stock.product.category?.name ? (
                                  <span className="badge badge-production" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                                    {stock.product.category.name}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>Non classé</span>
                                )}
                              </td>
                              <td>{stock.site?.name ?? 'Tous sites'} / {stock.location?.name ?? 'Tous emplacements'}</td>
                              <td>{stock.lot?.lotNumber ?? '—'} {stock.lot?.expiresAt || stock.lot?.expirationDate ? <span className="badge badge-correction">DLC {new Date((stock.lot.expiresAt ?? stock.lot.expirationDate) as string).toLocaleDateString('fr-FR')}</span> : null}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: Number(stock.quantity) < 0 ? 'var(--danger)' : 'var(--text-main)' }}>
                                {stock.currentQuantity ?? stock.quantity} {stock.product.unit?.symbol ?? ''}
                              </td>
                              <td style={{ textAlign: 'right' }}>{numeric(stock.value ?? numeric(stock.quantity) * numeric(stock.product.averagePurchasePrice ?? stock.product.weightedAveragePrice)).toFixed(2)} €</td>
                              <td>{stock.product.minimumStock ?? stock.product.minStock ?? '—'}</td>
                              <td><span className={`badge ${stockStatus(stock).className}`}>{stockStatus(stock).label}</span></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB MOVEMENTS */}
              {activeTab === 'movements' && (
                <div className="card-modern">
                  <div className="section-header-modern">
                    <div className="section-info">
                      <span className="card-title">Historique des Mouvements</span>
                      <span className="section-tagline">Traçabilité des flux d'entrées, sorties, pertes et corrections.</span>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowMovementModal(true)}>
                      <Plus size={16} /> Enregistrer un mouvement
                    </button>
                  </div>

                  <div className="filter-bar">
                    <div className="search-input-wrapper">
                      <Search />
                      <input
                        type="text"
                        placeholder="Rechercher par produit ou motif..."
                        className="search-input"
                        value={movementSearch}
                        onChange={(e) => setMovementSearch(e.target.value)}
                      />
                    </div>
                    <select
                      value={movementTypeFilter}
                      onChange={(e) => setMovementTypeFilter(e.target.value)}
                      style={{ maxWidth: '200px' }}
                    >
                      <option value="">Tous les types</option>
                      {Object.entries(movementLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="table-wrapper">
                    <table className="table-modern">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Produit</th>
                          <th style={{ textAlign: 'right' }}>Quantité</th>
                          <th>Fournisseur</th>
                          <th>Motif / Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMovements.length === 0 ? (
                          <tr>
                            <td colSpan={6}>
                              <div className="empty-state">
                                <div className="empty-state-icon">📋</div>
                                <span className="empty-state-title">Aucun mouvement enregistré</span>
                                <span className="empty-state-desc">Aucun mouvement de stock n'a été effectué ou aucun ne correspond à vos filtres.</span>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredMovements.map((m) => {
                            const badgeClass = {
                              RECEPTION: 'badge-reception',
                              IN: 'badge-reception',
                              ENTRY: 'badge-reception',
                              OUT: 'badge-loss',
                              EXIT: 'badge-loss',
                              PRODUCTION: 'badge-production',
                              LOSS: 'badge-loss',
                              CORRECTION: 'badge-correction',
                              INVENTORY: 'badge-inventory',
                              TRANSFER: 'badge-production',
                            }[m.type];
                            return (
                              <tr key={m.id}>
                                <td style={{ color: 'var(--text-muted)' }}>
                                  {new Date(m.createdAt).toLocaleDateString('fr-FR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td>
                                  <span className={`badge ${badgeClass}`}>
                                    {movementLabels[m.type]}
                                  </span>
                                </td>
                                <td style={{ fontWeight: 600 }}>{m.product.name}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: m.type === 'LOSS' ? 'var(--danger)' : 'var(--text-main)' }}>
                                  {movementSign(m.type)}{m.quantity} {m.product.unit?.symbol ?? ''}
                                </td>
                                <td>{m.supplier?.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{m.reason || '—'}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB PRODUCTS */}
              {activeTab === 'products' && (
                <>
                  <div className="card-modern">
                    <div className="section-header-modern">
                      <div className="section-info">
                        <span className="card-title">Catalogue des Produits</span>
                        <span className="section-tagline">Liste globale des produits référencés dans votre cuisine.</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={() => setShowCategoryModal(true)}>
                          + Catégorie
                        </button>
                        <button className="btn btn-secondary" onClick={() => setShowUnitModal(true)}>
                          + Unité
                        </button>
                        <button className="btn btn-primary" onClick={() => setShowProductModal(true)}>
                          <Plus size={16} /> Nouveau Produit
                        </button>
                      </div>
                    </div>

                    <div className="filter-bar">
                      <div className="search-input-wrapper" style={{ maxWidth: '100%' }}>
                        <Search />
                        <input
                          type="text"
                          placeholder="Filtrer les produits par nom, code SKU ou catégorie..."
                          className="search-input"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="table-wrapper">
                      <table className="table-modern">
                        <thead>
                          <tr>
                            <th>Nom du produit</th>
                            <th>Code SKU</th>
                            <th>Unité par défaut</th>
                            <th>Catégorie</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProducts.length === 0 ? (
                            <tr>
                              <td colSpan={8}>
                                <div className="empty-state">
                                  <div className="empty-state-icon">🍳</div>
                                  <span className="empty-state-title">Aucun produit référencé</span>
                                  <span className="empty-state-desc">Commencez par ajouter un produit à votre catalogue pour l'utiliser dans votre inventaire.</span>
                                  <button className="btn btn-primary" onClick={() => setShowProductModal(true)}>
                                    <Plus size={16} /> Ajouter un produit
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredProducts.map((p) => (
                              <tr key={p.id}>
                                <td style={{ fontWeight: 600 }}>{p.name}</td>
                                <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.sku || '—'}</td>
                                <td>{p.unit?.name || '—'} ({p.unit?.symbol || ''})</td>
                                <td>
                                  {p.category?.name ? (
                                    <span className="badge badge-production" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                                      {p.category.name}
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>Non catégorisé</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Categories & Units Side-By-Side Grid */}
                  <div className="double-panel">
                    {/* Categories Card */}
                    <div className="card-modern">
                      <div className="card-title-container">
                        <span className="card-title"><Layers size={16} /> Catégories ({categories.length})</span>
                        <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setShowCategoryModal(true)}>
                          Ajouter
                        </button>
                      </div>
                      <div className="table-wrapper">
                        <table className="table-modern">
                          <thead>
                            <tr>
                              <th>Nom</th>
                              <th>Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {categories.length === 0 ? (
                              <tr>
                                <td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 1rem' }}>
                                  Aucune catégorie créée.
                                </td>
                              </tr>
                            ) : (
                              categories.map((cat) => (
                                <tr key={cat.id}>
                                  <td style={{ fontWeight: 600 }}>{cat.name}</td>
                                  <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{cat.description || '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Units Card */}
                    <div className="card-modern">
                      <div className="card-title-container">
                        <span className="card-title"><Scale size={16} /> Unités de mesure ({units.length})</span>
                        <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setShowUnitModal(true)}>
                          Ajouter
                        </button>
                      </div>
                      <div className="table-wrapper">
                        <table className="table-modern">
                          <thead>
                            <tr>
                              <th>Nom complet</th>
                              <th>Symbole</th>
                            </tr>
                          </thead>
                          <tbody>
                            {units.length === 0 ? (
                              <tr>
                                <td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 1rem' }}>
                                  Aucune unité configurée.
                                </td>
                              </tr>
                            ) : (
                              units.map((u) => (
                                <tr key={u.id}>
                                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                                  <td>
                                    <span className="badge badge-reception" style={{ textTransform: 'none' }}>
                                      {u.symbol}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* TAB UNITS */}
              {activeTab === 'units' && (
                <UnitsPage units={filteredUnits} search={unitSearch} setSearch={setUnitSearch} showArchived={showArchived} setShowArchived={setShowArchived} onCreate={() => setShowUnitModal(true)} />
              )}

              {/* TAB INVENTORIES */}
              {activeTab === 'inventories' && (
                <InventoriesPage inventories={filteredInventories} products={products} search={inventorySessionSearch} setSearch={setInventorySessionSearch} onCreate={() => setShowInventoryModal(true)} />
              )}

              {/* TAB LOCATIONS */}
              {activeTab === 'locations' && (
                <LocationsPage sites={activeSites} locations={filteredLocations} search={locationSearch} setSearch={setLocationSearch} showArchived={showArchived} setShowArchived={setShowArchived} onCreateSite={() => setShowSiteModal(true)} onCreateLocation={() => setShowLocationModal(true)} />
              )}

              {/* TAB AUDIT */}
              {activeTab === 'audit' && (
                <AuditPage entries={filteredAudit} search={auditSearch} setSearch={setAuditSearch} onExport={() => exportAuditCsv(token)} />
              )}

              {/* TAB SUPPLIERS */}
              {activeTab === 'suppliers' && (
                <div className="card-modern">
                  <div className="section-header-modern">
                    <div className="section-info">
                      <span className="card-title">Gestion des Fournisseurs</span>
                      <span className="section-tagline">Coordonnées de vos partenaires fournisseurs pour les réceptions de marchandises.</span>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowSupplierModal(true)}>
                      <Plus size={16} /> Nouveau Fournisseur
                    </button>
                  </div>

                  <div className="filter-bar">
                    <div className="search-input-wrapper" style={{ maxWidth: '100%' }}>
                      <Search />
                      <input
                        type="text"
                        placeholder="Rechercher par nom ou email de fournisseur..."
                        className="search-input"
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="table-wrapper">
                    <table className="table-modern">
                      <thead>
                        <tr>
                          <th>Nom du fournisseur</th>
                          <th>Contact Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSuppliers.length === 0 ? (
                          <tr>
                            <td colSpan={2}>
                              <div className="empty-state">
                                <div className="empty-state-icon">🛒</div>
                                <span className="empty-state-title">Aucun fournisseur enregistré</span>
                                <span className="empty-state-desc">Ajoutez votre premier fournisseur pour tracer les livraisons de marchandises dans votre cuisine.</span>
                                <button className="btn btn-primary" onClick={() => setShowSupplierModal(true)}>
                                  <Plus size={16} /> Ajouter un fournisseur
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredSuppliers.map((s) => (
                            <tr key={s.id}>
                              <td style={{ fontWeight: 600 }}>{s.name}</td>
                              <td>
                                {s.email ? (
                                  <a href={`mailto:${s.email}`} style={{ textDecoration: 'underline' }}>{s.email}</a>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Category Modal */}
      <Modal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} title="Créer une catégorie">
        <CategoryForm onSubmit={handleCreateCategory} onClose={() => setShowCategoryModal(false)} />
      </Modal>

      {/* Unit Modal */}
      <Modal isOpen={showUnitModal} onClose={() => setShowUnitModal(false)} title="Créer une unité de mesure">
        <UnitForm onSubmit={handleCreateUnit} onClose={() => setShowUnitModal(false)} />
      </Modal>

      {/* Product Modal */}
      <Modal isOpen={showProductModal} onClose={() => setShowProductModal(false)} title="Créer un produit">
        <ProductForm
          categories={categories}
          units={units}
          onSubmit={handleCreateProduct}
          onClose={() => setShowProductModal(false)}
        />
      </Modal>

      {/* Supplier Modal */}
      <Modal isOpen={showSupplierModal} onClose={() => setShowSupplierModal(false)} title="Créer un fournisseur">
        <SupplierForm onSubmit={handleCreateSupplier} onClose={() => setShowSupplierModal(false)} />
      </Modal>

      {/* Movement Modal */}
      <Modal isOpen={showMovementModal} onClose={() => setShowMovementModal(false)} title="Enregistrer un mouvement de stock">
        <MovementForm
          products={products}
          suppliers={suppliers}
          units={units}
          sites={sites}
          locations={locations}
          onSubmit={handleCreateMovement}
          onClose={() => setShowMovementModal(false)}
        />
      </Modal>

      <Modal isOpen={showSiteModal} onClose={() => setShowSiteModal(false)} title="Créer un site">
        <SiteForm onSubmit={handleCreateSite} onClose={() => setShowSiteModal(false)} />
      </Modal>

      <Modal isOpen={showLocationModal} onClose={() => setShowLocationModal(false)} title="Créer un emplacement">
        <LocationForm sites={sites} onSubmit={handleCreateLocation} onClose={() => setShowLocationModal(false)} />
      </Modal>

      <Modal isOpen={showInventoryModal} onClose={() => setShowInventoryModal(false)} title="Créer un inventaire complet">
        <InventoryForm sites={sites} locations={locations} onSubmit={handleCreateInventory} onClose={() => setShowInventoryModal(false)} />
      </Modal>

      <Modal isOpen={showPrefillWizard} onClose={() => setShowPrefillWizard(false)} title="Assistant de préremplissage Stocks">
        <PrefillWizard onSubmit={handlePrefillStocks} onClose={() => setShowPrefillWizard(false)} />
      </Modal>

      {/* App Store Detailed Modal Sheet */}
      <Modal isOpen={selectedStoreApp !== null} onClose={() => setSelectedStoreApp(null)} title="Fiche Module - Toque Store">
        {selectedStoreApp && (
          <AppStoreDetailSheet
            app={selectedStoreApp}
            installed={installedApps.includes(selectedStoreApp.id)}
            installing={installingAppId === selectedStoreApp.id}
            progress={installProgress}
            onInstall={() => triggerInstallApp(selectedStoreApp.id)}
            onOpen={() => {
      if (selectedStoreApp.id === 'stocks') {
        setActiveTab('stocks-dashboard');
      }
              setSelectedStoreApp(null);
            }}
            onUninstall={() => {
              setConfirmation('uninstall-stocks');
              setSelectedStoreApp(null);
            }}
            onClose={() => setSelectedStoreApp(null)}
          />
        )}
      </Modal>

      <ConfirmationModal
        isOpen={confirmation === 'uninstall-stocks'}
        title="Supprimer l’application Stocks ?"
        text="Les données existantes seront conservées mais les fonctionnalités seront masquées."
        confirmLabel="Supprimer"
        danger
        loading={appActionLoading}
        onCancel={() => setConfirmation(null)}
        onConfirm={uninstallStocks}
      />

      <Modal isOpen={showCustomizeModal} onClose={() => setShowCustomizeModal(false)} title="Personnaliser le Dashboard">
        <CustomizeDashboardForm
          theme={dashboardTheme}
          visibleWidgets={visibleWidgets}
          layoutMode={layoutMode}
          onSave={(newTheme, newWidgets, newLayout) => {
            setDashboardTheme(newTheme);
            setVisibleWidgets(newWidgets);
            setLayoutMode(newLayout);
            localStorage.setItem('toquehub_dashboard_theme', newTheme);
            localStorage.setItem('toquehub_dashboard_widgets', JSON.stringify(newWidgets));
            localStorage.setItem('toquehub_dashboard_layout', newLayout);
            setShowCustomizeModal(false);
          }}
          onClose={() => setShowCustomizeModal(false)}
        />
      </Modal>
    </div>
  );
}

// =========================================================================
// REUSABLE SUB-COMPONENTS
// =========================================================================

type AppDefinition = (typeof apps)[number];

type Archivable = { archivedAt?: string | null; isArchived?: boolean };

function isArchived(item: Archivable) {
  return Boolean(item.archivedAt || item.isArchived);
}

function numeric(value: string | number | null | undefined) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function movementSign(type: StockMovementType) {
  return ['LOSS', 'OUT', 'EXIT'].includes(type) ? '-' : ['TRANSFER'].includes(type) ? '±' : '+';
}

function stockStatus(stock: Stock) {
  const quantity = numeric(stock.currentQuantity ?? stock.quantity);
  const minimum = numeric(stock.product.minimumStock ?? stock.product.minStock);
  if (quantity < 0) return { label: 'Stock négatif', className: 'badge-loss' };
  if (quantity === 0) return { label: 'Rupture', className: 'badge-loss' };
  if (minimum > 0 && quantity <= minimum) return { label: 'Stock faible', className: 'badge-correction' };
  return { label: 'Normal', className: 'badge-reception' };
}

async function exportAuditCsv(token: string) {
  const result = await api.auditCsv(token).catch(() => ({ csv: '' }));
  const blob = new Blob([result.csv || 'date,action,entity,user\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `audit-stocks-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function StocksDashboardPage({ products, suppliers, stocks, movements, onCreateMovement, onOpenStocks }: { products: Product[]; suppliers: Supplier[]; stocks: Stock[]; movements: StockMovement[]; onCreateMovement: () => void; onOpenStocks: () => void }) {
  const stockValue = stocks.reduce((sum, stock) => sum + numeric(stock.currentQuantity ?? stock.quantity) * numeric(stock.value ?? stock.product.averagePurchasePrice ?? stock.product.weightedAveragePrice), 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const movementsThisMonth = movements.filter((m) => new Date(m.createdAt) >= monthStart).length;
  const topConsumed = Object.values(movements.filter((m) => ['LOSS', 'OUT', 'EXIT', 'PRODUCTION', 'CORRECTION', 'INVENTORY'].includes(m.type)).reduce<Record<string, { name: string; qty: number; unit?: string }>>((acc, m) => {
    const key = m.product.id;
    acc[key] = acc[key] ?? { name: m.product.name, qty: 0, unit: m.product.unit?.symbol };
    acc[key].qty += Math.abs(numeric(m.quantity));
    return acc;
  }, {})).sort((a, b) => b.qty - a.qty).slice(0, 5);
  return (
    <div className="stocks-dashboard-grid">
      <motion.section
        className="welcome-hero stocks-hero"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <span className="welcome-tag"><Package size={14} /> Stocks</span>
        <h1 className="welcome-title">Stocks</h1>
        <p className="welcome-desc">
          Vue d’ensemble de votre stock. Toute variation passe par un mouvement tracé ; la page Stocks reste en lecture seule.
        </p>
        <button className="btn btn-primary" onClick={onCreateMovement} style={{ marginTop: '1.25rem' }}>
          <Plus size={16} /> Nouveau mouvement
        </button>
      </motion.section>
      
      <div className="metrics-grid">
        <Metric icon={<ChefHat size={20} />} value={products.filter(p => !isArchived(p)).length} label="Produits actifs" tone="orange" delay={1} />
        <Metric icon={<UsersRound size={20} />} value={suppliers.filter(s => !isArchived(s)).length} label="Fournisseurs actifs" tone="blue" delay={2} />
        <Metric icon={<TrendingUp size={20} />} value={`${stockValue.toFixed(2)} €`} label="Valeur théorique" tone="emerald" delay={3} />
        <Metric icon={<History size={20} />} value={movementsThisMonth} label="Mouvements du mois" tone="purple" delay={4} />
      </div>

      <div className="double-panel">
        <motion.div
          className="card-modern widget-card-modern"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <div className="card-title-container">
            <span className="card-title"><History size={18}/> Derniers mouvements</span>
            <button className="btn btn-secondary btn-sm" onClick={onOpenStocks}>Voir stocks</button>
          </div>
          <MiniMovements movements={movements.slice(0, 6)} />
        </motion.div>

        <motion.div
          className="card-modern widget-card-modern"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <span className="card-title"><TrendingUp size={18}/> Produits les plus consommés</span>
          <div className="progress-list" style={{ marginTop: '1rem' }}>
            {topConsumed.length ? (
              topConsumed.map((p) => (
                <div className="progress-item-modern" key={p.name}>
                  <span className="progress-text-modern">{p.name}</span>
                  <span className="progress-val-modern">{p.qty.toFixed(2)} {p.unit}</span>
                </div>
              ))
            ) : (
              <EmptyMini title="Aucune consommation" text="Les sorties, pertes, productions et corrections négatives alimenteront ce classement." icon="📈" />
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Metric({ icon, value, label, tone, delay = 0 }: { icon: ReactNode; value: ReactNode; label: string; tone: string; delay?: number }) {
  return (
    <motion.div
      className={`metric-card-modern tone-${tone}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: delay * 0.05, ease: 'easeOut' }}
      whileHover={{ y: -5, boxShadow: '0 20px 30px rgba(9, 13, 22, 0.06)' }}
    >
      <div className="metric-header">
        <div className={`metric-icon-wrapper-modern tone-${tone}`}>
          {icon}
        </div>
        <span className="metric-badge-trend">Mise à jour</span>
      </div>
      <div className="metric-body-modern">
        <span className="metric-value-modern">{value}</span>
        <span className="metric-label-modern">{label}</span>
      </div>
      <div className="metric-shine" />
    </motion.div>
  );
}

function EmptyMini({ title, text, icon = "📦" }: { title: string; text: string; icon?: string }) {
  return (
    <div className="empty-state-modern-widget">
      <div className="empty-state-icon-modern">{icon}</div>
      <span className="empty-state-title-modern">{title}</span>
      <span className="empty-state-desc-modern">{text}</span>
    </div>
  );
}
function MiniMovements({ movements }: { movements: StockMovement[] }) { return movements.length ? <div className="table-wrapper"><table className="table-modern"><tbody>{movements.map(m => <tr key={m.id}><td>{new Date(m.createdAt).toLocaleDateString('fr-FR')}</td><td>{m.product.name}</td><td><span className="badge badge-production">{movementLabels[m.type]}</span></td><td>{movementSign(m.type)}{m.quantity} {m.product.unit?.symbol}</td><td>{m.createdBy?.email ?? '—'}</td></tr>)}</tbody></table></div> : <EmptyMini title="Aucun mouvement" text="Enregistrez une réception, sortie, perte, correction, inventaire, production ou transfert." />; }

function UnitsPage({ units, search, setSearch, showArchived, setShowArchived, onCreate }: { units: Unit[]; search: string; setSearch: (v: string) => void; showArchived: boolean; setShowArchived: (v: boolean) => void; onCreate: () => void }) { return <ReferencePage title="Unités" subtitle="Unités principales et conversions simples compatibles (kg/g, L/mL)." search={search} setSearch={setSearch} showArchived={showArchived} setShowArchived={setShowArchived} onCreate={onCreate} createLabel="Ajouter une unité"><div className="table-wrapper"><table className="table-modern"><thead><tr><th>Nom</th><th>Symbole</th><th>Type</th><th>Conversion</th><th>Statut</th></tr></thead><tbody>{units.map(u => <tr key={u.id}><td>{u.name}</td><td><span className="badge badge-reception">{u.symbol}</span></td><td>{u.type ?? u.unitType ?? 'Compatible'}</td><td>{u.baseFactor ? `× ${u.baseFactor}` : 'Standard'}</td><td>{isArchived(u) ? 'Archivé' : 'Actif'}</td></tr>)}</tbody></table></div>{!units.length && <EmptyMini title="Aucune unité" text="Préremplissez kg, g, L, mL, pièce, carton…" />}</ReferencePage>; }

function InventoriesPage({ inventories, products, search, setSearch, onCreate }: { inventories: Inventory[]; products: Product[]; search: string; setSearch: (v: string) => void; onCreate: () => void }) { return <ReferencePage title="Inventaires" subtitle="Inventaires complets: comptage réel, écarts, corrections automatiques et verrouillage après validation." search={search} setSearch={setSearch} onCreate={onCreate} createLabel="Créer un inventaire"><div className="table-wrapper"><table className="table-modern"><thead><tr><th>Nom</th><th>Date</th><th>Statut</th><th>Périmètre</th><th>Lignes</th></tr></thead><tbody>{inventories.map(i => <tr key={i.id}><td>{i.name}</td><td>{i.date ? new Date(i.date).toLocaleDateString('fr-FR') : '—'}</td><td><span className="badge badge-inventory">{i.status ?? 'Brouillon'}</span></td><td>{i.site?.name ?? 'Tous sites'} / {i.location?.name ?? 'Tous emplacements'}</td><td>{i.lines?.length ?? products.length}</td></tr>)}</tbody></table></div>{!inventories.length && <EmptyMini title="Aucun inventaire" text="Créez un inventaire complet pour charger les produits actifs et saisir les quantités comptées." />}</ReferencePage>; }

function LocationsPage({ sites, locations, search, setSearch, showArchived, setShowArchived, onCreateSite, onCreateLocation }: { sites: Site[]; locations: Location[]; search: string; setSearch: (v: string) => void; showArchived: boolean; setShowArchived: (v: boolean) => void; onCreateSite: () => void; onCreateLocation: () => void }) { return <ReferencePage title="Sites & emplacements" subtitle="Deux niveaux pour transferts: site physique puis emplacement interne." search={search} setSearch={setSearch} showArchived={showArchived} setShowArchived={setShowArchived} onCreate={onCreateLocation} createLabel="Ajouter un emplacement" secondaryAction={<button className="btn btn-secondary" onClick={onCreateSite}><Warehouse size={16}/> Nouveau site</button>}><div className="apps-grid compact-grid">{sites.map(s => <div className="app-card compact-card" key={s.id}><div className="app-card-icon"><Warehouse size={20}/></div><h3>{s.name}</h3><p>{locations.filter(l => l.siteId === s.id || l.site?.id === s.id).length} emplacements · {isArchived(s) ? 'Archivé' : 'Actif'}</p></div>)}</div><div className="table-wrapper"><table className="table-modern"><thead><tr><th>Emplacement</th><th>Site</th><th>Statut</th></tr></thead><tbody>{locations.map(l => <tr key={l.id}><td>{l.name}</td><td>{l.site?.name ?? sites.find(s => s.id === l.siteId)?.name ?? '—'}</td><td>{isArchived(l) ? 'Archivé' : 'Actif'}</td></tr>)}</tbody></table></div>{!sites.length && <EmptyMini title="Aucun site" text="Ajoutez Restaurant principal, Cuisine centrale, Réserve sèche ou chambres froides." />}</ReferencePage>; }

function AuditPage({ entries, search, setSearch, onExport }: { entries: AuditEntry[]; search: string; setSearch: (v: string) => void; onExport: () => void }) { return <ReferencePage title="Audit" subtitle="Journal métier consultable par administrateurs et managers, exportable en CSV." search={search} setSearch={setSearch} onCreate={onExport} createLabel="Exporter CSV"><div className="table-wrapper"><table className="table-modern"><thead><tr><th>Date</th><th>Action</th><th>Entité</th><th>Utilisateur</th></tr></thead><tbody>{entries.map(e => <tr key={e.id}><td>{new Date(e.createdAt).toLocaleString('fr-FR')}</td><td>{e.action}</td><td>{e.entityType ?? '—'}</td><td>{e.user?.email ?? 'Système'}</td></tr>)}</tbody></table></div>{!entries.length && <EmptyMini title="Audit vide" text="Les créations, modifications, archivages, mouvements, inventaires et transferts seront historisés ici." />}</ReferencePage>; }

function ReferencePage({ title, subtitle, search, setSearch, showArchived, setShowArchived, onCreate, createLabel, secondaryAction, children }: { title: string; subtitle: string; search: string; setSearch: (v: string) => void; showArchived?: boolean; setShowArchived?: (v: boolean) => void; onCreate: () => void; createLabel: string; secondaryAction?: ReactNode; children: ReactNode }) { return <div className="card-modern"><div className="section-header-modern"><div className="section-info"><span className="card-title">{title}</span><span className="section-tagline">{subtitle}</span></div><div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>{secondaryAction}<button className="btn btn-primary" onClick={onCreate}><Plus size={16}/> {createLabel}</button></div></div>      <div className="filter-bar">
        <div className="search-input-wrapper">
          <Search />
          <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Recherche rapide…" />
        </div>
        {setShowArchived && <label className="inline-filter"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Afficher archivés</label>}
      </div>{children}</div>; }

function ApplicationsPage({
  installedApps,
  appActionLoading,
  onSelectApp,
  onInstallApp,
  installingAppId,
  installProgress,
  onUninstallApp,
}: {
  installedApps: string[];
  appActionLoading: boolean;
  onSelectApp: (app: AppDefinition) => void;
  onInstallApp: (appId: string) => void;
  installingAppId: string | null;
  installProgress: number;
  onUninstallApp: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredStoreApps = useMemo(() => {
    return apps.filter(app => 
      app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const featuredApp = apps[0]; // Stocks is featured

  return (
    <div className="applications-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Featured Banner (À la Une) */}
      {searchQuery === '' && (
        <div className="store-featured-banner">
          <div className="store-featured-content">
            <span className="store-featured-tag">À LA UNE · INDISPENSABLE</span>
            <h1 className="store-featured-title">Module {featuredApp.title}</h1>
            <p className="store-featured-desc">
              {featuredApp.tagline} Suivez avec exactitude vos marchandises, enregistrez vos réceptions fournisseurs et analysez vos pertes.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                className="btn btn-primary" 
                onClick={() => onSelectApp(featuredApp)}
                style={{ padding: '0.6rem 1.5rem', background: 'white', color: 'var(--dark-bg)', fontWeight: 800 }}
              >
                Découvrir
              </button>
              {installedApps.includes(featuredApp.id) ? (
                <span className="badge badge-reception" style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
                  Déjà installé
                </span>
              ) : (
                <button 
                  className="btn btn-secondary" 
                  onClick={(e) => { e.stopPropagation(); onInstallApp(featuredApp.id); }}
                  disabled={installingAppId !== null}
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  Installer
                </button>
              )}
            </div>
          </div>
          <div className="store-featured-visual">
            <div 
              style={{
                width: '130px',
                height: '130px',
                borderRadius: '30px',
                background: featuredApp.gradient,
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 20px 50px rgba(16, 185, 129, 0.3)',
                color: 'white'
              }}
            >
              <Package size={64} />
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="filter-bar" style={{ marginBottom: '0.5rem' }}>
        <div className="search-input-wrapper" style={{ maxWidth: '100%' }}>
          <Search />
          <input
            type="text"
            placeholder="Rechercher des modules de cuisine..."
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Apps Grid Section */}
      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem' }}>Découvrir les modules</h3>
        <div className="store-grid">
          {filteredStoreApps.map((app) => {
            const installed = installedApps.includes(app.id);
            const available = app.status === 'Disponible';
            const installing = installingAppId === app.id;
            const Icon = app.icon;

            return (
              <div 
                key={app.id} 
                className="store-app-card"
                onClick={() => onSelectApp(app)}
              >
                <div className="store-app-icon" style={{ background: app.gradient }}>
                  <Icon size={32} />
                </div>
                
                <div className="store-app-info">
                  <span className="store-app-category">{app.category}</span>
                  <span className="store-app-title">{app.title}</span>
                  <span className="store-app-desc">{app.tagline}</span>
                </div>

                <div onClick={(e) => e.stopPropagation()}>
                  {installing ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="28" height="28" viewBox="0 0 32 32" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
                        <circle cx="16" cy="16" r="12" stroke="rgba(16, 185, 129, 0.15)" strokeWidth="3" fill="transparent" />
                        <circle cx="16" cy="16" r="12" stroke="var(--primary)" strokeWidth="3" fill="transparent" strokeDasharray={2 * Math.PI * 12} strokeDashoffset={2 * Math.PI * 12 * (1 - installProgress / 100)} />
                      </svg>
                    </div>
                  ) : installed ? (
                    <button 
                      className="btn btn-get installed" 
                      onClick={() => onSelectApp(app)}
                    >
                      Ouvrir
                    </button>
                  ) : available ? (
                    <button 
                      className="btn btn-get"
                      onClick={() => onInstallApp(app.id)}
                      disabled={installingAppId !== null}
                    >
                      Obtenir
                    </button>
                  ) : (
                    <button className="btn btn-get soon" disabled>
                      Bientôt
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Detailed App Store sheet modal
function AppStoreDetailSheet({
  app,
  installed,
  installing,
  progress,
  onInstall,
  onOpen,
  onUninstall,
  onClose,
}: {
  app: AppDefinition;
  installed: boolean;
  installing: boolean;
  progress: number;
  onInstall: () => void;
  onOpen: () => void;
  onUninstall: () => void;
  onClose: () => void;
}) {
  const Icon = app.icon;
  const isAvailable = app.status === 'Disponible';
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      
      {/* App Header */}
      <div className="app-sheet-header">
        <div className="app-sheet-header-icon" style={{ background: app.gradient }}>
          <Icon size={46} />
        </div>
        <div className="app-sheet-header-info">
          <span className="app-sheet-header-title">{app.title}</span>
          <span className="app-sheet-header-subtitle">{app.category} · {app.developer}</span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {installing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="28" height="28" viewBox="0 0 32 32" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
                  <circle cx="16" cy="16" r="12" stroke="rgba(16, 185, 129, 0.15)" strokeWidth="3" fill="transparent" />
                  <circle cx="16" cy="16" r="12" stroke="var(--primary)" strokeWidth="3" fill="transparent" strokeDasharray={2 * Math.PI * 12} strokeDashoffset={2 * Math.PI * 12 * (1 - progress / 100)} />
                </svg>
                <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 700 }}>Téléchargement...</span>
              </div>
            ) : installed ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={onOpen} style={{ padding: '0.45rem 1.25rem', borderRadius: '20px' }}>
                  Ouvrir
                </button>
                <button className="btn btn-outline-danger" onClick={onUninstall} style={{ padding: '0.45rem 1rem', borderRadius: '20px' }}>
                  <Trash2 size={14} /> Désinstaller
                </button>
              </div>
            ) : isAvailable ? (
              <button className="btn btn-primary" onClick={onInstall} style={{ padding: '0.45rem 1.25rem', borderRadius: '20px' }}>
                Obtenir
              </button>
            ) : (
              <span className="sidebar-badge-soon" style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}>Bientôt disponible</span>
            )}
          </div>
        </div>
      </div>

      {/* Meta Stats */}
      <div className="app-sheet-stats">
        <div className="app-sheet-stat-item">
          <span className="app-sheet-stat-value">{app.rating} ★</span>
          <span className="app-sheet-stat-label">{app.ratingCount} NOTES</span>
        </div>
        <div className="app-sheet-stat-item">
          <span className="app-sheet-stat-value">Ages</span>
          <span className="app-sheet-stat-label">{app.ageLimit}</span>
        </div>
        <div className="app-sheet-stat-item">
          <span className="app-sheet-stat-value">Développeur</span>
          <span className="app-sheet-stat-label">CORE</span>
        </div>
        <div className="app-sheet-stat-item">
          <span className="app-sheet-stat-value">{app.size}</span>
          <span className="app-sheet-stat-label">TAILLE</span>
        </div>
      </div>

      {/* Screenshots mockups */}
      <div className="app-sheet-screenshots">
        {app.screenshots.map((s, idx) => (
          <div key={idx} className="app-sheet-screenshot-card">
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>{s}</span>
            <div className="app-sheet-screenshot-wireframe-card">
              <div className="app-sheet-screenshot-wireframe-row" style={{ width: '40%', background: 'rgba(16, 185, 129, 0.2)' }}></div>
              <div className="app-sheet-screenshot-wireframe-row" style={{ width: '90%' }}></div>
              <div className="app-sheet-screenshot-wireframe-row" style={{ width: '70%' }}></div>
              <div style={{ display: 'flex', gap: '0.25rem', marginTop: 'auto' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }}></div>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#cbd5e1' }}></div>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#cbd5e1' }}></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Description */}
      <div className="app-sheet-desc">
        <h4 className="app-sheet-desc-title">Description</h4>
        <div style={{ whiteSpace: 'pre-line' }}>{app.description}</div>
      </div>

      {/* Changelog */}
      <div className="app-sheet-changelog">
        <div className="app-sheet-changelog-header">
          <span className="app-sheet-changelog-title">Nouveautés</span>
          <span className="app-sheet-changelog-version">{app.version}</span>
        </div>
        <p className="app-sheet-changelog-desc">{app.changelog}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--light-border)' }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function SettingsPage({ session, dashboardSummary }: { session: UserSession; dashboardSummary?: DashboardSummary }) {
  const organization = dashboardSummary?.organization;
  return (
    <div className="settings-page">
      <section className="welcome-hero settings-hero">
        <span className="welcome-tag"><Settings size={14} /> Paramètres</span>
        <h1>Environnement ToqueHub</h1>
        <p>Les applications partagent la même organisation, les mêmes utilisateurs et les mêmes données. Cette page récapitule le contexte principal de votre instance.</p>
      </section>
      <div className="settings-grid">
        <div className="card-modern">
          <span className="card-title">Organisation</span>
          <div className="settings-list">
            <div><span>Nom</span><strong>{organization?.name ?? session.user.organizationName ?? 'Organisation'}</strong></div>
            <div><span>Type</span><strong>{organization?.establishmentType ?? session.user.organizationType ?? 'Non renseigné'}</strong></div>
            <div><span>Équipe</span><strong>{organization?.teamSize ?? session.user.teamSize ?? 'Non renseigné'}</strong></div>
            <div><span>Site principal</span><strong>{organization?.mainSiteName ?? session.user.mainSiteName ?? 'Site principal'}</strong></div>
          </div>
        </div>
        <div className="card-modern">
          <span className="card-title">Plateforme modulaire</span>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
            Installer ou supprimer une application modifie uniquement les fonctionnalités visibles dans l’interface. Les produits, fournisseurs, stocks, inventaires, mouvements et historiques restent conservés dans l’environnement de l’organisation.
          </p>
        </div>
      </div>
    </div>
  );
}

function ConfirmationModal({
  isOpen,
  title,
  text,
  confirmLabel,
  danger,
  loading,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '1.5rem' }}>{text}</p>
      <div className="modal-footer" style={{ margin: '0 -1.75rem -1.75rem' }}>
        <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>Annuler</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={loading}>
          {loading ? 'Traitement…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// Modal Container with Framer Motion
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay" onClick={onClose} style={{ pointerEvents: 'auto' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="modal-content-wrapper"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{title}</h3>
              <button className="modal-close-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Category Form
interface CategoryFormProps {
  onSubmit: (payload: { name: string; description?: string }) => Promise<void>;
  onClose: () => void;
}

function CategoryForm({ onSubmit, onClose }: CategoryFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {error && (
        <div className="alert-modern error" style={{ padding: '0.75rem 1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      <label>
        Nom de la catégorie *
        <input
          placeholder="ex: Épicerie, Produits laitiers..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </label>
      <label>
        Description
        <textarea
          placeholder="Description de la catégorie..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ resize: 'vertical' }}
        />
      </label>
      <div className="modal-footer" style={{ margin: '1.5rem -1.75rem -1.75rem', padding: '1rem 1.75rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
          {submitting ? 'Création...' : 'Créer la catégorie'}
        </button>
      </div>
    </form>
  );
}

// Unit Form
interface UnitFormProps {
  onSubmit: (payload: { name: string; symbol: string; type?: string; baseFactor?: number }) => Promise<void>;
  onClose: () => void;
}

function UnitForm({ onSubmit, onClose }: UnitFormProps) {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState('COUNT');
  const [baseFactor, setBaseFactor] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !symbol.trim()) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit({ name: name.trim(), symbol: symbol.trim(), type, baseFactor: Number(baseFactor) || 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {error && (
        <div className="alert-modern error" style={{ padding: '0.75rem 1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      <label>
        Nom de l'unité *
        <input
          placeholder="ex: Kilogramme, Litre, Boîte..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </label>
      <label>
        Symbole *
        <input
          placeholder="ex: kg, L, bt..."
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          required
        />
      </label>
      <div className="form-row">
        <label>
          Type compatible
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="MASS">Masse (kg/g)</option>
            <option value="VOLUME">Volume (L/mL)</option>
            <option value="COUNT">Comptage</option>
          </select>
        </label>
        <label>
          Facteur de conversion
          <input type="number" step="0.001" value={baseFactor} onChange={(e) => setBaseFactor(e.target.value)} />
        </label>
      </div>
      <div className="modal-footer" style={{ margin: '1.5rem -1.75rem -1.75rem', padding: '1rem 1.75rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim() || !symbol.trim()}>
          {submitting ? 'Création...' : 'Créer l\'unité'}
        </button>
      </div>
    </form>
  );
}

// Product Form
interface ProductFormProps {
  categories: Category[];
  units: Unit[];
  onSubmit: (payload: { name: string; sku?: string; unitId: string; categoryId?: string }) => Promise<void>;
  onClose: () => void;
}

function ProductForm({ categories, units, onSubmit, onClose }: ProductFormProps) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [categoryId, setCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !unitId) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit({
        name: name.trim(),
        sku: sku.trim() || undefined,
        unitId,
        categoryId: categoryId || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {error && (
        <div className="alert-modern error" style={{ padding: '0.75rem 1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      <label>
        Nom du produit *
        <input
          placeholder="ex: Beurre doux, Oeuf plein air..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </label>
      <label>
        Code SKU / Référence catalogue
        <input
          placeholder="ex: BEU-DOUX-250G..."
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
      </label>

      <div className="form-row">
        <label>
          Unité de mesure *
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
            <option value="">Choisir l'unité...</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
            ))}
          </select>
        </label>
        <label>
          Catégorie
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Non catégorisé</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="modal-footer" style={{ margin: '1.5rem -1.75rem -1.75rem', padding: '1rem 1.75rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim() || !unitId}>
          {submitting ? 'Création...' : 'Créer le produit'}
        </button>
      </div>
    </form>
  );
}

// Supplier Form
interface SupplierFormProps {
  onSubmit: (payload: { name: string; contactName?: string; email?: string; phone?: string; address?: string; notes?: string }) => Promise<void>;
  onClose: () => void;
}

function SupplierForm({ onSubmit, onClose }: SupplierFormProps) {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit({ name: name.trim(), contactName: contactName.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined, address: address.trim() || undefined, notes: notes.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {error && (
        <div className="alert-modern error" style={{ padding: '0.75rem 1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      <label>
        Nom du fournisseur *
        <input
          placeholder="ex: Metro, Transgourmet..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </label>
      <label>
        Contact
        <input placeholder="ex: Marie Dupont" value={contactName} onChange={(e) => setContactName(e.target.value)} />
      </label>
      <label>
        Email de contact
        <input
          placeholder="ex: commercial@metro.fr..."
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <div className="form-row">
        <label>Téléphone<input placeholder="01 23 45 67 89" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label>Adresse<input placeholder="Adresse fournisseur" value={address} onChange={(e) => setAddress(e.target.value)} /></label>
      </div>
      <label>Notes<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions, jours de livraison…" /></label>

      <div className="modal-footer" style={{ margin: '1.5rem -1.75rem -1.75rem', padding: '1rem 1.75rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
          {submitting ? 'Création...' : 'Créer le fournisseur'}
        </button>
      </div>
    </form>
  );
}

function SiteForm({ onSubmit, onClose }: { onSubmit: (payload: { name: string; description?: string }) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function submitForm(e: FormEvent) { e.preventDefault(); setSubmitting(true); try { await onSubmit({ name: name.trim(), description: description.trim() || undefined }); } finally { setSubmitting(false); } }
  return <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}><label>Nom du site *<input value={name} onChange={e => setName(e.target.value)} placeholder="Restaurant principal, Cuisine centrale…" required autoFocus /></label><label>Description<textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label><div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}><button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!name.trim() || submitting}>{submitting ? 'Création…' : 'Créer le site'}</button></div></form>;
}

function LocationForm({ sites, onSubmit, onClose }: { sites: Site[]; onSubmit: (payload: { name: string; siteId: string; description?: string }) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function submitForm(e: FormEvent) { e.preventDefault(); setSubmitting(true); try { await onSubmit({ name: name.trim(), siteId, description: description.trim() || undefined }); } finally { setSubmitting(false); } }
  return <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{sites.length === 0 && <div className="alert-modern error"><Info size={16}/>Créez d’abord un site.</div>}<label>Nom de l’emplacement *<input value={name} onChange={e => setName(e.target.value)} placeholder="Réserve sèche, Chambre froide positive…" required autoFocus /></label><label>Site *<select value={siteId} onChange={e => setSiteId(e.target.value)} required><option value="">Choisir…</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Description<textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label><div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}><button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!name.trim() || !siteId || submitting}>{submitting ? 'Création…' : 'Créer l’emplacement'}</button></div></form>;
}

function InventoryForm({ sites, locations, onSubmit, onClose }: { sites: Site[]; locations: Location[]; onSubmit: (payload: { name: string; date?: string; comment?: string; siteId?: string; locationId?: string }) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(`Inventaire ${new Date().toLocaleDateString('fr-FR')}`);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState('');
  const [siteId, setSiteId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function submitForm(e: FormEvent) { e.preventDefault(); setSubmitting(true); try { await onSubmit({ name: name.trim(), date, comment: comment.trim() || undefined, siteId: siteId || undefined, locationId: locationId || undefined }); } finally { setSubmitting(false); } }
  return <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}><label>Nom *<input value={name} onChange={e => setName(e.target.value)} required autoFocus /></label><label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><div className="form-row"><label>Site<select value={siteId} onChange={e => setSiteId(e.target.value)}><option value="">Tous</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Emplacement<select value={locationId} onChange={e => setLocationId(e.target.value)}><option value="">Tous</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label></div><label>Commentaire<textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Motif et périmètre du comptage" /></label><p className="section-tagline">À la validation, les écarts entre stock théorique et compté généreront des corrections “Correction inventaire”.</p><div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}><button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!name.trim() || submitting}>{submitting ? 'Création…' : 'Créer l’inventaire'}</button></div></form>;
}

function PrefillWizard({ onSubmit, onClose }: { onSubmit: (payload: { categories?: boolean; units?: boolean; sites?: boolean; locations?: boolean; examples?: boolean }) => Promise<void>; onClose: () => void }) {
  const [payload, setPayload] = useState({ categories: true, units: true, sites: true, locations: true, examples: false });
  const [submitting, setSubmitting] = useState(false);
  async function submitForm(e: FormEvent) { e.preventDefault(); setSubmitting(true); try { await onSubmit(payload); } finally { setSubmitting(false); } }
  const items: Array<[keyof typeof payload, string, string]> = [['categories', 'Catégories courantes', 'Épicerie, frais, surgelés, boissons…'], ['units', 'Unités courantes', 'kg, g, L, mL, pièce, carton…'], ['sites', 'Sites', 'Restaurant principal, cuisine centrale…'], ['locations', 'Emplacements internes', 'Réserve sèche, chambres froides, quai…'], ['examples', 'Exemples métier', 'Quelques produits et mouvements de démonstration']];
  return <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}><p className="section-tagline">Préremplissez votre établissement sans supprimer les données existantes.</p>{items.map(([key, title, desc]) => <label key={key} className="wizard-option"><input type="checkbox" checked={payload[key]} onChange={e => setPayload(p => ({ ...p, [key]: e.target.checked }))} /><span><strong>{title}</strong><small>{desc}</small></span></label>)}<div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}><button type="button" className="btn btn-secondary" onClick={onClose}>Plus tard</button><button className="btn btn-primary" disabled={submitting}>{submitting ? 'Préremplissage…' : 'Lancer le préremplissage'}</button></div></form>;
}

// Movement Form
interface MovementFormProps {
  products: Product[];
  suppliers: Supplier[];
  units: Unit[];
  sites: Site[];
  locations: Location[];
  onSubmit: (payload: {
    productId: string;
    supplierId?: string;
    type: StockMovementType;
    quantity: number;
    unitId?: string;
    lotId?: string;
    sourceSiteId?: string;
    sourceLocationId?: string;
    destinationSiteId?: string;
    destinationLocationId?: string;
    date?: string;
    reason?: string;
  }) => Promise<void>;
  onClose: () => void;
}

function MovementForm({ products, suppliers, units, sites, locations, onSubmit, onClose }: MovementFormProps) {
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [type, setType] = useState<StockMovementType>('RECEPTION');
  const [supplierId, setSupplierId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [sourceSiteId, setSourceSiteId] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationSiteId, setDestinationSiteId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!productId || !quantity) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit({
        productId,
        supplierId: type === 'RECEPTION' && supplierId ? supplierId : undefined,
        type,
        quantity: Number(quantity),
        unitId: unitId || undefined,
        sourceSiteId: sourceSiteId || undefined,
        sourceLocationId: sourceLocationId || undefined,
        destinationSiteId: destinationSiteId || undefined,
        destinationLocationId: destinationLocationId || undefined,
        date: date || undefined,
        reason: reason.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === productId);
  }, [products, productId]);

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {error && (
        <div className="alert-modern error" style={{ padding: '0.75rem 1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {products.length === 0 ? (
        <div className="alert-modern error">
          <Info size={16} />
          <span>Vous devez d'abord créer au moins un produit dans le catalogue.</span>
        </div>
      ) : (
        <>
          <label>
            Sélectionner le produit *
            <select value={productId} onChange={(e) => setProductId(e.target.value)} required autoFocus>
              <option value="">Choisir un produit...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} {p.sku ? `(SKU: ${p.sku})` : ''}</option>
              ))}
            </select>
          </label>

          <div className="form-row">
            <label>
              Type de mouvement *
              <select value={type} onChange={(e) => setType(e.target.value as StockMovementType)} required>
                {Object.entries(movementLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Quantité {selectedProduct?.unit?.symbol ? `(${selectedProduct.unit.symbol})` : ''} *
              <input
                type="number"
                step="0.001"
                min="0.001"
                placeholder="0.000"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
          </div>

          <label>
            Unité de saisie compatible
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Unité principale du produit</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
            </select>
          </label>

          {(type === 'OUT' || type === 'EXIT' || type === 'LOSS' || type === 'TRANSFER') && (
            <div className="form-row">
              <label>Site source<select value={sourceSiteId} onChange={(e) => setSourceSiteId(e.target.value)}><option value="">Non précisé</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>Emplacement source<select value={sourceLocationId} onChange={(e) => setSourceLocationId(e.target.value)}><option value="">Non précisé</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            </div>
          )}

          {(type === 'RECEPTION' || type === 'ENTRY' || type === 'TRANSFER') && (
            <div className="form-row">
              <label>Site destination<select value={destinationSiteId} onChange={(e) => setDestinationSiteId(e.target.value)}><option value="">Non précisé</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>Emplacement destination<select value={destinationLocationId} onChange={(e) => setDestinationLocationId(e.target.value)}><option value="">Non précisé</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            </div>
          )}

          <label>
            Date du mouvement
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          {type === 'RECEPTION' && (
            <label>
              Fournisseur concerné
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Aucun fournisseur</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          <label>
            Motif / Note explicative
            <input
              placeholder="ex: Commande de la semaine, Ajustement inventaire..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          <div className="modal-footer" style={{ margin: '1.5rem -1.75rem -1.75rem', padding: '1rem 1.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !productId || !quantity}>
              {submitting ? 'Enregistrement...' : 'Enregistrer le mouvement'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

// Customizer Form Component
interface CustomizeDashboardFormProps {
  theme: 'emerald' | 'blue' | 'amber' | 'dark';
  visibleWidgets: { metrics: boolean; progress: boolean; apps: boolean };
  layoutMode: 'split' | 'stacked';
  onSave: (
    theme: 'emerald' | 'blue' | 'amber' | 'dark',
    visibleWidgets: { metrics: boolean; progress: boolean; apps: boolean },
    layoutMode: 'split' | 'stacked'
  ) => void;
  onClose: () => void;
}

function CustomizeDashboardForm({
  theme: initialTheme,
  visibleWidgets: initialWidgets,
  layoutMode: initialLayout,
  onSave,
  onClose,
}: CustomizeDashboardFormProps) {
  const [theme, setTheme] = useState(initialTheme);
  const [visibleWidgets, setVisibleWidgets] = useState(initialWidgets);
  const [layoutMode, setLayoutMode] = useState(initialLayout);

  const themeOptions = [
    { id: 'emerald', name: 'Émeraude', bg: 'linear-gradient(135deg, #090d16 0%, #111827 100%)', accent: '#10b981' },
    { id: 'blue', name: 'Nuit Polaire', bg: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)', accent: '#3b82f6' },
    { id: 'amber', name: 'Or Crépuscule', bg: 'linear-gradient(135deg, #1c1917 0%, #0c0a09 100%)', accent: '#f59e0b' },
    { id: 'dark', name: 'Stealth Slate', bg: 'linear-gradient(135deg, #0b0f19 0%, #070a13 100%)', accent: '#64748b' },
  ] as const;

  const toggleWidget = (key: keyof typeof visibleWidgets) => {
    setVisibleWidgets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Theme Choice */}
      <div className="customizer-section">
        <span className="customizer-section-title">Thème visuel de l'accueil</span>
        <div className="theme-grid-selector">
          {themeOptions.map((opt) => (
            <div
              key={opt.id}
              className={`theme-select-card ${theme === opt.id ? 'active' : ''}`}
              onClick={() => setTheme(opt.id)}
            >
              <div className="theme-preview-bg" style={{ background: opt.bg }} />
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: opt.accent,
                }}
              />
              <span className="theme-select-card-name">{opt.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Visible Widgets */}
      <div className="customizer-section">
        <span className="customizer-section-title">Blocs à afficher</span>
        <div className="customizer-toggle-list">
          <div className="customizer-toggle-row">
            <div className="customizer-toggle-info">
              <span className="customizer-toggle-label">Statistiques de Stock</span>
              <span className="customizer-toggle-desc">Affiche le résumé global des stocks et produits.</span>
            </div>
            <label className="switch-control">
              <input
                type="checkbox"
                checked={visibleWidgets.metrics}
                onChange={() => toggleWidget('metrics')}
              />
              <span className="slider-round" />
            </label>
          </div>

          <div className="customizer-toggle-row">
            <div className="customizer-toggle-info">
              <span className="customizer-toggle-label">Progression du paramétrage</span>
              <span className="customizer-toggle-desc">Affiche la check-list des étapes initiales.</span>
            </div>
            <label className="switch-control">
              <input
                type="checkbox"
                checked={visibleWidgets.progress}
                onChange={() => toggleWidget('progress')}
              />
              <span className="slider-round" />
            </label>
          </div>

          <div className="customizer-toggle-row">
            <div className="customizer-toggle-info">
              <span className="customizer-toggle-label">Applications installées</span>
              <span className="customizer-toggle-desc">Raccourci vers les modules actifs et le Toque Store.</span>
            </div>
            <label className="switch-control">
              <input
                type="checkbox"
                checked={visibleWidgets.apps}
                onChange={() => toggleWidget('apps')}
              />
              <span className="slider-round" />
            </label>
          </div>
        </div>
      </div>

      {/* Layout Mode */}
      <div className="customizer-section">
        <span className="customizer-section-title">Agencement de l'accueil</span>
        <div className="layout-selector">
          <div
            className={`layout-card ${layoutMode === 'split' ? 'active' : ''}`}
            onClick={() => setLayoutMode('split')}
          >
            <span>Double colonne</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
              Layout compact côte-à-côte
            </span>
          </div>
          <div
            className={`layout-card ${layoutMode === 'stacked' ? 'active' : ''}`}
            onClick={() => setLayoutMode('stacked')}
          >
            <span>Pleine largeur</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
              Widgets empilés verticalement
            </span>
          </div>
        </div>
      </div>

      {/* Save Actions */}
      <div className="modal-footer" style={{ margin: '1.5rem -1.75rem -1.75rem', padding: '1rem 1.75rem' }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn btn-primary"
          onClick={() => onSave(theme, visibleWidgets, layoutMode)}
          disabled={!visibleWidgets.metrics && !visibleWidgets.progress && !visibleWidgets.apps}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

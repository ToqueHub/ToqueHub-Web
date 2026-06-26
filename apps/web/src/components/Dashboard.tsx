import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Avatar,
  Box,
  Chip,
  FormControlLabel,
  Switch as MuiSwitch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import {
  CalendarCheck,
  Calculator,
  CalendarDays,
  LayoutDashboard,
  Package,
  History,
  ChefHat,
  UsersRound,
  UserRound,
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
  Workflow,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Edit3,
  Ban,
  Crown,
  Shield,
  RefreshCw,
  LineChart,
  Heart,
  Pin,
  Building2,
  BriefcaseBusiness,
  Factory,
  Utensils,
  KeyRound,
  Server,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize,
} from 'lucide-react';
import { ArchitectureCenter } from './ArchitectureCenter';
import { UsersPage, UserForm } from './UsersPage';
import { CoursProduitsApp } from './CoursProduitsApp';
import { HrApp } from './HrApp';
import { PlanningApp } from './PlanningApp';
import { TechnicalSheetsApp } from './TechnicalSheetsApp';
import { ProductionApp } from './ProductionApp';
import { MenusApp } from './MenusApp';

import { ApiError, api } from '../api/client';
import type {
  Category,
  DashboardSummary,
  ModularDashboard,
  ModularDashboardPreferences,
  DashboardWidget,
  AuditEntry,
  Inventory,
  Location,
  Product,
  Site,
  Stock,
  StockMovement,
  StockMovementType,
  StocksOcrExtraction,
  StocksOcrLine,
  StocksOcrStatus,
  Supplier,
  Unit,
  UserSession,
  CoreUser,
  CoreRole,
  CorePermission,
  UserStatus,
  HrCollaborator,
  HrCollaboratorPayload,
  HrDepartment,
  HrDocument,
  HrPosition,
  HrReferencePayload,
  HrSummary,
  HrRotation,
  HrRotationPayload,
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
    id: 'rnm-prices',
    icon: LineChart,
    title: 'Cours des Produits',
    category: 'Veille économique',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #22c55e 0%, #2563eb 100%)',
    developer: 'ToqueHub Core',
    rating: '4.9',
    ratingCount: 'RNM',
    ageLimit: '3+',
    size: 'Temps réel',
    tagline: 'Suivez les cours du marché alimentaire FranceAgriMer et analysez l’évolution des prix de milliers de produits.',
    description: 'Cours des Produits transforme ToqueHub en centre de veille économique alimentaire. Les données RNM FranceAgriMer sont consultées en temps réel via le backend ToqueHub, sans import ni duplication dans vos référentiels métier.\n\nFonctionnalités clés :\n- Catalogue RNM, recherche, secteurs, catégories et pagination.\n- Fiches produits avec dernières cotations et historique graphique.\n- Favoris personnels persistés, conservés après désinstallation.\n- Historique global filtrable pour suivre les tendances de marché.',
    screenshots: ['Tableau de bord RNM', 'Fiche cotations', 'Historique prix'],
    changelog: 'Lancement V1 avec proxy RNM, favoris utilisateur et navigation complète.',
    version: 'v1.0.0',
    compatibility: 'ToqueHub Core v0.1.0+',
    status: 'Disponible',
  },
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
    id: 'technical-sheets',
    icon: FileText,
    title: 'Fiches Techniques',
    category: 'Cuisine & Coûts matières',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    developer: 'ToqueHub Core',
    rating: '4.9',
    ratingCount: 'V1',
    ageLimit: '3+',
    size: '2.4 Mo',
    tagline: 'Référentiel culinaire central connecté aux produits, unités et prix d’achat Stocks.',
    description: 'Fiches Techniques centralise vos préparations professionnelles sans créer de référentiel produit parallèle. Les lignes d’ingrédients pointent exclusivement vers les produits Stocks, les coûts utilisent les prix d’achat Stocks, et la V1 couvre catégories recettes, allergènes par ligne, étapes, historique, duplication, archivage, production théorique et exports PDF/CSV.\n\nDépendance stricte : le module Stocks doit être installé avant Fiches Techniques.',
    screenshots: ['Tableau de bord', 'Fiche technique', 'Production théorique'],
    changelog: 'Lancement V1 avec préchargement catégories recettes et allergènes standards.',
    version: 'v1.0.0',
    compatibility: 'ToqueHub Core v0.1.0+ + Stocks obligatoire',
    status: 'Disponible',
  },
  {
    id: 'production',
    icon: Factory,
    title: 'Production',
    category: 'Orchestration cuisine',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    developer: 'ToqueHub Core',
    rating: '4.9',
    ratingCount: 'V1',
    ageLimit: '3+',
    size: '3.1 Mo',
    tagline: 'Transformez vos fiches techniques en ordres de fabrication pilotables, alertés et historisés.',
    description: 'Production orchestre les données existantes sans recréer de référentiel métier : fiches techniques, produits, stocks, collaborateurs, services, postes et plannings restent propriétaires de leurs modules.\n\nFonctionnalités clés V1 :\n- Création manuelle d’ordres depuis les fiches techniques.\n- Recalcul automatique des portions, besoins matières, coûts et allergènes.\n- Workflow manuel Planifiée / Validée / En cours / Terminée / Annulée.\n- Alertes critiques contournables uniquement avec confirmation historisée.\n- Affectations RH et service optionnels.\n- Réalisation détaillée, déstockage proposé puis confirmé via Stocks.\n- Exports historisés avec snapshot figé.',
    screenshots: ['Tableau de bord Production', 'Besoins matières', 'Réalisation et exports'],
    changelog: 'Lancement V1 complet avec cockpit opérationnel, calendrier, affectations, alertes, exports et historique.',
    version: 'v1.0.0',
    compatibility: 'ToqueHub Core v0.1.0+ + Stocks et Fiches Techniques requis, RH/Planning optionnels',
    status: 'Disponible',
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
    tagline: 'Centralisez les informations de vos collaborateurs et structurez votre organisation.',
    description: 'RH devient le référentiel humain central de l’établissement : collaborateurs avec ou sans compte ToqueHub, services, postes, organigramme, historique et liaison unique avec les utilisateurs Core.',
    screenshots: ['Tableau de bord RH', 'Collaborateurs', 'Organigramme'],
    changelog: 'Lancement V1 avec services et postes de départ créés automatiquement à l’installation.',
    version: 'v1.0.0',
    compatibility: 'ToqueHub Core v0.1.0+',
    status: 'Disponible',
  },
  {
    id: 'planning',
    icon: CalendarCheck,
    title: 'Planning',
    category: 'Planification & RH',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #7c3aed 100%)',
    developer: 'ToqueHub Core',
    rating: '4.9',
    ratingCount: 'Planning',
    ageLimit: '3+',
    size: '2.1 Mo',
    tagline: 'Pilotez plannings jour/semaine/mois, affectations, absences RH, remplacements et besoins opérationnels.',
    description: 'Planning devient le centre opérationnel de ToqueHub sans dupliquer la RH. Il consomme collaborateurs, services, postes, roulements, absences et compétences pour générer des affectations déterministes, contrôler les conflits RH, proposer des remplacements et préparer exports PDF/Excel/impression.',
    screenshots: ['Tableau de bord Planning', 'Vue hebdomadaire', 'Remplacements et besoins'],
    changelog: 'Lancement V1 avec vues complètes, génération déterministe, alertes, historique et exports préparés.',
    version: 'v1.0.0',
    compatibility: 'ToqueHub Core v0.1.0+ + module RH recommandé',
    status: 'Disponible',
  },
  {
    id: 'menus',
    icon: Utensils,
    title: 'Menus',
    category: 'Planification culinaire',
    price: 'Gratuit',
    gradient: 'linear-gradient(135deg, #f97316 0%, #db2777 100%)',
    developer: 'ToqueHub Core',
    rating: '4.9',
    ratingCount: 'Menus',
    ageLimit: '3+',
    size: '2.8 Mo',
    tagline: 'Planifiez repas, cycles, variantes, convives et productions depuis vos fiches techniques existantes.',
    description: 'Menus organise la planification culinaire sans créer recettes, produits, ingrédients, stocks ou collaborateurs. Chaque préparation référence une fiche technique existante ; coûts et allergènes sont lus depuis Fiches Techniques, puis les productions sont générées dans Production.\n\nDépendances strictes : Fiches Techniques et Production doivent être installés avant Menus.',
    screenshots: ['Tableau de bord Menus', 'Calendrier alimentaire', 'Génération Production'],
    changelog: 'Lancement V1 avec menus, cycles, régimes, convives, exports, historique et génération Production.',
    version: 'v1.0.0',
    compatibility: 'ToqueHub Core v0.1.0+ + Fiches Techniques et Production obligatoires',
    status: 'Disponible',
  },
];

type ActiveTab = 'overview' | 'applications' | 'settings' | 'organization-general' | 'users' | 'architecture' | 'stocks-dashboard' | 'inventory' | 'movements' | 'products' | 'categories' | 'units' | 'suppliers' | 'inventories' | 'locations' | 'audit' | 'rnm-dashboard' | 'rnm-history' | 'rnm-favorites' | 'rnm-about' | 'hr-dashboard' | 'hr-collaborators' | 'hr-departments' | 'hr-positions' | 'hr-rotations' | 'hr-orgchart' | 'planning-dashboard' | 'planning-planning' | 'planning-settings' | 'planning-attendance' | 'planning-day' | 'planning-week' | 'planning-month' | 'planning-assignments' | 'planning-absences' | 'planning-replacements' | 'planning-templates' | 'planning-requirements' | 'technical-sheets-dashboard' | 'technical-sheets-recipes' | 'technical-sheets-categories' | 'technical-sheets-costs' | 'technical-sheets-allergens' | 'technical-sheets-production' | 'production-dashboard' | 'production-orders' | 'production-calendar' | 'production-today' | 'production-assignments' | 'production-materials' | 'production-exports' | 'production-history' | 'menus-dashboard' | 'menus-list' | 'menus-calendar' | 'menus-cycles' | 'menus-diets' | 'menus-guests' | 'menus-exports' | 'menus-history';

type Confirmation = 'install-stocks' | 'uninstall-stocks' | 'uninstall-rnm-prices' | 'uninstall-planning' | 'uninstall-technical-sheets' | 'uninstall-production' | 'uninstall-menus' | null;

interface DashboardProps {
  session: UserSession;
  onLogout: () => void;
  onSessionSwitch?: (session: UserSession) => void;
}

export function Dashboard({ session, onLogout, onSessionSwitch }: DashboardProps) {
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
  const [modularDashboard, setModularDashboard] = useState<ModularDashboard>();
  const [users, setUsers] = useState<CoreUser[]>([]);
  const [roles, setRoles] = useState<CoreRole[]>([]);
  const [permissions, setPermissions] = useState<CorePermission[]>([]);
  const [devSwitchEnabled, setDevSwitchEnabled] = useState(false);
  const [hrSummary, setHrSummary] = useState<HrSummary>();
  const [hrCollaborators, setHrCollaborators] = useState<HrCollaborator[]>([]);
  const [hrDepartments, setHrDepartments] = useState<HrDepartment[]>([]);
  const [hrPositions, setHrPositions] = useState<HrPosition[]>([]);
  const [hrRotations, setHrRotations] = useState<HrRotation[]>([]);
  const [hrOnboarding, setHrOnboarding] = useState<any>(null);
  
  // UI State
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [isLoading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [stocksMenuExpanded, setStocksMenuExpanded] = useState(() => {
    const stocksTabs = [
      'stocks-dashboard', 'inventory', 'movements', 'products', 'categories',
      'units', 'suppliers', 'inventories', 'locations', 'audit'
    ];
    return stocksTabs.includes('overview'); // initially 'overview', but let's default to false unless configured differently
  });
  const [rnmMenuExpanded, setRnmMenuExpanded] = useState(() => false);
  const [hrMenuExpanded, setHrMenuExpanded] = useState(() => false);
  const [planningMenuExpanded, setPlanningMenuExpanded] = useState(() => false);
  const [productionMenuExpanded, setProductionMenuExpanded] = useState(() => false);
  const [menusMenuExpanded, setMenusMenuExpanded] = useState(() => false);
  const [technicalSheetsMenuExpanded, setTechnicalSheetsMenuExpanded] = useState(() => false);
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [showAppSearch, setShowAppSearch] = useState(false);
  const [pinnedApps, setPinnedApps] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('toquehub_pinned_apps');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileDropdownMode, setProfileDropdownMode] = useState<'main' | 'users'>('main');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [installedApps, setInstalledApps] = useState<string[]>(session.user.installedApplications ?? []);
  const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'ADMINISTRATEUR'].includes(session.user.role?.toUpperCase());

  // Modal Visibility State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showOcrImportModal, setShowOcrImportModal] = useState(false);
  const [showOcrReviewModal, setShowOcrReviewModal] = useState(false);
  const [ocrStatuses, setOcrStatuses] = useState<StocksOcrStatus[]>([]);
  const [selectedOcrExtraction, setSelectedOcrExtraction] = useState<StocksOcrExtraction | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [ocrPollingActive, setOcrPollingActive] = useState(false);
  const [productPrefillName, setProductPrefillName] = useState('');
  const [supplierPrefillName, setSupplierPrefillName] = useState('');
  const [apiKeysPanelHint, setApiKeysPanelHint] = useState(false);
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
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<CoreUser | null>(null);

  // Search & Filter States
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');
  const [productSupplierFilter, setProductSupplierFilter] = useState('');
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
      const [summaryResult, modularDashboardResult, nextCategories, nextUnits, nextProducts, nextSuppliers, nextStocks, nextMovements, nextSites, nextLocations, nextInventories, nextAuditEntries, usersResult, rolesResult, devConfig, hrData] =
        await Promise.all([
          api.dashboardSummary(token).catch(() => undefined),
          api.modularDashboard(token).catch(() => undefined),
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
          api.users(token).catch(() => []),
          api.roles(token).catch(() => []),
          api.devSwitchConfig(token).catch(() => ({ enabled: false })),
          api.hrBootstrap(token).catch(() => undefined),
        ]);
      if (summaryResult) {
        setDashboardSummary(summaryResult);
        setInstalledApps(summaryResult.installedApplications ?? []);
      }
      if (modularDashboardResult) {
        setModularDashboard(modularDashboardResult);
        setDashboardTheme((modularDashboardResult.preferences.theme as typeof dashboardTheme) ?? 'emerald');
        setLayoutMode(modularDashboardResult.preferences.layoutMode ?? 'split');
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
      if (Array.isArray(usersResult)) {
        setUsers(usersResult);
      } else {
        setUsers(usersResult.users ?? []);
        if (usersResult.roles) setRoles(usersResult.roles);
        if (usersResult.permissions) setPermissions(usersResult.permissions);
        if (typeof usersResult.devSwitchEnabled === 'boolean') setDevSwitchEnabled(usersResult.devSwitchEnabled);
      }
      if (Array.isArray(rolesResult)) {
        setRoles(rolesResult);
      } else {
        setRoles(rolesResult.roles ?? []);
        if (rolesResult.permissions) setPermissions(rolesResult.permissions);
      }
      setDevSwitchEnabled(Boolean(devConfig.enabled));
      if (hrData) {
        setHrSummary(hrData.summary);
        setHrCollaborators(hrData.collaborators ?? []);
        setHrDepartments(hrData.departments ?? []);
        setHrPositions(hrData.positions ?? []);
        setHrRotations(hrData.rotations ?? []);
        setHrOnboarding(hrData.onboarding);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!ocrPollingActive || !ocrStatuses.length) return undefined;
    const timer = window.setInterval(async () => {
      const pending = ocrStatuses.filter((item) => !item.extraction && item.state !== 'erreur');
      if (!pending.length) {
        setOcrPollingActive(false);
        return;
      }
      const refreshed = await Promise.all(ocrStatuses.map((item) => api.stocksOcrStatus(token, item.document.id).catch(() => item)));
      setOcrStatuses(refreshed);
      if (refreshed.every((item) => item.extraction || item.state === 'erreur')) setOcrPollingActive(false);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [ocrPollingActive, ocrStatuses, token]);


  const stocksInstalled = installedApps.includes('stocks');
  const rnmInstalled = installedApps.includes('rnm-prices');
  const hrInstalled = installedApps.includes('hr');
  const rhPlanningReadiness = getRhPlanningReadiness(hrInstalled, hrDepartments, hrPositions, hrCollaborators);
  const planningInstalled = installedApps.includes('planning');
  const technicalSheetsInstalled = installedApps.includes('technical-sheets');
  const productionInstalled = installedApps.includes('production');
  const menusInstalled = installedApps.includes('menus');
  const planningPrerequisiteMessage = rhPlanningReadiness.ready ? undefined : rhPlanningReadiness.message;

  const isStocksTab = useMemo(() => {
    const stocksTabs = [
      'stocks-dashboard', 'inventory', 'movements', 'products', 'categories',
      'units', 'suppliers', 'inventories', 'locations', 'audit'
    ];
    return stocksTabs.includes(activeTab);
  }, [activeTab]);

  const isRnmTab = useMemo(() => ['rnm-dashboard', 'rnm-history', 'rnm-favorites', 'rnm-about'].includes(activeTab), [activeTab]);
  const isHrTab = useMemo(() => ['hr-dashboard', 'hr-collaborators', 'hr-departments', 'hr-positions', 'hr-rotations', 'hr-orgchart'].includes(activeTab), [activeTab]);
  const isPlanningTab = useMemo(() => ['planning-dashboard', 'planning-planning', 'planning-settings', 'planning-attendance', 'planning-day', 'planning-week', 'planning-month', 'planning-assignments', 'planning-absences', 'planning-replacements', 'planning-templates', 'planning-requirements'].includes(activeTab), [activeTab]);
  const isTechnicalSheetsTab = useMemo(() => ['technical-sheets-dashboard', 'technical-sheets-recipes', 'technical-sheets-categories', 'technical-sheets-costs', 'technical-sheets-allergens', 'technical-sheets-production'].includes(activeTab), [activeTab]);
  const isProductionTab = useMemo(() => ['production-dashboard', 'production-orders', 'production-calendar', 'production-today', 'production-assignments', 'production-materials', 'production-exports', 'production-history'].includes(activeTab), [activeTab]);
  const isMenusTab = useMemo(() => ['menus-dashboard', 'menus-list', 'menus-calendar', 'menus-cycles', 'menus-diets', 'menus-guests', 'menus-exports', 'menus-history'].includes(activeTab), [activeTab]);

  useEffect(() => {
    if (isMenusTab) {
      setMenusMenuExpanded(true);
    }
  }, [isMenusTab]);

  useEffect(() => {
    if (isProductionTab) {
      setProductionMenuExpanded(true);
    }
  }, [isProductionTab]);

  useEffect(() => {
    if (isStocksTab) {
      setStocksMenuExpanded(true);
    }
  }, [isStocksTab]);

  useEffect(() => {
    if (isRnmTab) {
      setRnmMenuExpanded(true);
    }
  }, [isRnmTab]);

  useEffect(() => {
    if (isHrTab) {
      setHrMenuExpanded(true);
    }
  }, [isHrTab]);

  useEffect(() => {
    if (isPlanningTab) {
      setPlanningMenuExpanded(true);
    }
  }, [isPlanningTab]);

  useEffect(() => {
    if (isTechnicalSheetsTab) {
      setTechnicalSheetsMenuExpanded(true);
    }
  }, [isTechnicalSheetsTab]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.sidebar-footer-profile-container')) {
        setProfileMenuOpen(false);
        setProfileDropdownMode('main');
      }
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [profileMenuOpen]);

  const togglePinApp = (appId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedApps(prev => {
      const next = prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId];
      localStorage.setItem('toquehub_pinned_apps', JSON.stringify(next));
      return next;
    });
  };

  const userInitials = useMemo(() => {
    const fn = session.user.firstName || '';
    const ln = session.user.lastName || '';
    if (fn || ln) {
      return `${fn[0] ?? ''}${ln[0] ?? ''}`.toUpperCase();
    }
    return session.user.username?.substring(0, 2).toUpperCase() || 'TH';
  }, [session.user]);

  const userFullName = useMemo(() => {
    const fn = session.user.firstName || '';
    const ln = session.user.lastName || '';
    return `${fn} ${ln}`.trim() || session.user.username || 'Utilisateur';
  }, [session.user]);

  const allApps = useMemo(() => [
    {
      id: 'stocks',
      title: 'Stocks',
      icon: Package,
      installed: stocksInstalled,
      expanded: stocksMenuExpanded,
      setExpanded: setStocksMenuExpanded,
      isActive: isStocksTab,
      defaultTab: 'stocks-dashboard',
      submenu: [
        { tab: 'stocks-dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
        { tab: 'products', label: 'Produits', icon: ChefHat },
        { tab: 'categories', label: 'Catégories', icon: Layers },
        { tab: 'units', label: 'Unités', icon: Scale },
        { tab: 'suppliers', label: 'Fournisseurs', icon: UsersRound },
        { tab: 'inventory', label: 'Stocks', icon: Package },
        { tab: 'inventories', label: 'Inventaires', icon: ClipboardList },
        { tab: 'movements', label: 'Mouvements', icon: ArrowRight },
        { tab: 'locations', label: 'Sites & emplacements', icon: MapPin },
        { tab: 'audit', label: 'Audit', icon: ShieldCheck },
      ]
    },
    {
      id: 'hr',
      title: 'RH',
      icon: UsersRound,
      installed: hrInstalled,
      expanded: hrMenuExpanded,
      setExpanded: setHrMenuExpanded,
      isActive: isHrTab,
      defaultTab: 'hr-dashboard',
      submenu: [
        { tab: 'hr-dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
        { tab: 'hr-departments', label: 'Services', icon: Building2 },
        ...(hrOnboarding?.servicesCompletedAt ? [{ tab: 'hr-positions' as const, label: 'Postes' as const, icon: BriefcaseBusiness }] : []),
        ...(hrOnboarding?.employeesUnlockedAt ? [
          { tab: 'hr-collaborators' as const, label: 'Collaborateurs' as const, icon: UsersRound },
          { tab: 'hr-rotations' as const, label: 'Roulements' as const, icon: RefreshCw },
          { tab: 'hr-orgchart' as const, label: 'Organigramme' as const, icon: Workflow },
        ] : []),
      ]
    },
    {
      id: 'planning',
      title: 'Planning',
      icon: CalendarCheck,
      installed: planningInstalled,
      expanded: planningMenuExpanded,
      setExpanded: setPlanningMenuExpanded,
      isActive: isPlanningTab,
      defaultTab: 'planning-dashboard',
      submenu: [
        { tab: 'planning-dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { tab: 'planning-planning', label: 'Planning', icon: Calendar },
        { tab: 'planning-settings', label: 'Paramétrage', icon: Settings },
        { tab: 'planning-attendance', label: 'Émargement', icon: FileText },
      ]
    },
    {
      id: 'technical-sheets',
      title: 'Fiches Techniques',
      icon: FileText,
      installed: technicalSheetsInstalled,
      expanded: technicalSheetsMenuExpanded,
      setExpanded: setTechnicalSheetsMenuExpanded,
      isActive: isTechnicalSheetsTab,
      defaultTab: 'technical-sheets-dashboard',
      submenu: [
        { tab: 'technical-sheets-dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
        { tab: 'technical-sheets-recipes', label: 'Fiches techniques', icon: FileText },
        { tab: 'technical-sheets-categories', label: 'Catégories recettes', icon: ClipboardList },
        { tab: 'technical-sheets-costs', label: 'Coûts', icon: Calculator },
        { tab: 'technical-sheets-allergens', label: 'Allergènes', icon: AlertCircle },
        { tab: 'technical-sheets-production', label: 'Production théorique', icon: ChefHat },
      ]
    },
    {
      id: 'production',
      title: 'Production',
      icon: Factory,
      installed: productionInstalled,
      expanded: productionMenuExpanded,
      setExpanded: setProductionMenuExpanded,
      isActive: isProductionTab,
      defaultTab: 'production-dashboard',
      submenu: [
        { tab: 'production-dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
        { tab: 'production-orders', label: 'Ordres de production', icon: ClipboardList },
        { tab: 'production-calendar', label: 'Calendrier', icon: Calendar },
        { tab: 'production-today', label: 'Productions du jour', icon: CalendarDays },
        { tab: 'production-assignments', label: 'Affectations', icon: UsersRound },
        { tab: 'production-materials', label: 'Besoins matières', icon: Package },
        { tab: 'production-exports', label: 'Exports & Documents', icon: Download },
        { tab: 'production-history', label: 'Historique', icon: History },
      ]
    },
    {
      id: 'menus',
      title: 'Menus',
      icon: Utensils,
      installed: menusInstalled,
      expanded: menusMenuExpanded,
      setExpanded: setMenusMenuExpanded,
      isActive: isMenusTab,
      defaultTab: 'menus-dashboard',
      submenu: [
        { tab: 'menus-dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
        { tab: 'menus-list', label: 'Menus', icon: ClipboardList },
        { tab: 'menus-calendar', label: 'Calendrier', icon: Calendar },
        { tab: 'menus-cycles', label: 'Cycles', icon: RefreshCw },
        { tab: 'menus-diets', label: 'Régimes alimentaires', icon: UsersRound },
        { tab: 'menus-guests', label: 'Convives', icon: UsersRound },
        { tab: 'menus-exports', label: 'Exports', icon: Download },
        { tab: 'menus-history', label: 'Historique', icon: History },
      ]
    },
    {
      id: 'rnm-prices',
      title: 'Cours des Produits',
      icon: LineChart,
      installed: rnmInstalled,
      expanded: rnmMenuExpanded,
      setExpanded: setRnmMenuExpanded,
      isActive: isRnmTab,
      defaultTab: 'rnm-dashboard',
      submenu: [
        { tab: 'rnm-dashboard', label: 'Tableau de bord', icon: LineChart },
        { tab: 'rnm-history', label: 'Historique', icon: History },
        { tab: 'rnm-favorites', label: 'Favoris', icon: Heart },
        { tab: 'rnm-about', label: 'À propos', icon: Info },
      ]
    }
  ], [
    stocksInstalled, stocksMenuExpanded, isStocksTab,
    hrInstalled, hrMenuExpanded, isHrTab, hrOnboarding,
    planningInstalled, planningMenuExpanded, isPlanningTab,
    technicalSheetsInstalled, technicalSheetsMenuExpanded, isTechnicalSheetsTab,
    productionInstalled, productionMenuExpanded, isProductionTab,
    menusInstalled, menusMenuExpanded, isMenusTab,
    rnmInstalled, rnmMenuExpanded, isRnmTab
  ]);

  const installedAppsList = useMemo(() => allApps.filter(app => app.installed), [allApps]);

  const filteredInstalledApps = useMemo(() => {
    if (!appSearchQuery.trim()) return installedAppsList;
    return installedAppsList.filter(app =>
      app.title.toLowerCase().includes(appSearchQuery.toLowerCase())
    );
  }, [installedAppsList, appSearchQuery]);

  const favoriteAppsList = useMemo(() => {
    return installedAppsList.filter(app => pinnedApps.includes(app.id));
  }, [installedAppsList, pinnedApps]);

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
  const activeUsersCount = dashboardSummary?.counts.activeUsers ?? users.filter((user) => user.status === 'ACTIVE' || (user as any).isActive === true).length;
  const canWriteHr = isAdmin || ['MANAGER', 'RESPONSABLE'].includes(session.user.role?.toUpperCase());
  const hrActiveCollaboratorsCount = dashboardSummary?.counts.hrCollaborators ?? dashboardSummary?.counts.collaborators ?? hrSummary?.counts?.collaborators ?? hrCollaborators.filter((collaborator) => !isArchived(collaborator)).length;
  const dashboardZones = modularDashboard?.zones;
  const dashboardWidgets = modularDashboard?.widgets ?? [];
  const dashboardRefreshLabel = modularDashboard?.generatedAt ? new Date(modularDashboard.generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';

  const stockValue = useMemo(() => stocks.reduce((sum, stock) => sum + numeric(stock.stockValue ?? stock.value ?? numeric(stock.currentQuantity ?? stock.quantity) * numeric(stock.product.averagePrice ?? stock.product.averagePurchasePrice ?? stock.product.weightedAveragePrice)), 0), [stocks]);
  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const movementsThisMonth = useMemo(() => movements.filter((m) => new Date(m.createdAt) >= monthStart).length, [movements, monthStart]);
  const topConsumed = useMemo(() => Object.values(movements.filter((m) => ['LOSS', 'OUT', 'EXIT', 'PRODUCTION', 'CORRECTION', 'INVENTORY'].includes(m.type)).reduce<Record<string, { name: string; qty: number; unit?: string }>>((acc, m) => {
    const key = m.product.id;
    acc[key] = acc[key] ?? { name: m.product.name, qty: 0, unit: m.product.unit?.symbol };
    acc[key].qty += Math.abs(numeric(m.quantity));
    return acc;
  }, {})).sort((a, b) => b.qty - a.qty).slice(0, 5), [movements]);

  async function persistDashboardPreferences(next: Partial<ModularDashboardPreferences>) {
    const saved = await api.updateDashboardPreferences(token, next);
    setModularDashboard(saved);
    setDashboardTheme((saved.preferences.theme as typeof dashboardTheme) ?? 'emerald');
    setLayoutMode(saved.preferences.layoutMode ?? 'split');
  }

  async function toggleDashboardWidget(widgetId: string, visible: boolean) {
    const currentHidden = modularDashboard?.preferences.hiddenWidgetIds ?? [];
    const hiddenWidgetIds = visible ? currentHidden.filter((id) => id !== widgetId) : Array.from(new Set([...currentHidden, widgetId]));
    await persistDashboardPreferences({ hiddenWidgetIds });
  }

  async function toggleDashboardPin(widgetId: string) {
    const currentPinned = modularDashboard?.preferences.pinnedWidgetIds ?? [];
    const pinnedWidgetIds = currentPinned.includes(widgetId) ? currentPinned.filter((id) => id !== widgetId) : [...currentPinned, widgetId];
    await persistDashboardPreferences({ pinnedWidgetIds });
  }

  async function resetDashboardCore() {
    const saved = await api.resetDashboardPreferences(token);
    setModularDashboard(saved);
    setDashboardTheme((saved.preferences.theme as typeof dashboardTheme) ?? 'emerald');
    setLayoutMode(saved.preferences.layoutMode ?? 'split');
    setSuccess('Dashboard réinitialisé sur la configuration Core. Les modules installés et leurs données sont conservés.');
  }

  async function refreshUsers() {
    const [usersResult, rolesResult, devConfig] = await Promise.all([
      api.users(token),
      api.roles(token).catch(() => roles),
      api.devSwitchConfig(token).catch(() => ({ enabled: devSwitchEnabled })),
    ]);
    if (Array.isArray(usersResult)) {
      setUsers(usersResult);
    } else {
      setUsers(usersResult.users ?? []);
      if (usersResult.roles) setRoles(usersResult.roles);
      if (usersResult.permissions) setPermissions(usersResult.permissions);
    }
    if (Array.isArray(rolesResult)) setRoles(rolesResult);
    else {
      setRoles(rolesResult.roles ?? []);
      if (rolesResult.permissions) setPermissions(rolesResult.permissions);
    }
    setDevSwitchEnabled(Boolean(devConfig.enabled));
  }

  async function handleCreateUser(payload: { firstName: string; lastName: string; email: string; role: string; temporaryPassword: string }) {
    await submit(() => api.createUser(token, payload), 'Utilisateur créé. Le mot de passe temporaire ne sera plus affiché.');
    setShowUserModal(false);
    await refreshUsers();
  }

  async function handleUpdateUser(id: string, payload: { firstName?: string; lastName?: string; email?: string; role?: string; status?: string }) {
    await submit(() => api.updateUser(token, id, payload), 'Utilisateur mis à jour.');
    setEditingUser(null);
    await refreshUsers();
  }

  async function handleDisableUser(user: CoreUser) {
    if (!window.confirm(`Désactiver ${displayUserName(user)} ? Le compte restera visible pour l’historique.`)) return;
    await submit(() => api.disableUser(token, user.id), 'Utilisateur désactivé.');
    await refreshUsers();
  }

  async function handleUpdateRolePermissions(roleKey: string, nextPermissions: string[]) {
    await submit(() => api.updateRolePermissions(token, roleKey, nextPermissions), 'Permissions du rôle mises à jour.');
    await refreshUsers();
  }

  async function handleDevSwitch(userId: string) {
    const nextSession = await api.devSwitch(token, userId);
    onSessionSwitch?.(nextSession);
  }

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

  async function uninstallRnmPrices() {
    setAppActionLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const summary = await api.uninstallRnmPrices(token);
      setDashboardSummary((prev) => ({ ...prev, ...summary } as DashboardSummary));
      setInstalledApps(summary.installedApplications ?? installedApps.filter((app) => app !== 'rnm-prices'));
      if (isRnmTab) setActiveTab('applications');
      setSuccess('L’application Cours des Produits a été retirée de l’interface. Vos favoris RNM sont conservés.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression de Cours des Produits impossible.');
    } finally {
      setAppActionLoading(false);
      setConfirmation(null);
    }
  }

  async function uninstallPlanning() {
    setAppActionLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const summary = await api.uninstallPlanning(token);
      setDashboardSummary((prev) => ({ ...prev, ...summary } as DashboardSummary));
      setInstalledApps(summary.installedApplications ?? installedApps.filter((app) => app !== 'planning'));
      if (isPlanningTab) setActiveTab('applications');
      setSuccess('L’application Planning a été retirée de l’interface. Les plannings et historiques existants sont conservés.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression de Planning impossible.');
    } finally {
      setAppActionLoading(false);
      setConfirmation(null);
    }
  }

  async function uninstallTechnicalSheets() {
    setAppActionLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const summary = await api.uninstallTechnicalSheets(token);
      setDashboardSummary((prev) => ({ ...prev, ...summary } as DashboardSummary));
      setInstalledApps(summary.installedApplications ?? installedApps.filter((app) => app !== 'technical-sheets'));
      if (isTechnicalSheetsTab) setActiveTab('applications');
      setSuccess('L’application Fiches Techniques a été retirée de l’interface. Les fiches, historiques, coûts et simulations sont conservés.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression de Fiches Techniques impossible.');
    } finally {
      setAppActionLoading(false);
      setConfirmation(null);
    }
  }

  async function uninstallProduction() {
    setAppActionLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const summary = await api.uninstallProduction(token);
      setDashboardSummary((prev) => ({ ...prev, ...summary } as DashboardSummary));
      setInstalledApps(summary.installedApplications ?? installedApps.filter((app) => app !== 'production'));
      if (isProductionTab) setActiveTab('applications');
      setSuccess('L’application Production a été retirée de l’interface. Les ordres et historiques existants sont conservés.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression de Production impossible.');
    } finally {
      setAppActionLoading(false);
      setConfirmation(null);
    }
  }

  async function uninstallMenus() {
    setAppActionLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const summary = await api.uninstallMenus(token);
      setDashboardSummary((prev) => ({ ...prev, ...summary } as DashboardSummary));
      setInstalledApps(summary.installedApplications ?? installedApps.filter((app) => app !== 'menus'));
      if (isMenusTab) setActiveTab('applications');
      setSuccess('L’application Menus a été retirée de l’interface. Les menus, cycles, convives, exports et historiques sont conservés.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression de Menus impossible.');
    } finally {
      setAppActionLoading(false);
      setConfirmation(null);
    }
  }

  async function triggerInstallApp(appId: string) {
    if (!['stocks', 'rnm-prices', 'hr', 'planning', 'technical-sheets', 'production', 'menus'].includes(appId)) return;
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
        if (appId === 'technical-sheets' && !stocksInstalled) throw new Error('Installez Stocks avant Fiches Techniques.');
        if (appId === 'planning' && planningPrerequisiteMessage) throw new Error(planningPrerequisiteMessage);
        if (appId === 'production' && (!stocksInstalled || !technicalSheetsInstalled)) throw new Error('Installez Stocks et Fiches Techniques avant Production. RH et Planning restent optionnels.');
        if (appId === 'menus' && (!technicalSheetsInstalled || !productionInstalled)) throw new Error('Installez Fiches Techniques et Production avant Menus. Menus ne fonctionne pas en mode autonome.');
        const summary = appId === 'rnm-prices' ? await api.installRnmPrices(token) : appId === 'hr' ? await api.installHr(token) : appId === 'planning' ? await api.installPlanning(token) : appId === 'technical-sheets' ? await api.installTechnicalSheets(token) : appId === 'production' ? await api.installProduction(token) : appId === 'menus' ? await api.installMenus(token) : await api.installStocks(token);
        setDashboardSummary((prev) => ({ ...prev, ...summary } as DashboardSummary));
        setInstalledApps(summary.installedApplications ?? Array.from(new Set([...installedApps, appId])));
        setSuccess(appId === 'rnm-prices' ? 'L’application Cours des Produits a été installée. La navigation RNM est maintenant visible.' : appId === 'hr' ? 'L’application RH a été installée. Services et postes de départ sont disponibles.' : appId === 'planning' ? 'L’application Planning a été installée. Les vues opérationnelles consomment désormais le référentiel RH.' : appId === 'technical-sheets' ? 'L’application Fiches Techniques a été installée. Catégories recettes et allergènes standards sont disponibles.' : appId === 'production' ? 'L’application Production a été installée. Les ordres peuvent être créés depuis les fiches techniques sans dupliquer les référentiels.' : appId === 'menus' ? 'L’application Menus a été installée. Planification, cycles, convives et génération Production sont disponibles.' : 'L’application Stocks a été installée avec succès. Lancez l’assistant de préremplissage pour ajouter catégories, unités et emplacements métier.');
        if (appId === 'stocks') setShowPrefillWizard(true);
        if (appId === 'rnm-prices') setActiveTab('rnm-dashboard');
        if (appId === 'hr') setActiveTab('hr-dashboard');
        if (appId === 'planning') setActiveTab('planning-dashboard');
        if (appId === 'technical-sheets') setActiveTab('technical-sheets-dashboard');
        if (appId === 'production') setActiveTab('production-dashboard');
        if (appId === 'menus') setActiveTab('menus-dashboard');
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
      const result = await handler();
      setSuccess(message);
      await refresh();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'enregistrement.');
      throw err;
    }
  }

  // Submit wrappers
  async function refreshHr() {
    const data = await api.hrBootstrap(token);
    setHrSummary(data.summary);
    setHrCollaborators(data.collaborators ?? []);
    setHrDepartments(data.departments ?? []);
    setHrPositions(data.positions ?? []);
    setHrRotations(data.rotations ?? []);
    setHrOnboarding(data.onboarding);
  }

  async function handleCreateHrCollaborator(payload: HrCollaboratorPayload) {
    const collaborator = await submit(() => api.createHrCollaborator(token, payload), 'Collaborateur RH créé.') as HrCollaborator;
    await refreshHr();
    return collaborator;
  }

  async function handleUpdateHrCollaborator(id: string, payload: Partial<HrCollaboratorPayload>) {
    const collaborator = await submit(() => api.updateHrCollaborator(token, id, payload), 'Collaborateur RH mis à jour.') as HrCollaborator;
    await refreshHr();
    return collaborator;
  }

  async function handleUploadHrCollaboratorDocument(employeeId: string, payload: { file: File; category: string; notes?: string; expiresAt?: string }) {
    await submit(() => api.uploadHrCollaboratorDocument(token, employeeId, payload), 'Document RH enregistré.');
    await refreshHr();
  }

  async function handleDeleteHrCollaboratorDocument(employeeId: string, documentId: string) {
    if (!window.confirm('Supprimer ce document RH ?')) return;
    await submit(() => api.deleteHrCollaboratorDocument(token, employeeId, documentId), 'Document RH supprimé.');
    await refreshHr();
  }

  async function handleReplaceHrCollaboratorDocument(employeeId: string, documentId: string, file: File) {
    const document = await submit(() => api.replaceHrCollaboratorDocument(token, employeeId, documentId, file), 'Document RH remplacé.') as HrDocument;
    await refreshHr();
    return document;
  }

  async function handleViewHrCollaboratorDocument(employeeId: string, document: HrDocument) {
    await api.viewHrCollaboratorDocument(token, employeeId, document);
  }

  async function handleDownloadHrCollaboratorDocument(employeeId: string, document: HrDocument) {
    await api.downloadHrCollaboratorDocument(token, employeeId, document);
  }

  async function handleArchiveHrCollaborator(id: string) {
    if (!window.confirm('Archiver ce collaborateur ? Son historique et ses relations seront conservés.')) return;
    await submit(() => api.archiveHrCollaborator(token, id), 'Collaborateur RH archivé.');
    await refreshHr();
  }

  async function handleCreateHrDepartment(payload: HrReferencePayload) {
    await submit(() => api.createHrDepartment(token, payload), 'Service RH créé.');
    await refreshHr();
  }

  async function handleCreateHrDepartmentsBulk(names: string[]) {
    const result = await submit(() => api.createHrDepartmentsBulk(token, names), `${names.length} services sélectionnés.`);
    const created = typeof (result as any)?.created === 'number' ? (result as any).created : names.length;
    const skipped = typeof (result as any)?.skipped === 'number' ? (result as any).skipped : 0;
    setSuccess(`${created} service${created > 1 ? 's' : ''} créé${created > 1 ? 's' : ''}${skipped ? `, ${skipped} déjà présent${skipped > 1 ? 's' : ''}` : ''}.`);
    await refreshHr();
  }

  async function handleCompleteHrServices(names?: string[]) {
    await submit(() => api.completeHrServices(token, names ?? []), 'Étape Services validée.');
    await refreshHr();
  }

  async function handleCompleteHrPositions() {
    await submit(() => api.completeHrPositions(token), 'Étape Postes validée.');
    await refreshHr();
  }

  async function handleUnlockHrEmployees() {
    await submit(() => api.unlockHrEmployees(token), 'Collaborateurs débloqués.');
    await refreshHr();
  }

  async function handleUpdateHrDepartment(id: string, payload: HrReferencePayload) {
    await submit(() => api.updateHrDepartment(token, id, payload), 'Service RH mis à jour.');
    await refreshHr();
  }

  async function handleArchiveHrDepartment(id: string) {
    await submit(() => api.archiveHrDepartment(token, id), 'Service RH archivé.');
    await refreshHr();
  }

  async function handleCreateHrPosition(payload: HrReferencePayload) {
    await submit(() => api.createHrPosition(token, payload), 'Poste RH créé.');
    await refreshHr();
  }

  async function handleCreateHrPositionsBulk(items: HrReferencePayload[]) {
    const result = await submit(() => api.createHrPositionsBulk(token, items), `${items.length} postes sélectionnés.`);
    const created = typeof (result as any)?.created === 'number' ? (result as any).created : items.length;
    const skipped = typeof (result as any)?.skipped === 'number' ? (result as any).skipped : 0;
    setSuccess(`${created} poste${created > 1 ? 's' : ''} créé${created > 1 ? 's' : ''}${skipped ? `, ${skipped} déjà présent${skipped > 1 ? 's' : ''}` : ''}.`);
    await refreshHr();
  }

  async function handleUpdateHrPosition(id: string, payload: HrReferencePayload) {
    await submit(() => api.updateHrPosition(token, id, payload), 'Poste RH mis à jour.');
    await refreshHr();
  }

  async function handleArchiveHrPosition(id: string) {
    await submit(() => api.archiveHrPosition(token, id), 'Poste RH archivé.');
    await refreshHr();
  }

  async function handleCreateHrRotation(payload: HrRotationPayload) {
    await submit(() => api.createHrRotation(token, payload), 'Roulement créé.');
    await refreshHr();
  }

  async function handleUpdateHrRotation(id: string, payload: Partial<HrRotationPayload>) {
    await submit(() => api.updateHrRotation(token, id, payload), 'Roulement mis à jour.');
    await refreshHr();
  }

  async function handleArchiveHrRotation(id: string) {
    if (!window.confirm('Archiver ce roulement ? Les assignations historiques seront conservées.')) return;
    await submit(() => api.archiveHrRotation(token, id), 'Roulement archivé.');
    await refreshHr();
  }

  async function handleAssignHrRotation(rotationId: string, employeeId: string, startDate?: string) {
    await submit(() => api.assignHrRotation(token, rotationId, { employeeId, startDate }), 'Collaborateur assigné au roulement.');
    await refreshHr();
  }

  async function handleRemoveHrRotationAssignment(rotationId: string, employeeId: string) {
    await submit(() => api.removeHrRotationAssignment(token, rotationId, employeeId), 'Collaborateur retiré du roulement.');
    await refreshHr();
  }

  async function handleSetHrCollaboratorRotation(employeeId: string, rotationId: string, startDate?: string) {
    await submit(() => api.setHrCollaboratorRotation(token, employeeId, { rotationId, startDate }), 'Roulement du collaborateur modifié.');
    await refreshHr();
  }

  async function handleRemoveHrCollaboratorRotation(employeeId: string) {
    await submit(() => api.removeHrCollaboratorRotation(token, employeeId), 'Roulement actif retiré.');
    await refreshHr();
  }

  async function handleCreateCategory(payload: { name: string; description?: string }) {
    await submit(() => api.createCategory(token, payload), 'Catégorie créée avec succès.');
    setShowCategoryModal(false);
  }

  async function handleCreateUnit(payload: { name: string; symbol: string; type?: string; baseFactor?: number }) {
    await submit(() => api.createUnit(token, payload), 'Unité créée avec succès.');
    setShowUnitModal(false);
  }

  async function handleCreateProduct(payload: ProductFormPayload) {
    await submit(() => api.createProduct(token, payload), 'Produit créé avec succès.');
    setProductPrefillName('');
    setShowProductModal(false);
  }

  async function handleUpdateProduct(productId: string, payload: ProductFormPayload) {
    await submit(() => api.updateProduct(token, productId, payload), 'Fiche produit mise à jour.');
  }

  async function handleCreateSupplier(payload: { name: string; contactName?: string; email?: string; phone?: string }) {
    await submit(() => api.createSupplier(token, payload), 'Fournisseur créé avec succès.');
    setSupplierPrefillName('');
    setShowSupplierModal(false);
  }

  async function handleCreateMovement(payload: { productId: string; supplierId?: string; type: StockMovementType; quantity: number; reason?: string; unitId?: string; lotId?: string; sourceSiteId?: string; sourceLocationId?: string; destinationSiteId?: string; destinationLocationId?: string; date?: string }) {
    await submit(() => api.createMovement(token, payload), 'Mouvement de stock enregistré.');
    setShowMovementModal(false);
  }

  async function handleUploadStocksOcr(files: File[]) {
    setError(undefined);
    setSuccess(undefined);
    const config = await api.stocksOcrConfig(token);
    if (!config.configured) {
      setShowOcrImportModal(false);
      setApiKeysPanelHint(true);
      setActiveTab('organization-general');
      setError('Ajoutez une clé API Mistral dans Organisation > Général > Clés API avant de lancer un import OCR Stocks.');
      return;
    }
    const uploaded = await api.uploadStocksOcrDocuments(token, files);
    const initialStatuses = uploaded.documents.map((document) => ({ document, ocr: null, extraction: null, state: 'upload' }));
    setOcrStatuses(initialStatuses);
    await api.analyzeStocksOcrBatch(token, uploaded.documents.map((document) => document.id));
    const refreshed = await Promise.all(uploaded.documents.map((document) => api.stocksOcrStatus(token, document.id).catch(() => ({ document, ocr: null, extraction: null, state: 'en attente' }))));
    setOcrStatuses(refreshed);
    setOcrPollingActive(true);
    setSuccess(`${uploaded.documents.length} document${uploaded.documents.length > 1 ? 's' : ''} envoyé${uploaded.documents.length > 1 ? 's' : ''} en analyse.`);
  }

  async function handleOpenOcrExtraction(extractionId: string) {
    const extraction = await api.stocksOcrExtraction(token, extractionId);
    setSelectedOcrExtraction(extraction);
    setShowOcrReviewModal(true);
  }

  async function handleSaveOcrDraft(payload: StocksOcrExtraction['data']) {
    if (!selectedOcrExtraction) return;
    const saved = await api.saveStocksOcrCorrections(token, selectedOcrExtraction.id, payload);
    setSelectedOcrExtraction(saved);
    setSuccess('Brouillon OCR enregistré.');
  }

  async function handleCreateOcrReception(payload: StocksOcrExtraction['data']) {
    if (!selectedOcrExtraction) return;
    await submit(() => api.createStockReceptionFromOcr(token, selectedOcrExtraction.id, payload), 'La réception a été créée.');
    setShowOcrReviewModal(false);
    setShowOcrImportModal(false);
    setSelectedOcrExtraction(null);
  }

  async function handleCreateOcrProductFromLine(line: StocksOcrLine, supplierId?: string | null) {
    const name = ocrProductName(line);
    if (!name) throw new Error('Nom produit OCR manquant.');
    const reference = ocrProductReference(line);
    const unitId = resolveOcrUnitId(units, line.unitId, line.unit);
    if (!unitId) throw new Error(`Unité OCR "${line.unit || 'non renseignée'}" introuvable. Sélectionnez une unité sur la ligne ou ajoutez-la au référentiel.`);
    const quantity = numeric(line.quantity);
    const lineTotal = numeric(line.lineTotal ?? line.total);
    const unitPrice = roundOcrPrice(lineTotal > 0 && quantity > 0 ? lineTotal / quantity : numeric(line.unitPrice));
    const categoryId = await resolveOcrCategoryIdForCreate(token, line, categories, products, supplierId);
    const existing = products.find((product) => (reference && product.sku === reference) || normalizeLookup(product.name) === normalizeLookup(name));
    if (existing) {
      const shouldUpdatePrice = Boolean(unitPrice && numeric(existing.averagePrice ?? existing.averagePurchasePrice ?? existing.weightedAveragePrice) <= 0);
      const shouldUpdateCategory = Boolean(categoryId && !(existing.categoryId ?? existing.category?.id));
      if (shouldUpdatePrice || shouldUpdateCategory) {
        return await submit(
          () => api.updateProduct(token, existing.id, {
            name: existing.name,
            sku: existing.sku ?? undefined,
            unitId: existing.unitId || unitId,
            categoryId: existing.categoryId ?? existing.category?.id ?? categoryId,
            primarySupplierId: existing.primarySupplierId ?? existing.supplierId ?? supplierId ?? undefined,
            averagePrice: shouldUpdatePrice ? unitPrice : numeric(existing.averagePrice ?? existing.averagePurchasePrice ?? existing.weightedAveragePrice),
          }),
          shouldUpdatePrice ? 'Prix produit mis à jour depuis l’OCR.' : 'Catégorie produit mise à jour depuis l’OCR.',
        ) as Product;
      }
      return existing;
    }
    return await submit(
      () => api.createProduct(token, { name, sku: reference || undefined, unitId, categoryId, primarySupplierId: supplierId || undefined, averagePrice: unitPrice }),
      'Produit créé depuis l’OCR.',
    ) as Product;
  }

  async function handleCreateOcrSupplier(name: string) {
    const supplierName = name.trim();
    if (!supplierName) throw new Error('Nom fournisseur OCR manquant.');
    const existing = suppliers.find((supplier) => normalizeLookup(supplier.name) === normalizeLookup(supplierName));
    if (existing) return existing;
    return await submit(() => api.createSupplier(token, { name: supplierName }), 'Fournisseur créé depuis l’OCR.') as Supplier;
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
    const search = productSearch.toLowerCase();
    return activeProducts.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search) || 
             (p.sku && p.sku.toLowerCase().includes(search)) ||
             (p.reference && p.reference.toLowerCase().includes(search)) ||
             (p.category?.name && p.category.name.toLowerCase().includes(search)) ||
             (p.primarySupplier?.name && p.primarySupplier.name.toLowerCase().includes(search)) ||
             (p.supplier?.name && p.supplier.name.toLowerCase().includes(search));
      const matchesCategory = !productCategoryFilter || (p.categoryId ?? p.category?.id) === productCategoryFilter;
      const matchesSupplier = !productSupplierFilter || productSupplierId(p) === productSupplierFilter;
      return matchesSearch && matchesCategory && matchesSupplier;
    });
  }, [activeProducts, productSearch, productCategoryFilter, productSupplierFilter]);

  const selectedProduct = useMemo(() => selectedProductId ? products.find((product) => product.id === selectedProductId) ?? null : null, [products, selectedProductId]);

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
    'organization-general': 'Organisation',
    users: 'Utilisateurs',
    architecture: 'Architecture',
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
    'rnm-dashboard': 'Cours des Produits',
    'rnm-history': 'Historique RNM',
    'rnm-favorites': 'Favoris RNM',
    'rnm-about': 'À propos',
    'hr-dashboard': 'RH',
    'hr-collaborators': 'Collaborateurs',
    'hr-departments': 'Services RH',
    'hr-positions': 'Postes RH',
    'hr-rotations': 'Roulements',
    'hr-orgchart': 'Organigramme',
    'planning-dashboard': 'Planning',
    'planning-planning': 'Planning mensuel',
    'planning-settings': 'Paramétrage Planning',
    'planning-attendance': 'Émargement Planning',
    'planning-day': 'Planning journalier',
    'planning-week': 'Planning hebdomadaire',
    'planning-month': 'Planning mensuel',
    'planning-assignments': 'Affectations',
    'planning-absences': 'Absences',
    'planning-replacements': 'Remplacements',
    'planning-templates': 'Modèles',
    'planning-requirements': 'Besoins opérationnels',
    'technical-sheets-dashboard': 'Fiches Techniques',
    'technical-sheets-recipes': 'Fiches techniques',
    'technical-sheets-categories': 'Catégories recettes',
    'technical-sheets-costs': 'Coûts fiches techniques',
    'technical-sheets-allergens': 'Allergènes',
    'technical-sheets-production': 'Production théorique',
    'production-dashboard': 'Production',
    'production-orders': 'Ordres de production',
    'production-calendar': 'Calendrier Production',
    'production-today': 'Productions du jour',
    'production-assignments': 'Affectations Production',
    'production-materials': 'Besoins matières',
    'production-exports': 'Exports & Documents',
    'production-history': 'Historique Production',
    'menus-dashboard': 'Menus',
    'menus-list': 'Menus planifiés',
    'menus-calendar': 'Calendrier Menus',
    'menus-cycles': 'Cycles Menus',
    'menus-diets': 'Régimes alimentaires',
    'menus-guests': 'Convives Menus',
    'menus-exports': 'Exports Menus',
    'menus-history': 'Historique Menus',
  }[activeTab];

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
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
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''} ${sidebarCollapsed ? 'desktop-hidden' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <ChefHat />
          </div>
          <span className="sidebar-title">TOQUE<span>HUB</span></span>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="Masquer le menu latéral"
            title="Masquer le menu"
          >
            <ChevronLeft size={18} color="#ffffff" strokeWidth={2.4} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div
            className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => goToTab('overview')}
          >
            <LayoutDashboard />
            Dashboard
          </div>

          <div className="sidebar-section-title">Organisation</div>
          <div
            className={`sidebar-item ${activeTab === 'organization-general' ? 'active' : ''}`}
            onClick={() => goToTab('organization-general')}
          >
            <Settings />
            Général
          </div>
          {isAdmin ? (
            <div
              className={`sidebar-item ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => goToTab('users')}
            >
              <UsersRound />
              Utilisateurs
            </div>
          ) : null}
          <div
            className={`sidebar-item ${activeTab === 'applications' ? 'active' : ''}`}
            onClick={() => goToTab('applications')}
          >
            <ShoppingBag />
            Applications
          </div>
          <div className="sidebar-item-locked">
            <div className="locked-left"><ShieldCheck /> Audit</div>
            <span className="sidebar-badge-soon">Futur</span>
          </div>

          {isAdmin ? (
            <>
              <div className="sidebar-section-title">Administration</div>
              <div
                className={`sidebar-item ${activeTab === 'architecture' ? 'active' : ''}`}
                onClick={() => goToTab('architecture')}
              >
                <Workflow />
                Architecture
              </div>
            </>
          ) : null}

          {/* Applications list divider / search */}
          <div className="sidebar-section-title-row">
            <div className="sidebar-section-title" style={{ margin: 0 }}>Applications installées</div>
            <button
              className={`sidebar-search-toggle-btn ${showAppSearch || appSearchQuery ? 'active' : ''}`}
              onClick={() => {
                setShowAppSearch(!showAppSearch);
                if (showAppSearch) {
                  setAppSearchQuery('');
                }
              }}
              title="Rechercher une application"
            >
              <Search size={13} />
            </button>
          </div>
          
          <AnimatePresence>
            {(showAppSearch || appSearchQuery) && (
              <motion.div
                className="sidebar-search"
                initial={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 4, marginBottom: 8 }}
                exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                transition={{ duration: 0.15 }}
                style={{ overflow: 'hidden' }}
              >
                <input
                  type="text"
                  placeholder="Rechercher…"
                  value={appSearchQuery}
                  onChange={(e) => setAppSearchQuery(e.target.value)}
                  className="sidebar-search-input"
                  autoFocus
                />
                {appSearchQuery && (
                  <button className="search-clear-btn" onClick={() => setAppSearchQuery('')}>
                    <X size={12} />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>



          {/* Dynamic Installed Apps */}
          <div className="sidebar-group-installed">
            {filteredInstalledApps.length > 0 ? (
              filteredInstalledApps.map((app) => {
                const IconComponent = app.icon;
                return (
                  <div key={app.id} className="sidebar-app-group">
                    <div
                      className={`sidebar-item ${app.isActive ? 'active' : ''}`}
                      onClick={() => {
                        app.setExpanded(!app.expanded);
                        if (!app.isActive) {
                          goToTab(app.defaultTab as ActiveTab);
                        }
                      }}
                    >
                      <IconComponent />
                      <span>{app.title}</span>
                      


                      {app.expanded ? <ChevronDown size={14} className="expand-indicator" /> : <ChevronRight size={14} className="expand-indicator" />}
                    </div>
                    {app.expanded && (
                      <div className="sidebar-submenu">
                        {app.submenu.map((sub) => {
                          const SubIcon = sub.icon;
                          return (
                            <div
                              key={`sub-${app.id}-${sub.tab}`}
                              className={`sidebar-item ${activeTab === sub.tab ? 'active' : ''}`}
                              onClick={() => goToTab(sub.tab as ActiveTab)}
                            >
                              <SubIcon />
                              {sub.label}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="sidebar-no-apps">
                {appSearchQuery ? 'Aucune application trouvée' : 'Aucune application installée'}
              </div>
            )}
          </div>
        </nav>

        {/* User Profile and Dropdown */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-profile-container">
            <AnimatePresence>
              {profileMenuOpen && (
                <motion.div
                  className="profile-dropdown-menu"
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  {profileDropdownMode === 'main' ? (
                    <div className="profile-dropdown-inner">
                      <div className="dropdown-user-header">
                        <div className="dropdown-avatar">{userInitials}</div>
                        <div className="dropdown-user-details">
                          <span className="dropdown-user-name">{userFullName}</span>
                          <span className="dropdown-user-org">{organizationName}</span>
                        </div>
                      </div>
                      
                      <div className="dropdown-divider" />
                      
                      <button className="dropdown-item" onClick={() => { goToTab('organization-general'); setProfileMenuOpen(false); }}>
                        <UserRound size={14} />
                        <span>Mon profil</span>
                      </button>

                      {devSwitchEnabled && isAdmin && (
                        <button className="dropdown-item" onClick={() => setProfileDropdownMode('users')}>
                          <RefreshCw size={14} />
                          <span>Changer d'utilisateur</span>
                          <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                        </button>
                      )}

                      <button className="dropdown-item" onClick={() => { goToTab('organization-general'); setProfileMenuOpen(false); }}>
                        <Settings size={14} />
                        <span>Paramètres</span>
                      </button>

                      <div className="dropdown-divider" />

                      <button className="dropdown-item text-danger" onClick={() => { onLogout(); setProfileMenuOpen(false); }}>
                        <LogOut size={14} />
                        <span>Déconnexion</span>
                      </button>
                    </div>
                  ) : (
                    <div className="profile-dropdown-inner">
                      <div className="dropdown-submenu-header">
                        <button className="back-btn" onClick={() => setProfileDropdownMode('main')}>
                          <ChevronLeft size={14} />
                        </button>
                        <span>Changer d'utilisateur</span>
                      </div>
                      
                      <div className="dropdown-divider" />
                      
                      <div className="dropdown-users-list">
                        {users.map((user) => (
                          <button
                            key={user.id}
                            className={`dropdown-user-item ${user.id === session.user.id ? 'active' : ''}`}
                            onClick={() => {
                              if (user.id !== session.user.id && user.status !== 'DISABLED') {
                                void handleDevSwitch(user.id);
                                setProfileMenuOpen(false);
                                setProfileDropdownMode('main');
                              }
                            }}
                            disabled={user.status === 'DISABLED'}
                          >
                            <div className="user-item-avatar">
                              {((user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')).toUpperCase() || 'U'}
                            </div>
                            <div className="user-item-info">
                              <span className="user-item-name">{displayUserName(user)}</span>
                              <span className="user-item-role">{roleLabel(user.role)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div
              className={`sidebar-user-profile ${profileMenuOpen ? 'active' : ''}`}
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            >
              <div className="sidebar-avatar">
                {userInitials}
              </div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{userFullName}</span>
                <span className="sidebar-user-org">{organizationName}</span>
              </div>
              <ChevronDown size={14} className="profile-chevron" style={{ transform: profileMenuOpen ? 'rotate(180deg)' : 'none' }} />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        <header className="topbar-modern">
          <div className="topbar-left">
            {sidebarCollapsed && (
              <button
                type="button"
                className="sidebar-reopen-btn"
                onClick={() => setSidebarCollapsed(false)}
                aria-label="Afficher le menu latéral"
                title="Afficher le menu"
              >
                <ChevronRight size={18} color="#111827" strokeWidth={2.4} />
              </button>
            )}
            <h2 className="topbar-title">{tabTitle}</h2>
          </div>
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
            <div className="alert-modern success dismissible">
              <CheckCircle2 />
              <div>
                <strong>Succès : </strong> {success}
              </div>
              <button
                type="button"
                className="alert-dismiss"
                onClick={() => setSuccess(undefined)}
                aria-label="Fermer la notification de succès"
              >
                <X size={16} />
              </button>
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
                  {dashboardZones ? (
                    <ModularDashboardOverview
                      zones={dashboardZones}
                      theme={dashboardTheme}
                      firstName={firstName}
                      organizationName={organizationName}
                      refreshLabel={dashboardRefreshLabel}
                      onNavigate={goToTab}
                      onTogglePin={toggleDashboardPin}
                    />
                  ) : (
                    <>
                      <div className={`welcome-hero theme-${dashboardTheme}`}>
                        <h1 className="welcome-title">Bonjour {firstName} 👋</h1>
                        <p className="welcome-desc">
                          Bienvenue dans l'espace de gestion de <strong>{organizationName}</strong>. Votre ERP de cuisine open source local et souverain est entièrement fonctionnel.
                        </p>
                      </div>

                      {visibleWidgets.metrics && (
                        <div className="metrics-grid" style={{ marginTop: '1.5rem' }}>
                          {stocksInstalled ? (
                            <>
                              <Metric icon={<ChefHat size={20} />} value={products.filter(p => !isArchived(p)).length} label="Produits actifs" tone="orange" delay={1} />
                              <Metric icon={<UsersRound size={20} />} value={suppliers.filter(s => !isArchived(s)).length} label="Fournisseurs actifs" tone="blue" delay={2} />
                              <Metric icon={<TrendingUp size={20} />} value={`${stockValue.toFixed(2)} €`} label="Valeur théorique" tone="emerald" delay={3} />
                              <Metric icon={<History size={20} />} value={movementsThisMonth} label="Mouvements du mois" tone="purple" delay={4} />
                            </>
                          ) : (
                            <>
                              <Metric icon={<Boxes size={20} />} value={installedApps.length} label="Applications" tone="orange" delay={1} />
                              <Metric icon={<UsersRound size={20} />} value={hrActiveCollaboratorsCount} label="Collaborateurs" tone="blue" delay={2} />
                              <Metric icon={<ShieldCheck size={20} />} value={activeUsersCount} label="Utilisateurs" tone="emerald" delay={3} />
                              <Metric icon={<Clock size={20} />} value={`${progress}%`} label="Paramétrage" tone="purple" delay={4} />
                            </>
                          )}
                        </div>
                      )}

                      <div className="dashboard-widget-grid" style={{ marginTop: '1.5rem' }}>
                        {stocksInstalled && (
                          <>
                            <div className="card-modern dashboard-widget-card">
                              <div className="card-title-container">
                                <span className="card-title"><History size={18}/> Derniers mouvements</span>
                                <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('inventory')}>Détails</button>
                              </div>
                              <MiniMovements movements={movements.slice(0, 6)} />
                            </div>

                            <div className="card-modern dashboard-widget-card">
                              <span className="card-title"><TrendingUp size={18}/> Produits consommés</span>
                              <div className="progress-list" style={{ marginTop: '1rem' }}>
                                {topConsumed.length ? (
                                  topConsumed.map((p) => (
                                    <div className="progress-item-modern" key={p.name}>
                                      <span className="progress-text-modern">{p.name}</span>
                                      <span className="progress-val-modern">{p.qty.toFixed(2)} {p.unit}</span>
                                    </div>
                                  ))
                                ) : (
                                  <EmptyMini title="Aucune consommation" text="Les mouvements de sortie alimenteront ce classement." icon="📈" />
                                )}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Production Widget */}
                        <div className="card-modern dashboard-widget-card">
                          <span className="card-title"><Factory size={18} /> Production</span>
                          {productionInstalled ? (
                            <div className="installed-app-summary">
                              <div className="metric-icon-wrapper orange"><Factory /></div>
                              <div>
                                <strong style={{ fontSize: '1.7rem' }}>0</strong>
                                <p className="muted">productions aujourd'hui · portions prévues et retards.</p>
                              </div>
                            </div>
                          ) : (
                            <EmptyMini title="Production" text="Installez le module Production pour planifier vos ordres de fabrication." icon="🚧" />
                          )}
                          <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => goToTab(productionInstalled ? 'production-dashboard' : 'applications')}>
                            {productionInstalled ? 'Ouvrir' : 'Installer'} <ArrowRight size={16} />
                          </button>
                        </div>

                        {/* Menus Widget */}
                        <div className="card-modern dashboard-widget-card">
                          <span className="card-title"><Utensils size={18} /> Menus</span>
                          {menusInstalled ? (
                            <div className="installed-app-summary">
                              <div className="metric-icon-wrapper purple"><Utensils /></div>
                              <div>
                                <strong style={{ fontSize: '1.7rem' }}>0</strong>
                                <p className="muted">menus aujourd’hui · convives et coût moyen.</p>
                              </div>
                            </div>
                          ) : (
                            <EmptyMini title="Menus" text="Installez le module Menus pour planifier les repas et convives." icon="🚧" />
                          )}
                          <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => goToTab(menusInstalled ? 'menus-dashboard' : 'applications')}>
                            {menusInstalled ? 'Ouvrir' : 'Installer'} <ArrowRight size={16} />
                          </button>
                        </div>

                        {/* Collaborateurs Widget */}
                        <div className="card-modern dashboard-widget-card">
                          <span className="card-title"><UsersRound size={18} /> Collaborateurs</span>
                          <div className="installed-app-summary">
                            <div className={`metric-icon-wrapper ${hrInstalled ? 'purple' : 'gray'}`}><UsersRound /></div>
                            <div>
                              <strong style={{ fontSize: '1.7rem' }}>{hrActiveCollaboratorsCount}</strong>
                              <p className="muted">{hrInstalled ? 'collaborateurs actifs dans le référentiel RH.' : 'Installez RH pour centraliser vos collaborateurs.'}</p>
                            </div>
                          </div>
                          <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => goToTab(hrInstalled ? 'hr-collaborators' : 'applications')}>
                            {hrInstalled ? 'Gérer' : 'Installer'} <ArrowRight size={16} />
                          </button>
                        </div>

                        {/* Progression Widget */}
                        {visibleWidgets.progress && (
                          <div className="card-modern dashboard-widget-card">
                            <div className="card-title-container">
                              <span className="card-title"><Clock size={18} /> Paramétrage</span>
                              <span className="badge badge-reception" style={{ fontSize: '0.8rem' }}>{progress}%</span>
                            </div>
                            <div className="progress-bar-bg" style={{ marginBottom: '1.5rem', height: '6px', borderRadius: '3px', background: 'var(--border-color, rgba(255,255,255,0.08))', overflow: 'hidden' }}>
                              <div className="progress-bar-fill" style={{ height: '100%', width: `${progress}%`, background: 'var(--color-primary, #10b981)', borderRadius: '3px' }}></div>
                            </div>
                            <div className="progress-list">
                              {progressItems.map((item, idx) => (
                                <div key={idx} className={`progress-item ${item.done ? 'done' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                                  <div className="progress-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: item.done ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.04)', color: item.done ? '#10b981' : 'var(--text-muted)' }}>{item.done ? '✓' : idx + 1}</div>
                                  <span className="progress-text" style={{ color: item.done ? 'var(--text-primary)' : 'var(--text-muted)' }}>{item.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Applications Widget */}
                        {visibleWidgets.apps && (
                          <div className="card-modern dashboard-widget-card">
                            <span className="card-title" style={{ marginBottom: '1.25rem' }}><Boxes size={18} /> Applications</span>
                            <div className="installed-app-summary">
                              <div className="metric-icon-wrapper emerald"><Package /></div>
                              <div>
                                <strong style={{ fontSize: '1.7rem' }}>{installedApps.length} active{installedApps.length > 1 ? 's' : ''}</strong>
                                <p className="muted">{stocksInstalled ? 'Stocks est actif pour votre organisation.' : 'Installez votre première application.'}</p>
                              </div>
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={manageApplications}>
                              Gérer <ArrowRight size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </>
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
                  planningPrerequisiteMessage={planningPrerequisiteMessage}
                  onUninstallApp={(appId) => setConfirmation(appId === 'planning' ? 'uninstall-planning' : appId === 'rnm-prices' ? 'uninstall-rnm-prices' : appId === 'technical-sheets' ? 'uninstall-technical-sheets' : appId === 'production' ? 'uninstall-production' : appId === 'menus' ? 'uninstall-menus' : 'uninstall-stocks')}
                />
              )}

              {isRnmTab && rnmInstalled && (
                <CoursProduitsApp
                  token={token}
                  initialTab={activeTab === 'rnm-history' ? 'history' : activeTab === 'rnm-favorites' ? 'favorites' : activeTab === 'rnm-about' ? 'about' : 'dashboard'}
                  onNavigate={(next) => setActiveTab(next === 'history' ? 'rnm-history' : next === 'favorites' ? 'rnm-favorites' : next === 'about' ? 'rnm-about' : 'rnm-dashboard')}
                />
              )}

              {isHrTab && hrInstalled && (
                <HrApp
                  tab={activeTab === 'hr-collaborators' ? 'collaborators' : activeTab === 'hr-departments' ? 'departments' : activeTab === 'hr-positions' ? 'positions' : activeTab === 'hr-rotations' ? 'rotations' : activeTab === 'hr-orgchart' ? 'orgchart' : 'dashboard'}
                  summary={hrSummary}
                  collaborators={hrCollaborators}
                  departments={hrDepartments}
                  positions={hrPositions}
                  rotations={hrRotations}
                  users={users}
                  sites={sites}
                  onboarding={hrOnboarding}
                  canWrite={canWriteHr}
                  loading={isLoading}
                  onNavigate={(next) => setActiveTab(next === 'collaborators' ? 'hr-collaborators' : next === 'departments' ? 'hr-departments' : next === 'positions' ? 'hr-positions' : next === 'rotations' ? 'hr-rotations' : next === 'orgchart' ? 'hr-orgchart' : 'hr-dashboard')}
                  onExitToOverview={() => setActiveTab('overview')}
                  onCreateCollaborator={handleCreateHrCollaborator}
                  onUpdateCollaborator={handleUpdateHrCollaborator}
                  onArchiveCollaborator={handleArchiveHrCollaborator}
                  onUploadCollaboratorDocument={handleUploadHrCollaboratorDocument}
                  onDeleteCollaboratorDocument={handleDeleteHrCollaboratorDocument}
                  onReplaceCollaboratorDocument={handleReplaceHrCollaboratorDocument}
                  onViewCollaboratorDocument={handleViewHrCollaboratorDocument}
                  onDownloadCollaboratorDocument={handleDownloadHrCollaboratorDocument}
                  onCreateDepartment={handleCreateHrDepartment}
                  onCreateDepartmentsBulk={handleCreateHrDepartmentsBulk}
                  onUpdateDepartment={handleUpdateHrDepartment}
                  onArchiveDepartment={handleArchiveHrDepartment}
                  onCreatePosition={handleCreateHrPosition}
                  onCreatePositionsBulk={handleCreateHrPositionsBulk}
                  onUpdatePosition={handleUpdateHrPosition}
                  onArchivePosition={handleArchiveHrPosition}
                  onCreateRotation={handleCreateHrRotation}
                  onUpdateRotation={handleUpdateHrRotation}
                  onArchiveRotation={handleArchiveHrRotation}
                  onAssignRotation={handleAssignHrRotation}
                  onRemoveRotationAssignment={handleRemoveHrRotationAssignment}
                  onSetCollaboratorRotation={handleSetHrCollaboratorRotation}
                  onRemoveCollaboratorRotation={handleRemoveHrCollaboratorRotation}
                  onCompleteServices={handleCompleteHrServices}
                  onCompletePositions={handleCompleteHrPositions}
                  onUnlockEmployees={handleUnlockHrEmployees}
                />
              )}

              {isPlanningTab && planningInstalled && (
                <PlanningApp
                  token={token}
                  session={session}
                  tab={activeTab === 'planning-settings' || activeTab === 'planning-templates' || activeTab === 'planning-requirements' || activeTab === 'planning-absences' ? 'settings' : activeTab === 'planning-attendance' ? 'attendance' : activeTab === 'planning-planning' || activeTab === 'planning-day' || activeTab === 'planning-week' || activeTab === 'planning-month' || activeTab === 'planning-assignments' || activeTab === 'planning-replacements' ? 'planning' : 'dashboard'}
                  collaborators={hrCollaborators}
                  departments={hrDepartments}
                  positions={hrPositions}
                  rotations={hrRotations}
                  sites={activeSites}
                  canWrite={canWriteHr}
                  onNavigate={(next) => setActiveTab(next === 'planning' ? 'planning-planning' : next === 'settings' ? 'planning-settings' : next === 'attendance' ? 'planning-attendance' : 'planning-dashboard')}
                />
              )}

              {isTechnicalSheetsTab && technicalSheetsInstalled && (
                <TechnicalSheetsApp
                  token={token}
                  tab={activeTab === 'technical-sheets-recipes' ? 'recipes' : activeTab === 'technical-sheets-categories' ? 'categories' : activeTab === 'technical-sheets-costs' ? 'costs' : activeTab === 'technical-sheets-allergens' ? 'allergens' : activeTab === 'technical-sheets-production' ? 'production' : 'dashboard'}
                  stocksInstalled={stocksInstalled}
                  products={products}
                  units={units}
                  onNavigate={(next) => setActiveTab(next === 'recipes' ? 'technical-sheets-recipes' : next === 'categories' ? 'technical-sheets-categories' : next === 'costs' ? 'technical-sheets-costs' : next === 'allergens' ? 'technical-sheets-allergens' : next === 'production' ? 'technical-sheets-production' : 'technical-sheets-dashboard')}
                  onInstalled={(apps) => {
                    if (apps) setInstalledApps(apps);
                    void refresh();
                  }}
                />
              )}

              {isProductionTab && productionInstalled && (
                <ProductionApp
                  token={token}
                  session={session}
                  tab={activeTab === 'production-orders' ? 'orders' : activeTab === 'production-calendar' ? 'calendar' : activeTab === 'production-today' ? 'today' : activeTab === 'production-assignments' ? 'assignments' : activeTab === 'production-materials' ? 'materials' : activeTab === 'production-exports' ? 'exports' : activeTab === 'production-history' ? 'history' : 'dashboard'}
                  products={products}
                  units={units}
                  stocks={stocks}
                  collaborators={hrCollaborators}
                  departments={hrDepartments}
                  onNavigate={(next) => setActiveTab(next === 'orders' ? 'production-orders' : next === 'calendar' ? 'production-calendar' : next === 'today' ? 'production-today' : next === 'assignments' ? 'production-assignments' : next === 'materials' ? 'production-materials' : next === 'exports' ? 'production-exports' : next === 'history' ? 'production-history' : 'production-dashboard')}
                />
              )}

              {isMenusTab && menusInstalled && (
                <MenusApp
                  token={token}
                  session={session}
                  tab={activeTab === 'menus-list' ? 'menus' : activeTab === 'menus-calendar' ? 'calendar' : activeTab === 'menus-cycles' ? 'cycles' : activeTab === 'menus-diets' ? 'diets' : activeTab === 'menus-guests' ? 'guests' : activeTab === 'menus-exports' ? 'exports' : activeTab === 'menus-history' ? 'history' : 'dashboard'}
                  sites={activeSites}
                  canManage={canWriteHr}
                  onNavigate={(next) => setActiveTab(next === 'menus' ? 'menus-list' : next === 'calendar' ? 'menus-calendar' : next === 'cycles' ? 'menus-cycles' : next === 'diets' ? 'menus-diets' : next === 'guests' ? 'menus-guests' : next === 'exports' ? 'menus-exports' : next === 'history' ? 'menus-history' : 'menus-dashboard')}
                  onInstalled={(apps) => { if (apps) setInstalledApps(apps); void refresh(); }}
                />
              )}

              {/* TAB SETTINGS */}
              {activeTab === 'settings' && (
                <SettingsPage session={session} token={token} dashboardSummary={dashboardSummary} focusApiKeys={apiKeysPanelHint} onApiKeysSaved={() => { setApiKeysPanelHint(false); void refresh(); }} onOpenUsers={() => goToTab('users')} />
              )}
              {activeTab === 'organization-general' && (
                <SettingsPage session={session} token={token} dashboardSummary={dashboardSummary} focusApiKeys={apiKeysPanelHint} onApiKeysSaved={() => { setApiKeysPanelHint(false); void refresh(); }} onOpenUsers={() => goToTab('users')} />
              )}
              {activeTab === 'users' && isAdmin && (
                <UsersPage
                  users={users}
                  roles={roles}
                  permissions={permissions}
                  currentUserId={session.user.id}
                  loading={isLoading}
                  onRefresh={refreshUsers}
                  onCreate={() => setShowUserModal(true)}
                  onEdit={(user) => setEditingUser(user)}
                  onDisable={handleDisableUser}
                  onUpdateRolePermissions={handleUpdateRolePermissions}
                />
              )}
              {activeTab === 'users' && !isAdmin && (
                <div className="card-modern"><span className="card-title">Accès réservé</span><p>Seul un Administrateur peut gérer les utilisateurs.</p></div>
              )}

              {/* TAB ARCHITECTURE */}
              {activeTab === 'architecture' && isAdmin && (
                <ArchitectureCenter session={session} />
              )}

              {/* TAB STOCKS DASHBOARD */}
              {activeTab === 'stocks-dashboard' && (
                <StocksDashboardPage
                  products={products}
                  suppliers={suppliers}
                  stocks={stocks}
                  movements={movements}
                  onCreateMovement={() => setShowMovementModal(true)}
                  onImportOcr={() => setShowOcrImportModal(true)}
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
                              <td style={{ textAlign: 'right' }}>{numeric(stock.stockValue ?? stock.value ?? numeric(stock.currentQuantity ?? stock.quantity) * numeric(stock.product.averagePrice ?? stock.product.averagePurchasePrice ?? stock.product.weightedAveragePrice)).toFixed(2)} €</td>
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
                          placeholder="Filtrer les produits par nom, SKU, catégorie ou fournisseur..."
                          className="search-input"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                        />
                      </div>
                      <select value={productSupplierFilter} onChange={(e) => setProductSupplierFilter(e.target.value)} style={{ maxWidth: 260 }}>
                        <option value="">Tous fournisseurs</option>
                        {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                      </select>
                      <select value={productCategoryFilter} onChange={(e) => setProductCategoryFilter(e.target.value)} style={{ maxWidth: 240 }}>
                        <option value="">Toutes catégories</option>
                        {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                      {(productSearch || productSupplierFilter || productCategoryFilter) ? (
                        <button type="button" className="btn btn-secondary" onClick={() => { setProductSearch(''); setProductSupplierFilter(''); setProductCategoryFilter(''); }}>
                          <X size={14} /> Réinitialiser
                        </button>
                      ) : null}
                    </div>

                    <div className="table-wrapper">
                      <table className="table-modern">
                        <thead>
                          <tr>
                            <th>Nom du produit</th>
                            <th>Code SKU</th>
                            <th>Fournisseur</th>
                            <th>Unité par défaut</th>
                            <th>Catégorie</th>
                            <th style={{ textAlign: 'right' }}>P.M.P.</th>
                            <th style={{ textAlign: 'right' }}>Stock mini</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProducts.length === 0 ? (
                            <tr>
                              <td colSpan={7}>
                                <div className="empty-state">
                                  <div className="empty-state-icon">🍳</div>
                                  <span className="empty-state-title">Aucun produit trouvé</span>
                                  <span className="empty-state-desc">Ajustez la recherche ou les filtres fournisseur/catégorie.</span>
                                  <button className="btn btn-primary" onClick={() => setShowProductModal(true)}>
                                    <Plus size={16} /> Ajouter un produit
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredProducts.map((p) => (
                              <tr key={p.id} className="clickable-row" onClick={() => setSelectedProductId(p.id)}>
                                <td style={{ fontWeight: 600 }}>{p.name}</td>
                                <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.sku || '—'}</td>
                                <td>{p.primarySupplier?.name ?? p.supplier?.name ?? '—'}</td>
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
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{numeric(p.averagePrice ?? p.averagePurchasePrice ?? p.weightedAveragePrice).toFixed(2)} €</td>
                                <td style={{ textAlign: 'right' }}>{numeric(p.minimumStock ?? p.minStock) || '—'}</td>
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
          suppliers={suppliers}
          initialName={productPrefillName}
          onSubmit={handleCreateProduct}
          onClose={() => { setProductPrefillName(''); setShowProductModal(false); }}
        />
      </Modal>

      <ProductDetailModal
        product={selectedProduct}
        stocks={stocks}
        movements={movements}
        categories={categories}
        units={units}
        suppliers={suppliers}
        onClose={() => setSelectedProductId(null)}
        onUpdate={handleUpdateProduct}
      />

      {/* Supplier Modal */}
      <Modal isOpen={showSupplierModal} onClose={() => { setSupplierPrefillName(''); setShowSupplierModal(false); }} title="Créer un fournisseur">
        <SupplierForm initialName={supplierPrefillName} onSubmit={handleCreateSupplier} onClose={() => { setSupplierPrefillName(''); setShowSupplierModal(false); }} />
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

      <Modal isOpen={showOcrImportModal} onClose={() => setShowOcrImportModal(false)} title="Importer facture / BL" size="lg">
        <StocksOcrImportPanel
          statuses={ocrStatuses}
          onUpload={handleUploadStocksOcr}
          onOpenExtraction={handleOpenOcrExtraction}
          onDownload={(documentId, filename) => api.downloadStocksDocument(token, documentId, filename)}
        />
      </Modal>

      <Modal isOpen={showOcrReviewModal} onClose={() => setShowOcrReviewModal(false)} title="Valider la réception OCR" size="xl">
        {selectedOcrExtraction && (
          <StocksOcrReviewPanel
            extraction={selectedOcrExtraction}
            products={products}
            categories={categories}
            suppliers={suppliers}
            units={units}
            sites={sites}
            locations={locations}
            token={token}
            onSaveDraft={handleSaveOcrDraft}
            onCreateReception={handleCreateOcrReception}
            onCreateProductFromLine={handleCreateOcrProductFromLine}
            onCreateSupplierFromOcr={handleCreateOcrSupplier}
            onClose={() => setShowOcrReviewModal(false)}
          />
        )}
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

      <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title="Créer un utilisateur">
        <UserForm roles={roles} onSubmitCreate={handleCreateUser} onClose={() => setShowUserModal(false)} />
      </Modal>

      <Modal isOpen={editingUser !== null} onClose={() => setEditingUser(null)} title="Modifier un utilisateur">
        {editingUser && (
          <UserForm user={editingUser} roles={roles} onSubmitUpdate={(payload) => handleUpdateUser(editingUser.id, payload)} onClose={() => setEditingUser(null)} />
        )}
      </Modal>

      {/* App Store Detailed Modal Sheet */}
      <Modal isOpen={selectedStoreApp !== null} onClose={() => setSelectedStoreApp(null)} title="Fiche Module - Toque Store">
        {selectedStoreApp && (
          <AppStoreDetailSheet
            app={selectedStoreApp}
            installed={installedApps.includes(selectedStoreApp.id)}
            installing={installingAppId === selectedStoreApp.id}
            progress={installProgress}
            prerequisiteMessage={selectedStoreApp.id === 'planning' && !installedApps.includes('planning') ? planningPrerequisiteMessage : undefined}
            onInstall={() => triggerInstallApp(selectedStoreApp.id)}
            onOpen={() => {
              if (selectedStoreApp.id === 'stocks') setActiveTab('stocks-dashboard');
              if (selectedStoreApp.id === 'rnm-prices') setActiveTab('rnm-dashboard');
              if (selectedStoreApp.id === 'technical-sheets') setActiveTab('technical-sheets-dashboard');
              if (selectedStoreApp.id === 'production') setActiveTab('production-dashboard');
              if (selectedStoreApp.id === 'menus') setActiveTab('menus-dashboard');
              if (selectedStoreApp.id === 'planning') setActiveTab('planning-dashboard');
              setSelectedStoreApp(null);
            }}
            onUninstall={() => {
              if (selectedStoreApp.id === 'menus') setConfirmation('uninstall-menus');
              else if (selectedStoreApp.id === 'production') setConfirmation('uninstall-production');
              else if (selectedStoreApp.id === 'technical-sheets') setConfirmation('uninstall-technical-sheets');
              else if (selectedStoreApp.id === 'planning') setConfirmation('uninstall-planning');
              else setConfirmation(selectedStoreApp.id === 'rnm-prices' ? 'uninstall-rnm-prices' : 'uninstall-stocks');
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

      <ConfirmationModal
        isOpen={confirmation === 'uninstall-planning'}
        title="Supprimer l’application Planning ?"
        text="L’entrée disparaîtra de la navigation, mais les plannings, affectations et historiques existants seront conservés."
        confirmLabel="Supprimer"
        danger
        loading={appActionLoading}
        onCancel={() => setConfirmation(null)}
        onConfirm={uninstallPlanning}
      />

      <ConfirmationModal
        isOpen={confirmation === 'uninstall-technical-sheets'}
        title="Supprimer l’application Fiches Techniques ?"
        text="L’entrée disparaîtra de la navigation, mais les fiches, historiques, coûts et simulations seront conservés."
        confirmLabel="Supprimer"
        danger
        loading={appActionLoading}
        onCancel={() => setConfirmation(null)}
        onConfirm={uninstallTechnicalSheets}
      />

      <ConfirmationModal
        isOpen={confirmation === 'uninstall-rnm-prices'}
        title="Supprimer l’application Cours des Produits ?"
        text="L’entrée disparaîtra de la navigation, mais vos favoris RNM personnels seront conservés pour une réactivation ultérieure."
        confirmLabel="Supprimer"
        danger
        loading={appActionLoading}
        onCancel={() => setConfirmation(null)}
        onConfirm={uninstallRnmPrices}
      />

      <ConfirmationModal
        isOpen={confirmation === 'uninstall-production'}
        title="Supprimer l’application Production ?"
        text="L’entrée disparaîtra de la navigation, mais les ordres, besoins, exports et historiques de production seront conservés."
        confirmLabel="Supprimer"
        danger
        loading={appActionLoading}
        onCancel={() => setConfirmation(null)}
        onConfirm={uninstallProduction}
      />

      <ConfirmationModal
        isOpen={confirmation === 'uninstall-menus'}
        title="Supprimer l’application Menus ?"
        text="L’entrée disparaîtra de la navigation, mais les menus, cycles, convives, exports et historiques seront conservés pour une réactivation ultérieure."
        confirmLabel="Supprimer"
        danger
        loading={appActionLoading}
        onCancel={() => setConfirmation(null)}
        onConfirm={uninstallMenus}
      />

      <Modal isOpen={showCustomizeModal} onClose={() => setShowCustomizeModal(false)} title="Personnaliser le Dashboard">
        <CustomizeDashboardForm
          theme={dashboardTheme}
          visibleWidgets={visibleWidgets}
          layoutMode={layoutMode}
          dashboardWidgets={dashboardWidgets}
          hiddenWidgetIds={modularDashboard?.preferences.hiddenWidgetIds ?? []}
          pinnedWidgetIds={modularDashboard?.preferences.pinnedWidgetIds ?? []}
          onToggleWidget={(widgetId, visible) => void toggleDashboardWidget(widgetId, visible)}
          onTogglePin={(widgetId) => void toggleDashboardPin(widgetId)}
          onResetCore={() => void resetDashboardCore()}
          onSave={(newTheme, newWidgets, newLayout) => {
            setDashboardTheme(newTheme);
            setVisibleWidgets(newWidgets);
            setLayoutMode(newLayout);
            void persistDashboardPreferences({ theme: newTheme, layoutMode: newLayout });
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

function getRhPlanningReadiness(
  hrInstalled: boolean,
  departments: HrDepartment[],
  positions: HrPosition[],
  collaborators: HrCollaborator[],
) {
  if (!hrInstalled) {
    return { ready: false, message: 'Installez le module RH avant d’activer Planning.' };
  }

  const activeDepartments = departments.filter((department) => !isArchived(department));
  const activePositions = positions.filter((position) => !isArchived(position));
  const activeCollaborators = collaborators.filter((collaborator) => !isArchived(collaborator) && collaborator.status === 'ACTIVE');
  const missing: string[] = [];

  if (!activeDepartments.length) missing.push('un service');
  if (!activePositions.length) missing.push('un poste');
  if (!activeCollaborators.length) missing.push('un collaborateur');

  const activeDepartmentIds = new Set(activeDepartments.map((department) => department.id));
  const activePositionIds = new Set(activePositions.map((position) => position.id));
  const incompleteCollaborators = activeCollaborators.filter((collaborator) => {
    const hasDisplayName = Boolean(`${collaborator.firstName ?? ''} ${collaborator.lastName ?? ''}`.trim());
    const departmentId = collaborator.departmentId ?? collaborator.department?.id;
    const positionId = collaborator.positionId ?? collaborator.position?.id;
    return !hasDisplayName || !departmentId || !positionId || !activeDepartmentIds.has(departmentId) || !activePositionIds.has(positionId);
  });

  if (incompleteCollaborators.length) {
    const names = incompleteCollaborators.slice(0, 3).map((collaborator) => `${collaborator.firstName ?? ''} ${collaborator.lastName ?? ''}`.trim() || 'Collaborateur sans nom');
    const suffix = incompleteCollaborators.length > 3 ? `, +${incompleteCollaborators.length - 3}` : '';
    missing.push(`un nom affichable, un service principal et un poste principal pour ${names.join(', ')}${suffix}`);
  }

  if (!missing.length) return { ready: true, message: undefined };

  return {
    ready: false,
    message: `Ajoutez ${formatMissingPlanningPrerequisites(missing)} avant d’activer Planning.`,
  };
}

function formatMissingPlanningPrerequisites(items: string[]) {
  if (items.length === 1) return `au moins ${items[0]}`;
  if (items.length === 2) return `au moins ${items[0]} et ${items[1]}`;
  return `au moins ${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

function numeric(value: string | number | null | undefined) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function normalizeLookup(value?: string | null) {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeSearchText(value?: string | null) {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeProductSearchText(value?: string | null) {
  return normalizeSearchText(value)
    .replace(/\b(?:lot|dlc|ddm|prix|total|montant|tva|ht|ttc|net|brut|colis|carton|cartons|pieces|piece|unite|unites|kg|kgs|g|gr|l|litre|litres|ml|cl|x)\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|gr|l|ml|cl|pc|pcs|u|x)\b/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function productTokens(value?: string | null) {
  return normalizeProductSearchText(value).split(' ').filter((token) => token.length > 2 && !/^\d+$/.test(token));
}

function tokenSimilarity(a?: string | null, b?: string | null) {
  const left = new Set(productTokens(a));
  const right = new Set(productTokens(b));
  if (!left.size || !right.size) return 0;
  const common = [...left].filter((token) => right.has(token)).length;
  const coverage = common / Math.min(left.size, right.size);
  const dice = (2 * common) / (left.size + right.size);
  return Math.max(dice, coverage * 0.92);
}

function productSupplierId(product: Product) {
  return product.primarySupplierId ?? product.supplierId ?? product.primarySupplier?.id ?? product.supplier?.id ?? null;
}

function productUnitSymbol(product: Product) {
  return product.unit?.symbol ?? '';
}

function scoreProductForOcrLine(line: StocksOcrLine, product: Product, supplierId?: string | null) {
  const label = String(line.ocrLabel || line.label || '');
  const reference = normalizeSearchText(line.reference);
  const sku = normalizeSearchText(product.sku ?? product.reference);
  const productName = String(product.name || '');
  let score = Math.max(tokenSimilarity(label, productName), tokenSimilarity(normalizeProductSearchText(label), normalizeProductSearchText(productName)));
  const labelSearch = normalizeSearchText(label);
  if (sku && reference && sku === reference) score = Math.max(score, 0.99);
  else if (sku && reference && (sku.includes(reference) || reference.includes(sku))) score = Math.max(score, 0.94);
  else if (sku && labelSearch.includes(sku)) score = Math.max(score, 0.94);
  if (supplierId && productSupplierId(product) === supplierId) score += 0.04;
  if (line.unitId && product.unitId === line.unitId) score += 0.03;
  return Math.min(1, score);
}

function productCandidateFromProduct(product: Product, score: number) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? product.reference ?? null,
    categoryId: product.categoryId ?? product.category?.id ?? null,
    categoryName: product.category?.name ?? null,
    unitId: product.unitId,
    unitSymbol: productUnitSymbol(product),
    supplierId: productSupplierId(product),
    supplierName: product.primarySupplier?.name ?? product.supplier?.name ?? null,
    score,
  };
}

const OCR_FALLBACK_CATEGORY_NAME = 'À classer';
const ocrFallbackCategoryCache = new Map<string, Promise<Category>>();

const CATEGORY_KEYWORDS: Array<{ hints: string[]; aliases: string[] }> = [
  { hints: ['boeuf', 'bœuf', 'veau', 'porc', 'agneau', 'volaille', 'poulet', 'dinde', 'canard', 'jambon', 'saucisse', 'steak', 'viande'], aliases: ['viande', 'viandes', 'boucherie', 'volaille', 'volailles'] },
  { hints: ['poisson', 'saumon', 'thon', 'cabillaud', 'colin', 'merlu', 'crevette', 'moule', 'huitre', 'huître', 'surimi', 'maree', 'marée'], aliases: ['poisson', 'poissons', 'maree', 'marée', 'produits de la mer'] },
  { hints: ['lait', 'beurre', 'creme', 'crème', 'fromage', 'yaourt', 'emmental', 'mozzarella', 'laitier'], aliases: ['cremerie', 'crèmerie', 'produits laitiers', 'laitier', 'fromage'] },
  { hints: ['carotte', 'tomate', 'salade', 'oignon', 'pomme de terre', 'courgette', 'fruit', 'legume', 'légume', 'pomme', 'banane'], aliases: ['fruits', 'legumes', 'légumes', 'primeur', 'fruits et legumes', 'fruits et légumes'] },
  { hints: ['pain', 'baguette', 'brioche', 'viennoiserie', 'croissant', 'patisserie', 'pâtisserie'], aliases: ['boulangerie', 'patisserie', 'pâtisserie', 'pain'] },
  { hints: ['riz', 'pate', 'pâte', 'pates', 'pâtes', 'farine', 'sucre', 'huile', 'vinaigre', 'conserve', 'sauce', 'epice', 'épice'], aliases: ['epicerie', 'épicerie', 'sec', 'produits secs'] },
  { hints: ['surg', 'surgele', 'surgelé', 'surgeles', 'surgelés', 'glace', 'congele', 'congelé'], aliases: ['surgeles', 'surgelés', 'surgelé', 'congelé'] },
  { hints: ['eau', 'jus', 'soda', 'vin', 'biere', 'bière', 'cafe', 'café', 'boisson'], aliases: ['boisson', 'boissons', 'cave'] },
  { hints: ['barquette', 'film', 'gant', 'papier', 'sac', 'gobelet', 'serviette', 'emballage'], aliases: ['emballage', 'emballages', 'non alimentaire', 'consommables'] },
];

function inferOcrCategoryId(line: StocksOcrLine, categories: Category[], products: Product[]) {
  const candidateWithCategory = (line.productCandidates || [])
    .map((candidate) => ({ candidate, score: numeric(candidate.score) }))
    .filter(({ candidate, score }) => candidate.categoryId && score >= 0.58)
    .sort((a, b) => b.score - a.score)[0]?.candidate;
  if (candidateWithCategory?.categoryId) return candidateWithCategory.categoryId;

  const label = String(line.ocrLabel || line.label || '');
  const closestProduct = products
    .filter((product) => !isArchived(product) && (product.categoryId || product.category?.id))
    .map((product) => ({ product, score: scoreProductForOcrLine(line, product, null) }))
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score)[0]?.product;
  if (closestProduct?.categoryId || closestProduct?.category?.id) return closestProduct.categoryId ?? closestProduct.category?.id ?? undefined;

  const normalizedLabel = normalizeProductSearchText(label);
  const keywordRule = CATEGORY_KEYWORDS.find((rule) => rule.hints.some((hint) => normalizedLabel.includes(normalizeProductSearchText(hint))));
  if (keywordRule) {
    const category = categories
      .filter((item) => !isArchived(item))
      .find((item) => {
        const categoryText = normalizeProductSearchText(`${item.name} ${item.description ?? ''}`);
        return keywordRule.aliases.some((alias) => categoryText.includes(normalizeProductSearchText(alias)));
      });
    if (category) return category.id;
  }

  const rankedCategory = categories
    .filter((category) => !isArchived(category))
    .map((category) => {
      const haystack = `${category.name} ${category.description ?? ''}`;
      return { category, score: Math.max(tokenSimilarity(label, haystack), normalizeProductSearchText(label).includes(normalizeProductSearchText(category.name)) ? 0.78 : 0) };
    })
    .filter((item) => item.score >= 0.32)
    .sort((a, b) => b.score - a.score)[0]?.category;
  return rankedCategory?.id;
}

function supplierMajorityCategoryId(supplierId: string | null | undefined, products: Product[]) {
  if (!supplierId) return undefined;
  const counts = new Map<string, number>();
  for (const product of products) {
    const categoryId = product.categoryId ?? product.category?.id;
    if (isArchived(product) || productSupplierId(product) !== supplierId || !categoryId) continue;
    counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

async function resolveOcrCategoryIdForCreate(token: string, line: StocksOcrLine, categories: Category[], products: Product[], supplierId?: string | null) {
  const inferred = inferOcrCategoryId(line, categories, products) || supplierMajorityCategoryId(supplierId, products);
  if (inferred) return inferred;
  const fallback = categories.find((category) => {
    const key = normalizeLookup(category.name);
    return !isArchived(category) && ['aclasser', 'aclasser', 'autres', 'divers', 'sanscategorie', 'nonclasse'].includes(key);
  });
  if (fallback) return fallback.id;
  const cacheKey = `${token}:${OCR_FALLBACK_CATEGORY_NAME}`;
  if (!ocrFallbackCategoryCache.has(cacheKey)) {
    ocrFallbackCategoryCache.set(cacheKey, api.createCategory(token, {
      name: OCR_FALLBACK_CATEGORY_NAME,
      description: 'Catégorie créée automatiquement pour les produits OCR sans correspondance fiable.',
    }).catch(async () => {
      const refreshed = await api.categories(token);
      const existing = refreshed.find((category) => normalizeLookup(category.name) === normalizeLookup(OCR_FALLBACK_CATEGORY_NAME));
      if (!existing) throw new Error('Impossible de créer ou retrouver la catégorie OCR par défaut.');
      return existing;
    }));
  }
  return (await ocrFallbackCategoryCache.get(cacheKey)!).id;
}

function enrichOcrProductMatches(data: StocksOcrExtraction['data'], products: Product[]): StocksOcrExtraction['data'] {
  const supplierId = data.supplierId ?? data.supplier?.supplierId ?? null;
  return {
    ...data,
    lines: (data.lines || []).map((line) => {
      if (line.productId || line.ignored) return line;
      const ranked = products
        .filter((product) => !isArchived(product))
        .map((product) => ({ product, score: scoreProductForOcrLine(line, product, supplierId) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const candidates = ranked.filter((candidate) => candidate.score >= 0.38).slice(0, 8).map((candidate) => productCandidateFromProduct(candidate.product, candidate.score));
      if (!best || best.score < 0.58) return { ...line, productCandidates: candidates, matchingStatus: line.matchingStatus ?? 'NOT_FOUND', matchingScore: line.matchingScore ?? 0 };
      const status = best.score >= 0.84 ? 'RECOGNIZED' : 'NEEDS_REVIEW';
      return {
        ...line,
        productId: best.product.id,
        productName: best.product.name,
        unitId: best.product.unitId ?? line.unitId,
        matchedUnitSymbol: productUnitSymbol(best.product) || line.matchedUnitSymbol,
        matchingStatus: status,
        matchingScore: best.score,
        productCandidates: candidates,
      };
    }),
  };
}

function resolveOcrUnitId(units: Unit[], unitId?: string | null, unitLabel?: string | null) {
  if (unitId && units.some((unit) => unit.id === unitId)) return unitId;
  const key = normalizeLookup(unitLabel);
  if (!key) return '';
  const aliases: Record<string, string[]> = {
    kg: ['kg', 'kilogramme'],
    g: ['g', 'gramme'],
    l: ['l', 'litre'],
    ml: ['ml', 'millilitre'],
    pu: ['piece', 'pieces', 'u', 'unite', 'unites'],
    u: ['piece', 'pieces', 'u', 'unite', 'unites'],
    po: ['piece', 'pieces', 'u', 'unite', 'unites'],
    pi: ['piece', 'pieces', 'u', 'unite', 'unites'],
    col: ['carton', 'colis', 'caisse'],
    colis: ['carton', 'colis', 'caisse'],
    carton: ['carton', 'colis', 'caisse'],
    paq: ['paquet', 'carton', 'piece', 'pieces'],
    plq: ['plaquette', 'piece', 'pieces'],
  };
  const wanted = new Set([key, ...(aliases[key] ?? [])]);
  return units.find((unit) => wanted.has(normalizeLookup(unit.symbol)) || wanted.has(normalizeLookup(unit.name)))?.id || '';
}

function resolveOcrReceptionUnits(data: StocksOcrExtraction['data'], units: Unit[]): StocksOcrExtraction['data'] {
  return {
    ...data,
    lines: (data.lines || []).map((line) => ({
      ...line,
      unitId: line.unitId || resolveOcrUnitId(units, line.unitId, line.matchedUnitSymbol || line.unit) || null,
    })),
  };
}

function roundOcrPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * 10000) / 10000;
}

function ocrProductName(line: StocksOcrLine) {
  return String(line.ocrLabel || line.label || '').trim().slice(0, 180);
}

function ocrProductReference(line: StocksOcrLine) {
  return String(line.reference || '').trim().slice(0, 80);
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

function ModularDashboardOverview({ zones, theme, firstName, organizationName, refreshLabel, onNavigate, onTogglePin }: { zones: ModularDashboard['zones']; theme: string; firstName: string; organizationName: string; refreshLabel: string; onNavigate: (tab: ActiveTab) => void; onTogglePin: (widgetId: string) => Promise<void> }) {
  const zoneMeta = {
    kpi: { title: 'KPI', icon: TrendingUp, desc: 'Indicateurs synthétiques Core et modules installés.' },
    activity: { title: 'Activité', icon: History, desc: 'Flux récents, actions à suivre et états vides.' },
    analytics: { title: 'Analyses', icon: LineChart, desc: 'Tendances disponibles sans logique métier dans le Core.' },
    alerts: { title: 'Alertes', icon: AlertCircle, desc: 'Points d’attention inter-modules.' },
  } as const;

  return (
    <div className="modular-dashboard-shell">
      <div className={`welcome-hero theme-${theme}`}>
        <span className="welcome-tag">Dashboard modulaire · Refresh global 5 min · {refreshLabel}</span>
        <h1 className="welcome-title">Bonjour {firstName} 👋</h1>
        <p className="welcome-desc">
          Vue intelligente de <strong>{organizationName}</strong>. Les widgets sont fournis par le registry Core, filtrés par applications installées et permissions de lecture.
        </p>
      </div>
      {(Object.keys(zoneMeta) as Array<keyof typeof zoneMeta>).map((zone) => {
        const meta = zoneMeta[zone];
        const Icon = meta.icon;
        const widgets = zones[zone] ?? [];
        return (
          <section className={`dashboard-zone dashboard-zone-${zone}`} key={zone}>
            <div className="section-header-modern">
              <div className="section-info">
                <span className="card-title"><Icon size={18} /> {meta.title}</span>
                <span className="section-tagline">{meta.desc}</span>
              </div>
            </div>
            {widgets.length ? (
              <div className={zone === 'kpi' ? 'metrics-grid' : 'dashboard-widget-grid'}>
                {widgets.map((widget) => <DashboardWidgetCard key={widget.id} widget={widget} onNavigate={onNavigate} onTogglePin={onTogglePin} compact={zone === 'kpi'} />)}
              </div>
            ) : (
              <div className="card-modern"><EmptyMini title={`Zone ${meta.title} vide`} text="Aucun widget visible avec vos applications installées et permissions actuelles." icon="🧩" /></div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function dashboardWidgetModule(widget: Pick<DashboardWidget, 'module'> & { appId?: string; moduleLabel?: string; id?: string }) {
  return String(widget.module ?? widget.appId ?? widget.moduleLabel ?? widget.id?.split('.')[0] ?? 'core').toLowerCase();
}

function DashboardWidgetCard({ widget, onNavigate, onTogglePin, compact }: { widget: DashboardWidget; onNavigate: (tab: ActiveTab) => void; onTogglePin: (widgetId: string) => Promise<void>; compact?: boolean }) {
  const moduleKey = dashboardWidgetModule(widget);
  const value = widget.data?.value ?? widget.data?.count ?? widget.data?.total ?? widget.data?.label ?? '—';
  const subtitle = String(widget.data?.subtitle ?? widget.data?.description ?? widget.emptyMessage ?? (widget.comingSoon ? 'Module à venir' : 'Données disponibles dès première utilisation.'));
  const target = moduleTargetTab(moduleKey);
  const Icon = widgetIcon(moduleKey);
  if (compact) {
    return <Metric icon={<Icon size={20} />} value={String(value)} label={widget.title} tone={widgetTone(moduleKey)} />;
  }
  return (
    <motion.div className="card-modern dashboard-widget-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card-title-container">
        <span className="card-title"><Icon size={18} /> {widget.title}</span>
      </div>
      {widget.empty || widget.comingSoon ? (
        <EmptyMini title={widget.emptyTitle ?? (widget.comingSoon ? 'Bientôt disponible' : 'Aucune donnée')} text={subtitle} icon={widget.comingSoon ? '🚧' : '🧩'} />
      ) : (
        <div className="installed-app-summary">
          <div className={`metric-icon-wrapper ${widgetTone(moduleKey)}`}><Icon /></div>
          <div><strong style={{ fontSize: '1.7rem' }}>{String(value)}</strong><p className="muted">{subtitle}</p></div>
        </div>
      )}
      {target && <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => onNavigate(target)}>Ouvrir <ArrowRight size={16} /></button>}
    </motion.div>
  );
}

function widgetIcon(module?: string) {
  const moduleKey = String(module ?? 'core').toLowerCase();
  if (moduleKey.includes('stock')) return Package;
  if (moduleKey.includes('production')) return Factory;
  if (moduleKey.includes('menu')) return Utensils;
  if (moduleKey.includes('hr')) return UsersRound;
  if (moduleKey.includes('planning')) return CalendarCheck;
  if (moduleKey.includes('technical')) return FileText;
  if (moduleKey.includes('rnm')) return LineChart;
  return LayoutDashboard;
}

function widgetTone(module?: string) {
  const moduleKey = String(module ?? 'core').toLowerCase();
  if (moduleKey.includes('production') || moduleKey.includes('technical')) return 'orange';
  if (moduleKey.includes('planning') || moduleKey.includes('rnm')) return 'blue';
  if (moduleKey.includes('menu')) return 'purple';
  return 'emerald';
}

function moduleTargetTab(module?: string): ActiveTab | undefined {
  const moduleKey = String(module ?? 'core').toLowerCase();
  if (moduleKey.includes('stock')) return 'stocks-dashboard';
  if (moduleKey.includes('production')) return 'production-dashboard';
  if (moduleKey.includes('menu')) return 'menus-dashboard';
  if (moduleKey.includes('hr')) return 'hr-dashboard';
  if (moduleKey.includes('planning')) return 'planning-dashboard';
  if (moduleKey.includes('technical')) return 'technical-sheets-dashboard';
  if (moduleKey.includes('rnm')) return 'rnm-dashboard';
  return undefined;
}

function StocksDashboardPage({ products, suppliers, stocks, movements, onCreateMovement, onImportOcr, onOpenStocks }: { products: Product[]; suppliers: Supplier[]; stocks: Stock[]; movements: StockMovement[]; onCreateMovement: () => void; onImportOcr: () => void; onOpenStocks: () => void }) {
  const stockValue = stocks.reduce((sum, stock) => sum + numeric(stock.stockValue ?? stock.value ?? numeric(stock.currentQuantity ?? stock.quantity) * numeric(stock.product.averagePrice ?? stock.product.averagePurchasePrice ?? stock.product.weightedAveragePrice)), 0);
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
        <div className="stocks-reception-actions">
          <button className="btn btn-primary" onClick={onImportOcr}>
            <FileText size={16} /> Importer facture / BL
          </button>
          <button className="btn btn-secondary" onClick={onCreateMovement}>
            <Plus size={16} /> Réception manuelle
          </button>
        </div>
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
function MiniMovements({ movements }: { movements: StockMovement[] }) {
  return movements.length ? (
    <div className="dashboard-activity-feed">
      {movements.map((m) => {
        const dateStr = new Date(m.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const timeStr = new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const typeClass = {
          RECEPTION: 'feed-in',
          IN: 'feed-in',
          ENTRY: 'feed-in',
          OUT: 'feed-out',
          EXIT: 'feed-out',
          PRODUCTION: 'feed-production',
          LOSS: 'feed-out',
          CORRECTION: 'feed-correction',
          INVENTORY: 'feed-inventory',
          TRANSFER: 'feed-production',
        }[m.type] || 'feed-in';
        return (
          <div key={m.id} className="feed-item">
            <div className={`feed-dot ${typeClass}`} />
            <div className="feed-content">
              <div className="feed-header">
                <span className="feed-title">{m.product.name}</span>
                <span className={`feed-qty ${typeClass}`}>
                  {movementSign(m.type)}{m.quantity} {m.product.unit?.symbol ?? ''}
                </span>
              </div>
              <div className="feed-footer">
                <span className="feed-label">{movementLabels[m.type]}</span>
                <span className="feed-time">{dateStr} · {timeStr}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <EmptyMini title="Aucun mouvement" text="Enregistrez une réception, sortie, perte, correction, inventaire, production ou transfert." />
  );
}

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
  planningPrerequisiteMessage,
  onUninstallApp,
}: {
  installedApps: string[];
  appActionLoading: boolean;
  onSelectApp: (app: AppDefinition) => void;
  onInstallApp: (appId: string) => void;
  installingAppId: string | null;
  installProgress: number;
  planningPrerequisiteMessage?: string;
  onUninstallApp: (appId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredStoreApps = useMemo(() => {
    return apps.filter(app => 
      app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const featuredApp = apps[0]; // Cours des Produits is featured

  return (
    <div className="applications-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Featured Banner (À la Une) */}
      {searchQuery === '' && (
        <div className="store-featured-banner">
          <div className="store-featured-content">
            <span className="store-featured-tag">À LA UNE · INDISPENSABLE</span>
            <h1 className="store-featured-title">Module {featuredApp.title}</h1>
            <p className="store-featured-desc">
              {featuredApp.tagline} Consultez les cotations FranceAgriMer en temps réel sans importer de données RNM dans ToqueHub.
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
              <LineChart size={64} />
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
            const prerequisiteMessage = app.id === 'planning' ? planningPrerequisiteMessage : undefined;
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
                  ) : available && !prerequisiteMessage ? (
                    <button 
                      className="btn btn-get"
                      onClick={() => onInstallApp(app.id)}
                      disabled={installingAppId !== null}
                    >
                      Obtenir
                    </button>
                  ) : available && prerequisiteMessage ? (
                    <button className="btn btn-get soon" disabled title={prerequisiteMessage}>
                      Bloqué
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
  prerequisiteMessage,
  onInstall,
  onOpen,
  onUninstall,
  onClose,
}: {
  app: AppDefinition;
  installed: boolean;
  installing: boolean;
  progress: number;
  prerequisiteMessage?: string;
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
            ) : isAvailable && !prerequisiteMessage ? (
              <button className="btn btn-primary" onClick={onInstall} style={{ padding: '0.45rem 1.25rem', borderRadius: '20px' }}>
                Obtenir
              </button>
            ) : isAvailable && prerequisiteMessage ? (
              <button className="btn btn-secondary" disabled style={{ padding: '0.45rem 1.25rem', borderRadius: '20px' }}>
                Bloqué
              </button>
            ) : (
              <span className="sidebar-badge-soon" style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}>Bientôt disponible</span>
            )}
          </div>
        </div>
      </div>

      {prerequisiteMessage ? (
        <div className="alert" style={{ margin: '1rem 0 0' }}>
          {prerequisiteMessage}
        </div>
      ) : null}

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

function displayUserName(user: Pick<CoreUser, 'firstName' | 'lastName' | 'email'>) {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return fullName || user.email;
}

function roleLabel(role: string) {
  const labels: Record<string, string> = { ADMIN: 'Administrateur', SUPER_ADMIN: 'Administrateur', MANAGER: 'Manager', USER: 'Utilisateur' };
  return labels[role] ?? role;
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = { ACTIVE: 'Actif', INVITED: 'Invité', DISABLED: 'Désactivé' };
  return labels[status ?? ''] ?? status ?? '—';
}

function formatLastLogin(value?: string | null) {
  if (!value) return 'Jamais connecté';
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function normalizePermission(permission: CorePermission | string): CorePermission {
  return typeof permission === 'string' ? { key: permission, label: permission } : permission;
}

function roleKey(role: CoreRole) {
  return role.name ?? role.label ?? role.key ?? role.id ?? 'role';
}

function roleValue(role: CoreRole) {
  return role.name ?? role.label ?? role.key ?? '';
}

function permissionKey(permission: string | CorePermission) {
  return typeof permission === 'string' ? permission : permission.key;
}

function DevSwitch({ users, currentUserId, onSwitch, onCreate }: { users: CoreUser[]; currentUserId: string; onSwitch: (userId: string) => Promise<void>; onCreate: () => void }) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  async function choose(userId: string) {
    setSwitching(true);
    try { await onSwitch(userId); } finally { setSwitching(false); setOpen(false); }
  }
  return (
    <div className="dev-switch">
      <button className="btn btn-secondary dev-switch-trigger" onClick={() => setOpen(!open)}>
        <RefreshCw size={14} /> Mode démo <ChevronDown size={14} />
      </button>
      {open && (
        <div className="dev-switch-menu">
          <span className="dev-switch-label">Switch utilisateur — développement</span>
          {users.map((user) => (
            <button key={user.id} onClick={() => choose(user.id)} disabled={switching || user.id === currentUserId || user.status === 'DISABLED'}>
              <span>{displayUserName(user)}</span>
              <small>{roleLabel(user.role)} · {statusLabel(user.status)}</small>
            </button>
          ))}
          <button onClick={onCreate} className="dev-switch-create"><UserPlus size={14} /> Créer un utilisateur</button>
        </div>
      )}
    </div>
  );
}



function SettingsPage({ session, token, dashboardSummary, focusApiKeys, onApiKeysSaved, onOpenUsers }: { session: UserSession; token: string; dashboardSummary?: DashboardSummary; focusApiKeys?: boolean; onApiKeysSaved?: () => void; onOpenUsers?: () => void }) {
  const organization = dashboardSummary?.organization;
  const initialConfigured = organization?.apiKeys?.mistral.configured ?? session.user.apiKeys?.mistral.configured ?? false;
  const initialMasked = organization?.apiKeys?.mistral.masked ?? session.user.apiKeys?.mistral.masked;
  const [mistralKey, setMistralKey] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(initialConfigured);
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null | undefined>(initialMasked);
  const [apiKeyMessage, setApiKeyMessage] = useState<string>();
  const [apiKeyError, setApiKeyError] = useState<string>();
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'users' | 'api-keys' | 'core'>(() => {
    return focusApiKeys ? 'api-keys' : 'general';
  });

  useEffect(() => {
    setApiKeyConfigured(initialConfigured);
    setApiKeyMasked(initialMasked);
  }, [initialConfigured, initialMasked]);

  useEffect(() => {
    if (focusApiKeys) {
      setActiveSubTab('api-keys');
    }
  }, [focusApiKeys]);

  async function saveApiKey() {
    setSavingApiKey(true);
    setApiKeyError(undefined);
    setApiKeyMessage(undefined);
    try {
      const saved = await api.updateOrganizationApiKeys(token, { mistralApiKey: mistralKey.trim() || undefined });
      setApiKeyConfigured(Boolean(saved?.mistral.configured));
      setApiKeyMasked(saved?.mistral.masked);
      setMistralKey('');
      setApiKeyMessage(saved?.mistral.configured ? 'Clé Mistral enregistrée.' : 'Clé Mistral supprimée.');
      onApiKeysSaved?.();
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : 'Impossible d’enregistrer la clé API.');
    } finally {
      setSavingApiKey(false);
    }
  }

  return (
    <div className="settings-page">
      <section className="welcome-hero settings-hero" style={{ background: 'linear-gradient(135deg, #090d16 0%, #111827 100%)', border: '1px solid rgba(255, 255, 255, 0.05)', position: 'relative', overflow: 'hidden' }}>
        <div className="settings-hero-grid">
          <div className="settings-hero-left">
            <span className="sovereign-badge-glow">
              <span className="status-indicator-dot green"></span>
              Souveraineté Locale & Chiffrement
            </span>
            <h1 style={{ color: 'white', margin: '0.5rem 0 0.25rem 0', fontSize: '2rem', fontWeight: 800 }}>Environnement ToqueHub</h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: 0, fontSize: '0.92rem', lineHeight: 1.5 }}>
              Console d'administration locale et cloud souveraine. Vos applications partagent la même organisation, les mêmes utilisateurs et les mêmes données sécurisées.
            </p>
          </div>
          <div className="glass-terminal">
            <div className="glass-terminal-header">
              <div className="glass-terminal-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="glass-terminal-title">toquehub-core ~ terminal</span>
            </div>
            <div className="glass-terminal-rows">
              <div className="glass-terminal-row">
                <span className="label">SYSTEM :</span>
                <span className="value" style={{ color: '#10b981' }}>
                  <span className="status-indicator-dot green"></span> OPÉRATIONNEL
                </span>
              </div>
              <div className="glass-terminal-row">
                <span className="label">INST. SOUVERAINETÉ :</span>
                <span className="value" style={{ color: '#3b82f6' }}>
                  <span className="status-indicator-dot blue"></span> 100% FRANÇAISE
                </span>
              </div>
              <div className="glass-terminal-row">
                <span className="label">SQLITE LOCAL BDD :</span>
                <span className="value" style={{ color: '#8b5cf6' }}>
                  <span className="status-indicator-dot purple"></span> CONNECTÉE
                </span>
              </div>
              <div className="glass-terminal-row">
                <span className="label">MISTRAL AI OCR :</span>
                {apiKeyConfigured ? (
                  <span className="value" style={{ color: '#10b981' }}>
                    <span className="status-indicator-dot green"></span> CONFIGURÉ
                  </span>
                ) : (
                  <span className="value" style={{ color: '#f97316' }}>
                    <span className="status-indicator-dot orange"></span> NON DÉTECTÉ
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="settings-layout">
        {/* Left Sidebar Menu */}
        <div className="card-modern" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {[
            { id: 'general' as const, label: 'Général', desc: 'Identité établissement', icon: Building2 },
            { id: 'users' as const, label: 'Utilisateurs & Accès', desc: 'Comptes et permissions', icon: UsersRound },
            { id: 'api-keys' as const, label: 'Clés API & IA', desc: 'Mistral & Outils OCR', icon: KeyRound },
            { id: 'core' as const, label: 'Diagnostic & Core', desc: 'Statistiques & BDD', icon: Server },
          ].map((tabItem) => {
            const isActive = activeSubTab === tabItem.id;
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setActiveSubTab(tabItem.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  color: isActive ? '#10b981' : 'var(--text-muted)',
                  background: isActive ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease-in-out',
                  outline: 'none',
                  borderLeft: isActive ? '3px solid #10b981' : '3px solid transparent',
                  paddingLeft: isActive ? 'calc(1rem - 3px)' : '1rem',
                }}
              >
                <tabItem.icon size={18} style={{ flexShrink: 0, color: isActive ? '#10b981' : 'var(--text-muted)' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{tabItem.label}</span>
                  <span className="settings-sidebar-desc">{tabItem.desc}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Content Panel */}
        <div className="settings-content">
          {activeSubTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="card-modern" style={{ padding: '1.5rem' }}>
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><Building2 size={18} /> Détails de l'Organisation</span>
                <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>Ces informations définissent l'identité et la taille de votre structure ToqueHub.</p>
                
                <div className="settings-grid-premium">
                  <div className="info-card-premium">
                    <div className="info-card-premium-header">
                      <span className="info-card-premium-label">Nom Établissement</span>
                      <span className="info-card-premium-icon"><Building2 size={16} /></span>
                    </div>
                    <div className="info-card-premium-value">
                      {organization?.name ?? session.user.organizationName ?? 'Organisation'}
                    </div>
                  </div>
                  
                  <div className="info-card-premium">
                    <div className="info-card-premium-header">
                      <span className="info-card-premium-label">Secteur / Type</span>
                      <span className="info-card-premium-icon"><BriefcaseBusiness size={16} /></span>
                    </div>
                    <div className="info-card-premium-value">
                      {organization?.establishmentType ?? session.user.organizationType ?? 'Non renseigné'}
                    </div>
                  </div>
                  
                  <div className="info-card-premium">
                    <div className="info-card-premium-header">
                      <span className="info-card-premium-label">Taille de l'équipe</span>
                      <span className="info-card-premium-icon"><UsersRound size={16} /></span>
                    </div>
                    <div className="info-card-premium-value">
                      {organization?.teamSize ?? session.user.teamSize ?? 'Non renseigné'}
                    </div>
                  </div>
                  
                  <div className="info-card-premium">
                    <div className="info-card-premium-header">
                      <span className="info-card-premium-label">Site principal</span>
                      <span className="info-card-premium-icon"><MapPin size={16} /></span>
                    </div>
                    <div className="info-card-premium-value">
                      {organization?.mainSiteName ?? session.user.mainSiteName ?? 'Site principal'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-modern" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(59,130,246,0.04) 100%)', border: '1px solid rgba(16,185,129,0.1)' }}>
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}><ChefHat size={18} /> Plateforme modulaire</span>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, fontSize: '0.88rem', margin: 0 }}>
                  L'installation ou la désactivation d'un module modifie uniquement l'interface utilisateur. Tous vos produits, fournisseurs, historiques et configurations de stock restent stockés de manière permanente et sécurisée dans la base locale souveraine.
                </p>
              </div>
            </div>
          )}

          {activeSubTab === 'users' && (
            <div className="card-modern" style={{ padding: '1.5rem' }}>
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><UsersRound size={18} /> Gestion des Accès</span>
              <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                Administrez les comptes des collaborateurs accédant à votre console de gestion ToqueHub.
              </p>
              
              <div className="user-profile-premium">
                <div className="user-profile-avatar">
                  {(session.user.username ?? 'U').substring(0, 2).toUpperCase()}
                </div>
                <div className="user-profile-details">
                  <span className="user-profile-name">{session.user.username}</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="user-profile-role-badge">
                      <Crown size={12} /> {session.user.role}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      · {session.user.email ?? 'Aucun email configuré'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '16px', border: '1px solid var(--light-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>Console d'administration générale</strong>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Ajoutez de nouveaux profils collaborateurs, attribuez des rôles ou révoquez les accès temporaires.
                  </span>
                </div>
                <button className="btn btn-primary" onClick={onOpenUsers} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', borderRadius: '10px' }}>
                  <UsersRound size={16} /> Gérer les utilisateurs <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {activeSubTab === 'api-keys' && (
            <div className="card-modern" id="api-keys" style={{ padding: '1.5rem', ...(focusApiKeys ? { borderColor: 'rgba(245, 158, 11, 0.6)', boxShadow: '0 0 0 4px rgba(245, 158, 11, 0.12)' } : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}><KeyRound size={18} /> Clés API & IA</span>
                  <p className="muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 0 0' }}>Configurez vos services d'intelligence artificielle locale.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      background: 'rgba(59, 130, 246, 0.08)',
                      color: '#2563eb',
                      border: '1px solid rgba(59, 130, 246, 0.15)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.3rem 0.65rem',
                      borderRadius: '20px',
                    }}
                  >
                    <span style={{ display: 'inline-flex', borderRadius: '1.5px', overflow: 'hidden', width: '15px', height: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                      <span style={{ width: '33.3%', background: '#002395', height: '100%' }}></span>
                      <span style={{ width: '33.3%', background: '#FFFFFF', height: '100%' }}></span>
                      <span style={{ width: '33.3%', background: '#ED2939', height: '100%' }}></span>
                    </span>
                    Souveraineté Française
                  </span>
                  <span className={`badge ${apiKeyConfigured ? 'badge-reception' : 'badge-correction'}`}>
                    {apiKeyConfigured ? 'Mistral activé' : 'Non configuré'}
                  </span>
                </div>
              </div>

              {/* Logo container */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', background: '#f8fafc', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--light-border)', marginBottom: '1.5rem' }}>
                <div style={{ background: 'white', padding: '0.6rem 1rem', borderRadius: '12px', border: '1px solid var(--light-border)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                  <img
                    src="/mistral-logo.png"
                    alt="Mistral AI Logo"
                    style={{
                      height: '30px',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 2px 4px rgba(249, 115, 22, 0.1))',
                    }}
                  />
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, margin: 0, flex: 1 }}>
                  <strong>Mistral AI</strong> est le leader français de l'IA. En configurant votre clé API, vous activez l'OCR intelligent de ToqueHub pour déchiffrer instantanément vos factures et bons de commande. Vos données restent hébergées en France.
                </p>
              </div>

              {apiKeyMasked ? (
                <div className="alert-modern info" style={{ marginBottom: '1.25rem', background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
                  <ShieldCheck size={16} style={{ color: '#10b981' }} />
                  <span style={{ fontSize: '0.85rem' }}>Clé API active enregistrée : <code>{apiKeyMasked}</code></span>
                </div>
              ) : null}
              {focusApiKeys ? <div className="alert-modern error" style={{ marginBottom: '1.25rem' }}><Info size={16} /> Veuillez ajouter une clé API Mistral pour activer l'extraction de factures.</div> : null}
              {apiKeyError ? <div className="alert-modern error" style={{ marginBottom: '1.25rem' }}><AlertCircle size={16} /> {apiKeyError}</div> : null}
              {apiKeyMessage ? <div className="alert-modern success" style={{ marginBottom: '1.25rem' }}><CheckCircle2 size={16} /> {apiKeyMessage}</div> : null}
              
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', marginBottom: '1.25rem', color: 'var(--text-main)' }}>
                Clé API Mistral AI
                <div className="api-key-input-container">
                  <input
                    type="password"
                    placeholder={apiKeyConfigured ? 'Nouvelle clé ou laisser vide pour supprimer' : 'mistral-api-key-...'}
                    value={mistralKey}
                    onChange={(event) => setMistralKey(event.target.value)}
                    autoFocus={focusApiKeys}
                  />
                </div>
              </label>
              
              <button className="btn btn-primary" onClick={() => void saveApiKey()} disabled={savingApiKey} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.5rem', borderRadius: '10px' }}>
                {savingApiKey ? 'Enregistrement…' : apiKeyConfigured && !mistralKey.trim() ? 'Supprimer la clé' : 'Sauvegarder la clé'}
              </button>
            </div>
          )}

          {activeSubTab === 'core' && (
            <div className="card-modern" style={{ padding: '1.5rem' }}>
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><Server size={18} /> Diagnostic de l'Instance</span>
              <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                Vue d'ensemble technique et état de santé du serveur ToqueHub local.
              </p>
              
              {/* Visual Stack Schema */}
              <div className="tech-stack-container">
                <div className="tech-stack-visual">
                  <div className="tech-stack-node active">
                    <div className="tech-stack-node-icon" style={{ background: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6' }}>
                      <Workflow size={20} />
                    </div>
                    <span className="tech-stack-node-title">Interface Web</span>
                    <span className="tech-stack-node-desc">React 18 / Vite</span>
                  </div>
                  
                  <div className="tech-stack-arrow">
                    <ArrowRight size={18} />
                  </div>
                  
                  <div className="tech-stack-node active">
                    <div className="tech-stack-node-icon" style={{ background: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6' }}>
                      <Server size={20} />
                    </div>
                    <span className="tech-stack-node-title">Next.js Core</span>
                    <span className="tech-stack-node-desc">Node API Locale</span>
                  </div>
                  
                  <div className="tech-stack-arrow">
                    <ArrowRight size={18} />
                  </div>
                  
                  <div className="tech-stack-node active">
                    <div className="tech-stack-node-icon" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>
                      <ShieldCheck size={20} />
                    </div>
                    <span className="tech-stack-node-title">SQLite (Prisma)</span>
                    <span className="tech-stack-node-desc">BDD Privée Chiffrée</span>
                  </div>
                </div>
              </div>

              <div className="settings-list">
                <div>
                  <span>Statut du Core</span>
                  <strong style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span className="status-indicator-dot green"></span> Actif & Connecté
                  </strong>
                </div>
                <div>
                  <span>Version du Logiciel</span>
                  <strong>v0.1.0-alpha (instance_souveraine)</strong>
                </div>
                <div>
                  <span>Base de Données locale</span>
                  <strong>Prisma Client / SQLite (Opérationnel)</strong>
                </div>
                <div>
                  <span>Hébergement & Souveraineté</span>
                  <strong>Propriété exclusive de l'établissement (France)</strong>
                </div>
              </div>
            </div>
          )}
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
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

function Modal({ isOpen, onClose, title, children, size }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay" onClick={onClose} style={{ pointerEvents: 'auto' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={`modal-content-wrapper modal-${size || 'md'}`}
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
type ProductFormPayload = {
  name: string;
  sku?: string;
  description?: string;
  unitId: string;
  categoryId?: string | null;
  primarySupplierId?: string | null;
  averagePrice?: number;
  minimumStock?: number;
};

interface ProductFormProps {
  categories: Category[];
  units: Unit[];
  suppliers: Supplier[];
  initialName?: string;
  initialProduct?: Product | null;
  submitLabel?: string;
  onSubmit: (payload: ProductFormPayload) => Promise<void>;
  onClose: () => void;
}

function ProductForm({ categories, units, suppliers, initialName = '', initialProduct = null, submitLabel, onSubmit, onClose }: ProductFormProps) {
  const [name, setName] = useState(initialProduct?.name ?? initialName);
  const [sku, setSku] = useState(initialProduct?.sku ?? initialProduct?.reference ?? '');
  const [description, setDescription] = useState(initialProduct?.description ?? '');
  const [unitId, setUnitId] = useState(initialProduct?.unitId || units[0]?.id || '');
  const [categoryId, setCategoryId] = useState(initialProduct?.categoryId ?? initialProduct?.category?.id ?? '');
  const [supplierId, setSupplierId] = useState(initialProduct?.primarySupplierId ?? initialProduct?.supplierId ?? initialProduct?.primarySupplier?.id ?? initialProduct?.supplier?.id ?? '');
  const [averagePrice, setAveragePrice] = useState(String(initialProduct ? numeric(initialProduct.averagePrice ?? initialProduct.averagePurchasePrice ?? initialProduct.weightedAveragePrice) || '' : ''));
  const [minimumStock, setMinimumStock] = useState(String(initialProduct ? numeric(initialProduct.minimumStock ?? initialProduct.minStock) || '' : ''));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setName(initialProduct?.name ?? initialName);
    setSku(initialProduct?.sku ?? initialProduct?.reference ?? '');
    setDescription(initialProduct?.description ?? '');
    setUnitId(initialProduct?.unitId || units[0]?.id || '');
    setCategoryId(initialProduct?.categoryId ?? initialProduct?.category?.id ?? '');
    setSupplierId(initialProduct?.primarySupplierId ?? initialProduct?.supplierId ?? initialProduct?.primarySupplier?.id ?? initialProduct?.supplier?.id ?? '');
    setAveragePrice(String(initialProduct ? numeric(initialProduct.averagePrice ?? initialProduct.averagePurchasePrice ?? initialProduct.weightedAveragePrice) || '' : ''));
    setMinimumStock(String(initialProduct ? numeric(initialProduct.minimumStock ?? initialProduct.minStock) || '' : ''));
  }, [initialName, initialProduct, units]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !unitId) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit({
        name: name.trim(),
        sku: sku.trim() || undefined,
        description: description.trim() || undefined,
        unitId,
        categoryId: categoryId || (initialProduct ? null : undefined),
        primarySupplierId: supplierId || (initialProduct ? null : undefined),
        averagePrice: averagePrice ? Number(averagePrice) : undefined,
        minimumStock: minimumStock ? Number(minimumStock) : undefined,
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

      <label>
        Description
        <textarea
          rows={3}
          placeholder="Notes produit, conditionnement, marque, informations utiles..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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

      <div className="form-row">
        <label>
          Fournisseur principal
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Non renseigné</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        </label>
        <label>
          Prix moyen pondéré (€)
          <input type="number" min="0" step="0.0001" value={averagePrice} onChange={(e) => setAveragePrice(e.target.value)} />
        </label>
        <label>
          Stock minimum
          <input type="number" min="0" step="0.001" value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} />
        </label>
      </div>

      <div className="modal-footer" style={{ margin: '1.5rem -1.75rem -1.75rem', padding: '1rem 1.75rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim() || !unitId}>
          {submitting ? 'Enregistrement...' : (submitLabel ?? 'Créer le produit')}
        </button>
      </div>
    </form>
  );
}

function ProductDetailModal({
  product,
  stocks,
  movements,
  categories,
  units,
  suppliers,
  onClose,
  onUpdate,
}: {
  product: Product | null;
  stocks: Stock[];
  movements: StockMovement[];
  categories: Category[];
  units: Unit[];
  suppliers: Supplier[];
  onClose: () => void;
  onUpdate: (productId: string, payload: ProductFormPayload) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [product?.id]);

  if (!product) return null;

  const productStocks = stocks.filter((stock) => stock.product?.id === product.id);
  const productMovements = movements.filter((movement) => movement.product?.id === product.id).slice(0, 6);
  const totalQuantity = productStocks.reduce((sum, stock) => sum + numeric(stock.currentQuantity ?? stock.quantity), 0);
  const averagePrice = numeric(product.averagePrice ?? product.averagePurchasePrice ?? product.weightedAveragePrice);
  const stockValue = productStocks.reduce((sum, stock) => sum + numeric(stock.stockValue ?? stock.value ?? numeric(stock.currentQuantity ?? stock.quantity) * averagePrice), 0);
  const minimumStock = numeric(product.minimumStock ?? product.minStock);
  const supplierName = product.primarySupplier?.name ?? product.supplier?.name ?? 'Non renseigné';

  return (
    <Modal isOpen={Boolean(product)} onClose={onClose} title={product.name} size="lg">
      {editing ? (
        <ProductForm
          categories={categories}
          units={units}
          suppliers={suppliers}
          initialProduct={product}
          submitLabel="Enregistrer les modifications"
          onSubmit={async (payload) => {
            await onUpdate(product.id, payload);
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      ) : (
        <div className="product-detail">
          <div className="product-detail-hero">
            <div>
              <span className="product-detail-kicker">Fiche produit</span>
              <h3>{product.name}</h3>
              <div className="product-detail-badges">
                <span className="badge badge-inventory">{product.sku || 'Sans SKU'}</span>
                <span className="badge badge-production">{product.category?.name ?? 'Sans catégorie'}</span>
                <span className="badge badge-reception">{product.unit?.name ?? 'Unité'} ({product.unit?.symbol ?? '—'})</span>
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
              <Edit3 size={15} /> Modifier
            </button>
          </div>

          <div className="product-detail-metrics">
            <Metric icon={<Boxes size={18} />} value={totalQuantity.toFixed(3).replace(/\.?0+$/, '')} label="Quantité en stock" tone="blue" />
            <Metric icon={<TrendingUp size={18} />} value={`${stockValue.toFixed(2)} €`} label="Valeur stock" tone="emerald" />
            <Metric icon={<Scale size={18} />} value={`${averagePrice.toFixed(4)} €`} label="Prix moyen" tone="amber" />
            <Metric icon={<AlertCircle size={18} />} value={minimumStock ? String(minimumStock) : '—'} label="Stock mini" tone="orange" />
          </div>

          <div className="product-detail-grid">
            <div className="product-detail-panel">
              <span className="product-detail-section-title">Informations</span>
              <dl className="product-detail-list">
                <div><dt>Fournisseur</dt><dd>{supplierName}</dd></div>
                <div><dt>Catégorie</dt><dd>{product.category?.name ?? 'Non catégorisé'}</dd></div>
                <div><dt>Unité</dt><dd>{product.unit?.name ?? '—'} ({product.unit?.symbol ?? '—'})</dd></div>
                <div><dt>Prix moyen</dt><dd>{averagePrice.toFixed(4)} €</dd></div>
              </dl>
              {product.description ? <p className="product-detail-description">{product.description}</p> : null}
            </div>

            <div className="product-detail-panel">
              <span className="product-detail-section-title">Stock par emplacement</span>
              {productStocks.length ? (
                <div className="product-detail-mini-table">
                  {productStocks.map((stock) => (
                    <div key={stock.id}>
                      <span>{stock.site?.name ?? 'Site'} / {stock.location?.name ?? 'Emplacement'}</span>
                      <strong>{numeric(stock.currentQuantity ?? stock.quantity).toFixed(3).replace(/\.?0+$/, '')}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyMini title="Aucun stock" text="Ce produit n’a pas encore de quantité enregistrée." />
              )}
            </div>
          </div>

          <div className="product-detail-panel">
            <span className="product-detail-section-title">Derniers mouvements</span>
            {productMovements.length ? (
              <div className="product-detail-mini-table">
                {productMovements.map((movement) => (
                  <div key={movement.id}>
                    <span>{movementLabels[movement.type] ?? movement.type} · {movement.date ? new Date(movement.date).toLocaleDateString('fr-FR') : '—'}</span>
                    <strong>{movementSign(movement.type)}{numeric(movement.quantity).toFixed(3).replace(/\.?0+$/, '')}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyMini title="Aucun mouvement" text="Les réceptions et sorties apparaîtront ici." />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// Supplier Form
interface SupplierFormProps {
  initialName?: string;
  onSubmit: (payload: { name: string; contactName?: string; email?: string; phone?: string; address?: string; notes?: string }) => Promise<void>;
  onClose: () => void;
}

function SupplierForm({ initialName = '', onSubmit, onClose }: SupplierFormProps) {
  const [name, setName] = useState(initialName);
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

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

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  }

  const items: Array<{
    key: keyof typeof payload;
    title: string;
    desc: string;
    icon: ReactNode;
    colorClass: string;
  }> = [
    {
      key: 'categories',
      title: 'Catégories courantes',
      desc: 'Épicerie, frais, surgelés, boissons…',
      icon: <Layers size={20} />,
      colorClass: 'tone-emerald'
    },
    {
      key: 'units',
      title: 'Unités courantes',
      desc: 'kg, g, L, mL, pièce, carton…',
      icon: <Scale size={20} />,
      colorClass: 'tone-purple'
    },
    {
      key: 'sites',
      title: 'Sites de stockage',
      desc: 'Restaurant principal, cuisine centrale…',
      icon: <Warehouse size={20} />,
      colorClass: 'tone-blue'
    },
    {
      key: 'locations',
      title: 'Emplacements internes',
      desc: 'Réserve sèche, chambres froides, quai…',
      icon: <MapPin size={20} />,
      colorClass: 'tone-orange'
    },
    {
      key: 'examples',
      title: 'Exemples métier',
      desc: 'Quelques produits et mouvements de démonstration pour démarrer',
      icon: <Sparkles size={20} />,
      colorClass: 'tone-warning'
    }
  ];

  return (
    <form onSubmit={submitForm} className="prefill-wizard-form">
      <div className="prefill-wizard-header">
        <Info size={18} />
        <p>Préremplissez votre établissement en sélectionnant les données de base à initialiser. Vos données existantes ne seront pas supprimées.</p>
      </div>

      <motion.div
        className="prefill-options-list"
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.05
            }
          }
        }}
      >
        {items.map(({ key, title, desc, icon, colorClass }) => {
          const isChecked = payload[key];
          return (
            <motion.div
              key={key}
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: { opacity: 1, y: 0 }
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className={`prefill-option-card ${isChecked ? 'checked' : ''}`}
              onClick={() => setPayload(p => ({ ...p, [key]: !p[key] }))}
            >
              <div className="prefill-shine-effect" />
              <div className={`prefill-option-icon-wrapper ${colorClass}`}>
                {icon}
              </div>
              <div className="prefill-info">
                <span className="prefill-title">{title}</span>
                <span className="prefill-desc">{desc}</span>
              </div>
              <div className="prefill-checkbox-custom">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      <div className="modal-footer" style={{ margin: '1.5rem -1.75rem -1.75rem', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Plus tard
        </button>
        <button className="btn btn-primary" disabled={submitting} style={{ minWidth: '180px' }}>
          {submitting ? 'Préremplissage…' : 'Lancer le préremplissage'}
        </button>
      </div>
    </form>
  );
}

function StocksOcrImportPanel({ statuses, onUpload, onOpenExtraction, onDownload }: { statuses: StocksOcrStatus[]; onUpload: (files: File[]) => Promise<void>; onOpenExtraction: (extractionId: string) => Promise<void>; onDownload: (documentId: string, filename: string) => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submitFiles() {
    if (!files.length) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onUpload(files);
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Le document n’a pas pu être analysé. Vérifiez qu’il est lisible et réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  function removeFile(indexToRemove: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  }

  return (
    <div className="stocks-ocr-import">
      {error ? <div className="alert-modern error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /> {error}</div> : null}
      
      <label
        className="stocks-ocr-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const dropped = Array.from(event.dataTransfer.files ?? []).slice(0, 8);
          if (dropped.length) setFiles(dropped);
        }}
      >
        <FileText size={32} style={{ color: '#10b981' }} />
        <span>Déposer vos documents ici ou cliquer pour parcourir</span>
        <small>Formats acceptés : PDF, PNG, JPEG, WEBP, HEIC (Jusqu'à 8 fichiers simultanés)</small>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,image/avif,.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.avif"
          multiple
          onChange={(event) => {
            const next = Array.from(event.target.files ?? []).slice(0, 8);
            setFiles(next);
          }}
        />
      </label>

      {files.length ? (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Fichiers prêts pour l'analyse ({files.length})
          </div>
          <div className="stocks-ocr-file-list">
            {files.map((file, idx) => (
              <div key={`${file.name}-${file.size}-${idx}`} className="stocks-ocr-file-row">
                <FileText size={18} style={{ color: '#64748b' }} />
                <div className="stocks-ocr-file-row-details">
                  <span>{file.name}</span>
                  <small>{formatBytes(file.size)} · {fileTypeLabel(file)}</small>
                </div>
                <button type="button" className="stocks-ocr-file-remove" onClick={() => removeFile(idx)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="modal-footer" style={{ margin: '1rem -1.75rem 0', padding: '1.25rem 1.75rem', background: '#fafbfe', borderTop: '1px solid var(--light-border)' }}>
        <button className="btn btn-primary" disabled={!files.length || submitting} onClick={() => void submitFiles()} style={{ padding: '0.65rem 1.5rem', borderRadius: '10px' }}>
          {submitting ? 'Préparation de l\'import…' : 'Lancer l’analyse OCR'}
        </button>
      </div>

      {statuses.length ? (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Suivi des analyses de l'instance ({statuses.length})
          </div>
          <div className="ocr-statuses-list">
            {statuses.map((status) => {
              const isError = status.state.toLowerCase().includes('err') || status.state === 'erreur';
              const isSuccess = status.state === 'vérifier' || Boolean(status.extraction);
              const isAnalyzing = status.state === 'analyse' || status.state === 'en cours';
              const isPending = status.state === 'en attente';
              
              let fillClass = 'uploading';
              let stateText = 'Téléchargement…';
              if (isError) {
                fillClass = 'error';
                stateText = status.ocr?.errorMessage || 'Erreur d\'analyse';
              } else if (isSuccess) {
                fillClass = 'success';
                stateText = 'Prêt à valider';
              } else if (isAnalyzing) {
                fillClass = 'analyzing';
                stateText = 'Extraction Mistral AI…';
              } else if (isPending) {
                fillClass = 'pending';
                stateText = 'Dans la file d\'attente';
              }

              return (
                <div key={status.document.id} className="ocr-status-card" style={isSuccess ? { borderLeft: '3px solid #10b981' } : undefined}>
                  <div className="ocr-status-card-info">
                    <span className="ocr-status-card-title">{status.document.originalName}</span>
                    <div className="ocr-status-card-meta">
                      <span>{formatBytes(status.document.sizeBytes)}</span>
                      <span>•</span>
                      <span style={{ 
                        color: isError ? 'var(--danger)' : isSuccess ? 'var(--success)' : 'var(--text-muted)',
                        fontWeight: (isSuccess || isError) ? 700 : 'normal'
                      }}>{stateText}</span>
                    </div>
                    <div className="ocr-status-progress-bar">
                      <div className={`ocr-status-progress-fill ${fillClass}`}></div>
                    </div>
                  </div>
                  
                  <div className="ocr-status-card-actions">
                    {status.extraction ? (
                      <button className="btn btn-primary btn-sm" onClick={() => void onOpenExtraction(status.extraction!.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '8px' }}>
                        Vérifier <ArrowRight size={12} />
                      </button>
                    ) : null}
                    <button className="btn btn-secondary btn-sm" onClick={() => void onDownload(status.document.id, status.document.originalName)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '8px' }}>
                      <Download size={12} /> Original
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StocksOcrReviewPanel({ extraction, products, categories, suppliers, units, sites, locations, token, onSaveDraft, onCreateReception, onCreateProductFromLine, onCreateSupplierFromOcr, onClose }: { extraction: StocksOcrExtraction; products: Product[]; categories: Category[]; suppliers: Supplier[]; units: Unit[]; sites: Site[]; locations: Location[]; token: string; onSaveDraft: (payload: StocksOcrExtraction['data']) => Promise<void>; onCreateReception: (payload: StocksOcrExtraction['data']) => Promise<void>; onCreateProductFromLine: (line: StocksOcrLine, supplierId?: string | null) => Promise<Product>; onCreateSupplierFromOcr: (name: string) => Promise<Supplier>; onClose: () => void }) {
  const [draft, setDraft] = useState(() => normalizeOcrReceptionData(extraction.data));
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [productPickerLineIndex, setProductPickerLineIndex] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [submitting, setSubmitting] = useState<'draft' | 'create' | null>(null);
  const [error, setError] = useState<string>();
  const [creatingProductLineId, setCreatingProductLineId] = useState<string | null>(null);
  const [creatingAllProducts, setCreatingAllProducts] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const document = extraction.document ?? extraction.ocrDocument?.document;

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (zoomScale <= 1.0) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    e.preventDefault();
    setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  function resetViewer() {
    setZoomScale(1.0);
    setRotation(0);
    setPanOffset({ x: 0, y: 0 });
  }

  useEffect(() => {
    setDraft(enrichOcrProductMatches(resolveOcrReceptionUnits(normalizeOcrReceptionData(extraction.data), units), products));
  }, [extraction, units]);

  useEffect(() => {
    let active = true;
    if (!document?.id) return undefined;
    api.viewStocksDocument(token, document.id).then((url) => {
      if (active) setPreviewUrl(url);
      else URL.revokeObjectURL(url);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [document?.id, token]);

  const activeLines = draft.lines.filter((line) => !line.ignored);
  const missingProducts = activeLines.filter((line) => !line.productId).length;
  const invalidQuantities = activeLines.filter((line) => numeric(line.quantity) <= 0).length;
  const recognized = activeLines.filter((line) => line.matchingStatus === 'RECOGNIZED').length;
  const needsReview = activeLines.filter((line) => line.matchingStatus === 'NEEDS_REVIEW').length;
  const supplierCandidates = draft.supplierCandidates ?? draft.supplier?.candidates ?? [];
  const supplierMatchStatus = draft.supplierId ? (draft.supplierMatchingStatus ?? draft.supplier?.matchingStatus ?? 'RECOGNIZED') : 'NOT_FOUND';
  const supplierOcrName = draft.supplier?.name || draft.supplierName || '';

  function updateLine(index: number, patch: Partial<StocksOcrLine>) {
    setDraft((current) => ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, ...patch } : line) }));
  }

  function removeLine(index: number) {
    setDraft((current) => ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, ignored: true } : line) }));
  }

  function assignProductToLine(index: number, product: Product, score = 1) {
    updateLine(index, {
      productId: product.id,
      productName: product.name,
      unitId: product.unitId,
      matchedUnitSymbol: productUnitSymbol(product) || null,
      matchingStatus: 'RECOGNIZED',
      matchingScore: score,
    });
  }

  async function submit(kind: 'draft' | 'create') {
    setSubmitting(kind);
    setError(undefined);
    try {
      if (kind === 'draft') await onSaveDraft(draft);
      else await onCreateReception(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La réception OCR n’a pas pu être enregistrée.');
    } finally {
      setSubmitting(null);
    }
  }

  async function createSupplierFromOcr() {
    if (!supplierOcrName) return;
    setCreatingSupplier(true);
    setError(undefined);
    try {
      const supplier = await onCreateSupplierFromOcr(supplierOcrName);
      setDraft((current) => ({ ...current, supplierId: supplier.id, supplierName: supplier.name, supplierMatchingStatus: 'RECOGNIZED', supplierMatchingScore: 1 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Le fournisseur OCR n’a pas pu être créé.');
    } finally {
      setCreatingSupplier(false);
    }
  }

  async function createProductFromLine(line: StocksOcrLine, index: number) {
    const lineKey = line.id ?? `ocr-${index}`;
    setCreatingProductLineId(lineKey);
    setError(undefined);
    try {
      const product = await onCreateProductFromLine(line, draft.supplierId);
      updateLine(index, {
        productId: product.id,
        productName: product.name,
        unitId: product.unitId ?? line.unitId,
        matchingStatus: 'RECOGNIZED',
        matchingScore: 1,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Le produit OCR n’a pas pu être créé.');
    } finally {
      setCreatingProductLineId(null);
    }
  }

  async function createAllMissingProducts() {
    const linesToCreate = draft.lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => !line.ignored && !line.productId);
    if (!linesToCreate.length) return;
    setCreatingAllProducts(true);
    setError(undefined);
    const createdByKey = new Map<string, Product>();
    const failures: string[] = [];
    for (const { line, index } of linesToCreate) {
      const lineKey = line.id ?? `ocr-${index}`;
      const label = String(line.ocrLabel || line.label || '').trim();
      const reference = String(line.reference || '').trim();
      const dedupeKey = reference ? `sku:${reference}` : `name:${normalizeLookup(label)}`;
      try {
        setCreatingProductLineId(lineKey);
        const product = createdByKey.get(dedupeKey) ?? await onCreateProductFromLine(line, draft.supplierId);
        createdByKey.set(dedupeKey, product);
        updateLine(index, {
          productId: product.id,
          productName: product.name,
          unitId: product.unitId ?? line.unitId,
          matchingStatus: 'RECOGNIZED',
          matchingScore: 1,
        });
      } catch (err) {
        failures.push(label || `ligne ${index + 1}`);
      }
    }
    setCreatingProductLineId(null);
    setCreatingAllProducts(false);
    if (failures.length) {
      setError(`${failures.length} produit(s) n’ont pas pu être créés : ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''}`);
    }
  }

  return (
    <div className="stocks-ocr-review" style={{ gridTemplateColumns: '1fr' }}>
      <div className="stocks-ocr-editor">
        {error ? <div className="alert-modern error" style={{ marginBottom: '0.5rem' }}><AlertCircle size={16} /> {error}</div> : null}
        
        <div className="stocks-ocr-summary">
          <span className="badge badge-reception" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
            <CheckCircle2 size={13} /> {recognized} reconnus
          </span>
          <span className="badge badge-correction" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
            <Info size={13} /> {needsReview} à vérifier
          </span>
          <span className="badge badge-loss" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
            <AlertCircle size={13} /> {missingProducts} non reconnus
          </span>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!missingProducts || creatingAllProducts || creatingProductLineId !== null}
            onClick={() => void createAllMissingProducts()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '8px', padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 650 }}
          >
            <Package size={13} />
            {creatingAllProducts ? 'Création des produits…' : `Créer ${missingProducts === 1 ? 'le produit' : `les ${missingProducts} produits`}`}
          </button>
          
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowViewerModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto', borderRadius: '8px', padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 650 }}
          >
            <FileText size={13} />
            Afficher le document original
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-row">
            <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
              Fournisseur sélectionné
              <select value={draft.supplierId || ''} onChange={(e) => {
                const supplier = suppliers.find((item) => item.id === e.target.value);
                setDraft({ ...draft, supplierId: e.target.value || null, supplierName: (supplier?.name ?? supplierOcrName) || null, supplierMatchingStatus: e.target.value ? 'RECOGNIZED' : 'NOT_FOUND', supplierMatchingScore: e.target.value ? 1 : 0 });
              }}>
                <option value="">Non renseigné</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>
            <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
              Nom fournisseur OCR (extrait)
              <input value={draft.supplierName || ''} onChange={(e) => setDraft({ ...draft, supplierName: e.target.value })} />
            </label>
          </div>

          <div className="alert-modern" style={{ margin: 0, alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`badge ${ocrMatchClass(supplierMatchStatus)}`}>{ocrMatchLabel(supplierMatchStatus)}</span>
              {draft.supplierId ? `Fournisseur lié : ${suppliers.find((supplier) => supplier.id === draft.supplierId)?.name ?? draft.supplierName ?? 'sélectionné'}` : `Fournisseur OCR : ${supplierOcrName || 'non détecté'}`}
            </span>
            {!draft.supplierId && supplierOcrName ? (
              <button type="button" className="btn btn-secondary btn-sm" disabled={creatingSupplier} onClick={() => void createSupplierFromOcr()}>
                <Plus size={13} /> {creatingSupplier ? 'Création…' : 'Créer fournisseur'}
              </button>
            ) : null}
            {!draft.supplierId && supplierCandidates.length ? (
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {supplierCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDraft({ ...draft, supplierId: candidate.id, supplierName: candidate.name, supplierMatchingStatus: 'RECOGNIZED', supplierMatchingScore: candidate.score })}
                  >
                    {candidate.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="form-row">
            <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
              N° Facture
              <input value={draft.invoiceNumber || ''} onChange={(e) => setDraft({ ...draft, invoiceNumber: e.target.value })} placeholder="Ex: FR-8492" />
            </label>
            <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
              N° Bon de livraison
              <input value={draft.deliveryNoteNumber || ''} onChange={(e) => setDraft({ ...draft, deliveryNoteNumber: e.target.value })} placeholder="Ex: BL-4919" />
            </label>
            <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
              N° Commande
              <input value={draft.purchaseOrderNumber || ''} onChange={(e) => setDraft({ ...draft, purchaseOrderNumber: e.target.value })} placeholder="Ex: BC-8201" />
            </label>
          </div>

          <div className="form-row">
            <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
              Date document
              <input type="date" value={dateInputValue(draft.documentDate)} onChange={(e) => setDraft({ ...draft, documentDate: e.target.value || null })} />
            </label>
            <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
              Date de livraison
              <input type="date" value={dateInputValue(draft.deliveryDate)} onChange={(e) => setDraft({ ...draft, deliveryDate: e.target.value || null })} />
            </label>
            <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
              Total TTC (€)
              <input type="number" step="0.01" value={draft.totalIncludingTax ?? ''} onChange={(e) => setDraft({ ...draft, totalIncludingTax: e.target.value ? Number(e.target.value) : null })} />
            </label>
          </div>

          <div className="form-row">
            <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
              Site destination
              <select value={draft.siteId || ''} onChange={(e) => setDraft({ ...draft, siteId: e.target.value || null })}>
                <option value="">Non précisé</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
            <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
              Emplacement destination
              <select value={draft.locationId || ''} onChange={(e) => setDraft({ ...draft, locationId: e.target.value || null })}>
                <option value="">Non précisé</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="table-wrapper stocks-ocr-lines" style={{ marginTop: '0.5rem' }}>
          <table className="table-modern">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Libellé OCR</th>
                <th style={{ width: '28%' }}>Produit ToqueHub</th>
                <th style={{ width: '8%' }}>Qté</th>
                <th style={{ width: '10%' }}>Unité</th>
                <th style={{ width: '8%' }}>P.U.</th>
                <th style={{ width: '8%' }}>Total</th>
                <th style={{ width: '10%' }}>Lot</th>
                <th style={{ width: '12%' }}>DLC</th>
                <th style={{ width: '6%' }}>Statut</th>
                <th style={{ width: '4%' }}></th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line, index) => line.ignored ? null : (
                <tr key={line.id ?? index}>
                  <td>
                    <input 
                      value={line.ocrLabel || line.label || ''} 
                      onChange={(e) => updateLine(index, { ocrLabel: e.target.value })} 
                      title={line.ocrLabel || line.label || ''}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="ocr-product-picker-trigger"
                        onClick={() => setProductPickerLineIndex(index)}
                        title={line.productName || 'Rechercher un produit ToqueHub'}
                      >
                        <Search size={13} />
                        <span>{line.productName || 'Rechercher / assigner'}</span>
                      </button>
                      {line.productId ? (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => updateLine(index, { productId: null, productName: null, matchingStatus: 'NOT_FOUND', matchingScore: 0 })}
                          title="Désassigner le produit"
                        >
                          <X size={13} />
                        </button>
                      ) : null}
                      {!line.productId ? (
                        <button 
                          className="btn btn-secondary btn-sm" 
                          disabled={creatingProductLineId === (line.id ?? `ocr-${index}`)}
                          onClick={() => void createProductFromLine(line, index)}
                          style={{ padding: '0.25rem 0.5rem', flexShrink: 0, borderRadius: '6px' }}
                          title="Créer un nouveau produit"
                        >
                          {creatingProductLineId === (line.id ?? `ocr-${index}`) ? '…' : '+'}
                        </button>
                      ) : null}
                    </div>
                    {line.productCandidates?.length && line.matchingStatus !== 'RECOGNIZED' ? (
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                        {line.productCandidates.map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.15rem 0.4rem', borderRadius: '6px', fontSize: '0.72rem' }}
                            onClick={() => {
                              const product = products.find((item) => item.id === candidate.id);
                              if (product) assignProductToLine(index, product, numeric(candidate.score));
                              else updateLine(index, { productId: candidate.id, productName: candidate.name, unitId: candidate.unitId ?? line.unitId, matchingStatus: 'RECOGNIZED', matchingScore: candidate.score });
                            }}
                          >
                            {candidate.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <input type="number" min="0" step="0.001" value={line.quantity ?? ''} onChange={(e) => updateLine(index, { quantity: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td>
                    <select value={line.unitId || ''} onChange={(e) => updateLine(index, { unitId: e.target.value || null })}>
                      <option value="">Choisir</option>
                      {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="number" step="0.0001" value={line.unitPrice ?? ''} onChange={(e) => updateLine(index, { unitPrice: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td>
                    <input type="number" step="0.0001" value={line.lineTotal ?? line.total ?? ''} onChange={(e) => updateLine(index, { lineTotal: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td>
                    <input value={line.lotNumber || ''} onChange={(e) => updateLine(index, { lotNumber: e.target.value })} />
                  </td>
                  <td>
                    <input type="date" value={dateInputValue(line.bestBeforeDate)} onChange={(e) => updateLine(index, { bestBeforeDate: e.target.value || null })} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${ocrMatchClass(line.matchingStatus)}`}>
                      {ocrMatchLabel(line.matchingStatus)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" className="icon-btn danger" onClick={() => removeLine(index)} title="Supprimer la ligne">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(missingProducts || invalidQuantities) ? (
          <div className="alert-modern error" style={{ margin: '0' }}>
            <AlertCircle size={16} /> 
            <span>
              {missingProducts ? `${missingProducts} produit(s) non reconnu(s) dans ToqueHub. ` : ''}
              {invalidQuantities ? `${invalidQuantities} quantité(s) invalides.` : ''}
            </span>
          </div>
        ) : null}

        <div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem', padding: '1.25rem 1.75rem', background: '#fafbfe', borderTop: '1px solid var(--light-border)' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ borderRadius: '10px' }}>Annuler</button>
          <button className="btn btn-secondary" disabled={submitting !== null} onClick={() => void submit('draft')} style={{ borderRadius: '10px' }}>
            {submitting === 'draft' ? 'Enregistrement…' : 'Enregistrer le brouillon'}
          </button>
          <button className="btn btn-primary" disabled={submitting !== null || missingProducts > 0 || invalidQuantities > 0} onClick={() => void submit('create')} style={{ borderRadius: '10px' }}>
            {submitting === 'create' ? 'Création de la réception…' : 'Valider la réception'}
          </button>
        </div>
      </div>

      {/* Lightbox / Viewer Modal */}
      <ProductAssignmentModal
        isOpen={productPickerLineIndex !== null}
        line={productPickerLineIndex !== null ? draft.lines[productPickerLineIndex] : null}
        products={products}
        categories={categories}
        suppliers={suppliers}
        units={units}
        supplierId={draft.supplierId}
        onClose={() => setProductPickerLineIndex(null)}
        onSelect={(product, score) => {
          if (productPickerLineIndex === null) return;
          assignProductToLine(productPickerLineIndex, product, score);
          setProductPickerLineIndex(null);
        }}
      />

      <Modal isOpen={showViewerModal} onClose={() => { setShowViewerModal(false); resetViewer(); }} title={`Aperçu : ${document?.originalName || 'Document'}`} size="lg">
        <div
          style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '520px', background: '#0f172a', borderRadius: '12px', position: 'relative', border: '1px solid rgba(255,255,255,0.06)', cursor: zoomScale > 1.0 ? (isDragging ? 'grabbing' : 'grab') : 'default', touchAction: 'none', userSelect: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) rotate(${rotation}deg) scale(${zoomScale})`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-in-out',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            padding: '1.5rem'
          }}>
            {previewUrl && document?.mimeType?.startsWith('image/') ? (
              <img src={previewUrl} alt={document.originalName} draggable={false} style={{ maxWidth: '100%', maxHeight: '460px', objectFit: 'contain', borderRadius: '6px', pointerEvents: 'none' }} />
            ) : null}
            {previewUrl && document?.mimeType === 'application/pdf' ? (
              <iframe src={previewUrl} title={document.originalName} style={{ width: '100%', height: '460px', border: 'none', borderRadius: '6px', background: 'white', pointerEvents: zoomScale > 1.0 ? 'none' : 'auto' }} />
            ) : null}
            {!previewUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: 'rgba(255,255,255,0.4)' }}>
                <FileText size={48} />
                <span style={{ fontSize: '0.9rem' }}>Aperçu indisponible</span>
              </div>
            ) : null}
          </div>
          
          {/* Controls Overlay */}
          <div style={{
            position: 'absolute',
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '30px',
            padding: '0.4rem 0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            zIndex: 100,
            boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
          }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setZoomScale(z => Math.min(z + 0.2, 3.0)); setPanOffset({ x: 0, y: 0 }); }} style={{ color: 'white', background: 'transparent', border: 'none', padding: '0.2rem', display: 'flex', cursor: 'pointer' }} title="Zoomer">
              <ZoomIn size={15} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setZoomScale(z => { const next = Math.max(z - 0.2, 0.5); if (next <= 1.0) setPanOffset({ x: 0, y: 0 }); return next; }); }} style={{ color: 'white', background: 'transparent', border: 'none', padding: '0.2rem', display: 'flex', cursor: 'pointer' }} title="Dézoomer">
              <ZoomOut size={15} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRotation(r => (r + 90) % 360)} style={{ color: 'white', background: 'transparent', border: 'none', padding: '0.2rem', display: 'flex', cursor: 'pointer' }} title="Pivoter 90°">
              <RotateCw size={15} />
            </button>
            <span style={{ height: '12px', width: '1px', background: 'rgba(255,255,255,0.2)' }}></span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetViewer} style={{ color: 'white', background: 'transparent', border: 'none', padding: '0.15rem 0.4rem', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }} title="Réinitialiser">
              <Maximize size={12} /> Reset
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

function ProductAssignmentModal({
  isOpen,
  line,
  products,
  categories,
  suppliers,
  units,
  supplierId,
  onSelect,
  onClose,
}: {
  isOpen: boolean;
  line: StocksOcrLine | null;
  products: Product[];
  categories: Category[];
  suppliers: Supplier[];
  units: Unit[];
  supplierId?: string | null;
  onSelect: (product: Product, score: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [matchFilter, setMatchFilter] = useState<'all' | 'best' | 'supplier' | 'uncategorized'>('all');

  useEffect(() => {
    if (!isOpen || !line) return;
    setQuery(String(line.ocrLabel || line.label || '').trim());
    setSupplierFilter(supplierId || '');
    setCategoryFilter('');
    setUnitFilter(line.unitId || '');
    setMatchFilter('all');
  }, [isOpen, line?.id, supplierId]);

  const rankedProducts = useMemo(() => {
    if (!line) return [];
    const search = normalizeSearchText(query);
    return products
      .filter((product) => !isArchived(product))
      .map((product) => {
        const supplierName = product.primarySupplier?.name ?? product.supplier?.name ?? '';
        const categoryName = product.category?.name ?? '';
        const searchHaystack = normalizeSearchText(`${product.name} ${product.sku ?? product.reference ?? ''} ${supplierName} ${categoryName} ${product.unit?.symbol ?? ''}`);
        const textMatch = !search || search.split(' ').every((part) => searchHaystack.includes(part));
        const score = scoreProductForOcrLine(line, product, supplierId);
        return { product, score, textMatch };
      })
      .filter(({ product, score, textMatch }) => {
        if (supplierFilter && productSupplierId(product) !== supplierFilter) return false;
        if (categoryFilter && (product.categoryId ?? product.category?.id) !== categoryFilter) return false;
        if (unitFilter && product.unitId !== unitFilter) return false;
        if (matchFilter === 'best' && score < 0.58) return false;
        if (matchFilter === 'supplier' && (!supplierId || productSupplierId(product) !== supplierId)) return false;
        if (matchFilter === 'uncategorized' && (product.categoryId || product.category?.id)) return false;
        return textMatch || score >= 0.42;
      })
      .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
      .slice(0, 80);
  }, [products, line, query, supplierFilter, categoryFilter, unitFilter, matchFilter, supplierId]);

  if (!line) return null;

  const ocrLabel = String(line.ocrLabel || line.label || '').trim();
  const ocrReference = String(line.reference || '').trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assigner un produit ToqueHub" size="xl">
      <div className="ocr-product-selector">
        <div className="ocr-product-selector-context">
          <div>
            <span className="ocr-product-selector-kicker">Ligne OCR</span>
            <strong>{ocrLabel || 'Libellé non renseigné'}</strong>
          </div>
          <div className="ocr-product-selector-meta">
            {ocrReference ? <span>Réf. {ocrReference}</span> : null}
            {line.quantity ? <span>Qté {line.quantity}</span> : null}
            {line.unit || line.matchedUnitSymbol ? <span>{line.unit || line.matchedUnitSymbol}</span> : null}
          </div>
        </div>

        <div className="ocr-product-selector-toolbar">
          <div className="search-input-wrapper ocr-product-selector-search">
            <Search size={16} />
            <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par nom, référence, fournisseur, catégorie..." autoFocus />
          </div>
          <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            <option value="">Tous fournisseurs</option>
            {suppliers.filter((supplier) => !isArchived(supplier)).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.filter((category) => !isArchived(category)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
            <option value="">Toutes unités</option>
            {units.filter((unit) => !isArchived(unit)).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}
          </select>
          <select value={matchFilter} onChange={(event) => setMatchFilter(event.target.value as typeof matchFilter)}>
            <option value="all">Tous scores</option>
            <option value="best">Bons rapprochements</option>
            <option value="supplier">Même fournisseur</option>
            <option value="uncategorized">Sans catégorie</option>
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQuery(''); setSupplierFilter(''); setCategoryFilter(''); setUnitFilter(''); setMatchFilter('all'); }}>
            <X size={13} /> Réinitialiser
          </button>
        </div>

        <div className="ocr-product-selector-results">
          {rankedProducts.map(({ product, score }) => {
            const supplierName = product.primarySupplier?.name ?? product.supplier?.name ?? 'Sans fournisseur';
            const categoryName = product.category?.name ?? 'Sans catégorie';
            const scoreLabel = `${Math.round(score * 100)}%`;
            return (
              <button key={product.id} type="button" className="ocr-product-result" onClick={() => onSelect(product, score)}>
                <div className="ocr-product-result-main">
                  <span className="ocr-product-result-name">{product.name}</span>
                  <span className="ocr-product-result-sub">
                    {product.sku || product.reference ? `Réf. ${product.sku ?? product.reference} · ` : ''}
                    {categoryName} · {supplierName}
                  </span>
                </div>
                <div className="ocr-product-result-badges">
                  <span className="badge badge-inventory">{product.unit?.symbol ?? '—'}</span>
                  <span className={`badge ${score >= 0.84 ? 'badge-reception' : score >= 0.58 ? 'badge-correction' : 'badge-production'}`}>{scoreLabel}</span>
                </div>
              </button>
            );
          })}
          {!rankedProducts.length ? (
            <div className="ocr-product-selector-empty">
              <Package size={24} />
              <strong>Aucun produit trouvé</strong>
              <span>Modifiez la recherche ou les filtres, puis créez le produit depuis la ligne OCR si aucun produit existant ne correspond.</span>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function normalizeOcrReceptionData(data: StocksOcrExtraction['data']): StocksOcrExtraction['data'] {
  return {
    supplier: data.supplier ?? null,
    supplierId: data.supplierId ?? data.supplier?.supplierId ?? null,
    supplierName: data.supplierName ?? data.supplier?.supplierName ?? data.supplier?.name ?? null,
    supplierMatchingStatus: data.supplierMatchingStatus ?? data.supplier?.matchingStatus,
    supplierMatchingScore: data.supplierMatchingScore ?? data.supplier?.matchingScore ?? null,
    supplierCandidates: data.supplierCandidates ?? data.supplier?.candidates ?? [],
    invoiceNumber: data.invoiceNumber ?? data.document?.invoiceNumber ?? null,
    deliveryNoteNumber: data.deliveryNoteNumber ?? data.document?.deliveryNoteNumber ?? null,
    purchaseOrderNumber: data.purchaseOrderNumber ?? data.document?.purchaseOrderNumber ?? null,
    documentDate: data.documentDate ?? data.document?.documentDate ?? null,
    deliveryDate: data.deliveryDate ?? data.document?.deliveryDate ?? null,
    totalExcludingTax: data.totalExcludingTax ?? data.totals?.totalExcludingTax ?? null,
    totalTax: data.totalTax ?? data.totals?.totalTax ?? null,
    totalIncludingTax: data.totalIncludingTax ?? data.totals?.totalIncludingTax ?? null,
    siteId: data.siteId ?? null,
    locationId: data.locationId ?? null,
    lines: (data.lines || []).map((line, index) => ({
      ...line,
      id: line.id ?? `ocr-${index}`,
      ocrLabel: line.ocrLabel ?? line.label ?? '',
      lineTotal: line.lineTotal ?? line.total ?? null,
      ignored: line.ignored ?? false,
    })),
  };
}

function ocrStateClass(state: string) {
  if (state.includes('erreur')) return 'badge-loss';
  if (state.includes('vérifier')) return 'badge-reception';
  if (state.includes('cours') || state.includes('attente')) return 'badge-correction';
  return 'badge-production';
}

function ocrMatchClass(status?: string | null) {
  if (status === 'RECOGNIZED') return 'badge-reception';
  if (status === 'NEEDS_REVIEW') return 'badge-correction';
  return 'badge-loss';
}

function ocrMatchLabel(status?: string | null) {
  if (status === 'RECOGNIZED') return 'Reconnu';
  if (status === 'NEEDS_REVIEW') return 'À vérifier';
  return 'Non trouvé';
}

function dateInputValue(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function fileTypeLabel(file: File) {
  if (file.type) return file.type;
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : undefined;
  return ext ? `.${ext}` : 'type inconnu';
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
  dashboardWidgets: DashboardWidget[];
  hiddenWidgetIds: string[];
  pinnedWidgetIds: string[];
  onToggleWidget: (widgetId: string, visible: boolean) => void;
  onTogglePin: (widgetId: string) => void;
  onResetCore: () => void;
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
  dashboardWidgets,
  hiddenWidgetIds,
  pinnedWidgetIds,
  onToggleWidget,
  onTogglePin,
  onResetCore,
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

      {dashboardWidgets.length > 0 && (
        <div className="customizer-section">
          <span className="customizer-section-title">Widgets modulaires par zone</span>
          <div className="customizer-toggle-list">
            {dashboardWidgets.map((widget) => {
              const visible = !hiddenWidgetIds.includes(widget.id);
              const pinned = pinnedWidgetIds.includes(widget.id);
              return (
                <div className="customizer-toggle-row" key={widget.id}>
                  <div className="customizer-toggle-info">
                    <span className="customizer-toggle-label">{widget.title}</span>
                    <span className="customizer-toggle-desc">{widget.zone.toUpperCase()} · {dashboardWidgetModule(widget)}{widget.comingSoon ? ' · À venir' : ''}</span>
                  </div>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => onTogglePin(widget.id)}><Pin size={14} /> {pinned ? 'Désépingler' : 'Épingler'}</button>
                  <label className="switch-control">
                    <input type="checkbox" checked={visible} onChange={(event) => onToggleWidget(widget.id, event.target.checked)} />
                    <span className="slider-round" />
                  </label>
                </div>
              );
            })}
          </div>
          <button className="btn btn-secondary" type="button" onClick={onResetCore} style={{ marginTop: '1rem' }}>
            <RefreshCw size={16} /> Réinitialiser Core uniquement
          </button>
        </div>
      )}

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

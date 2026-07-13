import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  LayoutGrid,
  List,
  Eye,
  Filter,
  Calendar,
  Thermometer,
  Droplets,
  Snowflake,
  ShoppingCart,
  ShoppingBag,
  LogOut,
  Plus,
  Search,
  X,
  Bell,
  Menu,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  AlertTriangle,
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
  Cloud,
  ExternalLink,
  HelpCircle,
  UploadCloud,
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
  Database,
  HardDrive,
  Copy,
  Cpu,
  Wifi,
  Smartphone,
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
import { HaccpApp } from './HaccpApp';
import { StockAssistantPanel } from './StockAssistantPanel';

import { ApiError, api } from '../api/client';
import type {
  Category,
  DashboardSummary,
  ModularDashboard,
  ModularDashboardPreferences,
  DashboardWidget,
  MyDocument,
  MyDocumentsResponse,
  AuditEntry,
  Inventory,
  Location,
  Product,
  Article,
  ArticlesResponse,
  ProductImportCommitResult,
  ProductImportField,
  ProductImportPreview,
  ProductImportPreviewFields,
  ProductImportPreviewRow,
  ProductImportStatus,
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
  EstablishmentType,
  TeamSize,
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
  BackupInspection,
  BackupCloudStatus,
  BackupListResponse,
  BackupRestoreResult,
  BackupSchedule,
  BackupSummary,
  MarginsDashboard,
  MarginChartPoint,
  MarginProductDetail,
  MarginSupplierDetail,
  MarginSettings,
  SystemChangelogResponse,
  SystemInstanceInfo,
  SystemUpdateOperation,
  SystemUpdateStatus,
  OrganizationRemoteAccess,
  RemoteAccessStatus,
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
const movementOptions: Array<[StockMovementType, string]> = [
  ['IN', 'Entrée'], ['OUT', 'Sortie'], ['LOSS', 'Perte'], ['TRANSFER', 'Transfert'],
];

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
    description: 'Fiches Techniques centralise vos préparations professionnelles sans créer de référentiel produit parallèle. Les lignes d’ingrédients pointent exclusivement vers les produits Stocks, les allergènes viennent des fiches produits, les coûts utilisent les prix d’achat Stocks, et la V1 couvre catégories recettes, étapes, historique, duplication, archivage, production théorique et exports PDF/CSV.\n\nDépendance stricte : le module Stocks doit être installé avant Fiches Techniques.',
    screenshots: ['Tableau de bord', 'Fiche technique', 'Production théorique'],
    changelog: 'Lancement V1 avec préchargement catégories recettes, coûts Stocks et production théorique.',
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
    changelog: 'Lancement du module web avec dashboard conformité, contrôles, traçabilité, processus, huiles, étiquettes et rapports.',
    version: 'v1.0.0',
    compatibility: 'ToqueHub Core v0.1.0+',
    status: 'Disponible',
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

type ActiveTab = 'overview' | 'applications' | 'settings' | 'organization-general' | 'organization-documents' | 'users' | 'architecture' | 'stocks-dashboard' | 'stocks-margins' | 'articles' | 'inventory' | 'movements' | 'products' | 'categories' | 'units' | 'suppliers' | 'inventories' | 'locations' | 'audit' | 'rnm-dashboard' | 'rnm-history' | 'rnm-favorites' | 'rnm-about' | 'hr-dashboard' | 'hr-collaborators' | 'hr-departments' | 'hr-positions' | 'hr-rotations' | 'hr-orgchart' | 'planning-dashboard' | 'planning-planning' | 'planning-settings' | 'planning-attendance' | 'planning-day' | 'planning-week' | 'planning-month' | 'planning-assignments' | 'planning-absences' | 'planning-replacements' | 'planning-templates' | 'planning-requirements' | 'technical-sheets-dashboard' | 'technical-sheets-recipes' | 'technical-sheets-categories' | 'technical-sheets-costs' | 'technical-sheets-production' | 'production-dashboard' | 'production-orders' | 'production-calendar' | 'production-today' | 'production-assignments' | 'production-materials' | 'production-exports' | 'production-history' | 'menus-dashboard' | 'menus-list' | 'menus-calendar' | 'menus-cycles' | 'menus-diets' | 'menus-guests' | 'menus-exports' | 'menus-history' | 'haccp-dashboard' | 'haccp-setup' | 'haccp-sensors' | 'haccp-alerts' | 'haccp-temperatures' | 'haccp-cleaning' | 'haccp-traceability' | 'haccp-receptions' | 'haccp-process' | 'haccp-oil' | 'haccp-production' | 'haccp-products' | 'haccp-labels' | 'haccp-reports';
type StocksSettingsTab = 'categories' | 'units' | 'movements' | 'locations' | 'audit';

const STOCKS_ALL_TABS: ActiveTab[] = [
  'stocks-dashboard',
  'articles',
  'stocks-margins',
  'categories',
  'units',
  'suppliers',
  'inventories',
  'audit',
];

const STOCKS_SETTINGS_TABS: StocksSettingsTab[] = ['categories', 'units', 'movements', 'audit'];
const isStocksSettingsRoute = (tab: ActiveTab): tab is StocksSettingsTab => STOCKS_SETTINGS_TABS.includes(tab as StocksSettingsTab);
const STOCKS_NAV_TABS: Array<{ tab: ActiveTab; label: string }> = [
  { tab: 'stocks-dashboard', label: 'Tableau de bord' },
  { tab: 'articles', label: 'Produits' },
  { tab: 'suppliers', label: 'Fournisseur' },
  { tab: 'inventories', label: 'Inventaire' },
  { tab: 'categories', label: 'Réglage' },
];

type Confirmation = 'install-stocks' | 'uninstall-stocks' | 'uninstall-rnm-prices' | 'uninstall-planning' | 'uninstall-technical-sheets' | 'uninstall-production' | 'uninstall-menus' | null;
type AppNotification = {
  id: string;
  type: 'success' | 'error';
  message: string;
  createdAt: Date;
  read: boolean;
};
type StocksOnboardingStep = 'welcome' | 'reception' | 'review';
type StocksReadiness = {
  foundationReady: boolean;
  catalogReady: boolean;
  flowReady: boolean;
  progress: number;
  nextStep: StocksOnboardingStep;
};

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
  const [articles, setArticles] = useState<ArticlesResponse | null>(null);
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
  const [hrOnboarding, setHrOnboarding] = useState<any>(null);

  // UI State
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [stocksMenuExpanded, setStocksMenuExpanded] = useState(false);
  const [rnmMenuExpanded, setRnmMenuExpanded] = useState(() => false);
  const [hrMenuExpanded, setHrMenuExpanded] = useState(() => false);
  const [planningMenuExpanded, setPlanningMenuExpanded] = useState(() => false);
  const [productionMenuExpanded, setProductionMenuExpanded] = useState(() => false);
  const [menusMenuExpanded, setMenusMenuExpanded] = useState(() => false);
  const [haccpMenuExpanded, setHaccpMenuExpanded] = useState(() => false);
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
  const [showAddImportModal, setShowAddImportModal] = useState(false);
  const [showProductImportModal, setShowProductImportModal] = useState(false);
  const [showProductCreatorModal, setShowProductCreatorModal] = useState(false);
  const [productImportReturnToStocksOnboarding, setProductImportReturnToStocksOnboarding] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showOcrImportModal, setShowOcrImportModal] = useState(false);
  const [showOcrReviewModal, setShowOcrReviewModal] = useState(false);
  const [ocrStatuses, setOcrStatuses] = useState<StocksOcrStatus[]>([]);
  const [selectedOcrExtraction, setSelectedOcrExtraction] = useState<StocksOcrExtraction | null>(null);
  const [myDocuments, setMyDocuments] = useState<MyDocumentsResponse | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsSearch, setDocumentsSearch] = useState('');
  const [documentsSupplierFilter, setDocumentsSupplierFilter] = useState('');
  const [documentsTypeFilter, setDocumentsTypeFilter] = useState('all');
  const [documentsDateFrom, setDocumentsDateFrom] = useState('');
  const [documentsDateTo, setDocumentsDateTo] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [ocrPollingActive, setOcrPollingActive] = useState(false);
  const [productPrefillName, setProductPrefillName] = useState('');
  const [supplierPrefillName, setSupplierPrefillName] = useState('');
  const [apiKeysPanelHint, setApiKeysPanelHint] = useState(false);
  const [showStocksOnboarding, setShowStocksOnboarding] = useState(false);
  const [showTechnicalSheetsOnboarding, setShowTechnicalSheetsOnboarding] = useState(false);
  const [showStockAssistant, setShowStockAssistant] = useState(false);
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
  const [showInstanceModal, setShowInstanceModal] = useState(false);
  const [instanceInfo, setInstanceInfo] = useState<SystemInstanceInfo | null>(null);
  const [instanceLoading, setInstanceLoading] = useState(false);
  const [instanceError, setInstanceError] = useState<string | null>(null);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [changelog, setChangelog] = useState<SystemChangelogResponse | null>(null);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const [autoUpdateStatus, setAutoUpdateStatus] = useState<SystemUpdateStatus | null>(null);
  const [autoUpdateOperation, setAutoUpdateOperation] = useState<SystemUpdateOperation | null>(null);
  const [showUpdateAvailableModal, setShowUpdateAvailableModal] = useState(false);
  const [autoUpdateApplying, setAutoUpdateApplying] = useState(false);
  const [autoUpdateError, setAutoUpdateError] = useState<string | null>(null);
  const [planningCustomizeSignal, setPlanningCustomizeSignal] = useState(0);
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
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;

  function addAppNotification(type: AppNotification['type'], message: string) {
    setNotifications((current) => {
      const newest = current[0];
      const now = new Date();
      if (newest?.type === type && newest.message === message && now.getTime() - newest.createdAt.getTime() < 3000) {
        return current;
      }
      return [
        {
          id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
          type,
          message,
          createdAt: now,
          read: false,
        },
        ...current,
      ].slice(0, 50);
    });
  }

  function formatNotificationTime(date: Date) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  async function refresh() {
    setLoading(true);
    setError(undefined);
    try {
      const [summaryResult, modularDashboardResult, nextCategories, nextUnits, nextProducts, nextArticles, nextSuppliers, nextStocks, nextMovements, nextSites, nextLocations, nextInventories, nextAuditEntries, usersResult, rolesResult, devConfig, hrData] =
        await Promise.all([
          api.dashboardSummary(token).catch(() => undefined),
          api.modularDashboard(token).catch(() => undefined),
          api.categories(token),
          api.units(token),
          api.products(token),
          api.articles(token, { page: 1, pageSize: 25 }).catch(() => ({ items: [], summary: { articleCount: 0, articlesWithStock: 0, articlesWithoutStock: 0, stockValue: 0, lowStockCount: 0 } })),
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
      setArticles(nextArticles);
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
    if (success) addAppNotification('success', success);
  }, [success]);

  useEffect(() => {
    if (error) addAppNotification('error', error);
  }, [error]);

  useEffect(() => {
    if (!notificationsOpen || unreadNotifications === 0) return;
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  }, [notificationsOpen, unreadNotifications]);

  async function openInstanceModal() {
    setShowInstanceModal(true);
    setInstanceLoading(true);
    setInstanceError(null);
    try {
      const info = await api.systemInstance(token);
      setInstanceInfo(info);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Diagnostic instance indisponible';
      setInstanceError(message);
      addAppNotification('error', message);
    } finally {
      setInstanceLoading(false);
    }
  }

  async function openChangelogModal() {
    setShowChangelogModal(true);
    setChangelogLoading(true);
    setChangelogError(null);
    try {
      const payload = await api.systemChangelog(token);
      setChangelog(payload);
      if (payload.error) setChangelogError(payload.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Changelog indisponible';
      setChangelogError(message);
      addAppNotification('error', message);
    } finally {
      setChangelogLoading(false);
    }
  }

  async function checkForUpdateNotification() {
    if (!isAdmin) return;
    try {
      const status = await api.systemUpdateStatus(token);
      setAutoUpdateStatus(status);
      setAutoUpdateOperation(status.runtime.lastOperation);
      const latestKey = status.latest?.tag ?? status.latest?.version ?? '';
      const dismissedKey = latestKey ? `toquehub_update_modal_dismissed_${latestKey}` : '';
      const hasDismissed = dismissedKey ? localStorage.getItem(dismissedKey) === 'true' : false;
      const operationRunning = Boolean(status.runtime.lastOperation && ['queued', 'running', 'rollback'].includes(status.runtime.lastOperation.status));
      if (status.updateAvailable && status.runtime.updaterAvailable && !operationRunning && !hasDismissed) {
        setShowUpdateAvailableModal(true);
        addAppNotification('success', `Mise à jour ToqueHub disponible : ${status.latest?.tag ?? status.latest?.version}.`);
      }
    } catch {
      // La vérification automatique reste silencieuse pour ne pas gêner l'usage courant.
    }
  }

  function dismissUpdateAvailableModal() {
    const latestKey = autoUpdateStatus?.latest?.tag ?? autoUpdateStatus?.latest?.version ?? '';
    if (latestKey) localStorage.setItem(`toquehub_update_modal_dismissed_${latestKey}`, 'true');
    setShowUpdateAvailableModal(false);
  }

  function closeUpdateAvailableModal() {
    if (isSystemUpdateRunning(autoUpdateOperation)) return;
    dismissUpdateAvailableModal();
  }

  async function applyUpdateFromModal() {
    setAutoUpdateApplying(true);
    setAutoUpdateError(null);
    try {
      const result = await api.systemUpdateApply(token);
      if (result.operation) setAutoUpdateOperation(result.operation);
      if (result.status) setAutoUpdateStatus(result.status);
      if (result.skipped && result.message) setAutoUpdateError(result.message);
      else setShowUpdateAvailableModal(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de lancer la mise à jour.';
      setAutoUpdateError(message);
      addAppNotification('error', message);
    } finally {
      setAutoUpdateApplying(false);
    }
  }

  async function refreshOcrStatusesFromServer() {
    try {
      const result = await api.stocksOcrStatuses(token);
      setOcrStatuses(result.statuses ?? []);
      setOcrPollingActive((result.statuses ?? []).some(isOcrStatusWorking));
    } catch {
      // OCR permissions/configuration can vary by role; the dashboard should remain usable.
    }
  }

  async function refreshMyDocuments() {
    setDocumentsLoading(true);
    try {
      const result = await api.documents(token, {
        search: documentsSearch,
        supplier: documentsSupplierFilter,
        type: documentsTypeFilter,
        dateFrom: documentsDateFrom,
        dateTo: documentsDateTo,
      });
      setMyDocuments(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des documents impossible.');
    } finally {
      setDocumentsLoading(false);
    }
  }

  useEffect(() => {
    if (!installedApps.includes('stocks')) {
      setOcrStatuses([]);
      setOcrPollingActive(false);
      return;
    }
    void refreshOcrStatusesFromServer();
  }, [token, installedApps.join('|')]);

  useEffect(() => {
    if (!ocrPollingActive || !ocrStatuses.length) return undefined;
    const timer = window.setInterval(async () => {
      await refreshOcrStatusesFromServer();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [ocrPollingActive, ocrStatuses, token]);

  useEffect(() => {
    if (activeTab !== 'organization-documents') return;
    void refreshMyDocuments();
  }, [activeTab, token, documentsSearch, documentsSupplierFilter, documentsTypeFilter, documentsDateFrom, documentsDateTo]);

  useEffect(() => {
    void checkForUpdateNotification();
  }, [token, isAdmin]);

  useEffect(() => {
    if (!autoUpdateOperation || !['queued', 'running', 'rollback'].includes(autoUpdateOperation.status)) return;
    const interval = window.setInterval(async () => {
      try {
        const next = await api.systemUpdateOperation(token, autoUpdateOperation.id);
        setAutoUpdateOperation(next);
        if (!['queued', 'running', 'rollback'].includes(next.status)) {
          const refreshed = await api.systemUpdateStatus(token);
          setAutoUpdateStatus(refreshed);
          if (next.status === 'success') addAppNotification('success', 'Mise à jour ToqueHub terminée.');
          if (next.status === 'error' || next.status === 'rollback') addAppNotification('error', 'La mise à jour ToqueHub nécessite une vérification.');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Impossible de suivre la mise à jour.';
        setAutoUpdateError(message);
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [token, autoUpdateOperation?.id, autoUpdateOperation?.status]);


  const stocksInstalled = installedApps.includes('stocks');
  const rnmInstalled = installedApps.includes('rnm-prices');
  const hrInstalled = installedApps.includes('hr');
  const rhPlanningReadiness = getRhPlanningReadiness(hrInstalled, hrDepartments, hrPositions, hrCollaborators);
  const planningInstalled = installedApps.includes('planning');
  const technicalSheetsInstalled = installedApps.includes('technical-sheets');
  const productionInstalled = installedApps.includes('production');
  const menusInstalled = installedApps.includes('menus');
  const haccpInstalled = installedApps.includes('haccp');
  const planningPrerequisiteMessage = rhPlanningReadiness.ready ? undefined : rhPlanningReadiness.message;

  const isStocksTab = useMemo(() => {
    return STOCKS_ALL_TABS.includes(activeTab);
  }, [activeTab]);

  const isRnmTab = useMemo(() => ['rnm-dashboard', 'rnm-history', 'rnm-favorites', 'rnm-about'].includes(activeTab), [activeTab]);
  const isHrTab = useMemo(() => ['hr-dashboard', 'hr-collaborators', 'hr-departments', 'hr-positions', 'hr-orgchart'].includes(activeTab), [activeTab]);
  const isPlanningTab = useMemo(() => ['planning-dashboard', 'planning-planning', 'planning-settings', 'planning-attendance', 'planning-day', 'planning-week', 'planning-month', 'planning-assignments', 'planning-absences', 'planning-replacements', 'planning-templates', 'planning-requirements'].includes(activeTab), [activeTab]);
  const isTechnicalSheetsTab = useMemo(() => ['technical-sheets-dashboard', 'technical-sheets-recipes', 'technical-sheets-categories', 'technical-sheets-costs', 'technical-sheets-production'].includes(activeTab), [activeTab]);
  const isProductionTab = useMemo(() => ['production-dashboard', 'production-orders', 'production-calendar', 'production-today', 'production-assignments', 'production-materials', 'production-exports', 'production-history'].includes(activeTab), [activeTab]);
  const isMenusTab = useMemo(() => ['menus-dashboard', 'menus-list', 'menus-calendar', 'menus-cycles', 'menus-diets', 'menus-guests', 'menus-exports', 'menus-history'].includes(activeTab), [activeTab]);
  const isHaccpTab = useMemo(() => ['haccp-dashboard', 'haccp-setup', 'haccp-sensors', 'haccp-alerts', 'haccp-temperatures', 'haccp-cleaning', 'haccp-traceability', 'haccp-receptions', 'haccp-process', 'haccp-oil', 'haccp-production', 'haccp-products', 'haccp-labels', 'haccp-reports'].includes(activeTab), [activeTab]);

  useEffect(() => {
    if (isMenusTab) {
      setMenusMenuExpanded(true);
    }
  }, [isMenusTab]);

  useEffect(() => {
    if (isHaccpTab) {
      setHaccpMenuExpanded(true);
    }
  }, [isHaccpTab]);

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

  useEffect(() => {
    if (!notificationsOpen) return;
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.sidebar-notifications-container')) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [notificationsOpen]);

  const togglePinApp = (appId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedApps(prev => {
      const next = prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId];
      localStorage.setItem('toquehub_pinned_apps', JSON.stringify(next));
      return next;
    });
  };

  function closeStocksOnboardingToDashboard() {
    setShowStocksOnboarding(false);
    setActiveTab('stocks-dashboard');
  }

  function closeProductImportModal() {
    setShowProductImportModal(false);
    if (productImportReturnToStocksOnboarding) {
      setProductImportReturnToStocksOnboarding(false);
      setShowStocksOnboarding(true);
      setActiveTab('stocks-dashboard');
    }
  }

  function openProductImportFromStocksOnboarding() {
    setProductImportReturnToStocksOnboarding(true);
    setShowStocksOnboarding(false);
    setShowProductImportModal(true);
  }

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
        { tab: 'articles', label: 'Produits', icon: Package },
        { tab: 'suppliers', label: 'Fournisseur', icon: UsersRound },
        { tab: 'inventories', label: 'Inventaire', icon: ClipboardList },
        { tab: 'categories', label: 'Réglage', icon: Settings, matches: STOCKS_SETTINGS_TABS },
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
      id: 'haccp',
      title: 'HACCP',
      icon: Thermometer,
      installed: haccpInstalled,
      expanded: haccpMenuExpanded,
      setExpanded: setHaccpMenuExpanded,
      isActive: isHaccpTab,
      defaultTab: 'haccp-dashboard',
      submenu: [
        {
          tab: 'haccp-dashboard',
          label: 'Tableau de bord',
          icon: LayoutDashboard,
          matches: [
            'haccp-temperatures',
            'haccp-cleaning',
            'haccp-traceability',
            'haccp-receptions',
            'haccp-process',
            'haccp-oil',
            'haccp-production'
          ]
        },
        { tab: 'haccp-sensors', label: 'Capteurs', icon: Smartphone },
        { tab: 'haccp-alerts', label: 'Alerte', icon: AlertTriangle },
        { tab: 'haccp-setup', label: 'Zones & matériels', icon: Boxes },
        { tab: 'haccp-reports', label: 'Rapports', icon: FileText }
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
    haccpInstalled, haccpMenuExpanded, isHaccpTab,
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
  const recentMovements = useMemo(() => sortMovementsByRecency(movements).slice(0, 6), [movements]);
  const movementsThisMonth = useMemo(() => movements.filter((m) => movementEffectiveDate(m) >= monthStart).length, [movements, monthStart]);
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
      setActiveTab('stocks-dashboard');
      setShowStocksOnboarding(true);
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
      if (STOCKS_ALL_TABS.includes(activeTab)) {
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
      setShowTechnicalSheetsOnboarding(false);
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
    if (!['stocks', 'rnm-prices', 'hr', 'planning', 'technical-sheets', 'production', 'menus', 'haccp'].includes(appId)) return;
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
        const summary = appId === 'rnm-prices' ? await api.installRnmPrices(token) : appId === 'hr' ? await api.installHr(token) : appId === 'planning' ? await api.installPlanning(token) : appId === 'technical-sheets' ? await api.installTechnicalSheets(token) : appId === 'production' ? await api.installProduction(token) : appId === 'menus' ? await api.installMenus(token) : appId === 'haccp' ? await api.installHaccp(token) : await api.installStocks(token);
        setDashboardSummary((prev) => ({ ...prev, ...summary } as DashboardSummary));
        setInstalledApps(summary.installedApplications ?? Array.from(new Set([...installedApps, appId])));
        setSuccess(appId === 'rnm-prices' ? 'L’application Cours des Produits a été installée. La navigation RNM est maintenant visible.' : appId === 'hr' ? 'L’application RH a été installée. Services et postes de départ sont disponibles.' : appId === 'planning' ? 'L’application Planning a été installée. Les vues opérationnelles consomment désormais le référentiel RH.' : appId === 'technical-sheets' ? 'L’application Fiches Techniques a été installée. La configuration guidée est prête.' : appId === 'production' ? 'L’application Production a été installée. Les ordres peuvent être créés depuis les fiches techniques sans dupliquer les référentiels.' : appId === 'menus' ? 'L’application Menus a été installée. Planification, cycles, convives et génération Production sont disponibles.' : appId === 'haccp' ? 'L’application HACCP a été installée. Dashboard conformité, contrôles et rapports sont disponibles.' : 'L’application Stocks a été installée avec succès. Le référentiel de base est prêt : importez vos produits ou analysez un document.');
        if (appId === 'stocks') {
          setActiveTab('stocks-dashboard');
          setShowStocksOnboarding(true);
        }
        if (appId === 'rnm-prices') setActiveTab('rnm-dashboard');
        if (appId === 'hr') setActiveTab('hr-dashboard');
        if (appId === 'planning') setActiveTab('planning-dashboard');
        if (appId === 'technical-sheets') {
          setActiveTab('technical-sheets-dashboard');
          setShowTechnicalSheetsOnboarding(true);
        }
        if (appId === 'production') setActiveTab('production-dashboard');
        if (appId === 'menus') setActiveTab('menus-dashboard');
        if (appId === 'haccp') setActiveTab('haccp-dashboard');
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

  function openProductsForCategory(categoryId: string) {
    setProductSearch('');
    setProductSupplierFilter('');
    setProductCategoryFilter(categoryId);
    goToTab('articles');
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
    const activeCollaboratorsCount = (data.collaborators ?? []).filter((collaborator) => !isArchived(collaborator)).length;
    setHrSummary(data.summary);
    setHrCollaborators(data.collaborators ?? []);
    setHrDepartments(data.departments ?? []);
    setHrPositions(data.positions ?? []);
    setHrOnboarding(data.onboarding);
    setDashboardSummary((current) => current ? {
      ...current,
      counts: {
        ...current.counts,
        collaborators: activeCollaboratorsCount,
        hrCollaborators: activeCollaboratorsCount,
      },
    } : current);
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

  async function handlePreviewHrCollaboratorDocument(employeeId: string, document: HrDocument) {
    return api.createHrCollaboratorDocumentPreviewUrl(token, employeeId, document);
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

  async function handleCreateCategory(payload: { name: string; description?: string }) {
    await submit(() => api.createCategory(token, payload), 'Catégorie créée avec succès.');
    setShowCategoryModal(false);
  }

  async function handleUpdateCategory(categoryId: string, payload: { name: string; description?: string }) {
    const updated = await submit(() => api.updateCategory(token, categoryId, payload), 'Catégorie mise à jour.');
    setSelectedCategory(updated as Category);
  }

  async function handleDeleteCategory(categoryId: string) {
    await submit(() => api.archiveCategory(token, categoryId), 'Catégorie supprimée. Les produits ont été déplacés dans “Sans catégorie”.');
    setSelectedCategory(null);
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

  async function handleDeleteProduct(productId: string) {
    await submit(() => api.archiveProduct(token, productId), 'Produit supprimé avec succès.');
  }

  async function handleCommitProductImport(payload: { rows: Array<{ rowNumber: number; fields: ProductImportPreviewFields; selected?: boolean }>; mapping?: Record<string, ProductImportField>; options?: { createMissingCategories?: boolean; createMissingSuppliers?: boolean } }) {
    setError(undefined);
    setSuccess(undefined);
    const result = await api.commitProductImport(token, payload);
    setSuccess(`${result.created} produit${result.created > 1 ? 's' : ''} importé${result.created > 1 ? 's' : ''}.`);
    await refresh();
    return result;
  }

  async function handleCreateSupplier(payload: { name: string; contactName?: string; email?: string; phone?: string }) {
    await submit(() => api.createSupplier(token, payload), 'Fournisseur créé avec succès.');
    setSupplierPrefillName('');
    setShowSupplierModal(false);
  }

  async function handleUpdateSupplier(supplierId: string, payload: { name?: string; contactName?: string; email?: string; phone?: string; address?: string; notes?: string }) {
    await submit(() => api.updateSupplier(token, supplierId, payload), 'Fournisseur modifié avec succès.');
  }

  async function handleDeleteSupplier(supplierId: string) {
    await submit(() => api.archiveSupplier(token, supplierId), 'Fournisseur supprimé avec succès.');
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
    void refreshOcrStatusesFromServer();
    void refreshMyDocuments();
    setSuccess(`${uploaded.documents.length} document${uploaded.documents.length > 1 ? 's' : ''} envoyé${uploaded.documents.length > 1 ? 's' : ''} en analyse.`);
  }

  async function handleOpenOcrExtraction(extractionId: string) {
    const extraction = await api.stocksOcrExtraction(token, extractionId);
    setSelectedOcrExtraction(extraction);
    setShowOcrReviewModal(true);
  }

  async function handleRenameDocument(document: MyDocument, newName: string) {
    await submit(() => api.renameDocument(token, document.id, newName), 'Document renommé avec succès.');
    void refreshMyDocuments();
  }

  async function handleSaveOcrDraft(payload: StocksOcrExtraction['data']) {
    if (!selectedOcrExtraction) return;
    const saved = await api.saveStocksOcrCorrections(token, selectedOcrExtraction.id, payload);
    setSelectedOcrExtraction(saved);
    setSuccess('Brouillon OCR enregistré.');
  }

  async function handleReanalyzeOcrWithAi() {
    if (!selectedOcrExtraction) return;
    const updated = await submit(() => api.reanalyzeStocksOcrWithAi(token, selectedOcrExtraction.id), 'Analyse IA relancée.');
    setSelectedOcrExtraction(updated as StocksOcrExtraction);
  }

  async function handleCreateOcrReception(payload: StocksOcrExtraction['data']) {
    if (!selectedOcrExtraction) return;
    await submit(() => api.createStockReceptionFromOcr(token, selectedOcrExtraction.id, payload), 'La réception a été créée.');
    const validatedDocumentId = selectedOcrExtraction.document?.id ?? selectedOcrExtraction.ocrDocument?.document?.id;
    if (validatedDocumentId) setOcrStatuses((current) => current.filter((item) => item.document.id !== validatedDocumentId));
    setShowOcrReviewModal(false);
    setShowOcrImportModal(false);
    setSelectedOcrExtraction(null);
  }

  async function handleCreateOcrProductFromLine(line: StocksOcrLine, supplierId?: string | null) {
    const name = ocrProductName(line);
    if (!name) throw new Error('Nom produit OCR manquant.');
    const reference = ocrProductReference(line);
    const unitLabel = ocrLineUnitLabel(line);
    const unitId = resolveOcrUnitId(units, line.unitId, unitLabel);
    if (!unitId) throw new Error(`Unité OCR "${unitLabel || 'non renseignée'}" introuvable. Sélectionnez une unité sur la ligne ou ajoutez-la au référentiel.`);
    const quantity = numeric(line.quantity);
    const lineTotal = numeric(line.lineTotal ?? line.total);
    const unitPrice = roundOcrPrice(lineTotal > 0 && quantity > 0 ? lineTotal / quantity : numeric(line.unitPrice));
    const categoryId = await resolveOcrCategoryIdForCreate(token, line, categories, products, supplierId);
    const description = ocrProductDescription(line);
    const existing = products.find((product) => (reference && product.sku === reference) || normalizeLookup(product.name) === normalizeLookup(name));
    if (existing) {
      const shouldUpdatePrice = Boolean(unitPrice && numeric(existing.averagePrice ?? existing.averagePurchasePrice ?? existing.weightedAveragePrice) <= 0);
      const shouldUpdateCategory = Boolean(categoryId && !(existing.categoryId ?? existing.category?.id));
      const shouldUpdateSupplier = Boolean(supplierId && !(existing.primarySupplierId ?? existing.supplierId ?? existing.primarySupplier?.id ?? existing.supplier?.id));
      const shouldUpdateDescription = Boolean(description && !existing.description);
      if (shouldUpdatePrice || shouldUpdateCategory || shouldUpdateSupplier || shouldUpdateDescription) {
        return await submit(
          () => api.updateProduct(token, existing.id, {
            name: existing.name,
            sku: existing.sku ?? undefined,
            description: shouldUpdateDescription ? description : existing.description ?? undefined,
            unitId: existing.unitId || unitId,
            categoryId: existing.categoryId ?? existing.category?.id ?? categoryId,
            primarySupplierId: existing.primarySupplierId ?? existing.supplierId ?? supplierId ?? undefined,
            averagePrice: shouldUpdatePrice ? unitPrice : numeric(existing.averagePrice ?? existing.averagePurchasePrice ?? existing.weightedAveragePrice),
          }),
          shouldUpdateSupplier ? 'Fournisseur produit lié depuis l’OCR.' : shouldUpdatePrice ? 'Prix produit mis à jour depuis l’OCR.' : 'Catégorie produit mise à jour depuis l’OCR.',
        ) as Product;
      }
      return existing;
    }
    return await submit(
      () => api.createProduct(token, { name, sku: reference || undefined, description: description || undefined, unitId, categoryId, primarySupplierId: supplierId || undefined, averagePrice: unitPrice }),
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
    await submit(() => api.createLocation(token, payload), 'Site configuré avec succès.');
    setShowLocationModal(false);
  }

  async function handleCreateInventory(payload: { name: string; date?: string; comment?: string; siteId?: string; locationId?: string }) {
    const created = await submit(() => api.createInventory(token, payload), 'Inventaire complet créé. Vous pouvez saisir les quantités comptées.');
    if ((created as Inventory | null)?.id) setSelectedInventoryId((created as Inventory).id);
    setShowInventoryModal(false);
  }

  async function handleSaveInventoryCounts(inventoryId: string, lines: Array<{ productId: string; countedQuantity: number; lotId?: string }>) {
    await submit(() => api.updateInventoryCounts(token, inventoryId, lines), 'Comptage inventaire enregistré.');
  }

  async function handleValidateInventory(inventoryId: string, lines: Array<{ productId: string; countedQuantity: number; lotId?: string }>) {
    await submit(() => api.validateInventory(token, inventoryId, lines), 'Inventaire validé. Les corrections de stock ont été générées.');
  }

  async function handlePrefillStocks(payload: { categories?: boolean; units?: boolean; sites?: boolean; locations?: boolean; examples?: boolean }) {
    await submit(() => api.prefillStocks(token, payload), 'Référentiel Stocks initialisé.');
  }

  const activeProducts = useMemo(() => products.filter(p => showArchived || !isArchived(p)), [products, showArchived]);
  const categoriesWithUncategorizedLast = useMemo(() => sortCategoriesWithUncategorizedLast(categories), [categories]);
  const activeCategories = useMemo(() => sortCategoriesWithUncategorizedLast(categories.filter(c => showArchived || !isArchived(c))), [categories, showArchived]);
  const activeUnits = useMemo(() => units.filter(u => showArchived || !isArchived(u)), [units, showArchived]);
  const activeSuppliers = useMemo(() => suppliers.filter(s => showArchived || !isArchived(s)), [suppliers, showArchived]);
  const activeSites = useMemo(() => sites.filter(s => showArchived || !isArchived(s)), [sites, showArchived]);
  const activeLocations = useMemo(() => locations.filter(l => showArchived || !isArchived(l)), [locations, showArchived]);
  const stocksReadiness = useMemo(
    () => computeStocksReadiness(categories, units, products, sites, locations, movements, ocrStatuses),
    [categories, units, products, sites, locations, movements, ocrStatuses],
  );
  const ocrConfigured = Boolean(dashboardSummary?.organization?.apiKeys?.mistral.configured ?? session.user.apiKeys?.mistral.configured);

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

  const filteredUnits = useMemo(() => {
    const search = unitSearch.toLowerCase();
    return activeUnits.filter((unit) =>
      unit.name.toLowerCase().includes(search) ||
      (unit.symbol ?? '').toLowerCase().includes(search) ||
      (unit.type ?? unit.unitType ?? '').toLowerCase().includes(search)
    );
  }, [activeUnits, unitSearch]);
  const filteredLocations = useMemo(() => activeLocations.filter(l => l.name.toLowerCase().includes(locationSearch.toLowerCase()) || l.site?.name?.toLowerCase().includes(locationSearch.toLowerCase())), [activeLocations, locationSearch]);
  const filteredInventories = useMemo(() => inventories.filter(i => i.name.toLowerCase().includes(inventorySessionSearch.toLowerCase()) || (i.status ?? '').toLowerCase().includes(inventorySessionSearch.toLowerCase())), [inventories, inventorySessionSearch]);
  const selectedInventory = useMemo(() => selectedInventoryId ? inventories.find((inventory) => inventory.id === selectedInventoryId) ?? null : null, [inventories, selectedInventoryId]);
  const filteredAudit = useMemo(() => auditEntries.filter(a => `${a.action} ${a.entityType ?? ''} ${a.user?.email ?? ''}`.toLowerCase().includes(auditSearch.toLowerCase())), [auditEntries, auditSearch]);

  const filteredMovements = useMemo(() => {
    return sortMovementsByRecency(movements).filter(m => {
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
             (p.gtin && p.gtin.toLowerCase().includes(search)) ||
             (p.originCountry && p.originCountry.toLowerCase().includes(search)) ||
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

  const activeTabTitle = {
    overview: 'Dashboard',
    applications: 'Toque Store',
    settings: 'Paramètres',
    'organization-general': 'Organisation',
    'organization-documents': 'Mes Documents',
    users: 'Utilisateurs',
    architecture: 'Architecture',
    'stocks-dashboard': 'Stocks',
    'articles': 'Produits',
    'stocks-margins': 'Marges',
    inventory: 'Stocks',
    movements: 'Mouvements',
    products: 'Produits',
    categories: 'Catégories',
    units: 'Unités',
    suppliers: 'Fournisseurs',
    inventories: 'Inventaires',
    locations: 'Sites',
    audit: 'Audit',
    'rnm-dashboard': 'Cours des Produits',
    'rnm-history': 'Historique RNM',
    'rnm-favorites': 'Favoris RNM',
    'rnm-about': 'À propos',
    'hr-dashboard': 'RH',
    'hr-collaborators': 'Collaborateurs',
    'hr-departments': 'Services RH',
    'hr-positions': 'Postes RH',
    'hr-rotations': 'Roulements RH',
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
    'haccp-dashboard': 'HACCP',
    'haccp-setup': 'Zones & matériels HACCP',
    'haccp-sensors': 'Capteurs HACCP',
    'haccp-alerts': 'Alertes température HACCP',
    'haccp-temperatures': 'Températures HACCP',
    'haccp-cleaning': 'Nettoyage HACCP',
    'haccp-traceability': 'Traçabilité HACCP',
    'haccp-receptions': 'Réceptions HACCP',
    'haccp-process': 'Processus HACCP',
    'haccp-oil': 'Huiles HACCP',
    'haccp-production': 'Production HACCP',
    'haccp-products': 'Produits HACCP',
    'haccp-labels': 'Étiquettes HACCP',
    'haccp-reports': 'Rapports HACCP',
  }[activeTab];
  const tabTitle = isStocksSettingsRoute(activeTab) ? 'Réglage' : activeTabTitle;

  const stocksSettingsNav = [
    { tab: 'categories', label: 'Catégories', icon: Layers },
    { tab: 'units', label: 'Unités', icon: Scale },
    { tab: 'movements', label: 'Mouvements', icon: ArrowRight },
    { tab: 'audit', label: 'Audit', icon: ShieldCheck },
  ] as const;

  const renderStocksSettingsHeader = () => (
    <div className="card-modern stocks-settings-header">
      <div className="section-header-modern">
        <div className="section-info">
          <span className="card-title">Réglage</span>
          <span className="section-tagline">Paramètres du module Stocks.</span>
        </div>
      </div>
      <div className="stocks-settings-tabs" role="tablist" aria-label="Réglages Stocks">
        {stocksSettingsNav.map((item) => {
          const ItemIcon = item.icon;
          return (
            <button
              key={item.tab}
              type="button"
              className={activeTab === item.tab ? 'active' : ''}
              onClick={() => goToTab(item.tab)}
              role="tab"
              aria-selected={activeTab === item.tab}
            >
              <ItemIcon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderStocksModuleNav = () => (
    <StocksModuleTabs activeTab={activeTab} onNavigate={goToTab} />
  );

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Mobile Header */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/logo-toque.png" alt="Toque" style={{ height: '48px', width: '48px', objectFit: 'contain' }} />
          <span className="sidebar-title" style={{ fontSize: '1.1rem' }}>TOQUE<span>HUB</span></span>
        </div>
        <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''} ${sidebarCollapsed ? 'desktop-hidden' : ''}`}>
        <div className="sidebar-brand" style={{ gap: '0.4rem' }}>
          <div className="sidebar-logo" style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="/logo-toque.png" alt="Toque" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <span className="sidebar-title">TOQUE<span>HUB</span></span>
          <div className="sidebar-notifications-container">
            <button
              type="button"
              className={`sidebar-notifications-btn ${notificationsOpen ? 'active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                setNotificationsOpen((open) => !open);
              }}
              aria-label="Afficher les notifications"
              title="Notifications"
            >
              <Bell size={17} />
              {unreadNotifications > 0 ? <span className="sidebar-notifications-count">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span> : null}
            </button>
            <AnimatePresence>
              {notificationsOpen && (
                <motion.div
                  className="sidebar-notifications-panel"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="sidebar-notifications-header">
                    <div>
                      <strong>Notifications</strong>
                      <span>{notifications.length ? `${notifications.length} message${notifications.length > 1 ? 's' : ''}` : 'Aucun message'}</span>
                    </div>
                    {notifications.length > 0 ? (
                      <button type="button" onClick={() => setNotifications([])}>
                        Effacer
                      </button>
                    ) : null}
                  </div>
                  <div className="sidebar-notifications-list">
                    {notifications.length === 0 ? (
                      <div className="sidebar-notifications-empty">Les messages de l'application apparaîtront ici.</div>
                    ) : (
                      notifications.map((notification) => (
                        <div key={notification.id} className={`sidebar-notification-item ${notification.type}`}>
                          <div className="sidebar-notification-icon">
                            {notification.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                          </div>
                          <div className="sidebar-notification-copy">
                            <span>{notification.message}</span>
                            <time>{formatNotificationTime(notification.createdAt)}</time>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
          <div
            className={`sidebar-item ${activeTab === 'organization-documents' ? 'active' : ''}`}
            onClick={() => goToTab('organization-documents')}
          >
            <FileText />
            Mes Documents
          </div>
          <div
            className={`sidebar-item ${activeTab === 'applications' ? 'active' : ''}`}
            onClick={() => goToTab('applications')}
          >
            <ShoppingBag />
            Applications
          </div>

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
                          const matchingTabs = (sub as { matches?: ActiveTab[] }).matches ?? [];
                          const isSubActive = activeTab === sub.tab || matchingTabs.includes(activeTab);
                          return (
                            <div
                              key={`sub-${app.id}-${sub.tab}`}
                              className={`sidebar-item ${isSubActive ? 'active' : ''}`}
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
            {activeTab === 'planning-dashboard' && (
              <button
                className="btn btn-secondary"
                onClick={() => setPlanningCustomizeSignal((value) => value + 1)}
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <SlidersHorizontal size={14} />
                Personnaliser
              </button>
            )}

            <button type="button" className="status-badge changelog-badge" onClick={() => void openChangelogModal()}>
              <History size={13} />
              Changelog
            </button>
            <button type="button" className="status-badge" onClick={() => void openInstanceModal()}>
              <div className="status-dot"></div>
              Instance Locale
            </button>
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
                                <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('articles')}>Détails</button>
                              </div>
                              <MiniMovements movements={recentMovements} />
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
                  tab={activeTab === 'hr-collaborators' ? 'collaborators' : activeTab === 'hr-departments' ? 'departments' : activeTab === 'hr-positions' ? 'positions' : activeTab === 'hr-orgchart' ? 'orgchart' : 'dashboard'}
                  summary={hrSummary}
                  collaborators={hrCollaborators}
                  departments={hrDepartments}
                  positions={hrPositions}
                  users={users}
                  sites={sites}
                  regulatoryCountryCode={dashboardSummary?.organization.regulatoryCountryCode ?? session.user.regulatoryCountryCode ?? null}
                  onboarding={hrOnboarding}
                  canWrite={canWriteHr}
                  loading={isLoading}
                  onNavigate={(next) => setActiveTab(next === 'collaborators' ? 'hr-collaborators' : next === 'departments' ? 'hr-departments' : next === 'positions' ? 'hr-positions' : next === 'orgchart' ? 'hr-orgchart' : 'hr-dashboard')}
                  onExitToOverview={() => setActiveTab('overview')}
                  onCreateCollaborator={handleCreateHrCollaborator}
                  onUpdateCollaborator={handleUpdateHrCollaborator}
                  onArchiveCollaborator={handleArchiveHrCollaborator}
                  onUploadCollaboratorDocument={handleUploadHrCollaboratorDocument}
                  onDeleteCollaboratorDocument={handleDeleteHrCollaboratorDocument}
                  onReplaceCollaboratorDocument={handleReplaceHrCollaboratorDocument}
                  onViewCollaboratorDocument={handleViewHrCollaboratorDocument}
                  onPreviewCollaboratorDocument={handlePreviewHrCollaboratorDocument}
                  onDownloadCollaboratorDocument={handleDownloadHrCollaboratorDocument}
                  onCreateDepartment={handleCreateHrDepartment}
                  onCreateDepartmentsBulk={handleCreateHrDepartmentsBulk}
                  onUpdateDepartment={handleUpdateHrDepartment}
                  onArchiveDepartment={handleArchiveHrDepartment}
                  onCreatePosition={handleCreateHrPosition}
                  onCreatePositionsBulk={handleCreateHrPositionsBulk}
                  onUpdatePosition={handleUpdateHrPosition}
                  onArchivePosition={handleArchiveHrPosition}
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
                  sites={activeSites}
                  canWrite={canWriteHr}
                  dashboardCustomizeSignal={planningCustomizeSignal}
                  onDashboardCustomizeSignalConsumed={() => setPlanningCustomizeSignal(0)}
                  onNavigate={(next) => setActiveTab(next === 'planning' ? 'planning-planning' : next === 'settings' ? 'planning-settings' : next === 'attendance' ? 'planning-attendance' : 'planning-dashboard')}
                />
              )}

              {isTechnicalSheetsTab && technicalSheetsInstalled && (
                <TechnicalSheetsApp
                  token={token}
                  tab={activeTab === 'technical-sheets-recipes' ? 'recipes' : activeTab === 'technical-sheets-categories' ? 'categories' : activeTab === 'technical-sheets-costs' ? 'costs' : activeTab === 'technical-sheets-production' ? 'production' : 'dashboard'}
                  stocksInstalled={stocksInstalled}
                  products={products}
                  units={units}
                  onboardingOpen={showTechnicalSheetsOnboarding}
                  onOnboardingClose={() => setShowTechnicalSheetsOnboarding(false)}
                  onNavigate={(next) => setActiveTab(next === 'recipes' ? 'technical-sheets-recipes' : next === 'categories' ? 'technical-sheets-categories' : next === 'costs' ? 'technical-sheets-costs' : next === 'production' ? 'technical-sheets-production' : 'technical-sheets-dashboard')}
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

              {isHaccpTab && haccpInstalled && (
                <HaccpApp
                  token={token}
                  tab={activeTab === 'haccp-setup' ? 'setup' : activeTab === 'haccp-sensors' ? 'sensors' : activeTab === 'haccp-alerts' ? 'alerts' : activeTab === 'haccp-temperatures' ? 'temperatures' : activeTab === 'haccp-cleaning' ? 'cleaning' : activeTab === 'haccp-traceability' ? 'traceability' : activeTab === 'haccp-receptions' ? 'receptions' : activeTab === 'haccp-process' ? 'process' : activeTab === 'haccp-oil' ? 'oil' : activeTab === 'haccp-production' ? 'production' : activeTab === 'haccp-products' ? 'products' : activeTab === 'haccp-labels' ? 'labels' : activeTab === 'haccp-reports' ? 'reports' : 'dashboard'}
                  onNavigate={(next) => setActiveTab(next as any)}
                />
              )}

              {/* TAB SETTINGS */}
              {activeTab === 'settings' && (
                <SettingsPage session={session} token={token} dashboardSummary={dashboardSummary} sites={sites} focusApiKeys={apiKeysPanelHint} onApiKeysSaved={() => { setApiKeysPanelHint(false); void refresh(); }} onSettingsSaved={() => { void refresh(); }} onOpenUsers={() => goToTab('users')} onRestoreComplete={onLogout} isAdmin={isAdmin} />
              )}
              {activeTab === 'organization-general' && (
                <SettingsPage session={session} token={token} dashboardSummary={dashboardSummary} sites={sites} focusApiKeys={apiKeysPanelHint} onApiKeysSaved={() => { setApiKeysPanelHint(false); void refresh(); }} onSettingsSaved={() => { void refresh(); }} onOpenUsers={() => goToTab('users')} onRestoreComplete={onLogout} isAdmin={isAdmin} />
              )}
              {activeTab === 'organization-documents' && (
                <MyDocumentsPage
                  data={myDocuments}
                  loading={documentsLoading}
                  search={documentsSearch}
                  supplierFilter={documentsSupplierFilter}
                  typeFilter={documentsTypeFilter}
                  dateFrom={documentsDateFrom}
                  dateTo={documentsDateTo}
                  onSearch={setDocumentsSearch}
                  onSupplierFilter={setDocumentsSupplierFilter}
                  onTypeFilter={setDocumentsTypeFilter}
                  onDateFrom={setDocumentsDateFrom}
                  onDateTo={setDocumentsDateTo}
                  onRefresh={() => void refreshMyDocuments()}
                  onView={async (document) => {
                    const url = await api.viewDocument(token, document.id);
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  onDownload={(document) => api.downloadDocument(token, document.id, document.originalName)}
                  onRename={handleRenameDocument}
                />
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

              {activeTab === 'stocks-dashboard' && (
                <StocksDashboardPage
                  activeTab={activeTab}
                  products={products}
                  suppliers={suppliers}
                  sites={sites}
                  locations={locations}
                  stocks={stocks}
                  movements={movements}
                  ocrStatuses={ocrStatuses}
                  readiness={stocksReadiness}
                  onCreateMovement={() => setShowMovementModal(true)}
                  onImportOcr={() => setShowAddImportModal(true)}
                  onOpenExtraction={handleOpenOcrExtraction}
                  onOpenStocks={() => setActiveTab('articles')}
                  onNavigate={goToTab}
                  onStartOnboarding={() => setShowStocksOnboarding(true)}
                  onCreateProduct={() => setShowAddImportModal(true)}
                  onOpenAssistant={() => setShowStockAssistant(true)}
                />
              )}

              {activeTab === 'articles' && (
                <>
                  {renderStocksModuleNav()}
                  <ArticlesPage
                    data={articles ?? { items: [], summary: { articleCount: 0, articlesWithStock: 0, articlesWithoutStock: 0, stockValue: 0, lowStockCount: 0 } }}
                    categories={categories}
                    suppliers={suppliers}
                    onAdd={() => setShowAddImportModal(true)}
                    onMovement={() => setShowMovementModal(true)}
                    onInventory={() => setShowInventoryModal(true)}
                    onEdit={(article) => setSelectedProductId(article.product.id)}
                    onQuery={(params) => api.articles(token, params)}
                    onRefresh={refresh}
                  />
                </>
              )}

              {activeTab === 'stocks-margins' && (
                <StocksMarginsPage token={token} products={products} suppliers={suppliers} categories={categories} />
              )}

              {/* TAB CATEGORIES */}
              {activeTab === 'categories' && (
                <>
                  {renderStocksModuleNav()}
                  {renderStocksSettingsHeader()}
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
                      ) : categoriesWithUncategorizedLast.map((category) => (
                        <motion.div
                          key={category.id}
                          className="app-card compact-card"
                          role="button"
                          tabIndex={0}
                          whileHover={{ y: -3 }}
                          onClick={() => setSelectedCategory(category)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedCategory(category);
                            }
                          }}
                        >
                          <div className="app-card-icon"><Layers size={20} /></div>
                          <h3>{category.name}</h3>
                          <p>{category.description || `${products.filter((product) => (product.categoryId ?? product.category?.id) === category.id).length} produit(s)`}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* TAB INVENTORY */}
              {activeTab === 'inventory' && (
                <>
                  {renderStocksModuleNav()}
                  <div className="card-modern">
                    <div className="section-header-modern">
                      <div className="section-info">
                        <span className="card-title">Stock physique</span>
                        <span className="section-tagline">Quantités réellement disponibles par produit, lot et site.</span>
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
                        {categoriesWithUncategorizedLast.map((cat) => (
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
                             <th>Site</th>
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
                                  <span className="empty-state-desc">Aucun mouvement n’a encore créé de quantité. Les produits du catalogue sans stock restent visibles dans « Catalogue produits ».</span>
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
                                <td>{stock.site?.name ?? 'Tous sites'}</td>
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
                </>
              )}

              {/* TAB MOVEMENTS */}
              {activeTab === 'movements' && (
                <>
                  {renderStocksModuleNav()}
                  {renderStocksSettingsHeader()}
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
                        {movementOptions.map(([value, label]) => (
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
                                    {movementEffectiveDate(m).toLocaleDateString('fr-FR', {
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
                </>
              )}

              {/* TAB PRODUCTS */}
              {activeTab === 'products' && (
                <>
                  {renderStocksModuleNav()}
                  <div className="card-modern">
                    <div className="section-header-modern">
                      <div className="section-info">
                        <span className="card-title">Catalogue produits</span>
                        <span className="section-tagline">Références utilisées ou achetées, même sans quantité en stock.</span>
                      </div>
                      <div className="row-actions">
                        <button className="btn btn-primary" onClick={() => setShowAddImportModal(true)}>
                          <Plus size={16} /> Ajouter / importer
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
                            <th style={{ textAlign: 'right' }}>Seuil minimum</th>
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
                                  <button className="btn btn-primary" onClick={() => setShowAddImportModal(true)}>
                                    <Plus size={16} /> Ajouter / importer
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
                                <td style={{ textAlign: 'right' }}>{numeric(p.minimumStock ?? p.minStock) ? parseFloat(numeric(p.minimumStock ?? p.minStock).toFixed(2)).toString() : '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </>
              )}

              {/* TAB UNITS */}
              {activeTab === 'units' && (
                <>
                  {renderStocksModuleNav()}
                  {renderStocksSettingsHeader()}
                  <UnitsPage units={filteredUnits} search={unitSearch} setSearch={setUnitSearch} showArchived={showArchived} setShowArchived={setShowArchived} onCreate={() => setShowUnitModal(true)} />
                </>
              )}

              {/* TAB INVENTORIES */}
              {activeTab === 'inventories' && (
                <>
                  {renderStocksModuleNav()}
                  <InventoriesPage inventories={filteredInventories} products={products} search={inventorySessionSearch} setSearch={setInventorySessionSearch} onCreate={() => setShowInventoryModal(true)} onOpen={(inventory) => setSelectedInventoryId(inventory.id)} />
                </>
              )}

              {/* TAB LOCATIONS */}
              {activeTab === 'locations' && (
                <>
                  {renderStocksModuleNav()}
                  {renderStocksSettingsHeader()}
                  <LocationsPage sites={activeSites} locations={filteredLocations} search={locationSearch} setSearch={setLocationSearch} showArchived={showArchived} setShowArchived={setShowArchived} onCreateSite={() => setShowSiteModal(true)} onCreateLocation={() => setShowLocationModal(true)} />
                </>
              )}

              {/* TAB AUDIT */}
              {activeTab === 'audit' && (
                <>
                  {renderStocksModuleNav()}
                  {renderStocksSettingsHeader()}
                  <AuditPage entries={filteredAudit} search={auditSearch} setSearch={setAuditSearch} onExport={() => exportAuditCsv(token)} />
                </>
              )}

              {/* TAB SUPPLIERS */}
              {activeTab === 'suppliers' && (
                <>
                  {renderStocksModuleNav()}
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
                              <tr
                                key={s.id}
                                onClick={() => setSelectedSupplier(s)}
                                style={{ cursor: 'pointer' }}
                                className="clickable-row"
                              >
                                <td style={{ fontWeight: 600 }}>{s.name}</td>
                                <td>
                                  {s.email ? (
                                    <a
                                      href={`mailto:${s.email}`}
                                      style={{ textDecoration: 'underline' }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {s.email}
                                    </a>
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
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Category Modal */}
      <Modal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} title="Créer une catégorie">
        <CategoryForm onSubmit={handleCreateCategory} onClose={() => setShowCategoryModal(false)} />
      </Modal>

      <CategoryDetailModal
        category={selectedCategory}
        products={products}
        onClose={() => setSelectedCategory(null)}
        onUpdate={handleUpdateCategory}
        onDelete={handleDeleteCategory}
        onOpenProducts={(categoryId) => {
          setSelectedCategory(null);
          openProductsForCategory(categoryId);
        }}
      />

      {/* Unit Modal */}
      <Modal isOpen={showUnitModal} onClose={() => setShowUnitModal(false)} title="Créer une unité de mesure">
        <UnitForm onSubmit={handleCreateUnit} onClose={() => setShowUnitModal(false)} />
      </Modal>

      {/* Product Modal */}
      {showAddImportModal ? <div className="drawer-backdrop" onClick={() => setShowAddImportModal(false)}><aside className="side-drawer" onClick={(event) => event.stopPropagation()}><div className="side-drawer-header"><div><span className="stocks-onboarding-kicker">Articles</span><h2>Ajouter / importer</h2><span>Ajoutez une référence ou réceptionnez vos achats.</span></div><button className="icon-btn" onClick={() => setShowAddImportModal(false)}><X size={18} /></button></div><div className="side-drawer-body"><AddImportChooser onManual={() => { setShowAddImportModal(false); setShowProductModal(true); }} onCsv={() => { setProductImportReturnToStocksOnboarding(false); setShowAddImportModal(false); setShowProductImportModal(true); }} onCreator={() => { setShowAddImportModal(false); setShowProductCreatorModal(true); }} onOcr={() => { setShowAddImportModal(false); setShowOcrImportModal(true); }} /></div></aside></div> : null}

      {showProductImportModal ? (
        <ProductImportWizard
          onClose={closeProductImportModal}
          onDownloadTemplate={() => api.downloadProductImportTemplate(token)}
          onAnalyze={(file) => api.analyzeProductImport(token, file)}
          onCommit={handleCommitProductImport}
          onCreateFromDocuments={() => { setShowProductImportModal(false); setShowProductCreatorModal(true); }}
        />
      ) : null}
      {showProductCreatorModal ? <ProductCsvCreator
        units={units} categories={categories} suppliers={suppliers}
        onClose={() => setShowProductCreatorModal(false)}
        onPreview={(rows) => api.previewProductCreator(token, rows)}
        onAnalyze={(files) => api.analyzeProductCreatorOcr(token, files)}
        onDownload={(rows) => api.downloadProductCreatorCsv(token, rows)}
        onCommit={handleCommitProductImport}
      /> : null}

      <Modal isOpen={showProductModal} onClose={() => setShowProductModal(false)} title="Créer un produit" size="product">
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
        onDelete={handleDeleteProduct}
      />

      {/* Supplier Modal */}
      <Modal isOpen={showSupplierModal} onClose={() => { setSupplierPrefillName(''); setShowSupplierModal(false); }} title="Créer un fournisseur" size="product">
        <SupplierForm initialName={supplierPrefillName} onSubmit={handleCreateSupplier} onClose={() => { setSupplierPrefillName(''); setShowSupplierModal(false); }} />
      </Modal>

      <SupplierDetailModal
        supplier={selectedSupplier}
        onClose={() => setSelectedSupplier(null)}
        onUpdate={handleUpdateSupplier}
        onDelete={handleDeleteSupplier}
      />

      {/* Movement Modal */}
      <Modal isOpen={showMovementModal} onClose={() => setShowMovementModal(false)} title="Enregistrer un mouvement de stock" size="product">
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

      <Modal isOpen={showOcrImportModal} onClose={() => setShowOcrImportModal(false)} title="Analyser bon de commande / facture / BL" size="lg">
        <StocksOcrImportPanel
          statuses={ocrStatuses}
          onUpload={handleUploadStocksOcr}
          onOpenExtraction={handleOpenOcrExtraction}
          onDownload={(documentId, filename) => api.downloadStocksDocument(token, documentId, filename)}
        />
      </Modal>

      <Modal isOpen={showOcrReviewModal} onClose={() => setShowOcrReviewModal(false)} title="Valider la réception OCR" size="full">
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
            onReanalyzeAi={handleReanalyzeOcrWithAi}
            onClose={() => setShowOcrReviewModal(false)}
          />
        )}
      </Modal>
      <StockAssistantPanel
        isOpen={showStockAssistant}
        onClose={() => setShowStockAssistant(false)}
        token={token}
        products={products}
        categories={categories}
        units={units}
        suppliers={suppliers}
        sites={sites}
        locations={locations}
        onApplied={() => { void refresh(); }}
      />

      <button
        className="stock-assistant-fab"
        onClick={() => setShowStockAssistant(true)}
        title="Discuter avec Kokki"
      >
        <img 
          src="/kokkimini-transparent.png" 
          alt="Kokki" 
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'contain',
            transform: 'scale(3.3) translateY(-2px)',
            filter: 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.16))'
          }} 
        />
      </button>

      <Modal isOpen={showSiteModal} onClose={() => setShowSiteModal(false)} title="Créer un site">
        <SiteForm onSubmit={handleCreateSite} onClose={() => setShowSiteModal(false)} />
      </Modal>

      <Modal isOpen={showLocationModal} onClose={() => setShowLocationModal(false)} title="Configurer le site">
        <LocationForm sites={sites} onSubmit={handleCreateLocation} onClose={() => setShowLocationModal(false)} />
      </Modal>

      <Modal isOpen={showInventoryModal} onClose={() => setShowInventoryModal(false)} title="Créer un inventaire complet" size="product">
        <InventoryForm sites={sites} locations={locations} onSubmit={handleCreateInventory} onClose={() => setShowInventoryModal(false)} />
      </Modal>

      <InventoryDetailModal
        inventory={selectedInventory}
        onClose={() => setSelectedInventoryId(null)}
        onSaveCounts={handleSaveInventoryCounts}
        onValidate={handleValidateInventory}
      />

      {showStocksOnboarding ? (
        <StocksOnboardingWizard
          readiness={stocksReadiness}
          categories={categories}
          units={units}
          products={products}
          suppliers={suppliers}
          sites={sites}
          locations={locations}
          movements={movements}
          ocrStatuses={ocrStatuses}
          ocrConfigured={ocrConfigured}
          onPrefill={handlePrefillStocks}
          onImportCsv={openProductImportFromStocksOnboarding}
          onImportCreator={() => {
            setShowStocksOnboarding(false);
            setShowProductCreatorModal(true);
          }}
          onImportOcr={() => {
            setShowStocksOnboarding(false);
            setShowOcrImportModal(true);
          }}
          onCreateMovement={() => {
            setShowStocksOnboarding(false);
            setShowMovementModal(true);
          }}
          onOpenApiKeys={() => {
            setShowStocksOnboarding(false);
            setApiKeysPanelHint(true);
            setActiveTab('organization-general');
          }}
          onOpenProducts={() => {
            setShowStocksOnboarding(false);
            setActiveTab('products');
          }}
          onOpenStocks={() => {
            setShowStocksOnboarding(false);
            setActiveTab('articles');
          }}
          onOpenOcr={() => {
            setShowStocksOnboarding(false);
            setShowOcrImportModal(true);
          }}
          onClose={closeStocksOnboardingToDashboard}
        />
      ) : null}

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
              if (selectedStoreApp.id === 'hr') setActiveTab('hr-dashboard');
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

      <Modal isOpen={showUpdateAvailableModal} onClose={closeUpdateAvailableModal} title={autoUpdateOperation ? 'Installation de la mise à jour' : 'Mise à jour disponible'} size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {autoUpdateOperation ? (
            <div className={`alert-modern ${autoUpdateOperation.status === 'success' ? 'success' : autoUpdateOperation.status === 'error' || autoUpdateOperation.status === 'rollback' ? 'error' : 'info'}`} style={autoUpdateOperation.status === 'running' || autoUpdateOperation.status === 'queued' ? { background: '#f8fafc', borderColor: '#dbe4ef', color: '#334155' } : undefined}>
              {isSystemUpdateRunning(autoUpdateOperation) ? <RefreshCw size={17} className="spin" /> : autoUpdateOperation.status === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
              <span>{systemUpdateOperationMessage(autoUpdateOperation)}</span>
            </div>
          ) : (
            <div className="alert-modern info" style={{ background: '#f8fafc', borderColor: '#dbe4ef', color: '#334155' }}>
              <Download size={17} />
              <span>
                Une nouvelle version stable de ToqueHub est prête à être installée.
              </span>
            </div>
          )}

          <div className="settings-grid-premium">
            <div className="info-card-premium">
              <div className="info-card-premium-header">
                <span className="info-card-premium-label">Version installée</span>
                <span className="info-card-premium-icon"><Server size={16} /></span>
              </div>
              <div className="info-card-premium-value">{autoUpdateStatus?.current.version ?? '-'}</div>
              <span className="badge badge-reception" style={{ width: 'fit-content', marginTop: '0.65rem' }}>{autoUpdateStatus?.current.imageTag ?? 'local'}</span>
            </div>
            <div className="info-card-premium">
              <div className="info-card-premium-header">
                <span className="info-card-premium-label">Nouvelle version</span>
                <span className="info-card-premium-icon"><ExternalLink size={16} /></span>
              </div>
              <div className="info-card-premium-value">{autoUpdateStatus?.latest?.tag ?? autoUpdateStatus?.latest?.version ?? '-'}</div>
              {autoUpdateStatus?.latest?.source ? <span className="badge badge-reception" style={{ width: 'fit-content', marginTop: '0.65rem' }}>{autoUpdateStatus.latest.source === 'release' ? 'GitHub Release' : 'Tag GitHub'}</span> : null}
            </div>
          </div>

          {autoUpdateOperation ? (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{systemUpdateProgress(autoUpdateOperation).label}</strong>
                  <span className="badge badge-reception">{systemUpdateProgress(autoUpdateOperation).percent}%</span>
                </div>
                <div className="progress-bar-bg" style={{ height: '8px', borderRadius: '999px', background: '#e5e7eb', overflow: 'hidden' }}>
                  <div className="progress-bar-fill" style={{ height: '100%', width: `${systemUpdateProgress(autoUpdateOperation).percent}%`, background: autoUpdateOperation.status === 'error' || autoUpdateOperation.status === 'rollback' ? '#ef4444' : '#10b981', borderRadius: '999px', transition: 'width 0.25s ease' }} />
                </div>
              </div>

              <div className="settings-list">
                <div><span>Statut</span><strong>{updateStatusLabel(autoUpdateOperation.status)}</strong></div>
                <div><span>Cible</span><strong>{autoUpdateOperation.targetTag ?? autoUpdateStatus?.latest?.tag ?? '-'}</strong></div>
                <div><span>Démarrée</span><strong>{new Date(autoUpdateOperation.startedAt).toLocaleString('fr-FR')}</strong></div>
                <div><span>Terminée</span><strong>{autoUpdateOperation.finishedAt ? new Date(autoUpdateOperation.finishedAt).toLocaleString('fr-FR') : '-'}</strong></div>
              </div>

              {autoUpdateOperation.error ? <div className="alert-modern error"><AlertCircle size={16} /> {autoUpdateOperation.error}</div> : null}

              <pre style={{ maxHeight: 300, overflow: 'auto', background: '#0f172a', color: '#e2e8f0', padding: '1rem', borderRadius: 12, fontSize: '0.78rem', lineHeight: 1.5, margin: 0 }}>
                {(autoUpdateOperation.logs?.length ? autoUpdateOperation.logs : ['Initialisation de l’opération...']).join('\n')}
              </pre>
            </>
          ) : (
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              L’installation crée d’abord une sauvegarde locale, télécharge les nouvelles images Docker, redémarre l’API et le web, puis vérifie l’état de santé. En cas d’échec, le service tente un rollback automatique.
            </p>
          )}

          {autoUpdateError ? <div className="alert-modern error"><AlertCircle size={16} /> {autoUpdateError}</div> : null}

          <div className="modal-footer" style={{ margin: '0 -1.75rem -1.75rem' }}>
            <button className="btn btn-secondary" onClick={closeUpdateAvailableModal} disabled={autoUpdateApplying || isSystemUpdateRunning(autoUpdateOperation)}>
              {autoUpdateOperation?.status === 'success' ? 'Fermer' : 'Plus tard'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setActiveTab('settings');
                setShowUpdateAvailableModal(false);
              }}
              disabled={autoUpdateApplying || isSystemUpdateRunning(autoUpdateOperation)}
            >
              Voir détails
            </button>
            {!autoUpdateOperation || autoUpdateOperation.status === 'error' || autoUpdateOperation.status === 'rollback' ? (
              <button className="btn btn-primary" onClick={() => void applyUpdateFromModal()} disabled={autoUpdateApplying || !autoUpdateStatus?.runtime.updaterAvailable}>
                <Download size={15} />
                {autoUpdateApplying ? 'Lancement...' : autoUpdateOperation ? 'Réessayer' : 'Installer maintenant'}
              </button>
            ) : null}
          </div>
        </div>
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

      <Modal isOpen={showInstanceModal} onClose={() => setShowInstanceModal(false)} title="Instance locale" size="lg">
        <InstanceInfoPanel
          info={instanceInfo}
          loading={instanceLoading}
          error={instanceError}
          onRefresh={() => void openInstanceModal()}
          onNotify={addAppNotification}
        />
      </Modal>

      <Modal isOpen={showChangelogModal} onClose={() => setShowChangelogModal(false)} title="Changelog" size="lg">
        <ChangelogPanel
          changelog={changelog}
          loading={changelogLoading}
          error={changelogError}
          onRefresh={() => void openChangelogModal()}
        />
      </Modal>
    </div>
  );
}

// =========================================================================
// REUSABLE SUB-COMPONENTS
// =========================================================================

function formatInstanceBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}j ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

function InstanceStatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`instance-status-pill ${ok ? 'ok' : 'warn'}`}>
      {ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
      {label}
    </span>
  );
}

function InstanceInfoRow({ label, value }: { label: string; value?: ReactNode | null }) {
  return (
    <div className="instance-info-row">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

function InstanceInfoCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="instance-info-card">
      <div className="instance-info-card-header">
        <span className="instance-info-icon">{icon}</span>
        <h4>{title}</h4>
      </div>
      <div className="instance-info-card-body">{children}</div>
    </section>
  );
}

function InstanceInfoPanel({
  info,
  loading,
  error,
  onRefresh,
  onNotify,
}: {
  info: SystemInstanceInfo | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNotify: (type: AppNotification['type'], message: string) => void;
}) {
  async function copyDiagnostic() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
      onNotify('success', 'Diagnostic instance copié.');
    } catch {
      onNotify('error', 'Impossible de copier le diagnostic.');
    }
  }

  if (loading && !info) {
    return (
      <div className="instance-loading">
        <RefreshCw size={18} className="spin" />
        Chargement du diagnostic...
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="instance-empty">
        <AlertCircle size={22} />
        <strong>Diagnostic indisponible</strong>
        <span>{error}</span>
        <button type="button" className="btn btn-primary" onClick={onRefresh}>
          <RefreshCw size={15} />
          Réessayer
        </button>
      </div>
    );
  }

  if (!info) return null;

  const frontendUrl = typeof window !== 'undefined' ? window.location.origin : info.frontend.url;
  const apiDocsUrl = `${info.api.url.replace(/\/api$/, '')}${info.api.docsPath}`;
  const detectedSerialPorts = info.mqtt.detectedSerialPorts ?? [];
  const zigbeeAdapterPresent = Boolean(info.mqtt.zigbeeAdapterPresent);

  return (
    <div className="instance-info-panel">
      <div className="instance-info-toolbar">
        <div>
          <p>Généré le {new Date(info.generatedAt).toLocaleString('fr-FR')}</p>
          {loading && <span>Actualisation...</span>}
          {error && <span className="instance-error">{error}</span>}
        </div>
        <div className="instance-info-actions">
          <button type="button" className="btn btn-secondary" onClick={copyDiagnostic}>
            <Copy size={15} />
            Copier
          </button>
          <button type="button" className="btn btn-secondary" onClick={onRefresh}>
            <RefreshCw size={15} />
            Rafraîchir
          </button>
        </div>
      </div>

      <div className="instance-info-grid">
        <InstanceInfoCard icon={<Server size={18} />} title="Application">
          <InstanceInfoRow label="Version" value={info.app.version} />
          <InstanceInfoRow label="Package API" value={info.app.apiPackage} />
          <InstanceInfoRow label="Environnement" value={info.app.nodeEnv} />
          <InstanceInfoRow label="Licence" value={info.app.license} />
        </InstanceInfoCard>

        <InstanceInfoCard icon={<ExternalLink size={18} />} title="Adresses">
          <InstanceInfoRow label="Frontend" value={<a href={frontendUrl} target="_blank" rel="noreferrer">{frontendUrl}</a>} />
          <InstanceInfoRow label="Backend" value={<a href={info.api.url} target="_blank" rel="noreferrer">{info.api.url}</a>} />
          <InstanceInfoRow label="Swagger" value={<a href={apiDocsUrl} target="_blank" rel="noreferrer">{apiDocsUrl}</a>} />
          <InstanceInfoRow label="Origines CORS" value={info.frontend.configuredOrigins.join(', ') || '-'} />
        </InstanceInfoCard>

        <InstanceInfoCard icon={<Database size={18} />} title="PostgreSQL">
          <InstanceInfoRow label="Statut" value={<InstanceStatusPill ok={info.database.connected} label={info.database.connected ? 'Connecté' : 'Erreur'} />} />
          <InstanceInfoRow label="Hôte" value={info.database.host} />
          <InstanceInfoRow label="Port" value={info.database.port} />
          <InstanceInfoRow label="Base" value={info.database.database} />
          <InstanceInfoRow label="URL" value={info.database.url} />
        </InstanceInfoCard>

        <InstanceInfoCard icon={<Wifi size={18} />} title="Mosquitto / MQTT">
          <InstanceInfoRow label="Statut" value={<InstanceStatusPill ok={info.mqtt.configured} label={info.mqtt.configured ? 'Configuré' : 'Non configuré'} />} />
          <InstanceInfoRow label="Broker" value={info.mqtt.broker} />
          <InstanceInfoRow label="Topic Zigbee" value={info.mqtt.baseTopic} />
          <InstanceInfoRow label="Zigbee2MQTT" value={info.mqtt.zigbee2mqttFrontendUrl ? <a href={info.mqtt.zigbee2mqttFrontendUrl} target="_blank" rel="noreferrer">{info.mqtt.zigbee2mqttFrontendUrl}</a> : null} />
          <InstanceInfoRow label="Clé Zigbee" value={<InstanceStatusPill ok={zigbeeAdapterPresent} label={zigbeeAdapterPresent ? 'Détectée' : 'Introuvable'} />} />
          <InstanceInfoRow label="Configurée" value={info.mqtt.zigbeeAdapterPath} />
          <InstanceInfoRow label="Détectée" value={detectedSerialPorts.join(', ') || info.mqtt.suggestedZigbeeAdapterPath} />
        </InstanceInfoCard>

        <InstanceInfoCard icon={<HardDrive size={18} />} title="Docker & stockage">
          <InstanceInfoRow label="Docker" value={<InstanceStatusPill ok={info.docker.containerized} label={info.docker.containerized ? 'Conteneur' : 'Hors conteneur'} />} />
          <InstanceInfoRow label="Projet Compose" value={info.docker.composeProject} />
          <InstanceInfoRow label="Architecture" value={info.docker.architecture} />
          <InstanceInfoRow label="Uploads" value={info.storage.uploadDir} />
          <InstanceInfoRow label="Backups" value={info.storage.backupDir} />
        </InstanceInfoCard>

        <InstanceInfoCard icon={<Cpu size={18} />} title="Machine">
          <InstanceInfoRow label="Hôte" value={info.host.hostname} />
          <InstanceInfoRow label="Système" value={`${info.host.platform} ${info.host.release}`} />
          <InstanceInfoRow label="CPU" value={`${info.host.cpuCount} coeurs (${info.host.arch})`} />
          <InstanceInfoRow label="Mémoire" value={`${formatInstanceBytes(info.host.freeMemoryBytes)} libres / ${formatInstanceBytes(info.host.totalMemoryBytes)}`} />
          <InstanceInfoRow label="Uptime API" value={formatDuration(info.api.uptimeSeconds)} />
        </InstanceInfoCard>
      </div>
    </div>
  );
}

function formatChangelogDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function ChangelogPanel({
  changelog,
  loading,
  error,
  onRefresh,
}: {
  changelog: SystemChangelogResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (loading && !changelog) {
    return (
      <div className="instance-loading">
        <RefreshCw size={18} className="spin" />
        Chargement du changelog...
      </div>
    );
  }

  if (error && !changelog) {
    return (
      <div className="instance-empty">
        <AlertCircle size={22} />
        <strong>Changelog indisponible</strong>
        <span>{error}</span>
        <button type="button" className="btn btn-primary" onClick={onRefresh}>
          <RefreshCw size={15} />
          Réessayer
        </button>
      </div>
    );
  }

  if (!changelog) return null;

  return (
    <div className="changelog-panel">
      <div className="changelog-toolbar">
        <div>
          <strong>Releases stables GitHub</strong>
          <span>
            {changelog.repo} · version installée {changelog.currentVersion || '-'} · vérifié le{' '}
            {new Date(changelog.checkedAt).toLocaleString('fr-FR')}
          </span>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={loading}>
          <RotateCw size={15} className={loading ? 'spin' : undefined} />
          Actualiser
        </button>
      </div>

      {error ? <div className="alert-modern error"><AlertCircle size={16} /> GitHub : {error}</div> : null}

      {!changelog.entries.length ? (
        <div className="instance-empty">
          <Info size={22} />
          <strong>Aucune release stable</strong>
          <span>Publiez un tag vX.Y.Z pour générer automatiquement une release et l’afficher ici.</span>
        </div>
      ) : (
        <div className="changelog-list">
          {changelog.entries.map((entry) => (
            <article key={entry.tag} className="changelog-entry">
              <div className="changelog-entry-header">
                <div>
                  <h4>{entry.name || entry.tag}</h4>
                  <span>{formatChangelogDate(entry.publishedAt)}</span>
                </div>
                <div className="changelog-entry-actions">
                  {entry.isLatest ? <span className="changelog-pill latest">Dernière</span> : null}
                  {entry.isInstalled ? <span className="changelog-pill installed">Installée</span> : null}
                  <span className="changelog-pill">{entry.tag}</span>
                  {entry.url ? (
                    <a href={entry.url} target="_blank" rel="noreferrer" title="Voir la release GitHub">
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>
              </div>
              <pre>{entry.notes?.trim() || 'Aucune note de version publiée pour cette release.'}</pre>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

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

const OCR_FALLBACK_CATEGORY_NAME = 'Divers produits';
const ocrFallbackCategoryCache = new Map<string, Promise<Category>>();

const CATEGORY_KEYWORDS: Array<{ name: string; hints: string[]; aliases: string[] }> = [
  { name: 'Viandes', hints: ['boeuf', 'bœuf', 'veau', 'porc', 'agneau', 'volaille', 'poulet', 'dinde', 'canard', 'jambon', 'saucisse', 'steak', 'viande', 'charcuterie', 'lardon', 'merguez', 'chipolata'], aliases: ['viande', 'viandes', 'boucherie', 'volaille', 'volailles', 'produits frais'] },
  { name: 'Poissons', hints: ['poisson', 'saumon', 'thon', 'cabillaud', 'colin', 'merlu', 'crevette', 'moule', 'huitre', 'huître', 'surimi', 'maree', 'marée', 'lieu', 'truite', 'calamar', 'encornet'], aliases: ['poisson', 'poissons', 'maree', 'marée', 'produits de la mer', 'produits frais'] },
  { name: 'Produits laitiers', hints: ['lait', 'beurre', 'creme', 'crème', 'fromage', 'yaourt', 'emmental', 'mozzarella', 'laitier', 'oeuf', 'œuf', 'oeufs', 'œufs', 'camembert', 'brie', 'comte', 'comté'], aliases: ['cremerie', 'crèmerie', 'produits laitiers', 'laitier', 'fromage', 'produits frais'] },
  { name: 'Fruits et légumes', hints: ['carotte', 'tomate', 'salade', 'oignon', 'pomme de terre', 'courgette', 'fruit', 'legume', 'légume', 'pomme', 'banane', 'poire', 'orange', 'citron', 'ail', 'echalote', 'échalote', 'champignon', 'haricot', 'endive'], aliases: ['fruits', 'legumes', 'légumes', 'primeur', 'fruits et legumes', 'fruits et légumes', 'produits frais'] },
  { name: 'Boulangerie', hints: ['pain', 'baguette', 'brioche', 'viennoiserie', 'croissant', 'patisserie', 'pâtisserie', 'tarte', 'gateau', 'gâteau'], aliases: ['boulangerie', 'patisserie', 'pâtisserie', 'pain', 'produits frais'] },
  { name: 'Épicerie', hints: ['riz', 'pate', 'pâte', 'pates', 'pâtes', 'farine', 'sucre', 'huile', 'vinaigre', 'conserve', 'sauce', 'epice', 'épice', 'sel', 'poivre', 'moutarde', 'mayonnaise', 'biscuit', 'chocolat', 'cacao', 'dessert', 'semoule', 'couscous', 'lentille', 'pois chiche'], aliases: ['epicerie', 'épicerie', 'sec', 'produits secs'] },
  { name: 'Surgelés', hints: ['surg', 'surgele', 'surgelé', 'surgeles', 'surgelés', 'glace', 'congele', 'congelé', 'congeles', 'congelés', 'frozen'], aliases: ['surgeles', 'surgelés', 'surgelé', 'congelé'] },
  { name: 'Boissons', hints: ['eau', 'jus', 'soda', 'vin', 'biere', 'bière', 'cafe', 'café', 'the', 'thé', 'boisson', 'sirop', 'limonade', 'lait boisson'], aliases: ['boisson', 'boissons', 'cave'] },
  { name: 'Hygiène et entretien', hints: ['detergent', 'détergent', 'desinfectant', 'désinfectant', 'savon', 'nettoyant', 'lessive', 'javel', 'essuie-main', 'papier toilette', 'entretien', 'hygiene', 'hygiène'], aliases: ['hygiene', 'hygiène', 'entretien', 'non alimentaire', 'consommables'] },
  { name: 'Emballages', hints: ['barquette', 'film', 'gant', 'papier', 'sac', 'gobelet', 'serviette', 'emballage', 'couvercle', 'aluminium', 'papier cuisson'], aliases: ['emballage', 'emballages', 'non alimentaire', 'consommables'] },
  { name: 'Nutrition médicale', hints: ['clinutren', 'thickenup', 'resource', 'nestle health', 'complement nutritionnel', 'complément nutritionnel', 'nutrition', 'epaississant', 'épaississant', 'denutrition', 'dénutrition'], aliases: ['nutrition medicale', 'nutrition médicale', 'nutrition', 'dietétique', 'diététique', 'epicerie', 'épicerie'] },
];

function findCategoryByBusinessName(categories: Category[], name?: string | null) {
  const normalizedName = normalizeProductSearchText(name);
  if (!normalizedName) return undefined;
  return categories
    .filter((category) => !isArchived(category))
    .map((category) => {
      const haystack = normalizeProductSearchText(`${category.name} ${category.description ?? ''}`);
      return {
        category,
        score: Math.max(
          normalizeLookup(category.name) === normalizeLookup(name) ? 1 : 0,
          haystack.includes(normalizedName) ? 0.86 : 0,
          normalizedName.includes(normalizeProductSearchText(category.name)) ? 0.78 : 0,
          tokenSimilarity(name, `${category.name} ${category.description ?? ''}`),
        ),
      };
    })
    .filter((item) => item.score >= 0.46)
    .sort((a, b) => b.score - a.score)[0]?.category;
}

function ocrKeywordCategoryRule(line: StocksOcrLine) {
  const text = normalizeProductSearchText([
    line.ocrLabel,
    line.label,
    line.reference,
    line.categoryName,
    line.suggestedCategoryName,
  ].filter(Boolean).join(' '));
  return CATEGORY_KEYWORDS.find((rule) => rule.hints.some((hint) => {
    const normalizedHint = normalizeProductSearchText(hint);
    return normalizedHint && (text.includes(normalizedHint) || tokenSimilarity(text, normalizedHint) >= 0.72);
  }));
}

function isGenericOcrCategoryName(name?: string | null) {
  return ['non classé', 'non classe', 'à classer', 'a classer', 'sans catégorie', 'sans categorie', 'divers', 'autres'].includes(normalizeSearchText(name));
}

function inferOcrCategoryId(line: StocksOcrLine, categories: Category[], products: Product[]) {
  const activeCategories = categories.filter((category) => !isArchived(category));
  const aiCategoryId = line.categoryId ?? line.suggestedCategoryId ?? null;
  if (aiCategoryId && activeCategories.some((category) => category.id === aiCategoryId)) return aiCategoryId;

  const aiCategoryName = line.categoryName ?? line.suggestedCategoryName ?? null;
  if (aiCategoryName) {
    const categoryByName = findCategoryByBusinessName(activeCategories, aiCategoryName);
    if (categoryByName) return categoryByName.id;
  }

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

  const keywordRule = ocrKeywordCategoryRule(line);
  if (keywordRule) {
    const category = findCategoryByBusinessName(activeCategories, keywordRule.name)
      ?? keywordRule.aliases.map((alias) => findCategoryByBusinessName(activeCategories, alias)).find(Boolean);
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
  const keywordRule = ocrKeywordCategoryRule(line);
  const suggestedCategoryName = String(line.categoryName ?? line.suggestedCategoryName ?? keywordRule?.name ?? '').trim();
  if (suggestedCategoryName && !isGenericOcrCategoryName(suggestedCategoryName)) {
    const cacheKey = `${token}:suggested:${normalizeLookup(suggestedCategoryName)}`;
    if (!ocrFallbackCategoryCache.has(cacheKey)) {
      ocrFallbackCategoryCache.set(cacheKey, api.createCategory(token, {
        name: suggestedCategoryName,
        description: 'Catégorie proposée automatiquement par l’analyse IA OCR.',
      }).catch(async () => {
        const refreshed = await api.categories(token);
        const existing = refreshed.find((category) => normalizeLookup(category.name) === normalizeLookup(suggestedCategoryName));
        if (!existing) throw new Error(`Impossible de créer ou retrouver la catégorie "${suggestedCategoryName}".`);
        return existing;
      }));
    }
    return (await ocrFallbackCategoryCache.get(cacheKey)!).id;
  }
  const firstUsefulCategory = categories.find((category) => !isArchived(category) && !['aclasser', 'sanscategorie', 'nonclasse'].includes(normalizeLookup(category.name)));
  if (firstUsefulCategory) return firstUsefulCategory.id;
  const fallback = categories.find((category) => {
    const key = normalizeLookup(category.name);
    return !isArchived(category) && ['diversproduits', 'autres', 'divers'].includes(key);
  });
  if (fallback) return fallback.id;
  const cacheKey = `${token}:${OCR_FALLBACK_CATEGORY_NAME}`;
  if (!ocrFallbackCategoryCache.has(cacheKey)) {
    ocrFallbackCategoryCache.set(cacheKey, api.createCategory(token, {
      name: OCR_FALLBACK_CATEGORY_NAME,
      description: 'Catégorie créée automatiquement pour les produits OCR quand aucune catégorie métier fiable n’existe encore.',
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
    kpl: ['piece', 'pieces', 'u', 'unite', 'unites', 'pc', 'pcs'],
    pc: ['piece', 'pieces', 'u', 'unite', 'unites'],
    pcs: ['piece', 'pieces', 'u', 'unite', 'unites'],
    pu: ['piece', 'pieces', 'u', 'unite', 'unites'],
    u: ['piece', 'pieces', 'u', 'unite', 'unites'],
    po: ['piece', 'pieces', 'u', 'unite', 'unites'],
    pi: ['piece', 'pieces', 'u', 'unite', 'unites'],
    col: ['carton', 'colis', 'caisse'],
    colis: ['carton', 'colis', 'caisse'],
    carton: ['carton', 'colis', 'caisse'],
    ltk: ['carton', 'caisse', 'colis'],
    paq: ['paquet', 'carton', 'piece', 'pieces'],
    pak: ['paquet', 'piece', 'pieces', 'u', 'unite', 'unites'],
    pkt: ['paquet', 'piece', 'pieces', 'u', 'unite', 'unites'],
    plq: ['plaquette', 'piece', 'pieces'],
    prk: ['pot', 'bocal', 'piece', 'pieces', 'u', 'unite', 'unites'],
    pss: ['sachet', 'sac', 'piece', 'pieces', 'u', 'unite', 'unites'],
    rs: ['barquette', 'piece', 'pieces', 'u', 'unite', 'unites'],
    tlk: ['boite', 'piece', 'pieces', 'u', 'unite', 'unites'],
  };
  for (const wanted of [key, ...(aliases[key] ?? [])]) {
    const found = units.find((unit) => normalizeLookup(unit.symbol) === wanted || normalizeLookup(unit.name) === wanted);
    if (found) return found.id;
  }
  return '';
}

function resolveOcrReceptionUnits(data: StocksOcrExtraction['data'], units: Unit[]): StocksOcrExtraction['data'] {
  return {
    ...data,
    lines: (data.lines || []).map((line) => {
      const unitLabel = ocrLineUnitLabel(line);
      return {
        ...line,
        unit: line.unit ?? unitLabel ?? null,
        unitId: line.unitId || resolveOcrUnitId(units, line.unitId, unitLabel) || null,
      };
    }),
  };
}

function ocrLineUnitLabel(line: StocksOcrLine) {
  return line.matchedUnitSymbol || line.unit || inferOcrUnitLabel(line);
}

function inferOcrUnitLabel(line: StocksOcrLine) {
  const text = [line.sourceText, line.ocrLabel, line.label, line.packageDescription, line.descriptionOriginal].filter(Boolean).join(' ');
  const patterns = [
    /€\s*\/\s*([A-Za-z]{1,4})\b/i,
    /\b[0-9]+(?:[,.][0-9]+)?\s*(LTK|PKT|KPL|RS|PSS|TLK|PRK|PAK|KG|G|L|ML|PC|PCS)\b/i,
    /\b(LTK|PKT|KPL|RS|PSS|TLK|PRK|PAK|KG|G|L|ML|PC|PCS)\s*\(/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
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

function movementEffectiveDate(movement: StockMovement) {
  return new Date(movement.movementDate ?? movement.date ?? movement.createdAt);
}

function sortMovementsByRecency(movements: StockMovement[]) {
  return [...movements].sort((a, b) => {
    const effectiveDiff = movementEffectiveDate(b).getTime() - movementEffectiveDate(a).getTime();
    if (effectiveDiff !== 0) return effectiveDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
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

function MyDocumentsPage({ data, loading, search, supplierFilter, typeFilter, dateFrom, dateTo, onSearch, onSupplierFilter, onTypeFilter, onDateFrom, onDateTo, onRefresh, onView, onDownload, onRename }: { data: MyDocumentsResponse | null; loading: boolean; search: string; supplierFilter: string; typeFilter: string; dateFrom: string; dateTo: string; onSearch: (value: string) => void; onSupplierFilter: (value: string) => void; onTypeFilter: (value: string) => void; onDateFrom: (value: string) => void; onDateTo: (value: string) => void; onRefresh: () => void; onView: (document: MyDocument) => Promise<void>; onDownload: (document: MyDocument) => Promise<void>; onRename: (document: MyDocument, newName: string) => Promise<void> }) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const items = data?.items ?? [];
  const summary = data?.summary;

  const handleRename = (document: MyDocument) => {
    const cleanName = document.originalName.includes('.')
      ? document.originalName.substring(0, document.originalName.lastIndexOf('.'))
      : document.originalName;
    const newName = window.prompt('Renommer le document :', cleanName);
    if (newName && newName.trim() && newName.trim() !== cleanName) {
      void onRename(document, newName.trim());
    }
  };

  return (
    <div className="my-documents-page">
      <motion.section
        className="welcome-hero documents-hero"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="welcome-hero-content">
          <span className="welcome-tag"><FileText size={14} /> Organisation</span>
          <h1 className="welcome-title">Mes Documents</h1>
          <p className="welcome-desc">Bibliothèque des factures et bons de livraison importés dans ToqueHub, classés par fournisseur et par date.</p>
        </div>
        <div className="welcome-hero-backdrop" />
      </motion.section>

      <div className="metrics-grid">
        <Metric icon={<FileText size={20} />} value={summary?.total ?? 0} label="Documents" tone="blue" />
        <Metric icon={<UsersRound size={20} />} value={summary?.suppliers.length ?? 0} label="Fournisseurs" tone="emerald" delay={1} />
        <Metric icon={<CheckCircle2 size={20} />} value={summary?.ready ?? 0} label="Prêts" tone="emerald" delay={2} />
        <Metric icon={<Clock size={20} />} value={summary?.processing ?? 0} label="En analyse" tone="purple" delay={3} />
      </div>

      <div className="documents-toolbar-modern card-modern">
        <div className="search-input-wrapper-modern">
          <Search size={16} className="search-icon" />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Rechercher fournisseur, numéro, fichier..." />
        </div>

        <div className="filters-group-modern">
          <div className="select-wrapper-modern">
            <Building2 size={14} className="select-icon" />
            <select value={supplierFilter} onChange={(event) => onSupplierFilter(event.target.value)}>
              <option value="">Tous les fournisseurs</option>
              {(summary?.suppliers ?? []).map((supplier) => (
                <option key={supplier.id ?? supplier.name} value={supplier.id ?? supplier.name}>{supplier.name} ({supplier.count})</option>
              ))}
            </select>
          </div>

          <div className="select-wrapper-modern">
            <Filter size={14} className="select-icon" />
            <select value={typeFilter} onChange={(event) => onTypeFilter(event.target.value)}>
              <option value="all">Tous les types</option>
              <option value="invoice">Factures</option>
              <option value="delivery_note">Bons de livraison</option>
              <option value="supplier_order">Commandes fournisseur</option>
              <option value="order_confirmation">Confirmations de commande</option>
              <option value="unknown">Non classés</option>
            </select>
          </div>

          <div className="date-inputs-modern">
            <input type="date" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} title="Date de début" />
            <span className="date-separator">→</span>
            <input type="date" value={dateTo} onChange={(event) => onDateTo(event.target.value)} title="Date de fin" />
          </div>
        </div>

        <div className="toolbar-actions-modern">
          <div className="view-switcher-modern">
            <button
              className={`switcher-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Vue Grille"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={`switcher-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Vue Liste"
            >
              <List size={15} />
            </button>
          </div>

          <button className="btn btn-secondary-modern btn-refresh-modern" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>{loading ? 'Chargement...' : 'Actualiser'}</span>
          </button>
        </div>
      </div>

      <div className="documents-layout">
        <div className="documents-main-content">
          <AnimatePresence mode="wait">
            {items.length ? (
              viewMode === 'grid' ? (
                <motion.div
                  key="grid"
                  className="documents-grid-layout"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {items.map((document) => (
                    <motion.div
                      key={document.id}
                      className="document-card-modern"
                      whileHover={{ y: -6, transition: { duration: 0.2 } }}
                    >
                      <div className="doc-card-header">
                        <div className={`doc-icon-badge type-${document.type || 'unknown'}`}>
                          <FileText size={20} />
                        </div>
                        <span className={`badge-pill ${documentStateBadge(document.processingState)}`}>
                          {documentStateLabel(document.processingState)}
                        </span>
                      </div>

                      <div className="doc-card-body">
                        <h3 className="doc-title" title={document.originalName}>
                          {document.originalName}
                        </h3>
                        <div className="doc-meta-info">
                          <span className="meta-tag">
                            <Calendar size={11} />
                            {formatDocumentDate(document.documentDate || document.createdAt)}
                          </span>
                          <span className="meta-tag">
                            <Layers size={11} />
                            {formatBytes(document.sizeBytes)}
                          </span>
                        </div>

                        {document.invoiceNumber || document.deliveryNoteNumber ? (
                          <div className="doc-number-box">
                            <span className="number-label">Réf :</span>
                            <span className="number-value">{document.invoiceNumber || document.deliveryNoteNumber}</span>
                          </div>
                        ) : (
                          <div className="doc-number-box empty-ref">
                            <span className="number-label">Sans référence</span>
                          </div>
                        )}

                        <div className="doc-type-badge-row">
                          <span className={`badge-pill ${documentTypeBadge(document.type)}`}>
                            {documentTypeLabel(document.type)}
                          </span>
                        </div>
                      </div>

                      <div className="doc-card-footer">
                        <div className="doc-supplier" title={document.supplierName || 'Fournisseur non identifié'}>
                          <div className="supplier-avatar-modern">
                            {(document.supplierName || 'N').charAt(0).toUpperCase()}
                          </div>
                          <span className="supplier-name-text">
                            {document.supplierName || 'Non classé'}
                          </span>
                        </div>
                        <div className="doc-actions">
                          <button className="doc-action-btn rename" onClick={() => handleRename(document)} title="Renommer">
                            <Edit3 size={14} />
                          </button>
                          <button className="doc-action-btn view" onClick={() => void onView(document)} title="Aperçu">
                            <Eye size={14} />
                          </button>
                          <button className="doc-action-btn download" onClick={() => void onDownload(document)} title="Télécharger">
                            <Download size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  className="card-modern list-card-wrapper"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="card-title-container">
                    <span className="card-title"><FileText size={18} /> Documents importés</span>
                    <span className="section-tagline">{items.length} fichier{items.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="table-wrapper documents-table-modern">
                    <table>
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Fournisseur</th>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Statut</th>
                          <th className="align-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((document) => (
                          <tr key={document.id} className="document-list-row-modern">
                            <td>
                              <div className="document-name-cell-modern">
                                <div className="list-doc-icon-wrapper">
                                  <FileText size={16} />
                                </div>
                                <div className="list-doc-text">
                                  <strong>{document.originalName}</strong>
                                  <small>{document.invoiceNumber || document.deliveryNoteNumber || formatBytes(document.sizeBytes)}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="list-supplier-name">
                                {document.supplierName || 'Non classé'}
                              </span>
                            </td>
                            <td>
                              <span className="list-date">
                                {formatDocumentDate(document.documentDate || document.createdAt)}
                              </span>
                            </td>
                            <td>
                              <span className={`badge-pill ${documentTypeBadge(document.type)}`}>
                                {documentTypeLabel(document.type)}
                              </span>
                            </td>
                            <td>
                              <span className={`badge-pill ${documentStateBadge(document.processingState)}`}>
                                {documentStateLabel(document.processingState)}
                              </span>
                            </td>
                            <td>
                              <div className="row-actions-modern">
                                <button className="doc-action-btn rename" onClick={() => handleRename(document)} title="Renommer">
                                  <Edit3 size={13} />
                                </button>
                                <button className="doc-action-btn view" onClick={() => void onView(document)} title="Aperçu">
                                  <Eye size={13} />
                                </button>
                                <button className="doc-action-btn download" onClick={() => void onDownload(document)} title="Télécharger">
                                  <Download size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <EmptyMini title={loading ? 'Chargement...' : 'Aucun document'} text="Les bons de commande, factures et BL importés via l’OCR Stocks apparaîtront ici." icon="📄" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="documents-insights-modern">
          <div className="card-modern insight-card-modern">
            <span className="card-title"><UsersRound size={18} /> Par fournisseur</span>
            <div className="documents-insight-list-modern">
              {(summary?.suppliers ?? []).slice(0, 8).map((supplier) => (
                <button
                  key={supplier.id ?? supplier.name}
                  className={`insight-row-btn-modern ${supplierFilter === (supplier.id ?? supplier.name) ? 'active' : ''}`}
                  onClick={() => onSupplierFilter(supplier.id ?? supplier.name)}
                >
                  <div className="insight-row-left">
                    <Building2 size={13} className="insight-icon" />
                    <span>{supplier.name}</span>
                  </div>
                  <span className="insight-count">{supplier.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card-modern insight-card-modern">
            <span className="card-title"><Calendar size={18} /> Par mois</span>
            <div className="documents-insight-list-modern">
              {(summary?.months ?? []).slice(0, 8).map((month) => (
                <div key={month.key} className="insight-row-btn-modern static">
                  <div className="insight-row-left">
                    <Calendar size={13} className="insight-icon" />
                    <span>{month.label}</span>
                  </div>
                  <span className="insight-count">{month.count}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function computeStocksReadiness(categories: Category[], units: Unit[], products: Product[], sites: Site[], locations: Location[], movements: StockMovement[], ocrStatuses: StocksOcrStatus[]): StocksReadiness {
  const activeCategories = categories.filter((item) => !isArchived(item));
  const activeUnits = units.filter((item) => !isArchived(item));
  const activeProducts = products.filter((item) => !isArchived(item));
  const activeSites = sites.filter((item) => !isArchived(item));
  const activeLocations = locations.filter((item) => !isArchived(item));
  const foundationReady = Boolean(activeCategories.length && activeUnits.length && activeSites.length && activeLocations.length);
  const catalogReady = Boolean(activeProducts.length);
  const hasValidatedOcr = ocrStatuses.some((status) => {
    const document = status.document as unknown as { receptionId?: string | null; receptionStatus?: string | null } | undefined;
    return Boolean(document?.receptionId || document?.receptionStatus === 'VALIDATED' || (status as any).reception?.status === 'VALIDATED');
  });
  const flowReady = Boolean(movements.length || hasValidatedOcr);
  const completed = [foundationReady, catalogReady, flowReady].filter(Boolean).length;
  const nextStep: StocksOnboardingStep = !flowReady ? 'reception' : 'review';
  return { foundationReady, catalogReady, flowReady, progress: Math.round((completed / 3) * 100), nextStep };
}

function StocksSetupCard({ readiness, products, sites, onStart, onDismiss }: { readiness: StocksReadiness; products: Product[]; sites: Site[]; onStart: () => void; onDismiss?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const activeProducts = products.filter((item) => !isArchived(item)).length;
  const activeSites = sites.filter((item) => !isArchived(item)).length;
  const label = readiness.flowReady ? 'Configuration terminée' : activeProducts === 0 ? 'Produits à importer ou document à analyser' : 'Bon de commande à analyser';
  const steps = [
    { title: 'Socle auto', text: `${activeSites} site(s)`, done: readiness.foundationReady },
    { title: 'Catalogue', text: `${activeProducts} produit(s)`, done: activeProducts > 0 },
    { title: 'Analyse', text: 'Bon de commande, facture ou BL', done: readiness.flowReady },
  ];
  return (
    <motion.section className="card-modern stocks-setup-card" style={{ position: 'relative' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="stocks-widget-close-btn"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            zIndex: 5,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.color = 'var(--text-main)';
            e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.background = 'transparent';
          }}
          title="Masquer"
        >
          <X size={14} />
        </button>
      )}
      <div className="section-header-modern">
        <div className="section-info">
          <span className="card-title"><Sparkles size={18} /> Configuration initiale Stocks</span>
          <span className="section-tagline">{label}</span>
        </div>
        <div className="stocks-setup-actions" style={onDismiss ? { marginRight: '1.25rem' } : undefined}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Replier' : 'Détails'}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onStart}>{readiness.progress === 100 ? 'Revoir' : 'Continuer'}</button>
        </div>
      </div>
      <div className="stocks-setup-progress">
        <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${readiness.progress}%` }} /></div>
        <strong>{readiness.progress}%</strong>
      </div>
      {expanded ? (
        <div className="stocks-setup-step-grid">
          {steps.map((step) => (
            <div key={step.title} className={`stocks-setup-step ${step.done ? 'done' : 'todo'}`}>
              {step.done ? <CheckCircle2 size={16} /> : <Clock size={16} />}
              <div><strong>{step.title}</strong><span>{step.text}</span></div>
            </div>
          ))}
        </div>
      ) : null}
    </motion.section>
  );
}

function StocksIllustration() {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
      <div
        className="card-modern"
        style={{
          background: '#0f172a',
          color: 'white',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0 30px 60px rgba(9, 13, 22, 0.25)',
          padding: '1.5rem',
          borderRadius: '20px',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Structure des Stocks</span>
            <span className="badge badge-reception" style={{ fontSize: '0.72rem', textTransform: 'none', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', borderColor: 'transparent' }}>Prêt</span>
          </div>

          {[
            { label: 'Socle de stockage', val: 100, color: '#10b981' },
            { label: 'Catalogue produits', val: 100, color: '#10b981' },
            { label: 'Réception & Mouvements', val: 100, color: '#f59e0b' },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.03)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{item.label}</span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Actif</span>
              </div>
              <div className="progress-bar-bg" style={{ height: '5px', background: 'rgba(255, 255, 255, 0.1)' }}>
                <div className="progress-bar-fill" style={{ width: `${item.val}%`, background: item.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StocksOnboardingAside({
  step,
  readiness,
  activeProducts,
  activeSuppliers,
  movements,
}: {
  step: StocksOnboardingStep;
  readiness: StocksReadiness;
  activeProducts: any[];
  activeSuppliers: any[];
  movements: any[];
}) {
  const steps = [
    { key: 'welcome', label: 'Bienvenue' },
    { key: 'reception', label: 'Importer & analyser' },
    { key: 'review', label: 'Résumé & Validation' },
  ] as Array<{ key: StocksOnboardingStep; label: string }>;
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Package size={28} color="#10b981" />
          <span style={{ fontWeight: 850, fontSize: '1.2rem', color: 'white', letterSpacing: '-0.03em' }}>
            TOQUE<span style={{ color: '#10b981' }}>HUB</span> STOCKS
          </span>
        </div>

        <div>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: '#10b981', letterSpacing: '0.15em' }}>
            Installation guidée
          </span>
          <h3 style={{ color: 'white', fontSize: '1.35rem', marginTop: '0.3rem', fontWeight: 800, lineHeight: 1.25 }}>
            Assistant Stocks
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {steps.map((item, idx) => {
            const isPast = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            return (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                  color: isPast || isCurrent ? 'white' : 'rgba(255, 255, 255, 0.35)',
                  fontWeight: isCurrent ? 700 : 500,
                  fontSize: '0.9rem',
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isPast ? '#10b981' : isCurrent ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    border: isCurrent ? '1.5px solid #10b981' : '1px solid transparent',
                    color: isPast ? 'white' : isCurrent ? '#10b981' : 'inherit',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                  }}
                >
                  {isPast ? '✓' : idx + 1}
                </div>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Statut initial</span>
          <div style={{ color: 'white', fontSize: '1rem', fontWeight: 800, marginTop: '0.2rem' }}>{readiness.progress}% Métier Prêt</div>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', lineHeight: 1.4 }}>
            {activeProducts.length} produit(s), {activeSuppliers.length} fournisseur(s), {movements.length} mouvement(s)
          </p>
        </div>

        <div style={{ padding: '1.25rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <ShieldCheck size={20} color="#10b981" style={{ marginBottom: '0.4rem' }} />
          <h4 style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700 }}>Données sécurisées</h4>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', lineHeight: 1.45 }}>
            Les catégories, unités et produits créés restent éditables à tout moment.
          </p>
        </div>
      </div>
    </div>
  );
}

function StocksOnboardingWizard({
  readiness,
  categories,
  units,
  products,
  suppliers,
  sites,
  locations,
  movements,
  ocrStatuses,
  ocrConfigured,
  onPrefill,
  onImportCsv,
  onImportCreator,
  onImportOcr,
  onCreateMovement,
  onOpenApiKeys,
  onOpenProducts,
  onOpenStocks,
  onOpenOcr,
  onClose,
}: {
  readiness: StocksReadiness;
  categories: Category[];
  units: Unit[];
  products: Product[];
  suppliers: Supplier[];
  sites: Site[];
  locations: Location[];
  movements: StockMovement[];
  ocrStatuses: StocksOcrStatus[];
  ocrConfigured: boolean;
  onPrefill: (payload: { categories?: boolean; units?: boolean; sites?: boolean; locations?: boolean; examples?: boolean }) => Promise<void>;
  onImportCsv: () => void;
  onImportCreator: () => void;
  onImportOcr: () => void;
  onCreateMovement: () => void;
  onOpenApiKeys: () => void;
  onOpenProducts: () => void;
  onOpenStocks: () => void;
  onOpenOcr: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<StocksOnboardingStep>(() => readiness.progress ? readiness.nextStep : 'welcome');
  const stepOrder: StocksOnboardingStep[] = ['welcome', 'reception', 'review'];
  const stepIndex = stepOrder.indexOf(step) + 1;
  const progress = Math.round((stepIndex / stepOrder.length) * 100);
  const activeCategories = categories.filter((item) => !isArchived(item));
  const activeUnits = units.filter((item) => !isArchived(item));
  const activeProducts = products.filter((item) => !isArchived(item));
  const activeSuppliers = suppliers.filter((item) => !isArchived(item));
  const activeSites = sites.filter((item) => !isArchived(item));
  const activeLocations = locations.filter((item) => !isArchived(item));
  const [autoPrefillAttempted, setAutoPrefillAttempted] = useState(false);
  const goNext = () => setStep(stepOrder[Math.min(stepIndex, stepOrder.length - 1)]);
  const goBack = () => setStep(stepOrder[Math.max(0, stepIndex - 2)]);

  useEffect(() => {
    if (readiness.foundationReady || autoPrefillAttempted) return;
    setAutoPrefillAttempted(true);
    void onPrefill({ categories: true, units: true, sites: true, locations: true, examples: false }).catch(() => undefined);
  }, [autoPrefillAttempted, onPrefill, readiness.foundationReady]);

  return (
    <div
      className="modal-overlay hr-wizard-overlay stocks-wizard-overlay"
      style={{
        background: 'radial-gradient(circle at 10% 20%, rgba(16, 185, 129, 0.15) 0%, transparent 55%), radial-gradient(circle at 90% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%), rgba(15, 23, 42, 0.55)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '2rem 1.5rem',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Decorative Blur Spheres */}
      <div style={{ position: 'absolute', width: '560px', height: '560px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.05)', filter: 'blur(100px)', right: '-180px', top: '-180px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: '420px', height: '420px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.05)', filter: 'blur(80px)', left: '-160px', bottom: '20px', pointerEvents: 'none' }} />

      <motion.div
        className="modal-card hr-wizard-modal stocks-wizard-modal"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 24, stiffness: 220 }}
        style={{
          width: '100%',
          maxWidth: step === 'welcome' ? '920px' : '1080px',
          height: 'min(720px, calc(100vh - 4rem))',
          padding: 0,
          borderRadius: '24px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'white',
          boxShadow: '0 30px 80px rgba(9, 13, 22, 0.08)',
          border: 'none',
          zIndex: 10,
        }}
      >
        {step === 'welcome' ? (
          <StocksOnboardingWelcome onNext={() => setStep('reception')} onClose={onClose} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 2fr', height: '100%', width: '100%', minHeight: 0, flexGrow: 1 }}>
            {/* Sidebar */}
            <div style={{ background: '#0f172a', color: 'white', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', minHeight: 0 }}>
              <StocksOnboardingAside step={step} readiness={readiness} activeProducts={activeProducts} activeSuppliers={activeSuppliers} movements={movements} />
            </div>

            {/* Main Content Area */}
            <div style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', minHeight: 0, justifyContent: 'space-between' }}>
              {/* Stepper Progress bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0, position: 'relative' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column', flexGrow: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="badge badge-reception" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.15)', textTransform: 'none', fontSize: '0.8rem' }}>
                      Étape {stepIndex} / {stepOrder.length}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '2.5rem' }}>{Math.round(progress)}%</span>
                  </div>
                  <div className="progress-bar-bg" style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', marginRight: '2.5rem' }}>
                    <div className="progress-bar-fill" style={{ width: `${progress}%`, height: '100%', background: '#10b981', borderRadius: '3px' }}></div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.5rem',
                    borderRadius: '50%',
                    transition: 'background 0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  aria-label="Fermer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Step rendering with AnimatePresence */}
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0, justifyContent: 'space-between' }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.16 }}
                    style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0, justifyContent: 'space-between' }}
                  >
                    {step === 'reception' ? (
                      <StocksReceptionStep
                        ocrConfigured={ocrConfigured}
                        ocrStatuses={ocrStatuses}
                        onBack={goBack}
                        onImportCsv={onImportCsv}
                        onImportCreator={onImportCreator}
                        onImportOcr={onImportOcr}
                        onCreateMovement={onCreateMovement}
                        onOpenApiKeys={onOpenApiKeys}
                        onNext={() => setStep('review')}
                      />
                    ) : null}
                    {step === 'review' ? (
                      <StocksReviewStep
                        readiness={readiness}
                        categories={activeCategories}
                        units={activeUnits}
                        products={activeProducts}
                        suppliers={activeSuppliers}
                        sites={activeSites}
                        locations={activeLocations}
                        movements={movements}
                        onBack={goBack}
                        onOpenStocks={onOpenStocks}
                        onOpenProducts={onOpenProducts}
                        onOpenOcr={onOpenOcr}
                        onClose={onClose}
                      />
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function StocksOnboardingWelcome({ onNext, onClose }: { onNext: () => void; onClose: () => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '3rem', alignItems: 'center', padding: '3.5rem 3rem', height: '100%', flexGrow: 1, position: 'relative' }}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.5rem',
            right: '1.5rem',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.5rem',
            borderRadius: '50%',
            transition: 'background 0.2s',
            zIndex: 10,
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          aria-label="Fermer"
        >
          <X size={20} />
        </button>
      )}
      <div>
        <span className="badge badge-reception" style={{ marginBottom: '1.25rem', display: 'inline-flex', fontSize: '0.8rem', gap: '0.35rem', border: '1px solid var(--light-border)', background: 'rgba(255,255,255,0.7)', textTransform: 'none' }}>
          <Sparkles size={14} color="#10b981" /> Configuration Guidée
        </span>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.04em', marginBottom: '1.5rem', color: 'var(--text-main)' }}>
          Bienvenue sur le module <span style={{ color: '#10b981' }}>Stocks & Réceptions</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.6, marginBottom: '2rem' }}>
          Le socle de catégories, unités et sites est préparé automatiquement. Importez ensuite votre catalogue CSV ou analysez un bon de commande, une facture ou un BL.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', flexShrink: 0 }}><Warehouse size={16} /></div>
            <span>Socle créé automatiquement (catégories, unités, sites)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', flexShrink: 0 }}><Package size={16} /></div>
            <span>Importer le catalogue CSV et créer automatiquement les références manquantes</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', flexShrink: 0 }}><FileText size={16} /></div>
            <span>Analyser un bon de commande, une facture ou un BL</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onNext} style={{ padding: '0.8rem 1.5rem', fontSize: '0.92rem' }}>
            Démarrer la configuration <ArrowRight size={18} />
          </button>
          {onClose && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: '0.8rem 1.5rem', fontSize: '0.92rem' }}
            >
              Faire plus tard
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <StocksIllustration />
      </div>
    </div>
  );
}

type StocksCatalogDraftLine = { id: string; name: string; unitId: string; categoryId: string; supplierId: string; averagePrice: string; minimumStock: string };

function StocksCatalogStep({ categories, units, suppliers, products, onBack, onCreateSupplier, onCreateProduct, onOpenProducts, onNext }: { categories: Category[]; units: Unit[]; suppliers: Supplier[]; products: Product[]; onBack: () => void; onCreateSupplier: (payload: { name: string }) => Promise<unknown>; onCreateProduct: (payload: ProductFormPayload) => Promise<unknown>; onOpenProducts: () => void; onNext: () => void }) {
  const makeLine = (): StocksCatalogDraftLine => ({ id: randomLocalId(), name: '', unitId: units[0]?.id ?? '', categoryId: categories[0]?.id ?? '', supplierId: suppliers[0]?.id ?? '', averagePrice: '', minimumStock: '' });
  const [lines, setLines] = useState<StocksCatalogDraftLine[]>([makeLine()]);
  const [supplierName, setSupplierName] = useState('');
  const [localSuppliers, setLocalSuppliers] = useState<Supplier[]>(suppliers);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => setLocalSuppliers(suppliers), [suppliers]);

  function patchLine(id: string, patch: Partial<StocksCatalogDraftLine>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  }

  async function createQuickSupplier() {
    if (!supplierName.trim()) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const created = await onCreateSupplier({ name: supplierName.trim() }) as Supplier;
      if (created?.id) {
        setLocalSuppliers((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
        setLines((current) => current.map((line) => ({ ...line, supplierId: line.supplierId || created.id })));
      }
      setSupplierName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Le fournisseur n’a pas pu être créé.');
    } finally {
      setSubmitting(false);
    }
  }

  async function createProducts() {
    const valid = lines.filter((line) => line.name.trim() && line.unitId);
    if (!valid.length) return;
    setSubmitting(true);
    setError(undefined);
    try {
      for (const line of valid) {
        await onCreateProduct({
          name: line.name.trim(),
          unitId: line.unitId,
          categoryId: line.categoryId || undefined,
          primarySupplierId: line.supplierId || undefined,
          averagePrice: line.averagePrice ? Number(line.averagePrice) : undefined,
          minimumStock: line.minimumStock ? Number(line.minimumStock) : undefined,
        });
      }
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Les produits n’ont pas tous pu être créés.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%', minHeight: 0, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: 0 }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Ajouter les premiers produits</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.35rem', lineHeight: 1.5 }}>
            Créez quelques produits réellement utilisés. Vous pourrez compléter le catalogue plus tard ou créer des produits manquants depuis une facture OCR.
          </p>
        </div>
        {error ? <div className="alert-modern error" style={{ margin: 0 }}><AlertCircle size={16} /> {error}</div> : null}

        <div style={{ display: 'flex', gap: '0.75rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e2e8f0', alignItems: 'center' }}>
          <input
            value={supplierName}
            onChange={(event) => setSupplierName(event.target.value)}
            placeholder={localSuppliers.length ? 'Ajouter un fournisseur rapide (ex. Transgourmet)' : 'Ajouter un fournisseur'}
            style={{ flex: 1, border: 'none', background: 'transparent', boxShadow: 'none', padding: '0 0.5rem', height: '36px', fontSize: '0.9rem' }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!supplierName.trim() || submitting}
            onClick={() => void createQuickSupplier()}
            style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '8px' }}
          >
            <Plus size={14} /> Fournisseur
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', maxHeight: '280px', paddingRight: '0.25rem', minHeight: 0 }}>
          {lines.map((line, index) => (
            <div
              key={line.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px minmax(180px, 2fr) minmax(100px, 1fr) minmax(120px, 1.2fr) minmax(120px, 1.2fr) minmax(90px, 0.9fr) minmax(90px, 0.9fr) 40px',
                gap: '0.5rem',
                alignItems: 'center',
                background: '#f8fafc',
                padding: '0.6rem 0.8rem',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  fontWeight: 800,
                  fontSize: '0.75rem',
                }}
              >
                {index + 1}
              </span>
              <input
                value={line.name}
                onChange={(event) => patchLine(line.id, { name: event.target.value })}
                placeholder="Nom du produit"
                style={{ borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: 'white' }}
              />
              <select
                value={line.unitId}
                onChange={(event) => patchLine(line.id, { unitId: event.target.value })}
                style={{ borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: 'white' }}
              >
                <option value="">Unité</option>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol}</option>)}
              </select>
              <select
                value={line.categoryId}
                onChange={(event) => patchLine(line.id, { categoryId: event.target.value })}
                style={{ borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: 'white' }}
              >
                <option value="">Catégorie</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select
                value={line.supplierId}
                onChange={(event) => patchLine(line.id, { supplierId: event.target.value })}
                style={{ borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: 'white' }}
              >
                <option value="">Fournisseur</option>
                {localSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={line.averagePrice}
                onChange={(event) => patchLine(line.id, { averagePrice: event.target.value })}
                placeholder="Prix (€)"
                style={{ borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: 'white' }}
              />
              <input
                type="number"
                min="0"
                step="0.001"
                value={line.minimumStock}
                onChange={(event) => patchLine(line.id, { minimumStock: event.target.value })}
                placeholder="Stock min"
                style={{ borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: 'white' }}
              />
              <button
                type="button"
                className="icon-btn danger"
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}
                style={{
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                  border: 'none',
                  background: lines.length === 1 ? '#f1f5f9' : 'rgba(239, 68, 68, 0.1)',
                  color: lines.length === 1 ? '#cbd5e1' : '#ef4444',
                  cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="hr-catalog-actions sticky" style={{ borderTop: '1px solid #eef2f7', background: 'rgba(255,255,255,0.9)', padding: '1rem 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <button type="button" className="btn btn-secondary" onClick={onBack} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>Retour</button>
        <div className="row-actions" style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" disabled={lines.length >= 10} onClick={() => setLines((current) => [...current, makeLine()])} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}><Plus size={14} /> Ligne</button>
          {products.length ? <button type="button" className="btn btn-secondary" onClick={onOpenProducts} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>Voir produits</button> : null}
          <button type="button" className="btn btn-primary" disabled={submitting || !lines.some((line) => line.name.trim() && line.unitId)} onClick={() => void createProducts()} style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}>{submitting ? 'Création…' : 'Créer et continuer'}</button>
          <button type="button" className="btn btn-secondary" onClick={onNext} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>Passer</button>
        </div>
      </div>
    </div>
  );
}

function StocksReceptionStep({ ocrConfigured, ocrStatuses, onBack, onImportCsv, onImportCreator, onImportOcr, onCreateMovement, onOpenApiKeys, onNext }: { ocrConfigured: boolean; ocrStatuses: StocksOcrStatus[]; onBack: () => void; onImportCsv: () => void; onImportCreator: () => void; onImportOcr: () => void; onCreateMovement: () => void; onOpenApiKeys: () => void; onNext: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%', minHeight: 0, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Importer vos produits ou analyser un document</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.35rem', lineHeight: 1.5 }}>
            Ajoutez votre catalogue via CSV, ou déposez un bon de commande, une facture ou un bon de livraison. L’analyse prépare les lignes, vous corrigez si besoin, puis seulement la validation crée la réception et les mouvements de stock.
          </p>
        </div>
        {!ocrConfigured ? (
          <div className="alert-modern error" style={{ margin: 0, alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span><AlertCircle size={16} /> Ajoutez une clé Mistral pour utiliser l’import OCR Stocks.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenApiKeys}><KeyRound size={13} /> Configurer</button>
          </div>
        ) : null}

        <div className="onboarding-options-grid">
          <div className="onboarding-option-card blue" onClick={onImportCsv}>
            <div className="onboarding-option-icon">
              <Download size={18} />
            </div>
            <div className="onboarding-option-content">
              <span className="onboarding-option-title">Importer un CSV produits</span>
              <span className="onboarding-option-desc">L’assistant CSV importe votre catalogue puis revient ici pour continuer l’onboarding.</span>
            </div>
          </div>

          <div className="onboarding-option-card orange" onClick={onImportCreator}>
            <div className="onboarding-option-icon">
              <Sparkles size={18} />
            </div>
            <div className="onboarding-option-content">
              <span className="onboarding-option-title">Créer mon CSV à partir de documents</span>
              <span className="onboarding-option-desc">Déposez vos factures, BL ou fiches fournisseur : l’IA prépare votre catalogue produits.</span>
            </div>
          </div>

          <div className="onboarding-option-card emerald" onClick={onImportOcr}>
            <div className="onboarding-option-icon">
              <FileText size={18} />
            </div>
            <div className="onboarding-option-content">
              <span className="onboarding-option-title">Mettre un bon à analyser</span>
              <span className="onboarding-option-desc">Facture, BL ou commande : l'IA lit le document et crée la réception en brouillon.</span>
            </div>
          </div>

          <div className="onboarding-option-card" onClick={onCreateMovement}>
            <div className="onboarding-option-icon">
              <Plus size={18} />
            </div>
            <div className="onboarding-option-content">
              <span className="onboarding-option-title">Saisie manuelle</span>
              <span className="onboarding-option-desc">Alternative ponctuelle rapide si aucun document physique n’est disponible.</span>
            </div>
          </div>
        </div>
        {ocrStatuses.length ? <StocksOcrDashboardStatusBar statuses={ocrStatuses} onOpenExtraction={async () => undefined} onImportOcr={onImportOcr} /> : null}
      </div>
      <div className="hr-catalog-actions sticky" style={{ borderTop: '1px solid #eef2f7', background: 'rgba(255,255,255,0.9)', padding: '1rem 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <button type="button" className="btn btn-secondary" onClick={onBack} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>Retour</button>
        <button type="button" className="btn btn-primary" onClick={onNext} style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}>Continuer</button>
      </div>
    </div>
  );
}

function StocksReviewStep({ readiness, categories, units, products, suppliers, sites, locations, movements, onBack, onOpenStocks, onOpenProducts, onOpenOcr, onClose }: { readiness: StocksReadiness; categories: Category[]; units: Unit[]; products: Product[]; suppliers: Supplier[]; sites: Site[]; locations: Location[]; movements: StockMovement[]; onBack: () => void; onOpenStocks: () => void; onOpenProducts: () => void; onOpenOcr: () => void; onClose: () => void }) {
  const cards = [
    { label: 'Catégories', value: categories.length, done: categories.length > 0 },
    { label: 'Unités', value: units.length, done: units.length > 0 },
    { label: 'Sites', value: sites.length, done: sites.length > 0 },
    { label: 'Sites', value: sites.length, done: sites.length > 0 },
    { label: 'Fournisseurs', value: suppliers.length, done: suppliers.length > 0 },
    { label: 'Produits', value: products.length, done: products.length > 0 },
    { label: 'Mouvements', value: movements.length, done: readiness.flowReady },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%', minHeight: 0, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>{readiness.progress === 100 ? 'Stocks est prêt à exploiter' : 'Résumé de configuration'}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.35rem', lineHeight: 1.5 }}>
            Votre configuration reste modifiable depuis les onglets Stocks. Les prochains imports facture/BL enrichiront le catalogue et l’historique.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '0.5rem' }}>
          {cards.map((card) => {
            return (
              <div
                key={card.label}
                style={{
                  border: card.done ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '1rem',
                  background: card.done ? 'rgba(16, 185, 129, 0.04)' : '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  alignItems: 'flex-start',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '0.75rem',
                    right: '0.75rem',
                    color: card.done ? '#10b981' : '#94a3b8',
                  }}
                >
                  {card.done ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                </div>
                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1 }}>{card.value}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>{card.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="hr-catalog-actions sticky" style={{ borderTop: '1px solid #eef2f7', background: 'rgba(255,255,255,0.9)', padding: '1rem 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <button type="button" className="btn btn-secondary" onClick={onBack} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>Retour</button>
        <div className="row-actions" style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onOpenProducts} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>Produits</button>
          <button type="button" className="btn btn-secondary" onClick={onOpenOcr} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>Suivi OCR</button>
          <button type="button" className="btn btn-primary" onClick={readiness.flowReady ? onOpenStocks : onClose} style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}>{readiness.flowReady ? 'Voir stocks' : 'Terminer'}</button>
        </div>
      </div>
    </div>
  );
}

function ProductCsvCreator({ units, categories, suppliers, onClose, onPreview, onAnalyze, onDownload, onCommit }: {
  units: Unit[]; categories: Category[]; suppliers: Supplier[]; onClose: () => void;
  onPreview: (rows: Array<{ rowNumber: number; fields: ProductImportPreviewFields; selected?: boolean }>) => Promise<ProductImportPreview>;
  onAnalyze: (files: File[]) => Promise<{ documents: unknown[]; preview: ProductImportPreview }>;
  onDownload: (rows: Array<{ rowNumber: number; fields: ProductImportPreviewFields; selected?: boolean }>) => Promise<void>;
  onCommit: (payload: { rows: Array<{ rowNumber: number; fields: ProductImportPreviewFields; selected?: boolean }>; options?: { createMissingCategories?: boolean; createMissingSuppliers?: boolean } }) => Promise<ProductImportCommitResult>;
}) {
  const empty = (): ProductImportPreviewRow => ({ rowNumber: Date.now(), source: {}, fields: { name: '', unit: '' }, status: 'needs_review', selected: true, warnings: [], errors: [] });
  const [rows, setRows] = useState<ProductImportPreviewRow[]>([empty()]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<'preview' | 'ocr' | 'download' | 'import' | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (busy === null) {
      setProgress(0);
      return;
    }
    setProgress(5);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev;
        const diff = 95 - prev;
        const step = Math.max(1, Math.floor(Math.random() * Math.min(8, diff)));
        return prev + step;
      });
    }, 200 + Math.random() * 200);

    return () => clearInterval(interval);
  }, [busy]);

  const payload = (items = rows) => items.map((row, index) => ({ rowNumber: index + 2, fields: row.fields, selected: row.selected }));
  const patch = (index: number, key: keyof ProductImportPreviewFields, value: string) => setRows((current) => current.map((row, i) => i === index ? { ...row, fields: { ...row.fields, [key]: value } } : row));
  
  const review = async (nextRows = rows) => { 
    setBusy('preview'); 
    setError(undefined); 
    try { 
      const preview = await onPreview(payload(nextRows)); 
      setProgress(100);
      await new Promise((r) => setTimeout(r, 220));
      setRows(preview.rows); 
      setMessage(`${preview.summary.selected} ligne(s) prête(s) à vérifier.`); 
    } catch (err) { 
      setError(err instanceof Error ? err.message : 'Vérification impossible.'); 
    } finally { 
      setBusy(null); 
    } 
  };

  const analyze = async () => { 
    if (!files.length) return; 
    setBusy('ocr'); 
    setError(undefined); 
    try { 
      const result = await onAnalyze(files); 
      const combined = [...rows.filter((row) => String(row.fields.name ?? '').trim()), ...result.preview.rows]; 
      setProgress(100);
      await new Promise((r) => setTimeout(r, 220));
      await review(combined); 
      setMessage(`${result.preview.rows.length} ligne(s) détectée(s) par l’OCR.`); 
    } catch (err) { 
      setError(err instanceof Error ? err.message : 'Analyse OCR impossible.'); 
    } finally { 
      setBusy(null); 
    } 
  };

  const download = async () => { 
    setBusy('download'); 
    setError(undefined); 
    try { 
      await onDownload(payload()); 
      setProgress(100);
      await new Promise((r) => setTimeout(r, 220));
      setMessage('CSV compatible téléchargé.'); 
    } catch (err) { 
      setError(err instanceof Error ? err.message : 'Export impossible.'); 
    } finally { 
      setBusy(null); 
    } 
  };

  const commit = async () => { 
    setBusy('import'); 
    setError(undefined); 
    try { 
      const result = await onCommit({ rows: payload(), options: { createMissingCategories: true, createMissingSuppliers: true } }); 
      setProgress(100);
      await new Promise((r) => setTimeout(r, 220));
      setMessage(`${result.created} produit(s) importé(s).`); 
    } catch (err) { 
      setError(err instanceof Error ? err.message : 'Import impossible.'); 
    } finally { 
      setBusy(null); 
    } 
  };
  
  return (
    <div className="modal-overlay hr-wizard-overlay">
      <div className="modal-card product-csv-creator-modal">
        {busy !== null && (
          <div className="product-csv-loader-overlay">
            <div className="loader-spinner-wrapper">
              <div className="loader-spinner-pulse" />
              <div className="loader-spinner-ring" />
              <div className="loader-percentage">{progress}%</div>
            </div>
            <span className="loader-text">
              {busy === 'ocr' && "Analyse des documents par l'OCR en cours..."}
              {busy === 'preview' && "Vérification et validation de la grille..."}
              {busy === 'import' && "Importation des produits en cours..."}
              {busy === 'download' && "Génération et export du fichier CSV..."}
            </span>
            <span className="loader-subtext">Veuillez patienter quelques instants...</span>
          </div>
        )}
        <div className="product-csv-header">
          <div>
            <span className="stocks-onboarding-kicker">Catalogue assisté</span>
            <h2>Créer un CSV produits</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Ajoutez des lignes, ou déposez vos catalogues, fiches et étiquettes. Rien n’est créé avant validation.
            </p>
          </div>
          <button className="icon-btn close-panel-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error ? (
          <div className="product-csv-toast error">
            <AlertCircle size={14} />
            <span>{error}</span>
            <button className="toast-close-btn" onClick={() => setError(undefined)}>×</button>
          </div>
        ) : null}
        {message ? (
          <div className="product-csv-toast success">
            <CheckCircle2 size={14} />
            <span>{message}</span>
            <button className="toast-close-btn" onClick={() => setMessage(undefined)}>×</button>
          </div>
        ) : null}

        <div className="product-csv-actions-row">
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm-premium" style={{ position: 'relative' }}>
              <UploadCloud size={15} /> Choisir des fichiers ({files.length})
              <input
                type="file"
                multiple
                accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,image/avif"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 8))}
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  cursor: 'pointer',
                  width: '100%',
                  height: '100%'
                }}
              />
            </button>

            {files.length > 0 && (
              <button className="btn btn-secondary btn-sm-premium" disabled={busy !== null} onClick={() => void analyze()}>
                <Sparkles size={15} /> {busy === 'ocr' ? 'Analyse OCR…' : 'Analyser'}
              </button>
            )}

            <button className="btn btn-secondary btn-sm-premium" disabled={busy !== null} onClick={() => void review()}>
              <ShieldCheck size={15} /> {busy === 'preview' ? 'Vérification…' : 'Vérifier les lignes'}
            </button>

            {files.length > 0 && (
              <span 
                style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px', marginLeft: '0.25rem' }} 
                title={files.map((file) => file.name).join(' · ')}
              >
                {files.map((file) => file.name).join(' · ')}
              </span>
            )}
          </div>
          
          <button className="btn btn-secondary btn-sm-premium" onClick={() => setRows((current) => [...current, empty()])}>
            <Plus size={15} /> Ajouter une ligne
          </button>
        </div>

        <div className="product-csv-table-wrapper">
          <table className="product-csv-table">
            <thead>
              <tr>
                <th className="col-include">Inclure</th>
                <th className="col-name">Nom *</th>
                <th className="col-unit">Unité *</th>
                <th className="col-sku">SKU / réf.</th>
                <th className="col-gtin">GTIN</th>
                <th className="col-supplier">Fournisseur</th>
                <th className="col-category">Catégorie</th>
                <th className="col-price">Prix HT</th>
                <th className="col-pkg">Conditionnement</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const hasError = row.errors.length > 0;
                const hasWarning = row.warnings.length > 0 && !hasError;
                return (
                  <tr key={`${row.rowNumber}-${index}`} className={`${hasError ? 'row-has-error' : ''} ${hasWarning ? 'row-has-warning' : ''}`}>
                    <td className="col-include">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) => setRows((current) => current.map((item, i) => i === index ? { ...item, selected: e.target.checked } : item))}
                      />
                    </td>
                    <td className="col-name">
                      <input
                        value={String(row.fields.name ?? '')}
                        onChange={(e) => patch(index, 'name', e.target.value)}
                        placeholder="Nom du produit"
                      />
                      {row.errors[0] ? (
                        <div className="cell-validation-info">
                          <AlertCircle size={12} className="validation-error-text" />
                          <span className="validation-error-text">{row.errors[0]}</span>
                        </div>
                      ) : row.warnings[0] ? (
                        <div className="cell-validation-info">
                          <AlertCircle size={12} className="validation-warning-text" />
                          <span className="validation-warning-text">{row.warnings[0]}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="col-unit">
                      <select
                        value={String(row.fields.unit ?? '')}
                        onChange={(e) => patch(index, 'unit', e.target.value)}
                      >
                        <option value="">—</option>
                        {units.map((unit) => <option key={unit.id} value={unit.symbol}>{unit.name} ({unit.symbol})</option>)}
                      </select>
                    </td>
                    <td className="col-sku">
                      <input
                        value={String(row.fields.sku ?? '')}
                        onChange={(e) => patch(index, 'sku', e.target.value)}
                        placeholder="ex. SKU-123"
                      />
                    </td>
                    <td className="col-gtin">
                      <input
                        value={String(row.fields.gtin ?? '')}
                        onChange={(e) => patch(index, 'gtin', e.target.value)}
                        placeholder="Code barre"
                      />
                    </td>
                    <td className="col-supplier">
                      <select
                        value={String(row.fields.supplier ?? '')}
                        onChange={(e) => patch(index, 'supplier', e.target.value)}
                      >
                        <option value="">—</option>
                        {suppliers.filter((s) => !s.isArchived).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="col-category">
                      <select
                        value={String(row.fields.category ?? '')}
                        onChange={(e) => patch(index, 'category', e.target.value)}
                      >
                        <option value="">—</option>
                        {categories.filter((c) => !c.isArchived).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="col-price">
                      <input
                        type="number"
                        step="0.01"
                        value={String(row.fields.averagePrice ?? '')}
                        onChange={(e) => patch(index, 'averagePrice', e.target.value)}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="col-pkg">
                      <input
                        value={String(row.fields.packageLabel ?? '')}
                        onChange={(e) => patch(index, 'packageLabel', e.target.value)}
                        placeholder="ex. Colis de 6"
                      />
                    </td>
                    <td className="col-actions">
                      <button className="close-panel-btn" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} title="Supprimer la ligne">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="hr-catalog-actions sticky" style={{ marginTop: '0.5rem', borderTop: '1px solid #e8edf3', paddingTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
          <div className="row-actions">
            <button className="btn btn-secondary btn-sm-premium" disabled={busy !== null} onClick={() => void download()}>
              <Download size={15} /> {busy === 'download' ? 'Export…' : 'Télécharger le CSV'}
            </button>
            <button className="btn btn-primary btn-sm-premium" disabled={busy !== null || !rows.some((row) => row.selected)} onClick={() => void commit()}>
              <CheckCircle2 size={15} /> {busy === 'import' ? 'Import…' : 'Importer les produits'}
            </button>
        </div>
      </div>
    </div>
  </div>
  );
}

type ProductImportStep = 'welcome' | 'structure' | 'upload' | 'mapping' | 'review' | 'done';

const PRODUCT_IMPORT_STEPS: Array<{ key: ProductImportStep; label: string }> = [
  { key: 'welcome', label: 'Bienvenue' },
  { key: 'structure', label: 'Structure CSV' },
  { key: 'upload', label: 'Importer' },
  { key: 'mapping', label: 'Associer' },
  { key: 'review', label: 'Vérifier' },
  { key: 'done', label: 'Terminer' },
];

const PRODUCT_IMPORT_FIELD_LABELS: Record<ProductImportField, string> = {
  name: 'Nom',
  unit: 'Unité',
  sku: 'SKU',
  gtin: 'GTIN',
  supplier: 'Fournisseur',
  category: 'Catégorie',
  averagePrice: 'Prix HT',
  minimumStock: 'Seuil min.',
  description: 'Description',
  originCountry: 'Origine',
  packageLabel: 'Conditionnement',
  unitsPerPackage: 'Unités / colis',
  unitWeightGrams: 'Poids unitaire',
  netWeightGrams: 'Poids net',
  ingredients: 'Ingrédients',
  allergensPresent: 'Allergènes',
  possibleTraces: 'Traces',
  dietaryTags: 'Tags',
  energyKj: 'Énergie kJ',
  energyKcal: 'Énergie kcal',
  fatGrams: 'Matières grasses',
  saturatedFatGrams: 'Acides gras saturés',
  carbohydratesGrams: 'Glucides',
  sugarsGrams: 'Sucres',
  fiberGrams: 'Fibres',
  proteinGrams: 'Protéines',
  saltGrams: 'Sel',
  storageType: 'Conservation',
  shelfLifeAfterOpening: 'Après ouverture',
  storageInstructions: 'Instructions stockage',
  preparationInstructions: 'Préparation',
};

function AddImportChooser({ onManual, onCsv, onCreator, onOcr }: { onManual: () => void; onCsv: () => void; onCreator: () => void; onOcr: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', padding: '0.25rem 0' }}>
      <p style={{ 
        margin: '0 0 0.5rem 0', 
        color: '#475569', 
        fontSize: '0.85rem', 
        lineHeight: '1.5',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        padding: '0.85rem 1rem',
        borderRadius: '12px',
        fontWeight: 500
      }}>
        Choisissez votre source. Le catalogue peut contenir des produits sans stock ; seuls les réceptions et mouvements modifient le stock physique.
      </p>

      {/* Button 1: Créer manuellement */}
      <button 
        type="button" 
        onClick={onManual} 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '1.2rem 1.25rem',
          background: '#ffffff',
          border: '1.5px solid #e2e8f0',
          borderRadius: '16px',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = '#10b981';
          e.currentTarget.style.transform = 'translateY(-1.5px)';
          e.currentTarget.style.boxShadow = '0 6px 15px rgba(16, 185, 129, 0.08)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = '#e2e8f0';
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
        }}
      >
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          background: 'rgba(16, 185, 129, 0.08)',
          color: '#10b981',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Plus size={20} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>Créer manuellement</span>
          <small style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.3 }}>Ajouter une référence au catalogue, sans créer de stock.</small>
        </div>
      </button>

      {/* Button 2: Importer un CSV */}
      <button 
        type="button" 
        onClick={onCsv} 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '1.2rem 1.25rem',
          background: '#ffffff',
          border: '1.5px solid #e2e8f0',
          borderRadius: '16px',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = '#3b82f6';
          e.currentTarget.style.transform = 'translateY(-1.5px)';
          e.currentTarget.style.boxShadow = '0 6px 15px rgba(59, 130, 246, 0.08)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = '#e2e8f0';
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
        }}
      >
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          background: 'rgba(59, 130, 246, 0.08)',
          color: '#3b82f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <UploadCloud size={20} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>Importer un CSV</span>
          <small style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.3 }}>Contrôler les colonnes et les doublons avant d’enrichir le catalogue.</small>
        </div>
      </button>

      <button type="button" onClick={onCreator} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.2rem 1.25rem', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '16px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={20} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>Créer un CSV produits</span>
          <small style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.3 }}>Saisir des lignes ou lire des photos de catalogue avec l’IA.</small>
        </div>
      </button>

      {/* Button 3: Analyser un document OCR (Gradient premium style) */}
      <button 
        type="button" 
        onClick={onOcr} 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '1.25rem 1.25rem',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          border: 'none',
          borderRadius: '16px',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          transition: 'all 0.2s ease',
          boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'translateY(-1.5px)';
          e.currentTarget.style.boxShadow = '0 8px 25px rgba(16, 185, 129, 0.35)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.2)';
        }}
      >
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.15)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <FileText size={20} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 850, color: '#ffffff' }}>Analyser un document OCR</span>
          <small style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.3 }}>Lire une facture, un BL ou une commande, puis valider la réception.</small>
        </div>
      </button>
    </div>
  );
}

function ProductImportWizard({
  onClose,
  onDownloadTemplate,
  onAnalyze,
  onCommit,
  onCreateFromDocuments,
}: {
  onClose: () => void;
  onDownloadTemplate: () => Promise<void>;
  onAnalyze: (file: File) => Promise<ProductImportPreview>;
  onCommit: (payload: { rows: Array<{ rowNumber: number; fields: ProductImportPreviewFields; selected?: boolean }>; mapping?: Record<string, ProductImportField>; options?: { createMissingCategories?: boolean; createMissingSuppliers?: boolean } }) => Promise<ProductImportCommitResult>;
  onCreateFromDocuments: () => void;
}) {
  const [step, setStep] = useState<ProductImportStep>('welcome');
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [options, setOptions] = useState({ createMissingCategories: true, createMissingSuppliers: true });
  const [result, setResult] = useState<ProductImportCommitResult | null>(null);
  const [busy, setBusy] = useState<'download' | 'analyze' | 'commit' | null>(null);
  const [error, setError] = useState<string>();
  const currentIndex = PRODUCT_IMPORT_STEPS.findIndex((item) => item.key === step);
  const progress = Math.round(((currentIndex + 1) / PRODUCT_IMPORT_STEPS.length) * 100);
  const summary = preview ? summarizeProductImportRows(preview.rows) : null;
  const selectedRows = preview?.rows.filter((row) => row.selected && (row.status === 'ready' || row.status === 'needs_review')) ?? [];

  async function downloadTemplate() {
    setBusy('download');
    setError(undefined);
    try {
      await onDownloadTemplate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Téléchargement du modèle impossible.');
    } finally {
      setBusy(null);
    }
  }

  async function analyzeFile(file: File) {
    setBusy('analyze');
    setError(undefined);
    try {
      const next = await onAnalyze(file);
      setPreview(next);
      setOptions(next.options ?? { createMissingCategories: true, createMissingSuppliers: true });
      setStep('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse du CSV impossible.');
    } finally {
      setBusy(null);
    }
  }

  async function commitImport() {
    if (!preview || !selectedRows.length) return;
    setBusy('commit');
    setError(undefined);
    try {
      const commitResult = await onCommit({
        rows: preview.rows.map(({ rowNumber, fields, selected }) => ({ rowNumber, fields, selected })),
        mapping: preview.mapping,
        options,
      });
      setResult(commitResult);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import des produits impossible.');
    } finally {
      setBusy(null);
    }
  }

  function patchRow(rowNumber: number, selected: boolean) {
    setPreview((current) => current ? {
      ...current,
      rows: current.rows.map((row) => row.rowNumber === rowNumber ? { ...row, selected } : row),
    } : current);
  }

  const goNext = () => {
    const next = PRODUCT_IMPORT_STEPS[Math.min(currentIndex + 1, PRODUCT_IMPORT_STEPS.length - 1)];
    setStep(next.key);
  };
  const goBack = () => {
    const previous = PRODUCT_IMPORT_STEPS[Math.max(currentIndex - 1, 0)];
    setStep(previous.key);
  };

  return (
    <div className="modal-overlay hr-wizard-overlay product-import-overlay">
      <motion.div
        className="modal-card hr-wizard-modal product-import-modal"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: 'spring', damping: 24, stiffness: 220 }}
      >
        {step === 'welcome' ? (
          <ProductImportWelcome onClose={onClose} onNext={() => setStep('structure')} />
        ) : (
          <div className="product-import-shell">
            <aside className="product-import-rail">
              <ProductImportAside step={step} summary={summary} result={result} />
            </aside>
            <main className="product-import-main">
              <div className="product-import-topbar">
                <div>
                  <span className="badge badge-reception">Étape {currentIndex + 1} / {PRODUCT_IMPORT_STEPS.length}</span>
                  <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
                </div>
                <button type="button" className="product-import-close" onClick={onClose} aria-label="Fermer">
                  <X size={20} />
                </button>
              </div>
              {error ? <div className="alert-modern error product-import-error"><AlertCircle size={16} /> {error}</div> : null}
              <AnimatePresence mode="wait">
                <motion.div key={step} className="product-import-panel" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.16 }}>
                  {step === 'structure' ? <ProductImportStructureStep onBack={goBack} onNext={goNext} onDownload={downloadTemplate} onCreateFromDocuments={onCreateFromDocuments} downloading={busy === 'download'} /> : null}
                  {step === 'upload' ? <ProductImportUploadStep onBack={goBack} onAnalyze={analyzeFile} busy={busy === 'analyze'} /> : null}
                  {step === 'mapping' ? <ProductImportMappingStep preview={preview} onBack={goBack} onNext={() => setStep('review')} onUploadAgain={() => setStep('upload')} /> : null}
                  {step === 'review' ? (
                    <ProductImportReviewStep
                      preview={preview}
                      summary={summary}
                      options={options}
                      selectedRows={selectedRows.length}
                      busy={busy === 'commit'}
                      onBack={goBack}
                      onPatchRow={patchRow}
                      onOptionsChange={setOptions}
                      onCommit={commitImport}
                    />
                  ) : null}
                  {step === 'done' ? <ProductImportDoneStep result={result} onClose={onClose} onRestart={() => { setPreview(null); setResult(null); setStep('structure'); }} /> : null}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ProductImportWelcome({ onClose, onNext }: { onClose: () => void; onNext: () => void }) {
  return (
    <div className="product-import-welcome">
      <button type="button" className="product-import-close welcome" onClick={onClose} aria-label="Fermer">
        <X size={20} />
      </button>
      <div>
        <span className="badge badge-reception product-import-badge"><Sparkles size={14} color="#10b981" /> Configuration Guidée</span>
        <h1>Bienvenue sur l'importation de <span>produits</span></h1>
        <p>
          Ici, vous pourrez ajouter vos produits depuis un document CSV. L'assistant va d'abord vous guider pour la structure du document CSV attendu, puis vous guider pas à pas pour intégrer votre propre base de produits.
        </p>
        <div className="product-import-bullets">
          <span><Download size={16} /> Préparer le bon modèle CSV</span>
          <span><UploadCloud size={16} /> Importer votre fichier produit</span>
          <span><CheckCircle2 size={16} /> Vérifier avant création</span>
        </div>
        <div className="product-import-actions">
          <button type="button" className="btn btn-primary" onClick={onNext}>
            Démarrer l'importation <ArrowRight size={18} />
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Faire plus tard</button>
        </div>
      </div>
      <ProductImportCsvIllustration />
    </div>
  );
}

function ProductImportAside({ step, summary, result }: { step: ProductImportStep; summary: ReturnType<typeof summarizeProductImportRows> | null; result: ProductImportCommitResult | null }) {
  const currentIdx = PRODUCT_IMPORT_STEPS.findIndex((item) => item.key === step);
  return (
    <>
      <div className="product-import-rail-content">
        <div className="product-import-brand"><Package size={28} /> TOQUE<span>HUB</span> STOCKS</div>
        <div>
          <span className="stocks-onboarding-kicker">Import guidé</span>
          <h3>Assistant produits CSV</h3>
        </div>
        <div className="product-import-steps">
          {PRODUCT_IMPORT_STEPS.map((item, idx) => {
            const done = idx < currentIdx;
            const active = idx === currentIdx;
            return (
              <div key={item.key} className={`${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                <span>{done ? '✓' : idx + 1}</span>
                {item.label}
              </div>
            );
          })}
        </div>
      </div>
      <div className="product-import-rail-card">
        <ShieldCheck size={20} />
        <strong>{result ? `${result.created} produit(s) créé(s)` : summary ? `${summary.selected} ligne(s) sélectionnée(s)` : 'Validation avant création'}</strong>
        <span>Aucune quantité de stock ni mouvement ne sera créé depuis cet import.</span>
      </div>
    </>
  );
}

function ProductImportStructureStep({ onBack, onNext, onDownload, onCreateFromDocuments, downloading }: { onBack: () => void; onNext: () => void; onDownload: () => void; onCreateFromDocuments: () => void; downloading: boolean }) {
  const columns = ['nom', 'unite', 'sku', 'gtin', 'fournisseur', 'categorie', 'prix_achat_ht', 'seuil_minimum'];
  return (
    <div className="product-import-step">
      <div className="product-import-copy">
        <h2>Structure du document CSV</h2>
        <p>Le fichier doit contenir au minimum un nom de produit et une unité. Les autres colonnes enrichissent la fiche produit sans toucher au stock.</p>
      </div>
      <div className="product-import-structure-grid">
        {columns.map((column, index) => (
          <div key={column} className={index < 2 ? 'required' : ''}>
            <strong>{column}</strong>
            <span>{index < 2 ? 'Obligatoire' : 'Optionnel'}</span>
          </div>
        ))}
      </div>
      <div className="alert-modern">
        <Info size={16} /> Si votre fichier vient de Numbers, exportez-le d'abord en CSV depuis Fichier &gt; Exporter vers &gt; CSV.
      </div>
      <div className="hr-catalog-actions sticky product-import-footer">
        <button type="button" className="btn btn-secondary" onClick={onBack}>Retour</button>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" onClick={onDownload} disabled={downloading}>
            <Download size={15} /> {downloading ? 'Téléchargement…' : 'Modèle CSV'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCreateFromDocuments}>
            <Sparkles size={15} /> Créer mon CSV à partir de documents
          </button>
          <button type="button" className="btn btn-primary" onClick={onNext}>Continuer</button>
        </div>
      </div>
    </div>
  );
}

function ProductImportUploadStep({ onBack, onAnalyze, busy }: { onBack: () => void; onAnalyze: (file: File) => void; busy: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="product-import-step">
      <div className="product-import-copy">
        <h2>Importer votre CSV</h2>
        <p>Déposez le fichier exporté. L’assistant va lire les colonnes, préparer un mapping et signaler les lignes à vérifier.</p>
      </div>
      <label
        className="stocks-ocr-dropzone product-import-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const next = Array.from(event.dataTransfer.files ?? []).find((item) => item.name.toLowerCase().endsWith('.csv'));
          if (next) setFile(next);
        }}
      >
        <UploadCloud size={34} style={{ color: '#10b981' }} />
        <span>{file ? file.name : 'Déposer le CSV ici ou cliquer pour parcourir'}</span>
        <small>CSV uniquement, jusqu’à 5 Mo. Les fichiers Numbers doivent être exportés en CSV.</small>
        <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      {file ? (
        <div className="stocks-ocr-file-row product-import-file-row">
          <FileText size={18} />
          <div className="stocks-ocr-file-row-details">
            <span>{file.name}</span>
            <small>{formatBytes(file.size)}</small>
          </div>
          <button type="button" className="stocks-ocr-file-remove" onClick={() => setFile(null)}><X size={14} /></button>
        </div>
      ) : null}
      <div className="hr-catalog-actions sticky product-import-footer">
        <button type="button" className="btn btn-secondary" onClick={onBack}>Retour</button>
        <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={() => file && onAnalyze(file)}>
          {busy ? 'Analyse…' : 'Analyser le CSV'}
        </button>
      </div>
    </div>
  );
}

function ProductImportMappingStep({ preview, onBack, onNext, onUploadAgain }: { preview: ProductImportPreview | null; onBack: () => void; onNext: () => void; onUploadAgain: () => void }) {
  if (!preview) {
    return (
      <div className="product-import-step">
        <EmptyMini title="Aucun fichier analysé" text="Importez un CSV avant d’associer les colonnes." />
        <div className="hr-catalog-actions sticky product-import-footer">
          <button type="button" className="btn btn-secondary" onClick={onBack}>Retour</button>
          <button type="button" className="btn btn-primary" onClick={onUploadAgain}>Importer</button>
        </div>
      </div>
    );
  }
  const mapped = Object.entries(preview.mapping);
  const unmapped = preview.headers.filter((header) => !preview.mapping[header]);
  return (
    <div className="product-import-step">
      <div className="product-import-copy">
        <h2>Associer les colonnes</h2>
        <p>Les colonnes reconnues sont prêtes. Les colonnes non reconnues restent ignorées pour éviter de créer des informations incorrectes.</p>
      </div>
      <div className="product-import-mapping-grid">
        {mapped.map(([header, field]) => (
          <div key={header}>
            <span>{header}</span>
            <strong>{PRODUCT_IMPORT_FIELD_LABELS[field] ?? field}</strong>
          </div>
        ))}
      </div>
      {unmapped.length ? (
        <div className="alert-modern" style={{ margin: 0 }}>
          <Info size={16} /> Colonnes ignorées : {unmapped.slice(0, 6).join(', ')}{unmapped.length > 6 ? '…' : ''}
        </div>
      ) : null}
      {preview.ai?.warnings?.length ? <div className="alert-modern"><Info size={16} /> {preview.ai.warnings[0]}</div> : null}
      <div className="hr-catalog-actions sticky product-import-footer">
        <button type="button" className="btn btn-secondary" onClick={onBack}>Retour</button>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" onClick={onUploadAgain}>Changer de fichier</button>
          <button type="button" className="btn btn-primary" onClick={onNext}>Vérifier les lignes</button>
        </div>
      </div>
    </div>
  );
}

function ProductImportReviewStep({
  preview,
  summary,
  options,
  selectedRows,
  busy,
  onBack,
  onPatchRow,
  onOptionsChange,
  onCommit,
}: {
  preview: ProductImportPreview | null;
  summary: ReturnType<typeof summarizeProductImportRows> | null;
  options: { createMissingCategories: boolean; createMissingSuppliers: boolean };
  selectedRows: number;
  busy: boolean;
  onBack: () => void;
  onPatchRow: (rowNumber: number, selected: boolean) => void;
  onOptionsChange: (options: { createMissingCategories: boolean; createMissingSuppliers: boolean }) => void;
  onCommit: () => void;
}) {
  if (!preview || !summary) {
    return (
      <div className="product-import-step">
        <EmptyMini title="Aucune prévisualisation" text="Analysez un CSV avant de valider." />
        <div className="hr-catalog-actions sticky product-import-footer">
          <button type="button" className="btn btn-secondary" onClick={onBack}>Retour</button>
        </div>
      </div>
    );
  }
  const invalidCount = summary.error + summary.duplicate;
  return (
    <div className="product-import-step">
      <div className="product-import-copy">
        <h2>Vérifier avant création</h2>
        <p>Sélectionnez les lignes à importer. Les doublons et les lignes en erreur ne sont pas créés.</p>
      </div>
      <div className="product-import-summary">
        <div><strong>{summary.ready}</strong><span>Prêtes</span></div>
        <div><strong>{summary.needs_review}</strong><span>À vérifier</span></div>
        <div><strong>{summary.duplicate}</strong><span>Doublons</span></div>
        <div><strong>{summary.error}</strong><span>Erreurs</span></div>
      </div>
      <div className="product-import-options">
        <label><input type="checkbox" checked={options.createMissingCategories} onChange={(event) => onOptionsChange({ ...options, createMissingCategories: event.target.checked })} /> Créer les catégories manquantes</label>
        <label><input type="checkbox" checked={options.createMissingSuppliers} onChange={(event) => onOptionsChange({ ...options, createMissingSuppliers: event.target.checked })} /> Créer les fournisseurs manquants</label>
      </div>
      <div className="table-wrapper product-import-table-wrap">
        <table className="table-modern product-import-table">
          <thead>
            <tr>
              <th></th>
              <th>Ligne</th>
              <th>Statut</th>
              <th>Produit</th>
              <th>Unité</th>
              <th>Fournisseur</th>
              <th>Catégorie</th>
              <th>Info</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const selectable = row.status === 'ready' || row.status === 'needs_review';
              return (
                <tr key={row.rowNumber}>
                  <td><input type="checkbox" checked={Boolean(row.selected && selectable)} disabled={!selectable} onChange={(event) => onPatchRow(row.rowNumber, event.target.checked)} /></td>
                  <td>{row.rowNumber}</td>
                  <td><span className={`product-import-status ${row.status}`}>{productImportStatusLabel(row.status)}</span></td>
                  <td style={{ fontWeight: 700 }}>{productImportCell(row.fields.name)}</td>
                  <td>{productImportCell(row.fields.unitLabel ?? row.fields.unit)}</td>
                  <td>{productImportCell(row.fields.supplierName ?? row.fields.supplier)}</td>
                  <td>{productImportCell(row.fields.categoryName ?? row.fields.category)}</td>
                  <td>{row.errors[0] || row.warnings[0] || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {invalidCount ? <div className="alert-modern"><Info size={16} /> {invalidCount} ligne(s) seront ignorée(s) tant qu’elles restent en doublon ou en erreur.</div> : null}
      <div className="hr-catalog-actions sticky product-import-footer">
        <button type="button" className="btn btn-secondary" onClick={onBack}>Retour</button>
        <button type="button" className="btn btn-primary" disabled={!selectedRows || busy} onClick={onCommit}>
          {busy ? 'Création…' : `Créer ${selectedRows} produit${selectedRows > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

function ProductImportDoneStep({ result, onClose, onRestart }: { result: ProductImportCommitResult | null; onClose: () => void; onRestart: () => void }) {
  return (
    <div className="product-import-step">
      <div className="product-import-done">
        <div><CheckCircle2 size={34} /></div>
        <h2>Import terminé</h2>
        <p>{result ? `${result.created} produit${result.created > 1 ? 's ont' : ' a'} été ajouté${result.created > 1 ? 's' : ''} au catalogue.` : 'Les produits validés ont été ajoutés au catalogue.'}</p>
      </div>
      <div className="hr-catalog-actions sticky product-import-footer">
        <button type="button" className="btn btn-secondary" onClick={onRestart}>Nouvel import</button>
        <button type="button" className="btn btn-primary" onClick={onClose}>Voir les produits</button>
      </div>
    </div>
  );
}

function ProductImportCsvIllustration() {
  const rows = [
    ['nom', 'unite', 'sku', 'fournisseur'],
    ['Farine T55', 'kg', 'FAR55', 'Kespro'],
    ['Lait entier', 'L', 'LAIT1', 'Metro'],
    ['Beurre doux', 'kg', 'BEU10', 'Local'],
  ];
  return (
    <div className="product-import-illustration" aria-hidden="true">
      <div className="product-import-sheet">
        <div className="product-import-sheet-header">
          <FileText size={18} />
          <span>produits.csv</span>
          <strong>CSV</strong>
        </div>
        <div className="product-import-sheet-grid">
          {rows.flatMap((row, rowIndex) => row.map((cell, cellIndex) => (
            <span key={`${rowIndex}-${cellIndex}`} className={rowIndex === 0 ? 'header' : ''}>{cell}</span>
          )))}
        </div>
      </div>
    </div>
  );
}

function summarizeProductImportRows(rows: ProductImportPreviewRow[]) {
  return rows.reduce<Record<ProductImportStatus | 'total' | 'selected', number>>((acc, row) => {
    acc.total += 1;
    acc[row.status] += 1;
    if (row.selected) acc.selected += 1;
    return acc;
  }, { total: 0, selected: 0, ready: 0, needs_review: 0, duplicate: 0, ignored: 0, error: 0 });
}

function productImportStatusLabel(status: ProductImportStatus) {
  const labels: Record<ProductImportStatus, string> = {
    ready: 'Prêt',
    needs_review: 'À corriger',
    duplicate: 'Doublon',
    ignored: 'Ignoré',
    error: 'Erreur',
  };
  return labels[status] ?? status;
}

function productImportCell(value: unknown) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function randomLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function StocksModuleTabs({ activeTab, onNavigate }: { activeTab: ActiveTab; onNavigate: (tab: ActiveTab) => void }) {
  return (
    <div className="hr-tabs stocks-module-tabs" role="tablist" aria-label="Navigation Stocks">
      {STOCKS_NAV_TABS.map((item) => {
        const isActive = item.tab === activeTab || (item.tab === 'categories' && isStocksSettingsRoute(activeTab));
        return (
          <button
            key={item.tab}
            type="button"
            className={isActive ? 'active' : ''}
            onClick={() => onNavigate(item.tab)}
            role="tab"
            aria-selected={isActive}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function ArticlesPage({ data, categories, suppliers, onAdd, onMovement, onInventory, onEdit, onQuery, onRefresh }: { data: ArticlesResponse; categories: Category[]; suppliers: Supplier[]; onAdd: () => void; onMovement: () => void; onInventory: () => void; onEdit: (article: Article) => void; onQuery: (params: { search?: string; categoryId?: string; supplierId?: string; status?: string; page: number; pageSize: number }) => Promise<ArticlesResponse>; onRefresh: () => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(data.pagination?.page ?? 1);
  const [result, setResult] = useState(data);
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState<string>();
  const [selected, setSelected] = useState<Article | null>(null);
  const onQueryRef = useRef(onQuery);
  onQueryRef.current = onQuery;
  const items = result.items;
  const totalPages = result.pagination?.pages ?? Math.max(1, Math.ceil((result.pagination?.total ?? items.length) / 25));
  const totalFiltered = result.pagination?.total ?? items.length;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setQueryError(undefined);
      try {
        const response = await onQueryRef.current({ search: search.trim() || undefined, categoryId: category || undefined, supplierId: supplier || undefined, status: status || undefined, page, pageSize: 25 });
        if (!active) return;
        setResult(response);
        if (response.pagination?.page && response.pagination.page !== page) setPage(response.pagination.page);
      } catch (err) {
        if (active) setQueryError(err instanceof Error ? err.message : 'Chargement des produits impossible.');
      } finally {
        if (active) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [category, page, search, status, supplier]);

  const resetPage = () => setPage(1);
  const statusLabels: Record<string, string> = { NORMAL: 'En stock', LOW: 'Stock faible', OUT: 'Rupture', NEGATIVE: 'Négatif', NO_STOCK: 'Aucun stock' };
  const statusClass: Record<string, string> = { NORMAL: 'badge-reception', LOW: 'badge-correction', OUT: 'badge-loss', NEGATIVE: 'badge-loss', NO_STOCK: 'badge-inventory' };
  return (
    <div className="stocks-dashboard-grid articles-page">
      <div className="section-header-modern" style={{ marginBottom: 0 }}>
        <div className="section-info">
          <span className="card-title" style={{ fontSize: '1.55rem' }}>Produits</span>
          <span className="section-tagline">Catalogue et stock physique réunis dans une seule vue.</span>
        </div>
        <div className="row-actions">
          <button className="btn btn-secondary" onClick={onInventory}><ClipboardList size={15} /> Inventaire</button>
          <button className="btn btn-secondary" onClick={onMovement}><ArrowRight size={15} /> Mouvement</button>
          <button className="btn btn-primary" onClick={onAdd}><Plus size={15} /> Ajouter / importer</button>
        </div>
      </div>

      <div className="stocks-metrics-strip">
        <div className="stocks-metric-item orange" onClick={() => { setStatus(''); resetPage(); }} title="Afficher tous les produits">
          <div className="metric-icon-wrapper"><Package size={16} /></div>
          <div className="metric-text-wrapper">
            <span className="stocks-metric-value">{result.summary.articleCount}</span>
            <span className="stocks-metric-label">Produits</span>
          </div>
        </div>
        <div className="stocks-metric-divider"></div>
        <div className="stocks-metric-item emerald" onClick={() => { setStatus('NORMAL'); resetPage(); }} title="Filtrer : En stock">
          <div className="metric-icon-wrapper"><Boxes size={16} /></div>
          <div className="metric-text-wrapper">
            <span className="stocks-metric-value">{result.summary.articlesWithStock}</span>
            <span className="stocks-metric-label">Avec stock</span>
          </div>
        </div>
        <div className="stocks-metric-divider"></div>
        <div className="stocks-metric-item blue" onClick={() => { setStatus('NO_STOCK'); resetPage(); }} title="Filtrer : Sans stock">
          <div className="metric-icon-wrapper"><Archive size={16} /></div>
          <div className="metric-text-wrapper">
            <span className="stocks-metric-value">{result.summary.articlesWithoutStock}</span>
            <span className="stocks-metric-label">Sans stock</span>
          </div>
        </div>
        <div className="stocks-metric-divider"></div>
        <div className="stocks-metric-item purple">
          <div className="metric-icon-wrapper"><TrendingUp size={16} /></div>
          <div className="metric-text-wrapper">
            <span className="stocks-metric-value">{Number(result.summary.stockValue).toFixed(2)} €</span>
            <span className="stocks-metric-label">Valeur stock</span>
          </div>
        </div>
        <div className="stocks-metric-divider"></div>
        <div className="stocks-metric-item orange" onClick={() => { setStatus('LOW'); resetPage(); }} title="Filtrer : Seuils à surveiller">
          <div className="metric-icon-wrapper"><AlertTriangle size={16} /></div>
          <div className="metric-text-wrapper">
            <span className="stocks-metric-value">{result.summary.lowStockCount}</span>
            <span className="stocks-metric-label">Seuils à surveiller</span>
          </div>
        </div>
      </div>

      <div className="articles-page-layout">
        <div className="articles-table-card">
          <div className="stocks-filter-bar">
            <div className="search-input-wrapper">
              <Search size={16} />
              <input
                className="search-input"
                placeholder="Rechercher un produit, SKU, fournisseur…"
                value={search}
                onChange={(event) => { setSearch(event.target.value); resetPage(); }}
              />
            </div>
            <div className="filter-selects">
              <select value={category} onChange={(event) => { setCategory(event.target.value); resetPage(); }}>
                <option value="">Toutes catégories</option>
                {categories.filter((item) => !item.isArchived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select value={supplier} onChange={(event) => { setSupplier(event.target.value); resetPage(); }}>
                <option value="">Tous fournisseurs</option>
                {suppliers.filter((item) => !item.isArchived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }}>
                <option value="">Tous les statuts</option>
                <option value="NORMAL">En stock</option>
                <option value="LOW">Stock faible</option>
                <option value="OUT">Rupture</option>
                <option value="NO_STOCK">Aucun stock</option>
              </select>
              {(search || category || supplier || status) ? (
                <button type="button" className="btn-clear-filters" onClick={() => { setSearch(''); setCategory(''); setSupplier(''); setStatus(''); resetPage(); }} title="Réinitialiser les filtres">
                  <X size={16} />
                </button>
              ) : null}
            </div>
          </div>

          {queryError ? <div className="alert-modern error" style={{ margin: '0 1.25rem 1rem' }}><AlertCircle size={16} /> {queryError}</div> : null}
          <div className="table-wrapper" style={{ opacity: loading ? 0.62 : 1, transition: 'opacity 0.15s' }} aria-busy={loading}>
            <table className="table-modern articles-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Référence</th>
                  <th>Fournisseur</th>
                  <th>Catégorie</th>
                  <th style={{ textAlign: 'right' }}>Stock actuel</th>
                  <th style={{ textAlign: 'right' }}>Valeur</th>
                  <th>Dernier mouvement</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? items.map((article) => {
                  const product = article.product;
                  const movement = article.lastMovement;
                  const isSelected = selected?.product.id === product.id;
                  return (
                    <tr
                      key={product.id}
                      className={`clickable-row ${isSelected ? 'active-row' : ''}`}
                      onClick={() => setSelected(article)}
                    >
                      <td>
                        <strong>{product.name}</strong>
                        <small style={{ display: 'block', color: 'var(--text-muted)' }}>{product.unit?.symbol ?? 'Unité non définie'}</small>
                      </td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{product.sku || '—'}</td>
                      <td>{product.primarySupplier?.name || '—'}</td>
                      <td>{product.category?.name || 'Sans catégorie'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 750 }}>{numeric(article.stock.quantity).toFixed(3)} {product.unit?.symbol ?? ''}</td>
                      <td style={{ textAlign: 'right' }}>{numeric(article.stock.value).toFixed(2)} €</td>
                      <td>{movement ? new Date(movement.movementDate ?? movement.createdAt).toLocaleDateString('fr-FR') : 'Jamais'}</td>
                      <td>
                        <span className={`badge ${statusClass[article.stock.status] ?? 'badge-inventory'}`}>
                          {statusLabels[article.stock.status] ?? article.stock.status}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={8}>
                      <EmptyMini title="Aucun produit trouvé" text="Les produits sans stock sont inclus dans cette vue." icon="📦" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', borderTop: '1px solid var(--light-border)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              {totalFiltered ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, totalFiltered)} sur ${totalFiltered} produit${totalFiltered > 1 ? 's' : ''}` : 'Aucun produit'}
            </span>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button className="btn btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}>Précédent</button>
              <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>Page {page} sur {totalPages}</span>
              <button className="btn btn-secondary" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}>Suivant</button>
            </div>
          </div>
        </div>

        {selected ? (
          <ArticleDrawer
            article={selected}
            onClose={() => setSelected(null)}
            onEdit={() => onEdit(selected)}
            onMovement={onMovement}
            onRefresh={async () => {
              await onRefresh();
              const response = await onQueryRef.current({ search: search.trim() || undefined, categoryId: category || undefined, supplierId: supplier || undefined, status: status || undefined, page, pageSize: 25 });
              setResult(response);
              setSelected(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function ArticleDrawer({ article, onClose, onEdit, onMovement, onRefresh }: { article: Article; onClose: () => void; onEdit: () => void; onMovement: () => void; onRefresh: () => Promise<void> }) {
  const product = article.product;
  return (
    <div className="article-drawer-backdrop" onClick={onClose}>
      <aside className="article-side-panel" onClick={(event) => event.stopPropagation()}>
        <div className="side-drawer-header">
          <div>
            <span className="stocks-onboarding-kicker">Produit</span>
            <h2>{product.name}</h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {product.sku || 'Sans référence'} · {product.unit?.symbol || 'unité non définie'}
            </span>
          </div>
          <button className="close-panel-btn" onClick={onClose} title="Fermer le panneau">
            <X size={18} />
          </button>
        </div>
        <div className="side-drawer-body">
          <div className="article-drawer-stock-premium">
            <span className="stock-label">Stock disponible</span>
            <strong className="stock-value">
              {numeric(article.stock.quantity).toFixed(3)} {product.unit?.symbol ?? ''}
            </strong>
            <span className="stock-valuation">
              {article.stock.status === 'NO_STOCK'
                ? 'Aucun mouvement enregistré pour cet article.'
                : `Valeur estimée : ${numeric(article.stock.value).toFixed(2)} €`}
            </span>
          </div>
          <div className="article-drawer-actions">
            <button className="btn btn-primary btn-sm-premium" onClick={onMovement}>
              <Plus size={14} /> Mouvement
            </button>
            <button className="btn btn-secondary btn-sm-premium" onClick={onEdit}>
              <Edit3 size={14} /> Modifier la fiche
            </button>
          </div>
          <div className="article-drawer-section">
            <h3>Répartition par site</h3>
            {article.stockBySite.length ? (
              <div className="article-detail-list">
                {article.stockBySite.map((site) => (
                  <div className="article-detail-row-premium" key={site.siteId ?? 'all'}>
                    <span className="row-label">{site.siteName || 'Tous sites'}</span>
                    <strong className="row-value">
                      {numeric(site.quantity).toFixed(3)} {product.unit?.symbol ?? ''}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-premium">Aucune quantité enregistrée.</p>
            )}
          </div>
          <div className="article-drawer-section">
            <h3>Lots et DLC</h3>
            {article.lots?.length ? (
              <div className="article-detail-list">
                {article.lots.map((lot, index) => (
                  <div className="article-detail-row-premium lot-row" key={`${lot.lotNumber ?? 'lot'}-${index}`}>
                    <div className="lot-info">
                      <span className="lot-number">{lot.lotNumber || 'Lot sans numéro'}</span>
                      <span className="lot-subtext">
                        {lot.siteName || 'Tous sites'}
                      </span>
                    </div>
                    <div className="lot-qty-expiry">
                      <strong className="lot-qty">
                        {numeric(lot.quantity).toFixed(3)} {product.unit?.symbol ?? ''}
                      </strong>
                      <span className="lot-expiry">
                        {lot.expiresAt ? `DLC ${new Date(lot.expiresAt).toLocaleDateString('fr-FR')}` : 'DLC non renseignée'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-premium">Aucun lot renseigné.</p>
            )}
          </div>
          <div className="article-drawer-section">
            <h3>Informations produit</h3>
            <div className="article-detail-list">
              <div className="article-detail-row-premium">
                <span className="row-label">Fournisseur</span>
                <strong className="row-value">{product.primarySupplier?.name || '—'}</strong>
              </div>
              <div className="article-detail-row-premium">
                <span className="row-label">Catégorie</span>
                <strong className="row-value">{product.category?.name || 'Sans catégorie'}</strong>
              </div>
              <div className="article-detail-row-premium">
                <span className="row-label">Seuil minimum</span>
                <strong className="row-value">
                  {numeric(product.minimumStock).toFixed(3)} {product.unit?.symbol ?? ''}
                </strong>
              </div>
              <div className="article-detail-row-premium">
                <span className="row-label">Prix moyen</span>
                <strong className="row-value">{numeric(product.averagePrice).toFixed(2)} €</strong>
              </div>
            </div>
          </div>
          <div className="article-drawer-section">
            <h3>Dernier mouvement</h3>
            {article.lastMovement ? (
              <div className="article-detail-row-premium">
                <span className="row-label">{movementLabels[article.lastMovement.type] || article.lastMovement.type}</span>
                <strong className="row-value">
                  {new Date(article.lastMovement.movementDate ?? article.lastMovement.createdAt).toLocaleString('fr-FR')}
                </strong>
              </div>
            ) : (
              <p className="text-muted-premium">Aucun mouvement pour le moment.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function StocksDashboardPage({ activeTab, products, suppliers, sites, locations, stocks, movements, ocrStatuses, readiness, onCreateMovement, onImportOcr, onOpenAssistant, onOpenExtraction, onOpenStocks, onNavigate, onStartOnboarding, onCreateProduct }: { activeTab: ActiveTab; products: Product[]; suppliers: Supplier[]; sites: Site[]; locations: Location[]; stocks: Stock[]; movements: StockMovement[]; ocrStatuses: StocksOcrStatus[]; readiness: StocksReadiness; onCreateMovement: () => void; onImportOcr: () => void; onOpenAssistant: () => void; onOpenExtraction: (extractionId: string) => Promise<void>; onOpenStocks: () => void; onNavigate: (tab: ActiveTab) => void; onStartOnboarding: () => void; onCreateProduct: () => void }) {
  const [hideSetupCard, setHideSetupCard] = useState(() => {
    try {
      return localStorage.getItem('toquehub_stocks_hide_setup_card') === 'true';
    } catch {
      return false;
    }
  });

  const [hideOcrStatus, setHideOcrStatus] = useState(() => {
    try {
      return localStorage.getItem('toquehub_stocks_hide_ocr_status') === 'true';
    } catch {
      return false;
    }
  });

  const stockValue = stocks.reduce((sum, stock) => sum + numeric(stock.stockValue ?? stock.value ?? numeric(stock.currentQuantity ?? stock.quantity) * numeric(stock.product.averagePrice ?? stock.product.averagePurchasePrice ?? stock.product.weightedAveragePrice)), 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const recentMovements = sortMovementsByRecency(movements).slice(0, 6);
  const movementsThisMonth = movements.filter((m) => movementEffectiveDate(m) >= monthStart).length;
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
          Vue d’ensemble du stock physique. Toute variation passe par un mouvement tracé ; le catalogue produit reste indépendant des quantités.
        </p>
        <div className="stocks-reception-actions">
          <button className="btn btn-primary" onClick={onImportOcr}>
            <Plus size={16} /> Ajouter / importer
          </button>
          <button className="btn btn-secondary" onClick={onOpenAssistant}>
            <Sparkles size={16} /> Kokki IA
          </button>
        </div>
      </motion.section>

      <StocksModuleTabs activeTab={activeTab} onNavigate={onNavigate} />

      {(!hideSetupCard || (!hideOcrStatus && ocrStatuses.length > 0)) && (
        <div className="stocks-dashboard-setup-row">
          {!hideSetupCard && (
            <StocksSetupCard
              readiness={readiness}
              products={products}
              sites={sites}
              onStart={onStartOnboarding}
              onDismiss={() => {
                setHideSetupCard(true);
                try {
                  localStorage.setItem('toquehub_stocks_hide_setup_card', 'true');
                } catch (e) {
                  console.error(e);
                }
              }}
            />
          )}
          {!hideOcrStatus && ocrStatuses.length > 0 && (
            <StocksOcrDashboardStatusBar
              statuses={ocrStatuses}
              onOpenExtraction={onOpenExtraction}
              onImportOcr={onImportOcr}
              onDismiss={() => {
                setHideOcrStatus(true);
                try {
                  localStorage.setItem('toquehub_stocks_hide_ocr_status', 'true');
                } catch (e) {
                  console.error(e);
                }
              }}
            />
          )}
        </div>
      )}

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
          <MiniMovements movements={recentMovements} />
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

function StocksOcrDashboardStatusBar({ statuses, onOpenExtraction, onImportOcr, onDismiss }: { statuses: StocksOcrStatus[]; onOpenExtraction: (extractionId: string) => Promise<void>; onImportOcr: () => void; onDismiss?: () => void }) {
  if (!statuses.length) return null;

  const working = statuses.filter(isOcrStatusWorking).length;
  const ready = statuses.filter(isOcrStatusReady).length;
  const errors = statuses.filter(isOcrStatusError).length;
  const featured = statuses.find(isOcrStatusReady) ?? statuses.find(isOcrStatusWorking) ?? statuses[0];
  const progressClass = isOcrStatusError(featured) ? 'error' : isOcrStatusReady(featured) ? 'success' : isOcrStatusAnalyzing(featured) ? 'analyzing' : isOcrStatusPending(featured) ? 'pending' : 'uploading';
  const stateLabel = ready
    ? `${ready} document${ready > 1 ? 's' : ''} prêt${ready > 1 ? 's' : ''} à vérifier`
    : errors
      ? `${errors} document${errors > 1 ? 's' : ''} en erreur`
      : `${working || statuses.length} document${(working || statuses.length) > 1 ? 's' : ''} en cours d’analyse`;
  const filesLabel = `${statuses.length} fichier${statuses.length > 1 ? 's' : ''} OCR suivi${statuses.length > 1 ? 's' : ''}`;

  return (
    <motion.section
      className={`stocks-ocr-dashboard-status ${ready ? 'ready' : errors ? 'error' : 'working'}`}
      style={{ position: 'relative' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="stocks-widget-close-btn"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            zIndex: 5,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.color = 'var(--text-main)';
            e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.background = 'transparent';
          }}
          title="Masquer"
        >
          <X size={14} />
        </button>
      )}
      <div className="stocks-ocr-dashboard-status-main">
        <div className="stocks-ocr-dashboard-status-icon">
          {ready ? <CheckCircle2 size={18} /> : errors ? <AlertCircle size={18} /> : <Clock size={18} />}
        </div>
        <div className="stocks-ocr-dashboard-status-copy">
          <span>{stateLabel}</span>
          <small>{filesLabel}</small>
          <div className="ocr-status-progress-bar">
            <div className={`ocr-status-progress-fill ${progressClass}`}></div>
          </div>
        </div>
      </div>
      <div className="stocks-ocr-dashboard-status-actions" style={onDismiss ? { marginRight: '1.25rem' } : undefined}>
        {featured.extraction ? (
          <button className="btn btn-primary btn-sm" onClick={() => void onOpenExtraction(featured.extraction!.id)}>
            Vérifier <ArrowRight size={13} />
          </button>
        ) : null}
        <button className="btn btn-secondary btn-sm" onClick={onImportOcr}>
          Suivi OCR
        </button>
      </div>
    </motion.section>
  );
}

function StocksMarginsPage({ token, products, suppliers, categories }: { token: string; products: Product[]; suppliers: Supplier[]; categories: Category[] }) {
  const [dashboard, setDashboard] = useState<MarginsDashboard | null>(null);
  const [productDetail, setProductDetail] = useState<MarginProductDetail | null>(null);
  const [supplierDetail, setSupplierDetail] = useState<MarginSupplierDetail | null>(null);
  const [settings, setSettings] = useState<MarginSettings | null>(null);
  const [searchResults, setSearchResults] = useState<{ products: Product[]; suppliers: Supplier[]; invoices: unknown[]; lots: unknown[]; lines: unknown[] } | null>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [productId, setProductId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Nouvel onglet interne pour aérer l'interface
  const [subTab, setSubTab] = useState<'dashboard' | 'analytics' | 'optimization' | 'alerts' | 'reports'>('dashboard');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [data, productData, supplierData, settingsData, searchData] = await Promise.all([
        api.marginsDashboard(token, { period, productId, supplierId, categoryId, search }),
        productId ? api.marginProduct(token, productId) : Promise.resolve(null),
        supplierId ? api.marginSupplier(token, supplierId) : Promise.resolve(null),
        api.marginSettings(token),
        search.trim() ? api.marginSearch(token, search.trim()) : Promise.resolve(null),
      ]);
      setDashboard(data);
      setProductDetail(productData);
      setSupplierDetail(supplierData);
      setSettings(settingsData);
      setSearchResults(searchData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement du module Marges impossible.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, period, productId, supplierId, categoryId, search]);

  async function generateReport() {
    setGeneratingReport(true);
    try {
      await api.generateMarginReport(token, { period });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synthèse Marges impossible à générer.');
    } finally {
      setGeneratingReport(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const next = await api.updateMarginSettings(token, {
        priceIncreaseThresholdPct: Number(settings.priceIncreaseThresholdPct),
        anomalyThresholdPct: Number(settings.anomalyThresholdPct),
        quantityAnomalyThresholdPct: Number(settings.quantityAnomalyThresholdPct),
      });
      setSettings(next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement des seuils impossible.');
    } finally {
      setSavingSettings(false);
    }
  }

  const kpis = dashboard?.kpis;
  const topProducts = dashboard?.charts.topProducts ?? [];
  const topSuppliers = dashboard?.charts.topSuppliers ?? [];
  const purchases = dashboard?.charts.purchases ?? [];
  const categoriesChart = dashboard?.charts.categories ?? [];
  const forecasts = dashboard?.forecasts ?? [];
  const rnmComparisons = dashboard?.rnmComparisons ?? [];
  const sheetImpact = dashboard?.technicalSheetImpact;

  return (
    <div className="stocks-dashboard-grid margins-dashboard">
      <motion.section className="welcome-hero stocks-hero" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <span className="welcome-tag"><TrendingUp size={14} /> Stocks</span>
        <h1 className="welcome-title">Marges</h1>
        <p className="welcome-desc">
          Centre de pilotage des achats, fournisseurs, coûts matières et variations de prix, consolidé uniquement depuis les réceptions validées.
        </p>
        <div className="stocks-reception-actions">
          {subTab === 'reports' && (
            <button className="btn btn-primary" onClick={generateReport} disabled={generatingReport}>
              <Sparkles size={16} /> {generatingReport ? 'Synthèse...' : 'Générer synthèse'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => void load()}>
            <RefreshCw size={16} /> Actualiser
          </button>
        </div>
      </motion.section>

      {/* Barre de navigation interne moderne */}
      <div className="margins-subtabs-nav">
        <button className={`subtab-btn ${subTab === 'dashboard' ? 'active' : ''}`} onClick={() => setSubTab('dashboard')}>
          <TrendingUp size={16} /> Vue d'ensemble
        </button>
        <button className={`subtab-btn ${subTab === 'analytics' ? 'active' : ''}`} onClick={() => setSubTab('analytics')}>
          <Search size={16} /> Fiches Achat
        </button>
        <button className={`subtab-btn ${subTab === 'optimization' ? 'active' : ''}`} onClick={() => setSubTab('optimization')}>
          <Scale size={16} /> Optimisations & Marché
        </button>
        <button className={`subtab-btn ${subTab === 'alerts' ? 'active' : ''}`} onClick={() => setSubTab('alerts')}>
          <AlertCircle size={16} /> Alertes et Seuils {kpis?.openAlerts ? <span className="badge badge-correction" style={{ marginLeft: '4px', background: 'var(--danger-bg)', color: 'var(--danger)', border: 'none' }}>{kpis.openAlerts}</span> : null}
        </button>
        <button className={`subtab-btn ${subTab === 'reports' ? 'active' : ''}`} onClick={() => setSubTab('reports')}>
          <FileText size={16} /> Rapports & Synthèses
        </button>
      </div>

      {/* Barre de filtres contextuelle */}
      {subTab !== 'alerts' && subTab !== 'reports' && (
        <div className="filter-bar">
          {subTab === 'analytics' && (
            <div className="search-input-wrapper">
              <Search />
              <input className="search-input" placeholder="Rechercher produit, facture, lot, fournisseur..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          )}
          {subTab === 'dashboard' && (
            <div className="filter-select-wrapper">
              <select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}>
                <option value="week">Hebdomadaire</option>
                <option value="month">Mensuel</option>
                <option value="year">Annuel</option>
              </select>
              <ChevronDown size={14} className="filter-select-chevron" />
            </div>
          )}
          {subTab !== 'analytics' && (
            <div className="filter-select-wrapper">
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Toutes familles</option>
                {categories.filter((category) => !isArchived(category)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <ChevronDown size={14} className="filter-select-chevron" />
            </div>
          )}
          <div className="filter-select-wrapper">
            <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">Tous fournisseurs</option>
              {suppliers.filter((supplier) => !isArchived(supplier)).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <ChevronDown size={14} className="filter-select-chevron" />
          </div>
          <div className="filter-select-wrapper">
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Tous produits</option>
              {products.filter((product) => !isArchived(product)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            <ChevronDown size={14} className="filter-select-chevron" />
          </div>
        </div>
      )}

      {error && <div className="error-banner"><AlertCircle size={16} /> {error}</div>}

      {/* CONTENU ONGLET VUE D'ENSEMBLE */}
      {subTab === 'dashboard' && (
        <div className="margins-dashboard-container">
          <div className="metrics-grid">
            <Metric icon={<ShoppingCart size={20} />} value={loading ? '...' : formatCurrency(kpis?.monthlyPurchases)} label="Achats du mois" tone="blue" />
            <Metric icon={<Calculator size={20} />} value={loading ? '...' : formatCurrency(kpis?.materialCost)} label="Coût matière théorique" tone="emerald" />
            <Metric icon={<FileText size={20} />} value={loading ? '...' : kpis?.invoiceCount ?? 0} label="Factures reçues" tone="purple" />
            <Metric icon={<UsersRound size={20} />} value={loading ? '...' : kpis?.supplierCount ?? 0} label="Fournisseurs actifs" tone="orange" />
          </div>
          <div className="metrics-grid">
            <Metric icon={<TrendingUp size={20} />} value={loading ? '...' : formatPct(kpis?.averageIncreasePct)} label="Hausse moyenne" tone="orange" />
            <Metric icon={<Scale size={20} />} value={loading ? '...' : formatCurrency(kpis?.potentialSavings)} label="Économies potentielles" tone="emerald" />
            <Metric icon={<LineChart size={20} />} value={loading ? '...' : formatPct(kpis?.monthlyEvolutionPct)} label="Évolution mensuelle" tone="blue" />
            <Metric icon={<AlertCircle size={20} />} value={loading ? '...' : kpis?.openAlerts ?? 0} label="Alertes ouvertes" tone="purple" />
          </div>

          <div className="double-panel">
            <section className="card-modern widget-card-modern">
              <span className="card-title"><LineChart size={18} /> Évolution des achats</span>
              <MarginsLineChart data={purchases} />
            </section>
            <section className="card-modern widget-card-modern">
              <span className="card-title"><Layers size={18} /> Répartition familles produits</span>
              <MarginsBarList data={categoriesChart} />
            </section>
          </div>

          <div className="double-panel">
            <section className="card-modern widget-card-modern">
              <span className="card-title"><ShoppingBag size={18} /> Top produits achetés</span>
              <MarginsBarList data={topProducts} />
            </section>
            <section className="card-modern widget-card-modern">
              <span className="card-title"><UsersRound size={18} /> Top fournisseurs</span>
              <MarginsBarList data={topSuppliers} />
            </section>
          </div>

          <section className="card-modern widget-card-modern">
            <span className="card-title"><Sparkles size={18} /> Suggestions d'optimisation IA</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              {dashboard?.suggestions?.length ? dashboard.suggestions.map((suggestion, index) => (
                <div key={`${suggestion.type}-${index}`} className="suggestion-card-premium">
                  <div style={{ color: 'var(--primary)', marginTop: '2px' }}><Sparkles size={18} /></div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{suggestion.type.replaceAll('_', ' ')}</strong>
                    <span style={{ fontSize: '0.95rem', color: 'var(--text-main)', lineHeight: '1.4' }}>{suggestion.message}</span>
                  </div>
                </div>
              )) : <EmptyMini title="Aucune suggestion" text="Les recommandations apparaîtront avec davantage d'historique d'achats." icon="✨" />}
            </div>
          </section>
        </div>
      )}

      {/* CONTENU ONGLET FICHES ACHAT / DETAIL */}
      {subTab === 'analytics' && (
        <div className="margins-dashboard-container">
          {search.trim() && searchResults ? (
            <section className="card-modern widget-card-modern">
              <span className="card-title"><Search size={18} /> Résultats de recherche globale</span>
              <div className="metrics-grid" style={{ marginTop: '1.25rem' }}>
                <div className="metric-card-modern tone-blue" style={{ cursor: 'default' }}>
                  <div className="metric-header">
                    <span className="metric-label-modern">Produits correspondants</span>
                    <div className="metric-icon-wrapper-modern"><Package size={18} /></div>
                  </div>
                  <div className="metric-value-modern">{searchResults.products.length}</div>
                </div>
                <div className="metric-card-modern tone-emerald" style={{ cursor: 'default' }}>
                  <div className="metric-header">
                    <span className="metric-label-modern">Fournisseurs</span>
                    <div className="metric-icon-wrapper-modern"><UsersRound size={18} /></div>
                  </div>
                  <div className="metric-value-modern">{searchResults.suppliers.length}</div>
                </div>
                <div className="metric-card-modern tone-purple" style={{ cursor: 'default' }}>
                  <div className="metric-header">
                    <span className="metric-label-modern">Factures</span>
                    <div className="metric-icon-wrapper-modern"><FileText size={18} /></div>
                  </div>
                  <div className="metric-value-modern">{searchResults.invoices.length}</div>
                </div>
                <div className="metric-card-modern tone-orange" style={{ cursor: 'default' }}>
                  <div className="metric-header">
                    <span className="metric-label-modern">Lots</span>
                    <div className="metric-icon-wrapper-modern"><Archive size={18} /></div>
                  </div>
                  <div className="metric-value-modern">{searchResults.lots.length}</div>
                </div>
              </div>

              <div className="double-panel" style={{ marginTop: '2rem' }}>
                <div>
                  <h4 style={{ marginBottom: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Package size={16} /> Produits ({searchResults.products.length})</h4>
                  <div className="table-wrapper">
                    <table className="table-modern">
                      <thead><tr><th>Nom</th><th>Catégorie</th><th>Action</th></tr></thead>
                      <tbody>
                        {searchResults.products.slice(0, 6).map((item) => (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 600 }}>{item.name}</td>
                            <td>{item.category?.name ?? 'Non classé'}</td>
                            <td><button className="btn btn-secondary btn-sm" onClick={() => { setProductId(item.id); setSearch(''); }}>Sélectionner</button></td>
                          </tr>
                        ))}
                        {!searchResults.products.length && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucun produit trouvé</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h4 style={{ marginBottom: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><UsersRound size={16} /> Fournisseurs ({searchResults.suppliers.length})</h4>
                  <div className="table-wrapper">
                    <table className="table-modern">
                      <thead><tr><th>Nom</th><th>Contact</th><th>Action</th></tr></thead>
                      <tbody>
                        {searchResults.suppliers.slice(0, 6).map((item) => (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 600 }}>{item.name}</td>
                            <td>{item.email ?? item.phone ?? '—'}</td>
                            <td><button className="btn btn-secondary btn-sm" onClick={() => { setSupplierId(item.id); setSearch(''); }}>Sélectionner</button></td>
                          </tr>
                        ))}
                        {!searchResults.suppliers.length && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucun fournisseur trouvé</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            !productId && !supplierId && (
              <div className="margins-search-placeholder">
                <div className="margins-search-icon-circle"><Search size={32} /></div>
                <h2>Analyses & Fiches Achat</h2>
                <p>Sélectionnez un produit ou un fournisseur dans les listes déroulantes ci-dessus, ou tapez une recherche globale pour analyser l'historique de vos achats.</p>
              </div>
            )
          )}

          {(productDetail || supplierDetail) && (
            <div className="double-panel">
              {productDetail && (
                <section className="card-modern widget-card-modern">
                  <span className="card-title"><Package size={18} /> Fiche achat produit : {productDetail.product.name}</span>
                  <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginTop: '1rem' }}>
                    <Metric icon={<Calculator size={18} />} value={formatCurrency(Number(productDetail.stats.averagePrice ?? 0))} label="Prix moyen" tone="blue" />
                    <Metric icon={<Clock size={18} />} value={formatCurrency(Number(productDetail.stats.lastPrice ?? 0))} label="Dernier prix" tone="emerald" />
                    <Metric icon={<TrendingUp size={18} />} value={formatCurrency(Number(productDetail.stats.maxPrice ?? 0))} label="Prix max" tone="orange" />
                    <Metric icon={<Scale size={18} />} value={formatCurrency(Number(productDetail.stats.minPrice ?? 0))} label="Prix min" tone="purple" />
                  </div>
                  <div style={{ marginTop: '1.5rem' }}>
                    <MarginsLineChart data={productDetail.chart} />
                  </div>
                  {productDetail.rnmComparison && (
                    <div className="settings-list" style={{ marginTop: '1rem' }}>
                      <div className="suggestion-card-premium" style={{ gap: '0.75rem', alignItems: 'center' }}>
                        <div style={{ color: 'var(--primary)' }}><Scale size={18} /></div>
                        <div>
                          <strong>Comparaison RNM : {productDetail.rnmComparison.rnmProductName}</strong>
                          <span style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '0.25rem' }}>{productDetail.rnmComparison.message}</span>
                          <small>Payé {formatCurrency(productDetail.rnmComparison.paidPrice)} · Cours RNM {formatCurrency(productDetail.rnmComparison.rnmPrice)} · écart {formatPct(productDetail.rnmComparison.gapPct)}</small>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="table-wrapper" style={{ marginTop: '1.5rem' }}>
                    <table className="table-modern">
                      <thead><tr><th>Fournisseur</th><th>Prix moyen</th><th>Volume</th><th>Score qualité</th></tr></thead>
                      <tbody>
                        {productDetail.suppliers.slice(0, 6).map((supplier, index) => (
                          <tr key={`${supplier.supplierId ?? index}`}>
                            <td style={{ fontWeight: 600 }}>{String(supplier.supplierName ?? 'Fournisseur')}</td>
                            <td>{formatCurrency(Number(supplier.averagePrice ?? 0))}</td>
                            <td>{Number(supplier.volume ?? 0).toLocaleString('fr-FR')}</td>
                            <td><span className="badge badge-stock">{Number(supplier.score ?? 0)}/100</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {supplierDetail && (
                <section className="card-modern widget-card-modern">
                  <span className="card-title"><UsersRound size={18} /> Fiche fournisseur : {supplierDetail.supplier.name}</span>
                  <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginTop: '1rem' }}>
                    <Metric icon={<ShieldCheck size={18} />} value={`${supplierDetail.score}/100`} label="Score global" tone="emerald" />
                    <Metric icon={<FileText size={18} />} value={Number(supplierDetail.stats.orderCount ?? 0)} label="Factures reçues" tone="blue" />
                    <Metric icon={<ShoppingCart size={18} />} value={formatCurrency(Number(supplierDetail.stats.monthlyAmount ?? 0))} label="Volume mensuel" tone="purple" />
                    <Metric icon={<Package size={18} />} value={Number(supplierDetail.stats.productsCount ?? 0)} label="Produits suivis" tone="orange" />
                  </div>
                  <div style={{ marginTop: '1.5rem' }}>
                    <MarginsLineChart data={supplierDetail.evolution} />
                  </div>
                  <div style={{ marginTop: '1.5rem' }}>
                    <h4 style={{ marginBottom: '1rem', fontWeight: 600 }}>Top produits achetés</h4>
                    <MarginsBarList data={supplierDetail.products} />
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* CONTENU ONGLET OPTIMISATIONS & MARCHE */}
      {subTab === 'optimization' && (
        <div className="margins-dashboard-container">
          <div className="double-panel">
            <section className="card-modern widget-card-modern">
              <span className="card-title"><CalendarDays size={18} /> Prévision des achats & Risques de rupture</span>
              <div className="table-wrapper" style={{ marginTop: '1rem' }}>
                <table className="table-modern">
                  <thead><tr><th>Produit</th><th>Rupture estimée</th><th>Qté recommandée</th><th>Budget estimé</th></tr></thead>
                  <tbody>
                    {forecasts.map((forecast) => (
                      <tr key={forecast.productId}>
                        <td>
                          <strong>{forecast.productName}</strong>
                          <br /><small style={{ color: 'var(--text-muted)' }}>{forecast.supplierName ?? 'Fournisseur à désigner'}</small>
                        </td>
                        <td>
                          {forecast.daysUntilRupture == null ? (
                            <span className="badge badge-stock">Inconnu</span>
                          ) : forecast.daysUntilRupture <= 3 ? (
                            <span className="badge badge-correction" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: 'none' }}>Imminente ({Math.ceil(forecast.daysUntilRupture)} j)</span>
                          ) : (
                            <span className="badge badge-production" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>{Math.ceil(forecast.daysUntilRupture)} jours</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>{forecast.recommendedQuantity.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} {forecast.unitSymbol}</td>
                        <td style={{ fontWeight: 700 }}>{formatCurrency(forecast.estimatedBudget)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!forecasts.length && <EmptyMini title="Aucune rupture estimée" text="Les mouvements récents n'indiquent aucun risque de rupture imminent." icon="📅" />}
            </section>

            <section className="card-modern widget-card-modern">
              <span className="card-title"><Scale size={18} /> Croisement des Prix de Marché (RNM)</span>
              <div className="settings-list" style={{ marginTop: '1rem' }}>
                {rnmComparisons.length ? rnmComparisons.map((item) => (
                  <div key={item.productId} className="suggestion-card-premium" style={{ marginBottom: '0.75rem', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{ color: item.gapPct > 0 ? 'var(--danger)' : 'var(--success)' }}><TrendingUp size={20} /></div>
                    <div style={{ flexGrow: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <strong style={{ fontSize: '0.95rem' }}>{item.productName}</strong>
                        <span className={`badge ${item.gapPct > 0 ? 'badge-correction' : 'badge-production'}`} style={item.gapPct > 0 ? { background: 'var(--danger-bg)', color: 'var(--danger)', border: 'none' } : { background: 'var(--success-bg)', color: 'var(--success)', border: 'none' }}>
                          {item.gapPct > 0 ? '+' : ''}{item.gapPct.toFixed(0)} %
                        </span>
                      </div>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Payé : <strong>{formatCurrency(item.paidPrice)}</strong> · Cours RNM : <strong>{formatCurrency(item.rnmPrice)}</strong>
                      </p>
                      <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.message}</small>
                    </div>
                  </div>
                )) : <EmptyMini title="Aucun cours de comparaison" text="Installez le module Cours des Produits pour analyser vos écarts par rapport au marché." icon="≋" />}
              </div>
            </section>
          </div>

          <section className="card-modern widget-card-modern">
            <span className="card-title"><Calculator size={18} /> Impact sur le coût matière des Recettes (Fiches Techniques)</span>
            <div className="metrics-grid" style={{ marginTop: '1.25rem' }}>
              <Metric icon={<Utensils size={18} />} value={sheetImpact?.impactedRecipesCount ?? 0} label="Recettes concernées" tone="blue" />
              <Metric icon={<Calculator size={18} />} value={formatCurrency(sheetImpact?.totalMaterialCost)} label="Coût matière global" tone="emerald" />
              <Metric icon={<TrendingUp size={18} />} value={formatCurrency(sheetImpact?.totalDelta)} label="Variation totale" tone="orange" />
              <Metric icon={<Calendar size={18} />} value={formatCurrency((sheetImpact?.totalDelta ?? 0) * 52)} label="Impact annuel estimé" tone="purple" />
            </div>
            <div className="table-wrapper" style={{ marginTop: '1.5rem' }}>
              <table className="table-modern">
                <thead><tr><th>Recette</th><th>Ingrédient concerné</th><th>Ancien coût portion</th><th>Nouveau coût portion</th><th>Impact annuel</th></tr></thead>
                <tbody>
                  {(sheetImpact?.impacts ?? []).map((impact) => (
                    <tr key={`${impact.technicalSheetId}-${impact.productId}`}>
                      <td style={{ fontWeight: 600 }}>{impact.technicalSheetName}</td>
                      <td>{impact.productName}</td>
                      <td>{formatCurrency(impact.oldCost)}</td>
                      <td>{formatCurrency(impact.newCost)}</td>
                      <td style={{ fontWeight: 700, color: impact.annualImpact > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {impact.annualImpact > 0 ? '+' : ''}{formatCurrency(impact.annualImpact)}
                      </td>
                    </tr>
                  ))}
                  {!(sheetImpact?.impacts ?? []).length && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucune variation de coût détectée sur les fiches techniques.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* CONTENU ONGLET ALERTES & SEUILS */}
      {subTab === 'alerts' && (
        <div className="margins-dashboard-container">
          <div className="double-panel">
            <section className="card-modern widget-card-modern">
              <div className="card-title-container">
                <span className="card-title"><SlidersHorizontal size={18} /> Configuration des seuils de sensibilité</span>
                <button className="btn btn-primary btn-sm" onClick={saveSettings} disabled={!settings || savingSettings}>{savingSettings ? 'Sauvegarde...' : 'Sauvegarder les seuils'}</button>
              </div>
              <div className="thresholds-config-grid">
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 600 }}>
                  Alerte hausse de prix (%)
                  <input type="number" min="1" max="1000" style={{ padding: '0.6rem 0.8rem', borderRadius: '10px' }} value={settings?.priceIncreaseThresholdPct ?? 10} onChange={(event) => setSettings((current) => current ? { ...current, priceIncreaseThresholdPct: Number(event.target.value) } : current)} />
                  <small style={{ fontWeight: 400, color: 'var(--text-muted)' }}>Signale les hausses modérées sous forme de Warning.</small>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 600 }}>
                  Alerte anomalie de prix (%)
                  <input type="number" min="1" max="1000" style={{ padding: '0.6rem 0.8rem', borderRadius: '10px' }} value={settings?.anomalyThresholdPct ?? 35} onChange={(event) => setSettings((current) => current ? { ...current, anomalyThresholdPct: Number(event.target.value) } : current)} />
                  <small style={{ fontWeight: 400, color: 'var(--text-muted)' }}>Déclenche une alerte Critique pour les écarts extrêmes.</small>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 600 }}>
                  Alerte volume de commande (%)
                  <input type="number" min="1" max="1000" style={{ padding: '0.6rem 0.8rem', borderRadius: '10px' }} value={settings?.quantityAnomalyThresholdPct ?? 60} onChange={(event) => setSettings((current) => current ? { ...current, quantityAnomalyThresholdPct: Number(event.target.value) } : current)} />
                  <small style={{ fontWeight: 400, color: 'var(--text-muted)' }}>Détecte les écarts importants de quantités livrées par rapport aux moyennes.</small>
                </label>
              </div>
            </section>

            <section className="card-modern widget-card-modern">
              <span className="card-title"><AlertCircle size={18} /> Journal des alertes et anomalies ouvertes</span>
              <div className="settings-list" style={{ marginTop: '1.25rem', maxHeight: '480px', overflowY: 'auto' }}>
                {(dashboard?.alerts ?? []).length ? dashboard!.alerts.map((alert) => (
                  <div key={alert.id} className="suggestion-card-premium" style={{ marginBottom: '0.75rem', borderLeft: alert.severity === 'CRITICAL' ? '4px solid var(--danger)' : '4px solid var(--warning)' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <strong style={{ fontSize: '0.95rem' }}>{alert.title}</strong>
                        <span className={`badge ${alert.severity === 'CRITICAL' ? 'badge-correction' : 'badge-production'}`} style={alert.severity === 'CRITICAL' ? { background: 'var(--danger-bg)', color: 'var(--danger)', border: 'none' } : { background: 'var(--warning-bg)', color: 'var(--warning)', border: 'none' }}>
                          {alert.severity === 'CRITICAL' ? 'Critique' : 'Warning'}
                        </span>
                      </div>
                      <p style={{ margin: '0.35rem 0', fontSize: '0.9rem', color: 'var(--text-main)' }}>{alert.explanation}</p>
                      <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {alert.product?.name ?? 'Produit'} · {alert.supplier?.name ?? 'Fournisseur'} {alert.variationPct != null ? `· Écart : ${formatPct(alert.variationPct)}` : ''}
                      </small>
                    </div>
                  </div>
                )) : <EmptyMini title="Aucune anomalie active" text="Toutes les factures et réceptions récentes respectent vos seuils de tolérance." icon="⚑" />}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* CONTENU ONGLET RAPPORTS & SYNTHESES */}
      {subTab === 'reports' && (
        <div className="margins-dashboard-container">
          <section className="card-modern widget-card-modern">
            <div className="card-title-container">
              <span className="card-title"><FileText size={18} /> Synthèses financières historisées</span>
              <button className="btn btn-primary" onClick={generateReport} disabled={generatingReport}>
                <Sparkles size={16} /> {generatingReport ? 'Génération...' : 'Générer une synthèse périodique'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
              {(dashboard?.reports ?? []).length ? dashboard!.reports.map((report) => (
                <div key={report.id} className="suggestion-card-premium" style={{ flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>{report.title}</strong>
                    <small style={{ color: 'var(--text-muted)' }}>{report.createdAt ? new Date(report.createdAt).toLocaleDateString('fr-FR') : ''}</small>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', flexGrow: 1, lineHeight: '1.4' }}>{report.summary}</p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid var(--light-border)', paddingTop: '0.75rem' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => void api.downloadMarginReportCsv(token, report.id, `${report.title.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.csv`)}>
                      <Download size={14} /> Exporter au format CSV
                    </button>
                  </div>
                </div>
              )) : <EmptyMini title="Aucune synthèse disponible" text="Générez un rapport pour figer l'analyse et l'exporter en CSV." icon="📄" />}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MarginsLineChart({ data }: { data: MarginChartPoint[] }) {
  const values = data.map((point) => Number(point.value || 0));
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 100 - (value / max) * 88 - 6;
    return `${x},${y}`;
  }).join(' ');
  return (
    <div className="rnm-svg-chart-container" style={{ height: 220 }}>
      {data.length ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          {values.map((value, index) => {
            const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
            const y = 100 - (value / max) * 88 - 6;
            return <circle key={`${value}-${index}`} cx={x} cy={y} r="1.8" fill="var(--primary)" />;
          })}
        </svg>
      ) : <EmptyMini title="Aucune donnée" text="Les réceptions validées alimenteront ce graphique." icon="📈" />}
    </div>
  );
}

function MarginsBarList({ data }: { data: MarginChartPoint[] }) {
  const max = Math.max(...data.map((item) => Number(item.value || 0)), 1);
  if (!data.length) return <EmptyMini title="Aucune donnée" text="Aucun achat validé pour les filtres sélectionnés." icon="📊" />;
  return (
    <div className="progress-list" style={{ marginTop: '1rem' }}>
      {data.slice(0, 8).map((item, index) => (
        <div className="progress-item-modern" key={`${item.name ?? item.productName ?? item.date}-${index}`}>
          <span className="progress-text-modern">{item.name ?? item.productName ?? item.date ?? 'Element'}</span>
          <span className="progress-val-modern">{formatCurrency(item.value)}</span>
          <div style={{ gridColumn: '1 / -1', height: 6, background: 'var(--light-bg)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(4, (Number(item.value || 0) / max) * 100)}%`, height: '100%', background: 'var(--primary)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatCurrency(value?: number | null) {
  return `${Number(value ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;
}

function formatPct(value?: number | null) {
  return `${Number(value ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
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
        const movementDate = movementEffectiveDate(m);
        const dateStr = movementDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const timeStr = movementDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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

function UnitsPage({ units, search, setSearch, showArchived, setShowArchived, onCreate }: { units: Unit[]; search: string; setSearch: (v: string) => void; showArchived: boolean; setShowArchived: (v: boolean) => void; onCreate: () => void }) {
  return (
    <ReferencePage title="Unités" subtitle="Unités principales et conversions simples compatibles (kg/g, L/mL)." search={search} setSearch={setSearch} showArchived={showArchived} setShowArchived={setShowArchived} onCreate={onCreate} createLabel="Ajouter une unité">
      <div className="table-wrapper">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Symbole</th>
              <th>Type</th>
              <th>Conversion</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr key={unit.id}>
                <td>{unit.name}</td>
                <td><span className="badge badge-reception">{unit.symbol || '—'}</span></td>
                <td>{unit.type ?? unit.unitType ?? 'Compatible'}</td>
                <td>{unit.baseFactor ? `× ${unit.baseFactor}` : 'Standard'}</td>
                <td>{isArchived(unit) ? 'Archivé' : 'Actif'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!units.length && <EmptyMini title="Aucune unité" text="Préremplissez kg, g, L, mL, pièce, carton…" />}
    </ReferencePage>
  );
}

function InventoriesPage({ inventories, products, search, setSearch, onCreate, onOpen }: { inventories: Inventory[]; products: Product[]; search: string; setSearch: (v: string) => void; onCreate: () => void; onOpen: (inventory: Inventory) => void }) {
  return (
    <ReferencePage title="Inventaires" subtitle="Inventaires complets: comptage réel, écarts, corrections automatiques et verrouillage après validation." search={search} setSearch={setSearch} onCreate={onCreate} createLabel="Créer un inventaire">
      <div className="table-wrapper">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Date</th>
              <th>Statut</th>
              <th>Périmètre</th>
              <th>Lignes</th>
              <th>Comptées</th>
            </tr>
          </thead>
          <tbody>
            {inventories.map((inventory) => {
              const lines = inventory.lines ?? [];
              const counted = lines.filter((line) => line.countedQuantity !== null && line.countedQuantity !== undefined).length;
              return (
                <tr key={inventory.id} className="clickable-row" onClick={() => onOpen(inventory)}>
                  <td style={{ fontWeight: 700 }}>{inventory.name}</td>
                  <td>{inventory.inventoryDate || inventory.date ? new Date((inventory.inventoryDate ?? inventory.date) as string).toLocaleDateString('fr-FR') : '—'}</td>
                  <td><span className={`badge ${inventory.status === 'VALIDATED' ? 'badge-reception' : 'badge-inventory'}`}>{inventory.status === 'VALIDATED' ? 'Validé' : 'Brouillon'}</span></td>
                  <td>{inventory.site?.name ?? 'Tous sites'}</td>
                  <td>{lines.length || products.length}</td>
                  <td>{counted}/{lines.length || products.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!inventories.length && <EmptyMini title="Aucun inventaire" text="Créez un inventaire complet pour charger les produits actifs et saisir les quantités comptées." />}
    </ReferencePage>
  );
}

function InventoryDetailModal({
  inventory,
  onClose,
  onSaveCounts,
  onValidate,
}: {
  inventory: Inventory | null;
  onClose: () => void;
  onSaveCounts: (inventoryId: string, lines: Array<{ productId: string; countedQuantity: number; lotId?: string }>) => Promise<void>;
  onValidate: (inventoryId: string, lines: Array<{ productId: string; countedQuantity: number; lotId?: string }>) => Promise<void>;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const lines = inventory?.lines ?? [];
  const isLocked = inventory?.status === 'VALIDATED';

  useEffect(() => {
    if (!inventory) return;
    const next: Record<string, string> = {};
    for (const line of inventory.lines ?? []) {
      next[inventoryLineKey(line)] = line.countedQuantity === null || line.countedQuantity === undefined ? '' : String(line.countedQuantity);
    }
    setCounts(next);
    setSearch('');
    setError(undefined);
  }, [inventory]);

  const filteredLines = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return lines;
    return lines.filter((line) => `${line.product?.name ?? ''} ${line.product?.sku ?? ''} ${line.product?.category?.name ?? ''}`.toLowerCase().includes(query));
  }, [lines, search]);

  function payloadFromCounts() {
    return lines
      .map((line) => {
        const raw = counts[inventoryLineKey(line)];
        if (raw === undefined || raw === '') return null;
        const countedQuantity = Number(raw);
        if (!Number.isFinite(countedQuantity) || countedQuantity < 0) return null;
        return { productId: line.productId, lotId: line.lotId ?? undefined, countedQuantity };
      })
      .filter(Boolean) as Array<{ productId: string; countedQuantity: number; lotId?: string }>;
  }

  async function saveCounts() {
    if (!inventory) return;
    const payload = payloadFromCounts();
    if (!payload.length) {
      setError('Saisissez au moins une quantité comptée.');
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSaveCounts(inventory.id, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Le comptage n’a pas pu être enregistré.');
    } finally {
      setSubmitting(false);
    }
  }

  async function validateInventory() {
    if (!inventory) return;
    const payload = payloadFromCounts();
    if (!payload.length) {
      setError('Saisissez au moins une quantité comptée avant validation.');
      return;
    }
    const missing = lines.length - payload.length;
    if (missing > 0 && !window.confirm(`${missing} ligne(s) n’ont pas de quantité comptée. Valider uniquement les lignes renseignées ?`)) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onValidate(inventory.id, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'L’inventaire n’a pas pu être validé.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={Boolean(inventory)} onClose={onClose} title={inventory?.name ?? 'Inventaire'} size="xl">
      {inventory ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error ? <div className="alert-modern error"><AlertCircle size={16} /> {error}</div> : null}
          <div className="alert-modern info" style={{ margin: 0, background: '#f8fafc', borderColor: '#dbe4ef', color: '#334155' }}>
            <ClipboardList size={16} />
            <span>{inventory.site?.name ?? 'Tous sites'} · {lines.length} produit(s) à compter.</span>
          </div>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="search-input-wrapper" style={{ maxWidth: '100%' }}>
              <Search />
              <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrer les produits de l’inventaire..." />
            </div>
            {!isLocked ? (
              <button type="button" className="btn btn-secondary" onClick={() => setCounts(Object.fromEntries(lines.map((line) => [inventoryLineKey(line), String(numeric(line.theoreticalQuantity))])))} disabled={!lines.length || submitting}>
                <Copy size={14} /> Reprendre le théorique
              </button>
            ) : null}
          </div>
          <div className="table-wrapper" style={{ maxHeight: '48vh', overflow: 'auto' }}>
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Catégorie</th>
                  <th style={{ textAlign: 'right' }}>Théorique</th>
                  <th style={{ textAlign: 'right' }}>Compté</th>
                  <th style={{ textAlign: 'right' }}>Écart</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line) => {
                  const key = inventoryLineKey(line);
                  const theoretical = numeric(line.theoreticalQuantity);
                  const countedRaw = counts[key] ?? '';
                  const counted = countedRaw === '' ? null : Number(countedRaw);
                  const variance = counted === null || !Number.isFinite(counted) ? numeric(line.varianceQuantity ?? line.variance) : counted - theoretical;
                  const unit = line.product?.unit?.symbol ?? '';
                  return (
                    <tr key={line.id}>
                      <td style={{ fontWeight: 700 }}>{line.product?.name ?? 'Produit supprimé'}</td>
                      <td>{line.product?.category?.name ?? <span style={{ color: 'var(--text-muted)' }}>Sans catégorie</span>}</td>
                      <td style={{ textAlign: 'right' }}>{formatStockNumber(theoretical)} {unit}</td>
                      <td style={{ textAlign: 'right' }}>
                        {isLocked ? (
                          <strong>{countedRaw || '—'} {unit}</strong>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={countedRaw}
                            onChange={(event) => setCounts((current) => ({ ...current, [key]: event.target.value }))}
                            style={{ width: '110px', textAlign: 'right' }}
                          />
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: variance < 0 ? 'var(--danger)' : variance > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                        {countedRaw === '' && !isLocked ? '—' : `${variance > 0 ? '+' : ''}${formatStockNumber(variance)} ${unit}`}
                      </td>
                    </tr>
                  );
                })}
                {!filteredLines.length ? (
                  <tr><td colSpan={5}><EmptyMini title="Aucune ligne" text="Aucun produit ne correspond à la recherche." /></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="modal-footer" style={{ margin: '0 -1.75rem -1.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Fermer</button>
            {!isLocked ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => void saveCounts()} disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer brouillon'}</button>
                <button type="button" className="btn btn-primary" onClick={() => void validateInventory()} disabled={submitting}>{submitting ? 'Validation...' : 'Valider l’inventaire'}</button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function inventoryLineKey(line: NonNullable<Inventory['lines']>[number]) {
  return `${line.productId}:${line.lotId ?? ''}`;
}

function formatStockNumber(value: number) {
  return Number.isInteger(value) ? String(value) : parseFloat(value.toFixed(3)).toString();
}

function LocationsPage({ sites, locations, search, setSearch, showArchived, setShowArchived, onCreateSite, onCreateLocation }: { sites: Site[]; locations: Location[]; search: string; setSearch: (v: string) => void; showArchived: boolean; setShowArchived: (v: boolean) => void; onCreateSite: () => void; onCreateLocation: () => void }) { return <ReferencePage title="Sites" subtitle="Choisissez le site de stock. Les détails internes sont masqués pour la V1." search={search} setSearch={setSearch} showArchived={showArchived} setShowArchived={setShowArchived} onCreate={onCreateLocation} createLabel="Configurer un site" secondaryAction={<button className="btn btn-secondary" onClick={onCreateSite}><Warehouse size={16}/> Nouveau site</button>}><div className="apps-grid compact-grid">{sites.map(s => <div className="app-card compact-card" key={s.id}><div className="app-card-icon"><Warehouse size={20}/></div><h3>{s.name}</h3><p>{isArchived(s) ? 'Archivé' : 'Actif'}</p></div>)}</div><div className="table-wrapper"><table className="table-modern"><thead><tr><th>Site</th><th>Statut</th></tr></thead><tbody>{sites.map(s => <tr key={s.id}><td>{s.name}</td><td>{isArchived(s) ? 'Archivé' : 'Actif'}</td></tr>)}</tbody></table></div>{!sites.length && <EmptyMini title="Aucun site" text="Ajoutez Restaurant principal ou Cuisine centrale." />}</ReferencePage>; }

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

  const featuredApps = useMemo(() => {
    return apps.filter(app => app.status === 'Disponible');
  }, []);

  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    if (searchQuery !== '') return;
    const timer = setInterval(() => {
      setFeaturedIndex(prev => (prev + 1) % featuredApps.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [featuredApps.length, searchQuery]);

  const featuredApp = featuredApps[featuredIndex] || apps[0];
  const FeaturedIcon = featuredApp.icon;

  return (
    <div className="applications-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Featured Banner (À la Une) */}
      {searchQuery === '' && (
        <div className="store-featured-banner">
          <AnimatePresence mode="wait">
            <motion.div
              key={featuredApp.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '2rem'
              }}
            >
              <div className="store-featured-content">
                <span className="store-featured-tag">À LA UNE · {featuredApp.category.toUpperCase()}</span>
                <h1 className="store-featured-title">Module {featuredApp.title}</h1>
                <p className="store-featured-desc">
                  {featuredApp.tagline}
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
                  <FeaturedIcon size={64} />
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Indicators / Dots */}
          <div className="store-featured-dots">
            {featuredApps.map((app, idx) => (
              <button
                key={app.id}
                onClick={() => setFeaturedIndex(idx)}
                className={`store-featured-dot ${idx === featuredIndex ? 'active' : ''}`}
                aria-label={`Afficher le module ${app.title}`}
              />
            ))}
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

const RESTORE_CONFIRMATION_PHRASE = 'RESTAURER TOQUEHUB';

function normalizeRestorePhrase(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function BackupRestorePage({ token, onRestoreComplete }: { token: string; onRestoreComplete: () => void }) {
  const [state, setState] = useState<BackupListResponse>();
  const [schedule, setSchedule] = useState<BackupSchedule>();
  const [cloudStatus, setCloudStatus] = useState<BackupCloudStatus>();
  const [cloudForm, setCloudForm] = useState({ clientId: '', clientSecret: '', redirectUri: api.backupCloudDefaultRedirectUri() });
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<BackupSummary | null>(null);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [cloudHelpOpen, setCloudHelpOpen] = useState(false);
  const [editingCloudConfig, setEditingCloudConfig] = useState(false);

  async function load() {
    setError(undefined);
    try {
      const [nextState, nextSchedule, nextCloudStatus] = await Promise.all([api.backups(token), api.backupSchedule(token), api.backupCloudStatus(token)]);
      setState(nextState);
      setSchedule(nextSchedule);
      setCloudStatus(nextCloudStatus);
      setCloudForm((current) => ({
        clientId: current.clientId || nextCloudStatus.googleDrive.clientId || '',
        clientSecret: current.clientSecret,
        redirectUri: current.redirectUri || nextCloudStatus.googleDrive.redirectUri || api.backupCloudDefaultRedirectUri(),
      }));
      if (nextCloudStatus.googleDrive.connected) setEditingCloudConfig(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les sauvegardes.');
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if ((event.data as { type?: string } | undefined)?.type === 'toquehub:backup-cloud-google') {
        setMessage((event.data as { ok?: boolean }).ok ? 'Google Drive connecté.' : 'Connexion Google Drive interrompue.');
        void load();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [token]);

  async function run(action: () => Promise<unknown>, success: string, restore = false) {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await action();
      const restoreResult = result as BackupRestoreResult | undefined;
      setMessage(restoreResult?.message || success);
      setConfirmationPhrase('');
      setSelectedBackup(null);
      setInspection(null);
      await load();
      if (restore) window.setTimeout(onRestoreComplete, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opération impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function inspectFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const next = await api.inspectBackupUpload(token, file);
      setInspection(next);
      setSelectedBackup(null);
      setConfirmationPhrase('');
      setMessage('Archive inspectée.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inspection de la sauvegarde impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    if (!schedule) return;
    await run(async () => {
      const saved = await api.updateBackupSchedule(token, schedule);
      setSchedule(saved);
      return saved;
    }, 'Planification enregistrée.');
  }

  async function saveGoogleDriveConfig() {
    await run(async () => {
      const saved = await api.configureGoogleDriveBackup(token, {
        clientId: cloudForm.clientId.trim(),
        clientSecret: cloudForm.clientSecret.trim() || undefined,
        redirectUri: cloudForm.redirectUri.trim(),
      });
      setCloudStatus((current) => current ? { ...current, googleDrive: saved } : current);
      setCloudForm((current) => ({ ...current, clientSecret: '' }));
      return saved;
    }, 'Configuration Google Drive enregistrée.');
  }

  async function connectGoogleDrive() {
    await run(async () => {
      const { authUrl } = await api.connectGoogleDriveBackup(token);
      window.open(authUrl, 'toquehub-google-drive', 'width=980,height=720');
      return null;
    }, 'Autorisation Google ouverte.');
  }

  async function testGoogleDrive() {
    await run(() => api.testGoogleDriveBackup(token), 'Connexion Google Drive validée.');
  }

  async function disconnectGoogleDrive() {
    await run(() => api.disconnectGoogleDriveBackup(token), 'Compte Google Drive déconnecté.');
  }

  function copyCloudRedirectUri() {
    if (!navigator.clipboard) {
      setError('Copie automatique indisponible dans ce navigateur.');
      return;
    }
    void navigator.clipboard.writeText(cloudForm.redirectUri);
    setMessage('URI de redirection copiée.');
  }

  const normalizedConfirmationPhrase = normalizeRestorePhrase(confirmationPhrase);
  const localRestoreReady = Boolean(selectedBackup && normalizedConfirmationPhrase === RESTORE_CONFIRMATION_PHRASE);
  const uploadRestoreReady = Boolean(inspection && normalizedConfirmationPhrase === RESTORE_CONFIRMATION_PHRASE);
  const googleDrive = cloudStatus?.googleDrive;
  const googleDriveConfigured = Boolean(googleDrive?.configured);
  const googleDriveConnected = Boolean(googleDrive?.connected);
  const googleDriveStatusLabel = googleDriveConnected ? 'Connecté' : googleDriveConfigured ? 'Configuré' : 'Non connecté';
  const showCloudConfigForm = !googleDriveConnected || editingCloudConfig;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <section className="welcome-hero settings-hero" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="settings-hero-grid">
          <div className="settings-hero-left">
            <span className="sovereign-badge-glow"><span className="status-indicator-dot green"></span> Continuité d’activité</span>
            <h1 style={{ color: 'white', margin: '0.5rem 0 0.25rem 0', fontSize: '2rem', fontWeight: 800 }}>Sauvegarde & restauration</h1>
            <p style={{ color: 'rgba(255,255,255,0.72)', margin: 0, fontSize: '0.92rem', lineHeight: 1.5 }}>Archive complète de l’instance: base PostgreSQL, documents métier et manifeste technique, sans secrets applicatifs.</p>
          </div>
          <div className="glass-terminal">
            <div className="glass-terminal-header"><span className="glass-terminal-title">backup runtime</span></div>
            <div className="glass-terminal-rows">
              {(state?.tools ?? []).map((tool) => <div className="glass-terminal-row" key={tool.key}><span className="label">{tool.key.toUpperCase()} :</span><span className="value" style={{ color: tool.available ? '#10b981' : '#f97316' }}><span className={`status-indicator-dot ${tool.available ? 'green' : 'orange'}`}></span>{tool.available ? 'DISPONIBLE' : 'MANQUANT'}</span></div>)}
              <div className="glass-terminal-row"><span className="label">OPÉRATION :</span><span className="value" style={{ color: state?.operation ? '#f97316' : '#10b981' }}>{state?.operation ?? 'AUCUNE'}</span></div>
            </div>
          </div>
        </div>
      </section>

      {error ? <div className="alert-modern error"><AlertCircle size={16} /> {error}</div> : null}
      {message ? <div className="alert-modern success"><CheckCircle2 size={16} /> {message}</div> : null}

      <div className="card-modern" style={{ padding: '1.25rem' }}>
        <div className="section-header-modern">
          <div className="section-info"><span className="card-title"><Archive size={18} /> Sauvegardes locales</span><span className="section-tagline">Les archives sont conservées côté serveur et téléchargeables.</span></div>
          <button className="btn btn-primary" disabled={busy || Boolean(state?.operation)} onClick={() => void run(() => api.createBackup(token), 'Sauvegarde créée.')}><Archive size={16} /> Créer une sauvegarde</button>
        </div>
        <div className="table-wrapper">
          <table className="table-modern">
            <thead>
              <tr><th>Archive</th><th>Date</th><th>Contenu</th><th>Taille</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {(state?.backups ?? []).map((backup) => (
                <tr key={backup.id}>
                  <td><strong>{backup.filename}</strong><br /><small>{backup.mode === 'scheduled' ? 'Automatique' : 'Manuelle'}</small></td>
                  <td>{backup.createdAt ? new Date(backup.createdAt).toLocaleString('fr-FR') : '—'}</td>
                  <td>{backup.manifest ? `${backup.manifest.files.totalFileCount} fichier(s), PostgreSQL ${formatBytes(backup.manifest.database.sizeBytes)}` : 'Manifeste indisponible'}</td>
                  <td>{formatBytes(backup.sizeBytes)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void api.downloadBackup(token, backup)}><Download size={14} /> Télécharger</button>
                      <button className="btn btn-secondary btn-sm" disabled={busy || !googleDriveConnected} onClick={() => void run(() => api.sendBackupToGoogleDrive(token, backup.id), 'Sauvegarde envoyée vers Google Drive.')} title={googleDriveConnected ? 'Envoyer cette archive vers Google Drive' : 'Connectez Google Drive avant l’envoi'}><UploadCloud size={14} /> Envoyer vers GDrive</button>
                      <button className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => { setSelectedBackup(backup); setInspection(null); setConfirmationPhrase(''); }}><RotateCw size={14} /> Restaurer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!state?.backups?.length ? <EmptyMini title="Aucune sauvegarde" text="Créez une première archive complète de l’instance." /> : null}
      </div>

      <div className="card-modern" style={{ padding: '1.25rem', ...(googleDriveConnected && !editingCloudConfig ? { background: '#f8fafc', borderColor: 'rgba(16,185,129,0.24)' } : {}) }}>
        <div className="section-header-modern">
          <div className="section-info">
            <span className="card-title">
              <Cloud size={18} /> Sauvegarde Cloud
              <button
                type="button"
                onClick={() => setCloudHelpOpen(true)}
                title="Tutoriel sauvegarde cloud"
                aria-label="Ouvrir le tutoriel sauvegarde cloud"
                style={{
                  width: 28,
                  height: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '999px',
                  border: '1px solid rgba(100, 116, 139, 0.18)',
                  background: 'rgba(248, 250, 252, 0.92)',
                  color: '#64748b',
                  cursor: 'pointer',
                  marginLeft: '0.35rem',
                  boxShadow: '0 6px 14px rgba(15, 23, 42, 0.06)',
                }}
              >
                <HelpCircle size={16} />
              </button>
            </span>
            <span className="section-tagline">Réplication automatique des archives locales vers Google Drive.</span>
          </div>
          <span className={`badge ${googleDriveConnected ? 'badge-reception' : googleDrive?.status === 'ERROR' ? 'badge-correction' : 'badge-stock'}`}>{googleDriveStatusLabel}</span>
        </div>

        {!cloudStatus?.encryptionConfigured ? <div className="alert-modern error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /> BACKUP_CLOUD_ENCRYPTION_KEY doit être configuré côté serveur pour activer Google Drive.</div> : null}
        {googleDrive?.lastError ? <div className="alert-modern error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /> {googleDrive.lastError}</div> : null}

        <div className="settings-grid-premium" style={{ marginBottom: '1rem' }}>
          <div className="info-card-premium">
            <div className="info-card-premium-header"><span className="info-card-premium-label">Compte Google</span><span className="info-card-premium-icon"><Cloud size={16} /></span></div>
            <div className="info-card-premium-value">{googleDrive?.accountEmail ?? 'Non connecté'}</div>
          </div>
          <div className="info-card-premium">
            <div className="info-card-premium-header"><span className="info-card-premium-label">Dernière synchronisation</span><span className="info-card-premium-icon"><Clock size={16} /></span></div>
            <div className="info-card-premium-value">{googleDrive?.lastSyncAt ? new Date(googleDrive.lastSyncAt).toLocaleString('fr-FR') : 'Jamais'}</div>
          </div>
          <div className="info-card-premium">
            <div className="info-card-premium-header"><span className="info-card-premium-label">Dernier test</span><span className="info-card-premium-icon"><ShieldCheck size={16} /></span></div>
            <div className="info-card-premium-value">{googleDrive?.lastTestAt ? new Date(googleDrive.lastTestAt).toLocaleString('fr-FR') : 'Jamais'}</div>
          </div>
        </div>

        {googleDriveConnected && !editingCloudConfig ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem', borderRadius: '16px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
              <span style={{ width: 42, height: 42, borderRadius: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'white', color: '#059669', boxShadow: '0 8px 18px rgba(15,23,42,0.06)' }}><ShieldCheck size={20} /></span>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', color: '#065f46' }}>Compte configuré et en ligne</strong>
                <span className="muted" style={{ display: 'block', fontSize: '0.84rem', overflowWrap: 'anywhere' }}>{googleDrive?.accountEmail ?? 'Google Drive connecté'} · sauvegarde cloud active</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" disabled={busy} onClick={() => setEditingCloudConfig(true)}><Edit3 size={16} /> Modifier</button>
              <button className="btn btn-secondary" disabled={busy || !googleDriveConnected} onClick={() => void testGoogleDrive()}><ShieldCheck size={16} /> Tester</button>
              <button className="btn btn-outline-danger" disabled={busy || !googleDriveConfigured} onClick={() => void disconnectGoogleDrive()}><RotateCw size={16} /> Déconnecter</button>
            </div>
          </div>
        ) : (
          <>
            <div className="settings-grid-premium">
              <label>Client ID Google<input value={cloudForm.clientId} onChange={(event) => setCloudForm((current) => ({ ...current, clientId: event.target.value }))} placeholder="xxxxx.apps.googleusercontent.com" disabled={busy || (googleDriveConnected && !showCloudConfigForm)} /></label>
              <label>Client secret Google<input type="password" value={cloudForm.clientSecret} onChange={(event) => setCloudForm((current) => ({ ...current, clientSecret: event.target.value }))} placeholder={googleDriveConfigured ? 'Laisser vide pour conserver' : 'GOCSPX-...'} disabled={busy || (googleDriveConnected && !showCloudConfigForm)} /></label>
              <label>URI de redirection<input value={cloudForm.redirectUri} onChange={(event) => setCloudForm((current) => ({ ...current, redirectUri: event.target.value }))} disabled={busy || (googleDriveConnected && !showCloudConfigForm)} /></label>
            </div>

            <div className="alert-modern info" style={{ marginTop: '1rem', background: '#f8fafc' }}>
              <Info size={16} />
              <span>À ajouter dans Google Cloud Console: <code>{cloudForm.redirectUri}</code></span>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" disabled={busy || !cloudStatus?.encryptionConfigured || !cloudForm.clientId.trim() || !cloudForm.redirectUri.trim()} onClick={() => void saveGoogleDriveConfig()}><KeyRound size={16} /> Enregistrer OAuth</button>
              <button className="btn btn-primary" disabled={busy || !googleDriveConfigured} onClick={() => void connectGoogleDrive()}><ExternalLink size={16} /> Connecter Google Drive</button>
              <button className="btn btn-secondary" disabled={busy || !googleDriveConnected} onClick={() => void testGoogleDrive()}><ShieldCheck size={16} /> Tester</button>
              <button className="btn btn-outline-danger" disabled={busy || !googleDriveConfigured} onClick={() => void disconnectGoogleDrive()}><RotateCw size={16} /> Déconnecter</button>
              {editingCloudConfig ? <button className="btn btn-secondary" disabled={busy} onClick={() => setEditingCloudConfig(false)}>Annuler</button> : null}
            </div>
          </>
        )}
      </div>

      <Modal isOpen={cloudHelpOpen} onClose={() => setCloudHelpOpen(false)} title="Tutoriel Google Drive" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ padding: '1.1rem', borderRadius: '18px', background: 'linear-gradient(135deg, #eff6ff 0%, #ecfdf5 100%)', border: '1px solid rgba(16,185,129,0.16)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: '#047857', fontWeight: 900, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <Cloud size={15} /> Connexion Google Drive
            </span>
            <h3 style={{ margin: '0.45rem 0 0.35rem', color: 'var(--text-main)', fontSize: '1.35rem' }}>Votre sauvegarde cloud en 5 minutes</h3>
            <p className="muted" style={{ margin: 0, lineHeight: 1.65 }}>
              ToqueHub crée d'abord une archive locale, puis l'envoie dans un dossier Google Drive autorisé par votre compte.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
            {[
              ['1', 'Créer le projet Google', 'Dans Google Cloud Console, créez ou sélectionnez un projet dédié à ToqueHub.'],
              ['2', 'Activer Drive API', 'Dans Bibliothèque API, activez Google Drive API pour ce projet.'],
              ['3', 'Préparer OAuth', 'Dans Écran de consentement OAuth, renseignez le nom de l’application et ajoutez votre compte en testeur si nécessaire.'],
              ['4', 'Passer l’audience en production', 'Dans Audience, publiez l’application en production. En mode test, Google peut refuser la connexion ou limiter les comptes.'],
              ['5', 'Créer les identifiants', 'Créez un Client OAuth de type Application Web, puis ajoutez exactement l’URI de redirection ToqueHub.'],
              ['6', 'Connecter et tester', 'Copiez Client ID et secret ici, enregistrez OAuth, connectez Google Drive, puis lancez un test.'],
            ].map(([step, title, text]) => (
              <div key={step} style={{ padding: '1rem', border: '1px solid var(--light-border)', borderRadius: '16px', background: '#ffffff', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.04)' }}>
                <span style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', color: '#059669', fontWeight: 900 }}>{step}</span>
                <strong style={{ display: 'block', marginTop: '0.8rem', color: 'var(--text-main)' }}>{title}</strong>
                <p className="muted" style={{ margin: '0.35rem 0 0', lineHeight: 1.55, fontSize: '0.84rem' }}>{text}</p>
              </div>
            ))}
          </div>

          <div style={{ padding: '1rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid var(--light-border)', display: 'flex', gap: '0.9rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', color: 'var(--text-main)', marginBottom: '0.25rem' }}>URI de redirection à coller dans Google</strong>
              <code style={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere', color: '#0f172a' }}>{cloudForm.redirectUri}</code>
            </div>
            <button type="button" className="btn btn-secondary" onClick={copyCloudRedirectUri}><ClipboardList size={16} /> Copier</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
            <div className="alert-modern info" style={{ margin: 0, background: '#f8fafc' }}>
              <ShieldCheck size={16} />
              <span>Le Client secret reste côté serveur. Si le champ est laissé vide après une première configuration, ToqueHub conserve le secret existant.</span>
            </div>
            <div className="alert-modern info" style={{ margin: 0, background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412' }}>
              <AlertCircle size={16} />
              <span>La variable serveur BACKUP_CLOUD_ENCRYPTION_KEY doit être configurée avant l’activation cloud.</span>
            </div>
          </div>

          <div className="modal-footer" style={{ margin: '0 -1.75rem -1.75rem', padding: '1rem 1.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCloudHelpOpen(false)}>Fermer</button>
            <button type="button" className="btn btn-primary" onClick={() => { copyCloudRedirectUri(); setCloudHelpOpen(false); }}>
              <ClipboardList size={16} /> Copier l’URI
            </button>
          </div>
        </div>
      </Modal>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: '1rem' }}>
        <div className="card-modern" style={{ padding: '1.25rem' }}>
          <span className="card-title"><Download size={18} style={{ transform: 'rotate(180deg)' }} /> Importer une sauvegarde</span>
          <p className="muted">Importez une archive `.tar.gz`, inspectez son manifeste, puis confirmez la restauration.</p>
          <input type="file" accept=".gz,.tgz,.tar.gz,application/gzip" disabled={busy} onChange={(event) => void inspectFile(event.target.files?.[0])} />
          {inspection ? <div className="alert-modern info" style={{ marginTop: '1rem', background: '#f8fafc' }}><Info size={16} /><div><strong>{inspection.filename}</strong><br /><span>Créée le {new Date(inspection.manifest.createdAt).toLocaleString('fr-FR')} · {inspection.manifest.files.totalFileCount} fichier(s) · {formatBytes(inspection.sizeBytes)}</span></div></div> : null}
        </div>

        <div className="card-modern" style={{ padding: '1.25rem', borderColor: selectedBackup || inspection ? 'rgba(239,68,68,0.35)' : undefined }}>
          <span className="card-title"><ShieldCheck size={18} /> Restauration destructive</span>
          <p className="muted">La restauration remplace la base et les fichiers uploadés. Saisissez la phrase exacte pour déverrouiller l’action.</p>
          <input placeholder={RESTORE_CONFIRMATION_PHRASE} value={confirmationPhrase} onChange={(event) => setConfirmationPhrase(event.target.value)} disabled={busy || (!selectedBackup && !inspection)} />
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}><button className="btn btn-danger" disabled={busy || !localRestoreReady} onClick={() => selectedBackup && void run(() => api.restoreBackup(token, selectedBackup.id, normalizedConfirmationPhrase), 'Restauration terminée.', true)}>Restaurer la sauvegarde locale</button><button className="btn btn-danger" disabled={busy || !uploadRestoreReady} onClick={() => inspection && void run(() => api.restoreBackupUpload(token, inspection.uploadId, normalizedConfirmationPhrase), 'Restauration terminée.', true)}>Restaurer l’archive importée</button></div>
          {selectedBackup ? <p className="muted" style={{ marginTop: '0.75rem' }}>Cible locale: {selectedBackup.filename}</p> : null}
        </div>
      </div>

      <div className="card-modern" style={{ padding: '1.25rem' }}>
        <span className="card-title"><Clock size={18} /> Planification simple</span>
        {schedule ? <div className="settings-grid-premium" style={{ marginTop: '1rem' }}><label>Statut<select value={schedule.enabled ? 'on' : 'off'} onChange={(event) => setSchedule((current) => current ? { ...current, enabled: event.target.value === 'on' } : current)}><option value="off">Désactivée</option><option value="on">Activée</option></select></label><label>Fréquence<select value={schedule.frequency} onChange={(event) => setSchedule((current) => current ? { ...current, frequency: event.target.value as 'daily' | 'weekly' } : current)}><option value="daily">Quotidienne</option><option value="weekly">Hebdomadaire</option></select></label><label>Heure<input type="time" value={schedule.time} onChange={(event) => setSchedule((current) => current ? { ...current, time: event.target.value } : current)} /></label><label>Jour<select value={schedule.weekday} disabled={schedule.frequency !== 'weekly'} onChange={(event) => setSchedule((current) => current ? { ...current, weekday: Number(event.target.value) } : current)}>{['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>Rétention jours<input type="number" min={1} value={schedule.retentionDays} onChange={(event) => setSchedule((current) => current ? { ...current, retentionDays: Number(event.target.value) } : current)} /></label><div style={{ display: 'flex', alignItems: 'end' }}><button className="btn btn-primary" disabled={busy} onClick={() => void saveSchedule()}>Enregistrer</button></div></div> : <p className="muted">Chargement de la planification...</p>}
      </div>
    </div>
  );
}

type SettingsSubTab = 'general' | 'users' | 'architecture' | 'backups' | 'updates' | 'remote-access' | 'api-keys' | 'core';
type OrganizationSettingModal = 'name' | 'establishmentType' | 'regulatoryCountry' | 'secondarySites' | 'siteForm' | null;
type SiteDraft = { name: string; description: string; address: string; phone: string; responsibleName: string; responsiblePhone: string; responsibleEmail: string };

const establishmentTypeOptions: EstablishmentType[] = ['Restaurant', 'EHPAD', 'Collectivité', 'Hôtel', 'Traiteur', 'Cuisine centrale', 'Autre'];
const teamSizeOptions: Array<{ label: string; value: TeamSize }> = [
  { label: '1 à 5 personnes', value: '1-5' },
  { label: '6 à 10 personnes', value: '6-10' },
  { label: '11 à 20 personnes', value: '11-20' },
  { label: 'Plus de 20 personnes', value: '20+' },
];

function teamSizeFromCollaboratorCount(count: number): TeamSize {
  if (count <= 5) return '1-5';
  if (count <= 10) return '6-10';
  if (count <= 20) return '11-20';
  return '20+';
}

function teamSizeLabel(value?: TeamSize | string | null) {
  return teamSizeOptions.find((option) => option.value === value)?.label ?? value ?? 'Non renseigné';
}

function collaboratorCountLabel(count: number) {
  return `${count} collaborateur${count > 1 ? 's' : ''}`;
}

function updateStatusLabel(status?: SystemUpdateOperation['status']) {
  if (status === 'queued') return 'En attente';
  if (status === 'running') return 'En cours';
  if (status === 'success') return 'Terminée';
  if (status === 'rollback') return 'Rollback';
  if (status === 'error') return 'Erreur';
  return 'Prêt';
}

function isSystemUpdateRunning(operation?: SystemUpdateOperation | null) {
  return Boolean(operation && ['queued', 'running', 'rollback'].includes(operation.status));
}

function systemUpdateOperationMessage(operation: SystemUpdateOperation) {
  if (operation.status === 'queued') return 'La mise à jour est en file d’attente.';
  if (operation.status === 'running') return 'Installation en cours. Gardez cette fenêtre ouverte pour suivre l’avancement.';
  if (operation.status === 'success') return 'Mise à jour terminée avec succès.';
  if (operation.status === 'rollback') return 'Un problème a été détecté. Rollback automatique en cours ou terminé.';
  if (operation.status === 'error') return 'La mise à jour a échoué et nécessite une vérification.';
  return 'Opération prête.';
}

function systemUpdateProgress(operation: SystemUpdateOperation) {
  if (operation.status === 'success') return { percent: 100, label: 'Installation terminée' };
  if (operation.status === 'error') return { percent: 100, label: 'Erreur détectée' };
  if (operation.status === 'rollback') return { percent: 65, label: 'Rollback en cours' };
  if (operation.status === 'queued') return { percent: 5, label: 'En attente de démarrage' };

  const logs = operation.logs.join('\n').toLowerCase();
  const backupStarted = logs.includes('backup postgresql');
  const tagChanged = logs.includes('toquehub_image_tag');
  if (logs.includes('healthcheck ok')) return { percent: 96, label: 'Vérification finale réussie' };
  if (logs.includes('healthcheck')) return { percent: 88, label: 'Vérification de santé' };
  if (logs.includes('up -d api web')) return { percent: 78, label: 'Redémarrage API et Web' };
  if (tagChanged && logs.includes('pull api web')) return { percent: 62, label: 'Téléchargement des images Docker' };
  if (tagChanged) return { percent: 48, label: 'Préparation de la nouvelle version' };
  if (logs.includes('backup fichiers valid')) return { percent: 40, label: 'Sauvegarde fichiers validée' };
  if (logs.includes('backup fichiers')) return { percent: 32, label: 'Sauvegarde des fichiers' };
  if (logs.includes('backup logique postgresql valid')) return { percent: 26, label: 'Sauvegarde PostgreSQL validée' };
  if (backupStarted) return { percent: 18, label: 'Sauvegarde PostgreSQL' };
  if (logs.includes('précontrôle ok')) return { percent: 16, label: 'Précontrôle validé' };
  if (logs.includes('vérification accès images docker')) return { percent: 14, label: 'Vérification des images Docker' };
  if (logs.includes('ghcr: authentification docker')) return { percent: 13, label: 'Authentification GHCR' };
  if (logs.includes('précontrôle service')) return { percent: 12, label: 'Vérification des services' };
  if (logs.includes('update ')) return { percent: 12, label: 'Démarrage de la mise à jour' };
  return { percent: 10, label: 'Initialisation' };
}

function SystemUpdatePanel({
  status,
  operation,
  loading,
  applying,
  error,
  onCheck,
  onApply,
}: {
  status: SystemUpdateStatus | null;
  operation: SystemUpdateOperation | null;
  loading: boolean;
  applying: boolean;
  error: string | null;
  onCheck: () => void;
  onApply: () => void;
}) {
  const operationRunning = Boolean(operation && ['queued', 'running', 'rollback'].includes(operation.status));
  const updaterAvailable = Boolean(status?.runtime.updaterAvailable);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card-modern" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div>
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <Download size={18} /> Version et mise à jour
            </span>
            <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
              Canal stable basé sur les releases GitHub taguées.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={onCheck} disabled={loading || operationRunning}>
              <RotateCw size={15} className={loading ? 'spin' : undefined} />
              Vérifier
            </button>
            <button type="button" className="btn btn-primary" onClick={onApply} disabled={!status?.updateAvailable || !updaterAvailable || applying || operationRunning}>
              <Download size={15} />
              {applying || operationRunning ? 'Mise à jour...' : 'Mettre à jour'}
            </button>
          </div>
        </div>

        {error ? <div className="alert-modern error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /> {error}</div> : null}
        {status?.github.error ? <div className="alert-modern error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /> GitHub : {status.github.error}</div> : null}
        {!updaterAvailable && status ? (
          <div className="alert-modern error" style={{ marginBottom: '1rem' }}>
            <Info size={16} />
            Updater indisponible. Lancez en SSH : <code>docker compose --env-file .env.docker pull && docker compose --env-file .env.docker up -d</code>
          </div>
        ) : null}

        <div className="settings-grid-premium">
          <div className="info-card-premium">
            <div className="info-card-premium-header"><span className="info-card-premium-label">Version installée</span><span className="info-card-premium-icon"><Server size={16} /></span></div>
            <div className="info-card-premium-value">{status?.current.version || 'Chargement...'}</div>
            <span className="badge badge-reception" style={{ width: 'fit-content', marginTop: '0.65rem' }}>{status?.current.imageTag || 'local'}</span>
          </div>
          <div className="info-card-premium">
            <div className="info-card-premium-header"><span className="info-card-premium-label">Dernière release stable</span><span className="info-card-premium-icon"><ExternalLink size={16} /></span></div>
            <div className="info-card-premium-value">{status?.latest?.tag || 'Aucune release'}</div>
            {status?.latest?.source ? <span className="badge badge-reception" style={{ width: 'fit-content', marginTop: '0.65rem' }}>{status.latest.source === 'release' ? 'GitHub Release' : 'Tag GitHub'}</span> : null}
            {status?.latest?.url ? <a href={status.latest.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#047857' }}>Voir GitHub</a> : null}
          </div>
          <div className="info-card-premium">
            <div className="info-card-premium-header"><span className="info-card-premium-label">Plateforme</span><span className="info-card-premium-icon"><Cpu size={16} /></span></div>
            <div className="info-card-premium-value" style={{ fontSize: '1rem' }}>{status?.runtime.platform || 'Docker'}</div>
          </div>
          <div className="info-card-premium">
            <div className="info-card-premium-header"><span className="info-card-premium-label">Statut</span><span className="info-card-premium-icon"><ShieldCheck size={16} /></span></div>
            <div className="info-card-premium-value" style={{ color: status?.updateAvailable ? '#b45309' : '#047857' }}>
              {status?.updateAvailable ? 'Update disponible' : 'À jour'}
            </div>
          </div>
        </div>

        <div className="settings-list" style={{ marginTop: '1.25rem' }}>
          <div><span>Canal</span><strong>{status?.channel ?? 'stable'}</strong></div>
          <div><span>Repo GitHub</span><strong>{status?.github.repo ?? 'ToqueHub/ToqueHub-Web'}</strong></div>
          <div><span>Image API</span><strong>{status?.current.apiImage ?? '-'}</strong></div>
          <div><span>Image Web</span><strong>{status?.current.webImage ?? '-'}</strong></div>
          <div><span>Dernière vérification</span><strong>{status?.checkedAt ? new Date(status.checkedAt).toLocaleString('fr-FR') : '-'}</strong></div>
        </div>
      </div>

      <div className="card-modern" style={{ padding: '1.5rem' }}>
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <History size={18} /> Opération de mise à jour
        </span>
        <div className="settings-list">
          <div><span>Statut</span><strong>{updateStatusLabel(operation?.status)}</strong></div>
          <div><span>Cible</span><strong>{operation?.targetTag ?? status?.latest?.tag ?? '-'}</strong></div>
          <div><span>Démarrée</span><strong>{operation?.startedAt ? new Date(operation.startedAt).toLocaleString('fr-FR') : '-'}</strong></div>
          <div><span>Terminée</span><strong>{operation?.finishedAt ? new Date(operation.finishedAt).toLocaleString('fr-FR') : '-'}</strong></div>
        </div>
        {operation?.error ? <div className="alert-modern error" style={{ marginTop: '1rem' }}><AlertCircle size={16} /> {operation.error}</div> : null}
        <pre style={{ marginTop: '1rem', maxHeight: 260, overflow: 'auto', background: '#0f172a', color: '#e2e8f0', padding: '1rem', borderRadius: 12, fontSize: '0.78rem', lineHeight: 1.5 }}>
          {(operation?.logs?.length ? operation.logs : ['Aucune opération récente.']).join('\n')}
        </pre>
      </div>
    </div>
  );
}

function SystemUpdateProgressModal({
  isOpen,
  status,
  operation,
  applying,
  error,
  onClose,
}: {
  isOpen: boolean;
  status: SystemUpdateStatus | null;
  operation: SystemUpdateOperation | null;
  applying: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const running = isSystemUpdateRunning(operation);
  const progress = operation ? systemUpdateProgress(operation) : { percent: applying ? 8 : 0, label: applying ? 'Lancement de l’opération' : 'Prêt' };

  return (
    <Modal isOpen={isOpen} onClose={running ? () => undefined : onClose} title="Suivi de mise à jour" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className={`alert-modern ${operation?.status === 'success' ? 'success' : operation?.status === 'error' || operation?.status === 'rollback' || error ? 'error' : 'info'}`} style={!operation || running ? { background: '#f8fafc', borderColor: '#dbe4ef', color: '#334155' } : undefined}>
          {running || applying ? <RefreshCw size={17} className="spin" /> : operation?.status === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span>{operation ? systemUpdateOperationMessage(operation) : 'Démarrage de la mise à jour...'}</span>
        </div>

        <div className="settings-grid-premium">
          <div className="info-card-premium">
            <div className="info-card-premium-header"><span className="info-card-premium-label">Version installée</span><span className="info-card-premium-icon"><Server size={16} /></span></div>
            <div className="info-card-premium-value">{status?.current.version ?? '-'}</div>
            <span className="badge badge-reception" style={{ width: 'fit-content', marginTop: '0.65rem' }}>{status?.current.imageTag ?? 'local'}</span>
          </div>
          <div className="info-card-premium">
            <div className="info-card-premium-header"><span className="info-card-premium-label">Cible</span><span className="info-card-premium-icon"><Download size={16} /></span></div>
            <div className="info-card-premium-value">{operation?.targetTag ?? status?.latest?.tag ?? status?.latest?.version ?? '-'}</div>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{progress.label}</strong>
            <span className="badge badge-reception">{progress.percent}%</span>
          </div>
          <div className="progress-bar-bg" style={{ height: '8px', borderRadius: '999px', background: '#e5e7eb', overflow: 'hidden' }}>
            <div className="progress-bar-fill" style={{ height: '100%', width: `${progress.percent}%`, background: operation?.status === 'error' || operation?.status === 'rollback' ? '#ef4444' : '#10b981', borderRadius: '999px', transition: 'width 0.25s ease' }} />
          </div>
        </div>

        {operation ? (
          <div className="settings-list">
            <div><span>Statut</span><strong>{updateStatusLabel(operation.status)}</strong></div>
            <div><span>Démarrée</span><strong>{new Date(operation.startedAt).toLocaleString('fr-FR')}</strong></div>
            <div><span>Terminée</span><strong>{operation.finishedAt ? new Date(operation.finishedAt).toLocaleString('fr-FR') : '-'}</strong></div>
          </div>
        ) : null}

        {error ? <div className="alert-modern error"><AlertCircle size={16} /> {error}</div> : null}
        {operation?.error ? <div className="alert-modern error"><AlertCircle size={16} /> {operation.error}</div> : null}

        <pre style={{ maxHeight: 300, overflow: 'auto', background: '#0f172a', color: '#e2e8f0', padding: '1rem', borderRadius: 12, fontSize: '0.78rem', lineHeight: 1.5, margin: 0 }}>
          {(operation?.logs?.length ? operation.logs : ['Initialisation de l’opération...']).join('\n')}
        </pre>

        <div className="modal-footer" style={{ margin: '0 -1.75rem -1.75rem' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={running || applying}>
            {operation?.status === 'success' ? 'Fermer' : 'Fermer le suivi'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SettingsPage({ session, token, dashboardSummary, sites, focusApiKeys, onApiKeysSaved, onSettingsSaved, onOpenUsers, onRestoreComplete, isAdmin = false }: { session: UserSession; token: string; dashboardSummary?: DashboardSummary; sites: Site[]; focusApiKeys?: boolean; onApiKeysSaved?: () => void; onSettingsSaved?: () => void; onOpenUsers?: () => void; onRestoreComplete: () => void; isAdmin?: boolean }) {
  const organization = dashboardSummary?.organization;
  const organizationName = organization?.name ?? session.user.organizationName ?? 'Organisation';
  const organizationType = organization?.establishmentType ?? session.user.organizationType ?? null;
  const organizationTeamSize = organization?.teamSize ?? session.user.teamSize ?? null;
  const hrCollaboratorCount = dashboardSummary?.counts.hrCollaborators ?? dashboardSummary?.counts.collaborators ?? null;
  const computedTeamSize = typeof hrCollaboratorCount === 'number' ? teamSizeFromCollaboratorCount(hrCollaboratorCount) : organizationTeamSize;
  const teamSizeDisplay = typeof hrCollaboratorCount === 'number' ? collaboratorCountLabel(hrCollaboratorCount) : teamSizeLabel(organizationTeamSize);
  const teamSizeMeta = typeof hrCollaboratorCount === 'number'
    ? hrCollaboratorCount > 0
      ? `Palier RH : ${teamSizeLabel(computedTeamSize)}`
      : 'Synchronisé RH'
    : 'Valeur onboarding';
  const regulatoryCountryCode = organization?.regulatoryCountryCode ?? session.user.regulatoryCountryCode ?? null;
  const activeOrganizationSites = sites.filter((site) => !isArchived(site));
  const primarySiteId = organization?.primarySiteId ?? session.user.primarySiteId ?? null;
  const primarySite = activeOrganizationSites.find((site) => site.id === primarySiteId)
    ?? activeOrganizationSites.find((site) => site.name === (organization?.mainSiteName ?? session.user.mainSiteName))
    ?? activeOrganizationSites[0]
    ?? null;
  const secondarySites = activeOrganizationSites.filter((site) => site.id !== primarySite?.id);
  const initialConfigured = organization?.apiKeys?.mistral.configured ?? session.user.apiKeys?.mistral.configured ?? false;
  const initialMasked = organization?.apiKeys?.mistral.masked ?? session.user.apiKeys?.mistral.masked;
  const initialGithubConfigured = organization?.apiKeys?.github?.configured ?? session.user.apiKeys?.github?.configured ?? false;
  const initialGithubMasked = organization?.apiKeys?.github?.masked ?? session.user.apiKeys?.github?.masked;
  const initialRemoteAccess = organization?.remoteAccess ?? session.user.remoteAccess;
  const [mistralKey, setMistralKey] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(initialConfigured);
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null | undefined>(initialMasked);
  const [apiKeyMessage, setApiKeyMessage] = useState<string>();
  const [apiKeyError, setApiKeyError] = useState<string>();
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [githubTokenConfigured, setGithubTokenConfigured] = useState(initialGithubConfigured);
  const [githubTokenMasked, setGithubTokenMasked] = useState<string | null | undefined>(initialGithubMasked);
  const [githubTokenMessage, setGithubTokenMessage] = useState<string>();
  const [githubTokenError, setGithubTokenError] = useState<string>();
  const [savingGithubToken, setSavingGithubToken] = useState(false);
  const [remoteAccess, setRemoteAccess] = useState<OrganizationRemoteAccess>({
    enabled: Boolean(initialRemoteAccess?.enabled),
    tailscaleHostname: initialRemoteAccess?.tailscaleHostname ?? 'toquehub',
    tailscaleUrl: initialRemoteAccess?.tailscaleUrl ?? '',
    tailscaleIp: initialRemoteAccess?.tailscaleIp ?? '',
    updatedAt: initialRemoteAccess?.updatedAt ?? null,
  });
  const [remoteAccessMessage, setRemoteAccessMessage] = useState<string>();
  const [remoteAccessError, setRemoteAccessError] = useState<string>();
  const [remoteAccessBusy, setRemoteAccessBusy] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState<RemoteAccessStatus | null>(null);
  const [remoteStatusLoading, setRemoteStatusLoading] = useState(false);
  const [showRemoteHelp, setShowRemoteHelp] = useState(false);
  const [regulatoryCountryDraft, setRegulatoryCountryDraft] = useState<string>(regulatoryCountryCode ?? '');
  const [regulatoryCountryMessage, setRegulatoryCountryMessage] = useState<string>();
  const [regulatoryCountryError, setRegulatoryCountryError] = useState<string>();
  const [savingRegulatoryCountry, setSavingRegulatoryCountry] = useState(false);
  const [editingSetting, setEditingSetting] = useState<OrganizationSettingModal>(null);
  const [identityDraft, setIdentityDraft] = useState({
    name: organizationName,
    establishmentType: organizationType ?? '',
  });
  const [identityMessage, setIdentityMessage] = useState<string>();
  const [identityError, setIdentityError] = useState<string>();
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [siteDraft, setSiteDraft] = useState<SiteDraft>({ name: '', description: '', address: '', phone: '', responsibleName: '', responsiblePhone: '', responsibleEmail: '' });
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [siteEditorTitle, setSiteEditorTitle] = useState('Modifier le site');
  const [siteError, setSiteError] = useState<string>();
  const [savingSite, setSavingSite] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(() => {
    return focusApiKeys ? 'api-keys' : 'general';
  });
  const [updateStatus, setUpdateStatus] = useState<SystemUpdateStatus | null>(null);
  const [updateOperation, setUpdateOperation] = useState<SystemUpdateOperation | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateApplying, setUpdateApplying] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showUpdateProgressModal, setShowUpdateProgressModal] = useState(false);

  useEffect(() => {
    setApiKeyConfigured(initialConfigured);
    setApiKeyMasked(initialMasked);
  }, [initialConfigured, initialMasked]);

  useEffect(() => {
    setGithubTokenConfigured(initialGithubConfigured);
    setGithubTokenMasked(initialGithubMasked);
  }, [initialGithubConfigured, initialGithubMasked]);

  useEffect(() => {
    setRemoteAccess({
      enabled: Boolean(initialRemoteAccess?.enabled),
      tailscaleHostname: initialRemoteAccess?.tailscaleHostname ?? 'toquehub',
      tailscaleUrl: initialRemoteAccess?.tailscaleUrl ?? '',
      tailscaleIp: initialRemoteAccess?.tailscaleIp ?? '',
      updatedAt: initialRemoteAccess?.updatedAt ?? null,
    });
  }, [initialRemoteAccess?.enabled, initialRemoteAccess?.tailscaleHostname, initialRemoteAccess?.tailscaleUrl, initialRemoteAccess?.tailscaleIp, initialRemoteAccess?.updatedAt]);

  useEffect(() => {
    setRegulatoryCountryDraft(regulatoryCountryCode ?? '');
  }, [regulatoryCountryCode]);

  useEffect(() => {
    setIdentityDraft({
      name: organizationName,
      establishmentType: organizationType ?? '',
    });
  }, [organizationName, organizationType]);

  useEffect(() => {
    if (focusApiKeys) {
      setActiveSubTab('api-keys');
    }
  }, [focusApiKeys]);

  useEffect(() => {
    if (activeSubTab === 'updates' && isAdmin && !updateStatus && !updateLoading) {
      void loadUpdateStatus(false);
    }
  }, [activeSubTab, isAdmin, updateStatus, updateLoading]);

  useEffect(() => {
    if (activeSubTab === 'remote-access' && isAdmin && !remoteStatus && !remoteStatusLoading) {
      void loadRemoteAccessStatus();
    }
  }, [activeSubTab, isAdmin, remoteStatus, remoteStatusLoading]);

  useEffect(() => {
    if (!updateOperation || !['queued', 'running', 'rollback'].includes(updateOperation.status)) return;
    const interval = window.setInterval(async () => {
      try {
        const next = await api.systemUpdateOperation(token, updateOperation.id);
        setUpdateOperation(next);
        if (!['queued', 'running', 'rollback'].includes(next.status)) {
          const refreshed = await api.systemUpdateStatus(token);
          setUpdateStatus(refreshed);
        }
      } catch (err) {
        setUpdateError(err instanceof Error ? err.message : 'Impossible de suivre la mise à jour.');
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [token, updateOperation?.id, updateOperation?.status]);

  async function loadUpdateStatus(force: boolean) {
    setUpdateLoading(true);
    setUpdateError(null);
    try {
      const status = force ? await api.systemUpdateCheck(token) : await api.systemUpdateStatus(token);
      setUpdateStatus(status);
      setUpdateOperation(status.runtime.lastOperation);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Impossible de vérifier les mises à jour.');
    } finally {
      setUpdateLoading(false);
    }
  }

  async function applySystemUpdate() {
    setShowUpdateProgressModal(true);
    setUpdateApplying(true);
    setUpdateError(null);
    try {
      const result = await api.systemUpdateApply(token);
      if (result.operation) setUpdateOperation(result.operation);
      if (result.status) setUpdateStatus(result.status);
      if (result.skipped && result.message) setUpdateError(result.message);
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Impossible de lancer la mise à jour.');
    } finally {
      setUpdateApplying(false);
    }
  }

  async function loadRemoteAccessStatus() {
    setRemoteStatusLoading(true);
    setRemoteAccessError(undefined);
    try {
      const status = await api.remoteAccessStatus(token);
      setRemoteStatus(status);
      setRemoteAccessMessage(status.message);
    } catch (err) {
      setRemoteStatus(null);
      setRemoteAccessError(err instanceof Error ? err.message : 'Impossible de lire l’accès à distance.');
    } finally {
      setRemoteStatusLoading(false);
    }
  }

  async function activateRemoteAccess() {
    setRemoteAccessBusy(true);
    setRemoteAccessError(undefined);
    setRemoteAccessMessage(undefined);
    try {
      const status = await api.activateRemoteAccess(token);
      setRemoteStatus(status);
      setRemoteAccessMessage(status.message);
      onSettingsSaved?.();
    } catch (err) {
      setRemoteAccessError(err instanceof Error ? err.message : 'Impossible d’activer l’accès à distance.');
    } finally {
      setRemoteAccessBusy(false);
    }
  }

  async function refreshRemoteAccess() {
    setRemoteAccessBusy(true);
    setRemoteAccessError(undefined);
    setRemoteAccessMessage(undefined);
    try {
      const status = await api.refreshRemoteAccess(token);
      setRemoteStatus(status);
      setRemoteAccessMessage(status.message);
      onSettingsSaved?.();
    } catch (err) {
      setRemoteAccessError(err instanceof Error ? err.message : 'Impossible de rafraîchir l’accès à distance.');
    } finally {
      setRemoteAccessBusy(false);
    }
  }

  async function saveApiKey() {
    setSavingApiKey(true);
    setApiKeyError(undefined);
    setApiKeyMessage(undefined);
    try {
      const saved = await api.updateOrganizationApiKeys(token, { mistralApiKey: mistralKey.trim() || (apiKeyConfigured ? '' : undefined) });
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

  async function saveGithubToken() {
    setSavingGithubToken(true);
    setGithubTokenError(undefined);
    setGithubTokenMessage(undefined);
    try {
      const saved = await api.updateOrganizationApiKeys(token, { githubToken: githubToken.trim() || (githubTokenConfigured ? '' : undefined) });
      setGithubTokenConfigured(Boolean(saved?.github?.configured));
      setGithubTokenMasked(saved?.github?.masked);
      setGithubToken('');
      setGithubTokenMessage(saved?.github?.configured ? 'Token GitHub enregistré. Vérification des releases en cours...' : 'Token GitHub supprimé.');
      if (saved?.github?.configured) {
        const status = await api.systemUpdateCheck(token);
        setUpdateStatus(status);
        setUpdateOperation(status.runtime.lastOperation);
        setGithubTokenMessage(status.github.error ? `Token enregistré, mais GitHub répond encore : ${status.github.error}` : 'Token GitHub enregistré. Releases et changelog accessibles.');
      }
      onSettingsSaved?.();
    } catch (err) {
      setGithubTokenError(err instanceof Error ? err.message : 'Impossible d’enregistrer le token GitHub.');
    } finally {
      setSavingGithubToken(false);
    }
  }

  async function saveOrganizationIdentity() {
    setSavingIdentity(true);
    setIdentityError(undefined);
    setIdentityMessage(undefined);
    try {
      const payload: { name?: string; establishmentType?: string | null } = {};
      if (editingSetting === 'name') {
        if (!identityDraft.name.trim()) {
          setIdentityError('Le nom de l’établissement est requis.');
          return;
        }
        payload.name = identityDraft.name.trim();
      }
      if (editingSetting === 'establishmentType') payload.establishmentType = identityDraft.establishmentType || null;
      await api.updateOrganizationIdentity(token, payload);
      setIdentityMessage('Réglage enregistré.');
      setEditingSetting(null);
      onSettingsSaved?.();
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : 'Impossible d’enregistrer ce réglage.');
    } finally {
      setSavingIdentity(false);
    }
  }

  function siteToDraft(site?: Site | null): SiteDraft {
    return {
      name: site?.name ?? '',
      description: site?.description ?? '',
      address: site?.address ?? '',
      phone: site?.phone ?? '',
      responsibleName: site?.responsibleName ?? '',
      responsiblePhone: site?.responsiblePhone ?? '',
      responsibleEmail: site?.responsibleEmail ?? '',
    };
  }

  function openSiteForm(site: Site | null, title: string) {
    setEditingSiteId(site?.id ?? null);
    setSiteDraft(siteToDraft(site));
    setSiteEditorTitle(title);
    setSiteError(undefined);
    setEditingSetting('siteForm');
  }

  async function saveSite() {
    if (!siteDraft.name.trim()) {
      setSiteError('Le nom du site est requis.');
      return;
    }
    setSavingSite(true);
    setSiteError(undefined);
    try {
      const payload = {
        name: siteDraft.name.trim(),
        description: siteDraft.description.trim() || undefined,
        address: siteDraft.address.trim() || undefined,
        phone: siteDraft.phone.trim() || undefined,
        responsibleName: siteDraft.responsibleName.trim() || undefined,
        responsiblePhone: siteDraft.responsiblePhone.trim() || undefined,
        responsibleEmail: siteDraft.responsibleEmail.trim() || undefined,
      };
      if (editingSiteId) await api.updateSite(token, editingSiteId, payload);
      else await api.createSite(token, payload);
      setIdentityMessage('Site enregistré.');
      setEditingSetting(null);
      onSettingsSaved?.();
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : 'Impossible d’enregistrer ce site.');
    } finally {
      setSavingSite(false);
    }
  }

  async function saveRegulatoryCountry(closeOnSuccess = false) {
    const next = regulatoryCountryDraft || null;
    if (regulatoryCountryCode && next && next !== regulatoryCountryCode) {
      const confirmed = window.confirm('Changer le pays RH peut modifier le type de solde conges utilise pour les prochains calculs.');
      if (!confirmed) return;
    }
    setSavingRegulatoryCountry(true);
    setRegulatoryCountryError(undefined);
    setRegulatoryCountryMessage(undefined);
    try {
      await api.updateOrganizationRegulatoryCountry(token, { regulatoryCountryCode: next as 'FR' | 'FI' | null });
      setRegulatoryCountryMessage(next ? `Pays RH enregistre : ${countryLabel(next)}.` : 'Pays RH reinitialise.');
      if (closeOnSuccess) setEditingSetting(null);
      onSettingsSaved?.();
    } catch (err) {
      setRegulatoryCountryError(err instanceof Error ? err.message : 'Impossible d enregistrer le pays RH.');
    } finally {
      setSavingRegulatoryCountry(false);
    }
  }
  const effectiveRemoteStatus = remoteStatus?.status ?? (remoteAccess.enabled && remoteAccess.tailscaleUrl ? 'active' : 'inactive');
  const remoteAccessUrl = remoteStatus?.url || remoteAccess.tailscaleUrl || '';
  const remoteLoginUrl = remoteStatus?.loginUrl || null;
  const remoteStatusLabel = effectiveRemoteStatus === 'active' ? 'Actif' : effectiveRemoteStatus === 'needs_login' ? 'Connexion requise' : effectiveRemoteStatus === 'unavailable' ? 'Agent indisponible' : 'Non activé';
  const remoteStatusBadge = effectiveRemoteStatus === 'active' ? 'badge-reception' : 'badge-correction';

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
            ...(isAdmin ? [{ id: 'backups' as const, label: 'Sauvegarde & Restauration', desc: 'Archives et reprise', icon: Archive }] : []),
            ...(isAdmin ? [{ id: 'updates' as const, label: 'Version et mise à jour', desc: 'Releases et Docker', icon: Download }] : []),
            ...(isAdmin ? [{ id: 'remote-access' as const, label: 'Accès à distance', desc: 'Tailscale privé', icon: Wifi }] : []),
            { id: 'users' as const, label: 'Utilisateurs & Accès', desc: 'Comptes et permissions', icon: UsersRound },
            ...(isAdmin ? [{ id: 'architecture' as const, label: 'Architecture', desc: 'Modules et dépendances', icon: Workflow }] : []),
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
                  <div role="button" tabIndex={0} className="info-card-premium" onClick={() => setEditingSetting('name')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setEditingSetting('name'); }} style={{ cursor: 'pointer' }}>
                    <div className="info-card-premium-header">
                      <span className="info-card-premium-label">Nom Établissement</span>
                      <span className="info-card-premium-icon"><Building2 size={16} /></span>
                    </div>
                    <div className="info-card-premium-value">
                      {organizationName}
                    </div>
                  </div>

                  <div role="button" tabIndex={0} className="info-card-premium" onClick={() => setEditingSetting('establishmentType')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setEditingSetting('establishmentType'); }} style={{ cursor: 'pointer' }}>
                    <div className="info-card-premium-header">
                      <span className="info-card-premium-label">Secteur / Type</span>
                      <span className="info-card-premium-icon"><BriefcaseBusiness size={16} /></span>
                    </div>
                    <div className="info-card-premium-value">
                      {organizationType ?? 'Non renseigné'}
                    </div>
                  </div>

                  <div className="info-card-premium">
                    <div className="info-card-premium-header">
                      <span className="info-card-premium-label">Taille de l'équipe</span>
                      <span className="info-card-premium-icon"><UsersRound size={16} /></span>
                    </div>
                    <div className="info-card-premium-value">
                      {teamSizeDisplay}
                    </div>
                    <span className="badge badge-reception" style={{ width: 'fit-content', marginTop: '0.65rem' }}>
                      {teamSizeMeta}
                    </span>
                  </div>

                  <div role="button" tabIndex={0} className="info-card-premium" onClick={() => openSiteForm(primarySite, 'Modifier le site principal')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openSiteForm(primarySite, 'Modifier le site principal'); }} style={{ cursor: 'pointer' }}>
                    <div className="info-card-premium-header">
                      <span className="info-card-premium-label">Site principal</span>
                      <span className="info-card-premium-icon"><MapPin size={16} /></span>
                    </div>
                    <div className="info-card-premium-value">
                      {primarySite?.name ?? organization?.mainSiteName ?? session.user.mainSiteName ?? 'Site principal'}
                    </div>
                    {primarySite?.address ? <span className="muted" style={{ marginTop: '0.45rem', fontSize: '0.8rem' }}>{primarySite.address}</span> : null}
                  </div>

                  <div role="button" tabIndex={0} className="info-card-premium" onClick={() => setEditingSetting('secondarySites')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setEditingSetting('secondarySites'); }} style={{ cursor: 'pointer' }}>
                    <div className="info-card-premium-header">
                      <span className="info-card-premium-label">Sites secondaires</span>
                      <span className="info-card-premium-icon"><Warehouse size={16} /></span>
                    </div>
                    <div className="info-card-premium-value">
                      {secondarySites.length ? `${secondarySites.length} site${secondarySites.length > 1 ? 's' : ''}` : 'Aucun'}
                    </div>
                    {secondarySites.length ? <span className="muted" style={{ marginTop: '0.45rem', fontSize: '0.8rem' }}>{secondarySites.slice(0, 3).map((site) => site.name).join(', ')}{secondarySites.length > 3 ? '...' : ''}</span> : null}
                  </div>

                  <div role="button" tabIndex={0} className="info-card-premium" onClick={() => setEditingSetting('regulatoryCountry')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setEditingSetting('regulatoryCountry'); }} style={{ cursor: 'pointer' }}>
                    <div className="info-card-premium-header">
                      <span className="info-card-premium-label">Pays RH</span>
                      <span className="info-card-premium-icon"><Scale size={16} /></span>
                    </div>
                    <div className="info-card-premium-value">
                      {countryLabel(regulatoryCountryCode)}
                    </div>
                    <span className={`badge ${regulatoryCountryCode ? 'badge-reception' : 'badge-correction'}`} style={{ width: 'fit-content', marginTop: '0.65rem' }}>
                      {regulatoryCountryCode ? 'Configuré' : 'À configurer'}
                    </span>
                  </div>




                </div>
                {identityMessage ? <div className="alert-modern success" style={{ marginTop: '1rem' }}><CheckCircle2 size={16} /> {identityMessage}</div> : null}
                {regulatoryCountryMessage ? <div className="alert-modern success" style={{ marginTop: '1rem' }}><CheckCircle2 size={16} /> {regulatoryCountryMessage}</div> : null}
              </div>

              <div className="card-modern" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                  <div>
                    <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <History size={18} /> GitHub releases & changelog
                    </span>
                    <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                      Token en lecture seule pour récupérer les mises à jour et les notes de version d’un dépôt privé.
                    </p>
                  </div>
                  <span className={`badge ${githubTokenConfigured ? 'badge-reception' : 'badge-correction'}`}>
                    {githubTokenConfigured ? 'GitHub configuré' : 'Token manquant'}
                  </span>
                </div>

                {githubTokenMasked ? (
                  <div className="alert-modern info" style={{ marginBottom: '1rem', background: '#f8fafc', borderColor: '#dbe4ef', color: '#334155' }}>
                    <ShieldCheck size={16} />
                    <span style={{ fontSize: '0.85rem' }}>Token GitHub actif : <code>{githubTokenMasked}</code></span>
                  </div>
                ) : null}
                {githubTokenError ? <div className="alert-modern error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /> {githubTokenError}</div> : null}
                {githubTokenMessage ? <div className="alert-modern success" style={{ marginBottom: '1rem' }}><CheckCircle2 size={16} /> {githubTokenMessage}</div> : null}

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', marginBottom: '1rem', color: 'var(--text-main)' }}>
                  Fine-grained token GitHub
                  <div className="api-key-input-container">
                    <input
                      type="password"
                      placeholder={githubTokenConfigured ? 'Nouveau token ou laisser vide pour supprimer' : 'github_pat_...'}
                      value={githubToken}
                      onChange={(event) => setGithubToken(event.target.value)}
                    />
                  </div>
                </label>

                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={() => void saveGithubToken()} disabled={savingGithubToken} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.5rem', borderRadius: '10px' }}>
                    {savingGithubToken ? 'Vérification…' : githubTokenConfigured && !githubToken.trim() ? 'Supprimer le token' : 'Sauvegarder et tester'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => { setActiveSubTab('updates'); void loadUpdateStatus(true); }} disabled={updateLoading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1rem', borderRadius: '10px' }}>
                    <RotateCw size={15} className={updateLoading ? 'spin' : undefined} />
                    Vérifier les mises à jour
                  </button>
                </div>
                <p className="muted" style={{ fontSize: '0.78rem', margin: '0.85rem 0 0 0' }}>
                  Permission GitHub recommandée : accès au dépôt privé avec <strong>Contents: Read-only</strong>. Le token est stocké côté serveur et n’est jamais réaffiché en clair.
                </p>
              </div>

              <div className="card-modern" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(59,130,246,0.04) 100%)', border: '1px solid rgba(16,185,129,0.1)' }}>
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}><ChefHat size={18} /> Plateforme modulaire</span>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, fontSize: '0.88rem', margin: 0 }}>
                  L'installation ou la désactivation d'un module modifie uniquement l'interface utilisateur. Tous vos produits, fournisseurs, historiques et configurations de stock restent stockés de manière permanente et sécurisée dans la base locale souveraine.
                </p>
              </div>

            </div>
          )}

          {activeSubTab === 'backups' && isAdmin && (
            <BackupRestorePage token={token} onRestoreComplete={onRestoreComplete} />
          )}

          {activeSubTab === 'updates' && isAdmin && (
            <SystemUpdatePanel
              status={updateStatus}
              operation={updateOperation}
              loading={updateLoading}
              applying={updateApplying}
              error={updateError}
              onCheck={() => void loadUpdateStatus(true)}
              onApply={() => void applySystemUpdate()}
            />
          )}

          {activeSubTab === 'remote-access' && isAdmin && (
            <div className="card-modern" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                <div>
                  <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <Wifi size={18} /> Accès à distance
                  </span>
                  <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                    Accès privé via Tailscale, sans ouverture de port routeur ni exposition publique de ToqueHub.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    aria-label="Afficher le tutoriel accès à distance"
                    title="Tutoriel accès à distance"
                    onClick={() => setShowRemoteHelp((current) => !current)}
                    className="btn btn-secondary"
                    style={{ width: 36, height: 36, minWidth: 36, padding: 0, borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <HelpCircle size={17} />
                  </button>
                  <span className={`badge ${remoteStatusBadge}`}>
                    {remoteStatusLoading ? 'Vérification...' : remoteStatusLabel}
                  </span>
                </div>
              </div>

              {remoteAccessError ? <div className="alert-modern error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /> {remoteAccessError}</div> : null}
              {remoteAccessMessage ? <div className={`alert-modern ${effectiveRemoteStatus === 'active' ? 'success' : 'info'}`} style={{ marginBottom: '1rem', ...(effectiveRemoteStatus === 'active' ? undefined : { background: '#f8fafc', borderColor: '#dbe4ef', color: '#334155' }) }}>
                {effectiveRemoteStatus === 'active' ? <CheckCircle2 size={16} /> : <Info size={16} />}
                {remoteAccessMessage}
              </div> : null}

              {showRemoteHelp ? (
                <div className="alert-modern info" style={{ marginBottom: '1rem', alignItems: 'flex-start', background: '#f8fafc', borderColor: '#dbe4ef', color: '#334155' }}>
                  <Info size={17} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.86rem', lineHeight: 1.55 }}>
                    <strong style={{ color: 'var(--text-main)' }}>Comment activer l’accès hors de chez vous ?</strong>
                    <ol style={{ margin: 0, paddingLeft: '1.1rem' }}>
                      <li>Créez un compte ou connectez-vous sur <a href="https://tailscale.com" target="_blank" rel="noreferrer">tailscale.com</a>.</li>
                      <li>Installez Tailscale sur le téléphone, la tablette ou l’ordinateur qui servira à ouvrir ToqueHub à distance.</li>
                      <li>Cliquez sur <strong>Activer l’accès à distance</strong> dans ToqueHub.</li>
                      <li>Si le bouton <strong>Se connecter à Tailscale</strong> apparaît, ouvrez-le et validez l’ajout de cette machine.</li>
                      <li>Revenez ici, cliquez sur <strong>Rafraîchir</strong>, puis utilisez <strong>Ouvrir l’accès</strong> quand le statut passe à Actif.</li>
                    </ol>
                    <span>Aucun port routeur n’est à ouvrir : l’accès reste privé via votre réseau Tailscale.</span>
                  </div>
                </div>
              ) : null}

              <div style={{ padding: '1.75rem', borderRadius: '18px', border: '1px solid rgba(16,185,129,0.14)', background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' }}>
                <strong style={{ fontSize: '1.2rem', color: 'var(--text-main)' }}>
                  {effectiveRemoteStatus === 'active' ? 'Votre accès distant est prêt' : effectiveRemoteStatus === 'needs_login' ? 'Connexion Tailscale à finaliser' : 'Activer ToqueHub hors de chez vous'}
                </strong>
                <p className="muted" style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                  {effectiveRemoteStatus === 'active'
                    ? 'ToqueHub a détecté l’adresse Tailscale de cette machine. Vous pouvez ouvrir votre environnement depuis votre réseau privé Tailscale.'
                    : effectiveRemoteStatus === 'needs_login'
                      ? 'Tailscale attend que vous validiez cette machine dans votre compte. Ouvrez le lien, connectez-vous, puis revenez rafraîchir.'
                      : 'ToqueHub va préparer Tailscale automatiquement et vous guider uniquement si une connexion au compte Tailscale est nécessaire.'}
                </p>
                {remoteAccessUrl ? <code style={{ padding: '0.65rem 0.85rem', borderRadius: 10, background: 'white', color: '#047857', fontWeight: 800, wordBreak: 'break-all' }}>{remoteAccessUrl}</code> : null}
                {remoteLoginUrl ? <a className="btn btn-primary" href={remoteLoginUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', borderRadius: '12px' }}><ExternalLink size={16} /> Se connecter à Tailscale</a> : null}
              </div>

              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '1rem' }}>
                {effectiveRemoteStatus !== 'active' ? (
                  <button className="btn btn-primary" onClick={() => void activateRemoteAccess()} disabled={remoteAccessBusy || remoteStatusLoading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: '12px' }}>
                    <Wifi size={16} /> {remoteAccessBusy ? 'Activation...' : 'Activer l’accès à distance'}
                  </button>
                ) : null}
                {remoteAccessUrl ? (
                  <a className="btn btn-primary" href={remoteAccessUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: '12px' }}>
                    <ExternalLink size={15} /> Ouvrir l’accès
                  </a>
                ) : null}
                <button className="btn btn-secondary" onClick={() => void refreshRemoteAccess()} disabled={remoteAccessBusy || remoteStatusLoading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '12px' }}>
                  <RotateCw size={15} className={remoteStatusLoading ? 'spin' : undefined} /> Rafraîchir
                </button>
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

          {activeSubTab === 'architecture' && isAdmin && (
            <ArchitectureCenter session={session} />
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

      <SystemUpdateProgressModal
        isOpen={showUpdateProgressModal}
        status={updateStatus}
        operation={updateOperation}
        applying={updateApplying}
        error={updateError}
        onClose={() => setShowUpdateProgressModal(false)}
      />

      <Modal
        isOpen={editingSetting !== null}
        onClose={() => {
          setEditingSetting(null);
          setIdentityError(undefined);
          setRegulatoryCountryError(undefined);
          setSiteError(undefined);
        }}
        title={
          editingSetting === 'name' ? 'Modifier le nom de l’établissement'
            : editingSetting === 'establishmentType' ? 'Modifier le type d’établissement'
              : editingSetting === 'regulatoryCountry' ? 'Modifier le pays RH'
                : editingSetting === 'secondarySites' ? 'Sites secondaires'
                  : editingSetting === 'siteForm' ? siteEditorTitle : 'Modifier le reglage'
        }
      >
        {editingSetting === 'name' ? (
          <form onSubmit={(event) => { event.preventDefault(); void saveOrganizationIdentity(); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {identityError ? <div className="alert-modern error"><AlertCircle size={16} /> {identityError}</div> : null}
            <label>Nom de l’établissement
              <input value={identityDraft.name} onChange={(event) => setIdentityDraft((current) => ({ ...current, name: event.target.value }))} autoFocus />
            </label>
            <div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingSetting(null)}>Annuler</button>
              <button className="btn btn-primary" disabled={savingIdentity || !identityDraft.name.trim()}>{savingIdentity ? 'Enregistrement...' : 'Enregistrer'}</button>
            </div>
          </form>
        ) : null}

        {editingSetting === 'establishmentType' ? (
          <form onSubmit={(event) => { event.preventDefault(); void saveOrganizationIdentity(); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {identityError ? <div className="alert-modern error"><AlertCircle size={16} /> {identityError}</div> : null}
            <label>Type d’établissement
              <select value={identityDraft.establishmentType} onChange={(event) => setIdentityDraft((current) => ({ ...current, establishmentType: event.target.value }))} autoFocus>
                <option value="">Non renseigné</option>
                {establishmentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingSetting(null)}>Annuler</button>
              <button className="btn btn-primary" disabled={savingIdentity}>{savingIdentity ? 'Enregistrement...' : 'Enregistrer'}</button>
            </div>
          </form>
        ) : null}

        {editingSetting === 'regulatoryCountry' ? (
          <form onSubmit={(event) => { event.preventDefault(); void saveRegulatoryCountry(true); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {regulatoryCountryError ? <div className="alert-modern error"><AlertCircle size={16} /> {regulatoryCountryError}</div> : null}
            <label>Pays RH
              <select value={regulatoryCountryDraft} disabled={savingRegulatoryCountry} onChange={(event) => setRegulatoryCountryDraft(event.target.value)} autoFocus>
                <option value="">Non sélectionné</option>
                <option value="FR">France</option>
                <option value="FI">Finlande</option>
              </select>
            </label>
            <p className="muted" style={{ margin: 0 }}>Ce pays determine le solde simple utilise : conges payes en France, conges annuels en Finlande.</p>
            <div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingSetting(null)}>Annuler</button>
              <button className="btn btn-primary" disabled={savingRegulatoryCountry || regulatoryCountryDraft === (regulatoryCountryCode ?? '')}>{savingRegulatoryCountry ? 'Enregistrement...' : 'Enregistrer'}</button>
            </div>
          </form>
        ) : null}

        {editingSetting === 'secondarySites' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="settings-list">
              {secondarySites.map((site) => (
                <div key={site.id} className="planning-settings-item">
                  <div>
                    <strong>{site.name}</strong>
                    <span>{site.address || site.phone || site.responsibleName ? [site.address, site.phone, site.responsibleName].filter(Boolean).join(' · ') : 'Coordonnées à compléter'}</span>
                  </div>
                  <button type="button" className="btn btn-secondary btn-compact" onClick={() => openSiteForm(site, 'Modifier le site secondaire')}>Modifier</button>
                </div>
              ))}
              {!secondarySites.length ? <p className="muted" style={{ margin: 0 }}>Aucun site secondaire configuré.</p> : null}
            </div>
            <div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingSetting(null)}>Fermer</button>
              <button type="button" className="btn btn-primary" onClick={() => openSiteForm(null, 'Ajouter un site secondaire')}>Ajouter un site</button>
            </div>
          </div>
        ) : null}

        {editingSetting === 'siteForm' ? (
          <form onSubmit={(event) => { event.preventDefault(); void saveSite(); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {siteError ? <div className="alert-modern error"><AlertCircle size={16} /> {siteError}</div> : null}
            <label>Nom du site
              <input value={siteDraft.name} onChange={(event) => setSiteDraft((current) => ({ ...current, name: event.target.value }))} autoFocus />
            </label>
            <label>Adresse
              <textarea rows={2} value={siteDraft.address} onChange={(event) => setSiteDraft((current) => ({ ...current, address: event.target.value }))} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <label>Téléphone
                <input value={siteDraft.phone} onChange={(event) => setSiteDraft((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              <label>Responsable
                <input value={siteDraft.responsibleName} onChange={(event) => setSiteDraft((current) => ({ ...current, responsibleName: event.target.value }))} />
              </label>
              <label>Téléphone responsable
                <input value={siteDraft.responsiblePhone} onChange={(event) => setSiteDraft((current) => ({ ...current, responsiblePhone: event.target.value }))} />
              </label>
              <label>Email responsable
                <input type="email" value={siteDraft.responsibleEmail} onChange={(event) => setSiteDraft((current) => ({ ...current, responsibleEmail: event.target.value }))} />
              </label>
            </div>
            <label>Description
              <textarea rows={2} value={siteDraft.description} onChange={(event) => setSiteDraft((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingSetting(null)}>Annuler</button>
              <button className="btn btn-primary" disabled={savingSite || !siteDraft.name.trim()}>{savingSite ? 'Enregistrement...' : 'Enregistrer'}</button>
            </div>
          </form>
        ) : null}

      </Modal>
    </div>
  );
}

function countryLabel(code?: string | null) {
  if (code === 'FR') return 'France';
  if (code === 'FI') return 'Finlande';
  return 'Non sélectionné';
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
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'product';
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

function categoryNameKey(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function isUncategorizedCategoryName(name: string) {
  return categoryNameKey(name) === categoryNameKey('Sans catégorie');
}

function sortCategoriesWithUncategorizedLast<T extends { name: string }>(categories: T[]) {
  return [...categories].sort((a, b) => {
    const aIsUncategorized = isUncategorizedCategoryName(a.name);
    const bIsUncategorized = isUncategorizedCategoryName(b.name);
    if (aIsUncategorized === bIsUncategorized) return 0;
    return aIsUncategorized ? 1 : -1;
  });
}

function CategoryDetailModal({
  category,
  products,
  onClose,
  onUpdate,
  onDelete,
  onOpenProducts,
}: {
  category: Category | null;
  products: Product[];
  onClose: () => void;
  onUpdate: (categoryId: string, payload: { name: string; description?: string }) => Promise<void>;
  onDelete: (categoryId: string) => Promise<void>;
  onOpenProducts: (categoryId: string) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const linkedProducts = useMemo(() => products.filter((product) => (product.categoryId ?? product.category?.id) === category?.id), [products, category?.id]);
  const isUncategorized = category ? isUncategorizedCategoryName(category.name) : false;

  useEffect(() => {
    setName(category?.name ?? '');
    setDescription(category?.description ?? '');
    setError(undefined);
  }, [category?.id, category?.name, category?.description]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!category || !name.trim()) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onUpdate(category.id, { name: name.trim(), description: description.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La catégorie n’a pas pu être modifiée.');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!category || isUncategorized) return;
    const confirmed = window.confirm(`Supprimer la catégorie "${category.name}" ? ${linkedProducts.length} produit(s) seront déplacés dans "Sans catégorie".`);
    if (!confirmed) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onDelete(category.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La catégorie n’a pas pu être supprimée.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={Boolean(category)} onClose={onClose} title="Réglage catégorie">
      {category ? (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {error ? <div className="alert-modern error"><AlertCircle size={16} /> {error}</div> : null}
          <div className="alert-modern info" style={{ margin: 0, background: '#f8fafc', borderColor: '#dbe4ef', color: '#334155' }}>
            <Info size={16} />
            <span>{linkedProducts.length} produit(s) actuellement dans cette catégorie.</span>
          </div>
          <label>
            Nom de la catégorie *
            <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
          </label>
          <label>
            Description
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => onOpenProducts(category.id)}>
              <Search size={15} /> Voir les produits
            </button>
            <button type="button" className="btn btn-outline-danger" disabled={submitting || isUncategorized} onClick={() => void remove()} title={isUncategorized ? 'Catégorie système conservée pour les produits non classés' : undefined}>
              <Trash2 size={15} /> Supprimer
            </button>
          </div>
          <div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Fermer</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
              {submitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      ) : null}
    </Modal>
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
type ProductSheetTab = 'identity' | 'supplier' | 'stock' | 'packaging' | 'allergens' | 'nutrition' | 'storage';

const PRODUCT_SHEET_TABS: Array<{ id: ProductSheetTab; label: string }> = [
  { id: 'identity', label: 'Identité' },
  { id: 'supplier', label: 'Fournisseur' },
  { id: 'stock', label: 'Stock' },
  { id: 'packaging', label: 'Conditionnement' },
  { id: 'allergens', label: 'Allergènes' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'storage', label: 'Conservation' },
];

const PRODUCT_ALLERGEN_OPTIONS = [
  'Gluten',
  'Blé',
  'Seigle',
  'Orge',
  'Avoine',
  'Épeautre',
  'Kamut',
  'Lait',
  'Œuf',
  'Poisson',
  'Crustacés',
  'Mollusques',
  'Fruits à coque',
  'Amande',
  'Noisette',
  'Noix',
  'Noix de cajou',
  'Noix de pécan',
  'Noix du Brésil',
  'Pistache',
  'Macadamia',
  'Arachide',
  'Soja',
  'Sésame',
  'Céleri',
  'Moutarde',
  'Lupin',
  'Sulfites',
];

const PRODUCT_DIETARY_TAG_OPTIONS = ['Sans gluten', 'Sans lactose', 'Sans lait', 'Sans œuf', 'Sans fruits à coque', 'Vegan', 'Végétarien', 'Surgelé', 'Bio'];
const PRODUCT_STORAGE_OPTIONS = ['Température ambiante', 'Réfrigéré', 'Surgelé', 'Sec', 'Autre'];

type ProductNutritionField = 'energyKj' | 'energyKcal' | 'fatGrams' | 'saturatedFatGrams' | 'carbohydratesGrams' | 'sugarsGrams' | 'fiberGrams' | 'proteinGrams' | 'saltGrams';

const PRODUCT_NUTRITION_FIELDS: Array<{ key: ProductNutritionField; label: string; unit: string }> = [
  { key: 'energyKj', label: 'Énergie kJ', unit: 'kJ' },
  { key: 'energyKcal', label: 'Énergie kcal', unit: 'kcal' },
  { key: 'fatGrams', label: 'Matières grasses', unit: 'g' },
  { key: 'saturatedFatGrams', label: 'Dont saturées', unit: 'g' },
  { key: 'carbohydratesGrams', label: 'Glucides', unit: 'g' },
  { key: 'sugarsGrams', label: 'Dont sucres', unit: 'g' },
  { key: 'fiberGrams', label: 'Fibres', unit: 'g' },
  { key: 'proteinGrams', label: 'Protéines', unit: 'g' },
  { key: 'saltGrams', label: 'Sel', unit: 'g' },
];

type ProductFormPayload = {
  name: string;
  sku?: string | null;
  description?: string | null;
  unitId: string;
  categoryId?: string | null;
  primarySupplierId?: string | null;
  averagePrice?: number;
  minimumStock?: number;
  gtin?: string | null;
  originCountry?: string | null;
  packageLabel?: string | null;
  unitsPerPackage?: number | null;
  unitWeightGrams?: number | null;
  netWeightGrams?: number | null;
  ingredients?: string | null;
  allergensPresent?: string[];
  possibleTraces?: string[];
  dietaryTags?: string[];
  energyKj?: number | null;
  energyKcal?: number | null;
  fatGrams?: number | null;
  saturatedFatGrams?: number | null;
  carbohydratesGrams?: number | null;
  sugarsGrams?: number | null;
  fiberGrams?: number | null;
  proteinGrams?: number | null;
  saltGrams?: number | null;
  storageType?: string | null;
  shelfLifeAfterOpening?: string | null;
  storageInstructions?: string | null;
  preparationInstructions?: string | null;
};

interface ProductFormProps {
  categories: Category[];
  units: Unit[];
  suppliers: Supplier[];
  initialName?: string;
  initialProduct?: Product | null;
  currentQuantity?: number | null;
  submitLabel?: string;
  onSubmit: (payload: ProductFormPayload) => Promise<void>;
  onClose: () => void;
}

function productFieldString(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function productNullableText(value: string, clearWhenEmpty: boolean) {
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  return clearWhenEmpty ? null : undefined;
}

function productOptionalNumber(value: string) {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function productNullableNumber(value: string, clearWhenEmpty: boolean) {
  if (value.trim() === '') return clearWhenEmpty ? null : undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function initialNutritionState(product?: Product | null) {
  return PRODUCT_NUTRITION_FIELDS.reduce((acc, field) => {
    acc[field.key] = productFieldString(product?.[field.key]);
    return acc;
  }, {} as Record<ProductNutritionField, string>);
}

function toggleProductValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function ProductForm({ categories, units, suppliers, initialName = '', initialProduct = null, currentQuantity = null, submitLabel, onSubmit, onClose }: ProductFormProps) {
  const [activeFormTab, setActiveFormTab] = useState<ProductSheetTab>('identity');
  const [name, setName] = useState(initialProduct?.name ?? initialName);
  const [sku, setSku] = useState(initialProduct?.sku ?? initialProduct?.reference ?? '');
  const [description, setDescription] = useState(initialProduct?.description ?? '');
  const [unitId, setUnitId] = useState(initialProduct?.unitId || units[0]?.id || '');
  const [categoryId, setCategoryId] = useState(initialProduct?.categoryId ?? initialProduct?.category?.id ?? '');
  const [supplierId, setSupplierId] = useState(initialProduct?.primarySupplierId ?? initialProduct?.supplierId ?? initialProduct?.primarySupplier?.id ?? initialProduct?.supplier?.id ?? '');
  const [averagePrice, setAveragePrice] = useState(String(initialProduct ? numeric(initialProduct.averagePrice ?? initialProduct.averagePurchasePrice ?? initialProduct.weightedAveragePrice) || '' : ''));
  const [minimumStock, setMinimumStock] = useState(String(initialProduct ? numeric(initialProduct.minimumStock ?? initialProduct.minStock) || '' : ''));
  const [gtin, setGtin] = useState(initialProduct?.gtin ?? '');
  const [originCountry, setOriginCountry] = useState(initialProduct?.originCountry ?? '');
  const [packageLabel, setPackageLabel] = useState(initialProduct?.packageLabel ?? '');
  const [unitsPerPackage, setUnitsPerPackage] = useState(productFieldString(initialProduct?.unitsPerPackage));
  const [unitWeightGrams, setUnitWeightGrams] = useState(productFieldString(initialProduct?.unitWeightGrams));
  const [netWeightGrams, setNetWeightGrams] = useState(productFieldString(initialProduct?.netWeightGrams));
  const [ingredients, setIngredients] = useState(initialProduct?.ingredients ?? '');
  const [allergensPresent, setAllergensPresent] = useState<string[]>(initialProduct?.allergensPresent ?? []);
  const [possibleTraces, setPossibleTraces] = useState<string[]>(initialProduct?.possibleTraces ?? []);
  const [dietaryTags, setDietaryTags] = useState<string[]>(initialProduct?.dietaryTags ?? []);
  const [nutrition, setNutrition] = useState<Record<ProductNutritionField, string>>(() => initialNutritionState(initialProduct));
  const [storageType, setStorageType] = useState(initialProduct?.storageType ?? '');
  const [shelfLifeAfterOpening, setShelfLifeAfterOpening] = useState(initialProduct?.shelfLifeAfterOpening ?? '');
  const [storageInstructions, setStorageInstructions] = useState(initialProduct?.storageInstructions ?? '');
  const [preparationInstructions, setPreparationInstructions] = useState(initialProduct?.preparationInstructions ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setActiveFormTab('identity');
    setName(initialProduct?.name ?? initialName);
    setSku(initialProduct?.sku ?? initialProduct?.reference ?? '');
    setDescription(initialProduct?.description ?? '');
    setUnitId(initialProduct?.unitId || units[0]?.id || '');
    setCategoryId(initialProduct?.categoryId ?? initialProduct?.category?.id ?? '');
    setSupplierId(initialProduct?.primarySupplierId ?? initialProduct?.supplierId ?? initialProduct?.primarySupplier?.id ?? initialProduct?.supplier?.id ?? '');
    setAveragePrice(String(initialProduct ? numeric(initialProduct.averagePrice ?? initialProduct.averagePurchasePrice ?? initialProduct.weightedAveragePrice) || '' : ''));
    setMinimumStock(String(initialProduct ? numeric(initialProduct.minimumStock ?? initialProduct.minStock) || '' : ''));
    setGtin(initialProduct?.gtin ?? '');
    setOriginCountry(initialProduct?.originCountry ?? '');
    setPackageLabel(initialProduct?.packageLabel ?? '');
    setUnitsPerPackage(productFieldString(initialProduct?.unitsPerPackage));
    setUnitWeightGrams(productFieldString(initialProduct?.unitWeightGrams));
    setNetWeightGrams(productFieldString(initialProduct?.netWeightGrams));
    setIngredients(initialProduct?.ingredients ?? '');
    setAllergensPresent(initialProduct?.allergensPresent ?? []);
    setPossibleTraces(initialProduct?.possibleTraces ?? []);
    setDietaryTags(initialProduct?.dietaryTags ?? []);
    setNutrition(initialNutritionState(initialProduct));
    setStorageType(initialProduct?.storageType ?? '');
    setShelfLifeAfterOpening(initialProduct?.shelfLifeAfterOpening ?? '');
    setStorageInstructions(initialProduct?.storageInstructions ?? '');
    setPreparationInstructions(initialProduct?.preparationInstructions ?? '');
  }, [initialName, initialProduct, units]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !unitId) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const clearWhenEmpty = Boolean(initialProduct);
      const nutritionPayload = {} as Record<ProductNutritionField, number | null | undefined>;
      PRODUCT_NUTRITION_FIELDS.forEach((field) => {
        const value = productNullableNumber(nutrition[field.key], clearWhenEmpty);
        if (value !== undefined) nutritionPayload[field.key] = value;
      });

      await onSubmit({
        name: name.trim(),
        sku: productNullableText(sku, clearWhenEmpty),
        description: productNullableText(description, clearWhenEmpty),
        unitId,
        categoryId: categoryId || (initialProduct ? null : undefined),
        primarySupplierId: supplierId || (initialProduct ? null : undefined),
        averagePrice: productOptionalNumber(averagePrice),
        minimumStock: productOptionalNumber(minimumStock),
        gtin: productNullableText(gtin, clearWhenEmpty),
        originCountry: productNullableText(originCountry, clearWhenEmpty),
        packageLabel: productNullableText(packageLabel, clearWhenEmpty),
        unitsPerPackage: productNullableNumber(unitsPerPackage, clearWhenEmpty),
        unitWeightGrams: productNullableNumber(unitWeightGrams, clearWhenEmpty),
        netWeightGrams: productNullableNumber(netWeightGrams, clearWhenEmpty),
        ingredients: productNullableText(ingredients, clearWhenEmpty),
        allergensPresent,
        possibleTraces,
        dietaryTags,
        ...nutritionPayload,
        storageType: productNullableText(storageType, clearWhenEmpty),
        shelfLifeAfterOpening: productNullableText(shelfLifeAfterOpening, clearWhenEmpty),
        storageInstructions: productNullableText(storageInstructions, clearWhenEmpty),
        preparationInstructions: productNullableText(preparationInstructions, clearWhenEmpty),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedUnit = units.find((unit) => unit.id === unitId);
  const computedNetWeight = productOptionalNumber(unitsPerPackage) != null && productOptionalNumber(unitWeightGrams) != null
    ? (productOptionalNumber(unitsPerPackage) ?? 0) * (productOptionalNumber(unitWeightGrams) ?? 0)
    : null;

  return (
    <form onSubmit={handleSubmit} className="product-sheet-form">
      {error && (
        <div className="alert-modern error" style={{ padding: '0.75rem 1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      <div className="product-sheet-form-body">
        <div className="product-sheet-tabs" role="tablist" aria-label="Sections fiche produit">
          {PRODUCT_SHEET_TABS.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={activeFormTab === tab.id} className={activeFormTab === tab.id ? 'active' : ''} onClick={() => setActiveFormTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="product-sheet-form-panel">
        {activeFormTab === 'identity' ? (
          <div className="product-sheet-form-grid">
            <label>
              Nom du produit *
              <input placeholder="ex: Beurre doux, œufs plein air..." value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </label>
            <label>
              GTIN / EAN
              <input placeholder="ex: 6410401234567" value={gtin} onChange={(e) => setGtin(e.target.value)} />
            </label>
            <label>
              Pays d'origine / origine
              <input placeholder="ex: Finlande, France, UE..." value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} />
            </label>
            <label className="product-sheet-wide">
              Description interne
              <textarea rows={3} placeholder="Notes produit, marque, informations utiles..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
        ) : null}

        {activeFormTab === 'supplier' ? (
          <div className="product-sheet-form-grid">
            <label>
              Fournisseur
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Non renseigné</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </label>
            <label>
              Référence fournisseur / SKU
              <input placeholder="ex: KESPRO-12345, FARINE-T55..." value={sku} onChange={(e) => setSku(e.target.value)} />
            </label>
          </div>
        ) : null}

        {activeFormTab === 'stock' ? (
          <div className="product-sheet-form-grid">
            <label>
              Catégorie
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Non catégorisé</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label>
              Unité de stock *
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                <option value="">Choisir l'unité...</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                ))}
              </select>
            </label>
            <label>
              Seuil minimum
              <input type="number" min="0" step="0.001" value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} />
            </label>
            <label>
              Prix d'achat HT
              <input type="number" min="0" step="0.0001" value={averagePrice} onChange={(e) => setAveragePrice(e.target.value)} />
            </label>
            <div className="product-readonly-field product-sheet-wide">
              <span>Quantité actuelle</span>
              <strong>{currentQuantity == null ? 'Calculée depuis les mouvements' : `${currentQuantity.toFixed(3).replace(/\.?0+$/, '')} ${selectedUnit?.symbol ?? ''}`}</strong>
              <small>La quantité se modifie via réceptions, sorties, corrections ou inventaires.</small>
            </div>
          </div>
        ) : null}

        {activeFormTab === 'packaging' ? (
          <div className="product-sheet-form-grid">
            <label>
              Format fournisseur
              <input placeholder="ex: Carton 12 x 1 L, caisse 6 pièces..." value={packageLabel} onChange={(e) => setPackageLabel(e.target.value)} />
            </label>
            <label>
              Quantité contenue par format
              <input type="number" min="0" step="0.001" value={unitsPerPackage} onChange={(e) => setUnitsPerPackage(e.target.value)} />
            </label>
            <label>
              Unité contenue
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                <option value="">Choisir l'unité...</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                ))}
              </select>
            </label>
            <label>
              Poids / volume d'une unité
              <input type="number" min="0" step="0.001" placeholder="En grammes ou millilitres selon l'unité" value={unitWeightGrams} onChange={(e) => setUnitWeightGrams(e.target.value)} />
            </label>
            <label>
              Poids net du format
              <input type="number" min="0" step="0.001" placeholder={computedNetWeight ? `Calculé: ${computedNetWeight.toFixed(3).replace(/\.?0+$/, '')}` : 'Optionnel'} value={netWeightGrams} onChange={(e) => setNetWeightGrams(e.target.value)} />
            </label>
            <div className="product-readonly-field">
              <span>Conversion réception</span>
              <strong>{unitsPerPackage || '0'} x {unitWeightGrams || '0'} = {(computedNetWeight ?? 0).toFixed(3).replace(/\.?0+$/, '')}</strong>
              <small>Quantité reçue fournisseur x unités par format x contenu d'une unité.</small>
            </div>
          </div>
        ) : null}

        {activeFormTab === 'allergens' ? (
          <div className="product-sheet-form-grid">
            <label className="product-sheet-wide">
              Ingrédients
              <textarea rows={4} placeholder="Liste d'ingrédients telle qu'indiquée par le fournisseur..." value={ingredients} onChange={(e) => setIngredients(e.target.value)} />
            </label>
            <div className="product-choice-group product-sheet-wide">
              <span>Allergènes présents</span>
              <div className="product-choice-grid">
                {PRODUCT_ALLERGEN_OPTIONS.map((allergen) => (
                  <button key={allergen} type="button" className={allergensPresent.includes(allergen) ? 'selected' : ''} onClick={() => {
                    setAllergensPresent((current) => toggleProductValue(current, allergen));
                    setPossibleTraces((current) => current.filter((item) => item !== allergen));
                  }}>{allergen}</button>
                ))}
              </div>
            </div>
            <div className="product-choice-group product-sheet-wide">
              <span>Traces possibles</span>
              <div className="product-choice-grid">
                {PRODUCT_ALLERGEN_OPTIONS.map((allergen) => (
                  <button key={allergen} type="button" className={possibleTraces.includes(allergen) ? 'selected' : ''} onClick={() => {
                    setPossibleTraces((current) => toggleProductValue(current, allergen));
                    setAllergensPresent((current) => current.filter((item) => item !== allergen));
                  }}>{allergen}</button>
                ))}
              </div>
            </div>
            <div className="product-choice-group product-sheet-wide">
              <span>Tags alimentaires</span>
              <div className="product-choice-grid compact">
                {PRODUCT_DIETARY_TAG_OPTIONS.map((tag) => (
                  <button key={tag} type="button" className={dietaryTags.includes(tag) ? 'selected' : ''} onClick={() => setDietaryTags((current) => toggleProductValue(current, tag))}>{tag}</button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeFormTab === 'nutrition' ? (
          <div className="product-sheet-form-grid">
            <div className="product-sheet-note product-sheet-wide">Valeurs pour 100 g.</div>
            {PRODUCT_NUTRITION_FIELDS.map((field) => (
              <label key={field.key}>
                {field.label} ({field.unit})
                <input type="number" min="0" step="0.001" value={nutrition[field.key]} onChange={(e) => setNutrition((current) => ({ ...current, [field.key]: e.target.value }))} />
              </label>
            ))}
          </div>
        ) : null}

        {activeFormTab === 'storage' ? (
          <div className="product-sheet-form-grid">
            <label>
              Type de conservation
              <select value={storageType} onChange={(e) => setStorageType(e.target.value)}>
                <option value="">Non renseigné</option>
                {PRODUCT_STORAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Durée après ouverture
              <input placeholder="ex: 3 jours, 48 h, à consommer immédiatement..." value={shelfLifeAfterOpening} onChange={(e) => setShelfLifeAfterOpening(e.target.value)} />
            </label>
            <label className="product-sheet-wide">
              Instructions de conservation
              <textarea rows={4} placeholder="Température, conditions de stockage, précautions après ouverture..." value={storageInstructions} onChange={(e) => setStorageInstructions(e.target.value)} />
            </label>
            <label className="product-sheet-wide">
              Préparation / utilisation
              <textarea rows={4} placeholder="Conseils de préparation, décongélation, utilisation en production..." value={preparationInstructions} onChange={(e) => setPreparationInstructions(e.target.value)} />
            </label>
          </div>
        ) : null}
        </div>
      </div>

      <div className="modal-footer product-sheet-footer">
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

function productHasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function productNumberDisplay(value: string | number | null | undefined, unit = '', maxFractionDigits = 3) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  const formatted = parsed.toLocaleString('fr-FR', { maximumFractionDigits: maxFractionDigits });
  return unit ? `${formatted} ${unit}` : formatted;
}

function productTextDisplay(value?: string | null) {
  return value?.trim() || '—';
}

function productCalculatedNetWeight(product: Product) {
  if (productHasValue(product.netWeightGrams)) return numeric(product.netWeightGrams);
  if (productHasValue(product.unitsPerPackage) && productHasValue(product.unitWeightGrams)) {
    return numeric(product.unitsPerPackage) * numeric(product.unitWeightGrams);
  }
  return null;
}

function computeProductCompletion(product: Product) {
  const supplierId = productSupplierId(product);
  const sectionInputs = [
    { label: 'Identification', values: [product.name, product.gtin, product.originCountry] },
    { label: 'Fournisseur', values: [supplierId, product.sku ?? product.reference] },
    { label: 'Conditionnement', values: [product.packageLabel, product.unitsPerPackage, product.unitWeightGrams ?? product.netWeightGrams] },
    { label: 'Allergènes', values: [product.ingredients, product.allergensPresent, product.possibleTraces, product.dietaryTags] },
    { label: 'Nutrition', values: PRODUCT_NUTRITION_FIELDS.map((field) => product[field.key]) },
    { label: 'Conservation', values: [product.storageType, product.shelfLifeAfterOpening, product.storageInstructions, product.preparationInstructions] },
  ];
  const sections = sectionInputs.map((section) => {
    const completed = section.values.filter(productHasValue).length;
    return { ...section, completed, total: section.values.length, done: completed === section.values.length };
  });
  const completed = sections.reduce((sum, section) => sum + section.completed, 0);
  const total = sections.reduce((sum, section) => sum + section.total, 0);
  return { score: total ? Math.round((completed / total) * 100) : 0, completed, total, sections };
}

function ProductTagBadges({ items, emptyText = 'Non renseigné' }: { items?: string[]; emptyText?: string }) {
  const values = items?.filter(Boolean) ?? [];
  if (!values.length) return <span style={{ color: 'var(--text-muted)' }}>{emptyText}</span>;
  return (
    <div className="product-tag-row">
      {values.map((item) => <span key={item} className="badge badge-reception">{item}</span>)}
    </div>
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
  onDelete,
}: {
  product: Product | null;
  stocks: Stock[];
  movements: StockMovement[];
  categories: Category[];
  units: Unit[];
  suppliers: Supplier[];
  onClose: () => void;
  onUpdate: (productId: string, payload: ProductFormPayload) => Promise<void>;
  onDelete: (productId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [detailTab, setDetailTab] = useState<ProductSheetTab>('identity');

  useEffect(() => {
    setEditing(false);
    setDetailTab('identity');
  }, [product?.id]);

  if (!product) return null;

  const productStocks = stocks.filter((stock) => stock.product?.id === product.id);
  const productMovements = movements.filter((movement) => movement.product?.id === product.id).slice(0, 6);
  const totalQuantity = productStocks.reduce((sum, stock) => sum + numeric(stock.currentQuantity ?? stock.quantity), 0);
  const averagePrice = numeric(product.averagePrice ?? product.averagePurchasePrice ?? product.weightedAveragePrice);
  const stockValue = productStocks.reduce((sum, stock) => sum + numeric(stock.stockValue ?? stock.value ?? numeric(stock.currentQuantity ?? stock.quantity) * averagePrice), 0);
  const minimumStock = numeric(product.minimumStock ?? product.minStock);
  const supplierName = product.primarySupplier?.name ?? product.supplier?.name ?? 'Non renseigné';
  const completion = computeProductCompletion(product);
  const netWeight = productCalculatedNetWeight(product);

  return (
    <Modal isOpen={Boolean(product)} onClose={onClose} title={product.name} size="xl">
      {editing ? (
        <ProductForm
          categories={categories}
          units={units}
          suppliers={suppliers}
          initialProduct={product}
          currentQuantity={totalQuantity}
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
                <span className="badge badge-inventory">{product.sku || 'Sans référence'}</span>
                <span className="badge badge-production">{product.category?.name ?? 'Sans catégorie'}</span>
                <span className="badge badge-reception">{product.unit?.name ?? 'Unité'} ({product.unit?.symbol ?? '—'})</span>
                {product.gtin ? <span className="badge badge-correction">GTIN {product.gtin}</span> : null}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}>
                <Edit3 size={14} /> Modifier
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
                onClick={async () => {
                  if (window.confirm(`Êtes-vous sûr de vouloir supprimer le produit "${product.name}" ?`)) {
                    await onDelete(product.id);
                    onClose();
                  }
                }}
              >
                <Trash2 size={14} /> Supprimer
              </button>
            </div>
          </div>

          <div className="product-detail-metrics">
            <Metric icon={<Boxes size={18} />} value={`${totalQuantity.toFixed(2).replace(/\.?0+$/, '')} ${product.unit?.symbol ?? ''}`} label="Quantité en stock" tone="blue" />
            <Metric icon={<TrendingUp size={18} />} value={`${stockValue.toFixed(2)} €`} label="Valeur stock" tone="emerald" />
            <Metric icon={<Scale size={18} />} value={`${averagePrice.toFixed(2)} €`} label="Prix d'achat HT" tone="amber" />
            <Metric icon={<AlertCircle size={18} />} value={minimumStock ? parseFloat(minimumStock.toFixed(2)).toString() : '—'} label="Seuil minimum" tone="orange" />
          </div>

          <div className="product-detail-completion">
            <div className="progress-bar-header">
              <span>Complétion de la fiche</span>
              <strong>{completion.score}%</strong>
            </div>
            <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${completion.score}%` }} /></div>
            <div className="product-completion-sections">
              {completion.sections.map((section) => (
                <span key={section.label} className={section.done ? 'done' : ''}>{section.label} {section.completed}/{section.total}</span>
              ))}
            </div>
          </div>

          <div className="product-sheet-tabs" role="tablist" aria-label="Sections fiche produit">
            {PRODUCT_SHEET_TABS.map((tab) => (
              <button key={tab.id} type="button" role="tab" aria-selected={detailTab === tab.id} className={detailTab === tab.id ? 'active' : ''} onClick={() => setDetailTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="product-detail-panel product-sheet-read-panel">
            {detailTab === 'identity' ? (
              <>
                <span className="product-detail-section-title">Identification</span>
                <dl className="product-detail-list">
                  <div><dt>Nom du produit</dt><dd>{product.name}</dd></div>
                  <div><dt>GTIN / EAN</dt><dd>{productTextDisplay(product.gtin)}</dd></div>
                  <div><dt>Pays d'origine / origine</dt><dd>{productTextDisplay(product.originCountry)}</dd></div>
                </dl>
                {product.description ? <p className="product-detail-description">{product.description}</p> : <EmptyMini title="Aucune description" text="Ajoutez une note interne si nécessaire." />}
              </>
            ) : null}

            {detailTab === 'supplier' ? (
              <>
                <span className="product-detail-section-title">Fournisseur</span>
                <dl className="product-detail-list">
                  <div><dt>Fournisseur</dt><dd>{supplierName}</dd></div>
                  <div><dt>Référence fournisseur</dt><dd>{productTextDisplay(product.sku ?? product.reference)}</dd></div>
                </dl>
              </>
            ) : null}

            {detailTab === 'stock' ? (
              <div className="product-detail-grid">
                <div>
                  <span className="product-detail-section-title">Stock</span>
                  <dl className="product-detail-list">
                    <div><dt>Catégorie</dt><dd>{product.category?.name ?? 'Non catégorisé'}</dd></div>
                    <div><dt>Unité de stock</dt><dd>{product.unit?.name ?? '—'} ({product.unit?.symbol ?? '—'})</dd></div>
                    <div><dt>Quantité actuelle</dt><dd>{productNumberDisplay(totalQuantity, product.unit?.symbol ?? '')}</dd></div>
                    <div><dt>Seuil minimum</dt><dd>{minimumStock ? productNumberDisplay(minimumStock, product.unit?.symbol ?? '') : '—'}</dd></div>
                    <div><dt>Prix d'achat HT</dt><dd>{averagePrice.toFixed(2)} €</dd></div>
                  </dl>
                </div>
                <div>
                  <span className="product-detail-section-title">Stock par site</span>
                  {productStocks.length ? (
                    <div className="product-detail-mini-table">
                      {productStocks.map((stock) => (
                        <div key={stock.id}>
                          <span>{stock.site?.name ?? 'Site'}</span>
                          <strong>{productNumberDisplay(stock.currentQuantity ?? stock.quantity, product.unit?.symbol ?? '')}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyMini title="Aucun stock" text="Ce produit n'a pas encore de quantité projetée." />
                  )}
                </div>
                <div className="product-sheet-wide">
                  <span className="product-detail-section-title">Derniers mouvements</span>
                  {productMovements.length ? (
                    <div className="product-detail-mini-table">
                      {productMovements.map((movement) => (
                        <div key={movement.id}>
                          <span>{movementLabels[movement.type] ?? movement.type} · {movementEffectiveDate(movement).toLocaleDateString('fr-FR')}</span>
                          <strong>{movementSign(movement.type)}{productNumberDisplay(movement.quantity, product.unit?.symbol ?? '')}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyMini title="Aucun mouvement" text="Les réceptions et sorties apparaîtront ici." />
                  )}
                </div>
              </div>
            ) : null}

            {detailTab === 'packaging' ? (
              <>
                <span className="product-detail-section-title">Conditionnement</span>
                <dl className="product-detail-list">
                  <div><dt>Format fournisseur</dt><dd>{productTextDisplay(product.packageLabel)}</dd></div>
                  <div><dt>Quantité contenue par format</dt><dd>{productNumberDisplay(product.unitsPerPackage)}</dd></div>
                  <div><dt>Unité contenue</dt><dd>{product.unit?.name ?? '—'} ({product.unit?.symbol ?? '—'})</dd></div>
                  <div><dt>Poids / volume d'une unité</dt><dd>{productNumberDisplay(product.unitWeightGrams, 'g/ml')}</dd></div>
                  <div><dt>Poids net du format</dt><dd>{netWeight == null ? '—' : `${productNumberDisplay(netWeight, 'g/ml')}${productHasValue(product.netWeightGrams) ? '' : ' calculé'}`}</dd></div>
                </dl>
                <p className="product-detail-description">Quantité reçue fournisseur x unités par format x contenu d'une unité = quantité ajoutée au stock.</p>
              </>
            ) : null}

            {detailTab === 'allergens' ? (
              <div className="product-allergen-read">
                <div>
                  <span className="product-detail-section-title">Ingrédients</span>
                  <p className="product-detail-description">{product.ingredients || 'Non renseigné'}</p>
                </div>
                <div>
                  <span className="product-detail-section-title">Allergènes présents</span>
                  <ProductTagBadges items={product.allergensPresent} />
                </div>
                <div>
                  <span className="product-detail-section-title">Traces possibles</span>
                  <ProductTagBadges items={product.possibleTraces} emptyText="Aucune trace renseignée" />
                </div>
                <div>
                  <span className="product-detail-section-title">Tags alimentaires</span>
                  <ProductTagBadges items={product.dietaryTags} emptyText="Aucun tag renseigné" />
                </div>
              </div>
            ) : null}

            {detailTab === 'nutrition' ? (
              <>
                <span className="product-detail-section-title">Valeurs pour 100 g</span>
                <dl className="product-detail-list product-nutrition-list">
                  {PRODUCT_NUTRITION_FIELDS.map((field) => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>{productNumberDisplay(product[field.key], field.unit)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}

            {detailTab === 'storage' ? (
              <>
                <span className="product-detail-section-title">Stockage et utilisation</span>
                <dl className="product-detail-list">
                  <div><dt>Type de conservation</dt><dd>{productTextDisplay(product.storageType)}</dd></div>
                  <div><dt>Durée après ouverture</dt><dd>{productTextDisplay(product.shelfLifeAfterOpening)}</dd></div>
                </dl>
                <div className="product-storage-copy">
                  <div>
                    <span className="product-detail-section-title">Instructions de conservation</span>
                    <p>{product.storageInstructions || 'Non renseigné'}</p>
                  </div>
                  <div>
                    <span className="product-detail-section-title">Préparation / utilisation</span>
                    <p>{product.preparationInstructions || 'Non renseigné'}</p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}

function SupplierDetailModal({
  supplier,
  onClose,
  onUpdate,
  onDelete,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onUpdate: (supplierId: string, payload: { name: string; contactName?: string; email?: string; phone?: string; address?: string; notes?: string }) => Promise<void>;
  onDelete: (supplierId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [supplier?.id]);

  if (!supplier) return null;

  return (
    <Modal isOpen={Boolean(supplier)} onClose={onClose} title={supplier.name} size="md">
      {editing ? (
        <SupplierForm
          initialSupplier={supplier}
          submitLabel="Enregistrer"
          onSubmit={async (payload) => {
            await onUpdate(supplier.id, payload);
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      ) : (
        <div className="product-detail" style={{ gap: '1rem' }}>
          <div className="product-detail-hero" style={{ padding: '0.5rem 0' }}>
            <div>
              <span className="product-detail-kicker">Fiche Fournisseur</span>
              <h3 style={{ fontSize: '1.25rem' }}>{supplier.name}</h3>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.65rem', borderRadius: '6px' }}>
                <Edit3 size={13} /> Modifier
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.65rem', borderRadius: '6px' }}
                onClick={async () => {
                  if (window.confirm(`Êtes-vous sûr de vouloir supprimer le fournisseur "${supplier.name}" ?`)) {
                    await onDelete(supplier.id);
                    onClose();
                  }
                }}
              >
                <Trash2 size={13} /> Supprimer
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.5rem' }}>
            <div className="product-detail-info-row" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', fontSize: '0.85rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Contact :</span>
              <span style={{ color: 'var(--text-main)' }}>{supplier.contactName || '—'}</span>
            </div>
            <div className="product-detail-info-row" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', fontSize: '0.85rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Email :</span>
              <span>
                {supplier.email ? (
                  <a href={`mailto:${supplier.email}`} style={{ textDecoration: 'underline', color: 'var(--primary)', fontWeight: 600 }}>{supplier.email}</a>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </span>
            </div>
            <div className="product-detail-info-row" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', fontSize: '0.85rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Téléphone :</span>
              <span>
                {supplier.phone ? (
                  <a href={`tel:${supplier.phone}`} style={{ textDecoration: 'underline', color: 'var(--text-main)' }}>{supplier.phone}</a>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </span>
            </div>
            <div className="product-detail-info-row" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', fontSize: '0.85rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Adresse :</span>
              <span style={{ color: 'var(--text-main)' }}>{supplier.address || '—'}</span>
            </div>
            <div className="product-detail-info-row" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', fontSize: '0.85rem', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Notes :</span>
              <span style={{ color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>{supplier.notes || '—'}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Supplier Form
interface SupplierFormProps {
  initialName?: string;
  initialSupplier?: Supplier | null;
  submitLabel?: string;
  onSubmit: (payload: { name: string; contactName?: string; email?: string; phone?: string; address?: string; notes?: string }) => Promise<void>;
  onClose: () => void;
}

function SupplierForm({ initialName = '', initialSupplier = null, submitLabel = 'Créer le fournisseur', onSubmit, onClose }: SupplierFormProps) {
  const [name, setName] = useState(initialSupplier?.name ?? initialName);
  const [contactName, setContactName] = useState(initialSupplier?.contactName ?? '');
  const [email, setEmail] = useState(initialSupplier?.email ?? '');
  const [phone, setPhone] = useState(initialSupplier?.phone ?? '');
  const [address, setAddress] = useState(initialSupplier?.address ?? '');
  const [notes, setNotes] = useState(initialSupplier?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setName(initialSupplier?.name ?? initialName);
    setContactName(initialSupplier?.contactName ?? '');
    setEmail(initialSupplier?.email ?? '');
    setPhone(initialSupplier?.phone ?? '');
    setAddress(initialSupplier?.address ?? '');
    setNotes(initialSupplier?.notes ?? '');
  }, [initialName, initialSupplier]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit({ name: name.trim(), contactName: contactName.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined, address: address.trim() || undefined, notes: notes.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="product-sheet-form">
      {error && (
        <div className="alert-modern error" style={{ padding: '0.75rem 1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      <div className="product-sheet-form-body product-sheet-form-body-single">
        <div className="product-sheet-form-panel">
          <div className="product-sheet-form-grid">
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
            <label>
              Téléphone
              <input placeholder="01 23 45 67 89" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="product-sheet-wide">
              Adresse
              <input placeholder="Adresse fournisseur" value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label className="product-sheet-wide">
              Notes
              <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions, jours de livraison…" />
            </label>
          </div>
        </div>
      </div>

      <div className="modal-footer product-sheet-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
          {submitting ? 'Enregistrement...' : submitLabel}
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
  const [name, setName] = useState('Stock général');
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function submitForm(e: FormEvent) { e.preventDefault(); setSubmitting(true); try { await onSubmit({ name: name.trim(), siteId, description: description.trim() || undefined }); } finally { setSubmitting(false); } }
  return <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{sites.length === 0 && <div className="alert-modern error"><Info size={16}/>Créez d’abord un site.</div>}<label>Site *<select value={siteId} onChange={e => setSiteId(e.target.value)} required autoFocus><option value="">Choisir…</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><input type="hidden" value={name} onChange={e => setName(e.target.value)} /><label>Description<textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label><div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem' }}><button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!name.trim() || !siteId || submitting}>{submitting ? 'Configuration…' : 'Configurer le site'}</button></div></form>;
}

function InventoryForm({ sites, onSubmit, onClose }: { sites: Site[]; locations: Location[]; onSubmit: (payload: { name: string; date?: string; comment?: string; siteId?: string; locationId?: string }) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(`Inventaire ${new Date().toLocaleDateString('fr-FR')}`);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState('');
  const [siteId, setSiteId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function submitForm(e: FormEvent) { e.preventDefault(); setSubmitting(true); try { await onSubmit({ name: name.trim(), date, comment: comment.trim() || undefined, siteId: siteId || undefined }); } finally { setSubmitting(false); } }
  return (
    <form onSubmit={submitForm} className="product-sheet-form">
      <div className="product-sheet-form-body product-sheet-form-body-single">
        <div className="product-sheet-form-panel">
          <div className="product-sheet-form-grid">
            <label>
              Nom *
              <input value={name} onChange={e => setName(e.target.value)} required autoFocus />
            </label>
            <label>
              Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label>
              Site
              <select value={siteId} onChange={e => setSiteId(e.target.value)}>
                <option value="">Tous</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="product-sheet-wide">
              Commentaire
              <textarea rows={4} value={comment} onChange={e => setComment(e.target.value)} placeholder="Motif et périmètre du comptage" />
            </label>
            <div className="product-sheet-note product-sheet-wide">
              À la validation, les écarts entre stock théorique et compté généreront des corrections “Correction inventaire”.
            </div>
          </div>
        </div>
      </div>
      <div className="modal-footer product-sheet-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn btn-primary" disabled={!name.trim() || submitting}>
          {submitting ? 'Création…' : 'Créer l’inventaire'}
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
                    <span className="ocr-status-card-title">{ocrStatusTitle(status)}</span>
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

function StocksOcrReviewPanel({ extraction, products, categories, suppliers, units, sites, locations, token, onSaveDraft, onCreateReception, onCreateProductFromLine, onCreateSupplierFromOcr, onReanalyzeAi, onClose }: { extraction: StocksOcrExtraction; products: Product[]; categories: Category[]; suppliers: Supplier[]; units: Unit[]; sites: Site[]; locations: Location[]; token: string; onSaveDraft: (payload: StocksOcrExtraction['data']) => Promise<void>; onCreateReception: (payload: StocksOcrExtraction['data']) => Promise<void>; onCreateProductFromLine: (line: StocksOcrLine, supplierId?: string | null) => Promise<Product>; onCreateSupplierFromOcr: (name: string) => Promise<Supplier>; onReanalyzeAi: () => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(() => normalizeOcrReceptionData(extraction.data, suppliers));
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [showPreview, setShowPreview] = useState(false);
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
  const [reanalyzingAi, setReanalyzingAi] = useState(false);
  const [lineFilter, setLineFilter] = useState<'all' | 'review' | 'ready' | 'missing' | 'price' | 'ignored'>('all');
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
    setDraft(enrichOcrProductMatches(resolveOcrReceptionUnits(normalizeOcrReceptionData(extraction.data, suppliers), units), products));
  }, [extraction.id]);

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
  const ignoredLines = draft.lines.filter((line) => line.ignored);
  const missingProducts = activeLines.filter((line) => !line.productId).length;
  const productsToCreate = activeLines.filter((line) => !line.productId && line.createProduct).length;
  const blockingMissingProducts = activeLines.filter((line) => !line.productId && !line.createProduct).length;
  const invalidQuantities = activeLines.filter((line) => numeric(line.quantity) <= 0).length;
  const recognized = activeLines.filter((line) => line.matchingStatus === 'RECOGNIZED').length;
  const needsReview = activeLines.filter((line) => line.matchingStatus === 'NEEDS_REVIEW').length;
  const priceIssues = activeLines.filter((line) => ocrLineStatus(line) === 'price_mismatch' || hasOcrPriceMismatch(line)).length;
  const readyLines = activeLines.filter((line) => isOcrLineReady(line)).length;
  const displayedLineEntries = draft.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      if (lineFilter === 'ignored') return Boolean(line.ignored);
      if (line.ignored) return false;
      if (lineFilter === 'ready') return isOcrLineReady(line);
      if (lineFilter === 'missing') return !line.productId || ocrLineStatus(line) === 'missing_product';
      if (lineFilter === 'price') return ocrLineStatus(line) === 'price_mismatch' || hasOcrPriceMismatch(line) || ocrLineStatus(line) === 'quantity_suspicious';
      if (lineFilter === 'review') return !isOcrLineReady(line);
      return true;
    });
  const supplierCandidates = draft.supplierCandidates ?? draft.supplier?.candidates ?? [];
  const supplierMatchStatus = draft.supplierId ? (draft.supplierMatchingStatus ?? draft.supplier?.matchingStatus ?? 'RECOGNIZED') : 'NOT_FOUND';
  const supplierOcrName = draft.supplier?.name || draft.supplierName || '';
  const aiWarnings = uniqueOcrMessages([...(draft.warnings ?? []), ...(draft.aiAnalysis?.warnings ?? [])]);
  const aiActions = uniqueOcrMessages([...(draft.suggestedActions ?? []), ...(draft.aiAnalysis?.suggestedActions ?? [])]);
  const totalsCheck = draft.aiAnalysis?.totalsCheck;
  const totalLinesAmount = activeLines.reduce((sum, line) => sum + numeric(line.lineTotal ?? line.total), 0);

  function updateLine(index: number, patch: Partial<StocksOcrLine>) {
    setDraft((current) => ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, ...patch } : line) }));
  }

  function removeLine(index: number) {
    setDraft((current) => ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, ignored: true } : line) }));
  }

  function assignProductToLine(index: number, product: Product, score = 1) {
    updateLine(index, {
      productId: product.id,
      createProduct: false,
      productName: product.name,
      unitId: product.unitId,
      matchedUnitSymbol: productUnitSymbol(product) || null,
      matchingStatus: 'RECOGNIZED',
      matchingScore: score,
    });
  }

  function markAllMissingProductsForCreation() {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => !line.ignored && !line.productId
        ? { ...line, createProduct: true, matchingStatus: 'NEEDS_REVIEW', matchingScore: 0 }
        : line),
    }));
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

  async function ensureSupplierForOcrProducts() {
    if (draft.supplierId) return draft.supplierId;
    if (!supplierOcrName) return null;
    setCreatingSupplier(true);
    try {
      const supplier = await onCreateSupplierFromOcr(supplierOcrName);
      setDraft((current) => ({
        ...current,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierMatchingStatus: 'RECOGNIZED',
        supplierMatchingScore: 1,
      }));
      return supplier.id;
    } finally {
      setCreatingSupplier(false);
    }
  }

  async function createProductFromLine(line: StocksOcrLine, index: number) {
    const lineKey = line.id ?? `ocr-${index}`;
    setCreatingProductLineId(lineKey);
    setError(undefined);
    try {
      const supplierId = await ensureSupplierForOcrProducts();
      const product = await onCreateProductFromLine(line, supplierId);
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
    let supplierId: string | null = null;
    try {
      supplierId = await ensureSupplierForOcrProducts();
    } catch (err) {
      setCreatingProductLineId(null);
      setCreatingAllProducts(false);
      setError(err instanceof Error ? err.message : 'Le fournisseur OCR n’a pas pu être créé avant les produits.');
      return;
    }
    for (const { line, index } of linesToCreate) {
      const lineKey = line.id ?? `ocr-${index}`;
      const label = String(line.ocrLabel || line.label || '').trim();
      const reference = String(line.reference || '').trim();
      const dedupeKey = reference ? `sku:${reference}` : `name:${normalizeLookup(label)}`;
      try {
        setCreatingProductLineId(lineKey);
        const product = createdByKey.get(dedupeKey) ?? await onCreateProductFromLine(line, supplierId);
        createdByKey.set(dedupeKey, product);
        updateLine(index, {
          productId: product.id,
          productName: product.name,
          unitId: product.unitId ?? line.unitId,
          matchingStatus: 'RECOGNIZED',
          matchingScore: 1,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : '';
        failures.push(reason ? `${label || `ligne ${index + 1}`}: ${reason}` : label || `ligne ${index + 1}`);
      }
    }
    setCreatingProductLineId(null);
    setCreatingAllProducts(false);
    if (failures.length) {
      setError(`${failures.length} produit(s) n’ont pas pu être créés : ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''}`);
    }
  }

  async function reanalyzeAi() {
    setReanalyzingAi(true);
    setError(undefined);
    try {
      await onReanalyzeAi();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'L’analyse IA n’a pas pu être relancée.');
    } finally {
      setReanalyzingAi(false);
    }
  }

  return (
    <div className={`stocks-ocr-review ${showPreview ? 'show-preview' : 'hide-preview'}`}>
      {/* Document original à gauche */}
      {showPreview && (
        <div className="stocks-ocr-preview">
          <div className="stocks-ocr-preview-header">
            <span className="stocks-ocr-preview-title">Document original</span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '6px' }} onClick={() => setRotation(r => (r + 90) % 360)}>
                <RotateCw size={12} /> Rotation
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '6px' }} onClick={() => setZoomScale(z => Math.max(0.5, z - 0.2))}>
                <ZoomOut size={12} />
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '6px' }} onClick={() => setZoomScale(z => Math.min(3, z + 0.2))}>
                <ZoomIn size={12} />
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '6px' }} onClick={resetViewer}>
                Reset
              </button>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              position: 'relative',
              borderRadius: '12px',
              background: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: zoomScale > 1.0 ? 'grab' : 'default',
              minHeight: '600px'
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {previewUrl ? (
              previewUrl.toLowerCase().includes('.pdf') || document?.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewUrl}
                  title="Aperçu PDF"
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: '600px',
                    border: 'none',
                    transform: `scale(${zoomScale}) rotate(${rotation}deg) translate(${panOffset.x}px, ${panOffset.y}px)`,
                    transition: isDragging ? 'none' : 'transform 0.2s ease-out'
                  }}
                />
              ) : (
                <img
                  src={previewUrl}
                  alt="Aperçu document"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    transform: `scale(${zoomScale}) rotate(${rotation}deg) translate(${panOffset.x}px, ${panOffset.y}px)`,
                    transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                    objectFit: 'contain'
                  }}
                />
              )
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Chargement de l'aperçu...</span>
            )}
          </div>
        </div>
      )}

      <div className="stocks-ocr-editor">
        {error ? <div className="alert-modern error" style={{ marginBottom: '0.5rem' }}><AlertCircle size={16} /> {error}</div> : null}

        <div className="ocr-dossier">
          <div className="ocr-dossier-header">
            <div>
              <span className="ocr-dossier-kicker">Dossier d’import IA</span>
              <h3>{document?.originalName || 'Document OCR'}</h3>
              <p>{draft.aiAnalysis?.status === 'applied' ? 'Analyse Mistral IA appliquée au document.' : draft.aiAnalysis?.status === 'failed' ? 'Analyse IA indisponible, parsing ToqueHub utilisé.' : 'Analyse OCR prête à valider.'}</p>
            </div>
            <div className="ocr-dossier-actions">
              <button type="button" className="btn btn-secondary btn-sm" disabled={reanalyzingAi} onClick={() => void reanalyzeAi()}>
                <Sparkles size={13} /> {reanalyzingAi ? 'Analyse IA…' : 'Relancer IA'}
              </button>
              <button type="button" className={`btn btn-sm ${showPreview ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowPreview(!showPreview)}>
                <Eye size={13} /> {showPreview ? 'Masquer original' : 'Afficher original'}
              </button>
            </div>
          </div>

          <div className="ocr-dossier-metrics">
            <div><span>Confiance IA</span><strong>{formatOcrPercent(draft.documentConfidence ?? draft.aiAnalysis?.confidence)}</strong></div>
            <div><span>Lignes prêtes</span><strong>{readyLines}/{activeLines.length}</strong></div>
            <div><span>À vérifier</span><strong>{activeLines.length - readyLines}</strong></div>
            <div><span>Total lignes</span><strong>{totalLinesAmount.toFixed(2)} €</strong></div>
            <div><span>Écart total</span><strong className={numeric(totalsCheck?.delta) > 0.05 ? 'danger-text' : ''}>{totalsCheck?.delta != null ? `${numeric(totalsCheck.delta).toFixed(2)} €` : '—'}</strong></div>
          </div>

          {(aiWarnings.length || aiActions.length) ? (
            <div className="ocr-dossier-alerts">
              {aiWarnings.slice(0, 4).map((warning, index) => <span key={`w-${index}`}><AlertCircle size={13} /> {warning}</span>)}
              {aiActions.slice(0, 3).map((action, index) => <span key={`a-${index}`}><Info size={13} /> {action}</span>)}
            </div>
          ) : null}

          <div className="ocr-line-filter-bar">
            {[
              ['review', `À corriger (${activeLines.length - readyLines})`],
              ['ready', `Prêtes (${readyLines})`],
              ['missing', `Produits manquants (${missingProducts})`],
              ['price', `Prix/Qté (${priceIssues})`],
              ['ignored', `Ignorées (${ignoredLines.length})`],
              ['all', `Toutes (${draft.lines.length})`],
            ].map(([key, label]) => (
              <button key={key} type="button" className={`ocr-line-filter ${lineFilter === key ? 'active' : ''}`} onClick={() => setLineFilter(key as typeof lineFilter)}>
                {label}
              </button>
            ))}
          </div>

          <div className="stocks-ocr-summary" style={{ margin: 0 }}>
            <span className="badge badge-reception" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
              <CheckCircle2 size={13} /> {recognized} reconnus
            </span>
            <span className="badge badge-correction" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
              <Info size={13} /> {needsReview} à vérifier
            </span>
            <span className="badge badge-loss" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
              <AlertCircle size={13} /> {blockingMissingProducts} à décider
            </span>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!blockingMissingProducts}
              onClick={markAllMissingProductsForCreation}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto', borderRadius: '8px', padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 650 }}
            >
              <Package size={13} /> {blockingMissingProducts === 1 ? 'Prévoir la création du produit' : `Prévoir la création des ${blockingMissingProducts} produits`}
            </button>
          </div>
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
              <select value={draft.siteId || ''} onChange={(e) => setDraft({ ...draft, siteId: e.target.value || null, locationId: null })}>
                <option value="">Non précisé</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="table-wrapper stocks-ocr-lines" style={{ marginTop: '0.5rem' }}>
          <table className="table-modern">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Libellé OCR</th>
                <th style={{ width: '35%' }}>Produit ToqueHub</th>
                <th style={{ width: '10%' }}>Qté</th>
                <th style={{ width: '10%' }}>Unité</th>
                <th style={{ width: '10%' }}>P.U.</th>
                <th style={{ width: '10%' }}>Total</th>
                <th style={{ width: '8%' }}>Statut</th>
                <th style={{ width: '2%' }}></th>
              </tr>
            </thead>
            <tbody>
              {displayedLineEntries.map(({ line, index }) => (
                <tr key={line.id ?? index}>
                  <td>
                    <input
                      value={line.ocrLabel || line.label || ''}
                      onChange={(e) => updateLine(index, { ocrLabel: e.target.value })}
                      title={line.sourceText || line.ocrLabel || line.label || ''}
                    />
                    {line.warnings?.length ? <small className="ocr-line-warning">{translateOcrMessage(line.warnings[0])}</small> : null}
                    {ocrLinePackageDescription(line) ? <small className="ocr-line-warning">{ocrLinePackageDescription(line)}</small> : null}
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
                          onClick={() => updateLine(index, { createProduct: !line.createProduct, matchingStatus: line.createProduct ? 'NOT_FOUND' : 'NEEDS_REVIEW', matchingScore: 0 })}
                          style={{ padding: '0.25rem 0.5rem', flexShrink: 0, borderRadius: '6px' }}
                          title="Le produit sera créé uniquement à la validation de la réception"
                        >
                          {line.createProduct ? 'À créer' : '+ Créer'}
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

                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${ocrMatchClass(line.matchingStatus)}`}>
                      {ocrLineStatusLabel(line)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {line.ignored ? (
                      <button type="button" className="icon-btn" onClick={() => updateLine(index, { ignored: false })} title="Restaurer la ligne">
                        <CheckCircle2 size={14} />
                      </button>
                    ) : (
                      <button type="button" className="icon-btn danger" onClick={() => removeLine(index)} title="Supprimer la ligne">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!displayedLineEntries.length ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state" style={{ padding: '1.5rem' }}>
                      <span className="empty-state-title">Aucune ligne dans ce filtre</span>
                      <span className="empty-state-desc">Changez de filtre pour afficher les autres lignes de l’analyse IA.</span>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {(missingProducts || invalidQuantities) ? (
          <div className="alert-modern error" style={{ margin: '0' }}>
            <AlertCircle size={16} />
            <span>
              {blockingMissingProducts ? `${blockingMissingProducts} produit(s) non reconnu(s) dans ToqueHub. Associez-les ou marquez-les à créer. ` : ''}
              {productsToCreate ? `${productsToCreate} produit(s) seront créés à la validation de la réception. ` : ''}
              {invalidQuantities ? `${invalidQuantities} quantité(s) invalides.` : ''}
            </span>
          </div>
        ) : null}

        <div className="modal-footer" style={{ margin: '1rem -1.75rem -1.75rem', padding: '1.25rem 1.75rem', background: '#fafbfe', borderTop: '1px solid var(--light-border)' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ borderRadius: '10px' }}>Annuler</button>
          <button className="btn btn-secondary" disabled={submitting !== null} onClick={() => void submit('draft')} style={{ borderRadius: '10px' }}>
            {submitting === 'draft' ? 'Enregistrement…' : 'Enregistrer le brouillon'}
          </button>
          <button className="btn btn-primary" disabled={submitting !== null || blockingMissingProducts > 0 || invalidQuantities > 0} onClick={() => void submit('create')} style={{ borderRadius: '10px' }}>
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

function normalizeOcrReceptionData(data: StocksOcrExtraction['data'], suppliers: Supplier[] = []): StocksOcrExtraction['data'] {
  const purchaseOrderNumber = data.purchaseOrderNumber ?? data.document?.purchaseOrderNumber ?? inferOcrPurchaseOrderNumber(data) ?? null;
  const normalized: StocksOcrExtraction['data'] = {
    supplier: data.supplier ?? null,
    supplierId: data.supplierId ?? data.supplier?.supplierId ?? null,
    supplierName: data.supplierName ?? data.supplier?.supplierName ?? data.supplier?.name ?? null,
    supplierMatchingStatus: data.supplierMatchingStatus ?? data.supplier?.matchingStatus,
    supplierMatchingScore: data.supplierMatchingScore ?? data.supplier?.matchingScore ?? null,
    supplierCandidates: data.supplierCandidates ?? data.supplier?.candidates ?? [],
    invoiceNumber: data.invoiceNumber ?? data.document?.invoiceNumber ?? null,
    deliveryNoteNumber: data.deliveryNoteNumber ?? data.document?.deliveryNoteNumber ?? null,
    purchaseOrderNumber,
    documentDate: data.documentDate ?? data.document?.documentDate ?? null,
    deliveryDate: data.deliveryDate ?? data.document?.deliveryDate ?? null,
    totalExcludingTax: data.totalExcludingTax ?? data.totals?.totalExcludingTax ?? null,
    totalTax: data.totalTax ?? data.totals?.totalTax ?? null,
    totalIncludingTax: data.totalIncludingTax ?? data.totals?.totalIncludingTax ?? null,
    siteId: data.siteId ?? null,
    locationId: data.locationId ?? null,
    documentConfidence: data.documentConfidence ?? data.aiAnalysis?.confidence ?? null,
    warnings: data.warnings ?? data.aiAnalysis?.warnings ?? [],
    suggestedActions: data.suggestedActions ?? data.aiAnalysis?.suggestedActions ?? [],
    aiAnalysis: data.aiAnalysis ?? null,
    document: data.document ? { ...data.document, purchaseOrderNumber } : data.document,
    lines: (data.lines || []).map((line, index) => {
      const unit = line.unit ?? inferOcrUnitLabel(line) ?? null;
      return {
        ...line,
        id: line.id ?? `ocr-${index}`,
        ocrLabel: line.ocrLabel ?? line.label ?? '',
        nameOriginal: line.nameOriginal ?? line.label ?? line.ocrLabel ?? null,
        descriptionOriginal: line.descriptionOriginal ?? line.packageDescription ?? null,
        unit,
        lineTotal: line.lineTotal ?? line.total ?? null,
        ignored: line.ignored ?? false,
        lineStatus: line.lineStatus ?? null,
        lineConfidence: line.lineConfidence ?? line.matchingScore ?? null,
        categoryId: line.categoryId ?? line.suggestedCategoryId ?? null,
        categoryName: line.categoryName ?? line.suggestedCategoryName ?? null,
        suggestedCategoryId: line.suggestedCategoryId ?? line.categoryId ?? null,
        suggestedCategoryName: line.suggestedCategoryName ?? line.categoryName ?? null,
        warnings: line.warnings ?? [],
        sourceText: line.sourceText ?? null,
        packageDescription: line.packageDescription ?? line.descriptionOriginal ?? ocrPackageDescriptionFromName(line.nameOriginal ?? line.label ?? line.ocrLabel ?? '') ?? null,
      };
    }),
  };
  return normalizeKnownOcrSupplier(normalized, suppliers);
}

function inferOcrPurchaseOrderNumber(data: StocksOcrExtraction['data']) {
  const text = [
    data.supplierName,
    data.supplier?.name,
    data.suggestedActions?.join(' '),
    data.aiAnalysis?.suggestedActions?.join(' '),
    ...(data.lines ?? []).flatMap((line) => [line.sourceText, line.ocrLabel, line.label, line.packageDescription, line.descriptionOriginal]),
  ].filter(Boolean).join(' ');
  const matches = [
    text.match(/\border\s*(?:number|no\.?|#)\s*[:#-]?\s*([0-9][0-9\s-]{4,}[0-9])/i)?.[1],
    text.match(/\b([0-9]{6,})\s*-\s*(?:tilauksen tiedot|tilaushistoria)\b/i)?.[1],
  ].filter(Boolean);
  const value = matches[0]?.replace(/[\s-]+/g, '').trim();
  return value || null;
}

function normalizeKnownOcrSupplier(data: StocksOcrExtraction['data'], suppliers: Supplier[]) {
  if (!isKesproOcrReception(data)) return data;
  const kespro = suppliers.find((supplier) => normalizeLookup(supplier.name) === 'kespro' || normalizeLookup(supplier.name).includes('kespro'));
  const supplier = {
    ...(data.supplier ?? {}),
    name: 'Kespro',
    supplierName: kespro?.name ?? 'Kespro',
    supplierId: kespro?.id ?? null,
    matchingStatus: kespro ? 'RECOGNIZED' : 'NOT_FOUND',
    matchingScore: kespro ? 1 : 0,
  };
  return {
    ...data,
    supplier,
    supplierId: kespro?.id ?? null,
    supplierName: kespro?.name ?? 'Kespro',
    supplierMatchingStatus: kespro ? 'RECOGNIZED' : 'NOT_FOUND',
    supplierMatchingScore: kespro ? 1 : 0,
    supplierCandidates: kespro ? [{ id: kespro.id, name: kespro.name, score: 1 }] : data.supplierCandidates,
  };
}

function isKesproOcrReception(data: StocksOcrExtraction['data']) {
  const type = String((data as any).documentType ?? data.aiAnalysis?.model ?? '').toLowerCase();
  const purchaseOrderNumber = data.purchaseOrderNumber ?? data.document?.purchaseOrderNumber;
  const supplierName = data.supplierName ?? data.supplier?.supplierName ?? data.supplier?.name ?? '';
  const lineUnits = (data.lines ?? []).map((line) => line.unit).filter(Boolean).join(' ');
  const documentText = [
    type,
    data.purchaseOrderNumber,
    data.document?.purchaseOrderNumber,
    data.suggestedActions?.join(' '),
    data.aiAnalysis?.suggestedActions?.join(' '),
    ...(data.lines ?? []).flatMap((line) => [line.sourceText, line.ocrLabel, line.label, line.packageDescription]),
  ].filter(Boolean).join(' ');
  const explicitKespro = /kespro|order_confirmation|supplier_order|confirmed quantity\s*\/\s*me|tilauksen tiedot|tilaushistoria/i.test(documentText);
  const customerMisreadAsSupplier = /the french caf/i.test(supplierName)
    && /\b(LTK|PKT|KPL|RS|PSS|TLK|PRK|PAK)\b/i.test(lineUnits)
    && (data.lines ?? []).length >= 3;
  return Boolean(purchaseOrderNumber) && (explicitKespro || customerMisreadAsSupplier);
}

function ocrStateClass(state: string) {
  if (state.includes('erreur')) return 'badge-loss';
  if (state.includes('vérifier')) return 'badge-reception';
  if (state.includes('cours') || state.includes('attente')) return 'badge-correction';
  return 'badge-production';
}

function normalizedOcrState(status: StocksOcrStatus) {
  return `${status.state ?? ''} ${status.ocr?.status ?? ''} ${status.document.status ?? ''}`.toLowerCase();
}

function isOcrStatusError(status: StocksOcrStatus) {
  const state = normalizedOcrState(status);
  return state.includes('erreur') || state.includes('failed');
}

function isOcrStatusReady(status: StocksOcrStatus) {
  const state = normalizedOcrState(status);
  return Boolean(status.extraction) || state.includes('vérifier') || state.includes('pret') || state.includes('prêt');
}

function isOcrStatusPending(status: StocksOcrStatus) {
  const state = normalizedOcrState(status);
  return state.includes('pending') || state.includes('attente') || state.includes('upload');
}

function isOcrStatusAnalyzing(status: StocksOcrStatus) {
  const state = normalizedOcrState(status);
  return state.includes('processing') || state.includes('cours') || state.includes('matching');
}

function isOcrStatusWorking(status: StocksOcrStatus) {
  return !isOcrStatusReady(status) && !isOcrStatusError(status);
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

function ocrLineStatus(line: StocksOcrLine) {
  return String(line.lineStatus || '').toLowerCase();
}

function hasOcrPriceMismatch(line: StocksOcrLine) {
  const qty = numeric(line.quantity);
  const unitPrice = numeric(line.unitPrice);
  const total = numeric(line.lineTotal ?? line.total);
  if (!qty || !unitPrice || !total) return false;
  return Math.abs(qty * unitPrice - total) > Math.max(0.05, total * 0.02);
}

function isOcrLineReady(line: StocksOcrLine) {
  const blockingStatuses = ['needs_review', 'price_mismatch', 'quantity_suspicious'];
  const status = ocrLineStatus(line);
  return !line.ignored && Boolean(line.productId || line.createProduct) && numeric(line.quantity) > 0 && !hasOcrPriceMismatch(line) && !blockingStatuses.includes(status) && !(status === 'missing_product' && !line.createProduct);
}

function ocrLineStatusLabel(line: StocksOcrLine) {
  const status = ocrLineStatus(line);
  if (line.ignored || status === 'non_product_line') return 'Ignorée';
  if (line.createProduct && !line.productId) return 'À créer';
  if (status === 'price_mismatch') return 'Prix';
  if (status === 'quantity_suspicious') return 'Qté';
  if (status === 'missing_product') return 'Produit';
  if (status === 'ready') return 'Prêt';
  return ocrMatchLabel(line.matchingStatus);
}

function formatOcrPercent(value?: string | number | null) {
  const percent = numeric(value);
  return percent > 0 ? `${Math.round(percent * 100)}%` : '—';
}

function uniqueOcrMessages(messages: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return messages
    .map((message) => translateOcrMessage(message))
    .filter((message) => {
      if (!message) return false;
      const key = normalizeSearchText(message);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function ocrLinePackageDescription(line: StocksOcrLine) {
  return line.packageDescription || line.descriptionOriginal || ocrPackageDescriptionFromName(line.nameOriginal || line.ocrLabel || line.label || '');
}

function ocrProductDescription(line: StocksOcrLine) {
  return ocrLinePackageDescription(line) || undefined;
}

function ocrPackageDescriptionFromName(value?: string | null) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const match = clean.match(/(?:^|[\s/(-])([0-9]+(?:[,.][0-9]+)?)\s*(kg|g|l|ml|cl|dl)\b/i);
  if (!match) return null;
  const quantity = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const unit = match[2].toLowerCase() === 'l' ? 'L' : match[2].toLowerCase();
  const displayQuantity = Number.isInteger(quantity) ? String(quantity) : String(quantity).replace('.', ',');
  return `Conditionnement produit: ${displayQuantity} ${unit} par unité`;
}

function ocrStatusTitle(status: StocksOcrStatus) {
  const data = status.extraction?.correctedJson ?? status.extraction?.extractedJson ?? status.ocr?.extractions?.[0]?.correctedJson ?? status.ocr?.extractions?.[0]?.extractedJson;
  const supplierName = data?.supplierName ?? data?.supplier?.supplierName ?? data?.supplier?.name;
  if (supplierName && status.extraction) return supplierName;
  return status.document.originalName;
}

function translateOcrMessage(message?: string | null) {
  if (!message) return '';
  let translated = String(message);
  const replacements: Array<[RegExp, string]> = [
    [/Document date and delivery date are missing\.?/gi, 'La date du document et la date de livraison sont manquantes.'],
    [/No totals \(excluding tax, tax, including tax\) found on the delivery note\.?/gi, 'Aucun total HT, TVA ou TTC n’a été trouvé sur le bon de livraison.'],
    [/Unit price and line total are missing, preventing price verification\.?/gi, 'Le prix unitaire et le total de ligne sont manquants, la vérification du prix est impossible.'],
    [/Verify the delivery date and document date with the supplier\.?/gi, 'Vérifier la date de livraison et la date du document avec le fournisseur.'],
    [/Check if the product '([^']+)' exists in your product catalog and update the productId if necessary\.?/gi, "Vérifier si le produit « $1 » existe dans le catalogue et l’associer si nécessaire."],
    [/Confirm the unit '([^']+)' \(assumed to be '([^']+)' or '([^']+)'\) matches your internal unit of measure\.?/gi, "Confirmer que l’unité « $1 » correspond à votre unité interne."],
    [/Unit '([^']+)' mapped to '([^']+)'\s*\(([^)]+)\)\. Verify if this matches your internal unit of measure\.?/gi, "L’unité « $1 » a été associée à « $2 » ($3). Vérifier que cela correspond à votre unité interne."],
    [/Verify if this matches your internal unit of measure\.?/gi, 'Vérifier que cela correspond à votre unité interne.'],
    [/Confirmeration/gi, 'confirmation'],
    [/Confirmer(ée|ées|é|és)/gi, 'confirm$1'],
    [/missing/gi, 'manquant'],
    [/Verify/gi, 'Vérifier'],
    [/Check/gi, 'Vérifier'],
    [/(^|[^A-Za-zÀ-ÿ])Confirm(?![A-Za-zÀ-ÿ])/g, '$1Confirmer'],
  ];
  for (const [pattern, replacement] of replacements) translated = translated.replace(pattern, replacement);
  return translated;
}

function dateInputValue(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDocumentDate(value?: string | null) {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return new Intl.DateTimeFormat('fr-FR').format(date);
}

function documentTypeLabel(type?: string | null) {
  if (type === 'invoice') return 'Facture';
  if (type === 'delivery_note') return 'BL';
  if (type === 'supplier_order') return 'Commande';
  if (type === 'order_confirmation') return 'Confirmation';
  return 'Non classé';
}

function documentTypeBadge(type?: string | null) {
  if (type === 'invoice') return 'badge-stock';
  if (type === 'delivery_note') return 'badge-reception';
  if (type === 'supplier_order') return 'badge-production';
  if (type === 'order_confirmation') return 'badge-correction';
  return 'badge-correction';
}

function documentStateLabel(state?: string | null) {
  if (state === 'failed') return 'Erreur';
  if (state === 'processing') return 'Analyse';
  return 'Classé';
}

function documentStateBadge(state?: string | null) {
  if (state === 'failed') return 'badge-loss';
  if (state === 'processing') return 'badge-correction';
  return 'badge-reception';
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

function MovementForm({ products, suppliers, units, sites, onSubmit, onClose }: MovementFormProps) {
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [type, setType] = useState<StockMovementType>('IN');
  const [supplierId, setSupplierId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [sourceSiteId, setSourceSiteId] = useState('');
  const [destinationSiteId, setDestinationSiteId] = useState('');
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
        supplierId: type === 'IN' && supplierId ? supplierId : undefined,
        type,
        quantity: Number(quantity),
        unitId: unitId || undefined,
        sourceSiteId: sourceSiteId || undefined,
        destinationSiteId: destinationSiteId || undefined,
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
    <form onSubmit={handleSubmit} className="product-sheet-form">
      {error && (
        <div className="alert-modern error" style={{ padding: '0.75rem 1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="product-sheet-form-body product-sheet-form-body-single">
        <div className="product-sheet-form-panel">
          {products.length === 0 ? (
            <div className="alert-modern error">
              <Info size={16} />
              <span>Vous devez d'abord créer au moins un produit dans le catalogue.</span>
            </div>
          ) : (
            <div className="product-sheet-form-grid">
              <label className="product-sheet-wide">
                Sélectionner le produit *
                <select value={productId} onChange={(e) => setProductId(e.target.value)} required autoFocus>
                  <option value="">Choisir un produit...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} {p.sku ? `(SKU: ${p.sku})` : ''}</option>
                  ))}
                </select>
              </label>

              <label>
                Type de mouvement *
                <select value={type} onChange={(e) => setType(e.target.value as StockMovementType)} required>
                  {movementOptions.map(([value, label]) => (
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

              <label>
                Unité de saisie compatible
                <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  <option value="">Unité principale du produit</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                </select>
              </label>
              <label>
                Date du mouvement
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>

              {(type === 'OUT' || type === 'EXIT' || type === 'LOSS' || type === 'TRANSFER') && (
                <>
                  <label>
                    Site source
                    <select value={sourceSiteId} onChange={(e) => setSourceSiteId(e.target.value)}>
                      <option value="">Non précisé</option>
                      {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                </>
              )}

              {(type === 'IN' || type === 'ENTRY' || type === 'TRANSFER') && (
                <>
                  <label>
                    Site destination
                    <select value={destinationSiteId} onChange={(e) => setDestinationSiteId(e.target.value)}>
                      <option value="">Non précisé</option>
                      {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                </>
              )}

              {type === 'IN' && (
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

              <label className="product-sheet-wide">
                Motif / Note explicative
                <input
                  placeholder="ex: Commande de la semaine, Ajustement inventaire..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="modal-footer product-sheet-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Annuler
        </button>
        {products.length > 0 ? (
          <button type="submit" className="btn btn-primary" disabled={submitting || !productId || !quantity}>
            {submitting ? 'Enregistrement...' : 'Enregistrer le mouvement'}
          </button>
        ) : null}
      </div>
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

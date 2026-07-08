import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Battery,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Cpu,
  Download,
  Droplets,
  Factory,
  FileText,
  Flame,
  Layers,
  LayoutGrid,
  List,
  MapPin,
  Package,
  Plus,
  Radio,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Snowflake,
  Sparkles,
  Terminal,
  Thermometer,
  Trash2,
  Truck,
  Wifi,
  X,
} from 'lucide-react';
import { api } from '../api/client';

export type HaccpTab = 'dashboard' | 'setup' | 'sensors' | 'alerts' | 'temperatures' | 'cleaning' | 'traceability' | 'receptions' | 'process' | 'oil' | 'production' | 'products' | 'labels' | 'reports';

type Props = {
  token: string;
  tab: HaccpTab;
  onNavigate?: (tab: string) => void;
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
type HaccpCleaningSession = HaccpItem & {
  cleanedSurfaces?: Array<{ surfaceId: string; surfaceName?: string; zoneId?: string; zoneName?: string; cleanedAt?: string }>;
  totalSurfaces?: number;
  completedSurfaces?: number;
  status?: string;
};
type TodayCleaningSurface = {
  surfaceId: string;
  surfaceName: string;
  zoneId: string;
  zoneName: string;
  frequency?: string;
  lastCleaned?: string | null;
};

type SectionId = Exclude<HaccpTab, 'dashboard' | 'setup' | 'sensors' | 'alerts' | 'labels'>;
type HaccpConfigKind = 'temperature' | 'process' | 'cleaning';
type HaccpOnboardingStep = 'welcome' | 'temperatures' | 'process' | 'cleaning' | 'sensors' | 'review';
type TemperatureTemplate = { key: string; name: string; type: string; description: string; recommendedTemp: number; selected: boolean };
type ProcessTemplate = { key: string; name: string; type: 'refroidissement' | 'congelation' | 'rechauffement'; temperatureRange: { min: number; max: number }; description: string; selected: boolean };
type CleaningTemplate = { key: string; name: string; description: string; selected: boolean; surfaces: Array<{ name: string; frequency: string }> };
type HaccpOnboardingPayload = {
  temperatures: TemperatureTemplate[];
  processes: ProcessTemplate[];
  cleaningZones: CleaningTemplate[];
};
type HaccpOnboardingSummary = {
  created: string[];
  skipped: string[];
};
type HaccpReadiness = {
  temperatureReady: boolean;
  processReady: boolean;
  cleaningReady: boolean;
  progress: number;
  nextStep: HaccpOnboardingStep;
};
type HaccpSensorSummary = { total: number; online: number; offline: number; unknown: number; averageBattery: number | null; globalStatus: 'ok' | 'warning' | 'unknown' | string };
type HaccpSensorGatewayStatus = {
  status: 'ready' | 'missing_serial' | 'mqtt_disconnected' | 'not_configured' | string;
  ready: boolean;
  mqtt: {
    configured: boolean;
    url: string | null;
    connected: boolean;
    baseTopic: string;
    lastError?: string | null;
    lastConnectedAt?: string | null;
  };
  zigbee2mqtt: {
    baseTopic: string;
    frontendUrl: string;
    configuredSerialPort?: string | null;
    serialPortDetected: boolean;
    serialCandidates: string[];
    cachedDeviceCount: number;
  };
  install: {
    dockerCommand: string;
    localSetupCommand: string;
    localStartCommand: string;
  };
};
type HaccpSensor = HaccpItem & {
  id: string;
  provider: string;
  externalId: string;
  manufacturer?: string | null;
  model?: string | null;
  friendlyName?: string | null;
  userName?: string | null;
  type: string;
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN' | string;
  battery?: number | null;
  linkQuality?: number | null;
  lastSeenAt?: string | null;
  currentTemperature?: number | null;
  currentHumidity?: number | null;
  temperatureThreshold?: { min: number; max: number; label: string } | null;
  assignedEquipment?: { id: string; name: string; type: string; temperatureRange?: { min: number | null; max: number | null } | null } | null;
  readings?: HaccpItem[];
  events?: HaccpItem[];
};
type HaccpTemperatureAlertData = {
  summary: {
    totalSensors: number;
    assignedSensors: number;
    unassignedSensors: number;
    onlineSensors: number;
    offlineSensors: number;
    critical: number;
    warning: number;
    ok: number;
  };
  sensors: Array<HaccpSensor & {
    threshold?: { min: number; max: number; label: string } | null;
    temperatureStatus?: { status: string; label: string; delta?: number | null };
    alertOpen?: boolean;
  }>;
  alerts: HaccpItem[];
  recentReadings: HaccpItem[];
};
type HaccpPairingSession = HaccpItem & { id: string; status: string; startedAt: string; expiresAt: string; discoveredIds?: string[]; sensors?: HaccpSensor[] };
type HaccpSensorReading = HaccpItem & {
  id: string;
  temperature?: number | null;
  humidity?: number | null;
  battery?: number | null;
  linkQuality?: number | null;
  measuredAt: string;
};

const PROCESS_TYPES = [
  { id: 'refroidissement', label: 'Refroidissement', icon: Snowflake },
  { id: 'congelation', label: 'Congélation', icon: Snowflake },
  { id: 'rechauffement', label: 'Remise en température', icon: Flame },
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Quotidien' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuel' },
];

const DEFAULT_TEMPERATURE_CATEGORIES = [
  { key: 'positive-cold-room', defaultName: 'Chambre froide positive', type: 'enceinte_positive', description: 'Entre 0°C et 4°C', recommendedTemp: 2 },
  { key: 'sensitive-positive-room', defaultName: 'Enceinte sensible positive', type: 'enceinte_sensible_positive', description: 'Entre 0°C et 2°C', recommendedTemp: 1 },
  { key: 'finished-products-fridge', defaultName: 'Enceinte produits finis', type: 'enceinte_produits_finis', description: 'Entre 0°C et 3°C', recommendedTemp: 1.5 },
  { key: 'dairy-fridge', defaultName: 'Enceinte produits laitiers', type: 'enceinte_produits_laitiers', description: 'Entre 0°C et 8°C', recommendedTemp: 4 },
  { key: 'negative-cold-room', defaultName: 'Chambre froide négative', type: 'enceinte_negative', description: 'Entre -16°C et -30°C', recommendedTemp: -18 },
  { key: 'vegetable-fridge', defaultName: 'Enceinte légumes', type: 'enceinte_legumes', description: 'Entre 0°C et 10°C', recommendedTemp: 5 },
  { key: 'refrigerated-zone', defaultName: 'Zone réfrigérée', type: 'zone_refrigeree', description: 'Inférieure à 12°C', recommendedTemp: 6 },
  { key: 'meat-carcass-room', defaultName: 'Enceinte carcasse viande', type: 'enceinte_carcasse_viande', description: 'Entre 0°C et 7°C', recommendedTemp: 3.5 },
  { key: 'ice-cream-freezer', defaultName: 'Frigo glaces / sorbets', type: 'frigo_glaces_sorbets', description: 'Entre -10°C et -25°C', recommendedTemp: -18 },
  { key: 'charcuterie-dryer', defaultName: 'Séchoir charcuterie', type: 'sechoir_charcuterie', description: 'Entre 12°C et 16°C', recommendedTemp: 14 },
  { key: 'chocolate-conserver', defaultName: 'Conservateur chocolat', type: 'conservateur_chocolat', description: 'Entre 14°C et 22°C', recommendedTemp: 18 },
];

const DEFAULT_TEMPERATURE_TEMPLATES: TemperatureTemplate[] = [
  { key: 'positive-cold-room', name: 'Chambre froide positive', type: 'enceinte_positive', description: 'Entre 0°C et 4°C', recommendedTemp: 2, selected: true },
  { key: 'finished-products-fridge', name: 'Enceinte produits finis', type: 'enceinte_produits_finis', description: 'Entre 0°C et 3°C', recommendedTemp: 1.5, selected: true },
  { key: 'negative-cold-room', name: 'Chambre froide négative', type: 'enceinte_negative', description: 'Entre -16°C et -30°C', recommendedTemp: -18, selected: true },
];

const DEFAULT_PROCESS_CATEGORIES = [
  { key: 'reheat-oven', defaultName: 'Four de remise en température', type: 'rechauffement' as const, temperatureRange: { min: 60, max: 85 }, description: 'Remise en température et maintien chaud' },
  { key: 'hot-cabinet', defaultName: 'Armoire chaude', type: 'rechauffement' as const, temperatureRange: { min: 60, max: 85 }, description: 'Liaison chaude et maintien avant service' },
  { key: 'cooling-cell', defaultName: 'Cellule de refroidissement', type: 'refroidissement' as const, temperatureRange: { min: 0, max: 4 }, description: 'Refroidissement rapide des préparations' },
  { key: 'blast-chiller', defaultName: 'Refroidisseur rapide', type: 'refroidissement' as const, temperatureRange: { min: 0, max: 4 }, description: 'Alternative cellule / blast chiller' },
  { key: 'freezing-cell', defaultName: 'Cellule de congélation', type: 'congelation' as const, temperatureRange: { min: -25, max: -18 }, description: 'Congélation ou surgélation contrôlée' },
  { key: 'freezer', defaultName: 'Congélateur de réserve', type: 'congelation' as const, temperatureRange: { min: -25, max: -18 }, description: 'Mise en réserve négative' },
];

const DEFAULT_PROCESS_TEMPLATES: ProcessTemplate[] = [
  { key: 'reheat-oven', name: 'Four de remise en température', type: 'rechauffement', temperatureRange: { min: 60, max: 85 }, description: 'Remise en température et maintien chaud', selected: true },
  { key: 'cooling-cell', name: 'Cellule de refroidissement', type: 'refroidissement', temperatureRange: { min: 0, max: 4 }, description: 'Refroidissement rapide des préparations', selected: true },
  { key: 'freezing-cell', name: 'Cellule de congélation', type: 'congelation', temperatureRange: { min: -25, max: -18 }, description: 'Congélation ou surgélation contrôlée', selected: true },
];

const DEFAULT_CLEANING_TEMPLATES: CleaningTemplate[] = [
  {
    key: 'kitchen-production',
    name: 'Cuisine / Production',
    description: 'Zone principale de préparation et de production.',
    selected: true,
    surfaces: [
      { name: 'Plan de travail', frequency: 'daily' },
      { name: 'Matériel', frequency: 'daily' },
      { name: 'Poignées', frequency: 'daily' },
      { name: 'Sols', frequency: 'daily' },
    ],
  },
  {
    key: 'plonge',
    name: 'Plonge',
    description: 'Zone de lavage et d’égouttage.',
    selected: true,
    surfaces: [
      { name: 'Évier', frequency: 'daily' },
      { name: 'Lave-vaisselle', frequency: 'daily' },
      { name: 'Égouttoir', frequency: 'daily' },
      { name: 'Robinetterie', frequency: 'daily' },
    ],
  },
  {
    key: 'storage',
    name: 'Réserve / Stockage',
    description: 'Zone de stockage sec, froid ou consommables.',
    selected: true,
    surfaces: [
      { name: 'Étagères', frequency: 'weekly' },
      { name: 'Sols', frequency: 'daily' },
      { name: 'Bacs', frequency: 'weekly' },
    ],
  },
  {
    key: 'reception-dock',
    name: 'Réception marchandises',
    description: 'Quai, zone de décartonnage et contrôle à réception.',
    selected: false,
    surfaces: [
      { name: 'Table de contrôle', frequency: 'daily' },
      { name: 'Zone de décartonnage', frequency: 'daily' },
      { name: 'Sols', frequency: 'daily' },
    ],
  },
  {
    key: 'service-zone',
    name: 'Zone de service',
    description: 'Passe, dressage et surfaces proches du service.',
    selected: false,
    surfaces: [
      { name: 'Passe', frequency: 'daily' },
      { name: 'Chariots', frequency: 'daily' },
      { name: 'Plans de dressage', frequency: 'daily' },
    ],
  },
  {
    key: 'waste-zone',
    name: 'Local déchets',
    description: 'Poubelles, conteneurs et surfaces de stockage déchets.',
    selected: false,
    surfaces: [
      { name: 'Poubelles', frequency: 'daily' },
      { name: 'Conteneurs', frequency: 'weekly' },
      { name: 'Sols', frequency: 'daily' },
    ],
  },
];

const SECTIONS: Array<{ id: HaccpTab; label: string; icon: typeof Thermometer }> = [
  { id: 'sensors', label: 'Capteurs', icon: Smartphone },
  { id: 'alerts', label: 'Alerte', icon: AlertTriangle },
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

const HaccpTabIds = new Set<HaccpTab>([
  'dashboard',
  'setup',
  ...SECTIONS.map((section) => section.id),
]);

const isHaccpTab = (value: string): value is HaccpTab => HaccpTabIds.has(value as HaccpTab);

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

const emptyConfigForm = {
  name: '',
  type: '',
  description: '',
  min: '',
  max: '',
  location: '',
  capacity: '',
  notes: '',
};

const emptySurfaceRows = [{ name: '', frequency: 'daily' }];

export function HaccpApp({ token, tab, onNavigate }: Props) {
  const [dashboard, setDashboard] = useState<HaccpDashboard | null>(null);
  const [activeTab, setActiveTab] = useState<HaccpTab>(tab);
  const [items, setItems] = useState<Record<string, HaccpItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<SectionId | null>(null);
  const [configModal, setConfigModal] = useState<HaccpConfigKind | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [processType, setProcessType] = useState<'refroidissement' | 'congelation' | 'rechauffement'>('refroidissement');
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [configForm, setConfigForm] = useState<Record<string, string>>(emptyConfigForm);
  const [surfaceRows, setSurfaceRows] = useState<Array<{ name: string; frequency: string }>>(emptySurfaceRows);
  const [searchQuery, setSearchQuery] = useState('');
  const [sensorSummary, setSensorSummary] = useState<HaccpSensorSummary>({ total: 0, online: 0, offline: 0, unknown: 0, averageBattery: null, globalStatus: 'unknown' });
  const [sensorGatewayStatus, setSensorGatewayStatus] = useState<HaccpSensorGatewayStatus | null>(null);
  const [sensors, setSensors] = useState<HaccpSensor[]>([]);
  const [temperatureAlerts, setTemperatureAlerts] = useState<HaccpTemperatureAlertData | null>(null);
  const [pairing, setPairing] = useState<HaccpPairingSession | null>(null);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [activeCleaningSession, setActiveCleaningSession] = useState<HaccpCleaningSession | null>(null);
  const [todayCleaningSurfaces, setTodayCleaningSurfaces] = useState<TodayCleaningSurface[]>([]);

  useEffect(() => setActiveTab(tab), [tab]);
  useEffect(() => { void refreshAll(); }, [token, processType]);
  useEffect(() => {
    if (activeTab !== 'sensors' && activeTab !== 'alerts') return;
    let socket: Socket | undefined;
    let connectTimer: number | undefined;
    try {
      socket = io(api.haccpSensorSocketUrl(), { auth: { token }, autoConnect: false });
      const upsert = (sensor: HaccpSensor) => {
        setSensors((current) => upsertSensor(current, sensor));
        void refreshSensorSummary();
        if (activeTab === 'alerts') void refreshTemperatureAlerts();
      };
      socket.on('sensor.discovered', (sensor: HaccpSensor) => {
        upsert(sensor);
        setPairing((current) => current?.status === 'ACTIVE'
          ? {
              ...current,
              discoveredIds: Array.from(new Set([...(current.discoveredIds ?? []), sensor.id])),
              sensors: upsertSensor(current.sensors ?? [], sensor),
            }
          : current);
      });
      socket.on('sensor.updated', upsert);
      socket.on('sensor.reading', upsert);
      socket.on('sensor.status_changed', upsert);
      socket.on('pairing.updated', (nextPairing) => {
        setPairing(nextPairing ?? null);
        void refreshSensorsOnly();
      });
      socket.on('connect_error', () => {
        // REST remains the source of truth if realtime is temporarily unavailable.
      });
      connectTimer = window.setTimeout(() => socket?.connect(), 0);
    } catch {
      // REST remains available if the socket cannot be opened.
    }
    return () => {
      if (connectTimer) window.clearTimeout(connectTimer);
      socket?.disconnect();
    };
  }, [activeTab, token]);

  const products = items.products ?? [];
  const temperatureEquipment = items.temperatureEquipment ?? [];
  const processEquipment = items.processEquipment ?? [];
  const oilEquipment = items.oilEquipment ?? [];
  const cleaningZones = items.cleaningZones ?? [];
  const selectedSensor = selectedSensorId ? sensors.find((sensor) => sensor.id === selectedSensorId) ?? null : sensors[0] ?? null;
  const readiness = useMemo(
    () => computeHaccpReadiness(temperatureEquipment, processEquipment, cleaningZones),
    [temperatureEquipment, processEquipment, cleaningZones],
  );

  const currentRows = useMemo(() => {
    if (activeTab === 'dashboard' || activeTab === 'setup' || activeTab === 'sensors' || activeTab === 'alerts' || activeTab === 'labels') return [];
    if (activeTab === 'temperatures') return items.temperatureReadings ?? [];
    if (activeTab === 'cleaning') return items.cleaningSessions ?? [];
    if (activeTab === 'process') return items.processSessions ?? [];
    if (activeTab === 'oil') return items.oilSessions ?? [];
    if (activeTab === 'production') return items.productionSessions ?? [];
    if (activeTab === 'reports') return items.reports ?? [];
    return items[activeTab] ?? [];
  }, [activeTab, items]);

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || activeTab === 'dashboard' || activeTab === 'setup' || activeTab === 'sensors' || activeTab === 'alerts' || activeTab === 'labels') return currentRows;
    return currentRows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
  }, [activeTab, currentRows, searchQuery]);

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      const safeList = async (endpoint: string) => {
        try {
          return await api.haccpList(token, endpoint);
        } catch (err) {
          console.warn(`[HACCP] Chargement partiel impossible pour ${endpoint}`, err);
          return { data: [] };
        }
      };
      const safeValue = async <T,>(label: string, loader: () => Promise<T>, fallback: T) => {
        try {
          return await loader();
        } catch (err) {
          console.warn(`[HACCP] Chargement partiel impossible pour ${label}`, err);
          return fallback;
        }
      };
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
        gatewayStatus,
        sensorSummaryData,
        sensorList,
        temperatureAlertData,
        pairingData,
        activeCleaningData,
        todayCleaningData,
      ] = await Promise.all([
        safeValue('dashboard', () => api.haccpDashboard(token), null),
        safeList('/temperature/equipment'),
        safeList('/temperature/readings'),
        safeList('/cleaning/zones'),
        safeList('/traceability'),
        safeList('/receptions'),
        safeList('/cooling-equipment'),
        safeList(`/cooling/${processType}/sessions`),
        safeList('/oil-equipment'),
        safeList('/oil/sessions?limit=50'),
        safeList('/production/sessions'),
        safeList('/haccp-products'),
        safeList('/daily-reports?limit=50'),
        safeValue('sensor gateway status', () => api.haccpSensorGatewayStatus(token), null),
        safeValue('sensors summary', () => api.haccpSensorsSummary(token), { total: 0, online: 0, offline: 0, unknown: 0, averageBattery: null, globalStatus: 'unknown' }),
        safeValue('sensors list', () => api.haccpSensors(token), []),
        safeValue('temperature alerts', () => api.haccpTemperatureAlerts(token), null),
        safeValue('pairing current', () => api.haccpCurrentSensorPairing(token), null),
        safeValue('cleaning active session', () => api.haccpList(token, '/cleaning/sessions/active') as Promise<{ data: HaccpCleaningSession | null }>, { data: null }),
        safeList('/cleaning/today-surfaces'),
      ]);
      const temperatureEquipmentList = equipment.data ?? [];
      if (dashboardData) setDashboard(dashboardData);
      setSensorGatewayStatus(gatewayStatus);
      setSensorSummary(sensorSummaryData);
      setSensors(sensorList);
      setTemperatureAlerts(temperatureAlertData);
      setPairing(pairingData);
      setActiveCleaningSession(activeCleaningData.data ?? null);
      setTodayCleaningSurfaces(todayCleaningData.data ?? []);
      setItems({
        temperatureEquipment: temperatureEquipmentList,
        temperatureReadings: readings.data ?? [],
        cleaningZones: zones.data ?? [],
        cleaningSessions: activeCleaningData.data ? [activeCleaningData.data] : [],
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

  async function refreshSensorSummary() {
    try {
      setSensorSummary(await api.haccpSensorsSummary(token));
    } catch {
      // Keep the last summary; the full refresh surface will show errors.
    }
  }

  async function refreshSensorsOnly() {
    try {
      const [gateway, summary, list, currentPairing] = await Promise.all([
        api.haccpSensorGatewayStatus(token),
        api.haccpSensorsSummary(token),
        api.haccpSensors(token),
        api.haccpCurrentSensorPairing(token),
      ]);
      setSensorGatewayStatus(gateway);
      setSensorSummary(summary);
      setSensors(list);
      setPairing(currentPairing);
    } catch {
      // Keep existing sensor state.
    }
  }

  async function refreshTemperatureAlerts() {
    try {
      const data = await api.haccpTemperatureAlerts(token);
      setTemperatureAlerts(data);
    } catch (err) {
      console.warn('[HACCP] Chargement alertes température impossible', err);
    }
  }

  async function startSensorPairing() {
    setSaving(true);
    setError(null);
    try {
      const gateway = await api.haccpSensorGatewayStatus(token);
      setSensorGatewayStatus(gateway);
      if (!gateway.ready) {
        throw new Error(sensorGatewayBlockingMessage(gateway));
      }
      setPairing(await api.haccpStartSensorPairing(token, 180));
      await refreshSensorsOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Appairage impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function stopSensorPairing() {
    setSaving(true);
    setError(null);
    try {
      setPairing(await api.haccpStopSensorPairing(token));
      await refreshSensorsOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arrêt de l’appairage impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function renameSensor(sensor: HaccpSensor, name: string) {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.haccpRenameSensor(token, sensor.id, name);
      setSensors((current) => upsertSensor(current, updated));
      await refreshSensorsOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Renommage impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function assignSensor(sensor: HaccpSensor, equipmentId: string) {
    setSaving(true);
    setError(null);
    try {
      const updated = equipmentId ? await api.haccpAssignSensor(token, sensor.id, equipmentId) : await api.haccpUnassignSensor(token, sensor.id);
      setSelectedSensorId(updated.id);
      setSensors((current) => upsertSensor(current, updated));
      await refreshSensorsOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Affectation impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function removeSensor(sensor: HaccpSensor, removeFromNetwork: boolean) {
    setSaving(true);
    setError(null);
    try {
      await api.haccpDeleteSensor(token, sensor.id, removeFromNetwork);
      setSensors((current) => current.filter((item) => item.id !== sensor.id));
      if (selectedSensorId === sensor.id) setSelectedSensorId(null);
      await refreshSensorsOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setSaving(false);
    }
  }

  function openCreate(section: SectionId) {
    setForm(emptyForm);
    setModal(section);
  }

  function setField(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openConfigCreate(kind: HaccpConfigKind) {
    setConfigForm({
      ...emptyConfigForm,
      type: kind === 'temperature' ? 'enceinte_positive' : kind === 'process' ? 'refroidissement' : '',
      min: kind === 'process' ? '0' : '',
      max: kind === 'process' ? '4' : '',
    });
    setSurfaceRows(emptySurfaceRows);
    setConfigModal(kind);
  }

  function setConfigField(key: string, value: string) {
    setConfigForm((current) => ({ ...current, [key]: value }));
  }

  async function submitConfig(e: FormEvent) {
    e.preventDefault();
    if (!configModal) return;
    const name = configForm.name.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      if (configModal === 'temperature') {
        const exists = temperatureEquipment.some((item) => normalizeName(item.name) === normalizeName(name));
        if (exists) throw new Error('Cet équipement de température existe déjà.');
        await api.haccpCreate(token, '/temperature/equipment', { name, type: configForm.type || 'enceinte_positive' });
      }
      if (configModal === 'process') {
        const exists = processEquipment.some((item) => `${String(item.type || '').toLowerCase()}::${normalizeName(item.name)}` === `${configForm.type}::${normalizeName(name)}`);
        if (exists) throw new Error('Cet équipement process existe déjà pour ce type.');
        await api.haccpCreate(token, '/cooling-equipment', {
          name,
          type: configForm.type || 'refroidissement',
        });
      }
      if (configModal === 'cleaning') {
        const exists = cleaningZones.some((item) => normalizeName(item.name) === normalizeName(name));
        if (exists) throw new Error('Cette zone de nettoyage existe déjà.');
        const surfaces = surfaceRows
          .map((surface) => ({ name: surface.name.trim(), frequency: surface.frequency || 'daily' }))
          .filter((surface) => surface.name);
        await api.haccpCreate(token, '/cleaning/zones', { name, description: configForm.description, surfaces });
      }
      setConfigModal(null);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
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

  async function removeConfig(kind: HaccpConfigKind, item: HaccpItem) {
    const id = item._id ?? item.id;
    if (!id) return;
    const endpoints: Record<HaccpConfigKind, string> = {
      temperature: `/temperature/equipment/${id}`,
      process: `/cooling-equipment/${id}`,
      cleaning: `/cleaning/zones/${id}`,
    };
    await api.haccpDelete(token, endpoints[kind]);
    await refreshAll();
  }

  async function refreshCleaningOnly() {
    const [active, today, zones, dashboardData] = await Promise.all([
      api.haccpList(token, '/cleaning/sessions/active'),
      api.haccpList(token, '/cleaning/today-surfaces'),
      api.haccpList(token, '/cleaning/zones'),
      api.haccpDashboard(token),
    ]);
    setActiveCleaningSession(active.data ?? null);
    setTodayCleaningSurfaces(active.data ? (today.data ?? []) : (today.data ?? []));
    setItems((current) => ({
      ...current,
      cleaningZones: zones.data ?? [],
      cleaningSessions: active.data ? [active.data] : [],
    }));
    setDashboard(dashboardData);
  }

  async function ensureCleaningSession() {
    if (activeCleaningSession) return activeCleaningSession;
    const created = await api.haccpCreate(token, '/cleaning/sessions/start', {});
    const session = created.data ?? null;
    setActiveCleaningSession(session);
    return session;
  }

  async function markCleaningSurface(surface: TodayCleaningSurface | { surfaceId: string; surfaceName: string; zoneId: string; zoneName: string }) {
    setSaving(true);
    setError(null);
    try {
      await ensureCleaningSession();
      const updated = await api.haccpCreate(token, '/cleaning/sessions/mark-surface', {
        surfaceId: surface.surfaceId,
        surfaceName: surface.surfaceName,
        zoneId: surface.zoneId,
        zoneName: surface.zoneName,
        notes: '',
      });
      setActiveCleaningSession(updated.data ?? null);
      await refreshCleaningOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nettoyage impossible à enregistrer.');
    } finally {
      setSaving(false);
    }
  }

  async function markAllCleaningSurfaces(surfaces: Array<TodayCleaningSurface | { surfaceId: string; surfaceName: string; zoneId: string; zoneName: string }>) {
    setSaving(true);
    setError(null);
    try {
      await ensureCleaningSession();
      let latest: HaccpCleaningSession | null = null;
      for (const surface of surfaces) {
        const updated = await api.haccpCreate(token, '/cleaning/sessions/mark-surface', {
          surfaceId: surface.surfaceId,
          surfaceName: surface.surfaceName,
          zoneId: surface.zoneId,
          zoneName: surface.zoneName,
          notes: '',
        });
        latest = updated.data ?? latest;
      }
      if (latest) setActiveCleaningSession(latest);
      await refreshCleaningOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de marquer toutes les surfaces.');
    } finally {
      setSaving(false);
    }
  }

  async function completeCleaningSession() {
    setSaving(true);
    setError(null);
    try {
      await api.haccpCreate(token, '/cleaning/sessions/complete', {});
      await refreshCleaningOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de terminer la session de nettoyage.');
    } finally {
      setSaving(false);
    }
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

  async function downloadReport(item: HaccpItem) {
    const id = item._id ?? item.id;
    if (!id || !item.pdfPath) return;
    const date = item.reportDate ? new Date(item.reportDate).toISOString().slice(0, 10) : 'haccp';
    await api.haccpDownloadDailyReport(token, id, `rapport-haccp-${date}.pdf`);
  }

  async function saveSensorThreshold(sensor: HaccpSensor, min: number, max: number) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      setError('Les seuils température sont invalides.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.haccpUpdateSensor(token, sensor.id, { temperatureMin: min, temperatureMax: max });
      setSensors((current) => upsertSensor(current, updated));
      await refreshTemperatureAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement des seuils impossible.');
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

  async function completeOnboarding(payload: HaccpOnboardingPayload): Promise<HaccpOnboardingSummary> {
    setSaving(true);
    setError(null);
    const created: string[] = [];
    const skipped: string[] = [];
    const existingTemperatureNames = new Set(temperatureEquipment.map((item) => normalizeName(item.name)));
    const existingProcessKeys = new Set(processEquipment.map((item) => `${String(item.type || '').toLowerCase()}::${normalizeName(item.name)}`));
    const existingCleaningNames = new Set(cleaningZones.map((item) => normalizeName(item.name)));

    try {
      for (const template of payload.temperatures.filter((item) => item.selected)) {
        const name = template.name.trim();
        if (!name) continue;
        const key = normalizeName(name);
        if (existingTemperatureNames.has(key)) {
          skipped.push(`${name} déjà présent`);
          continue;
        }
        await api.haccpCreate(token, '/temperature/equipment', { name, type: template.type.trim() || 'enceinte_positive' });
        existingTemperatureNames.add(key);
        created.push(name);
      }

      for (const template of payload.processes.filter((item) => item.selected)) {
        const name = template.name.trim();
        if (!name) continue;
        const key = `${template.type}::${normalizeName(name)}`;
        if (existingProcessKeys.has(key)) {
          skipped.push(`${name} déjà présent`);
          continue;
        }
        await api.haccpCreate(token, '/cooling-equipment', {
          name,
          type: template.type,
          temperatureRange: template.temperatureRange,
        });
        existingProcessKeys.add(key);
        created.push(name);
      }

      for (const template of payload.cleaningZones.filter((item) => item.selected)) {
        const name = template.name.trim();
        if (!name) continue;
        const key = normalizeName(name);
        if (existingCleaningNames.has(key)) {
          skipped.push(`${name} déjà présent`);
          continue;
        }
        await api.haccpCreate(token, '/cleaning/zones', {
          name,
          description: template.description,
          surfaces: template.surfaces
            .map((surface) => ({ name: surface.name.trim(), frequency: surface.frequency || 'daily' }))
            .filter((surface) => surface.name),
        });
        existingCleaningNames.add(key);
        created.push(name);
      }

      await refreshAll();
      return { created, skipped };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Configuration HACCP impossible.';
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  const TAB_HEADER_MAP: Record<string, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Tableau de bord HACCP',
      subtitle: 'Contrôles sanitaires, traçabilité, productions et rapports quotidiens.',
    },
    setup: {
      title: 'Configuration Zones & Matériels',
      subtitle: 'Référentiel HACCP : équipements, process et plan de nettoyage.',
    },
    sensors: {
      title: 'Capteurs de Température (IoT)',
      subtitle: 'Suivi en temps réel et appairage des sondes Zigbee sans fil.',
    },
    alerts: {
      title: 'Alertes Température',
      subtitle: 'Surveillance temps réel des frigos, congélateurs et enceintes connectées.',
    },
    temperatures: {
      title: 'Relevé des Températures',
      subtitle: 'Suivi quotidien et historique des températures de vos enceintes.',
    },
    cleaning: {
      title: 'Plan de Nettoyage & Désinfection',
      subtitle: 'Contrôles des surfaces et fréquences de nettoyage par zone.',
    },
    traceability: {
      title: 'Traçabilité & Étiquetage',
      subtitle: 'Enregistrement des matières premières et traçabilité secondaire.',
    },
    receptions: {
      title: 'Réception des Marchandises',
      subtitle: 'Contrôle à la livraison : hygiène, températures et emballages.',
    },
    process: {
      title: 'Suivi des Processus HACCP',
      subtitle: 'Refroidissement rapide, réchauffement et congélation.',
    },
    oil: {
      title: 'Contrôle des Huiles de Friture',
      subtitle: 'Mesure de polarité et renouvellement des bains d’huile.',
    },
    production: {
      title: 'Suivi de Production',
      subtitle: 'Fiches de fabrication et enregistrements des préparations.',
    },
    products: {
      title: 'Catalogue Produits',
      subtitle: 'Durées de conservation (DLC) et fiches produits sanitaires.',
    },
    labels: {
      title: 'Impression d’Étiquettes',
      subtitle: 'Édition et impression des étiquettes de traçabilité DLC.',
    },
    reports: {
      title: 'Rapports & Audits HACCP',
      subtitle: 'Génération et archivage des rapports sanitaires et registres.',
    },
  };

  const activeHeader = TAB_HEADER_MAP[activeTab] || {
    title: 'Module HACCP',
    subtitle: 'Gestion globale de la sécurité alimentaire.',
  };

  return (
    <>
      <div className="module-page haccp-module">
        <div className="haccp-topbar">
          <div>
            <p className="eyebrow">Qualité & Hygiène</p>
            <h1>{activeHeader.title}</h1>
            <p className="muted">{activeHeader.subtitle}</p>
          </div>
          <div className="haccp-header-actions">
            {activeTab === 'reports' ? (
              <button className="btn secondary" onClick={generateReport} disabled={saving}><FileText size={16} /> Générer rapport</button>
            ) : null}
            <button className="btn secondary" onClick={() => void refreshAll()} disabled={loading}><RefreshCw size={16} /> Actualiser</button>
          </div>
        </div>

        {error && <div className="alert error"><AlertCircle size={16} /> {error}</div>}

        {activeTab === 'dashboard' ? (
        <DashboardView
          dashboard={dashboard}
          readiness={readiness}
          loading={loading}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onGenerateReport={generateReport}
          onStartOnboarding={() => setShowOnboarding(true)}
          onSelectTab={(nextTab) => {
            const target = nextTab === 'temperature' ? 'temperatures' : nextTab;
            if (isHaccpTab(target)) setActiveTab(target);
            onNavigate?.(target === 'dashboard' ? 'haccp-dashboard' : `haccp-${target}`);
          }}
        />
      ) : null}
        {activeTab === 'setup' ? (
          <HaccpSetupManager
            temperatureEquipment={temperatureEquipment}
            processEquipment={processEquipment}
            cleaningZones={cleaningZones}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onCreate={openConfigCreate}
            onDelete={(kind, item) => void removeConfig(kind, item)}
          />
        ) : null}
        {activeTab === 'sensors' ? (
          <SensorsView
            sensors={sensors}
            summary={sensorSummary}
            pairing={pairing}
            selectedSensor={selectedSensor}
            gatewayStatus={sensorGatewayStatus}
            temperatureEquipment={temperatureEquipment}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            saving={saving}
            onStartPairing={startSensorPairing}
            onStopPairing={stopSensorPairing}
            onRefresh={refreshSensorsOnly}
            onSelect={(sensor) => setSelectedSensorId(sensor.id)}
            onRename={(sensor, name) => void renameSensor(sensor, name)}
            onAssign={(sensor, equipmentId) => void assignSensor(sensor, equipmentId)}
            onRemove={(sensor, removeFromNetwork) => void removeSensor(sensor, removeFromNetwork)}
            onBack={() => {
              setActiveTab('dashboard');
              onNavigate?.('haccp-dashboard');
            }}
          />
        ) : null}
        {activeTab === 'alerts' ? (
          <TemperatureAlertsView
            token={token}
            data={temperatureAlerts}
            sensors={sensors}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onSaveThreshold={(sensor, min, max) => void saveSensorThreshold(sensor, min, max)}
            onBack={() => {
              setActiveTab('dashboard');
              onNavigate?.('haccp-dashboard');
            }}
          />
        ) : null}
        {activeTab === 'cleaning' ? (
          <CleaningChecklistView
            zones={cleaningZones}
            todaySurfaces={todayCleaningSurfaces}
            activeSession={activeCleaningSession}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            saving={saving}
            onMarkSurface={(surface) => void markCleaningSurface(surface)}
            onMarkAll={(surfaces) => void markAllCleaningSurfaces(surfaces)}
            onComplete={() => void completeCleaningSession()}
            onBack={() => {
              setActiveTab('dashboard');
              onNavigate?.('haccp-dashboard');
            }}
          />
        ) : null}
        {activeTab !== 'dashboard' && activeTab !== 'setup' && activeTab !== 'sensors' && activeTab !== 'alerts' && activeTab !== 'labels' && activeTab !== 'cleaning' ? (
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
            onDownloadReport={(item) => void downloadReport(item)}
            saving={saving}
            onBack={() => {
              setActiveTab('dashboard');
              onNavigate?.('haccp-dashboard');
            }}
          />
        ) : null}
      </div>

      {configModal ? (
        <div className="modal-overlay haccp-modal-overlay">
          <form className="modal-content-wrapper modal-md" onSubmit={submitConfig}>
            <div className="modal-header">
              <h2>{configModalTitle(configModal)}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setConfigModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <HaccpConfigForm
                kind={configModal}
                form={configForm}
                setField={setConfigField}
                surfaces={surfaceRows}
                setSurfaces={setSurfaceRows}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setConfigModal(null)}>Annuler</button>
              <button className="btn btn-primary" disabled={saving}><Plus size={16} /> Créer</button>
            </div>
          </form>
        </div>
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

      {showOnboarding ? (
        <HaccpOnboardingWizard
          readiness={readiness}
          temperatureEquipment={temperatureEquipment}
          processEquipment={processEquipment}
          cleaningZones={cleaningZones}
          sensors={sensors}
          gatewayStatus={sensorGatewayStatus}
          pairing={pairing}
          onStartPairing={startSensorPairing}
          onStopPairing={stopSensorPairing}
          saving={saving}
          onComplete={completeOnboarding}
          onClose={() => setShowOnboarding(false)}
        />
      ) : null}
    </>
  );
}

function getModuleIcon(id: string, color: string = 'currentColor') {
  switch (id) {
    case 'sensors': return <Smartphone size={20} color={color} />;
    case 'temperatures': return <Thermometer size={20} color={color} />;
    case 'cleaning': return <Droplets size={20} color={color} />;
    case 'traceability': return <ClipboardList size={20} color={color} />;
    case 'receptions': return <Truck size={20} color={color} />;
    case 'process': return <Flame size={20} color={color} />;
    case 'oil': return <ScanLine size={20} color={color} />;
    case 'production': return <Factory size={20} color={color} />;
    case 'reports': return <FileText size={20} color={color} />;
    default: return <ClipboardList size={20} color={color} />;
  }
}

function ModuleCard({ module, onClick }: { module: HaccpDashboard['modules'][number]; onClick: () => void }) {
  const hasExpectedControls = module.expected > 0;
  const status = !hasExpectedControls ? 'Aucun prévu' : module.issues > 0 ? module.score < 60 ? 'Critique' : 'À vérifier' : 'Conforme';
  const badgeClass = !hasExpectedControls ? 'neutral' : status === 'Conforme' ? 'ok' : status === 'À vérifier' ? 'warning' : 'danger';

  const iconColor = !hasExpectedControls ? '#64748b' : status === 'Conforme' ? '#10b981' : status === 'À vérifier' ? '#f59e0b' : '#ef4444';
  const cardBorderColor = !hasExpectedControls ? 'rgba(100, 116, 139, 0.14)' : status === 'Conforme' ? 'rgba(16, 185, 129, 0.12)' : status === 'À vérifier' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)';
  const cardBgGlow = !hasExpectedControls ? 'rgba(100, 116, 139, 0.01)' : status === 'Conforme' ? 'rgba(16, 185, 129, 0.01)' : status === 'À vérifier' ? 'rgba(245, 158, 11, 0.01)' : 'rgba(239, 68, 68, 0.01)';
  const displayScore = hasExpectedControls ? module.score : 0;

  return (
    <div
      className={`haccp-module-card card-hover-effect status-${badgeClass}`}
      onClick={onClick}
      style={{
        background: `linear-gradient(135deg, white 0%, ${cardBgGlow} 100%)`,
        border: `1px solid ${cardBorderColor}`,
        borderRadius: '20px',
        padding: '1.5rem',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '210px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(9, 13, 22, 0.02)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-6px)';
        e.currentTarget.style.boxShadow = '0 20px 40px rgba(9, 13, 22, 0.06)';
        e.currentTarget.style.borderColor = iconColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = '0 10px 30px rgba(9, 13, 22, 0.02)';
        e.currentTarget.style.borderColor = cardBorderColor;
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{
            background: `${iconColor}15`,
            padding: '0.6rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: iconColor
          }}>
            {getModuleIcon(module.id, iconColor)}
          </div>
        </div>

        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {module.label}
        </h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {module.description}
        </p>
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem', marginTop: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            Relevés : <strong>{module.completed}/{module.expected}</strong>
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: iconColor }}>
            {hasExpectedControls ? `${module.score}%` : '-'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="progress-bar-bg" style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', flexGrow: 1, marginRight: '0.75rem', overflow: 'hidden' }}>
            <div className="progress-bar-fill" style={{ width: `${displayScore}%`, height: '100%', background: iconColor, borderRadius: '3px' }}></div>
          </div>
          <span className={`haccp-status-pill ${badgeClass}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', flexShrink: 0 }}>
            <span className="status-dot" />
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}

function moduleStatusCopy(module: HaccpDashboard['modules'][number]) {
  const missing = Math.max(module.expected - module.completed, 0);
  const pending = Math.max(missing, module.issues);
  const base = {
    pending,
    expectedLabel: 'Contrôles attendus',
    completedLabel: 'Contrôles réalisés',
    pendingLabel: 'Éléments à traiter',
    pendingDetail: pending > 0 ? `${pending} point(s) restent à traiter.` : 'Aucun point en attente sur ce module.',
    emptyDetail: 'Aucun contrôle attendu automatiquement pour ce module aujourd’hui.',
  };

  const byModule: Record<string, Partial<typeof base>> = {
    temperature: {
      expectedLabel: 'Enceintes actives à relever',
      completedLabel: 'Relevés saisis aujourd’hui',
      pendingLabel: 'Enceintes sans relevé',
      pendingDetail: missing > 0 ? `${missing} enceinte(s) active(s) n’ont pas encore de relevé aujourd’hui.` : 'Toutes les enceintes attendues ont un relevé.',
    },
    cleaning: {
      expectedLabel: 'Surfaces prévues au nettoyage',
      completedLabel: 'Surfaces nettoyées',
      pendingLabel: 'Surfaces restantes',
      pendingDetail: missing > 0 ? `${missing} surface(s) prévues restent à nettoyer.` : 'Toutes les surfaces prévues sont nettoyées.',
    },
    traceability: {
      expectedLabel: 'Traçabilités créées',
      completedLabel: 'Traçabilités complètes',
      pendingLabel: 'Fiches incomplètes',
      pendingDetail: module.issues > 0 ? `${module.issues} traçabilité(s) sont sans photo, lot ou produit.` : 'Les traçabilités enregistrées sont complètes.',
      emptyDetail: 'Aucune traçabilité n’est attendue automatiquement. Ajoutez-en si vous avez des lots à suivre.',
    },
    receptions: {
      expectedLabel: 'Réceptions enregistrées',
      completedLabel: 'Réceptions complètes',
      pendingLabel: 'Réceptions incomplètes',
      pendingDetail: module.issues > 0 ? `${module.issues} réception(s) manquent de température, fournisseur ou produit.` : 'Les réceptions enregistrées sont complètes.',
      emptyDetail: 'Aucune réception enregistrée aujourd’hui.',
    },
    process: {
      expectedLabel: 'Sessions froid/chaud lancées',
      completedLabel: 'Sessions terminées',
      pendingLabel: 'Sessions à clôturer',
      pendingDetail: pending > 0 ? `${pending} session(s) froid/chaud doivent être terminées avec température finale.` : 'Toutes les sessions froid/chaud sont terminées.',
      emptyDetail: 'Aucune session de refroidissement, congélation ou remise en température lancée aujourd’hui.',
    },
    oil: {
      expectedLabel: 'Équipements huile actifs',
      completedLabel: 'Contrôles huile réalisés',
      pendingLabel: 'Équipements sans contrôle',
      pendingDetail: missing > 0 ? `${missing} équipement(s) huile n’ont pas encore de contrôle.` : 'Tous les équipements huile actifs ont été contrôlés.',
    },
    production: {
      expectedLabel: 'Productions lancées',
      completedLabel: 'Productions terminées',
      pendingLabel: 'Productions à clôturer',
      pendingDetail: pending > 0 ? `${pending} production(s) ne sont pas encore terminées.` : 'Toutes les productions lancées sont terminées.',
      emptyDetail: 'Aucune production HACCP lancée aujourd’hui.',
    },
  };

  return { ...base, ...(byModule[module.id] || {}) };
}

function ModuleStatusModal({ module, alerts, onClose, onOpenModule }: { module: HaccpDashboard['modules'][number]; alerts: HaccpDashboard['alerts']; onClose: () => void; onOpenModule: () => void }) {
  const status = !module.expected ? 'Aucun prévu' : module.issues > 0 ? module.score < 60 ? 'Critique' : 'À vérifier' : 'Conforme';
  const tone = status === 'Conforme' ? '#10b981' : status === 'À vérifier' ? '#f59e0b' : status === 'Critique' ? '#ef4444' : '#64748b';
  const copy = moduleStatusCopy(module);
  const hasExpectedControls = module.expected > 0;

  return (
    <div className="modal-overlay haccp-modal-overlay" onClick={onClose}>
      <div className="modal-content-wrapper modal-md" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{module.label}</h2>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>{module.description}</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            <MetricMini label={copy.expectedLabel} value={module.expected} />
            <MetricMini label={copy.completedLabel} value={module.completed} />
            <MetricMini label={copy.pendingLabel} value={copy.pending} tone={tone} />
          </div>

          <div style={{ border: `1px solid ${tone}33`, background: `${tone}10`, borderRadius: 14, padding: '1rem' }}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: tone }}>
              <AlertCircle size={17} /> {status}
            </strong>
            <p style={{ margin: '0.5rem 0 0', color: 'var(--text-main)', fontWeight: 600 }}>
              {hasExpectedControls ? copy.pendingDetail : copy.emptyDetail}
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>Alertes du module</h3>
            {alerts.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {alerts.map((alert, index) => (
                  <div key={`${alert.module}-${index}`} className={`alert ${alert.severity === 'critical' ? 'error' : 'warning'}`} style={{ margin: 0 }}>
                    <AlertTriangle size={15} /> {alert.message}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>Aucune alerte ouverte pour ce module.</p>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>
          <button type="button" className="btn btn-primary" onClick={onOpenModule}>Ouvrir le module</button>
        </div>
      </div>
    </div>
  );
}

function MetricMini({ label, value, tone = '#0f172a' }: { label: string; value: number; tone?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '0.85rem', background: '#fff' }}>
      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ display: 'block', color: tone, fontSize: '1.55rem', lineHeight: 1.1, marginTop: '0.35rem' }}>{value}</strong>
    </div>
  );
}

function DashboardView({ dashboard, readiness, loading, searchQuery, setSearchQuery, onGenerateReport, onStartOnboarding, onSelectTab }: { dashboard: HaccpDashboard | null; readiness: HaccpReadiness; loading: boolean; searchQuery: string; setSearchQuery: (value: string) => void; onGenerateReport: () => void; onStartOnboarding: () => void; onSelectTab?: (tabName: string) => void }) {
  const [selectedModule, setSelectedModule] = useState<HaccpDashboard['modules'][number] | null>(null);
  if (loading && !dashboard) return <div className="empty-state">Chargement HACCP...</div>;
  if (!dashboard) return <div className="empty-state">Aucune donnée HACCP disponible.</div>;
  const filteredModules = dashboard.modules.filter((module) => {
    if (module.id === 'reports') return false;
    const query = searchQuery.trim().toLowerCase();
    return !query || `${module.label} ${module.description} ${module.score}`.toLowerCase().includes(query);
  });
  const coveredModules = dashboard.modules.filter((module) => module.completed > 0).length;
  const criticalCount = dashboard.alerts.filter((alert) => alert.severity === 'critical').length;
  const warningCount = dashboard.alerts.filter((alert) => alert.severity === 'warning').length;
  const selectedAlerts = selectedModule ? dashboard.alerts.filter((alert) => alert.module === selectedModule.id) : [];

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
      {readiness.progress < 100 ? (
        <HaccpSetupCard readiness={readiness} onStart={onStartOnboarding} />
      ) : null}
      <div className="haccp-summary-row" style={{ display: 'flex', gap: '2.5rem', marginBottom: '2rem', padding: '0.5rem 0', flexWrap: 'wrap' }}>
        {/* Contrôles manquants */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            background: criticalCount ? 'rgba(239, 68, 68, 0.1)' : warningCount ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            padding: '0.75rem',
            borderRadius: '12px',
            display: 'flex',
            color: criticalCount ? '#ef4444' : warningCount ? '#f59e0b' : '#10b981'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contrôles manquants</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1 }}>{criticalCount + warningCount}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 550 }}>({criticalCount} critiques, {warningCount} à surveiller)</span>
            </div>
          </div>
        </div>

        {/* Vertical divider */}
        <div style={{ width: '1px', background: '#e2e8f0', alignSelf: 'stretch' }} className="haccp-summary-divider" />

        {/* Score HACCP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '0.75rem',
            borderRadius: '12px',
            display: 'flex',
            color: '#10b981'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score HACCP</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1 }}>{dashboard.score}%</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 550 }}>de conformité aujourd'hui</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <div className="haccp-list-panel" style={{ padding: 0 }}>
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
          <div className="haccp-dashboard-grid">
            {filteredModules.map((module) => (
              <ModuleCard key={module.id} module={module} onClick={() => setSelectedModule(module)} />
            ))}
          </div>
        </div>
      </div>

      {selectedModule ? (
        <ModuleStatusModal
          module={selectedModule}
          alerts={selectedAlerts}
          onClose={() => setSelectedModule(null)}
          onOpenModule={() => {
            const target = selectedModule.id === 'temperature' ? 'temperatures' : selectedModule.id;
            setSelectedModule(null);
            onSelectTab?.(target);
          }}
        />
      ) : null}
    </div>
  );
}

function HaccpSetupCard({ readiness, onStart }: { readiness: HaccpReadiness; onStart: () => void }) {
  if (readiness.progress === 100) return null;

  return (
    <section className="card-modern stocks-setup-card haccp-setup-card" style={{ padding: '1.25rem 1.5rem' }}>
      <div className="section-header-modern" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 'none', paddingBottom: 0 }}>
        <div className="section-info">
          <span className="card-title" style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings2 size={18} color="#10b981" /> Configuration initiale HACCP
          </span>
          <span className="section-tagline" style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Configuration initiale à lancer. Les contrôles terrain passent ensuite par l’application ToqueHub.
          </span>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onStart}
          style={{ borderRadius: '10px', fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          Démarrer <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

function HaccpIllustration() {
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
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Plan de Maîtrise Sanitaire</span>
            <span className="badge badge-reception" style={{ fontSize: '0.72rem', textTransform: 'none', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', borderColor: 'transparent' }}>Actif</span>
          </div>

          {[
            { label: 'Enceintes de température', val: 100, color: '#10b981' },
            { label: 'Process chaud / froid', val: 100, color: '#3b82f6' },
            { label: 'Zones & surfaces de nettoyage', val: 100, color: '#f59e0b' },
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
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Prêt</span>
              </div>
              <div className="progress-bar-bg" style={{ height: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div className="progress-bar-fill" style={{ width: `${item.val}%`, height: '100%', background: item.color, borderRadius: '3px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HaccpOnboardingWelcome({ onStart, onClose }: { onStart: () => void; onClose?: () => void }) {
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
          Bienvenue sur le module <span style={{ color: '#10b981' }}>HACCP</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.6, marginBottom: '2rem' }}>
          ToqueHub main sert à installer le socle métier : équipements, zones et surfaces. Les relevés terrain, la traçabilité, le nettoyage et les rapports du quotidien passent ensuite par l’application ToqueHub.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', flexShrink: 0 }}><Thermometer size={16} /></div>
            <span>Enceintes de température (chambres froides, frigos)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', flexShrink: 0 }}><Snowflake size={16} /></div>
            <span>Process chaud et froid (cuisson, refroidissement, congélation)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', flexShrink: 0 }}><ShieldCheck size={16} /></div>
            <span>Plan de nettoyage (zones, surfaces et fréquences)</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onStart} style={{ padding: '0.8rem 1.5rem', fontSize: '0.92rem' }}>
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
        <HaccpIllustration />
      </div>
    </div>
  );
}

function HaccpOnboardingAside({
  step,
  readiness,
  temperatures,
  processes,
  zones,
}: {
  step: HaccpOnboardingStep;
  readiness: HaccpReadiness;
  temperatures: TemperatureTemplate[];
  processes: ProcessTemplate[];
  zones: CleaningTemplate[];
}) {
  const steps = [
    { key: 'welcome', label: 'Bienvenue' },
    { key: 'temperatures', label: 'Équipements de température' },
    { key: 'process', label: 'Processus HACCP' },
    { key: 'cleaning', label: 'Plan de nettoyage' },
    { key: 'sensors', label: 'Capteurs Sonoff (IoT)' },
    { key: 'review', label: 'Résumé & Validation' },
  ] as Array<{ key: HaccpOnboardingStep; label: string }>;
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ShieldCheck size={28} color="#10b981" />
          <span style={{ fontWeight: 850, fontSize: '1.2rem', color: 'white', letterSpacing: '-0.03em' }}>
            TOQUE<span style={{ color: '#10b981' }}>HUB</span> HACCP
          </span>
        </div>

        <div>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: '#10b981', letterSpacing: '0.15em' }}>
            Installation guidée
          </span>
          <h3 style={{ color: 'white', fontSize: '1.35rem', marginTop: '0.3rem', fontWeight: 800, lineHeight: 1.25 }}>
            Assistant HACCP
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
          <div style={{ color: 'white', fontSize: '1rem', fontWeight: 800, marginTop: '0.2rem' }}>{readiness.progress}% Configuré</div>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', lineHeight: 1.4 }}>
            {temperatures.filter((item) => item.selected).length} température(s), {processes.filter((item) => item.selected).length} process, {zones.filter((item) => item.selected).length} zone(s)
          </p>
        </div>

        <div style={{ padding: '1.25rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <ShieldCheck size={20} color="#10b981" style={{ marginBottom: '0.4rem' }} />
          <h4 style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700 }}>Données sécurisées</h4>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', lineHeight: 1.45 }}>
            Les équipements, zones et surfaces configurés restent modifiables à tout moment.
          </p>
        </div>
      </div>
    </div>
  );
}

function HaccpOnboardingWizard({
  readiness,
  temperatureEquipment,
  processEquipment,
  cleaningZones,
  sensors,
  gatewayStatus,
  pairing,
  onStartPairing,
  onStopPairing,
  saving,
  onComplete,
  onClose,
}: {
  readiness: HaccpReadiness;
  temperatureEquipment: HaccpItem[];
  processEquipment: HaccpItem[];
  cleaningZones: HaccpItem[];
  sensors: HaccpSensor[];
  gatewayStatus?: HaccpSensorGatewayStatus | null;
  pairing?: HaccpPairingSession | null;
  onStartPairing?: () => void;
  onStopPairing?: () => void;
  saving: boolean;
  onComplete: (payload: HaccpOnboardingPayload) => Promise<HaccpOnboardingSummary>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<HaccpOnboardingStep>(readiness.progress ? readiness.nextStep : 'welcome');
  const [temperatures, setTemperatures] = useState<TemperatureTemplate[]>(DEFAULT_TEMPERATURE_TEMPLATES);
  const [processes, setProcesses] = useState<ProcessTemplate[]>(DEFAULT_PROCESS_TEMPLATES);
  const [zones, setZones] = useState<CleaningTemplate[]>(DEFAULT_CLEANING_TEMPLATES);
  const [summary, setSummary] = useState<HaccpOnboardingSummary | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const steps: HaccpOnboardingStep[] = ['welcome', 'temperatures', 'process', 'cleaning', 'sensors', 'review'];
  const stepIndex = steps.indexOf(step);

  const goNext = () => setStep(steps[Math.min(stepIndex + 1, steps.length - 1)]);
  const goBack = () => setStep(steps[Math.max(stepIndex - 1, 0)]);

  async function submitOnboarding() {
    setLocalError(null);
    try {
      const result = await onComplete({
        temperatures: temperatures.filter((item) => item.selected),
        processes: processes.filter((item) => item.selected),
        cleaningZones: zones.filter((item) => item.selected),
      });
      setSummary(result);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Configuration HACCP impossible.');
    }
  }

  const progressPercent = Math.round(((stepIndex + 1) / steps.length) * 100);

  return (
    <div
      className="modal-overlay hr-wizard-overlay haccp-onboarding-overlay"
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
        className="modal-card hr-wizard-modal haccp-onboarding-modal"
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
          <HaccpOnboardingWelcome onStart={() => setStep('temperatures')} onClose={onClose} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 2fr', height: '100%', width: '100%', minHeight: 0, flexGrow: 1 }}>
            {/* Sidebar */}
            <div style={{ background: '#0f172a', color: 'white', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', minHeight: 0 }}>
              <HaccpOnboardingAside
                step={step}
                readiness={readiness}
                temperatures={temperatures}
                processes={processes}
                zones={zones}
              />
            </div>

            {/* Main Content Area */}
            <div style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0, justifyContent: 'space-between' }}>
              {/* Stepper Progress bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0, position: 'relative' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column', flexGrow: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="badge badge-reception" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.15)', textTransform: 'none', fontSize: '0.8rem' }}>
                      Étape {stepIndex + 1} / {steps.length}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '2.5rem' }}>{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="progress-bar-bg" style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', marginRight: '2.5rem' }}>
                    <div className="progress-bar-fill" style={{ width: `${progressPercent}%`, height: '100%', background: '#10b981', borderRadius: '3px' }}></div>
                  </div>
                </div>

                {onClose && (
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
                )}
              </div>

              {/* Step rendering with AnimatePresence */}
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0, justifyContent: 'space-between' }}>
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto', paddingRight: '0.25rem', marginBottom: '1rem' }}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.16 }}
                      style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
                    >
                      {step === 'temperatures' && (
                        <EditableTemperatureStep items={temperatures} existing={temperatureEquipment} onChange={setTemperatures} />
                      )}
                      {step === 'process' && (
                        <EditableProcessStep items={processes} existing={processEquipment} onChange={setProcesses} />
                      )}
                      {step === 'cleaning' && (
                        <EditableCleaningStep items={zones} existing={cleaningZones} onChange={setZones} />
                      )}
                      {step === 'sensors' && (
                        <EditableSensorsStep
                          gatewayStatus={gatewayStatus ?? null}
                          pairing={pairing ?? null}
                          sensors={sensors}
                          onStartPairing={onStartPairing ?? (() => {})}
                          onStopPairing={onStopPairing ?? (() => {})}
                        />
                      )}
                      {step === 'review' && (
                        <HaccpOnboardingReview
                          temperatures={temperatures}
                          processes={processes}
                          zones={zones}
                          existing={{ temperatureEquipment, processEquipment, cleaningZones }}
                          summary={summary}
                          error={localError}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="hr-catalog-actions sticky" style={{ borderTop: '1px solid #eef2f7', background: 'rgba(255,255,255,0.9)', padding: '1rem 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {summary ? `${summary.created.length} créé(s), ${summary.skipped.length} déjà présent(s)` : `Étape ${stepIndex + 1} / ${steps.length}`}
                  </span>
                  <div className="haccp-onboarding-actions" style={{ display: 'flex', gap: '0.75rem' }}>
                    {stepIndex > 0 && !summary ? (
                      <button type="button" className="btn btn-secondary" onClick={goBack} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>
                        Retour
                      </button>
                    ) : null}
                    {step !== 'review' ? (
                      <button type="button" className="btn btn-primary" onClick={goNext} style={{ borderRadius: '10px', padding: '0.5rem 1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        Continuer <ArrowRight size={16} />
                      </button>
                    ) : summary ? (
                      <button type="button" className="btn btn-primary" onClick={onClose} style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}>
                        Terminer
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary" onClick={() => void submitOnboarding()} disabled={saving} style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}>
                        {saving ? 'Création...' : 'Créer la configuration'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function HaccpSetupManager({
  temperatureEquipment,
  processEquipment,
  cleaningZones,
  searchQuery,
  setSearchQuery,
  onCreate,
  onDelete,
}: {
  temperatureEquipment: HaccpItem[];
  processEquipment: HaccpItem[];
  cleaningZones: HaccpItem[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onCreate: (kind: HaccpConfigKind) => void;
  onDelete: (kind: HaccpConfigKind, item: HaccpItem) => void;
}) {
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'temperature' | 'process' | 'cleaning'>('all');

  const query = searchQuery.trim().toLowerCase();
  const filterRows = (rows: HaccpItem[]) => (!query ? rows : rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query)));

  const filteredTemperatures = filterRows(temperatureEquipment);
  const filteredProcess = filterRows(processEquipment);
  const filteredZones = filterRows(cleaningZones);
  const surfaceCount = cleaningZones.reduce((total, zone) => total + (Array.isArray(zone.surfaces) ? zone.surfaces.length : 0), 0);
  const totalCount = filteredTemperatures.length + filteredProcess.length + filteredZones.length;

  return (
    <div className="haccp-config-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section
        className="card-modern haccp-config-hero"
        style={{
          padding: '1.5rem 2rem',
          borderRadius: '24px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          color: 'var(--text-main)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
          border: '1px solid #e2e8f0',
        }}
      >
        <div className="section-info">
          <span
            className="card-title"
            style={{
              fontSize: '1.35rem',
              fontWeight: 900,
              color: 'var(--text-main)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <Settings2 size={22} color="#10b981" /> Configuration Zones & Matériels
          </span>
          <span className="section-tagline" style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.35rem', display: 'block' }}>
            Référentiel HACCP partagé avec l’application ToqueHub mobile : équipements, process et plan de nettoyage.
          </span>
        </div>
      </section>

      {/* Navigation Filter Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`haccp-subtab-btn ${activeSubTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('all')}
          >
            Tous les matériels ({totalCount})
          </button>
          <button
            type="button"
            className={`haccp-subtab-btn ${activeSubTab === 'temperature' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('temperature')}
          >
            <Thermometer size={15} /> Températures ({filteredTemperatures.length})
          </button>
          <button
            type="button"
            className={`haccp-subtab-btn ${activeSubTab === 'process' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('process')}
          >
            <Snowflake size={15} /> Process ({filteredProcess.length})
          </button>
          <button
            type="button"
            className={`haccp-subtab-btn ${activeSubTab === 'cleaning' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('cleaning')}
          >
            <ShieldCheck size={15} /> Nettoyage ({filteredZones.length})
          </button>
        </div>
      </div>

      {/* Main List Layout */}
      <div className="haccp-config-sections-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {(activeSubTab === 'all' || activeSubTab === 'temperature') && (
          <ConfigSectionRowList
            kind="temperature"
            title="Équipements de Température"
            subtitle="Chambres froides, réfrigérateurs, congélateurs et zones réfrigérées."
            icon={<Thermometer size={18} />}
            items={filteredTemperatures}
            onCreate={() => onCreate('temperature')}
            onDelete={(item) => onDelete('temperature', item)}
          />
        )}

        {(activeSubTab === 'all' || activeSubTab === 'process') && (
          <ConfigSectionRowList
            kind="process"
            title="Équipements de Process HACCP"
            subtitle="Fours, cellules de refroidissement et matériel de congélation."
            icon={<Snowflake size={18} />}
            items={filteredProcess}
            onCreate={() => onCreate('process')}
            onDelete={(item) => onDelete('process', item)}
          />
        )}

        {(activeSubTab === 'all' || activeSubTab === 'cleaning') && (
          <ConfigSectionRowList
            kind="cleaning"
            title="Zones & Surfaces de Nettoyage"
            subtitle="Plan de nettoyage HACCP : zones, surfaces et fréquences de contrôle."
            icon={<ShieldCheck size={18} />}
            items={filteredZones}
            onCreate={() => onCreate('cleaning')}
            onDelete={(item) => onDelete('cleaning', item)}
          />
        )}
      </div>
    </div>
  );
}

function ConfigSummaryCard({
  icon,
  label,
  value,
  detail,
  color,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
  color: 'emerald' | 'blue' | 'amber';
  active?: boolean;
  onClick?: () => void;
}) {
  const colorMap = {
    emerald: {
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.08)',
      border: 'rgba(16, 185, 129, 0.15)',
    },
    blue: {
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.08)',
      border: 'rgba(59, 130, 246, 0.15)',
    },
    amber: {
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.08)',
      border: 'rgba(245, 158, 11, 0.15)',
    },
  };
  const theme = colorMap[color];

  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: '0 12px 24px rgba(0, 0, 0, 0.04)' }}
      className={`haccp-config-summary-card ${active ? 'active' : ''}`}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1.25rem',
        borderRadius: '16px',
        border: active ? `2px solid ${theme.color}` : '1px solid #e2e8f0',
        background: 'white',
        cursor: 'pointer',
        boxShadow: active ? `0 6px 16px ${theme.bg}` : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      <span
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          display: 'grid',
          placeItems: 'center',
          color: theme.color,
          background: theme.bg,
          border: `1px solid ${theme.border}`,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
        <strong style={{ fontSize: '1.5rem', fontWeight: 850, color: 'var(--text-main)', lineHeight: 1 }}>{value}</strong>
        <small style={{ color: 'var(--text-main)', fontSize: '0.82rem', fontWeight: 800 }}>{label}</small>
        <em style={{ color: 'var(--text-muted)', fontStyle: 'normal', fontSize: '0.75rem', lineHeight: 1.3 }}>{detail}</em>
      </div>
    </motion.div>
  );
}

function ConfigSectionRowList({
  kind,
  title,
  subtitle,
  icon,
  items,
  onCreate,
  onDelete,
}: {
  kind: HaccpConfigKind;
  title: string;
  subtitle: string;
  icon: ReactNode;
  items: HaccpItem[];
  onCreate: () => void;
  onDelete: (item: HaccpItem) => void;
}) {
  const colorMap = {
    temperature: { color: '#10b981', light: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)' },
    process: { color: '#3b82f6', light: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)' },
    cleaning: { color: '#f59e0b', light: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.2)' },
  };
  const theme = colorMap[kind];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ display: 'inline-flex', color: theme.color, background: theme.light, border: `1px solid ${theme.border}`, padding: '0.35rem', borderRadius: '10px' }}>
            {icon}
          </span>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{title} ({items.length})</h3>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{subtitle}</span>
          </div>
        </div>
        <button
          type="button"
          className="haccp-add-category-btn"
          onClick={onCreate}
        >
          <Plus size={15} /> Ajouter
        </button>
      </div>

      <div className="haccp-equipment-list">
        <AnimatePresence>
          {items.map((item, index) => (
            <ConfigRowCard
              key={item._id ?? item.id ?? index}
              kind={kind}
              item={item}
              onDelete={() => onDelete(item)}
            />
          ))}
        </AnimatePresence>

        {items.length === 0 && (
          <div className="haccp-config-empty" style={{ padding: '2.5rem 1.5rem', textAlign: 'center', border: '1.5px dashed #cbd5e1', borderRadius: '14px', background: 'white' }}>
            <ClipboardList size={24} color="#94a3b8" style={{ marginBottom: '0.4rem' }} />
            <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: '#475569' }}>Aucun élément configuré dans cette catégorie</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCreate} style={{ marginTop: '0.75rem' }}>
              <Plus size={14} /> Ajouter un premier élément
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigRowCard({ kind, item, onDelete }: { kind: HaccpConfigKind; item: HaccpItem; onDelete: () => void }) {
  const surfaces = Array.isArray(item.surfaces) ? item.surfaces : [];
  const isNegative = (item.temperatureTarget ?? 0) < 0 || String(item.type || '').includes('negative');
  const isHot = item.type === 'rechauffement';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="haccp-equipment-row active"
    >
      <div className="haccp-equipment-row-main">
        <div className="haccp-equipment-row-info">
          <div className={`haccp-card-icon-badge ${kind === 'cleaning' ? 'cleaning' : kind === 'process' ? (isHot ? 'hot' : 'cold') : (isNegative ? 'negative' : 'positive')}`}>
            {kind === 'cleaning' ? <ShieldCheck size={18} /> : kind === 'process' ? (isHot ? <Flame size={18} /> : <Snowflake size={18} />) : (isNegative ? <Snowflake size={18} /> : <Thermometer size={18} />)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <strong className="haccp-equipment-title">{item.name || 'Sans nom'}</strong>

              {kind === 'temperature' && (
                <span className={`haccp-spec-pill target ${isNegative ? 'blue' : 'green'}`}>
                  Cible {item.temperatureTarget != null ? `${item.temperatureTarget > 0 ? `+${item.temperatureTarget}` : item.temperatureTarget}°C` : formatTemperatureTypeLabel(item.type ?? '')}
                </span>
              )}

              {kind === 'process' && (
                <span className={`haccp-spec-pill target ${isHot ? 'amber' : 'blue'}`}>
                  {item.temperatureRange ? `${item.temperatureRange.min}°C à ${item.temperatureRange.max}°C` : processLabel(item.type ?? '')}
                </span>
              )}

              {kind === 'cleaning' && (
                <span className="haccp-spec-pill range">{surfaces.length} surface(s)</span>
              )}
            </div>

            <span className="haccp-equipment-desc">
              {kind === 'cleaning' ? item.description || 'Zone de nettoyage' : kind === 'process' ? `${processLabel(item.type ?? '')} • Matériel HACCP` : `${formatTemperatureTypeLabel(item.type ?? '')} • Suivi de température`}
            </span>
          </div>
        </div>

        <div className="haccp-equipment-actions">
          <button
            type="button"
            className="haccp-instance-delete-btn"
            onClick={onDelete}
            title="Supprimer"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {kind === 'cleaning' && surfaces.length > 0 && (
        <div className="haccp-equipment-instances-box" style={{ marginTop: '0.2rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 750, color: '#475569', marginBottom: '0.3rem' }}>
            Surfaces contrôlées :
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {surfaces.map((s, idx) => (
              <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'white', padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem', fontWeight: 650, color: '#0f172a' }}>
                <span>{s.name}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 750, color: '#047857', background: '#ecfdf5', padding: '0.1rem 0.4rem', borderRadius: '5px' }}>
                  {s.frequency === 'daily' ? 'Quotidien' : s.frequency === 'weekly' ? 'Hebdo' : 'Mensuel'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function SectionView({ section, rows, products, searchQuery, setSearchQuery, processType, onProcessType, onCreate, onDelete, onAnalyzeImage, onGenerateReport, onDownloadReport, saving, onBack }: {
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
  onDownloadReport?: (item: HaccpItem) => void;
  saving: boolean;
  onBack: () => void;
}) {
  return (
    <div className="card-modern">
      <div className="section-header-modern">
        <div className="section-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onBack}
              style={{
                padding: '0.3rem 0.6rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25rem',
                fontSize: '0.8rem',
                fontWeight: 650,
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: 'white',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.color = 'var(--text-main)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <ArrowLeft size={14} /> Retour
            </button>
            <span className="card-title" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
              {labelFor(section)}
            </span>
          </div>
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
      <SimpleTable rows={rows} columns={columnsFor(section)} onDelete={onDelete} onDownloadReport={onDownloadReport} section={section} />
    </div>
  );
}

function CleaningChecklistView({
  zones,
  todaySurfaces,
  activeSession,
  searchQuery,
  setSearchQuery,
  saving,
  onMarkSurface,
  onMarkAll,
  onComplete,
  onBack,
}: {
  zones: HaccpItem[];
  todaySurfaces: TodayCleaningSurface[];
  activeSession: HaccpCleaningSession | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  saving: boolean;
  onMarkSurface: (surface: TodayCleaningSurface | { surfaceId: string; surfaceName: string; zoneId: string; zoneName: string }) => void;
  onMarkAll: (surfaces: Array<TodayCleaningSurface | { surfaceId: string; surfaceName: string; zoneId: string; zoneName: string }>) => void;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [view, setView] = useState<'today' | 'all'>('today');
  const cleanedIds = new Set((activeSession?.cleanedSurfaces ?? []).map((surface) => surface.surfaceId));
  const query = searchQuery.trim().toLowerCase();
  const allSurfaces = zones.flatMap((zone) => {
    const zoneId = String(zone._id ?? zone.id ?? '');
    return (Array.isArray(zone.surfaces) ? zone.surfaces : [])
      .filter((surface) => surface?.isActive !== false)
      .map((surface) => ({
        surfaceId: String(surface._id ?? surface.id ?? ''),
        surfaceName: String(surface.name ?? ''),
        zoneId,
        zoneName: String(zone.name ?? 'Zone'),
        frequency: String(surface.frequency ?? 'daily'),
        lastCleaned: surface.lastCleaned ?? null,
      }))
      .filter((surface) => surface.surfaceId && surface.surfaceName);
  });
  const visibleToday = todaySurfaces.filter((surface) => !query || `${surface.zoneName} ${surface.surfaceName} ${surface.frequency ?? ''}`.toLowerCase().includes(query));
  const visibleAll = allSurfaces.filter((surface) => !query || `${surface.zoneName} ${surface.surfaceName} ${surface.frequency ?? ''}`.toLowerCase().includes(query));
  const activeList = view === 'today' ? visibleToday : visibleAll;
  const remainingList = activeList.filter((surface) => !cleanedIds.has(surface.surfaceId));
  const completedCount = activeSession?.cleanedSurfaces?.length ?? 0;
  const totalCount = allSurfaces.length;

  return (
    <div className="card-modern">
      <div className="section-header-modern">
        <div className="section-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
              <ArrowLeft size={14} /> Retour
            </button>
            <span className="card-title" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
              Nettoyage
            </span>
          </div>
          <span className="section-tagline">
            {remainingList.length} surface(s) en attente sur {view === 'today' ? 'le plan du jour' : 'toutes les zones'}
          </span>
        </div>
        <div className="haccp-filter-right">
          <button type="button" className="btn btn-secondary" onClick={() => onMarkAll(remainingList)} disabled={saving || !remainingList.length}>
            <CheckCircle2 size={16} /> Tout cocher
          </button>
          <button type="button" className="btn btn-primary" onClick={onComplete} disabled={saving || !activeSession}>
            Terminer la session
          </button>
        </div>
      </div>

      <div className="haccp-summary-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <MetricMini label="Surfaces configurées" value={totalCount} />
        <MetricMini label="Nettoyées session" value={completedCount} tone="#10b981" />
        <MetricMini label="À faire maintenant" value={remainingList.length} tone={remainingList.length ? '#f59e0b' : '#10b981'} />
      </div>

      <div className="haccp-filter-bar">
        <div className="haccp-filter-left">
          <div className="haccp-search">
            <Search size={14} />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Rechercher une zone ou surface..." />
          </div>
          <div style={{ display: 'inline-flex', gap: '0.35rem', padding: '0.25rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <button type="button" className={`btn btn-sm ${view === 'today' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('today')}>
              Aujourd’hui ({visibleToday.length})
            </button>
            <button type="button" className={`btn btn-sm ${view === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('all')}>
              Toutes les surfaces ({visibleAll.length})
            </button>
          </div>
        </div>
      </div>

      {!allSurfaces.length ? (
        <div className="haccp-empty-state">
          <ShieldCheck size={40} />
          <p>Aucune zone de nettoyage configurée. Ajoutez les zones depuis “Zones & matériels”.</p>
        </div>
      ) : !activeList.length ? (
        <div className="haccp-empty-state">
          <CheckCircle2 size={40} />
          <p>{view === 'today' ? 'Toutes les surfaces prévues aujourd’hui sont à jour.' : 'Aucune surface ne correspond à la recherche.'}</p>
        </div>
      ) : (
        <div className="haccp-equipment-list">
          {activeList.map((surface) => {
            const isCompleted = cleanedIds.has(surface.surfaceId);
            return (
              <div key={`${surface.zoneId}-${surface.surfaceId}`} className={`haccp-equipment-row ${isCompleted ? 'active' : ''}`}>
                <div className="haccp-equipment-row-main">
                  <div className="haccp-equipment-row-info">
                    <div className={`haccp-card-icon-badge ${isCompleted ? 'positive' : 'cleaning'}`}>
                      {isCompleted ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                    </div>
                    <div>
                      <strong className="haccp-equipment-title">{surface.surfaceName}</strong>
                      <span className="haccp-equipment-desc">
                        {surface.zoneName} • {frequencyLabel(surface.frequency ?? 'daily')}
                        {surface.lastCleaned ? ` • Dernier nettoyage ${new Date(surface.lastCleaned).toLocaleDateString('fr-FR')}` : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`btn ${isCompleted ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={() => onMarkSurface(surface)}
                    disabled={saving || isCompleted}
                  >
                    <CheckCircle2 size={16} />
                    {isCompleted ? 'Nettoyé' : 'Cocher'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemperatureAlertsView({
  token,
  data,
  sensors,
  searchQuery,
  setSearchQuery,
  onSaveThreshold,
  onBack,
}: {
  token: string;
  data: HaccpTemperatureAlertData | null;
  sensors: HaccpSensor[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onSaveThreshold: (sensor: HaccpSensor, min: number, max: number) => void;
  onBack: () => void;
}) {
  const [historySensor, setHistorySensor] = useState<HaccpSensor | null>(null);
  const [historyReadings, setHistoryReadings] = useState<HaccpSensorReading[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const fallbackData = useMemo<HaccpTemperatureAlertData>(() => buildLocalTemperatureAlertData(sensors), [sensors]);
  const current = data ?? fallbackData;
  const query = searchQuery.trim().toLowerCase();
  const visibleSensors = current.sensors.filter((sensor) => !query || JSON.stringify(sensor).toLowerCase().includes(query));
  const mostRecent = current.recentReadings.slice(0, 8);

  async function openSensorHistory(sensor: HaccpSensor) {
    setHistorySensor(sensor);
    setHistoryReadings([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const readings = await api.haccpSensorReadings(token, sensor.id);
      setHistoryReadings(readings);
    } catch (error) {
      console.warn('[HACCP] Historique capteur indisponible', error);
      setHistoryError('Impossible de charger l’historique du capteur.');
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="haccp-sensors-page">
      <div className="haccp-sensors-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}><ArrowLeft size={14} /> Retour</button>
        <div className="haccp-search">
          <Search size={14} />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Rechercher une enceinte, un capteur..." />
        </div>
      </div>

      <div className="haccp-sensors-kpis">
        <SensorMetric label="Enceintes suivies" value={current.summary.assignedSensors} detail={`${current.summary.totalSensors} capteur(s)`} tone="ok" />
        <SensorMetric label="Critiques" value={current.summary.critical} detail="Hors plage forte" tone={current.summary.critical > 0 ? 'danger' : 'ok'} />
        <SensorMetric label="À surveiller" value={current.summary.warning} detail="Écart léger" tone={current.summary.warning > 0 ? 'danger' : 'neutral'} />
        <SensorMetric label="Hors ligne" value={current.summary.offlineSensors} detail="Sans relevé récent" tone={current.summary.offlineSensors > 0 ? 'danger' : 'neutral'} />
      </div>

      <div className="alert-modern info" style={{ margin: '1rem 0' }}>
        <Bell size={17} />
        Les seuils de température affichés ici sont ceux utilisés pour envoyer les notifications sur l’app mobile en cas d’alerte.
      </div>

      {current.alerts.length ? (
        <div className="alert-modern error" style={{ margin: '1rem 0' }}>
          <AlertTriangle size={17} />
          {current.alerts.length} alerte(s) température ouverte(s). Les relevés automatiques sont enregistrés dans l’onglet Températures et repris dans les rapports.
        </div>
      ) : (
        <div className="alert-modern success" style={{ margin: '1rem 0' }}>
          <CheckCircle2 size={17} />
          Aucune alerte température ouverte. Les capteurs affectés alimentent automatiquement la traçabilité HACCP.
        </div>
      )}

      <div className="haccp-equipment-list" style={{ marginTop: '1rem' }}>
        {visibleSensors.map((sensor) => {
          const temp = sensor.currentTemperature == null ? null : Number(sensor.currentTemperature);
          const threshold = sensor.threshold ?? sensor.temperatureThreshold ?? localTemperatureThreshold(sensor.assignedEquipment);
          const status = sensor.temperatureStatus ?? localTemperatureStatus(temp, threshold);
          const tone = status.status === 'critical' ? '#dc2626' : status.status === 'warning' ? '#d97706' : status.status === 'ok' ? '#059669' : '#64748b';
          const thresholdLabel = threshold ? `Plage ${threshold.label}: ${threshold.min}°C à ${threshold.max}°C` : 'Seuil non défini';
          return (
            <div key={sensor.id} className="haccp-equipment-row active" style={{ cursor: 'pointer' }} onClick={() => void openSensorHistory(sensor)}>
              <div className="haccp-equipment-row-main">
                <div className="haccp-equipment-row-info">
                  <div className={`haccp-card-icon-badge ${status.status === 'critical' ? 'hot' : status.status === 'ok' ? 'positive' : 'cleaning'}`}>
                    <Thermometer size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      <strong className="haccp-equipment-title">{sensor.assignedEquipment?.name ?? sensorDisplayName(sensor)}</strong>
                      <span className="haccp-spec-pill target" style={{ background: `${tone}14`, color: tone, borderColor: `${tone}55` }}>
                        {temp == null ? '-' : `${temp.toFixed(1)}°C`}
                      </span>
                      <span className={`haccp-status-pill ${status.status === 'critical' ? 'danger' : status.status === 'ok' ? 'ok' : 'warning'}`}>
                        <span className="status-dot" />
                        {status.label}
                      </span>
                    </div>
                    <span className="haccp-equipment-desc">
                      {sensorDisplayName(sensor)} • {thresholdLabel} • Dernier relevé {sensor.lastSeenAt ? new Date(sensor.lastSeenAt).toLocaleString('fr-FR') : '-'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className={`haccp-status-pill ${sensorStatusClass(sensor.status)}`}>
                    <span className="status-dot" />
                    {sensorStatusLabel(sensor.status)}
                  </span>
                  <span className="haccp-spec-pill range">Batterie {sensor.battery == null ? '-' : `${Math.round(Number(sensor.battery))}%`}</span>
                </div>
              </div>
              <div className="haccp-equipment-instances-box" style={{ marginTop: '0.45rem' }} onClick={(event) => event.stopPropagation()}>
                <SensorThresholdEditor sensor={sensor} threshold={threshold} onSave={onSaveThreshold} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.6rem' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openSensorHistory(sensor)}>
                    <BarChart3 size={14} /> Voir courbe & relevés
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!visibleSensors.length ? (
        <div className="haccp-empty-state" style={{ marginTop: '1.25rem' }}>
          <Thermometer size={38} />
          <p>Aucun capteur trouvé. Affectez un capteur à une enceinte dans l’onglet Capteurs pour démarrer la surveillance.</p>
        </div>
      ) : null}

      <div className="card-modern" style={{ marginTop: '1.25rem' }}>
        <div className="haccp-list-header">
          <div>
            <span className="card-title">Derniers relevés automatiques</span>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>Ces valeurs alimentent automatiquement Températures et le PDF quotidien.</p>
          </div>
        </div>
        <SimpleTable
          rows={mostRecent}
          columns={['sensor.assignedEquipment.name', 'sensor.userName', 'temperature', 'humidity', 'measuredAt']}
          section="alerts"
        />
      </div>

      {historySensor ? (
        <SensorHistoryModal
          sensor={historySensor}
          readings={historyReadings}
          loading={historyLoading}
          error={historyError}
          onClose={() => setHistorySensor(null)}
          onRefresh={() => void openSensorHistory(historySensor)}
        />
      ) : null}
    </div>
  );
}

function SensorHistoryModal({
  sensor,
  readings,
  loading,
  error,
  onClose,
  onRefresh,
}: {
  sensor: HaccpSensor;
  readings: HaccpSensorReading[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [expandedReadings, setExpandedReadings] = useState(false);
  const temperatureReadings = readings
    .filter((reading) => reading.temperature != null)
    .sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime());
  const latest = temperatureReadings[temperatureReadings.length - 1] ?? null;
  const chartReadings = temperatureReadings.slice(-72);
  const intervalMinutes = estimateReadingIntervalMinutes(temperatureReadings);

  // Calculations for KPIs
  const tempVal = latest ? Number(latest.temperature) : null;
  const threshold = sensor.threshold ?? sensor.temperatureThreshold ?? localTemperatureThreshold(sensor.assignedEquipment);
  const status = sensor.temperatureStatus ?? localTemperatureStatus(tempVal, threshold);
  const tempTone = status.status === 'critical' ? 'danger' : status.status === 'warning' ? 'warning' : status.status === 'ok' ? 'ok' : 'neutral';

  const batteryVal = latest?.battery == null ? (sensor.battery == null ? null : Number(sensor.battery)) : Number(latest.battery);
  const batteryTone = batteryVal == null ? 'neutral' : batteryVal < 20 ? 'danger' : batteryVal < 50 ? 'warning' : 'ok';

  return (
    <div className="haccp-modal-overlay-modern" onClick={onClose}>
      <motion.div
        className="haccp-modal-card-modern"
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="haccp-modal-header-modern">
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
              <span className="haccp-live-pulse" />
              Historique température capteur
            </h3>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
              {sensorDisplayName(sensor)} • <strong>{sensor.assignedEquipment?.name ?? 'Non affecté'}</strong> • relevés toutes les {intervalMinutes ? `${intervalMinutes} min` : '5 min'} env.
            </p>
          </div>
          <button type="button" className="modal-close-btn-modern" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="haccp-modal-body-scrollable">
          <div className="haccp-kpi-grid-modern">
            {/* KPI 1: Dernière Temp */}
            <div className={`haccp-metric-card-modern tone-${tempTone}`}>
              <div className="haccp-metric-icon-wrapper">
                <Thermometer size={18} />
              </div>
              <span className="label">Dernière Temp.</span>
              <strong className="value">{latest ? `${Number(latest.temperature).toFixed(1)}°C` : '-'}</strong>
              <span className="detail">{latest ? new Date(latest.measuredAt).toLocaleString('fr-FR') : 'Aucun relevé'}</span>
            </div>

            {/* KPI 2: Relevés Chargés */}
            <div className="haccp-metric-card-modern tone-ok">
              <div className="haccp-metric-icon-wrapper">
                <Activity size={18} />
              </div>
              <span className="label">Relevés chargés</span>
              <strong className="value">{temperatureReadings.length}</strong>
              <span className="detail">Historique de l'enceinte</span>
            </div>

            {/* KPI 3: Humidité */}
            <div className="haccp-metric-card-modern tone-ok">
              <div className="haccp-metric-icon-wrapper">
                <Droplets size={18} />
              </div>
              <span className="label">Humidité</span>
              <strong className="value">{latest?.humidity == null ? '-' : `${Number(latest.humidity).toFixed(0)}%`}</strong>
              <span className="detail">Dernière mesure</span>
            </div>

            {/* KPI 4: Batterie */}
            <div className={`haccp-metric-card-modern tone-${batteryTone}`}>
              <div className="haccp-metric-icon-wrapper">
                <Battery size={18} />
              </div>
              <span className="label">Batterie</span>
              <strong className="value">{batteryVal == null ? '-' : `${Math.round(batteryVal)}%`}</strong>
              <span className="detail">Niveau de charge</span>
            </div>
          </div>

          <div className="haccp-chart-card-modern">
            <div className="haccp-list-header" style={{ marginBottom: '1.25rem' }}>
              <div>
                <span className="card-title">Courbe de température</span>
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.78rem' }}>Derniers relevés disponibles.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onRefresh}
                disabled={loading}
                style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualiser
              </button>
            </div>
            {loading ? (
              <div className="haccp-empty-state"><Activity size={32} className="spin" /><p>Chargement des relevés...</p></div>
            ) : error ? (
              <div className="alert-modern error"><AlertCircle size={16} /> {error}</div>
            ) : chartReadings.length ? (
              <TemperatureLineChart readings={chartReadings} threshold={threshold} />
            ) : (
              <div className="haccp-empty-state"><Thermometer size={32} /><p>Aucun relevé température disponible pour ce capteur.</p></div>
            )}
          </div>

          <div className="haccp-table-card-modern">
            <div className="haccp-list-header" style={{ marginBottom: '1.25rem' }}>
              <span className="card-title">Historique détaillé des relevés</span>
            </div>
            <div className="table-responsive">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Température</th>
                    <th>Humidité</th>
                    <th>Batterie</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const visibleReadingsList = [...temperatureReadings].reverse();
                    const slicedReadings = expandedReadings ? visibleReadingsList.slice(0, 80) : visibleReadingsList.slice(0, 10);
                    return slicedReadings.map((reading) => {
                      const rTemp = reading.temperature == null ? null : Number(reading.temperature);
                      const rStatus = rTemp == null || !threshold ? 'neutral' : (rTemp < threshold.min || rTemp > threshold.max) ? 'critical' : 'ok';
                      const pillClass = rStatus === 'critical' ? 'danger' : rStatus === 'ok' ? 'ok' : 'neutral';

                      const batt = reading.battery == null ? null : Number(reading.battery);
                      const battClass = batt == null ? '' : batt < 20 ? 'low' : batt < 50 ? 'medium' : 'high';

                      return (
                        <tr key={reading.id ?? reading.measuredAt}>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {new Date(reading.measuredAt).toLocaleString('fr-FR')}
                          </td>
                          <td>
                            <span className={`haccp-status-pill ${pillClass}`} style={{ fontSize: '0.85rem', padding: '0.25rem 0.65rem', fontWeight: 700 }}>
                              {reading.temperature == null ? '-' : `${Number(reading.temperature).toFixed(1)}°C`}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {reading.humidity == null ? '-' : `${Number(reading.humidity).toFixed(0)}%`}
                          </td>
                          <td>
                            {batt == null ? (
                              <span className="muted">-</span>
                            ) : (
                              <span className={`haccp-sensor-battery-badge ${battClass}`}>
                                <Battery size={11} />
                                {Math.round(batt)}%
                              </span>
                            )}
                          </td>
                          <td>
                            {reading.linkQuality == null ? (
                              <span className="muted">-</span>
                            ) : (
                              <span className="haccp-sensor-signal-badge">
                                <Wifi size={11} />
                                {reading.linkQuality}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
            {temperatureReadings.length > 10 && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '12px', padding: '0.45rem 1.25rem' }}
                  onClick={() => setExpandedReadings(!expandedReadings)}
                >
                  {expandedReadings ? (
                    <>
                      <ChevronUp size={14} /> Réduire l'historique
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} /> Afficher tout l'historique ({temperatureReadings.length - 10} relevés de plus)
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function TemperatureLineChart({ readings, threshold }: { readings: HaccpSensorReading[]; threshold?: { min: number; max: number; label?: string } | null }) {
  const values = readings.map((reading) => Number(reading.temperature)).filter(Number.isFinite);
  const minValue = Math.min(...values, ...(threshold ? [threshold.min] : []));
  const maxValue = Math.max(...values, ...(threshold ? [threshold.max] : []));
  const padding = Math.max(1, (maxValue - minValue) * 0.15);
  const min = minValue - padding;
  const max = maxValue + padding;
  const width = 860;
  const height = 280;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;

  const pointFor = (reading: HaccpSensorReading, index: number) => {
    const x = left + (readings.length === 1 ? innerWidth / 2 : (index / (readings.length - 1)) * innerWidth);
    const value = Number(reading.temperature);
    const y = top + ((max - value) / (max - min || 1)) * innerHeight;
    return { x, y, value };
  };

  const points = readings.map(pointFor);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const areaPath = points.length > 0
    ? `${path} L ${points[points.length - 1].x.toFixed(1)} ${(top + innerHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(top + innerHeight).toFixed(1)} Z`
    : '';
  const yFor = (value: number) => top + ((max - value) / (max - min || 1)) * innerHeight;

  const yMax = threshold ? yFor(threshold.max) : null;
  const yMin = threshold ? yFor(threshold.min) : null;

  const firstDate = readings[0] ? new Date(readings[0].measuredAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  const lastDate = readings.at(-1) ? new Date(readings.at(-1)!.measuredAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

  const gridSteps = 4;
  const gridValues = Array.from({ length: gridSteps + 1 }, (_, i) => min + (i * (max - min)) / gridSteps);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Courbe de température capteur"
        style={{ width: '100%', minWidth: 620, height: 'auto' }}
        className="haccp-chart-svg"
      >
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f766e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Background container */}
        <rect x={left} y={top} width={innerWidth} height={innerHeight} rx="16" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />

        {/* Gridlines */}
        {gridValues.map((val, idx) => (
          <line
            key={`grid-${idx}`}
            x1={left}
            y1={yFor(val)}
            x2={width - right}
            y2={yFor(val)}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.6"
          />
        ))}

        {/* Warning zones background (above max, below min) */}
        {yMax != null && yMax > top && (
          <rect
            x={left}
            y={top}
            width={innerWidth}
            height={yMax - top}
            fill="rgba(239, 68, 68, 0.02)"
          />
        )}
        {yMin != null && top + innerHeight > yMin && (
          <rect
            x={left}
            y={yMin}
            width={innerWidth}
            height={top + innerHeight - yMin}
            fill="rgba(239, 68, 68, 0.02)"
          />
        )}

        {/* Safe zone background (between min and max) */}
        {yMin != null && yMax != null && yMin > yMax && (
          <rect
            x={left}
            y={yMax}
            width={innerWidth}
            height={yMin - yMax}
            fill="rgba(16, 185, 129, 0.04)"
            stroke="rgba(16, 185, 129, 0.08)"
            strokeWidth="1"
          />
        )}

        {/* Threshold lines */}
        {threshold ? [threshold.min, threshold.max].map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={width - right}
              y1={yFor(value)}
              y2={yFor(value)}
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="5 5"
            />
            <text
              x={left + 12}
              y={yFor(value) - 6}
              fill="#b45309"
              fontSize="11"
              fontWeight="800"
            >
              Seuil: {value}°C
            </text>
          </g>
        )) : null}

        {/* Filled gradient area under line */}
        {areaPath && <path d={areaPath} fill="url(#chartGradient)" />}

        {/* Main temperature line path */}
        {path && <path d={path} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Interactive nodes */}
        {points.map((point, index) => (
          <circle
            key={`${readings[index].id ?? readings[index].measuredAt}-${index}`}
            cx={point.x}
            cy={point.y}
            r="4.5"
            fill="#0f766e"
            stroke="#ffffff"
            strokeWidth="2"
            style={{ filter: 'drop-shadow(0px 2px 4px rgba(15, 118, 110, 0.3))' }}
          />
        ))}

        {/* Labels */}
        <text x="8" y={top + 6} fill="#64748b" fontSize="11" fontWeight="600">{max.toFixed(1)}°C</text>
        <text x="8" y={top + innerHeight} fill="#64748b" fontSize="11" fontWeight="600">{min.toFixed(1)}°C</text>
        <text x={left} y={height - 14} fill="#64748b" fontSize="11" fontWeight="600">{firstDate}</text>
        <text x={width - right - 44} y={height - 14} fill="#64748b" fontSize="11" fontWeight="600">{lastDate}</text>
      </svg>
    </div>
  );
}

function estimateReadingIntervalMinutes(readings: HaccpSensorReading[]) {
  if (readings.length < 2) return null;
  const deltas = readings.slice(1).map((reading, index) => (
    Math.round((new Date(reading.measuredAt).getTime() - new Date(readings[index].measuredAt).getTime()) / 60000)
  )).filter((delta) => delta > 0 && delta < 180);
  if (!deltas.length) return null;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

function SensorThresholdEditor({ sensor, threshold, onSave }: { sensor: HaccpSensor; threshold?: { min: number; max: number; label?: string } | null; onSave: (sensor: HaccpSensor, min: number, max: number) => void }) {
  const [min, setMin] = useState(threshold ? String(threshold.min) : '');
  const [max, setMax] = useState(threshold ? String(threshold.max) : '');

  useEffect(() => {
    setMin(threshold ? String(threshold.min) : '');
    setMax(threshold ? String(threshold.max) : '');
  }, [sensor.id, threshold?.min, threshold?.max]);

  const minValue = Number(min);
  const maxValue = Number(max);
  const invalid = !Number.isFinite(minValue) || !Number.isFinite(maxValue) || minValue >= maxValue;
  const unchanged = threshold ? minValue === threshold.min && maxValue === threshold.max : false;

  return (
    <div className="haccp-custom-form-grid" style={{ alignItems: 'end' }}>
      <div className="haccp-custom-field">
        <label>Seuil minimum °C</label>
        <input type="number" step="0.1" value={min} onChange={(event) => setMin(event.target.value)} />
      </div>
      <div className="haccp-custom-field">
        <label>Seuil maximum °C</label>
        <input type="number" step="0.1" value={max} onChange={(event) => setMax(event.target.value)} />
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={invalid || unchanged}
        onClick={() => onSave(sensor, minValue, maxValue)}
        style={{ width: 'fit-content', borderRadius: '8px' }}
      >
        Enregistrer les seuils
      </button>
    </div>
  );
}

function SonoffPairingScanModal({
  gatewayStatus,
  pairing,
  sensors,
  onStartPairing,
  onStopPairing,
  onClose,
}: {
  gatewayStatus: HaccpSensorGatewayStatus | null;
  pairing: HaccpPairingSession | null;
  sensors?: HaccpSensor[];
  onStartPairing?: () => void;
  onStopPairing: () => void;
  onClose: () => void;
}) {
  const activePairing = pairing?.status === 'ACTIVE';
  const isSerialDetected = gatewayStatus?.zigbee2mqtt?.serialPortDetected ?? false;
  const isMqttConnected = gatewayStatus?.mqtt?.connected ?? false;
  const isGatewayReady = Boolean(gatewayStatus?.ready || activePairing);

  const discoveredSensors = useMemo(() => {
    if (pairing?.sensors?.length) return pairing.sensors;
    const discoveredIds = new Set(pairing?.discoveredIds ?? []);
    if (discoveredIds.size && sensors?.length) return sensors.filter((sensor) => discoveredIds.has(sensor.id));
    return activePairing ? sensors ?? [] : [];
  }, [activePairing, pairing?.discoveredIds, pairing?.sensors, sensors]);
  const discoveredCount = discoveredSensors.length || pairing?.discoveredIds?.length || 0;
  const durationSeconds = Math.max(
    1,
    pairing ? Math.round((new Date(pairing.expiresAt).getTime() - new Date(pairing.startedAt).getTime()) / 1000) : 60,
  );
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);

  useEffect(() => {
    if (!isGatewayReady) return;
    const timer = setInterval(() => {
      if (pairing?.expiresAt) {
        setSecondsLeft(Math.max(0, Math.ceil((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000)));
        return;
      }
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isGatewayReady, pairing?.expiresAt]);

  const progressPercent = Math.max(0, Math.min(100, ((durationSeconds - secondsLeft) / durationSeconds) * 100));

  return (
    <div
      className="modal-overlay sonoff-scan-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10005,
        padding: '1.5rem',
      }}
    >
      <motion.div
        className="modal-card sonoff-scan-modal-card"
        initial={{ opacity: 0, scale: 0.92, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 260 }}
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          borderRadius: '24px',
          padding: '2rem',
          boxShadow: '0 25px 60px rgba(0,0,0,0.18)',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1.5rem',
          position: 'relative',
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '0.4rem',
            borderRadius: '50%',
          }}
        >
          <X size={20} />
        </button>

        {!isGatewayReady ? (
          /* BLOCKED ERROR VIEW: IoT Hardware / Gateway Not Ready */
          <>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: '#fef2f2',
                border: '2px solid #fecaca',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '0.5rem',
              }}
            >
              <AlertTriangle size={36} color="#ef4444" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#991b1b', fontWeight: 800 }}>
                Appairage Impossible (IoT Non Prêt)
              </h3>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: 1.4 }}>
                Le scan de capteurs requiert la détection de la clé USB Sonoff 3.0 sur le serveur.
              </p>
            </div>

            {/* Checklist */}
            <div style={{ width: '100%', background: '#ffffff', border: '1px solid #fee2e2', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#334155' }}>
                  <img src="/zigbee.png" alt="Dongle" style={{ height: '24px' }} /> Clé USB Sonoff Dongle 3.0
                </span>
                <span className={`haccp-status-pill ${isSerialDetected ? 'ok' : 'danger'}`}>
                  <span className="status-dot" /> {isSerialDetected ? 'Détectée' : 'Non détectée'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#334155' }}>
                  <Radio size={16} color="#64748b" /> Service Passerelle (Mosquitto)
                </span>
                <span className={`haccp-status-pill ${isMqttConnected ? 'ok' : 'danger'}`}>
                  <span className="status-dot" /> {isMqttConnected ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>

            {/* Advice Box */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.85rem', fontSize: '0.82rem', color: '#475569', textAlign: 'left', lineHeight: 1.45 }}>
              💡 <strong>Action requise :</strong> Branchez la clé USB Sonoff Zigbee 3.0 sur votre serveur / box ToqueHub. La détection s'effectue automatiquement en quelques secondes.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{ flex: 1, borderRadius: '12px' }}
              >
                Fermer
              </button>
              {onStartPairing ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    if (isGatewayReady) {
                      onStartPairing();
                    }
                  }}
                  style={{ flex: 1, borderRadius: '12px' }}
                >
                  Réessayer la détection
                </button>
              ) : null}
            </div>
          </>
        ) : (
          /* SCANNING RADAR VIEW: All Conditions Met */
          <>
            {/* Visual Scanning Animation Header */}
            <div className="sonoff-scan-radar-container">
              <div className="radar-circle ring-1" />
              <div className="radar-circle ring-2" />
              <img src="/capteur.png" alt="Capteur Sonoff" className="sonoff-scan-center-img" />
              <div className="radar-status-dot" />
            </div>

            {/* Title & Description */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a', fontWeight: 800 }}>
                Appairage Capteur Sonoff
              </h3>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: 1.4 }}>
                Recherche de signal Zigbee en cours. Maintenez le bouton du capteur pendant <strong>5 secondes</strong>.
              </p>
            </div>

            {/* Progress Bar & Status */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700 }}>
                <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Radio size={14} className="radio-pulse-icon" /> Scan actif...
                </span>
                <span style={{ color: '#64748b' }}>{secondsLeft}s restant</span>
              </div>

              <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progressPercent}%`,
                    background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                    borderRadius: '4px',
                    transition: 'width 1s linear',
                  }}
                />
              </div>
            </div>

            {/* Discovered Sensors List */}
            <div style={{ width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', textAlign: 'left' }}>
                Capteurs Détectés ({discoveredCount})
              </span>

              {discoveredCount > 0 ? (
                discoveredSensors.length ? (
                  discoveredSensors.map((sensor) => (
                    <div key={sensor.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(16, 185, 129, 0.08)', padding: '0.65rem 0.85rem', borderRadius: '10px', color: '#065f46', fontWeight: 600, fontSize: '0.88rem' }}>
                      <CheckCircle2 size={18} color="#10b981" />
                      <span>{sensorDisplayName(sensor)} détecté !</span>
                    </div>
                  ))
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(16, 185, 129, 0.08)', padding: '0.65rem 0.85rem', borderRadius: '10px', color: '#065f46', fontWeight: 600, fontSize: '0.88rem' }}>
                    <CheckCircle2 size={18} color="#10b981" />
                    <span>{discoveredCount} capteur détecté !</span>
                  </div>
                )
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic', padding: '0.25rem 0' }}>
                  <Clock size={16} />
                  <span>En attente de détection...</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  onStopPairing();
                  onClose();
                }}
                style={{ flex: 1, borderRadius: '12px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}
              >
                <X size={16} /> Arrêter l'appairage
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
                style={{ flex: 1, borderRadius: '12px' }}
              >
                <CheckCircle2 size={16} /> {discoveredCount > 0 ? 'Valider et continuer' : 'Fermer'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

function SensorsView({
  sensors,
  summary,
  pairing,
  selectedSensor,
  gatewayStatus,
  temperatureEquipment,
  searchQuery,
  setSearchQuery,
  saving,
  onStartPairing,
  onStopPairing,
  onRefresh,
  onSelect,
  onRename,
  onAssign,
  onRemove,
  onBack,
}: {
  sensors: HaccpSensor[];
  summary: HaccpSensorSummary;
  pairing: HaccpPairingSession | null;
  selectedSensor: HaccpSensor | null;
  gatewayStatus: HaccpSensorGatewayStatus | null;
  temperatureEquipment: HaccpItem[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  saving: boolean;
  onStartPairing: () => void;
  onStopPairing: () => void;
  onRefresh: () => void;
  onSelect: (sensor: HaccpSensor) => void;
  onRename: (sensor: HaccpSensor, name: string) => void;
  onAssign: (sensor: HaccpSensor, equipmentId: string) => void;
  onRemove: (sensor: HaccpSensor, removeFromNetwork: boolean) => void;
  onBack: () => void;
}) {
  const [draftName, setDraftName] = useState('');
  const [draftEquipmentId, setDraftEquipmentId] = useState('');
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);

  const filteredSensors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sensors;
    return sensors.filter((sensor) => JSON.stringify(sensor).toLowerCase().includes(query));
  }, [searchQuery, sensors]);

  const activePairing = pairing?.status === 'ACTIVE';
  const selectedName = selectedSensor ? sensorDisplayName(selectedSensor) : '';
  const selectedAssignmentId = selectedSensor?.assignedEquipment?.id ?? '';
  const canSaveAssignment = Boolean(draftEquipmentId) && draftEquipmentId !== selectedAssignmentId;
  const canClearAssignment = Boolean(selectedAssignmentId);

  useEffect(() => {
    setDraftName(selectedName);
    setDraftEquipmentId(selectedSensor?.assignedEquipment?.id ?? '');
  }, [selectedSensor?.id, selectedName, selectedSensor?.assignedEquipment?.id]);

  useEffect(() => {
    if (activePairing) {
      setShowScanModal(true);
    }
  }, [activePairing]);

  function handleStartPairing() {
    setShowScanModal(true);
    const isReady = Boolean(gatewayStatus?.ready);
    if (isReady) {
      onStartPairing();
    }
  }

  return (
    <div className="haccp-sensors-page">
      {/* Clean toolbar: NO DUPLICATE REFRESH BUTTON */}
      <div className="haccp-sensors-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}><ArrowLeft size={14} /> Retour</button>

        <div className="haccp-search">
          <Search size={14} />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Rechercher un capteur..." />
        </div>

        {/* Discrete Diagnostic Button */}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setShowDiagnosticModal(!showDiagnosticModal)}
          title="Diagnostic Passerelle IoT"
        >
          <Settings2 size={14} /> Diagnostic IoT
        </button>

        {/* Main Pairing Action */}
        {activePairing ? (
          <button type="button" className="btn secondary" onClick={onStopPairing} disabled={saving} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>
            <X size={16} /> Stopper appairage
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={handleStartPairing} disabled={saving}>
            <Plus size={16} /> Appairer un capteur Sonoff
          </button>
        )}
      </div>

      {/* Pairing Scan Modal */}
      <AnimatePresence>
        {showScanModal && (
          <SonoffPairingScanModal
            gatewayStatus={gatewayStatus}
            pairing={pairing}
            sensors={sensors}
            onStartPairing={onStartPairing}
            onStopPairing={onStopPairing}
            onClose={() => setShowScanModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Discrete Diagnostic Modal if toggled */}
      <AnimatePresence>
        {showDiagnosticModal && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{ marginBottom: '1.25rem' }}
          >
            <SensorGatewayPanel status={gatewayStatus} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPIs Summary */}
      <div className="haccp-sensors-kpis">
        <SensorMetric label="Total Capteurs" value={summary.total} detail="Enregistrés" />
        <SensorMetric label="En Ligne" value={summary.online} detail="Relevé automatique" tone="ok" />
        <SensorMetric label="Hors Ligne" value={summary.offline} detail="À vérifier" tone={summary.offline > 0 ? 'danger' : 'neutral'} />
        <SensorMetric label="Batterie Moyenne" value={summary.averageBattery == null ? '-' : `${summary.averageBattery}%`} detail={sensorGlobalStatus(summary.globalStatus)} />
      </div>

      {/* Active Pairing Banner */}
      {activePairing ? (
        <div className="haccp-pairing-banner active-pulse" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <Radio size={24} className="radio-pulse-icon" />
            <div>
              <strong style={{ fontSize: '1rem', color: '#065f46' }}>Mode appairage Sonoff actif</strong>
              <span style={{ fontSize: '0.85rem', color: '#047857', display: 'block' }}>
                Maintenez le bouton du capteur Sonoff pendant 5 secondes. Détection automatique en cours...
              </span>
            </div>
          </div>
          <span className="haccp-status-pill ok">
            <span className="status-dot" />
            {pairing?.sensors?.length ?? pairing?.discoveredIds?.length ?? 0} capteur(s) trouvé(s)
          </span>
        </div>
      ) : null}

      {/* Empty State or Content */}
      {!filteredSensors.length ? (
        <div className="haccp-sensors-empty-card" style={{ marginTop: '1.5rem' }}>
          <div className="haccp-sensors-empty-visuals">
            <img src="/zigbee.png" alt="Dongle Sonoff USB" className="empty-img-dongle" />
            <div className="empty-plus-icon">+</div>
            <img src="/capteur.png" alt="Capteur Sonoff" className="empty-img-sensor" />
          </div>

          <h3>Aucun capteur Sonoff configuré</h3>
          <p>
            Suivez automatiquement la température de vos enceintes froides (chambres froides, frigos, congélateurs) 24h/24 et 7j/7 grâce aux capteurs sans fil Sonoff.
          </p>

          <div className="haccp-sensors-empty-steps">
            <div className="step-box">
              <span>1</span>
              <p>Branchez la <strong>Clé USB Sonoff Zigbee 3.0</strong> sur votre serveur ToqueHub.</p>
            </div>
            <div className="step-box">
              <span>2</span>
              <p>Cliquez ci-dessous et appuyez <strong>5s sur le bouton</strong> du capteur Sonoff.</p>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-lg" onClick={onStartPairing} disabled={saving}>
            <Radio size={18} /> Lancer l'appairage d'un capteur Sonoff
          </button>
        </div>
      ) : (
        <div className="haccp-equipment-list" style={{ marginTop: '1.5rem' }}>
          {filteredSensors.map((sensor) => {
            const isSelected = selectedSensor?.id === sensor.id;
            const temp = sensor.currentTemperature != null ? Number(sensor.currentTemperature) : null;
            const isTempAlert = temp != null && (temp > 8 || temp < -25);

            return (
              <div
                key={sensor.id}
                className={`haccp-equipment-row ${isSelected ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(sensor)}
              >
                <div className="haccp-equipment-row-main">
                  <div className="haccp-equipment-row-info">
                    <div className={`haccp-card-icon-badge ${sensor.status === 'ONLINE' ? 'positive' : 'cleaning'}`}>
                      <Radio size={18} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <strong className="haccp-equipment-title">{sensorDisplayName(sensor)}</strong>

                        {temp != null && (
                          <span className={`haccp-spec-pill target ${isTempAlert ? 'red' : 'green'}`}>
                            {temp.toFixed(1)}°C
                          </span>
                        )}

                        <span className={`haccp-status-pill ${sensorStatusClass(sensor.status)}`}>
                          <span className="status-dot" />
                          {sensorStatusLabel(sensor.status)}
                        </span>
                      </div>
                      <span className="haccp-equipment-desc">
                        {sensor.model ?? 'Capteur Sonoff'} • Batterie {sensor.battery == null ? '-' : `${Math.round(Number(sensor.battery))}%`} • Signal {sensor.linkQuality ? `${sensor.linkQuality} LQI` : '-'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {sensor.assignedEquipment ? (
                      <span className="haccp-spec-pill range" style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>
                        📍 {sensor.assignedEquipment.name}
                      </span>
                    ) : (
                      <span className="haccp-spec-pill range" style={{ background: '#fffbeb', color: '#92400e', borderColor: '#fde68a' }}>
                        Non affecté
                      </span>
                    )}

                    <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                      {isSelected ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                  </div>
                </div>

                {isSelected && (
                  <div className="haccp-equipment-instances-box" onClick={(e) => e.stopPropagation()} style={{ marginTop: '0.25rem' }}>
                    {/* Inline Stats Grid */}
                    <div className="haccp-custom-form-grid" style={{ marginBottom: '0.75rem' }}>
                      <div className="haccp-custom-field">
                        <label>Humidité ambiante</label>
                        <div style={{ background: 'white', padding: '0.5rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 650, color: '#0f172a', border: '1px solid #cbd5e1' }}>
                          {sensor.currentHumidity == null ? '-' : `${Number(sensor.currentHumidity).toFixed(0)}%`}
                        </div>
                      </div>
                      <div className="haccp-custom-field">
                        <label>Niveau de batterie</label>
                        <div style={{ background: 'white', padding: '0.5rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 650, color: '#0f172a', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Battery size={14} /> {sensor.battery == null ? '-' : `${Math.round(Number(sensor.battery))}%`}
                        </div>
                      </div>
                      <div className="haccp-custom-field">
                        <label>Qualité du signal (LQI)</label>
                        <div style={{ background: 'white', padding: '0.5rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 650, color: '#0f172a', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Wifi size={14} /> {sensor.linkQuality ?? '-'}
                        </div>
                      </div>
                      <div className="haccp-custom-field">
                        <label>Détails techniques</label>
                        <div style={{ background: 'white', padding: '0.5rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 650, color: '#0f172a', border: '1px solid #cbd5e1' }}>
                          {sensor.manufacturer ?? 'Sonoff'} {sensor.model ?? 'Zigbee'} · via {sensor.provider}
                        </div>
                      </div>
                    </div>

                    {/* Form Fields */}
                    <div className="haccp-custom-form-grid" style={{ marginBottom: '0.75rem' }}>
                      <div className="haccp-custom-field">
                        <label>Nom personnalisé du capteur</label>
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          placeholder="Ex: Capteur Cuisine, CF Positive..."
                        />
                      </div>
                      <div className="haccp-custom-field">
                        <label>Équipement HACCP associé</label>
                        <select value={draftEquipmentId} onChange={(e) => setDraftEquipmentId(e.target.value)}>
                          <option value="">{temperatureEquipment.length ? 'Choisir un équipement' : 'Aucun équipement de température disponible'}</option>
                          {temperatureEquipment.map((eq) => (
                            <option key={eq._id ?? eq.id} value={eq._id ?? eq.id}>{eq.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Actions panel */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={saving || !draftName.trim() || draftName.trim() === sensorDisplayName(sensor)}
                          onClick={() => onRename(sensor, draftName.trim())}
                          style={{ borderRadius: '8px' }}
                        >
                          Renommer
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={saving || !canSaveAssignment}
                          onClick={() => onAssign(sensor, draftEquipmentId)}
                          style={{ borderRadius: '8px' }}
                        >
                          Enregistrer l'affectation
                        </button>
                        {canClearAssignment && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={saving}
                            onClick={() => onAssign(sensor, '')}
                            style={{ borderRadius: '8px' }}
                          >
                            Désaffecter
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                          disabled={saving}
                          onClick={() => onRemove(sensor, false)}
                        >
                          <Trash2 size={13} style={{ marginRight: '0.2rem' }} /> Supprimer ToqueHub
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                          disabled={saving}
                          onClick={() => onRemove(sensor, true)}
                        >
                          <Trash2 size={13} style={{ marginRight: '0.2rem' }} /> Supprimer réseau
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SensorGatewayPanel({ status }: { status: HaccpSensorGatewayStatus | null }) {
  const [showDetails, setShowDetails] = useState(false);
  const tone = sensorGatewayTone(status?.status);

  const isMqttConfigured = status?.mqtt?.configured ?? false;
  const isMqttConnected = status?.mqtt?.connected ?? false;
  const isZigbeeKeyDetected = status?.zigbee2mqtt?.serialPortDetected ?? false;
  const brokerValue = status ? status.mqtt.url ?? (isMqttConfigured ? 'Configuré' : 'Non configuré') : 'Diagnostic en cours';
  const brokerDetail = status ? (isMqttConnected ? 'Opérationnel' : isMqttConfigured ? 'Configuré, déconnecté' : 'Non configuré') : 'En attente';
  const brokerTone = isMqttConnected ? 'ok' : status ? 'danger' : 'neutral';

  return (
    <div className={`haccp-gateway-compact tone-${tone}`}>
      <div className="haccp-gateway-compact-main">
        <div className="haccp-gateway-compact-status">
          <span className={`status-dot ${tone === 'ok' ? 'ok' : tone === 'danger' ? 'danger' : 'warning'}`} />
          <strong>Passerelle IoT :</strong>
          <span>{sensorGatewayLabel(status?.status)}</span>
        </div>

        <div className="haccp-gateway-compact-indicators">
          <span className="haccp-gateway-compact-badge">
            <span className={`badge-dot ${isMqttConnected ? 'ok' : status ? 'danger' : 'warning'}`} />
            MQTT (Mosquitto)
          </span>
          <span className="haccp-gateway-compact-badge">
            <span className={`badge-dot ${isZigbeeKeyDetected ? 'ok' : 'danger'}`} />
            Clé USB (Zigbee)
          </span>
        </div>

        <button
          type="button"
          className="btn btn-secondary haccp-gateway-compact-btn"
          onClick={() => setShowDetails(!showDetails)}
        >
          <Settings2 size={12} />
          <span>Configurer</span>
          {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            className="haccp-gateway-diagnostic-section compact-diag"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="haccp-gateway-grid">
              <SensorMetric label="Broker MQTT" value={brokerValue} detail={brokerDetail} tone={brokerTone} />
              <SensorMetric label="Port Série" value={status?.zigbee2mqtt?.configuredSerialPort ?? status?.zigbee2mqtt?.serialCandidates[0] ?? 'Aucun port'} detail={status?.zigbee2mqtt?.serialPortDetected ? 'Détecté' : 'Non détecté'} tone={status?.zigbee2mqtt?.serialPortDetected ? 'ok' : 'danger'} />
              <SensorMetric label="Topic" value={status?.zigbee2mqtt?.baseTopic ?? '-'} detail="Zigbee2MQTT" />
              <SensorMetric label="Périphériques" value={status?.zigbee2mqtt?.cachedDeviceCount ?? 0} detail="En cache" />
            </div>

            {!status?.ready ? (
              <div className="haccp-gateway-actions">
                <code>{status?.install?.dockerCommand ?? 'docker compose -f docker-compose.iot.yml --profile iot up -d'}</code>
                <code>{status?.install?.localSetupCommand ?? 'npm run iot:setup'}</code>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );}

function SensorMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: ReactNode; detail: string; tone?: 'ok' | 'danger' | 'neutral' }) {
  return (
    <div className={`haccp-sensor-metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function formatTemperatureTypeLabel(type: string): string {
  const map: Record<string, string> = {
    enceinte_positive: 'Froid positif',
    enceinte_sensible_positive: 'Froid sensible',
    enceinte_produits_finis: 'Produits finis',
    enceinte_produits_laitiers: 'Produits laitiers',
    enceinte_negative: 'Froid négatif',
    enceinte_legumes: 'Zone légumes',
    zone_refrigeree: 'Zone réfrigérée',
    enceinte_carcasse_viande: 'Viandes & Carcasses',
    frigo_glaces_sorbets: 'Glaces & Sorbets',
    sechoir_charcuterie: 'Séchoir charcuterie',
    conservateur_chocolat: 'Conservateur chocolat',
  };
  return map[type] || type.replace(/_/g, ' ');
}

function EditableTemperatureStep({ items, existing, onChange }: { items: TemperatureTemplate[]; existing: HaccpItem[]; onChange: (items: TemperatureTemplate[]) => void }) {
  const existingNames = new Set(existing.map((item) => normalizeName(item.name)));
  const selectedItems = items.filter((i) => i.selected);

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customTemp, setCustomTemp] = useState('2');
  const [customType, setCustomType] = useState('enceinte_positive');

  const addInstance = (category: typeof DEFAULT_TEMPERATURE_CATEGORIES[0]) => {
    const categoryItems = items.filter((i) => i.type === category.type && i.selected);
    const nextNumber = categoryItems.length + 1;
    const newItem: TemperatureTemplate = {
      key: `${category.type}-${Date.now()}-${nextNumber}-${Math.random().toString(36).substr(2, 4)}`,
      name: nextNumber === 1 ? category.defaultName : `${category.defaultName} ${nextNumber}`,
      type: category.type,
      description: category.description,
      recommendedTemp: category.recommendedTemp,
      selected: true,
    };
    onChange([...items, newItem]);
  };

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    const temp = parseFloat(customTemp) || 2;
    const newItem: TemperatureTemplate = {
      key: `custom-temp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: customName.trim(),
      type: customType,
      description: `Cible ${temp > 0 ? `+${temp}` : temp}°C`,
      recommendedTemp: temp,
      selected: true,
    };
    onChange([...items, newItem]);
    setCustomName('');
    setShowCustomForm(false);
  };

  const removeInstance = (key: string) => {
    onChange(items.filter((i) => i.key !== key));
  };

  const updateInstanceName = (key: string, newName: string) => {
    onChange(items.map((i) => (i.key === key ? { ...i, name: newName } : i)));
  };

  return (
    <div className="haccp-onboarding-step">
      <StepIntro
        icon={<Thermometer size={22} />}
        title="Équipements de température"
        text="Ajoutez vos enceintes et personnalisez leurs noms (ex: CF Cuisine, Frigo Pâtisserie, Frigo Bar...)"
        badge={`${selectedItems.length} enceinte(s) configurée(s)`}
      />
      <div className="haccp-equipment-list">
        {DEFAULT_TEMPERATURE_CATEGORIES.map((category) => {
          const categoryInstances = items.filter((i) => i.type === category.type && i.selected);
          const qty = categoryInstances.length;
          const isNegative = category.recommendedTemp < 0;

          return (
            <div key={category.key} className={`haccp-equipment-row ${qty > 0 ? 'active' : ''}`}>
              <div className="haccp-equipment-row-main">
                <div className="haccp-equipment-row-info">
                  <div className={`haccp-card-icon-badge ${isNegative ? 'negative' : 'positive'}`}>
                    {isNegative ? <Snowflake size={18} /> : <Thermometer size={18} />}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <strong className="haccp-equipment-title">{category.defaultName}</strong>
                      <span className={`haccp-spec-pill target ${isNegative ? 'blue' : 'green'}`}>
                        Cible {category.recommendedTemp > 0 ? `+${category.recommendedTemp}` : category.recommendedTemp}°C
                      </span>
                    </div>
                    <span className="haccp-equipment-desc">{category.description} • {formatTemperatureTypeLabel(category.type)}</span>
                  </div>
                </div>

                <div className="haccp-equipment-actions">
                  {qty === 0 ? (
                    <button
                      type="button"
                      className="haccp-add-category-btn"
                      onClick={() => addInstance(category)}
                    >
                      <Plus size={15} /> Ajouter
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="haccp-count-pill">{qty} configurée(s)</span>
                      <button
                        type="button"
                        className="haccp-add-category-btn active"
                        onClick={() => addInstance(category)}
                        title="Ajouter un autre"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {qty > 0 ? (
                <div className="haccp-equipment-instances-box">
                  <div className="haccp-instances-grid">
                    {categoryInstances.map((instance, idx) => {
                      const alreadyExists = existingNames.has(normalizeName(instance.name));
                      return (
                        <div key={instance.key} className="haccp-instance-input-row">
                          <span className="haccp-instance-num">#{idx + 1}</span>
                          <input
                            type="text"
                            className="haccp-instance-input"
                            value={instance.name}
                            onChange={(e) => updateInstanceName(instance.key, e.target.value)}
                            placeholder="Nom personnalisé (ex: CF Cuisine)..."
                          />
                          {alreadyExists ? <span className="haccp-exists-tag" style={{ fontSize: '0.68rem' }}>Déjà présent</span> : null}
                          <button
                            type="button"
                            className="haccp-instance-delete-btn"
                            onClick={() => removeInstance(instance.key)}
                            title="Supprimer cette enceinte"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="haccp-add-subinstance-btn"
                    onClick={() => addInstance(category)}
                  >
                    <Plus size={14} /> Ajouter une autre {category.defaultName.toLowerCase()}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!showCustomForm ? (
        <button
          type="button"
          className="haccp-add-custom-main-btn"
          onClick={() => setShowCustomForm(true)}
        >
          <Plus size={16} /> Créer un équipement de température sur mesure
        </button>
      ) : (
        <div className="haccp-custom-form-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 800 }}>
              Nouveau matériel de température sur mesure
            </strong>
            <button type="button" className="haccp-instance-delete-btn" onClick={() => setShowCustomForm(false)}><X size={16} /></button>
          </div>
          <div className="haccp-custom-form-grid">
            <div className="haccp-custom-field">
              <label>Nom de l'équipement</label>
              <input
                type="text"
                placeholder="Ex: Frigo Bar 2, Chambre froide Sauces..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>
            <div className="haccp-custom-field">
              <label>Type de froid</label>
              <select value={customType} onChange={(e) => setCustomType(e.target.value)}>
                <option value="enceinte_positive">Froid positif (ex: 0°C à 4°C)</option>
                <option value="enceinte_sensible_positive">Froid sensible (ex: 0°C à 2°C)</option>
                <option value="enceinte_negative">Froid négatif (ex: -18°C)</option>
                <option value="zone_refrigeree">Zone réfrigérée (&lt; 12°C)</option>
              </select>
            </div>
            <div className="haccp-custom-field">
              <label>Température cible (°C)</label>
              <input
                type="number"
                step="0.5"
                placeholder="Ex: 2"
                value={customTemp}
                onChange={(e) => setCustomTemp(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.4rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCustomForm(false)}>Annuler</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddCustom} disabled={!customName.trim()}>
              <Plus size={14} /> Ajouter cet équipement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditableProcessStep({ items, existing, onChange }: { items: ProcessTemplate[]; existing: HaccpItem[]; onChange: (items: ProcessTemplate[]) => void }) {
  const existingKeys = new Set(existing.map((item) => `${String(item.type || '').toLowerCase()}::${normalizeName(item.name)}`));
  const selectedItems = items.filter((i) => i.selected);

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customProcessType, setCustomProcessType] = useState<'rechauffement' | 'refroidissement' | 'congelation'>('rechauffement');
  const [minTemp, setMinTemp] = useState('63');
  const [maxTemp, setMaxTemp] = useState('85');

  const addInstance = (category: typeof DEFAULT_PROCESS_CATEGORIES[0]) => {
    const categoryItems = items.filter((i) => i.type === category.type && i.selected);
    const nextNumber = categoryItems.length + 1;
    const newItem: ProcessTemplate = {
      key: `${category.type}-${Date.now()}-${nextNumber}-${Math.random().toString(36).substr(2, 4)}`,
      name: nextNumber === 1 ? category.defaultName : `${category.defaultName} ${nextNumber}`,
      type: category.type,
      temperatureRange: category.temperatureRange,
      description: category.description,
      selected: true,
    };
    onChange([...items, newItem]);
  };

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    const min = parseFloat(minTemp) || 0;
    const max = parseFloat(maxTemp) || 100;
    const newItem: ProcessTemplate = {
      key: `custom-proc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: customName.trim(),
      type: customProcessType,
      temperatureRange: { min, max },
      description: `Plage de ${min}°C à ${max}°C`,
      selected: true,
    };
    onChange([...items, newItem]);
    setCustomName('');
    setShowCustomForm(false);
  };

  const removeInstance = (key: string) => {
    onChange(items.filter((i) => i.key !== key));
  };

  const updateInstanceName = (key: string, newName: string) => {
    onChange(items.map((i) => (i.key === key ? { ...i, name: newName } : i)));
  };

  return (
    <div className="haccp-onboarding-step">
      <StepIntro
        icon={<Snowflake size={22} />}
        title="Process HACCP"
        text="Ajoutez vos équipements de cuisson, refroidissement et congélation (ex: Four Pâtisserie, Cellule 1...)"
        badge={`${selectedItems.length} équipement(s) configuré(s)`}
      />
      <div className="haccp-equipment-list">
        {DEFAULT_PROCESS_CATEGORIES.map((category) => {
          const categoryInstances = items.filter((i) => i.type === category.type && i.selected);
          const qty = categoryInstances.length;
          const isHot = category.type === 'rechauffement';

          return (
            <div key={category.key} className={`haccp-equipment-row ${qty > 0 ? 'active' : ''}`}>
              <div className="haccp-equipment-row-main">
                <div className="haccp-equipment-row-info">
                  <div className={`haccp-card-icon-badge ${isHot ? 'hot' : 'cold'}`}>
                    {isHot ? <Flame size={18} /> : <Snowflake size={18} />}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <strong className="haccp-equipment-title">{category.defaultName}</strong>
                      <span className={`haccp-spec-pill target ${isHot ? 'amber' : 'blue'}`}>
                        {category.temperatureRange.min}°C à {category.temperatureRange.max}°C
                      </span>
                    </div>
                    <span className="haccp-equipment-desc">{category.description} • {processLabel(category.type)}</span>
                  </div>
                </div>

                <div className="haccp-equipment-actions">
                  {qty === 0 ? (
                    <button
                      type="button"
                      className="haccp-add-category-btn"
                      onClick={() => addInstance(category)}
                    >
                      <Plus size={15} /> Ajouter
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="haccp-count-pill">{qty} configuré(s)</span>
                      <button
                        type="button"
                        className="haccp-add-category-btn active"
                        onClick={() => addInstance(category)}
                        title="Ajouter un autre"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {qty > 0 ? (
                <div className="haccp-equipment-instances-box">
                  <div className="haccp-instances-grid">
                    {categoryInstances.map((instance, idx) => {
                      const alreadyExists = existingKeys.has(`${instance.type}::${normalizeName(instance.name)}`);
                      return (
                        <div key={instance.key} className="haccp-instance-input-row">
                          <span className="haccp-instance-num">#{idx + 1}</span>
                          <input
                            type="text"
                            className="haccp-instance-input"
                            value={instance.name}
                            onChange={(e) => updateInstanceName(instance.key, e.target.value)}
                            placeholder="Nom personnalisé (ex: Four Pâtisserie)..."
                          />
                          {alreadyExists ? <span className="haccp-exists-tag" style={{ fontSize: '0.68rem' }}>Déjà présent</span> : null}
                          <button
                            type="button"
                            className="haccp-instance-delete-btn"
                            onClick={() => removeInstance(instance.key)}
                            title="Supprimer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="haccp-add-subinstance-btn"
                    onClick={() => addInstance(category)}
                  >
                    <Plus size={14} /> Ajouter un autre {category.defaultName.toLowerCase()}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!showCustomForm ? (
        <button
          type="button"
          className="haccp-add-custom-main-btn"
          onClick={() => setShowCustomForm(true)}
        >
          <Plus size={16} /> Créer un équipement de process sur mesure
        </button>
      ) : (
        <div className="haccp-custom-form-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 800 }}>
              Nouveau matériel de process sur mesure
            </strong>
            <button type="button" className="haccp-instance-delete-btn" onClick={() => setShowCustomForm(false)}><X size={16} /></button>
          </div>
          <div className="haccp-custom-form-grid">
            <div className="haccp-custom-field">
              <label>Nom du matériel / process</label>
              <input
                type="text"
                placeholder="Ex: Salamandre 1, Friteuse double..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>
            <div className="haccp-custom-field">
              <label>Type de process</label>
              <select value={customProcessType} onChange={(e) => setCustomProcessType(e.target.value as any)}>
                <option value="rechauffement">Maintien chaud / Rechauffement</option>
                <option value="refroidissement">Refroidissement rapide</option>
                <option value="congelation">Congélation rapide</option>
              </select>
            </div>
            <div className="haccp-custom-field">
              <label>Température Min (°C)</label>
              <input
                type="number"
                placeholder="Ex: 63"
                value={minTemp}
                onChange={(e) => setMinTemp(e.target.value)}
              />
            </div>
            <div className="haccp-custom-field">
              <label>Température Max (°C)</label>
              <input
                type="number"
                placeholder="Ex: 85"
                value={maxTemp}
                onChange={(e) => setMaxTemp(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.4rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCustomForm(false)}>Annuler</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddCustom} disabled={!customName.trim()}>
              <Plus size={14} /> Ajouter ce process
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditableCleaningStep({ items, existing, onChange }: { items: CleaningTemplate[]; existing: HaccpItem[]; onChange: (items: CleaningTemplate[]) => void }) {
  const existingNames = new Set(existing.map((item) => normalizeName(item.name)));
  const selectedCount = items.filter((i) => i.selected).length;

  const [showCustomZoneForm, setShowCustomZoneForm] = useState(false);
  const [customZoneName, setCustomZoneName] = useState('');
  const [customZoneDesc, setCustomZoneDesc] = useState('');

  const toggleZone = (index: number) => {
    updateArrayItem(items, index, { selected: !items[index].selected }, onChange);
  };

  const updateSurfaceFrequency = (zoneIndex: number, surfaceIndex: number, frequency: string) => {
    const updatedSurfaces = items[zoneIndex].surfaces.map((entry, idx) =>
      idx === surfaceIndex ? { ...entry, frequency } : entry
    );
    updateArrayItem(items, zoneIndex, { surfaces: updatedSurfaces }, onChange);
  };

  const updateSurfaceName = (zoneIndex: number, surfaceIndex: number, name: string) => {
    const updatedSurfaces = items[zoneIndex].surfaces.map((entry, idx) =>
      idx === surfaceIndex ? { ...entry, name } : entry
    );
    updateArrayItem(items, zoneIndex, { surfaces: updatedSurfaces }, onChange);
  };

  const addSurface = (zoneIndex: number) => {
    const newSurface = { name: `Surface ${items[zoneIndex].surfaces.length + 1}`, frequency: 'daily' };
    const updatedSurfaces = [...items[zoneIndex].surfaces, newSurface];
    updateArrayItem(items, zoneIndex, { surfaces: updatedSurfaces }, onChange);
  };

  const removeSurface = (zoneIndex: number, surfaceIndex: number) => {
    const updatedSurfaces = items[zoneIndex].surfaces.filter((_, idx) => idx !== surfaceIndex);
    updateArrayItem(items, zoneIndex, { surfaces: updatedSurfaces }, onChange);
  };

  const handleAddCustomZone = () => {
    if (!customZoneName.trim()) return;
    const newZone: CleaningTemplate = {
      key: `custom-zone-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: customZoneName.trim(),
      description: customZoneDesc.trim() || 'Zone de nettoyage sur mesure',
      selected: true,
      surfaces: [
        { name: 'Plan de travail / Surface principale', frequency: 'daily' },
        { name: 'Sols & Poignées', frequency: 'daily' },
      ],
    };
    onChange([...items, newZone]);
    setCustomZoneName('');
    setCustomZoneDesc('');
    setShowCustomZoneForm(false);
  };

  return (
    <div className="haccp-onboarding-step">
      <StepIntro
        icon={<ShieldCheck size={22} />}
        title="Zones et surfaces de nettoyage"
        text="Activez les zones de votre établissement, personnalisez les surfaces à contrôler et ajustez leurs fréquences."
        badge={`${selectedCount} zone(s) configurée(s)`}
      />
      <div className="haccp-equipment-list">
        {items.map((item, zoneIndex) => {
          const alreadyExists = existingNames.has(normalizeName(item.name));
          const isSelected = item.selected;

          return (
            <div key={item.key} className={`haccp-equipment-row ${isSelected ? 'active' : ''}`}>
              <div className="haccp-equipment-row-main">
                <div className="haccp-equipment-row-info">
                  <div className="haccp-card-icon-badge cleaning">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <strong className="haccp-equipment-title">{item.name}</strong>
                      <span className="haccp-spec-pill range">{item.surfaces.length} surface(s)</span>
                    </div>
                    <span className="haccp-equipment-desc">{item.description}</span>
                  </div>
                </div>

                <div className="haccp-equipment-actions">
                  {!isSelected ? (
                    <button
                      type="button"
                      className="haccp-add-category-btn"
                      onClick={() => toggleZone(zoneIndex)}
                    >
                      <Plus size={15} /> Activer
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="haccp-count-pill">Configurée</span>
                      <button
                        type="button"
                        className="haccp-add-category-btn active"
                        onClick={() => toggleZone(zoneIndex)}
                        title="Désactiver cette zone"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isSelected && (
                <div className="haccp-equipment-instances-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 750, color: '#475569' }}>
                      Surfaces à contrôler & Fréquences :
                    </span>
                    {alreadyExists && <span className="haccp-exists-tag" style={{ fontSize: '0.68rem' }}>Zone déjà présente</span>}
                  </div>

                  <div className="haccp-instances-grid">
                    {item.surfaces.map((surface, surfaceIndex) => (
                      <div key={`${item.key}-${surfaceIndex}`} className="haccp-instance-input-row">
                        <input
                          type="text"
                          className="haccp-instance-input"
                          value={surface.name}
                          onChange={(e) => updateSurfaceName(zoneIndex, surfaceIndex, e.target.value)}
                          placeholder="Nom de la surface (ex: Plan de travail)..."
                        />
                        <select
                          className="haccp-frequency-select"
                          value={surface.frequency}
                          onChange={(e) => updateSurfaceFrequency(zoneIndex, surfaceIndex, e.target.value)}
                        >
                          <option value="daily">Quotidien</option>
                          <option value="weekly">Hebdomadaire</option>
                          <option value="monthly">Mensuel</option>
                        </select>
                        <button
                          type="button"
                          className="haccp-instance-delete-btn"
                          onClick={() => removeSurface(zoneIndex, surfaceIndex)}
                          title="Supprimer cette surface"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="haccp-add-subinstance-btn"
                    onClick={() => addSurface(zoneIndex)}
                  >
                    <Plus size={14} /> Ajouter une surface à {item.name.toLowerCase()}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!showCustomZoneForm ? (
        <button
          type="button"
          className="haccp-add-custom-main-btn"
          onClick={() => setShowCustomZoneForm(true)}
        >
          <Plus size={16} /> Créer une zone de nettoyage sur mesure
        </button>
      ) : (
        <div className="haccp-custom-form-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 800 }}>
              Nouvelle zone de nettoyage sur mesure
            </strong>
            <button type="button" className="haccp-instance-delete-btn" onClick={() => setShowCustomZoneForm(false)}><X size={16} /></button>
          </div>
          <div className="haccp-custom-form-grid">
            <div className="haccp-custom-field">
              <label>Nom de la zone</label>
              <input
                type="text"
                placeholder="Ex: Bar / Comptoir, Vestiaires..."
                value={customZoneName}
                onChange={(e) => setCustomZoneName(e.target.value)}
              />
            </div>
            <div className="haccp-custom-field">
              <label>Description (optionnel)</label>
              <input
                type="text"
                placeholder="Ex: Zone de service et préparation des boissons"
                value={customZoneDesc}
                onChange={(e) => setCustomZoneDesc(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.4rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCustomZoneForm(false)}>Annuler</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddCustomZone} disabled={!customZoneName.trim()}>
              <Plus size={14} /> Ajouter cette zone
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditableSensorsStep({
  gatewayStatus,
  pairing,
  sensors,
  onStartPairing,
  onStopPairing,
}: {
  gatewayStatus: HaccpSensorGatewayStatus | null;
  pairing: HaccpPairingSession | null;
  sensors: HaccpSensor[];
  onStartPairing: () => void;
  onStopPairing: () => void;
}) {
  const isZigbeeKeyDetected = gatewayStatus?.zigbee2mqtt?.serialPortDetected ?? false;
  const activePairing = pairing?.status === 'ACTIVE';
  const [showScanModal, setShowScanModal] = useState(false);

  useEffect(() => {
    if (activePairing) {
      setShowScanModal(true);
    }
  }, [activePairing]);

  function handleStartPairing() {
    setShowScanModal(true);
    const isReady = Boolean(gatewayStatus?.ready);
    if (isReady) {
      onStartPairing();
    }
  }

  return (
    <div className="haccp-onboarding-step">
      <StepIntro
        icon={<Smartphone size={20} />}
        title="Capteurs de Température Sonoff (IoT)"
        text="Branchez la clé USB Sonoff Zigbee 3.0 et appairez directement vos capteurs de température sans fil."
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1.25rem', marginTop: '1.25rem' }}>
        {/* Card 1: Dongle USB Sonoff */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '18px', padding: '1.25rem', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.85rem' }}>
          <img src="/zigbee.png" alt="Clé USB Sonoff Dongle" style={{ height: '115px', objectFit: 'contain' }} />
          <div>
            <strong style={{ display: 'block', fontSize: '1rem', color: '#0f172a' }}>1. Clé USB Sonoff Zigbee</strong>
            <span style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>Branchez la clé USB Sonoff 3.0 sur votre serveur / box ToqueHub.</span>
          </div>
          <span className={`haccp-status-pill ${isZigbeeKeyDetected ? 'ok' : 'danger'}`}>
            <span className="status-dot" />
            {isZigbeeKeyDetected ? 'Clé USB Détectée' : 'Clé USB Non Détectée'}
          </span>
        </div>

        {/* Card 2: Capteur Sonoff */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '18px', padding: '1.25rem', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.85rem' }}>
          <img src="/capteur.png" alt="Capteur Sonoff Température" style={{ height: '115px', objectFit: 'contain' }} />
          <div>
            <strong style={{ display: 'block', fontSize: '1rem', color: '#0f172a' }}>2. Capteur Température Sonoff</strong>
            <span style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>Maintenez le bouton du capteur pendant 5s pour l'appairer.</span>
          </div>
          {activePairing ? (
            <button type="button" className="btn secondary btn-sm" onClick={() => setShowScanModal(true)} style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
              <Radio size={14} className="radio-pulse-icon" /> Voir l'appairage en cours ({pairing?.sensors?.length ?? 0})
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleStartPairing}>
              <Plus size={14} /> Commencer l'appairage
            </button>
          )}
        </div>
      </div>

      {/* Pairing Scan Modal */}
      <AnimatePresence>
        {showScanModal && (
          <SonoffPairingScanModal
            gatewayStatus={gatewayStatus}
            pairing={pairing}
            sensors={sensors}
            onStartPairing={onStartPairing}
            onStopPairing={onStopPairing}
            onClose={() => setShowScanModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function HaccpOnboardingReview({
  temperatures,
  processes,
  zones,
  existing,
  summary,
  error,
}: {
  temperatures: TemperatureTemplate[];
  processes: ProcessTemplate[];
  zones: CleaningTemplate[];
  existing: { temperatureEquipment: HaccpItem[]; processEquipment: HaccpItem[]; cleaningZones: HaccpItem[] };
  summary: HaccpOnboardingSummary | null;
  error: string | null;
}) {
  const selectedTemperatures = temperatures.filter((item) => item.selected);
  const selectedProcesses = processes.filter((item) => item.selected);
  const selectedZones = zones.filter((item) => item.selected);
  const expectedCreates = countMissingOnboardingItems(selectedTemperatures, selectedProcesses, selectedZones, existing);
  return (
    <div className="haccp-onboarding-step">
      <StepIntro
        icon={<CheckCircle2 size={20} />}
        title="Résumé & validation"
        text="Validez la configuration. Les doublons sont ignorés automatiquement par nom."
      />
      <div className="haccp-review-grid">
        <ReviewCard title="Températures" value={selectedTemperatures.length} detail={`${existing.temperatureEquipment.length} équipement(s) existant(s)`} />
        <ReviewCard title="Process" value={selectedProcesses.length} detail={`${existing.processEquipment.length} équipement(s) existant(s)`} />
        <ReviewCard title="Nettoyage" value={selectedZones.length} detail={`${existing.cleaningZones.length} zone(s) existante(s)`} />
        <ReviewCard title="À créer" value={expectedCreates} detail="hors éléments déjà présents" />
      </div>
      <div className="haccp-mobile-note">
        <Smartphone size={18} />
        <p>Après cette préparation dans ToqueHub main, les équipes réalisent les contrôles quotidiens HACCP depuis l’application ToqueHub : relevés, nettoyage, traçabilité et rapports.</p>
      </div>
      {error ? <div className="alert error"><AlertCircle size={16} /> {error}</div> : null}
      {summary ? (
        <div className="haccp-onboarding-result">
          <div><strong>{summary.created.length}</strong><span>élément(s) créé(s)</span></div>
          <div><strong>{summary.skipped.length}</strong><span>déjà présent(s)</span></div>
          {summary.created.length ? <p>Créés : {summary.created.join(', ')}</p> : null}
          {summary.skipped.length ? <p>Ignorés : {summary.skipped.join(', ')}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function StepIntro({
  icon,
  title,
  text,
  badge,
  onToggleAll,
  isAllSelected,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  badge?: string;
  onToggleAll?: () => void;
  isAllSelected?: boolean;
}) {
  return (
    <div className="haccp-step-intro">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div className="haccp-intro-icon-box">{icon}</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3>{title}</h3>
            {badge && <span className="haccp-intro-badge">{badge}</span>}
          </div>
          <p>{text}</p>
        </div>
      </div>
      {onToggleAll && (
        <button type="button" className="btn btn-secondary btn-sm haccp-toggle-all-btn" onClick={onToggleAll}>
          {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>
      )}
    </div>
  );
}

function ReviewCard({ title, value, detail }: { title: string; value: number; detail: string }) {
  return (
    <div className="haccp-review-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
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
  const hasExpectedControls = module.expected > 0;
  const status = !hasExpectedControls ? 'Aucun prévu' : module.issues > 0 ? module.score < 60 ? 'Critique' : 'À vérifier' : 'Conforme';
  const badgeClass = !hasExpectedControls ? 'neutral' : status === 'Conforme' ? 'ok' : status === 'À vérifier' ? 'warning' : 'danger';
  return (
    <tr>
      <td><strong>{module.label}</strong><small>{module.description}</small></td>
      <td>Contrôle HACCP</td>
      <td><span className={`haccp-score-pill ${badgeClass}`}>{hasExpectedControls ? `${module.score}%` : '-'}</span></td>
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

function HaccpConfigForm({
  kind,
  form,
  setField,
  surfaces,
  setSurfaces,
}: {
  kind: HaccpConfigKind;
  form: Record<string, string>;
  setField: (key: string, value: string) => void;
  surfaces: Array<{ name: string; frequency: string }>;
  setSurfaces: (surfaces: Array<{ name: string; frequency: string }>) => void;
}) {
  if (kind === 'temperature') {
    return (
      <div className="haccp-form-grid">
        <TextInput className="full-width" label="Nom du matériel" value={form.name} onChange={(value) => setField('name', value)} required placeholder="Ex : Frigo pâtisserie" />
        <SelectInput label="Type" value={form.type} onChange={(value) => setField('type', value)} options={temperatureTypeOptions()} />
      </div>
    );
  }

  if (kind === 'process') {
    return (
      <div className="haccp-form-grid">
        <TextInput className="full-width" label="Nom du matériel" value={form.name} onChange={(value) => setField('name', value)} required placeholder="Ex : Four mixte production" />
        <SelectInput label="Type de process" value={form.type} onChange={(value) => setField('type', value)} options={PROCESS_TYPES.map((type) => ({ value: type.id, label: type.label }))} />
      </div>
    );
  }

  return (
    <div className="haccp-form-grid">
      <TextInput className="full-width" label="Nom de la zone" value={form.name} onChange={(value) => setField('name', value)} required placeholder="Ex : Préparation froide" />
      <TextInput className="full-width" label="Description" value={form.description} onChange={(value) => setField('description', value)} placeholder="Usage ou périmètre de la zone" />
      <div className="haccp-custom-surfaces full-width">
        <div className="haccp-custom-surfaces-header">
          <strong>Surfaces à contrôler</strong>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSurfaces([...surfaces, { name: '', frequency: 'daily' }])}>
            <Plus size={14} /> Surface
          </button>
        </div>
        {surfaces.map((surface, index) => (
          <div className="haccp-custom-surface-row" key={index}>
            <TextInput label="Surface" value={surface.name} onChange={(value) => setSurfaces(surfaces.map((entry, entryIndex) => entryIndex === index ? { ...entry, name: value } : entry))} placeholder="Ex : Table inox" />
            <SelectInput label="Fréquence" value={surface.frequency} onChange={(value) => setSurfaces(surfaces.map((entry, entryIndex) => entryIndex === index ? { ...entry, frequency: value } : entry))} options={FREQUENCY_OPTIONS} />
            <button type="button" className="haccp-action-btn" onClick={() => setSurfaces(surfaces.filter((_, entryIndex) => entryIndex !== index))} aria-label="Supprimer la surface">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
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
      <SelectInput className="full-width" label={`Équipement ${processType}`} value={form.equipmentId} onChange={(value) => setField('equipmentId', value)} options={processEquipment.filter((item) => item.type === processType || item.type === 'mixte').map((item) => ({ value: item._id ?? item.id, label: item.name ?? 'Équipement' }))} />
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

function SimpleTable({ rows, columns, onDelete, onDownloadReport, section }: { rows: HaccpItem[]; columns: string[]; onDelete?: (item: HaccpItem) => void; onDownloadReport?: (item: HaccpItem) => void; section?: HaccpTab }) {
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
        <thead><tr>{columns.map((column) => <th key={column}>{headerFor(column)}</th>)}{onDelete || section === 'reports' ? <th></th> : null}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row._id ?? row.id ?? index}>
              {columns.map((column) => <td key={column}>{formatCell(row, column, section)}</td>)}
              {onDelete || section === 'reports' ? (
                <td>
                  {section === 'reports' && row.pdfPath && onDownloadReport ? (
                    <button type="button" className="haccp-action-btn" title="Télécharger le PDF" onClick={() => onDownloadReport(row)}>
                      <Download size={14} />
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button type="button" className="haccp-action-btn" title="Supprimer" onClick={() => onDelete(row)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  ) : null}
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

function computeHaccpReadiness(temperatureEquipment: HaccpItem[], processEquipment: HaccpItem[], cleaningZones: HaccpItem[]): HaccpReadiness {
  const activeSurfaces = cleaningZones.reduce((total, zone) => total + (Array.isArray(zone.surfaces) ? zone.surfaces.length : 0), 0);
  const processTypes = new Set(processEquipment.map((item) => String(item.type || '').toLowerCase()));
  const temperatureReady = temperatureEquipment.length >= 3;
  const processReady = ['rechauffement', 'refroidissement', 'congelation'].every((type) => processTypes.has(type) || processTypes.has('mixte'));
  const cleaningReady = cleaningZones.length >= 3 && activeSurfaces >= 6;
  const completed = [temperatureReady, processReady, cleaningReady].filter(Boolean).length;
  const nextStep: HaccpOnboardingStep = !temperatureReady ? 'temperatures' : !processReady ? 'process' : !cleaningReady ? 'cleaning' : 'review';
  return { temperatureReady, processReady, cleaningReady, progress: Math.round((completed / 3) * 100), nextStep };
}

function normalizeName(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function updateArrayItem<T>(items: T[], index: number, patch: Partial<T>, onChange: (items: T[]) => void) {
  onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
}

function countMissingOnboardingItems(temperatures: TemperatureTemplate[], processes: ProcessTemplate[], zones: CleaningTemplate[], existing: { temperatureEquipment: HaccpItem[]; processEquipment: HaccpItem[]; cleaningZones: HaccpItem[] }) {
  const temperatureNames = new Set(existing.temperatureEquipment.map((item) => normalizeName(item.name)));
  const processKeys = new Set(existing.processEquipment.map((item) => `${String(item.type || '').toLowerCase()}::${normalizeName(item.name)}`));
  const zoneNames = new Set(existing.cleaningZones.map((item) => normalizeName(item.name)));
  return [
    ...temperatures.filter((item) => item.name.trim() && !temperatureNames.has(normalizeName(item.name))),
    ...processes.filter((item) => item.name.trim() && !processKeys.has(`${item.type}::${normalizeName(item.name)}`)),
    ...zones.filter((item) => item.name.trim() && !zoneNames.has(normalizeName(item.name))),
  ].length;
}

function haccpStepLabel(step: HaccpOnboardingStep) {
  return ({ welcome: 'Bienvenue', temperatures: 'Températures', process: 'Process', cleaning: 'Nettoyage', review: 'Résumé' } as Record<HaccpOnboardingStep, string>)[step];
}

function processLabel(type: string) {
  return PROCESS_TYPES.find((item) => item.id === type)?.label ?? type;
}

function frequencyLabel(value: string) {
  return FREQUENCY_OPTIONS.find((item) => item.value === value)?.label ?? value ?? '-';
}

function temperatureTypeOptions() {
  const seen = new Set<string>();
  return DEFAULT_TEMPERATURE_TEMPLATES
    .filter((item) => {
      if (seen.has(item.type)) return false;
      seen.add(item.type);
      return true;
    })
    .map((item) => ({ value: item.type, label: `${item.name} (${item.type})` }));
}

function configModalTitle(kind: HaccpConfigKind) {
  return ({
    temperature: 'Créer un matériel température',
    process: 'Créer un matériel process',
    cleaning: 'Créer une zone de nettoyage',
  } as Record<HaccpConfigKind, string>)[kind];
}

function labelFor(section: HaccpTab) {
  return ({ sensors: 'Capteurs', alerts: 'Alerte', temperatures: 'Températures', setup: 'Zones & matériels', cleaning: 'Nettoyage', traceability: 'Traçabilité', receptions: 'Réceptions', process: 'Processus', oil: 'Huiles', production: 'Production', products: 'Produits', labels: 'Étiquettes', reports: 'Rapports', dashboard: 'Tableau de bord' } as Record<HaccpTab, string>)[section];
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
    alerts: ['sensor.assignedEquipment.name', 'sensor.userName', 'temperature', 'humidity', 'measuredAt'],
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

function buildLocalTemperatureAlertData(sensors: HaccpSensor[]): HaccpTemperatureAlertData {
  const monitored = sensors.map((sensor) => {
    const threshold = sensor.temperatureThreshold ?? localTemperatureThreshold(sensor.assignedEquipment);
    const temperatureStatus = localTemperatureStatus(sensor.currentTemperature == null ? null : Number(sensor.currentTemperature), threshold);
    return { ...sensor, threshold, temperatureStatus, alertOpen: temperatureStatus.status === 'critical' || temperatureStatus.status === 'warning' };
  });
  const alerts = monitored.flatMap((sensor) => {
    const detectedAt = sensor.lastSeenAt ?? new Date().toISOString();
    const temperature = sensor.currentTemperature == null ? null : Number(sensor.currentTemperature);
    const entries: HaccpItem[] = [];
    if (sensor.temperatureStatus.status === 'critical' || sensor.temperatureStatus.status === 'warning') {
      entries.push({
        id: `${sensor.id}-temperature-alert`,
        type: 'TEMPERATURE_OUT_OF_RANGE',
        severity: sensor.temperatureStatus.status === 'critical' ? 'CRITICAL' : 'WARNING',
        status: 'OPEN',
        title: sensor.temperatureStatus.status === 'critical' ? 'Température critique' : 'Température à surveiller',
        message: `${sensor.assignedEquipment?.name ?? sensorDisplayName(sensor)}: ${temperature == null ? '-' : `${temperature.toFixed(1)}°C`} hors plage ${sensor.threshold?.min}°C / ${sensor.threshold?.max}°C`,
        detectedAt,
        sensor,
        payload: {
          temperature,
          threshold: sensor.threshold,
          equipmentId: sensor.assignedEquipment?.id ?? null,
          equipmentName: sensor.assignedEquipment?.name ?? null,
        },
      });
    }
    if (sensor.status === 'OFFLINE') {
      entries.push({
        id: `${sensor.id}-offline-alert`,
        type: 'SENSOR_OFFLINE',
        severity: 'WARNING',
        status: 'OPEN',
        title: 'Capteur hors ligne',
        message: `${sensorDisplayName(sensor)} ne remonte plus de relevé depuis ${sensor.lastSeenAt ? new Date(sensor.lastSeenAt).toLocaleString('fr-FR') : 'un moment'}.`,
        detectedAt,
        sensor,
        payload: { lastSeenAt: sensor.lastSeenAt ?? null },
      });
    }
    return entries;
  }).sort((a, b) => new Date(b.detectedAt ?? 0).getTime() - new Date(a.detectedAt ?? 0).getTime());
  const recentReadings: HaccpItem[] = monitored
    .flatMap((sensor) => (sensor.readings ?? []).map((reading) => ({ ...reading, sensor })))
    .sort((a, b) => new Date((b as HaccpItem).measuredAt ?? (b as HaccpItem).createdAt ?? 0).getTime() - new Date((a as HaccpItem).measuredAt ?? (a as HaccpItem).createdAt ?? 0).getTime())
    .slice(0, 20);
  return {
    summary: {
      totalSensors: monitored.length,
      assignedSensors: monitored.filter((sensor) => sensor.assignedEquipment).length,
      unassignedSensors: monitored.filter((sensor) => !sensor.assignedEquipment).length,
      onlineSensors: monitored.filter((sensor) => sensor.status === 'ONLINE').length,
      offlineSensors: monitored.filter((sensor) => sensor.status === 'OFFLINE').length,
      critical: monitored.filter((sensor) => sensor.temperatureStatus.status === 'critical').length,
      warning: monitored.filter((sensor) => sensor.temperatureStatus.status === 'warning').length,
      ok: monitored.filter((sensor) => sensor.temperatureStatus.status === 'ok').length,
    },
    sensors: monitored,
    alerts,
    recentReadings,
  };
}

function localTemperatureThreshold(equipment?: { name?: string | null; temperatureRange?: { min: number | null; max: number | null } | null } | null) {
  const min = equipment?.temperatureRange?.min;
  const max = equipment?.temperatureRange?.max;
  if (min == null || max == null || min >= max) return null;
  return { min, max, label: equipment?.name ? `Équipement ${equipment.name}` : 'Équipement lié' };
}

function localTemperatureStatus(temperature: number | null, threshold?: { min: number; max: number } | null) {
  if (!threshold) return { status: 'unknown', label: 'Seuil non défini', delta: null };
  if (temperature == null) return { status: 'unknown', label: 'Sans relevé', delta: null };
  if (temperature < threshold.min) {
    const delta = threshold.min - temperature;
    return { status: delta >= 3 ? 'critical' : 'warning', label: 'Trop froid', delta };
  }
  if (temperature > threshold.max) {
    const delta = temperature - threshold.max;
    return { status: delta >= 3 ? 'critical' : 'warning', label: 'Trop chaud', delta };
  }
  return { status: 'ok', label: 'Conforme', delta: 0 };
}

function upsertSensor(items: HaccpSensor[], sensor: HaccpSensor) {
  const next = items.some((item) => item.id === sensor.id)
    ? items.map((item) => item.id === sensor.id ? { ...item, ...sensor } : item)
    : [sensor, ...items];
  return next.filter((item) => !item.isRemoved);
}

function formatBattery(value?: number | null) {
  return value == null ? '-' : `${Math.round(Number(value))}%`;
}

function sensorDisplayName(sensor: HaccpSensor) {
  return sensor.userName || sensor.friendlyName || sensor.externalId || 'Capteur';
}

function sensorStatusLabel(status: string) {
  if (status === 'ONLINE') return 'En ligne';
  if (status === 'OFFLINE') return 'Hors ligne';
  return 'Inconnu';
}

function sensorStatusClass(status: string) {
  if (status === 'ONLINE') return 'ok';
  if (status === 'OFFLINE') return 'danger';
  return 'neutral';
}

function sensorGlobalStatus(status: string) {
  if (status === 'ok') return 'Parc nominal';
  if (status === 'warning') return 'Attention requise';
  return 'À initialiser';
}

function sensorGatewayLabel(status?: string) {
  if (status === 'ready') return 'Prête';
  if (status === 'missing_serial') return 'Clé absente';
  if (status === 'mqtt_disconnected') return 'MQTT indisponible';
  if (status === 'not_configured') return 'Non configurée';
  return 'Diagnostic en cours';
}

function sensorGatewayTone(status?: string) {
  if (status === 'ready') return 'ok';
  if (status === 'not_configured' || status === 'mqtt_disconnected') return 'danger';
  return 'warning';
}

function sensorGatewayMessage(status: HaccpSensorGatewayStatus | null) {
  if (!status) return 'Statut passerelle indisponible.';
  if (status.status === 'ready') return 'MQTT, Zigbee2MQTT et coordinateur Zigbee sont prêts.';
  if (status.status === 'missing_serial') return 'Le broker MQTT répond, mais aucun coordinateur Zigbee USB n’est visible.';
  if (status.status === 'mqtt_disconnected') return status.mqtt.lastError ? `Broker MQTT inaccessible: ${status.mqtt.lastError}` : 'Broker MQTT inaccessible.';
  if (status.status === 'not_configured') return status.mqtt.url ? 'MQTT est configuré, mais la passerelle n’a pas encore établi la connexion.' : 'MQTT_URL n’est pas configuré côté API.';
  return 'Diagnostic passerelle à vérifier.';
}

function sensorGatewayBlockingMessage(status: HaccpSensorGatewayStatus) {
  if (status.ready) return '';
  return sensorGatewayMessage(status);
}

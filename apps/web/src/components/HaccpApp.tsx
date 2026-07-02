import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  Droplets,
  Factory,
  FileText,
  Flame,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Snowflake,
  Sparkles,
  Thermometer,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { api } from '../api/client';

export type HaccpTab = 'dashboard' | 'setup' | 'sensors' | 'temperatures' | 'cleaning' | 'traceability' | 'receptions' | 'process' | 'oil' | 'production' | 'products' | 'labels' | 'reports';

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

type SectionId = Exclude<HaccpTab, 'dashboard' | 'setup' | 'sensors' | 'labels'>;
type HaccpConfigKind = 'temperature' | 'process' | 'cleaning';
type HaccpOnboardingStep = 'welcome' | 'temperatures' | 'process' | 'cleaning' | 'review';
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
  assignedEquipment?: { id: string; name: string; type: string } | null;
  readings?: HaccpItem[];
  events?: HaccpItem[];
};
type HaccpPairingSession = HaccpItem & { id: string; status: string; startedAt: string; expiresAt: string; discoveredIds?: string[]; sensors?: HaccpSensor[] };

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

const DEFAULT_TEMPERATURE_TEMPLATES: TemperatureTemplate[] = [
  { key: 'positive-cold-room', name: 'Chambre froide positive', type: 'enceinte_positive', description: 'Entre 0°C et 4°C', recommendedTemp: 2, selected: true },
  { key: 'sensitive-positive-room', name: 'Enceinte sensible positive', type: 'enceinte_sensible_positive', description: 'Entre 0°C et 2°C', recommendedTemp: 1, selected: false },
  { key: 'finished-products-fridge', name: 'Enceinte produits finis', type: 'enceinte_produits_finis', description: 'Entre 0°C et 3°C', recommendedTemp: 1.5, selected: true },
  { key: 'dairy-fridge', name: 'Enceinte produits laitiers', type: 'enceinte_produits_laitiers', description: 'Entre 0°C et 8°C', recommendedTemp: 4, selected: false },
  { key: 'negative-cold-room', name: 'Chambre froide négative', type: 'enceinte_negative', description: 'Entre -16°C et -30°C', recommendedTemp: -18, selected: true },
  { key: 'vegetable-fridge', name: 'Enceinte légumes', type: 'enceinte_legumes', description: 'Entre 0°C et 10°C', recommendedTemp: 5, selected: false },
  { key: 'refrigerated-zone', name: 'Zone réfrigérée', type: 'zone_refrigeree', description: 'Inférieure à 12°C', recommendedTemp: 6, selected: false },
  { key: 'meat-carcass-room', name: 'Enceinte carcasse viande', type: 'enceinte_carcasse_viande', description: 'Entre 0°C et 7°C', recommendedTemp: 3.5, selected: false },
  { key: 'ice-cream-freezer', name: 'Frigo glaces / sorbets', type: 'frigo_glaces_sorbets', description: 'Entre -10°C et -25°C', recommendedTemp: -18, selected: false },
  { key: 'charcuterie-dryer', name: 'Séchoir charcuterie', type: 'sechoir_charcuterie', description: 'Entre 12°C et 16°C', recommendedTemp: 14, selected: false },
  { key: 'chocolate-conserver', name: 'Conservateur chocolat', type: 'conservateur_chocolat', description: 'Entre 14°C et 22°C', recommendedTemp: 18, selected: false },
];

const DEFAULT_PROCESS_TEMPLATES: ProcessTemplate[] = [
  { key: 'reheat-oven', name: 'Four de remise en température', type: 'rechauffement', temperatureRange: { min: 60, max: 85 }, description: 'Remise en température et maintien chaud', selected: true },
  { key: 'hot-cabinet', name: 'Armoire chaude', type: 'rechauffement', temperatureRange: { min: 60, max: 85 }, description: 'Liaison chaude et maintien avant service', selected: false },
  { key: 'cooling-cell', name: 'Cellule de refroidissement', type: 'refroidissement', temperatureRange: { min: 0, max: 4 }, description: 'Refroidissement rapide des préparations', selected: true },
  { key: 'blast-chiller', name: 'Refroidisseur rapide', type: 'refroidissement', temperatureRange: { min: 0, max: 4 }, description: 'Alternative cellule / blast chiller', selected: false },
  { key: 'freezing-cell', name: 'Cellule de congélation', type: 'congelation', temperatureRange: { min: -25, max: -18 }, description: 'Congélation ou surgélation contrôlée', selected: true },
  { key: 'freezer', name: 'Congélateur de réserve', type: 'congelation', temperatureRange: { min: -25, max: -18 }, description: 'Mise en réserve négative', selected: false },
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
  const [sensors, setSensors] = useState<HaccpSensor[]>([]);
  const [pairing, setPairing] = useState<HaccpPairingSession | null>(null);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);

  useEffect(() => setActiveTab(tab), [tab]);
  useEffect(() => { void refreshAll(); }, [token, processType]);
  useEffect(() => {
    if (activeTab !== 'sensors') return;
    let socket: Socket | undefined;
    let connectTimer: number | undefined;
    try {
      socket = io(api.haccpSensorSocketUrl(), { auth: { token }, autoConnect: false });
      const upsert = (sensor: HaccpSensor) => {
        setSensors((current) => upsertSensor(current, sensor));
        void refreshSensorSummary();
      };
      socket.on('sensor.discovered', upsert);
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
    if (activeTab === 'dashboard' || activeTab === 'setup' || activeTab === 'sensors' || activeTab === 'labels') return [];
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
    if (!query || activeTab === 'dashboard' || activeTab === 'setup' || activeTab === 'sensors' || activeTab === 'labels') return currentRows;
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
        sensorSummaryData,
        sensorList,
        pairingData,
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
        safeValue('sensors summary', () => api.haccpSensorsSummary(token), { total: 0, online: 0, offline: 0, unknown: 0, averageBattery: null, globalStatus: 'unknown' }),
        safeValue('sensors list', () => api.haccpSensors(token), []),
        safeValue('pairing current', () => api.haccpCurrentSensorPairing(token), null),
      ]);
      if (dashboardData) setDashboard(dashboardData);
      setSensorSummary(sensorSummaryData);
      setSensors(sensorList);
      setPairing(pairingData);
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

  async function refreshSensorSummary() {
    try {
      setSensorSummary(await api.haccpSensorsSummary(token));
    } catch {
      // Keep the last summary; the full refresh surface will show errors.
    }
  }

  async function refreshSensorsOnly() {
    try {
      const [summary, list, currentPairing] = await Promise.all([
        api.haccpSensorsSummary(token),
        api.haccpSensors(token),
        api.haccpCurrentSensorPairing(token),
      ]);
      setSensorSummary(summary);
      setSensors(list);
      setPairing(currentPairing);
    } catch {
      // Keep existing sensor state.
    }
  }

  async function startSensorPairing() {
    setSaving(true);
    setError(null);
    try {
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
        const min = Number(configForm.min);
        const max = Number(configForm.max);
        await api.haccpCreate(token, '/cooling-equipment', {
          name,
          type: configForm.type || 'refroidissement',
          location: configForm.location || undefined,
          capacity: configForm.capacity || undefined,
          notes: configForm.notes || undefined,
          temperatureRange: Number.isFinite(min) && Number.isFinite(max) ? { min, max } : undefined,
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

  return (
    <>
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
        {activeTab !== 'dashboard' && activeTab !== 'setup' && activeTab !== 'sensors' && activeTab !== 'labels' ? (
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

function DashboardView({ dashboard, readiness, loading, searchQuery, setSearchQuery, onGenerateReport, onStartOnboarding, onSelectTab }: { dashboard: HaccpDashboard | null; readiness: HaccpReadiness; loading: boolean; searchQuery: string; setSearchQuery: (value: string) => void; onGenerateReport: () => void; onStartOnboarding: () => void; onSelectTab?: (tabName: string) => void }) {
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
              <ModuleCard key={module.id} module={module} onClick={() => onSelectTab?.(module.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HaccpSetupCard({ readiness, onStart }: { readiness: HaccpReadiness; onStart: () => void }) {
  const steps = [
    { title: 'Températures', text: 'Enceintes et frigos suivis', done: readiness.temperatureReady },
    { title: 'Process', text: 'Réchauffement, refroidissement, congélation', done: readiness.processReady },
    { title: 'Nettoyage', text: 'Zones, surfaces et fréquences', done: readiness.cleaningReady },
  ];
  const label = readiness.progress === 0 ? 'Configuration initiale à lancer' : readiness.progress === 100 ? 'Configuration terminée' : 'Configuration HACCP à compléter';

  return (
    <section className="card-modern stocks-setup-card haccp-setup-card">
      <div className="section-header-modern">
        <div className="section-info">
          <span className="card-title"><Settings2 size={18} /> Configuration initiale HACCP</span>
          <span className="section-tagline">{label}. Les contrôles terrain passent ensuite par l’application ToqueHub.</span>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onStart}>
          {readiness.progress ? 'Continuer' : 'Démarrer'} <ArrowRight size={16} />
        </button>
      </div>
      <div className="stocks-setup-progress">
        <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${readiness.progress}%` }} /></div>
        <strong>{readiness.progress}%</strong>
      </div>
      <div className="haccp-setup-steps">
        {steps.map((step) => (
          <div key={step.title} className={`haccp-setup-step ${step.done ? 'done' : 'todo'}`}>
            {step.done ? <CheckCircle2 size={16} /> : <Clock size={16} />}
            <div><strong>{step.title}</strong><span>{step.text}</span></div>
          </div>
        ))}
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
  saving,
  onComplete,
  onClose,
}: {
  readiness: HaccpReadiness;
  temperatureEquipment: HaccpItem[];
  processEquipment: HaccpItem[];
  cleaningZones: HaccpItem[];
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
  const steps: HaccpOnboardingStep[] = ['welcome', 'temperatures', 'process', 'cleaning', 'review'];
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
  const query = searchQuery.trim().toLowerCase();
  const filterRows = (rows: HaccpItem[]) => !query ? rows : rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
  const filteredTemperatures = filterRows(temperatureEquipment);
  const filteredProcess = filterRows(processEquipment);
  const filteredZones = filterRows(cleaningZones);
  const surfaceCount = cleaningZones.reduce((total, zone) => total + (Array.isArray(zone.surfaces) ? zone.surfaces.length : 0), 0);

  return (
    <div className="haccp-config-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section
        className="card-modern haccp-config-hero"
        style={{
          padding: '2rem',
          borderRadius: '24px',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          color: 'var(--text-main)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.02)',
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          className="section-header-modern"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.25rem',
            paddingBottom: '1.5rem',
            borderBottom: '1px solid #e2e8f0',
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
                gap: '0.5rem',
              }}
            >
              <Settings2 size={20} color="#10b981" /> Configuration Zones & Matériels
            </span>
            <span className="section-tagline" style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.35rem', display: 'block' }}>
              Référentiel HACCP partagé avec l’application ToqueHub mobile : équipements, process et zones de nettoyage.
            </span>
          </div>
        </div>

        <div className="haccp-config-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
          <ConfigSummaryCard icon={<Thermometer size={18} />} label="Équipements température" value={temperatureEquipment.length} detail="Enceintes suivies sur mobile" color="emerald" />
          <ConfigSummaryCard icon={<Snowflake size={18} />} label="Équipements process" value={processEquipment.length} detail="Réchauffement, froid et congélation" color="blue" />
          <ConfigSummaryCard icon={<ShieldCheck size={18} />} label="Zones de nettoyage" value={cleaningZones.length} detail={`${surfaceCount} surface(s) configurée(s)`} color="amber" />
        </div>
      </section>

      <div className="haccp-config-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
        <ConfigCollection
          kind="temperature"
          title="Matériels température"
          subtitle="Chambres froides, frigos, enceintes et zones réfrigérées."
          icon={<Thermometer size={16} />}
          items={filteredTemperatures}
          onCreate={onCreate}
          onDelete={onDelete}
        />
        <ConfigCollection
          kind="process"
          title="Matériels process"
          subtitle="Équipements de réchauffement, refroidissement ou congélation."
          icon={<Snowflake size={16} />}
          items={filteredProcess}
          onCreate={onCreate}
          onDelete={onDelete}
        />
        <ConfigCollection
          kind="cleaning"
          title="Zones de nettoyage"
          subtitle="Zones et surfaces à contrôler dans l’application ToqueHub."
          icon={<ShieldCheck size={16} />}
          items={filteredZones}
          onCreate={onCreate}
          onDelete={onDelete}
        />
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
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
  color: 'emerald' | 'blue' | 'amber';
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
      className="haccp-config-summary-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1.25rem',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        background: 'white',
        cursor: 'default',
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

function ConfigCollection({
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
  onCreate: (kind: HaccpConfigKind) => void;
  onDelete: (kind: HaccpConfigKind, item: HaccpItem) => void;
}) {
  const colorMap = {
    temperature: { color: '#10b981', label: 'Température', light: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)' },
    process: { color: '#3b82f6', label: 'Processus', light: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)' },
    cleaning: { color: '#f59e0b', label: 'Nettoyage', light: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.2)' },
  };
  const theme = colorMap[kind];

  return (
    <section
      className="card-modern haccp-config-column"
      style={{
        padding: '1.5rem',
        borderRadius: '20px',
        background: '#f8fafc',
        border: '1px solid #f1f5f9',
        minHeight: '520px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <div
        className="haccp-config-column-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.85rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #eef2f6',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--text-main)',
              fontWeight: 850,
              fontSize: '1rem',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                color: theme.color,
                background: theme.light,
                border: `1px solid ${theme.border}`,
                padding: '0.25rem',
                borderRadius: '8px',
              }}
            >
              {icon}
            </span>
            {title}
          </span>
          <p style={{ margin: '0.4rem 0 0', color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.4 }}>
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onCreate(kind)}
          style={{
            background: theme.color,
            borderColor: 'transparent',
            borderRadius: '10px',
            padding: '0.4rem 0.85rem',
            fontSize: '0.82rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            boxShadow: `0 4px 12px ${theme.light}`,
          }}
        >
          <Plus size={14} /> Créer
        </button>
      </div>

      <div
        className="haccp-config-list"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          marginTop: 0,
          flexGrow: 1,
          overflowY: 'auto',
          maxHeight: '400px',
          paddingRight: '0.25rem',
        }}
      >
        <AnimatePresence>
          {items.map((item, index) => (
            <ConfigItemCard
              key={item._id ?? item.id ?? index}
              kind={kind}
              item={item}
              onDelete={() => onDelete(kind, item)}
            />
          ))}
        </AnimatePresence>
        {!items.length ? (
          <div
            className="haccp-config-empty"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              padding: '3rem 1.5rem',
              border: '1px dashed #cbd5e1',
              borderRadius: '16px',
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.4)',
              textAlign: 'center',
              fontSize: '0.82rem',
            }}
          >
            <ClipboardList size={22} style={{ color: '#94a3b8' }} />
            <span style={{ fontWeight: 600 }}>Aucun élément configuré</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ConfigItemCard({ kind, item, onDelete }: { kind: HaccpConfigKind; item: HaccpItem; onDelete: () => void }) {
  const surfaces = Array.isArray(item.surfaces) ? item.surfaces : [];
  const range = item.temperatureRange;

  const colorMap = {
    temperature: '#10b981',
    process: '#3b82f6',
    cleaning: '#f59e0b',
  };
  const themeColor = colorMap[kind];

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ y: -2, boxShadow: '0 8px 16px rgba(0, 0, 0, 0.04)' }}
      transition={{ duration: 0.15 }}
      className="haccp-config-item-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        borderLeft: `4px solid ${themeColor}`,
        background: 'white',
        boxShadow: '0 2px 4px rgba(0,0,0,0.01)',
      }}
    >
      <div
        className="haccp-config-item-top"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
        }}
      >
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <strong style={{ color: 'var(--text-main)', fontSize: '0.92rem', fontWeight: 800, lineHeight: 1.2 }}>
            {item.name ?? 'Sans nom'}
          </strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.3 }}>
            {kind === 'cleaning' ? item.description || `${surfaces.length} surface(s)` : processLabel(item.type ?? '')}
          </span>
        </div>
        <button
          type="button"
          className="haccp-action-btn"
          onClick={onDelete}
          aria-label="Supprimer"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0.35rem',
            borderRadius: '8px',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.color = '#ef4444';
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {kind !== 'cleaning' ? (
        <div
          className="haccp-choice-meta"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            fontSize: '0.74rem',
            color: '#64748b',
            alignItems: 'center',
          }}
        >
          <span style={{ background: '#f1f5f9', padding: '0.15rem 0.45rem', borderRadius: '6px', fontWeight: 700 }}>
            {item.type ?? '-'}
          </span>
          {range?.min != null && range?.max != null ? (
            <span style={{ background: '#f0fdf4', color: '#15803d', padding: '0.15rem 0.45rem', borderRadius: '6px', fontWeight: 700, border: '1px solid rgba(21, 128, 61, 0.1)' }}>
              {range.min}°C à {range.max}°C
            </span>
          ) : null}
          {item.location ? (
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <MapPin size={11} style={{ marginRight: '0.2rem', color: '#94a3b8' }} />
              {item.location}
            </span>
          ) : null}
        </div>
      ) : (
        <div
          className="haccp-config-surface-pills"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.3rem',
          }}
        >
          {surfaces.slice(0, 4).map((surface: HaccpItem, index: number) => (
            <span
              key={surface._id ?? surface.id ?? `${surface.name}-${index}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '22px',
                padding: '0.1rem 0.45rem',
                borderRadius: '8px',
                background: '#f1f5f9',
                color: '#475569',
                fontSize: '0.7rem',
                fontWeight: 750,
                border: '1px solid #e2e8f0',
              }}
            >
              {surface.name} · {frequencyLabel(surface.frequency)}
            </span>
          ))}
          {surfaces.length > 4 ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '22px',
                padding: '0.1rem 0.45rem',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.08)',
                color: '#d97706',
                fontSize: '0.7rem',
                fontWeight: 750,
                border: '1px solid rgba(245, 158, 11, 0.15)',
              }}
            >
              +{surfaces.length - 4}
            </span>
          ) : null}
        </div>
      )}
    </motion.article>
  );
}

function SectionView({ section, rows, products, searchQuery, setSearchQuery, processType, onProcessType, onCreate, onDelete, onAnalyzeImage, onGenerateReport, saving, onBack }: {
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
      <SimpleTable rows={rows} columns={columnsFor(section)} onDelete={onDelete} section={section} />
    </div>
  );
}

function SensorsView({
  sensors,
  summary,
  pairing,
  selectedSensor,
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
  const filteredSensors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sensors;
    return sensors.filter((sensor) => JSON.stringify(sensor).toLowerCase().includes(query));
  }, [searchQuery, sensors]);
  const activePairing = pairing?.status === 'ACTIVE';
  const selectedName = selectedSensor ? sensorDisplayName(selectedSensor) : '';

  useEffect(() => {
    setDraftName(selectedName);
    setDraftEquipmentId(selectedSensor?.assignedEquipment?.id ?? '');
  }, [selectedSensor?.id, selectedName, selectedSensor?.assignedEquipment?.id]);

  return (
    <div className="haccp-sensors-page">
      <div className="haccp-sensors-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}><ArrowLeft size={14} /> Retour</button>
        <div className="haccp-search">
          <Search size={14} />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Rechercher un capteur..." />
        </div>
        <button type="button" className="btn secondary" onClick={onRefresh} disabled={saving}><RefreshCw size={16} /> Actualiser</button>
        {activePairing ? (
          <button type="button" className="btn secondary" onClick={onStopPairing} disabled={saving}><X size={16} /> Stop</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onStartPairing} disabled={saving}><Plus size={16} /> Ajouter un capteur</button>
        )}
      </div>

      <div className="haccp-sensors-kpis">
        <SensorMetric label="Total" value={summary.total} detail="Capteurs connus" />
        <SensorMetric label="Connectés" value={summary.online} detail="En ligne" tone="ok" />
        <SensorMetric label="Hors ligne" value={summary.offline} detail="À vérifier" tone={summary.offline > 0 ? 'danger' : 'neutral'} />
        <SensorMetric label="Batterie" value={summary.averageBattery == null ? '-' : `${summary.averageBattery}%`} detail={sensorGlobalStatus(summary.globalStatus)} />
      </div>

      {activePairing ? (
        <div className="haccp-pairing-banner">
          <div>
            <strong>Mode appairage actif</strong>
            <span>Fin prévue {pairing?.expiresAt ? new Date(pairing.expiresAt).toLocaleTimeString('fr-FR') : '-'}</span>
          </div>
          <span className="haccp-status-pill ok"><span className="status-dot" />{pairing?.sensors?.length ?? pairing?.discoveredIds?.length ?? 0} détecté(s)</span>
        </div>
      ) : null}

      <div className="haccp-sensors-layout">
        <div className="haccp-list-panel">
          <div className="haccp-table-wrapper">
            <table className="haccp-control-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Modèle</th>
                  <th>Équipement</th>
                  <th>Température</th>
                  <th>Batterie</th>
                  <th>Signal</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filteredSensors.map((sensor) => (
                  <tr key={sensor.id} onClick={() => onSelect(sensor)} className={selectedSensor?.id === sensor.id ? 'selected' : ''}>
                    <td><strong>{sensorDisplayName(sensor)}</strong><small>{sensor.manufacturer ?? 'Fabricant inconnu'}</small></td>
                    <td>{sensor.model ?? '-'}</td>
                    <td>{sensor.assignedEquipment?.name ?? <span className="muted">Non affecté</span>}</td>
                    <td>{sensor.currentTemperature == null ? '-' : `${Number(sensor.currentTemperature).toFixed(1)}°C`}</td>
                    <td>{sensor.battery == null ? '-' : `${Math.round(Number(sensor.battery))}%`}</td>
                    <td>{sensor.linkQuality ?? '-'}</td>
                    <td><span className={`haccp-status-pill ${sensorStatusClass(sensor.status)}`}><span className="status-dot" />{sensorStatusLabel(sensor.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredSensors.length ? <div className="haccp-empty-state"><Smartphone size={36} /><p>Aucun capteur détecté.</p></div> : null}
          </div>
        </div>

        <aside className="haccp-sensor-detail">
          {selectedSensor ? (
            <>
              <div className="haccp-sensor-detail-head">
                <span className={`haccp-status-pill ${sensorStatusClass(selectedSensor.status)}`}><span className="status-dot" />{sensorStatusLabel(selectedSensor.status)}</span>
                <strong>{sensorDisplayName(selectedSensor)}</strong>
                <small>{selectedSensor.model ?? 'Modèle inconnu'} · {selectedSensor.provider}</small>
              </div>
              <div className="haccp-sensor-current-grid">
                <SensorMetric label="Température" value={selectedSensor.currentTemperature == null ? '-' : `${Number(selectedSensor.currentTemperature).toFixed(1)}°C`} detail="Dernier relevé" />
                <SensorMetric label="Humidité" value={selectedSensor.currentHumidity == null ? '-' : `${Number(selectedSensor.currentHumidity).toFixed(0)}%`} detail="Dernier relevé" />
                <SensorMetric label="Batterie" value={selectedSensor.battery == null ? '-' : `${Math.round(Number(selectedSensor.battery))}%`} detail="Niveau" />
                <SensorMetric label="Signal" value={selectedSensor.linkQuality ?? '-'} detail="LQI" />
              </div>
              <label className="form-field">
                <span>Nom ToqueHub</span>
                <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
              </label>
              <label className="form-field">
                <span>Équipement HACCP associé</span>
                <select value={draftEquipmentId} onChange={(event) => setDraftEquipmentId(event.target.value)}>
                  <option value="">Non affecté</option>
                  {temperatureEquipment.map((equipment) => (
                    <option key={equipment._id ?? equipment.id} value={equipment._id ?? equipment.id}>{equipment.name}</option>
                  ))}
                </select>
              </label>
              <div className="haccp-sensor-actions">
                <button type="button" className="btn btn-primary" disabled={saving || !draftName.trim()} onClick={() => onRename(selectedSensor, draftName.trim())}>Renommer</button>
                <button type="button" className="btn secondary" disabled={saving} onClick={() => onAssign(selectedSensor, draftEquipmentId)}>Affecter</button>
              </div>
              <div className="haccp-sensor-history">
                <strong>Dernières communications</strong>
                <span>{selectedSensor.lastSeenAt ? new Date(selectedSensor.lastSeenAt).toLocaleString('fr-FR') : 'Aucune communication'}</span>
                <span>{selectedSensor.externalId}</span>
              </div>
              <div className="haccp-sensor-danger">
                <button type="button" className="btn secondary" disabled={saving} onClick={() => onRemove(selectedSensor, false)}><Trash2 size={15} /> Supprimer ToqueHub</button>
                <button type="button" className="btn secondary" disabled={saving} onClick={() => onRemove(selectedSensor, true)}><Trash2 size={15} /> Supprimer réseau</button>
              </div>
            </>
          ) : (
            <div className="haccp-empty-state"><Settings2 size={34} /><p>Sélectionnez un capteur pour voir sa fiche.</p></div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SensorMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: ReactNode; detail: string; tone?: 'ok' | 'danger' | 'neutral' }) {
  return (
    <div className={`haccp-sensor-metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function EditableTemperatureStep({ items, existing, onChange }: { items: TemperatureTemplate[]; existing: HaccpItem[]; onChange: (items: TemperatureTemplate[]) => void }) {
  const existingNames = new Set(existing.map((item) => normalizeName(item.name)));
  return (
    <div className="haccp-onboarding-step">
      <StepIntro
        icon={<Thermometer size={20} />}
        title="Équipements de température"
        text="Préparez les enceintes qui seront contrôlées chaque jour depuis l’application ToqueHub."
      />
      <div className="haccp-template-grid">
        {items.map((item, index) => {
          const alreadyExists = existingNames.has(normalizeName(item.name));
          return (
            <button
              type="button"
              key={item.key}
              className={`haccp-template-card haccp-choice-card ${item.selected ? 'selected' : ''} ${alreadyExists ? 'existing' : ''}`}
              onClick={() => updateArrayItem(items, index, { selected: !item.selected }, onChange)}
            >
              <div className="haccp-template-card-header">
                <strong>{item.name}</strong>
                <span className="haccp-choice-check">{alreadyExists || item.selected ? <CheckCircle2 size={18} /> : null}</span>
              </div>
              <span className="haccp-choice-description">{item.description}</span>
              <div className="haccp-choice-meta">
                <span>{item.type}</span>
                <span>Cible {item.recommendedTemp}°C</span>
              </div>
              {alreadyExists ? <small>Déjà présent dans HACCP</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EditableProcessStep({ items, existing, onChange }: { items: ProcessTemplate[]; existing: HaccpItem[]; onChange: (items: ProcessTemplate[]) => void }) {
  const existingKeys = new Set(existing.map((item) => `${String(item.type || '').toLowerCase()}::${normalizeName(item.name)}`));
  return (
    <div className="haccp-onboarding-step">
      <StepIntro
        icon={<Snowflake size={20} />}
        title="Process HACCP"
        text="Créez les équipements utilisés pour le réchauffement, le refroidissement et la congélation."
      />
      <div className="haccp-template-grid">
        {items.map((item, index) => {
          const alreadyExists = existingKeys.has(`${item.type}::${normalizeName(item.name)}`);
          return (
            <button
              type="button"
              key={item.key}
              className={`haccp-template-card haccp-choice-card ${item.selected ? 'selected' : ''} ${alreadyExists ? 'existing' : ''}`}
              onClick={() => updateArrayItem(items, index, { selected: !item.selected }, onChange)}
            >
              <div className="haccp-template-card-header">
                <strong>{item.name}</strong>
                <span className="haccp-choice-check">{alreadyExists || item.selected ? <CheckCircle2 size={18} /> : null}</span>
              </div>
              <span className="haccp-choice-description">{item.description}</span>
              <div className="haccp-choice-meta">
                <span>{processLabel(item.type)}</span>
                <span>{item.temperatureRange.min}°C à {item.temperatureRange.max}°C</span>
              </div>
              {alreadyExists ? <small>Déjà présent dans HACCP</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EditableCleaningStep({ items, existing, onChange }: { items: CleaningTemplate[]; existing: HaccpItem[]; onChange: (items: CleaningTemplate[]) => void }) {
  const existingNames = new Set(existing.map((item) => normalizeName(item.name)));
  return (
    <div className="haccp-onboarding-step">
      <StepIntro
        icon={<ShieldCheck size={20} />}
        title="Zones et surfaces de nettoyage"
        text="Préparez le plan de nettoyage : zones, surfaces et fréquences qui seront cochées sur le terrain."
      />
      <div className="haccp-cleaning-template-list">
        {items.map((item, index) => {
          const alreadyExists = existingNames.has(normalizeName(item.name));
          return (
            <div key={item.key} className={`haccp-template-card haccp-cleaning-card haccp-choice-card ${item.selected ? 'selected' : ''} ${alreadyExists ? 'existing' : ''}`}>
              <button
                type="button"
                className="haccp-zone-choice-header"
                onClick={() => updateArrayItem(items, index, { selected: !item.selected }, onChange)}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
                <span className="haccp-choice-check">{alreadyExists || item.selected ? <CheckCircle2 size={18} /> : null}</span>
              </button>
              <div className="haccp-surface-menu-list">
                {item.surfaces.map((surface, surfaceIndex) => (
                  <div key={`${item.key}-${surface.name}`} className="haccp-surface-menu-row">
                    <span>{surface.name}</span>
                    <select
                      value={surface.frequency}
                      onChange={(event) => {
                        const surfaces = item.surfaces.map((entry, entryIndex) => entryIndex === surfaceIndex ? { ...entry, frequency: event.target.value } : entry);
                        updateArrayItem(items, index, { surfaces }, onChange);
                      }}
                    >
                      <option value="daily">Quotidien</option>
                      <option value="weekly">Hebdomadaire</option>
                      <option value="monthly">Mensuel</option>
                    </select>
                  </div>
                ))}
              </div>
              {alreadyExists ? <small className="muted">Zone déjà présente dans HACCP</small> : null}
            </div>
          );
        })}
      </div>
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

function StepIntro({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="haccp-step-intro">
      <span>{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
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
        <TextInput label="Température min" value={form.min} onChange={(value) => setField('min', value)} type="number" />
        <TextInput label="Température max" value={form.max} onChange={(value) => setField('max', value)} type="number" />
        <TextInput label="Emplacement" value={form.location} onChange={(value) => setField('location', value)} placeholder="Cuisine chaude" />
        <TextInput label="Capacité" value={form.capacity} onChange={(value) => setField('capacity', value)} placeholder="10 bacs GN" />
        <TextInput className="full-width" label="Notes" value={form.notes} onChange={(value) => setField('notes', value)} />
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
  return ({ sensors: 'Capteurs', temperatures: 'Températures', setup: 'Zones & matériels', cleaning: 'Nettoyage', traceability: 'Traçabilité', receptions: 'Réceptions', process: 'Processus', oil: 'Huiles', production: 'Production', products: 'Produits', labels: 'Étiquettes', reports: 'Rapports', dashboard: 'Dashboard' } as Record<HaccpTab, string>)[section];
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

function upsertSensor(items: HaccpSensor[], sensor: HaccpSensor) {
  const next = items.some((item) => item.id === sensor.id)
    ? items.map((item) => item.id === sensor.id ? { ...item, ...sensor } : item)
    : [sensor, ...items];
  return next.filter((item) => !item.isRemoved);
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

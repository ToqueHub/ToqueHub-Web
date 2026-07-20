import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChefHat,
  Factory,
  FileClock,
  Flame,
  History,
  ListChecks,
  Loader2,
  PackageCheck,
  Play,
  Plus,
  Search,
  Settings2,
  Snowflake,
  ThermometerSnowflake,
  TriangleAlert,
  Warehouse,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  ConservationState,
  Location,
  MenuUsageProfile,
  ProductionBatch,
  ProductionCampaign,
  ProductionComponentPlan,
  ProductionHistoryEntry,
  ProductionNeed,
  ProductionProfile,
  ProductionScenario,
  ProductionStockItem,
  ProductionStockSummaryItem,
  ProductionSuggestion,
  Site,
  TechnicalSheetRecipe,
  UserSession,
} from '../types';

type ProductionTab = 'dashboard' | 'today' | 'assignments' | 'materials' | 'history';
type Flow = 'reactive' | null;

type ProductionAppProps = {
  token: string;
  session: UserSession;
  tab: ProductionTab;
  onNavigate: (tab: ProductionTab) => void;
  usageProfile?: MenuUsageProfile;
};

const locale = 'fr-FR';

const translations = {
  profile: 'Règles de fabrication',
  dashboard: 'Vue d’ensemble',
  stock: 'Produits fabriqués',
  traceability: 'Historique',
  uncovered: 'À produire',
  running: 'Productions en cours',
  unavailable: 'Composants en alerte',
  noData: 'Aucune donnée à afficher',
  validate: 'Valider et réserver',
  start: 'Démarrer',
  complete: 'Terminer',
  simulate: 'Calculer les besoins',
  physical: 'Physique',
  reserved: 'Réservé',
  free: 'Disponible',
  gross: 'Besoin',
  net: 'Manque net',
  suggested: 'À fabriquer',
  surplus: 'Après production',
  components: 'Produits et sous-recettes nécessaires',
  loading: 'Chargement de la production…',
  profileRequired:
    'Créez une règle de fabrication pour relier une fiche technique à ce qu’elle permet de produire.',
} as const;

type ProductionProfileCopy = {
  label: string;
  title: string;
  subtitle: string;
  launchLabel: string;
  launchDescription: string;
  todayLabel: string;
  needsLabel: string;
  dateLabel: string;
  timeLabel: string;
  priorityDescription: string;
  flowSteps: string[];
  sources: Array<{ value: string; label: string }>;
};

const productionProfileCopy: Record<MenuUsageProfile, ProductionProfileCopy> = {
  RESTAURANT_CAFE: {
    label: 'Restaurant / café',
    title: 'Production du service',
    subtitle:
      'Préparez les bases et produits nécessaires au service, puis suivez ce qui est réellement disponible.',
    launchLabel: 'Lancer une production',
    launchDescription:
      'Reconstituer une préparation, anticiper le service ou maintenir un stock minimum.',
    todayLabel: 'Productions',
    needsLabel: 'À produire',
    dateLabel: 'Date de production',
    timeLabel: 'Prêt pour',
    priorityDescription: 'Préparations et produits finis à lancer en priorité',
    flowSteps: [
      'Besoin du service',
      'Produits et sous-recettes',
      'Quantité réalisable',
      'Production lancée',
      'Quantité disponible',
    ],
    sources: [
      { value: 'MANUAL', label: 'Décision manuelle' },
      { value: 'STOCK_TARGET', label: 'Stock cible' },
      { value: 'STOCK_MINIMUM', label: 'Stock minimum' },
      { value: 'SALES_FORECAST', label: 'Prévision de ventes' },
    ],
  },
  CATERER: {
    label: 'Traiteur',
    title: 'Production des prestations',
    subtitle:
      'Préparez chaque prestation selon sa date, ses quantités et son heure de livraison ou de service.',
    launchLabel: 'Préparer une prestation',
    launchDescription:
      'Calculer ce qu’il faut produire pour une commande ou une prestation confirmée.',
    todayLabel: 'Productions des prestations',
    needsLabel: 'Besoins des prestations',
    dateLabel: 'Date de la prestation',
    timeLabel: 'Heure de livraison ou service',
    priorityDescription: 'Productions à préparer pour les prochaines prestations',
    flowSteps: [
      'Commande confirmée',
      'Produits et sous-recettes',
      'Quantité réalisable',
      'Production lancée',
      'Prêt à livrer',
    ],
    sources: [
      { value: 'CATERING_ORDER', label: 'Commande traiteur' },
      { value: 'MANUAL', label: 'Décision manuelle' },
      { value: 'STOCK_TARGET', label: 'Stock cible' },
    ],
  },
  CENTRAL_KITCHEN: {
    label: 'Cuisine centrale',
    title: 'Pilotage des fabrications',
    subtitle:
      'Pilotez les volumes à produire par site et suivez les lots disponibles pour la distribution.',
    launchLabel: 'Lancer une fabrication',
    launchDescription:
      'Calculer un volume réalisable pour un site, une livraison ou un niveau de stock attendu.',
    todayLabel: 'Fabrications en cours',
    needsLabel: 'Besoins à couvrir',
    dateLabel: 'Date de fabrication',
    timeLabel: 'Heure limite',
    priorityDescription: 'Volumes et besoins à couvrir par les fabrications',
    flowSteps: [
      'Besoins des sites',
      'Matières et préparations',
      'Volume réalisable',
      'Fabrication lancée',
      'Lots disponibles',
    ],
    sources: [
      { value: 'STOCK_TARGET', label: 'Stock cible' },
      { value: 'STOCK_MINIMUM', label: 'Stock minimum' },
      { value: 'MANUAL', label: 'Décision manuelle' },
      { value: 'SALES_FORECAST', label: 'Prévision de volumes' },
    ],
  },
  CUSTOM: {
    label: 'Organisation hybride',
    title: 'Pilotage de la production',
    subtitle:
      'Adaptez les quantités à vos services, prestations et besoins de stock dans une vue commune.',
    launchLabel: 'Lancer une production',
    launchDescription:
      'Calculer les besoins et la quantité réellement réalisable selon votre organisation.',
    todayLabel: 'Productions',
    needsLabel: 'À produire',
    dateLabel: 'Date souhaitée',
    timeLabel: 'Heure limite',
    priorityDescription: 'Productions et besoins à traiter en priorité',
    flowSteps: [
      'Besoin identifié',
      'Produits et sous-recettes',
      'Quantité réalisable',
      'Production lancée',
      'Quantité disponible',
    ],
    sources: [
      { value: 'MANUAL', label: 'Décision manuelle' },
      { value: 'CATERING_ORDER', label: 'Commande' },
      { value: 'STOCK_TARGET', label: 'Stock cible' },
      { value: 'STOCK_MINIMUM', label: 'Stock minimum' },
      { value: 'SALES_FORECAST', label: 'Prévision' },
    ],
  },
};

const n = (value: unknown) => Number(value ?? 0) || 0;
const dateInput = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};
const dateTime = (date: string, time: string) =>
  new Date(`${date}T${time || '08:00'}:00`).toISOString();
const q = (value: unknown, symbol?: string) =>
  `${n(value).toLocaleString(undefined, { maximumFractionDigits: 3 })}${symbol ? ` ${symbol}` : ''}`;
const key = () => crypto.randomUUID();

function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onMouseDown={onClose}>
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="modal-content-wrapper"
            style={{
              width: wide ? 'min(1060px, 96vw)' : 'min(720px, 96vw)',
              maxHeight: '92vh',
              overflow: 'auto',
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{ position: 'sticky', top: 0, background: 'white', zIndex: 2 }}
            >
              <h3 style={{ margin: 0 }}>{title}</h3>
              <button className="modal-close-btn" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem' }}>
              {children}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function Metric({
  label,
  value,
  icon,
  tone = '#d97706',
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <motion.div
      className="card-modern"
      whileHover={{ y: -3 }}
      style={{ padding: '1.2rem', minHeight: 116 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <span
          style={{
            color: 'var(--text-muted)',
            fontSize: '.78rem',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 34,
            height: 34,
            borderRadius: 10,
            color: tone,
            background: `${tone}18`,
          }}
        >
          {icon}
        </span>
      </div>
      <strong style={{ display: 'block', fontSize: '1.8rem', marginTop: '.65rem' }}>{value}</strong>
    </motion.div>
  );
}

function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'good' | 'warn' | 'bad' | 'info' | 'neutral';
}) {
  const colors = {
    good: ['#047857', '#d1fae5'],
    warn: ['#b45309', '#fef3c7'],
    bad: ['#b91c1c', '#fee2e2'],
    info: ['#1d4ed8', '#dbeafe'],
    neutral: ['#475569', '#f1f5f9'],
  }[tone];
  return (
    <span
      style={{
        color: colors[0],
        background: colors[1],
        borderRadius: 999,
        padding: '.22rem .55rem',
        fontSize: '.72rem',
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state app-empty" style={{ padding: '2.75rem 1rem' }}>
      <Boxes size={34} />
      <strong>{text}</strong>
    </div>
  );
}

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'info' | 'neutral' => {
  if (['COMPLETED', 'COVERED', 'AVAILABLE'].includes(status)) return 'good';
  if (['BLOCKED', 'CANCELLED', 'SHORTAGE', 'INSUFFICIENT_STOCK'].includes(status)) return 'bad';
  if (
    [
      'IN_PROGRESS',
      'PREPARING',
      'COOKING',
      'THAWING',
      'PARTIALLY_COMPLETED',
      'PARTIALLY_COVERED',
    ].includes(status)
  )
    return 'warn';
  if (['VALIDATED', 'READY', 'CONFIRMED', 'TO_PRODUCE'].includes(status)) return 'info';
  return 'neutral';
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Brouillon',
  PROPOSED: 'À valider',
  PLANNED: 'Planifiée',
  BLOCKED: 'Bloquée',
  VALIDATED: 'Validée',
  READY: 'Prête',
  TO_PRODUCE: 'À produire',
  TO_PREPARE: 'À démarrer',
  PREPARING: 'En préparation',
  COOKING: 'En cuisson',
  COOLING: 'En refroidissement',
  FREEZING: 'En congélation',
  IN_PROGRESS: 'En cours',
  PARTIALLY_COMPLETED: 'Partiellement terminée',
  PARTIALLY_COVERED: 'Partiellement couvert',
  COMPLETED: 'Terminée',
  COVERED: 'Couvert',
  AVAILABLE: 'Disponible',
  SHORTAGE: 'Manquant',
  INSUFFICIENT_STOCK: 'Stock insuffisant',
  CANCELLED: 'Annulée',
};
const statusLabel = (status: string) => statusLabels[status] ?? status.replaceAll('_', ' ');

function ComponentTree({ plan, depth = 0 }: { plan: ProductionComponentPlan; depth?: number }) {
  return (
    <div style={{ display: 'grid', gap: '.55rem', marginLeft: depth ? '1rem' : 0 }}>
      {plan.components.map((component, index) => (
        <div
          key={`${component.product.id}-${index}`}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '.75rem',
            background: depth ? '#fafafa' : 'white',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '.75rem',
              alignItems: 'center',
            }}
          >
            <div>
              <strong>{component.product.name}</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>
                {q(component.requiredQuantity, component.recipeUnit.symbol)} · stock:{' '}
                {component.stockUnitQuantity == null
                  ? '—'
                  : q(component.stockUnitQuantity, component.product.unit?.symbol)}
              </div>
            </div>
            <Badge tone={statusTone(component.status)}>
              {component.status.replaceAll('_', ' ')}
            </Badge>
          </div>
          {component.subRecipe?.plan && depth < 5 ? (
            <div
              style={{
                marginTop: '.65rem',
                borderLeft: '3px solid #f59e0b',
                paddingLeft: '.65rem',
              }}
            >
              <div style={{ fontSize: '.78rem', fontWeight: 800, marginBottom: '.45rem' }}>
                Sous-recette proposée : {q(component.subRecipe.suggestion.quantity)} (
                {component.subRecipe.suggestion.batches.map(n).join(' + ')})
              </div>
              <ComponentTree plan={component.subRecipe.plan} depth={depth + 1} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ProductionApp({
  token,
  session,
  tab,
  onNavigate,
  usageProfile = 'RESTAURANT_CAFE',
}: ProductionAppProps) {
  const t = translations;
  const profileCopy = productionProfileCopy[usageProfile];
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<ProductionProfile[]>([]);
  const [campaigns, setCampaigns] = useState<ProductionCampaign[]>([]);
  const [needs, setNeeds] = useState<ProductionNeed[]>([]);
  const [productionStock, setProductionStock] = useState<ProductionStockItem[]>([]);
  const [productionStockSummary, setProductionStockSummary] = useState<
    ProductionStockSummaryItem[]
  >([]);
  const [history, setHistory] = useState<ProductionHistoryEntry[]>([]);
  const [recipes, setRecipes] = useState<TechnicalSheetRecipe[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [flow, setFlow] = useState<Flow>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [simulation, setSimulation] = useState<ProductionSuggestion | null>(null);
  const [selectedScenario, setSelectedScenario] =
    useState<ProductionScenario['kind']>('RECOMMENDED');
  const [batchToComplete, setBatchToComplete] = useState<ProductionBatch | null>(null);
  const [stockToTransition, setStockToTransition] = useState<ProductionStockItem | null>(null);
  const [traceability, setTraceability] = useState<Record<string, unknown> | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [reactiveDraft, setReactiveDraft] = useState({
    profileId: '',
    quantity: '1',
    date: dateInput(),
    time: '08:00',
    source: 'MANUAL',
    comments: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [
        profilesResult,
        campaignResult,
        needsResult,
        stockResult,
        historyResult,
        recipeResult,
        siteResult,
        locationResult,
      ] = await Promise.all([
        api.productionProfiles(token, { pageSize: 200 }),
        api.productionCampaigns(token, { pageSize: 200 }),
        api.productionNeeds(token, { pageSize: 200 }),
        api.productionStock(token, { pageSize: 200 }),
        api.productionHistory(token, { pageSize: 200 }).catch(() => []),
        api.technicalSheetRecipes(token, { includeArchived: false, pageSize: 200 }),
        api.sites(token),
        api.locations(token),
      ]);
      setProfiles(profilesResult);
      setCampaigns(campaignResult.items);
      setNeeds(needsResult.items);
      setProductionStock(stockResult.items);
      setProductionStockSummary(stockResult.summary ?? []);
      setHistory(historyResult);
      setRecipes(recipeResult.items ?? []);
      setSites(siteResult.filter((site) => !site.isArchived));
      setLocations(locationResult.filter((location) => !location.isArchived));
      setReactiveDraft((current) => ({
        ...current,
        profileId: current.profileId || profilesResult[0]?.id || '',
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Production data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeNeeds = useMemo(
    () => needs.filter((need) => !['COVERED', 'CANCELLED'].includes(need.status)),
    [needs],
  );
  const actionableProductions = useMemo(
    () =>
      campaigns
        .filter((campaign) => !['COMPLETED', 'CANCELLED'].includes(campaign.status))
        .sort((left, right) => left.productionDate.localeCompare(right.productionDate)),
    [campaigns],
  );
  const today = dateInput();
  const todayBatches = useMemo(
    () =>
      campaigns
        .filter((campaign) => campaign.productionDate.slice(0, 10) === today)
        .flatMap((campaign) => campaign.batches.map((batch) => ({ batch, campaign }))),
    [campaigns, today],
  );
  const componentAlerts = useMemo(
    () =>
      campaigns.flatMap((campaign) =>
        campaign.requirements.filter((line) => !['OK', 'POTENTIAL_SHORTAGE'].includes(line.status)),
      ),
    [campaigns],
  );
  const filteredProductionStock = useMemo(() => {
    const search = stockSearch.trim().toLocaleLowerCase(locale);
    return search
      ? productionStock.filter((item) =>
          `${item.product.name} ${item.variant?.name ?? ''} ${item.lot?.lotNumber ?? ''}`
            .toLocaleLowerCase(locale)
            .includes(search),
        )
      : productionStock;
  }, [productionStock, stockSearch, locale]);
  const filteredProductionStockSummary = useMemo(() => {
    const search = stockSearch.trim().toLocaleLowerCase(locale);
    return search
      ? productionStockSummary.filter((item) =>
          `${item.technicalSheetName} ${item.productName} ${item.variantName ?? ''}`
            .toLocaleLowerCase(locale)
            .includes(search),
        )
      : productionStockSummary;
  }, [productionStockSummary, stockSearch, locale]);

  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const selectedProfile = profileById.get(reactiveDraft.profileId);
  const destinationLocations = selectedProfile
    ? locations.filter((location) => location.siteId === selectedProfile.siteId)
    : locations;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function simulateReactive(event: FormEvent) {
    event.preventDefault();
    if (!reactiveDraft.profileId) return;
    await run(async () => {
      const result = await api.simulateProductionSuggestion(token, {
        profileId: reactiveDraft.profileId,
        grossRequirement: reactiveDraft.quantity,
        neededAt: dateTime(reactiveDraft.date, reactiveDraft.time),
      });
      setSimulation(result);
      setSelectedScenario('RECOMMENDED');
    });
  }

  async function createReactiveCampaign() {
    if (!selectedProfile || !simulation) return;
    await run(async () => {
      const need = await api.createProductionNeed(token, {
        siteId: selectedProfile.siteId,
        productId: selectedProfile.outputProductId,
        variantId: selectedProfile.outputVariantId ?? undefined,
        unitId: selectedProfile.yieldUnitId,
        source: reactiveDraft.source,
        quantity: reactiveDraft.quantity,
        neededAt: dateTime(reactiveDraft.date, reactiveDraft.time),
        status: 'CONFIRMED',
        notes: reactiveDraft.comments || undefined,
      });
      await api.createProductionCampaign(token, {
        profileId: selectedProfile.id,
        grossRequirement: reactiveDraft.quantity,
        neededAt: dateTime(reactiveDraft.date, reactiveDraft.time),
        plannedTime: reactiveDraft.time,
        needIds: [need.id],
        scenarioKind: selectedScenario,
        comments: reactiveDraft.comments || undefined,
        createSubRecipeNeeds: true,
      });
      setFlow(null);
      setSimulation(null);
      await load();
      onNavigate(reactiveDraft.date === today ? 'today' : 'assignments');
    });
  }

  async function validateCampaign(campaign: ProductionCampaign, allowShortage = false) {
    await run(async () => {
      try {
        await api.validateProductionCampaign(token, campaign.id, {
          idempotencyKey: key(),
          allowShortage,
          overrideReason: allowShortage
            ? 'Validation dérogatoire confirmée depuis le poste Production'
            : undefined,
        });
      } catch (cause) {
        if (
          !allowShortage &&
          window.confirm(
            'Des composants sont insuffisants. Valider avec une dérogation managériale ?',
          )
        ) {
          await api.validateProductionCampaign(token, campaign.id, {
            idempotencyKey: key(),
            allowShortage: true,
            overrideReason: 'Dérogation managériale confirmée depuis le poste Production',
          });
        } else throw cause;
      }
      await load();
    });
  }

  async function startBatch(batch: ProductionBatch) {
    await run(async () => {
      await api.startProductionBatch(token, batch.id);
      await load();
    });
  }

  async function finishOperation(id: string) {
    await run(async () => {
      await api.updateProductionOperation(token, id, { status: 'COMPLETED' });
      await load();
    });
  }

  async function completeBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!batchToComplete) return;
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api.completeProductionBatch(token, batchToComplete.id, {
        actualQuantity: String(form.get('actualQuantity')),
        lostQuantity: String(form.get('lostQuantity') || '0'),
        destinationLocationId: String(form.get('destinationLocationId') || '') || undefined,
        conservationState: String(form.get('conservationState') || 'CHILLED') as ConservationState,
        expiresAt: String(form.get('expiresAt') || '') || undefined,
        notes: String(form.get('notes') || '') || undefined,
        idempotencyKey: key(),
      });
      setBatchToComplete(null);
      await load();
    });
  }

  async function transitionStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockToTransition) return;
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api.transitionProductionStock(token, stockToTransition.id, {
        quantity: String(form.get('quantity')),
        destinationState: String(form.get('destinationState')) as ConservationState,
        reason: String(form.get('reason') || '') || undefined,
        idempotencyKey: key(),
      });
      setStockToTransition(null);
      await load();
    });
  }

  async function showTrace(lotId: string) {
    setTraceLoading(true);
    setTraceability({});
    try {
      setTraceability(await api.productionLotTraceability(token, lotId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Traceability unavailable.');
      setTraceability(null);
    } finally {
      setTraceLoading(false);
    }
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const recipe = recipes.find((item) => item.id === String(form.get('technicalSheetId')));
    const outputProductId = recipe?.outputProductId;
    const yieldUnitId = recipe?.yieldUnitId ?? recipe?.outputProduct?.unitId;
    if (!recipe || !outputProductId || !yieldUnitId) {
      setError('Cette fiche technique ne possède pas encore de sortie de production exploitable.');
      return;
    }
    const formats = String(form.get('allowedFormats') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    await run(async () => {
      await api.createProductionProfile(token, {
        siteId: String(form.get('siteId')),
        technicalSheetId: String(form.get('technicalSheetId')),
        outputProductId,
        yieldUnitId,
        mode: String(form.get('mode') || 'FIXED'),
        referenceYield: String(form.get('referenceYield')),
        minimumQuantity: String(form.get('minimumQuantity') || '') || undefined,
        optimalQuantity: String(form.get('optimalQuantity') || '') || undefined,
        maximumQuantity: String(form.get('maximumQuantity') || '') || undefined,
        stepQuantity: String(form.get('stepQuantity') || '') || undefined,
        allowedFormats: formats.length ? formats : undefined,
        allowHalfBatch: form.get('allowHalfBatch') === 'on',
        allowDoubleBatch: form.get('allowDoubleBatch') === 'on',
        quantityPerMold: String(form.get('quantityPerMold') || '') || undefined,
        quantityPerTray: String(form.get('quantityPerTray') || '') || undefined,
        quantityPerCycle: String(form.get('quantityPerCycle') || '') || undefined,
        maximumCycles: n(form.get('maximumCycles')) || undefined,
        canFreeze: form.get('canFreeze') === 'on',
        shelfLifeHours: n(form.get('shelfLifeHours')) || undefined,
        frozenShelfLifeHours: n(form.get('frozenShelfLifeHours')) || undefined,
        shelfLifeAfterThawHours: n(form.get('shelfLifeAfterThawHours')) || undefined,
        thawingTimeMinutes: n(form.get('thawingTimeMinutes')) || undefined,
      });
      setShowProfile(false);
      await load();
    });
  }

  const navItems: Array<[ProductionTab, string, ReactNode]> = [
    ['dashboard', t.dashboard, <Factory size={15} />],
    ['assignments', profileCopy.needsLabel, <FileClock size={15} />],
    ['today', profileCopy.todayLabel, <Flame size={15} />],
    ['materials', t.stock, <Warehouse size={15} />],
    ['history', t.traceability, <History size={15} />],
  ];

  const ProductionCard = ({ campaign }: { campaign: ProductionCampaign }) => {
    const missing = campaign.requirements.filter(
      (line) => !['OK', 'POTENTIAL_SHORTAGE'].includes(line.status),
    );
    const complete = campaign.batches.filter((batch) =>
      ['COMPLETED', 'PARTIALLY_LOST'].includes(batch.status),
    ).length;
    return (
      <motion.article
        className="card-modern"
        whileHover={{ y: -3 }}
        style={{
          padding: '1.15rem',
          display: 'grid',
          gap: '.85rem',
          borderTop: `3px solid ${missing.length ? '#ef4444' : '#f59e0b'}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            gap: '.75rem',
          }}
        >
          <div>
            <strong>{campaign.name}</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>
              {new Date(campaign.productionDate).toLocaleString(locale)} ·{' '}
              {campaign.site?.name ?? '—'} · réf. {campaign.number}
            </div>
          </div>
          <Badge tone={statusTone(campaign.status)}>{statusLabel(campaign.status)}</Badge>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '.45rem',
            fontSize: '.75rem',
          }}
        >
          <Mini label={t.gross} value={q(campaign.grossRequirement)} />
          <Mini label={t.net} value={q(campaign.netRequirement)} />
          <Mini label={t.suggested} value={q(campaign.validatedQuantity)} />
          <Mini label={t.surplus} value={q(campaign.surplusQuantity)} />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '.75rem',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
            {complete}/{campaign.batches.length} lots · {missing.length} alerte(s)
          </span>
          {['DRAFT', 'PROPOSED', 'PLANNED', 'BLOCKED'].includes(campaign.status) ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void validateCampaign(campaign)}
            >
              <PackageCheck size={14} /> {t.validate}
            </button>
          ) : null}
        </div>
      </motion.article>
    );
  };

  if (loading)
    return (
      <div
        className="card-modern"
        style={{ padding: '4rem', display: 'grid', placeItems: 'center', gap: '.75rem' }}
      >
        <Loader2 className="spin" />
        <strong>{t.loading}</strong>
      </div>
    );

  return (
    <div className="production-app" style={{ display: 'grid', gap: '1.5rem' }}>
      <section
        className="welcome-hero theme-amber"
        style={{ position: 'relative', overflow: 'hidden' }}
      >
        <div style={{ position: 'absolute', right: '-3rem', top: '-5rem', opacity: 0.08 }}>
          <Factory size={230} />
        </div>
        <div style={{ position: 'relative' }}>
          <span className="welcome-tag">
            <ChefHat size={14} /> Production · {profileCopy.label}
          </span>
          <h1 className="welcome-title">{profileCopy.title}</h1>
          <p className="welcome-desc">{profileCopy.subtitle}</p>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                setFlow('reactive');
                setSimulation(null);
              }}
            >
              <Plus size={16} /> {profileCopy.launchLabel}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowProfile(true)}>
              <Settings2 size={16} /> {t.profile}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '.65rem',
            padding: '.9rem 1rem',
            borderRadius: 12,
            color: '#991b1b',
            background: '#fef2f2',
            border: '1px solid #fecaca',
          }}
        >
          <TriangleAlert size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="modal-close-btn" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      {!profiles.length ? (
        <div
          className="card-modern"
          style={{
            padding: '1.25rem',
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            borderLeft: '4px solid #f59e0b',
          }}
        >
          <Settings2 size={28} color="#d97706" />
          <div style={{ flex: 1 }}>
            <strong>{t.profileRequired}</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>
              Rendement, multiples, formats, moules, cycles, conservation.
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowProfile(true)}>
            {t.profile}
          </button>
        </div>
      ) : null}

      <nav style={{ display: 'flex', gap: '.35rem', overflowX: 'auto', padding: '.25rem' }}>
        {navItems.map(([id, label, icon]) => (
          <button
            key={id}
            className={`btn ${tab === id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => onNavigate(id)}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
        >
          {tab === 'dashboard' ? (
            <div style={{ display: 'grid', gap: '1.25rem' }}>
              <div className="stats-grid">
                <Metric
                  label={t.uncovered}
                  value={activeNeeds.length}
                  icon={<FileClock size={19} />}
                  tone="#dc2626"
                />
                <Metric
                  label={profileCopy.todayLabel}
                  value={todayBatches.length}
                  icon={<CalendarDays size={19} />}
                  tone="#2563eb"
                />
                <Metric
                  label={t.running}
                  value={
                    campaigns
                      .flatMap((campaign) => campaign.batches)
                      .filter((batch) =>
                        ['PREPARING', 'COOKING', 'COOLING', 'FREEZING'].includes(batch.status),
                      ).length
                  }
                  icon={<Flame size={19} />}
                />
                <Metric
                  label={t.unavailable}
                  value={componentAlerts.length}
                  icon={<AlertTriangle size={19} />}
                  tone="#7c3aed"
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.35fr) minmax(300px, .65fr)',
                  gap: '1rem',
                }}
              >
                <section className="card-modern" style={{ padding: '1.2rem' }}>
                  <div className="section-header-modern">
                    <div>
                      <strong>{profileCopy.needsLabel}</strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
                        {profileCopy.priorityDescription}
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onNavigate('assignments')}
                    >
                      Tout voir <ArrowRight size={14} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: '.7rem', marginTop: '1rem' }}>
                    {actionableProductions.slice(0, 5).map((campaign) => (
                      <ProductionCard key={campaign.id} campaign={campaign} />
                    ))}
                    {!actionableProductions.length ? <Empty text={t.noData} /> : null}
                  </div>
                </section>
                <section className="card-modern" style={{ padding: '1.2rem' }}>
                  <strong>Comment ça fonctionne</strong>
                  <div style={{ display: 'grid', gap: '.6rem', marginTop: '1rem' }}>
                    {profileCopy.flowSteps.map((label, index) => (
                      <div
                        key={label}
                        style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            display: 'grid',
                            placeItems: 'center',
                            background: '#fef3c7',
                            color: '#b45309',
                            fontWeight: 900,
                          }}
                        >
                          {index + 1}
                        </span>
                        <span style={{ fontSize: '.84rem', fontWeight: 700 }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ) : null}

          {tab === 'today' ? (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {todayBatches.map(({ batch, campaign }) => (
                <section
                  key={batch.id}
                  className="card-modern"
                  style={{ padding: '1.15rem', display: 'grid', gap: '.9rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem' }}>
                    <div>
                      <strong>
                        {batch.reference} · {campaign.name}
                      </strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>
                        {q(batch.plannedQuantity, batch.unit?.symbol)} · {campaign.site?.name}
                      </div>
                    </div>
                    <Badge tone={statusTone(batch.status)}>{statusLabel(batch.status)}</Badge>
                  </div>
                  <div style={{ display: 'flex', gap: '.45rem', overflowX: 'auto' }}>
                    {(batch.operations ?? []).map((operation, index) => (
                      <button
                        key={operation.id}
                        className="btn btn-secondary btn-sm"
                        disabled={busy || operation.status === 'PENDING'}
                        onClick={() =>
                          operation.status !== 'COMPLETED' && void finishOperation(operation.id)
                        }
                        style={{ opacity: operation.status === 'PENDING' ? 0.55 : 1 }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 999,
                            display: 'grid',
                            placeItems: 'center',
                            background: operation.status === 'COMPLETED' ? '#d1fae5' : '#fef3c7',
                          }}
                        >
                          {operation.status === 'COMPLETED' ? <Check size={12} /> : index + 1}
                        </span>
                        {operation.title}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem' }}>
                    {batch.status === 'TO_PREPARE' ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => void startBatch(batch)}
                      >
                        <Play size={14} />
                        {t.start}
                      </button>
                    ) : null}
                    {['PREPARING', 'COOKING', 'COOLING', 'FREEZING'].includes(batch.status) ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setBatchToComplete(batch)}
                      >
                        <CheckCircle2 size={14} />
                        {t.complete}
                      </button>
                    ) : null}
                  </div>
                </section>
              ))}
              {!todayBatches.length ? <Empty text={t.noData} /> : null}
            </div>
          ) : null}

          {tab === 'assignments' ? (
            <div style={{ display: 'grid', gap: '1rem' }}>
              <section>
                <div className="section-header-modern">
                  <div>
                    <strong>Productions à lancer</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
                      Validez les quantités pour réserver les composants et créer les lots.
                    </div>
                  </div>
                </div>
                <div className="recipe-grid" style={{ marginTop: '.75rem' }}>
                  {actionableProductions.map((campaign) => (
                    <ProductionCard key={campaign.id} campaign={campaign} />
                  ))}
                  {!actionableProductions.length ? <Empty text={t.noData} /> : null}
                </div>
              </section>
              <section className="card-modern" style={{ padding: '1.2rem', overflowX: 'auto' }}>
                <strong>Besoins enregistrés</strong>
                <table className="data-table" style={{ marginTop: '.75rem' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Origine</th>
                      <th>Produit / variante</th>
                      <th>Besoin</th>
                      <th>Couvert</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {needs.map((need) => (
                      <tr key={need.id}>
                        <td>{new Date(need.neededAt).toLocaleString(locale)}</td>
                        <td>
                          <Badge tone="info">
                            {productionProfileCopy[usageProfile].sources.find(
                              (source) => source.value === need.source,
                            )?.label ?? need.source}
                          </Badge>
                        </td>
                        <td>
                          <strong>{need.product?.name}</strong>
                          {need.variant ? ` · ${need.variant.name}` : ''}
                        </td>
                        <td>{q(need.quantity, need.unit?.symbol)}</td>
                        <td>{q(need.coveredQuantity, need.unit?.symbol)}</td>
                        <td>
                          <Badge tone={statusTone(need.status)}>{statusLabel(need.status)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!needs.length ? <Empty text={t.noData} /> : null}
              </section>
            </div>
          ) : null}

          {tab === 'materials' ? (
            <section className="card-modern" style={{ padding: '1.2rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '.75rem',
                  alignItems: 'center',
                }}
              >
                <strong>{t.stock}</strong>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.35rem',
                    border: '1px solid #dbe2ea',
                    borderRadius: 10,
                    padding: '.35rem .6rem',
                  }}
                >
                  <Search size={15} />
                  <input
                    value={stockSearch}
                    onChange={(event) => setStockSearch(event.target.value)}
                    placeholder="Produit, parfum, lot…"
                    style={{ border: 0, margin: 0, padding: 0 }}
                  />
                </label>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: '.45rem 0 0' }}>
                Les quantités fabriquées restent suivies dans Production. Elles ne sont jamais
                ajoutées au catalogue des produits achetés de Stocks.
              </p>
              <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fiche / élément produit</th>
                      <th>Quantité produite</th>
                      <th>Quantité stockée</th>
                      <th>{t.reserved}</th>
                      <th>{t.free}</th>
                      <th>Lots produits</th>
                      <th>Dernière production</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProductionStockSummary.map((item) => (
                      <tr key={`${item.productId}:${item.variantId ?? ''}`}>
                        <td>
                          <strong>{item.technicalSheetName}</strong>
                          {item.variantName ? (
                            <div style={{ color: 'var(--text-muted)' }}>{item.variantName}</div>
                          ) : null}
                          <div style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>
                            {item.mode === 'ASSEMBLY'
                              ? 'Assemblage / produit fini'
                              : 'Fabrication / préparation'}
                          </div>
                        </td>
                        <td>
                          <strong>{q(item.producedQuantity, item.unitSymbol ?? undefined)}</strong>
                        </td>
                        <td>{q(item.storedQuantity, item.unitSymbol ?? undefined)}</td>
                        <td>{q(item.reservedQuantity, item.unitSymbol ?? undefined)}</td>
                        <td>
                          <strong>{q(item.availableQuantity, item.unitSymbol ?? undefined)}</strong>
                        </td>
                        <td>{item.batchCount}</td>
                        <td>
                          {item.lastProducedAt
                            ? new Date(item.lastProducedAt).toLocaleString(locale)
                            : 'Jamais'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredProductionStockSummary.length ? <Empty text={t.noData} /> : null}
              {filteredProductionStock.length ? (
                <>
                  <div style={{ marginTop: '1.5rem' }}>
                    <strong>Détail des lots stockés</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
                      État, quantité disponible, conservation et traçabilité de chaque lot.
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto', marginTop: '.75rem' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Produit</th>
                          <th>Lot</th>
                          <th>État</th>
                          <th>{t.physical}</th>
                          <th>{t.reserved}</th>
                          <th>{t.free}</th>
                          <th>DLC / DDM</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProductionStock.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.product.name}</strong>
                              {item.variant ? (
                                <div style={{ color: 'var(--text-muted)' }}>
                                  {item.variant.name}
                                </div>
                              ) : null}
                            </td>
                            <td>{item.lot.lotNumber}</td>
                            <td>
                              <Badge tone={statusTone(item.lot.conservationState)}>
                                {item.lot.conservationState}
                              </Badge>
                            </td>
                            <td>{q(item.physicalQuantity, item.product.unit?.symbol)}</td>
                            <td>{q(item.reservedQuantity)}</td>
                            <td>
                              <strong>{q(item.freeQuantity)}</strong>
                            </td>
                            <td>
                              {item.lot.expiresAt
                                ? new Date(item.lot.expiresAt).toLocaleDateString(locale)
                                : '—'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '.35rem' }}>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setStockToTransition(item)}
                                >
                                  <Snowflake size={13} /> État
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => void showTrace(item.lot.id)}
                                >
                                  <History size={13} /> Trace
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {tab === 'history' ? (
            <section className="card-modern" style={{ padding: '1.2rem' }}>
              <strong>Journal métier immuable</strong>
              <div style={{ display: 'grid', gap: '.55rem', marginTop: '1rem' }}>
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '170px 140px 1fr',
                      gap: '.75rem',
                      padding: '.65rem',
                      borderBottom: '1px solid #e2e8f0',
                      fontSize: '.82rem',
                    }}
                  >
                    <span>
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString(locale) : '—'}
                    </span>
                    <Badge tone="neutral">{entry.action}</Badge>
                    <div>
                      <strong>{entry.order?.number}</strong> {entry.summary}
                    </div>
                  </div>
                ))}
                {!history.length ? <Empty text={t.noData} /> : null}
              </div>
            </section>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <Modal
        open={flow === 'reactive'}
        title={profileCopy.launchLabel}
        onClose={() => {
          setFlow(null);
          setSimulation(null);
        }}
        wide
      >
        {!profiles.length ? (
          <Empty text={t.profileRequired} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: simulation ? 'minmax(280px, .75fr) minmax(0, 1.25fr)' : '1fr',
              gap: '1.25rem',
            }}
          >
            <form
              onSubmit={(event) => void simulateReactive(event)}
              style={{ display: 'grid', gap: '.85rem', alignContent: 'start' }}
            >
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                {profileCopy.launchDescription}
              </p>
              <label>
                Produit / règle
                <select
                  value={reactiveDraft.profileId}
                  onChange={(event) => {
                    setReactiveDraft({ ...reactiveDraft, profileId: event.target.value });
                    setSimulation(null);
                  }}
                  required
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.outputProduct?.name}{' '}
                      {profile.outputVariant ? `· ${profile.outputVariant.name}` : ''} —{' '}
                      {profile.site?.name}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
                <label>
                  Quantité requise
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={reactiveDraft.quantity}
                    onChange={(event) => {
                      setReactiveDraft({ ...reactiveDraft, quantity: event.target.value });
                      setSimulation(null);
                    }}
                    required
                  />
                </label>
                <label>
                  Origine
                  <select
                    value={reactiveDraft.source}
                    onChange={(event) =>
                      setReactiveDraft({ ...reactiveDraft, source: event.target.value })
                    }
                  >
                    {profileCopy.sources.map((source) => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
                <label>
                  {profileCopy.dateLabel}
                  <input
                    type="date"
                    value={reactiveDraft.date}
                    onChange={(event) => {
                      setReactiveDraft({ ...reactiveDraft, date: event.target.value });
                      setSimulation(null);
                    }}
                    required
                  />
                </label>
                <label>
                  {profileCopy.timeLabel}
                  <input
                    type="time"
                    value={reactiveDraft.time}
                    onChange={(event) =>
                      setReactiveDraft({ ...reactiveDraft, time: event.target.value })
                    }
                    required
                  />
                </label>
              </div>
              <label>
                Commentaire
                <textarea
                  value={reactiveDraft.comments}
                  onChange={(event) =>
                    setReactiveDraft({ ...reactiveDraft, comments: event.target.value })
                  }
                  rows={3}
                />
              </label>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? <Loader2 className="spin" size={15} /> : <ListChecks size={15} />}
                {t.simulate}
              </button>
            </form>
            {simulation ? (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.5rem' }}
                >
                  <Mini label={t.physical} value={q(simulation.availability.physical)} />
                  <Mini label={t.reserved} value={q(simulation.availability.reserved)} />
                  <Mini label={t.free} value={q(simulation.availability.usable)} />
                  <Mini
                    label="Déjà planifié"
                    value={q(simulation.availability.confirmedProduction)}
                  />
                </div>
                <div>
                  <strong>Scénarios réalisables</strong>
                  <div style={{ display: 'grid', gap: '.55rem', marginTop: '.55rem' }}>
                    {simulation.scenarios.map((scenario) => (
                      <button
                        type="button"
                        key={scenario.kind}
                        onClick={() => setSelectedScenario(scenario.kind)}
                        style={{
                          textAlign: 'left',
                          border:
                            selectedScenario === scenario.kind
                              ? '2px solid #f59e0b'
                              : '1px solid #e2e8f0',
                          borderRadius: 12,
                          padding: '.8rem',
                          background: selectedScenario === scenario.kind ? '#fffbeb' : 'white',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <strong>{scenario.kind}</strong>
                          <strong>{q(scenario.quantity)}</strong>
                        </div>
                        <div
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '.78rem',
                            marginTop: '.25rem',
                          }}
                        >
                          {scenario.batches.map((batch) => q(batch)).join(' + ')} · surplus{' '}
                          {q(scenario.surplusQuantity)}
                        </div>
                        {scenario.warnings.map((warning) => (
                          <Badge key={warning} tone="warn">
                            {warning}
                          </Badge>
                        ))}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <strong>{t.components}</strong>
                  <div style={{ marginTop: '.55rem' }}>
                    <ComponentTree plan={simulation.componentPlan} />
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void createReactiveCampaign()}
                >
                  <Factory size={15} />
                  {n(
                    simulation.scenarios.find((scenario) => scenario.kind === selectedScenario)
                      ?.quantity,
                  ) > 0
                    ? profileCopy.launchLabel
                    : `${t.reserved} — ${t.free}`}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      <Modal open={showProfile} title={t.profile} onClose={() => setShowProfile(false)} wide>
        <form
          onSubmit={(event) => void createProfile(event)}
          style={{ display: 'grid', gap: '1rem' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.75rem' }}>
            <label>
              Site
              <select
                name="siteId"
                defaultValue={session.user.primarySiteId ?? sites[0]?.id}
                required
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fiche technique
              <select name="technicalSheetId" required>
                {recipes
                  .filter((recipe) => !recipe.isArchived && recipe.outputProductId)
                  .map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div
            style={{
              padding: '.7rem .8rem',
              borderRadius: 10,
              background: '#f8fafc',
              color: 'var(--text-muted)',
              fontSize: '.8rem',
            }}
          >
            L’élément produit et son unité sont déterminés automatiquement par la fiche technique.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.75rem' }}>
            <label>
              Mode
              <select name="mode" defaultValue="FIXED">
                <option value="FIXED">Lot fixe</option>
                <option value="FORMATS">Formats autorisés</option>
                <option value="MULTIPLES">Multiples</option>
                <option value="FLEXIBLE">Flexible</option>
                <option value="EQUIPMENT">Selon équipement</option>
              </select>
            </label>
            <label>
              Rendement de référence
              <input name="referenceYield" type="number" step="0.001" min="0.001" required />
            </label>
            <label>
              Formats (séparés par ,)
              <input name="allowedFormats" placeholder="12, 24, 36" />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem' }}>
            <label>
              Minimum
              <input name="minimumQuantity" type="number" step="0.001" />
            </label>
            <label>
              Optimal
              <input name="optimalQuantity" type="number" step="0.001" />
            </label>
            <label>
              Maximum
              <input name="maximumQuantity" type="number" step="0.001" />
            </label>
            <label>
              Pas / multiple
              <input name="stepQuantity" type="number" step="0.001" />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem' }}>
            <label>
              Qté / moule
              <input name="quantityPerMold" type="number" step="0.001" />
            </label>
            <label>
              Qté / plaque
              <input name="quantityPerTray" type="number" step="0.001" />
            </label>
            <label>
              Qté / cycle
              <input name="quantityPerCycle" type="number" step="0.001" />
            </label>
            <label>
              Cycles max
              <input name="maximumCycles" type="number" min="1" />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem' }}>
            <label>
              Durée de vie (h)
              <input name="shelfLifeHours" type="number" min="1" />
            </label>
            <label>
              Congelé (h)
              <input name="frozenShelfLifeHours" type="number" min="1" />
            </label>
            <label>
              Après décongélation (h)
              <input name="shelfLifeAfterThawHours" type="number" min="1" />
            </label>
            <label>
              Décongélation (min)
              <input name="thawingTimeMinutes" type="number" min="1" />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <label>
              <input name="allowHalfBatch" type="checkbox" /> Demi-lot autorisé
            </label>
            <label>
              <input name="allowDoubleBatch" type="checkbox" /> Double lot autorisé
            </label>
            <label>
              <input name="canFreeze" type="checkbox" /> Congélation autorisée
            </label>
          </div>
          <button className="btn btn-primary" disabled={busy}>
            <Check size={15} /> Enregistrer la règle
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(batchToComplete)}
        title={t.complete}
        onClose={() => setBatchToComplete(null)}
      >
        {batchToComplete ? (
          <form
            onSubmit={(event) => void completeBatch(event)}
            style={{ display: 'grid', gap: '.85rem' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
              <label>
                Quantité réellement obtenue
                <input
                  name="actualQuantity"
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue={n(batchToComplete.plannedQuantity)}
                  required
                />
              </label>
              <label>
                Perte
                <input name="lostQuantity" type="number" step="0.001" min="0" defaultValue="0" />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
              <label>
                État
                <select name="conservationState" defaultValue="CHILLED">
                  <option value="AMBIENT">Ambiant</option>
                  <option value="CHILLED">Réfrigéré</option>
                  <option value="FROZEN">Congelé</option>
                  <option value="COOLING">En refroidissement</option>
                </select>
              </label>
              <label>
                Emplacement
                <select name="destinationLocationId" defaultValue="">
                  <option value="">Non précisé</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Date limite
              <input name="expiresAt" type="datetime-local" />
            </label>
            <label>
              Écart / observation
              <textarea name="notes" rows={3} />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              <CheckCircle2 size={15} /> Créer le lot fini
            </button>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(stockToTransition)}
        title="Changer l’état de conservation"
        onClose={() => setStockToTransition(null)}
      >
        {stockToTransition ? (
          <form
            onSubmit={(event) => void transitionStock(event)}
            style={{ display: 'grid', gap: '.85rem' }}
          >
            <div style={{ padding: '.8rem', borderRadius: 12, background: '#f8fafc' }}>
              <strong>
                {stockToTransition.product.name} · {stockToTransition.lot.lotNumber}
              </strong>
              <div>
                {t.free}:{' '}
                {q(stockToTransition.freeQuantity, stockToTransition.product.unit?.symbol)} · état:{' '}
                {stockToTransition.lot.conservationState}
              </div>
            </div>
            <label>
              Quantité
              <input
                name="quantity"
                type="number"
                min="0.001"
                max={n(stockToTransition.freeQuantity)}
                step="0.001"
                defaultValue={n(stockToTransition.freeQuantity)}
                required
              />
            </label>
            <label>
              Nouvel état
              <select
                name="destinationState"
                defaultValue={
                  stockToTransition.lot.conservationState === 'FROZEN'
                    ? 'THAWING'
                    : stockToTransition.lot.conservationState === 'THAWING'
                      ? 'THAWED'
                      : 'FROZEN'
                }
              >
                <option value="FROZEN">Congelé</option>
                <option value="THAWING">En décongélation</option>
                <option value="THAWED">Décongelé</option>
                <option value="CHILLED">Réfrigéré</option>
                <option value="BLOCKED">Bloqué</option>
              </select>
            </label>
            <label>
              Motif
              <input name="reason" />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              <ThermometerSnowflake size={15} /> Enregistrer le mouvement
            </button>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={traceability !== null}
        title="Traçabilité du lot"
        onClose={() => setTraceability(null)}
        wide
      >
        {traceLoading ? (
          <Loader2 className="spin" />
        ) : traceability ? (
          <TraceView trace={traceability} locale={locale} />
        ) : null}
      </Modal>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ padding: '.55rem', borderRadius: 10, background: '#f8fafc' }}>
      <span
        style={{
          display: 'block',
          color: 'var(--text-muted)',
          fontSize: '.67rem',
          textTransform: 'uppercase',
          fontWeight: 800,
        }}
      >
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function TraceView({ trace, locale }: { trace: Record<string, unknown>; locale: string }) {
  const lot = trace as {
    lotNumber?: string;
    conservationState?: string;
    producedAt?: string;
    expiresAt?: string;
    product?: { name?: string };
    variant?: { name?: string };
    site?: { name?: string };
    location?: { name?: string };
    productionBatch?: {
      reference?: string;
      order?: {
        number?: string;
        name?: string;
        technicalSheet?: { name?: string };
        recipeVersion?: { version?: number };
      };
      consumptions?: Array<{
        id: string;
        product?: { name?: string };
        lot?: { lotNumber?: string };
        quantity?: string;
        unit?: { symbol?: string };
      }>;
    };
    batchConsumptions?: Array<{
      id: string;
      batch?: { reference?: string; order?: { number?: string } };
      quantity?: string;
      unit?: { symbol?: string };
    }>;
    movements?: Array<{
      id: string;
      movementDate?: string;
      type?: string;
      inputQuantity?: string;
      reason?: string;
    }>;
  };
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.6rem' }}>
        <Mini label="Lot" value={lot.lotNumber ?? '—'} />
        <Mini
          label="Produit"
          value={`${lot.product?.name ?? '—'}${lot.variant ? ` · ${lot.variant.name}` : ''}`}
        />
        <Mini label="État" value={lot.conservationState ?? '—'} />
        <Mini
          label="Emplacement"
          value={`${lot.site?.name ?? '—'} · ${lot.location?.name ?? '—'}`}
        />
      </div>
      <section>
        <strong>Origine</strong>
        <div
          style={{
            marginTop: '.45rem',
            padding: '.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
          }}
        >
          {lot.productionBatch
            ? `${lot.productionBatch.order?.number} · ${lot.productionBatch.order?.name} · ${lot.productionBatch.reference} · recette v${lot.productionBatch.order?.recipeVersion?.version ?? '—'}`
            : 'Lot sans origine Production'}
        </div>
      </section>
      <section>
        <strong>Composants consommés</strong>
        <div style={{ display: 'grid', gap: '.35rem', marginTop: '.45rem' }}>
          {lot.productionBatch?.consumptions?.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '.55rem',
                background: '#f8fafc',
                borderRadius: 9,
              }}
            >
              <span>
                {item.product?.name} · lot {item.lot?.lotNumber ?? 'sans lot'}
              </span>
              <strong>{q(item.quantity, item.unit?.symbol)}</strong>
            </div>
          )) ?? '—'}
        </div>
      </section>
      <section>
        <strong>Mouvements</strong>
        <div style={{ display: 'grid', gap: '.35rem', marginTop: '.45rem' }}>
          {lot.movements?.map((movement) => (
            <div
              key={movement.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 120px 1fr',
                gap: '.7rem',
                padding: '.55rem',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <span>
                {movement.movementDate
                  ? new Date(movement.movementDate).toLocaleString(locale)
                  : '—'}
              </span>
              <Badge tone="neutral">{movement.type}</Badge>
              <span>{movement.reason}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

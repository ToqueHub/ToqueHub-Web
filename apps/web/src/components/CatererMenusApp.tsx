import { activeLocale } from '../i18n/runtime';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  BadgeEuro,
  Building,
  Building2,
  CalendarDays,
  Check as CheckIcon,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  ClipboardCheck,
  CreditCard,
  Download,
  Eye,
  FileCheck,
  FileUp,
  FileText,
  Filter,
  History,
  Kanban,
  Layers,
  LayoutGrid,
  List,
  LoaderCircle,
  Mail,
  MapPin,
  MapPinned,
  PackageCheck,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Table,
  Truck,
  UserRound,
  UsersRound,
  Utensils,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import {
  TechnicalSheetPickerModal,
  type TechnicalSheetPickerItem,
} from './TechnicalSheetPickerModal';
import type {
  CatererClient,
  CatererClientImportPreview,
  CatererClientImportRow,
  CatererClientInput,
  CatererEvent,
  CatererEventPayload,
  CatererEventStatus,
  CatererFulfillmentMode,
  CatererPrestationPayload,
  MenuItemPayload,
  MenuSection,
  MenuServiceType,
  Site,
  TechnicalSheetRecipe,
} from '../types';

type CatererTab = 'dashboard' | 'events' | 'calendar' | 'documents';

const serviceOptions: Array<{ value: MenuServiceType; label: string }> = [
  { value: 'EVENT', label: 'Cocktail / événement' },
  { value: 'BUFFET', label: 'Buffet' },
  { value: 'LUNCH', label: 'Déjeuner' },
  { value: 'DINNER', label: 'Dîner' },
  { value: 'BREAKFAST', label: 'Petit-déjeuner / brunch' },
  { value: 'SNACK', label: 'Collation' },
];

const sectionOptions: Array<{ value: MenuSection; label: string }> = [
  { value: 'STARTER', label: 'Entrée' },
  { value: 'MAIN', label: 'Plat principal' },
  { value: 'SIDE', label: 'Accompagnement' },
  { value: 'CHEESE', label: 'Fromage' },
  { value: 'DESSERT', label: 'Dessert' },
  { value: 'DRINK', label: 'Boisson' },
  { value: 'OTHER', label: 'Autre' },
];

const emptyPrestation = (start = ''): CatererPrestationPayload => ({
  name: 'Prestation principale',
  service: 'EVENT',
  readyAt: start,
  handoffAt: start,
  serviceAt: start,
  expectedGuests: 0,
  items: [],
});

const emptyEvent = (siteId = ''): CatererEventPayload => {
  const next = new Date();
  next.setDate(next.getDate() + 7);
  next.setHours(18, 0, 0, 0);
  const start = localInput(next);
  return {
    name: '',
    clientId: '',
    productionSiteId: siteId,
    startsAt: start,
    endsAt: localInput(new Date(next.getTime() + 4 * 60 * 60 * 1000)),
    venueName: '',
    address: '',
    accessNotes: '',
    fulfillmentMode: 'DELIVERY',
    notes: '',
    prestations: [emptyPrestation(start)],
  };
};

const emptyClient = (): CatererClientInput => ({
  name: '',
  name2: '',
  firstName: '',
  lastName: '',
  contactName: '',
  email: '',
  phone: '',
  fax: '',
  website: '',
  address: '',
  postalCode: '',
  city: '',
  countryCode: 'FI',
  businessId: '',
  vatNumber: '',
  accountTypeId: 1,
  accountCode: '',
  customerNumber: '',
  eInvoiceAddress: '',
  eInvoiceOperatorId: '',
  eInvoiceUnitNumber: undefined,
  invoiceDeliveryMethod: '',
  localeCode: 'FI',
  paymentTermId: undefined,
  salesPriceListId: undefined,
  salesTaxClassId: 1,
  invoiceIncludesVat: false,
  factoringPartnerId: undefined,
  ourReference: '',
  yourReference: '',
  shippingName: '',
  shippingName2: '',
  shippingAddress: '',
  shippingPostalCode: '',
  shippingCity: '',
  shippingCountryCode: 'FI',
  autoReminderOverride: false,
  autoReminderEnabled: false,
  autoReminderInterval: undefined,
  autoReminderLastStep: undefined,
  salesIsRefused: false,
  allergies: '',
  notes: '',
  isArchived: false,
});

function clientMoney(value: number | null | undefined, currency = 'EUR') {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function clientDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString(activeLocale()) : '—';
}

function clientRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
      )
    : [];
}

function clientRecordText(row: Record<string, unknown>, ...keys: string[]) {
  const value = keys.map((key) => row[key]).find((item) => item !== undefined && item !== null);
  return value == null || value === '' ? '—' : String(value);
}

function clientRecordAmount(row: Record<string, unknown>, ...keys: string[]) {
  const value = keys.map((key) => row[key]).find((item) => item !== undefined && item !== null);
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CatererMenusApp({
  token,
  sites,
  canManage,
  tab: requestedTab = 'dashboard',
  onTabChange,
  onProfileSettings,
  onHybridBack,
  onOpenProduction,
}: {
  token: string;
  sites: Site[];
  canManage: boolean;
  tab?: CatererTab;
  onTabChange?: (tab: CatererTab) => void;
  onProfileSettings: () => void;
  onHybridBack?: () => void;
  onOpenProduction?: (catererEventId: string) => void;
}) {
  const [tab, setTab] = useState<CatererTab>(requestedTab);
  const [events, setEvents] = useState<CatererEvent[]>([]);
  const [clients, setClients] = useState<CatererClient[]>([]);
  const [recipes, setRecipes] = useState<TechnicalSheetRecipe[]>([]);
  const [dashboard, setDashboard] = useState<{
    stats: {
      nextThirtyDays: number;
      confirmed: number;
      guests: number;
      productionToGenerate: number;
    };
    upcoming: CatererEvent[];
  }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [search, setSearch] = useState('');

  useEffect(() => {
    setTab(requestedTab);
  }, [requestedTab]);

  const navigate = (next: CatererTab) => {
    setTab(next);
    onTabChange?.(next);
  };
  const [statusFilter, setStatusFilter] = useState<CatererEventStatus | ''>('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<CatererEventPayload>(() => emptyEvent(sites[0]?.id));
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [detailModalEvent, setDetailModalEvent] = useState<CatererEvent | null>(null);
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('');
  const selectedEvent = events.find((item) => item.id === selectedEventId) ?? events[0];
  const filteredEvents = useMemo(() => {
    return events.filter((item) => {
      const query = search.toLocaleLowerCase('fr');
      return (
        (!statusFilter || item.status === statusFilter) &&
        (!fulfillmentFilter || item.fulfillmentMode === fulfillmentFilter) &&
        (!query ||
          [item.reference, item.name, item.clientSnapshot?.name, item.client?.name, item.venueName]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('fr')
            .includes(query))
      );
    });
  }, [events, search, statusFilter]);

  const activeRecipes = useMemo(() => {
    return recipes.filter(
      (recipe) => !recipe.isArchived && recipe.status === 'ACTIVE' && recipe.outputProductId,
    );
  }, [recipes]);

  async function refresh() {
    setLoading(true);
    setError(undefined);
    try {
      const [eventsResult, clientsResult, recipesResult, dashboardResult] = await Promise.all([
        api.catererEvents(token),
        api.catererClients(token),
        api.technicalSheetRecipes(token, { pageSize: 200 }).then((result) => result.items),
        api.catererDashboard(token),
      ]);
      setEvents(eventsResult);
      setClients(clientsResult);
      setRecipes(recipesResult);
      setDashboard(dashboardResult);
      setSelectedEventId((current) => current ?? eventsResult[0]?.id);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function startCreate(dateISO?: string) {
    setEditingId(undefined);
    const initial = emptyEvent(sites[0]?.id);
    if (dateISO) {
      initial.startsAt = `${dateISO}T10:00`;
      initial.endsAt = `${dateISO}T18:00`;
    }
    setForm(initial);
    setWizardStep(1);
    setWizardOpen(true);
  }

  function startEdit(event: CatererEvent) {
    setEditingId(event.id);
    setForm({
      name: event.name,
      clientId: event.clientId ?? '',
      productionSiteId: event.productionSiteId ?? '',
      startsAt: localInput(event.startsAt),
      endsAt: localInput(event.endsAt),
      venueName: event.venueName ?? '',
      address: event.address ?? '',
      accessNotes: event.accessNotes ?? '',
      fulfillmentMode: event.fulfillmentMode,
      notes: event.notes ?? '',
      prestations: event.prestations.map((prestation) => ({
        id: prestation.id,
        name: prestation.name,
        service: prestation.service,
        readyAt: localInput(prestation.readyAt),
        handoffAt: localInput(prestation.handoffAt),
        serviceAt: localInput(prestation.serviceAt),
        expectedGuests: Number(prestation.expectedGuests),
        position: prestation.position,
        notes: prestation.notes ?? '',
        items: (prestation.menu.items ?? []).map((item) => ({
          id: item.id,
          section: item.section,
          technicalSheetId: item.technicalSheetId ?? undefined,
          productId: item.productId ?? undefined,
          servingQuantity: Number(item.servingQuantity ?? 1),
          notes: '',
        })),
      })),
    });
    setWizardStep(1);
    setWizardOpen(true);
  }

  async function saveEvent() {
    await run(
      async () => {
        const payload = normalizeEventPayload(form);
        const saved = editingId
          ? await api.updateCatererEvent(token, editingId, payload)
          : await api.createCatererEvent(token, payload);
        setWizardOpen(false);
        setSelectedEventId(saved.id);
        await refresh();
      },
      editingId ? 'Événement actualisé.' : 'Événement créé.',
    );
  }

  async function changeStatus(event: CatererEvent, status: CatererEventStatus) {
    await run(
      async () => {
        if (status === 'CONFIRMED') {
          const readiness = await api.catererEventReadiness(token, event.id);
          const confirmationBlockers = readiness.blockers.filter(
            (blocker) => blocker.code !== 'PRODUCTION_PROFILE_REQUIRED',
          );
          if (confirmationBlockers.length)
            throw new Error(confirmationBlockers.map((blocker) => blocker.message).join(' '));
        }
        await api.updateCatererEventStatus(token, event.id, status);
        await refresh();
      },
      status === 'CONFIRMED'
        ? 'Événement confirmé.'
        : status === 'COMPLETED'
          ? 'Événement terminé.'
          : status === 'CANCELLED'
            ? 'Événement annulé.'
            : 'Événement repassé en brouillon.',
    );
  }

  async function generate(event: CatererEvent) {
    await run(async () => {
      await api.generateCatererEventProductions(token, event.id, { mode: 'DETAILED' });
      onOpenProduction?.(event.id);
    }, 'Fabrications Traiteur préparées.');
  }

  async function download(kind: 'KITCHEN' | 'HANDOFF' | 'CLIENT') {
    if (!selectedEvent) return;
    await run(async () => {
      const file = await api.downloadCatererEventDocument(token, selectedEvent.id, kind);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'Document téléchargé.');
  }

  async function run(action: () => Promise<void>, message: string) {
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await action();
      setSuccess(message);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="card-modern"
        style={{ padding: '4rem 2rem', textAlign: 'center', borderRadius: 24 }}
      >
        <ChefHat
          className="animate-spin"
          size={32}
          color="#10b981"
          style={{ margin: '0 auto 1rem' }}
        />
        <span
          style={{
            display: 'block',
            fontSize: '1.1rem',
            fontWeight: 700,
            color: 'var(--text-main)',
          }}
        >
          Chargement de l'espace Traiteur…
        </span>
      </div>
    );
  }

  return (
    <div className="caterer-app">
      {/* HERO SECTION */}
      <motion.section
        className="caterer-hero"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <span className="caterer-hero-tag">
          <Truck size={15} /> Espace Traiteur · ToqueHub
        </span>
        <h1 className="caterer-hero-title">Événements & prestations</h1>
        <p className="caterer-hero-desc">
          Du dossier client aux campagnes de production, pilotez chaque prestation, horaire et
          quantité sans mélanger vos autres activités.
        </p>
        <div className="caterer-hero-actions">
          {onHybridBack ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onHybridBack}
              style={{ borderRadius: 10 }}
            >
              <ArrowLeft size={14} /> Espaces d’activité
            </button>
          ) : null}
          <button
            className="btn btn-secondary btn-sm"
            onClick={onProfileSettings}
            style={{ borderRadius: 10 }}
          >
            <Settings size={14} /> Adapter mon activité
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => startCreate()}
            disabled={!canManage}
            style={{
              borderRadius: 10,
              background: '#10b981',
              color: '#ffffff',
              fontWeight: 700,
              border: 0,
            }}
          >
            <Plus size={14} /> Nouvel événement
          </button>
        </div>
      </motion.section>

      {/* TABS NAVIGATION */}
      <nav className="caterer-tabs-container">
        {(
          [
            ['dashboard', 'Tableau de bord', <CalendarDays key="dash" size={16} />],
            ['events', 'Événements', <Truck key="evt" size={16} />],
            ['calendar', 'Calendrier', <CalendarDays key="cal" size={16} />],
            ['documents', 'Documents', <FileText key="doc" size={16} />],
          ] as Array<[CatererTab, string, React.ReactNode]>
        ).map(([id, label, icon]) => (
          <button
            key={id}
            className={`caterer-tab-btn ${tab === id ? 'active' : ''}`}
            onClick={() => navigate(id)}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      {/* ALERTS */}
      <AnimatePresence mode="wait">
        {error ? (
          <motion.div
            className="menus-alert critical"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <AlertCircle size={18} />
            {error}
          </motion.div>
        ) : null}
        {success ? (
          <motion.div
            className="menus-alert success"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <CheckCircle2 size={18} />
            {success}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* TAB: DASHBOARD */}
      {tab === 'dashboard' ? (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div className="caterer-kpi-grid">
            <Metric
              label="Événements à 30 jours"
              value={dashboard?.stats.nextThirtyDays ?? 0}
              icon={<CalendarDays size={22} />}
              colorVariant="purple"
            />
            <Metric
              label="Dossiers confirmés"
              value={dashboard?.stats.confirmed ?? 0}
              icon={<ClipboardCheck size={22} />}
              colorVariant="blue"
            />
            <Metric
              label="Convives à servir"
              value={dashboard?.stats.guests ?? 0}
              icon={<UsersRound size={22} />}
            />
            <Metric
              label="Productions à lancer"
              value={dashboard?.stats.productionToGenerate ?? 0}
              icon={<ChefHat size={22} />}
              colorVariant="amber"
            />
          </div>

          <div className="caterer-card">
            <div className="caterer-card-header">
              <span className="caterer-card-title">
                <CalendarDays size={20} color="#10b981" /> Calendrier des événements
              </span>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => startCreate()}
                style={{ borderRadius: 10 }}
              >
                <Plus size={14} /> Créer un événement
              </button>
            </div>
            <CatererCalendarView
              events={events}
              embedded
              onSelectEvent={(eventId) => {
                const item = events.find((event) => event.id === eventId);
                if (item) {
                  setSelectedEventId(item.id);
                  setDetailModalEvent(item);
                }
              }}
              onCreateEvent={(dateISO) => startCreate(dateISO)}
              onEditEvent={startEdit}
            />
          </div>
        </div>
      ) : null}

      {/* TAB: EVENTS */}
      {tab === 'events' ? (
        <CatererEventsView
          events={filteredEvents}
          allEvents={events}
          selectedEvent={selectedEvent}
          search={search}
          statusFilter={statusFilter}
          fulfillmentFilter={fulfillmentFilter}
          saving={saving}
          onSearch={setSearch}
          onStatusFilter={(val) => setStatusFilter(val as CatererEventStatus | '')}
          onFulfillmentFilter={setFulfillmentFilter}
          onSelectEvent={(item) => {
            setSelectedEventId(item.id);
            setDetailModalEvent(item);
          }}
          onEditEvent={startEdit}
          onStatusChange={changeStatus}
          onGenerateProduction={generate}
          onCreateEvent={() => startCreate()}
        />
      ) : null}

      {/* TAB: CALENDAR */}
      {tab === 'calendar' ? (
        <CatererCalendarView
          events={events}
          onSelectEvent={(eventId) => {
            const ev = events.find((e) => e.id === eventId);
            if (ev) {
              setSelectedEventId(eventId);
              setDetailModalEvent(ev);
            }
          }}
          onCreateEvent={(dateISO) => startCreate(dateISO)}
          onEditEvent={(event) => startEdit(event)}
        />
      ) : null}

      {/* TAB: DOCUMENTS */}
      {tab === 'documents' ? (
        <div className="caterer-card">
          <div className="caterer-card-header">
            <span className="caterer-card-title">
              <FileText size={20} color="#10b981" /> Documents de l’événement
            </span>
          </div>
          <label style={{ display: 'grid', gap: '0.4rem', maxWidth: 450, marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
              Sélectionner un événement :
            </span>
            <select
              value={selectedEvent?.id ?? ''}
              onChange={(event) => setSelectedEventId(event.target.value)}
              style={{
                padding: '0.6rem 0.8rem',
                borderRadius: 10,
                border: '1px solid var(--light-border)',
              }}
            >
              {events.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.reference} · {item.name}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1.25rem',
            }}
          >
            <DocumentCard
              title="Dossier cuisine"
              text="Quantités consolidées, ingrédients et allergènes pour la brigade de cuisine."
              onClick={() => download('KITCHEN')}
            />
            <DocumentCard
              title="Feuille de chargement"
              text="Horaires de préparation, remise camion, livraison et démarrage du service."
              onClick={() => download('HANDOFF')}
            />
            <DocumentCard
              title="Menu client"
              text="Présentation élégante sans annotations internes pour impression ou envoi PDF."
              onClick={() => download('CLIENT')}
            />
          </div>
        </div>
      ) : null}

      {/* EVENT WIZARD MODAL */}
      <AnimatePresence>
        {wizardOpen ? (
          <EventWizard
            step={wizardStep}
            form={form}
            clients={clients}
            sites={sites}
            recipes={activeRecipes}
            saving={saving}
            onStep={setWizardStep}
            onForm={setForm}
            onSave={saveEvent}
            onClose={() => setWizardOpen(false)}
          />
        ) : null}

        {detailModalEvent ? (
          <CatererEventDetailModal
            event={detailModalEvent}
            onClose={() => setDetailModalEvent(null)}
            onEdit={(ev) => startEdit(ev)}
            onGenerateProduction={(ev) => generate(ev)}
            onStatusChange={(ev, status) => changeStatus(ev, status)}
            saving={saving}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function ClientsApp({ token, canManage }: { token: string; canManage: boolean }) {
  const [clients, setClients] = useState<CatererClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [clientForm, setClientForm] = useState<CatererClientInput>(() => emptyClient());
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<CatererClient | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importAnalyzing, setImportAnalyzing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState<string>();
  const [importPreview, setImportPreview] = useState<CatererClientImportPreview | null>(null);

  const refreshClients = async () => {
    setLoading(true);
    setError(undefined);
    try {
      setClients(await api.catererClients(token));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Chargement des clients impossible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshClients();
  }, [token]);

  const startCreateClient = () => {
    setEditingClient(null);
    setClientForm(emptyClient());
    setClientModalOpen(true);
  };

  const startEditClient = (client: CatererClient) => {
    setEditingClient(client);
    const form = emptyClient();
    for (const key of Object.keys(form) as Array<keyof CatererClientInput>) {
      const value = client[key];
      if (value !== undefined && value !== null) (form as Record<string, unknown>)[key] = value;
    }
    setClientForm(form);
    setClientModalOpen(true);
  };

  const saveClient = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      if (editingClient) await api.updateCatererClient(token, editingClient.id, clientForm);
      else await api.createCatererClient(token, clientForm);
      setSuccess(editingClient ? 'Fiche client actualisée.' : 'Client ajouté au répertoire.');
      setClientModalOpen(false);
      setEditingClient(null);
      setClientForm(emptyClient());
      await refreshClients();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Enregistrement du client impossible.');
    } finally {
      setSaving(false);
    }
  };

  const openClientImport = () => {
    setImportError(undefined);
    setImportPreview(null);
    setImportOpen(true);
  };

  const analyzeClientImport = async (file: File) => {
    setImportAnalyzing(true);
    setImportError(undefined);
    setImportPreview(null);
    try {
      setImportPreview(await api.analyzeCatererClientImport(token, file));
    } catch (nextError) {
      setImportError(
        nextError instanceof Error ? nextError.message : 'Analyse du document client impossible.',
      );
    } finally {
      setImportAnalyzing(false);
    }
  };

  const updateClientImportRow = (
    id: string,
    field: keyof CatererClientImportRow['fields'],
    value: string,
  ) => {
    setImportPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: current.rows.map((row) => {
          if (row.id !== id) return row;
          const fields = { ...row.fields, [field]: value };
          const name = [fields.firstName, fields.lastName].filter(Boolean).join(' ').trim();
          const errors = [
            ...(!name ? ['Prénom ou nom obligatoire.'] : []),
            ...(fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)
              ? ['Adresse e-mail invalide.']
              : []),
          ];
          return {
            ...row,
            fields,
            name,
            duplicateOf: null,
            errors,
            warnings:
              !fields.email && !fields.phone
                ? ['Ajoutez un e-mail ou un téléphone pour pouvoir contacter ce client.']
                : [],
            status: errors.length ? 'error' : 'needs_review',
            selected: errors.length === 0,
          };
        }),
      };
    });
  };

  const toggleClientImportRow = (id: string, selected: boolean) => {
    setImportPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => (row.id === id ? { ...row, selected } : row)),
          }
        : current,
    );
  };

  const commitClientImport = async () => {
    if (!importPreview) return;
    setImportSaving(true);
    setImportError(undefined);
    try {
      const result = await api.commitCatererClientImport(token, importPreview.rows);
      setImportOpen(false);
      setImportPreview(null);
      setSuccess(
        `${result.created} client${result.created > 1 ? 's' : ''} importé${result.created > 1 ? 's' : ''}${
          result.skipped ? ` · ${result.skipped} ignoré${result.skipped > 1 ? 's' : ''}` : ''
        }.`,
      );
      await refreshClients();
    } catch (nextError) {
      setImportError(nextError instanceof Error ? nextError.message : 'Import des clients impossible.');
    } finally {
      setImportSaving(false);
    }
  };

  return (
    <div className="caterer-app clients-module-app">
      <motion.section
        className="welcome-hero stocks-hero hr-hero clients-module-hero"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div>
          <span className="welcome-tag">
            <UsersRound size={14} /> ToqueHub Clients
          </span>
          <h1 className="welcome-title">Clients</h1>
          <p className="welcome-desc">
            Centralisez les coordonnées, informations de facturation, factures, paiements et
            encours de tous vos clients dans un répertoire unique.
          </p>
        </div>
        <div className="hr-hero-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canManage || loading}
            onClick={openClientImport}
          >
            <FileUp size={16} /> Importer des clients
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canManage || loading}
            onClick={startCreateClient}
          >
            <Plus size={16} /> Nouveau client
          </button>
        </div>
      </motion.section>

      <AnimatePresence mode="wait">
        {error ? (
          <motion.div
            className="menus-alert critical"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <AlertCircle size={18} />
            {error}
          </motion.div>
        ) : null}
        {success ? (
          <motion.div
            className="menus-alert success"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <CheckCircle2 size={18} />
            {success}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="caterer-card caterer-client-directory">
        <div className="caterer-card-header caterer-client-directory-header">
          <div>
            <span className="caterer-card-title">
              <UserRound size={20} color="#10b981" /> Répertoire clients
            </span>
            <p className="muted">Fiches clients centralisées, avec factures et encours.</p>
          </div>
        </div>
        <div className="caterer-client-grid" aria-busy={loading}>
          {clients.map((client) => (
            <article key={client.id} className="caterer-client-card caterer-client-card-rich">
              <div className="caterer-client-card-main">
                <div className="caterer-client-avatar">{(client.name[0] ?? 'C').toUpperCase()}</div>
                <div className="caterer-client-identity">
                  <div>
                    <strong>{client.name}</strong>
                    {client.source?.includes('FENNOA') ? (
                      <span className="caterer-client-source">Synchronisé</span>
                    ) : client.source === 'CLIENT_IMPORT' ? (
                      <span className="caterer-client-source imported">Importé</span>
                    ) : (
                      <span className="caterer-client-source manual">Manuel</span>
                    )}
                  </div>
                  <small>
                    {[client.customerNumber, client.businessId, client.city]
                      .filter(Boolean)
                      .join(' · ') || 'Informations commerciales à compléter'}
                  </small>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary caterer-client-edit"
                  onClick={() => startEditClient(client)}
                  aria-label={`Modifier ${client.name}`}
                >
                  <Pencil size={15} />
                </button>
              </div>
              <div className="caterer-client-contact-row">
                {client.contactName ? (
                  <span>
                    <UserRound size={13} />
                    {client.contactName}
                  </span>
                ) : null}
                {client.phone ? (
                  <span>
                    <Phone size={13} />
                    {client.phone}
                  </span>
                ) : null}
                {client.email ? (
                  <span>
                    <Mail size={13} />
                    {client.email}
                  </span>
                ) : null}
              </div>
              <div className="caterer-client-finance-row">
                <span>
                  <small>Factures</small>
                  <strong>{client.invoiceSummary?.count ?? 0}</strong>
                </span>
                <span>
                  <small>CA facturé HT</small>
                  <strong>{clientMoney(client.invoiceSummary?.totalNet)}</strong>
                </span>
                <span className={(client.invoiceSummary?.totalDue ?? 0) > 0 ? 'attention' : ''}>
                  <small>À encaisser</small>
                  <strong>{clientMoney(client.invoiceSummary?.totalDue)}</strong>
                </span>
              </div>
            </article>
          ))}
          {!loading && !clients.length ? (
            <Empty
              title="Aucun client"
              text="Ajoutez votre premier client ou synchronisez votre logiciel comptable."
            />
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {importOpen ? (
          <CatererClientImportModal
            preview={importPreview}
            analyzing={importAnalyzing}
            saving={importSaving}
            error={importError}
            onFile={analyzeClientImport}
            onUpdateRow={updateClientImportRow}
            onToggleRow={toggleClientImportRow}
            onCommit={commitClientImport}
            onClose={() => {
              if (importAnalyzing || importSaving) return;
              setImportOpen(false);
              setImportPreview(null);
              setImportError(undefined);
            }}
          />
        ) : null}
        {clientModalOpen ? (
          <CatererClientModal
            client={editingClient}
            form={clientForm}
            saving={saving}
            canManage={canManage}
            onForm={setClientForm}
            onSubmit={saveClient}
            onClose={() => {
              setClientModalOpen(false);
              setEditingClient(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CatererClientImportModal({
  preview,
  analyzing,
  saving,
  error,
  onFile,
  onUpdateRow,
  onToggleRow,
  onCommit,
  onClose,
}: {
  preview: CatererClientImportPreview | null;
  analyzing: boolean;
  saving: boolean;
  error?: string;
  onFile: (file: File) => void | Promise<void>;
  onUpdateRow: (
    id: string,
    field: keyof CatererClientImportRow['fields'],
    value: string,
  ) => void;
  onToggleRow: (id: string, selected: boolean) => void;
  onCommit: () => void | Promise<void>;
  onClose: () => void;
}) {
  const selected = preview?.rows.filter((row) => row.selected && row.status !== 'error').length ?? 0;
  const summary = preview
    ? {
        ready: preview.rows.filter((row) => row.status === 'ready').length,
        review: preview.rows.filter((row) => row.status === 'needs_review').length,
        duplicates: preview.rows.filter((row) => row.status === 'duplicate').length,
        errors: preview.rows.filter((row) => row.status === 'error').length,
      }
    : null;
  const languageLabel =
    preview?.sourceLanguage === 'fr'
      ? 'Français'
      : preview?.sourceLanguage === 'en'
        ? 'Anglais'
        : preview?.sourceLanguage === 'fi'
          ? 'Finnois'
          : 'Multilingue';

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.div
        className="modal-card caterer-client-import-modal"
        initial={{ opacity: 0, scale: 0.98, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 16 }}
      >
        <div className="modal-header">
          <div>
            <h2>Importer une base clients</h2>
            <p className="muted">
              Prénom, nom, téléphone, e-mail et informations d’allergies.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={analyzing || saving}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body caterer-client-import-body">
          <label
            className={`caterer-client-import-dropzone${analyzing ? ' busy' : ''}`}
            aria-busy={analyzing}
          >
            {analyzing ? <LoaderCircle className="spin" size={30} /> : <FileUp size={30} />}
            <strong>{analyzing ? 'Analyse en cours…' : 'Choisir un document client'}</strong>
            <span>CSV, XLSX, PDF ou image · français, anglais ou finnois · 20 Mo maximum</span>
            <input
              type="file"
              accept=".csv,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,text/csv,application/pdf,image/*"
              disabled={analyzing || saving}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
                event.currentTarget.value = '';
              }}
            />
          </label>

          {error ? (
            <div className="menus-alert critical caterer-client-import-error">
              <AlertCircle size={18} /> {error}
            </div>
          ) : null}

          {preview && summary ? (
            <>
              <div className="caterer-client-import-meta">
                <div>
                  <FileCheck size={18} />
                  <span>
                    <strong>{preview.filename}</strong>
                    <small>
                      {languageLabel}
                      {preview.sheetName ? ` · feuille ${preview.sheetName}` : ''}
                    </small>
                  </span>
                </div>
                <div className="caterer-client-import-summary">
                  <span className="ready">{summary.ready} prêts</span>
                  <span className="review">{summary.review} à vérifier</span>
                  <span>{summary.duplicates} doublons</span>
                  <span className={summary.errors ? 'error' : ''}>{summary.errors} erreurs</span>
                </div>
              </div>

              <div className="caterer-client-import-table-wrap">
                <table className="caterer-client-import-table">
                  <thead>
                    <tr>
                      <th aria-label="Sélection" />
                      <th>Prénom</th>
                      <th>Nom</th>
                      <th>E-mail</th>
                      <th>Téléphone</th>
                      <th>Info / allergies</th>
                      <th>Contrôle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.id} className={`status-${row.status}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={row.selected}
                            disabled={row.status === 'error' || row.status === 'duplicate'}
                            onChange={(event) => onToggleRow(row.id, event.target.checked)}
                            aria-label={`Importer la ligne ${row.rowNumber}`}
                          />
                        </td>
                        {(['firstName', 'lastName', 'email', 'phone', 'allergies'] as const).map(
                          (field) => (
                            <td key={field}>
                              <input
                                type={field === 'email' ? 'email' : 'text'}
                                value={row.fields[field]}
                                onChange={(event) => onUpdateRow(row.id, field, event.target.value)}
                                aria-label={`${field} ligne ${row.rowNumber}`}
                              />
                            </td>
                          ),
                        )}
                        <td>
                          <span className={`caterer-client-import-status ${row.status}`}>
                            {row.status === 'ready'
                              ? 'Prêt'
                              : row.status === 'needs_review'
                                ? 'À vérifier'
                                : row.status === 'duplicate'
                                  ? 'Doublon'
                                  : 'Erreur'}
                          </span>
                          {[...row.errors, ...row.warnings].map((message) => (
                            <small key={message}>{message}</small>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="caterer-client-import-privacy">
                <ShieldCheck size={17} />
                <span>{preview.privacy}</span>
              </div>
            </>
          ) : null}
        </div>

        <div className="modal-footer caterer-client-import-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onCommit()}
            disabled={!preview || !selected || analyzing || saving}
          >
            {saving ? <LoaderCircle className="spin" size={16} /> : <CheckIcon size={16} />}
            {saving ? 'Import en cours…' : `Importer ${selected} client${selected > 1 ? 's' : ''}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CatererClientModal({
  client,
  form,
  saving,
  canManage,
  onForm,
  onSubmit,
  onClose,
}: {
  client: CatererClient | null;
  form: CatererClientInput;
  saving: boolean;
  canManage: boolean;
  onForm: (form: CatererClientInput) => void;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'identity' | 'billing' | 'delivery' | 'history'>(
    'identity',
  );
  const set = <K extends keyof CatererClientInput>(key: K, value: CatererClientInput[K]) =>
    onForm({ ...form, [key]: value });
  const tabs = [
    { id: 'identity' as const, label: 'Identité & contact', icon: UserRound },
    { id: 'billing' as const, label: 'Facturation', icon: CreditCard },
    { id: 'delivery' as const, label: 'Livraison', icon: MapPinned },
    { id: 'history' as const, label: 'Historique comptable', icon: History },
  ];
  const invoices = client?.invoices ?? [];
  return (
    <div className="modal-overlay">
      <motion.form
        className="modal-card hr-modal hr-collaborator-modal caterer-client-modal"
        onSubmit={onSubmit}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
      >
        <div className="modal-header hr-modal-sticky">
          <div>
            <h2>{client ? 'Modifier le client' : 'Nouveau client'}</h2>
            <p className="muted">
              Coordonnées, paramètres de facturation et historique commercial dans une seule fiche.
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="hr-collaborator-tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? 'active' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                {tab.id === 'history' && invoices.length ? (
                  <span className="caterer-client-tab-count">{invoices.length}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {client?.source?.includes('FENNOA') ? (
          <div className="caterer-client-sync-banner">
            <CheckCircle2 size={18} />
            <span>
              Fiche reliée à la comptabilité
              {client.customerNumber ? ` · client ${client.customerNumber}` : ''}. Les informations
              comptables seront actualisées à chaque synchronisation.
            </span>
            <small>Dernière mise à jour : {clientDate(client.fennoaSyncedAt)}</small>
          </div>
        ) : null}
        <div className="hr-collaborator-body">
          {activeTab === 'identity' ? (
            <section className="hr-tab-panel">
              <div>
                <h3>
                  <Building2 size={18} /> Identité du client
                </h3>
              </div>
              <div className="hr-form-grid">
                <ClientField label="Nom / raison sociale" required className="span-2">
                  <input
                    required
                    value={form.name}
                    onChange={(event) => set('name', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Complément de nom">
                  <input
                    value={form.name2 ?? ''}
                    onChange={(event) => set('name2', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Prénom">
                  <input
                    value={form.firstName ?? ''}
                    onChange={(event) => set('firstName', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Nom de famille">
                  <input
                    value={form.lastName ?? ''}
                    onChange={(event) => set('lastName', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Contact principal">
                  <input
                    value={form.contactName ?? ''}
                    onChange={(event) => set('contactName', event.target.value)}
                  />
                </ClientField>
                <ClientField label="E-mail">
                  <input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(event) => set('email', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Téléphone">
                  <input
                    value={form.phone ?? ''}
                    onChange={(event) => set('phone', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Fax">
                  <input
                    value={form.fax ?? ''}
                    onChange={(event) => set('fax', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Site internet">
                  <input
                    value={form.website ?? ''}
                    onChange={(event) => set('website', event.target.value)}
                    placeholder="https://"
                  />
                </ClientField>
                <ClientField label="Adresse" className="span-2">
                  <textarea
                    rows={2}
                    value={form.address ?? ''}
                    onChange={(event) => set('address', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Code postal">
                  <input
                    value={form.postalCode ?? ''}
                    onChange={(event) => set('postalCode', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Ville">
                  <input
                    value={form.city ?? ''}
                    onChange={(event) => set('city', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Pays">
                  <input
                    maxLength={8}
                    value={form.countryCode ?? ''}
                    onChange={(event) => set('countryCode', event.target.value.toUpperCase())}
                    placeholder="FI"
                  />
                </ClientField>
                <ClientField label="Business ID">
                  <input
                    value={form.businessId ?? ''}
                    onChange={(event) => set('businessId', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Numéro de TVA">
                  <input
                    value={form.vatNumber ?? ''}
                    onChange={(event) => set('vatNumber', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Type de client">
                  <select
                    value={form.accountTypeId ?? 1}
                    onChange={(event) => set('accountTypeId', Number(event.target.value))}
                  >
                    <option value={1}>Entreprise</option>
                    <option value={2}>Particulier</option>
                  </select>
                </ClientField>
                <ClientField label="Informations / allergies" className="span-2">
                  <textarea
                    rows={2}
                    value={form.allergies ?? ''}
                    onChange={(event) => set('allergies', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Notes internes" className="span-2">
                  <textarea
                    rows={3}
                    value={form.notes ?? ''}
                    onChange={(event) => set('notes', event.target.value)}
                  />
                </ClientField>
              </div>
            </section>
          ) : null}

          {activeTab === 'billing' ? (
            <section className="hr-tab-panel">
              <div>
                <h3>
                  <BadgeEuro size={18} /> Paramètres de facturation
                </h3>
                <p className="muted">
                  Ces valeurs peuvent être complétées automatiquement par votre logiciel
                  comptable.
                </p>
              </div>
              <div className="hr-form-grid">
                <ClientField label="Numéro client comptable">
                  <input
                    value={form.customerNumber ?? ''}
                    onChange={(event) => set('customerNumber', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Compte clients">
                  <input
                    value={form.accountCode ?? ''}
                    onChange={(event) => set('accountCode', event.target.value)}
                    placeholder="1703"
                  />
                </ClientField>
                <ClientField label="Mode d’envoi">
                  <select
                    value={form.invoiceDeliveryMethod ?? ''}
                    onChange={(event) => set('invoiceDeliveryMethod', event.target.value)}
                  >
                    <option value="">—</option>
                    <option value="email">E-mail</option>
                    <option value="finvoice">E-invoice</option>
                    <option value="postal">Postal</option>
                    <option value="consumerfinvoice">E-invoice particulier</option>
                    <option value="manual">Manuel</option>
                  </select>
                </ClientField>
                <ClientField label="Adresse e-invoice / e-mail" className="span-2">
                  <input
                    value={form.eInvoiceAddress ?? ''}
                    onChange={(event) => set('eInvoiceAddress', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Opérateur e-invoice">
                  <input
                    value={form.eInvoiceOperatorId ?? ''}
                    onChange={(event) => set('eInvoiceOperatorId', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Unité e-invoice">
                  <input
                    type="number"
                    min="0"
                    value={form.eInvoiceUnitNumber ?? ''}
                    onChange={(event) =>
                      set(
                        'eInvoiceUnitNumber',
                        event.target.value ? Number(event.target.value) : undefined,
                      )
                    }
                  />
                </ClientField>
                <ClientField label="Langue des factures">
                  <select
                    value={form.localeCode ?? ''}
                    onChange={(event) => set('localeCode', event.target.value)}
                  >
                    <option value="FI">Finnois</option>
                    <option value="EN">Anglais</option>
                    <option value="SV">Suédois</option>
                    <option value="FR">Français</option>
                  </select>
                </ClientField>
                <ClientField label="Condition de paiement (ID source)">
                  <input
                    type="number"
                    min="0"
                    value={form.paymentTermId ?? ''}
                    onChange={(event) =>
                      set(
                        'paymentTermId',
                        event.target.value ? Number(event.target.value) : undefined,
                      )
                    }
                  />
                </ClientField>
                <ClientField label="Classe de TVA (ID source)">
                  <input
                    type="number"
                    min="0"
                    value={form.salesTaxClassId ?? ''}
                    onChange={(event) =>
                      set(
                        'salesTaxClassId',
                        event.target.value ? Number(event.target.value) : undefined,
                      )
                    }
                  />
                </ClientField>
                <ClientField label="Liste de prix (ID source)">
                  <input
                    type="number"
                    min="0"
                    value={form.salesPriceListId ?? ''}
                    onChange={(event) =>
                      set(
                        'salesPriceListId',
                        event.target.value ? Number(event.target.value) : undefined,
                      )
                    }
                  />
                </ClientField>
                <ClientField label="Partenaire d’affacturage (ID)">
                  <input
                    type="number"
                    min="0"
                    value={form.factoringPartnerId ?? ''}
                    onChange={(event) =>
                      set(
                        'factoringPartnerId',
                        event.target.value ? Number(event.target.value) : undefined,
                      )
                    }
                  />
                </ClientField>
                <ClientField label="Notre référence">
                  <input
                    value={form.ourReference ?? ''}
                    onChange={(event) => set('ourReference', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Référence client">
                  <input
                    value={form.yourReference ?? ''}
                    onChange={(event) => set('yourReference', event.target.value)}
                  />
                </ClientField>
                <div className="span-2 caterer-client-switches">
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(form.invoiceIncludesVat)}
                      onChange={(event) => set('invoiceIncludesVat', event.target.checked)}
                    />{' '}
                    Prix saisis TTC
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(form.autoReminderOverride)}
                      onChange={(event) => set('autoReminderOverride', event.target.checked)}
                    />{' '}
                    Paramètres de relance spécifiques
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(form.autoReminderEnabled)}
                      onChange={(event) => set('autoReminderEnabled', event.target.checked)}
                    />{' '}
                    Relances automatiques
                  </label>
                  <label className="danger">
                    <input
                      type="checkbox"
                      checked={Boolean(form.salesIsRefused)}
                      onChange={(event) => set('salesIsRefused', event.target.checked)}
                    />{' '}
                    Ventes bloquées
                  </label>
                </div>
                <ClientField label="Intervalle de relance (jours)">
                  <input
                    type="number"
                    min="0"
                    value={form.autoReminderInterval ?? ''}
                    onChange={(event) =>
                      set(
                        'autoReminderInterval',
                        event.target.value ? Number(event.target.value) : undefined,
                      )
                    }
                  />
                </ClientField>
                <ClientField label="Dernière étape de relance">
                  <input
                    type="number"
                    min="0"
                    value={form.autoReminderLastStep ?? ''}
                    onChange={(event) =>
                      set(
                        'autoReminderLastStep',
                        event.target.value ? Number(event.target.value) : undefined,
                      )
                    }
                  />
                </ClientField>
                {client?.source?.includes('FENNOA') ? (
                  <div className="span-2 caterer-client-fennoa-details">
                    <strong>Données techniques synchronisées</strong>
                    <dl>
                      <div>
                        <dt>ID externe</dt>
                        <dd>{client.fennoaId ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Groupes client</dt>
                        <dd>{client.customerGroupIds?.join(', ') || '—'}</dd>
                      </div>
                      <div>
                        <dt>Devise (ID)</dt>
                        <dd>{client.currencyId ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Propriétaire source</dt>
                        <dd>{client.fennoaOwnerUserId ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Relances envoyées</dt>
                        <dd>{client.autoReminderCount ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Libellé source</dt>
                        <dd>{client.fennoaTitle || '—'}</dd>
                      </div>
                    </dl>
                    {client.fennoaDescription ? <p>{client.fennoaDescription}</p> : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeTab === 'delivery' ? (
            <section className="hr-tab-panel">
              <div>
                <h3>
                  <MapPinned size={18} /> Adresse de livraison
                </h3>
                <p className="muted">
                  Conservez une adresse logistique distincte du siège et de la facturation.
                </p>
              </div>
              <div className="hr-form-grid">
                <ClientField label="Nom de livraison">
                  <input
                    value={form.shippingName ?? ''}
                    onChange={(event) => set('shippingName', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Complément">
                  <input
                    value={form.shippingName2 ?? ''}
                    onChange={(event) => set('shippingName2', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Adresse" className="span-2">
                  <textarea
                    rows={3}
                    value={form.shippingAddress ?? ''}
                    onChange={(event) => set('shippingAddress', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Code postal">
                  <input
                    value={form.shippingPostalCode ?? ''}
                    onChange={(event) => set('shippingPostalCode', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Ville">
                  <input
                    value={form.shippingCity ?? ''}
                    onChange={(event) => set('shippingCity', event.target.value)}
                  />
                </ClientField>
                <ClientField label="Pays">
                  <input
                    maxLength={8}
                    value={form.shippingCountryCode ?? ''}
                    onChange={(event) =>
                      set('shippingCountryCode', event.target.value.toUpperCase())
                    }
                  />
                </ClientField>
              </div>
            </section>
          ) : null}

          {activeTab === 'history' ? (
            <section className="hr-tab-panel caterer-client-history">
              <div>
                <h3>
                  <History size={18} /> Factures et paiements
                </h3>
                <p className="muted">
                  Historique en lecture seule, actualisé lors de la synchronisation comptable.
                </p>
              </div>
              <div className="caterer-client-history-summary">
                <span>
                  <small>Factures</small>
                  <strong>{client?.invoiceSummary?.count ?? 0}</strong>
                </span>
                <span>
                  <small>Total HT</small>
                  <strong>{clientMoney(client?.invoiceSummary?.totalNet)}</strong>
                </span>
                <span>
                  <small>Encaissé</small>
                  <strong>{clientMoney(client?.invoiceSummary?.totalPaid)}</strong>
                </span>
                <span className={(client?.invoiceSummary?.totalDue ?? 0) > 0 ? 'attention' : ''}>
                  <small>Reste dû</small>
                  <strong>{clientMoney(client?.invoiceSummary?.totalDue)}</strong>
                </span>
              </div>
              {invoices.length ? (
                <div className="caterer-client-invoice-table-wrap">
                  <table className="caterer-client-invoice-table">
                    <thead>
                      <tr>
                        <th>Facture</th>
                        <th>Date</th>
                        <th>Échéance</th>
                        <th>HT</th>
                        <th>Payé</th>
                        <th>Reste dû</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => {
                        const rows = clientRecords(invoice.invoiceRows);
                        const payments = clientRecords(invoice.payments);
                        const deliveries = clientRecords(invoice.deliveries);
                        return (
                          <Fragment key={invoice.id}>
                            <tr>
                              <td>
                                <strong>
                                  {invoice.invoiceTypeId === 2 ? 'Avoir' : 'Facture'}{' '}
                                  {invoice.invoiceNumber || `#${invoice.fennoaId}`}
                                </strong>
                                <small>{invoice.deliveryMethod || invoice.status || ''}</small>
                              </td>
                              <td>{clientDate(invoice.invoiceDate)}</td>
                              <td>{clientDate(invoice.dueDate)}</td>
                              <td>
                                {clientMoney(invoice.totalNet, invoice.currencyCode || 'EUR')}
                              </td>
                              <td>
                                {clientMoney(invoice.totalPaid, invoice.currencyCode || 'EUR')}
                              </td>
                              <td className={invoice.totalDue > 0 ? 'attention' : ''}>
                                {clientMoney(invoice.totalDue, invoice.currencyCode || 'EUR')}
                              </td>
                            </tr>
                            <tr className="caterer-client-invoice-detail-row">
                              <td colSpan={6}>
                                <details>
                                  <summary>
                                    Détails · {rows.length} ligne(s) · {payments.length} paiement(s)
                                    · {deliveries.length} envoi(s)
                                  </summary>
                                  <div className="caterer-client-invoice-details">
                                    <section>
                                      <strong>Lignes facturées</strong>
                                      {rows.length ? (
                                        rows.map((row, index) => (
                                          <p key={index}>
                                            <span>
                                              {clientRecordText(row, 'name', 'description', 'code')}
                                              <small>
                                                {clientRecordText(row, 'quantity')} ×{' '}
                                                {clientRecordText(row, 'unit')}
                                              </small>
                                            </span>
                                            <b>
                                              {clientMoney(
                                                clientRecordAmount(row, 'total_net', 'totalNet'),
                                                invoice.currencyCode || 'EUR',
                                              )}
                                            </b>
                                          </p>
                                        ))
                                      ) : (
                                        <em>Aucune ligne détaillée renvoyée.</em>
                                      )}
                                    </section>
                                    <section>
                                      <strong>Paiements</strong>
                                      {payments.length ? (
                                        payments.map((payment, index) => (
                                          <p key={index}>
                                            <span>
                                              {clientRecordText(
                                                payment,
                                                'payment_date',
                                                'date',
                                                'created',
                                              )}
                                              <small>
                                                {clientRecordText(payment, 'description')}
                                              </small>
                                            </span>
                                            <b>
                                              {clientMoney(
                                                clientRecordAmount(payment, 'sum', 'amount'),
                                                invoice.currencyCode || 'EUR',
                                              )}
                                            </b>
                                          </p>
                                        ))
                                      ) : (
                                        <em>Aucun paiement détaillé.</em>
                                      )}
                                    </section>
                                    <section>
                                      <strong>Envois</strong>
                                      {deliveries.length ? (
                                        deliveries.map((delivery, index) => (
                                          <p key={index}>
                                            <span>
                                              {clientRecordText(delivery, 'address')}
                                              <small>
                                                {clientRecordText(delivery, 'bic', 'sent_message')}
                                              </small>
                                            </span>
                                            <b>{clientRecordText(delivery, 'sent', 'queued')}</b>
                                          </p>
                                        ))
                                      ) : (
                                        <em>Aucun envoi détaillé.</em>
                                      )}
                                    </section>
                                  </div>
                                </details>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Aucune facture synchronisée"
                  text="Les factures apparaîtront après la prochaine synchronisation comptable disposant des droits Clients et Ventes."
                />
              )}
            </section>
          ) : null}
        </div>
        <div className="modal-actions hr-modal-footer">
          <span className="muted">
            {client?.source?.includes('FENNOA')
              ? 'Les données synchronisées pourront être réactualisées.'
              : 'Fiche gérée manuellement.'}
          </span>
          <div className="row-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button
              className="btn btn-primary"
              disabled={!canManage || saving || !form.name.trim()}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer le client'}
            </button>
          </div>
        </div>
      </motion.form>
    </div>
  );
}

function ClientField({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`hr-field-container ${className ?? ''}`.trim()}>
      <span className="hr-field-label">
        {label}
        {required ? <span className="hr-required-dot">*</span> : null}
      </span>
      <span className="hr-field-wrapper">{children}</span>
    </label>
  );
}

function EventWizard({
  step,
  form,
  clients,
  sites,
  recipes,
  saving,
  onStep,
  onForm,
  onSave,
  onClose,
}: {
  step: number;
  form: CatererEventPayload;
  clients: CatererClient[];
  sites: Site[];
  recipes: TechnicalSheetRecipe[];
  saving: boolean;
  onStep: (step: number) => void;
  onForm: (form: CatererEventPayload) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const [activePrestation, setActivePrestation] = useState(0);
  const steps = ['Client', 'Logistique', 'Prestations', 'Compositions', 'Contrôle'];
  const current = form.prestations[activePrestation];

  function updatePrestation(index: number, patch: Partial<CatererPrestationPayload>) {
    onForm({
      ...form,
      prestations: form.prestations.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  }

  function addItem(item: MenuItemPayload) {
    if (!current) return;
    updatePrestation(activePrestation, { items: [...(current.items ?? []), item] });
  }

  return (
    <div className="caterer-wizard-overlay">
      <motion.div
        className="caterer-wizard-modal"
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <span
              style={{
                color: '#10b981',
                fontWeight: 800,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              ASSISTANT ÉVÉNEMENT · ÉTAPE {step} SUR 5
            </span>
            <h2 style={{ margin: '0.2rem 0 0', color: 'var(--text-main)', fontSize: '1.4rem' }}>
              {steps[step - 1]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 0,
              background: '#f1f5f9',
              borderRadius: 10,
              padding: '0.45rem',
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* STEP PROGRESS TABS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '0.5rem',
            marginBottom: '1.5rem',
          }}
        >
          {steps.map((label, index) => {
            const isActive = step === index + 1;
            const isDone = step > index + 1;
            return (
              <button
                key={label}
                type="button"
                className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onStep(index + 1)}
                style={{
                  borderRadius: 12,
                  fontSize: '0.8rem',
                  padding: '0.5rem 0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  background: isActive
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : isDone
                      ? 'rgba(16, 185, 129, 0.08)'
                      : undefined,
                  color: isDone && !isActive ? '#059669' : undefined,
                  borderColor: isDone && !isActive ? 'rgba(16, 185, 129, 0.3)' : undefined,
                }}
              >
                {isDone ? <CheckCircle2 size={13} /> : null}
                <span>
                  {index + 1}. {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* STEP CONTENT */}
        {step === 1 ? (
          <div className="menus-form-grid">
            <label className="menus-form-span">
              Nom de l’événement *
              <input
                required
                value={form.name}
                onChange={(event) => onForm({ ...form, name: event.target.value })}
                placeholder="Mariage Martin, séminaire annuel TechCorp…"
              />
            </label>
            <label className="menus-form-span">
              Client associé
              <select
                value={form.clientId ?? ''}
                onChange={(event) => onForm({ ...form, clientId: event.target.value })}
              >
                <option value="">À sélectionner avant confirmation</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date & heure de début
              <input
                type="datetime-local"
                value={form.startsAt ?? ''}
                onChange={(event) => onForm({ ...form, startsAt: event.target.value })}
              />
            </label>
            <label>
              Date & heure de fin
              <input
                type="datetime-local"
                value={form.endsAt ?? ''}
                onChange={(event) => onForm({ ...form, endsAt: event.target.value })}
              />
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="menus-form-grid">
            <label>
              Site de production principal
              <select
                value={form.productionSiteId ?? ''}
                onChange={(event) => onForm({ ...form, productionSiteId: event.target.value })}
              >
                <option value="">Choisir un site…</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mode de réalisation
              <select
                value={form.fulfillmentMode}
                onChange={(event) =>
                  onForm({
                    ...form,
                    fulfillmentMode: event.target.value as CatererEventPayload['fulfillmentMode'],
                  })
                }
              >
                <option value="DELIVERY">Livraison sur site client</option>
                <option value="PICKUP">Retrait par le client</option>
                <option value="ON_SITE">Service sur place</option>
              </select>
            </label>
            <label className="menus-form-span">
              Nom du lieu de la prestation
              <input
                value={form.venueName ?? ''}
                onChange={(event) => onForm({ ...form, venueName: event.target.value })}
                placeholder="Domaine de la Roseraie, Salons Hoche…"
              />
            </label>
            <label className="menus-form-span">
              Adresse complète
              <textarea
                rows={2}
                value={form.address ?? ''}
                onChange={(event) => onForm({ ...form, address: event.target.value })}
                placeholder="Lieu de livraison ou de réception..."
              />
            </label>
            <label className="menus-form-span">
              Consignes d’accès et logistique
              <textarea
                rows={2}
                value={form.accessNotes ?? ''}
                onChange={(event) => onForm({ ...form, accessNotes: event.target.value })}
                placeholder="Code d'accès, quai de déchargement, badge d'entrée…"
              />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {form.prestations.map((prestation, index) => (
              <div
                key={index}
                style={{
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: 16,
                  padding: '1.25rem',
                  background: 'rgba(16, 185, 129, 0.02)',
                }}
              >
                <div style={{ fontWeight: 700, color: '#059669', marginBottom: '0.75rem' }}>
                  Prestation #{index + 1}
                </div>
                <div className="menus-form-grid">
                  <label>
                    Nom de la prestation
                    <input
                      value={prestation.name}
                      onChange={(event) => updatePrestation(index, { name: event.target.value })}
                      placeholder="Cocktail d'accueil, Buffet chaud..."
                    />
                  </label>
                  <label>
                    Type de service
                    <select
                      value={prestation.service}
                      onChange={(event) =>
                        updatePrestation(index, { service: event.target.value as MenuServiceType })
                      }
                    >
                      {serviceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prêt en cuisine à
                    <input
                      type="datetime-local"
                      value={prestation.readyAt ?? ''}
                      onChange={(event) => updatePrestation(index, { readyAt: event.target.value })}
                    />
                  </label>
                  <label>
                    Remise / Livraison à
                    <input
                      type="datetime-local"
                      value={prestation.handoffAt ?? ''}
                      onChange={(event) =>
                        updatePrestation(index, { handoffAt: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Début du service à
                    <input
                      type="datetime-local"
                      value={prestation.serviceAt ?? ''}
                      onChange={(event) =>
                        updatePrestation(index, { serviceAt: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Convives prévus
                    <input
                      type="number"
                      min={0}
                      value={prestation.expectedGuests}
                      onChange={(event) =>
                        updatePrestation(index, { expectedGuests: Number(event.target.value) })
                      }
                    />
                  </label>
                </div>
                {form.prestations.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      onForm({
                        ...form,
                        prestations: form.prestations.filter((_, itemIndex) => itemIndex !== index),
                      })
                    }
                    style={{ marginTop: '0.85rem', color: '#dc2626' }}
                  >
                    Retirer cette prestation
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                onForm({
                  ...form,
                  prestations: [...form.prestations, emptyPrestation(form.startsAt)],
                })
              }
              style={{ borderRadius: 12 }}
            >
              <Plus size={15} /> Ajouter une prestation
            </button>
          </div>
        ) : null}

        {step === 4 ? (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {form.prestations.map((prestation, index) => (
                <button
                  key={index}
                  type="button"
                  className={`btn ${activePrestation === index ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActivePrestation(index)}
                  style={{ borderRadius: 10, fontSize: '0.85rem' }}
                >
                  {prestation.name || `Prestation ${index + 1}`}
                </button>
              ))}
            </div>
            {current ? (
              <CompositionEditor
                prestation={current}
                recipes={recipes}
                onAdd={addItem}
                onRemove={(index) =>
                  updatePrestation(activePrestation, {
                    items: current.items?.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
                onUpdate={(index, patch) =>
                  updatePrestation(activePrestation, {
                    items: current.items?.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, ...patch } : item,
                    ),
                  })
                }
              />
            ) : null}
          </div>
        ) : null}

        {step === 5 ? (
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <Check label="Client sélectionné" ok={Boolean(form.clientId)} />
            <Check label="Site de production sélectionné" ok={Boolean(form.productionSiteId)} />
            <Check
              label="Adresse renseignée lorsque nécessaire"
              ok={form.fulfillmentMode === 'PICKUP' || Boolean(form.address)}
            />
            {form.prestations.map((prestation, index) => (
              <Check
                key={index}
                label={`${prestation.name || `Prestation ${index + 1}`} · horaires, convives et composition`}
                ok={Boolean(
                  prestation.readyAt &&
                  prestation.handoffAt &&
                  prestation.serviceAt &&
                  prestation.expectedGuests > 0 &&
                  prestation.items?.length,
                )}
              />
            ))}
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Le dossier peut être enregistré en brouillon même s'il est incomplet. Ces éléments
              seront vérifiés lors de la confirmation.
            </p>
          </div>
        ) : null}

        {/* NAVIGATION ACTIONS */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '1.75rem',
            borderTop: '1px solid #f1f5f9',
            paddingTop: '1rem',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            disabled={step === 1}
            onClick={() => onStep(step - 1)}
            style={{ borderRadius: 12 }}
          >
            Précédent
          </button>
          {step < 5 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onStep(step + 1)}
              style={{
                borderRadius: 12,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              }}
            >
              Continuer
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!form.name.trim() || saving}
              onClick={onSave}
              style={{
                borderRadius: 12,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer le brouillon'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function CompositionEditor({
  prestation,
  recipes,
  onAdd,
  onRemove,
  onUpdate,
}: {
  prestation: CatererPrestationPayload;
  recipes: TechnicalSheetRecipe[];
  onAdd: (item: MenuItemPayload) => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<MenuItemPayload>) => void;
}) {
  const [recipeId, setRecipeId] = useState('');
  const [section, setSection] = useState<MenuSection>('OTHER');
  const [recipePickerOpen, setRecipePickerOpen] = useState(false);
  const selectedRecipe = recipes.find((recipe) => recipe.id === recipeId);
  const recipePickerItems = useMemo<TechnicalSheetPickerItem[]>(
    () =>
      recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        category: recipe.category?.name ?? 'Sans catégorie',
        group: recipe.category?.name ?? 'Sans catégorie',
        referenceLabel:
          recipe.yieldMode === 'MASS'
            ? `${Number(recipe.totalMassGrams ?? 0).toLocaleString(activeLocale())} g`
            : `${Number(recipe.referencePortions ?? recipe.portions ?? 1).toLocaleString(activeLocale())} portions`,
        durationMinutes: Number(recipe.totalTimeMinutes ?? 0) || null,
        contextLabel:
          recipe.mode === 'PRODUCTION' ? 'Fabrication / préparation' : 'Assemblage / produit fini',
      })),
    [recipes],
  );

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div
        className="menus-form-grid"
        style={{ background: '#f8fafc', padding: '1rem', borderRadius: 14 }}
      >
        <div className="menus-form-span">
          <span style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: '#334155' }}>
            Fiche technique à ajouter
          </span>
          <button
            type="button"
            className={
              selectedRecipe
                ? 'technical-sheet-picker-trigger selected'
                : 'technical-sheet-picker-trigger'
            }
            disabled={!recipes.length}
            onClick={() => setRecipePickerOpen(true)}
            style={{ marginTop: '.35rem' }}
          >
            <span className="technical-sheet-picker-trigger-icon">
              <Search size={18} />
            </span>
            <span className="technical-sheet-picker-trigger-copy">
              <strong>{selectedRecipe?.name ?? 'Rechercher une fiche technique'}</strong>
              <small>
                {selectedRecipe
                  ? (selectedRecipe.category?.name ?? 'Sans catégorie')
                  : `${recipes.length} fiche(s) disponible(s)`}
              </small>
            </span>
            <span className="technical-sheet-picker-trigger-action">
              {selectedRecipe ? 'Changer' : 'Rechercher'}
            </span>
          </button>
        </div>
        <label>
          Rubrique du menu
          <select
            value={section}
            onChange={(event) => setSection(event.target.value as MenuSection)}
          >
            {sectionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!recipeId}
          onClick={() => {
            onAdd({ technicalSheetId: recipeId, section, servingQuantity: 1 });
            setRecipeId('');
          }}
          style={{ height: 42, alignSelf: 'end', borderRadius: 10 }}
        >
          <Plus size={15} /> Ajouter au menu
        </button>
      </div>

      <TechnicalSheetPickerModal
        open={recipePickerOpen}
        items={recipePickerItems}
        selectedSheetId={recipeId}
        title="Catalogue des fiches techniques"
        subtitle="Recherchez la recette à ajouter à cette prestation."
        onClose={() => setRecipePickerOpen(false)}
        onSelectSheet={(item) => {
          setRecipeId(item.id);
          setRecipePickerOpen(false);
        }}
      />

      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {(prestation.items ?? []).map((item, index) => (
          <div
            key={index}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 1fr) minmax(160px, 220px) auto',
              alignItems: 'center',
              gap: '0.75rem',
              border: '1px solid var(--light-border)',
              borderRadius: 14,
              padding: '0.85rem 1rem',
              background: '#ffffff',
            }}
          >
            <div>
              <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>
                {recipes.find((recipe) => recipe.id === item.technicalSheetId)?.name ??
                  'Fiche technique'}
              </strong>
              <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                {sectionOptions.find((option) => option.value === item.section)?.label}
              </span>
            </div>
            <label style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Quantité par convive
              <input
                type="number"
                min=".001"
                step="any"
                value={item.servingQuantity ?? 1}
                onChange={(event) =>
                  onUpdate(index, { servingQuantity: Number(event.target.value) })
                }
                style={{ padding: '0.35rem 0.5rem', marginTop: '0.2rem' }}
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onRemove(index)}
              style={{ padding: '0.4rem', border: 0, color: '#dc2626' }}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventTable({
  events,
  saving,
  onSelect,
  onEdit,
  onStatus,
  onGenerate,
  onCreate,
}: {
  events: CatererEvent[];
  saving: boolean;
  onSelect: (event: CatererEvent) => void;
  onEdit: (event: CatererEvent) => void;
  onStatus: (event: CatererEvent, status: CatererEventStatus) => void;
  onGenerate: (event: CatererEvent) => void;
  onCreate?: () => void;
}) {
  if (!events.length) {
    return (
      <Empty
        title="Aucun événement"
        text="Créez un dossier pour commencer à planifier vos prestations, menus et campagnes de production."
        action={
          onCreate ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onCreate}
              style={{
                borderRadius: 12,
                padding: '0.65rem 1.35rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontWeight: 700,
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)',
              }}
            >
              <Plus size={16} /> Créer un événement
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="table-wrapper">
      <table className="table-modern">
        <thead>
          <tr>
            <th>Événement</th>
            <th>Date</th>
            <th>Client</th>
            <th>Prestations</th>
            <th>Convives</th>
            <th>Statut</th>
            <th>Production</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} onClick={() => onSelect(event)} style={{ cursor: 'pointer' }}>
              <td>
                <strong style={{ color: '#10b981' }}>{event.reference}</strong>
                <span className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>
                  {event.name}
                  {event.needsReview ? ' · À vérifier' : ''}
                </span>
              </td>
              <td>{dateLabel(event.startsAt)}</td>
              <td>{event.clientSnapshot?.name ?? event.client?.name ?? 'À renseigner'}</td>
              <td>{event.prestations.length}</td>
              <td>
                <strong>{event.totalGuests}</strong>
              </td>
              <td>
                <StatusBadge status={event.status} />
              </td>
              <td>
                <ProductionBadge state={event.productionState} />
              </td>
              <td>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={(click) => {
                      click.stopPropagation();
                      onEdit(event);
                    }}
                    style={{ borderRadius: 8 }}
                  >
                    Modifier
                  </button>
                  {event.status === 'DRAFT' ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={saving}
                      onClick={(click) => {
                        click.stopPropagation();
                        onStatus(event, 'CONFIRMED');
                      }}
                      style={{ borderRadius: 8 }}
                    >
                      Confirmer
                    </button>
                  ) : null}
                  {event.status === 'CONFIRMED' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={saving}
                        onClick={(click) => {
                          click.stopPropagation();
                          onGenerate(event);
                        }}
                        style={{ borderRadius: 8 }}
                      >
                        <ChefHat size={13} />{' '}
                        {event.productionState === 'NOT_GENERATED' ||
                        event.productionState === 'DIRTY'
                          ? 'Planifier'
                          : 'Voir les productions'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(click) => {
                          click.stopPropagation();
                          onStatus(event, 'COMPLETED');
                        }}
                        style={{ borderRadius: 8 }}
                      >
                        Terminer
                      </button>
                    </>
                  ) : null}
                  {!['COMPLETED', 'CANCELLED'].includes(event.status) ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ color: '#dc2626', borderRadius: 8 }}
                      onClick={(click) => {
                        click.stopPropagation();
                        onStatus(event, 'CANCELLED');
                      }}
                    >
                      Annuler
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FulfillmentBadge({ mode }: { mode: CatererFulfillmentMode }) {
  const configs: Record<
    CatererFulfillmentMode,
    { label: string; icon: React.ComponentType<{ size?: number }>; color: string; bg: string }
  > = {
    DELIVERY: { label: 'Livraison', icon: Truck, color: '#1d4ed8', bg: '#dbeafe' },
    PICKUP: { label: 'Retrait', icon: ShoppingBag, color: '#d97706', bg: '#fef3c7' },
    ON_SITE: { label: 'Sur site', icon: Utensils, color: '#059669', bg: '#d1fae5' },
  };
  const config = configs[mode] ?? configs.DELIVERY;
  const Icon = config.icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '.3rem',
        padding: '.2rem .55rem',
        borderRadius: '999px',
        background: config.bg,
        color: config.color,
        fontSize: '.72rem',
        fontWeight: 800,
      }}
    >
      <Icon size={12} /> {config.label}
    </span>
  );
}

function EventDetail({
  event,
  onEdit,
  onGenerateProduction,
}: {
  event: CatererEvent;
  onEdit: (event: CatererEvent) => void;
  onGenerateProduction?: (event: CatererEvent) => void;
}) {
  return (
    <div className="caterer-card" style={{ borderLeft: '4px solid #10b981', padding: '1.35rem' }}>
      <div
        className="caterer-card-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: '1rem',
        }}
      >
        <div>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.3rem' }}
          >
            <span
              style={{
                fontSize: '.8rem',
                fontWeight: 850,
                color: '#10b981',
                letterSpacing: '.05em',
              }}
            >
              {event.reference}
            </span>
            <StatusBadge status={event.status} />
            <ProductionBadge state={event.productionState} />
            <FulfillmentBadge mode={event.fulfillmentMode} />
          </div>
          <h2
            style={{ margin: '0 0 .3rem', fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}
          >
            {event.name}
          </h2>
          <div
            style={{
              color: '#64748b',
              fontSize: '.86rem',
              display: 'flex',
              gap: '1rem',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span>
              <UserRound size={14} style={{ display: 'inline', marginRight: 4 }} /> Client :{' '}
              <strong>{event.clientSnapshot?.name ?? event.client?.name ?? 'À renseigner'}</strong>
            </span>
            {event.productionSite && (
              <span>
                <Building size={14} style={{ display: 'inline', marginRight: 4 }} /> Site :{' '}
                {event.productionSite.name}
              </span>
            )}
            {event.venueName && (
              <span>
                <MapPin size={14} style={{ display: 'inline', marginRight: 4 }} /> Lieu :{' '}
                {event.venueName}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          {onGenerateProduction && event.status === 'CONFIRMED' && (
            <button
              type="button"
              className="production-btn-primary"
              onClick={() => onGenerateProduction(event)}
            >
              <ChefHat size={16} />
              {event.productionState === 'NOT_GENERATED' || event.productionState === 'DIRTY'
                ? 'Planifier dans Fabrication'
                : 'Voir la production'}
            </button>
          )}
          <button type="button" style={calendarSecondaryButtonStyle} onClick={() => onEdit(event)}>
            <Pencil size={15} /> Modifier le dossier
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginTop: '1.25rem',
        }}
      >
        {event.prestations.map((prestation) => (
          <div
            key={prestation.id}
            className="caterer-prestation-card"
            style={{
              padding: '1rem',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '.35rem',
              }}
            >
              <strong style={{ color: '#0f172a', fontSize: '1rem', fontWeight: 800 }}>
                {prestation.name}
              </strong>
              <span
                style={{
                  fontSize: '.78rem',
                  fontWeight: 850,
                  color: '#047857',
                  background: '#ecfdf5',
                  padding: '.2rem .55rem',
                  borderRadius: '8px',
                }}
              >
                {prestation.expectedGuests} convives
              </span>
            </div>
            <div
              className="muted"
              style={{ fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}
            >
              <Clock size={13} color="#94a3b8" /> Service : {dateLabel(prestation.serviceAt)}
            </div>

            <div style={{ marginTop: '.85rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              {prestation.menu.items?.map((item, index) => (
                <span
                  key={item.id ?? index}
                  style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    color: '#059669',
                    padding: '.3rem .6rem',
                    borderRadius: '8px',
                    fontSize: '.78rem',
                    fontWeight: 700,
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                  }}
                >
                  {item.technicalSheet?.name ?? item.product?.name ?? 'Article'} ·{' '}
                  {item.portionsOverride ??
                    Number(prestation.expectedGuests) * Number(item.servingQuantity ?? 1)}{' '}
                  port.
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CatererDashboardCalendar({
  events,
  onSelect,
  onCreate,
}: {
  events: CatererEvent[];
  onSelect: (event: CatererEvent) => void;
  onCreate: (dateISO: string) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const nextEvent = events
      .filter((event) => event.startsAt && event.status !== 'CANCELLED')
      .sort((left, right) => String(left.startsAt).localeCompare(String(right.startsAt)))[0];
    const date = nextEvent?.startsAt ? new Date(nextEvent.startsAt) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthLabel = new Intl.DateTimeFormat(activeLocale(), {
    month: 'long',
    year: 'numeric',
  })
    .format(currentMonth)
    .replace(/^./, (letter) => letter.toUpperCase());
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const todayKey = dashboardCalendarDateKey(new Date());
  const activeEvents = events.filter((event) => event.status !== 'CANCELLED' && event.startsAt);

  return (
    <div style={{ display: 'grid', gap: '.8rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <button
            type="button"
            style={calendarIconButtonStyle}
            onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
            aria-label="Mois précédent"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            style={calendarSecondaryButtonStyle}
            onClick={() => {
              const today = new Date();
              setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            }}
          >
            Aujourd’hui
          </button>
          <button
            type="button"
            style={calendarIconButtonStyle}
            onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
            aria-label="Mois suivant"
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>{monthLabel}</strong>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 14 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(100px, 1fr))',
            minWidth: 700,
            background: '#e2e8f0',
            gap: 1,
          }}
        >
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((label) => (
            <div
              key={label}
              style={{
                padding: '.5rem',
                textAlign: 'center',
                background: '#f8fafc',
                color: '#64748b',
                fontSize: '.76rem',
                fontWeight: 800,
              }}
            >
              {label}
            </div>
          ))}
          {days.map((date) => {
            const dateKey = dashboardCalendarDateKey(date);
            const dayEvents = activeEvents.filter(
              (event) => dashboardCalendarDateKey(new Date(event.startsAt!)) === dateKey,
            );
            const inMonth = date.getMonth() === month;
            return (
              <div
                key={dateKey}
                style={{
                  minHeight: 92,
                  padding: '.45rem',
                  background: inMonth ? '#ffffff' : '#f8fafc',
                  opacity: inMonth ? 1 : 0.58,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.3rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: 25,
                      height: 25,
                      borderRadius: 999,
                      background: dateKey === todayKey ? '#10b981' : 'transparent',
                      color: dateKey === todayKey ? '#ffffff' : '#334155',
                      fontWeight: 800,
                      fontSize: '.78rem',
                    }}
                  >
                    {date.getDate()}
                  </span>
                  <button
                    type="button"
                    onClick={() => onCreate(dateKey)}
                    aria-label={`Créer un événement le ${dateKey}`}
                    style={{
                      border: 0,
                      background: 'transparent',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                {dayEvents.slice(0, 2).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelect(event)}
                    title={`${event.reference} · ${event.name}`}
                    style={{
                      border: '1px solid #a7f3d0',
                      borderRadius: 7,
                      background: '#ecfdf5',
                      color: '#065f46',
                      padding: '.25rem .35rem',
                      fontSize: '.69rem',
                      fontWeight: 750,
                      textAlign: 'left',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {event.name}
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <span style={{ color: '#64748b', fontSize: '.68rem', fontWeight: 700 }}>
                    + {dayEvents.length - 2} autre(s)
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function dashboardCalendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function CatererEventsView({
  events,
  allEvents,
  selectedEvent,
  search,
  statusFilter,
  fulfillmentFilter,
  saving,
  onSearch,
  onStatusFilter,
  onFulfillmentFilter,
  onSelectEvent,
  onEditEvent,
  onStatusChange,
  onGenerateProduction,
  onCreateEvent,
}: {
  events: CatererEvent[];
  allEvents: CatererEvent[];
  selectedEvent?: CatererEvent;
  search: string;
  statusFilter: string;
  fulfillmentFilter: string;
  saving: boolean;
  onSearch: (val: string) => void;
  onStatusFilter: (val: string) => void;
  onFulfillmentFilter: (val: string) => void;
  onSelectEvent: (event: CatererEvent) => void;
  onEditEvent: (event: CatererEvent) => void;
  onStatusChange: (event: CatererEvent, status: CatererEventStatus) => void;
  onGenerateProduction: (event: CatererEvent) => void;
  onCreateEvent: () => void;
}) {
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'kanban'>('table');

  const activeEvents = allEvents.filter((ev) => ev.status !== 'CANCELLED');
  const confirmedCount = activeEvents.filter((ev) => ev.status === 'CONFIRMED').length;
  const draftCount = activeEvents.filter((ev) => ev.status === 'DRAFT').length;
  const totalGuests = activeEvents.reduce((sum, ev) => sum + Number(ev.totalGuests || 0), 0);
  const prodToGenerate = activeEvents.filter(
    (ev) => ev.productionState === 'NOT_GENERATED' || ev.productionState === 'DIRTY',
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem', minWidth: 0 }}>
      {/* ─── BANNIÈRE HERO ─── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="production-hero-card"
        style={{ padding: '.9rem 1.15rem' }}
      >
        <div className="production-hero-glow" />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.2rem',
          }}
        >
          <div>
            <div className="production-hero-badge">
              <Truck size={13} /> GESTION DES PRESTATIONS & RECEPTIONS
            </div>
            <h2 className="production-hero-title" style={{ fontSize: '1.45rem' }}>
              Dossiers événementiels
            </h2>
            <p className="production-hero-desc" style={{ fontSize: '.84rem' }}>
              Organisez vos réceptions, puis planifiez leurs recettes dans le module Fabrication.
            </p>
          </div>
          <button type="button" className="production-btn-primary" onClick={onCreateEvent}>
            <Plus size={18} /> Nouvel Événement
          </button>
        </div>
      </motion.div>

      {/* ─── BARRE DE MÉTRIQUES ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '.55rem',
        }}
      >
        <div
          className="production-metric-card"
          style={{
            cursor: 'pointer',
            padding: '.65rem .75rem',
            border: !statusFilter ? '2px solid #10b981' : undefined,
          }}
          onClick={() => onStatusFilter('')}
        >
          <div
            className="production-metric-icon-wrap"
            style={{ background: '#f1f5f9', color: '#0f172a' }}
          >
            <Truck size={18} />
          </div>
          <div>
            <div className="production-metric-val" style={{ color: '#0f172a' }}>
              {activeEvents.length}
            </div>
            <div className="production-metric-lbl">Dossiers actifs</div>
          </div>
        </div>

        <div
          className="production-metric-card"
          style={{
            cursor: 'pointer',
            padding: '.65rem .75rem',
            border: statusFilter === 'CONFIRMED' ? '2px solid #10b981' : undefined,
          }}
          onClick={() => onStatusFilter(statusFilter === 'CONFIRMED' ? '' : 'CONFIRMED')}
        >
          <div
            className="production-metric-icon-wrap"
            style={{ background: '#ecfdf5', color: '#10b981' }}
          >
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="production-metric-val" style={{ color: '#047857' }}>
              {confirmedCount}
            </div>
            <div className="production-metric-lbl">Confirmés</div>
          </div>
        </div>

        <div
          className="production-metric-card"
          style={{
            cursor: 'pointer',
            padding: '.65rem .75rem',
            border: statusFilter === 'DRAFT' ? '2px solid #f59e0b' : undefined,
          }}
          onClick={() => onStatusFilter(statusFilter === 'DRAFT' ? '' : 'DRAFT')}
        >
          <div
            className="production-metric-icon-wrap"
            style={{ background: '#fffbeb', color: '#f59e0b' }}
          >
            <Clock size={18} />
          </div>
          <div>
            <div className="production-metric-val" style={{ color: '#b45309' }}>
              {draftCount}
            </div>
            <div className="production-metric-lbl">Brouillons / Devis</div>
          </div>
        </div>

        <div className="production-metric-card" style={{ padding: '.65rem .75rem' }}>
          <div
            className="production-metric-icon-wrap"
            style={{ background: '#ede9fe', color: '#7c3aed' }}
          >
            <UsersRound size={18} />
          </div>
          <div>
            <div className="production-metric-val" style={{ color: '#6d28d9' }}>
              {totalGuests.toLocaleString(activeLocale())}
            </div>
            <div className="production-metric-lbl">Convives total</div>
          </div>
        </div>

        <div className="production-metric-card" style={{ padding: '.65rem .75rem' }}>
          <div
            className="production-metric-icon-wrap"
            style={{ background: '#ffedd5', color: '#c2410c' }}
          >
            <ChefHat size={18} />
          </div>
          <div>
            <div className="production-metric-val" style={{ color: '#c2410c' }}>
              {prodToGenerate}
            </div>
            <div className="production-metric-lbl">À fabriquer</div>
          </div>
        </div>
      </div>

      {/* ─── BARRE DE FILTRES ET MULTI-VUES ─── */}
      <div className="fabrication-toolbar-container">
        <div className="fabrication-filters-group">
          {/* Recherche */}
          <div className="fabrication-search-box">
            <Search size={16} color="#64748b" style={{ flexShrink: 0 }} />
            <input
              className="fabrication-search-input"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Rechercher une référence, client, lieu…"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearch('')}
                style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}
              >
                <X size={15} color="#94a3b8" />
              </button>
            )}
          </div>

          {/* Select Statut */}
          <div className="fabrication-select-wrapper">
            <Filter size={15} color="#64748b" style={{ flexShrink: 0 }} />
            <select
              className="fabrication-select-input"
              value={statusFilter}
              onChange={(e) => onStatusFilter(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              <option value="DRAFT">Brouillon / Devis</option>
              <option value="CONFIRMED">Confirmé</option>
              <option value="COMPLETED">Terminé</option>
              <option value="CANCELLED">Annulé</option>
            </select>
            <ChevronDown
              size={14}
              color="#64748b"
              style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }}
            />
          </div>

          {/* Select Fulfillment */}
          <div className="fabrication-select-wrapper">
            <Truck size={15} color="#64748b" style={{ flexShrink: 0 }} />
            <select
              className="fabrication-select-input"
              value={fulfillmentFilter}
              onChange={(e) => onFulfillmentFilter(e.target.value)}
            >
              <option value="">Tous les modes</option>
              <option value="DELIVERY">Livraison</option>
              <option value="ON_SITE">Sur site</option>
              <option value="PICKUP">Retrait</option>
            </select>
            <ChevronDown
              size={14}
              color="#64748b"
              style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* Switcher de vues */}
        <div className="fabrication-view-switcher">
          <button
            type="button"
            className={`fabrication-view-btn${viewMode === 'table' ? ' active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            <Table size={15} /> Tableau
          </button>
          <button
            type="button"
            className={`fabrication-view-btn${viewMode === 'grid' ? ' active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid size={15} /> Grille
          </button>
          <button
            type="button"
            className={`fabrication-view-btn${viewMode === 'kanban' ? ' active' : ''}`}
            onClick={() => setViewMode('kanban')}
          >
            <Kanban size={15} /> Kanban
          </button>
        </div>
      </div>

      {/* ─── CONTENU VUES ─── */}
      <div
        className="production-panel"
        style={{ padding: viewMode === 'kanban' ? '1rem' : 0, overflow: 'hidden' }}
      >
        {!events.length ? (
          <div
            style={{
              minHeight: 280,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              padding: '3rem 1.5rem',
            }}
          >
            <div style={{ maxWidth: 400 }}>
              <Truck size={36} color="#94a3b8" />
              <h3 style={{ margin: '.8rem 0 .3rem', fontSize: '1.2rem', fontWeight: 800 }}>
                Aucun dossier événementiel trouvé
              </h3>
              <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>
                Créez un dossier pour commencer à planifier vos prestations, menus et fabrications.
              </p>
              <button
                type="button"
                className="production-btn-primary"
                style={{ marginTop: '1.1rem' }}
                onClick={onCreateEvent}
              >
                <Plus size={16} /> Nouvel Événement
              </button>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          /* ─── VUE TABLEAU MODERNISÉE ─── */
          <div style={{ overflowX: 'auto' }}>
            <table className="table-modern" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Référence & Nom</th>
                  <th>Date & Heure</th>
                  <th>Client</th>
                  <th>Prestations</th>
                  <th>Convives</th>
                  <th>Mode</th>
                  <th>Statut</th>
                  <th>Production</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const isSelected = selectedEvent?.id === event.id;
                  return (
                    <tr
                      key={event.id}
                      className="fabrication-table-row"
                      style={{ background: isSelected ? '#f0fdf4' : undefined, cursor: 'pointer' }}
                      onClick={() => onSelectEvent(event)}
                    >
                      <td>
                        <strong style={{ color: '#10b981', fontSize: '.92rem' }}>
                          {event.reference}
                        </strong>
                        <div
                          style={{
                            fontWeight: 750,
                            color: '#0f172a',
                            fontSize: '.88rem',
                            marginTop: '.1rem',
                          }}
                        >
                          {event.name}{' '}
                          {event.needsReview ? (
                            <span style={{ color: '#b45309', fontSize: '.75rem' }}>
                              · À vérifier
                            </span>
                          ) : (
                            ''
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#334155', fontSize: '.85rem' }}>
                          {dateLabel(event.startsAt)}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '.86rem' }}>
                          {event.clientSnapshot?.name ??
                            event.client?.name ??
                            'Client à renseigner'}
                        </span>
                        {event.venueName && (
                          <div className="muted" style={{ fontSize: '.76rem' }}>
                            {event.venueName}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 800, fontSize: '.88rem' }}>
                          {event.prestations.length}
                        </span>{' '}
                        <span className="muted" style={{ fontSize: '.78rem' }}>
                          prestation(s)
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontSize: '.95rem', color: '#0f172a' }}>
                          {event.totalGuests}
                        </strong>
                      </td>
                      <td>
                        <FulfillmentBadge mode={event.fulfillmentMode} />
                      </td>
                      <td>
                        <StatusBadge status={event.status} />
                      </td>
                      <td>
                        <ProductionBadge state={event.productionState} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: '.35rem',
                            justifyContent: 'flex-end',
                          }}
                        >
                          {event.status === 'CONFIRMED' && (
                            <button
                              type="button"
                              className="production-btn-primary"
                              disabled={saving}
                              style={{
                                minHeight: '34px',
                                padding: '.35rem .75rem',
                                fontSize: '.78rem',
                                borderRadius: '10px',
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onGenerateProduction(event);
                              }}
                            >
                              <ChefHat size={14} />
                              {event.productionState === 'NOT_GENERATED' ||
                              event.productionState === 'DIRTY'
                                ? 'Planifier'
                                : 'Voir prod'}
                            </button>
                          )}

                          {event.status === 'DRAFT' && (
                            <button
                              type="button"
                              className="production-btn-primary"
                              disabled={saving}
                              style={{
                                minHeight: '34px',
                                padding: '.35rem .75rem',
                                fontSize: '.78rem',
                                borderRadius: '10px',
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onStatusChange(event, 'CONFIRMED');
                              }}
                            >
                              <CheckIcon size={14} /> Confirmer
                            </button>
                          )}

                          <button
                            type="button"
                            style={{
                              ...calendarSecondaryButtonStyle,
                              minHeight: '34px',
                              padding: '.35rem .65rem',
                              fontSize: '.78rem',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditEvent(event);
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'grid' ? (
          /* ─── VUE GRILLE MODERNISÉE ─── */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1.1rem',
              padding: '1.25rem',
            }}
          >
            {events.map((event) => {
              const isSelected = selectedEvent?.id === event.id;
              return (
                <div
                  key={event.id}
                  className="fabrication-campaign-card"
                  style={{
                    cursor: 'pointer',
                    border: isSelected ? '2px solid #10b981' : undefined,
                  }}
                  onClick={() => onSelectEvent(event)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '.4rem',
                      alignItems: 'center',
                      marginBottom: '.65rem',
                    }}
                  >
                    <span style={{ fontSize: '.78rem', fontWeight: 850, color: '#10b981' }}>
                      {event.reference}
                    </span>
                    <div style={{ display: 'flex', gap: '.3rem' }}>
                      <FulfillmentBadge mode={event.fulfillmentMode} />
                      <StatusBadge status={event.status} />
                    </div>
                  </div>

                  <h3
                    style={{
                      margin: '0 0 .3rem',
                      fontSize: '1.08rem',
                      fontWeight: 800,
                      color: '#0f172a',
                      lineHeight: 1.3,
                    }}
                  >
                    {event.name}
                  </h3>

                  <div
                    style={{
                      color: '#64748b',
                      fontSize: '.82rem',
                      marginBottom: '.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.35rem',
                    }}
                  >
                    <UserRound size={14} />{' '}
                    {event.clientSnapshot?.name ?? event.client?.name ?? 'Client non renseigné'}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '.6rem',
                      padding: '.75rem',
                      background: '#f8fafc',
                      borderRadius: '13px',
                      marginBottom: '1rem',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '.7rem',
                          color: '#64748b',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        Convives
                      </div>
                      <div
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: 850,
                          color: '#0f172a',
                          marginTop: '.1rem',
                        }}
                      >
                        {event.totalGuests}{' '}
                        <span style={{ fontSize: '.78rem', color: '#64748b', fontWeight: 600 }}>
                          personnes
                        </span>
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '.7rem',
                          color: '#64748b',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        Date & Heure
                      </div>
                      <div
                        style={{
                          fontSize: '.84rem',
                          fontWeight: 750,
                          color: '#334155',
                          marginTop: '.1rem',
                        }}
                      >
                        {dateLabel(event.startsAt)}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '.5rem',
                      marginTop: 'auto',
                      paddingTop: '.65rem',
                      borderTop: '1px solid #f1f5f9',
                    }}
                  >
                    <ProductionBadge state={event.productionState} />
                    <button
                      type="button"
                      style={{
                        ...calendarSecondaryButtonStyle,
                        minHeight: '34px',
                        padding: '.35rem .75rem',
                        fontSize: '.78rem',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditEvent(event);
                      }}
                    >
                      <Pencil size={13} /> Modifier
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ─── VUE KANBAN PAR STATUT ─── */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
              gap: '1rem',
              padding: '1rem',
            }}
          >
            {[
              { title: 'Brouillons & Devis', statuses: ['DRAFT'], color: '#b45309', bg: '#fffbeb' },
              {
                title: 'Confirmés & En Production',
                statuses: ['CONFIRMED'],
                color: '#047857',
                bg: '#ecfdf5',
              },
              {
                title: 'Terminés & Annulés',
                statuses: ['COMPLETED', 'CANCELLED'],
                color: '#475569',
                bg: '#f1f5f9',
              },
            ].map((col) => {
              const colEvents = events.filter((ev) => col.statuses.includes(ev.status));
              return (
                <div
                  key={col.title}
                  style={{
                    background: '#f8fafc',
                    borderRadius: '18px',
                    border: '1px solid #e2e8f0',
                    padding: '.9rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '.75rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingBottom: '.6rem',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    <strong style={{ fontSize: '.92rem', color: '#0f172a' }}>{col.title}</strong>
                    <span
                      style={{
                        background: col.bg,
                        color: col.color,
                        borderRadius: '999px',
                        padding: '.2rem .6rem',
                        fontSize: '.75rem',
                        fontWeight: 850,
                      }}
                    >
                      {colEvents.length}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.65rem', flex: 1 }}>
                    {!colEvents.length ? (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '2rem 1rem',
                          color: '#94a3b8',
                          fontSize: '.82rem',
                          fontWeight: 650,
                        }}
                      >
                        Aucun dossier dans cette colonne
                      </div>
                    ) : (
                      colEvents.map((event) => (
                        <div
                          key={event.id}
                          className="fabrication-campaign-card"
                          style={{ padding: '.9rem', cursor: 'pointer' }}
                          onClick={() => onSelectEvent(event)}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '.4rem',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ fontSize: '.72rem', fontWeight: 850, color: '#10b981' }}>
                              {event.reference}
                            </span>
                            <FulfillmentBadge mode={event.fulfillmentMode} />
                          </div>

                          <strong
                            style={{
                              display: 'block',
                              margin: '.35rem 0 .2rem',
                              fontSize: '.92rem',
                              color: '#0f172a',
                            }}
                          >
                            {event.name}
                          </strong>

                          <div
                            style={{ fontSize: '.76rem', color: '#64748b', marginBottom: '.4rem' }}
                          >
                            {event.clientSnapshot?.name ?? event.client?.name ?? 'Client'}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '.78rem',
                              color: '#475569',
                              marginTop: '.5rem',
                              paddingTop: '.5rem',
                              borderTop: '1px solid #f1f5f9',
                            }}
                          >
                            <span>
                              <strong>{event.totalGuests}</strong> convives
                            </span>
                            <ProductionBadge state={event.productionState} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentCard({
  title,
  text,
  onClick,
}: {
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <div className="caterer-doc-card">
      <div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'rgba(16, 185, 129, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            marginBottom: '0.85rem',
          }}
        >
          <FileText size={22} />
        </div>
        <strong
          style={{
            display: 'block',
            color: 'var(--text-main)',
            fontSize: '1.05rem',
            marginBottom: '0.4rem',
          }}
        >
          {title}
        </strong>
        <p className="muted" style={{ fontSize: '0.83rem', lineHeight: 1.55, margin: 0 }}>
          {text}
        </p>
      </div>
      <button
        className="btn btn-secondary"
        onClick={onClick}
        style={{ marginTop: '1.25rem', width: '100%', justifyContent: 'center', borderRadius: 12 }}
      >
        <Download size={14} /> Télécharger le PDF
      </button>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  colorVariant = 'emerald',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorVariant?: 'emerald' | 'purple' | 'blue' | 'amber';
}) {
  return (
    <motion.div className="caterer-kpi-card" whileHover={{ y: -3 }}>
      <div className="caterer-kpi-header">
        <div className={`caterer-kpi-icon ${colorVariant !== 'emerald' ? colorVariant : ''}`}>
          {icon}
        </div>
      </div>
      <div>
        <div className="caterer-kpi-value">{value}</div>
        <div className="caterer-kpi-label">{label}</div>
      </div>
    </motion.div>
  );
}

function Check({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`menus-alert ${ok ? 'success' : 'warning'}`} style={{ borderRadius: 12 }}>
      {ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      {label}
    </div>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '3.5rem 2rem',
        textAlign: 'center',
        background:
          'linear-gradient(180deg, rgba(248, 250, 252, 0.6) 0%, rgba(241, 245, 249, 0.3) 100%)',
        borderRadius: 20,
        border: '1px dashed #cbd5e1',
        margin: '0.5rem 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 18,
          background:
            'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(124, 58, 237, 0.08) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#10b981',
          marginBottom: '1rem',
          boxShadow: '0 8px 20px -4px rgba(16, 185, 129, 0.15)',
        }}
      >
        <PackageCheck size={28} />
      </div>
      <strong
        style={{
          display: 'block',
          color: 'var(--text-main)',
          fontSize: '1.1rem',
          fontWeight: 800,
          fontFamily: 'var(--font-heading)',
        }}
      >
        {title}
      </strong>
      <span
        className="muted"
        style={{ fontSize: '0.88rem', maxWidth: 420, marginTop: '0.35rem', lineHeight: 1.55 }}
      >
        {text}
      </span>
      {action ? <div style={{ marginTop: '1.25rem' }}>{action}</div> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: CatererEventStatus }) {
  const config = {
    DRAFT: { label: 'Brouillon', className: 'caterer-badge-draft' },
    CONFIRMED: { label: 'Confirmé', className: 'caterer-badge-confirmed' },
    COMPLETED: { label: 'Terminé', className: 'caterer-badge-completed' },
    CANCELLED: { label: 'Annulé', className: 'caterer-badge-cancelled' },
  }[status];

  return <span className={`caterer-badge ${config.className}`}>{config.label}</span>;
}

function ProductionBadge({ state }: { state: CatererEvent['productionState'] }) {
  const labels: Record<string, { text: string; style: React.CSSProperties }> = {
    NOT_GENERATED: { text: 'Non générée', style: { background: '#f1f5f9', color: '#64748b' } },
    DIRTY: { text: 'À actualiser', style: { background: '#fef3c7', color: '#b45309' } },
    PLANNED: { text: 'Planifiée', style: { background: '#e0e7ff', color: '#3730a3' } },
    IN_PROGRESS: { text: 'En cours', style: { background: '#dbeafe', color: '#1e40af' } },
    COMPLETED: {
      text: 'Terminée',
      style: { background: 'rgba(16, 185, 129, 0.1)', color: '#047857' },
    },
  };
  const badge = labels[state] ?? {
    text: state,
    style: { background: '#f1f5f9', color: '#64748b' },
  };

  return (
    <span
      className="badge"
      style={{
        padding: '0.25rem 0.55rem',
        borderRadius: 6,
        fontSize: '0.75rem',
        fontWeight: 700,
        ...badge.style,
      }}
    >
      {badge.text}
    </span>
  );
}

function normalizeEventPayload(form: CatererEventPayload): CatererEventPayload {
  const iso = (value?: string) => (value ? new Date(value).toISOString() : undefined);
  return {
    ...form,
    clientId: form.clientId || undefined,
    productionSiteId: form.productionSiteId || undefined,
    startsAt: iso(form.startsAt),
    endsAt: iso(form.endsAt),
    prestations: form.prestations.map((item, position) => ({
      ...item,
      readyAt: iso(item.readyAt),
      handoffAt: iso(item.handoffAt),
      serviceAt: iso(item.serviceAt),
      position,
    })),
  };
}

function localInput(value?: string | Date | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function dateLabel(value?: string | null) {
  return value
    ? new Date(value).toLocaleString(activeLocale(), { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

function messageOf(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Action Traiteur impossible.';
}

const calendarIconButtonStyle: React.CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  width: '36px',
  height: '36px',
  border: '1px solid #dbe3ec',
  borderRadius: '10px',
  background: 'white',
  color: '#475569',
  cursor: 'pointer',
};

const calendarSecondaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '.45rem',
  minHeight: '38px',
  padding: '.45rem .85rem',
  border: '1px solid #dbe3ec',
  borderRadius: '11px',
  background: 'white',
  color: '#334155',
  fontWeight: 800,
  fontSize: '.82rem',
  cursor: 'pointer',
};

function CatererCalendarView({
  events,
  onSelectEvent,
  onCreateEvent,
  onEditEvent,
  embedded = false,
}: {
  events: CatererEvent[];
  onSelectEvent: (eventId: string) => void;
  onCreateEvent: (dateISO?: string) => void;
  onEditEvent: (event: CatererEvent) => void;
  embedded?: boolean;
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'agenda'>('month');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === 'week') {
      const next = new Date(currentDate);
      next.setDate(next.getDate() - 7);
      setCurrentDate(next);
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === 'week') {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + 7);
      setCurrentDate(next);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat(activeLocale(), { month: 'long', year: 'numeric' })
      .format(currentDate)
      .replace(/^./, (str) => str.toUpperCase());
  }, [currentDate]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayObj = new Date(year, month, 1);
  const firstDayWeekday = (firstDayObj.getDay() + 6) % 7; // Monday = 0

  const todayStr = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, []);

  const activeEvents = useMemo(() => {
    return events.filter((ev) => ev.status !== 'CANCELLED');
  }, [events]);

  const filteredEvents = useMemo(() => {
    return activeEvents.filter((ev) => {
      if (statusFilter && ev.status !== statusFilter) return false;
      if (fulfillmentFilter && ev.fulfillmentMode !== fulfillmentFilter) return false;
      const needle = search.trim().toLowerCase();
      if (!needle) return true;
      const haystack =
        `${ev.reference} ${ev.name} ${ev.clientSnapshot?.name ?? ev.client?.name ?? ''} ${ev.venueName ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [activeEvents, statusFilter, fulfillmentFilter, search]);

  const totalGuests = filteredEvents.reduce((sum, ev) => sum + Number(ev.totalGuests || 0), 0);
  const confirmedCount = filteredEvents.filter((ev) => ev.status === 'CONFIRMED').length;
  const draftCount = filteredEvents.filter((ev) => ev.status === 'DRAFT').length;
  const deliveryCount = filteredEvents.filter((ev) => ev.fulfillmentMode === 'DELIVERY').length;
  const onSiteCount = filteredEvents.filter((ev) => ev.fulfillmentMode === 'ON_SITE').length;

  const calendarDays = useMemo(() => {
    const cells: Array<{
      dayNum?: number;
      dateStr?: string;
      isToday?: boolean;
      isCurrentMonth?: boolean;
    }> = [];
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      cells.push({ dayNum: d, isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNum: d,
        dateStr,
        isToday: dateStr === todayStr,
        isCurrentMonth: true,
      });
    }
    const totalSoFar = cells.length;
    const totalCells = totalSoFar > 35 ? 42 : 35;
    for (let i = 1; i <= totalCells - totalSoFar; i++) {
      cells.push({ dayNum: i, isCurrentMonth: false });
    }
    return cells;
  }, [daysInMonth, firstDayWeekday, month, todayStr, year]);

  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const dayOfWeek = (curr.getDay() + 6) % 7;
    curr.setDate(curr.getDate() - dayOfWeek);
    return Array.from({ length: 7 }, (_, index) => {
      const d = new Date(curr);
      d.setDate(d.getDate() + index);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        date: d,
        dateStr,
        isToday: dateStr === todayStr,
        label: new Intl.DateTimeFormat(activeLocale(), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }).format(d),
      };
    });
  }, [currentDate, todayStr]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: embedded ? '.8rem' : '1.25rem' }}>
      {/* ─── BANNIÈRE HERO CALENDRIER ─── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="production-hero-card"
        style={{ padding: '1.5rem 1.8rem', display: embedded ? 'none' : undefined }}
      >
        <div className="production-hero-glow" />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.2rem',
          }}
        >
          <div>
            <div className="production-hero-badge">
              <CalendarDays size={13} /> PLANIFICATION & EVENT TRAITEUR
            </div>
            <h2 className="production-hero-title">Calendrier Traiteur</h2>
            <p className="production-hero-desc">
              Visualisez, organisez et suivez toutes vos réceptions, livraisons et événements
              traiteur en temps réel.
            </p>
          </div>
          <button type="button" className="production-btn-primary" onClick={() => onCreateEvent()}>
            <Plus size={18} /> Nouvel Événement
          </button>
        </div>
      </motion.div>

      {/* ─── BARRE DE MÉTRIQUES DU CALENDRIER ─── */}
      <div
        style={{
          display: embedded ? 'none' : 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '.8rem',
        }}
      >
        <div className="production-metric-card">
          <div
            className="production-metric-icon-wrap"
            style={{ background: '#ecfdf5', color: '#10b981' }}
          >
            <CalendarDays size={18} />
          </div>
          <div>
            <div className="production-metric-val" style={{ color: '#047857' }}>
              {confirmedCount}
            </div>
            <div className="production-metric-lbl">Confirmés</div>
          </div>
        </div>

        <div className="production-metric-card">
          <div
            className="production-metric-icon-wrap"
            style={{ background: '#fffbeb', color: '#f59e0b' }}
          >
            <Clock size={18} />
          </div>
          <div>
            <div className="production-metric-val" style={{ color: '#b45309' }}>
              {draftCount}
            </div>
            <div className="production-metric-lbl">Brouillons</div>
          </div>
        </div>

        <div className="production-metric-card">
          <div
            className="production-metric-icon-wrap"
            style={{ background: '#ede9fe', color: '#7c3aed' }}
          >
            <UsersRound size={18} />
          </div>
          <div>
            <div className="production-metric-val" style={{ color: '#6d28d9' }}>
              {totalGuests.toLocaleString(activeLocale())}
            </div>
            <div className="production-metric-lbl">Convives total</div>
          </div>
        </div>

        <div className="production-metric-card">
          <div
            className="production-metric-icon-wrap"
            style={{ background: '#dbeafe', color: '#2563eb' }}
          >
            <Truck size={18} />
          </div>
          <div>
            <div className="production-metric-val" style={{ color: '#1d4ed8' }}>
              {deliveryCount}
            </div>
            <div className="production-metric-lbl">Livraisons</div>
          </div>
        </div>

        <div className="production-metric-card">
          <div
            className="production-metric-icon-wrap"
            style={{ background: '#f0fdf4', color: '#059669' }}
          >
            <Utensils size={18} />
          </div>
          <div>
            <div className="production-metric-val" style={{ color: '#059669' }}>
              {onSiteCount}
            </div>
            <div className="production-metric-lbl">Sur site</div>
          </div>
        </div>
      </div>

      {/* ─── BARRE DE FILTRES ET NAVIGATION DATES ─── */}
      <div className="fabrication-toolbar-container">
        <div className="fabrication-filters-group">
          {/* Navigation Mois / Semaine */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <button
              type="button"
              style={calendarIconButtonStyle}
              onClick={handlePrev}
              title="Période précédente"
            >
              <ChevronLeft size={18} />
            </button>
            <button type="button" style={calendarSecondaryButtonStyle} onClick={handleToday}>
              Aujourd’hui
            </button>
            <button
              type="button"
              style={calendarIconButtonStyle}
              onClick={handleNext}
              title="Période suivante"
            >
              <ChevronRight size={18} />
            </button>
            <strong
              style={{
                fontSize: '1.05rem',
                color: '#0f172a',
                marginLeft: '.4rem',
                textTransform: 'capitalize',
              }}
            >
              {monthLabel}
            </strong>
          </div>

          {/* Recherche */}
          <div className="fabrication-search-box" style={{ flex: '1 1 200px', minWidth: '180px' }}>
            <Search size={16} color="#64748b" style={{ flexShrink: 0 }} />
            <input
              className="fabrication-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un événement, un client…"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}
              >
                <X size={15} color="#94a3b8" />
              </button>
            )}
          </div>

          {/* Dropdown Statut */}
          <div className="fabrication-select-wrapper">
            <Filter size={15} color="#64748b" style={{ flexShrink: 0 }} />
            <select
              className="fabrication-select-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              <option value="CONFIRMED">Confirmé</option>
              <option value="DRAFT">Brouillon</option>
              <option value="COMPLETED">Terminé</option>
            </select>
            <ChevronDown
              size={14}
              color="#64748b"
              style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* Switcher de vue */}
        <div className="fabrication-view-switcher">
          <button
            type="button"
            className={`fabrication-view-btn${viewMode === 'month' ? ' active' : ''}`}
            onClick={() => setViewMode('month')}
          >
            <CalendarDays size={15} /> Mois
          </button>
          <button
            type="button"
            className={`fabrication-view-btn${viewMode === 'week' ? ' active' : ''}`}
            onClick={() => setViewMode('week')}
          >
            <LayoutGrid size={15} /> Semaine
          </button>
          <button
            type="button"
            className={`fabrication-view-btn${viewMode === 'agenda' ? ' active' : ''}`}
            onClick={() => setViewMode('agenda')}
          >
            <List size={15} /> Agenda
          </button>
        </div>
      </div>

      {/* ─── VUE MOIS (GRILLE DE CALENDRIER INTERACTIVE) ─── */}
      {viewMode === 'month' && (
        <div className="caterer-calendar-month-grid">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
            <div key={d} className="caterer-calendar-day-header">
              {d}
            </div>
          ))}

          {calendarDays.map((cell, index) => {
            const dayEvents = cell.dateStr
              ? filteredEvents.filter((ev) => ev.startsAt && ev.startsAt.startsWith(cell.dateStr!))
              : [];

            return (
              <div
                key={index}
                className={`caterer-calendar-day-cell${cell.isCurrentMonth ? '' : ' is-other-month'}${cell.isToday ? ' is-today' : ''}`}
                onClick={() => cell.dateStr && setSelectedDay(cell.dateStr)}
                style={{ cursor: cell.dateStr ? 'pointer' : 'default' }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '.35rem',
                  }}
                >
                  <span
                    className={`caterer-calendar-date-number${cell.isToday ? ' today-pill' : ''}`}
                  >
                    {cell.dayNum}
                  </span>
                  {cell.isCurrentMonth && cell.dateStr && (
                    <button
                      type="button"
                      className="caterer-calendar-add-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCreateEvent(cell.dateStr);
                      }}
                      title={`Créer un événement le ${cell.dayNum}`}
                    >
                      <Plus size={13} />
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '.3rem',
                    overflowY: 'auto',
                    maxHeight: '110px',
                  }}
                >
                  {dayEvents.map((ev) => {
                    const statusColor =
                      ev.status === 'CONFIRMED'
                        ? '#10b981'
                        : ev.status === 'DRAFT'
                          ? '#f59e0b'
                          : '#64748b';
                    const statusBg =
                      ev.status === 'CONFIRMED'
                        ? '#ecfdf5'
                        : ev.status === 'DRAFT'
                          ? '#fffbeb'
                          : '#f1f5f9';

                    return (
                      <div
                        key={ev.id}
                        className="caterer-calendar-event-chip"
                        style={{ borderLeft: `3.5px solid ${statusColor}`, background: statusBg }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (cell.dateStr) setSelectedDay(cell.dateStr);
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            color: '#0f172a',
                            fontSize: '.78rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {ev.name}
                        </div>
                        <div
                          style={{
                            fontSize: '.7rem',
                            color: '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '.3rem',
                            marginTop: '.1rem',
                          }}
                        >
                          <span>{ev.clientSnapshot?.name ?? ev.client?.name ?? 'Client'}</span>
                          <span>•</span>
                          <strong>{ev.totalGuests}p</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── VUE SEMAINE (COLONNES PAR JOUR) ─── */}
      {viewMode === 'week' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(180px, 1fr))',
            gap: '.75rem',
            overflowX: 'auto',
          }}
        >
          {weekDays.map((wd) => {
            const dayEvents = filteredEvents.filter(
              (ev) => ev.startsAt && ev.startsAt.startsWith(wd.dateStr),
            );
            return (
              <div
                key={wd.dateStr}
                onClick={() => setSelectedDay(wd.dateStr)}
                style={{
                  background: wd.isToday ? '#f0fdf4' : '#f8fafc',
                  border: `1px solid ${wd.isToday ? '#6ee7b7' : '#e2e8f0'}`,
                  borderRadius: '16px',
                  padding: '.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.65rem',
                  minHeight: '400px',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '.5rem',
                    borderBottom: '1px solid #e2e8f0',
                  }}
                >
                  <strong
                    style={{
                      fontSize: '.9rem',
                      color: wd.isToday ? '#047857' : '#0f172a',
                      textTransform: 'capitalize',
                    }}
                  >
                    {wd.label}
                  </strong>
                  <button
                    type="button"
                    style={calendarIconButtonStyle}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCreateEvent(wd.dateStr);
                    }}
                    title="Ajouter à cette date"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', flex: 1 }}>
                  {!dayEvents.length ? (
                    <div
                      style={{
                        color: '#94a3b8',
                        fontSize: '.78rem',
                        textAlign: 'center',
                        marginTop: '2rem',
                      }}
                    >
                      Aucune prestation
                    </div>
                  ) : (
                    dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="fabrication-campaign-card"
                        style={{ padding: '.8rem', cursor: 'pointer' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedDay(wd.dateStr);
                        }}
                      >
                        <div
                          style={{ display: 'flex', justifyContent: 'space-between', gap: '.3rem' }}
                        >
                          <span style={{ fontSize: '.7rem', fontWeight: 850, color: '#10b981' }}>
                            {ev.reference}
                          </span>
                          <span
                            style={{
                              fontSize: '.68rem',
                              fontWeight: 800,
                              color: '#475569',
                              background: '#f1f5f9',
                              padding: '.15rem .45rem',
                              borderRadius: '6px',
                            }}
                          >
                            {ev.totalGuests} convives
                          </span>
                        </div>
                        <strong
                          style={{ fontSize: '.86rem', color: '#0f172a', margin: '.3rem 0 .15rem' }}
                        >
                          {ev.name}
                        </strong>
                        <div style={{ fontSize: '.74rem', color: '#64748b' }}>
                          {ev.clientSnapshot?.name ?? ev.client?.name ?? 'Client'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── VUE AGENDA (LISTE CHRONOLOGIQUE) ─── */}
      {viewMode === 'agenda' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {!filteredEvents.length ? (
            <div className="caterer-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
              <Clock size={36} color="#94a3b8" />
              <h3 style={{ margin: '.8rem 0 .3rem' }}>Aucun événement au calendrier</h3>
              <p className="muted">
                Ajustez vos filtres ou créez votre premier événement Traiteur.
              </p>
              <button
                type="button"
                className="production-btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={() => onCreateEvent()}
              >
                <Plus size={16} /> Créer un événement
              </button>
            </div>
          ) : (
            filteredEvents.map((ev) => (
              <div
                key={ev.id}
                className="fabrication-campaign-card"
                style={{ cursor: 'pointer', padding: '1.1rem 1.25rem' }}
                onClick={() => onSelectEvent(ev.id)}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '.6rem .85rem',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        borderRadius: '14px',
                        color: '#047857',
                      }}
                    >
                      <div
                        style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase' }}
                      >
                        {ev.startsAt
                          ? new Date(ev.startsAt).toLocaleDateString(activeLocale(), { month: 'short' })
                          : 'Date'}
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 850, lineHeight: 1 }}>
                        {ev.startsAt ? new Date(ev.startsAt).getDate() : '—'}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '.5rem',
                          marginBottom: '.2rem',
                        }}
                      >
                        <span style={{ fontSize: '.75rem', fontWeight: 850, color: '#10b981' }}>
                          {ev.reference}
                        </span>
                        <StatusBadge status={ev.status} />
                        <ProductionBadge state={ev.productionState} />
                      </div>
                      <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{ev.name}</strong>
                      <div
                        style={{
                          color: '#64748b',
                          fontSize: '.84rem',
                          marginTop: '.2rem',
                          display: 'flex',
                          gap: '.8rem',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <span>
                          <UserRound size={13} style={{ display: 'inline', marginRight: 4 }} />{' '}
                          {ev.clientSnapshot?.name ?? ev.client?.name ?? 'Client non renseigné'}
                        </span>
                        {ev.venueName && (
                          <span>
                            <MapPin size={13} style={{ display: 'inline', marginRight: 4 }} />{' '}
                            {ev.venueName}
                          </span>
                        )}
                        <span>
                          <UsersRound size={13} style={{ display: 'inline', marginRight: 4 }} />{' '}
                          {ev.totalGuests} convives
                        </span>
                        <span>
                          <Layers size={13} style={{ display: 'inline', marginRight: 4 }} />{' '}
                          {ev.prestations.length} prestation(s)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <button
                      type="button"
                      style={calendarSecondaryButtonStyle}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditEvent(ev);
                      }}
                    >
                      <Pencil size={15} /> Modifier
                    </button>
                    <ChevronRight size={20} color="#10b981" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <AnimatePresence>
        {selectedDay && (
          <CatererDaySummaryModal
            date={selectedDay}
            events={filteredEvents.filter(
              (event) =>
                event.startsAt &&
                dashboardCalendarDateKey(new Date(event.startsAt)) === selectedDay,
            )}
            onClose={() => setSelectedDay(null)}
            onCreate={() => {
              const date = selectedDay;
              setSelectedDay(null);
              onCreateEvent(date);
            }}
            onSelect={(event) => {
              setSelectedDay(null);
              onSelectEvent(event.id);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CatererDaySummaryModal({
  date,
  events,
  onClose,
  onCreate,
  onSelect,
}: {
  date: string;
  events: CatererEvent[];
  onClose: () => void;
  onCreate: () => void;
  onSelect: (event: CatererEvent) => void;
}) {
  const selectedDate = new Date(`${date}T12:00:00`);
  const fullDateLabel = new Intl.DateTimeFormat(activeLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(selectedDate);
  const sortedEvents = [...events].sort(
    (left, right) =>
      new Date(left.startsAt ?? 0).getTime() - new Date(right.startsAt ?? 0).getTime(),
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1040,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(7px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 18 }}
        transition={{ duration: 0.18 }}
        style={{
          width: '100%',
          maxWidth: '700px',
          maxHeight: 'calc(100dvh - 2rem)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.7)',
          borderRadius: '26px',
          background: '#f8fafc',
          boxShadow: '0 30px 80px -25px rgba(15, 23, 42, 0.55)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: '1.25rem 1.35rem',
            background: 'linear-gradient(135deg, #ecfdf5 0%, #eff6ff 65%, #ffffff 100%)',
            borderBottom: '1px solid #dbeafe',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', gap: '.9rem', alignItems: 'center', minWidth: 0 }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                flexShrink: 0,
                borderRadius: '15px',
                display: 'grid',
                placeItems: 'center',
                color: '#047857',
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid #a7f3d0',
                boxShadow: '0 8px 20px -12px rgba(5, 150, 105, 0.55)',
              }}
            >
              <CalendarDays size={23} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: '#047857',
                  fontSize: '.74rem',
                  fontWeight: 850,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}
              >
                Récapitulatif de la journée
              </div>
              <h3
                style={{
                  margin: '.2rem 0 0',
                  color: '#0f172a',
                  fontSize: '1.16rem',
                  fontWeight: 850,
                  textTransform: 'capitalize',
                }}
              >
                {fullDateLabel}
              </h3>
              <div style={{ marginTop: '.25rem', color: '#64748b', fontSize: '.82rem' }}>
                {sortedEvents.length
                  ? `${sortedEvents.length} événement${sortedEvents.length > 1 ? 's' : ''} planifié${sortedEvents.length > 1 ? 's' : ''}`
                  : 'Aucun événement planifié'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le récapitulatif"
            style={{
              width: '36px',
              height: '36px',
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              border: '1px solid #e2e8f0',
              borderRadius: '50%',
              color: '#475569',
              background: 'rgba(255, 255, 255, 0.9)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            padding: '1rem',
          }}
        >
          {!sortedEvents.length ? (
            <div
              style={{
                padding: '2.4rem 1rem',
                textAlign: 'center',
                border: '1px dashed #cbd5e1',
                borderRadius: '18px',
                background: '#ffffff',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  margin: '0 auto .8rem',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: '17px',
                  color: '#64748b',
                  background: '#f1f5f9',
                }}
              >
                <CalendarDays size={24} />
              </div>
              <strong style={{ display: 'block', color: '#0f172a' }}>Journée disponible</strong>
              <span
                style={{
                  display: 'block',
                  marginTop: '.3rem',
                  color: '#64748b',
                  fontSize: '.84rem',
                }}
              >
                Vous pouvez créer un événement directement à cette date.
              </span>
              <button
                type="button"
                className="production-btn-primary"
                onClick={onCreate}
                style={{ marginTop: '1rem' }}
              >
                <Plus size={16} /> Nouvel événement
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
              {sortedEvents.map((event) => {
                const startTime = event.startsAt
                  ? new Date(event.startsAt).toLocaleTimeString(activeLocale(), {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—';

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelect(event)}
                    style={{
                      width: '100%',
                      padding: '.9rem',
                      display: 'grid',
                      gridTemplateColumns: '58px minmax(0, 1fr) auto',
                      gap: '.9rem',
                      alignItems: 'center',
                      textAlign: 'left',
                      border: '1px solid #e2e8f0',
                      borderRadius: '18px',
                      background: '#ffffff',
                      boxShadow: '0 8px 24px -20px rgba(15, 23, 42, 0.55)',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        padding: '.62rem .35rem',
                        textAlign: 'center',
                        borderRadius: '14px',
                        color: '#047857',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        fontSize: '.82rem',
                        fontWeight: 850,
                      }}
                    >
                      {startTime}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '.4rem',
                          flexWrap: 'wrap',
                          marginBottom: '.25rem',
                        }}
                      >
                        <span style={{ color: '#059669', fontSize: '.72rem', fontWeight: 850 }}>
                          {event.reference}
                        </span>
                        <StatusBadge status={event.status} />
                        <ProductionBadge state={event.productionState} />
                        <FulfillmentBadge mode={event.fulfillmentMode} />
                      </div>
                      <strong
                        style={{
                          display: 'block',
                          color: '#0f172a',
                          fontSize: '.96rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {event.name}
                      </strong>
                      <div
                        style={{
                          display: 'flex',
                          gap: '.7rem',
                          flexWrap: 'wrap',
                          marginTop: '.32rem',
                          color: '#64748b',
                          fontSize: '.76rem',
                        }}
                      >
                        <span>
                          <UserRound size={12} style={{ display: 'inline', marginRight: 3 }} />
                          {event.clientSnapshot?.name ?? event.client?.name ?? 'Client'}
                        </span>
                        <span>
                          <UsersRound size={12} style={{ display: 'inline', marginRight: 3 }} />
                          {event.totalGuests} convives
                        </span>
                        <span>
                          <Layers size={12} style={{ display: 'inline', marginRight: 3 }} />
                          {event.prestations.length} prestation(s)
                        </span>
                        {event.venueName && (
                          <span>
                            <MapPin size={12} style={{ display: 'inline', marginRight: 3 }} />
                            {event.venueName}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight size={20} color="#10b981" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!!sortedEvents.length && (
          <div
            style={{
              padding: '.85rem 1rem',
              borderTop: '1px solid #e2e8f0',
              background: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '.7rem',
              flexWrap: 'wrap',
            }}
          >
            <button type="button" className="production-btn-primary" onClick={onCreate}>
              <Plus size={16} /> Nouvel événement ce jour
            </button>
            <button type="button" style={calendarSecondaryButtonStyle} onClick={onClose}>
              Fermer
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function CatererEventDetailModal({
  event,
  onClose,
  onEdit,
  onGenerateProduction,
  onStatusChange,
  saving,
}: {
  event: CatererEvent;
  onClose: () => void;
  onEdit: (event: CatererEvent) => void;
  onGenerateProduction: (event: CatererEvent) => void;
  onStatusChange: (event: CatererEvent, status: CatererEventStatus) => void;
  saving: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'prestations' | 'recipes' | 'logistics'>(
    'overview',
  );

  const aggregatedRecipes = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; portions: number; prestations: string[] }
    >();
    event.prestations.forEach((p) => {
      p.menu.items?.forEach((item) => {
        const id =
          item.technicalSheetId ?? item.productId ?? item.id ?? item.technicalSheet?.name ?? 'item';
        const name = item.technicalSheet?.name ?? item.product?.name ?? 'Article sans nom';
        const qty =
          item.portionsOverride ?? Number(p.expectedGuests) * Number(item.servingQuantity ?? 1);
        const existing = map.get(id);
        if (existing) {
          existing.portions += qty;
          if (!existing.prestations.includes(p.name)) existing.prestations.push(p.name);
        } else {
          map.set(id, { id, name, portions: qty, prestations: [p.name] });
        }
      });
    });
    return Array.from(map.values());
  }, [event]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        style={{
          background: '#ffffff',
          borderRadius: '28px',
          width: '100%',
          maxWidth: '920px',
          maxHeight: 'calc(100dvh - 2rem)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.75)',
          boxShadow: '0 30px 80px -25px rgba(15, 23, 42, 0.55)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER MODAL */}
        <div
          style={{
            padding: '1.4rem 1.6rem 0',
            background: 'linear-gradient(135deg, #ecfdf5 0%, #eff6ff 58%, #ffffff 100%)',
            color: '#0f172a',
            position: 'relative',
            borderTop: '4px solid #10b981',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '1rem',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.5rem',
                  marginBottom: '.4rem',
                }}
              >
                <span
                  style={{
                    fontSize: '.78rem',
                    fontWeight: 850,
                    color: '#047857',
                    background: 'rgba(255, 255, 255, 0.9)',
                    border: '1px solid #a7f3d0',
                    padding: '.2rem .6rem',
                    borderRadius: '8px',
                  }}
                >
                  {event.reference}
                </span>
                <StatusBadge status={event.status} />
                <ProductionBadge state={event.productionState} />
                <FulfillmentBadge mode={event.fulfillmentMode} />
              </div>

              <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 850, color: '#0f172a' }}>
                {event.name}
              </h2>

              <div
                style={{
                  color: '#475569',
                  fontSize: '.84rem',
                  marginTop: '.4rem',
                  display: 'flex',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <span>
                  <CalendarDays size={14} style={{ display: 'inline', marginRight: 4 }} />{' '}
                  {dateLabel(event.startsAt)}
                </span>
                <span>
                  <UserRound size={14} style={{ display: 'inline', marginRight: 4 }} />{' '}
                  {event.clientSnapshot?.name ?? event.client?.name ?? 'Client non renseigné'}
                </span>
                <span>
                  <UsersRound size={14} style={{ display: 'inline', marginRight: 4 }} />{' '}
                  {event.totalGuests} convives
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                border: '1px solid #e2e8f0',
                background: 'rgba(255, 255, 255, 0.9)',
                color: '#475569',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* ONGLET NATIVE */}
          <div
            style={{
              display: 'flex',
              gap: '0.4rem',
              marginTop: '1.2rem',
              borderBottom: '1px solid #dbeafe',
              overflowX: 'auto',
              flexWrap: 'nowrap',
            }}
          >
            {[
              { key: 'overview', label: 'Aperçu Général', icon: Eye },
              {
                key: 'prestations',
                label: `Prestations (${event.prestations.length})`,
                icon: Layers,
              },
              {
                key: 'recipes',
                label: `Articles & Recettes (${aggregatedRecipes.length})`,
                icon: ChefHat,
              },
              { key: 'logistics', label: 'Lieu & Logistique', icon: MapPin },
            ].map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key as any)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.45rem',
                    padding: '.6rem .95rem',
                    border: 0,
                    borderBottom: isActive ? '3px solid #10b981' : '3px solid transparent',
                    background: 'transparent',
                    color: isActive ? '#047857' : '#64748b',
                    fontWeight: isActive ? 850 : 650,
                    fontSize: '.84rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* CORPS DU MODAL */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            minHeight: 0,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.2rem',
            background: '#f8fafc',
          }}
        >
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '.85rem',
                }}
              >
                <div
                  style={{
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div
                    style={{
                      fontSize: '.75rem',
                      color: '#64748b',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    Nombre de convives
                  </div>
                  <div
                    style={{
                      fontSize: '1.35rem',
                      fontWeight: 850,
                      color: '#0f172a',
                      marginTop: '.2rem',
                    }}
                  >
                    {event.totalGuests}{' '}
                    <span style={{ fontSize: '.84rem', color: '#64748b', fontWeight: 600 }}>
                      personnes
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div
                    style={{
                      fontSize: '.75rem',
                      color: '#64748b',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    Date de l'événement
                  </div>
                  <div
                    style={{
                      fontSize: '1.05rem',
                      fontWeight: 800,
                      color: '#0f172a',
                      marginTop: '.2rem',
                    }}
                  >
                    {dateLabel(event.startsAt)}
                  </div>
                </div>

                <div
                  style={{
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div
                    style={{
                      fontSize: '.75rem',
                      color: '#64748b',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    Prestations répertoriées
                  </div>
                  <div
                    style={{
                      fontSize: '1.35rem',
                      fontWeight: 850,
                      color: '#047857',
                      marginTop: '.2rem',
                    }}
                  >
                    {event.prestations.length}{' '}
                    <span style={{ fontSize: '.84rem', color: '#64748b', fontWeight: 600 }}>
                      service(s)
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div
                  style={{
                    padding: '1.1rem',
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <strong
                    style={{
                      fontSize: '.92rem',
                      color: '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.4rem',
                      marginBottom: '.65rem',
                    }}
                  >
                    <UserRound size={16} color="#10b981" /> Informations Client
                  </strong>
                  <div style={{ fontSize: '.88rem', fontWeight: 800, color: '#0f172a' }}>
                    {event.clientSnapshot?.name ?? event.client?.name ?? 'Non spécifié'}
                  </div>
                  {event.clientSnapshot?.email && (
                    <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: '.2rem' }}>
                      ✉️ {event.clientSnapshot.email}
                    </div>
                  )}
                  {event.clientSnapshot?.phone && (
                    <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: '.15rem' }}>
                      📞 {event.clientSnapshot.phone}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: '1.1rem',
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <strong
                    style={{
                      fontSize: '.92rem',
                      color: '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.4rem',
                      marginBottom: '.65rem',
                    }}
                  >
                    <MapPin size={16} color="#10b981" /> Lieu & Distribution
                  </strong>
                  <div style={{ fontSize: '.88rem', fontWeight: 800, color: '#0f172a' }}>
                    {event.venueName || 'Lieu non renseigné'}
                  </div>
                  {event.address && (
                    <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: '.2rem' }}>
                      📍 {event.address}
                    </div>
                  )}
                  <div style={{ marginTop: '.4rem' }}>
                    <FulfillmentBadge mode={event.fulfillmentMode} />
                  </div>
                </div>
              </div>

              {event.notes && (
                <div
                  style={{
                    padding: '1rem',
                    background: '#fffbeb',
                    borderRadius: '14px',
                    border: '1px solid #fde68a',
                  }}
                >
                  <strong
                    style={{
                      fontSize: '.85rem',
                      color: '#b45309',
                      display: 'block',
                      marginBottom: '.25rem',
                    }}
                  >
                    Consignes / Notes du dossier
                  </strong>
                  <p style={{ margin: 0, fontSize: '.84rem', color: '#78350f', lineHeight: 1.5 }}>
                    {event.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'prestations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {event.prestations.map((prestation) => (
                <div
                  key={prestation.id}
                  style={{
                    padding: '1.1rem',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '.5rem',
                    }}
                  >
                    <strong style={{ fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>
                      {prestation.name}
                    </strong>
                    <span
                      style={{
                        fontSize: '.82rem',
                        fontWeight: 850,
                        color: '#047857',
                        background: '#ecfdf5',
                        padding: '.25rem .65rem',
                        borderRadius: '8px',
                      }}
                    >
                      {prestation.expectedGuests} convives
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: '.8rem',
                      color: '#64748b',
                      display: 'flex',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      marginBottom: '.85rem',
                    }}
                  >
                    {prestation.readyAt && (
                      <span>
                        ⏱️ Prêt à : <strong>{dateLabel(prestation.readyAt)}</strong>
                      </span>
                    )}
                    {prestation.serviceAt && (
                      <span>
                        🍽️ Service à : <strong>{dateLabel(prestation.serviceAt)}</strong>
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    <div
                      style={{
                        fontSize: '.75rem',
                        fontWeight: 800,
                        color: '#64748b',
                        textTransform: 'uppercase',
                      }}
                    >
                      Composition du menu :
                    </div>
                    <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
                      {prestation.menu.items?.map((item, index) => (
                        <span
                          key={item.id ?? index}
                          style={{
                            background: '#f0fdf4',
                            color: '#047857',
                            padding: '.35rem .75rem',
                            borderRadius: '10px',
                            fontSize: '.82rem',
                            fontWeight: 750,
                            border: '1px solid #a7f3d0',
                          }}
                        >
                          {item.technicalSheet?.name ?? item.product?.name ?? 'Article'} ·{' '}
                          <strong>
                            {item.portionsOverride ??
                              Number(prestation.expectedGuests) *
                                Number(item.servingQuantity ?? 1)}{' '}
                            portions
                          </strong>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'recipes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              <div style={{ fontSize: '.85rem', color: '#64748b' }}>
                Liste consolidée de tous les articles et fiches techniques nécessaires pour cet
                événement traiteur :
              </div>
              <div style={{ overflowX: 'auto', borderRadius: '14px' }}>
                <table className="table-modern" style={{ width: '100%', minWidth: '650px' }}>
                  <thead>
                    <tr>
                      <th>Article / Fiche Technique</th>
                      <th>Total Portions Nécessaires</th>
                      <th>Prestations Concernées</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatedRecipes.map((recipe) => (
                      <tr key={recipe.id}>
                        <td>
                          <strong style={{ color: '#0f172a', fontSize: '.9rem' }}>
                            {recipe.name}
                          </strong>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '.95rem',
                              fontWeight: 850,
                              color: '#10b981',
                              background: '#ecfdf5',
                              padding: '.2rem .6rem',
                              borderRadius: '8px',
                            }}
                          >
                            {recipe.portions} portions
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                            {recipe.prestations.map((p) => (
                              <span
                                key={p}
                                style={{
                                  fontSize: '.75rem',
                                  background: '#f1f5f9',
                                  color: '#475569',
                                  padding: '.15rem .45rem',
                                  borderRadius: '6px',
                                }}
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'logistics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  padding: '1.1rem',
                  background: '#f8fafc',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <strong
                  style={{
                    fontSize: '.95rem',
                    color: '#0f172a',
                    display: 'block',
                    marginBottom: '.5rem',
                  }}
                >
                  Site de Production Attribué
                </strong>
                <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#10b981' }}>
                  {event.productionSite?.name ?? 'Site non attribué'}
                </div>
              </div>

              <div
                style={{
                  padding: '1.1rem',
                  background: '#f8fafc',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <strong
                  style={{
                    fontSize: '.95rem',
                    color: '#0f172a',
                    display: 'block',
                    marginBottom: '.5rem',
                  }}
                >
                  Consignes d'accès & Livraison
                </strong>
                <p style={{ margin: 0, fontSize: '.86rem', color: '#475569', lineHeight: 1.5 }}>
                  {event.accessNotes ||
                    'Aucune consigne d’accès spécifique mentionnée pour cette livraison.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER DES ACTIONS RAPIDES */}
        <div
          style={{
            padding: '1.1rem 1.6rem',
            borderTop: '1px solid #e2e8f0',
            background: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {event.status === 'CONFIRMED' && (
              <button
                type="button"
                className="production-btn-primary"
                onClick={() => {
                  onClose();
                  onGenerateProduction(event);
                }}
              >
                <ChefHat size={16} />
                {event.productionState === 'NOT_GENERATED' || event.productionState === 'DIRTY'
                  ? 'Planifier dans Fabrication'
                  : 'Voir les productions'}
              </button>
            )}

            {event.status === 'DRAFT' && (
              <button
                type="button"
                className="production-btn-primary"
                disabled={saving}
                onClick={() => onStatusChange(event, 'CONFIRMED')}
              >
                <CheckIcon size={16} /> Confirmer le dossier
              </button>
            )}

            <button
              type="button"
              style={calendarSecondaryButtonStyle}
              onClick={() => {
                onClose();
                onEdit(event);
              }}
            >
              <Pencil size={15} /> Modifier
            </button>
          </div>

          <button type="button" style={calendarSecondaryButtonStyle} onClick={onClose}>
            Fermer
          </button>
        </div>
      </motion.div>
    </div>
  );
}

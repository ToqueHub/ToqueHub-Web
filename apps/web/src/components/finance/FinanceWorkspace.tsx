import { activeLocale } from '../../i18n/runtime';
import { translateText } from '../../i18n/translate';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  Activity,
  BarChart3,
  BrainCircuit,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Database,
  Download,
  FileSpreadsheet,
  Gauge,
  LayoutDashboard,
  LineChart,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  WalletCards,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import type {
  FinanceAiAnalysis,
  FinanceBudgetSuggestion,
  FinanceBootstrap,
  FinanceDashboardMetric,
  FinanceDashboardPeriod,
  FinanceImportBatch,
  FinanceProvider,
  FinanceReportKind,
  FinanceSourceStatus,
  FinanceExportReport,
  FinanceSalesExportPeriod,
} from '../../types';
import './styles/FinanceApp.css';
import {
  clearFinanceSalesInsightsCache,
  FinanceSalesInsightsView,
  prefetchFinanceSalesInsights,
} from './FinanceSalesInsights';
import { FinanceOnboarding } from './onboarding/FinanceOnboarding';

export type FinanceTab =
  | 'cockpit'
  | 'sales'
  | 'annual'
  | 'monthly'
  | 'daily'
  | 'budget'
  | 'sources';

type Props = { token: string; tab: FinanceTab; onNavigate: (tab: FinanceTab) => void };
type HistoryMetricId = keyof FinanceDashboardPeriod['comparison']['periods'][number]['metrics'];

const ACCOUNTING_RESULT_KPI_IDS = new Set([
  'result_before_depreciation',
  'accounting_operating_result',
  'net_result',
]);

const HISTORY_METRICS: Array<{
  id: HistoryMetricId;
  label: string;
  unit: FinanceDashboardMetric['unit'];
}> = [
  { id: 'revenue', label: 'Chiffre d’affaires', unit: 'currency' },
  { id: 'operating_expenses', label: 'Charges d’exploitation', unit: 'currency' },
  { id: 'payroll', label: 'Masse salariale', unit: 'currency' },
  { id: 'operating_result', label: 'Résultat d’exploitation', unit: 'currency' },
  { id: 'transactions', label: 'Transactions', unit: 'number' },
  { id: 'average_ticket', label: 'Ticket moyen', unit: 'currency' },
  { id: 'contribution_margin', label: 'Marge contributive', unit: 'currency' },
  { id: 'contribution_margin_rate', label: 'Taux de marge', unit: 'percentage' },
];

const NAVIGATION = [
  ['cockpit', 'Tableau de bord', LayoutDashboard],
  ['sales', 'Ventes & affluence', Activity],
  ['annual', 'Annuel', BarChart3],
  ['monthly', 'Mensuel', CalendarDays],
  ['daily', 'Journalier', LineChart],
  ['budget', 'Budget', Target],
  ['sources', 'Sources', Database],
] as const;

const TITLES: Record<FinanceTab, string> = {
  cockpit: 'Situation financière',
  sales: 'Ventes & affluence',
  annual: 'Analyse annuelle',
  monthly: 'Analyse mensuelle',
  daily: 'Analyse journalière',
  budget: 'Budget & trajectoire',
  sources: 'Sources & qualité',
};

const FINANCE_LOADING_STEPS = [
  'Connexion sécurisée aux sources financières…',
  'Consolidation des établissements…',
  'Rapprochement des caisses et de la comptabilité…',
  'Calcul des indicateurs et des comparaisons…',
  'Contrôle de la fraîcheur des données…',
  'Finalisation de votre espace Finance…',
];

const PROVIDER_LABELS: Record<FinanceProvider, string> = {
  FENNOA: 'Fennoa',
  FLATPAY: 'FlatPay POS',
  PAYPAL_POS: 'PayPal POS',
  LOYVERSE: 'Loyverse',
  GENERIC: 'Import universel',
};

const REPORT_LABELS: Record<FinanceReportKind, string> = {
  SALES_ORDERS: 'Commandes / tickets',
  PRODUCT_SALES: 'Ventes par produit',
  DAILY_CLOSURE: 'Clôture journalière',
  RECEIPTS: 'Reçus de caisse',
  ACCOUNTING: 'Comptabilité',
  BUDGET: 'Budget',
  UNKNOWN: 'À identifier',
};

const FINANCE_WORKSPACE_CACHE_MS = 90_000;
const financeWorkspaceCache = new Map<
  string,
  { data: FinanceBootstrap; asOf: string; expiresAt: number }
>();
const financeBootstrapInflight = new Map<string, Promise<FinanceBootstrap>>();

function workspaceCacheKey(token: string, siteId?: string) {
  return `${token}:${siteId || 'all-sites'}`;
}

function cachedFinanceWorkspace(token: string, siteId?: string) {
  const key = workspaceCacheKey(token, siteId);
  const cached = financeWorkspaceCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    financeWorkspaceCache.delete(key);
    return null;
  }
  return cached;
}

function financeBootstrapFor(token: string, selectedDate?: string, siteId?: string) {
  const key = `${token}:${siteId || 'all-sites'}:${selectedDate || 'latest'}`;
  const existing = financeBootstrapInflight.get(key);
  if (existing) return existing;
  const request = api
    .financeBootstrap(token, 'fiscal_year', selectedDate || undefined, siteId)
    .finally(() => financeBootstrapInflight.delete(key));
  financeBootstrapInflight.set(key, request);
  return request;
}

export async function preloadFinanceWorkspace(token: string, siteId?: string) {
  const cached = cachedFinanceWorkspace(token, siteId);
  if (cached) return cached.data;
  const next = await financeBootstrapFor(token, undefined, siteId);
  const nextAsOf = next.dashboard.context.asOf.slice(0, 10);
  financeWorkspaceCache.set(workspaceCacheKey(token, siteId), {
    data: next,
    asOf: nextAsOf,
    expiresAt: Date.now() + FINANCE_WORKSPACE_CACHE_MS,
  });
  prefetchFinanceSalesInsights(token, nextAsOf, siteId);
  return next;
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return 'Non disponible';
  return new Intl.DateTimeFormat(activeLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: withTime ? 'Europe/Helsinki' : 'UTC',
  }).format(new Date(value));
}

function formatMonthLabel(value?: string | null, includeYear = false) {
  if (!value) return '';
  return new Intl.DateTimeFormat(activeLocale(), {
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatFinancePeriodTitle(period: FinanceDashboardPeriod) {
  if (period.kind === 'annual') {
    return new Intl.DateTimeFormat(activeLocale(), { year: 'numeric', timeZone: 'UTC' }).format(
      new Date(period.from),
    );
  }
  if (period.kind === 'monthly') return formatMonthLabel(period.from, true);
  return formatDate(period.from);
}

function formatCoverage(start?: string | null, end?: string | null) {
  if (!start) return 'Non disponible';
  if (!end) return `Depuis le ${formatDate(start)}`;
  const endDate = new Date(end);
  const today = new Date();
  endDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  if (endDate.getTime() > today.getTime()) {
    return `Du ${formatDate(start)} au ${formatDate(end)}`;
  }
  if (endDate.getTime() === today.getTime()) {
    return `Depuis le ${formatDate(start)} · à jour aujourd’hui`;
  }
  return `Depuis le ${formatDate(start)} · données au ${formatDate(end)}`;
}

function formatValue(value: number | null | undefined, unit: string, currency: string) {
  if (value == null) return '—';
  if (unit === 'percentage')
    return `${value.toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} %`;
  if (unit === 'currency')
    return new Intl.NumberFormat(activeLocale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  return value.toLocaleString(activeLocale(), { maximumFractionDigits: 1 });
}

function percentOfRevenue(value: number | null | undefined, revenue: number | null | undefined) {
  if (value == null || revenue == null || revenue === 0) return null;
  return (value / revenue) * 100;
}

function flatpayConnectionForSite(
  configuration: FinanceBootstrap['settings']['flatpay'],
  siteId?: string | null,
) {
  if (!configuration || !siteId) return null;
  return (
    configuration.connections?.find((connection) => connection.defaultSite?.id === siteId) ??
    (configuration.defaultSite?.id === siteId ? configuration : null)
  );
}

function posConnectionForSite(
  configuration: FinanceBootstrap['settings']['pos']['loyverse'],
  siteId?: string | null,
) {
  if (!siteId) return null;
  return (
    configuration.connections?.find((connection) => connection.defaultSite?.id === siteId) ??
    (configuration.defaultSite?.id === siteId ? configuration : null)
  );
}

export function FinanceWorkspace({ token, tab, onNavigate }: Props) {
  const initialCache = useRef(cachedFinanceWorkspace(token)).current;
  const initialCacheUsed = useRef(false);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [data, setData] = useState<FinanceBootstrap | null>(initialCache?.data ?? null);
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [asOf, setAsOf] = useState(initialCache?.asOf ?? '');
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [sourceBusy, setSourceBusy] = useState<string>();
  const [budgetImportOpen, setBudgetImportOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const onboardingHandled = useRef(false);

  const load = useCallback(
    async (silent = false, selectedDate?: string, siteId = selectedSiteId) => {
      silent ? setRefreshing(true) : setLoading(true);
      setError(undefined);
      try {
        const next = await financeBootstrapFor(token, selectedDate, siteId || undefined);
        if (
          !next.dashboard?.context ||
          !next.dashboard.annual ||
          !next.dashboard.monthly ||
          !next.dashboard.daily
        ) {
          throw new Error(
            'La réponse Finance est incomplète. Redémarrez l’API ToqueHub après la mise à jour.',
          );
        }
        setData(next);
        const nextAsOf = selectedDate || next.dashboard.context.asOf.slice(0, 10);
        if (!selectedDate) setAsOf(nextAsOf);
        financeWorkspaceCache.set(workspaceCacheKey(token, siteId), {
          data: next,
          asOf: nextAsOf,
          expiresAt: Date.now() + FINANCE_WORKSPACE_CACHE_MS,
        });
        prefetchFinanceSalesInsights(token, nextAsOf, siteId || undefined);
      } catch (nextError) {
        setError(messageOf(nextError, 'Impossible de charger le module Finance.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedSiteId, token],
  );

  useEffect(() => {
    if (initialCache && !initialCacheUsed.current) {
      initialCacheUsed.current = true;
      prefetchFinanceSalesInsights(token, initialCache.asOf, selectedSiteId || undefined);
      return;
    }
    void load();
  }, [initialCache, load, selectedSiteId, token]);

  useEffect(() => {
    if (!data || onboardingHandled.current) return;
    onboardingHandled.current = true;
    const canManage = data.permissions.includes('finance.manage');
    const hasConfiguredSource = Boolean(
      data.settings.fennoa?.apiKeyConfigured ||
      data.settings.flatpay?.configured ||
      data.settings.flatpay?.connections?.some(({ configured }) => configured) ||
      data.settings.pos.loyverse.configured ||
      data.settings.pos.loyverse.connections?.some(({ configured }) => configured) ||
      data.settings.pos.paypalPos.configured ||
      data.settings.pos.paypalPos.connections?.some(({ configured }) => configured),
    );
    const completedKey = `finance:onboarding-completed:${data.organizationId}`;
    const dismissedKey = `finance:onboarding-dismissed:${data.organizationId}`;
    setOnboardingOpen(
      canManage &&
        !hasConfiguredSource &&
        localStorage.getItem(completedKey) !== '1' &&
        sessionStorage.getItem(dismissedKey) !== '1',
    );
  }, [data]);

  const importFiles = async (files: File[], siteId?: string) => {
    if (!files.length) return false;
    setUploading(true);
    setError(undefined);
    setSuccess(undefined);
    let imported = 0;
    let duplicates = 0;
    try {
      for (const file of files) {
        const result = await api.importFinanceFile(token, file, siteId);
        result.duplicate ? (duplicates += 1) : (imported += 1);
      }
      clearFinanceSalesInsightsCache();
      await load(true);
      setSuccess(
        [
          imported ? `${imported} fichier(s) ajouté(s)` : '',
          duplicates ? `${duplicates} doublon(s) contrôlé(s)` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
      return true;
    } catch (nextError) {
      setError(messageOf(nextError, 'L’import Finance a échoué.'));
      return false;
    } finally {
      setUploading(false);
    }
  };

  const setSalesInclusion = async (sourceId: string, enabled: boolean) => {
    setSourceBusy(sourceId);
    try {
      await api.setFinanceSalesSourceInclusion(token, sourceId, enabled);
      clearFinanceSalesInsightsCache();
      await load(true, asOf);
      setSuccess(
        enabled
          ? 'Source ajoutée au chiffre d’affaires consolidé.'
          : 'Source retirée du chiffre d’affaires consolidé.',
      );
    } catch (nextError) {
      setError(messageOf(nextError, 'Impossible de modifier la consolidation de cette source.'));
    } finally {
      setSourceBusy(undefined);
    }
  };

  const setPrimaryPos = async (sourceId: string) => {
    setSourceBusy(sourceId);
    setError(undefined);
    try {
      await api.setFinancePrimaryPosSource(token, sourceId);
      clearFinanceSalesInsightsCache();
      await load(true, asOf);
      setSuccess('POS principal mis à jour. Le chiffre d’affaires du jour utilisera cette source.');
    } catch (nextError) {
      setError(messageOf(nextError, 'Impossible de définir ce POS comme source principale.'));
    } finally {
      setSourceBusy(undefined);
    }
  };

  const syncFennoa = async () => {
    setSourceBusy('fennoa');
    setError(undefined);
    try {
      const result = await api.syncFennoa(token);
      await load(true);
      setSuccess(
        `Fennoa synchronisé${result.full ? ' · historique complet' : ''} · ${result.periodsSyncedCount ?? 1} exercice(s) · ${result.ledgerRowsCount ?? 0} écriture(s) · ${result.budgetRowsCount ?? 0} ligne(s) de budget · ${result.customersCount ?? 0} client(s) · ${result.salesInvoicesCount ?? 0} facture(s).`,
      );
      if (result.warnings?.length) {
        setError(
          `La comptabilité a été synchronisée, mais certaines données commerciales n’ont pas pu être lues : ${result.warnings.join(' · ')}`,
        );
      }
    } catch (nextError) {
      setError(messageOf(nextError, 'La synchronisation Fennoa a échoué.'));
    } finally {
      setSourceBusy(undefined);
    }
  };

  const savePreferences = async (ids: string[]) => {
    try {
      await api.updateFinancePreferences(token, ids);
      await load(true, asOf);
      setSuccess('Indicateurs personnalisés enregistrés.');
    } catch (nextError) {
      setError(messageOf(nextError, 'Impossible d’enregistrer les indicateurs.'));
    }
  };

  const assignBudgetSite = async (budgetId: string, siteId: string) => {
    setRefreshing(true);
    setError(undefined);
    try {
      await api.mapFinanceBudgetSite(token, budgetId, siteId);
      financeWorkspaceCache.clear();
      await load(true, asOf, selectedSiteId);
      const site = data?.sites.find(({ id }) => id === siteId);
      setSuccess(`Budget attribué à ${site?.name ?? 'l’établissement sélectionné'}.`);
    } catch (nextError) {
      setError(messageOf(nextError, 'Impossible d’attribuer ce budget à l’établissement.'));
    } finally {
      setRefreshing(false);
    }
  };

  const selectBudgetReference = async (budgetId: string) => {
    setRefreshing(true);
    setError(undefined);
    try {
      const result = await api.selectFinanceBudgetReference(token, {
        budgetId,
        asOf,
        ...(selectedSiteId ? { siteId: selectedSiteId } : {}),
      });
      financeWorkspaceCache.clear();
      await load(true, asOf, selectedSiteId);
      setSuccess(`${result.name} est maintenant le budget de référence de cet exercice.`);
    } catch (nextError) {
      setError(messageOf(nextError, 'Impossible de sélectionner ce budget.'));
    } finally {
      setRefreshing(false);
    }
  };

  if (loading && !data) return <FinanceLoadingState tab={tab} />;
  const currency = data?.settings.defaultCurrency ?? 'EUR';

  return (
    <div className="finance-app">
      <motion.section
        className="welcome-hero stocks-hero hr-hero finance-hero"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="finance-hero-copy">
          <span className="welcome-tag">
            <WalletCards size={14} /> ToqueHub Finance
          </span>
          <h1 className="welcome-title">{TITLES[tab]}</h1>
          <p className="welcome-desc">
            Une lecture simple pour décider, avec le détail nécessaire pour contrôler chaque
            chiffre.
          </p>
        </div>
        <div className="finance-hero-actions">
          {data?.permissions.includes('finance.manage') ? (
            <button
              type="button"
              className="btn btn-secondary finance-onboarding-trigger"
              onClick={() => setOnboardingOpen(true)}
            >
              <Sparkles size={16} /> Guide de configuration
            </button>
          ) : null}
          <label className="finance-period-control">
            <span>Établissement</span>
            <select
              value={selectedSiteId}
              onChange={(event) => {
                clearFinanceSalesInsightsCache();
                setSelectedSiteId(event.target.value);
              }}
            >
              <option value="">Tous les établissements</option>
              {data?.sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary finance-budget-import-trigger"
            onClick={() => setBudgetImportOpen(true)}
          >
            <UploadCloud size={17} /> Importer un budget
          </button>
          <label className="finance-period-control">
            <span>Situation au</span>
            <input
              type="date"
              value={asOf}
              onChange={(event) => {
                const nextDate = event.target.value;
                if (!nextDate) return;
                setAsOf(nextDate);
                void load(true, nextDate);
              }}
            />
          </label>
          <button
            className="finance-refresh"
            aria-label="Actualiser"
            disabled={refreshing}
            onClick={() => {
              clearFinanceSalesInsightsCache();
              void load(true, asOf);
            }}
          >
            <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </motion.section>

      {onboardingOpen && data ? (
        <FinanceOnboarding
          token={token}
          data={data}
          onChanged={() => load(true, asOf)}
          onClose={() => {
            sessionStorage.setItem(`finance:onboarding-dismissed:${data.organizationId}`, '1');
            setOnboardingOpen(false);
          }}
          onComplete={async () => {
            localStorage.setItem(`finance:onboarding-completed:${data.organizationId}`, '1');
            sessionStorage.removeItem(`finance:onboarding-dismissed:${data.organizationId}`);
            await load(true, asOf);
            setOnboardingOpen(false);
            onNavigate('cockpit');
          }}
        />
      ) : null}

      <nav className="hr-tabs stocks-module-tabs finance-tabs" aria-label="Navigation Finance">
        {NAVIGATION.map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => onNavigate(id)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>
      {data?.scope.mode === 'site' && (
        <div className="alert-modern info finance-scope-notice">
          <Building2 size={18} />
          <span>
            <strong>{data.scope.site?.name}</strong> · {data.scope.note}
          </span>
        </div>
      )}
      {error && (
        <div className="alert-modern error dismissible">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button className="icon-btn" onClick={() => setError(undefined)}>
            <X size={16} />
          </button>
        </div>
      )}
      {success && (
        <div className="alert-modern success dismissible">
          <CheckCircle2 size={18} />
          <span>{success}</span>
          <button className="icon-btn" onClick={() => setSuccess(undefined)}>
            <X size={16} />
          </button>
        </div>
      )}

      {data && tab === 'cockpit' && (
        <Cockpit
          token={token}
          data={data}
          currency={currency}
          siteId={selectedSiteId || undefined}
          onNavigate={onNavigate}
        />
      )}
      {data && tab === 'sales' && (
        <FinanceSalesInsightsView
          token={token}
          currency={currency}
          asOf={asOf}
          siteId={selectedSiteId || undefined}
        />
      )}
      {data && tab === 'annual' && (
        <PeriodView
          token={token}
          data={data}
          period={data.dashboard.annual}
          currency={currency}
          siteId={selectedSiteId || undefined}
          onSavePreferences={savePreferences}
        />
      )}
      {data && tab === 'monthly' && (
        <PeriodView
          token={token}
          data={data}
          period={data.dashboard.monthly}
          currency={currency}
          siteId={selectedSiteId || undefined}
          onSavePreferences={savePreferences}
        />
      )}
      {data && tab === 'daily' && (
        <PeriodView
          token={token}
          data={data}
          period={data.dashboard.daily}
          currency={currency}
          siteId={selectedSiteId || undefined}
          onSavePreferences={savePreferences}
        />
      )}
      {data && tab === 'budget' && (
        <BudgetView
          data={data}
          currency={currency}
          onImport={() => setBudgetImportOpen(true)}
          onSelectReference={(budgetId) => void selectBudgetReference(budgetId)}
          onAssignSite={(budgetId, siteId) => void assignBudgetSite(budgetId, siteId)}
        />
      )}
      {data && tab === 'sources' && (
        <SourcesView
          token={token}
          data={data}
          uploading={uploading}
          sourceBusy={sourceBusy}
          onFiles={importFiles}
          onSetSalesInclusion={(id, enabled) => void setSalesInclusion(id, enabled)}
          onSetPrimaryPos={(id) => void setPrimaryPos(id)}
          onSyncFennoa={() => void syncFennoa()}
          onReload={() => void load(true, asOf)}
          asOf={asOf}
          selectedSiteId={selectedSiteId || undefined}
        />
      )}
      {data && budgetImportOpen ? (
        <BudgetImportModal
          token={token}
          data={data}
          asOf={asOf}
          initialSiteId={selectedSiteId || data.sites[0]?.id}
          uploading={uploading}
          onClose={() => setBudgetImportOpen(false)}
          onManualImport={async (files, siteId) => {
            if (await importFiles(files, siteId)) setBudgetImportOpen(false);
          }}
          onAccepted={async (name) => {
            financeWorkspaceCache.clear();
            await load(true, asOf, selectedSiteId);
            setBudgetImportOpen(false);
            setSuccess(`${name} a été enregistré et sélectionné comme budget de référence.`);
          }}
        />
      ) : null}
    </div>
  );
}

function FinanceLoadingState({ tab }: { tab: FinanceTab }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = globalThis.setInterval(() => {
      setStepIndex((current) =>
        current < FINANCE_LOADING_STEPS.length - 1 ? current + 1 : current,
      );
    }, 900);
    return () => globalThis.clearInterval(interval);
  }, []);

  const progressPercent = Math.min(((stepIndex + 1) / FINANCE_LOADING_STEPS.length) * 100, 100);

  return (
    <div
      className="cockpit-loading-shell finance-initial-loading"
      aria-busy="true"
      aria-live="polite"
      aria-label={`Chargement de ${TITLES[tab]}`}
    >
      <div className="cockpit-loading-skeleton-bg">
        <div className="skeleton-header" />
        <div className="skeleton-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton-card" key={index} />
          ))}
        </div>
      </div>

      <div className="cockpit-loading-card-centered">
        <div className="cockpit-loader-spinner-wrapper">
          <div className="cockpit-minimal-spinner" />
          <div className="cockpit-loader-icon">
            <WalletCards size={32} className="chef-hat-pulse" />
          </div>
        </div>

        <div className="cockpit-loading-info">
          <div className="cockpit-brand-badge">
            <Sparkles size={12} />
            <span>ToqueHub Finance</span>
          </div>
          <h2 className="cockpit-loading-title">
            Préparation de votre analyse
            <span className="dot-flashing" />
          </h2>
          <div className="cockpit-step-wrapper">
            <AnimatePresence mode="wait">
              <motion.span
                key={stepIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="cockpit-current-step"
              >
                {FINANCE_LOADING_STEPS[stepIndex]}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="cockpit-progress-container" aria-hidden="true">
            <div className="cockpit-progress-bar" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Cockpit({
  token,
  data,
  currency,
  siteId,
  onNavigate,
}: {
  token: string;
  data: FinanceBootstrap;
  currency: string;
  siteId?: string;
  onNavigate: (tab: FinanceTab) => void;
}) {
  const context = data.dashboard.context;
  return (
    <motion.div
      className="finance-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <HealthBanner data={data} />
      <section className="finance-context-strip">
        <div>
          <span>Exercice</span>
          <strong>
            {formatDate(context.fiscalStart)} → {formatDate(context.fiscalEnd)}
          </strong>
        </div>
        <div>
          <span>Période comparée</span>
          <strong>
            {context.elapsedMonths}/{context.totalMonths} mois
          </strong>
        </div>
        <div>
          <span>Réalisé</span>
          <strong>{context.actualCoverageLabel}</strong>
        </div>
        <div>
          <span>Budget</span>
          <strong>{data.dashboard.budget?.name ?? 'À importer'}</strong>
        </div>
      </section>
      <section className="finance-period-overview-grid">
        {(['annual', 'monthly', 'daily'] as const).map((kind) => {
          const period = data.dashboard[kind];
          const revenue = period.core.find(({ id }) => id === 'revenue');
          const result = [...period.core, ...period.optional].find(
            ({ id }) => id === 'accounting_operating_result',
          );
          const labels = { annual: 'Annuel', monthly: 'Mensuel', daily: 'Journalier' };
          return (
            <article className="finance-period-overview" key={kind}>
              <header>
                <span>{labels[kind]}</span>
                <small>{period.label}</small>
              </header>
              <div>
                <p>Chiffre d’affaires</p>
                <strong>{formatValue(revenue?.value, 'currency', currency)}</strong>
                <RevenuePercentBadge value={revenue?.revenuePercent} />
                <Variance metric={revenue} currency={currency} />
              </div>
              <div>
                <p>Résultat d’exploitation comptable</p>
                <strong>{formatValue(result?.value, 'currency', currency)}</strong>
                <RevenuePercentBadge value={result?.revenuePercent} />
                <Variance metric={result} currency={currency} />
              </div>
              <button onClick={() => onNavigate(kind)}>
                Voir l’analyse <ChevronRight size={16} />
              </button>
            </article>
          );
        })}
      </section>
      <section className="finance-panel">
        <PanelHeader
          title="Trajectoire de l’exercice"
          subtitle="Réalisé cumulé comparé au budget cumulé des mêmes mois"
          icon={LineChart}
        />
        <ComparisonChart series={data.dashboard.annual.series} currency={currency} />
      </section>
      <MistralPanel
        token={data.dashboard.mistral.configured ? token : undefined}
        view="annual"
        siteId={siteId}
      />
    </motion.div>
  );
}

function HealthBanner({ data }: { data: FinanceBootstrap }) {
  const health = data.dashboard.health;
  return (
    <section className={`finance-health-banner ${health.level}`}>
      <span>
        {health.level === 'good' ? (
          <CheckCircle2 size={24} />
        ) : health.level === 'unknown' ? (
          <Database size={24} />
        ) : (
          <AlertTriangle size={24} />
        )}
      </span>
      <div>
        <strong>{health.label}</strong>
        <p>{health.summary}</p>
      </div>
      <small>{data.dashboard.context.budgetCoverageLabel}</small>
    </section>
  );
}

function PeriodView({
  token,
  data,
  period,
  currency,
  siteId,
  onSavePreferences,
}: {
  token: string;
  data: FinanceBootstrap;
  period: FinanceDashboardPeriod;
  currency: string;
  siteId?: string;
  onSavePreferences: (ids: string[]) => Promise<void>;
}) {
  const [customizing, setCustomizing] = useState(false);
  const [selected, setSelected] = useState(data.dashboard.preferences.selected);
  const [historyMetrics, setHistoryMetrics] = useState<HistoryMetricId[]>([
    'revenue',
    'operating_result',
  ]);
  const optionalById = new Map(period.optional.map((metric) => [metric.id, metric]));
  const availableOptions = data.dashboard.preferences.available.filter(({ id }) =>
    optionalById.has(id),
  );
  const resultKpis = period.optional.filter(
    ({ id, displayable }) =>
      ACCOUNTING_RESULT_KPI_IDS.has(id) && selected.includes(id) && displayable,
  );
  const optional = period.optional.filter(
    ({ id, displayable }) =>
      !ACCOUNTING_RESULT_KPI_IDS.has(id) && selected.includes(id) && displayable,
  );
  const reconciliation = data.dashboard.reconciliation[period.kind];
  const periodExplanation =
    period.kind === 'annual'
      ? `Réalisé du ${formatDate(period.from)} au ${formatDate(period.to)} · ${data.dashboard.context.budgetCoverageLabel}.`
      : period.kind === 'monthly'
        ? `Réalisé du ${formatDate(period.from)} au ${formatDate(period.to)} · objectif budgétaire du mois complet.`
        : `Journée du ${formatDate(period.from)} · objectif budgétaire journalier.`;
  useEffect(
    () => setSelected(data.dashboard.preferences.selected),
    [data.dashboard.preferences.selected],
  );
  return (
    <motion.div
      className="finance-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <section className="finance-period-title">
        <div>
          <span>
            {period.status === 'provisional' ? 'Données provisoires' : 'Période consolidée'}
          </span>
          <h2>{formatFinancePeriodTitle(period)}</h2>
          <p>{periodExplanation}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setCustomizing((value) => !value)}>
          <Settings2 size={16} /> Personnaliser
        </button>
      </section>
      {customizing && (
        <section className="finance-panel finance-customizer">
          <PanelHeader
            title="Mes indicateurs"
            subtitle="Choisissez les KPI à afficher ; les données absentes ou incohérentes sont masquées automatiquement"
            icon={Settings2}
          />
          <div>
            {availableOptions.map((item) => {
              const metric = optionalById.get(item.id);
              const displayable = Boolean(metric?.displayable);
              return (
                <label key={item.id} className={displayable ? undefined : 'unavailable'}>
                  <input
                    type="checkbox"
                    checked={displayable && selected.includes(item.id)}
                    disabled={!displayable}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span>
                    <strong>{translateText(item.label)}</strong>
                    <small>
                      {displayable
                        ? translateText(item.help)
                        : translateText(metric?.availabilityReason || 'Donnée indisponible.')}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              void onSavePreferences(selected);
              setCustomizing(false);
            }}
          >
            Enregistrer ma vue
          </button>
        </section>
      )}
      <section className="finance-core-grid">
        {period.core.map((metric) => (
          <CoreMetricCard
            key={metric.id}
            metric={metric}
            currency={currency}
            showRevenuePercent={period.kind !== 'daily'}
          />
        ))}
      </section>
      {resultKpis.length > 0 && (
        <section className="finance-result-kpi-grid" aria-label="Résultats comptables">
          {resultKpis.map((metric) => (
            <CoreMetricCard
              key={metric.id}
              metric={metric}
              currency={currency}
              showRevenuePercent={period.kind !== 'daily'}
            />
          ))}
        </section>
      )}
      {optional.length > 0 && (
        <section className="finance-optional-grid">
          {optional.map((metric) => (
            <OptionalMetricCard
              key={metric.id}
              metric={metric}
              currency={currency}
              showRevenuePercent={period.kind !== 'daily'}
            />
          ))}
        </section>
      )}
      <RevenueReconciliationPanel
        reconciliation={reconciliation}
        lockedThrough={data.dashboard.reconciliation.lockedThrough}
        currency={currency}
      />
      <HistoricalComparisonPanel
        comparison={period.comparison}
        currency={currency}
        selected={historyMetrics}
        onChange={setHistoryMetrics}
      />
      <section className="finance-panel">
        <PanelHeader
          title={
            period.kind === 'annual'
              ? 'Réel vs budget par mois'
              : period.kind === 'monthly'
                ? 'Activité jour par jour'
                : 'Repère journalier'
          }
          subtitle="Survolez ou consultez le tableau pour retrouver la valeur exacte"
          icon={BarChart3}
        />
        {period.kind === 'annual' ? (
          <ComparisonChart series={period.series} currency={currency} />
        ) : (
          <DailyChart series={period.series} currency={currency} />
        )}
      </section>
      <PeriodTable period={period} currency={currency} />
      <MistralPanel
        token={data.dashboard.mistral.configured ? token : undefined}
        view={period.kind}
        siteId={siteId}
      />
    </motion.div>
  );
}

function RevenueReconciliationPanel({
  reconciliation,
  lockedThrough,
  currency,
}: {
  reconciliation: FinanceBootstrap['dashboard']['reconciliation']['annual'];
  lockedThrough: string | null;
  currency: string;
}) {
  const basisLabels = {
    cash_register: 'Caisses consolidées',
    accounting: 'Comptabilité · référence',
    mixed: 'Caisse + compléments comptables',
    unavailable: 'Données indisponibles',
  } as const;
  const statusLabels = {
    matched: 'Rapproché',
    attention: 'À rapprocher',
    partial: 'Comparaison partielle',
  } as const;
  const explanation =
    reconciliation.basis === 'cash_register'
      ? 'Le CA consolidé de toutes les caisses incluses est retenu. La comptabilité reste visible comme contrôle.'
      : reconciliation.basis === 'accounting'
        ? 'La période est couverte par la comptabilité : son CA devient la valeur de référence et contrôle les données de caisse.'
        : reconciliation.basis === 'mixed'
          ? 'Le CA courant combine les caisses dédupliquées et les écritures comptables disponibles ; chaque mois couvert est rapproché sur le total comptable.'
          : 'Aucune source ne fournit encore de chiffre d’affaires exploitable sur cette période.';
  const breakdownItems = [
    {
      label: 'Caisse temps réel retenue',
      value: reconciliation.breakdown.selectedCashRegisterRevenue,
    },
    {
      label: 'CA comptable de référence',
      value: reconciliation.breakdown.selectedAccountingRevenue,
    },
    {
      label: 'Factures clients ajoutées',
      value: reconciliation.breakdown.accountingInvoiceRevenue,
    },
    {
      label: 'Canaux manquants ajoutés',
      value: reconciliation.breakdown.accountingFallbackRevenue,
    },
  ].filter(({ value }) => Math.abs(value) >= 0.005);
  const pendingAccountingRevenue =
    reconciliation.breakdown.accountingAdjustmentRevenue +
    reconciliation.breakdown.accountingOtherRevenue;
  return (
    <section className="finance-panel finance-reconciliation">
      <div className="finance-reconciliation-heading">
        <PanelHeader
          title="Rapprochement caisse ↔ comptabilité"
          subtitle="Une seule valeur retenue, avec la source et l’écart toujours visibles"
          icon={Database}
        />
        <span className={`finance-reconciliation-status ${reconciliation.status}`}>
          {statusLabels[reconciliation.status]}
        </span>
      </div>
      <div className="finance-reconciliation-grid">
        <div>
          <span>CA caisse HT</span>
          <strong>{formatValue(reconciliation.cashRegisterRevenue, 'currency', currency)}</strong>
          <small>Toutes les caisses connectées incluses</small>
        </div>
        <div>
          <span>CA comptabilité</span>
          <strong>{formatValue(reconciliation.accountingRevenue, 'currency', currency)}</strong>
          <small>Écritures comptables disponibles</small>
        </div>
        <div>
          <span>Écart comptabilité − caisse</span>
          <strong>{formatValue(reconciliation.difference, 'currency', currency)}</strong>
          <small>
            {reconciliation.difference == null
              ? 'Comparaison indisponible'
              : 'Montant restant à rapprocher'}
          </small>
        </div>
        <div className="selected">
          <span>CA retenu</span>
          <strong>{formatValue(reconciliation.selectedRevenue, 'currency', currency)}</strong>
          <small>{basisLabels[reconciliation.basis]}</small>
        </div>
      </div>
      {breakdownItems.length > 0 && (
        <div className="finance-reconciliation-breakdown">
          <span className="finance-reconciliation-breakdown-title">Composition du CA retenu</span>
          <div>
            {breakdownItems.map((item) => (
              <span key={item.label}>
                <small>{translateText(item.label)}</small>
                <strong>{formatValue(item.value, 'currency', currency)}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="finance-reconciliation-note">
        <ShieldCheck size={16} />
        <span>
          {explanation}
          {lockedThrough
            ? ` La comptabilité est clôturée jusqu’au ${formatDate(lockedThrough)}.`
            : ''}
          {Math.abs(reconciliation.breakdown.accountingOverlappingRevenue) >= 0.005
            ? ` ${formatValue(reconciliation.breakdown.accountingOverlappingRevenue, 'currency', currency)} de synthèses comptables ne sont pas ajoutés car déjà couverts par la caisse.`
            : ''}
          {Math.abs(pendingAccountingRevenue) >= 0.005
            ? ` ${formatValue(pendingAccountingRevenue, 'currency', currency)} d’écritures de rapprochement ou non classées restent visibles pour contrôle, sans être ajoutées au CA.`
            : ''}
        </span>
      </p>
    </section>
  );
}

function HistoricalComparisonPanel({
  comparison,
  currency,
  selected,
  onChange,
}: {
  comparison: FinanceDashboardPeriod['comparison'];
  currency: string;
  selected: HistoryMetricId[];
  onChange: (metrics: HistoryMetricId[]) => void;
}) {
  const current = comparison.periods.find(({ isCurrent }) => isCurrent);
  const basisLabels = {
    cash_register: 'Caisses consolidées',
    accounting: 'Comptabilité',
    mixed: 'Caisses + comptabilité',
    unavailable: 'Sans donnée',
  } as const;
  const visibleMetrics = HISTORY_METRICS.filter(({ id }) => selected.includes(id));
  return (
    <section className="finance-panel finance-history">
      <PanelHeader
        title="Comparaisons historiques"
        subtitle={`${comparison.modeLabel} · activez un ou plusieurs indicateurs`}
        icon={LineChart}
      />
      <div className="finance-history-controls" role="group" aria-label="Indicateurs comparés">
        {HISTORY_METRICS.map((metric) => {
          const active = selected.includes(metric.id);
          return (
            <button
              type="button"
              className={active ? 'active' : ''}
              key={metric.id}
              aria-pressed={active}
              onClick={() =>
                onChange(
                  active
                    ? selected.length > 1
                      ? selected.filter((id) => id !== metric.id)
                      : selected
                    : [...selected, metric.id],
                )
              }
            >
              {active && <CheckCircle2 size={13} />}
              {metric.label}
            </button>
          );
        })}
      </div>
      <div className="finance-history-table">
        <div
          className="finance-history-row head"
          style={{
            gridTemplateColumns: `minmax(180px, 1.15fr) repeat(${comparison.periods.length}, minmax(135px, 1fr))`,
          }}
        >
          <span>Indicateur</span>
          {comparison.periods.map((period) => (
            <span key={period.id} className={period.isCurrent ? 'current' : ''}>
              <strong>{period.label}</strong>
              <small>{period.detail}</small>
            </span>
          ))}
        </div>
        {visibleMetrics.map((metric) => (
          <div
            className="finance-history-row"
            key={metric.id}
            style={{
              gridTemplateColumns: `minmax(180px, 1.15fr) repeat(${comparison.periods.length}, minmax(135px, 1fr))`,
            }}
          >
            <span className="metric-label">{metric.label}</span>
            {comparison.periods.map((period) => {
              const value = period.metrics[metric.id];
              const currentValue = current?.metrics[metric.id] ?? null;
              const delta =
                !period.isCurrent && value != null && currentValue != null && value !== 0
                  ? ((currentValue - value) / Math.abs(value)) * 100
                  : null;
              return (
                <span className={period.isCurrent ? 'current' : ''} key={period.id}>
                  <strong>{formatValue(value, metric.unit, currency)}</strong>
                  <small>
                    {period.isCurrent
                      ? basisLabels[period.sources[metric.id]]
                      : delta == null
                        ? 'Comparaison indisponible'
                        : `Actuel ${delta > 0 ? '+' : ''}${delta.toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} %`}
                  </small>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="finance-history-note">
        Les mois sont alignés sur le même nombre de jours. Les comparaisons journalières utilisent
        le même jour de semaine, plus pertinent pour un café que la seule date du calendrier.
      </p>
    </section>
  );
}

function CoreMetricCard({
  metric,
  currency,
  showRevenuePercent = true,
}: {
  metric: FinanceDashboardMetric;
  currency: string;
  showRevenuePercent?: boolean;
}) {
  return (
    <article
      className={`finance-core-card ${metric.favorable == null ? '' : metric.favorable ? 'good' : 'bad'}`}
    >
      <header>
        <span>{metric.label}</span>
        <small>
          {metric.status === 'unavailable'
            ? 'Non disponible'
            : metric.status === 'provisional'
              ? 'Provisoire'
              : 'Consolidé'}
        </small>
      </header>
      <strong>{formatValue(metric.value, metric.unit, currency)}</strong>
      {showRevenuePercent ? <RevenuePercentBadge value={metric.revenuePercent} /> : null}
      <dl>
        <div>
          <dt>Budget période</dt>
          <dd>{formatValue(metric.budget, metric.unit, currency)}</dd>
        </div>
        <div>
          <dt>Écart</dt>
          <dd>
            <Variance metric={metric} currency={currency} />
          </dd>
        </div>
        <div>
          <dt>Même période N-1</dt>
          <dd>{formatValue(metric.previous, metric.unit, currency)}</dd>
        </div>
      </dl>
      <p>{metric.help}</p>
    </article>
  );
}

function OptionalMetricCard({
  metric,
  currency,
  showRevenuePercent = true,
}: {
  metric: FinanceDashboardMetric;
  currency: string;
  showRevenuePercent?: boolean;
}) {
  return (
    <article className="finance-optional-card">
      <span>
        <Gauge size={17} />
      </span>
      <div>
        <small>{metric.label}</small>
        <strong>{formatValue(metric.value, metric.unit, currency)}</strong>
        {showRevenuePercent ? <RevenuePercentBadge value={metric.revenuePercent} /> : null}
        {metric.targetLabel && (
          <span className="finance-metric-primary-label">{metric.targetLabel}</span>
        )}
        {metric.actualLabel && (
          <dl className="finance-metric-comparison">
            <div>
              <dt>{metric.actualLabel}</dt>
              <dd>{formatValue(metric.actualValue, metric.unit, currency)}</dd>
            </div>
            {metric.actualValue != null && metric.value != null && (
              <div>
                <dt>Écart</dt>
                <dd className={metric.favorable ? 'positive' : 'negative'}>
                  {metric.variance != null && metric.variance > 0 ? '+' : ''}
                  {formatValue(metric.variance, metric.unit, currency)}
                  {metric.variancePercent == null
                    ? ''
                    : ` (${metric.variancePercent > 0 ? '+' : ''}${metric.variancePercent} %)`}
                </dd>
              </div>
            )}
          </dl>
        )}
        <p>{metric.help}</p>
      </div>
    </article>
  );
}

function RevenuePercentBadge({ value }: { value?: number | null }) {
  if (value == null || !Number.isFinite(value)) return null;
  return (
    <span className={`finance-revenue-percent ${value < 0 ? 'negative' : ''}`}>
      {formatValue(value, 'percentage', 'EUR')} du CA
    </span>
  );
}

function Variance({ metric, currency }: { metric?: FinanceDashboardMetric; currency: string }) {
  if (!metric || metric.variance == null)
    return <span className="finance-variance neutral">Budget indisponible</span>;
  return (
    <span className={`finance-variance ${metric.favorable ? 'positive' : 'negative'}`}>
      {metric.variance > 0 ? '+' : ''}
      {formatValue(metric.variance, metric.unit, currency)}{' '}
      {metric.variancePercent == null
        ? ''
        : `(${metric.variancePercent > 0 ? '+' : ''}${metric.variancePercent} %)`}
    </span>
  );
}

function buildMoneyAxis(values: Array<number | null | undefined>) {
  const observedMax = Math.max(...values.map((value) => Math.abs(value ?? 0)), 0);
  const target = observedMax || 100;
  const desiredStep = target / 4;
  const magnitude = 10 ** Math.floor(Math.log10(desiredStep));
  const normalizedStep = desiredStep / magnitude;
  const stepFactor = [1, 2, 2.5, 5, 10].reduce(
    (selected, candidate) => (candidate <= normalizedStep ? candidate : selected),
    1,
  );
  const step = stepFactor * magnitude;
  const axisMax = Math.ceil(target / step) * step;
  return {
    axisMax,
    ticks: Array.from({ length: Math.round(axisMax / step) }, (_, index) =>
      Number(((index + 1) * step).toPrecision(12)),
    ),
  };
}

function ComparisonChart({
  series,
  currency,
}: {
  series: FinanceDashboardPeriod['series'];
  currency: string;
}) {
  const visible = series.filter(
    ({ budgetRevenue, actualRevenue }) => budgetRevenue != null || actualRevenue != null,
  );
  const { axisMax, ticks } = buildMoneyAxis(
    visible.flatMap(
      ({ cumulativeActualRevenue, cumulativeBudgetRevenue, actualRevenue, budgetRevenue }) => [
        cumulativeActualRevenue ?? actualRevenue,
        cumulativeBudgetRevenue ?? budgetRevenue,
      ],
    ),
  );
  if (!visible.length)
    return (
      <EmptyState
        title="Budget ou réalisé manquant"
        text="Importez le budget et connectez une source de ventes pour tracer la trajectoire."
      />
    );
  return (
    <div className="finance-money-axis-chart finance-comparison-axis-chart">
      <div className="finance-money-y-axis" aria-hidden="true">
        <div>
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / axisMax) * 100}%` }}>
              {formatValue(tick, 'currency', currency)}
            </span>
          ))}
        </div>
      </div>
      <div className="finance-money-plot">
        <div className="finance-money-gridlines" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / axisMax) * 100}%` }} />
          ))}
        </div>
        <div className="finance-comparison-chart">
          {visible.map((item) => {
            const actual = item.cumulativeActualRevenue ?? item.actualRevenue ?? 0;
            const budget = item.cumulativeBudgetRevenue ?? item.budgetRevenue ?? 0;
            return (
              <div className="finance-comparison-column" key={item.periodStart ?? item.label}>
                <div>
                  <span
                    className="actual"
                    style={{ height: `${Math.max(2, (Math.abs(actual) / axisMax) * 100)}%` }}
                    title={`Réalisé ${formatValue(actual, 'currency', currency)}`}
                  />
                  <span
                    className="budget"
                    style={{ height: `${Math.max(2, (Math.abs(budget) / axisMax) * 100)}%` }}
                    title={`Budget ${formatValue(budget, 'currency', currency)}`}
                  />
                </div>
                <small>
                  {item.periodStart
                    ? formatMonthLabel(item.periodStart)
                    : translateText(item.label ?? '')}
                </small>
              </div>
            );
          })}
          <div className="finance-chart-legend">
            <span>
              <i className="actual" /> Réalisé cumulé
            </span>
            <span>
              <i className="budget" /> Budget cumulé
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DailyChart({
  series,
  currency,
}: {
  series: FinanceDashboardPeriod['series'];
  currency: string;
}) {
  const visible = series.filter(({ date }) => date);
  const { axisMax, ticks } = buildMoneyAxis(visible.map(({ revenue }) => revenue));
  if (!visible.length)
    return (
      <EmptyState
        title="Aucune vente journalière"
        text="Le graphique apparaîtra après import d’un rapport de caisse pour ce mois."
      />
    );
  return (
    <div className="finance-money-axis-chart finance-activity-axis-chart">
      <div className="finance-money-y-axis" aria-hidden="true">
        <div>
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / axisMax) * 100}%` }}>
              {formatValue(tick, 'currency', currency)}
            </span>
          ))}
        </div>
      </div>
      <div className="finance-money-plot">
        <div className="finance-money-gridlines" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / axisMax) * 100}%` }} />
          ))}
        </div>
        <div className="finance-activity-chart">
          {visible.map((item) => (
            <div
              className="finance-activity-column"
              key={item.date}
              title={`${formatDate(item.date)} · ${formatValue(item.revenue, 'currency', currency)}`}
            >
              <div className="finance-activity-bar-track">
                <span
                  style={{
                    height: `${Math.max(2, (Math.abs(item.revenue ?? 0) / axisMax) * 100)}%`,
                  }}
                />
              </div>
              <small>{new Date(item.date!).getUTCDate()}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PeriodTable({ period, currency }: { period: FinanceDashboardPeriod; currency: string }) {
  if (period.kind === 'daily') return null;
  return (
    <section className="finance-panel">
      <PanelHeader
        title="Détail contrôlable"
        subtitle={
          period.kind === 'annual'
            ? 'Chaque mois, son budget et son écart'
            : 'Chaque journée disponible dans la caisse'
        }
        icon={FileSpreadsheet}
      />
      <div className="finance-data-table">
        <div className="head">
          <span>Période</span>
          <span>Réalisé CA</span>
          <span>Budget CA</span>
          <span>Écart</span>
          <span>Résultat</span>
        </div>
        {period.series.map((item) => {
          const actual = item.actualRevenue ?? item.revenue ?? null;
          const budget = item.budgetRevenue ?? null;
          return (
            <div key={item.periodStart ?? item.date}>
              <span>
                {item.periodStart
                  ? formatMonthLabel(item.periodStart, period.kind === 'annual')
                  : item.label
                    ? translateText(item.label)
                    : formatDate(item.date)}
              </span>
              <span>{formatValue(actual, 'currency', currency)}</span>
              <span>{formatValue(budget, 'currency', currency)}</span>
              <span>
                {actual == null || budget == null
                  ? '—'
                  : formatValue(actual - budget, 'currency', currency)}
              </span>
              <span>{formatValue(item.actualResult, 'currency', currency)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BudgetView({
  data,
  currency,
  onImport,
  onSelectReference,
  onAssignSite,
}: {
  data: FinanceBootstrap;
  currency: string;
  onImport: () => void;
  onSelectReference: (budgetId: string) => void;
  onAssignSite: (budgetId: string, siteId: string) => void;
}) {
  const budget = data.dashboard.budget;
  const isFennoaBudget = budget?.source === 'FENNOA';
  const defaultOpeningDays = budget?.targets?.days ?? 31;
  const [openingDays, setOpeningDays] = useState(defaultOpeningDays);
  useEffect(
    () => setOpeningDays(defaultOpeningDays),
    [defaultOpeningDays, budget?.targets?.periodStart],
  );
  if (!budget)
    return (
      <motion.div className="finance-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <section className="finance-panel">
          <EmptyState
            title="Aucun budget de référence"
            text="Importez votre fichier budgétaire. ToqueHub reconnaît le budget mensuel et compare chaque mois au réel correspondant."
          />
          <button className="btn btn-primary finance-centered-action" onClick={onImport}>
            <UploadCloud size={16} /> Importer un budget
          </button>
        </section>
      </motion.div>
    );
  const totals = [
    ['revenue', 'Chiffre d’affaires'],
    ['operatingExpenses', 'Charges d’exploitation'],
    ['payroll', 'Masse salariale'],
    ['operatingResult', 'Résultat d’exploitation'],
    ['netResult', 'Résultat net'],
    ['breakEven', 'Seuil de rentabilité'],
  ] as const;
  const targetedNetMargin =
    budget.totals.netResult != null && budget.totals.revenue != null && budget.totals.revenue !== 0
      ? (budget.totals.netResult / budget.totals.revenue) * 100
      : null;
  const targets = budget.targets;
  const simulatedRevenueDay =
    targets?.revenueMonth == null ? null : targets.revenueMonth / openingDays;
  const simulatedBreakEvenDay =
    targets?.breakEvenMonth == null ? null : targets.breakEvenMonth / openingDays;
  const simulatedPointMortDay =
    targets?.revenueMonth != null && targets.revenueMonth > 0 && targets.breakEvenMonth != null
      ? Math.max(1, Math.ceil((targets.breakEvenMonth / targets.revenueMonth) * openingDays))
      : null;
  return (
    <motion.div
      className="finance-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <section className="finance-period-title">
        <div>
          <span>
            {isFennoaBudget
              ? 'Budget de référence · synchronisé depuis Fennoa'
              : `Budget de référence · scénario ${budget.scenario ?? 'non renseigné'}`}
          </span>
          <h2>{budget.name}</h2>
          <p>
            Du {formatDate(budget.startDate)} au {formatDate(budget.endDate)} · comparaison au réel
            mois par mois, sans division arbitraire par 12.
          </p>
        </div>
        <div className="finance-budget-reference-actions">
          {!isFennoaBudget ? (
            <label className="finance-budget-site-control">
              <Building2 size={16} />
              <select
                aria-label="Établissement du budget"
                value={budget.siteId ?? ''}
                onChange={(event) => onAssignSite(budget.id, event.target.value)}
              >
                <option value="" disabled>
                  Attribuer à un établissement
                </option>
                {data.sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <span className="finance-reference-badge">
            <ShieldCheck size={16} />{' '}
            {isFennoaBudget ? 'Fennoa · Référence active' : 'Référence active'}
          </span>
        </div>
      </section>
      <section className="finance-budget-choice-panel">
        <div className="finance-budget-choice-heading">
          <div>
            <span>Budgets disponibles pour cet exercice</span>
            <strong>
              {data.dashboard.budgetOptions.length} version
              {data.dashboard.budgetOptions.length > 1 ? 's' : ''}
            </strong>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onImport}>
            <Plus size={16} /> Ajouter un budget
          </button>
        </div>
        <div className="finance-budget-choice-grid">
          {data.dashboard.budgetOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`finance-budget-choice ${option.selected ? 'active' : ''}`}
              onClick={() => !option.selected && onSelectReference(option.id)}
            >
              <span>
                {option.source === 'FENNOA'
                  ? 'Fennoa'
                  : option.source === 'MISTRAL_SUGGESTION'
                    ? 'Mistral'
                    : 'Import manuel'}
              </span>
              <strong>{option.name}</strong>
              <small>
                CA {formatValue(option.totals.revenue, 'currency', currency)} · Résultat net{' '}
                {formatValue(option.totals.netResult, 'currency', currency)}
              </small>
              <em>{option.selected ? 'Référence utilisée' : 'Utiliser cette version'}</em>
            </button>
          ))}
        </div>
      </section>
      <section className="finance-optional-grid">
        {totals.map(([key, label]) => (
          <article className="finance-optional-card" key={key}>
            <span>
              <Target size={17} />
            </span>
            <div>
              <small>{label}</small>
              <div className="finance-budget-total-value">
                <strong>{formatValue(budget.totals[key], 'currency', currency)}</strong>
                {key === 'netResult' && targetedNetMargin != null && (
                  <span
                    className={`finance-budget-margin-badge ${
                      targetedNetMargin > 0
                        ? 'positive'
                        : targetedNetMargin < 0
                          ? 'negative'
                          : 'neutral'
                    }`}
                    title="Résultat net budgété divisé par le chiffre d’affaires budgété"
                  >
                    {formatValue(targetedNetMargin, 'percentage', currency)} du CA
                  </span>
                )}
              </div>
              <p>
                {key === 'netResult' && targetedNetMargin != null
                  ? 'Marge nette visée après l’ensemble des charges et impôts'
                  : 'Total sur les 12 mois budgétés'}
              </p>
            </div>
          </article>
        ))}
      </section>
      {targets && (
        <section className="finance-panel finance-budget-targets">
          <PanelHeader
            title={`Repères budgétaires · ${targets.label}`}
            subtitle={`Objectifs calculés à partir du mois réellement budgété · base transparente de ${targets.days} jours calendaires`}
            icon={Gauge}
          />
          <div className="finance-budget-target-grid">
            <article className="finance-budget-target-card objective">
              <header>
                <span>
                  <Target size={18} />
                </span>
                <div>
                  <strong>CA pour respecter l’objectif</strong>
                  <small>
                    Trajectoire visant un résultat d’exploitation de{' '}
                    {formatValue(targets.operatingResult, 'currency', currency)}
                  </small>
                </div>
              </header>
              <div className="finance-budget-target-values">
                <span>
                  <small>Par jour</small>
                  <strong>{formatValue(targets.revenueDay, 'currency', currency)}</strong>
                </span>
                <span>
                  <small>Par semaine</small>
                  <strong>{formatValue(targets.revenueWeek, 'currency', currency)}</strong>
                </span>
                <span>
                  <small>Sur le mois</small>
                  <strong>{formatValue(targets.revenueMonth, 'currency', currency)}</strong>
                </span>
              </div>
            </article>
            <article className="finance-budget-target-card threshold">
              <header>
                <span>
                  <CircleDollarSign size={18} />
                </span>
                <div>
                  <strong>Seuil sans perte</strong>
                  <small>CA minimum budgété pour couvrir les charges du mois</small>
                </div>
              </header>
              <div className="finance-budget-target-values">
                <span>
                  <small>Par jour</small>
                  <strong>{formatValue(targets.breakEvenDay, 'currency', currency)}</strong>
                </span>
                <span>
                  <small>Par semaine</small>
                  <strong>{formatValue(targets.breakEvenWeek, 'currency', currency)}</strong>
                </span>
                <span>
                  <small>Sur le mois</small>
                  <strong>{formatValue(targets.breakEvenMonth, 'currency', currency)}</strong>
                </span>
              </div>
              <footer>
                <CalendarDays size={16} />
                <span>
                  Point mort théorique :{' '}
                  <strong>
                    {targets.pointMortDate
                      ? formatDate(targets.pointMortDate)
                      : targets.pointMortDay != null
                        ? `après le ${targets.days}e jour — objectif mensuel insuffisant`
                        : 'non calculable'}
                  </strong>
                </span>
              </footer>
            </article>
          </div>
          <div className="finance-budget-opening-simulator">
            <div className="finance-budget-opening-heading">
              <div>
                <strong>Simulation selon les jours d’ouverture</strong>
                <small>
                  Le CA mensuel ne change pas : ToqueHub recalcule le rythme à tenir pendant les
                  seuls jours ouverts.
                </small>
              </div>
              <label>
                <span>Jours ouverts</span>
                <input
                  type="number"
                  min={1}
                  max={targets.days}
                  value={openingDays}
                  onChange={(event) =>
                    setOpeningDays(
                      Math.min(targets.days, Math.max(1, Number(event.target.value) || 1)),
                    )
                  }
                />
              </label>
            </div>
            <div className="finance-budget-opening-range">
              <input
                type="range"
                min={1}
                max={targets.days}
                value={openingDays}
                aria-label="Nombre de jours d’ouverture"
                onChange={(event) => setOpeningDays(Number(event.target.value))}
              />
              <span>1 jour</span>
              <output>{openingDays} jours d’ouverture</output>
              <span>{targets.days} jours</span>
            </div>
            <div className="finance-budget-target-grid finance-budget-simulated-grid">
              <article className="finance-budget-target-card objective">
                <header>
                  <span>
                    <Target size={18} />
                  </span>
                  <div>
                    <strong>CA pour respecter l’objectif</strong>
                    <small>Rythme recalculé sur {openingDays} jours d’ouverture</small>
                  </div>
                </header>
                <div className="finance-budget-target-values">
                  <span>
                    <small>Par jour ouvert</small>
                    <strong>{formatValue(simulatedRevenueDay, 'currency', currency)}</strong>
                  </span>
                  <span>
                    <small>Par semaine</small>
                    <strong>
                      {formatValue(
                        simulatedRevenueDay == null ? null : simulatedRevenueDay * 7,
                        'currency',
                        currency,
                      )}
                    </strong>
                  </span>
                  <span>
                    <small>Sur le mois</small>
                    <strong>{formatValue(targets.revenueMonth, 'currency', currency)}</strong>
                  </span>
                </div>
              </article>
              <article className="finance-budget-target-card threshold">
                <header>
                  <span>
                    <CircleDollarSign size={18} />
                  </span>
                  <div>
                    <strong>Seuil sans perte</strong>
                    <small>Rythme minimum sur {openingDays} jours d’ouverture</small>
                  </div>
                </header>
                <div className="finance-budget-target-values">
                  <span>
                    <small>Par jour ouvert</small>
                    <strong>{formatValue(simulatedBreakEvenDay, 'currency', currency)}</strong>
                  </span>
                  <span>
                    <small>Par semaine</small>
                    <strong>
                      {formatValue(
                        simulatedBreakEvenDay == null ? null : simulatedBreakEvenDay * 7,
                        'currency',
                        currency,
                      )}
                    </strong>
                  </span>
                  <span>
                    <small>Sur le mois</small>
                    <strong>{formatValue(targets.breakEvenMonth, 'currency', currency)}</strong>
                  </span>
                </div>
                <footer>
                  <CalendarDays size={16} />
                  <span>
                    Point mort simulé :{' '}
                    <strong>
                      {simulatedPointMortDay == null
                        ? 'non calculable'
                        : simulatedPointMortDay <= openingDays
                          ? `${simulatedPointMortDay}e jour d’ouverture`
                          : `après les ${openingDays} jours — objectif mensuel insuffisant`}
                    </strong>
                  </span>
                </footer>
              </article>
            </div>
          </div>
          <p className="finance-budget-target-note">
            Ces repères proviennent uniquement du budget. Les cartes Annuel et Mensuel restent des
            estimations opérationnelles fondées sur les charges et la marge réellement observées.
          </p>
        </section>
      )}
      <section className="finance-panel">
        <PanelHeader
          title="Budget mensuel"
          subtitle="Le cumul annuel additionne uniquement les mois déjà écoulés"
          icon={BarChart3}
        />
        <div className="finance-data-table">
          <div className="head">
            <span>Mois</span>
            <span>CA budget</span>
            <span>CA réalisé</span>
            <span>Résultat budget</span>
            <span>Résultat réalisé</span>
          </div>
          {budget.series.map((item) => (
            <div key={item.periodStart}>
              <span>
                {item.periodStart
                  ? formatMonthLabel(item.periodStart, true)
                  : translateText(item.label ?? '')}
              </span>
              <span>{formatValue(item.budgetRevenue, 'currency', currency)}</span>
              <span>{formatValue(item.actualRevenue, 'currency', currency)}</span>
              <span>{formatValue(item.budgetResult, 'currency', currency)}</span>
              <span>{formatValue(item.actualResult, 'currency', currency)}</span>
            </div>
          ))}
        </div>
      </section>
    </motion.div>
  );
}

function MistralPanel({
  token,
  view,
  siteId,
}: {
  token?: string;
  view: 'annual' | 'monthly' | 'daily';
  siteId?: string;
}) {
  const [analysis, setAnalysis] = useState<FinanceAiAnalysis>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!token)
    return (
      <section className="finance-panel finance-ai-panel">
        <PanelHeader
          title="Analyste Mistral"
          subtitle="Analyse de gestion à partir des agrégats vérifiés"
          icon={BrainCircuit}
        />
        <EmptyState
          title="Mistral n’est pas configuré"
          text="Ajoutez la clé dans Système → Clés API & IA pour obtenir forces, risques et actions prioritaires."
        />
      </section>
    );
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setAnalysis(await api.financeAiAnalysis(token, view, { siteId }));
    } catch (nextError) {
      setError(messageOf(nextError, 'Analyse Mistral indisponible.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="finance-panel finance-ai-panel">
      <div className="finance-ai-heading">
        <PanelHeader
          title="Analyste Mistral"
          subtitle="Aucune écriture brute ni donnée personnelle n’est envoyée, seulement les indicateurs agrégés"
          icon={BrainCircuit}
        />
        <button className="btn btn-primary" disabled={busy} onClick={() => void run()}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{' '}
          {analysis ? 'Régénérer' : 'Analyser la période'}
        </button>
      </div>
      {error && (
        <div className="alert-modern error">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {analysis && (
        <div className="finance-ai-result">
          <div className={`finance-ai-summary ${analysis.status}`}>
            <strong>{analysis.summary}</strong>
          </div>
          <div className="finance-ai-columns">
            <div>
              <h4>Forces</h4>
              {analysis.strengths.length ? (
                <ul>
                  {analysis.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Aucune force certaine avec les données disponibles.</p>
              )}
            </div>
            <div>
              <h4>Risques</h4>
              {analysis.risks.length ? (
                <ul>
                  {analysis.risks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Aucun risque prioritaire détecté.</p>
              )}
            </div>
            <div>
              <h4>Actions</h4>
              <ul>
                {analysis.actions.map((item) => (
                  <li key={`${item.priority}-${item.title}`}>
                    <strong>
                      {item.priority} · {item.title}
                    </strong>
                    <span>{item.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {analysis.dataLimits.length > 0 && (
            <p className="finance-ai-limits">
              <AlertCircle size={15} /> Limites : {analysis.dataLimits.join(' · ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function SourcesView({
  token,
  data,
  uploading,
  sourceBusy,
  onFiles,
  onSetSalesInclusion,
  onSetPrimaryPos,
  onSyncFennoa,
  onReload,
  asOf,
  selectedSiteId,
}: {
  token: string;
  data: FinanceBootstrap;
  uploading: boolean;
  sourceBusy?: string;
  onFiles: (files: File[], siteId?: string) => Promise<boolean>;
  onSetSalesInclusion: (id: string, enabled: boolean) => void;
  onSetPrimaryPos: (id: string) => void;
  onSyncFennoa: () => void;
  onReload: () => void;
  asOf: string;
  selectedSiteId?: string;
}) {
  const [selectedProvider, setSelectedProvider] = useState<FinanceProvider>();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [flatpaySettingsSiteId, setFlatpaySettingsSiteId] = useState<string>();
  const [posSettings, setPosSettings] = useState<{
    provider: 'LOYVERSE' | 'PAYPAL_POS';
    siteId?: string;
  }>();
  const [mappingSource, setMappingSource] = useState<string>();
  const [mappingError, setMappingError] = useState<string>();
  const mapSource = async (sourceId: string, siteId: string) => {
    setMappingSource(sourceId);
    setMappingError(undefined);
    try {
      await api.mapFinanceSourceSite(token, sourceId, siteId);
      onReload();
    } catch (reason) {
      setMappingError(messageOf(reason, 'Impossible de rattacher cette caisse à l’établissement.'));
    } finally {
      setMappingSource(undefined);
    }
  };
  return (
    <motion.div
      className="finance-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <section className="finance-section-intro">
        <div>
          <span>Traçabilité des chiffres</span>
          <h2>Toutes vos sources, une seule lecture</h2>
          <p>
            Ouvrez une source pour gérer ses comptes par établissement. Les documents comptables
            sont contrôlés avant d’alimenter le grand livre ToqueHub.
          </p>
        </div>
        <div className="finance-source-export-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setExportOpen(true)}>
            <Download size={16} /> Exporter
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>
            <UploadCloud size={16} /> Importer
          </button>
        </div>
      </section>
      <section className="finance-connectors-grid">
        {(['FENNOA', 'LOYVERSE', 'FLATPAY', 'GENERIC', 'PAYPAL_POS'] as FinanceProvider[]).map(
          (provider) => (
            <ProviderSummaryCard
              key={provider}
              provider={provider}
              data={data}
              onClick={() => setSelectedProvider(provider)}
            />
          ),
        )}
      </section>
      {mappingError ? (
        <div className="alert-modern error">
          <AlertCircle size={16} /> {mappingError}
        </div>
      ) : null}
      {selectedProvider ? (
        <ProviderDetailsModal
          provider={selectedProvider}
          data={data}
          busySourceId={sourceBusy || mappingSource}
          onClose={() => setSelectedProvider(undefined)}
          onMapSite={(sourceId, siteId) => void mapSource(sourceId, siteId)}
          onSetSalesInclusion={onSetSalesInclusion}
          onSetPrimaryPos={onSetPrimaryPos}
          onSyncFennoa={onSyncFennoa}
          onImport={() => {
            setSelectedProvider(undefined);
            setImportOpen(true);
          }}
          onConfigure={(provider, siteId) => {
            setSelectedProvider(undefined);
            if (provider === 'FLATPAY') setFlatpaySettingsSiteId(siteId);
            else if (provider === 'LOYVERSE' || provider === 'PAYPAL_POS')
              setPosSettings({ provider, siteId });
          }}
        />
      ) : null}
      {flatpaySettingsSiteId ? (
        <FlatpaySettingsModal
          key={`flatpay-${flatpaySettingsSiteId}`}
          token={token}
          configuration={data.settings.flatpay}
          sites={data.sites}
          initialSiteId={flatpaySettingsSiteId}
          onSaved={onReload}
          onClose={() => setFlatpaySettingsSiteId(undefined)}
        />
      ) : null}
      {posSettings ? (
        <PosApiSettingsModal
          key={`${posSettings.provider}-${posSettings.siteId ?? 'new'}`}
          token={token}
          provider={posSettings.provider}
          configuration={
            posSettings.provider === 'LOYVERSE'
              ? data.settings.pos.loyverse
              : data.settings.pos.paypalPos
          }
          sites={data.sites}
          initialSiteId={posSettings.siteId}
          onSaved={onReload}
          onClose={() => setPosSettings(undefined)}
        />
      ) : null}
      {importOpen ? (
        <FinanceImportModal
          sites={data.sites}
          uploading={uploading}
          mistralConfigured={data.dashboard.mistral.configured}
          onClose={() => setImportOpen(false)}
          onImport={async (files, siteId) => {
            if (await onFiles(files, siteId)) setImportOpen(false);
          }}
        />
      ) : null}
      {exportOpen ? (
        <FinanceExportModal
          token={token}
          sites={data.sites}
          asOf={asOf}
          initialSiteId={selectedSiteId}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
      <ImportHistory imports={data.imports} />
    </motion.div>
  );
}

const PROVIDER_DESCRIPTIONS: Record<FinanceProvider, string> = {
  FENNOA: 'Comptes, écritures, exercices, soldes et budgets comptables.',
  LOYVERSE: 'Tickets, produits, TVA, remboursements et moyens de paiement.',
  FLATPAY: 'Commandes, ventes produits, affluence et clôtures de caisse.',
  GENERIC: 'Documents comptables, budgets et exports structurés analysés à l’import.',
  PAYPAL_POS: 'Reçus, ventes, TVA, remboursements et moyens de paiement.',
};

function latestProviderSync(data: FinanceBootstrap, provider: FinanceProvider) {
  const values = data.sources
    .filter((source) => source.provider === provider)
    .map(({ lastSyncedAt }) => lastSyncedAt)
    .filter((value): value is string => Boolean(value));
  const connectionDates =
    provider === 'FLATPAY'
      ? (data.settings.flatpay?.connections?.map(({ lastSyncedAt }) => lastSyncedAt) ?? [])
      : provider === 'LOYVERSE'
        ? (data.settings.pos.loyverse.connections?.map(({ lastSyncedAt }) => lastSyncedAt) ?? [])
        : provider === 'PAYPAL_POS'
          ? (data.settings.pos.paypalPos.connections?.map(({ lastSyncedAt }) => lastSyncedAt) ?? [])
          : [];
  return [...values, ...connectionDates]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
}

function providerStatus(data: FinanceBootstrap, provider: FinanceProvider): FinanceSourceStatus {
  const sources = data.sources.filter((source) => source.provider === provider);
  if (sources.some(({ status }) => status === 'ERROR')) return 'ERROR';
  if (sources.some(({ status }) => status === 'ATTENTION')) return 'ATTENTION';
  const configured =
    provider === 'FENNOA'
      ? Boolean(data.settings.fennoa?.apiKeyConfigured)
      : provider === 'FLATPAY'
        ? Boolean(data.settings.flatpay?.connections?.some(({ configured }) => configured))
        : provider === 'LOYVERSE'
          ? Boolean(data.settings.pos.loyverse.connections?.some(({ configured }) => configured))
          : provider === 'PAYPAL_POS'
            ? Boolean(data.settings.pos.paypalPos.connections?.some(({ configured }) => configured))
            : data.imports.some(({ provider }) => provider === 'GENERIC');
  return configured || sources.some(({ status }) => status === 'READY') ? 'READY' : 'NOT_CONNECTED';
}

function ProviderSummaryCard({
  provider,
  data,
  onClick,
}: {
  provider: FinanceProvider;
  data: FinanceBootstrap;
  onClick: () => void;
}) {
  const latest = latestProviderSync(data, provider);
  return (
    <button type="button" className="finance-connector-card" onClick={onClick}>
      <div className="finance-connector-top">
        <div className="finance-connector-identity">
          <ProviderMark provider={provider} />
          <h3>{PROVIDER_LABELS[provider]}</h3>
        </div>
        <StatusBadge status={providerStatus(data, provider)} />
      </div>
      <p className="finance-connector-description">{PROVIDER_DESCRIPTIONS[provider]}</p>
      <div className="finance-connector-last-sync">
        <span>Dernière synchro</span>
        <strong>{formatDate(latest, true)}</strong>
        <ChevronRight size={17} />
      </div>
    </button>
  );
}

function ProviderDetailsModal({
  provider,
  data,
  busySourceId,
  onClose,
  onMapSite,
  onSetSalesInclusion,
  onSetPrimaryPos,
  onSyncFennoa,
  onConfigure,
  onImport,
}: {
  provider: FinanceProvider;
  data: FinanceBootstrap;
  busySourceId?: string;
  onClose: () => void;
  onMapSite: (sourceId: string, siteId: string) => void;
  onSetSalesInclusion: (sourceId: string, enabled: boolean) => void;
  onSetPrimaryPos: (sourceId: string) => void;
  onSyncFennoa: () => void;
  onConfigure: (provider: FinanceProvider, siteId?: string) => void;
  onImport: () => void;
}) {
  const sources = data.sources.filter((source) => source.provider === provider);
  const isPos = provider === 'FLATPAY' || provider === 'LOYVERSE' || provider === 'PAYPAL_POS';
  const [siteId, setSiteId] = useState(data.sites[0]?.id ?? 'unmapped');
  const selectedSite = data.sites.find((site) => site.id === siteId);
  const siteSources = sources.filter((source) =>
    siteId === 'unmapped' ? !source.siteId : source.siteId === siteId,
  );
  const connection =
    provider === 'FLATPAY'
      ? flatpayConnectionForSite(data.settings.flatpay, selectedSite?.id)
      : provider === 'LOYVERSE'
        ? posConnectionForSite(data.settings.pos.loyverse, selectedSite?.id)
        : provider === 'PAYPAL_POS'
          ? posConnectionForSite(data.settings.pos.paypalPos, selectedSite?.id)
          : null;
  return (
    <div className="finance-settings-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="finance-provider-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-provider-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="finance-provider-details-header">
          <div>
            <span>Source Finance</span>
            <h2 id="finance-provider-details-title">{PROVIDER_LABELS[provider]}</h2>
            <p>{PROVIDER_DESCRIPTIONS[provider]}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="finance-provider-details-layout">
          <nav aria-label="Établissements">
            {data.sites.map((site) => (
              <button
                type="button"
                key={site.id}
                className={siteId === site.id ? 'active' : ''}
                onClick={() => setSiteId(site.id)}
              >
                <Building2 size={16} /> {site.name}
              </button>
            ))}
            {sources.some((source) => !source.siteId) ? (
              <button
                type="button"
                className={siteId === 'unmapped' ? 'active' : ''}
                onClick={() => setSiteId('unmapped')}
              >
                <AlertCircle size={16} /> À rattacher
              </button>
            ) : null}
          </nav>
          <div className="finance-provider-details-content">
            <div className="finance-provider-site-heading">
              <div>
                <span>Établissement</span>
                <h3>{selectedSite?.name ?? 'Sources non rattachées'}</h3>
              </div>
              {isPos && selectedSite ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onConfigure(provider, selectedSite.id)}
                >
                  <Plus size={16} /> {connection?.configured ? 'Configurer' : 'Ajouter un compte'}
                </button>
              ) : provider === 'GENERIC' ? (
                <button type="button" className="btn btn-primary" onClick={onImport}>
                  <UploadCloud size={16} /> Importer
                </button>
              ) : null}
            </div>
            {provider === 'FENNOA' ? (
              <div className="finance-provider-account-card">
                <StatusBadge status={providerStatus(data, provider)} />
                <dl>
                  <div>
                    <dt>Clé API</dt>
                    <dd>
                      {data.settings.fennoa?.apiKeyConfigured ? 'Configurée' : 'À configurer'}
                    </dd>
                  </div>
                  <div>
                    <dt>Dernière synchro</dt>
                    <dd>{formatDate(latestProviderSync(data, provider), true)}</dd>
                  </div>
                </dl>
                {data.settings.fennoa?.apiKeyConfigured ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onSyncFennoa}
                    disabled={busySourceId === 'fennoa'}
                  >
                    <RefreshCw size={16} /> Synchroniser maintenant
                  </button>
                ) : (
                  <p className="finance-source-guidance">
                    Configuration dans Système → Clés API & IA
                  </p>
                )}
              </div>
            ) : null}
            {isPos && selectedSite ? (
              <div className="finance-provider-account-card">
                <StatusBadge status={connection?.configured ? 'READY' : 'NOT_CONNECTED'} />
                <dl>
                  <div>
                    <dt>Compte</dt>
                    <dd>{connection?.configured ? 'Connexion sécurisée' : 'Non configuré'}</dd>
                  </div>
                  <div>
                    <dt>Dernière synchro</dt>
                    <dd>{formatDate(connection?.lastSyncedAt, true)}</dd>
                  </div>
                  <div>
                    <dt>Couverture</dt>
                    <dd>
                      {formatCoverage(siteSources[0]?.coverageStart, siteSources[0]?.coverageEnd)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {siteSources.map((source) => (
              <div className="finance-provider-source-row" key={source.id}>
                <div>
                  <strong>{source.name}</strong>
                  <span>
                    {source.isPrimaryPos
                      ? 'POS principal'
                      : source.isPrimarySales
                        ? 'Inclus dans le CA'
                        : 'Contrôle / hors CA'}
                  </span>
                </div>
                {!source.siteId ? (
                  <select
                    value=""
                    disabled={busySourceId === source.id}
                    onChange={(event) => onMapSite(source.id, event.target.value)}
                  >
                    <option value="" disabled>
                      Rattacher à…
                    </option>
                    {data.sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                ) : source.sourceType !== 'ACCOUNTING_API' && provider !== 'GENERIC' ? (
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busySourceId === source.id || source.isPrimaryPos}
                      onClick={() => onSetSalesInclusion(source.id, !source.isPrimarySales)}
                    >
                      {source.isPrimarySales ? 'Retirer du CA' : 'Inclure dans le CA'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busySourceId === source.id || source.isPrimaryPos}
                      onClick={() => onSetPrimaryPos(source.id)}
                    >
                      {source.isPrimaryPos ? 'POS principal' : 'Définir principal'}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {!siteSources.length && provider !== 'FENNOA' && !(isPos && selectedSite) ? (
              <EmptyState
                title="Aucune donnée pour ce site"
                text="Ajoutez un compte ou importez un document pour commencer."
              />
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

const FINANCE_EXPORT_OPTIONS: Array<{
  id: Exclude<FinanceExportReport, 'sales'>;
  title: string;
  description: string;
}> = [
  {
    id: 'executive_annual',
    title: 'Analyse annuelle',
    description: 'Synthèse exécutive, trajectoire, alertes, budget, historique et sources.',
  },
  {
    id: 'annual',
    title: 'Annuel détaillé',
    description: 'KPI, réel vs budget mois par mois, comparaisons et rapprochement comptable.',
  },
  {
    id: 'monthly',
    title: 'Mensuel',
    description: 'Situation du mois, activité quotidienne, objectifs et historique comparable.',
  },
  {
    id: 'daily',
    title: 'Journalier',
    description: 'Pilotage du jour, objectifs, sources, écarts et comparaison N-1.',
  },
];

const SALES_EXPORT_OPTIONS: Array<{
  id: FinanceSalesExportPeriod;
  title: string;
  description: string;
}> = [
  { id: 'daily', title: 'Journée', description: 'Ventes, heures, produits et effectif du jour.' },
  {
    id: 'monthly',
    title: 'Mois',
    description: 'Évolution quotidienne et analyse commerciale du mois.',
  },
  {
    id: 'annual',
    title: 'Année',
    description: 'Saisonnalité, comparaisons, produits et catégories.',
  },
  {
    id: 'custom',
    title: 'Période libre',
    description: 'Choisissez précisément les dates à analyser.',
  },
];

function FinanceExportModal({
  token,
  sites,
  asOf,
  initialSiteId,
  onClose,
}: {
  token: string;
  sites: FinanceBootstrap['sites'];
  asOf: string;
  initialSiteId?: string;
  onClose: () => void;
}) {
  const [family, setFamily] = useState<'finance' | 'sales'>('finance');
  const [report, setReport] = useState<Exclude<FinanceExportReport, 'sales'>>('executive_annual');
  const [salesPeriod, setSalesPeriod] = useState<FinanceSalesExportPeriod>('monthly');
  const [referenceDate, setReferenceDate] = useState(asOf.slice(0, 10));
  const [from, setFrom] = useState(`${asOf.slice(0, 7)}-01`);
  const [to, setTo] = useState(asOf.slice(0, 10));
  const [siteId, setSiteId] = useState(initialSiteId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const generate = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.downloadFinancePdf(token, {
        report: family === 'finance' ? report : 'sales',
        period: family === 'sales' ? salesPeriod : undefined,
        asOf: referenceDate,
        from: family === 'sales' && salesPeriod === 'custom' ? from : undefined,
        to: family === 'sales' && salesPeriod === 'custom' ? to : undefined,
        siteId: siteId || undefined,
      });
    } catch (reason) {
      setError(messageOf(reason, 'Impossible de générer cet export.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="finance-settings-modal-overlay"
      role="presentation"
      onMouseDown={() => !busy && onClose()}
    >
      <section
        className="finance-import-modal finance-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-export-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="finance-provider-details-header">
          <div>
            <span>Export Finance</span>
            <h2 id="finance-export-title">Créer un rapport professionnel</h2>
            <p>
              Le document reprend la lecture ToqueHub, ses comparaisons et la traçabilité des
              chiffres.
            </p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="finance-export-modal-body">
          <div className="finance-export-family-tabs" role="tablist" aria-label="Type d’export">
            <button
              type="button"
              className={family === 'finance' ? 'active' : ''}
              onClick={() => setFamily('finance')}
            >
              <BarChart3 size={17} /> Analyse financière
            </button>
            <button
              type="button"
              className={family === 'sales' ? 'active' : ''}
              onClick={() => setFamily('sales')}
            >
              <Activity size={17} /> Ventes & affluence
            </button>
          </div>

          <div className="finance-export-choice-grid">
            {(family === 'finance' ? FINANCE_EXPORT_OPTIONS : SALES_EXPORT_OPTIONS).map(
              (option) => {
                const selected =
                  family === 'finance' ? report === option.id : salesPeriod === option.id;
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={selected ? 'selected' : ''}
                    onClick={() => {
                      if (family === 'finance')
                        setReport(option.id as Exclude<FinanceExportReport, 'sales'>);
                      else setSalesPeriod(option.id as FinanceSalesExportPeriod);
                    }}
                  >
                    <span>
                      {selected ? <CheckCircle2 size={17} /> : <FileSpreadsheet size={17} />}
                    </span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </button>
                );
              },
            )}
          </div>

          <div className="finance-export-fields">
            <label className="finance-import-site-select">
              <span>Établissement</span>
              <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                <option value="">Tous les établissements (consolidé)</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            {family !== 'sales' || salesPeriod !== 'custom' ? (
              <label className="finance-import-site-select">
                <span>{family === 'finance' ? 'Situation au' : 'Date de référence'}</span>
                <input
                  type="date"
                  value={referenceDate}
                  onChange={(event) => setReferenceDate(event.target.value)}
                />
              </label>
            ) : (
              <>
                <label className="finance-import-site-select">
                  <span>Du</span>
                  <input
                    type="date"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </label>
                <label className="finance-import-site-select">
                  <span>Au</span>
                  <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </label>
              </>
            )}
          </div>

          <div className="finance-export-contents">
            <ShieldCheck size={19} />
            <div>
              <strong>Un document prêt à partager et à contrôler</strong>
              <p>
                KPI, budget, écarts, comparaisons, graphiques, tableaux détaillés, périmètre,
                fraîcheur, sources et limites disponibles sont automatiquement inclus.
              </p>
            </div>
          </div>
          {error ? (
            <div className="alert-modern error">
              <AlertCircle size={16} /> {error}
            </div>
          ) : null}
        </div>
        <footer className="finance-settings-modal-footer">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void generate()}
          >
            {busy ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
            {busy ? 'Génération en cours…' : 'Générer le PDF'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function BudgetImportModal({
  token,
  data,
  asOf,
  initialSiteId,
  uploading,
  onClose,
  onManualImport,
  onAccepted,
}: {
  token: string;
  data: FinanceBootstrap;
  asOf: string;
  initialSiteId?: string;
  uploading: boolean;
  onClose: () => void;
  onManualImport: (files: File[], siteId: string) => Promise<void>;
  onAccepted: (name: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'choice' | 'manual' | 'mistral'>('choice');
  const [siteId, setSiteId] = useState(initialSiteId ?? data.sites[0]?.id ?? '');
  const [file, setFile] = useState<File>();
  const [guidance, setGuidance] = useState('');
  const [suggestion, setSuggestion] = useState<FinanceBudgetSuggestion>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const disabled = uploading || busy;
  const generate = async () => {
    if (!siteId) return;
    setBusy(true);
    setError(undefined);
    try {
      setSuggestion(
        await api.suggestFinanceBudget(token, {
          siteId,
          asOf,
          ...(guidance.trim() ? { guidance: guidance.trim() } : {}),
        }),
      );
    } catch (reason) {
      setError(messageOf(reason, 'Mistral n’a pas pu produire de proposition exploitable.'));
    } finally {
      setBusy(false);
    }
  };
  const accept = async () => {
    if (!siteId || !suggestion || !suggestion.assessment.canAccept) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.acceptFinanceBudgetSuggestion(token, {
        siteId,
        proposal: suggestion.proposal,
      });
      await onAccepted(result.name);
    } catch (reason) {
      setError(messageOf(reason, 'La proposition n’a pas pu être enregistrée.'));
      setBusy(false);
    }
  };
  return (
    <div
      className="finance-settings-modal-overlay"
      role="presentation"
      onMouseDown={() => !disabled && onClose()}
    >
      <section
        className="finance-import-modal finance-budget-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-budget-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="finance-provider-details-header">
          <div>
            <span>Budget & trajectoire</span>
            <h2 id="finance-budget-import-title">Ajouter un budget</h2>
            <p>
              Les budgets Fennoa existants restent disponibles. Vous choisirez ensuite la version
              utilisée comme référence.
            </p>
          </div>
          <button type="button" disabled={disabled} onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="finance-import-modal-body">
          <label className="finance-import-site-select">
            <span>Établissement concerné</span>
            <select
              value={siteId}
              disabled={disabled || Boolean(suggestion)}
              onChange={(event) => setSiteId(event.target.value)}
            >
              {data.sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>

          {mode === 'choice' ? (
            <div className="finance-budget-import-choices">
              <button type="button" onClick={() => setMode('manual')}>
                <span>
                  <FileSpreadsheet size={24} />
                </span>
                <strong>Importer manuellement</strong>
                <p>Ajouter un fichier Excel contenant les 12 mois et les indicateurs du budget.</p>
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                disabled={!data.dashboard.mistral.configured}
                onClick={() => setMode('mistral')}
              >
                <span>
                  <BrainCircuit size={24} />
                </span>
                <strong>Proposition de Mistral</strong>
                <p>
                  Construire une trajectoire à partir de vos exercices comptables historiques, puis
                  la contrôler avant validation.
                </p>
                <ChevronRight size={18} />
              </button>
              {!data.dashboard.mistral.configured ? (
                <p className="finance-import-note warning">
                  <AlertTriangle size={15} /> Configurez la clé Mistral dans Organisation → Général
                  pour activer la proposition assistée.
                </p>
              ) : null}
            </div>
          ) : null}

          {mode === 'manual' ? (
            <div className="finance-budget-manual-flow">
              <button
                type="button"
                className="finance-modal-back"
                onClick={() => setMode('choice')}
              >
                ← Choisir une autre méthode
              </button>
              <div className="finance-dropzone">
                <span>
                  <FileSpreadsheet size={27} />
                </span>
                <div>
                  <strong>{file?.name ?? 'Sélectionnez votre budget Excel'}</strong>
                  <p>Classeur XLSX avec une feuille « Budget mensuel » · 20 Mo maximum.</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  Choisir
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  hidden
                  accept=".xlsx"
                  onChange={(event) => setFile(event.target.files?.[0])}
                />
              </div>
              <p className="finance-import-note">
                <ShieldCheck size={15} /> L’import crée une nouvelle version et ne supprime aucun
                budget Fennoa ou manuel existant.
              </p>
            </div>
          ) : null}

          {mode === 'mistral' && !suggestion ? (
            <div className="finance-budget-mistral-flow">
              <button
                type="button"
                className="finance-modal-back"
                onClick={() => setMode('choice')}
              >
                ← Choisir une autre méthode
              </button>
              <div className="finance-budget-ai-explanation">
                <Sparkles size={22} />
                <div>
                  <strong>Proposition contrôlée, jamais appliquée automatiquement</strong>
                  <p>
                    Mistral étudie jusqu’à trois exercices antérieurs. ToqueHub recalcule ensuite
                    les charges et les résultats avant de vous présenter les 12 mois.
                  </p>
                </div>
              </div>
              <label className="finance-import-site-select">
                <span>Hypothèses ou objectifs facultatifs</span>
                <textarea
                  value={guidance}
                  maxLength={1200}
                  rows={4}
                  placeholder="Ex. ouverture 6 jours sur 7, recrutement en septembre, objectif de croissance prudent…"
                  onChange={(event) => setGuidance(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {mode === 'mistral' && suggestion ? (
            <div className="finance-budget-suggestion-preview">
              <div className="finance-budget-suggestion-summary">
                <div>
                  <span>Proposition Mistral · confiance {suggestion.proposal.confidence}</span>
                  <h3>{suggestion.proposal.name}</h3>
                  <p>{suggestion.proposal.summary}</p>
                </div>
                <small>
                  {suggestion.history.months} mois analysés · {suggestion.history.periods}{' '}
                  exercice(s)
                </small>
              </div>
              {suggestion.proposal.assumptions.length ? (
                <ul>
                  {suggestion.proposal.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              ) : null}
              <section
                className={`finance-budget-assessment ${
                  suggestion.assessment.canAccept ? 'accepted' : 'blocked'
                }`}
              >
                <header>
                  {suggestion.assessment.canAccept ? (
                    <ShieldCheck size={20} />
                  ) : (
                    <AlertTriangle size={20} />
                  )}
                  <div>
                    <strong>
                      {suggestion.assessment.canAccept
                        ? 'Contrôles métier réussis'
                        : 'Validation bloquée par ToqueHub'}
                    </strong>
                    <p>
                      Comparaison automatique avec le dernier exercice comptable au même périmètre.
                    </p>
                  </div>
                </header>
                <div className="finance-budget-assessment-checks">
                  {suggestion.assessment.checks.map((check) => (
                    <div className={check.severity} key={check.id}>
                      {check.severity === 'pass' ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <AlertTriangle size={16} />
                      )}
                      <span>
                        <strong>{check.label}</strong>
                        <small>{check.detail}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <details className="finance-budget-history-details">
                <summary>
                  Exercices réellement utilisés · {suggestion.history.months} mois comptables
                </summary>
                <div>
                  {suggestion.history.periodDetails.map((period) => (
                    <span key={`${period.startDate}-${period.endDate}`}>
                      <strong>
                        {formatDate(period.startDate)} → {formatDate(period.endDate)}
                      </strong>
                      <small>
                        {period.months}/{period.expectedMonths} mois ·{' '}
                        {period.complete ? 'complet' : 'couverture partielle'}
                      </small>
                    </span>
                  ))}
                </div>
              </details>
              <div className="finance-budget-preview-totals">
                <div>
                  <span>Chiffre d’affaires</span>
                  <strong>
                    {formatValue(
                      suggestion.proposal.totals.revenue,
                      'currency',
                      suggestion.proposal.currency,
                    )}
                  </strong>
                  <small>
                    Référence :{' '}
                    {formatValue(
                      suggestion.reference.totals.revenue,
                      'currency',
                      suggestion.proposal.currency,
                    )}
                  </small>
                </div>
                <div>
                  <span>Charges</span>
                  <strong>
                    {formatValue(
                      suggestion.proposal.totals.operatingExpenses,
                      'currency',
                      suggestion.proposal.currency,
                    )}
                  </strong>
                  <small>
                    {formatValue(
                      percentOfRevenue(
                        suggestion.proposal.totals.operatingExpenses,
                        suggestion.proposal.totals.revenue,
                      ),
                      'percentage',
                      suggestion.proposal.currency,
                    )}{' '}
                    du CA · référence{' '}
                    {formatValue(
                      suggestion.reference.ratios.operatingExpenses,
                      'percentage',
                      suggestion.proposal.currency,
                    )}
                  </small>
                </div>
                <div>
                  <span>Résultat d’exploitation</span>
                  <strong>
                    {formatValue(
                      suggestion.proposal.totals.operatingResult,
                      'currency',
                      suggestion.proposal.currency,
                    )}
                  </strong>
                  <small>
                    {formatValue(
                      percentOfRevenue(
                        suggestion.proposal.totals.operatingResult,
                        suggestion.proposal.totals.revenue,
                      ),
                      'percentage',
                      suggestion.proposal.currency,
                    )}{' '}
                    du CA
                  </small>
                </div>
                <div>
                  <span>Résultat net</span>
                  <strong>
                    {formatValue(
                      suggestion.proposal.totals.netResult,
                      'currency',
                      suggestion.proposal.currency,
                    )}
                  </strong>
                  <small>
                    {formatValue(
                      percentOfRevenue(
                        suggestion.proposal.totals.netResult,
                        suggestion.proposal.totals.revenue,
                      ),
                      'percentage',
                      suggestion.proposal.currency,
                    )}{' '}
                    du CA · référence{' '}
                    {formatValue(
                      suggestion.reference.ratios.netMargin,
                      'percentage',
                      suggestion.proposal.currency,
                    )}
                  </small>
                </div>
              </div>
              <div className="finance-budget-reconciliation">
                <strong>Réconciliation des résultats</strong>
                <span>
                  {formatValue(
                    suggestion.proposal.totals.revenue,
                    'currency',
                    suggestion.proposal.currency,
                  )}{' '}
                  de CA
                  {' + '}
                  {formatValue(
                    suggestion.proposal.totals.otherOperatingIncome,
                    'currency',
                    suggestion.proposal.currency,
                  )}{' '}
                  d’autres produits
                  {' − '}
                  {formatValue(
                    suggestion.proposal.totals.operatingExpenses,
                    'currency',
                    suggestion.proposal.currency,
                  )}{' '}
                  de charges
                  {' = '}
                  {formatValue(
                    suggestion.proposal.totals.operatingResult,
                    'currency',
                    suggestion.proposal.currency,
                  )}{' '}
                  de résultat d’exploitation
                </span>
                <span>
                  {formatValue(
                    suggestion.proposal.totals.operatingResult,
                    'currency',
                    suggestion.proposal.currency,
                  )}
                  {' + '}
                  {formatValue(
                    suggestion.proposal.totals.financialResult,
                    'currency',
                    suggestion.proposal.currency,
                  )}{' '}
                  de résultat financier
                  {' − '}
                  {formatValue(
                    suggestion.proposal.totals.taxes,
                    'currency',
                    suggestion.proposal.currency,
                  )}{' '}
                  d’impôts
                  {' = '}
                  {formatValue(
                    suggestion.proposal.totals.netResult,
                    'currency',
                    suggestion.proposal.currency,
                  )}{' '}
                  de résultat net
                </span>
              </div>
              <div className="finance-budget-preview-table-wrap">
                <table className="finance-budget-preview-table">
                  <thead>
                    <tr>
                      <th>Mois</th>
                      <th>CA</th>
                      <th>Charges</th>
                      <th>Résultat net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestion.proposal.months.map((month) => (
                      <tr key={month.month}>
                        <td>{formatDate(month.periodStart)}</td>
                        <td>
                          {formatValue(month.revenue, 'currency', suggestion.proposal.currency)}
                        </td>
                        <td>
                          {formatValue(
                            month.operatingExpenses,
                            'currency',
                            suggestion.proposal.currency,
                          )}
                        </td>
                        <td>
                          {formatValue(month.netResult, 'currency', suggestion.proposal.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="alert-modern error">
              <AlertCircle size={16} /> {error}
            </div>
          ) : null}
        </div>
        <footer className="finance-settings-modal-footer">
          <button type="button" className="btn btn-secondary" disabled={disabled} onClick={onClose}>
            Annuler
          </button>
          {mode === 'manual' ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={uploading || !file || !siteId}
              onClick={() => file && void onManualImport([file], siteId)}
            >
              {uploading ? <LoaderCircle size={16} className="spin" /> : <UploadCloud size={16} />}
              {uploading ? 'Import en cours…' : 'Importer ce budget'}
            </button>
          ) : null}
          {mode === 'mistral' && !suggestion ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !siteId}
              onClick={() => void generate()}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
              {busy ? 'Analyse des exercices…' : 'Générer la proposition'}
            </button>
          ) : null}
          {mode === 'mistral' && suggestion ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setSuggestion(undefined)}
              >
                Régénérer
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !suggestion.assessment.canAccept}
                onClick={() => void accept()}
              >
                {busy ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}
                {busy
                  ? 'Enregistrement…'
                  : suggestion.assessment.canAccept
                    ? 'Valider et utiliser ce budget'
                    : 'Budget incohérent — validation bloquée'}
              </button>
            </>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function FinanceImportModal({
  sites,
  uploading,
  mistralConfigured,
  onClose,
  onImport,
}: {
  sites: FinanceBootstrap['sites'];
  uploading: boolean;
  mistralConfigured: boolean;
  onClose: () => void;
  onImport: (files: File[], siteId?: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  return (
    <div
      className="finance-settings-modal-overlay"
      role="presentation"
      onMouseDown={() => !uploading && onClose()}
    >
      <section
        className="finance-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="finance-provider-details-header">
          <div>
            <span>Import Finance</span>
            <h2 id="finance-import-title">Importer des documents</h2>
            <p>
              Un PDF multipage ou plusieurs fichiers peuvent être analysés dans la même opération.
            </p>
          </div>
          <button type="button" disabled={uploading} onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="finance-import-modal-body">
          <label className="finance-import-site-select">
            <span>Établissement concerné</span>
            <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <div
            className={`finance-dropzone ${dragging ? 'dragging' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              setFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <span>
              <FileSpreadsheet size={27} />
            </span>
            <div>
              <strong>
                {files.length
                  ? `${files.length} document(s) sélectionné(s)`
                  : 'Déposez vos documents ici'}
              </strong>
              <p>PDF, image, XLSX, XLS ou CSV · 20 Mo maximum par fichier.</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              Choisir
            </button>
            <input
              ref={inputRef}
              type="file"
              hidden
              multiple
              accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </div>
          <p className={`finance-import-note ${mistralConfigured ? '' : 'warning'}`}>
            {mistralConfigured ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
            {mistralConfigured
              ? 'Mistral lit les PDF et images. ToqueHub contrôle ensuite les périodes, signes, unités et totaux avant consolidation.'
              : 'La clé Mistral n’est pas configurée : les tableurs restent lisibles, mais les PDF et images seront placés à contrôler.'}
          </p>
        </div>
        <footer className="finance-settings-modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={uploading}
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={uploading || !files.length}
            onClick={() => void onImport(files, siteId || undefined)}
          >
            {uploading ? <LoaderCircle size={16} className="spin" /> : <UploadCloud size={16} />}
            {uploading
              ? 'Analyse en cours…'
              : `Analyser et importer${files.length ? ` (${files.length})` : ''}`}
          </button>
        </footer>
      </section>
    </div>
  );
}

const FLATPAY_DEFAULT_SCHEDULE = ['07:00', '15:00', '19:00', '23:00'];

function PosApiSettingsModal({
  token,
  provider,
  configuration,
  sites,
  initialSiteId,
  onSaved,
  onClose,
}: {
  token: string;
  provider: 'LOYVERSE' | 'PAYPAL_POS';
  configuration: FinanceBootstrap['settings']['pos']['loyverse'];
  sites: FinanceBootstrap['sites'];
  initialSiteId?: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const apiProvider = provider === 'LOYVERSE' ? 'loyverse' : 'paypal_pos';
  const label = provider === 'LOYVERSE' ? 'Loyverse' : 'PayPal POS / Zettle';
  const [siteId, setSiteId] = useState(initialSiteId ?? sites[0]?.id ?? '');
  const selectedConfiguration = posConnectionForSite(configuration, siteId);
  const [clientId, setClientId] = useState(selectedConfiguration?.clientId ?? '');
  const [secret, setSecret] = useState('');
  const [historyStart, setHistoryStart] = useState(
    selectedConfiguration?.historyStart?.slice(0, 10) ?? `${new Date().getFullYear()}-01-01`,
  );
  const [schedule, setSchedule] = useState<string[]>(
    selectedConfiguration?.schedule.length
      ? [...selectedConfiguration.schedule].sort()
      : FLATPAY_DEFAULT_SCHEDULE,
  );
  const [busy, setBusy] = useState<'save' | 'test' | 'sync'>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  useEffect(() => {
    const next = posConnectionForSite(configuration, siteId);
    setClientId(next?.clientId ?? '');
    setSecret('');
    setHistoryStart(next?.historyStart?.slice(0, 10) ?? `${new Date().getFullYear()}-01-01`);
    setSchedule(next?.schedule.length ? [...next.schedule].sort() : FLATPAY_DEFAULT_SCHEDULE);
    setError(undefined);
    setSuccess(undefined);
  }, [configuration, siteId]);

  const payload = () => ({
    siteId,
    ...(provider === 'PAYPAL_POS' && clientId.trim() ? { clientId: clientId.trim() } : {}),
    ...(secret ? { secret } : {}),
    historyStart,
    schedule,
  });

  const persist = async () => {
    if (!siteId) throw new Error('Choisissez l’établissement ToqueHub de cette caisse.');
    if (!selectedConfiguration?.configured && !secret) {
      throw new Error(
        provider === 'LOYVERSE'
          ? 'Saisissez le jeton d’accès Loyverse.'
          : 'Saisissez la clé API PayPal POS/Zettle.',
      );
    }
    if (provider === 'PAYPAL_POS' && !clientId.trim() && !selectedConfiguration?.clientId) {
      throw new Error('Saisissez le Client ID PayPal POS/Zettle.');
    }
    await api.configureFinancePos(token, apiProvider, payload());
    setSecret('');
  };

  const run = async (action: 'save' | 'test' | 'sync') => {
    setBusy(action);
    setError(undefined);
    setSuccess(undefined);
    try {
      await persist();
      if (action === 'test') {
        const result = await api.testFinancePos(token, apiProvider, siteId);
        setSuccess(result.message);
      } else if (action === 'sync') {
        const result = await api.syncFinancePos(token, apiProvider, {
          siteId,
          ...(historyStart ? { from: historyStart } : {}),
        });
        clearFinanceSalesInsightsCache();
        setSuccess(result.message);
      } else {
        setSuccess('Connexion chiffrée et planification enregistrées.');
      }
      onSaved();
    } catch (reason) {
      setError(messageOf(reason, `Impossible de configurer ${label}.`));
    } finally {
      setBusy(undefined);
    }
  };

  const toggleTime = (time: string) => {
    setSchedule((current) =>
      current.includes(time)
        ? current.filter((value) => value !== time)
        : [...current, time].sort(),
    );
  };

  return (
    <div className="finance-settings-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="finance-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-api-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="finance-settings-modal-header">
          <div>
            <span className="finance-eyebrow">{label}</span>
            <h2 id="pos-api-settings-title">Connexion API locale</h2>
            <p>
              Les tickets et lignes produits sont normalisés puis additionnés aux autres caisses
              actives.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={`Fermer les réglages ${label}`}>
            <X size={20} />
          </button>
        </header>

        <div className="finance-settings-modal-body">
          <section className="finance-settings-block">
            <div className="finance-settings-block-heading">
              <ShieldCheck size={18} />
              <div>
                <strong>Authentification chiffrée</strong>
                <span>
                  Le secret est conservé par l’API ToqueHub locale et n’est jamais renvoyé au
                  navigateur.
                </span>
              </div>
            </div>
            <div className="finance-config-grid">
              <label className="wide">
                <span>Établissement ToqueHub</span>
                <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                  <option value="" disabled>
                    Choisir un établissement
                  </option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              {provider === 'PAYPAL_POS' ? (
                <label>
                  <span>Client ID Zettle</span>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                    placeholder="Client ID du compte marchand"
                    autoComplete="off"
                  />
                </label>
              ) : null}
              <label className={provider === 'LOYVERSE' ? 'wide' : undefined}>
                <span>
                  {provider === 'LOYVERSE' ? 'Jeton d’accès personnel' : 'Clé API Zettle'}
                </span>
                <input
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={
                    selectedConfiguration?.configured
                      ? `Laisser vide pour conserver ${selectedConfiguration.secretMask ?? 'le secret'}`
                      : provider === 'LOYVERSE'
                        ? 'Jeton Loyverse'
                        : 'Clé API signée'
                  }
                  autoComplete="new-password"
                />
              </label>
            </div>
          </section>

          <section className="finance-settings-block">
            <div className="finance-settings-block-heading">
              <RefreshCw size={18} />
              <div>
                <strong>Historique et automatisation</strong>
                <span>
                  La synchronisation est paginée et rejoue deux jours pour récupérer les corrections
                  tardives sans créer de doublons.
                </span>
              </div>
            </div>
            <label className="finance-history-start">
              <span>Récupérer l’historique depuis</span>
              <input
                type="date"
                value={historyStart}
                onChange={(event) => setHistoryStart(event.target.value)}
              />
            </label>
            <div className="finance-schedule-presets" aria-label="Horaires de synchronisation">
              {FLATPAY_DEFAULT_SCHEDULE.map((time) => (
                <button
                  type="button"
                  key={time}
                  className={schedule.includes(time) ? 'active' : ''}
                  onClick={() => toggleTime(time)}
                >
                  {time.replace(':00', 'h')}
                </button>
              ))}
            </div>
          </section>

          <div className="finance-storage-rule">
            <Database size={18} />
            <div>
              <strong>Compatible localhost et Tailscale</strong>
              <span>
                La tâche tourne dans l’API ToqueHub sur macOS, Windows, Linux ou Raspberry Pi tant
                que l’instance est démarrée.
              </span>
            </div>
          </div>

          {success ? (
            <div className="alert-modern success">
              <CheckCircle2 size={16} /> {success}
            </div>
          ) : null}
          {error ? (
            <div className="alert-modern error">
              <AlertCircle size={16} /> {error}
            </div>
          ) : null}
          {selectedConfiguration?.lastError ? (
            <div className="alert-modern error">
              <AlertCircle size={16} /> Dernière synchronisation : {selectedConfiguration.lastError}
            </div>
          ) : null}
        </div>

        <footer className="finance-settings-modal-footer finance-pos-modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(busy)}
            onClick={onClose}
          >
            Fermer
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(busy) || !siteId || schedule.length === 0}
            onClick={() => void run('test')}
          >
            {busy === 'test' ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ShieldCheck size={16} />
            )}{' '}
            Tester
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={Boolean(busy) || !siteId || schedule.length === 0}
            onClick={() => void run('save')}
          >
            {busy === 'save' ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Settings2 size={16} />
            )}{' '}
            Enregistrer
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={Boolean(busy) || !siteId || schedule.length === 0 || !historyStart}
            onClick={() => void run('sync')}
          >
            {busy === 'sync' ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <RefreshCw size={16} />
            )}{' '}
            Enregistrer et synchroniser
          </button>
        </footer>
      </section>
    </div>
  );
}

function FlatpaySettingsModal({
  token,
  configuration,
  sites,
  initialSiteId,
  onSaved,
  onClose,
}: {
  token: string;
  configuration: FinanceBootstrap['settings']['flatpay'];
  sites: FinanceBootstrap['sites'];
  initialSiteId?: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [siteId, setSiteId] = useState(initialSiteId ?? sites[0]?.id ?? '');
  const selectedConfiguration = flatpayConnectionForSite(configuration, siteId);
  const [username, setUsername] = useState(selectedConfiguration?.username ?? '');
  const [password, setPassword] = useState('');
  const [portalUrl, setPortalUrl] = useState(
    selectedConfiguration?.portalUrl ?? 'https://portal.flatpay.com',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [historyStart, setHistoryStart] = useState(
    selectedConfiguration?.historyStart?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [schedule, setSchedule] = useState<string[]>(
    selectedConfiguration?.automationSchedule?.length
      ? [...selectedConfiguration.automationSchedule].sort()
      : FLATPAY_DEFAULT_SCHEDULE,
  );
  const [customTime, setCustomTime] = useState('');
  const platformLabel =
    selectedConfiguration?.platform === 'win32'
      ? 'Windows'
      : selectedConfiguration?.platform === 'linux'
        ? 'Linux / Raspberry Pi'
        : selectedConfiguration?.platform === 'darwin'
          ? 'macOS'
          : 'cet appareil';

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  useEffect(() => {
    const next = flatpayConnectionForSite(configuration, siteId);
    setUsername(next?.username ?? '');
    setPassword('');
    setPortalUrl(next?.portalUrl ?? 'https://portal.flatpay.com');
    setHistoryStart(next?.historyStart?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setSchedule(
      next?.automationSchedule?.length
        ? [...next.automationSchedule].sort()
        : FLATPAY_DEFAULT_SCHEDULE,
    );
    setError(undefined);
    setSuccess(undefined);
  }, [configuration, siteId]);

  const toggleTime = (time: string) => {
    setSchedule((current) =>
      current.includes(time)
        ? current.filter((value) => value !== time)
        : [...current, time].sort(),
    );
  };

  const addCustomTime = () => {
    if (!customTime || schedule.includes(customTime)) return;
    setSchedule((current) => [...current, customTime].sort());
    setCustomTime('');
  };

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await api.configureFlatpay(token, {
        siteId,
        username,
        ...(password ? { password } : {}),
        portalUrl,
      });
      await api.installFlatpayAutomation(token, {
        siteId,
        historyStart,
        schedule,
      });
      setPassword('');
      setSuccess(
        `Connexion enregistrée · synchronisations prévues à ${schedule
          .map((time) => time.replace(':00', 'h'))
          .join(', ')}.`,
      );
      onSaved();
    } catch (reason) {
      setError(messageOf(reason, 'Impossible d’enregistrer les réglages FlatPay.'));
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await api.configureFlatpay(token, {
        siteId,
        username,
        ...(password ? { password } : {}),
        portalUrl,
      });
      await api.installFlatpayAutomation(token, {
        siteId,
        historyStart,
        schedule,
      });
      const result = await api.reconnectFlatpayAutomation(token, siteId);
      setPassword('');
      setSuccess(result.message);
      onSaved();
    } catch (reason) {
      setError(messageOf(reason, 'Impossible d’ouvrir la reconnexion FlatPay.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="finance-settings-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="finance-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flatpay-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="finance-settings-modal-header">
          <div>
            <span className="finance-eyebrow">FlatPay POS</span>
            <h2 id="flatpay-settings-title">Connexion et synchronisations</h2>
            <p>Configurez le portail et choisissez uniquement les passages utiles.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer les réglages FlatPay">
            <X size={20} />
          </button>
        </header>

        <div className="finance-settings-modal-body">
          <section className="finance-settings-block">
            <div className="finance-settings-block-heading">
              <ShieldCheck size={18} />
              <div>
                <strong>Authentification</strong>
                <span>
                  Les identifiants sont stockés localement et servent à reconnecter FlatPay sans
                  intervention.
                </span>
              </div>
            </div>
            <div className="finance-config-grid">
              <label className="wide">
                <span>Établissement ToqueHub</span>
                <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                  <option value="" disabled>
                    Choisir un établissement
                  </option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Compte FlatPay</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="adresse@email.com"
                />
              </label>
              <label>
                <span>Mot de passe</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    selectedConfiguration?.configured
                      ? 'Laisser vide pour conserver'
                      : 'Mot de passe FlatPay'
                  }
                />
              </label>
              <label className="wide">
                <span>Portail</span>
                <input
                  type="url"
                  value={portalUrl}
                  onChange={(event) => setPortalUrl(event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="finance-settings-block">
            <div className="finance-settings-block-heading">
              <RefreshCw size={18} />
              <div>
                <strong>Synchronisations automatiques</strong>
                <span>
                  Orders et Sales Overview sont récupérés ensemble, en arrière-plan, lorsque
                  l’instance locale ToqueHub est active.
                </span>
              </div>
            </div>
            <label className="finance-history-start">
              <span>Début de l’historique FlatPay</span>
              <input
                type="date"
                value={historyStart}
                onChange={(event) => setHistoryStart(event.target.value)}
              />
            </label>
            <div className="finance-schedule-presets" aria-label="Horaires suggérés">
              {FLATPAY_DEFAULT_SCHEDULE.map((time) => (
                <button
                  type="button"
                  key={time}
                  className={schedule.includes(time) ? 'active' : ''}
                  onClick={() => toggleTime(time)}
                >
                  {time.replace(':00', 'h')}
                </button>
              ))}
            </div>
            <div className="finance-schedule-custom">
              <label>
                <span>Ajouter un horaire personnalisé</span>
                <input
                  type="time"
                  value={customTime}
                  onChange={(event) => setCustomTime(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!customTime || schedule.includes(customTime)}
                onClick={addCustomTime}
              >
                Ajouter
              </button>
            </div>
            <div className="finance-schedule-selected">
              {schedule.map((time) => (
                <span key={time}>
                  {time}
                  <button
                    type="button"
                    onClick={() => toggleTime(time)}
                    aria-label={`Retirer la synchronisation de ${time}`}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          </section>

          <div className="finance-storage-rule">
            <Database size={18} />
            <div>
              <strong>Classement local automatique</strong>
              <span>
                {platformLabel} · Documents / ToqueHub / Finance / FlatPay / année / mois / semaine
              </span>
            </div>
          </div>

          <div className="finance-storage-rule">
            <RefreshCw size={18} />
            <div>
              <strong>Connexion silencieuse</strong>
              <span>
                Aucune fenêtre n’est ouverte pendant les passages normaux. Une validation manuelle
                n’est demandée que si FlatPay impose un MFA, un captcha ou un nouveau consentement.
              </span>
            </div>
          </div>

          {success ? (
            <div className="alert-modern success">
              <CheckCircle2 size={16} /> {success}
            </div>
          ) : null}
          {error ? (
            <div className="alert-modern error">
              <AlertCircle size={16} /> {error}
            </div>
          ) : null}
          {selectedConfiguration?.lastError ? (
            <div className="finance-flatpay-reconnect">
              <AlertCircle size={18} />
              <div>
                <strong>FlatPay demande votre validation</strong>
                <span>Dernier passage : {selectedConfiguration.lastError}</span>
                <small>
                  La reconnexion ouvre uniquement le navigateur FlatPay de l’automatisation, puis
                  relance les rapports récents.
                </small>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={
                  busy ||
                  !siteId ||
                  !username.trim() ||
                  !historyStart ||
                  schedule.length === 0 ||
                  (!selectedConfiguration?.configured && !password)
                }
                onClick={() => void reconnect()}
              >
                {busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}{' '}
                Reconnecter FlatPay
              </button>
            </div>
          ) : null}
        </div>

        <footer className="finance-settings-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              busy ||
              !siteId ||
              !username.trim() ||
              !historyStart ||
              schedule.length === 0 ||
              (!selectedConfiguration?.configured && !password)
            }
            onClick={() => void submit()}
          >
            {busy ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}{' '}
            {selectedConfiguration?.automationInstalledAt
              ? 'Mettre à jour'
              : 'Enregistrer et activer'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  icon: typeof BarChart3;
}) {
  return (
    <header className="finance-panel-header">
      <span>
        <Icon size={18} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="finance-empty-inline">
      <Database size={24} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function ProviderMark({ provider }: { provider: FinanceProvider }) {
  const Icon =
    provider === 'FENNOA' ? Building2 : provider === 'GENERIC' ? FileSpreadsheet : CircleDollarSign;
  return (
    <span className={`finance-provider-mark ${provider.toLowerCase()}`}>
      <Icon size={19} />
    </span>
  );
}
function StatusBadge({ status }: { status: FinanceSourceStatus }) {
  const labels: Record<FinanceSourceStatus, string> = {
    NOT_CONNECTED: 'Non configuré',
    READY: 'À jour',
    ATTENTION: 'À vérifier',
    ERROR: 'Échec de synchro',
  };
  return <span className={`finance-status-badge ${status.toLowerCase()}`}>{labels[status]}</span>;
}
function ImportHistory({ imports }: { imports: FinanceImportBatch[] }) {
  const pageSize = 5;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(imports.length / pageSize));
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);
  const visible = imports.slice((page - 1) * pageSize, page * pageSize);
  return (
    <section className="finance-panel">
      <PanelHeader
        title="Imports récents"
        subtitle="Chaque fichier reste traçable"
        icon={FileSpreadsheet}
      />
      {imports.length ? (
        <div className="finance-import-table">
          <div className="finance-import-row header">
            <span>Fichier</span>
            <span>Source</span>
            <span>Type</span>
            <span>Ajouté</span>
            <span>Statut</span>
          </div>
          {visible.map((batch) => (
            <div className="finance-import-row" key={batch.id}>
              <span>
                <strong>{batch.fileName}</strong>
                <small>
                  {(batch.fileSize / 1024).toLocaleString(activeLocale(), {
                    maximumFractionDigits: 0,
                  })}{' '}
                  Ko
                </small>
              </span>
              <span>{batch.source?.name ?? PROVIDER_LABELS[batch.provider]}</span>
              <span>{REPORT_LABELS[batch.reportKind]}</span>
              <span>{formatDate(batch.createdAt, true)}</span>
              <span>
                <span className={`finance-import-status ${batch.status.toLowerCase()}`}>
                  {batch.status === 'NEEDS_REVIEW'
                    ? 'À contrôler'
                    : batch.status === 'READY'
                      ? 'Prêt'
                      : batch.status === 'FAILED'
                        ? 'Échec'
                        : 'Reçu'}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Aucun import" text="Vos rapports et budgets apparaîtront ici." />
      )}
      {imports.length > pageSize ? (
        <nav className="finance-import-pagination" aria-label="Pagination des imports">
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
            <ChevronRight size={16} /> Précédent
          </button>
          <span>
            Page {page} sur {pageCount} · {imports.length} imports
          </span>
          <button
            type="button"
            disabled={page === pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            Suivant <ChevronRight size={16} />
          </button>
        </nav>
      ) : null}
    </section>
  );
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  MailCheck,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import './styles/PurchasingApp.css';
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseReceipt,
  PurchasingBootstrap,
  PurchasingDashboard,
  PurchasingEmailConnection,
} from '../../types';
import {
  PurchasingSkeleton,
  messageOf,
  tabTitle,
} from './components/PurchasingUi';
import { PurchasingDashboardView } from './pages/PurchasingDashboard';
import { OrdersView } from './pages/PurchaseOrders';
import { OrderComposerButton } from './orders/OrderComposer';
import { PurchasingOnboarding } from './onboarding/PurchasingOnboarding';
import { ReceiptsView } from './receipts/ReceiptWorkspace';

export type PurchasingTab = 'dashboard' | 'orders' | 'receipts';

type Props = {
  token: string;
  tab: PurchasingTab;
  onNavigate: (tab: PurchasingTab) => void;
};

export function PurchasingWorkspace({ token, tab, onNavigate }: Props) {
  const [bootstrap, setBootstrap] = useState<PurchasingBootstrap | null>(null);
  const [dashboard, setDashboard] = useState<PurchasingDashboard | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState<PurchaseOrderStatus | ''>('');
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [receiptPage, setReceiptPage] = useState(1);
  const [receiptTotal, setReceiptTotal] = useState(0);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [emailStatusOpen, setEmailStatusOpen] = useState(false);
  const [emailConnections, setEmailConnections] = useState<PurchasingEmailConnection[]>([]);
  const [emailConnectionsLoading, setEmailConnectionsLoading] = useState(false);
  const initialOnboardingHandled = useRef(false);
  const debouncedOrderSearch = useDebouncedValue(orderSearch);

  const loadConfiguration = useCallback(async () => {
    const [nextBootstrap, suppliers] = await Promise.all([
      api.purchasingBootstrap(token),
      api.purchasingSuppliers(token, { page: 1, pageSize: 30 }),
    ]);
    const configured = { ...nextBootstrap, suppliers: suppliers.items };
    setBootstrap(configured);
    if (!initialOnboardingHandled.current) {
      initialOnboardingHandled.current = true;
      setOnboardingOpen(
        !configured.onboarding.completedAt &&
          configured.permissions.includes('purchasing.manage') &&
          sessionStorage.getItem(`purchasing:onboarding-dismissed:${configured.organizationId}`) !== '1',
      );
    }
    return configured;
  }, [token]);

  const loadTab = useCallback(
    async (activeTab: PurchasingTab, requestedPage?: number) => {
      if (activeTab === 'dashboard') {
        const nextDashboard = await api.purchasingDashboard(token);
        setDashboard(nextDashboard);
        setOrders(nextDashboard.recent);
      } else if (activeTab === 'orders') {
        const page = requestedPage ?? orderPage;
        const response = await api.purchasingOrders(token, {
          page,
          pageSize: 30,
          search: debouncedOrderSearch.trim() || undefined,
          status: orderStatus,
        });
        setOrders(response.items);
        setOrderTotal(response.total);
        setOrderPage(response.page);
      } else if (activeTab === 'receipts') {
        const page = requestedPage ?? receiptPage;
        const [nextReceipts, receivableOrders] = await Promise.all([
          api.purchasingReceiptsPage(token, { page, pageSize: 30 }),
          api.purchasingOrders(token, { pageSize: 30, receivable: true }),
        ]);
        setReceipts(nextReceipts.items);
        setReceiptTotal(nextReceipts.total);
        setReceiptPage(nextReceipts.page);
        setOrders(receivableOrders.items);
      }
    },
    [debouncedOrderSearch, orderPage, orderStatus, receiptPage, token],
  );

  const refresh = useCallback(
    async () => {
      setRefreshing(true);
      setError(undefined);
      try {
        await loadTab(tab);
      } catch (err) {
        setError(messageOf(err, 'Impossible de charger le module Achats.'));
      } finally {
        setRefreshing(false);
      }
    },
    [loadTab, tab],
  );

  useEffect(() => {
    setLoading(true);
    setError(undefined);
    void loadConfiguration()
      .catch((err) => setError(messageOf(err, 'Impossible de charger le module Achats.')))
      .finally(() => setLoading(false));
  }, [loadConfiguration]);

  useEffect(() => {
    if (!bootstrap) return;
    void loadTab(
      tab,
      tab === 'orders' ? orderPage : tab === 'receipts' ? receiptPage : undefined,
    ).catch((err) => setError(messageOf(err, 'Impossible de charger cet onglet.')));
  }, [bootstrap, loadTab, orderPage, orderStatus, receiptPage, tab]);

  const can = useCallback(
    (permission: string) => Boolean(bootstrap?.permissions.includes(permission)),
    [bootstrap],
  );

  const flash = (kind: 'success' | 'error', value: string) => {
    if (kind === 'success') {
      setSuccess(value);
      setError(undefined);
      window.setTimeout(() => setSuccess(undefined), 5000);
    } else {
      setError(value);
      setSuccess(undefined);
    }
  };

  const openEmailStatus = async () => {
    setEmailStatusOpen(true);
    setEmailConnectionsLoading(true);
    try {
      setEmailConnections(await api.purchasingEmailConnections(token));
    } catch (err) {
      flash('error', messageOf(err, 'Impossible de lire le statut de la messagerie.'));
    } finally {
      setEmailConnectionsLoading(false);
    }
  };

  const activateEmailConnection = async (provider: PurchasingEmailConnection['provider']) => {
    try {
      const nextConnections = await api.activatePurchasingEmailConnection(token, provider);
      setEmailConnections(nextConnections);
      await loadConfiguration();
      flash('success', 'Boîte d’envoi sélectionnée pour les commandes fournisseurs.');
    } catch (err) {
      flash('error', messageOf(err, 'Impossible d’activer cette messagerie.'));
      throw err;
    }
  };

  if (loading && !bootstrap) return <PurchasingSkeleton />;

  return (
    <div className="purchasing-app">
      <motion.section
        className="welcome-hero stocks-hero"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem',
          padding: '2.5rem',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '24px',
          background: 'radial-gradient(circle at 10% 20%, rgba(16, 185, 129, 0.22) 0%, transparent 65%), radial-gradient(circle at 90% 80%, rgba(5, 150, 105, 0.08) 0%, transparent 55%), linear-gradient(135deg, #06090f 0%, #0c121e 100%)',
          color: 'white',
        }}
      >
        <div>
          <span className="welcome-tag" style={{ color: 'var(--primary)', marginBottom: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.42rem' }}>
            <ShoppingCart size={15} /> Module Achats
          </span>
          <h1 className="welcome-title" style={{ color: 'white', margin: '0.2rem 0', fontSize: '2rem', fontWeight: 800 }}>{tabTitle(tab)}</h1>
          <p className="welcome-desc" style={{ color: '#94a3b8', margin: 0, fontSize: '0.92rem', lineHeight: 1.5 }}>
            Préparez, envoyez et réceptionnez vos commandes sans dupliquer les référentiels Stocks.
          </p>
        </div>
        <div className="purchasing-hero-actions" style={{ display: 'flex', gap: '0.55rem', alignSelf: 'flex-end', flexWrap: 'wrap', zIndex: 1 }}>
          {tab === 'dashboard' && (
            <button
              className="btn btn-secondary btn-outline"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }}
              onClick={() => void openEmailStatus()}
            >
              <MailCheck size={16} /> Messagerie
            </button>
          )}
          {tab === 'dashboard' && (
            <button
              className="btn btn-secondary btn-outline"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }}
              onClick={() => setOnboardingOpen(true)}
            >
              <Sparkles size={16} /> Guide de configuration
            </button>
          )}
          <button
            className="btn btn-secondary btn-outline purchasing-icon-button"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '0.68rem !important' }}
            aria-label="Actualiser"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
          </button>
          {can('purchasing.draft') && (
            <OrderComposerButton
              bootstrap={bootstrap!}
              onSaved={() => void refresh()}
              flash={flash}
              token={token}
            />
          )}
        </div>
      </motion.section>

      <nav className="hr-tabs stocks-module-tabs" aria-label="Navigation Achats">
        {(
          [
            ['dashboard', 'Tableau de bord', ShoppingCart],
            ['orders', 'Commandes', FileText],
            ['receipts', 'Réceptions', PackageCheck],
          ] as const
        ).map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => onNavigate(id)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="alert-modern error dismissible">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button className="icon-btn" onClick={() => setError(undefined)} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
      )}
      {success && (
        <div className="alert-modern success dismissible">
          <CheckCircle2 size={18} />
          <span>{success}</span>
          <button className="icon-btn" onClick={() => setSuccess(undefined)} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
      )}

      {tab === 'dashboard' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <PurchasingDashboardView dashboard={dashboard} orders={orders} onNavigate={onNavigate} />
        </motion.div>
      )}
      {tab === 'orders' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <OrdersView
            bootstrap={bootstrap!}
            orders={orders}
            search={orderSearch}
            status={orderStatus}
            setSearch={(value) => {
              setOrderSearch(value);
              setOrderPage(1);
            }}
            setStatus={(value) => {
              setOrderStatus(value);
              setOrderPage(1);
            }}
            page={orderPage}
            total={orderTotal}
            onPageChange={setOrderPage}
            token={token}
            can={can}
            flash={flash}
            onChanged={() => void refresh()}
          />
        </motion.div>
      )}
      {tab === 'receipts' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <ReceiptsView
            bootstrap={bootstrap!}
            receipts={receipts}
            orders={orders}
            page={receiptPage}
            total={receiptTotal}
            onPageChange={setReceiptPage}
            token={token}
            can={can}
            flash={flash}
            onChanged={() => void refresh()}
          />
        </motion.div>
      )}
      {onboardingOpen && bootstrap && (
        <PurchasingOnboarding
          bootstrap={bootstrap}
          forceFirstStep={true}
          hasOrder={orders.length > 0}
          token={token}
          canManage={can('purchasing.manage')}
          onClose={() => {
            sessionStorage.setItem(
              `purchasing:onboarding-dismissed:${bootstrap.organizationId}`,
              '1',
            );
            setOnboardingOpen(false);
            onNavigate('dashboard');
          }}
          onChanged={async () => {
            await loadConfiguration();
            await loadTab('dashboard');
          }}
          flash={flash}
        />
      )}
      {emailStatusOpen && bootstrap && (
        <PurchasingEmailStatusModal
          activeProvider={bootstrap.settings.activeEmailProvider}
          connections={emailConnections}
          loading={emailConnectionsLoading}
          resendVerifiedAt={bootstrap.settings.resendVerifiedAt}
          onActivate={activateEmailConnection}
          onClose={() => setEmailStatusOpen(false)}
          onConfigure={() => {
            setEmailStatusOpen(false);
            setOnboardingOpen(true);
          }}
        />
      )}
    </div>
  );
}

function PurchasingEmailStatusModal({
  activeProvider,
  connections,
  loading,
  resendVerifiedAt,
  onActivate,
  onClose,
  onConfigure,
}: {
  activeProvider: PurchasingBootstrap['settings']['activeEmailProvider'];
  connections: PurchasingEmailConnection[];
  loading: boolean;
  resendVerifiedAt?: string | null;
  onActivate: (provider: PurchasingEmailConnection['provider']) => Promise<void>;
  onClose: () => void;
  onConfigure: () => void;
}) {
  const labels: Record<PurchasingEmailConnection['provider'], string> = {
    GOOGLE: 'Google Workspace / Gmail',
    MICROSOFT: 'Microsoft 365 / Outlook',
    SMTP: 'Messagerie SMTP',
    RESEND: 'Resend',
  };
  const active = activeProvider ? connections.find((item) => item.provider === activeProvider) : null;
  const resendIsActive = !activeProvider && Boolean(resendVerifiedAt);
  const connected = Boolean(active && active.status === 'CONNECTED') || resendIsActive;
  const identity = active?.senderName || active?.senderEmail || null;
  const [activating, setActivating] = useState<PurchasingEmailConnection['provider']>();
  const connectedConnections = connections.filter(
    (item) => item.status === 'CONNECTED' && item.provider !== activeProvider,
  );

  const selectConnection = async (provider: PurchasingEmailConnection['provider']) => {
    setActivating(provider);
    try {
      await onActivate(provider);
    } catch {
      // The workspace shows the safe error notification.
    } finally {
      setActivating(undefined);
    }
  };

  return (
    <div className="modal-overlay purchasing-email-status-overlay" role="presentation" onMouseDown={onClose}>
      <section className="purchasing-email-status-modal" role="dialog" aria-modal="true" aria-labelledby="purchasing-email-status-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-btn purchasing-email-status-close" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        <span className={`purchasing-email-status-icon ${connected ? 'ready' : ''}`}><MailCheck size={22} /></span>
        <span className="purchasing-email-status-kicker">Envoi fournisseur</span>
        <h2 id="purchasing-email-status-title">Messagerie {connected ? 'prête' : 'à configurer'}</h2>
        {loading ? (
          <p>Vérification de la connexion…</p>
        ) : connected ? (
          <>
            <p>
              {resendIsActive ? 'Resend est testé et actif pour les envois fournisseurs.' : <>Les bons de commande partiront depuis <strong>{identity || 'la boîte connectée'}</strong>{active?.senderName && active.senderEmail ? ` (${active.senderEmail})` : ''}.</>}
            </p>
            <div className="purchasing-email-status-provider">
              <span>{resendIsActive ? 'Resend' : labels[active!.provider]}</span>
              <b>Connectée</b>
            </div>
          </>
        ) : (
          <>
            <p>Connectez Google, Microsoft, votre SMTP ou Resend avant d’envoyer une commande fournisseur.</p>
            <button className="btn btn-primary" onClick={onConfigure}>Configurer la messagerie</button>
          </>
        )}
        {!loading && connectedConnections.length > 0 && (
          <div className="purchasing-email-status-other">
            <span>Choisir la boîte d’envoi</span>
            {connectedConnections.map((item) => (
              <div key={item.provider} className="purchasing-email-status-choice">
                <span>
                  <b>{labels[item.provider]}</b>
                  <small>{item.senderName && item.senderEmail ? `${item.senderName} · ${item.senderEmail}` : item.senderEmail || 'Connectée'}</small>
                </span>
                <button
                  className="btn btn-secondary btn-small"
                  disabled={Boolean(activating)}
                  onClick={() => void selectConnection(item.provider)}
                >
                  {activating === item.provider ? 'Activation…' : 'Utiliser'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

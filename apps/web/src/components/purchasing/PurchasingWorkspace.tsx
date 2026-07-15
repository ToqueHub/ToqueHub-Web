import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  History,
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
} from '../../types';
import {
  PurchasingSkeleton,
  messageOf,
  tabTitle,
} from './components/PurchasingUi';
import { PurchasingDashboardView } from './pages/PurchasingDashboard';
import { HistoryView } from './pages/PurchaseHistory';
import { OrdersView } from './pages/PurchaseOrders';
import { OrderComposerButton } from './orders/OrderComposer';
import { PurchasingOnboarding } from './onboarding/PurchasingOnboarding';
import { ReceiptsView } from './receipts/ReceiptWorkspace';

export type PurchasingTab = 'dashboard' | 'orders' | 'receipts' | 'history';

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
    if (!bootstrap || tab === 'history') return;
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

  if (loading && !bootstrap) return <PurchasingSkeleton />;

  return (
    <div className="purchasing-app">
      <section className="purchasing-hero">
        <div>
          <span className="purchasing-eyebrow">
            <ShoppingCart size={15} /> Module Achats
          </span>
          <h1>{tabTitle(tab)}</h1>
          <p>
            Préparez, envoyez et réceptionnez vos commandes sans dupliquer les référentiels Stocks.
          </p>
        </div>
        <div className="purchasing-hero-actions">
          <button className="btn btn-secondary" onClick={() => setOnboardingOpen(true)}>
            <Sparkles size={16} /> Guide de configuration
          </button>
          <button
            className="btn btn-secondary purchasing-icon-button"
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
      </section>

      <nav className="hr-tabs stocks-module-tabs" aria-label="Navigation Achats">
        {(
          [
            ['dashboard', 'Tableau de bord', ShoppingCart],
            ['orders', 'Commandes', FileText],
            ['receipts', 'Réceptions', PackageCheck],
            ['history', 'Historique', History],
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
        <PurchasingDashboardView dashboard={dashboard} orders={orders} onNavigate={onNavigate} />
      )}
      {tab === 'orders' && (
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
      )}
      {tab === 'receipts' && (
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
      )}
      {tab === 'history' && <HistoryView token={token} />}

      {onboardingOpen && bootstrap && (
        <PurchasingOnboarding
          bootstrap={bootstrap}
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
    </div>
  );
}

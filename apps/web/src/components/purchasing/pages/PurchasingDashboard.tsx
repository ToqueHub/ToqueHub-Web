import { ArrowRight, Building2, ClipboardCheck, FileText, ShoppingCart, Truck } from 'lucide-react';
import type { PurchaseOrder, PurchasingDashboard } from '../../../types';
import { OrderTable, money } from '../components/PurchasingUi';

type PurchasingTab = 'dashboard' | 'orders' | 'receipts' | 'history';

export function PurchasingDashboardView({
  dashboard,
  orders,
  onNavigate,
}: {
  dashboard: PurchasingDashboard | null;
  orders: PurchaseOrder[];
  onNavigate: (tab: PurchasingTab) => void;
}) {
  const stats = dashboard?.stats ?? {
    drafts: 0,
    ordersThisMonth: 0,
    amountThisMonth: 0,
    expectedNext7Days: 0,
    receiptsToReview: 0,
  };
  const cards = [
    {
      label: 'À préparer',
      value: stats.drafts,
      icon: FileText,
      tone: 'pink',
      action: 'orders' as const,
    },
    {
      label: 'Commandes ce mois',
      value: stats.ordersThisMonth,
      icon: ShoppingCart,
      tone: 'blue',
      action: 'orders' as const,
    },
    {
      label: 'Achats TTC ce mois',
      value: money(stats.amountThisMonth),
      icon: Building2,
      tone: 'green',
      action: 'orders' as const,
    },
    {
      label: 'Livraisons sous 7 jours',
      value: stats.expectedNext7Days,
      icon: Truck,
      tone: 'amber',
      action: 'receipts' as const,
    },
    {
      label: 'Réceptions à contrôler',
      value: stats.receiptsToReview,
      icon: ClipboardCheck,
      tone: 'red',
      action: 'receipts' as const,
    },
  ];
  return (
    <div className="purchasing-dashboard-view">
      <div className="purchasing-metrics">
        {cards.map(({ label, value, icon: Icon, tone, action }) => (
          <button
            className={`purchasing-metric ${tone}`}
            key={label}
            onClick={() => onNavigate(action)}
          >
            <span className="purchasing-metric-icon">
              <Icon size={20} />
            </span>
            <strong>{value}</strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <section className="card-modern">
        <div className="section-header-modern">
          <div className="section-info">
            <span className="card-title">Activité récente</span>
            <span className="section-tagline">Les dernières commandes mises à jour.</span>
          </div>
          <button className="btn btn-secondary" onClick={() => onNavigate('orders')}>
            Toutes les commandes <ArrowRight size={16} />
          </button>
        </div>
        <OrderTable orders={dashboard?.recent ?? orders.slice(0, 8)} compact />
      </section>
    </div>
  );
}

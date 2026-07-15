import { useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ShoppingCart } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseReceipt,
  PurchaseReceiptLineStatus,
} from '../../../types';

export const ORDER_STATUSES: Array<{ value: PurchaseOrderStatus | ''; label: string }> = [
  { value: '', label: 'Tous les statuts' },
  { value: 'DRAFT', label: 'À préparer' },
  { value: 'SENT', label: 'Envoyées' },
  { value: 'ACKNOWLEDGED', label: 'Confirmées' },
  { value: 'PARTIALLY_RECEIVED', label: 'Partiellement reçues' },
  { value: 'RECEIVED', label: 'Reçues' },
  { value: 'CLOSED', label: 'Clôturées' },
  { value: 'CANCELLED', label: 'Annulées' },
];

export function OrderTable({
  orders,
  compact = false,
}: {
  orders: PurchaseOrder[];
  compact?: boolean;
}) {
  return orders.length ? (
    <div className="table-wrapper">
      <table className="table-modern">
        <thead>
          <tr>
            <th>Commande</th>
            <th>Fournisseur</th>
            <th>Livraison</th>
            <th>Statut</th>
            {!compact && <th>Lignes</th>}
            <th>Total TTC</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <strong>{order.number}</strong>
                <small>{dateTimeLabel(order.updatedAt)}</small>
              </td>
              <td>{order.supplierNameSnapshot}</td>
              <td>{dateLabel(order.expectedDeliveryDate)}</td>
              <td>
                <OrderStatus status={order.status} />
              </td>
              {!compact && <td>{order.lineCount ?? order.lines?.length ?? 0}</td>}
              <td>{money(order.totalIncludingTax, order.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      icon={ShoppingCart}
      title="Aucune activité"
      text="Votre première commande apparaîtra ici."
    />
  );
}

export function OrderLinesTable({ order }: { order: PurchaseOrder }) {
  return (
    <div className="table-wrapper">
      <table className="table-modern">
        <thead>
          <tr>
            <th>Produit</th>
            <th>Référence</th>
            <th>Commandé</th>
            <th>Reçu</th>
            <th>Prix HT</th>
            <th>Total TTC</th>
          </tr>
        </thead>
        <tbody>
          {(order.lines ?? []).map((line) => (
            <tr key={line.id}>
              <td>{line.productNameSnapshot}</td>
              <td>{line.supplierReferenceSnapshot || '—'}</td>
              <td>{line.orderedQuantity}</td>
              <td>{line.receivedQuantity}</td>
              <td>{money(line.unitPrice, order.currency)}</td>
              <td>{money(line.lineIncludingTax, order.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderStatus({ status }: { status: PurchaseOrderStatus }) {
  return (
    <span className={`purchasing-status ${status.toLowerCase()}`}>
      {ORDER_STATUSES.find((item) => item.value === status)?.label ?? status}
    </span>
  );
}

export function ReceiptStatus({ receipt }: { receipt: PurchaseReceipt }) {
  const label =
    receipt.status === 'VALIDATED'
      ? 'Validée'
      : receipt.status === 'REVIEW_NEEDED'
        ? 'À contrôler'
        : receipt.status === 'CANCELLED'
          ? 'Annulée'
          : 'À préparer';
  return <span className={`purchasing-status ${receipt.status.toLowerCase()}`}>{label}</span>;
}

export function ReceiptLineBadge({ status }: { status: PurchaseReceiptLineStatus }) {
  const labels: Record<PurchaseReceiptLineStatus, string> = {
    MATCHED: 'Conforme',
    SHORT: 'Manquant',
    OVER: 'Excédent',
    UNEXPECTED: 'Inattendu',
    SUBSTITUTED: 'Substitution',
    NEEDS_REVIEW: 'À rapprocher',
  };
  return <span className={`purchasing-line-status ${status.toLowerCase()}`}>{labels[status]}</span>;
}

export function ReceiptComparisonSummary({ receipt }: { receipt: PurchaseReceipt }) {
  const anomalies =
    receipt.anomalyCount ??
    (receipt.lines ?? []).filter((line) => line.status !== 'MATCHED').length;
  return anomalies ? (
    <span className="purchasing-anomaly">
      <AlertTriangle size={14} /> {anomalies} écart{anomalies > 1 ? 's' : ''}
    </span>
  ) : (
    <span className="purchasing-conform">
      <CheckCircle2 size={14} /> Conforme
    </span>
  );
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="purchasing-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ReasonDialog({
  title,
  label,
  onClose,
  onConfirm,
}: {
  title: string;
  label: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      isOpen
      size="sm"
      title={title}
      subtitle="Cette action sera inscrite dans l’historique."
      onClose={onClose}
    >
      <form
        className="purchasing-reason-form"
        onSubmit={(event) => {
          event.preventDefault();
          const value = reason.trim();
          if (value) onConfirm(value);
        }}
      >
        <Field label={label}>
          <textarea
            autoFocus
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            required
          />
        </Field>
        <div className="modal-footer purchasing-inline-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={!reason.trim()}>
            Confirmer
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShoppingCart;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon size={27} />
      </span>
      <strong className="empty-state-title">{title}</strong>
      <p className="empty-state-desc">{text}</p>
    </div>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="purchasing-pagination">
      <button className="btn btn-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ArrowLeft size={16} /> Précédent
      </button>
      <span>
        Page {page} / {pages}
      </span>
      <button
        className="btn btn-secondary"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Suivant <ArrowRight size={16} />
      </button>
    </div>
  );
}

export function PurchasingSkeleton() {
  return (
    <div className="purchasing-app">
      <section className="purchasing-hero skeleton">
        <div>
          <span />
          <span />
          <span />
        </div>
      </section>
      <div className="purchasing-metrics">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="purchasing-metric skeleton" key={index} />
        ))}
      </div>
    </div>
  );
}

export function tabTitle(tab: 'dashboard' | 'orders' | 'receipts' | 'history') {
  return tab === 'dashboard'
    ? 'Tableau de bord Achats'
    : tab === 'orders'
      ? 'Commandes fournisseurs'
      : tab === 'receipts'
        ? 'Réceptions et écarts'
        : 'Historique des achats';
}

export function money(value: number | string | null | undefined, currency = 'EUR') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(Number(value ?? 0));
}

export function dateLabel(value?: string | null) {
  if (!value) return 'Non planifiée';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
}

export function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function messageOf(error: unknown, fallback = 'Une erreur est survenue.') {
  return error instanceof Error ? error.message : fallback;
}

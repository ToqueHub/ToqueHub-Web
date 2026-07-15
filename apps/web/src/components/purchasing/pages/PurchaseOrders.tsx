import { useState } from 'react';
import { Check, CheckCircle2, Download, Plus, Search, Send, ShoppingCart, X } from 'lucide-react';
import { api } from '../../../api/client';
import { Modal } from '../../ui/Modal';
import type { PurchaseOrder, PurchaseOrderStatus, PurchasingBootstrap } from '../../../types';
import {
  Detail,
  Empty,
  ORDER_STATUSES,
  OrderLinesTable,
  OrderStatus,
  Pagination,
  ReasonDialog,
  dateLabel,
  messageOf,
  money,
} from '../components/PurchasingUi';
import { OrderComposer } from '../orders/OrderComposer';

export function OrdersView({
  bootstrap,
  orders,
  search,
  status,
  setSearch,
  setStatus,
  page,
  total,
  onPageChange,
  token,
  can,
  flash,
  onChanged,
}: {
  bootstrap: PurchasingBootstrap;
  orders: PurchaseOrder[];
  search: string;
  status: PurchaseOrderStatus | '';
  setSearch: (value: string) => void;
  setStatus: (value: PurchaseOrderStatus | '') => void;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  token: string;
  can: (permission: string) => boolean;
  flash: (kind: 'success' | 'error', message: string) => void;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<PurchaseOrder>();
  const [composerOrder, setComposerOrder] = useState<PurchaseOrder | null | undefined>();
  const [working, setWorking] = useState<string>();
  const [reasonAction, setReasonAction] = useState<{
    order: PurchaseOrder;
    kind: 'cancel' | 'close';
  }>();
  const openOrder = async (id: string, edit = false) => {
    setWorking(id);
    try {
      const detail = await api.purchasingOrder(token, id);
      if (edit) setComposerOrder(detail);
      else setSelected(detail);
    } catch (err) {
      flash('error', messageOf(err));
    } finally {
      setWorking(undefined);
    }
  };
  const act = async (id: string, action: () => Promise<unknown>, success: string) => {
    setWorking(id);
    try {
      await action();
      flash('success', success);
      setSelected(undefined);
      onChanged();
    } catch (err) {
      flash('error', messageOf(err));
    } finally {
      setWorking(undefined);
    }
  };
  return (
    <section className="card-modern">
      <div className="filter-bar">
        <label className="search-input-wrapper">
          <Search size={17} />
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="N° de commande ou fournisseur"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as PurchaseOrderStatus | '')}
        >
          {ORDER_STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="purchasing-result-count">
          {total} commande{total > 1 ? 's' : ''}
        </span>
      </div>
      {orders.length ? (
        <div className="table-wrapper">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Commande</th>
                <th>Fournisseur</th>
                <th>Livraison</th>
                <th>Statut</th>
                <th>Total TTC</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <button className="purchasing-link" onClick={() => void openOrder(order.id)}>
                      {order.number}
                    </button>
                    <small>
                      {order.lineCount ?? order.lines?.length ?? 0} ligne
                      {(order.lineCount ?? order.lines?.length ?? 0) > 1 ? 's' : ''}
                    </small>
                  </td>
                  <td>{order.supplierNameSnapshot}</td>
                  <td>{dateLabel(order.expectedDeliveryDate)}</td>
                  <td>
                    <OrderStatus status={order.status} />
                  </td>
                  <td>{money(order.totalIncludingTax, order.currency)}</td>
                  <td>
                    <div className="purchasing-row-actions">
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => void openOrder(order.id)}
                      >
                        Ouvrir
                      </button>
                      {order.status === 'DRAFT' && can('purchasing.draft') && (
                        <button
                          className="btn btn-primary btn-small"
                          onClick={() => void openOrder(order.id, true)}
                        >
                          Modifier
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={ShoppingCart}
          title="Aucune commande"
          text="Créez une première commande ou modifiez vos filtres."
        />
      )}
      <Pagination page={page} total={total} pageSize={30} onChange={onPageChange} />
      {selected && (
        <Modal
          isOpen
          size="lg"
          title={selected.number}
          subtitle={selected.supplierNameSnapshot}
          onClose={() => setSelected(undefined)}
          bodyClassName="purchasing-order-detail"
        >
          <div className="purchasing-detail-grid">
            <Detail label="Statut">
              <OrderStatus status={selected.status} />
            </Detail>
            <Detail label="Livraison">{dateLabel(selected.expectedDeliveryDate)}</Detail>
            <Detail label="Site">{selected.site?.name ?? '—'}</Detail>
            <Detail label="Total TTC">
              {money(selected.totalIncludingTax, selected.currency)}
            </Detail>
          </div>
          <OrderLinesTable order={selected} />
          <div className="modal-footer purchasing-inline-footer wrap">
            <button
              className="btn btn-secondary"
              onClick={() =>
                void api
                  .downloadPurchaseOrderPdf(token, selected.id)
                  .catch((err) => flash('error', messageOf(err)))
              }
            >
              <Download size={16} /> PDF
            </button>
            {selected.status === 'DRAFT' && can('purchasing.draft') && (
              <button className="btn btn-secondary" onClick={() => setComposerOrder(selected)}>
                Modifier
              </button>
            )}
            {selected.status === 'DRAFT' && can('purchasing.send') && (
              <button
                className="btn btn-primary"
                disabled={working === selected.id || !bootstrap.settings.resendVerifiedAt}
                title={
                  bootstrap.settings.resendVerifiedAt
                    ? undefined
                    : 'Testez d’abord la clé API Resend dans le guide de configuration.'
                }
                onClick={() =>
                  void act(
                    selected.id,
                    () =>
                      api.sendPurchaseOrder(token, selected.id, {
                        idempotencyKey: crypto.randomUUID(),
                      }),
                    'Commande envoyée au fournisseur.',
                  )
                }
              >
                <Send size={16} /> Envoyer
              </button>
            )}
            {selected.status === 'SENT' && can('purchasing.write') && (
              <button
                className="btn btn-primary"
                onClick={() =>
                  void act(
                    selected.id,
                    () => api.acknowledgePurchaseOrder(token, selected.id),
                    'Confirmation fournisseur enregistrée.',
                  )
                }
              >
                <Check size={16} /> Confirmer
              </button>
            )}
            {can('purchasing.draft') && selected.status !== 'DRAFT' && (
              <button
                className="btn btn-secondary"
                onClick={() =>
                  void act(
                    selected.id,
                    () => api.duplicatePurchaseOrder(token, selected.id),
                    'Nouvelle commande créée depuis la commande.',
                  )
                }
              >
                <Plus size={16} /> Dupliquer
              </button>
            )}
            {can('purchasing.write') &&
              ['DRAFT', 'SENT', 'ACKNOWLEDGED'].includes(selected.status) && (
                <button
                  className="btn btn-secondary"
                  disabled={working === selected.id}
                  onClick={() => setReasonAction({ order: selected, kind: 'cancel' })}
                >
                  <X size={16} /> Annuler la commande
                </button>
              )}
            {can('purchasing.write') && selected.status === 'PARTIALLY_RECEIVED' && (
              <button
                className="btn btn-secondary"
                disabled={working === selected.id}
                onClick={() => setReasonAction({ order: selected, kind: 'close' })}
              >
                <CheckCircle2 size={16} /> Clôturer le reliquat
              </button>
            )}
          </div>
        </Modal>
      )}
      {composerOrder !== undefined && (
        <OrderComposer
          bootstrap={bootstrap}
          token={token}
          order={composerOrder}
          onClose={() => setComposerOrder(undefined)}
          onSaved={() => {
            setComposerOrder(undefined);
            setSelected(undefined);
            onChanged();
          }}
          flash={flash}
        />
      )}
      {reasonAction && (
        <ReasonDialog
          title={
            reasonAction.kind === 'cancel'
              ? `Annuler ${reasonAction.order.number}`
              : `Clôturer le reliquat ${reasonAction.order.number}`
          }
          label={
            reasonAction.kind === 'cancel'
              ? 'Motif d’annulation'
              : 'Justification de la clôture du reliquat'
          }
          onClose={() => setReasonAction(undefined)}
          onConfirm={(reason) => {
            const current = reasonAction;
            setReasonAction(undefined);
            void act(
              current.order.id,
              () =>
                current.kind === 'cancel'
                  ? api.cancelPurchaseOrder(token, current.order.id, reason)
                  : api.closePurchaseOrder(token, current.order.id, reason),
              current.kind === 'cancel' ? 'Commande annulée.' : 'Reliquat clôturé.',
            );
          }}
        />
      )}
    </section>
  );
}

import { useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Clock3, Download, Mail, Plus, Search, Send, ShoppingCart, X } from 'lucide-react';
import { api } from '../../../api/client';
import { Modal } from '../../ui/Modal';
import type { PurchaseEmailPreview, PurchaseOrder, PurchaseOrderStatus, PurchasingBootstrap } from '../../../types';
import {
  Detail,
  Empty,
  ORDER_STATUSES,
  OrderLinesTable,
  OrderStatus,
  Pagination,
  ReasonDialog,
  dateLabel,
  dateTimeLabel,
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
  const [emailPreview, setEmailPreview] = useState<PurchaseEmailPreview & { orderId: string }>();
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
  const openEmailPreview = async (order: PurchaseOrder) => {
    setWorking(order.id);
    try {
      const preview = await api.purchaseOrderEmailPreview(token, order.id);
      if (!preview.recipient) throw new Error('Ajoutez un e-mail Achats ou un e-mail de contact au fournisseur avant l’envoi.');
      setEmailPreview({ ...preview, orderId: order.id });
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
          <OrderDispatchTimeline order={selected} />
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
                disabled={working === selected.id || (!bootstrap.settings.activeEmailProvider && !bootstrap.settings.resendVerifiedAt)}
                title={
                  bootstrap.settings.activeEmailProvider || bootstrap.settings.resendVerifiedAt
                    ? undefined
                    : 'Connectez et testez d’abord votre messagerie dans le guide de configuration.'
                }
                onClick={() => void openEmailPreview(selected)}
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
      {emailPreview && (
        <Modal isOpen size="lg" title="Vérifier l’e-mail" subtitle="La commande ne sera envoyée qu’après cette validation." onClose={() => setEmailPreview(undefined)}>
          <div className="form-row">
            <label>De<input value={`${emailPreview.senderName || ''} <${emailPreview.senderEmail || ''}>`} disabled /></label>
            <label>À<input type="email" value={emailPreview.recipient || ''} onChange={(event) => setEmailPreview({ ...emailPreview, recipient: event.target.value })} /></label>
            <label>Objet<input value={emailPreview.subject} onChange={(event) => setEmailPreview({ ...emailPreview, subject: event.target.value })} /></label>
            <label className="product-sheet-wide">Message<textarea rows={12} value={emailPreview.text} onChange={(event) => setEmailPreview({ ...emailPreview, text: event.target.value })} /></label>
          </div>
          <p className="purchasing-stock-help">Le bon de commande PDF sera joint à cet e-mail.</p>
          <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setEmailPreview(undefined)}>Annuler</button><button className="btn btn-primary" disabled={!emailPreview.recipient || !emailPreview.subject || working === emailPreview.orderId} onClick={() => void act(emailPreview.orderId, () => api.sendPurchaseOrder(token, emailPreview.orderId, { idempotencyKey: crypto.randomUUID(), recipient: emailPreview.recipient || undefined, subject: emailPreview.subject, body: emailPreview.text }), 'Commande envoyée au fournisseur.')}><Send size={16} /> Confirmer l’envoi</button></div>
        </Modal>
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

function OrderDispatchTimeline({ order }: { order: PurchaseOrder }) {
  const dispatches = order.dispatches ?? [];
  const labels: Record<string, { label: string; tone: 'success' | 'danger' | 'pending' }> = {
    SENT: { label: 'Envoyée au transport', tone: 'success' },
    FAILED: { label: 'Échec d’envoi', tone: 'danger' },
    SENDING: { label: 'Envoi en cours', tone: 'pending' },
    PENDING: { label: 'En attente', tone: 'pending' },
  };
  const providerLabels: Record<string, string> = {
    GOOGLE: 'Google / Gmail',
    MICROSOFT: 'Microsoft / Outlook',
    SMTP: 'SMTP',
    RESEND: 'Resend',
  };

  return (
    <section className="purchasing-dispatches" aria-label="Suivi des envois e-mail">
      <div className="purchasing-dispatches-heading">
        <div>
          <h3><Mail size={17} /> Suivi d’envoi</h3>
          <p>« Envoyée au transport » confirme l’acceptation de l’e-mail, pas sa lecture par le fournisseur.</p>
        </div>
      </div>
      {dispatches.length ? (
        <div className="purchasing-dispatch-list">
          {dispatches.map((dispatch) => {
            const state = labels[dispatch.status] ?? { label: dispatch.status, tone: 'pending' as const };
            const date = dispatch.sentAt ?? dispatch.attemptedAt ?? dispatch.createdAt;
            return (
              <article key={dispatch.id} className="purchasing-dispatch-item">
                <div className={`purchasing-dispatch-icon ${state.tone}`}>
                  {state.tone === 'success' ? <CheckCircle2 size={17} /> : state.tone === 'danger' ? <AlertCircle size={17} /> : <Clock3 size={17} />}
                </div>
                <div className="purchasing-dispatch-content">
                  <div className="purchasing-dispatch-topline">
                    <strong>{state.label}</strong>
                    <span className={`purchasing-dispatch-status ${state.tone}`}>{state.label}</span>
                  </div>
                  <p>
                    À <b>{dispatch.recipient}</b>
                    {dispatch.senderEmail ? <> · depuis {dispatch.senderName ? `${dispatch.senderName} <${dispatch.senderEmail}>` : dispatch.senderEmail}</> : null}
                  </p>
                  <small>
                    {dateTimeLabel(date)} · {dispatch.provider ? providerLabels[dispatch.provider] ?? dispatch.provider : 'Transport non renseigné'}
                    {dispatch.subject ? ` · ${dispatch.subject}` : ''}
                  </small>
                  {dispatch.errorMessage ? <div className="purchasing-dispatch-error">{dispatch.errorMessage}</div> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="purchasing-dispatch-empty">Aucun e-mail n’a encore été envoyé pour cette commande.</p>
      )}
    </section>
  );
}

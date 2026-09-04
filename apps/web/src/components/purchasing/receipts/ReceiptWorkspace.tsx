import { useState } from 'react';
import { ChevronRight, PackageCheck, ScanLine } from 'lucide-react';
import { api } from '../../../api/client';
import type { PurchaseOrder, PurchaseReceipt, PurchasingBootstrap } from '../../../types';
import {
  Empty,
  Pagination,
  ReceiptComparisonSummary,
  ReceiptStatus,
  dateLabel,
  messageOf,
} from '../components/PurchasingUi';
import { ReceiptImport } from './ReceiptImport';
import { ReceiptReview } from './ReceiptReview';
import { Modal } from '../../ui/Modal';

export function ReceiptsView({
  bootstrap,
  receipts,
  orders,
  page,
  total,
  onPageChange,
  token,
  can,
  flash,
  onChanged,
}: {
  bootstrap: PurchasingBootstrap;
  receipts: PurchaseReceipt[];
  orders: PurchaseOrder[];
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  token: string;
  can: (permission: string) => boolean;
  flash: (kind: 'success' | 'error', message: string) => void;
  onChanged: () => void;
}) {
  const [order, setOrder] = useState<PurchaseOrder>();
  const [reviewing, setReviewing] = useState<PurchaseReceipt>();
  const [working, setWorking] = useState<string>();
  const [importPickerOpen, setImportPickerOpen] = useState(false);
  const receivable = orders.filter((item) =>
    ['ACKNOWLEDGED', 'PARTIALLY_RECEIVED'].includes(item.status),
  );

  const validate = async (receipt: PurchaseReceipt) => {
    setWorking(receipt.id);
    try {
      await api.validatePurchaseReceipt(token, receipt.id);
      flash('success', 'Réception validée : les mouvements Stocks ont été créés une seule fois.');
      onChanged();
    } catch (err) {
      flash('error', messageOf(err));
    } finally {
      setWorking(undefined);
    }
  };

  return (
    <section className="card-modern">
      <div className="section-header-modern">
        <div className="section-info">
          <span className="card-title">Bons de livraison et réceptions</span>
          <span className="section-tagline">Contrôlez les écarts avant toute entrée en stock.</span>
        </div>
        {can('purchasing.receive') ? (
          <button className="btn btn-primary" onClick={() => setImportPickerOpen(true)}>
            <ScanLine size={17} /> Analyser un bon de livraison
          </button>
        ) : null}
      </div>
      {receipts.length ? (
        <div className="table-wrapper">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Commande</th>
                <th>BL</th>
                <th>Date</th>
                <th>Comparaison</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td>
                    {receipt.order?.number ?? '—'}
                    <small>{receipt.order?.supplierNameSnapshot}</small>
                  </td>
                  <td>{receipt.deliveryNoteNumber || 'Saisie manuelle'}</td>
                  <td>{dateLabel(receipt.deliveryDate ?? receipt.createdAt)}</td>
                  <td>
                    <ReceiptComparisonSummary receipt={receipt} />
                  </td>
                  <td>
                    <ReceiptStatus receipt={receipt} />
                  </td>
                  <td>
                    {can('purchasing.receive') && receipt.status !== 'VALIDATED' && (
                      <div className="purchasing-row-actions">
                        <button
                          className="btn btn-secondary btn-small"
                          disabled={working === receipt.id}
                          onClick={() => {
                            setWorking(receipt.id);
                            void api
                              .purchasingReceipt(token, receipt.id)
                              .then(setReviewing)
                              .catch((err) => flash('error', messageOf(err)))
                              .finally(() => setWorking(undefined));
                          }}
                        >
                          Contrôler
                        </button>
                        {receipt.status === 'DRAFT' && (
                          <button
                            className="btn btn-primary btn-small"
                            disabled={working === receipt.id}
                            onClick={() => void validate(receipt)}
                          >
                            Valider Stocks
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={PackageCheck}
          title="Aucune réception"
          text="Sélectionnez une commande envoyée pour intégrer un BL ou saisir la livraison manuellement."
        />
      )}
      <Pagination page={page} total={total} pageSize={30} onChange={onPageChange} />
      <Modal
        isOpen={importPickerOpen}
        size="lg"
        title="Analyser un bon de livraison"
        subtitle="Choisissez la commande à rapprocher avant de lancer l’OCR."
        onClose={() => setImportPickerOpen(false)}
        bodyClassName="purchasing-receipt-order-picker"
      >
        <div className="purchasing-receivable-orders">
          {receivable.map((item) => (
            <button
              type="button"
              key={item.id}
              disabled={working === item.id}
              onClick={() => {
                setWorking(item.id);
                void api
                  .purchasingOrder(token, item.id)
                  .then((selected) => {
                    setOrder(selected);
                    setImportPickerOpen(false);
                  })
                  .catch((err) => flash('error', messageOf(err)))
                  .finally(() => setWorking(undefined));
              }}
            >
              <span>
                <strong>{item.number}</strong>
                <small>{item.supplierNameSnapshot}</small>
              </span>
              <span>
                Livraison {dateLabel(item.expectedDeliveryDate ?? item.createdAt)}
                <ChevronRight size={17} />
              </span>
            </button>
          ))}
          {!receivable.length ? (
            <Empty
              icon={PackageCheck}
              title="Aucune commande à réceptionner"
              text="Une commande doit être confirmée ou partiellement reçue pour analyser son bon de livraison."
            />
          ) : null}
        </div>
      </Modal>
      {order && (
        <ReceiptImport
          bootstrap={bootstrap}
          order={order}
          token={token}
          onClose={() => setOrder(undefined)}
          flash={flash}
          onChanged={onChanged}
        />
      )}
      {reviewing && (
        <ReceiptReview
          bootstrap={bootstrap}
          receipt={reviewing}
          token={token}
          onClose={() => setReviewing(undefined)}
          flash={flash}
          onSaved={() => {
            setReviewing(undefined);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { AlertTriangle, PackageCheck, Search } from 'lucide-react';
import { api } from '../../../api/client';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import type {
  Product,
  PurchaseReceipt,
  PurchaseReceiptLine,
  PurchasingBootstrap,
} from '../../../types';
import { Modal } from '../../ui/Modal';
import { Field, ReceiptLineBadge, messageOf } from '../components/PurchasingUi';
import { ReceiptFormFields } from './ReceiptFormFields';

type ReceiptReviewDraftLine = Omit<
  PurchaseReceiptLine,
  | 'product'
  | 'orderLine'
  | 'deliveredQuantity'
  | 'acceptedQuantity'
  | 'unitsPerOrderUnit'
  | 'unitPrice'
> & {
  deliveredQuantity: number;
  acceptedQuantity: number;
  unitsPerOrderUnit: number;
  unitPrice?: number;
};

export function ReceiptReview({
  bootstrap,
  receipt,
  token,
  onClose,
  onSaved,
  flash,
}: {
  bootstrap: PurchasingBootstrap;
  receipt: PurchaseReceipt;
  token: string;
  onClose: () => void;
  onSaved: () => void;
  flash: (kind: 'success' | 'error', message: string) => void;
}) {
  const [siteId, setSiteId] = useState(receipt.siteId);
  const [locationId, setLocationId] = useState(receipt.locationId ?? '');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState(receipt.deliveryNoteNumber ?? '');
  const [deliveryDate, setDeliveryDate] = useState(
    (receipt.deliveryDate ?? receipt.createdAt).slice(0, 10),
  );
  const [notes, setNotes] = useState(receipt.notes ?? '');
  const [lines, setLines] = useState<ReceiptReviewDraftLine[]>(() =>
    (receipt.lines ?? []).map((line) => ({
      id: line.id,
      purchaseOrderLineId: line.purchaseOrderLineId,
      productId: line.productId,
      unitId: line.unitId,
      reference: line.reference,
      label: line.label,
      deliveredQuantity: Number(line.deliveredQuantity),
      acceptedQuantity: Number(line.acceptedQuantity),
      unitsPerOrderUnit: Number(line.unitsPerOrderUnit),
      unitPrice: line.unitPrice == null ? undefined : Number(line.unitPrice),
      status: line.status,
      notes: line.notes,
    })),
  );
  const [working, setWorking] = useState(false);
  const [reviewProducts, setReviewProducts] = useState<Product[]>(() =>
    (receipt.lines ?? []).flatMap((line) => (line.product ? [line.product] : [])),
  );
  const [reviewProductSearch, setReviewProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(reviewProductSearch);
  const orderLines = receipt.order?.lines ?? [];

  useEffect(() => {
    const supplierId = receipt.order?.supplierId;
    if (!supplierId) return;
    void api
      .purchasingProducts(token, {
        supplierId,
        search: debouncedProductSearch.trim() || undefined,
        page: 1,
        pageSize: 30,
      })
      .then((response) =>
        setReviewProducts((current) => [
          ...current.filter((item) => !response.items.some((next) => next.id === item.id)),
          ...response.items,
        ]),
      )
      .catch((err) => flash('error', messageOf(err)));
  }, [debouncedProductSearch, receipt.order?.supplierId, token]);

  const updateLine = (index: number, patch: Partial<ReceiptReviewDraftLine>) =>
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );

  const associateOrderLine = (index: number, orderLineId: string) => {
    if (!orderLineId) {
      updateLine(index, { purchaseOrderLineId: null, status: 'UNEXPECTED' });
      return;
    }
    const orderLine = orderLines.find((candidate) => candidate.id === orderLineId);
    if (!orderLine) return;
    const current = lines[index];
    const remaining = Math.max(
      0,
      Number(orderLine.orderedQuantity) - Number(orderLine.receivedQuantity),
    );
    const delivered = current.deliveredQuantity;
    updateLine(index, {
      purchaseOrderLineId: orderLine.id,
      productId: orderLine.productId,
      unitId: orderLine.unitId ?? orderLine.product?.unitId,
      unitsPerOrderUnit: Number(orderLine.unitsPerOrderUnit),
      unitPrice: current.unitPrice ?? Number(orderLine.unitPrice),
      status: delivered < remaining ? 'SHORT' : delivered > remaining ? 'OVER' : 'MATCHED',
    });
  };

  const associateProduct = (index: number, productId: string) => {
    const product = reviewProducts.find((candidate) => candidate.id === productId);
    updateLine(index, {
      productId: product?.id ?? null,
      unitId: product?.unitId ?? null,
      status: product
        ? lines[index].purchaseOrderLineId
          ? 'SUBSTITUTED'
          : 'UNEXPECTED'
        : 'NEEDS_REVIEW',
    });
  };

  const save = async (validateAfter: boolean) => {
    setWorking(true);
    try {
      const updated = await api.updatePurchaseReceipt(token, receipt.id, {
        siteId,
        locationId: locationId || undefined,
        deliveryNoteDocumentId: receipt.deliveryNoteDocumentId ?? undefined,
        extractionId: receipt.extractionId ?? undefined,
        deliveryNoteNumber: deliveryNoteNumber || undefined,
        deliveryDate,
        notes: notes || undefined,
        lines: lines.map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId || undefined,
          productId: line.productId || undefined,
          unitId: line.unitId || undefined,
          reference: line.reference || undefined,
          label: line.label,
          deliveredQuantity: line.deliveredQuantity,
          acceptedQuantity: line.acceptedQuantity,
          unitsPerOrderUnit: line.unitsPerOrderUnit,
          unitPrice: line.unitPrice,
          status: line.status,
          notes: line.notes || undefined,
        })),
      });
      if (validateAfter) {
        await api.validatePurchaseReceipt(token, updated.id);
        flash('success', 'Comparaison validée et entrée Stocks créée sans doublon.');
      } else {
        flash('success', 'Corrections du bon de livraison enregistrées.');
      }
      onSaved();
    } catch (err) {
      flash('error', messageOf(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      isOpen
      size="full"
      title={`Contrôle du BL ${receipt.deliveryNoteNumber || ''}`.trim()}
      subtitle={`${receipt.order?.number ?? 'Commande'} · ${receipt.order?.supplierNameSnapshot ?? ''}`}
      onClose={onClose}
      bodyClassName="purchasing-receipt-composer"
    >
      <div className="purchasing-form-grid three">
        <ReceiptFormFields
          bootstrap={bootstrap}
          siteId={siteId}
          locationId={locationId}
          onSite={(id) => {
            setSiteId(id);
            setLocationId('');
          }}
          onLocation={setLocationId}
        />
        <Field label="Date de livraison">
          <input
            type="date"
            value={deliveryDate}
            onChange={(event) => setDeliveryDate(event.target.value)}
          />
        </Field>
        <Field label="N° du BL">
          <input
            value={deliveryNoteNumber}
            onChange={(event) => setDeliveryNoteNumber(event.target.value)}
          />
        </Field>
        <Field label="Note de contrôle">
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>
      <div className="table-wrapper">
        <label className="search-input-wrapper purchasing-review-search">
          <Search size={16} />
          <input
            className="search-input"
            value={reviewProductSearch}
            onChange={(event) => setReviewProductSearch(event.target.value)}
            placeholder="Rechercher un produit Stocks pour le rapprochement"
          />
        </label>
        <table className="table-modern comparison purchasing-review-table">
          <thead>
            <tr>
              <th>Ligne du BL</th>
              <th>Ligne commandée</th>
              <th>Produit Stocks</th>
              <th>Livré</th>
              <th>Accepté</th>
              <th>Prix HT</th>
              <th>Écart</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id}>
                <td>
                  <strong>{line.label}</strong>
                  <small>{line.reference || 'Sans référence'}</small>
                </td>
                <td>
                  <select
                    value={line.purchaseOrderLineId ?? ''}
                    onChange={(event) => associateOrderLine(index, event.target.value)}
                  >
                    <option value="">Produit inattendu</option>
                    {orderLines.map((orderLine) => (
                      <option key={orderLine.id} value={orderLine.id}>
                        {orderLine.supplierReferenceSnapshot || '—'} ·{' '}
                        {orderLine.productNameSnapshot}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={line.productId ?? ''}
                    onChange={(event) => associateProduct(index, event.target.value)}
                  >
                    <option value="">À rapprocher…</option>
                    {reviewProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.deliveredQuantity}
                    onChange={(event) =>
                      updateLine(index, { deliveredQuantity: Number(event.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max={line.deliveredQuantity}
                    step="0.001"
                    value={line.acceptedQuantity}
                    onChange={(event) =>
                      updateLine(index, { acceptedQuantity: Number(event.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={line.unitPrice ?? ''}
                    onChange={(event) =>
                      updateLine(index, {
                        unitPrice: event.target.value ? Number(event.target.value) : undefined,
                      })
                    }
                  />
                </td>
                <td>
                  <ReceiptLineBadge status={line.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="purchasing-inline-note">
        <AlertTriangle size={16} /> Les lignes sans produit peuvent être ignorées avec une quantité
        acceptée à 0. Toute autre ligne doit être rapprochée avant l’entrée en stock.
      </p>
      <div className="modal-footer purchasing-inline-footer wrap">
        <button className="btn btn-secondary" disabled={working} onClick={onClose}>
          Fermer
        </button>
        <button className="btn btn-secondary" disabled={working} onClick={() => void save(false)}>
          Enregistrer les corrections
        </button>
        <button className="btn btn-primary" disabled={working} onClick={() => void save(true)}>
          <PackageCheck size={16} /> Valider et intégrer dans Stocks
        </button>
      </div>
    </Modal>
  );
}

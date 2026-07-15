import { useState, type FormEvent } from 'react';
import { FileText, ScanLine } from 'lucide-react';
import { api } from '../../../api/client';
import type {
  PurchaseOrder,
  PurchaseReceiptLineStatus,
  PurchasingBootstrap,
  StocksOcrStatus,
} from '../../../types';
import { DocumentOcrAnalysisPanel } from '../../ui/DocumentOcrAnalysisPanel';
import { Modal } from '../../ui/Modal';
import { Field, ReceiptLineBadge, messageOf } from '../components/PurchasingUi';
import { ReceiptFormFields } from './ReceiptFormFields';

type ReceiptDraftLine = {
  purchaseOrderLineId?: string;
  productId?: string;
  unitId?: string;
  reference?: string;
  label: string;
  deliveredQuantity: number;
  acceptedQuantity: number;
  unitsPerOrderUnit: number;
  unitPrice?: number;
  status: PurchaseReceiptLineStatus;
  ordered: number;
  alreadyReceived: number;
};

export function ReceiptImport({
  bootstrap,
  order,
  token,
  onClose,
  onChanged,
  flash,
}: {
  bootstrap: PurchasingBootstrap;
  order: PurchaseOrder;
  token: string;
  onClose: () => void;
  onChanged: () => void;
  flash: (kind: 'success' | 'error', message: string) => void;
}) {
  const [mode, setMode] = useState<'ocr' | 'manual'>('ocr');
  const [siteId, setSiteId] = useState(order.siteId);
  const [locationId, setLocationId] = useState('');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('');
  const [deliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [statuses, setStatuses] = useState<StocksOcrStatus[]>([]);
  const [lines, setLines] = useState<ReceiptDraftLine[]>(() =>
    (order.lines ?? []).map((line) => {
      const remaining = Math.max(0, Number(line.orderedQuantity) - Number(line.receivedQuantity));
      return {
        purchaseOrderLineId: line.id,
        productId: line.productId,
        unitId: line.unitId ?? line.product?.unitId,
        reference: line.supplierReferenceSnapshot ?? undefined,
        label: line.productNameSnapshot,
        deliveredQuantity: remaining,
        acceptedQuantity: remaining,
        unitsPerOrderUnit: Number(line.unitsPerOrderUnit),
        unitPrice: Number(line.unitPrice),
        status: 'MATCHED',
        ordered: Number(line.orderedQuantity),
        alreadyReceived: Number(line.receivedQuantity),
      };
    }),
  );
  const [saving, setSaving] = useState(false);

  const updateStatus = (next: StocksOcrStatus) =>
    setStatuses((current) => {
      const without = current.filter((item) => item.document.id !== next.document.id);
      return [...without, next];
    });

  const updateLine = (index: number, delivered: number) =>
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              deliveredQuantity: delivered,
              acceptedQuantity: delivered,
              status:
                delivered < Math.max(0, line.ordered - line.alreadyReceived)
                  ? 'SHORT'
                  : delivered > Math.max(0, line.ordered - line.alreadyReceived)
                    ? 'OVER'
                    : 'MATCHED',
            }
          : line,
      ),
    );

  const analyze = async (files: File[]) => {
    try {
      const upload = await api.uploadPurchasingDeliveryNotes(token, order.id, files);
      if (!upload.documents.length) throw new Error('Aucun document n’a été créé.');
      const initial = upload.jobs.length
        ? upload.jobs
        : await Promise.all(
            upload.documents.map((document) =>
              api.purchasingDeliveryNoteStatus(token, document.id),
            ),
          );
      setStatuses((current) => [
        ...current.filter((item) => !initial.some((next) => next.document.id === item.document.id)),
        ...initial,
      ]);
      await Promise.all(
        upload.documents.map(async (document) => {
          let status = initial.find((item) => item.document.id === document.id);
          for (let attempt = 0; attempt < 30; attempt += 1) {
            if (!status) status = await api.purchasingDeliveryNoteStatus(token, document.id);
            updateStatus(status);
            const state = status.state.toLowerCase();
            if (status.extraction || state === 'failed' || state.includes('err')) return;
            await new Promise((resolve) => window.setTimeout(resolve, 1500));
            status = await api.purchasingDeliveryNoteStatus(token, document.id);
          }
          if (status) updateStatus(status);
        }),
      );
    } catch (error) {
      const message = messageOf(error, 'Le bon de livraison n’a pas pu être analysé.');
      flash('error', message);
      throw new Error(message);
    }
  };

  const createFromExtraction = async (extractionId: string) => {
    setSaving(true);
    try {
      await api.createReceiptFromExtraction(token, order.id, {
        extractionId,
        siteId,
        locationId: locationId || undefined,
      });
      setStatuses((current) => current.filter((status) => status.extraction?.id !== extractionId));
      flash(
        'success',
        'Bon analysé. Contrôlez les correspondances avant de valider l’entrée dans Stocks.',
      );
      onChanged();
    } catch (error) {
      flash('error', messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const saveManual = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createPurchaseReceipt(token, order.id, {
        siteId,
        locationId: locationId || undefined,
        deliveryNoteNumber: deliveryNoteNumber || undefined,
        deliveryDate,
        lines: lines.map(({ ordered: _ordered, alreadyReceived: _received, ...line }) => line),
      });
      flash('success', 'Réception enregistrée. Vérifiez-la puis validez l’entrée en stock.');
      onChanged();
      onClose();
    } catch (error) {
      flash('error', messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      size="full"
      title={`Bon de livraison · ${order.number}`}
      subtitle={order.supplierNameSnapshot}
      onClose={onClose}
      bodyClassName="purchasing-receipt-composer"
    >
      <div className="purchasing-receipt-destination">
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
      </div>
      <div className="purchasing-receipt-mode" role="tablist">
        <button
          type="button"
          className={mode === 'ocr' ? 'active' : ''}
          onClick={() => setMode('ocr')}
        >
          <ScanLine size={17} /> Analyse OCR
        </button>
        <button
          type="button"
          className={mode === 'manual' ? 'active' : ''}
          onClick={() => setMode('manual')}
        >
          <FileText size={17} /> Saisie manuelle
        </button>
      </div>
      {mode === 'ocr' ? (
        <DocumentOcrAnalysisPanel
          statuses={statuses}
          maxFiles={4}
          maxSizeBytes={20 * 1024 * 1024}
          acceptedFormats="PDF ou image · 20 Mo par fichier"
          onUpload={analyze}
          onOpenExtraction={createFromExtraction}
          heading="Suivi des analyses"
          verifyLabel={saving ? 'Création…' : 'Vérifier'}
          busy={saving}
        />
      ) : (
        <form className="purchasing-modal-form" onSubmit={saveManual}>
          <div className="purchasing-form-grid">
            <Field label="N° du BL">
              <input
                value={deliveryNoteNumber}
                onChange={(event) => setDeliveryNoteNumber(event.target.value)}
                placeholder="Facultatif"
              />
            </Field>
          </div>
          <div className="table-wrapper">
            <table className="table-modern comparison">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Commandé</th>
                  <th>Déjà reçu</th>
                  <th>Sur ce BL</th>
                  <th>Reste après</th>
                  <th>Écart</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const remainingBefore = Math.max(0, line.ordered - line.alreadyReceived);
                  const remainingAfter = Math.max(0, remainingBefore - line.acceptedQuantity);
                  return (
                    <tr key={line.purchaseOrderLineId}>
                      <td>
                        {line.label}
                        <small>{line.reference}</small>
                      </td>
                      <td>{line.ordered}</td>
                      <td>{line.alreadyReceived}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={line.deliveredQuantity}
                          onChange={(event) => updateLine(index, Number(event.target.value))}
                        />
                      </td>
                      <td>{remainingAfter}</td>
                      <td>
                        <ReceiptLineBadge status={line.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="modal-footer purchasing-inline-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button className="btn btn-primary" disabled={saving}>
              Enregistrer la comparaison
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

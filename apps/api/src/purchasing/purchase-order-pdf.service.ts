import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { PurchaseOrderEmailDocument } from './purchasing-email.transport';

@Injectable()
export class PurchaseOrderPdfService {
  build(order: PurchaseOrderEmailDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Commande ${order.number}` } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fillColor('#00a878').fontSize(22).font('Helvetica-Bold').text('ToqueHub');
      doc.fillColor('#172033').fontSize(18).text(`Bon de commande ${order.number}`, { align: 'right' });
      doc.moveDown(1.2).fontSize(10).font('Helvetica').fillColor('#475569');
      doc.text(`Établissement : ${order.organization?.name ?? '—'}`);
      doc.text(`Fournisseur : ${order.supplierNameSnapshot}`);
      doc.text(`Site de livraison : ${order.site?.name ?? '—'}`);
      doc.text(`Adresse : ${order.deliveryAddressSnapshot || order.site?.address || '—'}`);
      doc.text(`Livraison souhaitée : ${order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString('fr-FR') : 'Au plus tôt'}`);
      if (order.customerCodeSnapshot) doc.text(`N° client : ${order.customerCodeSnapshot}`);
      doc.moveDown();

      const widths = [210, 80, 80, 90];
      const x = 48;
      const header = () => {
        let cursor = x;
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9);
        ['Article', 'Quantité', 'Prix HT', 'Total HT'].forEach((label, index) => {
          doc.text(label, cursor, doc.y, { width: widths[index], align: index ? 'right' : 'left' });
          cursor += widths[index];
        });
        doc.moveDown(0.8).strokeColor('#cbd5e1').moveTo(x, doc.y).lineTo(547, doc.y).stroke().moveDown(0.4);
      };
      header();
      for (const line of order.lines) {
        if (doc.y > 720) { doc.addPage(); header(); }
        const y = doc.y;
        doc.font('Helvetica').fillColor('#172033').fontSize(9).text(
          `${line.productNameSnapshot}${line.supplierReferenceSnapshot ? `\nRéf. ${line.supplierReferenceSnapshot}` : ''}`,
          x,
          y,
          { width: widths[0] },
        );
        doc.text(`${Number(line.orderedQuantity).toLocaleString('fr-FR')} ${line.unitSymbolSnapshot ?? ''}`, x + widths[0], y, { width: widths[1], align: 'right' });
        doc.text(`${Number(line.unitPrice).toFixed(2)} ${order.currency}`, x + widths[0] + widths[1], y, { width: widths[2], align: 'right' });
        doc.text(`${Number(line.lineExcludingTax).toFixed(2)} ${order.currency}`, x + widths[0] + widths[1] + widths[2], y, { width: widths[3], align: 'right' });
        doc.y = Math.max(doc.y, y + 30);
        doc.strokeColor('#e2e8f0').moveTo(x, doc.y).lineTo(547, doc.y).stroke().moveDown(0.35);
      }
      doc.moveDown().font('Helvetica-Bold').fontSize(10).fillColor('#172033');
      if (Number(order.deliveryFeeSnapshot) > 0)
        doc.text(`Frais de livraison HT : ${Number(order.deliveryFeeSnapshot).toFixed(2)} ${order.currency}`, { align: 'right' });
      doc.text(`Total HT : ${Number(order.totalExcludingTax).toFixed(2)} ${order.currency}`, { align: 'right' });
      doc.text(`TVA : ${Number(order.totalTax).toFixed(2)} ${order.currency}`, { align: 'right' });
      doc.fillColor('#00a878').fontSize(12).text(`Total TTC : ${Number(order.totalIncludingTax).toFixed(2)} ${order.currency}`, { align: 'right' });
      if (order.supplierMessage)
        doc.moveDown().font('Helvetica').fontSize(9).fillColor('#475569').text(`Message : ${order.supplierMessage}`);
      doc.moveDown(2).fontSize(8).fillColor('#94a3b8').text('Commande générée et tracée dans ToqueHub.', { align: 'center' });
      doc.end();
    });
  }
}

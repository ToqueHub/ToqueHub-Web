import { Injectable } from '@nestjs/common';

export type RenderedPurchaseEmail = { subject: string; text: string };

@Injectable()
export class PurchasingEmailTemplateService {
  render(input: {
    order: any;
    senderName: string;
    subjectTemplate?: string | null;
    bodyTemplate?: string | null;
    signature?: string | null;
  }): RenderedPurchaseEmail {
    const order = input.order;
    const deliveryDate = order.expectedDeliveryDate
      ? new Date(order.expectedDeliveryDate).toLocaleDateString('fr-FR')
      : 'au plus tôt';
    const contact = order.supplier?.contactName || order.supplierNameSnapshot || '';
    const values: Record<string, string> = {
      supplierContact: contact,
      supplierName: order.supplierNameSnapshot || '',
      orderNumber: order.number || '',
      deliveryDate,
      total: `${Number(order.totalIncludingTax).toFixed(2)} ${order.currency}`,
      organizationName: order.organization?.name || 'ToqueHub',
      senderName: input.senderName,
      customerCode: order.customerCodeSnapshot || '',
      deliveryAddress: order.deliveryAddressSnapshot || '',
    };
    const replace = (template: string) => template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (_, key) => values[key] ?? '');
    const subject = replace(input.subjectTemplate?.trim() || 'Commande {{orderNumber}} — {{organizationName}}');
    const defaultBody = [
      'Bonjour {{supplierContact}},',
      '',
      'Veuillez trouver en pièce jointe notre commande {{orderNumber}}.',
      'Livraison souhaitée : {{deliveryDate}}.',
      order.supplierMessage || '',
      '',
      'Total TTC : {{total}}',
      '',
      'Cordialement,',
      '{{senderName}}',
    ].join('\n');
    const body = replace(input.bodyTemplate?.trim() || defaultBody).trim();
    const signature = replace(input.signature?.trim() || '');
    return { subject, text: [body, signature].filter(Boolean).join('\n\n') };
  }
}

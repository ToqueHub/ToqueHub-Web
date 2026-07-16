import { PurchasingEmailTemplateService } from './purchasing-email-template.service';

describe('PurchasingEmailTemplateService', () => {
  it('renders the supplier and order variables without leaking unresolved tokens', () => {
    const service = new PurchasingEmailTemplateService();
    const rendered = service.render({
      senderName: 'Le Central — Achats',
      subjectTemplate: 'Commande {{orderNumber}} pour {{supplierName}}',
      bodyTemplate: 'Bonjour {{supplierContact}}, total {{total}}.',
      order: {
        number: 'PO-42', currency: 'EUR', totalIncludingTax: 12.5,
        supplierNameSnapshot: 'Metro', supplier: { contactName: 'Marie' }, organization: { name: 'Le Central' },
      },
    });
    expect(rendered.subject).toBe('Commande PO-42 pour Metro');
    expect(rendered.text).toContain('Bonjour Marie, total 12.50 EUR.');
  });
});

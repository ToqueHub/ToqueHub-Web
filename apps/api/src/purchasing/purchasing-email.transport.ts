export type PurchasingEmailSettings = {
  fromEmail: string | null;
  fromName: string | null;
  replyTo: string | null;
};

export type PurchaseOrderEmailLine = {
  productNameSnapshot: string;
  supplierReferenceSnapshot: string | null;
  unitSymbolSnapshot: string | null;
  orderedQuantity: unknown;
  unitPrice: unknown;
  lineExcludingTax: unknown;
};

export type PurchaseOrderEmailDocument = {
  id: string;
  organizationId: string;
  number: string;
  currency: string;
  supplierNameSnapshot: string;
  customerCodeSnapshot: string | null;
  deliveryAddressSnapshot: string | null;
  deliveryFeeSnapshot: unknown;
  expectedDeliveryDate: Date | string | null;
  totalExcludingTax: unknown;
  totalTax: unknown;
  totalIncludingTax: unknown;
  supplierMessage: string | null;
  organization?: { name: string } | null;
  site?: { name: string; address: string | null } | null;
  lines: PurchaseOrderEmailLine[];
};

export interface PurchasingEmailTransport {
  verify(settings: PurchasingEmailSettings, organizationId: string): Promise<{
    configured: boolean;
    verifiedAt: string;
    emailId?: string;
  }>;
  sendOrder(
    settings: PurchasingEmailSettings,
    order: PurchaseOrderEmailDocument,
    pdf: Buffer,
    recipient: string,
    idempotencyKey: string,
  ): Promise<{ messageId: string | null; subject: string }>;
}

export const PURCHASING_EMAIL_TRANSPORT = Symbol('PURCHASING_EMAIL_TRANSPORT');

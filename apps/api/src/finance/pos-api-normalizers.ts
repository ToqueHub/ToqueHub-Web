type JsonObject = Record<string, unknown>;

export type NormalizedPosRow = {
  externalKey: string;
  saleDate: Date;
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  refundAmount: number;
  costAmount?: number;
  transactionCount: number;
  paymentMethod?: string;
  productCategory?: string;
  isRevenueRecord: boolean;
  metadata: JsonObject;
};

export type NormalizedPosLocation = {
  externalLocationId: string;
  name: string;
  rows: NormalizedPosRow[];
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function minor(value: unknown) {
  return number(value) / 100;
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function timestamp(...values: unknown[]) {
  for (const value of values) {
    const parsed = new Date(text(value));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function signed(value: number, refund: boolean) {
  return refund ? -Math.abs(value) : value;
}

function addLocation(
  locations: Map<string, NormalizedPosLocation>,
  externalLocationId: string,
  name: string,
) {
  const existing = locations.get(externalLocationId);
  if (existing) return existing;
  const location = { externalLocationId, name, rows: [] };
  locations.set(externalLocationId, location);
  return location;
}

export function normalizeLoyverseReceipts(
  receipts: unknown[],
  options: {
    stores?: Map<string, string>;
    payments?: Map<string, string>;
    products?: Map<string, { name: string; category?: string }>;
  } = {},
) {
  const locations = new Map<string, NormalizedPosLocation>();
  for (const rawReceipt of receipts) {
    const receipt = object(rawReceipt);
    const receiptNumber = text(receipt.receipt_number);
    const saleDate = timestamp(receipt.receipt_date, receipt.created_at, receipt.updated_at);
    if (!receiptNumber || !saleDate) continue;
    const storeId = text(receipt.store_id) || 'default';
    const location = addLocation(
      locations,
      storeId,
      options.stores?.get(storeId) ||
        (storeId === 'default' ? 'Loyverse' : `Loyverse · ${storeId}`),
    );
    const refund = text(receipt.receipt_type).toUpperCase() === 'REFUND';
    const cancelled = Boolean(receipt.cancelled_at);
    const gross = signed(number(receipt.total_money), refund);
    const vat = signed(number(receipt.total_tax), refund);
    const discount = number(receipt.total_discount);
    const paymentMethod = array(receipt.payments)
      .map((entry) => {
        const payment = object(entry);
        const id = text(payment.payment_type_id);
        return options.payments?.get(id) || text(payment.name) || id;
      })
      .filter(Boolean)
      .join(' + ');
    location.rows.push({
      // Le numéro de reçu Loyverse est unique. Utiliser la même clé canonique que l'import CSV
      // permet à l'API de remplacer le snapshot historique au lieu de doubler le chiffre d'affaires.
      externalKey: `loyverse:${receiptNumber}`,
      saleDate,
      grossAmount: gross,
      netAmount: gross - vat,
      vatAmount: vat,
      refundAmount: refund ? Math.abs(gross) : 0,
      transactionCount: !cancelled && !refund && gross !== 0 ? 1 : 0,
      paymentMethod: paymentMethod || undefined,
      isRevenueRecord: !cancelled,
      metadata: {
        provider: 'LOYVERSE',
        recordType: 'transaction',
        receiptNumber,
        status: cancelled ? 'cancelled' : refund ? 'refund' : 'complete',
        discount,
        employeeId: text(receipt.employee_id) || null,
        posDeviceId: text(receipt.pos_device_id) || null,
      },
    });

    if (cancelled) continue;

    array(receipt.line_items).forEach((rawLine, index) => {
      const line = object(rawLine);
      const variantId = text(line.variant_id);
      const itemId = text(line.item_id);
      const catalog = options.products?.get(variantId) || options.products?.get(itemId);
      const product =
        text(line.item_name) || text(line.name) || catalog?.name || text(line.variant_name);
      if (!product) return;
      const quantity = signed(number(line.quantity) || 1, refund);
      const lineGross = signed(
        number(line.total_money) ||
          number(line.gross_total_money) ||
          number(line.price) * Math.abs(quantity),
        refund,
      );
      const lineVat = signed(
        number(line.total_tax) ||
          array(line.line_taxes).reduce<number>(
            (sum, entry) => sum + number(object(entry).money_amount),
            0,
          ),
        refund,
      );
      const lineCost = signed(
        number(line.cost_total) || number(line.cost) * Math.abs(quantity),
        refund,
      );
      const lineDiscount =
        number(line.total_discount) ||
        array(line.line_discounts).reduce<number>(
          (sum, entry) => sum + number(object(entry).money_amount),
          0,
        );
      location.rows.push({
        // L'ordre des lignes est conservé dans l'export CSV et dans l'API Loyverse.
        // Cette clé reste donc identique quel que soit le canal d'import.
        externalKey: `loyverse-product:${receiptNumber}:${index}`,
        saleDate,
        grossAmount: lineGross,
        netAmount: lineGross - lineVat,
        vatAmount: lineVat,
        refundAmount: refund ? Math.abs(lineGross) : 0,
        ...(lineCost ? { costAmount: lineCost } : {}),
        transactionCount: 0,
        productCategory:
          text(line.category_name) || text(line.category) || catalog?.category || 'Non classé',
        isRevenueRecord: false,
        metadata: {
          provider: 'LOYVERSE',
          recordType: 'product_snapshot',
          receiptNumber,
          status: refund ? 'refund' : 'complete',
          product,
          quantity,
          discount: lineDiscount,
          itemId: itemId || null,
          variantId: variantId || null,
        },
      });
    });
  }
  return [...locations.values()];
}

export function normalizeZettlePurchases(
  purchases: unknown[],
  catalog: Map<string, { name: string; category?: string }> = new Map(),
) {
  const locations = new Map<string, NormalizedPosLocation>();
  for (const rawPurchase of purchases) {
    const purchase = object(rawPurchase);
    const purchaseId =
      text(purchase.purchaseUUID1) || text(purchase.purchaseUuid) || text(purchase.purchaseUUID);
    const saleDate = timestamp(purchase.timestamp, purchase.created);
    if (!purchaseId || !saleDate) continue;
    const productRows = array(purchase.products).map(object);
    const locationId =
      productRows.map((line) => text(line.fromLocationUuid)).find(Boolean) || 'default';
    const location = addLocation(
      locations,
      locationId,
      locationId === 'default' ? 'PayPal POS' : `PayPal POS · ${locationId}`,
    );
    const refund = Boolean(purchase.refund) || text(purchase.type).toUpperCase() === 'RETURN';
    const gross = signed(minor(purchase.amount), refund);
    // groupedVatAmounts contient les montants TTC regroupés par taux (par
    // exemple { "14.0": 1300 }), et non le montant de TVA. Zettle fournit la
    // vraie TVA dans vatAmount/taxAmount ; la confondre avec le regroupement
    // TTC ramenait presque tout le chiffre d'affaires net à zéro.
    const explicitVat = purchase.vatAmount ?? purchase.taxAmount;
    const productVat = productRows.reduce((sum, line) => {
      const quantity = Math.abs(number(line.quantity) || 1);
      return sum + Math.max(0, minor(line.unitPrice) * quantity - minor(line.rowTaxableAmount));
    }, 0);
    const vat = signed(explicitVat == null ? productVat : minor(explicitVat), refund);
    const discounts = array(purchase.discounts).reduce<number>(
      (sum, entry) => sum + minor(object(entry).amount),
      0,
    );
    const paymentMethod = array(purchase.payments)
      .map((entry) => text(object(entry).type))
      .filter(Boolean)
      .join(' + ');
    location.rows.push({
      externalKey: `paypal-pos-api:${purchaseId}`,
      saleDate,
      grossAmount: gross,
      netAmount: gross - vat,
      vatAmount: vat,
      refundAmount: refund ? Math.abs(gross) : 0,
      transactionCount: !refund && gross !== 0 ? 1 : 0,
      paymentMethod: paymentMethod || undefined,
      isRevenueRecord: true,
      metadata: {
        provider: 'PAYPAL_POS',
        recordType: 'transaction',
        purchaseId,
        purchaseNumber: purchase.purchaseNumber ?? null,
        status: refund ? 'refund' : 'complete',
        discount: discounts,
        staff: text(purchase.userDisplayName) || null,
      },
    });

    productRows.forEach((line, index) => {
      const productId = text(line.productUuid);
      const catalogProduct = catalog.get(productId);
      const product = text(line.name) || catalogProduct?.name || text(line.variantName);
      if (!product) return;
      const quantity = signed(number(line.quantity) || 1, refund);
      const lineGross = signed(minor(line.unitPrice) * Math.abs(quantity), refund);
      const lineNet = signed(minor(line.rowTaxableAmount), refund);
      const discountDetails = object(line.discount);
      const lineDiscount = minor(discountDetails.amount);
      location.rows.push({
        externalKey: `paypal-pos-api-product:${purchaseId}:${text(line.id) || text(line.variantUuid) || index}`,
        saleDate,
        grossAmount: lineGross,
        netAmount: lineNet || lineGross,
        vatAmount: lineNet ? lineGross - lineNet : 0,
        refundAmount: refund ? Math.abs(lineGross) : 0,
        transactionCount: 0,
        productCategory: catalogProduct?.category || 'Non classé',
        isRevenueRecord: false,
        metadata: {
          provider: 'PAYPAL_POS',
          recordType: 'product_snapshot',
          purchaseId,
          product,
          quantity,
          discount: lineDiscount,
          productId: productId || null,
          variantId: text(line.variantUuid) || null,
        },
      });
    });
  }
  return [...locations.values()];
}

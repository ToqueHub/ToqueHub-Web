import { BadRequestException, Injectable } from '@nestjs/common';
import {
  FinanceAccountCategory,
  FinanceProvider,
  FinanceSourceStatus,
  FinanceSyncRunStatus,
  FinanceSyncRunType,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import type { ConfigureFennoaDto, SyncFennoaDto } from './dto/finance.dto';
import {
  FennoaClientService,
  normalizeFennoaBaseUrl,
  type FennoaCredentials,
} from './fennoa-client.service';
import { FennoaSecretService } from './fennoa-secret.service';
import { FinancePolicy } from './finance.policy';

type UnknownRecord = Record<string, unknown>;

const DEFAULT_FENNOA_URL = 'https://app.fennoa.com/api';

type FennoaAccountingPeriod = {
  externalId: number;
  startDate: Date;
  endDate: Date;
};

export function shouldRunFullFennoaSync({
  requestedFull,
  requestedFrom,
  requestedTo,
  hasSuccessfulFullSync,
}: {
  requestedFull?: boolean;
  requestedFrom?: string;
  requestedTo?: string;
  hasSuccessfulFullSync: boolean;
}) {
  if (requestedFull) return true;
  if (requestedFrom || requestedTo) return false;
  return !hasSuccessfulFullSync;
}

export function buildFennoaSyncRanges(
  periods: FennoaAccountingPeriod[],
  { now, from, to, full }: { now: Date; from?: Date; to?: Date; full: boolean },
) {
  const sorted = [...periods].sort(
    (left, right) => left.startDate.getTime() - right.startDate.getTime(),
  );
  const current =
    sorted.find(({ startDate, endDate }) => startDate <= now && endDate >= now) ??
    [...sorted].sort((left, right) => right.endDate.getTime() - left.endDate.getTime())[0];
  if (!current) return [];
  const rangeFrom = from ?? (full ? sorted[0].startDate : current.startDate);
  const rangeTo = to ?? (full ? now : current.endDate > now ? now : current.endDate);
  if (rangeFrom > rangeTo) return [];
  return sorted
    .filter(
      ({ startDate, endDate }) => startDate <= rangeTo && endDate >= rangeFrom && startDate <= now,
    )
    .map((period) => ({
      externalId: period.externalId,
      from: new Date(Math.max(period.startDate.getTime(), rangeFrom.getTime())),
      to: new Date(Math.min(period.endDate.getTime(), rangeTo.getTime(), now.getTime())),
    }))
    .filter((range) => range.from <= range.to);
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function first(value: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
  }
  return undefined;
}

function textValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(
    String(value ?? '')
      .replace(/\s/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function booleanValue(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function numberArray(value: unknown) {
  const values = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  return values
    .map((item) => numberValue(typeof item === 'object' ? first(record(item), ['id']) : item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function sanitizedFennoaPayload(value: unknown): Prisma.InputJsonValue | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizedFennoaPayload(item) ?? null) as Prisma.InputJsonArray;
  }
  if (!value || typeof value !== 'object') {
    return value === undefined ? undefined : (value as Prisma.InputJsonValue);
  }
  const output: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, item] of Object.entries(value as UnknownRecord)) {
    if (['identity_number', 'identityNumber', 'personal_identity_code'].includes(key)) continue;
    const sanitized = sanitizedFennoaPayload(item);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function isoDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function inferFinanceAccountCategory(code: string): FinanceAccountCategory {
  const number = Number.parseInt(code.replace(/\D/g, '').slice(0, 4), 10);
  if (number >= 3000 && number <= 3999) return FinanceAccountCategory.REVENUE;
  if (number >= 4000 && number <= 4999) return FinanceAccountCategory.MATERIAL_PURCHASES;
  if (number >= 5000 && number <= 6799) return FinanceAccountCategory.PAYROLL;
  if (number >= 6800 && number <= 8999) return FinanceAccountCategory.OTHER_OPEX;
  if (number >= 1900 && number <= 1999) return FinanceAccountCategory.CASH;
  if (number >= 9000 && number <= 9799) return FinanceAccountCategory.FINANCIAL;
  if (number >= 9800 && number <= 9999) return FinanceAccountCategory.TAX;
  return FinanceAccountCategory.OTHER;
}

function normalizeAccount(raw: unknown) {
  const row = record(raw);
  const code = textValue(
    first(row, ['number', 'accountNumber', 'account', 'code', 'account_number']),
  );
  if (!code) return null;
  return {
    code,
    name: textValue(first(row, ['name', 'accountName', 'nameFi', 'name_fi'])) || `Compte ${code}`,
    nameSv: textValue(first(row, ['nameSv', 'name_sv'])) || null,
    nameEn: textValue(first(row, ['nameEn', 'name_en'])) || null,
    vatCodeId: numberValue(first(row, ['vatCodeId', 'vat_code_id'])) || null,
    vatCodeType: numberValue(first(row, ['vatCodeType', 'vat_code_type'])) || null,
    vatCode: textValue(first(row, ['vatCode', 'vat_code'])) || null,
    isActive: !['0', 'false', 'inactive'].includes(
      textValue(first(row, ['active', 'isActive', 'is_active', 'status'])).toLowerCase(),
    ),
  };
}

export function normalizeFennoaPeriod(raw: unknown) {
  const row = record(raw);
  const externalId = numberValue(
    first(row, ['id', 'accountingPeriodId', 'accounting_period_id', 'periodId', 'period_id']),
  );
  const startDate = dateValue(
    first(row, ['startDate', 'start_date', 'start', 'dateStart', 'date_start', 'beginDate']),
  );
  const endDate = dateValue(first(row, ['endDate', 'end_date', 'end', 'dateEnd', 'date_end']));
  if (!externalId || !startDate || !endDate) return null;
  return { externalId, startDate, endDate };
}

export function normalizeFennoaLedgerRow(raw: unknown, index: number, sourceId: string) {
  const row = record(raw);
  const accountCode = textValue(
    first(row, ['accountNumber', 'account', 'accountNo', 'account_number']),
  );
  const entryDate = dateValue(first(row, ['date', 'entryDate', 'accountingDate', 'voucherDate']));
  if (!accountCode || !entryDate) return null;
  const debit = numberValue(first(row, ['debit', 'debet', 'debitAmount']));
  const credit = numberValue(first(row, ['credit', 'creditAmount']));
  const statementId =
    textValue(
      first(row, ['statementId', 'statement_id', 'entryId', 'entry_id', 'transactionId']),
    ) || null;
  const series = textValue(first(row, ['series', 'voucherSeries'])) || null;
  const number = numberValue(first(row, ['number', 'voucherNumber'])) || null;
  const rawIdentity = statementId
    ? [sourceId, statementId].join('|')
    : [sourceId, accountCode, isoDay(entryDate), series, number, debit, credit, index].join('|');
  return {
    externalKey: createHash('sha256').update(rawIdentity).digest('hex'),
    externalStatementId: statementId,
    accountCode,
    entryDate,
    debit: new Prisma.Decimal(debit),
    credit: new Prisma.Decimal(credit),
    openingBalance:
      first(row, ['openingBalance', 'opening', 'balanceStart']) == null
        ? null
        : new Prisma.Decimal(
            numberValue(first(row, ['openingBalance', 'opening', 'balanceStart'])),
          ),
    closingBalance:
      first(row, ['closingBalance', 'closing', 'balanceEnd', 'balance']) == null
        ? null
        : new Prisma.Decimal(
            numberValue(first(row, ['closingBalance', 'closing', 'balanceEnd', 'balance'])),
          ),
    description: textValue(first(row, ['description', 'message', 'explanation', 'name'])) || null,
    series,
    number,
    entryType: numberValue(first(row, ['type', 'entryType'])) || null,
    sourceEntityId: textValue(first(row, ['sourceId', 'sourceEntityId', 'id'])) || null,
    sourceUrl: textValue(first(row, ['url', 'sourceUrl'])) || null,
    dimensions: row.dimensions == null ? undefined : (row.dimensions as Prisma.InputJsonValue),
  };
}

export function normalizeFennoaCustomer(raw: unknown) {
  const wrapper = record(raw);
  const row = record(first(wrapper, ['Customer', 'customer']) ?? raw);
  const fennoaId = numberValue(first(row, ['id', 'customer_id', 'customerId']));
  const name = textValue(first(row, ['name', 'customer_name', 'customerName']));
  if (!fennoaId || !name) return null;
  return {
    fennoaId,
    name,
    name2: textValue(first(row, ['name2', 'name_2'])) || null,
    contactName: textValue(first(row, ['contact_person', 'contactPerson'])) || null,
    email: textValue(first(row, ['email'])) || null,
    phone: textValue(first(row, ['phone', 'telephone'])) || null,
    fax: textValue(first(row, ['fax'])) || null,
    website: textValue(first(row, ['website', 'url'])) || null,
    address: textValue(first(row, ['address', 'street_address'])) || null,
    postalCode: textValue(first(row, ['postalcode', 'postal_code'])) || null,
    city: textValue(first(row, ['city'])) || null,
    countryCode: textValue(first(row, ['country_id', 'country_code', 'country'])) || null,
    businessId: textValue(first(row, ['business_id', 'businessId'])) || null,
    vatNumber: textValue(first(row, ['vat_number', 'vatNumber'])) || null,
    accountTypeId: numberValue(first(row, ['account_type_id', 'accountTypeId'])) || null,
    accountCode: textValue(first(row, ['account_code', 'accountCode'])) || null,
    customerNumber: textValue(first(row, ['customer_no', 'customerNumber'])) || null,
    customerGroupIds: numberArray(
      first(row, ['customer_group_ids', 'customerGroupIds']) ??
        first(wrapper, ['CustomerGroup', 'CustomerGroups']),
    ),
    eInvoiceAddress: textValue(first(row, ['einvoice_address', 'eInvoiceAddress'])) || null,
    eInvoiceOperatorId:
      textValue(first(row, ['einvoice_operator_id', 'eInvoiceOperatorId'])) || null,
    eInvoiceUnitNumber:
      numberValue(first(row, ['einvoice_unit_number', 'eInvoiceUnitNumber'])) || null,
    invoiceDeliveryMethod:
      textValue(first(row, ['sales_invoice_delivery_method', 'invoiceDeliveryMethod'])) || null,
    localeId: numberValue(first(row, ['locale_id', 'localeId'])) || null,
    localeCode: textValue(first(row, ['locale_code', 'localeCode'])) || null,
    paymentTermId: numberValue(first(row, ['terms_of_payment', 'paymentTermId'])) || null,
    auxiliaryNameId:
      numberValue(first(row, ['auxliary_name_id', 'auxiliary_name_id', 'auxiliaryNameId'])) || null,
    salesPriceListId: numberValue(first(row, ['sales_pricelist_id', 'salesPriceListId'])) || null,
    salesTaxClassId:
      numberValue(first(row, ['sales_invoice_taxclass_id', 'salesTaxClassId'])) || null,
    invoiceIncludesVat: booleanValue(first(row, ['sales_invoice_incl_vat', 'invoiceIncludesVat'])),
    factoringPartnerId:
      numberValue(first(row, ['sales_factoring_partner_id', 'factoringPartnerId'])) || null,
    autoReminderOverride: booleanValue(
      first(row, ['auto_reminder_override', 'autoReminderOverride']),
    ),
    autoReminderEnabled: booleanValue(first(row, ['auto_reminder_setting', 'autoReminderEnabled'])),
    autoReminderCount:
      numberValue(first(row, ['auto_reminder_count', 'autoReminderCount'])) || null,
    autoReminderInterval:
      numberValue(first(row, ['auto_reminder_interval', 'autoReminderInterval'])) || null,
    autoReminderLastStep:
      numberValue(first(row, ['auto_reminder_last_step', 'autoReminderLastStep'])) || null,
    ourReference: textValue(first(row, ['our_reference', 'ourReference'])) || null,
    yourReference: textValue(first(row, ['your_reference', 'yourReference'])) || null,
    shippingName: textValue(first(row, ['shipping_name', 'shippingName'])) || null,
    shippingName2: textValue(first(row, ['shipping_name2', 'shippingName2'])) || null,
    shippingAddress: textValue(first(row, ['shipping_address', 'shippingAddress'])) || null,
    shippingPostalCode:
      textValue(first(row, ['shipping_postalcode', 'shippingPostalCode'])) || null,
    shippingCity: textValue(first(row, ['shipping_city', 'shippingCity'])) || null,
    shippingCountryCode:
      textValue(first(row, ['shipping_country_code', 'shippingCountryCode'])) || null,
    shippingCountryId:
      numberValue(first(row, ['shipping_country_id', 'shippingCountryId'])) || null,
    currencyId: numberValue(first(row, ['currency_id', 'currencyId'])) || null,
    salesIsRefused: booleanValue(first(row, ['sales_is_refused', 'salesIsRefused'])),
    fennoaOwnerUserId: numberValue(first(row, ['owner_user_id', 'ownerUserId'])) || null,
    fennoaDescription: textValue(first(row, ['description'])) || null,
    fennoaTitle: textValue(first(row, ['title'])) || null,
    fennoaModifiedAt: dateValue(first(row, ['modified', 'updated_at', 'updatedAt'])),
    fennoaPayload: sanitizedFennoaPayload(raw),
  };
}

export function normalizeFennoaSalesInvoice(raw: unknown) {
  const wrapper = record(raw);
  const row = record(first(wrapper, ['SalesInvoice', 'salesInvoice', 'invoice']) ?? raw);
  const fennoaId = numberValue(first(row, ['id', 'sales_invoice_id', 'invoiceId']));
  if (!fennoaId) return null;
  const currency = record(first(wrapper, ['Currency', 'currency']) ?? row.currency);
  return {
    fennoaId,
    invoiceNumber: textValue(first(row, ['invoice_no', 'invoiceNumber'])) || null,
    invoiceTypeId: numberValue(first(row, ['invoice_type_id', 'invoiceTypeId'])) || null,
    status: textValue(first(row, ['status', 'state'])) || null,
    customerFennoaId: numberValue(first(row, ['customer_id', 'customerId'])) || null,
    customerName: textValue(first(row, ['name', 'customer_name', 'customerName'])) || null,
    invoiceDate: dateValue(first(row, ['invoice_date', 'invoiceDate'])),
    dueDate: dateValue(first(row, ['due_date', 'dueDate'])),
    createdInFennoaAt: dateValue(first(row, ['created', 'created_at', 'createdAt'])),
    totalNet: new Prisma.Decimal(numberValue(first(row, ['total_net', 'totalNet']))),
    totalGross: new Prisma.Decimal(numberValue(first(row, ['total_gross', 'totalGross']))),
    totalVat: new Prisma.Decimal(numberValue(first(row, ['total_vat', 'totalVat']))),
    totalPaid: new Prisma.Decimal(numberValue(first(row, ['total_paid', 'totalPaid']))),
    totalDue: new Prisma.Decimal(numberValue(first(row, ['total_due', 'totalDue']))),
    currencyCode:
      textValue(first(currency, ['code'])) || textValue(first(row, ['currency_code'])) || null,
    bankingReference: textValue(first(row, ['banking_reference', 'bankingReference'])) || null,
    ourReference: textValue(first(row, ['our_reference', 'ourReference'])) || null,
    yourReference: textValue(first(row, ['your_reference', 'yourReference'])) || null,
    deliveryMethod: textValue(first(row, ['delivery_method', 'deliveryMethod'])) || null,
    deliveryTerms: textValue(first(row, ['delivery_terms', 'deliveryTerms'])) || null,
    orderIdentifier: textValue(first(row, ['order_identifier', 'orderIdentifier'])) || null,
    agreementIdentifier:
      textValue(first(row, ['agreement_identifier', 'agreementIdentifier'])) || null,
    notesInternal: textValue(first(row, ['notes_internal', 'notesInternal'])) || null,
    invoiceRows: sanitizedFennoaPayload(
      first(wrapper, ['SalesInvoiceRow', 'SalesInvoiceRows', 'rows']) ?? [],
    ),
    payments: sanitizedFennoaPayload(
      first(wrapper, ['SalesInvoicePayment', 'SalesInvoicePayments', 'payments']) ?? [],
    ),
    deliveries: sanitizedFennoaPayload(
      first(wrapper, ['SalesInvoiceDelivery', 'SalesInvoiceDeliveries', 'deliveries']) ?? [],
    ),
    fennoaPayload: sanitizedFennoaPayload(raw),
  };
}

export function normalizeFennoaLockingPeriods(rows: unknown[]) {
  const normalized = {
    accountingLockedAt: null as Date | null,
    salesLockedAt: null as Date | null,
    purchasesLockedAt: null as Date | null,
  };
  for (const raw of rows) {
    const row = record(raw);
    const code = textValue(first(row, ['code', 'type'])).toLowerCase();
    const value = dateValue(first(row, ['value', 'date']));
    if (code === 'accounting_locked') normalized.accountingLockedAt = value;
    if (code === 'sales_invoices_locked') normalized.salesLockedAt = value;
    if (code === 'purchase_invoices_locked') normalized.purchasesLockedAt = value;

    normalized.accountingLockedAt ??= dateValue(
      first(row, ['accountingLockedUntil', 'accountingLockDate', 'accounting']),
    );
    normalized.salesLockedAt ??= dateValue(
      first(row, ['salesLockedUntil', 'salesLockDate', 'sales']),
    );
    normalized.purchasesLockedAt ??= dateValue(
      first(row, ['purchasesLockedUntil', 'purchaseLockDate', 'purchases']),
    );
  }
  return normalized;
}

export function flattenFennoaBudgetRows(
  value: unknown,
  context: UnknownRecord = {},
): UnknownRecord[] {
  if (Array.isArray(value)) return value.flatMap((item) => flattenFennoaBudgetRows(item, context));
  const row = record(value);
  if (!Object.keys(row).length) return [];
  const nextContext = {
    budgetId: first(row, ['budgetId', 'budget_id', 'id']) ?? context.budgetId,
    budgetName: first(row, ['budgetName', 'budget_name', 'name']) ?? context.budgetName,
    accountingPeriodId:
      first(row, ['accountingPeriodId', 'accounting_period_id', 'periodId', 'period_id']) ??
      context.accountingPeriodId,
    accountCode:
      first(row, ['accountNumber', 'account_code', 'account', 'accountNo', 'account_number']) ??
      context.accountCode,
  };
  const accountCode = nextContext.accountCode;
  const directMonth = first(row, ['month', 'period', 'periodNumber']);
  const directAmount = first(row, ['amount', 'sum', 'value', 'budget']);
  const result: UnknownRecord[] = [];
  if (accountCode && directMonth != null && directAmount != null) {
    result.push({ ...nextContext, ...row });
  } else if (accountCode) {
    if (Array.isArray(row.months)) {
      for (const rawMonth of row.months) {
        const monthRow = record(rawMonth);
        const month = first(monthRow, ['month', 'period', 'periodNumber']);
        const amount = first(monthRow, ['amount', 'sum', 'value', 'budget']);
        if (month != null && amount != null) {
          result.push({ ...nextContext, accountNumber: accountCode, month, amount });
        }
      }
    } else {
      for (let month = 1; month <= 12; month += 1) {
        const amount = first(row, [`month${month}`, `period${month}`, `m${month}`, String(month)]);
        if (amount != null)
          result.push({ ...nextContext, accountNumber: accountCode, month, amount });
      }
    }
  }
  for (const key of ['rows', 'items', 'accounts', 'lines', 'budgets', 'data']) {
    if (row[key] != null) result.push(...flattenFennoaBudgetRows(row[key], nextContext));
  }
  return result;
}

type FennoaPeriodPayload = {
  externalId: number;
  from: Date;
  to: Date;
  ledger: Array<NonNullable<ReturnType<typeof normalizeFennoaLedgerRow>>>;
  budgetRows: UnknownRecord[];
};

@Injectable()
export class FennoaSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: FinancePolicy,
    private readonly secrets: FennoaSecretService,
    private readonly client: FennoaClientService,
  ) {}

  async configure(organizationId: string, actor: AuthenticatedUser, dto: ConfigureFennoaDto) {
    this.policy.assertPermission(actor, 'finance.manage');
    const existing = await this.prisma.financeSettings.findUnique({ where: { organizationId } });
    if (!existing) throw new BadRequestException('Le module Finance doit être installé.');
    const apiKey = dto.apiKey?.trim();
    if (!apiKey && !existing.fennoaApiKeyEncrypted) {
      throw new BadRequestException(
        'La clé API Fennoa est requise lors de la première configuration.',
      );
    }
    const baseUrl = normalizeFennoaBaseUrl(
      dto.baseUrl || existing.fennoaBaseUrl || DEFAULT_FENNOA_URL,
    );
    const updated = await this.prisma.financeSettings.update({
      where: { organizationId },
      data: {
        fennoaBaseUrl: baseUrl,
        fennoaApiVersion: dto.apiVersion || existing.fennoaApiVersion || 'v1',
        fennoaUsername: dto.username.trim(),
        ...(apiKey
          ? {
              fennoaApiKeyEncrypted: this.secrets.encrypt(apiKey),
              fennoaApiKeyMask: this.secrets.mask(apiKey),
              fennoaApiKeyCipherVersion: 1,
              fennoaApiKeyUpdatedAt: new Date(),
            }
          : {}),
        fennoaLastTestedAt: null,
        fennoaLastError: null,
      },
    });
    await this.source(organizationId);
    return this.publicConfiguration(updated);
  }

  async test(organizationId: string, actor: AuthenticatedUser) {
    this.policy.assertPermission(actor, 'finance.manage');
    const credentials = await this.credentials(organizationId);
    const source = await this.source(organizationId);
    try {
      const result = await this.client.test(credentials);
      const testedAt = new Date();
      await Promise.all([
        this.prisma.financeSettings.update({
          where: { organizationId },
          data: { fennoaLastTestedAt: testedAt, fennoaLastError: null },
        }),
        this.prisma.financeDataSource.update({
          where: { id: source.id },
          data: { status: FinanceSourceStatus.ATTENTION },
        }),
      ]);
      return { ok: true, testedAt, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test Fennoa échoué.';
      await Promise.all([
        this.prisma.financeSettings.update({
          where: { organizationId },
          data: { fennoaLastTestedAt: new Date(), fennoaLastError: message },
        }),
        this.prisma.financeDataSource.update({
          where: { id: source.id },
          data: { status: FinanceSourceStatus.ERROR },
        }),
      ]);
      throw error;
    }
  }

  async sync(organizationId: string, actor: AuthenticatedUser, dto: SyncFennoaDto) {
    this.policy.assertPermission(actor, 'finance.manage');
    const credentials = await this.credentials(organizationId);
    const source = await this.source(organizationId);
    const hasSuccessfulFullSync = Boolean(
      await this.prisma.financeSyncRun.findFirst({
        where: {
          organizationId,
          sourceId: source.id,
          type: FinanceSyncRunType.FULL,
          status: FinanceSyncRunStatus.SUCCEEDED,
        },
        select: { id: true },
      }),
    );
    const full = shouldRunFullFennoaSync({
      requestedFull: dto.full,
      requestedFrom: dto.from,
      requestedTo: dto.to,
      hasSuccessfulFullSync,
    });
    const automaticFullBackfill = full && !dto.full && !dto.from && !dto.to;
    const run = await this.prisma.financeSyncRun.create({
      data: {
        organizationId,
        sourceId: source.id,
        type: full ? FinanceSyncRunType.FULL : FinanceSyncRunType.INCREMENTAL,
      },
    });
    try {
      const warnings: string[] = [];
      const optionalFetch = async (label: string, request: () => Promise<unknown[]>) => {
        try {
          return await request();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'accès refusé';
          warnings.push(`${label} : ${message}`);
          return [];
        }
      };
      const customerModifiedAfter =
        !full && source.lastSyncedAt
          ? isoDay(new Date(source.lastSyncedAt.getTime() - 86_400_000))
          : undefined;
      const [rawAccounts, rawPeriods, rawLocks, rawCustomers, rawSalesInvoices] = await Promise.all(
        [
          this.client.accounts(credentials),
          this.client.periods(credentials),
          this.client.lockingPeriods(credentials),
          optionalFetch('Clients Fennoa non synchronisés', () =>
            this.client.customers(credentials, customerModifiedAfter),
          ),
          optionalFetch('Factures clients Fennoa non synchronisées', () =>
            this.client.salesInvoices(credentials),
          ),
        ],
      );
      const accounts = rawAccounts
        .map(normalizeAccount)
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const periods = rawPeriods
        .map(normalizeFennoaPeriod)
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const customers = rawCustomers
        .map(normalizeFennoaCustomer)
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const salesInvoices = rawSalesInvoices
        .map(normalizeFennoaSalesInvoice)
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (!periods.length)
        throw new BadRequestException('Fennoa ne renvoie aucun exercice comptable exploitable.');
      const now = new Date();
      const ranges = buildFennoaSyncRanges(periods, {
        now,
        from: dto.from ? new Date(dto.from) : undefined,
        to: dto.to ? new Date(dto.to) : undefined,
        full,
      });
      if (!ranges.length) {
        throw new BadRequestException('La période demandée ne recoupe aucun exercice Fennoa.');
      }
      const periodPayloads: FennoaPeriodPayload[] = [];
      let ledgerIndex = 0;
      for (const range of ranges) {
        const [rawLedger, rawBudgets] = await Promise.all([
          this.client.ledger(credentials, isoDay(range.from), isoDay(range.to)),
          this.client.budgets(credentials, range.externalId),
        ]);
        const ledger = rawLedger
          .map((item, index) => normalizeFennoaLedgerRow(item, ledgerIndex + index, source.id))
          .filter((item): item is NonNullable<typeof item> => Boolean(item));
        ledgerIndex += rawLedger.length;
        periodPayloads.push({
          ...range,
          ledger,
          budgetRows: flattenFennoaBudgetRows(rawBudgets, {
            accountingPeriodId: range.externalId,
          }),
        });
      }
      const from = ranges[0].from;
      const to = ranges[ranges.length - 1].to;
      const ledgerRowsCount = periodPayloads.reduce(
        (sum, payload) => sum + payload.ledger.length,
        0,
      );
      const budgetRowsCount = periodPayloads.reduce(
        (sum, payload) => sum + payload.budgetRows.length,
        0,
      );
      const locking = normalizeFennoaLockingPeriods(rawLocks);
      const syncedAt = new Date();

      await this.prisma.$transaction(
        async (tx) => {
          for (const account of accounts) {
            const category = inferFinanceAccountCategory(account.code);
            await tx.financeAccount.upsert({
              where: { organizationId_code: { organizationId, code: account.code } },
              create: { organizationId, ...account, category, lastSyncedAt: syncedAt },
              update: {
                ...account,
                lastSyncedAt: syncedAt,
              },
            });
          }
          for (const period of periods) {
            await tx.financeAccountingPeriod.upsert({
              where: {
                organizationId_externalId: { organizationId, externalId: period.externalId },
              },
              create: {
                organizationId,
                ...period,
                ...locking,
                externalId: period.externalId,
                lastSyncedAt: syncedAt,
              },
              update: {
                ...period,
                ...locking,
                externalId: period.externalId,
                lastSyncedAt: syncedAt,
              },
            });
          }
          for (const payload of periodPayloads) {
            await tx.financeLedgerEntry.deleteMany({
              where: {
                organizationId,
                sourceId: source.id,
                entryDate: { gte: payload.from, lte: payload.to },
              },
            });
            if (payload.ledger.length) {
              await tx.financeLedgerEntry.createMany({
                data: payload.ledger.map((entry) => ({
                  organizationId,
                  sourceId: source.id,
                  ...entry,
                  syncedAt,
                })),
                skipDuplicates: true,
              });
            }
            await tx.financeBudgetLine.deleteMany({
              where: {
                organizationId,
                accountingPeriodExternalId: payload.externalId,
              },
            });
            if (payload.budgetRows.length) {
              await tx.financeBudgetLine.createMany({
                data: payload.budgetRows
                  .map((item, index) => {
                    const accountCode = textValue(
                      first(item, ['accountNumber', 'account_code', 'account', 'accountNo']),
                    );
                    const month = numberValue(first(item, ['month', 'period', 'periodNumber']));
                    const amount = numberValue(first(item, ['amount', 'sum', 'value', 'budget']));
                    return {
                      organizationId,
                      externalKey: createHash('sha256')
                        .update(
                          [
                            payload.externalId,
                            first(item, ['budgetId']),
                            accountCode,
                            month,
                            index,
                          ].join('|'),
                        )
                        .digest('hex'),
                      externalBudgetId: numberValue(first(item, ['budgetId'])) || null,
                      budgetName: textValue(first(item, ['budgetName'])) || null,
                      accountingPeriodExternalId: payload.externalId,
                      accountCode,
                      month,
                      amount: new Prisma.Decimal(amount),
                      syncedAt,
                    };
                  })
                  .filter(
                    ({ accountCode, month }) => Boolean(accountCode) && month >= 1 && month <= 12,
                  ),
                skipDuplicates: true,
              });
            }
          }
          await this.syncCustomers(tx, organizationId, customers, syncedAt);
          await this.syncSalesInvoices(tx, organizationId, salesInvoices, syncedAt);
          const coverageStart =
            source.coverageStart && source.coverageStart < from ? source.coverageStart : from;
          const coverageEnd =
            source.coverageEnd && source.coverageEnd > to ? source.coverageEnd : to;
          await tx.financeDataSource.update({
            where: { id: source.id },
            data: {
              status: FinanceSourceStatus.READY,
              lastSyncedAt: syncedAt,
              coverageStart,
              coverageEnd,
            },
          });
          await tx.financeSettings.update({
            where: { organizationId },
            data: { fennoaLastError: null },
          });
          await tx.financeSyncRun.update({
            where: { id: run.id },
            data: {
              status: FinanceSyncRunStatus.SUCCEEDED,
              completedAt: syncedAt,
              periodStart: from,
              periodEnd: to,
              accountsCount: accounts.length,
              ledgerRowsCount,
              budgetRowsCount,
              metadata: {
                automaticFullBackfill,
                customersCount: customers.length,
                salesInvoicesCount: salesInvoices.length,
                warnings,
                periods: periodPayloads.map((payload) => ({
                  externalId: payload.externalId,
                  from: isoDay(payload.from),
                  to: isoDay(payload.to),
                  ledgerRowsCount: payload.ledger.length,
                  budgetRowsCount: payload.budgetRows.length,
                })),
              },
            },
          });
        },
        { maxWait: 10_000, timeout: 120_000 },
      );
      return {
        ok: true,
        runId: run.id,
        from,
        to,
        full,
        automaticFullBackfill,
        periodsCount: periods.length,
        periodsSyncedCount: periodPayloads.length,
        accountsCount: accounts.length,
        ledgerRowsCount,
        budgetRowsCount,
        customersCount: customers.length,
        salesInvoicesCount: salesInvoices.length,
        warnings,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Synchronisation Fennoa échouée.';
      await Promise.all([
        this.prisma.financeSyncRun.update({
          where: { id: run.id },
          data: {
            status: FinanceSyncRunStatus.FAILED,
            completedAt: new Date(),
            errorMessage: message,
          },
        }),
        this.prisma.financeDataSource.update({
          where: { id: source.id },
          data: { status: FinanceSourceStatus.ERROR },
        }),
        this.prisma.financeSettings.update({
          where: { organizationId },
          data: { fennoaLastError: message },
        }),
      ]);
      throw error;
    }
  }

  private async syncCustomers(
    tx: Prisma.TransactionClient,
    organizationId: string,
    customers: Array<NonNullable<ReturnType<typeof normalizeFennoaCustomer>>>,
    syncedAt: Date,
  ) {
    for (const customer of customers) {
      let existing = await tx.catererClient.findUnique({
        where: {
          organizationId_fennoaId: { organizationId, fennoaId: customer.fennoaId },
        },
      });
      if (!existing) {
        const matches: Prisma.CatererClientWhereInput[] = [];
        if (customer.businessId) matches.push({ businessId: customer.businessId });
        if (customer.vatNumber) matches.push({ vatNumber: customer.vatNumber });
        if (customer.customerNumber) matches.push({ customerNumber: customer.customerNumber });
        if (matches.length) {
          existing = await tx.catererClient.findFirst({
            where: { organizationId, OR: matches },
          });
        }
      }
      if (!existing) {
        existing = await tx.catererClient.findFirst({
          where: {
            organizationId,
            fennoaId: null,
            name: { equals: customer.name, mode: 'insensitive' },
          },
        });
      }
      const conflictingName = await tx.catererClient.findFirst({
        where: {
          organizationId,
          name: { equals: customer.name, mode: 'insensitive' },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        select: { id: true },
      });
      const uniqueName = conflictingName
        ? `${customer.name} · Fennoa ${customer.customerNumber || customer.fennoaId}`
        : customer.name;
      const data = {
        ...customer,
        name: conflictingName && existing ? existing.name : uniqueName,
        fennoaSyncedAt: syncedAt,
        source:
          existing?.source === 'MANUAL' || existing?.source === 'MANUAL_AND_FENNOA'
            ? 'MANUAL_AND_FENNOA'
            : 'FENNOA',
      };
      if (existing) {
        await tx.catererClient.update({ where: { id: existing.id }, data });
      } else {
        await tx.catererClient.create({ data: { organizationId, ...data } });
      }
    }
  }

  private async syncSalesInvoices(
    tx: Prisma.TransactionClient,
    organizationId: string,
    invoices: Array<NonNullable<ReturnType<typeof normalizeFennoaSalesInvoice>>>,
    syncedAt: Date,
  ) {
    const clients = await tx.catererClient.findMany({
      where: { organizationId },
      select: { id: true, fennoaId: true, name: true },
    });
    const byFennoaId = new Map(
      clients
        .filter((client): client is typeof client & { fennoaId: number } => client.fennoaId != null)
        .map((client) => [client.fennoaId, client.id]),
    );
    for (const invoice of invoices) {
      let clientId = invoice.customerFennoaId
        ? (byFennoaId.get(invoice.customerFennoaId) ?? null)
        : null;
      if (!clientId && invoice.customerName) {
        const existing = await tx.catererClient.findFirst({
          where: {
            organizationId,
            name: { equals: invoice.customerName, mode: 'insensitive' },
          },
          select: { id: true },
        });
        clientId = existing?.id ?? null;
      }
      if (!clientId && invoice.customerName) {
        const created = await tx.catererClient.create({
          data: {
            organizationId,
            name: invoice.customerName,
            fennoaId: invoice.customerFennoaId,
            fennoaSyncedAt: syncedAt,
            source: 'FENNOA',
          },
          select: { id: true },
        });
        clientId = created.id;
        if (invoice.customerFennoaId) byFennoaId.set(invoice.customerFennoaId, created.id);
      }
      const data = { ...invoice, clientId, fennoaSyncedAt: syncedAt };
      await tx.catererClientInvoice.upsert({
        where: {
          organizationId_fennoaId: { organizationId, fennoaId: invoice.fennoaId },
        },
        create: { organizationId, ...data },
        update: data,
      });
    }
  }

  async publicSettings(organizationId: string) {
    const settings = await this.prisma.financeSettings.findUnique({ where: { organizationId } });
    return settings ? this.publicConfiguration(settings) : null;
  }

  private async credentials(organizationId: string): Promise<FennoaCredentials> {
    const settings = await this.prisma.financeSettings.findUnique({ where: { organizationId } });
    if (!settings?.fennoaUsername || !settings.fennoaApiKeyEncrypted) {
      throw new BadRequestException(
        'Configurez l’utilisateur et la clé API Fennoa avant de continuer.',
      );
    }
    return {
      baseUrl: settings.fennoaBaseUrl || DEFAULT_FENNOA_URL,
      apiVersion: settings.fennoaApiVersion || 'v1',
      username: settings.fennoaUsername,
      apiKey: this.secrets.decrypt(settings.fennoaApiKeyEncrypted),
    };
  }

  private async source(organizationId: string) {
    return this.prisma.financeDataSource.upsert({
      where: {
        organizationId_provider_name: {
          organizationId,
          provider: FinanceProvider.FENNOA,
          name: 'Fennoa',
        },
      },
      update: {},
      create: {
        organizationId,
        provider: FinanceProvider.FENNOA,
        name: 'Fennoa',
        sourceType: 'ACCOUNTING_API',
      },
    });
  }

  private publicConfiguration(settings: {
    fennoaBaseUrl: string;
    fennoaApiVersion: string;
    fennoaUsername: string | null;
    fennoaApiKeyEncrypted: string | null;
    fennoaApiKeyMask: string | null;
    fennoaApiKeyUpdatedAt: Date | null;
    fennoaLastTestedAt: Date | null;
    fennoaLastError: string | null;
  }) {
    return {
      baseUrl: settings.fennoaBaseUrl,
      apiVersion: settings.fennoaApiVersion,
      username: settings.fennoaUsername,
      apiKeyConfigured: Boolean(settings.fennoaApiKeyEncrypted),
      apiKeyMask: settings.fennoaApiKeyMask,
      apiKeyUpdatedAt: settings.fennoaApiKeyUpdatedAt,
      lastTestedAt: settings.fennoaLastTestedAt,
      lastError: settings.fennoaLastError,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { EquipmentAcquisitionMode, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const FINANCING_ACCOUNT_HINT =
  /\b(leasing|lease|vuokra|rahoitus|osamaksu|hire purchase|credit|cr[eé]dit)\b/i;

type FinancingContractRow = Prisma.EquipmentFinancingContractGetPayload<{
  include: {
    supplier: true;
    documents: true;
    equipmentProfiles: { include: { product: true } };
  };
}>;

@Injectable()
export class EquipmentFinancingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const [contracts, legacyProfiles, fennoaSources, accounts] = await Promise.all([
      this.prisma.equipmentFinancingContract.findMany({
        where: { organizationId },
        include: {
          supplier: true,
          documents: true,
          equipmentProfiles: { include: { product: true } },
        },
        orderBy: [{ financingEnd: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.equipmentProfile.findMany({
        where: {
          organizationId,
          financingContractId: null,
          acquisitionMode: { not: EquipmentAcquisitionMode.CASH },
        },
        include: { product: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.financeDataSource.findMany({
        where: { organizationId, provider: 'FENNOA' },
        select: { id: true, name: true },
      }),
      this.prisma.financeAccount.findMany({
        where: { organizationId },
        select: { code: true, name: true, nameEn: true, nameSv: true },
      }),
    ]);

    const fennoaSourceIds = fennoaSources.map(({ id }) => id);
    const accountNames = new Map(
      accounts.map((account) => [
        account.code,
        [account.name, account.nameEn, account.nameSv].filter(Boolean).join(' '),
      ]),
    );
    const providerNeedles = [
      ...new Set(
        [
          ...contracts.flatMap((contract) => [contract.contractNumber, contract.financingProvider]),
          ...legacyProfiles.flatMap((profile) => [profile.financingProvider]),
        ]
          .map((value) => String(value ?? '').trim())
          .filter((value) => value.length >= 3),
      ),
    ];
    const ledgerEntries = fennoaSourceIds.length
      ? await this.prisma.financeLedgerEntry.findMany({
          where: {
            organizationId,
            sourceId: { in: fennoaSourceIds },
            debit: { gt: 0 },
            ...(providerNeedles.length
              ? {
                  OR: providerNeedles.map((needle) => ({
                    description: { contains: needle, mode: 'insensitive' as const },
                  })),
                }
              : {}),
          },
          orderBy: { entryDate: 'desc' },
          take: 500,
        })
      : [];

    const direct = contracts.map((contract) =>
      this.serializeContract(contract, ledgerEntries, accountNames),
    );
    const legacy = this.serializeLegacy(legacyProfiles, ledgerEntries, accountNames);
    const items = [...direct, ...legacy].sort((a, b) => {
      const aEnd = a.financingEnd ? new Date(a.financingEnd).getTime() : Number.MAX_SAFE_INTEGER;
      const bEnd = b.financingEnd ? new Date(b.financingEnd).getTime() : Number.MAX_SAFE_INTEGER;
      return aEnd - bEnd;
    });
    const now = Date.now();
    const active = items.filter(
      (item) => !item.financingEnd || new Date(item.financingEnd).getTime() >= now,
    );
    return {
      items,
      summary: {
        contractCount: items.length,
        activeContractCount: active.length,
        monthlyTotal: this.money(active.reduce((sum, item) => sum + item.monthlyPayment, 0)),
        financedTotal: this.money(
          active.reduce((sum, item) => sum + Number(item.financedAmount ?? 0), 0),
        ),
        fennoaReconciledCount: active.filter((item) => item.source === 'FENNOA').length,
      },
    };
  }

  private serializeContract(
    contract: FinancingContractRow,
    ledgerEntries: Array<{
      externalKey: string;
      externalStatementId: string | null;
      accountCode: string;
      entryDate: Date;
      debit: Prisma.Decimal;
      description: string | null;
      series: string | null;
      number: number | null;
      sourceEntityId: string | null;
      sourceUrl: string | null;
    }>,
    accountNames: Map<string, string>,
  ) {
    const fennoa = this.findFennoaPayment(
      ledgerEntries,
      [contract.contractNumber, contract.financingProvider],
      contract.paymentFrequency,
      accountNames,
    );
    const registeredMonthlyPayment = Number(contract.monthlyPayment ?? 0);
    return {
      id: contract.id,
      acquisitionMode: contract.acquisitionMode,
      contractNumber: contract.contractNumber,
      financingProvider: contract.financingProvider,
      supplier: contract.supplier
        ? { id: contract.supplier.id, name: contract.supplier.name }
        : null,
      termMonths: contract.termMonths,
      installmentAmount:
        contract.installmentAmount == null ? null : Number(contract.installmentAmount),
      paymentFrequency: contract.paymentFrequency,
      monthlyPayment: fennoa?.monthlyPayment ?? registeredMonthlyPayment,
      registeredMonthlyPayment,
      financingStart: contract.financingStart?.toISOString() ?? null,
      financingEnd: contract.financingEnd?.toISOString() ?? null,
      financedAmount: contract.financedAmount == null ? null : Number(contract.financedAmount),
      buyoutValue: contract.buyoutValue == null ? null : Number(contract.buyoutValue),
      currency: contract.currency,
      source: fennoa ? 'FENNOA' : contract.source,
      sourceConfidence:
        contract.sourceConfidence == null ? null : Number(contract.sourceConfidence),
      fennoa,
      notes: contract.notes,
      legacy: false,
      equipment: contract.equipmentProfiles.map(({ product }) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
      })),
      documents: contract.documents.map((document) => ({
        id: document.id,
        originalName: document.originalName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        createdAt: document.createdAt.toISOString(),
      })),
    };
  }

  private serializeLegacy(
    profiles: Array<{
      id: string;
      acquisitionMode: EquipmentAcquisitionMode;
      financingProvider: string | null;
      financingStart: Date | null;
      financingEnd: Date | null;
      monthlyPayment: Prisma.Decimal | null;
      financedAmount: Prisma.Decimal | null;
      buyoutValue: Prisma.Decimal | null;
      notes: string | null;
      product: { id: string; name: string; sku: string | null };
    }>,
    ledgerEntries: Parameters<EquipmentFinancingService['serializeContract']>[1],
    accountNames: Map<string, string>,
  ) {
    const groups = new Map<string, typeof profiles>();
    for (const profile of profiles) {
      const key = [
        profile.acquisitionMode,
        profile.financingProvider ?? '',
        profile.financingStart?.toISOString().slice(0, 10) ?? '',
        profile.financingEnd?.toISOString().slice(0, 10) ?? '',
        String(profile.monthlyPayment ?? ''),
      ].join('|');
      const group = groups.get(key);
      if (group) group.push(profile);
      else groups.set(key, [profile]);
    }
    return [...groups.values()].map((group) => {
      const first = group[0];
      const fennoa = this.findFennoaPayment(
        ledgerEntries,
        [first.financingProvider],
        'MONTHLY',
        accountNames,
      );
      const registeredMonthlyPayment = Number(first.monthlyPayment ?? 0);
      return {
        id: `legacy:${first.id}`,
        acquisitionMode: first.acquisitionMode,
        contractNumber: null,
        financingProvider: first.financingProvider,
        supplier: null,
        termMonths: null,
        installmentAmount: registeredMonthlyPayment || null,
        paymentFrequency: 'MONTHLY',
        monthlyPayment: fennoa?.monthlyPayment ?? registeredMonthlyPayment,
        registeredMonthlyPayment,
        financingStart: first.financingStart?.toISOString() ?? null,
        financingEnd: first.financingEnd?.toISOString() ?? null,
        financedAmount: first.financedAmount == null ? null : Number(first.financedAmount),
        buyoutValue: first.buyoutValue == null ? null : Number(first.buyoutValue),
        currency: 'EUR',
        source: fennoa ? 'FENNOA' : 'TOQUEHUB',
        sourceConfidence: null,
        fennoa,
        notes: first.notes,
        legacy: true,
        equipment: group.map(({ product }) => product),
        documents: [],
      };
    });
  }

  private findFennoaPayment(
    entries: Parameters<EquipmentFinancingService['serializeContract']>[1],
    rawNeedles: Array<string | null | undefined>,
    paymentFrequency: string | null | undefined,
    accountNames: Map<string, string>,
  ) {
    const needles = rawNeedles
      .map((value) =>
        String(value ?? '')
          .trim()
          .toLocaleLowerCase(),
      )
      .filter((value) => value.length >= 3);
    if (!needles.length) return null;
    const candidates = entries.filter((entry) => {
      const haystack = `${entry.description ?? ''} ${accountNames.get(entry.accountCode) ?? ''}`;
      const normalized = haystack.toLocaleLowerCase();
      return (
        needles.some((needle) => normalized.includes(needle)) &&
        FINANCING_ACCOUNT_HINT.test(haystack)
      );
    });
    const unique = new Map<string, (typeof candidates)[number]>();
    for (const entry of candidates) {
      const key =
        entry.externalStatementId ||
        entry.sourceEntityId ||
        `${entry.entryDate.toISOString().slice(0, 10)}:${entry.series ?? ''}:${entry.number ?? ''}`;
      const previous = unique.get(key);
      if (!previous || Number(entry.debit) > Number(previous.debit)) unique.set(key, entry);
    }
    let latest: (typeof candidates)[number] | undefined;
    for (const entry of unique.values()) {
      if (!latest || entry.entryDate > latest.entryDate) latest = entry;
    }
    if (!latest) return null;
    const divisor = this.frequencyMonths(paymentFrequency);
    return {
      monthlyPayment: this.money(Number(latest.debit) / divisor),
      bookedAmount: this.money(Number(latest.debit)),
      entryDate: latest.entryDate.toISOString(),
      description: latest.description,
      accountCode: latest.accountCode,
      sourceUrl: latest.sourceUrl,
      paymentFrequency: paymentFrequency || 'MONTHLY',
    };
  }

  private frequencyMonths(value?: string | null) {
    const normalized = String(value ?? '').toUpperCase();
    if (normalized.includes('QUART')) return 3;
    if (normalized.includes('SEMI') || normalized.includes('HALF')) return 6;
    if (normalized.includes('ANNU') || normalized.includes('YEAR')) return 12;
    return 1;
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

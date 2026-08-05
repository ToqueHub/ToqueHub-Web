import { ConfigService } from '@nestjs/config';
import { FennoaClientService } from '../src/finance/fennoa-client.service';
import { FennoaSecretService } from '../src/finance/fennoa-secret.service';
import { FinanceAnalyticsService } from '../src/finance/finance-analytics.service';
import {
  normalizeFennoaLockingPeriods,
  normalizeFennoaPeriod,
} from '../src/finance/fennoa-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const settings = await prisma.financeSettings.findFirst({
      where: {
        fennoaUsername: { not: null },
        fennoaApiKeyEncrypted: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!settings?.fennoaUsername || !settings.fennoaApiKeyEncrypted) {
      throw new Error('Aucune configuration Fennoa complète n’est enregistrée.');
    }

    const config = new ConfigService(process.env);
    const secrets = new FennoaSecretService(config);
    const client = new FennoaClientService(config);
    const credentials = {
      baseUrl: settings.fennoaBaseUrl,
      apiVersion: settings.fennoaApiVersion,
      username: settings.fennoaUsername,
      apiKey: secrets.decrypt(settings.fennoaApiKeyEncrypted),
    };
    const [accounts, rawPeriods, rawLocks] = await Promise.all([
      client.accounts(credentials),
      client.periods(credentials),
      client.lockingPeriods(credentials),
    ]);
    const periods = rawPeriods
      .map(normalizeFennoaPeriod)
      .filter((period): period is NonNullable<typeof period> => Boolean(period));
    const locks = normalizeFennoaLockingPeriods(rawLocks);
    const [source, localAccounts, localPeriods, localLedgerRows, referenceBudget] = await Promise.all([
      prisma.financeDataSource.findFirst({
        where: { organizationId: settings.organizationId, provider: 'FENNOA' },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.financeAccount.count({ where: { organizationId: settings.organizationId } }),
      prisma.financeAccountingPeriod.count({ where: { organizationId: settings.organizationId } }),
      prisma.financeLedgerEntry.count({ where: { organizationId: settings.organizationId } }),
      prisma.financeBudgetPlan.findFirst({
        where: { organizationId: settings.organizationId, isReference: true },
        include: { _count: { select: { lines: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const analytics = await new FinanceAnalyticsService(prisma).build(
      settings.organizationId,
      { preset: 'fiscal_year' },
      referenceBudget ? referenceBudget.startDate.getUTCMonth() + 1 : 1,
    );

    console.log(JSON.stringify({
      ok: periods.length > 0,
      accountsCount: accounts.length,
      periodsReceived: rawPeriods.length,
      periodsUsable: periods.length,
      coverage: periods.length
        ? {
            from: periods.reduce((min, period) => period.startDate < min ? period.startDate : min, periods[0].startDate),
            to: periods.reduce((max, period) => period.endDate > max ? period.endDate : max, periods[0].endDate),
          }
        : null,
      locksAvailable: Object.values(locks).filter(Boolean).length,
      local: {
        sourceStatus: source?.status ?? null,
        lastSyncedAt: source?.lastSyncedAt ?? null,
        lastError: settings.fennoaLastError,
        accountsCount: localAccounts,
        periodsCount: localPeriods,
        ledgerRowsCount: localLedgerRows,
        referenceBudget: referenceBudget
          ? { name: referenceBudget.name, linesCount: referenceBudget._count.lines }
          : null,
      },
      dashboard: {
        health: analytics.dashboard.health,
        asOf: analytics.dashboard.context.asOf,
        annualCore: analytics.dashboard.annual.core.map((metric) => ({
          id: metric.id,
          value: metric.value,
          budget: metric.budget,
          variance: metric.variance,
        })),
      },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

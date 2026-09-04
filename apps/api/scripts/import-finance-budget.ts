import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { FinanceAnalyticsService } from '../src/finance/finance-analytics.service';
import { FinanceImportParserService } from '../src/finance/finance-import-parser.service';
import { FinancePolicy } from '../src/finance/finance.policy';
import { FinanceService } from '../src/finance/finance.service';
import type { FennoaSyncService } from '../src/finance/fennoa-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error('Usage: finance:import-budget <budget.xlsx>');
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const organization = await prisma.organization.findFirst({
      where: { financeInstalledAt: { not: null } },
      orderBy: { createdAt: 'asc' },
    });
    if (!organization) throw new Error('Le module Finance doit être installé.');
    const user = await prisma.user.findFirst({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) throw new Error('Aucun utilisateur ne peut tracer cet import.');
    const analytics = new FinanceAnalyticsService(prisma);
    const service = new FinanceService(
      prisma,
      new FinancePolicy(),
      analytics,
      new FinanceImportParserService(),
      null as unknown as FennoaSyncService,
      null as never,
    );
    const buffer = await readFile(filePath);
    const result = await service.importFile(
      organization.id,
      { id: user.id, email: user.email, organizationId: organization.id, role: 'SUPER_ADMIN', permissions: [] },
      {
        originalname: basename(filePath),
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        buffer,
      },
    );
    const plan = await prisma.financeBudgetPlan.findFirst({
      where: { organizationId: organization.id, isReference: true },
      include: { _count: { select: { lines: true } } },
    });
    const dashboard = await analytics.build(
      organization.id,
      { preset: 'fiscal_year' },
      plan?.startDate.getUTCMonth() ? plan.startDate.getUTCMonth() + 1 : 1,
    );
    console.log(JSON.stringify({
      duplicate: result.duplicate,
      batchId: result.batch.id,
      status: result.batch.status,
      plan: plan && { id: plan.id, name: plan.name, scenario: plan.scenario, startDate: plan.startDate, endDate: plan.endDate, lines: plan._count.lines },
      dashboard: {
        asOf: dashboard.dashboard.context.asOf,
        elapsedMonths: dashboard.dashboard.context.elapsedMonths,
        annual: dashboard.dashboard.annual.core.map((metric) => ({
          id: metric.id,
          actual: metric.value,
          budgetToDate: metric.budget,
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

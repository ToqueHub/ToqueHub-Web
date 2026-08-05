import { FinanceImportStatus, FinanceProvider } from '@prisma/client';
import { createHash } from 'node:crypto';
import { open, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { FinanceAnalyticsService } from '../src/finance/finance-analytics.service';
import { FinanceImportParserService } from '../src/finance/finance-import-parser.service';
import { FinancePolicy } from '../src/finance/finance.policy';
import {
  classifyFinanceFile,
  FinanceService,
  type FinanceUploadedFile,
} from '../src/finance/finance.service';
import type { FennoaSyncService } from '../src/finance/fennoa-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

const ACCEPTED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.pdf']);

type Options = {
  inbox: string;
  organizationId?: string;
  siteId?: string;
  recursive: boolean;
  dryRun: boolean;
  settleSeconds: number;
};

type Candidate = {
  path: string;
  name: string;
  size: number;
  modifiedAt: Date;
};

function optionValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseOptions(): Options {
  const args = process.argv.slice(2);
  const inbox = optionValue(args, '--inbox') || process.env.FLATPAY_REPORTS_INBOX;
  if (!inbox) {
    throw new Error(
      'Indiquez le dossier Flatpay avec --inbox /chemin/rapports ou FLATPAY_REPORTS_INBOX.',
    );
  }
  const settleRaw =
    optionValue(args, '--settle-seconds') || process.env.FLATPAY_REPORT_SETTLE_SECONDS || '60';
  const settleSeconds = Number(settleRaw);
  if (!Number.isFinite(settleSeconds) || settleSeconds < 0) {
    throw new Error('--settle-seconds doit être un nombre positif.');
  }
  return {
    inbox: resolve(inbox),
    organizationId: optionValue(args, '--organization-id') || process.env.FLATPAY_ORGANIZATION_ID,
    siteId: optionValue(args, '--site-id') || process.env.FLATPAY_SITE_ID,
    recursive: args.includes('--recursive'),
    dryRun: args.includes('--dry-run'),
    settleSeconds,
  };
}

function mimeType(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  if (extension === '.xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (extension === '.xls') return 'application/vnd.ms-excel';
  if (extension === '.csv') return 'text/csv';
  if (extension === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function isFlatpayCandidate(fileName: string) {
  if (fileName.startsWith('.') || fileName.startsWith('~$')) return false;
  if (!ACCEPTED_EXTENSIONS.has(extname(fileName).toLowerCase())) return false;
  return classifyFinanceFile(fileName).provider === FinanceProvider.FLATPAY;
}

async function discover(directory: string, recursive: boolean): Promise<Candidate[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates: Candidate[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (recursive) candidates.push(...(await discover(path, true)));
      continue;
    }
    if (!entry.isFile() || !isFlatpayCandidate(entry.name)) continue;
    const details = await stat(path);
    candidates.push({
      path,
      name: entry.name,
      size: details.size,
      modifiedAt: details.mtime,
    });
  }
  return candidates.sort(
    (left, right) =>
      left.modifiedAt.getTime() - right.modifiedAt.getTime() || left.name.localeCompare(right.name),
  );
}

async function selectOrganization(prisma: PrismaService, requestedId?: string) {
  if (requestedId) {
    const organization = await prisma.organization.findFirst({
      where: { id: requestedId, financeInstalledAt: { not: null } },
    });
    if (!organization) throw new Error('Organisation Finance introuvable pour --organization-id.');
    return organization;
  }
  const organizations = await prisma.organization.findMany({
    where: { financeInstalledAt: { not: null } },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });
  if (!organizations.length) throw new Error('Le module Finance doit être installé.');
  if (organizations.length > 1) {
    throw new Error('Plusieurs organisations Finance existent : utilisez --organization-id.');
  }
  return organizations[0];
}

async function acquireLock(inbox: string) {
  const lockKey = createHash('sha256').update(inbox).digest('hex').slice(0, 16);
  const lockPath = resolve(tmpdir(), `toquehub-flatpay-${lockKey}.lock`);
  try {
    const handle = await open(lockPath, 'wx');
    await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
    return { handle, lockPath };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (code !== 'EEXIST') throw error;
    const details = await stat(lockPath).catch(() => null);
    if (details && Date.now() - details.mtimeMs > 2 * 60 * 60 * 1000) {
      await unlink(lockPath).catch(() => undefined);
      return acquireLock(inbox);
    }
    throw new Error('Une synchronisation Flatpay est déjà en cours.');
  }
}

async function main() {
  const options = parseOptions();
  const allCandidates = await discover(options.inbox, options.recursive);
  const stableBefore = Date.now() - options.settleSeconds * 1000;
  const candidates = allCandidates.filter(({ modifiedAt }) => modifiedAt.getTime() <= stableBefore);
  const pendingFiles = allCandidates.length - candidates.length;

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          inbox: options.inbox,
          candidates: candidates.map(({ name, size, modifiedAt }) => ({
            name,
            size,
            modifiedAt,
            classification: classifyFinanceFile(name),
          })),
          pendingFiles,
        },
        null,
        2,
      ),
    );
    return;
  }

  const lock = await acquireLock(options.inbox);
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const organization = await selectOrganization(prisma, options.organizationId);
    const site = options.siteId
      ? await prisma.site.findFirst({
          where: { id: options.siteId, organizationId: organization.id, isArchived: false },
          select: { id: true, name: true },
        })
      : null;
    if (options.siteId && !site) throw new Error('Établissement FlatPay introuvable.');
    const user = await prisma.user.findFirst({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) throw new Error('Aucun utilisateur ne peut tracer les imports Flatpay.');
    const actor = {
      id: user.id,
      email: user.email,
      organizationId: organization.id,
      role: 'SUPER_ADMIN',
      permissions: [] as string[],
    };
    const service = new FinanceService(
      prisma,
      new FinancePolicy(),
      new FinanceAnalyticsService(prisma),
      new FinanceImportParserService(),
      null as unknown as FennoaSyncService,
      null as never,
      null as never,
    );
    const before = {
      rows: await prisma.financeDailySales.count({
        where: { organizationId: organization.id, source: { provider: FinanceProvider.FLATPAY } },
      }),
      revenueRows: await prisma.financeDailySales.count({
        where: {
          organizationId: organization.id,
          isRevenueRecord: true,
          source: { provider: FinanceProvider.FLATPAY },
        },
      }),
    };
    const results: Array<Record<string, unknown>> = [];
    for (const candidate of candidates) {
      try {
        const buffer = await readFile(candidate.path);
        const file: FinanceUploadedFile = {
          originalname: candidate.name,
          mimetype: mimeType(candidate.name),
          size: buffer.length,
          buffer,
        };
        const result = await service.importFile(organization.id, actor, file, {
          siteId: site?.id,
          sourceName: site ? `FlatPay POS · ${site.name}` : undefined,
        });
        results.push({
          file: candidate.name,
          duplicate: result.duplicate,
          reprocessed: 'reprocessed' in result ? result.reprocessed : false,
          status: result.batch.status,
          provider: result.batch.provider,
          reportKind: result.batch.reportKind,
          periodStart: result.batch.periodStart,
          periodEnd: result.batch.periodEnd,
          rows: result.batch.rowCount,
        });
      } catch (error) {
        results.push({
          file: candidate.name,
          status: FinanceImportStatus.FAILED,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const after = {
      rows: await prisma.financeDailySales.count({
        where: { organizationId: organization.id, source: { provider: FinanceProvider.FLATPAY } },
      }),
      revenueRows: await prisma.financeDailySales.count({
        where: {
          organizationId: organization.id,
          isRevenueRecord: true,
          source: { provider: FinanceProvider.FLATPAY },
        },
      }),
    };
    const failed = results.filter(({ status }) => status === FinanceImportStatus.FAILED).length;
    console.log(
      JSON.stringify(
        {
          ok: failed === 0,
          inbox: options.inbox,
          scannedFiles: allCandidates.length,
          processedFiles: candidates.length,
          pendingFiles,
          importedFiles: results.filter(({ duplicate }) => duplicate === false).length,
          duplicateFiles: results.filter(({ duplicate }) => duplicate === true).length,
          readyFiles: results.filter(({ status }) => status === FinanceImportStatus.READY).length,
          reviewFiles: results.filter(({ status }) => status === FinanceImportStatus.NEEDS_REVIEW)
            .length,
          failedFiles: failed,
          newDatabaseRows: after.rows - before.rows,
          newRevenueRows: after.revenueRows - before.revenueRows,
          totals: after,
          results,
        },
        null,
        2,
      ),
    );
    if (failed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    await lock.handle.close();
    await unlink(lock.lockPath).catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

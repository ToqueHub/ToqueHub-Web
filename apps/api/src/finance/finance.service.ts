import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AuditAction,
  DocumentStatus,
  FinanceAccountCategory,
  FinanceImportStatus,
  FinanceProvider,
  FinanceReportKind,
  FinanceSourceStatus,
  FinanceSourceType,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { FinancePolicy } from './finance.policy';
import type { FinanceBootstrapQueryDto } from './dto/finance.dto';
import type { UpdateFinanceAccountDto, UpdateFinancePreferencesDto } from './dto/finance.dto';
import { FinanceAnalyticsService } from './finance-analytics.service';
import {
  FinanceImportParserService,
  type ParsedFinanceImport,
} from './finance-import-parser.service';
import { FennoaSyncService } from './fennoa-sync.service';
import { FlatpayCredentialsService } from './flatpay-credentials.service';
import { PosApiCredentialsService } from './pos-api-credentials.service';
import { FinanceDocumentOcrService } from './finance-document-ocr.service';

const FINANCE_UPLOAD_ROOT = resolve(
  process.env.FINANCE_UPLOAD_DIR || process.env.UPLOAD_DIR || 'uploads',
  'finance-imports',
);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set([
  '.xlsx',
  '.xls',
  '.csv',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);
const OCR_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);

export function classifyFinanceFile(fileName: string) {
  const name = fileName.toLowerCase();
  const compactName = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
  const isFlatpayReport = [
    'ordersreport',
    'salesoverview',
    'posreporteod',
    'turnoverreport',
    'transactionreport',
    'cardtransactions',
    'cashmanagementreport',
    'kateishallintaraportti',
    'staffsalesreport',
    'payoutreport',
    'payoutsreport',
    'zreport',
    'tuotemyyntiraportti',
    'liikevaihtoraportti',
  ].some((marker) => compactName.includes(marker));
  const provider = name.includes('paypal')
    ? FinanceProvider.PAYPAL_POS
    : name.includes('loysverse') || name.includes('loyverse')
      ? FinanceProvider.LOYVERSE
      : name.includes('fennoa')
        ? FinanceProvider.FENNOA
        : isFlatpayReport
          ? FinanceProvider.FLATPAY
          : FinanceProvider.GENERIC;
  let reportKind: FinanceReportKind = FinanceReportKind.UNKNOWN;
  if (compactName.includes('ordersreport')) reportKind = FinanceReportKind.SALES_ORDERS;
  else if (compactName.includes('salesoverview') || compactName.includes('tuotemyyntiraportti')) {
    reportKind = FinanceReportKind.PRODUCT_SALES;
  } else if (
    compactName.includes('eod') ||
    compactName.includes('turnoverreport') ||
    compactName.includes('liikevaihtoraportti') ||
    compactName.includes('zreport') ||
    compactName.includes('cashmanagementreport') ||
    compactName.includes('kateishallintaraportti') ||
    compactName.includes('staffsalesreport')
  )
    reportKind = FinanceReportKind.DAILY_CLOSURE;
  else if (
    compactName.includes('transactionreport') ||
    compactName.includes('cardtransactions') ||
    name.includes('receipt') ||
    name.includes('loysverse') ||
    name.includes('loyverse')
  )
    reportKind = FinanceReportKind.RECEIPTS;
  else if (compactName.includes('payoutreport') || compactName.includes('payoutsreport')) {
    reportKind = FinanceReportKind.ACCOUNTING;
  } else if (name.includes('budget')) reportKind = FinanceReportKind.BUDGET;
  else if (
    name.includes('fennoa') ||
    [
      'account',
      'comptabil',
      'compteresultat',
      'bilan',
      'grandlivre',
      'balancegenerale',
      'incomestatement',
      'profitandloss',
      'trialbalance',
      'generalledger',
      'annualaccounts',
      'tuloslaskelma',
      'tase',
      'paakirja',
      'tilinpaatos',
      'koetase',
    ].some((marker) => compactName.includes(marker))
  ) {
    reportKind = FinanceReportKind.ACCOUNTING;
  }
  return { provider, reportKind };
}

export function financeSourceName(provider: FinanceProvider) {
  const labels: Record<FinanceProvider, string> = {
    FENNOA: 'Fennoa',
    FLATPAY: 'FlatPay POS',
    PAYPAL_POS: 'PayPal POS',
    LOYVERSE: 'Loyverse',
    GENERIC: 'Import universel',
  };
  return labels[provider];
}

export function shouldIncludeSalesSourceByDefault(
  provider: FinanceProvider,
  reportKind: FinanceReportKind,
  revenueRowCount: number,
) {
  if (revenueRowCount <= 0) return false;
  if (provider === FinanceProvider.FLATPAY) {
    return reportKind === FinanceReportKind.SALES_ORDERS;
  }
  return (
    (provider === FinanceProvider.PAYPAL_POS || provider === FinanceProvider.LOYVERSE) &&
    reportKind === FinanceReportKind.RECEIPTS
  );
}

export type FinanceUploadedFile = {
  originalname: string;
  mimetype?: string;
  size?: number;
  buffer: Buffer;
};

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: FinancePolicy,
    private readonly analytics: FinanceAnalyticsService,
    private readonly parser: FinanceImportParserService,
    private readonly fennoa: FennoaSyncService,
    private readonly flatpayCredentials: FlatpayCredentialsService,
    private readonly posApiCredentials: PosApiCredentialsService,
    private readonly documentOcr: FinanceDocumentOcrService,
  ) {}

  async assertReadable(organizationId: string, actor: AuthenticatedUser) {
    this.policy.assertPermission(actor, 'finance.read');
    await this.assertInstalled(organizationId);
  }

  async bootstrap(
    organizationId: string,
    actor: AuthenticatedUser,
    query: FinanceBootstrapQueryDto = {},
  ) {
    this.policy.assertPermission(actor, 'finance.read');
    await this.assertInstalled(organizationId);
    const [settings, sources, imports, fennoa, flatpay, pos, sites] = await Promise.all([
      this.prisma.financeSettings.findUnique({ where: { organizationId } }),
      this.prisma.financeDataSource.findMany({
        where: { organizationId },
        include: { site: { select: { id: true, name: true } } },
        orderBy: [{ sourceType: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.financeImportBatch.findMany({
        where: { organizationId },
        include: { source: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.fennoa.publicSettings(organizationId),
      this.flatpayCredentials.publicSettings(organizationId),
      this.posApiCredentials.publicSettings(organizationId),
      this.prisma.site.findMany({
        where: { organizationId, isArchived: false },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const selectedSite = query.siteId
      ? (sites.find(({ id }) => id === query.siteId) ?? null)
      : null;
    if (query.siteId && !selectedSite) {
      throw new BadRequestException('Établissement Finance introuvable.');
    }
    const analytics = await this.analytics.build(
      organizationId,
      query,
      settings?.fiscalYearStartMonth ?? 1,
    );
    const accountingSourceIds = new Set(analytics.dataScope.accountingSourceIds);
    const scopedSources = selectedSite
      ? sources.filter(
          ({ id, siteId }) => siteId === selectedSite.id || accountingSourceIds.has(id),
        )
      : sources;
    const connectedSources = scopedSources.filter(
      ({ status }) => status === FinanceSourceStatus.READY,
    );
    const reviewImports = imports.filter(
      ({ status }) => status === FinanceImportStatus.NEEDS_REVIEW,
    );
    return {
      installed: true,
      organizationId,
      permissions: this.policy.effectivePermissions(actor),
      settings: {
        defaultCurrency: settings?.defaultCurrency ?? 'EUR',
        fiscalYearStartMonth: settings?.fiscalYearStartMonth ?? 1,
        timezone: settings?.timezone ?? 'Europe/Helsinki',
        fennoa,
        flatpay,
        pos,
      },
      period: analytics.period,
      metrics: analytics.metrics,
      analysis: analytics.analysis,
      dashboard: analytics.dashboard,
      scope: {
        mode: selectedSite ? 'site' : 'consolidated',
        site: selectedSite,
        accountingAllocated: analytics.dataScope.accountingMode !== 'unavailable',
        budgetAllocated: analytics.dataScope.budgetMode !== 'unavailable',
        accountingMode: analytics.dataScope.accountingMode,
        budgetMode: analytics.dataScope.budgetMode,
        accountingSourceIds: analytics.dataScope.accountingSourceIds,
        note: this.financeScopeNote(
          selectedSite,
          analytics.dataScope.accountingMode,
          analytics.dataScope.budgetMode,
        ),
      },
      sources,
      sites,
      imports,
      quality: {
        level:
          connectedSources.length > 1 ? 'ready' : connectedSources.length ? 'partial' : 'empty',
        label:
          connectedSources.length > 1
            ? 'Données consolidées'
            : connectedSources.length
              ? 'Couverture partielle'
              : 'Sources à connecter',
        connectedSourceCount: connectedSources.length,
        sourceCount: scopedSources.length,
        pendingReviewCount: reviewImports.length,
        lastUpdatedAt:
          scopedSources
            .map(({ lastSyncedAt }) => lastSyncedAt)
            .filter((value): value is Date => Boolean(value))
            .sort((left, right) => right.getTime() - left.getTime())[0] ?? null,
      },
    };
  }

  private financeScopeNote(
    site: { id: string; name: string } | null,
    accountingMode: 'consolidated' | 'direct' | 'exclusive_site_fallback' | 'unavailable',
    budgetMode: 'consolidated' | 'direct' | 'exclusive_site_fallback' | 'unavailable',
  ) {
    if (!site) return 'Tous les établissements et toutes les caisses incluses sont consolidés.';

    const accountingNote =
      accountingMode === 'exclusive_site_fallback'
        ? `La comptabilité Fennoa enregistrée au niveau de l’organisation est attribuée à ${site.name}, seul établissement présentant une activité de caisse sur l’exercice analysé.`
        : accountingMode === 'direct'
          ? `La comptabilité affectée à ${site.name} est incluse.`
          : 'La comptabilité globale n’est pas ventilée entre les établissements et reste exclue de cette vue.';
    const budgetNote =
      budgetMode === 'direct'
        ? `Le budget affecté à ${site.name} est inclus.`
        : budgetMode === 'exclusive_site_fallback'
          ? `Le budget global est attribué à ${site.name}, seul établissement actif sur la période.`
          : 'Aucun budget affecté à cet établissement n’est inclus.';
    return `Les ventes et l’affluence sont limitées à ${site.name}. ${accountingNote} ${budgetNote}`;
  }

  async importFile(
    organizationId: string,
    actor: AuthenticatedUser,
    file?: FinanceUploadedFile,
    target: { siteId?: string; sourceName?: string } = {},
  ) {
    this.policy.assertPermission(actor, 'finance.import');
    await this.assertInstalled(organizationId);
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier Finance fourni.');
    if ((file.size ?? file.buffer.length) > MAX_FILE_BYTES) {
      throw new BadRequestException('Le fichier dépasse la limite de 20 Mo.');
    }
    const extension = extname(file.originalname).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('Formats acceptés : XLSX, XLS, CSV, PDF, PNG, JPG ou WEBP.');
    }

    let classification = await this.parser.detect(
      file.originalname,
      file.buffer,
      classifyFinanceFile(file.originalname),
    );
    let parsed: ParsedFinanceImport;
    try {
      const shouldUseAccountingOcr =
        OCR_EXTENSIONS.has(extension) && classification.provider !== FinanceProvider.FLATPAY;
      if (shouldUseAccountingOcr) {
        parsed = await this.documentOcr.parse(organizationId, {
          fileName: file.originalname,
          buffer: file.buffer,
          mimeType: file.mimetype || this.mimeTypeFor(extension),
        });
        classification = {
          provider: FinanceProvider.GENERIC,
          reportKind: FinanceReportKind.ACCOUNTING,
        };
      } else {
        parsed = await this.parser.parse(
          file.originalname,
          file.buffer,
          classification.provider,
          classification.reportKind,
        );
      }
      if (parsed.accountingDocument) {
        classification = {
          provider: FinanceProvider.GENERIC,
          reportKind: FinanceReportKind.ACCOUNTING,
        };
      }
    } catch (error) {
      parsed = {
        ready: false,
        rows: [],
        periodStart: null,
        periodEnd: null,
        grossTotal: null,
        netTotal: null,
        vatTotal: null,
        warnings: [
          `Lecture automatique impossible : ${error instanceof Error ? error.message : 'format non reconnu'}`,
        ],
        metadata: { parser: 'failed', parserVersion: 1 },
      };
    }
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.prisma.financeImportBatch.findUnique({
      where: { organizationId_fileHash: { organizationId, fileHash } },
      include: { source: { select: { id: true, name: true } } },
    });
    if (existing) {
      if (parsed.accountingDocument && existing.sourceId && parsed.ready) {
        await this.prisma.$transaction(async (tx) => {
          await this.persistAccountingDocument(
            tx,
            organizationId,
            existing.sourceId!,
            existing.id,
            parsed.accountingDocument!,
          );
          await tx.financeImportBatch.update({
            where: { id: existing.id },
            data: {
              status: FinanceImportStatus.READY,
              reportKind: FinanceReportKind.ACCOUNTING,
              periodStart: parsed.periodStart,
              periodEnd: parsed.periodEnd,
              rowCount: parsed.accountingDocument!.lines.length,
              warnings: parsed.warnings,
              metadata: {
                ...((existing.metadata as Prisma.InputJsonObject | null) ?? {}),
                ...parsed.metadata,
                reprocessedAt: new Date().toISOString(),
              },
            },
          });
        });
        return {
          duplicate: true,
          reprocessed: true,
          batch: await this.prisma.financeImportBatch.findUniqueOrThrow({
            where: { id: existing.id },
            include: { source: { select: { id: true, name: true } } },
          }),
        };
      }
      const existingBudgetPlan = parsed.budgetPlan
        ? await this.prisma.financeBudgetPlan.findFirst({
            where: { organizationId, importBatchId: existing.id },
          })
        : null;
      if (parsed.budgetPlan && !existingBudgetPlan) {
        await this.prisma.$transaction(async (tx) => {
          await this.persistBudgetPlan(tx, organizationId, existing.id, parsed.budgetPlan!);
          await tx.financeImportBatch.update({
            where: { id: existing.id },
            data: {
              status: FinanceImportStatus.READY,
              periodStart: parsed.periodStart,
              periodEnd: parsed.periodEnd,
              rowCount: parsed.budgetPlan!.lines.length,
              warnings: parsed.warnings,
              metadata: {
                ...((existing.metadata as Prisma.InputJsonObject | null) ?? {}),
                ...parsed.metadata,
              } as Prisma.InputJsonValue,
            },
          });
        });
        return {
          duplicate: true,
          reprocessed: true,
          batch: await this.prisma.financeImportBatch.findUniqueOrThrow({
            where: { id: existing.id },
            include: { source: { select: { id: true, name: true } } },
          }),
        };
      }
      const previousParserVersion = Number(
        (existing.metadata as Record<string, unknown> | null)?.parserVersion ?? 0,
      );
      const nextParserVersion = Number(parsed.metadata.parserVersion ?? 0);
      const parserWasUpgraded =
        Boolean(parsed.metadata.parser) && nextParserVersion > previousParserVersion;
      if (
        parsed.ready &&
        existing.sourceId &&
        (existing.status !== FinanceImportStatus.READY || parserWasUpgraded)
      ) {
        const refreshed = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.financeImportBatch.update({
            where: { id: existing.id },
            data: {
              status: FinanceImportStatus.READY,
              periodStart: parsed.periodStart,
              periodEnd: parsed.periodEnd,
              rowCount: parsed.rows.length,
              grossTotal: parsed.grossTotal,
              netTotal: parsed.netTotal,
              vatTotal: parsed.vatTotal,
              warnings: parsed.warnings,
              metadata: {
                ...((existing.metadata as Record<string, unknown> | null) ?? {}),
                ...parsed.metadata,
                reprocessedAt: new Date().toISOString(),
                previousParserVersion,
              },
            },
            include: { source: { select: { id: true, name: true } } },
          });
          await tx.financeDailySales.deleteMany({ where: { importBatchId: existing.id } });
          await tx.financeDailySales.createMany({
            data: parsed.rows.map((row) => ({
              organizationId,
              sourceId: existing.sourceId!,
              importBatchId: existing.id,
              ...row,
            })),
            skipDuplicates: true,
          });
          const currentSource = await tx.financeDataSource.findUniqueOrThrow({
            where: { id: existing.sourceId! },
          });
          const coverageStart =
            [currentSource.coverageStart, parsed.periodStart]
              .filter((value): value is Date => Boolean(value))
              .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
          const coverageEnd =
            [currentSource.coverageEnd, parsed.periodEnd]
              .filter((value): value is Date => Boolean(value))
              .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
          await tx.financeDataSource.update({
            where: { id: existing.sourceId! },
            data: {
              status: FinanceSourceStatus.READY,
              lastSyncedAt: new Date(),
              coverageStart,
              coverageEnd,
            },
          });
          return updated;
        });
        return { duplicate: true, reprocessed: true, batch: refreshed };
      }
      return { duplicate: true, reprocessed: false, batch: existing };
    }
    const requestedSite = target.siteId
      ? await this.prisma.site.findFirst({
          where: { id: target.siteId, organizationId, isArchived: false },
          select: { id: true, name: true },
        })
      : null;
    if (target.siteId && !requestedSite) {
      throw new BadRequestException(
        'L’établissement choisi n’appartient pas à cette organisation.',
      );
    }
    const baseSourceName = financeSourceName(classification.provider);
    const requestedSourceName =
      target.sourceName?.trim() ||
      (classification.provider === FinanceProvider.GENERIC && requestedSite
        ? `${baseSourceName} · ${requestedSite.name}`
        : baseSourceName);
    const sourceType = FinanceSourceType.FILE_IMPORT;
    const namedSource = await this.prisma.financeDataSource.findUnique({
      where: {
        organizationId_provider_name: {
          organizationId,
          provider: classification.provider,
          name: requestedSourceName,
        },
      },
    });
    // Le nom est une présentation, pas l'identité d'une caisse. Après un renommage (par exemple
    // « FlatPay POS » vers « FlatPay POS · Kuusamo »), un nouvel import doit continuer à alimenter
    // la source déjà rattachée à ce fournisseur et à cet établissement.
    const siteSource =
      requestedSite && classification.provider !== FinanceProvider.GENERIC
        ? await this.prisma.financeDataSource.findFirst({
            where: {
              organizationId,
              provider: classification.provider,
              siteId: requestedSite.id,
            },
            orderBy: [{ isPrimaryPos: 'desc' }, { isPrimarySales: 'desc' }, { createdAt: 'asc' }],
          })
        : null;
    const existingSource = siteSource ?? namedSource;
    const sourceName = existingSource?.name ?? requestedSourceName;
    const defaultSite =
      classification.provider === FinanceProvider.FENNOA
        ? null
        : await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
              primarySiteId: true,
              sites: {
                where: { isArchived: false },
                orderBy: { createdAt: 'asc' },
                select: { id: true },
                take: 1,
              },
            },
          });
    const defaultSiteId =
      requestedSite?.id ??
      existingSource?.siteId ??
      defaultSite?.primarySiteId ??
      defaultSite?.sites[0]?.id ??
      null;
    const currentPrimaryPos = await this.prisma.financeDataSource.findFirst({
      where: { organizationId, siteId: defaultSiteId, isPrimaryPos: true },
      select: { id: true, status: true },
    });
    const coverageStart =
      [existingSource?.coverageStart, parsed.periodStart]
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
    const coverageEnd =
      [existingSource?.coverageEnd, parsed.periodEnd]
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const revenueRows = parsed.rows.filter(({ isRevenueRecord }) => isRevenueRecord).length;
    const shouldEnableExistingSalesSource =
      Boolean(existingSource && !existingSource.isPrimarySales && revenueRows > 0) &&
      (await this.prisma.financeDailySales.count({
        where: {
          organizationId,
          sourceId: existingSource!.id,
          isRevenueRecord: true,
        },
      })) === 0;
    const source = await this.prisma.financeDataSource.upsert({
      where: {
        organizationId_provider_name: {
          organizationId,
          provider: classification.provider,
          name: sourceName,
        },
      },
      update: parsed.ready
        ? {
            siteId: defaultSiteId,
            status: FinanceSourceStatus.READY,
            lastSyncedAt: new Date(),
            coverageStart,
            coverageEnd,
            ...(shouldEnableExistingSalesSource ? { isPrimarySales: true } : {}),
          }
        : {},
      create: {
        organizationId,
        siteId: defaultSiteId,
        provider: classification.provider,
        name: sourceName,
        sourceType,
        status: parsed.ready ? FinanceSourceStatus.READY : FinanceSourceStatus.ATTENTION,
        // Nom historique du champ : true signifie désormais « contribue au CA consolidé ».
        // Plusieurs caisses peuvent donc être actives en même temps.
        isPrimarySales: shouldIncludeSalesSourceByDefault(
          classification.provider,
          classification.reportKind,
          parsed.rows.filter(({ isRevenueRecord }) => isRevenueRecord).length,
        ),
        lastSyncedAt: parsed.ready ? new Date() : null,
        coverageStart,
        coverageEnd,
      },
    });
    const canBecomePrimaryPos =
      source.sourceType !== FinanceSourceType.ACCOUNTING_API && revenueRows > 0;
    if (
      canBecomePrimaryPos &&
      (!currentPrimaryPos ||
        currentPrimaryPos.id === source.id ||
        currentPrimaryPos.status === FinanceSourceStatus.NOT_CONNECTED)
    ) {
      await this.prisma.$transaction([
        this.prisma.financeDataSource.updateMany({
          where: {
            organizationId,
            siteId: defaultSiteId,
            isPrimaryPos: true,
            id: { not: source.id },
          },
          data: { isPrimaryPos: false },
        }),
        this.prisma.financeDataSource.update({
          where: { id: source.id },
          data: { isPrimaryPos: true },
        }),
      ]);
    }

    const batchId = randomUUID();
    const storedName = `${batchId}${extension}`;
    const relativePath = join(organizationId, storedName);
    await mkdir(join(FINANCE_UPLOAD_ROOT, organizationId), { recursive: true });
    await writeFile(join(FINANCE_UPLOAD_ROOT, relativePath), file.buffer);

    const batch = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          organizationId,
          uploadedById: actor.id,
          internalFilename: storedName,
          originalName: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          sizeBytes: file.size ?? file.buffer.length,
          storagePath: relativePath,
          contentSha256: fileHash,
          sourceModule: 'finance',
          sourceType: 'report-import',
          sourceId: batchId,
          status: DocumentStatus.UPLOADED,
        },
      });
      const created = await tx.financeImportBatch.create({
        data: {
          id: batchId,
          organizationId,
          sourceId: source.id,
          uploadedById: actor.id,
          fileName: file.originalname,
          fileHash,
          mimeType: file.mimetype,
          fileSize: file.size ?? file.buffer.length,
          status: parsed.ready ? FinanceImportStatus.READY : FinanceImportStatus.NEEDS_REVIEW,
          provider: classification.provider,
          reportKind: classification.reportKind,
          periodStart: parsed.periodStart,
          periodEnd: parsed.periodEnd,
          rowCount:
            parsed.accountingDocument?.lines.length ||
            parsed.budgetPlan?.lines.length ||
            parsed.rows.length ||
            null,
          grossTotal: parsed.grossTotal,
          netTotal: parsed.netTotal,
          vatTotal: parsed.vatTotal,
          warnings: parsed.ready
            ? parsed.warnings
            : parsed.warnings.length
              ? parsed.warnings
              : [
                  'Fichier conservé. Le mapping et la période doivent être confirmés avant consolidation.',
                ],
          metadata: {
            documentId: document.id,
            extension,
            importContractVersion: 'finance-import-v1',
            ...parsed.metadata,
          },
        },
        include: { source: { select: { id: true, name: true } } },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.FINANCE_IMPORT_UPLOADED,
          entityType: 'FinanceImportBatch',
          entityId: created.id,
          entityName: file.originalname,
        },
      });
      if (parsed.ready && parsed.rows.length) {
        await tx.financeDailySales.createMany({
          data: parsed.rows.map((row) => ({
            organizationId,
            sourceId: source.id,
            importBatchId: created.id,
            ...row,
          })),
          skipDuplicates: true,
        });
      }
      if (parsed.budgetPlan) {
        await this.persistBudgetPlan(tx, organizationId, created.id, parsed.budgetPlan);
        await tx.financeImportBatch.update({
          where: { id: created.id },
          data: { rowCount: parsed.budgetPlan.lines.length },
        });
      }
      if (parsed.accountingDocument && parsed.ready) {
        await this.persistAccountingDocument(
          tx,
          organizationId,
          source.id,
          created.id,
          parsed.accountingDocument,
        );
      }
      return created;
    });
    return { duplicate: false, batch };
  }

  async setSalesSourceInclusion(
    organizationId: string,
    actor: AuthenticatedUser,
    sourceId: string,
    enabled: boolean,
  ) {
    this.policy.assertPermission(actor, 'finance.manage');
    const source = await this.prisma.financeDataSource.findFirst({
      where: { id: sourceId, organizationId },
    });
    if (!source || source.sourceType === FinanceSourceType.ACCOUNTING_API) {
      throw new BadRequestException(
        'Cette source ne peut pas contribuer au chiffre d’affaires des caisses.',
      );
    }
    const salesRows = enabled
      ? await this.prisma.financeDailySales.count({
          where: { organizationId, sourceId: source.id, isRevenueRecord: true },
        })
      : 0;
    if (enabled && !salesRows) {
      throw new BadRequestException(
        'Cette source ne contient aucun ticket ou chiffre d’affaires journalier validé.',
      );
    }
    await this.prisma.financeDataSource.update({
      where: { id: source.id },
      data: { isPrimarySales: enabled },
    });
    return { sourceId: source.id, isPrimarySales: enabled, contributesToSales: enabled };
  }

  async mapSourceSite(
    organizationId: string,
    actor: AuthenticatedUser,
    sourceId: string,
    siteId: string,
  ) {
    this.policy.assertPermission(actor, 'finance.manage');
    const [source, site] = await Promise.all([
      this.prisma.financeDataSource.findFirst({ where: { id: sourceId, organizationId } }),
      this.prisma.site.findFirst({
        where: { id: siteId, organizationId, isArchived: false },
        select: { id: true, name: true },
      }),
    ]);
    if (!source) throw new BadRequestException('Source Finance introuvable.');
    if (source.sourceType === FinanceSourceType.ACCOUNTING_API) {
      throw new BadRequestException(
        'Une source comptable globale ne dépend pas d’un établissement.',
      );
    }
    if (!site) throw new BadRequestException('Établissement ToqueHub introuvable.');
    if (source.siteId && source.siteId !== site.id) {
      const linkedConnection =
        source.provider === FinanceProvider.FLATPAY
          ? await this.prisma.financeFlatpayConnection.findUnique({
              where: {
                organizationId_defaultSiteId: {
                  organizationId,
                  defaultSiteId: source.siteId,
                },
              },
              select: { id: true },
            })
          : source.provider === FinanceProvider.LOYVERSE ||
              source.provider === FinanceProvider.PAYPAL_POS
            ? await this.prisma.financePosConnection.findUnique({
                where: {
                  organizationId_provider_defaultSiteId: {
                    organizationId,
                    provider: source.provider,
                    defaultSiteId: source.siteId,
                  },
                },
                select: { id: true },
              })
            : null;
      if (linkedConnection) {
        throw new BadRequestException(
          'Cette source suit le compte POS connecté à son établissement. Ajoutez un compte distinct pour le nouvel établissement.',
        );
      }
    }
    if (source.isPrimaryPos) {
      await this.prisma.financeDataSource.updateMany({
        where: {
          organizationId,
          siteId: site.id,
          isPrimaryPos: true,
          id: { not: source.id },
        },
        data: { isPrimaryPos: false },
      });
    }
    const updated = await this.prisma.financeDataSource.update({
      where: { id: source.id },
      data: { siteId: site.id },
      include: { site: { select: { id: true, name: true } } },
    });
    return { source: updated };
  }

  async setPrimarySalesSource(organizationId: string, actor: AuthenticatedUser, sourceId: string) {
    return this.setPrimaryPosSource(organizationId, actor, sourceId);
  }

  async setPrimaryPosSource(organizationId: string, actor: AuthenticatedUser, sourceId: string) {
    this.policy.assertPermission(actor, 'finance.manage');
    const source = await this.prisma.financeDataSource.findFirst({
      where: { id: sourceId, organizationId },
    });
    if (!source || source.sourceType === FinanceSourceType.ACCOUNTING_API) {
      throw new BadRequestException('Cette source ne peut pas être définie comme POS principal.');
    }
    if (!source.siteId) {
      throw new BadRequestException('Rattachez d’abord cette caisse à un établissement ToqueHub.');
    }
    const salesRows = await this.prisma.financeDailySales.count({
      where: { organizationId, sourceId: source.id, isRevenueRecord: true },
    });
    if (!salesRows) {
      throw new BadRequestException(
        'Cette source ne contient encore aucun ticket permettant de la définir comme POS principal.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.financeDataSource.updateMany({
        where: {
          organizationId,
          siteId: source.siteId,
          isPrimaryPos: true,
          id: { not: source.id },
        },
        data: { isPrimaryPos: false },
      }),
      this.prisma.financeDataSource.update({
        where: { id: source.id },
        data: { isPrimaryPos: true, isPrimarySales: true },
      }),
    ]);
    return { sourceId: source.id, isPrimaryPos: true };
  }

  async accounts(organizationId: string, actor: AuthenticatedUser) {
    this.policy.assertPermission(actor, 'finance.read');
    return this.prisma.financeAccount.findMany({
      where: { organizationId },
      orderBy: { code: 'asc' },
    });
  }

  async updateAccount(
    organizationId: string,
    actor: AuthenticatedUser,
    code: string,
    dto: UpdateFinanceAccountDto,
  ) {
    this.policy.assertPermission(actor, 'finance.manage');
    return this.prisma.financeAccount.update({
      where: { organizationId_code: { organizationId, code } },
      data: { category: dto.category, categoryOverride: true },
    });
  }

  async updatePreferences(
    organizationId: string,
    actor: AuthenticatedUser,
    dto: UpdateFinancePreferencesDto,
  ) {
    this.policy.assertPermission(actor, 'finance.read');
    const allowed = new Set([
      'average_ticket',
      'transactions',
      'contribution_margin',
      'contribution_margin_rate',
      'cash',
      'fixed_costs',
      'break_even',
      'break_even_day',
      'break_even_week',
      'break_even_month',
    ]);
    const dashboardKpis = [...new Set(dto.dashboardKpis.filter((id) => allowed.has(id)))];
    return this.prisma.financeSettings.update({
      where: { organizationId },
      data: { dashboardKpis },
      select: { dashboardKpis: true },
    });
  }

  private async assertInstalled(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { financeInstalledAt: true },
    });
    if (!organization?.financeInstalledAt) {
      throw new BadRequestException('Le module Finance doit être installé.');
    }
  }

  private async persistBudgetPlan(
    tx: Prisma.TransactionClient,
    organizationId: string,
    importBatchId: string,
    plan: NonNullable<ParsedFinanceImport['budgetPlan']>,
  ) {
    await tx.financeBudgetPlan.updateMany({
      where: { organizationId, isReference: true },
      data: { isReference: false },
    });
    const created = await tx.financeBudgetPlan.create({
      data: {
        organizationId,
        importBatchId,
        name: plan.name,
        scenario: plan.scenario,
        currency: plan.currency,
        startDate: plan.startDate,
        endDate: plan.endDate,
        source: 'LOCAL_IMPORT',
        isReference: true,
        metadata: { importContractVersion: 'finance-budget-v1' },
      },
    });
    await tx.financeBudgetPlanLine.createMany({
      data: plan.lines.map((line) => ({
        organizationId,
        planId: created.id,
        metric: line.metric,
        label: line.label,
        periodStart: line.periodStart,
        amount: new Prisma.Decimal(line.amount),
      })),
      skipDuplicates: true,
    });
    await tx.financeSettings.update({
      where: { organizationId },
      data: { fiscalYearStartMonth: plan.startDate.getUTCMonth() + 1 },
    });
    return created;
  }

  private mimeTypeFor(extension: string) {
    const types: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    return types[extension] || 'application/octet-stream';
  }

  private async persistAccountingDocument(
    tx: Prisma.TransactionClient,
    organizationId: string,
    sourceId: string,
    importBatchId: string,
    document: NonNullable<ParsedFinanceImport['accountingDocument']>,
  ) {
    if (!document.periodStart || !document.periodEnd) return;
    const lines = document.lines.filter(({ includeInLedger }) => includeInLedger);
    const externalId = -Math.max(
      1,
      Number.parseInt(createHash('sha256').update(importBatchId).digest('hex').slice(0, 7), 16),
    );
    await tx.financeAccountingPeriod.upsert({
      where: { organizationId_externalId: { organizationId, externalId } },
      update: {
        startDate: document.periodStart,
        endDate: document.periodEnd,
        lastSyncedAt: new Date(),
      },
      create: {
        organizationId,
        externalId,
        startDate: document.periodStart,
        endDate: document.periodEnd,
        lastSyncedAt: new Date(),
      },
    });
    const prepared = lines.map((line, index) => {
      const generatedCode = `OCR-${line.category.slice(0, 3)}-${createHash('sha1')
        .update(`${line.label}|${index}`)
        .digest('hex')
        .slice(0, 8)}`;
      const accountCode = line.code || generatedCode;
      const explicitDebit = line.debit == null ? null : Number(line.debit);
      const explicitCredit = line.credit == null ? null : Number(line.credit);
      const amount = Number(line.amount ?? 0);
      let debit = explicitDebit ?? 0;
      let credit = explicitCredit ?? 0;
      if (explicitDebit == null && explicitCredit == null) {
        const creditNature = line.category === FinanceAccountCategory.REVENUE;
        if ((creditNature && amount >= 0) || (!creditNature && amount < 0))
          credit = Math.abs(amount);
        else debit = Math.abs(amount);
      }
      return { line, index, accountCode, debit, credit };
    });
    for (const { line, accountCode } of prepared) {
      await tx.financeAccount.upsert({
        where: { organizationId_code: { organizationId, code: accountCode } },
        update: { name: line.label, lastSyncedAt: new Date() },
        create: {
          organizationId,
          code: accountCode,
          name: line.label,
          category: line.category,
          lastSyncedAt: new Date(),
        },
      });
    }
    await tx.financeLedgerEntry.createMany({
      data: prepared.map(({ line, index, accountCode, debit, credit }) => ({
        organizationId,
        sourceId,
        externalKey: `document:${importBatchId}:${index}`,
        externalStatementId: importBatchId,
        accountCode,
        entryDate: document.periodEnd!,
        debit: new Prisma.Decimal(debit),
        credit: new Prisma.Decimal(credit),
        closingBalance:
          line.category === FinanceAccountCategory.CASH && line.amount != null
            ? new Prisma.Decimal(line.amount)
            : null,
        description: line.label,
        sourceEntityId: importBatchId,
        dimensions: {
          importBatchId,
          parser: 'mistral-accounting-ocr',
          language: document.language,
          documentType: document.documentType,
          companyName: document.companyName,
          confidence: document.confidence,
        },
      })),
      skipDuplicates: true,
    });
  }
}

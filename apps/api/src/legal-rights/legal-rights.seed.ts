import { Prisma, PrismaClient } from '@prisma/client';
import data from './data/fr-v1.json';

type LegalSeedData = typeof data;
type LegalSeedResult = {
  version: string;
  sourceHash: string;
  counts: Record<string, number>;
  skippedUnchanged: number;
  requiresReview: number;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function asDecimal(value: unknown) {
  return value == null ? null : new Prisma.Decimal(String(value));
}

function asDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

type LegalSeedLogger = { log: (message: string) => void };

export async function seedFrenchLegalRights(prisma: PrismaClient, seed: LegalSeedData = data, options: { logger?: LegalSeedLogger } = {}): Promise<LegalSeedResult> {
  const counts = {
    regimes: seed.regimes.length,
    agreements: seed.agreements.length,
    publicRegimes: seed.publicRegimes.length,
    rights: seed.rights.length,
    ruleVersions: seed.ruleVersions.length,
    jobFamilies: seed.jobFamilies.length,
    jobMappings: seed.jobMappings.length,
    tags: seed.tags.length,
    sources: seed.sources.length,
    phase2Validation: seed.phase2Validation.length,
  };
  const before = await Promise.all([
    prisma.legalRegime.count(),
    prisma.collectiveAgreement.count(),
    prisma.publicRegime.count(),
    prisma.legalRight.count(),
    prisma.legalRightRuleVersion.count(),
    prisma.legalJobFamily.count(),
    prisma.legalJobToAgreementMapping.count(),
  ]);
  const skippedUnchanged = before.reduce((sum, value) => sum + value, 0);
  const requiresReview = seed.ruleVersions.filter((rule) => rule.validationStatus === 'requires_review').length;

  const batch = await prisma.legalImportBatch.upsert({
    where: { sourceHash: seed.sourceWorkbookSha256 },
    create: {
      sourceVersion: seed.version,
      sourceFile: seed.sourceWorkbook,
      sourceHash: seed.sourceWorkbookSha256,
      counts,
      status: 'SUCCESS',
    },
    update: {
      sourceVersion: seed.version,
      sourceFile: seed.sourceWorkbook,
      counts,
      status: 'SUCCESS',
      importedAt: new Date(),
    },
  });

  for (const regime of seed.regimes) {
    await prisma.legalRegime.upsert({
      where: { code: regime.code },
      create: {
        code: regime.code,
        countryCode: regime.countryCode,
        type: regime.type,
        name: regime.name,
        description: regime.description,
        sourceUrl: regime.sourceUrl,
        active: regime.active,
        metadata: asJson(regime.metadata),
      },
      update: {
        countryCode: regime.countryCode,
        type: regime.type,
        name: regime.name,
        description: regime.description,
        sourceUrl: regime.sourceUrl,
        active: regime.active,
        metadata: asJson(regime.metadata),
      },
    });
  }

  for (const agreement of seed.agreements) {
    await prisma.collectiveAgreement.upsert({
      where: { key: agreement.key },
      create: {
        key: agreement.key,
        countryCode: agreement.countryCode,
        idcc: agreement.idcc,
        name: agreement.name,
        sector: agreement.sector,
        establishmentTypes: agreement.establishmentTypes,
        routingHints: agreement.routingHints,
        rightsToExtract: agreement.rightsToExtract,
        priority: agreement.priority,
        sourceUrl: agreement.sourceUrl,
        active: agreement.active,
        metadata: asJson(agreement.metadata),
      },
      update: {
        countryCode: agreement.countryCode,
        idcc: agreement.idcc,
        name: agreement.name,
        sector: agreement.sector,
        establishmentTypes: agreement.establishmentTypes,
        routingHints: agreement.routingHints,
        rightsToExtract: agreement.rightsToExtract,
        priority: agreement.priority,
        sourceUrl: agreement.sourceUrl,
        active: agreement.active,
        metadata: asJson(agreement.metadata),
      },
    });
  }

  for (const publicRegime of seed.publicRegimes) {
    await prisma.publicRegime.upsert({
      where: { code: publicRegime.code },
      create: {
        code: publicRegime.code,
        countryCode: publicRegime.countryCode,
        name: publicRegime.name,
        publicFunctionType: publicRegime.publicFunctionType,
        sourceUrl: publicRegime.sourceUrl,
        active: publicRegime.active,
        metadata: asJson(publicRegime.metadata),
      },
      update: {
        countryCode: publicRegime.countryCode,
        name: publicRegime.name,
        publicFunctionType: publicRegime.publicFunctionType,
        sourceUrl: publicRegime.sourceUrl,
        active: publicRegime.active,
        metadata: asJson(publicRegime.metadata),
      },
    });
  }

  for (const right of seed.rights) {
    await prisma.legalRight.upsert({
      where: { code: right.code },
      create: {
        code: right.code,
        name: right.name,
        category: right.category,
        description: right.description,
        tags: right.tags,
        active: right.active,
        metadata: asJson(right.metadata),
      },
      update: {
        name: right.name,
        category: right.category,
        description: right.description,
        tags: right.tags,
        active: right.active,
        metadata: asJson(right.metadata),
      },
    });
  }

  for (const family of seed.jobFamilies) {
    await prisma.legalJobFamily.upsert({
      where: { code: family.code },
      create: {
        code: family.code,
        label: family.label,
        examples: family.examples,
        metadata: asJson(family.metadata),
      },
      update: {
        label: family.label,
        examples: family.examples,
        metadata: asJson(family.metadata),
      },
    });
  }

  const [regimes, agreements, publicRegimes, rights, jobFamilies] = await Promise.all([
    prisma.legalRegime.findMany(),
    prisma.collectiveAgreement.findMany(),
    prisma.publicRegime.findMany(),
    prisma.legalRight.findMany(),
    prisma.legalJobFamily.findMany(),
  ]);
  const regimeByCode = new Map(regimes.map((item) => [item.code, item]));
  const agreementByKey = new Map(agreements.map((item) => [item.key, item]));
  const publicByCode = new Map(publicRegimes.map((item) => [item.code, item]));
  const rightByCode = new Map(rights.map((item) => [item.code, item]));
  const jobFamilyByCode = new Map(jobFamilies.map((item) => [item.code, item]));

  for (const rule of seed.ruleVersions) {
    const right = rightByCode.get(rule.rightCode);
    if (!right) throw new Error(`Unknown legal right code in seed: ${rule.rightCode}`);
    const regime = rule.regimeCode ? regimeByCode.get(rule.regimeCode) : null;
    const agreement = rule.agreementKey ? agreementByKey.get(rule.agreementKey) : null;
    const publicRegime = rule.publicRegimeCode ? publicByCode.get(rule.publicRegimeCode) : null;
    await prisma.legalRightRuleVersion.upsert({
      where: { stableId: rule.stableId },
      create: {
        stableId: rule.stableId,
        version: rule.version,
        rightId: right.id,
        regimeId: regime?.id ?? null,
        agreementId: agreement?.id ?? null,
        publicRegimeId: publicRegime?.id ?? null,
        countryCode: rule.countryCode,
        sector: rule.sector,
        establishmentType: rule.establishmentType,
        contractType: rule.contractType,
        jobFamilyCode: rule.jobFamilyCode,
        minSeniorityMonths: rule.minSeniorityMonths,
        maxSeniorityMonths: rule.maxSeniorityMonths,
        fullTimeEquivalent: asDecimal(rule.fullTimeEquivalent),
        effectiveFrom: asDate(rule.effectiveFrom) ?? new Date(),
        effectiveTo: asDate(rule.effectiveTo),
        priority: rule.priority,
        unit: rule.unit,
        value: asDecimal(rule.value),
        formulaType: rule.formulaType,
        formulaJson: asJson(rule.formulaJson),
        conditionsJson: asJson(rule.conditionsJson),
        sourceLabel: rule.sourceLabel,
        sourceUrl: rule.sourceUrl,
        validationStatus: rule.validationStatus,
        confidenceLevel: asDecimal(rule.confidenceLevel),
        lastVerifiedAt: asDate(rule.lastVerifiedAt),
        active: rule.active,
        importBatchId: batch.id,
      },
      update: {
        version: rule.version,
        rightId: right.id,
        regimeId: regime?.id ?? null,
        agreementId: agreement?.id ?? null,
        publicRegimeId: publicRegime?.id ?? null,
        countryCode: rule.countryCode,
        sector: rule.sector,
        establishmentType: rule.establishmentType,
        contractType: rule.contractType,
        jobFamilyCode: rule.jobFamilyCode,
        minSeniorityMonths: rule.minSeniorityMonths,
        maxSeniorityMonths: rule.maxSeniorityMonths,
        fullTimeEquivalent: asDecimal(rule.fullTimeEquivalent),
        effectiveFrom: asDate(rule.effectiveFrom) ?? new Date(),
        effectiveTo: asDate(rule.effectiveTo),
        priority: rule.priority,
        unit: rule.unit,
        value: asDecimal(rule.value),
        formulaType: rule.formulaType,
        formulaJson: asJson(rule.formulaJson),
        conditionsJson: asJson(rule.conditionsJson),
        sourceLabel: rule.sourceLabel,
        sourceUrl: rule.sourceUrl,
        validationStatus: rule.validationStatus,
        confidenceLevel: asDecimal(rule.confidenceLevel),
        lastVerifiedAt: asDate(rule.lastVerifiedAt),
        active: rule.active,
        importBatchId: batch.id,
      },
    });
  }

  for (const mapping of seed.jobMappings) {
    const family = jobFamilyByCode.get(mapping.jobFamilyCode);
    if (!family) throw new Error(`Unknown job family code in seed: ${mapping.jobFamilyCode}`);
    const agreement = mapping.agreementKey ? agreementByKey.get(mapping.agreementKey) : null;
    const publicRegime = mapping.publicRegimeCode ? publicByCode.get(mapping.publicRegimeCode) : null;
    await prisma.legalJobToAgreementMapping.upsert({
      where: { stableKey: mapping.stableKey },
      create: {
        stableKey: mapping.stableKey,
        jobFamilyId: family.id,
        agreementId: agreement?.id ?? null,
        publicRegimeId: publicRegime?.id ?? null,
        establishmentType: mapping.establishmentType,
        confidenceLevel: asDecimal(mapping.confidenceLevel),
        notes: mapping.notes,
        metadata: asJson(mapping.metadata),
      },
      update: {
        jobFamilyId: family.id,
        agreementId: agreement?.id ?? null,
        publicRegimeId: publicRegime?.id ?? null,
        establishmentType: mapping.establishmentType,
        confidenceLevel: asDecimal(mapping.confidenceLevel),
        notes: mapping.notes,
        metadata: asJson(mapping.metadata),
      },
    });
  }

  options.logger?.log(`Imported legal regimes: ${counts.regimes}`);
  options.logger?.log(`Imported agreements: ${counts.agreements}`);
  options.logger?.log(`Imported public regimes: ${counts.publicRegimes}`);
  options.logger?.log(`Imported rights: ${counts.rights}`);
  options.logger?.log(`Imported rule versions: ${counts.ruleVersions}`);
  options.logger?.log(`Skipped unchanged: ${skippedUnchanged}`);
  options.logger?.log(`Requires review: ${requiresReview}`);

  return {
    version: seed.version,
    sourceHash: seed.sourceWorkbookSha256,
    counts,
    skippedUnchanged,
    requiresReview,
  };
}

import { BadRequestException } from '@nestjs/common';
import { HrTimeAccountDirection, PlanningTimeUnit } from '@prisma/client';
import { HrEntitlementService } from '../hr/entitlements/hr-entitlement.service';
import { HrTimeAccountService } from '../hr/time-accounts/hr-time-account.service';
import legalSeed from './data/fr-v1.json';
import { seedFrenchLegalRights } from './legal-rights.seed';
import { LegalRightsService } from './legal-rights.service';

function mockPrisma(overrides?: any): any {
  const base = {
    legalRight: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    legalRightRuleVersion: { findMany: jest.fn(), upsert: jest.fn(), count: jest.fn() },
    legalImportBatch: { upsert: jest.fn(), findMany: jest.fn() },
    legalRegime: { upsert: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    collectiveAgreement: { upsert: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    publicRegime: { upsert: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    legalJobFamily: { upsert: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    legalJobToAgreementMapping: { upsert: jest.fn() },
    organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1', regulatoryCountryCode: 'FR' }) },
    hrEntitlementCatalogItem: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    hrEntitlementRule: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    hrEmployeeEntitlement: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    employeeLegalProfile: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    hrEmployee: { findFirst: jest.fn() },
    hrAbsence: { findMany: jest.fn() },
    planningAssignment: { findMany: jest.fn() },
    legalCalculationRun: { create: jest.fn(), update: jest.fn() },
    legalRightCounter: { upsert: jest.fn() },
    legalCalculationAuditLog: { create: jest.fn() },
    hrTimeAccount: { upsert: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    hrTimeAccountTransaction: { create: jest.fn(), upsert: jest.fn() },
  };
  return { ...base, ...(overrides ?? {}) };
}

function employee(overrides: Record<string, any> = {}) {
  return {
    id: 'emp-1',
    organizationId: 'org-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    hireDate: new Date('2026-01-01T00:00:00.000Z'),
    contractWeeklyMinutes: 2100,
    contractType: 'CDI',
    contractEndDate: null,
    mainSiteId: 'site-1',
    organization: { establishmentType: 'Restaurant privé' },
    mainSite: { id: 'site-1', name: 'Restaurant centre' },
    contracts: [],
    position: { name: 'Cuisinier' },
    department: { name: 'Cuisine' },
    ...overrides,
  };
}

function right(code: string, name = code, category = 'Test') {
  return { id: `right-${code}`, code, name, category, description: name, tags: [code], active: true };
}

function rule(code: string, formulaType: string, formulaJson: Record<string, any>, overrides: Record<string, any> = {}) {
  const legalRight = right(code, overrides.name ?? code, overrides.category ?? 'Test');
  return {
    id: `rule-${code}-${formulaType}`,
    stableId: `FR-TEST-${code}-${formulaType}`,
    right: legalRight,
    rightId: legalRight.id,
    regimeId: 'regime-private',
    agreementId: null,
    publicRegimeId: null,
    regime: { code: 'FR_PRIVATE', type: 'private', name: 'Secteur privé France' },
    agreement: null,
    publicRegime: null,
    countryCode: 'FR',
    sector: 'private',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    priority: 50,
    unit: 'jour',
    value: null,
    formulaType,
    formulaJson,
    conditionsJson: {},
    sourceLabel: 'Test',
    sourceUrl: 'https://example.test',
    validationStatus: 'active',
    confidenceLevel: 0.8,
    active: true,
    ...overrides,
  };
}

describe('legal rights seed data', () => {
  it('normalizes the Excel base into versioned searchable records', () => {
    expect(legalSeed.sheetCounts.Conventions_FR).toBe(14);
    expect(legalSeed.agreements).toHaveLength(11);
    expect(legalSeed.publicRegimes.map((item) => item.code)).toEqual(expect.arrayContaining(['FPH', 'FPT', 'FPE']));
    expect(legalSeed.rights.length).toBeGreaterThanOrEqual(60);
    expect(legalSeed.ruleVersions.some((item) => item.stableId === 'FR-PRIVATE-COMMON-ABS_ENFANT_MALADE-V1')).toBe(true);
  });

  it('uses stable upserts so the France import can be replayed without duplicate insert logic', async () => {
    const prisma = mockPrisma();
    const seed: any = {
      version: 'test-v1',
      sourceWorkbook: 'test.xlsx',
      sourceWorkbookSha256: 'hash-test',
      regimes: [{ code: 'FR_PRIVATE', countryCode: 'FR', type: 'private', name: 'Privé', description: null, sourceUrl: null, active: true, metadata: {} }],
      agreements: [],
      publicRegimes: [],
      rights: [{ code: 'CP', name: 'Congés payés', category: 'Congés', description: 'CP', tags: ['congés'], active: true, metadata: {} }],
      ruleVersions: [{
        stableId: 'FR-TEST-CP-V1',
        version: 1,
        rightCode: 'CP',
        regimeCode: 'FR_PRIVATE',
        agreementKey: null,
        publicRegimeCode: null,
        countryCode: 'FR',
        sector: 'private',
        establishmentType: null,
        contractType: null,
        jobFamilyCode: null,
        minSeniorityMonths: null,
        maxSeniorityMonths: null,
        fullTimeEquivalent: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        priority: 50,
        unit: 'jour ouvrable',
        value: 2.5,
        formulaType: 'monthly_accrual',
        formulaJson: { monthlyValue: 2.5 },
        conditionsJson: {},
        sourceLabel: 'Test',
        sourceUrl: 'https://example.test',
        validationStatus: 'active',
        confidenceLevel: 0.9,
        lastVerifiedAt: '2026-01-01',
        active: true,
      }],
      jobFamilies: [],
      jobMappings: [],
      tags: [],
      sources: [],
      phase2Validation: [],
    };
    prisma.legalRegime.count.mockResolvedValue(0);
    prisma.collectiveAgreement.count.mockResolvedValue(0);
    prisma.publicRegime.count.mockResolvedValue(0);
    prisma.legalRight.count = jest.fn().mockResolvedValue(0);
    prisma.legalRightRuleVersion.count.mockResolvedValue(0);
    prisma.legalJobFamily.count.mockResolvedValue(0);
    prisma.legalJobToAgreementMapping.count = jest.fn().mockResolvedValue(0);
    prisma.legalImportBatch.upsert.mockResolvedValue({ id: 'batch-1' });
    prisma.legalRegime.findMany.mockResolvedValue([{ id: 'regime-1', code: 'FR_PRIVATE' }]);
    prisma.collectiveAgreement.findMany.mockResolvedValue([]);
    prisma.publicRegime.findMany.mockResolvedValue([]);
    prisma.legalRight.findMany.mockResolvedValue([{ id: 'right-1', code: 'CP' }]);
    prisma.legalJobFamily.findMany.mockResolvedValue([]);

    await seedFrenchLegalRights(prisma, seed);
    await seedFrenchLegalRights(prisma, seed);

    expect(prisma.legalRightRuleVersion.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.legalRightRuleVersion.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { stableId: 'FR-TEST-CP-V1' } }));
  });
});

describe('LegalRightsService search', () => {
  it('finds rights with regime and convention context', async () => {
    const sickChild = right('ABS_ENFANT_MALADE', 'Congé pour enfant malade', 'Absences familiales');
    const prisma = mockPrisma();
    prisma.legalRight.findMany.mockResolvedValue([
      {
        ...sickChild,
        ruleVersions: [
          {
            ...rule('ABS_ENFANT_MALADE', 'sick_child_leave', { annualDays: 3 }),
            right: sickChild,
            agreement: { key: 'CCN_HCR_1979', idcc: '1979', name: 'Hôtels, cafés, restaurants (HCR)' },
          },
        ],
      },
    ]);
    const service = new LegalRightsService(prisma);
    const result = await service.search({ query: 'enfant malade HCR', country: 'FR', regime: 'private', idcc: '1979' });

    expect(result.count).toBe(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ code: 'ABS_ENFANT_MALADE' }));
    expect(result.items[0].rules[0].agreement?.idcc).toBe('1979');
  });

  it('returns France rights without a query and accepts regime=all', async () => {
    const prisma = mockPrisma();
    prisma.legalRight.findMany.mockResolvedValue([
      { ...right('CP', 'Congés payés', 'Congés'), ruleVersions: [rule('CP', 'monthly_accrual', { monthlyValue: 2.5 })] },
      { ...right('CA_PUBLIC', 'Congés annuels fonction publique', 'Congés'), ruleVersions: [rule('CA_PUBLIC', 'public_annual_leave', {}, { sector: 'public', regime: { code: 'FR_PUBLIC', type: 'public', name: 'Public' } })] },
    ]);
    const result = await new LegalRightsService(prisma).search({ country: 'FR', regime: 'all', status: 'all', includeRequiresReview: true });

    expect(result.count).toBe(2);
    expect(prisma.legalRight.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        ruleVersions: expect.objectContaining({
          where: expect.objectContaining({ sector: { in: ['private', 'public', 'common'] } }),
        }),
      }),
    }));
  });

  it('uses the organization regulatory country when the frontend does not send country', async () => {
    const prisma = mockPrisma();
    prisma.legalRight.findMany.mockResolvedValue([{ ...right('CP', 'Congés payés', 'Congés'), ruleVersions: [rule('CP', 'monthly_accrual', { monthlyValue: 2.5 })] }]);

    const result = await new LegalRightsService(prisma).search({ regime: 'all', status: 'all' }, 'org-1');

    expect(result.country).toBe('FR');
    expect(prisma.legalRight.findMany.mock.calls[0][0].include.ruleVersions.where.countryCode).toBe('FR');
  });

  it('does not load France rights for a Finland organization', async () => {
    const prisma = mockPrisma({
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1', regulatoryCountryCode: 'FI' }) },
    });
    prisma.legalRight.findMany.mockResolvedValue([]);

    const result = await new LegalRightsService(prisma).search({ regime: 'all' }, 'org-1');

    expect(result.country).toBe('FI');
    expect(result.count).toBe(0);
    expect(prisma.legalRight.findMany.mock.calls[0][0].include.ruleVersions.where.countryCode).toBe('FI');
  });

  it('maps private and public filters to their common legal base', async () => {
    const prisma = mockPrisma();
    prisma.legalRight.findMany.mockResolvedValue([]);
    const service = new LegalRightsService(prisma);

    await service.search({ country: 'FR', regime: 'private' });
    await service.search({ country: 'FR', regime: 'public' });

    expect(prisma.legalRight.findMany.mock.calls[0][0].include.ruleVersions.where.sector).toEqual({ in: ['private', 'common'] });
    expect(prisma.legalRight.findMany.mock.calls[1][0].include.ruleVersions.where.sector).toEqual({ in: ['public', 'common'] });
  });

  it('keeps requires_review visible by default', async () => {
    const prisma = mockPrisma();
    prisma.legalRight.findMany.mockResolvedValue([]);
    await new LegalRightsService(prisma).search({ country: 'FR', regime: 'all' });

    expect(prisma.legalRight.findMany.mock.calls[0][0].include.ruleVersions.where.validationStatus).toEqual({ in: ['active', 'requires_review'] });
  });

  it('marks France private common law CP as included automatically without required establishment configuration', async () => {
    const prisma = mockPrisma();
    prisma.legalRight.findMany.mockResolvedValue([
      { ...right('CP', 'Congés payés', 'Congés'), ruleVersions: [rule('CP', 'monthly_accrual', { monthlyValue: 2.5 }, { category: 'Congés' })] },
    ]);

    const result = await new LegalRightsService(prisma).search({ country: 'FR', regime: 'private', status: 'all', includeRequiresReview: true });

    expect(result.items[0]).toEqual(expect.objectContaining({
      code: 'CP',
      sourceLayer: 'common_law',
      autoApplicable: true,
      applicableByDefault: true,
      requiresConfiguration: false,
      uiStatus: 'included',
      establishmentConfigurationId: null,
    }));
  });

  it('marks France private common law overtime as applicable by default', async () => {
    const prisma = mockPrisma();
    prisma.legalRight.findMany.mockResolvedValue([
      { ...right('HS', 'Heures supplémentaires', 'Temps de travail'), ruleVersions: [rule('HS', 'overtime_threshold', { weeklyThresholdHours: 35 }, { category: 'Temps de travail' })] },
    ]);

    const result = await new LegalRightsService(prisma).search({ country: 'FR', regime: 'private', status: 'all', includeRequiresReview: true });

    expect(result.items[0]).toEqual(expect.objectContaining({
      code: 'HS',
      autoApplicable: true,
      applicableByDefault: true,
      sourceLayer: 'common_law',
    }));
  });

  it('keeps common law rules requiring review visible with an included review status', async () => {
    const prisma = mockPrisma();
    prisma.legalRight.findMany.mockResolvedValue([
      {
        ...right('MATERNITE', 'Congé maternité', 'Absences'),
        ruleVersions: [rule('MATERNITE', 'requires_review', { rawText: 'À valider' }, { category: 'Absences', validationStatus: 'requires_review' })],
      },
    ]);

    const result = await new LegalRightsService(prisma).search({ country: 'FR', regime: 'private', status: 'all', includeRequiresReview: true });

    expect(result.count).toBe(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      code: 'MATERNITE',
      autoApplicable: true,
      validationStatus: 'requires_review',
      uiStatus: 'included_requires_review',
    }));
  });
});

describe('LegalRightsService employee applicable rights', () => {
  function serviceWithCommonLawRules(rules: any[], employeeOverride: Record<string, any> = {}, organizationOverride: Record<string, any> = {}) {
    const prisma = mockPrisma(organizationOverride);
    prisma.hrEmployee.findFirst.mockResolvedValue(employee({
      organization: { establishmentType: 'Entreprise privée' },
      ...employeeOverride,
    }));
    prisma.employeeLegalProfile.findFirst.mockResolvedValue(null);
    prisma.collectiveAgreement.findFirst.mockResolvedValue(null);
    prisma.publicRegime.findFirst.mockResolvedValue(null);
    prisma.legalRightRuleVersion.findMany.mockResolvedValue(rules);
    prisma.hrAbsence.findMany.mockResolvedValue([]);
    prisma.planningAssignment.findMany.mockResolvedValue([]);
    return { prisma, service: new LegalRightsService(prisma) };
  }

  it('returns France private common law rights for an employee with an active contract', async () => {
    const activeContract = { status: 'ACTIVE', startDate: new Date('2026-01-01T00:00:00.000Z'), endDate: null, contractType: 'CDI', weeklyHours: 35 };
    const { service } = serviceWithCommonLawRules([
      rule('CP', 'monthly_accrual', { monthlyValue: 2.5 }, { name: 'Congés payés', category: 'Congés' }),
      rule('HS', 'overtime_threshold', { weeklyThresholdHours: 35 }, { name: 'Heures supplémentaires', category: 'Temps de travail' }),
      rule('PAUSE_6H', 'planning_break_after_work', { triggerWorkedMinutes: 360, minimumBreakMinutes: 20 }, { name: 'Pause obligatoire', category: 'Temps de travail' }),
    ], { status: 'ACTIVE', contracts: [activeContract] });

    const result = await service.employeeApplicableRights('org-1', 'emp-1', { periodStart: '2026-01-01', periodEnd: '2026-01-31' });

    expect(result.hasActiveContract).toBe(true);
    expect(result.calculationStatus).toBe('complete');
    expect(result.applicableRights.map((item: any) => item.code)).toEqual(expect.arrayContaining(['CP', 'HS', 'PAUSE_6H']));
    expect(result.applicableRights.find((item: any) => item.code === 'CP')).toEqual(expect.objectContaining({
      sourceLayer: 'common_law',
      autoApplicable: true,
      applicableByDefault: true,
      uiStatus: 'included',
    }));
  });

  it('returns common law potential rights with a warning when the employee has no active contract', async () => {
    const { service } = serviceWithCommonLawRules([
      rule('CP', 'monthly_accrual', { monthlyValue: 2.5 }, { name: 'Congés payés', category: 'Congés' }),
    ], { status: 'ACTIVE', contractType: null, contracts: [] });

    const result = await service.employeeApplicableRights('org-1', 'emp-1', { periodStart: '2026-01-01', periodEnd: '2026-01-31' });

    expect(result.hasActiveContract).toBe(false);
    expect(result.calculationStatus).toBe('partial');
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'missing_active_contract' })]));
    expect(result.applicableRights.find((item: any) => item.code === 'CP')).toEqual(expect.objectContaining({ autoApplicable: true }));
  });

  it('blocks employee applicable rights when the organization regulatory country is missing', async () => {
    const { prisma, service } = serviceWithCommonLawRules([], {}, {
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1', regulatoryCountryCode: null }) },
    });

    const result = await service.employeeApplicableRights('org-1', 'emp-1', { periodStart: '2026-01-01', periodEnd: '2026-01-31' });

    expect(result.calculationStatus).toBe('blocked');
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'missing_regulatory_country' })]);
    expect(prisma.hrEmployee.findFirst).not.toHaveBeenCalled();
  });
});

describe('LegalRightsService diagnostics and activation', () => {
  it('returns legal database counters for diagnostics', async () => {
    const prisma = mockPrisma();
    prisma.legalRegime.count.mockResolvedValue(3);
    prisma.collectiveAgreement.count.mockResolvedValue(11);
    prisma.publicRegime.count.mockResolvedValue(3);
    prisma.legalRight.count = jest.fn().mockResolvedValue(60);
    prisma.legalRightRuleVersion.count.mockResolvedValueOnce(68).mockResolvedValueOnce(68).mockResolvedValueOnce(48);
    prisma.legalImportBatch.findMany.mockResolvedValue([{ importedAt: new Date('2026-06-28T15:36:58.980Z'), sourceVersion: 'toquehub-fr-legal-rights-v1', sourceFile: 'test.xlsx', sourceHash: 'hash', status: 'SUCCESS', counts: { rights: 60 } }]);

    const result = await new LegalRightsService(prisma).diagnostics();

    expect(result.counts).toEqual(expect.objectContaining({ rights: 60, ruleVersions: 68, requiresReviewRules: 48 }));
    expect(result.importErrors).toEqual([]);
  });

  it('activates a legal right as an establishment model without duplicating the legal rule', async () => {
    const prisma = mockPrisma();
    const legalRight = right('ABS_ENFANT_MALADE', 'Congé pour enfant malade', 'Absence');
    const legalRule = rule('ABS_ENFANT_MALADE', 'sick_child_leave', { annualDays: 3 }, { id: 'rule-legal-1', stableId: 'FR-PRIVATE-COMMON-ABS_ENFANT_MALADE-V1', validationStatus: 'requires_review', right: legalRight });
    prisma.legalRight.findFirst.mockResolvedValue({ ...legalRight, ruleVersions: [legalRule] });
    prisma.hrEntitlementRule.upsert.mockResolvedValue({ id: 'org-rule-1', code: 'legal_fr_abs_enfant_malade' });

    const result = await new LegalRightsService(prisma).activateRight('org-1', { id: 'user-1', role: 'ADMIN' }, legalRight.id, { ruleVersionId: legalRule.id });

    expect(result.warning).toContain('à valider juridiquement');
    expect(result.establishmentConfiguration).toEqual(expect.objectContaining({ id: 'org-rule-1' }));
    expect(prisma.hrEntitlementRule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        sourceRightId: legalRight.id,
        sourceRuleVersionId: legalRule.id,
        metadata: expect.objectContaining({
          sourceLegalRightId: legalRight.id,
          sourceRuleVersionId: legalRule.id,
          sourceRuleStableId: legalRule.stableId,
        }),
      }),
    }));
    expect(prisma.legalRight.upsert).not.toHaveBeenCalled();
    expect(prisma.legalRightRuleVersion.upsert).not.toHaveBeenCalled();
  });

  it('keeps a manual catalog template as an establishment configuration without LegalRight duplication', async () => {
    const prisma = mockPrisma();
    prisma.hrEntitlementCatalogItem.findFirst.mockResolvedValue({
      id: 'template-recovery',
      organizationId: 'org-1',
      countryCode: 'FR',
      code: 'recovery_manual',
      label: 'Récupération interne',
      description: 'Modèle interne',
      longDescription: 'Modèle interne de récupération',
      accountType: 'recovery',
      unit: PlanningTimeUnit.MINUTES,
      defaultAccrualFrequency: 'MANUAL',
      defaultAccrualQuantity: null,
      startsAfterTrialPeriod: false,
      minimumSeniorityMonths: null,
      prorateByContractTime: false,
      maxBalance: null,
      carryOverEnabled: true,
    });
    prisma.hrEntitlementRule.upsert.mockResolvedValue({ id: 'config-manual-1', code: 'recovery_manual' });

    const result = await new HrEntitlementService(prisma).activateCatalogItem('org-1', { id: 'user-1', role: 'ADMIN' }, 'template-recovery', { targetMode: 'NONE' });

    const upsertArgs = prisma.hrEntitlementRule.upsert.mock.calls[0][0];
    expect(result.establishmentConfiguration).toEqual(expect.objectContaining({ id: 'config-manual-1' }));
    expect(upsertArgs.create.sourceRightId).toBeUndefined();
    expect(upsertArgs.create.sourceRuleVersionId).toBeUndefined();
    expect(upsertArgs.create.metadata).toEqual(expect.objectContaining({ sourceCatalogItemId: 'template-recovery', sourceKind: 'manual_template' }));
    expect(prisma.legalRight.findFirst).not.toHaveBeenCalled();
    expect(prisma.legalRight.upsert).not.toHaveBeenCalled();
    expect(prisma.legalRightRuleVersion.upsert).not.toHaveBeenCalled();
  });

  it('does not turn a time account adjustment into a legal source', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.hrTimeAccount.upsert.mockResolvedValue({ id: 'account-1' });
    prisma.hrTimeAccountTransaction.create.mockResolvedValue({ id: 'tx-1' });
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    await new HrTimeAccountService(prisma).adjust('org-1', { id: 'user-1', role: 'ADMIN' }, {
      employeeId: 'emp-1',
      periodYear: 2026,
      code: 'paid_leave',
      label: 'Congés payés',
      unit: PlanningTimeUnit.DAYS,
      quantity: 1,
      direction: HrTimeAccountDirection.CREDIT,
      comment: 'Ajustement compteur',
    });

    expect(prisma.hrTimeAccountTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sourceType: 'MANUAL_ADJUSTMENT' }),
    }));
    expect(prisma.hrEntitlementRule.upsert).not.toHaveBeenCalled();
    expect(prisma.legalRight.findFirst).not.toHaveBeenCalled();
    expect(prisma.legalRightRuleVersion.upsert).not.toHaveBeenCalled();
  });
});

describe('LegalRightsService calculations', () => {
  function serviceWithRules(rules: any[], employeeOverride: Record<string, any> = {}) {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue(employee(employeeOverride));
    prisma.employeeLegalProfile.findFirst.mockResolvedValue(null);
    prisma.collectiveAgreement.findFirst.mockResolvedValue({ id: 'agreement-hcr', key: 'CCN_HCR_1979', idcc: '1979', name: 'HCR' });
    prisma.publicRegime.findFirst.mockResolvedValue(null);
    prisma.legalRightRuleVersion.findMany.mockResolvedValue(rules);
    prisma.hrAbsence.findMany.mockResolvedValue([]);
    prisma.planningAssignment.findMany.mockResolvedValue([]);
    return new LegalRightsService(prisma);
  }

  it('calculates paid leave on a full private month', async () => {
    const service = serviceWithRules([rule('CP', 'monthly_accrual', { monthlyValue: 2.5 })]);
    const result = await service.calculate('org-1', { employee_id: 'emp-1', period_start: '2026-01-01', period_end: '2026-01-31', persist: false });
    expect(result.counters.find((counter: any) => counter.right.code === 'CP')).toEqual(expect.objectContaining({ acquired: 2.5, remaining: 2.5 }));
  });

  it('blocks calculations when the organization has no regulatory country', async () => {
    const prisma = mockPrisma({
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1', regulatoryCountryCode: null }) },
    });
    const result = await new LegalRightsService(prisma).calculate('org-1', { employee_id: 'emp-1', period_start: '2026-01-01', period_end: '2026-01-31', persist: false });

    expect(result).toEqual(expect.objectContaining({
      calculation_status: 'blocked',
      reason: 'missing_regulatory_country',
    }));
    expect(prisma.hrEmployee.findFirst).not.toHaveBeenCalled();
  });

  it('prorates paid leave for an entry during the month', async () => {
    const service = serviceWithRules([rule('CP', 'monthly_accrual', { monthlyValue: 2.5 })], { hireDate: new Date('2026-01-16T00:00:00.000Z') });
    const result = await service.calculate('org-1', { employee_id: 'emp-1', period_start: '2026-01-01', period_end: '2026-01-31', persist: false });
    expect(result.counters.find((counter: any) => counter.right.code === 'CP')?.acquired).toBe(1.29);
  });

  it('prorates paid leave for part-time work', async () => {
    const service = serviceWithRules([rule('CP', 'monthly_accrual', { monthlyValue: 2.5 })], { contractWeeklyMinutes: 1050 });
    const result = await service.calculate('org-1', { employee_id: 'emp-1', period_start: '2026-01-01', period_end: '2026-01-31', persist: false });
    expect(result.counters.find((counter: any) => counter.right.code === 'CP')?.acquired).toBe(1.25);
  });

  it('calculates sick child leave eligibility and enhanced ceiling', async () => {
    const service = serviceWithRules([rule('ABS_ENFANT_MALADE', 'sick_child_leave', { annualDays: 3, annualDaysIfChildUnderOneOrThreeChildrenUnderSixteen: 5, childMaxAge: 16 })]);
    const eligible = await service.calculate('org-1', { employee_id: 'emp-1', period_start: '2026-01-01', period_end: '2026-12-31', persist: false, context: { sickChild: { childAge: 4, childrenUnder16: 1 } } });
    const enhanced = await service.calculate('org-1', { employee_id: 'emp-1', period_start: '2026-01-01', period_end: '2026-12-31', persist: false, context: { sickChild: { childAge: 0.5, childrenUnder16: 1 } } });
    const notEligible = await service.calculate('org-1', { employee_id: 'emp-1', period_start: '2026-01-01', period_end: '2026-12-31', persist: false, context: { sickChild: { childAge: 16, childrenUnder16: 1 } } });

    expect(eligible.counters[0].acquired).toBe(3);
    expect(enhanced.counters[0].acquired).toBe(5);
    expect(notEligible.counters[0].acquired).toBe(0);
  });

  it('keeps incomplete rules incomplete instead of inventing a value', async () => {
    const service = serviceWithRules([rule('JF_HCR_GARANTI', 'requires_review', { rawText: 'À coder précisément' }, { validationStatus: 'requires_review', priority: 1 })]);
    const result = await service.calculate('org-1', { employee_id: 'emp-1', period_start: '2026-01-01', period_end: '2026-12-31', persist: false });
    expect(result.calculation_status).toBe('incomplete');
    expect(result.counters[0].calculation_status).toBe('incomplete');
  });

  it('calculates public annual leave separately from private agreements', async () => {
    const publicRule = rule('CA_PUBLIC', 'public_annual_leave', { multiplierWorkedDaysPerWeek: 5 }, {
      sector: 'public',
      regime: { code: 'FR_PUBLIC', type: 'public', name: 'Fonction publique France' },
      publicRegimeId: 'public-fpt',
      publicRegime: { id: 'public-fpt', code: 'FPT', name: 'Fonction publique territoriale' },
      unit: 'jour ouvré',
    });
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue(employee({ organization: { establishmentType: 'Cantine publique municipale' }, contractWeeklyMinutes: 2100 }));
    prisma.employeeLegalProfile.findFirst.mockResolvedValue(null);
    prisma.publicRegime.findFirst.mockResolvedValue({ id: 'public-fpt', code: 'FPT', name: 'Fonction publique territoriale' });
    prisma.legalRightRuleVersion.findMany.mockResolvedValue([publicRule]);
    prisma.hrAbsence.findMany.mockResolvedValue([]);
    prisma.planningAssignment.findMany.mockResolvedValue([]);

    const result = await new LegalRightsService(prisma).calculate('org-1', { employee_id: 'emp-1', period_start: '2026-01-01', period_end: '2026-12-31', persist: false, context: { weeklyWorkedDays: 5 } });
    expect(result.legalProfile.regimeType).toBe('public');
    expect(result.counters[0]).toEqual(expect.objectContaining({ acquired: 25, unit: 'jour ouvré' }));
  });
});

describe('LegalRightsService planning compliance', () => {
  it('detects rest, break and overtime alerts from parameterized rules', async () => {
    const rules = [
      rule('REPOS_QUOTIDIEN', 'planning_min_rest', { minimumHours: 11 }),
      rule('PAUSE_6H', 'planning_break_after_work', { triggerWorkedMinutes: 360, minimumBreakMinutes: 20 }),
      rule('HS', 'overtime_threshold', { weeklyThresholdHours: 35 }),
      rule('REPOS_HEBDOMADAIRE', 'planning_weekly_rest', { maxWorkedDaysPerWeek: 6 }),
    ];
    const service = serviceForCompliance(rules);
    const result = await service.planningCompliance('org-1', {
      employee_id: 'emp-1',
      period_start: '2026-01-05',
      period_end: '2026-01-11',
      shifts: [
        { date: '2026-01-05', startTime: '08:00', endTime: '22:00', breakMinutes: 0 },
        { date: '2026-01-06', startTime: '06:00', endTime: '14:00', breakMinutes: 30 },
        { date: '2026-01-07', startTime: '08:00', endTime: '16:00', breakMinutes: 30 },
        { date: '2026-01-08', startTime: '08:00', endTime: '16:00', breakMinutes: 30 },
        { date: '2026-01-09', startTime: '08:00', endTime: '16:00', breakMinutes: 30 },
      ],
    });

    expect(result.alerts.map((alert: any) => alert.code)).toEqual(expect.arrayContaining(['REST_DAILY_INSUFFICIENT', 'BREAK_MISSING', 'OVERTIME_WEEKLY']));
    expect(result.overtime.hours).toBeGreaterThan(0);
    expect(result.compensatoryRest[0]).toEqual(expect.objectContaining({ code: 'RECUP_HS', sourceRuleId: expect.any(String) }));
  });

  it('applies FPH daily rest as a public rule', async () => {
    const publicRest = rule('VALIDATION_REPOS_FPH', 'planning_min_rest', { minimumHours: 12 }, {
      sector: 'public',
      publicRegimeId: 'public-fph',
      publicRegime: { id: 'public-fph', code: 'FPH', name: 'Fonction publique hospitalière' },
    });
    const service = serviceForCompliance([publicRest], { organization: { establishmentType: 'Hôpital public' } }, { code: 'FPH', id: 'public-fph', name: 'Fonction publique hospitalière' });
    const result = await service.planningCompliance('org-1', {
      employee_id: 'emp-1',
      period_start: '2026-01-05',
      period_end: '2026-01-06',
      shifts: [
        { date: '2026-01-05', startTime: '08:00', endTime: '20:00', breakMinutes: 30 },
        { date: '2026-01-06', startTime: '07:00', endTime: '15:00', breakMinutes: 30 },
      ],
    });

    expect(result.legalProfile.regimeType).toBe('public');
    expect(result.blockingAlerts[0]).toEqual(expect.objectContaining({ code: 'REST_DAILY_INSUFFICIENT' }));
  });

  function serviceForCompliance(rules: any[], employeeOverride: Record<string, any> = {}, publicRegime: any = null) {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue(employee(employeeOverride));
    prisma.employeeLegalProfile.findFirst.mockResolvedValue(null);
    prisma.collectiveAgreement.findFirst.mockResolvedValue({ id: 'agreement-hcr', key: 'CCN_HCR_1979', idcc: '1979', name: 'HCR' });
    prisma.publicRegime.findFirst.mockResolvedValue(publicRegime);
    prisma.legalRightRuleVersion.findMany.mockResolvedValue(rules);
    return new LegalRightsService(prisma);
  }
});

describe('HEURE_VERTE origin guard', () => {
  it('rejects green hours without legal or event origin', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    const service = new HrTimeAccountService(prisma);

    await expect(service.adjust('org-1', { id: 'user-1', role: 'ADMIN' }, {
      employeeId: 'emp-1',
      periodYear: 2026,
      code: 'green_hours',
      label: 'Heure verte',
      unit: PlanningTimeUnit.MINUTES,
      quantity: 60,
      direction: HrTimeAccountDirection.CREDIT,
    })).rejects.toThrow(BadRequestException);
  });

  it('accepts green hours with a reason and source rule', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.hrTimeAccount.upsert.mockResolvedValue({ id: 'account-1' });
    prisma.hrTimeAccountTransaction.create.mockResolvedValue({ id: 'tx-1' });
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);
    const service = new HrTimeAccountService(prisma);

    await service.adjust('org-1', { id: 'user-1', role: 'ADMIN' }, {
      employeeId: 'emp-1',
      periodYear: 2026,
      code: 'green_hours',
      label: 'Heure verte',
      unit: PlanningTimeUnit.MINUTES,
      quantity: 60,
      direction: HrTimeAccountDirection.CREDIT,
      comment: 'Récupération heure supplémentaire validée',
      metadata: { source_rule_id: 'rule-hs', reason: 'RECUP_HS' },
    });

    expect(prisma.hrTimeAccountTransaction.create).toHaveBeenCalled();
  });
});

import { HrAbsenceStatus, HrAbsenceType, PlanningAssignmentStatus, PlanningAttendanceStatus, HrTimeAccountDirection, HrTimeAccountSourceType, PlanningDayStatusSourceType, HrEntitlementAccrualFrequency, PlanningTimeUnit } from '@prisma/client';
import { PlanningAttendanceService } from './planning-attendance.service';
import { HrTimeAccountService } from '../hr/time-accounts/hr-time-account.service';
import { PlanningDayStatusService } from './planning-day-status.service';
import { HrEntitlementService } from '../hr/entitlements/hr-entitlement.service';
import { HR_ENTITLEMENT_CATALOG } from '../hr/entitlements/hr-entitlement-catalog';
import { calculatePlanningAssignmentMinutes } from './planning-time';

const actor = { id: 'user-1', role: 'ADMIN' };

function mockPrisma(overrides?: any): any {
  const base = {
    planningDayStatus: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    planningAssignment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    hrAbsence: {
      findMany: jest.fn(),
    },
    hrEmployee: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    hrTimeAccount: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    hrTimeAccountTransaction: {
      upsert: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    planningCodeDictionary: {
      findMany: jest.fn(),
    },
    site: {
      findFirst: jest.fn(),
    },
    planningAttendanceEntry: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    hrEntitlementRule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    hrEntitlementCatalogItem: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    hrEmployeeEntitlement: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  return { ...base, ...(overrides || {}) };
}

describe('Planning time calculation', () => {
  it('calculates planned minutes once, including breaks and overnight shifts', () => {
    expect(calculatePlanningAssignmentMinutes({
      startTime: new Date('2026-06-22T22:00:00.000Z'),
      endTime: new Date('2026-06-22T02:00:00.000Z'),
      breakMinutes: 30,
    })).toEqual(expect.objectContaining({
      grossMinutes: 240,
      plannedMinutes: 210,
      crossesMidnight: true,
    }));
  });

  it('returns zero minutes for cancelled or replaced assignments', () => {
    expect(calculatePlanningAssignmentMinutes({
      startTime: new Date('2026-06-22T09:00:00.000Z'),
      endTime: new Date('2026-06-22T17:00:00.000Z'),
      breakMinutes: 30,
      status: PlanningAssignmentStatus.REPLACED,
    })).toEqual(expect.objectContaining({
      plannedMinutes: 0,
      warnings: ['CANCELLED_OR_REPLACED'],
    }));
  });
});

describe('Planning foundations day statuses', () => {
  it('does not create duplicate manual day statuses for the same employee and date', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningDayStatus.findFirst.mockResolvedValue({ id: 'status-1', createdById: 'user-old' });
    prisma.planningDayStatus.update.mockResolvedValue({ id: 'status-1' });

    const service = new PlanningDayStatusService(prisma);
    await service.upsert('org-1', actor, {
      employeeId: 'emp-1',
      date: '2026-06-22',
      statusCode: 'CP',
      label: 'Congé payé',
      affectsCounters: true,
    });

    expect(prisma.planningDayStatus.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', dedupeKey: 'manual:emp-1:2026-06-22:cp' },
    });
    expect(prisma.planningDayStatus.update).toHaveBeenCalled();
    expect(prisma.planningDayStatus.create).not.toHaveBeenCalled();
  });

  it('deduplicates day statuses linked to the same HR absence and date', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningDayStatus.findFirst.mockResolvedValue({ id: 'status-absence', createdById: null });
    prisma.planningDayStatus.update.mockResolvedValue({ id: 'status-absence' });

    const service = new PlanningDayStatusService(prisma);
    await service.upsert('org-1', actor, {
      employeeId: 'emp-1',
      date: '2026-06-22',
      statusCode: 'maladie',
      label: 'Maladie',
      sourceType: PlanningDayStatusSourceType.HR_ABSENCE,
      sourceId: 'absence-1',
      affectsCounters: true,
    });

    expect(prisma.planningDayStatus.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', dedupeKey: 'hr-absence:absence-1:2026-06-22' },
    });
    expect(prisma.planningDayStatus.update).toHaveBeenCalled();
    expect(prisma.planningDayStatus.create).not.toHaveBeenCalled();
  });

  it('summarizes persisted statuses while keeping the assignment comment fallback readable', async () => {
    const prisma = mockPrisma();
    prisma.planningDayStatus.findMany.mockResolvedValue([
      { statusCode: 'recovery' },
    ]);
    prisma.planningAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-22T00:00:00.000Z'),
        comment: JSON.stringify({ planningAssignmentMeta: { businessStatus: 'vacation' } }),
      },
      {
        id: 'assignment-2',
        employeeId: 'emp-1',
        date: new Date('2026-06-23T00:00:00.000Z'),
        comment: JSON.stringify({ planningAssignmentMeta: { businessStatus: 'work' } }),
      },
    ]);
    prisma.hrAbsence.findMany.mockResolvedValue([
      { id: 'absence-1', employeeId: 'emp-1', type: HrAbsenceType.MALADIE, startDate: new Date('2026-06-24T00:00:00.000Z'), endDate: new Date('2026-06-24T00:00:00.000Z') },
    ]);

    const service = new PlanningDayStatusService(prisma);
    const summary = await service.periodSummary('org-1', { startDate: '2026-06-01', endDate: '2026-06-30' });

    expect(summary.persistedCount).toBe(1);
    expect(summary.legacyAssignmentCommentCount).toBe(1);
    expect(summary.hrAbsenceCount).toBe(1);
    expect(summary.codes).toEqual(expect.arrayContaining([
      { code: 'recovery', count: 1 },
      { code: 'vacation', count: 1 },
      { code: 'hr_maladie', count: 1 },
    ]));
    expect(prisma.planningAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { not: PlanningAssignmentStatus.CANCELLED } }),
    }));
    expect(prisma.hrAbsence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: HrAbsenceStatus.APPROVED }),
    }));
  });
});

describe('Planning foundations attendance and entitlements', () => {
  it('builds attendance sheets by collaborator without creating rows during read', async () => {
    const prisma = mockPrisma();
    prisma.planningAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-22T00:00:00.000Z'),
        startTime: new Date('2026-06-22T07:15:00.000Z'),
        endTime: new Date('2026-06-22T15:15:00.000Z'),
        breakMinutes: 30,
        status: PlanningAssignmentStatus.PLANNED,
        employee: { firstName: 'Jean', lastName: 'Dupont', department: { name: 'Cuisine' }, position: { name: 'Agent' } },
        department: { name: 'Cuisine' },
        position: { name: 'Agent' },
      },
    ]);
    prisma.planningAttendanceEntry.findMany.mockResolvedValue([]);

    const service = new PlanningAttendanceService(prisma);
    const result = await service.list('org-1', { month: 6, year: 2026 });

    expect(result.persistence).toBe(true);
    expect(result.rows).toEqual([expect.objectContaining({
      assignmentId: 'assignment-1',
      employeeName: 'Jean Dupont',
      plannedMinutes: 450,
      status: PlanningAttendanceStatus.DRAFT,
      persistence: false,
    })]);
    expect(result.employees).toEqual([expect.objectContaining({
      employeeId: 'emp-1',
      plannedMinutes: 450,
      status: 'NOT_SIGNED',
    })]);
    expect(prisma.planningAttendanceEntry.create).not.toHaveBeenCalled();
    expect(prisma.planningAttendanceEntry.upsert).not.toHaveBeenCalled();
  });

  it('stores an establishment entitlement configuration such as 2.5 days per month after trial period', async () => {
    const prisma = mockPrisma();
    prisma.hrEntitlementRule.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'rule-1', ...data }));

    const service = new HrEntitlementService(prisma);
    const configuration = await service.createEstablishmentConfiguration('org-1', actor, {
      code: 'paid_leave',
      label: 'Congés payés',
      accountType: 'leave',
      unit: PlanningTimeUnit.DAYS,
      accrualFrequency: HrEntitlementAccrualFrequency.MONTHLY,
      accrualQuantity: 2.5,
      startsAfterTrialPeriod: true,
      prorateByContractTime: true,
    });

    expect(prisma.hrEntitlementRule.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      organizationId: 'org-1',
      code: 'paid_leave',
      accountType: 'leave',
      unit: PlanningTimeUnit.DAYS,
      accrualFrequency: HrEntitlementAccrualFrequency.MONTHLY,
      startsAfterTrialPeriod: true,
      prorateByContractTime: true,
    }) });
    expect(String(configuration.accrualQuantity)).toBe('2.5');
  });

  it('prepares the France catalog from the selected HR country without using UI language', async () => {
    const prisma = mockPrisma();
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', hrCountryCode: null, establishmentType: 'Cuisine centrale' });
    prisma.organization.update.mockResolvedValue({});
    prisma.hrEntitlementCatalogItem.upsert.mockResolvedValue({});
    prisma.hrEntitlementCatalogItem.findMany.mockResolvedValue([
      { id: 'catalog-paid-leave', organizationId: 'org-1', countryCode: 'FR', code: 'paid_leave', label: 'Congés payés', description: '', category: 'Congés', accountType: 'leave', unit: PlanningTimeUnit.DAYS, defaultAccrualFrequency: HrEntitlementAccrualFrequency.MONTHLY, defaultAccrualQuantity: 2.5, startsAfterTrialPeriod: true, minimumSeniorityMonths: null, prorateByContractTime: true, requiresAdminValidation: true, isSystemTemplate: true, enabledByDefault: true, isRecommended: true, displayOrder: 10, sourceTemplateCode: 'FR:paid_leave' },
    ]);
    prisma.hrEntitlementRule.findMany.mockResolvedValue([]);

    const service = new HrEntitlementService(prisma);
    const result = await service.prepareCatalog('org-1', actor, { countryCode: 'FR', organizationType: 'Cuisine centrale' });

    expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: expect.objectContaining({ hrCountryCode: 'FR', establishmentType: 'Cuisine centrale' }) });
    expect(prisma.hrEntitlementCatalogItem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_countryCode_code: { organizationId: 'org-1', countryCode: 'FR', code: 'paid_leave' } },
    }));
    expect(result.setup.hrCountryCode).toBe('FR');
    expect(result.items[0]).toEqual(expect.objectContaining({ label: 'Congés payés', active: false }));
    expect(prisma.hrTimeAccount.upsert).not.toHaveBeenCalled();
    expect(prisma.hrEmployeeEntitlement.create).not.toHaveBeenCalled();
  });

  it('keeps France public/private and ODS rights as separate catalog models', () => {
    const franceCodes = HR_ENTITLEMENT_CATALOG.filter(item => item.countryCode === 'FR').map(item => item.code);
    expect(franceCodes).toEqual(expect.arrayContaining([
      'paid_leave',
      'annual_leave_public',
      'statutory_leave',
      'rtt',
      'split_leave',
      'seniority_leave',
      'rqth_accommodation',
      'time_savings_account',
      'recovery',
    ]));
    expect(new Set(franceCodes).size).toBe(franceCodes.length);
  });

  it('filters the catalog search so specific rights such as RQTH remain discoverable', async () => {
    const prisma = mockPrisma();
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', hrCountryCode: 'FR', establishmentType: 'Collectivité' });
    prisma.hrEntitlementCatalogItem.findMany.mockResolvedValue([
      { id: 'catalog-rqth', organizationId: 'org-1', countryCode: 'FR', employmentFramework: 'MIXED', organizationType: 'Collectivité', code: 'rqth_accommodation', label: 'RQTH / aménagement', shortDescription: 'Suivi indicatif', longDescription: 'Suivi indicatif RQTH', description: 'Suivi indicatif', category: 'HEALTH', examples: ['Aménagement'], accountType: 'rqth_accommodation', unit: PlanningTimeUnit.DAYS, defaultAccrualFrequency: HrEntitlementAccrualFrequency.MANUAL, defaultAccrualQuantity: null, startsAfterTrialPeriod: false, minimumSeniorityMonths: null, prorateByContractTime: false, requiresAdminValidation: true, isSystemTemplate: true, enabledByDefault: false, isRecommended: false, isCommon: false, isAdvanced: true, displayOrder: 110, sourceTemplateCode: 'FR:rqth_accommodation' },
      { id: 'catalog-rtt', organizationId: 'org-1', countryCode: 'FR', employmentFramework: 'PUBLIC', organizationType: 'Collectivité', code: 'rtt', label: 'RTT', shortDescription: 'Repos', longDescription: 'Repos', description: 'Repos', category: 'WORKING_TIME', examples: ['RTT'], accountType: 'rtt', unit: PlanningTimeUnit.DAYS, defaultAccrualFrequency: HrEntitlementAccrualFrequency.YEARLY, defaultAccrualQuantity: null, startsAfterTrialPeriod: false, minimumSeniorityMonths: null, prorateByContractTime: true, requiresAdminValidation: true, isSystemTemplate: true, enabledByDefault: false, isRecommended: true, isCommon: false, isAdvanced: false, displayOrder: 50, sourceTemplateCode: 'FR:rtt' },
    ]);
    prisma.hrEntitlementRule.findMany.mockResolvedValue([]);

    const service = new HrEntitlementService(prisma);
    const result = await service.listCatalog('org-1', { search: 'RQTH' });

    expect(result.items).toEqual([expect.objectContaining({ code: 'rqth_accommodation', category: 'HEALTH', isAdvanced: true })]);
  });

  it('prepares the Finland catalog idempotently for the same organization', async () => {
    const prisma = mockPrisma();
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', hrCountryCode: null, establishmentType: 'Restaurant' });
    prisma.organization.update.mockResolvedValue({});
    prisma.hrEntitlementCatalogItem.upsert.mockResolvedValue({});
    prisma.hrEntitlementCatalogItem.findMany.mockResolvedValue([
      { id: 'catalog-annual-leave', organizationId: 'org-1', countryCode: 'FI', code: 'annual_leave', label: 'Congés annuels', description: '', category: 'Congés', accountType: 'annual_leave', unit: PlanningTimeUnit.DAYS, defaultAccrualFrequency: HrEntitlementAccrualFrequency.MONTHLY, defaultAccrualQuantity: 2, startsAfterTrialPeriod: false, minimumSeniorityMonths: null, prorateByContractTime: true, requiresAdminValidation: true, isSystemTemplate: true, enabledByDefault: true, isRecommended: true, displayOrder: 10, sourceTemplateCode: 'FI:annual_leave' },
    ]);
    prisma.hrEntitlementRule.findMany.mockResolvedValue([]);

    const service = new HrEntitlementService(prisma);
    await service.prepareCatalog('org-1', actor, { countryCode: 'FI' });
    await service.prepareCatalog('org-1', actor, { countryCode: 'FI' });

    expect(prisma.hrEntitlementCatalogItem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_countryCode_code: { organizationId: 'org-1', countryCode: 'FI', code: 'annual_leave' } },
    }));
    expect(prisma.hrEntitlementCatalogItem.upsert.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(prisma.hrTimeAccount.upsert).not.toHaveBeenCalled();
  });

  it('activates a catalog right without creating employee counters when no target is selected', async () => {
    const prisma = mockPrisma();
    prisma.hrEntitlementCatalogItem.findFirst.mockResolvedValue({ id: 'catalog-rtt', organizationId: 'org-1', countryCode: 'FR', code: 'rtt', label: 'RTT', description: 'RTT', category: 'Temps de travail', accountType: 'rtt', unit: PlanningTimeUnit.DAYS, defaultAccrualFrequency: HrEntitlementAccrualFrequency.MONTHLY, defaultAccrualQuantity: null, startsAfterTrialPeriod: false, minimumSeniorityMonths: null, prorateByContractTime: false, requiresAdminValidation: true, isSystemTemplate: true, enabledByDefault: false, isRecommended: false, displayOrder: 60, sourceTemplateCode: 'FR:rtt' });
    prisma.hrEntitlementRule.upsert.mockResolvedValue({ id: 'rule-rtt', code: 'rtt', label: 'RTT', accountType: 'rtt', unit: PlanningTimeUnit.DAYS });

    const service = new HrEntitlementService(prisma);
    const result = await service.activateCatalogItem('org-1', actor, 'catalog-rtt', { targetMode: 'NONE' });

    expect(result).toEqual(expect.objectContaining({ employeesApplied: 0, targetMode: 'NONE' }));
    expect(prisma.hrEntitlementRule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_code: { organizationId: 'org-1', code: 'rtt' } },
    }));
    expect(prisma.hrEmployee.findMany).not.toHaveBeenCalled();
    expect(prisma.hrTimeAccount.upsert).not.toHaveBeenCalled();
  });

  it('activates multiple selected catalog rights without employee accounts when requested', async () => {
    const prisma = mockPrisma();
    prisma.hrEntitlementCatalogItem.findMany.mockResolvedValue([
      { id: 'catalog-rtt', organizationId: 'org-1', countryCode: 'FR', code: 'rtt', label: 'RTT', description: 'RTT', category: 'WORKING_TIME', accountType: 'rtt', unit: PlanningTimeUnit.DAYS, defaultAccrualFrequency: HrEntitlementAccrualFrequency.YEARLY, defaultAccrualQuantity: null, startsAfterTrialPeriod: false, minimumSeniorityMonths: null, prorateByContractTime: false, requiresAdminValidation: true, isSystemTemplate: true, enabledByDefault: false, isRecommended: false, displayOrder: 60, sourceTemplateCode: 'FR:rtt' },
      { id: 'catalog-cet', organizationId: 'org-1', countryCode: 'FR', code: 'time_savings_account', label: 'CET', description: 'CET', category: 'SAVINGS', accountType: 'cet', unit: PlanningTimeUnit.DAYS, defaultAccrualFrequency: HrEntitlementAccrualFrequency.MANUAL, defaultAccrualQuantity: null, startsAfterTrialPeriod: false, minimumSeniorityMonths: null, prorateByContractTime: false, requiresAdminValidation: true, isSystemTemplate: true, enabledByDefault: false, isRecommended: false, displayOrder: 70, sourceTemplateCode: 'FR:time_savings_account' },
    ]);
    prisma.hrEntitlementRule.upsert
      .mockResolvedValueOnce({ id: 'rule-rtt', code: 'rtt', label: 'RTT', accountType: 'rtt', unit: PlanningTimeUnit.DAYS })
      .mockResolvedValueOnce({ id: 'rule-cet', code: 'time_savings_account', label: 'CET', accountType: 'cet', unit: PlanningTimeUnit.DAYS });

    const service = new HrEntitlementService(prisma);
    const result = await service.activateCatalogItems('org-1', actor, { catalogItemIds: ['catalog-rtt', 'catalog-cet'], targetMode: 'NONE' });

    expect(result).toEqual(expect.objectContaining({ rightsActivated: 2, employeesTouched: 0, employeeEntitlementsCreatedOrUpdated: 0 }));
    expect(prisma.hrEmployee.findMany).not.toHaveBeenCalled();
    expect(prisma.hrTimeAccount.upsert).not.toHaveBeenCalled();
  });

  it('applies an activated catalog right to all active collaborators only after validation', async () => {
    const prisma = mockPrisma();
    prisma.hrEntitlementCatalogItem.findFirst.mockResolvedValue({ id: 'catalog-paid-leave', organizationId: 'org-1', countryCode: 'FR', code: 'paid_leave', label: 'Congés payés', description: 'Congés', category: 'Congés', accountType: 'leave', unit: PlanningTimeUnit.DAYS, defaultAccrualFrequency: HrEntitlementAccrualFrequency.MONTHLY, defaultAccrualQuantity: 2.5, startsAfterTrialPeriod: true, minimumSeniorityMonths: null, prorateByContractTime: true, requiresAdminValidation: true, isSystemTemplate: true, enabledByDefault: true, isRecommended: true, displayOrder: 10, sourceTemplateCode: 'FR:paid_leave' });
    prisma.hrEntitlementRule.upsert.mockResolvedValue({ id: 'rule-paid-leave', code: 'paid_leave', label: 'Congés payés', accountType: 'leave', unit: PlanningTimeUnit.DAYS });
    prisma.hrEmployee.findMany.mockResolvedValue([{ id: 'emp-1', firstName: 'Jean', lastName: 'Dupont' }, { id: 'emp-2', firstName: 'Marie', lastName: 'Martin' }]);
    prisma.hrEmployee.findFirst.mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, firstName: where.id === 'emp-1' ? 'Jean' : 'Marie', lastName: where.id === 'emp-1' ? 'Dupont' : 'Martin' }));
    prisma.hrEntitlementRule.findFirst.mockResolvedValue({ id: 'rule-paid-leave', code: 'paid_leave', label: 'Congés payés', accountType: 'leave', unit: PlanningTimeUnit.DAYS });
    prisma.hrEmployeeEntitlement.findFirst.mockResolvedValue(null);
    prisma.hrTimeAccount.upsert.mockImplementation(({ create }: any) => Promise.resolve({ id: `account-${create.employeeId}`, ...create, transactions: [] }));
    prisma.hrEmployeeEntitlement.create.mockImplementation(({ data }: any) => Promise.resolve({ id: `entitlement-${data.employeeId}`, ...data }));
    prisma.hrTimeAccountTransaction.upsert.mockResolvedValue({});
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrEntitlementService(prisma);
    const result = await service.activateCatalogItem('org-1', actor, 'catalog-paid-leave', { targetMode: 'ALL_ACTIVE', openingBalance: 12, effectiveFrom: '2026-01-01' });

    expect(result).toEqual(expect.objectContaining({ employeesApplied: 2, targetMode: 'ALL_ACTIVE' }));
    expect(prisma.hrEmployee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-1', isArchived: false, status: 'ACTIVE' }),
    }));
    expect(prisma.hrEmployeeEntitlement.create).toHaveBeenCalledTimes(2);
    expect(prisma.hrTimeAccount.upsert).toHaveBeenCalledTimes(2);
  });

  it('applies a catalog right only to collaborators of the selected service', async () => {
    const prisma = mockPrisma();
    prisma.hrEntitlementCatalogItem.findFirst.mockResolvedValue({ id: 'catalog-rtt', organizationId: 'org-1', countryCode: 'FR', code: 'rtt', label: 'RTT', description: 'RTT', category: 'WORKING_TIME', accountType: 'rtt', unit: PlanningTimeUnit.DAYS, defaultAccrualFrequency: HrEntitlementAccrualFrequency.YEARLY, defaultAccrualQuantity: null, startsAfterTrialPeriod: false, minimumSeniorityMonths: null, prorateByContractTime: false, requiresAdminValidation: true, isSystemTemplate: true, enabledByDefault: false, isRecommended: true, displayOrder: 60, sourceTemplateCode: 'FR:rtt' });
    prisma.hrEntitlementRule.upsert.mockResolvedValue({ id: 'rule-rtt', code: 'rtt', label: 'RTT', accountType: 'rtt', unit: PlanningTimeUnit.DAYS });
    prisma.hrEmployee.findMany.mockResolvedValue([{ id: 'emp-1', firstName: 'Jean', lastName: 'Dupont' }]);
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1', firstName: 'Jean', lastName: 'Dupont' });
    prisma.hrEntitlementRule.findFirst.mockResolvedValue({ id: 'rule-rtt', code: 'rtt', label: 'RTT', accountType: 'rtt', unit: PlanningTimeUnit.DAYS });
    prisma.hrEmployeeEntitlement.findFirst.mockResolvedValue(null);
    prisma.hrTimeAccount.upsert.mockResolvedValue({ id: 'account-rtt', openingBalance: 0, transactions: [] });
    prisma.hrEmployeeEntitlement.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'entitlement-rtt', ...data }));
    prisma.hrTimeAccountTransaction.upsert.mockResolvedValue({});
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrEntitlementService(prisma);
    const result = await service.activateCatalogItem('org-1', actor, 'catalog-rtt', { targetMode: 'DEPARTMENT', departmentId: 'dept-1' });

    expect(result).toEqual(expect.objectContaining({ employeesApplied: 1, targetMode: 'DEPARTMENT' }));
    expect(prisma.hrEmployee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-1', departmentId: 'dept-1', status: 'ACTIVE' }),
    }));
    expect(prisma.hrEmployeeEntitlement.create).toHaveBeenCalledTimes(1);
  });

  it('creates employee entitlements with deterministic dedupe and idempotent opening trace', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1', firstName: 'Jean', lastName: 'Dupont' });
    prisma.hrEntitlementRule.findFirst.mockResolvedValue({
      id: 'rule-1',
      code: 'paid_leave',
      label: 'Congés payés',
      accountType: 'leave',
      unit: PlanningTimeUnit.DAYS,
    });
    prisma.hrEmployeeEntitlement.findFirst.mockResolvedValue(null);
    prisma.hrTimeAccount.upsert.mockResolvedValue({ id: 'account-leave' });
    prisma.hrEmployeeEntitlement.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'entitlement-1', ...data }));
    prisma.hrTimeAccountTransaction.upsert.mockResolvedValue({});
    prisma.hrTimeAccount.findMany.mockResolvedValue([
      { id: 'account-leave', openingBalance: 12, transactions: [] },
    ]);
    prisma.hrTimeAccount.update.mockResolvedValue({});

    const service = new HrEntitlementService(prisma);
    const entitlement = await service.upsertEmployeeEntitlement('org-1', actor, 'emp-1', {
      entitlementRuleId: 'rule-1',
      openingBalance: 12,
      openingBalanceDate: '2026-01-01',
      effectiveFrom: '2026-01-01',
    });

    expect(entitlement).toEqual(expect.objectContaining({
      dedupeKey: 'employee:emp-1:paid_leave:2026-01-01',
      counterAccountId: 'account-leave',
      openingBalance: 12,
    }));
    expect(prisma.hrTimeAccountTransaction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_idempotencyKey: { organizationId: 'org-1', idempotencyKey: 'entitlement-opening:entitlement-1:2026' } },
      create: expect.objectContaining({
        quantity: 0,
        sourceType: HrTimeAccountSourceType.ENTITLEMENT_ACCRUAL,
        metadata: expect.objectContaining({ openingBalance: 12 }),
      }),
    }));
    expect(prisma.hrTimeAccount.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ closingBalance: 12 }),
    }));
  });
});

describe('Planning foundations counters', () => {
  it('recomputes planned minutes and approved HR absences through idempotent ledger transactions', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-22T00:00:00.000Z'),
        startTime: new Date('2026-06-22T09:00:00.000Z'),
        endTime: new Date('2026-06-22T17:00:00.000Z'),
        breakMinutes: 30,
      },
    ]);
    prisma.hrAbsence.findMany.mockResolvedValue([
      {
        id: 'absence-1',
        employeeId: 'emp-1',
        type: HrAbsenceType.CONGE,
        startDate: new Date('2026-06-24T00:00:00.000Z'),
        endDate: new Date('2026-06-25T00:00:00.000Z'),
      },
    ]);
    prisma.hrTimeAccount.upsert
      .mockResolvedValueOnce({ id: 'account-planned', openingBalance: 0, transactions: [] })
      .mockResolvedValueOnce({ id: 'account-leave', openingBalance: 0, transactions: [] });
    prisma.planningDayStatus.findMany.mockResolvedValue([]);
    prisma.planningCodeDictionary.findMany.mockResolvedValue([]);
    prisma.hrTimeAccountTransaction.findMany.mockResolvedValue([]);
    prisma.hrTimeAccountTransaction.upsert.mockResolvedValue({});
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrTimeAccountService(prisma);
    const result = await service.recompute('org-1', actor, { startDate: '2026-06-01', endDate: '2026-06-30', employeeId: 'emp-1' });

    expect(result).toEqual(expect.objectContaining({
      employeesProcessed: 1,
      transactionsCreated: 2,
      transactionsUpdated: 0,
      transactionsSkipped: 0,
      dryRun: false,
      idempotent: true,
      sources: expect.objectContaining({ assignmentsProcessed: 1, hrAbsencesProcessed: 1 }),
    }));
    expect(prisma.hrTimeAccountTransaction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_idempotencyKey: { organizationId: 'org-1', idempotencyKey: 'assignment:assignment-1:planned_minutes' } },
      create: expect.objectContaining({
        quantity: 450,
        unit: PlanningTimeUnit.MINUTES,
        direction: HrTimeAccountDirection.CREDIT,
        sourceType: HrTimeAccountSourceType.ASSIGNMENT,
      }),
    }));
    expect(prisma.hrTimeAccountTransaction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_idempotencyKey: { organizationId: 'org-1', idempotencyKey: 'hr_absence:absence-1:paid_leave' } },
      create: expect.objectContaining({
        quantity: 2,
        unit: PlanningTimeUnit.DAYS,
        direction: HrTimeAccountDirection.DEBIT,
        sourceType: HrTimeAccountSourceType.HR_ABSENCE,
      }),
    }));
  });

  it('supports dry-run recompute without writing accounts or transactions', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-22T00:00:00.000Z'),
        startTime: new Date('2026-06-22T09:00:00.000Z'),
        endTime: new Date('2026-06-22T17:00:00.000Z'),
        breakMinutes: 30,
      },
    ]);
    prisma.hrAbsence.findMany.mockResolvedValue([]);
    prisma.planningDayStatus.findMany.mockResolvedValue([]);
    prisma.planningCodeDictionary.findMany.mockResolvedValue([]);
    prisma.hrTimeAccountTransaction.findMany.mockResolvedValue([]);

    const service = new HrTimeAccountService(prisma);
    const result = await service.recompute('org-1', actor, { startDate: '2026-06-01', endDate: '2026-06-30', employeeId: 'emp-1', dryRun: true });

    expect(result).toEqual(expect.objectContaining({ transactionsCreated: 1, dryRun: true }));
    expect(prisma.hrTimeAccount.upsert).not.toHaveBeenCalled();
    expect(prisma.hrTimeAccountTransaction.upsert).not.toHaveBeenCalled();
    expect(prisma.hrTimeAccount.update).not.toHaveBeenCalled();
  });

  it('maps counter-affecting day statuses through the organization dictionary', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningAssignment.findMany.mockResolvedValue([]);
    prisma.hrAbsence.findMany.mockResolvedValue([]);
    prisma.planningDayStatus.findMany.mockResolvedValue([
      {
        id: 'status-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-24T00:00:00.000Z'),
        statusCode: 'rtt',
        label: 'RTT',
        metadata: {},
      },
    ]);
    prisma.planningCodeDictionary.findMany.mockResolvedValue([
      {
        normalizedCode: 'rtt',
        defaultStatusCode: 'rtt',
        label: 'RTT',
        accountType: 'rtt',
        unit: PlanningTimeUnit.DAYS,
        defaultQuantity: 1,
        affectsLeaveBalance: true,
      },
    ]);
    prisma.hrTimeAccountTransaction.findMany.mockResolvedValue([]);
    prisma.hrTimeAccount.upsert.mockResolvedValue({ id: 'account-rtt', openingBalance: 0, transactions: [] });
    prisma.hrTimeAccountTransaction.upsert.mockResolvedValue({});
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrTimeAccountService(prisma);
    const result = await service.recompute('org-1', actor, { startDate: '2026-06-01', endDate: '2026-06-30', employeeId: 'emp-1', includeAssignments: false, includeHrAbsences: false });

    expect(result).toEqual(expect.objectContaining({
      transactionsCreated: 1,
      sources: expect.objectContaining({ dayStatusesProcessed: 1 }),
      warnings: [],
    }));
    expect(prisma.hrTimeAccountTransaction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_idempotencyKey: { organizationId: 'org-1', idempotencyKey: 'day_status:status-1' } },
      create: expect.objectContaining({
        sourceType: HrTimeAccountSourceType.DAY_STATUS,
        quantity: 1,
        unit: PlanningTimeUnit.DAYS,
        direction: HrTimeAccountDirection.DEBIT,
      }),
    }));
  });

  it('skips identical automatic transactions when recompute is replayed', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-22T00:00:00.000Z'),
        startTime: new Date('2026-06-22T09:00:00.000Z'),
        endTime: new Date('2026-06-22T17:00:00.000Z'),
        breakMinutes: 30,
      },
    ]);
    prisma.hrAbsence.findMany.mockResolvedValue([]);
    prisma.planningDayStatus.findMany.mockResolvedValue([]);
    prisma.planningCodeDictionary.findMany.mockResolvedValue([]);
    prisma.hrTimeAccountTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        employeeId: 'emp-1',
        quantity: 450,
        unit: PlanningTimeUnit.MINUTES,
        direction: HrTimeAccountDirection.CREDIT,
        sourceType: HrTimeAccountSourceType.ASSIGNMENT,
        sourceId: 'assignment-1',
        idempotencyKey: 'assignment:assignment-1:planned_minutes',
        label: 'Temps planifié',
        account: { code: 'planned_time', periodYear: 2026 },
      },
    ]);
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrTimeAccountService(prisma);
    const result = await service.recompute('org-1', actor, { startDate: '2026-06-01', endDate: '2026-06-30', employeeId: 'emp-1' });

    expect(result).toEqual(expect.objectContaining({ transactionsCreated: 0, transactionsUpdated: 0, transactionsSkipped: 1 }));
    expect(prisma.hrTimeAccountTransaction.upsert).not.toHaveBeenCalled();
  });

  it('neutralizes stale automatic transactions and preserves manual adjustments', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningAssignment.findMany.mockResolvedValue([]);
    prisma.hrAbsence.findMany.mockResolvedValue([]);
    prisma.planningDayStatus.findMany.mockResolvedValue([]);
    prisma.planningCodeDictionary.findMany.mockResolvedValue([]);
    prisma.hrTimeAccountTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-stale',
        employeeId: 'emp-1',
        quantity: 450,
        idempotencyKey: 'assignment:old:planned_minutes',
        comment: null,
        metadata: {},
        account: { code: 'planned_time', periodYear: 2026 },
      },
    ]);
    prisma.hrTimeAccountTransaction.count.mockResolvedValue(1);
    prisma.hrTimeAccountTransaction.update.mockResolvedValue({});
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrTimeAccountService(prisma);
    const result = await service.recompute('org-1', actor, { startDate: '2026-06-01', endDate: '2026-06-30', employeeId: 'emp-1' });

    expect(result).toEqual(expect.objectContaining({ transactionsNeutralized: 1, manualTransactionsPreserved: 1 }));
    expect(prisma.hrTimeAccountTransaction.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tx-stale', organizationId: 'org-1' },
      data: expect.objectContaining({ quantity: 0 }),
    }));
    expect(prisma.hrTimeAccountTransaction.upsert).not.toHaveBeenCalled();
  });

  it('gives approved HR absences priority over legacy businessStatus comments', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-22T00:00:00.000Z'),
        startTime: new Date('2026-06-22T09:00:00.000Z'),
        endTime: new Date('2026-06-22T17:00:00.000Z'),
        breakMinutes: 30,
        comment: JSON.stringify({ planningAssignmentMeta: { businessStatus: 'vacation' } }),
      },
    ]);
    prisma.hrAbsence.findMany.mockResolvedValue([
      { id: 'absence-1', employeeId: 'emp-1', type: HrAbsenceType.CONGE, startDate: new Date('2026-06-22T00:00:00.000Z'), endDate: new Date('2026-06-22T00:00:00.000Z') },
    ]);
    prisma.planningDayStatus.findMany.mockResolvedValue([]);
    prisma.planningCodeDictionary.findMany.mockResolvedValue([]);
    prisma.hrTimeAccountTransaction.findMany.mockResolvedValue([]);
    prisma.hrTimeAccount.upsert.mockResolvedValue({ id: 'account-leave' });
    prisma.hrTimeAccountTransaction.upsert.mockResolvedValue({});
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrTimeAccountService(prisma);
    const result = await service.recompute('org-1', actor, { startDate: '2026-06-01', endDate: '2026-06-30', employeeId: 'emp-1' });

    expect(result.transactionsCreated).toBe(1);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'LEGACY_STATUS_IGNORED_BY_HR_ABSENCE' }),
      expect.objectContaining({ type: 'ASSIGNMENT_SUPPRESSED_BY_HR_ABSENCE' }),
    ]));
    expect(prisma.hrTimeAccountTransaction.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.hrTimeAccountTransaction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_idempotencyKey: { organizationId: 'org-1', idempotencyKey: 'hr_absence:absence-1:paid_leave' } },
    }));
  });

  it('gives persisted day statuses priority over legacy businessStatus comments', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-22T00:00:00.000Z'),
        startTime: new Date('2026-06-22T09:00:00.000Z'),
        endTime: new Date('2026-06-22T17:00:00.000Z'),
        breakMinutes: 30,
        comment: JSON.stringify({ planningAssignmentMeta: { businessStatus: 'vacation' } }),
      },
    ]);
    prisma.hrAbsence.findMany.mockResolvedValue([]);
    prisma.planningDayStatus.findMany.mockResolvedValue([
      {
        id: 'status-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-22T00:00:00.000Z'),
        statusCode: 'paid_leave',
        label: 'Congé payé',
        dedupeKey: 'manual:emp-1:2026-06-22:paid_leave',
        metadata: {},
      },
    ]);
    prisma.planningCodeDictionary.findMany.mockResolvedValue([
      {
        normalizedCode: 'paid_leave',
        defaultStatusCode: 'paid_leave',
        label: 'Congé payé',
        category: 'leave',
        accountType: 'leave',
        unit: PlanningTimeUnit.DAYS,
        defaultQuantity: 1,
        affectsLeaveBalance: true,
      },
    ]);
    prisma.hrTimeAccountTransaction.findMany.mockResolvedValue([]);
    prisma.hrTimeAccount.upsert.mockResolvedValue({ id: 'account-leave' });
    prisma.hrTimeAccountTransaction.upsert.mockResolvedValue({});
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrTimeAccountService(prisma);
    const result = await service.recompute('org-1', actor, { startDate: '2026-06-01', endDate: '2026-06-30', employeeId: 'emp-1' });

    expect(result.transactionsCreated).toBe(1);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'LEGACY_STATUS_IGNORED_BY_DAY_STATUS' }),
      expect.objectContaining({ type: 'ASSIGNMENT_SUPPRESSED_BY_DAY_STATUS' }),
    ]));
    expect(prisma.hrTimeAccountTransaction.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.hrTimeAccountTransaction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_idempotencyKey: { organizationId: 'org-1', idempotencyKey: 'day_status:manual:emp-1:2026-06-22:paid_leave' } },
    }));
  });

  it('reports unknown day status codes without creating counter transactions', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningAssignment.findMany.mockResolvedValue([]);
    prisma.hrAbsence.findMany.mockResolvedValue([]);
    prisma.planningDayStatus.findMany.mockResolvedValue([
      {
        id: 'status-unknown',
        employeeId: 'emp-1',
        date: new Date('2026-06-22T00:00:00.000Z'),
        statusCode: 'mystery',
        label: 'Mystère',
        dedupeKey: 'manual:emp-1:2026-06-22:mystery',
        metadata: {},
      },
    ]);
    prisma.planningCodeDictionary.findMany.mockResolvedValue([]);
    prisma.hrTimeAccountTransaction.findMany.mockResolvedValue([]);
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrTimeAccountService(prisma);
    const result = await service.recompute('org-1', actor, { startDate: '2026-06-01', endDate: '2026-06-30', employeeId: 'emp-1' });

    expect(result.transactionsCreated).toBe(0);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'UNKNOWN_CODE', code: 'mystery' })]));
    expect(prisma.hrTimeAccountTransaction.upsert).not.toHaveBeenCalled();
  });

  it('keeps context counter summaries light and separates neutralized transactions', async () => {
    const prisma = mockPrisma();
    prisma.hrTimeAccount.findMany.mockResolvedValue([
      {
        id: 'account-planned',
        employeeId: 'emp-1',
        accountType: 'time',
        code: 'planned_time',
        label: 'Temps planifié',
        unit: PlanningTimeUnit.MINUTES,
        openingBalance: 0,
        accrued: 450,
        consumed: 0,
        adjusted: 0,
        closingBalance: 450,
        visibleToEmployee: false,
        visibleToManager: true,
        visibleToAdmin: true,
        employee: { id: 'emp-1', firstName: 'Jean', lastName: 'Dupont' },
      },
    ]);
    prisma.hrTimeAccount.count.mockResolvedValue(0);
    prisma.hrTimeAccountTransaction.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const service = new HrTimeAccountService(prisma);
    const summary = await service.contextSummary('org-1', { year: 2026 });

    expect(summary).toEqual(expect.objectContaining({
      enabled: true,
      transactionCount: 1,
      neutralizedTransactionCount: 1,
      employeePreview: [expect.objectContaining({
        employeeName: 'Jean Dupont',
        totals: expect.objectContaining({ plannedMinutes: 450 }),
      })],
    }));
    expect(summary.employeePreview?.[0].accounts[0]).not.toHaveProperty('transactions');
  });
});

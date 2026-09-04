import {
  HrAbsenceStatus,
  HrAbsenceType,
  HrTimeAccountDirection,
  HrTimeAccountSourceType,
  PlanningAssignmentStatus,
  PlanningAttendanceStatus,
  PlanningDayStatusSourceType,
  PlanningTimeUnit,
} from '@prisma/client';
import { HrTimeAccountService } from '../hr/time-accounts/hr-time-account.service';
import { PlanningAttendanceService } from './planning-attendance.service';
import { PlanningDayStatusService } from './planning-day-status.service';
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
      findUnique: jest.fn().mockResolvedValue({ hrCountryCode: 'FR', regulatoryCountryCode: null }),
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
    planningAttendanceEntry: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    site: {
      findFirst: jest.fn(),
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
      statusCode: 'paid_leave',
      label: 'Conges payes',
      affectsCounters: false,
    });

    expect(prisma.planningDayStatus.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', dedupeKey: 'manual:emp-1:2026-06-22:paid_leave' },
    });
    expect(prisma.planningDayStatus.update).toHaveBeenCalled();
    expect(prisma.planningDayStatus.create).not.toHaveBeenCalled();
  });

  it('summarizes simple leave and absence sources without advanced counters', async () => {
    const prisma = mockPrisma();
    prisma.planningDayStatus.findMany.mockResolvedValue([
      { statusCode: 'paid_leave' },
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
      { code: 'paid_leave', count: 1 },
      { code: 'vacation', count: 1 },
      { code: 'hr_maladie', count: 1 },
    ]));
  });
});

describe('Planning foundations attendance', () => {
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
});

describe('Planning foundations simple leave balances', () => {
  it('recomputes paid leave from approved HR leave absences only', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.hrAbsence.findMany.mockResolvedValue([
      {
        id: 'absence-1',
        employeeId: 'emp-1',
        type: HrAbsenceType.CONGE,
        startDate: new Date('2026-06-24T00:00:00.000Z'),
        endDate: new Date('2026-06-25T00:00:00.000Z'),
      },
    ]);
    prisma.hrTimeAccountTransaction.findMany.mockResolvedValue([]);
    prisma.hrTimeAccount.upsert.mockResolvedValue({ id: 'account-paid-leave', openingBalance: 0, transactions: [] });
    prisma.hrTimeAccountTransaction.upsert.mockResolvedValue({});
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrTimeAccountService(prisma);
    const result = await service.recompute('org-1', actor, { startDate: '2026-06-01', endDate: '2026-06-30', employeeId: 'emp-1' });

    expect(result).toEqual(expect.objectContaining({
      employeesProcessed: 1,
      transactionsCreated: 1,
      dryRun: false,
      sources: expect.objectContaining({
        assignmentsProcessed: 0,
        dayStatusesProcessed: 0,
        hrAbsencesProcessed: 1,
      }),
    }));
    expect(prisma.hrAbsence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        type: HrAbsenceType.CONGE,
        status: HrAbsenceStatus.APPROVED,
      }),
    }));
    expect(prisma.hrTimeAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        code: 'paid_leave',
        accountType: 'paid_leave',
        label: 'Conges payes',
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

  it('uses annual leave accounts for Finnish organizations', async () => {
    const prisma = mockPrisma();
    prisma.organization.findUnique.mockResolvedValue({ hrCountryCode: 'FI', regulatoryCountryCode: null });
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.hrAbsence.findMany.mockResolvedValue([
      {
        id: 'absence-fi-1',
        employeeId: 'emp-1',
        type: HrAbsenceType.CONGE,
        startDate: new Date('2026-07-06T00:00:00.000Z'),
        endDate: new Date('2026-07-06T00:00:00.000Z'),
      },
    ]);
    prisma.hrTimeAccountTransaction.findMany.mockResolvedValue([]);
    prisma.hrTimeAccount.upsert.mockResolvedValue({ id: 'account-annual-leave', openingBalance: 0, transactions: [] });
    prisma.hrTimeAccountTransaction.upsert.mockResolvedValue({});
    prisma.hrTimeAccount.findMany.mockResolvedValue([]);

    const service = new HrTimeAccountService(prisma);
    const result = await service.recompute('org-fi', actor, { startDate: '2026-07-01', endDate: '2026-07-31', employeeId: 'emp-1' });

    expect(result).toEqual(expect.objectContaining({
      transactionsCreated: 1,
      dryRun: false,
    }));
    expect(prisma.hrTimeAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        code: 'annual_leave',
        accountType: 'annual_leave',
        label: 'Conges annuels',
      }),
    }));
    expect(prisma.hrTimeAccountTransaction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_idempotencyKey: { organizationId: 'org-fi', idempotencyKey: 'hr_absence:absence-fi-1:annual_leave' } },
      create: expect.objectContaining({
        quantity: 1,
        sourceType: HrTimeAccountSourceType.HR_ABSENCE,
      }),
    }));
  });

  it('does not expose advanced account codes through the simple leave listing', async () => {
    const prisma = mockPrisma();
    const service = new HrTimeAccountService(prisma);

    const result = await service.list('org-1', { code: 'rtt', periodYear: 2026 });

    expect(result).toEqual(expect.objectContaining({
      employees: [],
      accountCount: 0,
      alerts: [],
    }));
    expect(prisma.hrTimeAccount.findMany).not.toHaveBeenCalled();
  });

  it('rejects manual adjustments for advanced account codes', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    const service = new HrTimeAccountService(prisma);

    await expect(service.adjust('org-1', actor, {
      employeeId: 'emp-1',
      periodYear: 2026,
      code: 'advanced_counter',
      accountType: 'advanced_counter',
      label: 'Compteur avance',
      unit: PlanningTimeUnit.DAYS,
      quantity: 1,
      direction: HrTimeAccountDirection.CREDIT,
    })).rejects.toThrow('Seuls les cong');

    expect(prisma.hrTimeAccount.upsert).not.toHaveBeenCalled();
    expect(prisma.hrTimeAccountTransaction.create).not.toHaveBeenCalled();
  });
});

import { GoneException } from '@nestjs/common';
import { HrEmployeeStatus, PlanningAssignmentOrigin, PlanningAssignmentStatus } from '@prisma/client';
import { PlanningService } from './planning.service';

function mockPrisma(overrides?: any): any {
  const base: any = {
    planningAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    planningConflict: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    planningOperationalNeed: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    planningTemplate: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    planningHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    planningNotification: {
      create: jest.fn(),
    },
    hrDepartment: {
      findFirst: jest.fn(),
    },
    hrPosition: {
      findFirst: jest.fn(),
    },
    hrSkill: {
      findFirst: jest.fn(),
    },
    hrEmployee: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    hrAbsence: {
      findFirst: jest.fn(),
    },
    hrRotation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    hrRotationAssignment: {
      create: jest.fn(),
      update: jest.fn(),
    },
    site: {
      findFirst: jest.fn(),
    },
  };
  return { ...base, ...(overrides || {}) };
}

const actor = { id: 'user-1', role: 'ADMIN' };
const assignmentPayload = {
  employeeId: 'emp-1',
  departmentId: 'dept-1',
  positionId: 'pos-1',
  date: '2026-06-22',
  startTime: '09:00',
  endTime: '17:00',
};

describe('PlanningService day assignments', () => {
  it('updates the existing employee/day assignment instead of creating a duplicate', async () => {
    const prisma = mockPrisma();
    prisma.planningAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
    const service = new PlanningService(prisma);
    const updateAssignment = jest.spyOn(service, 'updateAssignment').mockResolvedValue({ id: 'assignment-1' } as any);
    const createAssignment = jest.spyOn(service, 'createAssignment').mockResolvedValue({ id: 'assignment-new' } as any);

    await service.upsertDayAssignment('org-1', actor, { ...assignmentPayload, templateId: 'template-1' });

    expect(updateAssignment).toHaveBeenCalledWith('org-1', actor, 'assignment-1', expect.objectContaining({
      origin: PlanningAssignmentOrigin.TEMPLATE,
      status: PlanningAssignmentStatus.PLANNED,
    }));
    expect(createAssignment).not.toHaveBeenCalled();
  });

  it('creates a manual assignment when no employee/day assignment exists', async () => {
    const prisma = mockPrisma();
    prisma.planningAssignment.findFirst.mockResolvedValue(null);
    const service = new PlanningService(prisma);
    const createAssignment = jest.spyOn(service, 'createAssignment').mockResolvedValue({ id: 'assignment-new' } as any);

    await service.upsertDayAssignment('org-1', actor, assignmentPayload);

    expect(createAssignment).toHaveBeenCalledWith('org-1', actor, expect.objectContaining({
      origin: PlanningAssignmentOrigin.MANUAL,
      status: PlanningAssignmentStatus.PLANNED,
    }));
  });
});

describe('PlanningService operational needs', () => {
  it('normalizes legacy and API need metadata behind backend helpers', () => {
    const service = new PlanningService(mockPrisma());

    expect((service as any).parseOperationalNeedMetadata('season=haute;slot=fermeture')).toEqual({
      season: 'haute',
      timeSlot: 'fermeture',
      note: null,
    });

    const payload = (service as any).buildOperationalNeedPayload('org-1', {
      departmentId: 'dept-1',
      season: 'basse',
      timeSlot: 'midi',
      startDate: '2026-06-23',
      startTime: '11:00',
      endTime: '15:00',
      requiredCount: 2,
    });

    expect(payload).toEqual(expect.objectContaining({
      organizationId: 'org-1',
      label: 'Basse / Midi',
      comment: JSON.stringify({ planningNeedMeta: { season: 'basse', timeSlot: 'midi', note: null } }),
    }));
  });

  it('persists a service need and recalculates base alerts', async () => {
    const prisma = mockPrisma();
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: 'dept-1' });
    prisma.planningOperationalNeed.create.mockResolvedValue({
      id: 'need-1',
      startDate: new Date('2026-06-23T00:00:00.000Z'),
      endDate: new Date('2026-06-23T00:00:00.000Z'),
    });
    const service = new PlanningService(prisma);
    const recalculateBaseAlerts = jest.spyOn(service as any, 'recalculateBaseAlerts').mockResolvedValue(undefined);

    await service.createNeed('org-1', actor, {
      departmentId: 'dept-1',
      season: 'normale',
      timeSlot: 'midi',
      startDate: '2026-06-23',
      endDate: '2026-06-23',
      startTime: '11:00',
      endTime: '15:00',
      requiredCount: 2,
    });

    expect(prisma.planningOperationalNeed.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: 'org-1', departmentId: 'dept-1', requiredCount: 2, label: 'Normale / Midi' }),
    }));
    expect(recalculateBaseAlerts).toHaveBeenCalled();
  });

  it('calculates understaffing on the matching day and time slot only', async () => {
    const prisma = mockPrisma();
    prisma.planningOperationalNeed.findMany.mockResolvedValue([
      {
        id: 'need-tuesday',
        departmentId: 'dept-1',
        siteId: null,
        positionId: null,
        label: 'Normale / Midi',
        startDate: new Date('2026-06-23T00:00:00.000Z'),
        endDate: new Date('2026-06-23T00:00:00.000Z'),
        startTime: '11:00',
        endTime: '15:00',
        requiredCount: 2,
      },
    ]);
    prisma.planningAssignment.findMany = jest.fn().mockResolvedValue([
      {
        id: 'assignment-tuesday',
        departmentId: 'dept-1',
        siteId: null,
        positionId: 'pos-1',
        date: new Date('2026-06-23T00:00:00.000Z'),
        startTime: new Date('2026-06-23T10:00:00.000Z'),
        endTime: new Date('2026-06-23T14:00:00.000Z'),
      },
      {
        id: 'assignment-friday',
        departmentId: 'dept-1',
        siteId: null,
        positionId: 'pos-1',
        date: new Date('2026-06-26T00:00:00.000Z'),
        startTime: new Date('2026-06-26T10:00:00.000Z'),
        endTime: new Date('2026-06-26T14:00:00.000Z'),
      },
    ]);
    const service = new PlanningService(prisma);

    const result = await (service as any).coverage('org-1', new Date('2026-06-01T00:00:00.000Z'), new Date('2026-06-30T23:59:59.999Z'));

    expect(result).toEqual([expect.objectContaining({ plannedCount: 1, requiredCount: 2, status: 'UNDERSTAFFED' })]);
  });

  it('creates a blocking closing alert when a closing need is uncovered', async () => {
    const prisma = mockPrisma();
    prisma.planningOperationalNeed.findMany.mockResolvedValue([
      {
        id: 'need-closing',
        departmentId: 'dept-bar',
        siteId: null,
        positionId: null,
        label: 'Normale / Fermeture',
        startDate: new Date('2026-06-26T00:00:00.000Z'),
        endDate: new Date('2026-06-26T00:00:00.000Z'),
        startTime: '20:00',
        endTime: '00:00',
        requiredCount: 1,
        comment: JSON.stringify({ planningNeedMeta: { season: 'normale', timeSlot: 'fermeture', note: null } }),
        department: { id: 'dept-bar', name: 'Bar' },
      },
    ]);
    prisma.planningAssignment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.hrEmployee.findMany.mockResolvedValue([]);
    const service = new PlanningService(prisma);

    await (service as any).recalculateBaseAlerts('org-1', new Date('2026-06-26T00:00:00.000Z'), new Date('2026-06-26T23:59:59.999Z'));

    expect(prisma.planningConflict.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ code: 'CLOSING_UNCOVERED', severity: 'BLOCKING', label: 'Fermeture non couverte: Bar' })],
    }));
  });

  it('creates a weekly quota alert when planned time exceeds the RH contract', async () => {
    const prisma = mockPrisma();
    prisma.planningOperationalNeed.findMany.mockResolvedValue([]);
    prisma.planningAssignment.findMany.mockResolvedValue([
      { employeeId: 'emp-1', startTime: new Date('2026-06-22T08:00:00.000Z'), endTime: new Date('2026-06-22T20:00:00.000Z'), breakMinutes: 0 },
      { employeeId: 'emp-1', startTime: new Date('2026-06-23T08:00:00.000Z'), endTime: new Date('2026-06-23T20:00:00.000Z'), breakMinutes: 0 },
    ]);
    prisma.hrEmployee.findMany.mockResolvedValue([{ id: 'emp-1', firstName: 'Ada', lastName: 'Lovelace', contracts: [{ weeklyHours: 600 }] }]);
    const service = new PlanningService(prisma);

    await (service as any).recalculateBaseAlerts('org-1', new Date('2026-06-22T00:00:00.000Z'), new Date('2026-06-28T23:59:59.999Z'));

    expect(prisma.planningConflict.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ code: 'WEEKLY_QUOTA_EXCEEDED', severity: 'STRONG_WARNING' })],
    }));
  });

  it('detects an assignment during an approved HR absence without mutating HR', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1', status: HrEmployeeStatus.ACTIVE, isArchived: false, departmentId: 'dept-1', positionId: 'pos-1' });
    prisma.hrAbsence.findFirst.mockResolvedValue({ id: 'absence-1' });
    prisma.planningAssignment.findFirst.mockResolvedValue(null);
    prisma.planningAssignment.findMany.mockResolvedValue([]);
    const service = new PlanningService(prisma);

    const conflicts = await (service as any).detectConflicts('org-1', {
      employeeId: 'emp-1',
      departmentId: 'dept-1',
      positionId: 'pos-1',
      date: new Date('2026-06-24T00:00:00.000Z'),
      startTime: new Date('2026-06-24T09:00:00.000Z'),
      endTime: new Date('2026-06-24T17:00:00.000Z'),
      breakMinutes: 0,
    });

    expect(conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'APPROVED_ABSENCE', absenceId: 'absence-1' })]));
    expect(prisma.hrAbsence.update).toBeUndefined();
  });
});

describe('PlanningService weekly rotations', () => {
  it('previews a Planning weekly rotation template without using the RH rotation table', async () => {
    const prisma = mockPrisma();
    prisma.planningTemplate.findFirst.mockResolvedValue({
      id: 'template-rotation-1',
      organizationId: 'org-1',
      name: 'Semaine salle',
      periodType: 'WEEKLY_ROTATION',
      departmentId: 'dept-1',
      siteId: null,
      content: {
        type: 'WEEKLY_ROTATION',
        employeeIds: ['emp-1'],
        days: [
          { dayOfWeek: 1, mode: 'WORK', startTime: '09:00', endTime: '17:00', breakMinutes: 30 },
          { dayOfWeek: 2, mode: 'REST' },
          { dayOfWeek: 3, mode: 'REST' },
          { dayOfWeek: 4, mode: 'REST' },
          { dayOfWeek: 5, mode: 'REST' },
          { dayOfWeek: 6, mode: 'REST' },
          { dayOfWeek: 7, mode: 'REST' },
        ],
      },
    });
    prisma.hrEmployee.findMany.mockResolvedValue([{ id: 'emp-1', departmentId: 'dept-1', positionId: 'pos-1', mainSiteId: 'site-1' }]);
    const service = new PlanningService(prisma);

    const result = await service.applyWeeklyRotationPreview('org-1', 'template-rotation-1', {
      startDate: '2026-06-22',
      endDate: '2026-06-28',
    });

    expect(result.temporarySource).toBe('planning_templates');
    expect(result.assignments).toEqual([expect.objectContaining({
      employeeId: 'emp-1',
      date: '2026-06-22',
      rotationId: undefined,
      comment: 'Roulement Planning Semaine salle',
    })]);
    expect(prisma.hrRotation.findFirst).not.toHaveBeenCalled();
  });

  it('applies a RH-read rotation into Planning assignments without writing RH', async () => {
    const prisma = mockPrisma();
    prisma.planningAssignment.findFirst.mockResolvedValue(null);
    const service = new PlanningService(prisma);
    jest.spyOn(service, 'applyWeeklyRotationPreview').mockResolvedValue({
      rotation: { id: 'rotation-1' },
      assignments: [{ ...assignmentPayload, rotationId: 'rotation-1' }],
      temporarySource: 'hr_rotations',
      applied: false,
    } as any);
    const saveAssignmentAllowingConflicts = jest.spyOn(service as any, 'saveAssignmentAllowingConflicts').mockResolvedValue({ id: 'assignment-1' });
    jest.spyOn(service as any, 'recalculateBaseAlerts').mockResolvedValue(undefined);

    await service.applyWeeklyRotation('org-1', actor, 'rotation-1', {
      employeeId: 'emp-1',
      startDate: '2026-06-22',
      endDate: '2026-06-28',
      replaceExisting: true,
    });

    expect(saveAssignmentAllowingConflicts).toHaveBeenCalledWith('org-1', actor, undefined, expect.objectContaining({
      rotationId: 'rotation-1',
      origin: PlanningAssignmentOrigin.AUTO_GENERATION,
      allowCriticalOverride: true,
    }));
    expect(prisma.hrRotation.update).not.toHaveBeenCalled();
    expect(prisma.hrRotationAssignment.create).not.toHaveBeenCalled();
    expect(prisma.hrRotationAssignment.update).not.toHaveBeenCalled();
  });
});

describe('PlanningService planning templates', () => {
  it('creates a day preset in planning_templates without duplicating RH data', async () => {
    const prisma = mockPrisma();
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: 'dept-1' });
    prisma.hrPosition.findFirst.mockResolvedValue({ id: 'pos-1' });
    prisma.planningTemplate.create.mockResolvedValue({
      id: 'preset-1',
      name: 'Matin salle',
      periodType: 'DAY_PRESET',
      departmentId: 'dept-1',
      siteId: null,
      content: { type: 'DAY_PRESET', startTime: '08:00', endTime: '12:00', positionId: 'pos-1', breakMinutes: 0, employeeIds: [] },
    });
    const service = new PlanningService(prisma);

    const preset = await service.createDayPreset('org-1', actor, {
      name: 'Matin salle',
      startTime: '08:00',
      endTime: '12:00',
      departmentId: 'dept-1',
      positionId: 'pos-1',
    });

    expect(prisma.planningTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: 'org-1',
        periodType: 'DAY_PRESET',
        content: expect.objectContaining({ type: 'DAY_PRESET', startTime: '08:00', endTime: '12:00', positionId: 'pos-1' }),
      }),
    }));
    expect(preset).toEqual(expect.objectContaining({ templateType: 'DAY_PRESET', startTime: '08:00', endTime: '12:00' }));
    expect(prisma.hrEmployee.update).toBeUndefined();
  });

  it('stores employee template assignments in planning template content only', async () => {
    const prisma = mockPrisma();
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'emp-1' });
    prisma.planningTemplate.findMany
      .mockResolvedValueOnce([
        { id: 'preset-1', periodType: 'DAY_PRESET', content: { type: 'DAY_PRESET', employeeIds: [] } },
        { id: 'rotation-1', periodType: 'WEEKLY_ROTATION', content: { type: 'WEEKLY_ROTATION', employeeIds: [], defaultEmployeeIds: [] } },
      ])
      .mockResolvedValueOnce([
        { id: 'preset-1', periodType: 'DAY_PRESET', content: { type: 'DAY_PRESET', employeeIds: ['emp-1'] } },
        { id: 'rotation-1', periodType: 'WEEKLY_ROTATION', content: { type: 'WEEKLY_ROTATION', employeeIds: ['emp-1'], defaultEmployeeIds: ['emp-1'] } },
      ]);
    prisma.planningTemplate.update.mockResolvedValue({});
    const service = new PlanningService(prisma);

    const result = await service.setEmployeeTemplateAssignments('org-1', actor, {
      employeeId: 'emp-1',
      dayPresetIds: ['preset-1'],
      weeklyRotationIds: ['rotation-1'],
      defaultWeeklyRotationId: 'rotation-1',
    });

    expect(prisma.planningTemplate.update).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({
      employeeId: 'emp-1',
      dayPresetIds: ['preset-1'],
      weeklyRotationIds: ['rotation-1'],
      defaultWeeklyRotationId: 'rotation-1',
    }));
    expect(prisma.hrRotationAssignment.create).not.toHaveBeenCalled();
    expect(prisma.hrRotationAssignment.update).not.toHaveBeenCalled();
  });
});

describe('PlanningService period workflow', () => {
  it('controls a planning period and stores the status in planning_history', async () => {
    const prisma = mockPrisma();
    prisma.planningConflict.findMany.mockResolvedValue([
      { severity: 'STRONG_WARNING' },
      { severity: 'BLOCKING' },
    ]);
    prisma.planningHistory.create.mockResolvedValue({ id: 'history-control' });
    prisma.planningHistory.findMany.mockResolvedValue([
      { id: 'history-control', createdAt: new Date('2026-06-24T10:00:00.000Z'), action: 'PLANNING_CREATED', entityType: 'PlanningPeriod', entityId: '2026-06-01_2026-06-30_all-sites', label: 'Planning contrôlé', newValue: { eventType: 'CONTROLLED', blockingAlerts: 1, warningAlerts: 1, period: { startDate: '2026-06-01', endDate: '2026-06-30', siteId: null, key: '2026-06-01_2026-06-30_all-sites' } } },
    ]);
    const service = new PlanningService(prisma);
    jest.spyOn(service as any, 'recalculateBaseAlerts').mockResolvedValue(undefined);

    const result = await service.controlPeriod('org-1', actor, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    expect(result.publishable).toBe(false);
    expect(result.periodStatus.status).toBe('CONTROLLED');
    expect(prisma.planningHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityType: 'PlanningPeriod',
        label: 'Planning contrôlé',
        newValue: expect.objectContaining({ eventType: 'CONTROLLED', blockingAlerts: 1, warningAlerts: 1 }),
      }),
    }));
  });

  it('publishes a controlled period and prepares a Planning notification without writing RH', async () => {
    const prisma = mockPrisma();
    prisma.planningConflict.findMany.mockResolvedValue([]);
    prisma.planningHistory.findMany
      .mockResolvedValueOnce([
        { id: 'history-control', createdAt: new Date('2026-06-24T10:00:00.000Z'), label: 'Planning contrôlé', newValue: { eventType: 'CONTROLLED', period: { startDate: '2026-06-01', endDate: '2026-06-30', siteId: null, key: '2026-06-01_2026-06-30_all-sites' } } },
      ])
      .mockResolvedValueOnce([
        { id: 'history-publish', createdAt: new Date('2026-06-24T11:00:00.000Z'), label: 'Planning publié', newValue: { eventType: 'PUBLISHED', period: { startDate: '2026-06-01', endDate: '2026-06-30', siteId: null, key: '2026-06-01_2026-06-30_all-sites' } } },
      ]);
    prisma.planningHistory.create.mockResolvedValue({ id: 'history-publish' });
    prisma.planningNotification.create.mockResolvedValue({ id: 'notification-1' });
    const service = new PlanningService(prisma);

    const result = await service.publishPeriod('org-1', actor, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    expect(result.periodStatus.status).toBe('PUBLISHED');
    expect(prisma.planningNotification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'PLANNING_PERIOD_PUBLISHED', entityType: 'PlanningPeriod' }),
    }));
    expect(prisma.hrRotationAssignment.create).not.toHaveBeenCalled();
  });

  it('records modification after publication when an assignment changes inside a published period', async () => {
    const prisma = mockPrisma();
    prisma.planningHistory.findMany.mockResolvedValue([
      { id: 'history-publish', createdAt: new Date('2026-06-24T11:00:00.000Z'), label: 'Planning publié', newValue: { eventType: 'PUBLISHED', period: { startDate: '2026-06-01', endDate: '2026-06-30', siteId: null, key: '2026-06-01_2026-06-30_all-sites' } } },
    ]);
    prisma.planningHistory.create.mockResolvedValue({ id: 'history-modified' });
    const service = new PlanningService(prisma);

    await (service as any).recordAssignmentPeriodMutation('org-1', actor.id, {
      id: 'assignment-1',
      date: new Date('2026-06-22T00:00:00.000Z'),
      siteId: null,
    }, 'Affectation modifiée après publication');

    expect(prisma.planningHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityType: 'PlanningPeriod',
        label: 'Planning modifié après publication',
        newValue: expect.objectContaining({ eventType: 'MODIFIED_AFTER_PUBLICATION', assignmentId: 'assignment-1' }),
      }),
    }));
  });
});

describe('PlanningService RH ownership boundaries', () => {
  it('keeps Planning skill mutations obsolete without writing RH', () => {
    const prisma = mockPrisma({
      hrSkill: { findFirst: jest.fn(), create: jest.fn() },
    });
    const service = new PlanningService(prisma);

    expect(() => service.createSkill('org-1', actor, { name: 'Bar' })).toThrow(GoneException);
    expect(prisma.hrSkill.create).not.toHaveBeenCalled();
  });
});

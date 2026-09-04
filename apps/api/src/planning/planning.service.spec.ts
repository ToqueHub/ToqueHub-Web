import { BadRequestException, GoneException } from '@nestjs/common';
import { HrEmployeeStatus, PlanningAssignmentOrigin, PlanningAssignmentStatus } from '@prisma/client';
import { PDFDocument as ReadablePdfDocument } from 'pdf-lib';
import PDFKitDocument from 'pdfkit';
import { PlanningService } from './planning.service';

function mockPrisma(overrides?: any): any {
  const base: any = {
    organization: {
      findUnique: jest.fn(),
    },
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
    planningTemplateApplication: {
      findMany: jest.fn(),
    },
    planningReplacement: {
      findMany: jest.fn(),
    },
    planningHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    planningNotification: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    hrDepartment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    hrPosition: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    hrSkill: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    hrEmployee: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    hrAbsence: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    site: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
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

describe('PlanningService personal PDF export', () => {
  it('generates a PDF from only the assignments exposed by the personal schedule', async () => {
    const prisma = mockPrisma();
    prisma.organization.findUnique.mockResolvedValue({ name: 'Restaurant test' });
    prisma.planningAssignment.findMany.mockResolvedValue([{
      id: 'assignment-visible', employeeId: 'employee-1', date: new Date(2026, 7, 11),
      startTime: new Date(2026, 7, 11, 8), endTime: new Date(2026, 7, 11, 16), breakMinutes: 30,
      employee: { id: 'employee-1', firstName: 'Jean', lastName: 'Dupont' },
      department: { name: 'Cuisine' }, position: { name: 'Cuisinier' }, site: { name: 'Paris' },
    }]);
    const attendanceService = {
      mySchedule: jest.fn().mockResolvedValue({
        employee: { id: 'employee-1', firstName: 'Jean', lastName: 'Dupont', departmentName: 'Cuisine', positionName: 'Cuisinier', siteName: 'Paris' },
        rows: [{ assignmentId: 'assignment-visible' }],
      }),
    };
    const service = new PlanningService(prisma, undefined, undefined, undefined, undefined, attendanceService as any);

    const result = await service.exportMyPlanningPdf('org-1', {
      id: 'user-1', role: 'Utilisateur', permissions: ['planning.read'], employeeId: 'employee-1',
    }, { mode: 'week', startDate: '2026-08-11' });

    expect(attendanceService.mySchedule).toHaveBeenCalledWith('org-1', expect.objectContaining({ employeeId: 'employee-1' }), expect.objectContaining({ startDate: '2026-08-01', endDate: '2026-08-31' }));
    expect(prisma.planningAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', employeeId: 'employee-1', id: { in: ['assignment-visible'] } },
    }));
    expect(result.filename).toBe('mon-planning-2026-08-01-2026-08-31.pdf');
    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    const pdf = await ReadablePdfDocument.load(result.buffer);
    expect(pdf.getPageCount()).toBe(1);
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
  it('allows an employee without any HR site to be assigned to an explicit Planning site', () => {
    const service = new PlanningService(mockPrisma());

    expect((service as any).employeeCanWorkSite({ mainSiteId: null, secondarySites: [] }, 'site-1')).toBe(true);
    expect((service as any).employeeCanWorkSite({ mainSiteId: 'site-2', secondarySites: [] }, 'site-1')).toBe(false);
  });

  it('normalizes unordered legacy days by dayOfWeek and never turns leave into work', async () => {
    const prisma = mockPrisma();
    prisma.planningTemplate.findFirst.mockResolvedValue({
      id: 'template-rotation-legacy',
      organizationId: 'org-1',
      name: 'Semaine legacy',
      periodType: 'WEEKLY_ROTATION',
      departmentId: 'dept-1',
      siteId: null,
      content: {
        type: 'WEEKLY_ROTATION',
        employeeIds: ['emp-1'],
        days: [
          { dayOfWeek: 3, mode: 'LEAVE', startTime: '08:00', endTime: '18:00' },
          { dayOfWeek: 1, mode: 'WORK', startTime: '07:00', endTime: '15:00' },
          { dayOfWeek: 2, mode: 'CLOSED', startTime: '09:00', endTime: '17:00' },
        ],
      },
    });
    prisma.hrEmployee.findMany.mockResolvedValue([{ id: 'emp-1', departmentId: 'dept-1', positionId: 'pos-1', mainSiteId: null, secondarySites: [] }]);
    const service = new PlanningService(prisma);

    const result = await service.applyWeeklyRotationPreview('org-1', 'template-rotation-legacy', {
      employeeId: 'emp-1',
      siteId: 'site-1',
      startDate: '2026-06-22',
      endDate: '2026-06-28',
    });

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]).toEqual(expect.objectContaining({ date: '2026-06-22', startTime: '07:00', endTime: '15:00' }));
  });

  it('rejects a weekly rotation without any configured work day', async () => {
    const prisma = mockPrisma();
    const service = new PlanningService(prisma);

    await expect(service.createWeeklyRotationTemplate('org-1', actor, {
      name: 'Repos uniquement',
      days: [{ dayOfWeek: 1, mode: 'REST' }],
    })).rejects.toThrow('Ajoutez au moins une journée Travail');
    expect(prisma.planningTemplate.create).not.toHaveBeenCalled();
  });

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
      comment: 'Roulement Planning Semaine salle',
    })]);
  });

  it('reports cross-site replacements in the weekly rotation preview', async () => {
    const prisma = mockPrisma();
    prisma.planningTemplate.findFirst.mockResolvedValue({
      id: 'template-rotation-1',
      organizationId: 'org-1',
      name: 'Semaine salle',
      periodType: 'WEEKLY_ROTATION',
      departmentId: 'dept-1',
      siteId: 'site-2',
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
    prisma.hrEmployee.findMany.mockResolvedValue([{ id: 'emp-1', departmentId: 'dept-1', positionId: 'pos-1', mainSiteId: 'site-2' }]);
    prisma.planningAssignment.findFirst.mockResolvedValue({
      id: 'assignment-site-1',
      employeeId: 'emp-1',
      date: new Date('2026-06-22T00:00:00.000Z'),
      siteId: 'site-1',
      site: { name: 'Site A' },
      employee: { firstName: 'Paul', lastName: 'Breton' },
      startTime: '10:00',
      endTime: '14:00',
    });
    const service = new PlanningService(prisma);

    const result = await service.applyWeeklyRotationPreview('org-1', 'template-rotation-1', {
      employeeId: 'emp-1',
      siteId: 'site-2',
      startDate: '2026-06-22',
      endDate: '2026-06-28',
    });

    const employeeQuery = prisma.hrEmployee.findMany.mock.calls[0][0];
    expect(employeeQuery.where).toEqual(expect.objectContaining({
      organizationId: 'org-1',
      id: { in: ['emp-1'] },
      isArchived: false,
      status: HrEmployeeStatus.ACTIVE,
    }));
    expect(employeeQuery.where.OR).toBeUndefined();

    expect(result.crossSiteReplacements).toEqual([expect.objectContaining({
      assignmentId: 'assignment-site-1',
      existingSiteName: 'Site A',
      targetSiteId: 'site-2',
      existingStartTime: '10:00',
      targetStartTime: '09:00',
    })]);
  });

  it('applies a Planning weekly rotation template into Planning assignments', async () => {
    const prisma = mockPrisma();
    prisma.planningAssignment.findFirst.mockResolvedValue(null);
    const service = new PlanningService(prisma);
    jest.spyOn(service, 'applyWeeklyRotationPreview').mockResolvedValue({
      rotation: { id: 'rotation-1' },
      assignments: [{ ...assignmentPayload }],
      temporarySource: 'planning_templates',
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
      origin: PlanningAssignmentOrigin.AUTO_GENERATION,
      allowCriticalOverride: true,
    }));
  });

  it('returns an error instead of a false success when every proposed day is skipped', async () => {
    const prisma = mockPrisma();
    prisma.planningAssignment.findFirst.mockResolvedValue(null);
    const service = new PlanningService(prisma);
    jest.spyOn(service, 'applyWeeklyRotationPreview').mockResolvedValue({
      rotation: { id: 'rotation-1' },
      assignments: [{ ...assignmentPayload }],
      temporarySource: 'planning_templates',
      applied: false,
    } as any);
    jest.spyOn(service as any, 'saveAssignmentAllowingConflicts').mockRejectedValue(new BadRequestException('Collaborateur non affecté au site'));
    jest.spyOn(service as any, 'recalculateBaseAlerts').mockResolvedValue(undefined);

    await expect(service.applyWeeklyRotation('org-1', actor, 'rotation-1', {
      employeeId: 'emp-1',
      siteId: 'site-1',
      startDate: '2026-06-22',
      endDate: '2026-06-28',
      replaceExisting: true,
    })).rejects.toThrow('Aucune affectation n’a été enregistrée');
  });

  it('requires explicit confirmation before replacing assignments from another site', async () => {
    const prisma = mockPrisma();
    const service = new PlanningService(prisma);
    jest.spyOn(service, 'applyWeeklyRotationPreview').mockResolvedValue({
      rotation: { id: 'rotation-1' },
      assignments: [{ ...assignmentPayload, siteId: 'site-2' }],
      crossSiteReplacements: [{ assignmentId: 'assignment-site-1', existingSiteName: 'Site A', targetSiteId: 'site-2' }],
      temporarySource: 'planning_templates',
      applied: false,
    } as any);
    const saveAssignmentAllowingConflicts = jest.spyOn(service as any, 'saveAssignmentAllowingConflicts').mockResolvedValue({ id: 'assignment-1' });

    await expect(service.applyWeeklyRotation('org-1', actor, 'rotation-1', {
      employeeId: 'emp-1',
      siteId: 'site-2',
      startDate: '2026-06-22',
      endDate: '2026-06-28',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(saveAssignmentAllowingConflicts).not.toHaveBeenCalled();
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
  });
});

describe('PlanningService context', () => {
  it('keeps all active sites available in the context when a site filter is selected', async () => {
    const prisma = mockPrisma();
    prisma.organization.findUnique.mockResolvedValue({ hrInstalledAt: new Date(), planningInstalledAt: new Date() });
    prisma.hrEmployee.findMany.mockResolvedValue([]);
    prisma.hrDepartment.findMany.mockResolvedValue([]);
    prisma.hrPosition.findMany.mockResolvedValue([]);
    prisma.site.findMany.mockResolvedValue([{ id: 'site-kuusamo', name: 'Kuusamo' }, { id: 'site-oulu', name: 'Oulu' }]);
    prisma.hrSkill.findMany.mockResolvedValue([]);
    prisma.planningAssignment.findMany.mockResolvedValue([]);
    prisma.planningOperationalNeed.findMany.mockResolvedValue([]);
    prisma.planningTemplate.findMany.mockResolvedValue([]);
    prisma.planningTemplateApplication.findMany.mockResolvedValue([]);
    prisma.planningReplacement.findMany.mockResolvedValue([]);
    prisma.planningConflict.findMany.mockResolvedValue([]);
    prisma.planningNotification.findMany.mockResolvedValue([]);
    prisma.planningHistory.findMany.mockResolvedValue([]);
    prisma.hrAbsence.findMany.mockResolvedValue([]);
    const service = new PlanningService(prisma);

    const result = await service.context('org-1', {
      month: 7,
      year: 2026,
      siteId: 'site-kuusamo',
    });

    expect(prisma.site.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', isArchived: false },
      orderBy: { name: 'asc' },
    });
    expect(result.sites).toEqual([{ id: 'site-kuusamo', name: 'Kuusamo' }, { id: 'site-oulu', name: 'Oulu' }]);
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

describe('PlanningService PDF exports', () => {
  const augustPeriod = {
    start: new Date(2026, 7, 1),
    end: new Date(2026, 7, 31, 23, 59, 59, 999),
    month: 8,
    year: 2026,
    days: [],
  };

  it('excludes the empty dates outside the requested month from boundary weeks', () => {
    const service = new PlanningService(mockPrisma());

    const weeks = (service as any).exportWeeks(augustPeriod);

    expect(weeks[0].days).toEqual(['2026-08-01', '2026-08-02']);
    expect(weeks.at(-1)?.days).toEqual(['2026-08-31']);
  });

  it('balances an overflowing employee list instead of leaving an orphan page', () => {
    const service = new PlanningService(mockPrisma());
    const document = new PDFKitDocument({ size: 'A4', layout: 'landscape', margin: 18 });
    const days = ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'];
    const rows = Array.from({ length: 17 }, (_, index) => ({
      employeeName: `Collaborateur ${index + 1}`,
      departmentName: 'Café / Barista',
      assignmentsByDate: new Map(),
    }));

    const pages = (service as any).paginatePlanningPdfRows(document, rows, days);
    document.end();

    expect(pages).toHaveLength(2);
    expect(pages.map((page: any) => page.rows.length)).toEqual([9, 8]);
  });

  it('keeps a normal 16-person week on one readable landscape page', async () => {
    const service = new PlanningService(mockPrisma());
    const assignments = Array.from({ length: 16 }, (_, index) => ({
      id: `assignment-${index + 1}`,
      employeeId: `employee-${index + 1}`,
      date: new Date(2026, 6, 27),
      startTime: '08:00',
      endTime: '16:00',
      breakMinutes: 30,
      employee: { id: `employee-${index + 1}`, firstName: `Prénom ${index + 1}`, lastName: `Nom ${index + 1}` },
      department: { name: 'Café / Barista' },
      position: { name: 'Barista' },
    }));

    const buffer = await (service as any).buildPlanningPdf({
      title: 'Planning hebdomadaire',
      organizationName: 'The French Café',
      mode: 'week',
      period: {
        start: new Date(2026, 6, 27),
        end: new Date(2026, 7, 2, 23, 59, 59, 999),
        month: 7,
        year: 2026,
        days: [],
      },
      assignments,
    });
    const pdf = await ReadablePdfDocument.load(buffer);

    expect(pdf.getPageCount()).toBe(1);
  });

  it('preserves long position names instead of truncating them in the generated content', () => {
    const service = new PlanningService(mockPrisma());
    const positionName = 'Directrice générale adjointe des opérations';

    const details = (service as any).assignmentPdfDetails({
      startTime: '09:00',
      endTime: '17:30',
      breakMinutes: 45,
      position: { name: positionName },
    });

    expect(details).toEqual({ range: '09:00–17:30', breakLabel: 'P 45 min', label: positionName });
  });
});

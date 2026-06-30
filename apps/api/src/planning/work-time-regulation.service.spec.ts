import { PlanningConflictSeverity } from '@prisma/client';
import { WorkTimeRegulationService } from './work-time-regulation.service';

function serviceWithPrisma(overrides: any = {}) {
  const prisma = {
    establishmentWorkTimeRegulation: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    hrEmployee: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    ...overrides,
  };
  return { service: new WorkTimeRegulationService(prisma as any), prisma };
}

function assignment(date: Date, start: Date, end: Date, patch: Record<string, any> = {}) {
  return {
    id: 'assignment-1',
    organizationId: 'org-1',
    employeeId: 'emp-1',
    date,
    startTime: start,
    endTime: end,
    breakMinutes: 0,
    status: 'PLANNED',
    employee: { firstName: 'Alice', lastName: 'Martin' },
    position: { name: 'Cuisinier' },
    ...patch,
  };
}

describe('WorkTimeRegulationService', () => {
  it('detects night hours on a shift crossing the configured night range', () => {
    const { service } = serviceWithPrisma();
    const regulation = {
      ...(service as any).defaultView('org-1'),
      nightWorkEnabled: true,
      nightWorkStartTime: '22:00',
      nightWorkEndTime: '06:00',
      validationStatus: 'validated',
    };

    const alerts = service.analyzeAssignment(regulation, assignment(
      new Date(2026, 5, 22),
      new Date(2026, 5, 22, 21, 0),
      new Date(2026, 5, 22, 23, 30),
    ));

    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'INTERNAL_NIGHT_WORK_DETECTED',
        severity: PlanningConflictSeverity.INFO,
        details: expect.objectContaining({ trackedMinutes: 90, sourceLayer: 'establishment_internal' }),
      }),
    ]));
  });

  it('detects work on a configured public holiday without inventing compensation', () => {
    const { service } = serviceWithPrisma();
    const regulation = {
      ...(service as any).defaultView('org-1'),
      publicHolidayWorkEnabled: false,
      publicHolidayDates: ['2026-05-01'],
      validationStatus: 'requires_review',
    };

    const alerts = service.analyzeAssignment(regulation, assignment(
      new Date(2026, 4, 1),
      new Date(2026, 4, 1, 9, 0),
      new Date(2026, 4, 1, 17, 0),
    ));

    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'INTERNAL_PUBLIC_HOLIDAY_WORK_DETECTED',
        severity: PlanningConflictSeverity.STRONG_WARNING,
        details: expect.objectContaining({
          compensationGenerated: false,
          balanceImpact: 'tracking_only',
          legalRightId: null,
        }),
      }),
    ]));
  });

  it('detects weekend work and keeps the source internal', () => {
    const { service } = serviceWithPrisma();
    const regulation = {
      ...(service as any).defaultView('org-1'),
      weekendWorkEnabled: true,
      saturdayWorkAllowed: true,
      validationStatus: 'validated',
    };

    const alerts = service.analyzeAssignment(regulation, assignment(
      new Date(2026, 5, 27),
      new Date(2026, 5, 27, 8, 0),
      new Date(2026, 5, 27, 12, 0),
    ));

    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'INTERNAL_WEEKEND_WORK_DETECTED',
        details: expect.objectContaining({
          sourceLayer: 'establishment_internal',
          legalRightId: null,
          compensationGenerated: false,
        }),
      }),
    ]));
  });

  it('previews collaborator position mapping without mutating missing or matched employees', async () => {
    const { service, prisma } = serviceWithPrisma();
    prisma.hrEmployee.findMany.mockResolvedValue([
      { id: 'emp-1', firstName: 'Bérenger', lastName: 'Durand', email: null, position: { name: 'Cuisinier' } },
      { id: 'emp-2', firstName: 'Alice', lastName: 'Martin', email: null, position: { name: 'Cuisinier' } },
    ]);

    const preview = await service.positionMappingPreview('org-1');

    expect(preview.updated).toBe(false);
    expect(preview.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeId: 'emp-1', proposedPosition: 'Chef de production', willModify: false }),
      expect.objectContaining({ employeeId: 'emp-2', proposedPosition: 'Cuisinier', willModify: false }),
    ]));
    expect(preview.expectedNamesMissing).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'cedric', status: 'not_found', willModify: false }),
    ]));
    expect(prisma.hrEmployee.update).not.toHaveBeenCalled();
  });
});

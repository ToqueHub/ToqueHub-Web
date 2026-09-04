import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { PlanningAttendanceStatus } from '@prisma/client';
import { PlanningAttendanceService } from './planning-attendance.service';
import { MyPlanningExportPdfQueryDto } from './dto/planning.dto';

const actor = {
  id: 'user-1',
  role: 'Utilisateur',
  permissions: ['planning.read'],
  employeeId: 'employee-1',
};

const assignment = {
  id: 'assignment-1',
  organizationId: 'org-1',
  employeeId: 'employee-1',
  date: new Date('2026-08-15T00:00:00.000Z'),
  startTime: new Date('2026-08-15T08:00:00.000Z'),
  endTime: new Date('2026-08-15T16:00:00.000Z'),
  breakMinutes: 30,
  status: 'PLANNED',
  siteId: 'site-1',
  department: { name: 'Cuisine' },
  position: { name: 'Cuisinier' },
  site: { name: 'Paris' },
};

const publication = (status = 'PUBLISHED', startDate = '2026-08-11', endDate = '2026-08-17') => ({
  createdAt: new Date('2026-08-10T12:00:00.000Z'),
  newValue: { eventType: status, period: { startDate, endDate, siteId: null } },
});

function fixture(options: { events?: any[]; currentAssignment?: any } = {}) {
  let entry: any = null;
  const currentAssignment = options.currentAssignment ?? assignment;
  const prisma: any = {
    hrEmployee: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'employee-1', firstName: 'Jean', lastName: 'Dupont', isArchived: false,
        department: { name: 'Cuisine' }, position: { name: 'Cuisinier' }, mainSite: { name: 'Paris' },
      }),
    },
    planningAssignment: {
      findMany: jest.fn().mockImplementation(async () => [currentAssignment]),
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => where.employeeId === currentAssignment.employeeId ? currentAssignment : null),
    },
    planningAttendanceEntry: {
      findMany: jest.fn().mockImplementation(async () => entry ? [entry] : []),
      findFirst: jest.fn().mockImplementation(async () => entry),
      upsert: jest.fn().mockImplementation(async ({ create, update }: any) => {
        entry = entry ? { ...entry, ...update } : { id: 'attendance-1', createdAt: new Date(), ...create };
        return entry;
      }),
      update: jest.fn().mockImplementation(async ({ data }: any) => {
        entry = { ...entry, ...data };
        return entry;
      }),
    },
    planningHistory: {
      findMany: jest.fn().mockResolvedValue(options.events ?? [publication()]),
    },
  };
  return {
    prisma,
    service: new PlanningAttendanceService(prisma),
    setEntry(value: any) { entry = value; },
    getEntry() { return entry; },
  };
}

describe('Planning personal attendance', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('returns only assignments covered by a currently published period', async () => {
    const published = fixture();
    const draft = fixture({ events: [publication('MODIFIED_AFTER_PUBLICATION')] });

    await expect(published.service.mySchedule('org-1', actor, { startDate: '2026-08-11', endDate: '2026-08-17' }))
      .resolves.toMatchObject({ rows: [{ assignmentId: 'assignment-1', publicationStatus: 'PUBLISHED' }] });
    await expect(draft.service.mySchedule('org-1', actor, { startDate: '2026-08-11', endDate: '2026-08-17' }))
      .resolves.toMatchObject({ rows: [] });
  });

  it('keeps a signed attendance visible when its period was modified after publication', async () => {
    const current = fixture({ events: [publication('MODIFIED_AFTER_PUBLICATION')] });
    current.setEntry({
      id: 'attendance-1', assignmentId: assignment.id, employeeId: actor.employeeId,
      date: assignment.date, declaredStartTime: assignment.startTime, declaredEndTime: assignment.endTime,
      plannedMinutes: 450, declaredMinutes: 450, status: PlanningAttendanceStatus.SIGNED, createdAt: new Date(),
    });

    await expect(current.service.mySchedule('org-1', actor, { startDate: '2026-08-11', endDate: '2026-08-17' }))
      .resolves.toMatchObject({ rows: [{ assignmentId: assignment.id, publicationStatus: 'MODIFIED_AFTER_PUBLICATION', attendance: { status: 'SIGNED' } }] });
  });

  it('rejects an employeeId supplied to the personal PDF query', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(pipe.transform(
      { mode: 'week', startDate: '2026-08-11', employeeId: 'employee-2' },
      { type: 'query', metatype: MyPlanningExportPdfQueryDto, data: '' },
    )).rejects.toThrow();
  });

  it('requires planning.read and a linked employee profile', async () => {
    const { service } = fixture();
    await expect(service.mySchedule('org-1', { ...actor, permissions: [] }, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.mySchedule('org-1', { ...actor, employeeId: null }, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses the employee from the authenticated account and rejects another assignment', async () => {
    const other = fixture({ currentAssignment: { ...assignment, employeeId: 'employee-2' } });
    await expect(other.service.checkIn('org-1', actor, assignment.id)).rejects.toThrow('Créneau personnel introuvable');
  });

  it('records an idempotent server-side check-in and preserves it as evidence', async () => {
    const current = fixture();
    await current.service.checkIn('org-1', actor, assignment.id);
    await current.service.checkIn('org-1', actor, assignment.id);

    expect(current.prisma.planningAttendanceEntry.upsert).toHaveBeenCalledTimes(1);
    expect(current.getEntry()).toMatchObject({
      status: PlanningAttendanceStatus.DRAFT,
      declaredStartTime: new Date('2026-08-15T10:00:00.000Z'),
      metadata: { mobileAttendance: { rawCheckInAt: '2026-08-15T10:00:00.000Z' } },
    });
  });

  it('refuses point operations on an unpublished period and checkout without check-in', async () => {
    const unpublished = fixture({ events: [publication('CONTROLLED')] });
    await expect(unpublished.service.checkIn('org-1', actor, assignment.id)).rejects.toThrow('actuellement publié');

    const noCheckIn = fixture();
    await expect(noCheckIn.service.checkOut('org-1', actor, assignment.id)).rejects.toThrow("Pointez d'abord");
  });

  it('subtracts the fixed planned break and locks the signed declaration', async () => {
    jest.setSystemTime(new Date('2026-08-15T18:00:00.000Z'));
    const current = fixture();
    await current.service.submitMine('org-1', actor, assignment.id, { declaredStartTime: '08:00', declaredEndTime: '16:00' });

    expect(current.getEntry()).toMatchObject({
      plannedMinutes: 450,
      declaredMinutes: 450,
      status: PlanningAttendanceStatus.SIGNED,
      signedById: 'user-1',
      signedAt: new Date('2026-08-15T18:00:00.000Z'),
    });
    await expect(current.service.submitMine('org-1', actor, assignment.id, { declaredStartTime: '08:15', declaredEndTime: '16:00' }))
      .rejects.toThrow('verrouillé');
  });

  it('allows catch-up through day seven and refuses it on day eight', async () => {
    const sevenDaysOld = { ...assignment, date: new Date('2026-08-08T00:00:00.000Z'), startTime: new Date('2026-08-08T08:00:00.000Z'), endTime: new Date('2026-08-08T16:00:00.000Z') };
    const allowed = fixture({ currentAssignment: sevenDaysOld, events: [publication('PUBLISHED', '2026-08-01', '2026-08-10')] });
    await expect(allowed.service.submitMine('org-1', actor, assignment.id, { declaredStartTime: '08:00', declaredEndTime: '16:00' })).resolves.toBeDefined();

    const eightDaysOld = { ...sevenDaysOld, date: new Date('2026-08-07T00:00:00.000Z'), startTime: new Date('2026-08-07T08:00:00.000Z'), endTime: new Date('2026-08-07T16:00:00.000Z') };
    const refused = fixture({ currentAssignment: eightDaysOld, events: [publication('PUBLISHED', '2026-08-01', '2026-08-10')] });
    await expect(refused.service.submitMine('org-1', actor, assignment.id, { declaredStartTime: '08:00', declaredEndTime: '16:00' })).rejects.toThrow('7 jours');
  });

  it('refuses a future shift', async () => {
    const future = {
      ...assignment,
      date: new Date('2026-08-16T00:00:00.000Z'),
      startTime: new Date('2026-08-16T08:00:00.000Z'),
      endTime: new Date('2026-08-16T16:00:00.000Z'),
    };
    const current = fixture({ currentAssignment: future });
    await expect(current.service.submitMine('org-1', actor, assignment.id, { declaredStartTime: '08:00', declaredEndTime: '16:00' })).rejects.toThrow('futur');
  });

  it('allows checkout after midnight for an overnight shift', async () => {
    const overnight = {
      ...assignment,
      date: new Date('2026-08-14T00:00:00.000Z'),
      startTime: new Date('2026-08-14T22:00:00.000Z'),
      endTime: new Date('2026-08-15T06:00:00.000Z'),
    };
    const current = fixture({ currentAssignment: overnight, events: [publication('PUBLISHED', '2026-08-11', '2026-08-17')] });
    current.setEntry({
      id: 'attendance-1', organizationId: 'org-1', assignmentId: assignment.id, employeeId: 'employee-1',
      date: overnight.date, declaredStartTime: new Date('2026-08-14T22:05:00.000Z'), declaredEndTime: null,
      plannedMinutes: 450, status: PlanningAttendanceStatus.DRAFT, metadata: {}, createdAt: new Date(),
    });

    await expect(current.service.checkOut('org-1', actor, assignment.id)).resolves.toMatchObject({ assignmentId: assignment.id });
    expect(current.getEntry().declaredEndTime).toEqual(new Date('2026-08-15T10:00:00.000Z'));
  });
});

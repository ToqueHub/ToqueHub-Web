import { ForbiddenException } from '@nestjs/common';
import { OperationalTaskPresetsService } from './operational-task-presets.service';

describe('OperationalTaskPresetsService', () => {
  const prisma = {
    hrDepartment: { findMany: jest.fn(), findFirst: jest.fn() },
    site: { findMany: jest.fn(), findFirst: jest.fn() },
    hrEmployee: { findMany: jest.fn(), findFirst: jest.fn() },
    technicalSheet: { findMany: jest.fn(), findFirst: jest.fn() },
    technicalSheetStep: { findFirst: jest.fn() },
    operationalTaskPreset: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    operationalTask: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    operationalTaskAssignment: { deleteMany: jest.fn(), create: jest.fn() },
    planningAssignment: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new OperationalTaskPresetsService(prisma as never);
  const manager = {
    id: 'user-1',
    role: 'MANAGER',
    permissions: ['production.write'],
    employeeId: 'employee-manager',
  };
  const dto = {
    name: 'Croissants du samedi',
    description: 'Préparer les croissants pour le service du samedi.',
    category: 'KITCHEN' as const,
    departmentId: '00000000-0000-4000-8000-000000000001',
    siteId: '00000000-0000-4000-8000-000000000002',
    assignedEmployeeId: '00000000-0000-4000-8000-000000000003',
    technicalSheetId: '00000000-0000-4000-8000-000000000004',
    technicalSheetStepId: null,
    serviceWeekdays: [6],
    leadDays: 1,
    startTime: '06:00',
    endTime: '10:00',
    timezone: 'Europe/Helsinki',
    quantity: 80,
    unitLabel: 'portions',
    startsOn: '2026-08-01',
    endsOn: null,
    isActive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => unknown) =>
      work(prisma),
    );
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: dto.departmentId });
    prisma.hrEmployee.findFirst.mockResolvedValue({
      id: dto.assignedEmployeeId,
      departmentId: dto.departmentId,
    });
    prisma.site.findFirst.mockResolvedValue({ id: dto.siteId });
    prisma.technicalSheet.findFirst.mockResolvedValue({ id: dto.technicalSheetId });
    prisma.operationalTaskPreset.create.mockResolvedValue({
      id: 'preset-1',
      organizationId: 'org-1',
      ...dto,
    });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('creates an organization-scoped recurring preset and audits it', async () => {
    const result = await service.create('org-1', manager, dto);

    expect(result).toEqual(expect.objectContaining({ id: 'preset-1', name: dto.name }));
    expect(prisma.operationalTaskPreset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          assignedEmployeeId: dto.assignedEmployeeId,
          serviceWeekdays: [6],
          leadDays: 1,
          quantity: expect.anything(),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          action: 'OPERATIONAL_TASK_PRESET_CREATED',
        }),
      }),
    );
  });

  it('refuses preset management to an employee without write permission', async () => {
    await expect(
      service.create(
        'org-1',
        { id: 'user-2', role: 'EMPLOYEE', permissions: [], employeeId: 'employee-2' },
        dto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.operationalTaskPreset.create).not.toHaveBeenCalled();
  });

  it('always scopes preset listing to the current organization', async () => {
    prisma.operationalTaskPreset.findMany.mockResolvedValue([]);

    await service.list('org-1', manager, { departmentId: dto.departmentId });

    expect(prisma.operationalTaskPreset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          departmentId: dto.departmentId,
          isArchived: false,
        }),
      }),
    );
  });

  it('archives a preset and removes only its future pending occurrences', async () => {
    prisma.operationalTaskPreset.findFirst.mockResolvedValue({
      id: 'preset-1',
      organizationId: 'org-1',
      name: dto.name,
    });
    prisma.operationalTask.deleteMany.mockResolvedValue({ count: 2 });
    prisma.operationalTaskPreset.update.mockResolvedValue({
      id: 'preset-1',
      organizationId: 'org-1',
      name: dto.name,
      isActive: false,
      isArchived: true,
    });

    await service.archive('org-1', manager, 'preset-1');

    expect(prisma.operationalTask.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org-1',
        operationalTaskPresetId: 'preset-1',
        status: 'TODO',
        startsAt: { gt: expect.any(Date) },
      }),
    });
    expect(prisma.operationalTaskPreset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false, isArchived: true }),
      }),
    );
  });

  it('materializes a Saturday service as a Friday task for the selected employee', async () => {
    prisma.operationalTaskPreset.findMany.mockResolvedValue([
      {
        id: 'preset-1',
        organizationId: 'org-1',
        name: dto.name,
        description: dto.description,
        category: dto.category,
        departmentId: dto.departmentId,
        siteId: dto.siteId,
        assignedEmployeeId: dto.assignedEmployeeId,
        technicalSheetId: dto.technicalSheetId,
        technicalSheetStepId: null,
        serviceWeekdays: [6],
        leadDays: 1,
        startTime: '06:00',
        endTime: '10:00',
        timezone: 'Europe/Helsinki',
        quantity: 80,
        unitLabel: 'portions',
        startsOn: new Date('2026-08-01T00:00:00.000Z'),
        endsOn: null,
        createdById: 'user-1',
        assignedEmployee: { positionId: 'position-1' },
      },
    ]);
    prisma.operationalTask.findFirst.mockResolvedValue(null);
    prisma.planningAssignment.findFirst.mockResolvedValue({ id: 'shift-1' });
    prisma.operationalTask.create.mockResolvedValue({ id: 'task-1' });
    prisma.operationalTaskAssignment.deleteMany.mockResolvedValue({ count: 0 });
    prisma.operationalTaskAssignment.create.mockResolvedValue({ id: 'assignment-1' });

    await service.materialize(
      'org-1',
      new Date('2026-08-27T21:00:00.000Z'),
      new Date('2026-08-28T21:00:00.000Z'),
    );

    expect(prisma.operationalTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceKey: 'OPERATIONAL_PRESET:preset-1:2026-08-29',
        assignedEmployeeId: dto.assignedEmployeeId,
        operationalTaskPresetId: 'preset-1',
        startsAt: new Date('2026-08-28T03:00:00.000Z'),
        endsAt: new Date('2026-08-28T07:00:00.000Z'),
        quantity: 80,
        unitLabel: 'portions',
      }),
    });
    expect(prisma.operationalTaskAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ employeeId: dto.assignedEmployeeId, isLead: true }),
    });
  });

  it('does not recreate a manually cancelled occurrence', async () => {
    prisma.operationalTaskPreset.findMany.mockResolvedValue([
      {
        id: 'preset-1',
        organizationId: 'org-1',
        name: dto.name,
        description: null,
        category: dto.category,
        departmentId: dto.departmentId,
        siteId: null,
        assignedEmployeeId: dto.assignedEmployeeId,
        technicalSheetId: null,
        technicalSheetStepId: null,
        serviceWeekdays: [6],
        leadDays: 1,
        startTime: '06:00',
        endTime: '10:00',
        timezone: 'Europe/Helsinki',
        quantity: null,
        unitLabel: null,
        startsOn: null,
        endsOn: null,
        createdById: 'user-1',
        assignedEmployee: { positionId: 'position-1' },
      },
    ]);
    prisma.operationalTask.findFirst.mockResolvedValue({ id: 'task-1', status: 'CANCELLED' });

    await service.materialize(
      'org-1',
      new Date('2026-08-27T21:00:00.000Z'),
      new Date('2026-08-28T21:00:00.000Z'),
    );

    expect(prisma.operationalTask.create).not.toHaveBeenCalled();
    expect(prisma.operationalTask.update).not.toHaveBeenCalled();
  });
});

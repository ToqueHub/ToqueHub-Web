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
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    operationalTaskPresetAssignment: { deleteMany: jest.fn(), createMany: jest.fn() },
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
    assignedEmployeeIds: [
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
    ],
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
    prisma.hrEmployee.findMany.mockResolvedValue(
      dto.assignedEmployeeIds.map((id) => ({ id, departmentId: dto.departmentId })),
    );
    prisma.site.findFirst.mockResolvedValue({ id: dto.siteId });
    prisma.technicalSheet.findFirst.mockResolvedValue({ id: dto.technicalSheetId });
    prisma.operationalTaskPreset.create.mockResolvedValue({ id: 'preset-1' });
    prisma.operationalTaskPreset.findUniqueOrThrow.mockResolvedValue({
      id: 'preset-1',
      organizationId: 'org-1',
      ...dto,
      assignments: dto.assignedEmployeeIds.map((employeeId, index) => ({
        employeeId,
        isLead: index === 0,
      })),
    });
    prisma.operationalTaskPresetAssignment.deleteMany.mockResolvedValue({ count: 0 });
    prisma.operationalTaskPresetAssignment.createMany.mockResolvedValue({ count: 2 });
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
    expect(prisma.operationalTaskPresetAssignment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          employeeId: dto.assignedEmployeeIds[0],
          isLead: true,
        }),
        expect.objectContaining({
          employeeId: dto.assignedEmployeeIds[1],
          isLead: false,
        }),
      ],
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          action: 'OPERATIONAL_TASK_PRESET_CREATED',
        }),
      }),
    );
  });

  it('keeps the HR position task reference on the recurring preset', async () => {
    const positionId = '00000000-0000-4000-8000-000000000006';
    const positionTaskPresetId = 'mise-en-place';
    prisma.hrEmployee.findMany.mockResolvedValue(
      dto.assignedEmployeeIds.map((id) => ({
        id,
        departmentId: dto.departmentId,
        position: {
          id: positionId,
          name: 'Chef de partie',
          department: { name: 'Cuisine' },
          taskPresets: [
            {
              id: positionTaskPresetId,
              title: 'Préparer la mise en place',
              category: 'KITCHEN',
              defaultDurationMinutes: 45,
            },
          ],
        },
      })),
    );

    await service.create('org-1', manager, {
      ...dto,
      name: 'Préparer la mise en place',
      positionId,
      positionTaskPresetId,
      technicalSheetId: null,
      quantity: null,
      unitLabel: null,
    });

    expect(prisma.operationalTaskPreset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ positionId, positionTaskPresetId }),
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

  it('materializes a Saturday service as a Friday task for the selected team', async () => {
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
        positionId: 'position-1',
        positionTaskPresetId: 'prepare-croissants',
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
        assignedEmployee: { id: dto.assignedEmployeeId, positionId: 'position-1' },
        assignments: [
          {
            employee: { id: dto.assignedEmployeeIds[0], positionId: 'position-1' },
            isLead: true,
          },
          {
            employee: { id: dto.assignedEmployeeIds[1], positionId: 'position-1' },
            isLead: false,
          },
        ],
      },
    ]);
    prisma.operationalTask.findFirst.mockResolvedValue(null);
    prisma.planningAssignment.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({
        id: where.employeeId === dto.assignedEmployeeIds[0] ? 'shift-1' : 'shift-2',
      }),
    );
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
        positionId: 'position-1',
        positionTaskPresetId: 'prepare-croissants',
        startsAt: new Date('2026-08-28T03:00:00.000Z'),
        endsAt: new Date('2026-08-28T07:00:00.000Z'),
        quantity: 80,
        unitLabel: 'portions',
      }),
    });
    expect(prisma.operationalTaskAssignment.create).toHaveBeenCalledTimes(2);
    expect(prisma.operationalTaskAssignment.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        employeeId: dto.assignedEmployeeIds[0],
        planningAssignmentId: 'shift-1',
        isLead: true,
      }),
    });
    expect(prisma.operationalTaskAssignment.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        employeeId: dto.assignedEmployeeIds[1],
        planningAssignmentId: 'shift-2',
        isLead: false,
      }),
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

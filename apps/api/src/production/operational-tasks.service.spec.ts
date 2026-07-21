import { ForbiddenException } from '@nestjs/common';
import { OperationalTasksService } from './operational-tasks.service';

describe('OperationalTasksService', () => {
  const prisma = {
    hrEmployee: { findMany: jest.fn(), findFirst: jest.fn() },
    hrDepartment: { findFirst: jest.fn(), findMany: jest.fn() },
    hrPosition: { findFirst: jest.fn(), findMany: jest.fn() },
    technicalSheet: { findFirst: jest.fn(), findMany: jest.fn() },
    technicalSheetStep: { findFirst: jest.fn() },
    site: { findFirst: jest.fn() },
    planningAssignment: { findMany: jest.fn(), findFirst: jest.fn() },
    menu: { findFirst: jest.fn() },
    operationalTask: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new OperationalTasksService(prisma as any);
  const period = {
    startDate: '2026-07-20T00:00:00.000Z',
    endDate: '2026-07-27T00:00:00.000Z',
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns only the RH services inside the manager hierarchy', async () => {
    prisma.hrEmployee.findMany.mockResolvedValue([
      { id: 'director', managerId: null, departmentId: 'management' },
      { id: 'chef', managerId: 'director', departmentId: 'kitchen' },
      { id: 'other', managerId: null, departmentId: 'reception' },
    ]);
    prisma.hrDepartment.findMany.mockResolvedValue([
      { id: 'kitchen', name: 'Cuisine' },
      { id: 'management', name: 'Direction' },
    ]);

    const result = await service.context('org-1', {
      id: 'director-user',
      role: 'Manager',
      employeeId: 'director',
      permissions: [],
    });

    expect(result).toMatchObject({
      ownEmployeeId: 'director',
      managesPeople: true,
      canCreateUnassigned: true,
    });
    expect(prisma.hrDepartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: expect.arrayContaining(['management', 'kitchen']) },
        }),
      }),
    );
  });

  it('prioritizes menu technical sheets and exposes their step durations', async () => {
    prisma.hrEmployee.findMany.mockResolvedValue([]);
    prisma.hrPosition.findMany.mockResolvedValue([
      { id: 'cook-position', name: 'Cuisinier', taskPresets: null, department: { name: 'Cuisine' } },
    ]);
    prisma.technicalSheet.findMany.mockResolvedValue([
      {
        id: 'sheet-other',
        name: 'Sauce maison',
        referencePortions: 10,
        totalTimeMinutes: 25,
        preparationTimeMinutes: 25,
        cookingTimeMinutes: 0,
        steps: [],
        menuItems: [],
      },
      {
        id: 'sheet-menu',
        name: 'Snickers',
        referencePortions: 30,
        totalTimeMinutes: 90,
        preparationTimeMinutes: 60,
        cookingTimeMinutes: 30,
        steps: [{ id: 'step-mousse', order: 2, title: 'Préparer la mousse', description: 'Monter la mousse.', estimatedMinutes: 35 }],
        menuItems: [{ menu: { id: 'menu-1', name: 'Carte actuelle' } }],
      },
    ]);

    const result = await service.options(
      'org-1',
      { id: 'admin-user', role: 'ADMIN', permissions: [] },
      {},
    );

    expect(result.technicalSheets[0]).toMatchObject({
      id: 'sheet-menu',
      isOnCurrentMenu: true,
      menuNames: ['Carte actuelle'],
      steps: [{ id: 'step-mousse', estimatedMinutes: 35 }],
    });
    expect(result.presets).toEqual(expect.arrayContaining([
      expect.objectContaining({ positionId: 'cook-position', requiresTechnicalSheet: true }),
    ]));
  });

  it('never exposes production sheets or production presets to a storekeeper', async () => {
    prisma.hrEmployee.findMany.mockResolvedValue([]);
    prisma.hrPosition.findMany.mockResolvedValue([
      {
        id: 'storekeeper-position',
        name: 'Magasinier',
        departmentId: 'logistics',
        department: { name: 'Achats & Logistique' },
        taskPresets: [
          {
            id: 'legacy-production',
            title: 'Réaliser la production de',
            category: 'KITCHEN',
            requiresTechnicalSheet: true,
          },
          {
            id: 'stock-control',
            title: 'Réaliser un contrôle de stock',
            category: 'LOGISTICS',
            defaultDurationMinutes: 60,
            requiresTechnicalSheet: false,
          },
        ],
      },
    ]);
    prisma.technicalSheet.findMany.mockResolvedValue([
      {
        id: 'sheet-1',
        name: 'Ganache',
        referencePortions: 20,
        totalTimeMinutes: 30,
        preparationTimeMinutes: 30,
        cookingTimeMinutes: 0,
        steps: [],
        menuItems: [],
      },
    ]);

    const result = await service.options(
      'org-1',
      { id: 'admin-user', role: 'ADMIN', permissions: [] },
      {},
    );

    expect(result.technicalSheets).toEqual([]);
    expect(result.presets).toEqual([
      expect.objectContaining({ id: 'stock-control', category: 'LOGISTICS' }),
    ]);
  });

  it('uses the recursive RH hierarchy as the manager task perimeter', async () => {
    prisma.hrEmployee.findMany.mockResolvedValue([
      { id: 'manager', managerId: null, departmentId: 'kitchen' },
      { id: 'chef', managerId: 'manager', departmentId: 'kitchen' },
      { id: 'cook', managerId: 'chef', departmentId: 'kitchen' },
      { id: 'reception', managerId: null, departmentId: 'reception' },
    ]);
    prisma.operationalTask.findMany.mockResolvedValue([]);

    await service.list(
      'org-1',
      { id: 'user-manager', role: 'Manager', employeeId: 'manager', permissions: [] },
      period,
    );

    const where = prisma.operationalTask.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR[0].assignedEmployeeId.in).toEqual(
      expect.arrayContaining(['manager', 'chef', 'cook']),
    );
    expect(where.AND[0].OR[0].assignedEmployeeId.in).not.toContain('reception');
    expect(where.AND[0].OR[1].departmentId.in).toEqual(['kitchen']);
  });

  it('marks RH collaborators available only when Planning covers the whole task', async () => {
    const employees = [
      {
        id: 'chef',
        managerId: 'director',
        departmentId: 'kitchen',
        firstName: 'Claire',
        lastName: 'Martin',
      },
      {
        id: 'cook',
        managerId: 'chef',
        departmentId: 'kitchen',
        firstName: 'Lucas',
        lastName: 'Bernard',
      },
    ];
    prisma.hrEmployee.findMany
      .mockResolvedValueOnce([
        { id: 'director', managerId: null, departmentId: 'management' },
        ...employees.map(({ id, managerId, departmentId }) => ({ id, managerId, departmentId })),
      ])
      .mockResolvedValueOnce(employees);
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: 'kitchen' });
    prisma.planningAssignment.findMany.mockResolvedValue([
      { id: 'shift-cook', employeeId: 'cook', site: null, position: null },
    ]);
    prisma.operationalTask.findMany.mockResolvedValue([]);

    const result = await service.assignees(
      'org-1',
      { id: 'director-user', role: 'Manager', employeeId: 'director', permissions: [] },
      {
        departmentId: 'kitchen',
        startsAt: '2026-07-20T08:00:00.000Z',
        endsAt: '2026-07-20T10:00:00.000Z',
      },
    );

    expect(result.find((employee) => employee.id === 'cook')).toMatchObject({
      available: true,
      planningAssignment: { id: 'shift-cook' },
    });
    expect(result.find((employee) => employee.id === 'chef')).toMatchObject({
      available: false,
      availabilityLabel: 'Hors planning',
    });
  });

  it('does not propose a collaborator already occupied by another task', async () => {
    prisma.hrEmployee.findMany
      .mockResolvedValueOnce([
        { id: 'director', managerId: null, departmentId: 'management' },
        { id: 'cook', managerId: 'director', departmentId: 'kitchen' },
      ])
      .mockResolvedValueOnce([
        { id: 'cook', managerId: 'director', departmentId: 'kitchen', firstName: 'Lucas', lastName: 'Bernard' },
      ]);
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: 'kitchen' });
    prisma.planningAssignment.findMany.mockResolvedValue([
      { id: 'shift-cook', employeeId: 'cook' },
    ]);
    prisma.operationalTask.findMany.mockResolvedValue([
      { id: 'task-1', assignedEmployeeId: 'cook', title: 'Préparer le dessert' },
    ]);

    const result = await service.assignees(
      'org-1',
      { id: 'director-user', role: 'Manager', employeeId: 'director', permissions: [] },
      {
        departmentId: 'kitchen',
        startsAt: '2026-07-20T18:00:00.000Z',
        endsAt: '2026-07-20T19:00:00.000Z',
      },
    );

    expect(result[0]).toMatchObject({
      available: false,
      availabilityLabel: 'Déjà occupé · Préparer le dessert',
      operationalConflict: { id: 'task-1' },
    });
  });

  it('prevents an employee without reports from creating an unassigned task', async () => {
    prisma.hrEmployee.findMany.mockResolvedValue([
      { id: 'employee', managerId: 'manager', departmentId: 'service' },
    ]);
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: 'service' });

    await expect(
      service.create(
        'org-1',
        { id: 'employee-user', role: 'Utilisateur', employeeId: 'employee', permissions: [] },
        {
          title: 'Préparer la salle',
          category: 'SERVICE' as any,
          departmentId: 'service',
          startsAt: '2026-07-20T08:00:00.000Z',
          endsAt: '2026-07-20T09:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('links a self-assigned task to the matching Planning assignment', async () => {
    prisma.hrEmployee.findMany.mockResolvedValue([
      { id: 'employee', managerId: 'manager', departmentId: 'service' },
    ]);
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: 'service' });
    prisma.hrEmployee.findFirst.mockResolvedValue({ id: 'employee', departmentId: 'service' });
    prisma.planningAssignment.findFirst.mockResolvedValue({ id: 'shift-1' });
    prisma.operationalTask.create.mockImplementation(({ data }) => Promise.resolve(data));

    const task = await service.create(
      'org-1',
      { id: 'employee-user', role: 'Utilisateur', employeeId: 'employee', permissions: [] },
      {
        title: 'Contrôler la salle',
        category: 'SERVICE' as any,
        departmentId: 'service',
        assignedEmployeeId: 'employee',
        startsAt: '2026-07-20T08:00:00.000Z',
        endsAt: '2026-07-20T09:00:00.000Z',
      },
    );

    expect(task).toMatchObject({
      assignedEmployeeId: 'employee',
      planningAssignmentId: 'shift-1',
    });
  });

  it('creates one simple operational task per menu recipe', async () => {
    prisma.hrEmployee.findMany.mockResolvedValue([]);
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: 'kitchen' });
    prisma.menu.findFirst.mockResolvedValue({
      id: 'menu-1',
      name: 'Menu du dîner',
      siteId: null,
      expectedGuests: 24,
      items: [
        {
          position: 1,
          targetReadyQuantity: null,
          portionsOverride: null,
          servingQuantity: 1,
          technicalSheet: {
            id: 'sheet-1',
            name: 'Velouté de potimarron',
            isArchived: false,
            totalTimeMinutes: 45,
            preparationTimeMinutes: 15,
            cookingTimeMinutes: 30,
            referencePortions: 10,
          },
        },
      ],
    });
    prisma.operationalTask.findFirst.mockResolvedValue(null);
    prisma.operationalTask.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await service.generateFromMenu(
      'org-1',
      { id: 'admin-user', role: 'ADMIN', permissions: [] },
      {
        menuId: 'menu-1',
        departmentId: 'kitchen',
        date: '2026-07-20',
        serviceTime: '19:00',
      },
    );

    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({
      title: 'Préparer · Velouté de potimarron',
      category: 'KITCHEN',
      source: 'MENU',
      departmentId: 'kitchen',
      menuId: 'menu-1',
      technicalSheetId: 'sheet-1',
      unitLabel: 'portions',
    });
    expect(String(result.created[0].quantity)).toBe('24');
  });
});

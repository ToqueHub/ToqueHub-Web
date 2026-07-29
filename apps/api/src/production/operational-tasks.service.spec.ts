import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OperationalTasksService } from './operational-tasks.service';

describe('OperationalTasksService', () => {
  const prisma = {
    hrEmployee: { findMany: jest.fn(), findFirst: jest.fn() },
    hrDepartment: { findFirst: jest.fn(), findMany: jest.fn() },
    hrPosition: { findFirst: jest.fn(), findMany: jest.fn() },
    technicalSheet: { findFirst: jest.fn(), findMany: jest.fn() },
    technicalSheetStep: { findFirst: jest.fn(), findMany: jest.fn() },
    productionBatch: { findFirst: jest.fn(), findMany: jest.fn() },
    productionOperation: { findFirst: jest.fn(), update: jest.fn() },
    productionProfile: { findFirst: jest.fn() },
    product: { findMany: jest.fn() },
    unit: { findMany: jest.fn() },
    location: { findMany: jest.fn() },
    site: { findFirst: jest.fn() },
    planningAssignment: { findMany: jest.fn(), findFirst: jest.fn() },
    menu: { findFirst: jest.fn() },
    operationalTask: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    operationalTaskAssignment: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new OperationalTasksService(prisma as any);
  const period = {
    startDate: '2026-07-20T00:00:00.000Z',
    endDate: '2026-07-27T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
  });

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
      {
        id: 'cook-position',
        name: 'Cuisinier',
        taskPresets: null,
        department: { name: 'Cuisine' },
      },
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
        steps: [
          {
            id: 'step-mousse',
            order: 2,
            title: 'Préparer la mousse',
            description: 'Monter la mousse.',
            estimatedMinutes: 35,
          },
        ],
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
    expect(result.presets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ positionId: 'cook-position', requiresTechnicalSheet: true }),
      ]),
    );
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

  it('filters the operational planning by the task or collaborator main site', async () => {
    prisma.hrEmployee.findMany.mockResolvedValue([]);
    prisma.operationalTask.findMany.mockResolvedValue([]);

    await service.list(
      'org-1',
      { id: 'admin-user', role: 'ADMIN', permissions: [] },
      { ...period, siteId: 'site-main' },
    );

    expect(prisma.operationalTask.findMany.mock.calls[0][0].where.OR).toEqual([
      { siteId: 'site-main' },
      { siteId: null, assignedEmployee: { mainSiteId: 'site-main' } },
      { siteId: null, planningAssignment: { siteId: 'site-main' } },
    ]);
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

  it('keeps a scheduled collaborator selectable when another task overlaps', async () => {
    prisma.hrEmployee.findMany
      .mockResolvedValueOnce([
        { id: 'director', managerId: null, departmentId: 'management' },
        { id: 'cook', managerId: 'director', departmentId: 'kitchen' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'cook',
          managerId: 'director',
          departmentId: 'kitchen',
          firstName: 'Lucas',
          lastName: 'Bernard',
        },
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
      available: true,
      availabilityLabel: 'Déjà affecté en parallèle · Préparer le dessert',
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
    let createdTask: any;
    prisma.operationalTask.create.mockImplementation(({ data }) => {
      createdTask = { id: 'task-created', ...data };
      return Promise.resolve(createdTask);
    });
    prisma.operationalTask.findUniqueOrThrow.mockImplementation(() => Promise.resolve(createdTask));

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

  it('splits a complete production recipe into movable step tasks without touching stock', async () => {
    prisma.hrEmployee.findMany.mockResolvedValue([]);
    const source = {
      id: 'task-whole',
      organizationId: 'org-1',
      title: 'Recette complète · Velouté',
      description: null,
      category: 'KITCHEN',
      status: 'TODO',
      source: 'PRODUCTION',
      departmentId: 'kitchen',
      positionId: null,
      siteId: 'site-1',
      assignedEmployeeId: 'chef',
      planningAssignmentId: 'shift-1',
      technicalSheetId: 'sheet-1',
      productionBatchId: 'batch-1',
      productionOperationId: null,
      startsAt: new Date('2026-07-20T07:00:00.000Z'),
      endsAt: new Date('2026-07-20T08:00:00.000Z'),
      quantity: new Prisma.Decimal(40),
      unitLabel: 'portions',
      assignments: [{ employeeId: 'chef' }],
      technicalSheet: { id: 'sheet-1', name: 'Velouté' },
      productionBatch: {
        id: 'batch-1',
        operations: [
          { id: 'op-1', position: 0, title: 'Tailler', activeMinutes: 20, notes: null },
          { id: 'op-2', position: 1, title: 'Mixer', activeMinutes: 15, notes: null },
        ],
      },
    };
    prisma.operationalTask.findFirst.mockResolvedValue(source);
    prisma.technicalSheetStep.findMany.mockResolvedValue([
      { id: 'step-1', order: 1, title: 'Tailler', description: 'Tailler les légumes.' },
      { id: 'step-2', order: 2, title: 'Mixer', description: 'Mixer le velouté.' },
    ]);
    prisma.operationalTask.findMany.mockResolvedValueOnce([]).mockImplementationOnce(async () => [
      { id: 'task-step-1', productionOperationId: 'op-1' },
      { id: 'task-step-2', productionOperationId: 'op-2' },
    ]);
    prisma.operationalTask.create
      .mockImplementationOnce(async ({ data }) => ({ id: 'task-step-1', ...data }))
      .mockImplementationOnce(async ({ data }) => ({ id: 'task-step-2', ...data }));
    prisma.planningAssignment.findFirst.mockResolvedValue({ id: 'shift-1' });

    const result = await service.splitProductionRecipeTask(
      'org-1',
      { id: 'admin-user', role: 'ADMIN', permissions: [] },
      'task-whole',
    );

    expect(prisma.operationalTask.create).toHaveBeenCalledTimes(2);
    expect(prisma.operationalTask.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          technicalSheetStepId: 'step-1',
          productionOperationId: 'op-1',
          productionBatchId: 'batch-1',
          isTimeScheduled: false,
        }),
      }),
    );
    expect(prisma.operationalTask.update).toHaveBeenCalledWith({
      where: { id: 'task-whole' },
      data: { status: 'CANCELLED', completedAt: null },
    });
    expect(result).toHaveLength(2);
  });

  it('builds an immutable execution view and scales ingredients to the linked batch', async () => {
    prisma.hrEmployee.findMany.mockResolvedValue([]);
    const visible = {
      id: 'task-1',
      organizationId: 'org-1',
      departmentId: 'kitchen',
      productionBatchId: 'batch-1',
      productionOperationId: null,
      assignedEmployee: { id: 'cook', firstName: 'Lucas', lastName: 'Bernard' },
    };
    prisma.operationalTask.findFirst.mockResolvedValueOnce(visible).mockResolvedValueOnce({
      ...visible,
      productionBatch: {
        id: 'batch-1',
        reference: 'OP-1-L01',
        status: 'TO_PREPARE',
        plannedQuantity: new Prisma.Decimal(25),
        actualQuantity: null,
        unit: { id: 'portion', name: 'Portion', symbol: 'portions' },
        destinationLocationId: 'cold-room',
        destinationLocation: { id: 'cold-room', name: 'Chambre froide' },
        plannedStartAt: new Date('2026-07-20T08:00:00.000Z'),
        startedAt: null,
        completedAt: null,
        recipeVersion: {
          version: 3,
          referenceYield: new Prisma.Decimal(10),
          snapshot: {
            name: 'Velouté',
            ingredients: [
              { id: 'ingredient-1', productId: 'pumpkin', unitId: 'kg', quantity: '2', order: 0 },
            ],
          },
        },
        operations: [
          { id: 'operation-1', batchId: 'batch-1', position: 0, title: 'Tailler', status: 'READY' },
        ],
        order: {
          technicalSheetId: 'sheet-1',
          siteId: 'site-1',
          outputProductId: 'soup',
          outputVariantId: null,
          technicalSheet: {
            id: 'sheet-1',
            name: 'Velouté',
            description: null,
            referencePortions: new Prisma.Decimal(10),
            ingredients: [],
            steps: [],
          },
          site: { id: 'site-1', name: 'Cuisine' },
          outputProduct: { id: 'soup', name: 'Velouté', unit: { symbol: 'portions' } },
          outputVariant: null,
        },
      },
    });
    prisma.product.findMany.mockResolvedValue([{ id: 'pumpkin', name: 'Potimarron' }]);
    prisma.unit.findMany.mockResolvedValue([{ id: 'kg', name: 'Kilogramme', symbol: 'kg' }]);
    prisma.location.findMany.mockResolvedValue([{ id: 'cold-room', name: 'Chambre froide' }]);
    prisma.productionProfile.findFirst.mockResolvedValue({
      canFreeze: true,
      shelfLifeHours: 72,
      frozenShelfLifeHours: 720,
    });

    const result = await service.execution(
      'org-1',
      { id: 'admin', role: 'ADMIN', permissions: [] },
      'task-1',
    );

    expect(result.recipe).toMatchObject({
      name: 'Velouté',
      version: 3,
      ingredients: [{ name: 'Potimarron', quantity: '5.000', unit: 'kg' }],
    });
    expect(result.completion.allowedConservationStates).toContain('FROZEN');
    expect(result.canExecute).toBe(true);
  });
});

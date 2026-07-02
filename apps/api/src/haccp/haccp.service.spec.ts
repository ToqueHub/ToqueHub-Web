import { HaccpService } from './haccp.service';

const actor = { id: '11111111-1111-1111-1111-111111111111', role: 'Administrateur' };
const orgId = '22222222-2222-2222-2222-222222222222';

function createPrismaMock() {
  return {
    haccpProduct: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    haccpTemperatureEquipment: { findMany: jest.fn() },
    haccpTemperatureReading: { findMany: jest.fn() },
    haccpTraceability: { findMany: jest.fn() },
    haccpReception: { findMany: jest.fn() },
    haccpProductionSession: { findMany: jest.fn() },
    haccpProcessSession: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    haccpOilEquipment: { findMany: jest.fn() },
    haccpOilSession: { findMany: jest.fn() },
    haccpCleaningZone: { findMany: jest.fn() },
    haccpCleaningSession: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    haccpCleaningSurface: { count: jest.fn() },
    haccpCleanedSurface: { count: jest.fn() },
    haccpDailyReport: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  } as any;
}

describe('HaccpService', () => {
  it('filters product lists by organization and serializes mobile _id fields', async () => {
    const prisma = createPrismaMock();
    prisma.haccpProduct.findMany.mockResolvedValue([{ id: 'p1', organizationId: orgId, name: 'Poulet', type: 'Viandes', quantity: '2.500', createdAt: new Date(), updatedAt: new Date() }]);
    const service = new HaccpService(prisma);

    const response = await service.listProducts(orgId, 'Viandes');

    expect(prisma.haccpProduct.findMany).toHaveBeenCalledWith({ where: { organizationId: orgId, isActive: true, deletedAt: null, type: 'Viandes' }, orderBy: { name: 'asc' } });
    expect(response.data[0]).toMatchObject({ _id: 'p1', name: 'Poulet', quantity: 2.5 });
    expect(response.data[0].id).toBeUndefined();
  });

  it('creates HACCP products for the authenticated actor organization', async () => {
    const prisma = createPrismaMock();
    prisma.haccpProduct.create.mockImplementation(async ({ data }: any) => ({ id: 'p2', ...data, createdAt: new Date(), updatedAt: new Date() }));
    const service = new HaccpService(prisma);

    const response = await service.createProduct(orgId, actor, { name: 'Soupe', type: 'Produits frais', quantity: 4, unit: 'L' });

    expect(prisma.haccpProduct.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: orgId, createdById: actor.id, name: 'Soupe' }) });
    expect(response.data).toMatchObject({ _id: 'p2', user: actor.id, unit: 'L' });
  });

  it('reuses an active cleaning session instead of creating a duplicate', async () => {
    const prisma = createPrismaMock();
    prisma.haccpCleaningSession.findFirst.mockResolvedValue({ id: 's1', organizationId: orgId, status: 'active', cleanedSurfaces: [], totalSurfaces: 3, completedSurfaces: 0 });
    const service = new HaccpService(prisma);

    const response = await service.startCleaningSession(orgId, actor);

    expect(prisma.haccpCleaningSession.create).not.toHaveBeenCalled();
    expect(response.data).toMatchObject({ _id: 's1', status: 'active' });
  });

  it('completes process sessions with backend end time, status, and duration', async () => {
    const prisma = createPrismaMock();
    const startTime = new Date(Date.now() - 30 * 60000);
    prisma.haccpProcessSession.findFirst.mockResolvedValue({ id: 'c1', organizationId: orgId, startTime });
    prisma.haccpProcessSession.update.mockImplementation(async ({ data }: any) => ({ id: 'c1', organizationId: orgId, type: 'refroidissement', startTime, ...data, product: { id: 'p1', name: 'Crème', type: 'Produits frais' }, equipment: { id: 'e1', name: 'Cellule', type: 'refroidissement' } }));
    const service = new HaccpService(prisma);

    const response = await service.completeProcessSession(orgId, 'c1', 4);

    expect(prisma.haccpProcessSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' }, data: expect.objectContaining({ endTemperature: 4, status: 'termine' }) }));
    expect(response.data).toMatchObject({ _id: 'c1', status: 'termine', endTemperature: 4 });
    expect(response.data.duration).toBeGreaterThanOrEqual(0);
  });

  it('computes dashboard cards from real daily HACCP controls', async () => {
    const prisma = createPrismaMock();
    const now = new Date();
    prisma.haccpTemperatureEquipment.findMany.mockResolvedValue([{ id: 'fridge-1' }, { id: 'fridge-2' }]);
    prisma.haccpTemperatureReading.findMany.mockResolvedValue([{ id: 'temp-1', equipmentId: 'fridge-1', temperature: '3.5', date: now, equipment: { name: 'Frigo 1' } }]);
    prisma.haccpCleaningZone.findMany.mockResolvedValue([
      { id: 'zone-1', name: 'Cuisine', surfaces: [{ id: 'surface-1', name: 'Plan', frequency: 'daily' }, { id: 'surface-2', name: 'Sols', frequency: 'daily' }] },
    ]);
    prisma.haccpCleaningSession.findMany.mockResolvedValue([{ id: 'clean-1', sessionDate: now, status: 'active', completedSurfaces: 1, totalSurfaces: 2, cleanedSurfaces: [{ surfaceId: 'surface-1' }] }]);
    prisma.haccpTraceability.findMany.mockResolvedValue([]);
    prisma.haccpReception.findMany.mockResolvedValue([]);
    prisma.haccpProductionSession.findMany.mockResolvedValue([{ id: 'prod-1', status: 'en_cours', productionDate: now, finishedProduct: { name: 'Soupe' } }]);
    prisma.haccpProcessSession.findMany
      .mockResolvedValueOnce([{ id: 'process-1', type: 'refroidissement', status: 'en_cours', sessionDate: now, product: { name: 'Crème' }, equipment: { name: 'Cellule' } }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.haccpOilEquipment.findMany.mockResolvedValue([{ id: 'oil-1' }]);
    prisma.haccpOilSession.findMany.mockResolvedValue([]);
    prisma.haccpProduct.findMany.mockResolvedValue([]);
    prisma.haccpDailyReport.findMany.mockResolvedValue([]);
    const service = new HaccpService(prisma);

    const response = await service.dashboard(orgId);
    const modules = Object.fromEntries(response.data.modules.map((module: any) => [module.id, module]));

    expect(modules.temperature).toMatchObject({ completed: 1, expected: 2, issues: 1 });
    expect(modules.cleaning).toMatchObject({ completed: 1, expected: 2, issues: 1 });
    expect(modules.traceability).toMatchObject({ completed: 0, expected: 0, issues: 0, score: 100 });
    expect(modules.receptions).toMatchObject({ completed: 0, expected: 0, issues: 0, score: 100 });
    expect(modules.process).toMatchObject({ completed: 0, expected: 1, issues: 1 });
    expect(modules.oil).toMatchObject({ completed: 0, expected: 1, issues: 1 });
    expect(modules.production).toMatchObject({ completed: 0, expected: 1, issues: 1 });
    expect(response.data.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ module: 'production', severity: 'warning' })]));
  });

  it('generates a daily report from all HACCP modules', async () => {
    const prisma = createPrismaMock();
    prisma.haccpTemperatureReading.findMany.mockResolvedValue([{ id: 't1', temperature: '3.5', date: new Date(), equipment: { name: 'Frigo', type: 'Froid' } }]);
    prisma.haccpTraceability.findMany.mockResolvedValue([]);
    prisma.haccpReception.findMany.mockResolvedValue([{ id: 'r1', quantity: '1', unitPrice: '2', date: new Date() }]);
    prisma.haccpProductionSession.findMany.mockResolvedValue([]);
    prisma.haccpProcessSession.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.haccpOilSession.findMany.mockResolvedValue([]);
    prisma.haccpCleaningSession.findMany.mockResolvedValue([]);
    prisma.haccpDailyReport.upsert.mockImplementation(async ({ create, update }: any) => ({ id: 'report1', ...(create ?? update), createdAt: new Date(), updatedAt: new Date() }));
    prisma.haccpDailyReport.update.mockImplementation(async ({ data }: any) => ({ id: 'report1', organizationId: orgId, reportDate: new Date('2026-06-29T00:00:00.000Z'), modules: {}, summary: { totalActivities: 2 }, ...data, createdAt: new Date(), updatedAt: new Date() }));
    const service = new HaccpService(prisma);

    const response = await service.generateDailyReport(orgId, actor, new Date('2026-06-29T10:00:00.000Z'));

    expect(prisma.haccpDailyReport.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId_reportDate: expect.objectContaining({ organizationId: orgId }) } }));
    expect(prisma.haccpDailyReport.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'report1' }, data: expect.objectContaining({ status: 'completed', pdfPath: expect.stringContaining('rapport-haccp-2026-06-29') }) }));
    expect(response.data.summary.totalActivities).toBe(2);
    expect(response.data.fileSize).toBeGreaterThan(0);
  });
});

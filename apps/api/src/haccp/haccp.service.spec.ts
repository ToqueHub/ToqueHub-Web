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
    haccpTemperatureReading: { findMany: jest.fn() },
    haccpTraceability: { findMany: jest.fn() },
    haccpReception: { findMany: jest.fn() },
    haccpProductionSession: { findMany: jest.fn() },
    haccpProcessSession: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    haccpOilSession: { findMany: jest.fn() },
    haccpCleaningSession: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    haccpCleaningSurface: { count: jest.fn() },
    haccpCleanedSurface: { count: jest.fn() },
    haccpDailyReport: {
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

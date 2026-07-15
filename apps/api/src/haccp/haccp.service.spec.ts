import { HaccpService } from './haccp.service';
import { readFileSync } from 'node:fs';

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
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    organization: {
      findMany: jest.fn(),
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
    let storedReport: any;
    prisma.haccpTemperatureEquipment.findMany.mockResolvedValue([{ id: 'frigo-1' }]);
    prisma.haccpTemperatureReading.findMany.mockResolvedValue([{ id: 't1', equipmentId: 'frigo-1', temperature: '3.5', date: new Date(), equipment: { name: 'Frigo', type: 'Froid' } }]);
    prisma.haccpCleaningZone.findMany.mockResolvedValue([]);
    prisma.haccpCleaningSession.findMany.mockResolvedValue([]);
    prisma.haccpTraceability.findMany.mockResolvedValue([]);
    prisma.haccpReception.findMany.mockResolvedValue([{ id: 'r1', supplier: 'Primeur', productName: 'Tomates', temperature: '4', quantity: '1', unitPrice: '2', date: new Date() }]);
    prisma.haccpProductionSession.findMany.mockResolvedValue([]);
    prisma.haccpProcessSession.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.haccpOilEquipment.findMany.mockResolvedValue([]);
    prisma.haccpOilSession.findMany.mockResolvedValue([]);
    prisma.haccpDailyReport.upsert.mockImplementation(async ({ create, update }: any) => {
      storedReport = { id: 'report1', ...(create ?? update), organizationId: orgId, reportDate: new Date('2026-06-29T00:00:00.000Z'), createdAt: new Date(), updatedAt: new Date() };
      return storedReport;
    });
    prisma.haccpDailyReport.update.mockImplementation(async ({ data }: any) => ({ ...storedReport, ...data, updatedAt: new Date() }));
    const service = new HaccpService(prisma);

    const response = await service.generateDailyReport(orgId, actor, new Date('2026-06-29T10:00:00.000Z'));

    expect(prisma.haccpDailyReport.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId_reportDate: expect.objectContaining({ organizationId: orgId }) } }));
    expect(prisma.haccpDailyReport.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'report1' }, data: expect.objectContaining({ status: 'completed', pdfPath: expect.stringContaining('rapport-haccp-2026-06-29') }) }));
    expect(response.data.summary.totalActivities).toBe(2);
    expect(response.data.summary.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'temperature', label: 'Températures', completed: 1, expected: 1, statusLabel: 'Conforme' }),
      expect.objectContaining({ id: 'cleaning', completed: 0, expected: 0, statusLabel: 'Aucun prévu' }),
    ]));
    expect(response.data.fileSize).toBeGreaterThan(0);
    const pdf = readFileSync(response.data.pdfPath, 'latin1');
    expect(pdf).toContain('Temperatures: Releves : 1/1 - 100% - Conforme');
    expect(pdf).toContain('Nettoyage: Releves : 0/0 - - - Aucun prevu');
  });

  it('skips PDF generation when no daily HACCP data exists', async () => {
    const prisma = createPrismaMock();
    prisma.haccpTemperatureEquipment.findMany.mockResolvedValue([{ id: 'frigo-1' }]);
    prisma.haccpTemperatureReading.findMany.mockResolvedValue([]);
    prisma.haccpCleaningZone.findMany.mockResolvedValue([]);
    prisma.haccpCleaningSession.findMany.mockResolvedValue([]);
    prisma.haccpTraceability.findMany.mockResolvedValue([]);
    prisma.haccpReception.findMany.mockResolvedValue([]);
    prisma.haccpProductionSession.findMany.mockResolvedValue([]);
    prisma.haccpProcessSession.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.haccpOilEquipment.findMany.mockResolvedValue([]);
    prisma.haccpOilSession.findMany.mockResolvedValue([]);
    const service = new HaccpService(prisma);

    const response = await service.generateDailyReport(orgId, actor, new Date('2026-06-30T12:00:00.000Z'));
    const modules = Object.fromEntries(response.data.summary.modules.map((module: any) => [module.id, module]));

    expect(response.data).toMatchObject({ skipped: true, pdfPath: null, fileSize: 0, status: 'skipped' });
    expect(modules.temperature).toMatchObject({ completed: 0, expected: 1, score: 0, statusLabel: 'Critique' });
    expect(modules.cleaning).toMatchObject({ completed: 0, expected: 0, statusLabel: 'Aucun prévu' });
    expect(response.data.summary.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ module: 'temperature', severity: 'critical' })]));
    expect(prisma.haccpDailyReport.upsert).not.toHaveBeenCalled();
    expect(prisma.haccpDailyReport.update).not.toHaveBeenCalled();
  });

  it('automatically generates yesterday PDF at midnight and skips duplicate closure', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-30T22:03:00.000Z'));
    try {
      const prisma = createPrismaMock();
      let storedReport: any;
      prisma.organization.findMany.mockResolvedValue([{ id: orgId, name: 'Cuisine centrale' }]);
      prisma.haccpDailyReport.findUnique.mockResolvedValue(null);
      prisma.haccpTemperatureEquipment.findMany.mockResolvedValue([{ id: 'frigo-1' }]);
      prisma.haccpTemperatureReading.findMany.mockResolvedValue([{ id: 'temp-1', equipmentId: 'frigo-1', temperature: '3.2', date: new Date('2026-06-30T10:00:00.000Z'), equipment: { name: 'Frigo 1' } }]);
      prisma.haccpCleaningZone.findMany.mockResolvedValue([]);
      prisma.haccpCleaningSession.findMany.mockResolvedValue([]);
      prisma.haccpTraceability.findMany.mockResolvedValue([]);
      prisma.haccpReception.findMany.mockResolvedValue([]);
      prisma.haccpProductionSession.findMany.mockResolvedValue([]);
      prisma.haccpProcessSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.haccpOilEquipment.findMany.mockResolvedValue([]);
      prisma.haccpOilSession.findMany.mockResolvedValue([]);
      prisma.haccpDailyReport.upsert.mockImplementation(async ({ create, update }: any) => {
        storedReport = { id: 'auto-report', ...(create ?? update), organizationId: orgId, createdAt: new Date(), updatedAt: new Date() };
        return storedReport;
      });
      prisma.haccpDailyReport.update.mockImplementation(async ({ data }: any) => ({ ...storedReport, ...data, updatedAt: new Date() }));
      const service = new HaccpService(prisma);

      await (service as any).runAutomaticDailyClosure();
      prisma.haccpDailyReport.findUnique.mockResolvedValue({ id: 'auto-report', organizationId: orgId, reportDate: new Date('2026-06-30T00:00:00.000Z'), generatedAt: new Date('2026-07-01T00:03:00.000Z') });
      await (service as any).runAutomaticDailyClosure();

      expect(prisma.haccpDailyReport.upsert).toHaveBeenCalledTimes(1);
      const upsertArg = prisma.haccpDailyReport.upsert.mock.calls[0][0];
      expect(upsertArg.where.organizationId_reportDate.organizationId).toBe(orgId);
      expect(upsertArg.where.organizationId_reportDate.reportDate.getFullYear()).toBe(2026);
      expect(upsertArg.where.organizationId_reportDate.reportDate.getMonth()).toBe(5);
      expect(upsertArg.where.organizationId_reportDate.reportDate.getDate()).toBe(30);
      expect(prisma.haccpDailyReport.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'auto-report' }, data: expect.objectContaining({ pdfPath: expect.stringContaining('rapport-haccp-2026-06-30') }) }));
    } finally {
      jest.useRealTimers();
    }
  });
});

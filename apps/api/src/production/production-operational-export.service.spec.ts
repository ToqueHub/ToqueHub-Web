import { PDFDocument } from 'pdf-lib';
import { ProductionOperationalExportService } from './production-operational-export.service';

describe('ProductionOperationalExportService', () => {
  it('builds an A4 landscape PDF for one selected service', async () => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Restaurant Démo' }),
      },
      hrDepartment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'service-1', name: 'Cuisine' }),
      },
      site: {
        findFirst: jest.fn().mockResolvedValue({ id: 'site-1', name: 'Site principal' }),
      },
    };
    const operationalTasks = {
      list: jest.fn().mockResolvedValue([
        {
          id: 'task-1',
          title: 'Façonner les croissants',
          source: 'PRODUCTION',
          status: 'TODO',
          startsAt: '2026-07-28T06:00:00.000Z',
          endsAt: '2026-07-28T06:45:00.000Z',
          quantity: 40,
          unitLabel: 'portions',
          site: { id: 'site-1', name: 'Site principal' },
          technicalSheet: { id: 'sheet-1', name: 'Croissants' },
          productionBatch: { id: 'batch-1', reference: 'CP-2026-00001-L01' },
          productionOperation: { id: 'operation-1', title: 'Façonnage' },
          assignments: [
            {
              employee: {
                id: 'employee-1',
                firstName: 'Alice',
                lastName: 'Martin',
              },
            },
          ],
        },
      ]),
    };
    const service = new ProductionOperationalExportService(
      prisma as never,
      operationalTasks as never,
    );

    const result = await service.exportDayPdf(
      'org-1',
      { id: 'user-1', role: 'Chef', permissions: ['production.read'] },
      {
        date: '2026-07-28',
        serviceId: 'service-1',
        siteId: 'site-1',
      },
    );

    expect(operationalTasks.list).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      expect.objectContaining({
        departmentId: 'service-1',
        siteId: 'site-1',
      }),
    );
    expect(result.filename).toContain('planning-production-2026-07-28-cuisine-site-principal.pdf');
    expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(result.buffer);
    const [page] = pdf.getPages();
    expect(page.getWidth()).toBeGreaterThan(page.getHeight());
  });
});

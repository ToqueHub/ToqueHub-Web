import { CatererEventLifecycleService } from './caterer-event-lifecycle.service';

describe('CatererEventLifecycleService', () => {
  it('completes a confirmed event only after production and retained logistics are complete', async () => {
    const event = {
      id: 'event-1',
      status: 'CONFIRMED',
      prestations: [
        {
          menu: {
            items: [{ id: 'item-1', technicalSheetId: 'sheet-1' }],
            productionLinks: [
              {
                snapshot: { lines: [{ menuItemId: 'item-1' }] },
                productionOrder: { id: 'order-1', status: 'COMPLETED' },
              },
            ],
          },
        },
      ],
    };
    const prisma = {
      catererEvent: {
        findFirst: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue({ ...event, status: 'COMPLETED' }),
      },
      operationalTask: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ status: 'TODO' }])
          .mockResolvedValueOnce([{ status: 'COMPLETED' }, { status: 'CANCELLED' }]),
      },
    };
    const service = new CatererEventLifecycleService(prisma as any);

    await service.evaluateEvent('org-1', 'event-1');
    expect(prisma.catererEvent.update).not.toHaveBeenCalled();

    await service.evaluateEvent('org-1', 'event-1');
    expect(prisma.catererEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { status: 'COMPLETED' },
    });
  });
});

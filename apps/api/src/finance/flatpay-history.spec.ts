import {
  applyFlatpayHistoryObservations,
  capFlatpayHistoryRangeCount,
  completeFlatpayHistoryAtPortalBoundary,
  createFlatpayHistoryDiscovery,
  discardUnconfirmedFlatpayOrderKeys,
  planFlatpayHistoryRanges,
} from './flatpay-history';

describe('FlatPay automatic history discovery', () => {
  it('starts immediately before the oldest already generated Orders report', () => {
    expect(
      createFlatpayHistoryDiscovery(
        ['orders:2026-08-29:2026-08-29', 'orders:2026-08-25:2026-08-25'],
        '2026-08-29',
      ),
    ).toMatchObject({ nextTo: '2026-08-24', complete: false });
  });

  it('plans weekly ranges from the most recent to the oldest', () => {
    const discovery = createFlatpayHistoryDiscovery([], '2026-08-21');
    expect(planFlatpayHistoryRanges(discovery, 3)).toEqual([
      { from: '2026-08-15', to: '2026-08-21' },
      { from: '2026-08-08', to: '2026-08-14' },
      { from: '2026-08-01', to: '2026-08-07' },
    ]);
  });

  it('limits one scan to the remaining 62-day empty-activity horizon', () => {
    const discovery = createFlatpayHistoryDiscovery([], '2026-08-21');
    expect(capFlatpayHistoryRangeCount(discovery, 100)).toBe(9);
    expect(capFlatpayHistoryRangeCount({ ...discovery, consecutiveEmptyDays: 20 }, 100)).toBe(6);
  });

  it('forgets generated Orders ranges that were never downloaded and observed', () => {
    expect(
      discardUnconfirmedFlatpayOrderKeys(
        [
          'orders:2026-03-03:2026-03-09',
          'orders:2026-02-24:2026-03-02',
          'orders:2026-02-17:2026-02-23',
          'sales-overview:2026-02-24:2026-03-02',
        ],
        '2026-03-02',
      ),
    ).toEqual(['orders:2026-03-03:2026-03-09', 'sales-overview:2026-02-24:2026-03-02']);
  });

  it('resets the empty counter when either Orders or Sales Overview contains activity', () => {
    const discovery = {
      ...createFlatpayHistoryDiscovery([], '2026-08-21'),
      consecutiveEmptyDays: 14,
    };
    const next = applyFlatpayHistoryObservations(discovery, [
      {
        range: { from: '2026-08-15', to: '2026-08-21' },
        revenueRows: 0,
        productRows: 4,
      },
    ]);
    expect(next).toMatchObject({ nextTo: '2026-08-14', consecutiveEmptyDays: 0 });
  });

  it('stops after 62 consecutive days without activity', () => {
    const discovery = createFlatpayHistoryDiscovery([], '2026-08-21');
    const observations = planFlatpayHistoryRanges(discovery, 9).map((range) => ({
      range,
      revenueRows: 0,
      productRows: 0,
    }));
    const next = applyFlatpayHistoryObservations(discovery, observations);
    expect(next).toMatchObject({
      complete: true,
      completionReason: 'EMPTY_ACTIVITY',
      consecutiveEmptyDays: 63,
    });
  });

  it('records the provider calendar boundary as a normal end of history', () => {
    const discovery = createFlatpayHistoryDiscovery([], '2026-08-21');
    expect(completeFlatpayHistoryAtPortalBoundary(discovery, '2026-05-24')).toMatchObject({
      complete: true,
      completionReason: 'PORTAL_BOUNDARY',
      portalBoundary: '2026-05-24',
    });
  });
});

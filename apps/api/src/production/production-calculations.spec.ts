import {
  calculateNetRequirement,
  calculatePackagingCapacity,
  detectRecipeCycle,
  generateProductionScenarios,
  selectFefoLots,
} from './production-calculations';

describe('production calculations', () => {
  it('proposes a full 30-portion tank for a 20-portion net requirement', () => {
    const [recommended] = generateProductionScenarios({
      grossRequirement: '25',
      usableStock: '5',
      rules: { mode: 'FIXED', referenceYield: '30' },
    });
    expect(recommended).toMatchObject({
      quantity: '30.000',
      coveredQuantity: '20.000',
      surplusQuantity: '10.000',
      batches: ['30.000'],
    });
  });

  it('distinguishes a small shortage from the feasible production quantity', () => {
    const [recommended] = generateProductionScenarios({
      grossRequirement: '18',
      usableStock: '14',
      rules: { mode: 'FIXED', referenceYield: '12', allowHalfBatch: false },
    });
    expect(calculateNetRequirement('18', '14')).toBe('4.000');
    expect(recommended.quantity).toBe('12.000');
    expect(recommended.surplusQuantity).toBe('8.000');
  });

  it('plans a missing sub-recipe in its real 12-unit batch', () => {
    const [recommended] = generateProductionScenarios({
      grossRequirement: '10',
      usableStock: '7',
      rules: { mode: 'FIXED', referenceYield: '12' },
    });
    expect(recommended).toMatchObject({ quantity: '12.000', surplusQuantity: '9.000' });
  });

  it('finds the limiting macaron variant for standard boxes', () => {
    const capacity = calculatePackagingCapacity([
      { componentId: 'chocolat', availableQuantity: '32', requiredPerPackage: '2' },
      { componentId: 'framboise', availableQuantity: '23', requiredPerPackage: '2' },
      { componentId: 'citron', availableQuantity: '17', requiredPerPackage: '1' },
    ]);
    expect(capacity.maximumPackages).toBe('11.000');
    expect(capacity.limitingComponentId).toBe('framboise');
  });

  it('subtracts reservations from physical stock', () => {
    const selection = selectFefoLots(
      [{ id: 'biscuits', quantity: '20', reservedQuantity: '12' }],
      '20',
      '2026-07-20T12:00:00.000Z',
    );
    expect(selection.allocatedQuantity).toBe('8.000');
    expect(selection.shortageQuantity).toBe('12.000');
  });

  it('does not use frozen stock that cannot thaw before the need', () => {
    const selection = selectFefoLots(
      [
        {
          id: 'frozen',
          quantity: '20',
          state: 'FROZEN',
          availableAt: '2026-07-20T20:00:00.000Z',
        },
      ],
      '8',
      '2026-07-20T12:00:00.000Z',
    );
    expect(selection.allocatedQuantity).toBe('0.000');
    expect(selection.shortageQuantity).toBe('8.000');
  });

  it('splits a menu requirement into authorized batches only', () => {
    const [recommended] = generateProductionScenarios({
      grossRequirement: '250',
      usableStock: '0',
      rules: { mode: 'FORMATS', referenceYield: '100', allowedFormats: ['100'] },
    });
    expect(recommended.quantity).toBe('300.000');
    expect(recommended.batches).toEqual(['100.000', '100.000', '100.000']);
    expect(recommended.batches).not.toContain('50.000');
  });

  it('surfaces insufficient storage for surplus', () => {
    const [recommended] = generateProductionScenarios({
      grossRequirement: '18',
      usableStock: '0',
      storageCapacity: '10',
      rules: { mode: 'FIXED', referenceYield: '36' },
    });
    expect(recommended.surplusQuantity).toBe('18.000');
    expect(recommended.storageShortage).toBe('8.000');
    expect(recommended.warnings).toContain('INSUFFICIENT_STORAGE');
  });

  it('uses FEFO and can allocate several lots', () => {
    const selection = selectFefoLots(
      [
        { id: 'later', quantity: '5', expiresAt: '2026-07-30T00:00:00.000Z' },
        { id: 'first', quantity: '3', expiresAt: '2026-07-22T00:00:00.000Z' },
      ],
      '8',
      '2026-07-20T00:00:00.000Z',
    );
    expect(selection.allocations).toEqual([
      { lotId: 'first', quantity: '3.000' },
      { lotId: 'later', quantity: '5.000' },
    ]);
  });

  it('isolates stock by site', () => {
    const selection = selectFefoLots(
      [
        { id: 'remote', quantity: '10', siteId: 'site-b' },
        { id: 'local', quantity: '4', siteId: 'site-a' },
      ],
      '8',
      '2026-07-20T00:00:00.000Z',
      'site-a',
    );
    expect(selection.allocations).toEqual([{ lotId: 'local', quantity: '4.000' }]);
    expect(selection.shortageQuantity).toBe('4.000');
  });

  it('reports a complete circular dependency path', () => {
    expect(detectRecipeCycle({ A: ['B'], B: ['C'], C: ['A'] })).toEqual(['A', 'B', 'C', 'A']);
    expect(detectRecipeCycle({ A: ['B'], B: [], C: ['A'] })).toBeNull();
  });
});

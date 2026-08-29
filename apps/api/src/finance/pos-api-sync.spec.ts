import { FinanceProvider } from '@prisma/client';
import { earliestZettlePurchaseDate, resolvePosSyncEnd } from './pos-api-sync.service';

describe('POS API sync period', () => {
  const now = new Date('2026-08-29T08:15:00.000Z');

  it('does not send a future endDate to PayPal POS/Zettle', () => {
    expect(resolvePosSyncEnd(FinanceProvider.PAYPAL_POS, now, now)).toEqual(now);
  });

  it('keeps the requested completed day for PayPal POS/Zettle', () => {
    expect(
      resolvePosSyncEnd(FinanceProvider.PAYPAL_POS, new Date('2026-08-28T00:00:00.000Z'), now),
    ).toEqual(new Date('2026-08-28T23:59:59.999Z'));
  });

  it('preserves the existing end-of-day behavior for Loyverse', () => {
    expect(resolvePosSyncEnd(FinanceProvider.LOYVERSE, now, now)).toEqual(
      new Date('2026-08-29T23:59:59.999Z'),
    );
  });

  it('uses a safe three-calendar-year boundary for Zettle history', () => {
    expect(earliestZettlePurchaseDate(now)).toEqual(new Date('2023-08-30T00:00:00.000Z'));
  });
});

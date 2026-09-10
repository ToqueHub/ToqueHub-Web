import {
  flatpayOrdersQueryDates,
  isRecoverableFlatpayBrowserError,
  shouldUseHeadedFlatpayBrowser,
} from './flatpay-portal';

describe('FlatPay portal automation', () => {
  it('converts Helsinki summer day boundaries to UTC instants', () => {
    expect(
      flatpayOrdersQueryDates({ from: '2026-09-09', to: '2026-09-09' }, 'Europe/Helsinki'),
    ).toEqual({
      fromDate: '2026-09-08T21:00:00.000Z',
      toDate: '2026-09-09T20:59:59.000Z',
    });
  });

  it('converts Helsinki winter day boundaries with the winter offset', () => {
    expect(
      flatpayOrdersQueryDates({ from: '2026-01-15', to: '2026-01-15' }, 'Europe/Helsinki'),
    ).toEqual({
      fromDate: '2026-01-14T22:00:00.000Z',
      toDate: '2026-01-15T21:59:59.000Z',
    });
  });

  it('uses each organization timezone instead of a Helsinki constant', () => {
    expect(
      flatpayOrdersQueryDates({ from: '2026-09-09', to: '2026-09-09' }, 'America/New_York'),
    ).toEqual({
      fromDate: '2026-09-09T04:00:00.000Z',
      toDate: '2026-09-10T03:59:59.000Z',
    });
  });

  it('only classifies browser/profile failures as recoverable', () => {
    expect(
      isRecoverableFlatpayBrowserError(
        new Error('page.goto: Target page, context or browser has been closed'),
      ),
    ).toBe(true);
    expect(isRecoverableFlatpayBrowserError(new Error('Le rapport Orders est indisponible.'))).toBe(
      false,
    );
  });

  it('keeps automatic reconnects and diagnostics headless in the API container', () => {
    expect(
      shouldUseHeadedFlatpayBrowser({
        command: 'setup',
        automaticSetup: true,
        headedRequested: false,
      }),
    ).toBe(false);
    expect(
      shouldUseHeadedFlatpayBrowser({
        command: 'diagnose',
        automaticSetup: false,
        headedRequested: false,
      }),
    ).toBe(false);
  });

  it('keeps manual setup visible and honors an explicit headed request', () => {
    expect(
      shouldUseHeadedFlatpayBrowser({
        command: 'setup',
        automaticSetup: false,
        headedRequested: false,
      }),
    ).toBe(true);
    expect(
      shouldUseHeadedFlatpayBrowser({
        command: 'run',
        automaticSetup: false,
        headedRequested: true,
      }),
    ).toBe(true);
  });
});

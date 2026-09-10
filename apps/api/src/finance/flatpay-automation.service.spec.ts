import {
  FlatpayAutomationService,
  flatpayAutomationExitUpdate,
  latestFlatpayScheduledOccurrence,
  resolveFlatpayAutomationCommand,
  resolveFlatpayAutomationEnvironment,
  resolveFlatpayAutomationInbox,
  shouldStartFlatpayScheduledSync,
} from './flatpay-automation.service';

describe('FlatPay automation runtime', () => {
  const projectDirectory = '/srv/toquehub';

  it('uses the compiled automation shipped in production images', () => {
    const command = resolveFlatpayAutomationCommand(projectDirectory, (path) =>
      path.endsWith('/dist-automation/scripts/sync-flatpay-portal.js'),
    );

    expect(command).toEqual({
      script: '/srv/toquehub/apps/api/dist-automation/scripts/sync-flatpay-portal.js',
      nodeArgs: [],
    });
  });

  it('keeps the TypeScript source command available for local development', () => {
    const command = resolveFlatpayAutomationCommand(
      projectDirectory,
      (path) =>
        path.endsWith('/apps/api/scripts/sync-flatpay-portal.ts') ||
        path.endsWith('/node_modules/tsx/dist/loader.mjs'),
    );

    expect(command).toEqual({
      script: '/srv/toquehub/apps/api/scripts/sync-flatpay-portal.ts',
      nodeArgs: ['--import', '/srv/toquehub/node_modules/tsx/dist/loader.mjs'],
    });
  });

  it('reports an explicit installation error when no runtime is available', () => {
    expect(() => resolveFlatpayAutomationCommand(projectDirectory, () => false)).toThrow(
      'Le moteur de synchronisation FlatPay est absent de cette installation ToqueHub.',
    );
  });

  it('uses the persistent configured reports volume for every connection', () => {
    expect(
      resolveFlatpayAutomationInbox(
        'connection-1',
        '/home/node/Documents/ToqueHub/Finance/FlatPay/connection-1',
        '/app/data/flatpay/reports',
      ),
    ).toBe('/app/data/flatpay/reports/connection-1');
  });

  it('keeps an existing local inbox when no persistent root is configured', () => {
    expect(resolveFlatpayAutomationInbox('connection-1', '/tmp/flatpay', '')).toBe('/tmp/flatpay');
  });

  it('ignores documentation placeholder paths in a deployed environment', () => {
    expect(
      resolveFlatpayAutomationInbox(
        'connection-1',
        '/tmp/flatpay',
        '/absolute/path/to/flatpay/reports',
      ),
    ).toBe('/tmp/flatpay');
  });

  it('isolates state and applies the organization timezone to the worker', () => {
    expect(
      resolveFlatpayAutomationEnvironment(
        'connection-1',
        '/data/reports/connection-1',
        {
          FLATPAY_BROWSER_PROFILE_DIR: '/data/browser-profile',
          FLATPAY_AUTOMATION_STATE_PATH: '/data/state',
          TZ: 'Europe/Paris',
        },
        '/runtime',
        'Europe/Helsinki',
      ),
    ).toMatchObject({
      FLATPAY_REPORTS_INBOX: '/data/reports/connection-1',
      FLATPAY_BROWSER_PROFILE_DIR: '/data/browser-profile',
      FLATPAY_AUTOMATION_STATE_PATH: '/data/state/connection-1.json',
      FLATPAY_TIME_ZONE: 'Europe/Helsinki',
      TZ: 'Europe/Helsinki',
    });
  });

  it('resolves the latest scheduled passage in the finance timezone', () => {
    const dueAt = latestFlatpayScheduledOccurrence(
      ['07:00', '15:00', '19:00', '23:00'],
      new Date('2026-09-08T12:30:00.000Z'),
      'Europe/Helsinki',
    );

    expect(dueAt?.toISOString()).toBe('2026-09-08T12:00:00.000Z');
  });

  it('uses the previous local day before the first passage', () => {
    const dueAt = latestFlatpayScheduledOccurrence(
      ['07:00', '23:00'],
      new Date('2026-09-08T01:00:00.000Z'),
      'Europe/Helsinki',
    );

    expect(dueAt?.toISOString()).toBe('2026-09-07T20:00:00.000Z');
  });

  it('does not retry a scheduled occurrence before the backoff', () => {
    const dueAt = new Date('2026-09-08T12:00:00.000Z');
    expect(
      shouldStartFlatpayScheduledSync({
        dueAt,
        lastSyncedAt: new Date('2026-09-08T04:00:00.000Z'),
        lastAttemptAt: new Date('2026-09-08T12:00:01.000Z'),
        now: new Date('2026-09-08T12:10:00.000Z'),
      }),
    ).toBe(false);
    expect(
      shouldStartFlatpayScheduledSync({
        dueAt: new Date('2026-09-08T16:00:00.000Z'),
        lastSyncedAt: new Date('2026-09-08T04:00:00.000Z'),
        lastAttemptAt: new Date('2026-09-08T12:00:01.000Z'),
        now: new Date('2026-09-08T16:00:01.000Z'),
      }),
    ).toBe(true);
  });

  it('retries a failed scheduled synchronization after the backoff', () => {
    expect(
      shouldStartFlatpayScheduledSync({
        dueAt: new Date('2026-09-10T04:00:00.000Z'),
        lastSyncedAt: new Date('2026-09-09T16:00:00.000Z'),
        lastAttemptAt: new Date('2026-09-10T04:00:10.000Z'),
        now: new Date('2026-09-10T04:15:10.000Z'),
      }),
    ).toBe(true);
  });

  it('does not expose Chromium infrastructure noise as the synchronization error', () => {
    expect(
      flatpayAutomationExitUpdate(
        1,
        '[pid=12][err] ERROR:dbus/bus.cc failed\nLe rapport Orders est indisponible.\n',
      ),
    ).toEqual({ lastError: 'Le rapport Orders est indisponible.' });
  });

  it('starts an immediate synchronization only when explicitly requested', async () => {
    const policy = { assertPermission: jest.fn() };
    const service = new FlatpayAutomationService({} as never, policy as never);
    jest
      .spyOn(
        service as unknown as {
          startSync: () => Promise<'started' | 'already-running' | 'not-installed' | 'unavailable'>;
        },
        'startSync',
      )
      .mockResolvedValue('started');

    await expect(service.syncNow('organization-1', {} as never, 'site-1')).resolves.toMatchObject({
      started: true,
      alreadyRunning: false,
    });
    expect(policy.assertPermission).toHaveBeenCalledWith({}, 'finance.manage');
  });

  it('reports an already running immediate synchronization without starting a duplicate', async () => {
    const service = new FlatpayAutomationService(
      {} as never,
      { assertPermission: jest.fn() } as never,
    );
    jest
      .spyOn(
        service as unknown as {
          startSync: () => Promise<'started' | 'already-running' | 'not-installed' | 'unavailable'>;
        },
        'startSync',
      )
      .mockResolvedValue('already-running');

    await expect(service.syncNow('organization-1', {} as never, 'site-1')).resolves.toMatchObject({
      started: true,
      alreadyRunning: true,
    });
  });
});

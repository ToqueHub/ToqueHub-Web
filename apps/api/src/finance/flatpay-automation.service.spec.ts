import {
  resolveFlatpayAutomationCommand,
  resolveFlatpayAutomationInbox,
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
});

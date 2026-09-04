import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { OrganizationApiKeySecretService } from './organization-api-key-secret.service';

describe('OrganizationApiKeySecretService', () => {
  it('encrypts Resend at rest, keeps only a mask public and invalidates verification', async () => {
    let organizationRecord = {
      resendApiKey: null as string | null,
      resendApiKeyEncrypted: null as string | null,
      resendApiKeyMask: null as string | null,
      resendApiKeyUpdatedAt: null as Date | null,
    };
    const tx = {
      organization: {
        update: jest.fn().mockImplementation(({ data }) => {
          organizationRecord = {
            resendApiKey: data.resendApiKey,
            resendApiKeyEncrypted: data.resendApiKeyEncrypted,
            resendApiKeyMask: data.resendApiKeyMask,
            resendApiKeyUpdatedAt: data.resendApiKeyUpdatedAt,
          };
          return Promise.resolve(organizationRecord);
        }),
      },
      purchasingSettings: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      organization: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(organizationRecord)),
      },
    };
    const config = { get: jest.fn().mockReturnValue('dedicated-server-key-with-at-least-32-characters') };
    const secrets = new OrganizationApiKeySecretService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
    const raw = 're_abcdefghijklmnopqrstuvwxyz123456';

    const stored = await secrets.setResendSecret('org-1', raw);
    expect(stored.resendApiKey).toBeNull();
    expect(stored.resendApiKeyEncrypted).toMatch(/^v1:/);
    expect(stored.resendApiKeyEncrypted).not.toContain(raw);
    expect(secrets.publicSummary(stored)).toEqual(
      expect.objectContaining({ configured: true, masked: 're_a••••3456' }),
    );
    expect(await secrets.getResendSecret('org-1')).toBe(raw);
    expect(tx.purchasingSettings.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      data: { resendVerifiedAt: null, resendLastTestEmailId: null },
    });
  });

  it('reads a legacy plaintext value without deleting it when the server key is absent', async () => {
    const updateMany = jest.fn();
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          resendApiKey: 're_legacy-secret',
          resendApiKeyEncrypted: null,
          resendApiKeyMask: null,
          resendApiKeyUpdatedAt: null,
        }),
        updateMany,
      },
    };
    const secrets = new OrganizationApiKeySecretService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    );

    expect(await secrets.getResendSecret('org-1')).toBe('re_legacy-secret');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a public installation placeholder when saving a Resend key', async () => {
    const secrets = new OrganizationApiKeySecretService(
      { $transaction: jest.fn() } as unknown as PrismaService,
      {
        get: jest.fn().mockReturnValue('replace-with-a-dedicated-random-secret'),
      } as unknown as ConfigService,
    );

    await expect(secrets.setResendSecret('org-1', 're_secret')).rejects.toThrow(
      'PURCHASING_RESEND_ENCRYPTION_KEY',
    );
  });
});

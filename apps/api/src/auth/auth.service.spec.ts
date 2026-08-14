import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

function createService(prisma: any) {
  return new AuthService(
    prisma,
    { signAsync: jest.fn().mockResolvedValue('token') } as any,
    { get: jest.fn((_key: string, fallback?: string) => fallback) } as any,
    {
      publicSummary: jest.fn().mockReturnValue({ configured: false, masked: null, updatedAt: null }),
      setResendSecret: jest.fn(),
    } as any,
  );
}

describe('AuthService workspace onboarding', () => {
  it('creates the guided-tour progress with the first environment owner', async () => {
    const organization = {
      id: 'org-1',
      name: 'La Brigade',
      establishmentType: 'Restaurant',
      hrCountryCode: 'FR',
      regulatoryCountryCode: 'FR',
      regulatoryCountrySelectedAt: new Date(),
      regulatoryCountrySelectedById: null,
      teamSize: '1-5',
      logoDataUrl: null,
      mainSiteName: 'La Brigade',
      primarySiteId: 'site-1',
      stocksInstalledAt: null,
      rnmPricesInstalledAt: null,
      hrInstalledAt: null,
      planningInstalledAt: null,
      technicalSheetsInstalledAt: null,
      productionInstalledAt: null,
      menusInstalledAt: null,
      clientsInstalledAt: null,
      haccpInstalledAt: null,
      purchasingInstalledAt: null,
    };
    const createdUser = {
      id: 'user-1',
      username: 'admin',
      email: 'admin@toquehub.local',
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationId: organization.id,
      isPrimaryAdmin: true,
      role: { name: 'SUPER_ADMIN', permissions: [] },
      organization,
    };
    const tx: any = {
      role: { upsert: jest.fn().mockResolvedValue({ id: 'role-1' }) },
      organization: {
        create: jest.fn().mockResolvedValue(organization),
        update: jest.fn().mockResolvedValue(organization),
      },
      site: {
        create: jest.fn().mockResolvedValue({ id: 'site-1' }),
        createMany: jest.fn(),
      },
      unit: { createMany: jest.fn() },
      user: { create: jest.fn().mockResolvedValue(createdUser) },
      workspaceOnboardingProgress: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      organization: { findFirst: jest.fn().mockResolvedValue(null) },
      systemSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };

    await createService(prisma).completeOnboarding({
      username: 'admin',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'admin@toquehub.local',
      password: 'ToqueHub-2026!',
      organizationName: 'La Brigade',
      regulatoryCountryCode: 'FR',
    });

    expect(tx.workspaceOnboardingProgress.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', ownerUserId: 'user-1' },
    });
  });

  it('marks only the owner primary admin as eligible', () => {
    const service = createService({} as any);
    const progress = {
      version: 1,
      status: 'PENDING',
      currentStep: 'WELCOME',
      ownerUserId: 'owner-1',
      startedAt: null,
      deferredAt: null,
      completedAt: null,
    };

    expect(
      (service as any).serializeWorkspaceOnboarding(progress, {
        id: 'owner-1',
        isPrimaryAdmin: true,
      }),
    ).toMatchObject({ eligible: true, status: 'PENDING', currentStep: 'WELCOME' });
    expect(
      (service as any).serializeWorkspaceOnboarding(progress, {
        id: 'admin-2',
        isPrimaryAdmin: true,
      }),
    ).toMatchObject({ eligible: false, status: null, currentStep: null });
    expect(
      (service as any).serializeWorkspaceOnboarding(null, {
        id: 'owner-1',
        isPrimaryAdmin: true,
      }),
    ).toMatchObject({ eligible: false, status: null, currentStep: null });
  });

  it('persists a deferred step for the owner and keeps the original start timestamp', async () => {
    const startedAt = new Date('2026-07-24T08:00:00.000Z');
    const prisma: any = {
      workspaceOnboardingProgress: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          ownerUserId: 'owner-1',
          version: 1,
          status: 'IN_PROGRESS',
          currentStep: 'ECOSYSTEM',
          startedAt,
          deferredAt: null,
          completedAt: null,
        }),
        update: jest.fn().mockImplementation(({ data }) => ({
          ownerUserId: 'owner-1',
          version: 1,
          completedAt: null,
          ...data,
        })),
      },
    };
    const service = createService(prisma);

    const result = await service.updateWorkspaceOnboarding(
      {
        id: 'owner-1',
        organizationId: 'org-1',
        role: 'SUPER_ADMIN',
      } as any,
      { status: 'DEFERRED', currentStep: 'STARTER_BUNDLE' },
    );

    expect(prisma.workspaceOnboardingProgress.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1' },
        data: expect.objectContaining({
          status: 'DEFERRED',
          currentStep: 'STARTER_BUNDLE',
          startedAt,
          deferredAt: expect.any(Date),
        }),
      }),
    );
    expect(result).toMatchObject({
      eligible: true,
      status: 'DEFERRED',
      currentStep: 'STARTER_BUNDLE',
    });
  });

  it('rejects legacy organizations and non-owner administrators', async () => {
    const prisma: any = {
      workspaceOnboardingProgress: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ ownerUserId: 'owner-1' }),
      },
    };
    const service = createService(prisma);
    const actor = { id: 'admin-2', organizationId: 'org-1', role: 'SUPER_ADMIN' } as any;
    const dto = { status: 'IN_PROGRESS', currentStep: 'WELCOME' } as const;

    await expect(service.updateWorkspaceOnboarding(actor, dto)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.updateWorkspaceOnboarding(actor, dto)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

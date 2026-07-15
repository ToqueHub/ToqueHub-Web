import { ArchitectureService } from './architecture.service';

function mockPrisma(overrides?: Record<string, unknown>): any {
  return {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ hrInstalledAt: new Date(), planningInstalledAt: new Date() }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    },
    user: { count: jest.fn().mockResolvedValue(0) },
    product: { count: jest.fn().mockResolvedValue(0) },
    supplier: { count: jest.fn().mockResolvedValue(0) },
    ...(overrides ?? {}),
  };
}

describe('ArchitectureService duplicate analysis', () => {
  it('does not flag HR entitlement templates and legal job families as duplicate concepts', async () => {
    const service = new ArchitectureService(mockPrisma());

    const architecture = await service.getArchitecture({ organizationId: 'org-1' });

    expect(architecture.duplicates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        models: expect.arrayContaining(['HrEntitlementCatalogItem', 'LegalJobFamily']),
      }),
    ]));
  });

  it('assigns legal rights models to the HR domain instead of Core fallback', async () => {
    const service = new ArchitectureService(mockPrisma());

    const architecture = await service.getArchitecture({ organizationId: 'org-1' });
    const legalJobFamily = architecture.dataMap.find((entry) => entry.model === 'LegalJobFamily');
    const legalRight = architecture.dataMap.find((entry) => entry.model === 'LegalRight');

    expect(legalJobFamily?.owner).toBe('RH');
    expect(legalRight?.owner).toBe('RH');
  });
});

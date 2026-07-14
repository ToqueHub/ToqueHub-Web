import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { HrService } from './hr.service';
import { Decimal } from '@prisma/client/runtime/library';

function mockPrisma(overrides?: any): any {
  const base: any = {
    hrOnboardingProgress: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    hrDepartment: { findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    hrPosition: { findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    hrEmployee: { findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    hrEmployeeSensitiveData: { upsert: jest.fn(), deleteMany: jest.fn() },
    hrEmploymentContract: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn().mockReturnValue({ id: 'contract-1' }), updateMany: jest.fn() },
    hrEmployeeCompensation: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn().mockReturnValue({ id: 'comp-1' }), updateMany: jest.fn() },
    hrSalaryReview: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn().mockReturnValue({ id: 'review-1' }), updateMany: jest.fn() },
    hrEmployeeHistory: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(async (cb: any) => cb(base)),
  };
  return { ...base, ...(overrides || {}) };
}

describe('HrService permissions', () => {
  let service: HrService;
  let prisma: any;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new HrService(prisma);
  });

  it('admin can read any employee', () => {
    expect(() => service.assertRead({ id: '1', role: 'ADMIN' }, 'emp-2', 'emp-1')).not.toThrow();
    expect(() => service.assertRead({ id: '1', role: 'SUPER_ADMIN' }, 'emp-2', 'emp-1')).not.toThrow();
  });

  it('manager can read any employee', () => {
    expect(() => service.assertRead({ id: '1', role: 'Manager' }, 'emp-2', 'emp-1')).not.toThrow();
    expect(() => service.assertRead({ id: '1', role: 'Responsable' }, 'emp-2', 'emp-1')).not.toThrow();
  });

  it('collaborator can read only own sheet', () => {
    expect(() => service.assertRead({ id: '1', role: 'Collaborateur', employeeId: 'emp-1' }, 'emp-1', 'emp-1')).not.toThrow();
    expect(() => service.assertRead({ id: '1', role: 'Collaborateur', employeeId: 'emp-1' }, 'emp-2', 'emp-1')).toThrow(ForbiddenException);
  });

  it('user without employeeId cannot read list', () => {
    expect(() => service.assertRead({ id: '1', role: 'Collaborateur' }, 'emp-2')).toThrow(ForbiddenException);
  });

  it('reserves contract analysis to RH write roles', () => {
    expect(() => service.assertWriteAccess({ id: '1', role: 'Manager' })).not.toThrow();
    expect(() => service.assertWriteAccess({ id: '2', role: 'Collaborateur' })).toThrow(ForbiddenException);
  });
});

describe('HrService onboarding explicit steps', () => {
  let service: HrService;
  let prisma: any;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new HrService(prisma);
  });

  it('completeServices refuses when no department exists', async () => {
    prisma.hrDepartment.findFirst.mockResolvedValue(null);
    prisma.hrOnboardingProgress.findUnique.mockResolvedValue({ organizationId: 'org-1', status: 'NOT_STARTED' });
    await expect(service.completeServices('org-1', { id: '1', role: 'ADMIN' })).rejects.toThrow(BadRequestException);
  });

  it('completeServices succeeds when department exists and is idempotent', async () => {
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.hrOnboardingProgress.findUnique.mockResolvedValue({ organizationId: 'org-1', status: 'NOT_STARTED', servicesCompletedAt: null });
    prisma.hrOnboardingProgress.update.mockResolvedValue({ organizationId: 'org-1', status: 'SERVICES_COMPLETED', servicesCompletedAt: new Date() });
    const result = await service.completeServices('org-1', { id: '1', role: 'ADMIN' });
    expect(result.status).toBe('SERVICES_COMPLETED');
    expect(prisma.hrOnboardingProgress.update).toHaveBeenCalled();

    // Idempotent second call
    prisma.hrOnboardingProgress.findUnique.mockResolvedValue({ organizationId: 'org-1', status: 'SERVICES_COMPLETED', servicesCompletedAt: new Date() });
    prisma.hrOnboardingProgress.update.mockClear();
    await service.completeServices('org-1', { id: '1', role: 'ADMIN' });
    expect(prisma.hrOnboardingProgress.update).not.toHaveBeenCalled();
  });

  it('completePositions refuses if services not completed', async () => {
    prisma.hrOnboardingProgress.findUnique.mockResolvedValue({ organizationId: 'org-1', status: 'NOT_STARTED', servicesCompletedAt: null });
    await expect(service.completePositions('org-1', { id: '1', role: 'ADMIN' })).rejects.toThrow(BadRequestException);
  });

  it('completeOnboarding refuses if first employee not created', async () => {
    prisma.hrOnboardingProgress.findUnique.mockResolvedValue({ organizationId: 'org-1', status: 'EMPLOYEES_UNLOCKED', firstEmployeeCreatedAt: null });
    await expect(service.completeOnboarding('org-1', { id: '1', role: 'ADMIN' })).rejects.toThrow(BadRequestException);
  });
});

describe('HrService contract change detection', () => {
  let service: HrService;

  beforeEach(() => {
    service = new HrService(mockPrisma());
  });

  it('does not create contract when no contract data provided', async () => {
    const tx = mockPrisma();
    await (service as any).syncContractAndCompensation(tx, 'org-1', 'emp-1', {} as any, 'user-1');
    expect(tx.hrEmploymentContract.create).not.toHaveBeenCalled();
  });

  it('creates contract on first contract data', async () => {
    const tx = mockPrisma();
    tx.hrEmploymentContract.findFirst.mockResolvedValue(null);
    await (service as any).syncContractAndCompensation(tx, 'org-1', 'emp-1', { contractType: 'CDI', contractWeeklyMinutes: 2100 } as any, 'user-1');
    expect(tx.hrEmploymentContract.create).toHaveBeenCalled();
  });

  it('does not create duplicate contract when nothing changed', async () => {
    const tx = mockPrisma();
    tx.hrEmploymentContract.findFirst.mockResolvedValue({ contractType: 'CDI', endDate: null, weeklyHours: 2100, trialEndDate: null });
    await (service as any).syncContractAndCompensation(tx, 'org-1', 'emp-1', { contractType: 'CDI', contractWeeklyMinutes: 2100 } as any, 'user-1');
    expect(tx.hrEmploymentContract.create).not.toHaveBeenCalled();
  });

  it('creates new contract when type changes', async () => {
    const tx = mockPrisma();
    tx.hrEmploymentContract.findFirst.mockResolvedValue({ contractType: 'CDI', endDate: null, weeklyHours: 2100, trialEndDate: null });
    await (service as any).syncContractAndCompensation(tx, 'org-1', 'emp-1', { contractType: 'CDD', contractWeeklyMinutes: 2100 } as any, 'user-1');
    expect(tx.hrEmploymentContract.updateMany).toHaveBeenCalled();
    expect(tx.hrEmploymentContract.create).toHaveBeenCalled();
  });
});

describe('HrService sensitive employee data', () => {
  it('stores only the encrypted personal identifier and removes ciphertext from API results', async () => {
    const prisma = mockPrisma();
    const crypto = { encrypt: jest.fn().mockReturnValue('v1:encrypted'), decrypt: jest.fn().mockReturnValue('080800A592P') };
    const service = new HrService(prisma, crypto as any);

    await (service as any).syncSensitiveData(prisma, 'org-1', 'emp-1', '080800A592P');
    const serialized = (service as any).serializeEmployee({
      id: 'emp-1',
      firstName: 'Aino',
      sensitiveData: { personalIdentityNumberCiphertext: 'v1:encrypted' },
    });

    expect(prisma.hrEmployeeSensitiveData.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ personalIdentityNumberCiphertext: 'v1:encrypted' }),
    }));
    expect(JSON.stringify(prisma.hrEmployeeSensitiveData.upsert.mock.calls)).not.toContain('080800A592P');
    expect(serialized).toMatchObject({ personalIdentityNumber: '080800A592P' });
    expect(serialized).not.toHaveProperty('sensitiveData');
  });
});

describe('HrService employee position validation', () => {
  let service: HrService;
  let prisma: any;

  beforeEach(() => {
    prisma = mockPrisma({
      site: { findFirst: jest.fn() },
    });
    service = new HrService(prisma);
  });

  it('refuses a primary position linked to another department', async () => {
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: 'dept-salle', name: 'Salle' });
    prisma.hrPosition.findFirst.mockResolvedValue({ id: 'pos-chef', name: 'Chef de cuisine', departmentId: 'dept-cuisine' });

    await expect((service as any).validateEmployeeRefs('org-1', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      hireDate: '2026-06-21',
      departmentId: 'dept-salle',
      positionId: 'pos-chef',
    })).rejects.toThrow(BadRequestException);
  });

  it('accepts a catalog position that belongs to the selected department', async () => {
    prisma.hrDepartment.findFirst.mockResolvedValue({ id: 'dept-salle', name: 'Salle' });
    prisma.hrPosition.findFirst.mockResolvedValue({ id: 'pos-serveur', name: 'Serveur', departmentId: null });

    await expect((service as any).validateEmployeeRefs('org-1', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      hireDate: '2026-06-21',
      departmentId: 'dept-salle',
      positionId: 'pos-serveur',
    })).resolves.toBeUndefined();
  });
});

describe('HrService compensation change detection', () => {
  let service: HrService;

  beforeEach(() => {
    service = new HrService(mockPrisma());
  });

  it('does not create compensation when no rate provided', async () => {
    const tx = mockPrisma();
    await (service as any).syncContractAndCompensation(tx, 'org-1', 'emp-1', {} as any, 'user-1');
    expect(tx.hrEmployeeCompensation.create).not.toHaveBeenCalled();
  });

  it('creates compensation on first rate', async () => {
    const tx = mockPrisma();
    tx.hrEmployeeCompensation.findFirst.mockResolvedValue(null);
    await (service as any).syncContractAndCompensation(tx, 'org-1', 'emp-1', { hourlyRate: 15.5, currency: 'EUR' } as any, 'user-1');
    expect(tx.hrEmployeeCompensation.create).toHaveBeenCalled();
  });

  it('does not create duplicate compensation when rate identical', async () => {
    const tx = mockPrisma();
    tx.hrEmployeeCompensation.findFirst.mockResolvedValue({ hourlyRate: new Decimal(15.5), currency: 'EUR' });
    await (service as any).syncContractAndCompensation(tx, 'org-1', 'emp-1', { hourlyRate: 15.5, currency: 'EUR' } as any, 'user-1');
    expect(tx.hrEmployeeCompensation.create).not.toHaveBeenCalled();
  });

  it('creates new compensation when rate changes', async () => {
    const tx = mockPrisma();
    tx.hrEmployeeCompensation.findFirst.mockResolvedValue({ hourlyRate: new Decimal(15.5), currency: 'EUR' });
    await (service as any).syncContractAndCompensation(tx, 'org-1', 'emp-1', { hourlyRate: 16.0, currency: 'EUR' } as any, 'user-1');
    expect(tx.hrEmployeeCompensation.updateMany).toHaveBeenCalled();
    expect(tx.hrEmployeeCompensation.create).toHaveBeenCalled();
  });

  it('handles decimal comparison reliably', async () => {
    const tx = mockPrisma();
    tx.hrEmployeeCompensation.findFirst.mockResolvedValue({ hourlyRate: new Decimal('15.50'), currency: 'EUR' });
    await (service as any).syncContractAndCompensation(tx, 'org-1', 'emp-1', { hourlyRate: 15.5, currency: 'EUR' } as any, 'user-1');
    expect(tx.hrEmployeeCompensation.create).not.toHaveBeenCalled();
  });
});

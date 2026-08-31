import { ForbiddenException } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { UsersService } from './users.service';

describe('UsersService managed access reset', () => {
  it('replaces the password, role and reactivates the account', async () => {
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          organizationId: 'org-1',
          isPrimaryAdmin: false,
        }),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: 'user-1',
          email: 'aino@example.com',
          firstName: 'Aino',
          lastName: 'Korhonen',
          status: data.status,
          isActive: data.isActive,
          isPrimaryAdmin: false,
          passwordHash: data.passwordHash,
          role: { name: 'Manager', permissions: [] },
          hrEmployee: null,
        })),
      },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-manager' }) },
    };
    const service = new UsersService(prisma, {} as any, {} as any);

    const result = await service.resetManagedUserAccessRecord('org-1', 'user-1', {
      role: 'Manager' as any,
      temporaryPassword: 'replacement-secret',
    });

    const update = prisma.user.update.mock.calls[0][0];
    expect(update.data).toMatchObject({
      role: { connect: { id: 'role-manager' } },
      status: 'INVITED',
      isActive: true,
    });
    expect(update.data.passwordHash).not.toBe('replacement-secret');
    await expect(compare('replacement-secret', update.data.passwordHash)).resolves.toBe(true);
    expect(result).toMatchObject({ id: 'user-1', role: 'Manager', status: 'INVITED' });
  });

  it('protects the primary administrator account', async () => {
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          organizationId: 'org-1',
          isPrimaryAdmin: true,
        }),
      },
    };
    const service = new UsersService(prisma, {} as any, {} as any);

    await expect(
      service.resetManagedUserAccessRecord('org-1', 'admin-1', {
        role: 'Administrateur' as any,
        temporaryPassword: 'replacement-secret',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});

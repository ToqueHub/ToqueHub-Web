import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'Administrateur'];

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const [organizationCount, adminCount] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.user.count({
        where: {
          role: {
            name: { in: ADMIN_ROLES },
          },
        },
      }),
    ]);

    const hasOrganization = organizationCount > 0;
    const hasAdmin = adminCount > 0;

    return {
      initialized: hasOrganization && hasAdmin,
      hasOrganization,
      hasAdmin,
    };
  }
}

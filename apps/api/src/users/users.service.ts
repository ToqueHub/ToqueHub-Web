import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { CoreRoleName, CoreUserStatus, CreateManagedUserDto, UpdateManagedUserDto } from './dto/user-management.dto';

const ADMIN_ROLES = new Set(['SUPER_ADMIN', CoreRoleName.ADMIN]);

const BASE_PERMISSIONS = [
  { key: 'core.users.read', description: 'Consulter les utilisateurs Core' },
  { key: 'core.users.write', description: 'Créer et modifier les utilisateurs Core' },
  { key: 'core.users.status', description: 'Changer le statut des utilisateurs' },
  { key: 'core.roles.read', description: 'Consulter les rôles et permissions' },
  { key: 'core.roles.write', description: 'Modifier les permissions des rôles' },
  { key: 'core.dev.switch', description: 'Utiliser le switch utilisateur de développement' },
  { key: 'catalog.read', description: 'Consulter le catalogue' },
  { key: 'catalog.write', description: 'Modifier le catalogue' },
  { key: 'stocks.read', description: 'Consulter les stocks' },
  { key: 'stocks.write', description: 'Modifier les stocks' },
  { key: 'stocks.audit.read', description: 'Consulter l’audit stocks' },
  { key: 'hr.read', description: 'Consulter le référentiel RH' },
  { key: 'hr.write', description: 'Créer et modifier le référentiel RH' },
  { key: 'planning.read', description: 'Consulter le planning' },
  { key: 'planning.write', description: 'Modifier le planning' },
  { key: 'rnm-prices.read', description: 'Consulter les cours des produits' },
  { key: 'technical-sheets.read', description: 'Consulter les fiches techniques' },
  { key: 'technical-sheets.write', description: 'Modifier les fiches techniques' },
  { key: 'production.read', description: 'Consulter la production' },
  { key: 'production.write', description: 'Modifier la production' },
  { key: 'production.need.create', description: 'Créer un besoin de production' },
  { key: 'production.menu.generate', description: 'Générer la production depuis un menu' },
  { key: 'production.campaign.validate', description: 'Valider une campagne de production' },
  { key: 'production.batch.execute', description: 'Exécuter un lot de production' },
  { key: 'production.loss.declare', description: 'Déclarer une perte de production' },
  { key: 'production.stock.adjust', description: 'Corriger un stock de production' },
  { key: 'production.profile.manage', description: 'Modifier les profils de production' },
  { key: 'production.override', description: 'Forcer une production avec justification' },
  { key: 'production.traceability.read', description: 'Consulter la traçabilité de production' },
  { key: 'menus.read', description: 'Consulter les menus' },
  { key: 'menus.write', description: 'Modifier les menus' },
  { key: 'haccp.read', description: 'Consulter le module HACCP' },
  { key: 'haccp.write', description: 'Modifier les contrôles HACCP' },
  { key: 'haccp.validate', description: 'Valider les contrôles HACCP' },
  { key: 'haccp.export', description: 'Exporter les rapports HACCP' },
  { key: 'purchasing.read', description: 'Consulter les achats' },
  { key: 'purchasing.draft', description: 'Créer et modifier ses brouillons d’achat' },
  { key: 'purchasing.write', description: 'Modifier toutes les commandes d’achat' },
  { key: 'purchasing.send', description: 'Envoyer les commandes fournisseurs' },
  { key: 'purchasing.receive', description: 'Valider les réceptions fournisseurs' },
  { key: 'purchasing.manage', description: 'Configurer les achats et les e-mails fournisseurs' },
  { key: 'finance.read', description: 'Consulter le pilotage financier' },
  { key: 'finance.import', description: 'Importer des rapports comptables et de caisse' },
  { key: 'finance.budget', description: 'Créer et modifier les budgets financiers' },
  { key: 'finance.manage', description: 'Configurer les sources et les règles Finance' },
];

const DEFAULT_ROLE_PERMISSIONS: Record<CoreRoleName, string[]> = {
  [CoreRoleName.ADMIN]: BASE_PERMISSIONS.map((permission) => permission.key),
  [CoreRoleName.MANAGER]: ['catalog.read', 'catalog.write', 'stocks.read', 'stocks.write', 'stocks.audit.read', 'hr.read', 'hr.write', 'planning.read', 'planning.write', 'rnm-prices.read', 'technical-sheets.read', 'technical-sheets.write', 'production.read', 'production.write', 'production.need.create', 'production.menu.generate', 'production.campaign.validate', 'production.batch.execute', 'production.loss.declare', 'production.stock.adjust', 'production.profile.manage', 'production.override', 'production.traceability.read', 'menus.read', 'menus.write', 'haccp.read', 'haccp.write', 'haccp.validate', 'haccp.export', 'purchasing.read', 'purchasing.draft', 'purchasing.write', 'purchasing.send', 'purchasing.receive', 'purchasing.manage', 'finance.read', 'finance.import', 'finance.budget', 'finance.manage'],
  [CoreRoleName.USER]: ['catalog.read', 'stocks.read', 'hr.read', 'planning.read', 'rnm-prices.read', 'technical-sheets.read', 'production.read', 'production.batch.execute', 'production.loss.declare', 'production.traceability.read', 'menus.read', 'haccp.read', 'purchasing.read', 'purchasing.draft', 'finance.read'],
};

const USER_WITH_ROLE_INCLUDE = Prisma.validator<Prisma.UserInclude>()({
  role: { include: { permissions: { include: { permission: true } } } },
  hrEmployee: { select: { photoDataUrl: true } },
});

type UserWithRole = Prisma.UserGetPayload<{ include: typeof USER_WITH_ROLE_INCLUDE }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async listUsers(user: AuthenticatedUser) {
    this.assertAdmin(user);
    await this.ensureCoreRolesAndPermissions();
    const organizationId = this.requireOrganization(user);
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      orderBy: [{ isPrimaryAdmin: 'desc' }, { createdAt: 'asc' }],
      include: USER_WITH_ROLE_INCLUDE,
    });
    return users.map((entry) => this.serializeUser(entry));
  }

  async listRoles(user: AuthenticatedUser) {
    this.assertAdmin(user);
    await this.ensureCoreRolesAndPermissions();
    const roles = await this.prisma.role.findMany({
      where: { name: { in: Object.values(CoreRoleName) } },
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });
    const permissions = await this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
    return {
      permissions,
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions.map((rp) => rp.permission).sort((a, b) => a.key.localeCompare(b.key)),
      })),
    };
  }

  async createUser(actor: AuthenticatedUser, dto: CreateManagedUserDto) {
    this.assertAdmin(actor);
    const organizationId = this.requireOrganization(actor);
    await this.ensureCoreRolesAndPermissions();
    return this.createManagedUserRecord(organizationId, dto);
  }

  async createManagedUserRecord(
    organizationId: string,
    dto: CreateManagedUserDto,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const existing = await client.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already exists');
    const role = await client.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException('Role not found');
    const user = await client.user.create({
      data: {
        username: dto.email,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash: await hash(dto.temporaryPassword, 12),
        organizationId,
        roleId: role.id,
        status: UserStatus.INVITED,
        isActive: true,
      },
      include: USER_WITH_ROLE_INCLUDE,
    });
    return this.serializeUser(user);
  }

  async updateUser(actor: AuthenticatedUser, id: string, dto: UpdateManagedUserDto) {
    this.assertAdmin(actor);
    const organizationId = this.requireOrganization(actor);
    await this.ensureCoreRolesAndPermissions();
    const target = await this.prisma.user.findFirst({ where: { id, organizationId }, include: { role: true } });
    if (!target) throw new NotFoundException('User not found');

    if (target.isPrimaryAdmin && (dto.role || dto.status)) {
      throw new ForbiddenException('Primary administrator role and status are locked');
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.email !== undefined && dto.email !== target.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email already exists');
      data.email = dto.email;
      data.username = dto.email;
    }
    if (dto.role) {
      await this.assertAtLeastOneActiveAdminRemains(organizationId, target.id, dto.role, dto.status);
      data.role = { connect: { id: (await this.findCoreRole(dto.role)).id } };
    }
    if (dto.status) {
      await this.assertAtLeastOneActiveAdminRemains(organizationId, target.id, dto.role, dto.status);
      data.status = dto.status;
      data.isActive = dto.status !== CoreUserStatus.DISABLED;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: USER_WITH_ROLE_INCLUDE,
    });
    return this.serializeUser(updated);
  }

  async disableUser(actor: AuthenticatedUser, id: string) {
    return this.updateUser(actor, id, { status: CoreUserStatus.DISABLED });
  }

  async updateRolePermissions(actor: AuthenticatedUser, roleName: CoreRoleName, permissionKeys: string[]) {
    this.assertAdmin(actor);
    await this.ensureCoreRolesAndPermissions();
    const role = await this.findCoreRole(roleName);
    await this.prisma.permission.createMany({ data: permissionKeys.map((key) => ({ key, description: key })), skipDuplicates: true });
    const permissions = await this.prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      ...permissions.map((permission) => this.prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })),
    ]);
    return this.listRoles(actor);
  }

  async devSwitch(actor: AuthenticatedUser, userId: string) {
    this.assertAdmin(actor);
    if (!this.isDevSwitchEnabled()) throw new ForbiddenException('Development user switch is disabled');
    const organizationId = this.requireOrganization(actor);
    const target = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, status: { not: UserStatus.DISABLED }, isActive: true },
      include: { role: { include: { permissions: { include: { permission: true } } } }, organization: true },
    });
    if (!target) throw new NotFoundException('Switch target not found or disabled');
    return this.createSession(target);
  }

  getDevSwitchConfig(actor: AuthenticatedUser) {
    return { enabled: this.isDevSwitchEnabled() && ADMIN_ROLES.has(actor.role) };
  }

  async ensureCoreRolesAndPermissions() {
    await this.prisma.permission.createMany({ data: BASE_PERMISSIONS, skipDuplicates: true });
    for (const roleName of Object.values(CoreRoleName)) {
      const role = await this.prisma.role.upsert({ where: { name: roleName }, update: { isSystem: true }, create: { name: roleName, description: `Rôle Core ${roleName}`, isSystem: true } });
      const permissions = await this.prisma.permission.findMany({ where: { key: { in: DEFAULT_ROLE_PERMISSIONS[roleName] } } });
      await this.prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
    }
  }

  private async assertAtLeastOneActiveAdminRemains(organizationId: string, targetId: string, nextRole?: CoreRoleName, nextStatus?: CoreUserStatus) {
    const activeAdmins = await this.prisma.user.findMany({ where: { organizationId, role: { name: { in: ['SUPER_ADMIN', CoreRoleName.ADMIN] } }, status: { not: UserStatus.DISABLED }, isActive: true }, select: { id: true } });
    const remaining = activeAdmins.filter((admin) => {
      if (admin.id !== targetId) return true;
      if (nextRole && nextRole !== CoreRoleName.ADMIN) return false;
      if (nextStatus && nextStatus === CoreUserStatus.DISABLED) return false;
      return true;
    });
    if (remaining.length === 0) throw new ForbiddenException('At least one active administrator is required');
  }

  private async findCoreRole(roleName: CoreRoleName) {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private assertAdmin(user: AuthenticatedUser) {
    if (!ADMIN_ROLES.has(user.role)) throw new ForbiddenException('User management is restricted to administrators');
  }

  private requireOrganization(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required');
    return user.organizationId;
  }

  private isDevSwitchEnabled() {
    return ['true', '1', 'yes'].includes(String(this.configService.get('ENABLE_DEV_USER_SWITCH') ?? '').toLowerCase());
  }

  private serializeUser(user: UserWithRole) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name,
      status: user.status,
      isActive: user.isActive,
      isPrimaryAdmin: user.isPrimaryAdmin,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      collaboratorPhotoUrl: user.hrEmployee?.photoDataUrl ?? null,
      permissions: user.role.permissions.map((rp) => rp.permission.key).sort(),
    };
  }

  private async createSession(user: Prisma.UserGetPayload<{ include: { role: { include: { permissions: { include: { permission: true } } } }; organization: true } }>) {
    const payload = { sub: user.id, email: user.email, organizationId: user.organizationId, role: user.role.name };
    return {
      accessToken: await this.jwtService.signAsync(payload, { secret: this.configService.get<string>('JWT_SECRET', 'change-me-in-development'), expiresIn: this.configService.get<'8h' | '1d' | '7d'>('JWT_EXPIRES_IN') ?? '8h' }),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        organizationId: user.organizationId,
        organizationName: user.organization?.name ?? null,
        organizationType: user.organization?.establishmentType ?? null,
        teamSize: user.organization?.teamSize ?? null,
        logoUrl: user.organization?.logoDataUrl ?? null,
        logoDataUrl: user.organization?.logoDataUrl ?? null,
        mainSiteName: user.organization?.mainSiteName ?? null,
        installedApplications: user.organization ? [
          ...(user.organization.stocksInstalledAt ? ['stocks'] : []),
          ...(user.organization.rnmPricesInstalledAt ? ['rnm-prices'] : []),
          ...(user.organization.hrInstalledAt ? ['hr'] : []),
          ...(user.organization.planningInstalledAt ? ['planning'] : []),
          ...(user.organization.technicalSheetsInstalledAt ? ['technical-sheets'] : []),
          ...(user.organization.productionInstalledAt ? ['production'] : []),
          ...(user.organization.menusInstalledAt ? ['menus'] : []),
        ] : [],
        role: user.role.name,
        permissions: user.role.permissions.map((rp) => rp.permission.key).sort(),
      },
      devSwitch: true,
    };
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UnitType, AuditAction, UserStatus, Permission } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import type { AuthenticatedUser } from './authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { LoginDto } from './dto/login.dto';
import { SetupOrganizationDto } from './dto/setup-organization.dto';
import { UpdateOrganizationApiKeysDto } from './dto/api-keys.dto';
import { UpdateOrganizationIdentityDto } from './dto/organization-identity.dto';
import { UpdateOrganizationRemoteAccessDto } from './dto/remote-access.dto';
import { UpdateRegulatoryCountryDto } from './dto/regulatory-country.dto';
import { UpdateWorkspaceOnboardingDto } from './dto/workspace-onboarding.dto';
import { OrganizationApiKeySecretService } from '../common/secrets/organization-api-key-secret.service';

type PrefillStocksDto = {
  categories?: boolean;
  units?: boolean;
  sites?: boolean;
  locations?: boolean;
  examples?: boolean;
};

const ADMIN_ROLES = ['SUPER_ADMIN', 'Administrateur'];
const AUTH_SESSION_EPOCH_KEY = 'auth.session-epoch';
const SETTINGS_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER'];
const DEFAULT_STOCK_CATEGORIES = ['Sans catégorie', 'Épicerie', 'Produits frais', 'Surgelés', 'Boissons', 'Viandes', 'Poissons', 'Produits laitiers', 'Fruits et légumes'];
const DEFAULT_STOCK_UNITS = [
  { name: 'Kilogramme', symbol: 'kg', type: UnitType.MASS },
  { name: 'Gramme', symbol: 'g', type: UnitType.MASS },
  { name: 'Litre', symbol: 'L', type: UnitType.VOLUME },
  { name: 'Millilitre', symbol: 'mL', type: UnitType.VOLUME },
  { name: 'Pièce', symbol: 'pièce', type: UnitType.COUNT },
  { name: 'Barquette', symbol: 'barquette', type: UnitType.PACKAGE },
  { name: 'Caisse', symbol: 'caisse', type: UnitType.PACKAGE },
  { name: 'Carton', symbol: 'carton', type: UnitType.PACKAGE },
  { name: 'Bac', symbol: 'bac', type: UnitType.PACKAGE },
];
const DEFAULT_STOCK_LOCATIONS = ['Réserve sèche', 'Chambre froide positive', 'Chambre froide négative', 'Congélateur', 'Cuisine', 'Zone de production', 'Quai de réception'];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly apiKeySecrets: OrganizationApiKeySecretService,
  ) {}

  async completeOnboarding(dto: CompleteOnboardingDto) {
    const [existingAdmin, existingOrganization, existingIdentity] = await Promise.all([
      this.prisma.user.findFirst({
        where: { role: { name: { in: ADMIN_ROLES } } },
        select: { id: true },
      }),
      this.prisma.organization.findFirst({ select: { id: true } }),
      this.prisma.user.findFirst({
        where: { OR: [{ email: dto.email }, { username: dto.username }] },
        select: { email: true, username: true },
      }),
    ]);

    if (existingAdmin || existingOrganization) {
      throw new ForbiddenException('Initial onboarding is only available before the instance is initialized');
    }
    if (existingIdentity?.email === dto.email) throw new ConflictException('Email already exists');
    if (existingIdentity?.username === dto.username) throw new ConflictException('Username already exists');

    const user = await this.prisma.$transaction(async (tx) => {
      const primarySiteName = this.primarySiteName(dto.organizationName, dto.primarySiteName);
      const secondarySiteNames = this.secondarySiteNames(dto.secondarySiteNames, primarySiteName);
      const role = await tx.role.upsert({
        where: { name: 'SUPER_ADMIN' },
        update: {},
        create: {
          name: 'SUPER_ADMIN',
          description: 'System administrator created during first-start onboarding',
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          establishmentType: dto.establishmentType,
          hrCountryCode: dto.regulatoryCountryCode ?? dto.hrCountryCode,
          regulatoryCountryCode: dto.regulatoryCountryCode ?? dto.hrCountryCode,
          regulatoryCountrySelectedAt: dto.regulatoryCountryCode || dto.hrCountryCode ? new Date() : null,
          teamSize: dto.teamSize,
          logoDataUrl: dto.logoDataUrl,
          mainSiteName: primarySiteName,
          mistralApiKey: dto.mistralApiKey?.trim() || null,
          mistralApiKeyUpdatedAt: dto.mistralApiKey?.trim() ? new Date() : null,
        },
      });

      const primarySite = await tx.site.create({ data: { organizationId: organization.id, name: primarySiteName } });
      if (secondarySiteNames.length) {
        await tx.site.createMany({
          data: secondarySiteNames.map((name) => ({ organizationId: organization.id, name })),
          skipDuplicates: true,
        });
      }
      await tx.organization.update({ where: { id: organization.id }, data: { primarySiteId: primarySite.id } });
      await this.createDefaultUnits(tx, organization.id);

      const createdUser = await tx.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash: await hash(dto.password, 12),
          organizationId: organization.id,
          roleId: role.id,
          isPrimaryAdmin: true,
          status: UserStatus.ACTIVE,
          isActive: true,
        },
        include: { role: { include: { permissions: { include: { permission: true } } } }, organization: true },
      });
      await tx.workspaceOnboardingProgress.create({
        data: {
          organizationId: organization.id,
          ownerUserId: createdUser.id,
        },
      });
      return createdUser;
    });

    return this.createSession(user);
  }

  async bootstrapAdmin(dto: BootstrapAdminDto) {
    const existingAdmin = await this.prisma.user.findFirst({
      where: { role: { name: { in: ADMIN_ROLES } } },
      select: { id: true },
    });

    if (existingAdmin) {
      throw new ForbiddenException('Bootstrap admin is only available before an admin exists');
    }

    const existingIdentity = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
      select: { email: true, username: true },
    });

    if (existingIdentity?.email === dto.email) throw new ConflictException('Email already exists');
    if (existingIdentity?.username === dto.username) throw new ConflictException('Username already exists');

    const role = await this.prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: {
        name: 'SUPER_ADMIN',
        description: 'System administrator created during first-start bootstrap',
      },
    });

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash: await hash(dto.password, 12),
        roleId: role.id,
        isPrimaryAdmin: true,
        status: UserStatus.ACTIVE,
        isActive: true,
      },
      include: { role: true },
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
      },
      next: '/setup/organization',
    };
  }

  async setupOrganization(user: AuthenticatedUser, dto: SetupOrganizationDto) {
    if (user.organizationId) {
      throw new ForbiddenException('Current user already belongs to an organization');
    }

    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Only an administrator can create the first organization');
    }

    if (dto.code) {
      const existingCode = await this.prisma.organization.findUnique({
        where: { code: dto.code },
        select: { id: true },
      });
      if (existingCode) throw new ConflictException('Organization code already exists');
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const primarySiteName = this.primarySiteName(dto.name, dto.primarySiteName);
      const secondarySiteNames = this.secondarySiteNames(dto.secondarySiteNames, primarySiteName);
      const organization = await tx.organization.create({
        data: {
          name: dto.name,
          code: dto.code,
          establishmentType: dto.establishmentType,
          hrCountryCode: dto.regulatoryCountryCode ?? dto.hrCountryCode,
          regulatoryCountryCode: dto.regulatoryCountryCode ?? dto.hrCountryCode,
          regulatoryCountrySelectedAt: dto.regulatoryCountryCode || dto.hrCountryCode ? new Date() : null,
          teamSize: dto.teamSize,
          logoDataUrl: dto.logoDataUrl,
          mainSiteName: primarySiteName,
          mistralApiKey: dto.mistralApiKey?.trim() || null,
          mistralApiKeyUpdatedAt: dto.mistralApiKey?.trim() ? new Date() : null,
        },
      });

      const primarySite = await tx.site.create({ data: { organizationId: organization.id, name: primarySiteName } });
      if (secondarySiteNames.length) {
        await tx.site.createMany({
          data: secondarySiteNames.map((name) => ({ organizationId: organization.id, name })),
          skipDuplicates: true,
        });
      }
      await tx.organization.update({ where: { id: organization.id }, data: { primarySiteId: primarySite.id } });
      await this.createDefaultUnits(tx, organization.id);

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { organizationId: organization.id },
        include: { role: { include: { permissions: { include: { permission: true } } } }, organization: true },
      });
      await tx.workspaceOnboardingProgress.create({
        data: {
          organizationId: organization.id,
          ownerUserId: updatedUser.id,
        },
      });
      return updatedUser;
    });

    return this.createSession(updatedUser);
  }

  async getOrganizationApiKeys(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before reading API keys');
    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        mistralApiKey: true,
        mistralApiKeyUpdatedAt: true,
        resendApiKey: true,
        resendApiKeyEncrypted: true,
        resendApiKeyMask: true,
        resendApiKeyUpdatedAt: true,
        githubToken: true,
        githubTokenUpdatedAt: true,
      },
    });
    if (!organization) throw new ForbiddenException('Organization setup is required before reading API keys');
    return this.serializeApiKeys(organization);
  }

  async updateOrganizationApiKeys(user: AuthenticatedUser, dto: UpdateOrganizationApiKeysDto) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before updating API keys');
    if (!SETTINGS_ROLES.includes(user.role)) throw new ForbiddenException('Only administrators and managers can update organization API keys');
    const key = dto.mistralApiKey?.trim();
    const githubToken = dto.githubToken?.trim();
    await this.prisma.organization.update({
        where: { id: user.organizationId! },
      data: {
        ...(dto.mistralApiKey !== undefined ? {
          mistralApiKey: key || null,
          mistralApiKeyUpdatedAt: key ? new Date() : null,
        } : {}),
        ...(dto.githubToken !== undefined ? {
          githubToken: githubToken || null,
          githubTokenUpdatedAt: githubToken ? new Date() : null,
        } : {}),
      },
        select: { id: true },
    });
    if (dto.resendApiKey !== undefined)
      await this.apiKeySecrets.setResendSecret(user.organizationId, dto.resendApiKey);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: {
          mistralApiKey: true,
          mistralApiKeyUpdatedAt: true,
          resendApiKey: true,
          resendApiKeyEncrypted: true,
          resendApiKeyMask: true,
          resendApiKeyUpdatedAt: true,
          githubToken: true,
          githubTokenUpdatedAt: true,
        },
    });
    return this.serializeApiKeys(organization);
  }

  async getOrganizationRemoteAccess(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before reading remote access settings');
    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { tailscaleEnabled: true, tailscaleHostname: true, tailscaleUrl: true, tailscaleIp: true, tailscaleUpdatedAt: true },
    });
    if (!organization) throw new ForbiddenException('Organization setup is required before reading remote access settings');
    return this.serializeRemoteAccess(organization);
  }

  async updateOrganizationRemoteAccess(user: AuthenticatedUser, dto: UpdateOrganizationRemoteAccessDto) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before updating remote access settings');
    if (!SETTINGS_ROLES.includes(user.role)) throw new ForbiddenException('Only administrators and managers can update remote access settings');
    const enabled = dto.enabled ?? Boolean(dto.tailscaleUrl || dto.tailscaleIp || dto.tailscaleHostname);
    const organization = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        tailscaleEnabled: enabled,
        tailscaleHostname: dto.tailscaleHostname?.trim() || null,
        tailscaleUrl: dto.tailscaleUrl?.trim() || null,
        tailscaleIp: dto.tailscaleIp?.trim() || null,
        tailscaleUpdatedAt: new Date(),
      },
      select: { tailscaleEnabled: true, tailscaleHostname: true, tailscaleUrl: true, tailscaleIp: true, tailscaleUpdatedAt: true },
    });
    return this.serializeRemoteAccess(organization);
  }

  async updateOrganizationIdentity(user: AuthenticatedUser, dto: UpdateOrganizationIdentityDto) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before updating organization settings');
    if (!SETTINGS_ROLES.includes(user.role)) throw new ForbiddenException('Only administrators and managers can update organization settings');
    const data: Prisma.OrganizationUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.establishmentType !== undefined) data.establishmentType = dto.establishmentType || null;
    if (dto.teamSize !== undefined) data.teamSize = dto.teamSize || null;
    if (!Object.keys(data).length) return this.getDashboardSummary(user);
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data,
    });
    return this.getDashboardSummary(user);
  }

  async updateRegulatoryCountry(user: AuthenticatedUser, dto: UpdateRegulatoryCountryDto) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before updating regulatory country');
    if (!SETTINGS_ROLES.includes(user.role)) throw new ForbiddenException('Only administrators and managers can update the regulatory country');
    const regulatoryCountryCode = this.normalizeRegulatoryCountry(dto.regulatoryCountryCode);
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        regulatoryCountryCode,
        regulatoryCountrySelectedAt: regulatoryCountryCode ? new Date() : null,
        regulatoryCountrySelectedById: regulatoryCountryCode ? user.id : null,
        ...(regulatoryCountryCode ? { hrCountryCode: regulatoryCountryCode } : {}),
      },
    });
    return this.getDashboardSummary(user);
  }

  async getCurrentSession(user: AuthenticatedUser) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { role: true, organization: true },
    });

    if (!currentUser) throw new UnauthorizedException('Invalid session');
    return this.serializeUser(currentUser);
  }

  async installStocksApplication(user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization setup is required before installing applications');
    }

    const organizationId = user.organizationId;
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new ForbiddenException('Organization setup is required before installing applications');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.createDefaultStockCategories(tx, organizationId);
      await this.createDefaultStockUnits(tx, organizationId);
      await this.seedConversions(tx, organizationId);
      const site = await tx.site.upsert({
        where: { organizationId_name: { organizationId, name: organization.mainSiteName ?? 'Site principal' } },
        update: {},
        create: { organizationId, name: organization.mainSiteName ?? 'Site principal' },
      });
      await tx.location.createMany({
        data: DEFAULT_STOCK_LOCATIONS.map((name) => ({ organizationId, siteId: site.id, name })),
        skipDuplicates: true,
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { stocksInstalledAt: organization.stocksInstalledAt ?? new Date(), primarySiteId: organization.primarySiteId ?? site.id },
      });
      await tx.auditLog.create({ data: { organizationId, userId: user.id, action: AuditAction.MODULE_STOCKS_INSTALLED, entityType: 'Module', entityId: 'stocks', entityName: 'Stocks' } });
    });

    return this.getDashboardSummary(user);
  }

  async prefillStocksApplication(user: AuthenticatedUser, dto: PrefillStocksDto) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization setup is required before prefilling Stocks');
    }

    const organizationId = user.organizationId;
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new ForbiddenException('Organization setup is required before prefilling Stocks');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.categories) {
        await this.createDefaultStockCategories(tx, organizationId);
      }

      if (dto.units) {
        await this.createDefaultStockUnits(tx, organizationId);
        await this.seedConversions(tx, organizationId);
      }

      let siteId: string | undefined;
      if (dto.sites || dto.locations || dto.examples) {
        const site = await tx.site.upsert({
          where: { organizationId_name: { organizationId, name: organization.mainSiteName ?? 'Site principal' } },
          update: {},
          create: { organizationId, name: organization.mainSiteName ?? 'Site principal' },
        });
        siteId = site.id;
      }

      if ((dto.locations || dto.examples) && siteId) {
        await tx.location.createMany({
          data: DEFAULT_STOCK_LOCATIONS.map((name) => ({ organizationId, siteId, name })),
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({ data: { organizationId, userId: user.id, action: AuditAction.MODULE_STOCKS_INSTALLED, entityType: 'Module', entityId: 'stocks-prefill', entityName: 'Préremplissage Stocks' } });
    });

    return this.getDashboardSummary(user);
  }

  async uninstallStocksApplication(user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization setup is required before uninstalling applications');
    }

    const uninstallOrganizationId = user.organizationId;
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: uninstallOrganizationId },
        data: { stocksInstalledAt: null },
      });
      await tx.auditLog.create({ data: { organizationId: uninstallOrganizationId, userId: user.id, action: AuditAction.MODULE_STOCKS_UNINSTALLED, entityType: 'Module', entityId: 'stocks', entityName: 'Stocks' } });
    });

    return this.getDashboardSummary(user);
  }

  async installRnmPricesApplication(user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization setup is required before installing applications');
    }
    const organization = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { rnmPricesInstalledAt: new Date() },
    });
    await this.prisma.auditLog.create({ data: { organizationId: organization.id, userId: user.id, action: AuditAction.MODULE_RNM_PRICES_INSTALLED, entityType: 'Module', entityId: 'rnm-prices', entityName: 'Cours des Produits' } });
    return this.getDashboardSummary(user);
  }

  async uninstallRnmPricesApplication(user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization setup is required before uninstalling applications');
    }
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { rnmPricesInstalledAt: null } });
    await this.prisma.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: AuditAction.MODULE_RNM_PRICES_UNINSTALLED, entityType: 'Module', entityId: 'rnm-prices', entityName: 'Cours des Produits' } });
    return this.getDashboardSummary(user);
  }

  async installHaccpApplication(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before installing applications');
    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { haccpInstalledAt: true },
    });
    if (!organization) throw new ForbiddenException('Organization setup is required before installing applications');
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { haccpInstalledAt: organization.haccpInstalledAt ?? new Date() },
    });
    return this.getDashboardSummary(user);
  }

  async uninstallHaccpApplication(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before uninstalling applications');
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { haccpInstalledAt: null } });
    return this.getDashboardSummary(user);
  }

  async installHrApplication(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before installing applications');
    const organizationId = user.organizationId;
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { hrInstalledAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId, userId: user.id, action: AuditAction.MODULE_HR_INSTALLED, entityType: 'Module', entityId: 'hr', entityName: 'RH' } });
    });
    return this.getDashboardSummary(user);
  }

  async uninstallHrApplication(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before uninstalling applications');
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { hrInstalledAt: null } });
    await this.prisma.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: AuditAction.MODULE_HR_UNINSTALLED, entityType: 'Module', entityId: 'hr', entityName: 'RH' } });
    return this.getDashboardSummary(user);
  }

  async installPlanningApplication(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before installing applications');
    const organizationId = user.organizationId;
    let organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { hrInstalledAt: true, planningInstalledAt: true },
    });
    if (!organization) throw new ForbiddenException('Organization setup is required before installing applications');

    // Planning consumes the RH referential. Installing Planning therefore
    // provisions RH first, rather than presenting RH as a separate hidden
    // prerequisite. The user is then guided to complete its structure.
    if (!organization.hrInstalledAt) {
      await this.prisma.$transaction(async (tx) => {
        await tx.organization.update({
          where: { id: organizationId },
          data: { hrInstalledAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            userId: user.id,
            action: AuditAction.MODULE_HR_INSTALLED,
            entityType: 'Module',
            entityId: 'hr',
            entityName: 'RH',
            details: { source: 'planning-install' },
          },
        });
      });
      organization = { ...organization, hrInstalledAt: new Date() };
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { planningInstalledAt: organization?.planningInstalledAt ?? new Date() },
    });
    await this.prisma.auditLog.create({ data: { organizationId, userId: user.id, action: AuditAction.PLANNING_MODULE_INSTALLED, entityType: 'Module', entityId: 'planning', entityName: 'Planning' } });
    return this.getDashboardSummary(user);
  }

  async installProductionApplication(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before installing applications');
    const organization = await this.prisma.organization.findUnique({ where: { id: user.organizationId } });
    if (!organization?.stocksInstalledAt || !organization?.technicalSheetsInstalledAt) {
      throw new ForbiddenException('Stocks and Technical Sheets must be installed before Production');
    }
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { productionInstalledAt: new Date() } });
    await this.prisma.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: AuditAction.MODULE_PRODUCTION_INSTALLED, entityType: 'Module', entityId: 'production', entityName: 'Production' } });
    return this.getDashboardSummary(user);
  }

  async uninstallProductionApplication(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before uninstalling applications');
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { productionInstalledAt: null } });
    await this.prisma.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: AuditAction.MODULE_PRODUCTION_UNINSTALLED, entityType: 'Module', entityId: 'production', entityName: 'Production' } });
    return this.getDashboardSummary(user);
  }

  async uninstallPlanningApplication(user: AuthenticatedUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization setup is required before uninstalling applications');
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { planningInstalledAt: null } });
    await this.prisma.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: AuditAction.PLANNING_MODULE_UNINSTALLED, entityType: 'Module', entityId: 'planning', entityName: 'Planning' } });
    return this.getDashboardSummary(user);
  }

  async getDashboardSummary(user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization setup is required before reading dashboard summary');
    }

    const [currentUser, productCount, supplierCount, movementCount, hrCollaborators, technicalSheets, workspaceOnboarding] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.id },
        include: { role: { include: { permissions: { include: { permission: true } } } }, organization: true },
      }),
      this.prisma.product.count({ where: { organizationId: user.organizationId } }),
      this.prisma.supplier.count({ where: { organizationId: user.organizationId } }),
      this.prisma.stockMovement.count({ where: { organizationId: user.organizationId } }),
      this.prisma.hrEmployee.count({ where: { organizationId: user.organizationId, isArchived: false } }),
      this.prisma.technicalSheet.count({ where: { organizationId: user.organizationId, isArchived: false } }),
      this.prisma.workspaceOnboardingProgress.findUnique({
        where: { organizationId: user.organizationId },
      }),
    ]);

    if (!currentUser?.organization) {
      throw new ForbiddenException('Organization setup is required before reading dashboard summary');
    }

    const installedApplications = [
      ...(currentUser.organization.stocksInstalledAt ? ['stocks'] : []),
      ...(currentUser.organization.rnmPricesInstalledAt ? ['rnm-prices'] : []),
      ...(currentUser.organization.hrInstalledAt ? ['hr'] : []),
      ...(currentUser.organization.planningInstalledAt ? ['planning'] : []),
      ...(currentUser.organization.technicalSheetsInstalledAt ? ['technical-sheets'] : []),
      ...(currentUser.organization.productionInstalledAt ? ['production'] : []),
      ...(currentUser.organization.menusInstalledAt ? ['menus'] : []),
      ...(currentUser.organization.haccpInstalledAt ? ['haccp'] : []),
      ...(currentUser.organization.purchasingInstalledAt ? ['purchasing'] : []),
    ];
    const checklist = {
      applicationInstalled: installedApplications.length > 0,
      firstProductCreated: productCount > 0,
      supplierAdded: supplierCount > 0,
      stockMovementCreated: movementCount > 0,
    };
    const completedCount = Object.values(checklist).filter(Boolean).length;
    const activeUsersCount = await this.prisma.user.count({ where: { organizationId: user.organizationId, status: { not: UserStatus.DISABLED }, isActive: true } });

    const userPermissions = currentUser.role.permissions.map((rp) => rp.permission.key).sort();

    return {
      user: this.serializeUser(currentUser),
      organization: {
        id: currentUser.organizationId,
        name: currentUser.organization.name,
        establishmentType: currentUser.organization.establishmentType,
        hrCountryCode: currentUser.organization.hrCountryCode,
        regulatoryCountryCode: currentUser.organization.regulatoryCountryCode,
        regulatoryCountrySelectedAt: currentUser.organization.regulatoryCountrySelectedAt,
        regulatoryCountrySelectedById: currentUser.organization.regulatoryCountrySelectedById,
        teamSize: currentUser.organization.teamSize,
        logoDataUrl: currentUser.organization.logoDataUrl,
        mainSiteName: currentUser.organization.mainSiteName,
        primarySiteId: currentUser.organization.primarySiteId,
        apiKeys: this.serializeApiKeys(currentUser.organization),
        remoteAccess: this.serializeRemoteAccess(currentUser.organization),
      },
      installedApplications,
      counts: { products: productCount, suppliers: supplierCount, stockMovements: movementCount, activeUsers: activeUsersCount, hrCollaborators, technicalSheets },
      permissions: userPermissions,
      progress: { percent: completedCount * 25, checklist },
      workspaceOnboarding: this.serializeWorkspaceOnboarding(workspaceOnboarding, {
        id: currentUser.id,
        isPrimaryAdmin: currentUser.isPrimaryAdmin,
      }),
    };
  }

  async updateWorkspaceOnboarding(
    user: AuthenticatedUser,
    dto: UpdateWorkspaceOnboardingDto,
  ) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization setup is required before updating onboarding');
    }
    const progress = await this.prisma.workspaceOnboardingProgress.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (!progress || progress.ownerUserId !== user.id || !ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Only the workspace creator can update this guided tour');
    }

    const now = new Date();
    const updated = await this.prisma.workspaceOnboardingProgress.update({
      where: { organizationId: user.organizationId },
      data: {
        status: dto.status,
        currentStep: dto.currentStep,
        startedAt: progress.startedAt ?? now,
        ...(dto.status === 'DEFERRED' ? { deferredAt: now } : {}),
        ...(dto.status === 'COMPLETED' ? { completedAt: now } : {}),
      },
    });
    return this.serializeWorkspaceOnboarding(updated, { id: user.id, isPrimaryAdmin: true });
  }

  private serializeWorkspaceOnboarding(
    progress: {
      version: number;
      status: string;
      currentStep: string;
      ownerUserId: string;
      startedAt: Date | null;
      deferredAt: Date | null;
      completedAt: Date | null;
    } | null,
    user: { id: string; isPrimaryAdmin?: boolean },
  ) {
    const eligible = Boolean(
      progress &&
        progress.ownerUserId === user.id &&
        user.isPrimaryAdmin,
    );
    return {
      eligible,
      version: progress?.version ?? 1,
      status: eligible ? progress?.status ?? null : null,
      currentStep: eligible ? progress?.currentStep ?? null : null,
      startedAt: eligible ? progress?.startedAt?.toISOString() ?? null : null,
      deferredAt: eligible ? progress?.deferredAt?.toISOString() ?? null : null,
      completedAt: eligible ? progress?.completedAt?.toISOString() ?? null : null,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true, organization: true },
    });

    if (!user || !user.isActive || user.status === UserStatus.DISABLED) throw new UnauthorizedException('Invalid credentials');

    const passwordMatches = await compare(dto.password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException('Invalid credentials');

    const updatedLoginUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), status: user.status === UserStatus.INVITED ? UserStatus.ACTIVE : user.status, isActive: true },
      include: { role: true, organization: true },
    });

    return this.createSession(updatedLoginUser);
  }

  async listMobileUsers() {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        status: { not: UserStatus.DISABLED },
      },
      include: { role: true, organization: true },
      orderBy: [
        { isPrimaryAdmin: 'desc' },
        { lastLoginAt: 'desc' },
        { firstName: 'asc' },
        { lastName: 'asc' },
        { email: 'asc' },
      ],
    });

    return {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: this.displayName(user),
        role: user.role.name,
        organizationName: user.organization?.name ?? null,
        isPrimaryAdmin: user.isPrimaryAdmin,
        lastLoginAt: user.lastLoginAt,
      })),
    };
  }

  async createMobileDevSession() {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Mobile development sessions are disabled in production');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        status: { not: UserStatus.DISABLED },
      },
      include: { role: true, organization: true },
      orderBy: [
        { isPrimaryAdmin: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    if (!user) throw new UnauthorizedException('No active mobile development user available');
    return this.createSession(user);
  }

  private async seedConversions(tx: Prisma.TransactionClient, organizationId: string) {
    const units = await tx.unit.findMany({ where: { organizationId } });
    const bySymbol = Object.fromEntries(units.map((unit) => [unit.symbol, unit]));
    const pairs: Array<[string, string, string]> = [
      ['kg', 'g', '1000'],
      ['g', 'kg', '0.001'],
      ['L', 'mL', '1000'],
      ['mL', 'L', '0.001'],
    ];

    for (const [from, to, factor] of pairs) {
      if (!bySymbol[from] || !bySymbol[to]) continue;
      await tx.unitConversion.upsert({
        where: {
          organizationId_fromUnitId_toUnitId: {
            organizationId,
            fromUnitId: bySymbol[from].id,
            toUnitId: bySymbol[to].id,
          },
        },
        update: { factor },
        create: {
          organizationId,
          fromUnitId: bySymbol[from].id,
          toUnitId: bySymbol[to].id,
          factor,
        },
      });
    }
  }

  private createDefaultStockCategories(tx: Prisma.TransactionClient, organizationId: string) {
    return tx.category.createMany({
      data: DEFAULT_STOCK_CATEGORIES.map((name) => ({ organizationId, name })),
      skipDuplicates: true,
    });
  }

  private createDefaultStockUnits(tx: Prisma.TransactionClient, organizationId: string) {
    return tx.unit.createMany({
      data: DEFAULT_STOCK_UNITS.map((unit) => ({ ...unit, organizationId })),
      skipDuplicates: true,
    });
  }

  private primarySiteName(organizationName: string, primarySiteName?: string) {
    return primarySiteName?.trim() || `${organizationName.trim()} — Site principal`;
  }

  private secondarySiteNames(names: string[] | undefined, primarySiteName: string) {
    const primaryKey = primarySiteName.trim().toLowerCase();
    const seen = new Set<string>();
    const result: string[] = [];
    for (const rawName of names ?? []) {
      const name = rawName.trim();
      const key = name.toLowerCase();
      if (!name || key === primaryKey || seen.has(key)) continue;
      seen.add(key);
      result.push(name);
    }
    return result;
  }

  private createDefaultUnits(tx: Prisma.TransactionClient, organizationId: string) {
    return tx.unit.createMany({
      data: [
        { organizationId, name: 'Kilogramme', symbol: 'kg', type: UnitType.MASS },
        { organizationId, name: 'Gramme', symbol: 'g', type: UnitType.MASS },
        { organizationId, name: 'Litre', symbol: 'L', type: UnitType.VOLUME },
        { organizationId, name: 'Pièce', symbol: 'pc', type: UnitType.COUNT },
      ],
      skipDuplicates: true,
    });
  }

  private serializeUser(user: {
    id: string;
    username: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
    organizationId: string | null;
    role: { name: string; permissions?: Array<{ permission: Pick<Permission, 'key'> }> };
    status?: UserStatus;
    isActive?: boolean;
    isPrimaryAdmin?: boolean;
    lastLoginAt?: Date | null;
    organization: {
      name: string;
      establishmentType: string | null;
      hrCountryCode: string | null;
      regulatoryCountryCode?: string | null;
      regulatoryCountrySelectedAt?: Date | null;
      regulatoryCountrySelectedById?: string | null;
      teamSize: string | null;
      logoDataUrl: string | null;
      mainSiteName: string | null;
      primarySiteId?: string | null;
      stocksInstalledAt: Date | null;
      rnmPricesInstalledAt: Date | null;
      hrInstalledAt: Date | null;
      planningInstalledAt?: Date | null;
      technicalSheetsInstalledAt?: Date | null;
      productionInstalledAt?: Date | null;
      menusInstalledAt?: Date | null;
      haccpInstalledAt?: Date | null;
      purchasingInstalledAt?: Date | null;
        mistralApiKey?: string | null;
        mistralApiKeyUpdatedAt?: Date | null;
        resendApiKey?: string | null;
        resendApiKeyUpdatedAt?: Date | null;
        githubToken?: string | null;
        githubTokenUpdatedAt?: Date | null;
        tailscaleEnabled?: boolean | null;
        tailscaleHostname?: string | null;
        tailscaleUrl?: string | null;
        tailscaleIp?: string | null;
        tailscaleUpdatedAt?: Date | null;
    } | null;
  }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      organizationId: user.organizationId,
      organizationName: user.organization?.name ?? null,
      organizationType: user.organization?.establishmentType ?? null,
      hrCountryCode: user.organization?.hrCountryCode ?? null,
      regulatoryCountryCode: user.organization?.regulatoryCountryCode ?? null,
      regulatoryCountrySelectedAt: user.organization?.regulatoryCountrySelectedAt ?? null,
      regulatoryCountrySelectedById: user.organization?.regulatoryCountrySelectedById ?? null,
      teamSize: user.organization?.teamSize ?? null,
      logoUrl: user.organization?.logoDataUrl ?? null,
      logoDataUrl: user.organization?.logoDataUrl ?? null,
      mainSiteName: user.organization?.mainSiteName ?? null,
      primarySiteId: user.organization?.primarySiteId ?? null,
      apiKeys: user.organization ? this.serializeApiKeys(user.organization) : undefined,
      remoteAccess: user.organization ? this.serializeRemoteAccess(user.organization) : undefined,
      installedApplications: [
        ...(user.organization?.stocksInstalledAt ? ['stocks'] : []),
        ...(user.organization?.rnmPricesInstalledAt ? ['rnm-prices'] : []),
        ...(user.organization?.hrInstalledAt ? ['hr'] : []),
        ...(user.organization?.planningInstalledAt ? ['planning'] : []),
        ...(user.organization?.technicalSheetsInstalledAt ? ['technical-sheets'] : []),
        ...(user.organization?.productionInstalledAt ? ['production'] : []),
        ...(user.organization?.menusInstalledAt ? ['menus'] : []),
        ...(user.organization?.haccpInstalledAt ? ['haccp'] : []),
        ...(user.organization?.purchasingInstalledAt ? ['purchasing'] : []),
      ],
      role: user.role.name,
      status: 'status' in user ? user.status : undefined,
      isActive: 'isActive' in user ? user.isActive : undefined,
      isPrimaryAdmin: 'isPrimaryAdmin' in user ? user.isPrimaryAdmin : undefined,
      lastLoginAt: 'lastLoginAt' in user ? user.lastLoginAt : undefined,
      permissions: user.role.permissions?.map((rp) => rp.permission.key).sort() ?? [],
    };
  }

  private displayName(user: { firstName: string | null; lastName: string | null; username: string | null; email: string }) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name || user.username || user.email;
  }

  private async createSession(user: {
    id: string;
    username: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
    organizationId: string | null;
    role: { name: string; permissions?: Array<{ permission: Pick<Permission, 'key'> }> };
    status?: UserStatus;
    isActive?: boolean;
    isPrimaryAdmin?: boolean;
    lastLoginAt?: Date | null;
    organization?: {
      name: string;
      establishmentType: string | null;
      hrCountryCode: string | null;
      regulatoryCountryCode?: string | null;
      regulatoryCountrySelectedAt?: Date | null;
      regulatoryCountrySelectedById?: string | null;
      teamSize: string | null;
      logoDataUrl: string | null;
      mainSiteName: string | null;
      primarySiteId?: string | null;
      stocksInstalledAt: Date | null;
      rnmPricesInstalledAt: Date | null;
      hrInstalledAt: Date | null;
      planningInstalledAt?: Date | null;
      technicalSheetsInstalledAt?: Date | null;
      productionInstalledAt?: Date | null;
      menusInstalledAt?: Date | null;
      purchasingInstalledAt?: Date | null;
      mistralApiKey?: string | null;
      mistralApiKeyUpdatedAt?: Date | null;
      resendApiKey?: string | null;
      resendApiKeyUpdatedAt?: Date | null;
      githubToken?: string | null;
      githubTokenUpdatedAt?: Date | null;
      tailscaleEnabled?: boolean | null;
      tailscaleHostname?: string | null;
      tailscaleUrl?: string | null;
      tailscaleIp?: string | null;
      tailscaleUpdatedAt?: Date | null;
    } | null;
  }) {
    const sessionEpoch = (await this.prisma.systemSetting.findUnique({ where: { key: AUTH_SESSION_EPOCH_KEY } }))?.value;
    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role.name,
      ...(sessionEpoch ? { sessionEpoch } : {}),
    };

    return {
      accessToken: await this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET', 'change-me-in-development'),
        expiresIn: this.configService.get<'8h' | '1d' | '7d'>('JWT_EXPIRES_IN') ?? '8h',
      }),
      user: this.serializeUser({ ...user, organization: user.organization ?? null }),
    };
  }

  private serializeApiKeys(organization: {
    mistralApiKey?: string | null;
    mistralApiKeyUpdatedAt?: Date | null;
    resendApiKey?: string | null;
    resendApiKeyEncrypted?: string | null;
    resendApiKeyMask?: string | null;
    resendApiKeyUpdatedAt?: Date | null;
    githubToken?: string | null;
    githubTokenUpdatedAt?: Date | null;
  }) {
    return {
      mistral: {
        configured: Boolean(organization.mistralApiKey),
        masked: organization.mistralApiKey ? this.maskSecret(organization.mistralApiKey) : null,
        updatedAt: organization.mistralApiKeyUpdatedAt ?? null,
      },
      resend: {
        ...this.apiKeySecrets.publicSummary({
          resendApiKey: organization.resendApiKey ?? null,
          resendApiKeyEncrypted: organization.resendApiKeyEncrypted ?? null,
          resendApiKeyMask: organization.resendApiKeyMask ?? null,
          resendApiKeyUpdatedAt: organization.resendApiKeyUpdatedAt ?? null,
        }),
      },
      github: {
        configured: Boolean(organization.githubToken),
        masked: organization.githubToken ? this.maskSecret(organization.githubToken) : null,
        updatedAt: organization.githubTokenUpdatedAt ?? null,
      },
    };
  }

  private serializeRemoteAccess(organization: { tailscaleEnabled?: boolean | null; tailscaleHostname?: string | null; tailscaleUrl?: string | null; tailscaleIp?: string | null; tailscaleUpdatedAt?: Date | null }) {
    return {
      enabled: Boolean(organization.tailscaleEnabled),
      tailscaleHostname: organization.tailscaleHostname ?? null,
      tailscaleUrl: organization.tailscaleUrl ?? null,
      tailscaleIp: organization.tailscaleIp ?? null,
      updatedAt: organization.tailscaleUpdatedAt ?? null,
    };
  }

  private maskSecret(secret: string) {
    if (secret.length <= 10) return '••••';
    return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
  }

  private normalizeRegulatoryCountry(value?: string | null) {
    if (value == null || value === '') return null;
    const normalized = String(value).trim().toUpperCase();
    if (normalized === 'FR' || normalized === 'FI') return normalized;
    throw new BadRequestException('Pays de réglementation invalide');
  }

}

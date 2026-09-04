import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PurchasingDeliveryMode } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { StocksService } from '../stocks/stocks.service';
import { UpdatePurchasingOnboardingDto, UpdatePurchasingSettingsDto } from './dto/purchasing.dto';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { PurchasingContextService } from './purchasing-context.service';
import { PurchasingDeliveryService } from './purchasing-delivery.service';
import {
  PURCHASING_EMAIL_TRANSPORT,
  type PurchasingEmailTransport,
} from './purchasing-email.transport';

@Injectable()
export class PurchasingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PurchasingContextService,
    private readonly policy: PurchaseOrderPolicy,
    private readonly delivery: PurchasingDeliveryService,
    private readonly stocks: StocksService,
    @Inject(PURCHASING_EMAIL_TRANSPORT)
    private readonly emailTransport: PurchasingEmailTransport,
  ) {}

  async bootstrap(organizationId: string, actor: AuthenticatedUser) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.read');
    const [settings, onboarding, units, sites, locations] = await Promise.all([
      this.context.ensureSettings(organizationId),
      this.prisma.purchasingOnboardingProgress.upsert({
        where: { organizationId },
        update: {},
        create: { organizationId },
      }),
      this.prisma.unit.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { name: 'asc' },
      }),
      this.prisma.site.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { name: 'asc' },
      }),
      this.prisma.location.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      installed: true,
      organizationId,
      settings: this.context.publicSettings(settings),
      onboarding,
      suppliers: [],
      products: [],
      units,
      sites,
      locations,
      permissions: this.policy.effectivePermissions(actor),
      canManageProductFavorites: this.stocks.canManageProductFavorites(actor),
    };
  }

  async assertManage(organizationId: string, actor: AuthenticatedUser) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.manage');
  }

  async update(organizationId: string, actor: AuthenticatedUser, dto: UpdatePurchasingSettingsDto) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.manage');
    const current = await this.context.ensureSettings(organizationId);
    const settings = await this.prisma.purchasingSettings.update({
      where: { id: current.id, organizationId },
      data: this.context.settingsUpdate(dto),
      include: {
        organization: {
          select: { resendApiKey: true, resendApiKeyEncrypted: true, resendApiKeyMask: true },
        },
      },
    });
    return this.context.publicSettings(settings);
  }

  async testResend(organizationId: string, actor: AuthenticatedUser) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.manage');
    const settings = await this.context.ensureSettings(organizationId);
    const result = await this.emailTransport.verify(settings, organizationId);
    await this.prisma.purchasingSettings.update({
      where: { id: settings.id, organizationId },
      data: { resendVerifiedAt: new Date(), resendLastTestEmailId: result.emailId },
    });
    return result;
  }

  async updateOnboarding(
    organizationId: string,
    actor: AuthenticatedUser,
    dto: UpdatePurchasingOnboardingDto,
  ) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.manage');
    return this.prisma.purchasingOnboardingProgress.upsert({
      where: { organizationId },
      update: {
        currentStep: dto.currentStep,
        completedSteps: [...new Set(dto.completedSteps)],
        skippedEmailSetup: dto.skippedEmailSetup,
        completedAt: dto.completed ? new Date() : undefined,
      },
      create: {
        organizationId,
        currentStep: dto.currentStep,
        completedSteps: [...new Set(dto.completedSteps)],
        skippedEmailSetup: dto.skippedEmailSetup ?? false,
        completedAt: dto.completed ? new Date() : undefined,
      },
    });
  }

  async deliveryOptions(
    organizationId: string,
    actor: AuthenticatedUser,
    supplierId: string,
    from?: string,
  ) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.read');
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId, isArchived: false },
      include: { purchasingProfile: true },
    });
    if (!supplier) throw new NotFoundException('Fournisseur introuvable.');
    const profile = supplier.purchasingProfile ?? {
      deliveryMode: PurchasingDeliveryMode.ON_DEMAND,
      deliveryWeekdays: [],
      cutoffTime: null,
      timezone: 'UTC',
      leadTimeDays: 1,
    };
    const dates = this.delivery.options(profile, from ? new Date(from) : new Date(), 24);
    return {
      mode: profile.deliveryMode,
      timezone: profile.timezone,
      leadTimeDays: profile.leadTimeDays,
      dates,
      earliest: dates[0] ?? null,
    };
  }

  async assertReceiptUpload(organizationId: string, actor: AuthenticatedUser, orderId: string) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.receive');
    await this.context.ensureOrder(organizationId, orderId);
  }
}

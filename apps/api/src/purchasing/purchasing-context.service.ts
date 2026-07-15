import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PublicPurchasingSettingsSource = {
  id: string;
  defaultCurrency: string;
  replenishmentDays: number;
  consumptionWindowDays: number;
  fromEmail: string | null;
  fromName: string | null;
  replyTo: string | null;
  resendVerifiedAt: Date | null;
  resendLastTestEmailId: string | null;
  updatedAt: Date;
  organization?: {
    resendApiKey: string | null;
    resendApiKeyEncrypted: string | null;
    resendApiKeyMask: string | null;
  } | null;
};

@Injectable()
export class PurchasingContextService {
  constructor(private readonly prisma: PrismaService) {}

  async assertInstalled(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { stocksInstalledAt: true, purchasingInstalledAt: true },
    });
    if (!organization?.stocksInstalledAt)
      throw new BadRequestException('Le module Stocks doit être installé avant Achats.');
    if (!organization.purchasingInstalledAt)
      throw new BadRequestException('Le module Achats n’est pas installé.');
  }

  ensureSettings(organizationId: string) {
    return this.prisma.purchasingSettings.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
      include: {
        organization: {
          select: {
            resendApiKey: true,
            resendApiKeyEncrypted: true,
            resendApiKeyMask: true,
          },
        },
      },
    });
  }

  async ensureSupplier(organizationId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId, isArchived: false },
      include: { purchasingProfile: true },
    });
    if (!supplier) throw new NotFoundException('Fournisseur introuvable.');
    return supplier;
  }

  async ensureSite(organizationId: string, id: string) {
    const site = await this.prisma.site.findFirst({
      where: { id, organizationId, isArchived: false },
    });
    if (!site) throw new NotFoundException('Site introuvable.');
    return site;
  }

  async ensureLocation(organizationId: string, id: string, siteId?: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, organizationId, siteId, isArchived: false },
    });
    if (!location) throw new NotFoundException('Emplacement introuvable sur ce site.');
    return location;
  }

  async ensureOrder(organizationId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Commande introuvable.');
    return order;
  }

  publicSettings(settings: PublicPurchasingSettingsSource) {
    return {
      id: settings.id,
      defaultCurrency: settings.defaultCurrency,
      replenishmentDays: settings.replenishmentDays,
      consumptionWindowDays: settings.consumptionWindowDays,
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
      replyTo: settings.replyTo,
      resendApiKeyConfigured: Boolean(
        settings.organization?.resendApiKey || settings.organization?.resendApiKeyEncrypted,
      ),
      resendVerifiedAt: settings.resendVerifiedAt,
      resendLastTestEmailId: settings.resendLastTestEmailId,
      updatedAt: settings.updatedAt,
    };
  }

  settingsUpdate(dto: {
    defaultCurrency?: string;
    replenishmentDays?: number;
    consumptionWindowDays?: number;
    fromEmail?: string;
    fromName?: string;
    replyTo?: string;
  }): Prisma.PurchasingSettingsUpdateInput {
    return {
      defaultCurrency: dto.defaultCurrency?.toUpperCase(),
      replenishmentDays: dto.replenishmentDays,
      consumptionWindowDays: dto.consumptionWindowDays,
      fromEmail: dto.fromEmail,
      fromName: dto.fromName,
      replyTo: dto.replyTo,
      resendVerifiedAt:
        dto.fromEmail !== undefined || dto.fromName !== undefined || dto.replyTo !== undefined
          ? null
          : undefined,
    };
  }
}

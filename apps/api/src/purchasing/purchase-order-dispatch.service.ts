import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseDispatchService } from './purchase-dispatch.service';
import { PurchaseOrderPdfService } from './purchase-order-pdf.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';
import { assertMinimumOrder } from './purchasing-calculations';
import { PurchasingContextService } from './purchasing-context.service';
import { PurchasingDeliveryService } from './purchasing-delivery.service';
import {
  PURCHASING_EMAIL_TRANSPORT,
  type PurchaseOrderEmailDocument,
  type PurchasingEmailTransport,
} from './purchasing-email.transport';
import { purchaseOrderInclude, purchaseOrderSnapshot } from './purchasing-records';

@Injectable()
export class PurchaseOrderDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PurchasingContextService,
    private readonly policy: PurchaseOrderPolicy,
    private readonly delivery: PurchasingDeliveryService,
    private readonly dispatches: PurchaseDispatchService,
    private readonly pdf: PurchaseOrderPdfService,
    @Inject(PURCHASING_EMAIL_TRANSPORT)
    private readonly emailTransport: PurchasingEmailTransport,
  ) {}

  async send(
    organizationId: string,
    actor: AuthenticatedUser,
    id: string,
    idempotencyKey: string,
    recipientOverride?: string,
  ) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.send');
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: { ...purchaseOrderInclude(true), organization: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (!order.lines.length)
      throw new BadRequestException('Ajoutez au moins une ligne avant l’envoi.');
    const recipient =
      recipientOverride?.trim() || order.supplier.purchasingProfile?.orderEmail?.trim();
    if (!recipient)
      throw new BadRequestException(
        'E-mail de commande fournisseur requis. Ajoutez-le dans Stocks > Fournisseurs avant l’envoi.',
      );
    if (order.expectedDeliveryDate)
      this.delivery.assertAllowed(
        order.supplier.purchasingProfile,
        order.expectedDeliveryDate.toISOString(),
      );
    const minimumOrder = new Prisma.Decimal(order.supplier.purchasingProfile?.minimumOrder ?? 0);
    const productSubtotal = new Prisma.Decimal(order.totalExcludingTax).sub(
      order.deliveryFeeSnapshot ?? 0,
    );
    assertMinimumOrder(productSubtotal, minimumOrder);
    const settings = await this.context.ensureSettings(organizationId);
    if (!settings.resendVerifiedAt)
      throw new BadRequestException('Testez et validez la clé API Resend avant le premier envoi.');
    const reservation = await this.dispatches.reserve({
      organizationId,
      orderId: id,
      orderNumber: order.number,
      idempotencyKey,
      recipient,
      snapshot: purchaseOrderSnapshot(order) as Prisma.InputJsonValue,
    });
    if (reservation.existing) return reservation.dispatch;
    const dispatch = reservation.dispatch;
    try {
      const document = order as unknown as PurchaseOrderEmailDocument;
      const attachment = await this.pdf.build(document);
      const result = await this.emailTransport.sendOrder(
        settings,
        document,
        attachment,
        recipient,
        dispatch.idempotencyKey,
      );
      return await this.dispatches.complete({
        organizationId,
        orderId: id,
        orderNumber: order.number,
        actorId: actor.id,
        dispatchId: dispatch.id,
        recipient,
        providerMessageId: result.messageId,
        subject: result.subject,
      });
    } catch (error) {
      const message = await this.dispatches.fail(
        {
          organizationId,
          orderId: id,
          orderNumber: order.number,
          actorId: actor.id,
          dispatchId: dispatch.id,
        },
        error,
      );
      throw new BadRequestException(`La commande n’a pas été marquée envoyée : ${message}`);
    }
  }

  async document(organizationId: string, actor: AuthenticatedUser, id: string) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.read');
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: { ...purchaseOrderInclude(true), organization: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    return {
      filename: `${order.number}.pdf`,
      buffer: await this.pdf.build(order as unknown as PurchaseOrderEmailDocument),
    };
  }
}

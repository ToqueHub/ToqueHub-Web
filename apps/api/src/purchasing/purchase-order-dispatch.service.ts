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
import { PurchasingEmailConnectionService } from './purchasing-email-connection.service';
import { PurchasingEmailTemplateService } from './purchasing-email-template.service';

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
    private readonly connections: PurchasingEmailConnectionService,
    private readonly templates: PurchasingEmailTemplateService,
  ) {}

  async send(
    organizationId: string,
    actor: AuthenticatedUser,
    id: string,
    idempotencyKey: string,
    recipientOverride?: string,
    subjectOverride?: string,
    bodyOverride?: string,
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
    const recipient = recipientOverride?.trim() || order.supplier.purchasingProfile?.orderEmail?.trim() || order.supplier.email?.trim();
    if (!recipient)
      throw new BadRequestException(
        'E-mail de commande fournisseur requis. Ajoutez un e-mail Achats ou un e-mail de contact dans Stocks > Fournisseurs avant l’envoi.',
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
    const connection = await this.connections.active(organizationId);
    if (!connection && !settings.resendVerifiedAt)
      throw new BadRequestException('Connectez et testez une messagerie avant le premier envoi.');
    const email = this.templates.render({
      order,
      senderName: connection?.senderName || settings.fromName || order.organization?.name || 'ToqueHub',
      subjectTemplate: subjectOverride || order.supplier.purchasingProfile?.emailSubjectTemplate || settings.emailSubjectTemplate,
      bodyTemplate: bodyOverride || order.supplier.purchasingProfile?.emailBodyTemplate || settings.emailBodyTemplate,
      signature: order.supplier.purchasingProfile?.emailSignature || settings.emailSignature,
    });
    const reservation = await this.dispatches.reserve({
      organizationId,
      orderId: id,
      orderNumber: order.number,
      idempotencyKey,
      recipient,
      snapshot: { order: purchaseOrderSnapshot(order), email: { recipient, subject: email.subject, body: email.text } } as Prisma.InputJsonValue,
      provider: connection?.provider || 'RESEND',
      senderEmail: connection?.senderEmail || settings.fromEmail,
      senderName: connection?.senderName || settings.fromName,
      renderedBody: email.text,
    });
    if (reservation.existing) return reservation.dispatch;
    const dispatch = reservation.dispatch;
    try {
      const document = order as unknown as PurchaseOrderEmailDocument;
      const attachment = await this.pdf.build(document);
      const result = connection
        ? await this.connections.send({ organizationId, recipient, subject: email.subject, text: email.text, pdf: attachment, filename: `${order.number}.pdf` })
        : await this.emailTransport.sendOrder(settings, document, attachment, recipient, dispatch.idempotencyKey);
      return await this.dispatches.complete({
        organizationId,
        orderId: id,
        orderNumber: order.number,
        actorId: actor.id,
        dispatchId: dispatch.id,
        recipient,
        providerMessageId: result.messageId,
        subject: 'subject' in result ? result.subject : email.subject,
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

  async preview(organizationId: string, actor: AuthenticatedUser, id: string, recipientOverride?: string) {
    await this.context.assertInstalled(organizationId);
    this.policy.assertPermission(actor, 'purchasing.send');
    const order = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId }, include: { ...purchaseOrderInclude(true), organization: true } });
    if (!order) throw new NotFoundException('Commande introuvable.');
    const settings = await this.context.ensureSettings(organizationId);
    const connection = await this.connections.active(organizationId);
    const recipient = recipientOverride?.trim() || order.supplier.purchasingProfile?.orderEmail?.trim() || order.supplier.email?.trim() || null;
    const rendered = this.templates.render({ order, senderName: connection?.senderName || settings.fromName || order.organization?.name || 'ToqueHub', subjectTemplate: order.supplier.purchasingProfile?.emailSubjectTemplate || settings.emailSubjectTemplate, bodyTemplate: order.supplier.purchasingProfile?.emailBodyTemplate || settings.emailBodyTemplate, signature: order.supplier.purchasingProfile?.emailSignature || settings.emailSignature });
    return { recipient, senderEmail: connection?.senderEmail || settings.fromEmail, senderName: connection?.senderName || settings.fromName || order.organization?.name, provider: connection?.provider || 'RESEND', ...rendered };
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

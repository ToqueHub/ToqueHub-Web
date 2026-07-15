import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseDispatchStatus, PurchaseOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';

const SENDING_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class PurchaseDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PurchaseOrderPolicy,
  ) {}

  reserve(input: {
    organizationId: string;
    orderId: string;
    orderNumber: string;
    idempotencyKey: string;
    recipient: string;
    snapshot: Prisma.InputJsonValue;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`purchase-send:${input.orderId}`})::bigint)`;
      const current = await tx.purchaseOrder.findFirst({
        where: { id: input.orderId, organizationId: input.organizationId },
        select: { status: true },
      });
      if (!current) throw new NotFoundException('Commande introuvable.');
      const existing = await tx.purchaseOrderDispatch.findFirst({
        where: {
          organizationId: input.organizationId,
          orderId: input.orderId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing?.status === PurchaseDispatchStatus.SENT)
        return { dispatch: existing, existing: true as const };
      this.policy.assertTransition(current.status, PurchaseOrderStatus.SENT);
      const existingAt = existing?.attemptedAt ?? existing?.createdAt;
      if (
        existing?.status === PurchaseDispatchStatus.SENDING &&
        existingAt &&
        existingAt.getTime() > now.getTime() - SENDING_TIMEOUT_MS
      )
        throw new ConflictException('Un envoi de cette commande est déjà en cours.');
      if (existing) {
        const dispatch = await tx.purchaseOrderDispatch.update({
          where: { id: existing.id, organizationId: input.organizationId },
          data: {
            status: PurchaseDispatchStatus.SENDING,
            recipient: input.recipient,
            snapshot: input.snapshot,
            attemptedAt: now,
            errorMessage: null,
          },
        });
        return { dispatch, existing: false as const };
      }
      const active = await tx.purchaseOrderDispatch.findFirst({
        where: {
          organizationId: input.organizationId,
          orderId: input.orderId,
          status: PurchaseDispatchStatus.SENDING,
        },
        orderBy: { attemptedAt: 'desc' },
      });
      const activeAt = active?.attemptedAt ?? active?.createdAt;
      if (active && activeAt && activeAt.getTime() > now.getTime() - SENDING_TIMEOUT_MS)
        throw new ConflictException('Un envoi de cette commande est déjà en cours.');
      if (active)
        await tx.purchaseOrderDispatch.update({
          where: { id: active.id, organizationId: input.organizationId },
          data: {
            status: PurchaseDispatchStatus.FAILED,
            errorMessage: 'Tentative Resend interrompue avant confirmation.',
          },
        });
      const dispatch = await tx.purchaseOrderDispatch.create({
        data: {
          organizationId: input.organizationId,
          orderId: input.orderId,
          idempotencyKey: input.idempotencyKey,
          status: PurchaseDispatchStatus.SENDING,
          recipient: input.recipient,
          subject: `Commande ${input.orderNumber}`,
          snapshot: input.snapshot,
          attemptedAt: now,
        },
      });
      return { dispatch, existing: false as const };
    });
  }

  complete(input: {
    organizationId: string;
    orderId: string;
    orderNumber: string;
    actorId: string;
    dispatchId: string;
    recipient: string;
    providerMessageId: string | null;
    subject: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const dispatch = await tx.purchaseOrderDispatch.findFirst({
        where: {
          id: input.dispatchId,
          organizationId: input.organizationId,
          orderId: input.orderId,
        },
      });
      if (!dispatch) throw new NotFoundException('Tentative d’envoi introuvable.');
      const sent = await tx.purchaseOrderDispatch.update({
        where: { id: input.dispatchId, organizationId: input.organizationId },
        data: {
          status: PurchaseDispatchStatus.SENT,
          providerMessageId: input.providerMessageId,
          subject: input.subject,
          sentAt: new Date(),
          errorMessage: null,
        },
      });
      const orderUpdate = await tx.purchaseOrder.updateMany({
        where: {
          id: input.orderId,
          organizationId: input.organizationId,
          status: PurchaseOrderStatus.DRAFT,
        },
        data: {
          status: PurchaseOrderStatus.SENT,
          sentAt: new Date(),
          sentById: input.actorId,
          supplierEmailSnapshot: input.recipient,
        },
      });
      if (orderUpdate.count !== 1)
        throw new ConflictException('La commande a changé pendant sa confirmation d’envoi.');
      await tx.purchaseOrderEvent.create({
        data: {
          organizationId: input.organizationId,
          orderId: input.orderId,
          actorUserId: input.actorId,
          type: 'SENT',
          summary: `Commande ${input.orderNumber} envoyée à ${input.recipient}`,
          details: { dispatchId: input.dispatchId },
        },
      });
      return sent;
    });
  }

  async fail(
    input: {
      organizationId: string;
      orderId: string;
      orderNumber: string;
      actorId: string;
      dispatchId: string;
    },
    error: unknown,
  ) {
    const message = this.secureError(error);
    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderDispatch.updateMany({
        where: { id: input.dispatchId, organizationId: input.organizationId },
        data: { status: PurchaseDispatchStatus.FAILED, errorMessage: message },
      });
      await tx.purchaseOrderEvent.create({
        data: {
          organizationId: input.organizationId,
          orderId: input.orderId,
          actorUserId: input.actorId,
          type: 'SEND_FAILED',
          summary: `Échec d’envoi de ${input.orderNumber}`,
          details: { dispatchId: input.dispatchId, error: message },
        },
      });
    });
    return message;
  }

  secureError(error: unknown) {
    const raw = error instanceof Error ? error.message : 'Échec de l’envoi Resend';
    return raw
      .replace(/Bearer\s+[^\s]+/gi, 'Bearer [masqué]')
      .replace(/\bre_[A-Za-z0-9_-]{8,}\b/g, 're_[masqué]')
      .slice(0, 1000);
  }
}

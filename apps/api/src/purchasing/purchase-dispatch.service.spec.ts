import { PurchaseDispatchStatus, PurchaseOrderStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { PurchaseDispatchService } from './purchase-dispatch.service';
import { PurchaseOrderPolicy } from './purchase-order.policy';

type DispatchRecord = {
  id: string;
  organizationId: string;
  orderId: string;
  idempotencyKey: string;
  status: PurchaseDispatchStatus;
  attemptedAt: Date;
  createdAt: Date;
};

function harness(existing: DispatchRecord | null = null, active: DispatchRecord | null = null) {
  const created: DispatchRecord = {
    id: 'dispatch-new',
    organizationId: 'org-1',
    orderId: 'order-1',
    idempotencyKey: 'stable-key',
    status: PurchaseDispatchStatus.SENDING,
    attemptedAt: new Date('2026-07-15T10:00:00.000Z'),
    createdAt: new Date('2026-07-15T10:00:00.000Z'),
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    purchaseOrder: {
      findFirst: jest.fn().mockResolvedValue({ status: PurchaseOrderStatus.DRAFT }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    purchaseOrderDispatch: {
      findFirst: jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(active),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    purchaseOrderEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    purchaseOrderDispatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    tx,
    prisma,
    service: new PurchaseDispatchService(
      prisma as unknown as PrismaService,
      new PurchaseOrderPolicy(),
    ),
  };
}

const reservation = {
  organizationId: 'org-1',
  orderId: 'order-1',
  orderNumber: 'CA-2026-00001',
  idempotencyKey: 'stable-key',
  recipient: 'orders@supplier.example',
  snapshot: { number: 'CA-2026-00001' },
  now: new Date('2026-07-15T10:00:00.000Z'),
};

describe('PurchaseDispatchService', () => {
  it('marks the order SENT only inside provider-confirmation completion', async () => {
    const sending: DispatchRecord = {
      id: 'dispatch-sending',
      organizationId: 'org-1',
      orderId: 'order-1',
      idempotencyKey: 'stable-key',
      status: PurchaseDispatchStatus.SENDING,
      attemptedAt: reservation.now,
      createdAt: reservation.now,
    };
    const setup = harness(sending);

    const result = await setup.service.complete({
      organizationId: 'org-1',
      orderId: 'order-1',
      orderNumber: 'CA-2026-00001',
      actorId: 'user-1',
      dispatchId: sending.id,
      recipient: 'orders@supplier.example',
      providerMessageId: 'provider-message-1',
      subject: 'Commande CA-2026-00001',
    });

    expect(result.status).toBe(PurchaseDispatchStatus.SENT);
    expect(setup.tx.purchaseOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: PurchaseOrderStatus.DRAFT }),
        data: expect.objectContaining({ status: PurchaseOrderStatus.SENT }),
      }),
    );
    expect(setup.tx.purchaseOrderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SENT' }) }),
    );
  });

  it('returns the same logical attempt after provider confirmation', async () => {
    const existing: DispatchRecord = {
      id: 'dispatch-sent',
      organizationId: 'org-1',
      orderId: 'order-1',
      idempotencyKey: 'stable-key',
      status: PurchaseDispatchStatus.SENT,
      attemptedAt: reservation.now,
      createdAt: reservation.now,
    };
    const setup = harness(existing);
    const result = await setup.service.reserve(reservation);
    expect(result).toEqual({ dispatch: existing, existing: true });
    expect(setup.tx.purchaseOrderDispatch.create).not.toHaveBeenCalled();
  });

  it('retries a failed logical attempt with the same database row and key', async () => {
    const failed: DispatchRecord = {
      id: 'dispatch-failed',
      organizationId: 'org-1',
      orderId: 'order-1',
      idempotencyKey: 'stable-key',
      status: PurchaseDispatchStatus.FAILED,
      attemptedAt: new Date('2026-07-15T09:00:00.000Z'),
      createdAt: new Date('2026-07-15T09:00:00.000Z'),
    };
    const setup = harness(failed);
    const result = await setup.service.reserve(reservation);
    expect(result.existing).toBe(false);
    expect(result.dispatch.id).toBe('dispatch-failed');
    expect(result.dispatch.status).toBe(PurchaseDispatchStatus.SENDING);
    expect(setup.tx.purchaseOrderDispatch.create).not.toHaveBeenCalled();
  });

  it('blocks a second click while SENDING is still fresh', async () => {
    const sending: DispatchRecord = {
      id: 'dispatch-active',
      organizationId: 'org-1',
      orderId: 'order-1',
      idempotencyKey: 'stable-key',
      status: PurchaseDispatchStatus.SENDING,
      attemptedAt: new Date('2026-07-15T09:59:00.000Z'),
      createdAt: new Date('2026-07-15T09:59:00.000Z'),
    };
    await expect(harness(sending).service.reserve(reservation)).rejects.toThrow('déjà en cours');
  });

  it('recovers a stale SENDING attempt without creating a duplicate row', async () => {
    const stale: DispatchRecord = {
      id: 'dispatch-stale',
      organizationId: 'org-1',
      orderId: 'order-1',
      idempotencyKey: 'stable-key',
      status: PurchaseDispatchStatus.SENDING,
      attemptedAt: new Date('2026-07-15T09:40:00.000Z'),
      createdAt: new Date('2026-07-15T09:40:00.000Z'),
    };
    const setup = harness(stale);
    const result = await setup.service.reserve(reservation);
    expect(result.dispatch.id).toBe('dispatch-stale');
    expect(setup.tx.purchaseOrderDispatch.create).not.toHaveBeenCalled();
  });

  it('sanitizes provider secrets before persisting an error', async () => {
    const setup = harness();
    const message = await setup.service.fail(
      {
        organizationId: 'org-1',
        orderId: 'order-1',
        orderNumber: 'CA-2026-00001',
        actorId: 'user-1',
        dispatchId: 'dispatch-1',
      },
      new Error('Authorization Bearer top-secret re_12345678901234567890'),
    );
    expect(message).toBe('Authorization Bearer [masqué] re_[masqué]');
    expect(setup.tx.purchaseOrderDispatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dispatch-1', organizationId: 'org-1' } }),
    );
    expect(setup.tx.purchaseOrderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SEND_FAILED' }) }),
    );
  });
});

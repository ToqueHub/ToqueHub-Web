import { PurchaseOrderStatus } from '@prisma/client';
import { PurchaseOrderPolicy } from './purchase-order.policy';

describe('PurchaseOrderPolicy', () => {
  const policy = new PurchaseOrderPolicy();

  it.each([
    'purchasing.read',
    'purchasing.draft',
    'purchasing.write',
    'purchasing.send',
    'purchasing.receive',
    'purchasing.manage',
  ])('enforces %s on the backend', (permission) => {
    expect(() =>
      policy.assertPermission({ role: 'Utilisateur', permissions: [] }, permission),
    ).toThrow(permission);
    expect(() =>
      policy.assertPermission({ role: 'Utilisateur', permissions: [permission] }, permission),
    ).not.toThrow();
  });

  it.each([
    [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT],
    [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.CANCELLED],
    [PurchaseOrderStatus.SENT, PurchaseOrderStatus.ACKNOWLEDGED],
    [PurchaseOrderStatus.SENT, PurchaseOrderStatus.CANCELLED],
    [PurchaseOrderStatus.ACKNOWLEDGED, PurchaseOrderStatus.PARTIALLY_RECEIVED],
    [PurchaseOrderStatus.ACKNOWLEDGED, PurchaseOrderStatus.RECEIVED],
    [PurchaseOrderStatus.PARTIALLY_RECEIVED, PurchaseOrderStatus.RECEIVED],
    [PurchaseOrderStatus.PARTIALLY_RECEIVED, PurchaseOrderStatus.CLOSED],
  ])('allows %s -> %s', (from, to) => {
    expect(policy.canTransition(from, to)).toBe(true);
    expect(() => policy.assertTransition(from, to)).not.toThrow();
  });

  it.each([
    [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.RECEIVED],
    [PurchaseOrderStatus.SENT, PurchaseOrderStatus.CLOSED],
    [PurchaseOrderStatus.PARTIALLY_RECEIVED, PurchaseOrderStatus.CANCELLED],
    [PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.DRAFT],
    [PurchaseOrderStatus.CLOSED, PurchaseOrderStatus.RECEIVED],
    [PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.SENT],
  ])('rejects %s -> %s', (from, to) => {
    expect(policy.canTransition(from, to)).toBe(false);
    expect(() => policy.assertTransition(from, to)).toThrow('Transition de commande interdite');
  });

  it('protects another user draft with purchasing.write', () => {
    expect(() =>
      policy.assertDraftOwner(
        { id: 'user-2', role: 'Utilisateur', permissions: ['purchasing.draft'] },
        { createdById: 'user-1' },
      ),
    ).toThrow('purchasing.write');
    expect(() =>
      policy.assertDraftOwner(
        { id: 'manager', role: 'Manager', permissions: ['purchasing.write'] },
        { createdById: 'user-1' },
      ),
    ).not.toThrow();
  });

  it.each([
    PurchaseOrderStatus.SENT,
    PurchaseOrderStatus.ACKNOWLEDGED,
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
    PurchaseOrderStatus.RECEIVED,
    PurchaseOrderStatus.CLOSED,
    PurchaseOrderStatus.CANCELLED,
  ])('makes a %s order immutable', (status) => {
    expect(() => policy.assertMutable(status)).toThrow(
      'Une commande envoyée ne peut plus être modifiée',
    );
  });

  it('keeps only drafts mutable', () => {
    expect(() => policy.assertMutable(PurchaseOrderStatus.DRAFT)).not.toThrow();
  });
});

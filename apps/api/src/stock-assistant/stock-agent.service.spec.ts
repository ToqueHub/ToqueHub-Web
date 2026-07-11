import { StockAgentService } from './stock-agent.service';

function service(overrides: Partial<{ prisma: any; mistral: any; matching: any }> = {}) {
  const prisma = overrides.prisma || {
    stockAssistantMessage: { findMany: jest.fn(async () => []) },
    location: { findMany: jest.fn(async () => []) },
    supplier: { findMany: jest.fn(async () => []) },
    unit: { findMany: jest.fn(async () => []) },
  };
  const mistral = overrides.mistral || { chatJson: jest.fn() };
  const matching = overrides.matching || { suggestions: jest.fn(async () => []) };
  return new StockAgentService(prisma, mistral, matching);
}

describe('StockAgentService', () => {
  it('parses a receipt with product and location from a natural sentence', async () => {
    const agent = service();
    const call = await agent.decideToolCall('org-1', 'conv-1', 'ajoute 10kg de café dans la reserve', {});

    expect(call.tool).toBe('create_stock_proposal');
    expect(call.decision).toBe('deterministic');
    expect(call.args).toMatchObject({
      intent: 'receipt',
      locationQuery: 'reserve',
      lines: [{ rawLabel: 'café', quantity: 10, unit: 'kg' }],
    });
  });

  it('uses active product and pending intent for quantity-only follow-ups', async () => {
    const agent = service();
    const call = await agent.decideToolCall('org-1', 'conv-1', '10 l', { activeProductId: 'p-1', activeProductName: 'Lait', pendingIntent: 'receipt' });

    expect(call.tool).toBe('create_stock_proposal');
    expect(call.args?.lines[0]).toMatchObject({ productId: 'p-1', rawLabel: 'Lait', quantity: 10, unit: 'l' });
  });

  it('uses active product for pronoun stock questions', async () => {
    const agent = service();
    const call = await agent.decideToolCall('org-1', 'conv-1', "j'en ai combien en stock ?", { activeProductId: 'p-cafe', activeProductName: 'Café' });

    expect(call.tool).toBe('get_product_stock');
    expect(call.args?.productId).toBe('p-cafe');
  });

  it('routes natural stock questions with a product to stock lookup', async () => {
    const agent = service();
    const call = await agent.decideToolCall('org-1', 'conv-1', "j'ai du café en stock ?", {});

    expect(call.tool).toBe('get_product_stock');
    expect(call.args?.query).toBe('café');
  });

  it('falls back gracefully when Mistral is unavailable', async () => {
    const agent = service({ mistral: { chatJson: jest.fn(async () => { throw new Error('down'); }) } });
    const call = await agent.decideToolCall('org-1', 'conv-1', 'bonjour', {});

    expect(call.tool).toBe('clarification');
    expect(call.decision).toBe('fallback');
    expect(call.message).toContain('Je n’ai pas compris');
  });

  it('asks for details on generic transfer quick card prompt', async () => {
    const agent = service();
    const call = await agent.decideToolCall('org-1', 'conv-1', 'Transférer du stock', {});

    expect(call.tool).toBe('clarification');
    expect(call.message).toContain('Transfert de stock');
    expect(call.args?.pendingIntent).toBe('transfer');
  });

  it('asks for product on stock quick card prompt', async () => {
    const agent = service();
    const call = await agent.decideToolCall('org-1', 'conv-1', 'Y a-t-il du stock de ?', {});

    expect(call.tool).toBe('clarification');
    expect(call.message).toContain('Quel produit');
  });
});

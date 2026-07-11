import { StockAgentHarnessService } from './stock-agent-harness.service';

function service(overrides: Partial<{ prisma: any; mistral: any; matching: any }> = {}) {
  const prisma = overrides.prisma || {
    stockAssistantMessage: { findMany: jest.fn(async () => []) },
    location: { findMany: jest.fn(async () => []) },
    supplier: { findMany: jest.fn(async () => []) },
    unit: { findMany: jest.fn(async () => []) },
    stockProposal: { findFirst: jest.fn(async () => null) },
  };
  const mistral = overrides.mistral || { chatJson: jest.fn() };
  const matching = overrides.matching || { suggestions: jest.fn(async () => []) };
  return { harness: new StockAgentHarnessService(prisma, mistral, matching), mistral, matching };
}

describe('StockAgentHarnessService', () => {
  it('lets Mistral decide natural stock questions instead of routing with regex first', async () => {
    const { harness, mistral } = service({
      mistral: {
        chatJson: jest.fn(async () => ({
          tool: 'get_product_stock',
          args: { query: 'café' },
          confidence: 0.86,
          reasoningSummary: 'Question de stock avec produit café.',
        })),
      },
    });

    const call = await harness.decideToolCall('org-1', 'conv-1', "j'ai du café en stock ?", {});

    expect(mistral.chatJson).toHaveBeenCalledTimes(1);
    expect(call).toMatchObject({
      tool: 'get_product_stock',
      args: { query: 'café' },
      decision: 'mistral',
      confidence: 0.86,
    });
  });

  it('maps prepare tools to proposal creation while preserving the intent', async () => {
    const { harness } = service({
      mistral: {
        chatJson: jest.fn(async () => ({
          tool: 'prepare_receipt',
          args: { productQuery: 'café', quantity: 10, unit: 'kg', locationQuery: 'réserve' },
          confidence: 0.9,
          reasoningSummary: 'Réception demandée.',
        })),
      },
    });

    const call = await harness.decideToolCall('org-1', 'conv-1', 'ajoute 10kg de café dans la réserve', {});

    expect(call.tool).toBe('create_stock_proposal');
    expect(call.args).toMatchObject({
      intent: 'receipt',
      locationQuery: 'réserve',
      lines: [{ rawLabel: 'café', quantity: 10, unit: 'kg' }],
    });
  });

  it('keeps structured empty quick-card prompts deterministic', async () => {
    const { harness, mistral } = service({ mistral: { chatJson: jest.fn() } });

    const call = await harness.decideToolCall('org-1', 'conv-1', 'Y a-t-il du stock de ?', {});

    expect(mistral.chatJson).not.toHaveBeenCalled();
    expect(call.tool).toBe('clarification');
    expect(call.decision).toBe('deterministic');
  });

  it('routes explicit product creation to the product creation tool', async () => {
    const { harness, mistral } = service({ mistral: { chatJson: jest.fn() } });

    const call = await harness.decideToolCall('org-1', 'conv-1', 'creer le produits café', {});

    expect(mistral.chatJson).not.toHaveBeenCalled();
    expect(call).toMatchObject({
      tool: 'create_product',
      args: { name: 'café' },
      decision: 'deterministic',
    });
  });

  it('uses pending product creation details for name plus initial quantity', async () => {
    const { harness, mistral } = service({ mistral: { chatJson: jest.fn() } });

    const call = await harness.decideToolCall('org-1', 'conv-1', 'café moulu arabica -> 10kg', {
      pendingProductCreation: { name: 'café' },
    });

    expect(mistral.chatJson).not.toHaveBeenCalled();
    expect(call).toMatchObject({
      tool: 'create_product',
      args: { name: 'café moulu arabica', unitSymbol: 'kg', initialQuantity: 10 },
      decision: 'deterministic',
    });
  });

  it('uses Mistral to write the final chatbot response after the tool result', async () => {
    const { harness, mistral } = service({
      mistral: {
        chatJson: jest.fn(async () => ({
          assistantMessage: 'Oui, il reste 4 pièces de café.\n\nTu veux préparer un réassort ?',
          statePatch: { activeProductId: 'p-cafe', activeProductName: 'Café' },
          choices: [],
          suggestions: [],
          confidence: 0.88,
          needsReview: false,
        })),
      },
    });

    const result = await harness.finalizeTurn(
      'org-1',
      'conv-1',
      "j'ai du café en stock ?",
      {},
      { tool: 'get_product_stock', args: { query: 'café' }, decision: 'mistral', confidence: 0.8 },
      { message: 'Stock actuel\n\nCafé\nTotal : 4 pièce', state: {}, type: 'question', toolResults: [{ tool: 'stock_rows', result: [] }] },
    );

    expect(mistral.chatJson).toHaveBeenCalledTimes(1);
    expect(result.message).toContain('Oui, il reste 4 pièces');
    expect(result.state).toMatchObject({ activeProductId: 'p-cafe', activeProductName: 'Café' });
    expect(result.toolResults?.some((item) => item.tool === 'agent_final_response')).toBe(true);
  });

  it('falls back cleanly when Mistral is unavailable', async () => {
    const { harness } = service({ mistral: { chatJson: jest.fn(async () => { throw new Error('down'); }) } });

    const call = await harness.decideToolCall('org-1', 'conv-1', "j'ai du café en stock ?", {});

    expect(call.tool).toBe('get_product_stock');
    expect(call.decision).toBe('fallback');
  });
});

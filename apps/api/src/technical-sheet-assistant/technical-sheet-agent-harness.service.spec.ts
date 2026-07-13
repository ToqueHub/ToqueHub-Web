import { TechnicalSheetAgentHarnessService } from './technical-sheet-agent-harness.service';

describe('TechnicalSheetAgentHarnessService', () => {
  const context = { content: 'crée une blanquette pour 10 portions', state: {}, recentMessages: [], context: {} };

  it('laisse Mistral choisir l’outil de brouillon', async () => {
    const mistral = { chatJson: jest.fn(async () => ({ tool: 'prepare_recipe_draft', args: { name: 'Blanquette', referencePortions: 10 }, confidence: .92 })) };
    const service = new TechnicalSheetAgentHarnessService(mistral as any);
    const call = await service.decide('org-1', context);
    expect(call).toMatchObject({ tool: 'prepare_recipe_draft', confidence: .92, decision: 'mistral' });
  });

  it('utilise un repli déterministe pour une demande de coût', async () => {
    const service = new TechnicalSheetAgentHarnessService({ chatJson: jest.fn(async () => { throw new Error('offline'); }) } as any);
    const call = await service.decide('org-1', { ...context, content: 'quel est le coût de la blanquette ?' });
    expect(call).toMatchObject({ tool: 'get_recipe_cost', decision: 'fallback' });
  });

  it('conserve le résultat métier si Mistral ne peut pas reformuler', async () => {
    const service = new TechnicalSheetAgentHarnessService({ chatJson: jest.fn(async () => { throw new Error('offline'); }) } as any);
    const result = await service.finalize('org-1', 'bonjour', { assistantMessage: 'Brouillon prêt.', confidence: .8, needsReview: true });
    expect(result.assistantMessage).toBe('Brouillon prêt.');
    expect(result.needsReview).toBe(true);
  });

  it('does not rewrite a response that already contains actionable choices', async () => {
    const mistral = { chatJson: jest.fn() };
    const service = new TechnicalSheetAgentHarnessService(mistral as any);
    const result = await service.finalize('org-1', 'créer une fiche', { assistantMessage: 'Quel type de fiche ?', choices: [{ type: 'clarification', label: 'Créer une nouvelle fiche technique' }] });
    expect(mistral.chatJson).not.toHaveBeenCalled();
    expect(result.assistantMessage).toBe('Quel type de fiche ?');
  });

  it('asks once for a recipe name, then prepares the draft from the answer', async () => {
    const mistral = { chatJson: jest.fn() };
    const service = new TechnicalSheetAgentHarnessService(mistral as any);
    const first = await service.decide('org-1', { ...context, content: 'Créer une fiche technique' });
    const second = await service.decide('org-1', { ...context, content: 'flan abricot', state: { pendingIntent: 'create_recipe' } });
    expect(first).toMatchObject({ tool: 'clarify', args: { pendingIntent: 'create_recipe' }, decision: 'deterministic' });
    expect(second).toMatchObject({ tool: 'prepare_recipe_draft', args: { name: 'flan abricot' }, decision: 'deterministic' });
    expect(mistral.chatJson).not.toHaveBeenCalled();
  });
});

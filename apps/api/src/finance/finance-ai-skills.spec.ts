import {
  DEFAULT_FINANCE_MISTRAL_MODEL,
  FINANCE_ANALYSIS_SKILL,
  FINANCE_BUDGET_SKILL,
  FINANCE_DOCUMENT_EXTRACTION_SKILL,
  financeMistralOptions,
} from './finance-ai-skills';

describe('Finance Mistral skills', () => {
  const originalModel = process.env.FINANCE_MISTRAL_MODEL;
  const originalFallbackModels = process.env.FINANCE_MISTRAL_FALLBACK_MODELS;

  afterEach(() => {
    if (originalModel === undefined) delete process.env.FINANCE_MISTRAL_MODEL;
    else process.env.FINANCE_MISTRAL_MODEL = originalModel;
    if (originalFallbackModels === undefined) delete process.env.FINANCE_MISTRAL_FALLBACK_MODELS;
    else process.env.FINANCE_MISTRAL_FALLBACK_MODELS = originalFallbackModels;
  });

  it('uses the subscription-compatible Finance model by default', () => {
    delete process.env.FINANCE_MISTRAL_MODEL;
    delete process.env.FINANCE_MISTRAL_FALLBACK_MODELS;

    expect(financeMistralOptions()).toEqual({
      model: DEFAULT_FINANCE_MISTRAL_MODEL,
      fallbackModels: [],
    });
  });

  it('keeps the compatible model as a fallback for a configured premium model', () => {
    process.env.FINANCE_MISTRAL_MODEL = 'mistral-large-latest';
    process.env.FINANCE_MISTRAL_FALLBACK_MODELS = 'mistral-small-latest';

    expect(financeMistralOptions()).toEqual({
      model: 'mistral-large-latest',
      fallbackModels: ['mistral-small-latest', DEFAULT_FINANCE_MISTRAL_MODEL],
    });
  });

  it('teaches analysis, budgeting and extraction the shared accounting truth rules', () => {
    for (const skill of [
      FINANCE_ANALYSIS_SKILL,
      FINANCE_BUDGET_SKILL,
      FINANCE_DOCUMENT_EXTRACTION_SKILL,
    ]) {
      expect(skill).toContain('comptabilité validée est la source de vérité absolue');
      expect(skill).toContain('Une valeur null signifie');
      expect(skill).toContain('Flatpay');
      expect(skill).toContain('Loyverse');
    }
    expect(FINANCE_BUDGET_SKILL).toContain('trajectoire mensuelle prudente');
    expect(FINANCE_ANALYSIS_SKILL).toContain('contrôleur de gestion en restauration');
  });
});

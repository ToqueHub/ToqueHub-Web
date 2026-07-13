import { Injectable } from '@nestjs/common';
import { MistralClientService } from '../mistral/mistral-client.service';

export const TECHNICAL_SHEET_TOOLS = ['search_recipes', 'get_recipe_details', 'search_stock_products', 'list_recipe_categories', 'get_recipe_cost', 'simulate_production', 'prepare_recipe_draft', 'prepare_recipe_pricing', 'clarify'] as const;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['tool', 'args', 'confidence'], properties: { tool: { type: 'string', enum: TECHNICAL_SHEET_TOOLS }, args: { type: 'object' }, confidence: { type: 'number' } } };
const FINAL_SCHEMA = { type: 'object', additionalProperties: false, required: ['assistantMessage', 'suggestions', 'confidence', 'needsReview'], properties: { assistantMessage: { type: 'string' }, suggestions: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' }, needsReview: { type: 'boolean' } } };

@Injectable()
export class TechnicalSheetAgentHarnessService {
  constructor(private readonly mistral: MistralClientService) {}

  async decide(organizationId: string, input: { content: string; state: any; recentMessages: any[]; context: any }) {
    const deterministic = this.creationGuardrail(input.content, input.state);
    if (deterministic) return deterministic;
    try {
      const result: any = await this.mistral.chatJson(organizationId, [
        { role: 'system', content: [
          'Tu es Kokki, agent Fiches Techniques de ToqueHub.',
          'Choisis exactement un outil métier. Ne rédige pas de réponse utilisateur à cette étape.',
          'Tu ne crées et ne modifies jamais directement une fiche, un produit ou un prix : prepare_recipe_draft et prepare_recipe_pricing préparent uniquement un brouillon révisable.',
          'Pour les ingrédients, utilise les produits Stocks connus dans le contexte; si aucun produit ne convient, indique createProduct:true dans la ligne du brouillon.',
          'Les ingrédients d’un brouillon ont: productId optionnel, productName optionnel, createProduct optionnel, unitId, quantity, comment, order. Les étapes ont: order, title, description, estimatedTimeMinutes.',
          'Pour une modification, utilise targetTechnicalSheetId ou la fiche active. Conserve le statut existant sauf demande explicite.',
          'Réponds uniquement au JSON demandé.',
        ].join('\n') },
        { role: 'user', content: JSON.stringify({ message: input.content, state: input.state, recentMessages: input.recentMessages, availableTools: TECHNICAL_SHEET_TOOLS, context: input.context }) },
      ], 'toquehub_technical_sheet_agent_tool_call', SCHEMA, { temperature: 0 });
      if (TECHNICAL_SHEET_TOOLS.includes(result?.tool)) return { tool: result.tool, args: result.args || {}, confidence: Number(result.confidence ?? .7), decision: 'mistral' };
    } catch { /* deterministic fallback below */ }
    return this.fallback(input.content, input.state);
  }

  async finalize(organizationId: string, content: string, result: any) {
    // Les boutons sont construits par le backend : ne laissons pas le modèle reformuler
    // une clarification et la dupliquer dans le fil de discussion.
    if (Array.isArray(result.choices) && result.choices.length) return result;
    try {
      const final: any = await this.mistral.chatJson(organizationId, [
        { role: 'system', content: 'Tu es Kokki, assistant Fiches Techniques. Réponds en français, clairement et brièvement, seulement à partir du résultat réel de l’outil. Ne prétends jamais qu’un brouillon est une fiche enregistrée. Si un brouillon existe, invite à l’ouvrir pour le relire. Réponds uniquement au JSON demandé.' },
        { role: 'user', content: JSON.stringify({ message: content, toolResult: result }) },
      ], 'toquehub_technical_sheet_agent_final', FINAL_SCHEMA, { temperature: .2 });
      return { ...result, assistantMessage: String(final.assistantMessage || result.assistantMessage), suggestions: final.suggestions?.length ? final.suggestions : result.suggestions || [], confidence: Number(final.confidence ?? result.confidence ?? .6), needsReview: Boolean(final.needsReview || result.needsReview) };
    } catch { return result; }
  }

  private fallback(content: string, state: any) {
    const text = content.toLocaleLowerCase('fr');
    if (/\b(co[uû]t|prix|marge)\b/.test(text)) return { tool: 'get_recipe_cost', args: { query: content }, confidence: .5, decision: 'fallback' };
    if (/\b(portion|produire|production|personnes)\b/.test(text)) return { tool: 'simulate_production', args: { query: content }, confidence: .45, decision: 'fallback' };
    if (/\b(cat[ée]gorie)\b/.test(text)) return { tool: 'list_recipe_categories', args: {}, confidence: .7, decision: 'fallback' };
    if (/\b(recette|fiche|pr[ée]pare|cr[ée]e|cr[ée]er)\b/.test(text)) return { tool: 'prepare_recipe_draft', args: { name: this.nameFromText(content), referencePortions: this.portions(content), targetTechnicalSheetId: state?.activeRecipeId || null }, confidence: .4, decision: 'fallback' };
    return { tool: 'search_recipes', args: { query: content }, confidence: .3, decision: 'fallback' };
  }
  private creationGuardrail(content: string, state: any) {
    const text = content.trim();
    const asksToCreate = /\b(cr[ée]er|creer|nouvelle?)\b.*\b(fiche|recette)\b|\b(fiche|recette)\b.*\b(cr[ée]er|creer)\b/i.test(text);
    const named = text.match(/(?:fiche(?:\s+technique)?|recette)\s+(?:de|du|des|d['’])\s+(.+)/i)?.[1]?.replace(/\s+(?:pour|avec)\s+\d+.*$/i, '').trim();
    if (state?.pendingIntent === 'create_recipe' && text.length >= 2 && !asksToCreate) {
      return { tool: 'prepare_recipe_draft', args: { name: text, referencePortions: this.portions(text) }, confidence: .98, decision: 'deterministic' };
    }
    if (!asksToCreate) return null;
    if (named) return { tool: 'prepare_recipe_draft', args: { name: named, referencePortions: this.portions(text) }, confidence: .98, decision: 'deterministic' };
    return { tool: 'clarify', args: { message: 'Quel nom voulez-vous donner à cette fiche technique ? Par exemple : « flan abricot ».', pendingIntent: 'create_recipe' }, confidence: .99, decision: 'deterministic' };
  }
  private portions(content: string) { return Number(content.match(/(\d+(?:[,.]\d+)?)\s*(?:portion|personne|couverts?)/i)?.[1]?.replace(',', '.')) || 1; }
  private nameFromText(content: string) { return content.replace(/^.*?(?:recette|fiche)\s+(?:de|du|des|d')?\s*/i, '').replace(/\b(pour|avec)\s+\d+.*$/i, '').trim() || 'Nouvelle fiche technique'; }
}

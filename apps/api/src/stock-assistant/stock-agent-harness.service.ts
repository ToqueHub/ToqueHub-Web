import { Injectable } from '@nestjs/common';
import { MistralClientService } from '../mistral/mistral-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductMatchingService, normalizeStockText } from './product-matching.service';
import { AgentResult, AgentState, AgentToolCall, StockAgentChoice } from './stock-agent.service';

const TOOL_NAMES = [
  'search_products',
  'create_product',
  'get_product_stock',
  'list_low_stock',
  'search_locations',
  'search_suppliers',
  'prepare_receipt',
  'prepare_waste',
  'prepare_transfer',
  'prepare_inventory_count',
  'prepare_adjustment',
  'analyze_invoice_attachment',
  'clarify',
] as const;

const TOOL_CALL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tool', 'args', 'confidence', 'reasoningSummary'],
  properties: {
    tool: { type: 'string', enum: TOOL_NAMES },
    args: { type: 'object' },
    confidence: { type: 'number' },
    reasoningSummary: { type: 'string' },
  },
};

const FINAL_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assistantMessage', 'statePatch', 'choices', 'suggestions', 'confidence', 'needsReview'],
  properties: {
    assistantMessage: { type: 'string' },
    statePatch: { type: 'object' },
    choices: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'label'],
        properties: {
          type: { type: 'string', enum: ['product_select', 'product_create', 'location_select', 'supplier_select', 'proposal_review', 'confirm_duplicate', 'clarification'] },
          label: { type: 'string' },
          value: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
          payload: { type: ['object', 'null'] },
        },
      },
    },
    suggestions: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    needsReview: { type: 'boolean' },
  },
};

@Injectable()
export class StockAgentHarnessService {
  constructor(private readonly prisma: PrismaService, private readonly mistral: MistralClientService, private readonly matching: ProductMatchingService) {}

  normalizeState(value: any): AgentState { return value && typeof value === 'object' ? { ...value } : {}; }

  summaryFromState(state: AgentState) {
    return {
      activeProductName: state.activeProductName || null,
      activeLocationName: state.activeLocationName || null,
      activeSupplierName: state.activeSupplierName || null,
      pendingIntent: state.pendingIntent || null,
      hasPendingProposal: Boolean(state.pendingProposal),
      hasPendingProductCreation: Boolean(state.pendingProductCreation),
      lastProposalId: state.lastProposalId || null,
    };
  }

  async decideToolCall(organizationId: string, conversationId: string, content: string, state: AgentState): Promise<AgentToolCall> {
    const guardrail = this.structuredGuardrail(content, state);
    if (guardrail) return guardrail;

    const [recentMessages, context] = await Promise.all([
      this.recentMessages(conversationId),
      this.stockContext(organizationId, content, state),
    ]);

    try {
      const parsed: any = await this.mistral.chatJson(organizationId, [
        { role: 'system', content: this.toolPlannerSystemPrompt() },
        { role: 'user', content: JSON.stringify({ message: content, state, recentMessages, availableTools: TOOL_NAMES, context }) },
      ], 'toquehub_stock_agent_tool_call', TOOL_CALL_SCHEMA, { temperature: 0 });

      if (!TOOL_NAMES.includes(parsed?.tool)) throw new Error('unknown tool');
      return {
        tool: this.mapToolName(parsed.tool),
        args: this.normalizeToolArgs(parsed.tool, parsed.args || {}),
        decision: 'mistral',
        confidence: Number(parsed.confidence ?? 0.7),
        message: parsed.reasoningSummary || undefined,
      };
    } catch (error: any) {
      return this.fallbackToolCall(content, state, error?.message || 'mistral_unavailable');
    }
  }

  async finalizeTurn(organizationId: string, conversationId: string, content: string, previousState: AgentState, toolCall: AgentToolCall, toolResult: AgentResult): Promise<AgentResult> {
    const baseState = this.normalizeState(toolResult.state || previousState);
    // Les garde-fous déterministes portent une règle métier/sécurité : Mistral ne doit pas les reformuler.
    if (toolCall.decision === 'deterministic') {
      return {
        ...toolResult,
        state: baseState,
        toolResults: [...(toolResult.toolResults || []), { tool: 'agent_final_response', result: { provider: 'deterministic_guardrail' } }],
      };
    }
    const recentMessages = await this.recentMessages(conversationId);
    const audit = {
      calledTool: toolCall.tool,
      toolArgs: toolCall.args || {},
      toolDecision: toolCall.decision || 'mistral',
      toolConfidence: toolCall.confidence ?? null,
      toolResult: this.summarizeToolResult(toolResult),
    };

    try {
      const final: any = await this.mistral.chatJson(organizationId, [
        { role: 'system', content: this.finalResponderSystemPrompt() },
        { role: 'user', content: JSON.stringify({ message: content, stateBefore: previousState, stateAfterTool: baseState, recentMessages, toolAudit: audit, toolResult }) },
      ], 'toquehub_stock_agent_final_response', FINAL_RESPONSE_SCHEMA, { temperature: 0.25 });

      const choices = this.validChoices(final.choices?.length ? final.choices : toolResult.choices || []);
      const mergedState = { ...baseState, ...(final.statePatch || {}) };
      if (baseState.pendingProductCreation && choices.some((choice) => choice.type === 'product_create')) {
        mergedState.pendingProductCreation = baseState.pendingProductCreation;
      }
      return {
        ...toolResult,
        message: this.cleanAssistantMessage(final.assistantMessage, toolResult.message),
        state: mergedState,
        choices,
        suggestions: Array.isArray(final.suggestions) && final.suggestions.length ? final.suggestions : toolResult.suggestions || [],
        confidence: Number.isFinite(Number(final.confidence)) ? Number(final.confidence) : toolResult.confidence ?? toolCall.confidence,
        needsReview: Boolean(final.needsReview || toolResult.needsReview),
        toolResults: [
          ...(toolResult.toolResults || []),
          { tool: 'agent_final_response', result: { provider: 'mistral', confidence: final.confidence, statePatch: final.statePatch || {} } },
        ],
      };
    } catch {
      return {
        ...toolResult,
        message: this.cleanAssistantMessage(toolResult.message, 'Je peux vous aider avec vos stocks.'),
        state: baseState,
        toolResults: [
          ...(toolResult.toolResults || []),
          { tool: 'agent_final_response', result: { provider: 'fallback', reason: 'mistral_unavailable_or_invalid' } },
        ],
      };
    }
  }

  private structuredGuardrail(content: string, state: AgentState): AgentToolCall | null {
    if (/\b(fiche\s+technique|recette|ingredients?|préparation|preparation|portion[s]?)\b/i.test(content)) {
      return {
        tool: 'clarification',
        args: { message: 'Je peux vous aider pour les Stocks dans cet espace. Pour créer une recette ou une fiche technique, ouvrez le module « Fiches Techniques » puis cliquez sur « Demander à Kokki ».' },
        decision: 'deterministic',
        confidence: 0.99,
      };
    }
    const productCreation = this.parseProductCreationIntent(content, state);
    if (productCreation) {
      return { tool: 'create_product', args: productCreation, decision: 'deterministic', confidence: 0.98 };
    }
    if (state.pendingProposal && state.activeLocationId) {
      return { tool: 'create_stock_proposal', args: { ...state.pendingProposal, locationId: state.activeLocationId }, decision: 'deterministic', confidence: 0.98 };
    }
    if (/^\s*(?:y\s+a[-\s]?t[-\s]?il\s+)?(?:du\s+)?stock\s+(?:de|du|pour)?\s*\?\s*$/i.test(content)) {
      return { tool: 'clarification', args: { message: 'Quel produit souhaitez-vous vérifier ?', pendingIntent: 'question' }, decision: 'deterministic', confidence: 0.98 };
    }
    return null;
  }

  private parseProductCreationIntent(content: string, state: AgentState) {
    const raw = content.trim();
    const normalized = normalizeStockText(raw);
    const pending = state.pendingProductCreation || null;
    const hasCreationWords = /\b(cree|creer|creation|nouveau|ajouter|ajoute)\b/.test(normalized) && /\b(produit|produits|article|articles)\b/.test(normalized);
    const clickedCreate = /^cr[ée]er\s+(?:le\s+)?produit\b/i.test(raw) || /^cr[ée]er\s+un\s+nouveau\s+produit\b/i.test(raw);
    const looksLikePendingDetails = Boolean(pending && (raw.includes('->') || /\d+(?:[,.]\d+)?\s*[a-zA-ZÀ-ÿ]{1,12}/.test(raw) || /^[a-zA-ZÀ-ÿ]{1,12}$/.test(raw)));
    if (!hasCreationWords && !clickedCreate && !looksLikePendingDetails) return null;

    const parsedQuantity = raw.match(/(\d+(?:[,.]\d+)?)\s*([a-zA-ZÀ-ÿ]{1,12})/);
    const initialQuantity = parsedQuantity ? Number(parsedQuantity[1].replace(',', '.')) : pending?.initialQuantity || null;
    const unitSymbol = parsedQuantity?.[2] || (/^[a-zA-ZÀ-ÿ]{1,12}$/.test(raw) && pending?.name ? raw : pending?.unitSymbol || null);
    const beforeArrow = raw.split(/-{1,2}>|→/)[0]?.trim();
    let name = '';
    if (beforeArrow && beforeArrow !== raw) name = beforeArrow;
    else name = raw
      .replace(/\*/g, '')
      .replace(/^cr[ée]er\s+(?:le\s+)?produits?\s*/i, '')
      .replace(/^cr[ée]er\s+un\s+nouveau\s+produit\s*/i, '')
      .replace(/\b(produits|produit|articles|article|nouveau|nouvelle|creer|créer|cree|crée|creation|ajouter|ajoute|le|la|un|une)\b/ig, ' ')
      .replace(/(\d+(?:[,.]\d+)?)\s*[a-zA-ZÀ-ÿ]{1,12}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name && pending?.name) name = pending.name;
    if (/^[a-zA-ZÀ-ÿ]{1,12}$/.test(raw) && pending?.name && !clickedCreate && !hasCreationWords) name = pending.name;
    if (!name) return { name: pending?.name || null, unitSymbol, initialQuantity };
    return { name, unitSymbol, initialQuantity };
  }

  private async recentMessages(conversationId: string) {
    const recent = await (this.prisma as any).stockAssistantMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 12 });
    return recent.reverse().map((message: any) => ({ role: message.role, content: message.content, metadata: message.metadata || null }));
  }

  private async stockContext(organizationId: string, content: string, state: AgentState) {
    const query = this.lightProductQuery(content, state);
    const [productCandidates, locations, suppliers, units, latestProposal] = await Promise.all([
      query ? this.matching.suggestions(organizationId, query).catch(() => []) : Promise.resolve([]),
      this.prisma.location.findMany({ where: { organizationId, isArchived: false }, include: { site: true }, orderBy: { name: 'asc' }, take: 80 }),
      this.prisma.supplier.findMany({ where: { organizationId, isArchived: false }, orderBy: { name: 'asc' }, take: 80 }),
      this.prisma.unit.findMany({ where: { organizationId, isArchived: false }, orderBy: { symbol: 'asc' }, take: 80 }),
      state.lastProposalId ? (this.prisma as any).stockProposal.findFirst({ where: { id: state.lastProposalId, organizationId }, select: { id: true, type: true, status: true, version: true } }).catch(() => null) : Promise.resolve(null),
    ]);
    return {
      activeState: state,
      productCandidates: productCandidates.slice(0, 12),
      locations: locations.map((location) => ({ id: location.id, name: location.name, siteName: location.site?.name || null })),
      suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
      units: units.map((unit) => ({ id: unit.id, symbol: unit.symbol, name: unit.name })),
      latestProposal,
    };
  }

  private lightProductQuery(content: string, state: AgentState) {
    const normalized = normalizeStockText(content);
    if (/\b(en|le|la|les|ca|ça|celui|celle)\b/.test(normalized) && state.activeProductName) return state.activeProductName;
    return content
      .replace(/[?!.]+$/g, '')
      .replace(/\b(stock|stocks|actuel|actuelle|combien|reste|disponible|dispo|ajoute|rajoute|retire|transfere|transférer|transfert|mets|met|dans|depuis|vers|reserve|réserve|chambre|froide|cuisine|stp|svp|merci)\b/ig, ' ')
      .replace(/\d+(?:[,.]\d+)?\s*[a-zA-ZÀ-ÿ]{0,12}/g, ' ')
      .replace(/\b(de|du|des|d'|la|le|les|un|une|en|j'ai|jai|as-tu|avez-vous|y a-t-il|il y a)\b/ig, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private mapToolName(tool: string) {
    return ({
      prepare_receipt: 'create_stock_proposal',
      prepare_waste: 'create_stock_proposal',
      prepare_transfer: 'create_stock_proposal',
      prepare_inventory_count: 'create_stock_proposal',
      prepare_adjustment: 'create_stock_proposal',
      clarify: 'clarification',
    } as Record<string, string>)[tool] || tool;
  }

  private normalizeToolArgs(tool: string, args: Record<string, any>) {
    const intent = ({
      prepare_receipt: 'receipt',
      prepare_waste: 'waste',
      prepare_transfer: 'transfer',
      prepare_inventory_count: 'inventory_count',
      prepare_adjustment: 'adjustment',
    } as Record<string, string>)[tool];
    if (!intent) {
      if (tool === 'clarify') return { ...args, message: args.message || args.question || 'Pouvez-vous préciser ?' };
      return args;
    }
    return {
      ...args,
      intent,
      lines: Array.isArray(args.lines) ? args.lines : [{
        productId: args.productId || null,
        rawLabel: args.rawLabel || args.productQuery || args.productName || null,
        quantity: args.quantity,
        unit: args.unit || null,
      }],
    };
  }

  private fallbackToolCall(content: string, state: AgentState, reason = 'mistral_unavailable'): AgentToolCall {
    const normalized = normalizeStockText(content);
    const fallbackMeta = { fallbackReason: reason };
    if (/^(salut|bonjour|hello|hey|coucou|ça va|ca va|bonsoir)\b/.test(normalized)) {
      return { tool: 'clarification', args: { message: 'Salut ! Oui, je suis là.\n\nJe peux chercher un stock, retrouver un produit ou préparer une proposition de mouvement.' }, decision: 'fallback', confidence: 0.35, message: reason };
    }
    if (state.pendingProposal) {
      return { tool: 'search_locations', args: { query: content, ...fallbackMeta }, decision: 'fallback', confidence: 0.45, message: reason };
    }
    if (/\b(faible|bas|alerte|rupture|minimum|low)\b/.test(normalized) && /\bstocks?\b/.test(normalized)) {
      return { tool: 'list_low_stock', args: fallbackMeta, decision: 'fallback', confidence: 0.55, message: reason };
    }
    const productCreation = this.parseProductCreationIntent(content, state);
    if (productCreation) return { tool: 'create_product', args: { ...productCreation, ...fallbackMeta }, decision: 'fallback', confidence: 0.8, message: reason };
    const action = this.fallbackAction(content, state);
    if (action) return { ...action, args: { ...(action.args || {}), ...fallbackMeta }, decision: 'fallback', confidence: 0.55, message: reason };
    if (state.activeProductId && /\b(en|combien|stocks?|reste|dispo|disponible|quantite|quantité)\b/.test(normalized)) {
      return { tool: 'get_product_stock', args: { productId: state.activeProductId, query: state.activeProductName, ...fallbackMeta }, decision: 'fallback', confidence: 0.55, message: reason };
    }
    if (/\bstocks?\b/.test(normalized) || /\b(reste|dispo|disponible|combien)\b/.test(normalized)) {
      const query = this.lightProductQuery(content, state) || content;
      return { tool: 'get_product_stock', args: { query, ...fallbackMeta }, decision: 'fallback', confidence: 0.5, message: reason };
    }
    if (/^[a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9 '\\-]{1,60}$/.test(content.trim())) {
      return { tool: 'search_products', args: { query: content.trim(), ...fallbackMeta }, decision: 'fallback', confidence: 0.4, message: reason };
    }
    return { tool: 'clarification', args: { message: 'Je peux vous aider sur les stocks.\n\nEssayez par exemple : “j’ai du café en stock ?” ou “ajoute 10 kg de café dans la réserve”.', ...fallbackMeta }, decision: 'fallback', confidence: 0.2, message: reason };
  }

  private fallbackAction(content: string, state: AgentState): AgentToolCall | null {
    const normalized = normalizeStockText(content);
    const intent = /\b(retire|retirer|retrait|perte|perdu|jete|jette|sort|sors|enleve|enlève)\b/.test(normalized)
      ? 'waste'
      : /\b(transfert|transfere|transférer|deplace|déplace)\b/.test(normalized)
        ? 'transfer'
        : /\b(inventaire|comptage)\b/.test(normalized)
          ? 'inventory_count'
          : /\b(ajuste|corrige|correction)\b/.test(normalized)
            ? 'adjustment'
            : /\b(ajoute|rajoute|recu|reçu|reception|réception|entree|entrée|mets|met)\b/.test(normalized)
              ? 'receipt'
              : null;
    if (!intent) return null;
    const quantity = content.match(/(\d+(?:[,.]\d+)?)\s*([a-zA-ZÀ-ÿ]{1,12})?/);
    if (!quantity) return { tool: 'clarification', args: { message: 'Quelle quantité voulez-vous traiter ?', pendingIntent: intent } };
    const afterQuantity = content.slice((quantity.index || 0) + quantity[0].length).trim();
    const split = afterQuantity.replace(/^(de|du|des|d['’]?|la|le|les)\s+/i, '').match(/^(.*?)(?:\s+(?:dans|en|à|a|depuis|vers)\s+(?:la|le|les|l['’]?)?\s*(.+))?$/i);
    const rawLabel = (split?.[1] || state.activeProductName || '').replace(/\b(stp|svp|merci|pardon)\b/ig, '').trim();
    const locationQuery = split?.[2]?.trim();
    if (!rawLabel && !state.activeProductId) return { tool: 'clarification', args: { message: 'Quel produit voulez-vous utiliser ?', pendingIntent: intent } };
    return {
      tool: 'create_stock_proposal',
      args: {
        intent,
        locationQuery,
        lines: [{
          productId: rawLabel ? undefined : state.activeProductId || undefined,
          rawLabel: rawLabel || state.activeProductName,
          quantity: Number(quantity[1].replace(',', '.')),
          unit: quantity[2] || null,
        }],
      },
    };
  }

  private summarizeToolResult(result: AgentResult) {
    return {
      type: result.type || null,
      message: result.message,
      proposalId: result.proposalId || null,
      choices: result.choices || [],
      suggestions: result.suggestions || [],
      confidence: result.confidence ?? null,
      needsReview: result.needsReview ?? false,
      state: result.state,
    };
  }

  private validChoices(choices: StockAgentChoice[]) {
    return (choices || []).filter((choice) => choice && choice.type && choice.label).slice(0, 10);
  }

  private cleanAssistantMessage(value: unknown, fallback: string) {
    const text = String(value || '').trim();
    if (!text) return fallback;
    return text.replace(/\n{3,}/g, '\n\n');
  }

  private toolPlannerSystemPrompt() {
    return [
      'Tu es Kokki, le vrai agent conversationnel Stock de ToqueHub.',
      'Tu choisis exactement un outil métier. Tu ne réponds pas à l’utilisateur dans cette étape.',
      'Tu dois utiliser l’historique et state pour comprendre les pronoms: le, la, en, ça, celui-là, pardon, non je parle de.',
      'Tu ne modifies jamais réellement le stock: pour toute écriture, choisis un outil prepare_* qui crée seulement une proposition à valider.',
      'Exception: si l’utilisateur demande explicitement de créer une fiche produit, choisis create_product. Si une quantité initiale est donnée, elle doit devenir une proposition de réception à valider, pas un mouvement direct.',
      'Une demande de recette, d’ingrédients ou de fiche technique est hors périmètre : choisis clarify et indique le module Fiches Techniques. Ne cherche jamais à créer un produit pour cette demande.',
      'Si l’utilisateur pose une question de stock, choisis get_product_stock, même avec une formulation naturelle.',
      'Pour le lieu de stock, raisonne en SITE uniquement. Ne parle jamais de sous-lieu interne, réserve ou chambre froide.',
      'Si plusieurs sites sont possibles, choisis search_locations: cet outil affichera des sites à l’utilisateur.',
      'Si la demande est vague, choisis clarify avec une question courte.',
      'Réponds uniquement avec le JSON du schéma.',
    ].join('\n');
  }

  private finalResponderSystemPrompt() {
    return [
      'Tu es Kokki, assistant stock naturel, clair et utile.',
      'Tu rédiges la réponse finale à partir du résultat réel de l’outil. N’invente jamais de quantité, produit, site, fournisseur ou mouvement.',
      'Style: français naturel, court, humain, avec sauts de ligne quand utile.',
      'Si des choices sont disponibles, invite à cliquer sans recopier toute la liste inutilement.',
      'Ne parle jamais de sous-lieu interne. Utilise le mot “site”.',
      'Si une proposition a été préparée, rappelle qu’elle doit être vérifiée et validée avant application.',
      'Si l’outil est incertain, demande une clarification simple.',
      'Réponds uniquement avec le JSON du schéma.',
    ].join('\n');
  }
}

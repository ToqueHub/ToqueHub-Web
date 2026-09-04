import { Injectable } from '@nestjs/common';
import { MistralClientService } from '../mistral/mistral-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductMatchingService, normalizeStockText } from './product-matching.service';

export type Actor = { id: string; role: string };
export type StockAgentChoiceType = 'product_select' | 'product_create' | 'location_select' | 'supplier_select' | 'proposal_review' | 'confirm_duplicate' | 'clarification';
export type StockAgentChoice = { type: StockAgentChoiceType; label: string; value?: string; description?: string; payload?: Record<string, unknown> };
export type AgentState = {
  activeProductId?: string | null;
  activeProductName?: string | null;
  activeLocationId?: string | null;
  activeLocationName?: string | null;
  activeSupplierId?: string | null;
  activeSupplierName?: string | null;
  pendingIntent?: string | null;
  pendingProductCreation?: { name?: string | null; unitSymbol?: string | null; initialQuantity?: number | null } | null;
  pendingProposal?: { intent: string; lines: Array<{ productId?: string | null; rawLabel?: string | null; quantity: number; unit?: string | null }>; supplierId?: string | null; sourceLocationId?: string | null; destinationLocationId?: string | null } | null;
  lastProposalId?: string | null;
  candidates?: Array<{ id: string; name: string; kind: 'product' | 'location' | 'supplier'; score?: number }> | null;
  lastToolResults?: Array<{ tool: string; result?: unknown }> | null;
};
export type AgentResult = {
  message: string;
  state: AgentState;
  proposalId?: string;
  toolResults?: any[];
  suggestions?: string[];
  choices?: StockAgentChoice[];
  type?: string;
  status?: string;
  lines?: any[];
  questions?: string[];
  confidence?: number;
  needsReview?: boolean;
  humanHandoffSuggested?: boolean;
  humanHandoffReason?: string | null;
};
export type AgentToolCall = { tool: string; args?: Record<string, any>; message?: string; decision?: 'deterministic' | 'mistral' | 'fallback'; confidence?: number };

const AGENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'message', 'tool', 'args'],
  properties: {
    mode: { type: 'string', enum: ['tool_call', 'final_answer'] },
    message: { type: 'string' },
    tool: { type: ['string', 'null'], enum: ['search_products', 'get_product_stock', 'list_low_stock', 'search_locations', 'search_suppliers', 'create_stock_proposal', 'clarification', null] },
    args: { type: 'object' },
  },
};

@Injectable()
export class StockAgentService {
  constructor(private readonly prisma: PrismaService, private readonly mistral: MistralClientService, private readonly matching: ProductMatchingService) {}

  normalizeState(value: any): AgentState { return value && typeof value === 'object' ? { ...value } : {}; }
  summaryFromState(state: AgentState) {
    return {
      activeProductName: state.activeProductName || null,
      activeLocationName: state.activeLocationName || null,
      activeSupplierName: state.activeSupplierName || null,
      pendingIntent: state.pendingIntent || null,
      hasPendingProposal: Boolean(state.pendingProposal),
      lastProposalId: state.lastProposalId || null,
    };
  }

  async decideToolCall(organizationId: string, conversationId: string, content: string, state: AgentState): Promise<AgentToolCall> {
    const deterministic = this.inferToolCall(content, state);
    if (deterministic) return { ...deterministic, decision: 'deterministic', confidence: 0.95 };
    return this.decideToolCallWithMistral(organizationId, conversationId, content, state);
  }

  locationQuestion(intent: string) {
    if (intent === 'WASTE') return 'Depuis quel site souhaitez-vous retirer ce stock ?';
    if (intent === 'TRANSFER') return 'Quel est le site de départ et le site de destination du transfert ?';
    if (intent === 'INVENTORY_COUNT') return 'Sur quel site souhaitez-vous enregistrer ce comptage ?';
    return `Sur quel site souhaitez-vous ${intent === 'RECEIPT' ? 'ajouter' : 'enregistrer'} ce stock ?`;
  }

  private inferToolCall(content: string, state: AgentState): AgentToolCall | null {
    const normalized = normalizeStockText(content);
    if (state.pendingProposal && state.activeLocationId) return { tool: 'create_stock_proposal', args: { ...state.pendingProposal, locationId: state.activeLocationId } };
    const actionLine = this.parseActionLine(content, state);
    if (actionLine) return { tool: 'create_stock_proposal', args: { intent: actionLine.intent, lines: [actionLine.line], locationQuery: actionLine.locationQuery } };
    const genericAction = this.genericActionClarification(normalized);
    if (genericAction) return genericAction;
    if (state.pendingProposal) {
      const looksLikeLocationAnswer = !this.actionIntentFromText(normalized) && !/\bstock\b/.test(normalized) && content.trim().length >= 2;
      if (looksLikeLocationAnswer) return { tool: 'search_locations', args: { query: content } };
      return { tool: 'clarification', message: this.locationQuestion(this.normalizeIntent(state.pendingProposal.intent)), args: { pendingIntent: state.pendingProposal.intent } };
    }
    if (/\b(faible|bas|alerte|rupture|minimum|low)\b/.test(normalized) && /\bstock\b/.test(normalized)) return { tool: 'list_low_stock', args: {} };
    if (/\b(produit|produits|catalogue|article|articles)\b/.test(normalized) && !/\bstock\b/.test(normalized)) return { tool: 'search_products', args: { query: this.extractProductCatalogQuery(content) } };
    if (/\bstock\b/.test(normalized) || /\b(en ai|il y en a|reste|dispo|disponible|combien)\b/.test(normalized)) {
      const query = this.extractProductQuestion(content);
      if (this.isIncompleteStockPrompt(content) || !query || this.isEmptyStockQuestion(query)) return { tool: 'clarification', message: 'Quel produit souhaitez-vous vérifier ?\n\nExemple : “Y a-t-il du stock de café ?”', args: {} };
      return { tool: 'get_product_stock', args: { productId: this.shouldUseActiveProduct(query, normalized, state) ? state.activeProductId : undefined, query } };
    }
    const quantityOnly = content.match(/(\d+(?:[,.]\d+)?)\s*([a-zA-ZÀ-ÿ]{1,12})?\s*(?:stp|svp|merci)?[.!?]*$/i);
    if (state.pendingIntent && state.activeProductId && quantityOnly) return { tool: 'create_stock_proposal', args: { intent: state.pendingIntent, lines: [{ productId: state.activeProductId, rawLabel: state.activeProductName, quantity: Number(quantityOnly[1].replace(',', '.')), unit: quantityOnly[2] || null }] } };
    const actionIntent = this.actionIntentFromText(normalized);
    if (actionIntent && state.activeProductId) return { tool: 'clarification', message: `Quelle quantité voulez-vous ${actionIntent === 'waste' ? 'retirer' : actionIntent === 'receipt' ? 'réceptionner' : 'enregistrer'} pour ${state.activeProductName} ?`, args: { pendingIntent: actionIntent } };
    return null;
  }

  private genericActionClarification(normalized: string): AgentToolCall | null {
    const hasQuantity = /\d+(?:[,.]\d+)?/.test(normalized);
    const genericStockTarget = /\b(stock|reception|perte|transfert)\b/.test(normalized);
    const actionIntent = this.actionIntentFromText(normalized);
    if (!actionIntent || hasQuantity || !genericStockTarget) return null;
    if (actionIntent === 'transfer') return { tool: 'clarification', message: 'Transfert de stock\n\nIndiquez le produit, la quantité, le site source et le site de destination.\n\nExemple : “Transfère 5 kg de café du site principal vers cuisine centrale”.', args: { pendingIntent: 'transfer' } };
    if (actionIntent === 'waste') return { tool: 'clarification', message: 'Retrait / perte\n\nIndiquez le produit, la quantité et le site.\n\nExemple : “Retire 2 kg de tomates sur le site principal”.', args: { pendingIntent: 'waste' } };
    if (actionIntent === 'receipt') return { tool: 'clarification', message: 'Ajout de stock\n\nIndiquez le produit, la quantité et le site.\n\nExemple : “Ajoute 10 kg de café sur le site principal”.', args: { pendingIntent: 'receipt' } };
    return null;
  }

  private async decideToolCallWithMistral(organizationId: string, conversationId: string, content: string, state: AgentState): Promise<AgentToolCall> {
    const [recent, context] = await Promise.all([
      (this.prisma as any).stockAssistantMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 12 }),
      this.agentContext(organizationId, content, state),
    ]);
    try {
      const parsed: any = await this.mistral.chatJson(organizationId, [
        { role: 'system', content: 'Tu es l’agent conversationnel Stock de ToqueHub. Tu gardes strictement le contexte fourni. Tu ne modifies jamais le stock directement. Pour chaque lecture ou action stock, choisis exactement un outil. Pour une modification, crée seulement une proposition validable. Utilise activeProductId, activeLocationId, pendingIntent et pendingProposal quand l’utilisateur dit “le”, “ça”, “j’en”, “celui-là”, “pardon”, “quand même”. Ne réponds jamais hors JSON.' },
        { role: 'user', content: JSON.stringify({ message: content, state, recentMessages: recent.reverse().map((m: any) => ({ role: m.role, content: m.content, metadata: m.metadata })), availableTools: ['search_products', 'get_product_stock', 'list_low_stock', 'search_locations', 'search_suppliers', 'create_stock_proposal', 'clarification'], context }) },
      ], 'toquehub_stock_agent', AGENT_SCHEMA);
      if (parsed?.mode === 'tool_call' && parsed.tool) return { tool: parsed.tool, args: parsed.args || {}, message: parsed.message, decision: 'mistral', confidence: 0.75 };
      return { tool: 'clarification', message: parsed?.message || 'Je peux vous aider sur les produits, stocks, sites, fournisseurs, propositions et factures. Que voulez-vous faire ?', args: {}, decision: 'mistral', confidence: 0.4 };
    } catch {
      return { tool: 'clarification', message: 'Je n’ai pas compris la demande. Donnez-moi un produit, une quantité ou une question de stock précise.', args: {}, decision: 'fallback', confidence: 0.2 };
    }
  }

  private async agentContext(organizationId: string, content: string, state: AgentState) {
    const query = this.extractProductQuestion(content) || content;
    const [productCandidates, locations, suppliers, units] = await Promise.all([
      this.matching.suggestions(organizationId, query).catch(() => []),
      this.prisma.location.findMany({ where: { organizationId, isArchived: false }, include: { site: true }, orderBy: { name: 'asc' }, take: 80 }),
      this.prisma.supplier.findMany({ where: { organizationId, isArchived: false }, orderBy: { name: 'asc' }, take: 80 }),
      this.prisma.unit.findMany({ where: { organizationId, isArchived: false }, orderBy: { symbol: 'asc' }, take: 80 }),
    ]);
    return { activeState: state, productCandidates, locations: locations.map((l) => ({ id: l.id, name: l.name, siteName: l.site?.name })), suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })), units: units.map((u) => ({ id: u.id, symbol: u.symbol, name: u.name })) };
  }

  private normalizeIntent(value: string) { const key = String(value || '').toLowerCase(); return ({ receipt: 'RECEIPT', waste: 'WASTE', transfer: 'TRANSFER', inventory_count: 'INVENTORY_COUNT', adjustment: 'ADJUSTMENT' } as Record<string, string>)[key] || key.toUpperCase(); }
  private actionIntentFromText(normalized: string) {
    if (/\b(perte|perdu|casse|gaspillage|jete|retire|retirer|retrait|enleve|enlever|sort|sors|sortie|destocke|destocker)\b/.test(normalized)) return 'waste';
    if (/\b(transfert|transferer|deplacer)\b/.test(normalized)) return 'transfer';
    if (/\b(inventaire|comptage)\b/.test(normalized)) return 'inventory_count';
    if (/\b(ajuste|corrige|correction)\b/.test(normalized)) return 'adjustment';
    if (/\b(ajoute|rajoute|recu|reception|receptionner|livraison|entree|mets|met)\b/.test(normalized)) return 'receipt';
    return null;
  }
  private shouldUseActiveProduct(query: string, normalized: string, state: AgentState) { return Boolean(state.activeProductId && (!query || this.isGenericReference(query) || this.isPronounStockFollowUp(query) || this.refersToPreviousProduct(normalized))); }
  private extractProductCatalogQuery(content: string) { return content.replace(/[?!.]+$/g, '').replace(/^(est ce que|j ai|as tu|avez vous|on a|y a t il|il y a)\s+/i, '').replace(/\b(dans|mes|les|produits|produit|catalogue|articles|article|du|de|des|d')\b/ig, ' ').trim(); }
  private extractProductQuestion(content: string) {
    const cleaned = content.replace(/[?!.]+$/g, '').trim();
    const patterns = [
      /(?:est-ce que\s+)?(?:j['’ ]?ai|as-tu|avez-vous|on a|y a-t-il|il y a)\s+(?:du|de la|de l'|des|de|d')\s+(.+?)\s+(?:en\s+)?stock$/i,
      /(?:est-ce que\s+)?(?:j['’ ]?ai|as-tu|avez-vous|on a|y a-t-il|il y a)\s+(.+?)\s+(?:en\s+)?stock$/i,
      /stock\s+(?:actuel\s+)?(?:de|du|des|d'|pour)\s+(.+)$/i,
      /quantit[eé]\s+(?:de|du|des|d'|pour)\s+(.+)$/i,
      /combien\s+(?:reste|as-tu|y a-t-il).*(?:de|du|des|d')\s+(.+)$/i,
    ];
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return cleaned.replace(/^(donne|affiche|montre|quel est|quelle est|c est quoi|est ce que)\s+/i, '').replace(/^(j['’ ]?ai|as tu|avez vous|on a|y a t il|il y a)\s+/i, '').replace(/\s+(en\s+)?stock$/i, '').replace(/\bstock\b/ig, '').replace(/\b(de|du|des|d'|pour)\b/ig, ' ').trim();
  }
  private parseActionLine(content: string, state: AgentState) {
    const normalized = normalizeStockText(content);
    const intent = this.actionIntentFromText(normalized);
    if (!intent) return null;
    const quantity = this.extractQuantityUnit(content);
    if (!quantity) return null;
    const extracted = this.extractActionProductAndLocation(content);
    const rawLabel = extracted.productLabel || state.activeProductName || null;
    const productId = extracted.productLabel ? undefined : state.activeProductId || undefined;
    if (!rawLabel && !productId) return null;
    return { intent, line: { productId, rawLabel, quantity: quantity.quantity, unit: quantity.unit, reason: 'Saisie chat assistant' }, locationQuery: extracted.locationQuery };
  }
  private extractQuantityUnit(content: string) {
    const match = content.match(/(\d+(?:[,.]\d+)?)(.*)$/i);
    if (!match) return null;
    const quantity = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    const unitMatch = String(match[2] || '').trim().match(/^([a-zA-ZÀ-ÿ]{1,12})\b/i);
    const unit = unitMatch && /^(kg|kilo|kilos|g|gr|gramme|grammes|l|litre|litres|ml|cl|piece|pieces|pi[eè]ce|pi[eè]ces|pc|pcs|unite|unites|unit[eé]|unit[eé]s|boite|boites|carton|cartons|sachet|sachets|bouteille|bouteilles)$/i.test(unitMatch[1]) ? unitMatch[1] : null;
    return { quantity, unit };
  }
  private extractActionProductAndLocation(content: string) {
    const match = content.match(/\d+(?:[,.]\d+)?(.*)$/i);
    if (!match) return { productLabel: null, locationQuery: null };
    let rest = String(match[1] || '').trim();
    const unitMatch = rest.match(/^([a-zA-ZÀ-ÿ]{1,12})\b/i);
    if (unitMatch && /^(kg|kilo|kilos|g|gr|gramme|grammes|l|litre|litres|ml|cl|piece|pieces|pi[eè]ce|pi[eè]ces|pc|pcs|unite|unites|unit[eé]|unit[eé]s|boite|boites|carton|cartons|sachet|sachets|bouteille|bouteilles)$/i.test(unitMatch[1])) rest = rest.slice(unitMatch[0].length).trim();
    rest = rest.replace(/^(?:de\s+|d['’]\s*|du\s+|des\s+)/i, '');
    const split = rest.match(/^(.*?)(?:\s+(?:dans|a|à|au|aux|en|sur|vers)\s+(?:la\s+|le\s+|l['’]\s*|les\s+)?)(.+)$/i);
    return { productLabel: this.cleanLabel(split?.[1] || rest), locationQuery: this.cleanLabel(split?.[2] || '') };
  }
  private cleanLabel(value: string) { return String(value || '').replace(/\b(stp|svp|merci|pardon|desole|désolé|quand meme|quand même|ok|oui|non)\b/ig, ' ').replace(/^(le|la|les|l'|l’|en|ça|ca|ce|cet|cette|du|de|des|d')$/i, ' ').replace(/[?!.]+$/g, '').replace(/\s+/g, ' ').trim() || null; }
  private refersToPreviousProduct(normalized: string) { return /\b(en|ce|cet|cette|celui|celle|ca|produit)\b/.test(normalized) && /\b(stock|quantite|reste|dispo|disponible|combien|ai)\b/.test(normalized); }
  private isGenericReference(value: string) { const normalized = normalizeStockText(value); return !normalized || /^(en|le|la|les|ca|ce|cet|cette|celui|celle|produit|article|articles|produits|stock|stocks)$/.test(normalized); }
  private isPronounStockFollowUp(value: string) { const normalized = normalizeStockText(value); return /\b(j|je|en|ce|cet|cette|le|la|les|ca)\b/.test(normalized) && /\b(ai|as|a|stock|stocks|reste|dispo|disponible)\b/.test(normalized); }
  private isEmptyStockQuestion(value: string) { return /^(de|du|des|d|pour|\?)?$/.test(normalizeStockText(value)); }
  private isIncompleteStockPrompt(value: string) {
    return /^(?:y\s+a\s+t\s+il|il\s+y\s+a|as\s+tu|avez\s+vous)?\s*(?:du|de\s+la|de\s+l|des)?\s*stock\s*(?:de|du|des|d|pour)?$/.test(normalizeStockText(value));
  }
}

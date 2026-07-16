import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { MistralClientService } from '../mistral/mistral-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { StocksOcrService } from '../stocks/stocks-ocr.service';
import { StocksService } from '../stocks/stocks.service';
import { ProductMatchingService, normalizeStockText } from './product-matching.service';
import { StockAgentHarnessService } from './stock-agent-harness.service';
import { AgentResult, AgentState, AgentToolCall, Actor, StockAgentChoice, StockAgentService } from './stock-agent.service';
import { CreateAliasDto, ProposalLineDto, UpdateProposalDto } from './dto/stock-assistant.dto';

const INTENTS: Record<string, string> = { receipt: 'RECEIPT', waste: 'WASTE', transfer: 'TRANSFER', inventory_count: 'INVENTORY_COUNT', adjustment: 'ADJUSTMENT' };
const STOCK_WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Second', 'Magasinier'];
const RESPONSE_SCHEMA = { type: 'object', additionalProperties: false, required: ['intent', 'message', 'lines', 'questions', 'confidence'], properties: { intent: { type: 'string', enum: [...Object.keys(INTENTS), 'question', 'clarification_needed'] }, message: { type: 'string' }, locationHint: { type: ['string', 'null'] }, confidence: { type: 'number' }, questions: { type: 'array', items: { type: 'string' } }, lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['rawLabel', 'quantity', 'unit'], properties: { rawLabel: { type: 'string' }, quantity: { type: 'number' }, unit: { type: ['string', 'null'] }, supplierName: { type: ['string', 'null'] }, lotNumber: { type: ['string', 'null'] }, expiryDate: { type: ['string', 'null'] }, reason: { type: ['string', 'null'] }, supplierSku: { type: ['string', 'null'] }, unitPriceExVat: { type: ['number', 'null'] } } } } } };
const AGENT_SCHEMA = { type: 'object', additionalProperties: false, required: ['mode', 'message', 'tool', 'args'], properties: { mode: { type: 'string', enum: ['tool_call', 'final_answer'] }, message: { type: 'string' }, tool: { type: ['string', 'null'], enum: ['search_products', 'get_product_stock', 'list_low_stock', 'search_locations', 'search_suppliers', 'create_stock_proposal', 'clarification', null] }, args: { type: 'object' } } };

@Injectable()
export class StockAssistantService {
  constructor(private readonly prisma: PrismaService, private readonly mistral: MistralClientService, private readonly matching: ProductMatchingService, private readonly stocks: StocksService, private readonly stocksOcr: StocksOcrService, private readonly agent: StockAgentService, private readonly harness: StockAgentHarnessService) {}

  async createConversation(organizationId: string, actor: Actor, locationId?: string) { return (this.prisma as any).stockConversation.create({ data: { organizationId, userId: actor.id, locationId, state: locationId ? { activeLocationId: locationId } : {} } }); }
  async getConversation(organizationId: string, actor: Actor, id: string) {
    const conversation = await (this.prisma as any).stockConversation.findFirst({ where: { id, organizationId, userId: actor.id } });
    if (!conversation) throw new NotFoundException('Conversation introuvable');
    return { ...conversation, messages: await (this.prisma as any).stockAssistantMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' } }) };
  }

  async handleTextMessage(organizationId: string, actor: Actor, conversationId: string, content: string, locationId?: string) {
    this.assertWrite(actor);
    const conversation = await (this.prisma as any).stockConversation.findFirst({ where: { id: conversationId, organizationId, userId: actor.id } });
    if (!conversation) throw new NotFoundException('Conversation introuvable');
    await (this.prisma as any).stockAssistantMessage.create({ data: { conversationId, role: 'USER', content, metadata: { locationId: locationId || conversation.locationId } } });
    const state = this.agent.normalizeState(conversation.state);
    if (locationId) state.activeLocationId = locationId;
    const result = await this.runAgentTurn(organizationId, actor, { ...conversation, state }, content);
    const assistant = await (this.prisma as any).stockAssistantMessage.create({ data: { conversationId, role: 'ASSISTANT', content: result.message, metadata: { intent: result.type || 'agent', proposalId: result.proposalId || null, state: result.state, toolResults: result.toolResults || [], choices: result.choices || [], confidence: result.confidence ?? null, needsReview: result.needsReview ?? false, humanHandoffSuggested: !!result.humanHandoffSuggested, humanHandoffReason: result.humanHandoffReason || null } } });
    await (this.prisma as any).stockConversation.update({ where: { id: conversationId }, data: { state: result.state, summary: this.harness.summaryFromState(result.state) } });
    return { messageId: assistant.id, assistantMessage: result.message, proposalId: result.proposalId, type: result.type || 'agent', status: result.status || null, lines: result.lines || [], questions: result.questions || [], state: result.state, suggestions: result.suggestions || [], choices: result.choices || [], toolResults: result.toolResults || [], confidence: result.confidence ?? null, needsReview: result.needsReview ?? false, humanHandoffSuggested: !!result.humanHandoffSuggested, humanHandoffReason: result.humanHandoffReason || null };
  }

  async createProposalFromInvoice(organizationId: string, actor: Actor, documentId: string, locationId?: string) {
    this.assertWrite(actor);
    const document = await this.prisma.document.findFirst({ where: { id: documentId, organizationId }, include: { ocrDocuments: { include: { extractions: true } } } });
    if (!document) throw new NotFoundException('Document introuvable');
    const extraction: any = document.ocrDocuments[0]?.extractions[0];
    if (!extraction) throw new BadRequestException('Le document doit être OCRisé avant la création de proposition');
    const existing = await (this.prisma as any).stockProposal.findFirst({ where: { organizationId, sourceExtractionId: extraction.id } });
    if (existing) return this.getProposal(organizationId, existing.id);
    const data: any = extraction.correctedJson || extraction.extractedJson;
    const supplierId = data?.supplierId || data?.supplier?.supplierId || null;
    const supplierName = data?.supplierName || data?.supplier?.supplierName || data?.supplier?.name || null;
    const invoiceNumber = data?.invoiceNumber || data?.document?.invoiceNumber || data?.invoice?.invoiceNumber || null;
    const total = data?.totalIncludingTax || data?.totals?.totalIncludingTax || data?.invoice?.grandTotal || null;
    if (!locationId) locationId = (await this.singleSiteDefaultLocation(organizationId))?.id;
    const duplicate = await (this.prisma as any).stockProposal.findFirst({ where: { organizationId, sourceType: 'INVOICE', OR: [{ sourceDocumentId: documentId }, ...(invoiceNumber ? [{ metadata: { path: ['invoiceNumber'], equals: invoiceNumber } }] : [])], status: { in: ['NEEDS_REVIEW', 'APPROVED', 'APPLIED'] } } });
    const lines = (data?.lines || data?.items || []).filter((line: any) => !line.ignored && line.label).map((line: any) => ({ rawLabel: line.label || line.ocrLabel, quantity: Number(line.quantity || 0), unit: line.unit || null, supplierSku: line.reference || line.supplierProductCode || null, lotNumber: line.lotNumber || null, expiryDate: line.bestBeforeDate || null, unitPriceExVat: line.unitPrice || null }));
    if (!lines.length) throw new BadRequestException('Aucune ligne stockable trouvée dans l’extraction OCR');
    return this.createProposal(organizationId, actor, { type: 'RECEIPT', sourceType: 'INVOICE', sourceDocumentId: documentId, sourceExtractionId: extraction.id, locationId, supplierId, confidence: Number(extraction.confidenceScore || 0), duplicateWarning: duplicate ? { proposalId: duplicate.id, invoiceNumber, total, contentSha256: document.contentSha256 } : null, metadata: { invoiceNumber, total, supplierName, ocrResult: data }, lines });
  }

  async createProposalFromInvoiceAttachment(organizationId: string, actor: Actor, file: any, locationId?: string, conversationId?: string) {
    this.assertWrite(actor);
    const conversation = conversationId ? await (this.prisma as any).stockConversation.findFirst({ where: { id: conversationId, organizationId, userId: actor.id } }) : null;
    if (conversationId && !conversation) throw new NotFoundException('Conversation introuvable');
    if (conversation) await (this.prisma as any).stockAssistantMessage.create({ data: { conversationId: conversation.id, role: 'USER', content: 'Facture jointe', metadata: { fileName: file?.originalname || file?.name || null, locationId: locationId || conversation.locationId } } });
    const uploaded = await this.stocksOcr.uploadDocuments(organizationId, actor, file ? [file] : []);
    const documentId = uploaded.documents[0]?.id;
    if (!documentId) throw new BadRequestException('Document non importé');
    await this.stocksOcr.analyzeDocument(organizationId, actor, documentId);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = await this.stocksOcr.getStatus(organizationId, actor, documentId);
      if (status.extraction?.id) {
        const proposal = await this.createProposalFromInvoice(organizationId, actor, documentId, locationId);
        if (conversation) {
          const state = { ...this.agent.normalizeState(conversation.state), lastProposalId: proposal.id };
          const supplier = await this.proposalSupplierLabel(organizationId, proposal);
          const documentNote = 'Le fichier a bien été ajouté à vos documents Stocks.';
          const supplierNote = supplier ? `Fournisseur détecté : ${supplier}.` : 'Je n’ai pas identifié le fournisseur avec certitude.';
          await (this.prisma as any).stockAssistantMessage.create({ data: { conversationId: conversation.id, role: 'ASSISTANT', content: `Facture analysée.\n\n${supplierNote}\n${documentNote}\n\nJ’ai préparé une proposition de réception à vérifier.`, metadata: { intent: 'receipt', proposalId: proposal.id, state, supplierName: supplier, sourceDocumentId: documentId } } });
          await (this.prisma as any).stockConversation.update({ where: { id: conversation.id }, data: { state, summary: this.harness.summaryFromState(state) } });
        }
        return proposal;
      }
      if (status.state === 'erreur') throw new BadRequestException('Analyse OCR échouée');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (conversation) {
      const state = this.agent.normalizeState(conversation.state);
      await (this.prisma as any).stockAssistantMessage.create({ data: { conversationId: conversation.id, role: 'ASSISTANT', content: 'Facture reçue.\n\nLe fichier a bien été ajouté à vos documents Stocks.\n\nL’analyse OCR est encore en cours. Je préparerai la proposition dès que l’extraction sera terminée.', metadata: { intent: 'invoice_processing', sourceDocumentId: documentId, state } } });
      await (this.prisma as any).stockConversation.update({ where: { id: conversation.id }, data: { state, summary: this.harness.summaryFromState(state) } });
    }
    return { status: 'PROCESSING', documentId, message: 'Analyse OCR en cours. Le document a bien été ajouté à vos documents Stocks.' };
  }

  async getProposal(organizationId: string, id: string) { const proposal = await (this.prisma as any).stockProposal.findFirst({ where: { id, organizationId } }); if (!proposal) throw new NotFoundException('Proposition introuvable'); return { ...proposal, lines: await (this.prisma as any).stockProposalLine.findMany({ where: { proposalId: id }, orderBy: { createdAt: 'asc' } }), movements: await (this.prisma as any).stockProposalMovement.findMany({ where: { proposalId: id } }) }; }
  async updateProposal(organizationId: string, actor: Actor, id: string, dto: UpdateProposalDto) {
    this.assertWrite(actor);
    const current = await this.getProposal(organizationId, id); if (current.status !== 'NEEDS_REVIEW' && current.status !== 'APPROVED') throw new BadRequestException('Cette proposition est verrouillée'); if (current.version !== dto.version) throw new BadRequestException('La proposition a été modifiée ; rechargez-la');
    for (const line of dto.lines) await this.validateLine(organizationId, line);
    await (this.prisma as any).$transaction(async (tx: any) => { await tx.stockProposalLine.deleteMany({ where: { proposalId: id } }); await tx.stockProposalLine.createMany({ data: dto.lines.map((line) => ({ proposalId: id, productId: line.productId || null, rawLabel: line.rawLabel, supplierSku: line.supplierSku || null, quantity: line.quantity, purchaseUnit: line.purchaseUnit || null, inputUnitId: line.inputUnitId || null, unitPriceExVat: line.unitPriceExVat || null, lotNumber: line.lotNumber || null, expiryDate: line.expiryDate ? new Date(line.expiryDate) : null, notes: line.notes || null, matchStatus: line.productId ? 'MATCHED' : 'UNMATCHED' })) }); await tx.stockProposal.update({ where: { id }, data: { locationId: dto.locationId === undefined ? current.locationId : dto.locationId, sourceLocationId: dto.sourceLocationId === undefined ? current.sourceLocationId : dto.sourceLocationId, destinationLocationId: dto.destinationLocationId === undefined ? current.destinationLocationId : dto.destinationLocationId, supplierId: dto.supplierId === undefined ? current.supplierId : dto.supplierId, duplicateOverrideReason: dto.duplicateOverrideReason, version: { increment: 1 }, status: 'APPROVED' } }); });
    const updated = await this.getProposal(organizationId, id); await this.learnAliases(organizationId, actor, updated); return updated;
  }
  async rejectProposal(organizationId: string, actor: Actor, id: string) { this.assertWrite(actor); await this.getProposal(organizationId, id); return (this.prisma as any).stockProposal.update({ where: { id }, data: { status: 'REJECTED', rejectedAt: new Date(), rejectedByUserId: actor.id } }); }
  async applyProposal(organizationId: string, actor: Actor, id: string, version: number) {
    this.assertWrite(actor);
    const proposal = await this.getProposal(organizationId, id); if (proposal.status === 'APPLIED') return proposal; if (proposal.status !== 'APPROVED' || proposal.version !== version) throw new BadRequestException('Proposition non validée ou obsolète'); if (proposal.duplicateWarning && !proposal.duplicateOverrideReason) throw new BadRequestException('Doublon potentiel : une confirmation motivée est requise');
    const locationId = proposal.type === 'TRANSFER' ? proposal.destinationLocationId : proposal.locationId; if (!locationId) throw new BadRequestException('Un site est obligatoire');
    const movements: any[] = [];
    for (const line of proposal.lines) {
      if (!line.productId || !line.inputUnitId) throw new BadRequestException(`Ligne non associée ou unité inconnue : ${line.rawLabel}`);
      if (proposal.type === 'INVENTORY_COUNT') { const current = await this.prisma.stock.aggregate({ where: { organizationId, productId: line.productId, locationId }, _sum: { quantity: true } }); const delta = Number(line.quantity) - Number(current._sum.quantity || 0); if (delta) movements.push(await this.stocks.createAssistantInventoryAdjustment(organizationId, actor, { productId: line.productId, unitId: line.inputUnitId, quantity: delta, locationId, reason: `Comptage Assistant Stock ${proposal.id}` })); }
      else { const type = proposal.type === 'RECEIPT' ? StockMovementType.RECEPTION : proposal.type === 'WASTE' ? StockMovementType.LOSS : proposal.type === 'TRANSFER' ? StockMovementType.TRANSFER : StockMovementType.CORRECTION; movements.push(await this.stocks.createMovement(organizationId, actor, { productId: line.productId, supplierId: proposal.supplierId || undefined, type, quantity: Number(line.quantity), unitId: line.inputUnitId, lotId: undefined, sourceLocationId: proposal.type === 'TRANSFER' ? proposal.sourceLocationId || undefined : undefined, destinationLocationId: proposal.type === 'TRANSFER' ? proposal.destinationLocationId : locationId, reason: line.notes || `Assistant Stock ${proposal.id}` })); }
    }
    await (this.prisma as any).$transaction(async (tx: any) => { await tx.stockProposalMovement.createMany({ data: movements.map((movement) => ({ proposalId: id, stockMovementId: movement.id })), skipDuplicates: true }); await tx.stockProposal.update({ where: { id }, data: { status: 'APPLIED', appliedAt: new Date(), appliedByUserId: actor.id } }); }); return this.getProposal(organizationId, id);
  }
  async createAlias(organizationId: string, actor: Actor, dto: CreateAliasDto) {
    this.assertWrite(actor);
    return this.upsertProductAlias(organizationId, {
      supplierId: dto.supplierId || null,
      productId: dto.productId,
      alias: dto.alias,
      normalizedAlias: normalizeStockText(dto.alias),
      supplierSku: dto.supplierSku || null,
      purchaseUnit: dto.purchaseUnit || null,
      createdBy: 'user',
    });
  }
  async suggestions(organizationId: string, q: string) { return this.matching.suggestions(organizationId, q); }

  private async proposalSupplierLabel(organizationId: string, proposal: any) {
    if (proposal.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: proposal.supplierId, organizationId, isArchived: false }, select: { name: true } });
      if (supplier?.name) return supplier.name;
    }
    const metadata = proposal.metadata as any;
    return metadata?.supplierName || metadata?.ocrResult?.supplierName || metadata?.ocrResult?.supplier?.supplierName || metadata?.ocrResult?.supplier?.name || null;
  }

  private async runAgentTurn(organizationId: string, actor: Actor, conversation: any, content: string): Promise<AgentResult> {
    const state = this.harness.normalizeState(conversation.state);
    const toolCall = await this.harness.decideToolCall(organizationId, conversation.id, content, state);
    const toolResult = await this.executeAgentTool(organizationId, actor, conversation.id, state, toolCall);
    const toolResults = [{ tool: 'agent_tool_decision', result: { tool: toolCall.tool, args: toolCall.args || {}, decision: toolCall.decision || 'mistral', confidence: toolCall.confidence ?? null, note: toolCall.message || null } }, ...(toolResult.toolResults || [])];
    const resultWithAudit = { ...toolResult, state: this.harness.normalizeState(toolResult.state), toolResults, confidence: toolResult.confidence ?? toolCall.confidence };
    return this.harness.finalizeTurn(organizationId, conversation.id, content, state, toolCall, resultWithAudit);
  }

  private inferToolCall(content: string, state: AgentState): AgentToolCall | null {
    const normalized = normalizeStockText(content);
    if (state.pendingProposal && state.activeLocationId) return { tool: 'create_stock_proposal', args: { ...state.pendingProposal, locationId: state.activeLocationId } };
    const actionLine = this.parseActionLine(content, state);
    if (actionLine) return { tool: 'create_stock_proposal', args: { intent: actionLine.intent, lines: [actionLine.line], locationQuery: actionLine.locationQuery } };
    if (state.pendingProposal) {
      const looksLikeLocationAnswer = !this.actionIntentFromText(normalized) && !/\bstock\b/.test(normalized) && content.trim().length >= 2;
      if (looksLikeLocationAnswer) return { tool: 'search_locations', args: { query: content } };
      return { tool: 'clarification', message: this.locationQuestion(this.normalizeIntent(state.pendingProposal.intent)), args: { pendingIntent: state.pendingProposal.intent } };
    }
    if (/\b(faible|bas|alerte|rupture|minimum|low)\b/.test(normalized) && /\bstock\b/.test(normalized)) return { tool: 'list_low_stock', args: {} };
    if (/\b(produit|produits|catalogue|article|articles)\b/.test(normalized) && !/\bstock\b/.test(normalized)) return { tool: 'search_products', args: { query: this.extractProductCatalogQuery(content) } };
    if (/\bstock\b/.test(normalized) || /\b(en ai|il y en a|reste|dispo|disponible|combien)\b/.test(normalized)) {
      const query = this.extractProductQuestion(content);
      return { tool: 'get_product_stock', args: { productId: this.shouldUseActiveProduct(query, normalized, state) ? state.activeProductId : undefined, query } };
    }
    const quantityOnly = content.match(/(\d+(?:[,.]\d+)?)\s*([a-zA-ZÀ-ÿ]{1,12})?\s*(?:stp|svp|merci)?[.!?]*$/i);
    if (state.activeProductId && quantityOnly && this.actionIntentFromText(normalized)) {
      const intent = this.intentFromText(normalized);
      return { tool: 'create_stock_proposal', args: { intent, lines: [{ productId: state.activeProductId, rawLabel: state.activeProductName, quantity: Number(quantityOnly[1].replace(',', '.')), unit: quantityOnly[2] || null }] } };
    }
    const actionIntent = this.actionIntentFromText(normalized);
    if (actionIntent && state.activeProductId) return { tool: 'clarification', message: `Quelle quantité voulez-vous ${actionIntent === 'waste' ? 'retirer' : actionIntent === 'receipt' ? 'réceptionner' : 'enregistrer'} pour ${state.activeProductName} ?`, args: { pendingIntent: actionIntent } };
    if (state.pendingIntent && state.activeProductId && quantityOnly) return { tool: 'create_stock_proposal', args: { intent: state.pendingIntent, lines: [{ productId: state.activeProductId, rawLabel: state.activeProductName, quantity: Number(quantityOnly[1].replace(',', '.')), unit: quantityOnly[2] || null }] } };
    const directReceipt = this.parseSimpleReceipt(content);
    if (directReceipt) return { tool: 'create_stock_proposal', args: { intent: 'receipt', lines: [directReceipt] } };
    const missingDetails = this.genericActionNeedsDetails(content);
    if (missingDetails) return { tool: 'clarification', message: missingDetails, args: { pendingIntent: this.intentFromText(normalized) } };
    return null;
  }

  private async decideToolCallWithMistral(organizationId: string, conversationId: string, content: string, state: AgentState): Promise<AgentToolCall> {
    const [recent, context] = await Promise.all([
      (this.prisma as any).stockAssistantMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.agentContext(organizationId, content, state),
    ]);
    try {
      const parsed: any = await this.mistral.chatJson(organizationId, [
        { role: 'system', content: 'Tu es l’agent conversationnel Stock de ToqueHub. Tu dois tenir le contexte entre messages. Tu ne modifies jamais le stock directement. Pour toute lecture ou action stock, choisis exactement un outil. Pour une modification, crée seulement une proposition validable. Utilise activeProductId/activeLocationId quand l’utilisateur dit “le”, “ça”, “j’en”, “celui-là”. Réponds uniquement avec le JSON du schéma.' },
        { role: 'user', content: JSON.stringify({ message: content, state, recentMessages: recent.reverse().map((m: any) => ({ role: m.role, content: m.content, metadata: m.metadata })), availableTools: ['search_products', 'get_product_stock', 'list_low_stock', 'search_locations', 'search_suppliers', 'create_stock_proposal', 'clarification'], context }) },
      ], 'toquehub_stock_agent', AGENT_SCHEMA);
      if (parsed?.mode === 'tool_call' && parsed.tool) return { tool: parsed.tool, args: parsed.args || {}, message: parsed.message };
      return { tool: 'clarification', message: parsed?.message || 'Je peux vous aider sur les produits, stocks, sites, fournisseurs, propositions et factures. Que voulez-vous faire ?', args: {} };
    } catch {
      return { tool: 'clarification', message: 'Je n’ai pas compris la demande. Donnez-moi un produit, une quantité ou une question de stock précise.', args: {} };
    }
  }

  private async executeAgentTool(organizationId: string, actor: Actor, conversationId: string, state: AgentState, call: AgentToolCall): Promise<AgentResult> {
    const toolResults: any[] = [];
    if (call.tool === 'search_products') {
      const query = String(call.args?.query || '').trim();
      if (!query) return this.agentClarification(state, 'Quel produit voulez-vous chercher ?');
      const result = await this.searchProductsTool(organizationId, query);
      toolResults.push({ tool: call.tool, result });
      if (result.selected) {
        const nextState = { ...state, activeProductId: result.selected.id, activeProductName: result.selected.name, candidates: null };
        return { message: `Oui, j’ai trouvé ${result.selected.name}${result.selected.unitSymbol ? ` (${result.selected.unitSymbol})` : ''}.`, state: nextState, toolResults, type: 'question' };
      }
      const nextState = { ...state, candidates: result.candidates.map((item: any) => ({ id: item.id, name: item.name, kind: 'product' as const, score: item.score })) };
      if (!result.candidates.length) {
        const pending = this.productCreationDraftFromText(query, state);
        return {
          message: `Je n’ai trouvé aucun produit correspondant à “${query}”.\n\nVoulez-vous créer une nouvelle fiche produit ?`,
          state: { ...nextState, pendingProductCreation: pending },
          toolResults,
          type: 'clarification_needed',
          questions: ['Créer le produit ?'],
          choices: [this.productCreateChoice(pending)],
          confidence: 0.35,
          needsReview: true,
        };
      }
      return { message: `J’ai trouvé plusieurs produits possibles. Lequel voulez-vous utiliser ?`, state: nextState, toolResults, type: 'clarification_needed', questions: ['Quel produit voulez-vous utiliser ?'], choices: this.productChoices(result.candidates), confidence: 0.55 };
    }
    if (call.tool === 'create_product') return this.createProductFromAgentTool(organizationId, actor, conversationId, state, call.args || {});
    if (call.tool === 'get_product_stock') {
      const resolved = await this.resolveProduct(organizationId, call.args?.productId || state.activeProductId, call.args?.query);
      toolResults.push({ tool: call.tool, result: resolved });
      if (!resolved.product) return { message: resolved.message || 'Je n’ai pas trouvé le produit à vérifier.', state: { ...state, candidates: resolved.candidates?.map((item: any) => ({ id: item.id, name: item.name, kind: 'product' as const, score: item.score })) || null }, toolResults, type: 'clarification_needed', questions: ['Quel produit voulez-vous vérifier ?'], choices: this.productChoices(resolved.candidates || []), confidence: 0.45 };
      const stock = await this.productStockAnswer(organizationId, resolved.product.id);
      return { message: stock.message, state: { ...state, activeProductId: resolved.product.id, activeProductName: resolved.product.name }, toolResults: [...toolResults, { tool: 'stock_rows', result: stock.rows }], type: 'question' };
    }
    if (call.tool === 'list_low_stock') {
      const answer = await this.lowStockAnswer(organizationId);
      return { message: answer.message, state, toolResults: [{ tool: call.tool }], type: 'question' };
    }
    if (call.tool === 'search_locations') {
      const locations = await this.findLocations(organizationId, call.args?.query);
      if (locations.length === 1) {
        const nextState = { ...state, activeLocationId: locations[0].id, activeLocationName: locations[0].name };
        if (state.pendingProposal) return this.createProposalFromAgentTool(organizationId, actor, conversationId, nextState, { ...state.pendingProposal, locationId: locations[0].id });
        return { message: `Site actif : ${locations[0].name}.`, state: nextState, toolResults: [{ tool: call.tool, result: locations }], type: 'question' };
      }
      return { message: locations.length ? `Quel site voulez-vous utiliser ?` : 'Je n’ai trouvé aucun site correspondant.', state, toolResults: [{ tool: call.tool, result: locations }], type: 'clarification_needed', suggestions: ['location_select'], choices: this.locationChoices(locations), confidence: locations.length ? 0.55 : 0.2 };
    }
    if (call.tool === 'search_suppliers') {
      const suppliers = await this.prisma.supplier.findMany({ where: { organizationId, isArchived: false, name: call.args?.query ? { contains: String(call.args.query), mode: 'insensitive' } : undefined }, orderBy: { name: 'asc' }, take: 8 });
      if (suppliers.length === 1) return { message: `Fournisseur actif : ${suppliers[0].name}.`, state: { ...state, activeSupplierId: suppliers[0].id, activeSupplierName: suppliers[0].name }, toolResults: [{ tool: call.tool, result: suppliers }], type: 'question' };
      return { message: suppliers.length ? `J’ai trouvé plusieurs fournisseurs possibles. Choisissez celui à utiliser.` : 'Je n’ai trouvé aucun fournisseur correspondant.', state, toolResults: [{ tool: call.tool, result: suppliers }], type: 'clarification_needed', choices: this.supplierChoices(suppliers), confidence: suppliers.length ? 0.55 : 0.2 };
    }
    if (call.tool === 'create_stock_proposal') return this.createProposalFromAgentTool(organizationId, actor, conversationId, state, call.args || {});
    return this.agentClarification({ ...state, pendingIntent: call.args?.pendingIntent || state.pendingIntent || null }, call.args?.message || call.message || 'Précisez le produit, la quantité ou l’action stock à réaliser.');
  }

  private async createProposalFromAgentTool(organizationId: string, actor: Actor, conversationId: string, state: AgentState, args: Record<string, any>): Promise<AgentResult> {
    const intent = this.normalizeIntent(args.intent || state.pendingIntent || 'receipt');
    const lines = Array.isArray(args.lines) ? args.lines : [{ productId: args.productId, rawLabel: args.productQuery || state.activeProductName, quantity: args.quantity, unit: args.unit }];
    const prepared = [];
    for (const line of lines) {
      const product = await this.resolveProduct(organizationId, line.productId || null, line.rawLabel || line.productQuery || state.activeProductName || null);
      const quantity = Number(line.quantity);
      if (!product.product) return { message: product.message || 'Quel produit voulez-vous utiliser pour cette proposition ?', state: { ...state, pendingIntent: intent.toLowerCase() }, toolResults: [{ tool: 'resolve_product', result: product }], type: 'clarification_needed', questions: ['Quel produit ?'], choices: this.productChoices(product.candidates || []), confidence: 0.45 };
      if (!Number.isFinite(quantity) || quantity <= 0) return { message: `Quelle quantité voulez-vous ${intent === 'RECEIPT' ? 'réceptionner' : 'enregistrer'} pour ${product.product.name} ?`, state: { ...state, activeProductId: product.product.id, activeProductName: product.product.name, pendingIntent: intent.toLowerCase() }, type: 'clarification_needed', questions: ['Quelle quantité ?'] };
      prepared.push({ rawLabel: product.product.name, productId: product.product.id, quantity, unit: line.unit || line.purchaseUnit || null, reason: 'Saisie chat assistant' });
    }
    let locationId = args.locationId || state.activeLocationId || null;
    let locationName = state.activeLocationName || null;
    if (!locationId && args.locationQuery) {
      const locations = await this.findLocations(organizationId, args.locationQuery);
      if (locations.length === 1) {
        locationId = locations[0].id;
        locationName = locations[0].name;
      }
    }
    if (!locationId && ['RECEIPT', 'WASTE', 'ADJUSTMENT', 'INVENTORY_COUNT'].includes(intent)) {
      const defaultLocation = await this.singleSiteDefaultLocation(organizationId);
      if (defaultLocation) {
        locationId = defaultLocation.id;
        locationName = defaultLocation.name;
      }
    }
    const proposal = await this.createProposal(organizationId, actor, { type: intent, sourceType: 'CHAT', conversationId, locationId, sourceLocationId: args.sourceLocationId || null, destinationLocationId: args.destinationLocationId || locationId, supplierId: args.supplierId || state.activeSupplierId || null, confidence: 0.9, lines: prepared });
    const first = proposal.lines[0];
    const nextState: AgentState = { ...state, activeProductId: first?.productId || state.activeProductId, activeProductName: first?.rawLabel || state.activeProductName, activeLocationId: locationId || state.activeLocationId, activeLocationName: locationName || state.activeLocationName, pendingIntent: null, pendingProposal: null, lastProposalId: proposal.id };
    return { message: `J’ai préparé une proposition ${this.intentLabel(intent)} : ${prepared.map((line) => `${line.quantity} ${line.unit || ''} de ${line.rawLabel}`.trim()).join(', ')}. Vérifiez-la puis validez pour choisir le site et appliquer le stock.`, state: nextState, proposalId: proposal.id, status: proposal.status, lines: proposal.lines, type: intent.toLowerCase(), toolResults: [{ tool: 'create_stock_proposal', result: { proposalId: proposal.id } }], suggestions: ['proposal_review'], choices: [{ type: 'proposal_review', label: 'Vérifier & appliquer', value: proposal.id }], confidence: 0.9, needsReview: true };
  }

  private async createProductFromAgentTool(organizationId: string, actor: Actor, conversationId: string, state: AgentState, args: Record<string, any>): Promise<AgentResult> {
    const draft = this.productCreationDraftFromArgs(args, state);
    if (!draft.name) {
      return {
        message: 'Quel nom exact voulez-vous donner au produit ?',
        state: { ...state, pendingProductCreation: draft },
        type: 'clarification_needed',
        questions: ['Nom du produit ?'],
        confidence: 0.45,
      };
    }

    const existing = await this.findExactProductByName(organizationId, draft.name);
    if (existing) {
      const nextState: AgentState = { ...state, activeProductId: existing.id, activeProductName: existing.name, pendingProductCreation: null };
      return {
        message: `Ce produit existe déjà : ${existing.name}${existing.unit?.symbol ? ` (${existing.unit.symbol})` : ''}.`,
        state: nextState,
        type: 'question',
        toolResults: [{ tool: 'create_product', result: { existingProductId: existing.id } }],
        confidence: 0.9,
      };
    }

    const unit = draft.unitSymbol ? await this.findUnitBySymbolOrName(organizationId, draft.unitSymbol) : null;
    if (!unit) {
      const units = await this.prisma.unit.findMany({ where: { organizationId, isArchived: false }, orderBy: { symbol: 'asc' }, take: 10 });
      return {
        message: `Pour créer **${draft.name}**, j’ai besoin de l’unité de mesure.\n\nExemple : kg, L, pièce.`,
        state: { ...state, pendingProductCreation: draft },
        type: 'clarification_needed',
        questions: ['Quelle unité ?'],
        choices: units.slice(0, 6).map((item) => ({ type: 'clarification', label: item.symbol, description: item.name })),
        confidence: 0.65,
        needsReview: true,
      };
    }

    const product = await this.stocks.createProduct(organizationId, actor, {
      name: this.cleanProductName(draft.name),
      unitId: unit.id,
    });
    const nextState: AgentState = { ...state, activeProductId: product.id, activeProductName: product.name, pendingProductCreation: null };
    const quantity = Number(draft.initialQuantity || 0);
    if (Number.isFinite(quantity) && quantity > 0) {
      const proposalResult = await this.createProposalFromAgentTool(organizationId, actor, conversationId, nextState, {
        intent: 'receipt',
        lines: [{ productId: product.id, rawLabel: product.name, quantity, unit: unit.symbol }],
      });
      return {
        ...proposalResult,
        message: `Produit créé : ${product.name} (${unit.symbol}).\n\n${proposalResult.message}`,
        state: { ...proposalResult.state, activeProductId: product.id, activeProductName: product.name, pendingProductCreation: null },
        toolResults: [{ tool: 'create_product', result: { productId: product.id, name: product.name, unit: unit.symbol } }, ...(proposalResult.toolResults || [])],
      };
    }

    return {
      message: `Produit créé : ${product.name} (${unit.symbol}).\n\nVous pouvez maintenant me dire par exemple : “ajoute 10 ${unit.symbol} de ${product.name}”.`,
      state: nextState,
      type: 'product_create',
      toolResults: [{ tool: 'create_product', result: { productId: product.id, name: product.name, unit: unit.symbol } }],
      confidence: 0.95,
    };
  }

  private async searchProductsTool(organizationId: string, query: string) {
    const match = await this.matching.match(organizationId, query);
    const candidates = match.candidates?.length ? match.candidates : [];
    if (match.productId) {
      const product = await this.prisma.product.findFirst({ where: { id: match.productId, organizationId, isArchived: false }, include: { unit: true } });
      if (product && (match.confidence >= 0.72 || candidates.length <= 1)) return { selected: { id: product.id, name: product.name, unitId: product.unitId, unitSymbol: product.unit?.symbol, score: match.confidence }, candidates };
    }
    return { selected: null, candidates };
  }

  private productChoices(candidates: any[] = []): StockAgentChoice[] {
    return candidates.slice(0, 6).map((item) => ({ type: 'product_select', label: item.name, value: item.id, description: item.score != null ? `Confiance ${(Number(item.score) * 100).toFixed(0)}%` : undefined }));
  }

  private productCreateChoice(draft: { name?: string | null; unitSymbol?: string | null; initialQuantity?: number | null }): StockAgentChoice {
    const name = this.cleanProductName(draft.name || 'ce produit');
    return {
      type: 'product_create',
      label: `Créer le produit ${name}`,
      description: draft.unitSymbol ? `Unité ${draft.unitSymbol}${draft.initialQuantity ? ` · stock initial ${draft.initialQuantity} ${draft.unitSymbol}` : ''}` : 'Préciser le nom et l’unité',
      payload: { name: draft.name || null, unitSymbol: draft.unitSymbol || null, initialQuantity: draft.initialQuantity || null },
    };
  }

  private locationChoices(locations: any[] = []): StockAgentChoice[] {
    return locations.slice(0, 8).map((item) => ({ type: 'location_select', label: item.name, value: item.id, description: 'Site' }));
  }

  private supplierChoices(suppliers: any[] = []): StockAgentChoice[] {
    return suppliers.slice(0, 8).map((item) => ({ type: 'supplier_select', label: item.name, value: item.id }));
  }

  private async findLocations(organizationId: string, query?: string | null) {
    const sites = await this.prisma.site.findMany({ where: { organizationId, isArchived: false }, include: { locations: { where: { isArchived: false }, orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' }, take: 100 });
    const locations = await Promise.all(sites.map((site) => this.defaultLocationForSite(organizationId, site)));
    const normalizedQuery = normalizeStockText(String(query || ''));
    if (!normalizedQuery) return locations.slice(0, 8);
    return locations
      .map((location) => ({ location, score: normalizeStockText(location.name) === normalizedQuery ? 2 : normalizeStockText(location.name).includes(normalizedQuery) || normalizedQuery.includes(normalizeStockText(location.name)) ? 1 : 0 }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.location.name.localeCompare(b.location.name))
      .slice(0, 8)
      .map((item) => item.location);
  }

  private async singleSiteDefaultLocation(organizationId: string) {
    const sites = await this.prisma.site.findMany({ where: { organizationId, isArchived: false }, include: { locations: { where: { isArchived: false }, orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' }, take: 2 });
    if (sites.length !== 1) return null;
    return this.defaultLocationForSite(organizationId, sites[0]);
  }

  private async defaultLocationForSite(organizationId: string, site: any) {
    const technicalName = 'Stock général';
    const existing = (site.locations || []).find((location: any) => normalizeStockText(location.name) === normalizeStockText(technicalName)) || (site.locations || [])[0];
    if (existing) return { ...existing, name: site.name, site };
    const created = await this.prisma.location.create({ data: { organizationId, siteId: site.id, name: technicalName } });
    return { ...created, name: site.name, site };
  }

  private async resolveProduct(organizationId: string, productId?: string | null, query?: string | null) {
    if (productId) {
      const product = await this.prisma.product.findFirst({ where: { id: productId, organizationId, isArchived: false }, include: { unit: true } });
      if (product) return { product };
    }
    const cleaned = String(query || '').trim();
    if (!cleaned || this.isGenericReference(cleaned) || this.isPronounStockFollowUp(cleaned)) return { product: null, message: 'De quel produit parle-t-on ?' };
    const found = await this.searchProductsTool(organizationId, cleaned);
    if (found.selected) {
      const product = await this.prisma.product.findFirst({ where: { id: found.selected.id, organizationId, isArchived: false }, include: { unit: true } });
      return { product };
    }
    return { product: null, candidates: found.candidates, message: found.candidates?.length ? `J’ai plusieurs produits possibles : ${found.candidates.map((item: any) => item.name).join(', ')}.` : `Je n’ai pas trouvé de produit correspondant à “${cleaned}”.` };
  }

  private async productStockAnswer(organizationId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, organizationId }, include: { unit: true } });
    if (!product) return { message: 'Produit introuvable.', rows: [] };
    const rows = await this.prisma.stock.findMany({ where: { organizationId, productId }, include: { location: true, site: true, lot: true }, orderBy: [{ location: { name: 'asc' } }] });
    const total = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
    if (!rows.length || total === 0) return { message: `Stock actuel\n\n${product.name}\n0 ${product.unit?.symbol || ''}`.trim(), rows };
    const detail = rows.filter((row) => Number(row.quantity) !== 0).slice(0, 6).map((row) => `• ${Number(row.quantity).toLocaleString('fr-FR')} ${product.unit?.symbol || ''}${row.site?.name ? ` — ${row.site.name}` : ''}`).join('\n');
    return { message: `Stock actuel\n\n${product.name}\nTotal : ${total.toLocaleString('fr-FR')} ${product.unit?.symbol || ''}${detail ? `\n\nDétail :\n${detail}` : ''}`.trim(), rows };
  }

  private async agentContext(organizationId: string, content: string, state: AgentState) {
    const query = this.extractProductQuestion(content) || content;
    const [productCandidates, locations, suppliers, units] = await Promise.all([
      this.searchProductsTool(organizationId, query).catch(() => ({ selected: null, candidates: [] })),
      this.prisma.location.findMany({ where: { organizationId, isArchived: false }, include: { site: true }, orderBy: { name: 'asc' }, take: 80 }),
      this.prisma.supplier.findMany({ where: { organizationId, isArchived: false }, orderBy: { name: 'asc' }, take: 80 }),
      this.prisma.unit.findMany({ where: { organizationId, isArchived: false }, orderBy: { symbol: 'asc' }, take: 80 }),
    ]);
    return { activeState: state, productCandidates, locations: locations.map((l) => ({ id: l.id, name: l.name, siteName: l.site?.name })), suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })), units: units.map((u) => ({ id: u.id, symbol: u.symbol, name: u.name })) };
  }

  private agentClarification(state: AgentState, message: string): AgentResult { return { message, state, type: 'clarification_needed', questions: [message] }; }
  private normalizeState(value: any): AgentState { return value && typeof value === 'object' ? { ...value } : {}; }
  private summaryFromState(state: AgentState) { return { activeProductName: state.activeProductName || null, activeLocationName: state.activeLocationName || null, activeSupplierName: state.activeSupplierName || null, pendingIntent: state.pendingIntent || null, hasPendingProposal: Boolean(state.pendingProposal), lastProposalId: state.lastProposalId || null }; }
  private normalizeIntent(value: string) { const key = String(value || '').toLowerCase(); return (INTENTS[key] || key.toUpperCase()) as string; }
  private intentLabel(intent: string) { return intent === 'RECEIPT' ? 'de réception' : intent === 'WASTE' ? 'de perte' : intent === 'TRANSFER' ? 'de transfert' : intent === 'INVENTORY_COUNT' ? 'de comptage' : 'd’ajustement'; }
  private intentFromText(normalized: string) { return this.actionIntentFromText(normalized) || 'receipt'; }
  private actionIntentFromText(normalized: string) {
    if (/\b(perte|perdu|casse|gaspillage|jete|retire|retirer|retrait|enleve|enlever|sort|sors|sortie|destocke|destocker)\b/.test(normalized)) return 'waste';
    if (/\b(transfert|transferer|deplacer)\b/.test(normalized)) return 'transfer';
    if (/\b(inventaire|comptage)\b/.test(normalized)) return 'inventory_count';
    if (/\b(ajuste|corrige|correction)\b/.test(normalized)) return 'adjustment';
    if (/\b(ajoute|rajoute|recu|reception|receptionner|livraison|entree|mets|met)\b/.test(normalized)) return 'receipt';
    return null;
  }
  private locationQuestion(intent: string) {
    if (intent === 'WASTE') return 'Depuis quel site souhaitez-vous retirer ce stock ?';
    if (intent === 'TRANSFER') return 'Quel est le site de départ et le site de destination du transfert ?';
    if (intent === 'INVENTORY_COUNT') return 'Sur quel site souhaitez-vous enregistrer ce comptage ?';
    return `Sur quel site souhaitez-vous ${intent === 'RECEIPT' ? 'ajouter' : 'enregistrer'} ce stock ?`;
  }

  private productCreationDraftFromArgs(args: Record<string, any>, state: AgentState) {
    const fromText = this.productCreationDraftFromText(String(args.name || args.productName || args.rawLabel || ''), state);
    return {
      name: this.cleanProductName(String(args.name || args.productName || args.rawLabel || fromText.name || state.pendingProductCreation?.name || '').trim()) || null,
      unitSymbol: String(args.unitSymbol || args.unit || fromText.unitSymbol || state.pendingProductCreation?.unitSymbol || '').trim() || null,
      initialQuantity: Number(args.initialQuantity ?? args.quantity ?? fromText.initialQuantity ?? state.pendingProductCreation?.initialQuantity ?? 0) || null,
    };
  }

  private productCreationDraftFromText(text: string, state: AgentState) {
    const raw = String(text || '').trim();
    const quantityMatch = raw.match(/(\d+(?:[,.]\d+)?)\s*([a-zA-ZÀ-ÿ]{1,12})/);
    const left = raw.split(/-{1,2}>|→/)[0]?.trim() || raw;
    const name = this.cleanProductName(left
      .replace(/\*/g, '')
      .replace(/^cr[ée]er\s+(?:le\s+)?produits?\s*/i, '')
      .replace(/^cr[ée]er\s+un\s+nouveau\s+produit\s*/i, '')
      .replace(/\b(produits|produit|articles|article|nouveau|nouvelle|creer|créer|cree|crée|creation|ajouter|ajoute|le|la|un|une)\b/ig, ' ')
      .replace(/(\d+(?:[,.]\d+)?)\s*[a-zA-ZÀ-ÿ]{1,12}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim());
    const pending = state.pendingProductCreation || {};
    return {
      name: name || pending.name || null,
      unitSymbol: quantityMatch?.[2] || pending.unitSymbol || null,
      initialQuantity: quantityMatch ? Number(quantityMatch[1].replace(',', '.')) : pending.initialQuantity || null,
    };
  }

  private cleanProductName(value: string) {
    return String(value || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  }

  private async findExactProductByName(organizationId: string, name: string) {
    const products = await this.prisma.product.findMany({ where: { organizationId, isArchived: false }, include: { unit: true }, take: 500 });
    const normalized = normalizeStockText(name);
    return products.find((product) => normalizeStockText(product.name) === normalized) || null;
  }

  private async findUnitBySymbolOrName(organizationId: string, value: string) {
    const normalized = normalizeStockText(value);
    const units = await this.prisma.unit.findMany({ where: { organizationId, isArchived: false }, orderBy: { symbol: 'asc' }, take: 200 });
    return units.find((unit) => normalizeStockText(unit.symbol) === normalized || normalizeStockText(unit.name) === normalized) || null;
  }
  private shouldUseActiveProduct(query: string, normalized: string, state: AgentState) { return Boolean(state.activeProductId && (!query || this.isGenericReference(query) || this.isPronounStockFollowUp(query) || this.refersToPreviousProduct(normalized))); }
  private extractProductCatalogQuery(content: string) { return content.replace(/[?!.]+$/g, '').replace(/^(est ce que|j ai|as tu|avez vous|on a|y a t il|il y a)\s+/i, '').replace(/\b(dans|mes|les|produits|produit|catalogue|articles|article|du|de|des|d')\b/ig, ' ').trim(); }
  private async tryAnswerProductQuestion(organizationId: string, content: string) {
    const normalized = normalizeStockText(content);
    if (!/\b(produit|produits|catalogue|article|articles)\b/.test(normalized)) return null;
    const query = content.replace(/[?!.]+$/g, '').replace(/^(est ce que|j ai|as tu|avez vous|on a|y a t il|il y a)\s+/i, '').replace(/\b(dans|mes|les|produits|produit|catalogue|articles|article|du|de|des|d')\b/ig, ' ').trim();
    if (!query || this.isGenericReference(query)) return null;
    const match = await this.matching.match(organizationId, query);
    if (!match.productId) {
      const choices = match.candidates?.slice(0, 3).map((candidate: any) => candidate.name).join(', ');
      return choices ? { message: `Je n’ai pas trouvé “${query}” exactement. Produits proches : ${choices}.` } : { message: `Je n’ai pas trouvé de produit correspondant à “${query}”.` };
    }
    const product = await this.prisma.product.findFirst({ where: { id: match.productId, organizationId }, include: { unit: true } });
    if (!product) return null;
    return { message: `Oui, vous avez ce produit : ${product.name}${product.unit?.symbol ? ` (${product.unit.symbol})` : ''}.`, productId: product.id, productName: product.name };
  }
  private async tryAnswerStockQuestion(organizationId: string, content: string, memory?: { productId?: string; productName?: string }) {
    const normalized = normalizeStockText(content);
    if (/\b(faible|bas|alerte|rupture|minimum|low)\b/.test(normalized) && /\bstock\b/.test(normalized)) return this.lowStockAnswer(organizationId);
    const refersToPreviousProduct = this.refersToPreviousProduct(normalized);
    const asksStock = /\bstock\b/.test(normalized) || /\bquantite\b/.test(normalized) || /\b(en ai|il y en a|reste|dispo|disponible|combien)\b/.test(normalized);
    if (!asksStock && !refersToPreviousProduct) return null;
    const productQuery = this.extractProductQuestion(content);
    const productId = refersToPreviousProduct && memory?.productId && (!productQuery || this.isGenericReference(productQuery) || this.isPronounStockFollowUp(productQuery)) ? memory.productId : null;
    const match = productId ? { productId } : productQuery ? await this.matching.match(organizationId, productQuery) : { productId: null, candidates: [] as any[] };
    if (!match.productId) {
      const choices = match.candidates?.slice(0, 3).map((candidate: any) => candidate.name).join(', ');
      return choices ? { message: `Je n’ai pas trouvé de produit exact pour “${productQuery}”. Voulez-vous parler de : ${choices} ?` } : { message: memory?.productName ? `Vous parlez de ${memory.productName} ? Dites “stock” ou “réception” pour que je sache quoi faire.` : `Je n’ai pas trouvé de produit correspondant à “${productQuery || content}”.` };
    }
    const product = await this.prisma.product.findFirst({ where: { id: match.productId, organizationId }, include: { unit: true } });
    if (!product) return { message: `Je n’ai pas trouvé de produit correspondant à “${productQuery}”.` };
    const stocks = await this.prisma.stock.findMany({ where: { organizationId, productId: product.id }, include: { location: true, site: true } });
    const total = stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0);
    if (!stocks.length || total === 0) return { message: `Stock actuel\n\n${product.name}\n0 ${product.unit?.symbol || ''}`.trim(), productId: product.id, productName: product.name };
    const byLocation = stocks.filter((stock) => Number(stock.quantity) !== 0).slice(0, 5).map((stock) => `• ${Number(stock.quantity).toLocaleString('fr-FR')} ${product.unit?.symbol || ''}${stock.location?.name ? ` — ${stock.location.name}` : ''}`).join('\n');
    return { message: `Stock actuel\n\n${product.name}\nTotal : ${total.toLocaleString('fr-FR')} ${product.unit?.symbol || ''}${byLocation ? `\n\nDétail :\n${byLocation}` : ''}`.trim(), productId: product.id, productName: product.name };
  }
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
    return cleaned
      .replace(/^(donne|affiche|montre|quel est|quelle est|c est quoi|est ce que)\s+/i, '')
      .replace(/^(j['’ ]?ai|as tu|avez vous|on a|y a t il|il y a)\s+/i, '')
      .replace(/\s+(en\s+)?stock$/i, '')
      .replace(/\bstock\b/ig, '')
      .replace(/\b(de|du|des|d'|pour)\b/ig, ' ')
      .trim();
  }
  private async lowStockAnswer(organizationId: string) {
    const products = await this.prisma.product.findMany({ where: { organizationId, isArchived: false }, include: { unit: true, stocks: true }, take: 300 });
    const low = products.map((product) => ({ product, total: product.stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0), min: Number(product.minimumStock || 0) })).filter((item) => item.total <= item.min).sort((a, b) => a.total - b.total).slice(0, 8);
    if (!low.length) return { message: 'Produits en faible quantité\n\nAucun produit n’est actuellement sous son seuil minimum.' };
    const lines = low.map(({ product, total, min }) => `• ${product.name}\n  ${total.toLocaleString('fr-FR')} ${product.unit?.symbol || ''} — seuil ${min.toLocaleString('fr-FR')}`);
    return { message: `Produits en faible quantité\n\n${lines.join('\n')}` };
  }
  private parseSimpleReceipt(content: string) {
    const normalized = normalizeStockText(content);
    if (!/\b(ajoute|rajoute|recu|reception|livraison|entree)\b/.test(normalized)) return null;
    const match = content.match(/(\d+(?:[,.]\d+)?)\s*([a-zA-ZÀ-ÿ]{1,8})?\s+(?:de\s+|d'|du\s+|des\s+)?(.+?)\s*(?:stp|svp|merci)?[.!?]*$/i);
    if (!match) return null;
    const quantity = Number(match[1].replace(',', '.'));
    const unit = match[2]?.trim() || null;
    const rawLabel = match[3]?.replace(/\b(stp|svp|merci)\b/ig, '').trim();
    if (!Number.isFinite(quantity) || quantity <= 0 || !rawLabel) return null;
    return { rawLabel, quantity, unit, reason: 'Saisie chat assistant' };
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
    const unit = unitMatch && this.isLikelyUnitToken(unitMatch[1]) ? unitMatch[1] : null;
    return { quantity, unit };
  }
  private extractActionProductLabel(content: string) {
    return this.extractActionProductAndLocation(content).productLabel;
  }
  private extractActionProductAndLocation(content: string) {
    const match = content.match(/\d+(?:[,.]\d+)?(.*)$/i);
    if (!match) return { productLabel: null, locationQuery: null };
    let rest = String(match[1] || '').trim();
    const unitMatch = rest.match(/^([a-zA-ZÀ-ÿ]{1,12})\b/i);
    if (unitMatch && this.isLikelyUnitToken(unitMatch[1])) rest = rest.slice(unitMatch[0].length).trim();
    rest = rest.replace(/^(?:de\s+|d['’]\s*|du\s+|des\s+)/i, '');
    const split = rest.match(/^(.*?)(?:\s+(?:dans|a|à|au|aux|en|sur|vers)\s+(?:la\s+|le\s+|l['’]\s*|les\s+)?)(.+)$/i);
    const productLabel = this.cleanProductLabel(split?.[1] || rest);
    const locationQuery = this.cleanProductLabel(split?.[2] || '');
    return { productLabel, locationQuery };
  }
  private isLikelyUnitToken(value: string) {
    return /^(kg|kilo|kilos|g|gr|gramme|grammes|l|litre|litres|ml|cl|piece|pieces|pi[eè]ce|pi[eè]ces|pc|pcs|unite|unites|unit[eé]|unit[eé]s|boite|boites|carton|cartons|sachet|sachets|bouteille|bouteilles)$/i.test(value);
  }
  private cleanProductLabel(value: string) {
    const cleaned = String(value || '')
      .replace(/\b(stp|svp|merci|pardon|desole|désolé|quand meme|quand même|ok|oui|non)\b/ig, ' ')
      .replace(/^(le|la|les|l'|l’|en|ça|ca|ce|cet|cette|du|de|des|d')$/i, ' ')
      .replace(/[?!.]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || null;
  }
  private genericActionNeedsDetails(content: string) {
    const normalized = normalizeStockText(content);
    const genericProduct = /\b(article|articles|produit|produits|marchandise|marchandises|stock)\b/.test(normalized);
    const hasQuantity = /\d+(?:[,.]\d+)?/.test(content);
    if (/\b(reception|receptionner|ajoute|rajoute|recu|entree)\b/.test(normalized) && (genericProduct || !hasQuantity)) return 'D’accord. Indiquez la quantité, l’unité et le produit, par exemple : “J’ai reçu 10 kg de café”. Vous pouvez aussi joindre une facture.';
    if (/\b(perte|perdu|casse|gaspillage|jete|retire|retirer|retrait|enleve|enlever|sort|sors|sortie|destocke|destocker)\b/.test(normalized) && (genericProduct || !hasQuantity)) return 'Pour retirer du stock, indiquez la quantité et le produit, par exemple : “Retire 2 kg de tomates”.';
    if (/\b(transfert|transferer|deplacer)\b/.test(normalized) && (genericProduct || !hasQuantity)) return 'Pour un transfert, indiquez le produit, la quantité, le site source et le site de destination.';
    return null;
  }
  private async conversationMemory(organizationId: string, conversationId: string) {
    const recent = await (this.prisma as any).stockAssistantMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 12 });
    for (const message of recent) {
      const metadata = message.metadata as any;
      if (metadata?.productId) {
        const product = await this.prisma.product.findFirst({ where: { id: metadata.productId, organizationId, isArchived: false }, select: { id: true, name: true } });
        if (product) return { productId: product.id, productName: metadata.productName || product.name };
      }
    }
    return {};
  }
  private refersToPreviousProduct(normalized: string) {
    return /\b(en|ce|cet|cette|celui|celle|ca|cafe|produit)\b/.test(normalized) && /\b(stock|quantite|reste|dispo|disponible|combien|ai)\b/.test(normalized);
  }
  private isGenericReference(value: string) {
    const normalized = normalizeStockText(value);
    return !normalized || /^(en|le|la|les|ca|ce|cet|cette|celui|celle|produit|article|articles|produits|stock|stocks)$/.test(normalized);
  }
  private isPronounStockFollowUp(value: string) {
    const normalized = normalizeStockText(value);
    return /\b(j|je|en|ce|cet|cette|le|la|les|ca)\b/.test(normalized) && /\b(ai|as|a|stock|stocks|reste|dispo|disponible)\b/.test(normalized);
  }
  private async createProposal(organizationId: string, actor: Actor, input: any) { const lines = await Promise.all(input.lines.map(async (line: any) => { const match = await this.matching.match(organizationId, line.rawLabel, input.supplierId, line.supplierSku); return { productId: match.productId, rawLabel: line.rawLabel, supplierSku: line.supplierSku || null, quantity: line.quantity, purchaseUnit: line.unit || line.purchaseUnit || null, inputUnitId: match.inputUnitId, unitPriceExVat: line.unitPriceExVat || null, lotNumber: line.lotNumber || null, expiryDate: line.expiryDate ? new Date(line.expiryDate) : null, matchConfidence: match.confidence, matchStatus: match.status, notes: line.reason || null, metadata: { candidates: match.candidates } }; })); const proposal = await (this.prisma as any).stockProposal.create({ data: { ...input, organizationId, createdByUserId: actor.id, lines: undefined } }); await (this.prisma as any).stockProposalLine.createMany({ data: lines.map((line: any) => ({ proposalId: proposal.id, ...line })) }); return this.getProposal(organizationId, proposal.id); }
  private async validateLine(organizationId: string, line: ProposalLineDto) { if (line.productId) { const p = await this.prisma.product.findFirst({ where: { id: line.productId, organizationId, isArchived: false } }); if (!p) throw new BadRequestException('Produit invalide'); } if (line.inputUnitId) { const u = await this.prisma.unit.findFirst({ where: { id: line.inputUnitId, organizationId, isArchived: false } }); if (!u) throw new BadRequestException('Unité invalide'); } }
  private async learnAliases(organizationId: string, actor: Actor, proposal: any) {
    for (const line of proposal.lines) {
      if (!line.productId) continue;
      await this.upsertProductAlias(organizationId, {
        supplierId: proposal.supplierId || null,
        productId: line.productId,
        alias: line.rawLabel,
        normalizedAlias: normalizeStockText(line.rawLabel),
        supplierSku: line.supplierSku || null,
        purchaseUnit: line.purchaseUnit || null,
        createdBy: 'user',
      });
    }
  }
  private async upsertProductAlias(organizationId: string, data: { supplierId?: string | null; productId: string; alias: string; normalizedAlias: string; supplierSku?: string | null; purchaseUnit?: string | null; createdBy: string }) {
    if (data.supplierId) {
      return (this.prisma as any).productAlias.upsert({
        where: { organizationId_supplierId_normalizedAlias: { organizationId, supplierId: data.supplierId, normalizedAlias: data.normalizedAlias } },
        update: { productId: data.productId, alias: data.alias, supplierSku: data.supplierSku || null, purchaseUnit: data.purchaseUnit || null, createdBy: data.createdBy },
        create: { organizationId, supplierId: data.supplierId, productId: data.productId, alias: data.alias, normalizedAlias: data.normalizedAlias, supplierSku: data.supplierSku || null, purchaseUnit: data.purchaseUnit || null, createdBy: data.createdBy },
      });
    }
    const existing = await (this.prisma as any).productAlias.findFirst({ where: { organizationId, supplierId: null, normalizedAlias: data.normalizedAlias } });
    if (existing) return (this.prisma as any).productAlias.update({ where: { id: existing.id }, data: { productId: data.productId, alias: data.alias, supplierSku: data.supplierSku || null, purchaseUnit: data.purchaseUnit || null, createdBy: data.createdBy } });
    return (this.prisma as any).productAlias.create({ data: { organizationId, supplierId: null, productId: data.productId, alias: data.alias, normalizedAlias: data.normalizedAlias, supplierSku: data.supplierSku || null, purchaseUnit: data.purchaseUnit || null, createdBy: data.createdBy } });
  }
  private async context(organizationId: string) { const [products, units, locations, aliases] = await Promise.all([this.prisma.product.findMany({ where: { organizationId, isArchived: false }, select: { id: true, name: true, sku: true, gtin: true, unit: { select: { symbol: true } } }, take: 300 }), this.prisma.unit.findMany({ where: { organizationId, isArchived: false }, select: { id: true, symbol: true } }), this.prisma.location.findMany({ where: { organizationId, isArchived: false }, select: { id: true, name: true } }), (this.prisma as any).productAlias.findMany({ where: { organizationId }, take: 300 })]); return { products, units, locations, aliases }; }
  private assertAiResult(value: any) { if (!value || typeof value.message !== 'string' || !Array.isArray(value.lines) || !Array.isArray(value.questions) || typeof value.confidence !== 'number') throw new BadRequestException('Réponse IA invalide'); if (value.lines.some((line: any) => !line.rawLabel || !Number.isFinite(line.quantity) || line.quantity <= 0)) throw new BadRequestException('Réponse IA contient une ligne invalide'); }
  private assertWrite(actor: Actor) { if (!STOCK_WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Droits Stocks insuffisants'); }
}

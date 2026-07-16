import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TechnicalSheetAssistantDraftStatus, TechnicalSheetAssistantMessageRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TechnicalSheetsService } from '../technical-sheets/technical-sheets.service';
import { TechnicalSheetAgentHarnessService } from './technical-sheet-agent-harness.service';

type Actor = { id: string; role: string };
const ttl = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

@Injectable()
export class TechnicalSheetAssistantService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly sheets: TechnicalSheetsService, private readonly harness: TechnicalSheetAgentHarnessService) {}
  onModuleInit() { void this.expireOld(); this.cleanupTimer = setInterval(() => void this.expireOld(), 24 * 60 * 60 * 1000); this.cleanupTimer.unref?.(); }
  onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }

  async createConversation(organizationId: string, actor: Actor) {
    await this.assertModule(organizationId);
    return (this.prisma as any).technicalSheetAssistantConversation.create({ data: { organizationId, userId: actor.id, state: {}, summary: {}, expiresAt: ttl() } });
  }
  async getConversation(organizationId: string, actor: Actor, id: string) {
    const conversation = await (this.prisma as any).technicalSheetAssistantConversation.findFirst({ where: { id, organizationId, userId: actor.id }, include: { messages: { orderBy: { createdAt: 'asc' } }, drafts: { orderBy: { updatedAt: 'desc' }, take: 10 } } });
    if (!conversation) throw new NotFoundException('Conversation Kokki introuvable');
    return conversation;
  }
  async getDraft(organizationId: string, actor: Actor, id: string) {
    const draft = await (this.prisma as any).technicalSheetAssistantDraft.findFirst({ where: { id, organizationId, conversation: { userId: actor.id } } });
    if (!draft) throw new NotFoundException('Brouillon Kokki introuvable');
    return draft;
  }
  async discardDraft(organizationId: string, actor: Actor, id: string) {
    await this.getDraft(organizationId, actor, id);
    return (this.prisma as any).technicalSheetAssistantDraft.update({ where: { id }, data: { status: TechnicalSheetAssistantDraftStatus.DISCARDED } });
  }
  async markApplied(organizationId: string, actor: Actor, id: string) {
    await this.getDraft(organizationId, actor, id);
    return (this.prisma as any).technicalSheetAssistantDraft.update({ where: { id }, data: { status: TechnicalSheetAssistantDraftStatus.APPLIED } });
  }

  async message(organizationId: string, actor: Actor, conversationId: string, content: string) {
    await this.assertModule(organizationId);
    const conversation = await this.getConversation(organizationId, actor, conversationId);
    await (this.prisma as any).technicalSheetAssistantMessage.create({ data: { conversationId, role: TechnicalSheetAssistantMessageRole.USER, content } });
    const [recentMessages, context] = await Promise.all([this.recentMessages(conversationId), this.context(organizationId, content, conversation.state)]);
    const call = await this.harness.decide(organizationId, { content, state: conversation.state || {}, recentMessages, context });
    const raw: any = await this.execute(organizationId, actor, conversation, call.tool, call.args || {});
    const response = await this.harness.finalize(organizationId, content, { ...raw, toolResults: [{ tool: call.tool, result: raw.data || null }], confidence: raw.confidence ?? call.confidence, needsReview: raw.needsReview ?? false });
    const state = { ...(conversation.state || {}), ...(raw.statePatch || {}), lastTool: call.tool, lastDraftId: response.draftId || (conversation.state as any)?.lastDraftId || null };
    await (this.prisma as any).$transaction([
      (this.prisma as any).technicalSheetAssistantMessage.create({ data: { conversationId, role: TechnicalSheetAssistantMessageRole.ASSISTANT, content: response.assistantMessage, metadata: { draftId: response.draftId || null, choices: response.choices || [], toolResults: response.toolResults, confidence: response.confidence, needsReview: response.needsReview, humanHandoffSuggested: !!response.humanHandoffSuggested, humanHandoffReason: response.humanHandoffReason || null } } }),
      (this.prisma as any).technicalSheetAssistantConversation.update({ where: { id: conversationId }, data: { state, summary: this.summary(state), expiresAt: ttl() } }),
    ]);
    return { ...response, state };
  }

  async attachment(organizationId: string, actor: Actor, conversationId: string, file: any) {
    const conversation = await this.getConversation(organizationId, actor, conversationId);
    const imported: any = await this.sheets.analyzeRecipeAttachment(organizationId, file);
    const draft = await this.createDraft(organizationId, conversation.id, imported.payload, null, { source: 'recipe-import', filename: file.originalname, warnings: imported.warnings || [] });
    const message = `J’ai analysé « ${file.originalname} » et préparé un brouillon à vérifier dans l’éditeur.`;
    await (this.prisma as any).technicalSheetAssistantMessage.create({ data: { conversationId, role: TechnicalSheetAssistantMessageRole.ASSISTANT, content: message, metadata: { draftId: draft.id, needsReview: true } } });
    return { assistantMessage: message, draftId: draft.id, draft, needsReview: true, confidence: .8, toolResults: [{ tool: 'analyze_recipe_attachment', result: { warnings: imported.warnings || [] } }] };
  }

  private async execute(organizationId: string, actor: Actor, conversation: any, tool: string, args: any) {
    if (tool === 'search_recipes') {
      const result: any = await this.sheets.listRecipes(organizationId, { search: String(args.query || ''), pageSize: 8 });
      const items = result.items || [];
      return { assistantMessage: items.length ? `J’ai trouvé ${items.length} fiche(s) : ${items.map((r: any) => r.name).join(', ')}.` : 'Je n’ai trouvé aucune fiche correspondante.', data: items, choices: items.map((r: any) => ({ type: 'recipe_select', label: r.name, value: r.id })), statePatch: items.length === 1 ? { activeRecipeId: items[0].id, activeRecipeName: items[0].name } : {} };
    }
    if (tool === 'get_recipe_details' || tool === 'get_recipe_cost') {
      const recipe = await this.resolveRecipe(organizationId, args.recipeId || args.targetTechnicalSheetId || conversation.state?.activeRecipeId, args.query || args.recipeQuery);
      if (!recipe) return this.clarify('Quelle fiche technique voulez-vous consulter ?');
      const cost = `Coût matière : ${Number(recipe.totalCost || 0).toFixed(2)} € · ${Number(recipe.costPerPortion || 0).toFixed(2)} € / portion.`;
      return { assistantMessage: tool === 'get_recipe_cost' ? `${recipe.name}\n\n${cost}` : `${recipe.name} — ${Number(recipe.referencePortions)} portions, ${recipe.ingredients?.length || 0} ingrédients, ${recipe.steps?.length || 0} étapes.\n\n${cost}`, data: recipe, statePatch: { activeRecipeId: recipe.id, activeRecipeName: recipe.name } };
    }
    if (tool === 'search_stock_products') {
      const products = await this.products(organizationId, String(args.query || ''));
      return { assistantMessage: products.length ? `J’ai trouvé : ${products.map((p: any) => p.name).join(', ')}.` : 'Aucun produit Stocks ne correspond.', data: products, choices: products.map((p: any) => ({ type: 'product_select', label: p.name, value: p.id, description: p.unit?.symbol })) };
    }
    if (tool === 'list_recipe_categories') {
      const categories: any[] = await this.sheets.listCategories(organizationId, {});
      return { assistantMessage: categories.length ? `Catégories disponibles : ${categories.map((c) => c.name).join(', ')}.` : 'Aucune catégorie recette disponible.', data: categories, choices: categories.map((c) => ({ type: 'category_select', label: c.name, value: c.id })) };
    }
    if (tool === 'simulate_production') {
      const recipe = await this.resolveRecipe(organizationId, args.recipeId || conversation.state?.activeRecipeId, args.query);
      const portions = Number(args.requestedPortions || args.portions);
      if (!recipe || !Number.isFinite(portions) || portions <= 0) return this.clarify(!recipe ? 'Pour quelle fiche voulez-vous simuler la production ?' : 'Pour combien de portions ?');
      const simulation: any = await this.sheets.simulate(organizationId, actor, { recipeId: recipe.id, requestedPortions: portions });
      return { assistantMessage: `${recipe.name} pour ${portions} portions : coût estimé ${Number(simulation.estimatedCost).toFixed(2)} €.`, data: simulation, statePatch: { activeRecipeId: recipe.id, activeRecipeName: recipe.name } };
    }
    if (tool === 'prepare_recipe_draft' || tool === 'prepare_recipe_pricing') return this.prepareDraft(organizationId, conversation, args, tool === 'prepare_recipe_pricing');
    return { ...this.clarify(args.message || 'Voulez-vous créer une fiche, consulter un coût ou simuler une production ?'), statePatch: args.pendingIntent ? { pendingIntent: args.pendingIntent } : {} };
  }

  private async prepareDraft(organizationId: string, conversation: any, args: any, pricingOnly = false) {
    const targetId = args.targetTechnicalSheetId || args.recipeId || conversation.state?.activeRecipeId || null;
    const source: any = targetId ? await this.sheets.getRecipe(organizationId, targetId).catch(() => null) : null;
    const categories: any[] = await this.sheets.listCategories(organizationId, {});
    const products = await this.products(organizationId, '');
    const units = await (this.prisma as any).unit.findMany({ where: { organizationId, isArchived: false }, orderBy: { symbol: 'asc' } });
    const base: any = source ? this.payloadFromRecipe(source) : { name: '', referencePortions: 1, status: 'DRAFT', ingredients: [], steps: [] };
    const incoming = args.payload || args.draft || args;
    const payload: any = { ...base, ...incoming, targetSellingPriceExclTax: incoming.targetSellingPriceExclTax ?? incoming.targetSellingPriceHtPerPortion ?? base.targetSellingPriceExclTax };
    payload.name = String(payload.name || source?.name || 'Nouvelle fiche technique').slice(0, 220);
    payload.referencePortions = Math.max(Number(payload.referencePortions || source?.referencePortions || 1), .001);
    payload.categoryId = payload.categoryId || categories.find((c) => c.name?.toLocaleLowerCase('fr') === String(payload.categoryName || '').toLocaleLowerCase('fr'))?.id || source?.categoryId || categories[0]?.id || undefined;
    payload.status = source?.status || payload.status || 'DRAFT';
    if (!pricingOnly) payload.ingredients = await this.normalizeIngredients(organizationId, payload.ingredients || [], products, units);
    if (!Array.isArray(payload.steps)) payload.steps = source?.steps || [];
    const draft = await this.createDraft(organizationId, conversation.id, payload, targetId, { kind: pricingOnly ? 'pricing' : targetId ? 'update' : 'create' });
    return { assistantMessage: `J’ai préparé un brouillon ${targetId ? 'de modification' : 'de fiche'} pour « ${payload.name} ». Ouvrez-le pour le relire avant enregistrement.`, draftId: draft.id, draft, choices: [{ type: 'draft_review', label: 'Ouvrir le brouillon', value: draft.id }], needsReview: true, confidence: .8, statePatch: { activeRecipeId: targetId || null, activeRecipeName: payload.name, activeDraftId: draft.id } };
  }
  private async normalizeIngredients(organizationId: string, lines: any[], products: any[], units: any[]) {
    return Promise.all((Array.isArray(lines) ? lines : []).map(async (line, order) => {
      const name = String(line.productName || line.name || '').trim();
      const product = line.productId ? products.find((p) => p.id === line.productId) : products.find((p) => p.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr')) || products.find((p) => p.name.toLocaleLowerCase('fr').includes(name.toLocaleLowerCase('fr')));
      const unit = units.find((u) => u.id === line.unitId) || units.find((u) => String(u.symbol).toLocaleLowerCase() === String(line.unit || '').toLocaleLowerCase()) || product?.unit || units[0];
      return { productId: product?.id, productName: product ? undefined : name || undefined, createProduct: !product && Boolean(name), unitId: unit?.id, quantity: Math.max(Number(line.quantity || 1), .001), comment: line.comment || undefined, order };
    })).then((lines) => lines.filter((line) => line.unitId));
  }
  private payloadFromRecipe(recipe: any) { return { name: recipe.name, description: recipe.description, categoryId: recipe.categoryId, referencePortions: recipe.referencePortions, prepTimeMinutes: recipe.prepTimeMinutes, cookTimeMinutes: recipe.cookTimeMinutes, status: recipe.status, ingredients: (recipe.ingredients || []).map((l: any) => ({ productId: l.productId, unitId: l.unitId, quantity: l.quantity, comment: l.comment, order: l.order })), steps: (recipe.steps || []).map((s: any) => ({ order: s.order, title: s.title, description: s.description, estimatedTimeMinutes: s.estimatedTimeMinutes })) }; }
  private async createDraft(organizationId: string, conversationId: string, payload: any, targetTechnicalSheetId: string | null, metadata: any) { return (this.prisma as any).technicalSheetAssistantDraft.create({ data: { organizationId, conversationId, targetTechnicalSheetId, payload, metadata, expiresAt: ttl() } }); }
  private async resolveRecipe(organizationId: string, id?: string, query?: string) { if (id) return this.sheets.getRecipe(organizationId, id).catch(() => null); const result: any = await this.sheets.listRecipes(organizationId, { search: String(query || ''), pageSize: 2 }); return result.items?.length === 1 ? result.items[0] : null; }
  private products(organizationId: string, query: string) { return (this.prisma as any).product.findMany({ where: { organizationId, isArchived: false, name: query ? { contains: query, mode: 'insensitive' } : undefined }, include: { unit: true }, orderBy: { name: 'asc' }, take: 80 }); }
  private recentMessages(conversationId: string) { return (this.prisma as any).technicalSheetAssistantMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 12 }).then((rows: any[]) => rows.reverse().map((m) => ({ role: m.role, content: m.content }))); }
  private async context(organizationId: string, content: string, state: any) { const [recipes, products, categories] = await Promise.all([this.sheets.listRecipes(organizationId, { search: content, pageSize: 8 }), this.products(organizationId, content), this.sheets.listCategories(organizationId, {})]); return { state, recipes: (recipes as any).items?.map((r: any) => ({ id: r.id, name: r.name, referencePortions: r.referencePortions })) || [], products: products.slice(0, 12).map((p: any) => ({ id: p.id, name: p.name, unitId: p.unitId, unit: p.unit?.symbol })), categories: categories.map((c: any) => ({ id: c.id, name: c.name })) }; }
  private async assertModule(organizationId: string) { await this.sheets.dashboard(organizationId); }
  private clarify(message: string) {
    const normalized = message.toLocaleLowerCase('fr');
    const choices = normalized.includes('créer une fiche') || normalized.includes('nouvelle fiche')
      ? [
          { type: 'clarification', label: 'Créer une nouvelle fiche technique' },
          { type: 'clarification', label: 'Modifier une fiche existante' },
        ]
      : normalized.includes('créer une fiche, consulter un coût')
        ? [
            { type: 'clarification', label: 'Créer une nouvelle fiche technique' },
            { type: 'clarification', label: 'Consulter le coût d’une fiche' },
            { type: 'clarification', label: 'Simuler une production' },
          ]
        : [];
    return { assistantMessage: message, needsReview: false, confidence: .4, choices };
  }
  private summary(state: any) { return { activeRecipeName: state.activeRecipeName || null, activeDraftId: state.activeDraftId || null, lastTool: state.lastTool || null }; }
  private async expireOld() { const now = new Date(); await (this.prisma as any).technicalSheetAssistantDraft.updateMany({ where: { status: TechnicalSheetAssistantDraftStatus.PENDING_REVIEW, expiresAt: { lt: now } }, data: { status: TechnicalSheetAssistantDraftStatus.EXPIRED } }); await (this.prisma as any).technicalSheetAssistantConversation.deleteMany({ where: { expiresAt: { lt: now } } }); }
}

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Paperclip, 
  Send, 
  X, 
  Sparkles, 
  FileText, 
  Check, 
  Trash2, 
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Plus,
  Zap,
  Search,
  PlusCircle,
  MinusCircle,
  ArrowLeftRight
} from 'lucide-react';
import { api } from '../api/client';
import type { Category, Location, Product, Site, StockAssistantChoice, StockConversation, StockProposal, Supplier, Unit } from '../types';

type ChatItem = { id: string; role: 'user' | 'assistant' | 'system'; text: string; fileName?: string; proposalId?: string; action?: 'location_select'; choices?: StockAssistantChoice[] };
type QuickCard = { id: string; title: string; subtitle: string; prompt?: string; action?: 'attach_invoice' };
const greetingItems: ChatItem[] = [
  { id: 'hello', role: 'assistant', text: 'Bonjour ! Je suis Kokki, votre assistant de stock intelligent. Décrivez-moi un mouvement (ex : “j’ai reçu 10 kg de café”) ou joignez une facture PDF/photo ici.' }
];
const quickCards: QuickCard[] = [
  { id: 'stock', title: 'Consulter un stock', subtitle: 'Choisir un produit', prompt: 'Y a-t-il du stock de ?' },
  { id: 'receipt', title: 'Ajouter du stock', subtitle: 'Produit, quantité, lieu', prompt: 'Ajouter du stock' },
  { id: 'waste', title: 'Retirer une perte', subtitle: 'Produit, quantité, lieu', prompt: 'Retirer une perte' },
  { id: 'transfer', title: 'Transférer', subtitle: 'Source et destination', prompt: 'Transférer du stock' },
  { id: 'low', title: 'Stocks faibles', subtitle: 'Voir les alertes', prompt: 'Quels sont les produits en faible stock ?' },
  { id: 'invoice', title: 'Joindre facture', subtitle: 'PDF ou photo', action: 'attach_invoice' },
];

export function StockAssistantPanel({ 
  isOpen, 
  onClose, 
  token, 
  products, 
  categories,
  units, 
  suppliers,
  sites,
  locations, 
  initialProposalId, 
  onApplied 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  token: string; 
  products: Product[]; 
  categories: Category[];
  units: Unit[]; 
  suppliers: Supplier[];
  sites: Site[];
  locations: Location[]; 
  initialProposalId?: string; 
  onApplied: () => void; 
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const [conversationId, setConversationId] = useState<string>();
  const [message, setMessage] = useState('');
  const [proposal, setProposal] = useState<StockProposal>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [attachedFile, setAttachedFile] = useState<File>();
  const [items, setItems] = useState<ChatItem[]>(greetingItems);
  const [productPickerLineIndex, setProductPickerLineIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');
  const [productSupplierFilter, setProductSupplierFilter] = useState('');
  const [productUnitFilter, setProductUnitFilter] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const showQuickCards = items.filter((item) => item.role === 'user').length === 0 && !busy;
  const proposalSupplierName = proposal ? suppliers.find((supplier) => supplier.id === proposal.supplierId)?.name || proposal.metadata?.supplierName || proposal.metadata?.ocrResult?.supplierName || proposal.metadata?.ocrResult?.supplier?.supplierName || proposal.metadata?.ocrResult?.supplier?.name || null : null;
  const siteChoices = sites
    .filter((site) => !site.isArchived)
    .map((site) => {
      const siteLocations = locations.filter((location) => (location.siteId === site.id || location.site?.id === site.id) && !location.isArchived);
      const technical = siteLocations.find((location) => location.name.toLowerCase() === 'stock général');
      return { site, location: technical || siteLocations[0] || null };
    })
    .filter((item) => item.location);
  const onlySiteLocationId = siteChoices.length === 1 ? siteChoices[0].location!.id : '';
  const locationLabel = (locationId?: string | null) => {
    const location = locations.find((item) => item.id === locationId);
    return location?.site?.name || sites.find((site) => site.id === location?.siteId)?.name || location?.name || '';
  };
  const visibleChoices = (choices?: StockAssistantChoice[]) => (choices || []).filter((choice) => choice.type !== 'location_select');
  const pickerLine = productPickerLineIndex !== null ? proposal?.lines[productPickerLineIndex] : null;
  const filteredProducts = useMemo(() => {
    const query = normalizeAssistantSearch(productSearch || pickerLine?.rawLabel || '');
    return products
      .filter((product) => !product.isArchived)
      .filter((product) => {
        if (productCategoryFilter && (product.categoryId ?? product.category?.id) !== productCategoryFilter) return false;
        const supplierId = product.primarySupplierId ?? product.supplierId ?? product.primarySupplier?.id ?? product.supplier?.id ?? '';
        if (productSupplierFilter && supplierId !== productSupplierFilter) return false;
        if (productUnitFilter && product.unitId !== productUnitFilter) return false;
        if (!query) return true;
        const haystack = normalizeAssistantSearch([
          product.name,
          product.sku,
          product.reference,
          product.category?.name,
          product.primarySupplier?.name,
          product.supplier?.name,
          product.unit?.symbol,
        ].filter(Boolean).join(' '));
        return query.split(' ').every((part) => haystack.includes(part));
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 80);
  }, [products, productSearch, pickerLine?.rawLabel, productCategoryFilter, productSupplierFilter, productUnitFilter]);

  // Auto-scroll chat feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [items, busy]);

  useEffect(() => {
    if (initialProposalId) {
      api.stockAssistantProposal(token, initialProposalId)
        .then((prop) => {
          setProposal(prop);
          setItems((current) => [
            ...current,
            {
              id: `${Date.now()}-init`,
              role: 'assistant',
              text: `J'ai chargé la proposition #${initialProposalId.slice(0, 8)} pour révision.`,
              proposalId: prop.id
            }
          ]);
        })
        .catch((e: any) => setError(e.message));
    }
  }, [initialProposalId, token]);

  useEffect(() => {
    if (!isOpen || !conversationId) return;
    void loadConversation(conversationId);
  }, [isOpen, conversationId]);

  useEffect(() => {
    if (!proposal || proposal.locationId || !onlySiteLocationId) return;
    setProposal({ ...proposal, locationId: onlySiteLocationId });
  }, [proposal?.id, proposal?.locationId, onlySiteLocationId]);

  function mapConversationMessages(messages: NonNullable<StockConversation['messages']>): ChatItem[] {
    if (!messages.length) return greetingItems;
    return messages.map((item) => ({
      id: item.id,
      role: item.role === 'USER' ? 'user' : item.role === 'SYSTEM' ? 'system' : 'assistant',
      text: item.content,
      proposalId: item.metadata?.proposalId || undefined,
      choices: item.metadata?.choices || undefined,
      action: undefined,
    }));
  }

  async function loadConversation(id: string) {
    try {
      const conversation = await api.stockAssistantConversation(token, id);
      if (conversation.messages) setItems(mapConversationMessages(conversation.messages));
    } catch (e: any) {
      setError(e.message || 'Impossible de charger la conversation');
    }
  }

  async function ensureConversation() {
    if (conversationId) return conversationId;
    const conversation = await api.createStockAssistantConversation(token, proposal?.locationId || undefined);
    setConversationId(conversation.id);
    return conversation.id;
  }

  async function handleNewConversation() {
    setBusy(true);
    setError(undefined);
    try {
      const conversation = await api.createStockAssistantConversation(token, proposal?.locationId || undefined);
      setConversationId(conversation.id);
      setItems(greetingItems);
      setProposal(undefined);
    } catch (e: any) {
      setError(e.message || 'Impossible de créer une nouvelle conversation');
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!message.trim() && !attachedFile) return;
    const text = message.trim() || 'Facture jointe';
    const file = attachedFile;
    setBusy(true);
    setError(undefined);
    setItems((current) => [...current, { id: `${Date.now()}-user`, role: 'user', text, fileName: file?.name }]);
    setMessage('');
    setAttachedFile(undefined);
    
    try {
      if (file) {
        const id = await ensureConversation();
        setItems((current) => [...current, { id: `${Date.now()}-upload`, role: 'system', text: `Analyse de la facture "${file.name}" en cours...` }]);
        const result = await api.createStockAssistantInvoiceAttachmentProposal(token, file, proposal?.locationId || undefined, id);
        if (!('lines' in result)) {
          setItems((current) => [
            ...current,
            {
              id: `${Date.now()}-assistant-processing`,
              role: 'assistant',
              text: 'Facture reçue.\n\nLe fichier a bien été ajouté à vos documents Stocks.\n\nL’analyse OCR est encore en cours. Réessayez dans quelques instants ou consultez le document dans vos documents Stocks.',
            },
          ]);
          void loadConversation(id);
          return;
        }
        const nextProposal = result;
        setProposal(nextProposal);
        const supplierName = suppliers.find((supplier) => supplier.id === nextProposal.supplierId)?.name || nextProposal.metadata?.supplierName || nextProposal.metadata?.ocrResult?.supplierName || nextProposal.metadata?.ocrResult?.supplier?.supplierName || nextProposal.metadata?.ocrResult?.supplier?.name || null;
        setItems((current) => [
          ...current, 
          { 
            id: `${Date.now()}-assistant`, 
            role: 'assistant', 
            text: `Facture analysée.\n\n${supplierName ? `Fournisseur détecté : ${supplierName}.` : 'Je n’ai pas identifié le fournisseur avec certitude.'}\nLe fichier a bien été ajouté à vos documents Stocks.\n\nVeuillez réviser et valider la proposition de réception.`,
            proposalId: nextProposal.id 
          }
        ]);
        void loadConversation(id);
        return;
      }
      
      const id = await ensureConversation();
      const result = await api.stockAssistantMessage(token, id, text, proposal?.locationId || undefined);
      
      setItems((current) => [
        ...current, 
        { 
          id: `${Date.now()}-assistant`, 
          role: 'assistant', 
          text: result.assistantMessage || 'J’ai préparé la proposition correspondante pour vos stocks.',
          proposalId: result.proposalId,
          choices: result.choices,
          action: undefined,
        }
      ]);
      
      if (result.proposalId) {
        const nextProposal = await api.stockAssistantProposal(token, result.proposalId);
        setProposal(nextProposal);
      }
      void loadConversation(id);
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue');
      setItems((current) => [...current, { id: `${Date.now()}-error`, role: 'assistant', text: e.message || 'Je n’ai pas pu traiter votre demande.' }]);
    } finally {
      setBusy(false);
    }
  }

  async function sendLocationChoice(location: Location, label?: string) {
    setBusy(true);
    setError(undefined);
    try {
      const id = await ensureConversation();
      const siteLabel = label || locationLabel(location.id) || location.name;
      setItems((current) => [...current, { id: `${Date.now()}-user-location`, role: 'user', text: siteLabel }]);
      const result = await api.stockAssistantMessage(token, id, siteLabel, location.id);
      setItems((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant-location`,
          role: 'assistant',
          text: result.assistantMessage || 'J’ai préparé la proposition correspondante pour vos stocks.',
          proposalId: result.proposalId,
          choices: result.choices,
          action: undefined,
        },
      ]);
      if (result.proposalId) setProposal(await api.stockAssistantProposal(token, result.proposalId));
      void loadConversation(id);
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue');
      setItems((current) => [...current, { id: `${Date.now()}-error-location`, role: 'assistant', text: 'Je n’ai pas pu traiter ce site.' }]);
    } finally {
      setBusy(false);
    }
  }

  async function saveAndApply() {
    if (!proposal) return;
    setBusy(true);
    setError(undefined);
    try {
      const saved = await api.updateStockAssistantProposal(token, proposal.id, {
        version: proposal.version,
        locationId: proposal.locationId,
        sourceLocationId: proposal.sourceLocationId,
        destinationLocationId: proposal.destinationLocationId,
        supplierId: proposal.supplierId,
        duplicateOverrideReason: proposal.duplicateOverrideReason || undefined,
        lines: editableProposalLines(proposal.lines)
      });
      const applied = await api.applyStockAssistantProposal(token, saved.id, saved.version);
      setProposal(applied);
      
      // Update item in feed to reflect status
      setItems((current) => [
        ...current,
        { id: `${Date.now()}-applied`, role: 'assistant', text: 'Parfait ! Les mouvements de stock ont été validés et appliqués en base de données.' }
      ]);
      onApplied();
      
      // Auto close proposal panel after success
      setTimeout(() => setProposal(undefined), 2000);
    } catch (e: any) {
      setError(e.message || 'Validation impossible');
    } finally {
      setBusy(false);
    }
  }

  async function sendChoice(choice: StockAssistantChoice) {
    if (choice.type === 'proposal_review' && choice.value) {
      setError(undefined);
      try {
        setProposal(await api.stockAssistantProposal(token, choice.value));
      } catch (e: any) {
        setError(e.message || 'Impossible de charger la proposition');
      }
      return;
    }
    if (choice.type === 'location_select' && choice.value) {
      const location = locations.find((item) => item.id === choice.value);
      if (location) {
        void sendLocationChoice(location, choice.label);
        return;
      }
    }
    setTimeout(() => void sendText(choice.label), 0);
  }

  async function sendText(text: string) {
    if (!text.trim()) return;
    setBusy(true);
    setError(undefined);
    setItems((current) => [...current, { id: `${Date.now()}-user-choice`, role: 'user', text }]);
    try {
      const id = await ensureConversation();
      const result = await api.stockAssistantMessage(token, id, text, proposal?.locationId || undefined);
      setItems((current) => [...current, { id: `${Date.now()}-assistant-choice`, role: 'assistant', text: result.assistantMessage || 'J’ai traité votre choix.', proposalId: result.proposalId, choices: result.choices, action: undefined }]);
      if (result.proposalId) setProposal(await api.stockAssistantProposal(token, result.proposalId));
      void loadConversation(id);
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue');
    } finally {
      setBusy(false);
    }
  }

  function handleQuickCard(card: QuickCard) {
    if (card.action === 'attach_invoice') {
      fileInputRef.current?.click();
      return;
    }
    if (card.prompt) setMessage(card.prompt);
  }

  async function rejectProposal() {
    if (!proposal) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.rejectStockAssistantProposal(token, proposal.id);
      setProposal(undefined);
      setItems((current) => [
        ...current,
        { id: `${Date.now()}-rejected`, role: 'assistant', text: 'La proposition de stock a été rejetée et archivée.' }
      ]);
    } catch (e: any) {
      setError(e.message || 'Rejet impossible');
    } finally {
      setBusy(false);
    }
  }

  function patchLine(index: number, patch: Partial<StockProposal['lines'][number]>) {
    if (!proposal) return;
    setProposal({ 
      ...proposal, 
      lines: proposal.lines.map((line, i) => i === index ? { ...line, ...patch } as any : line) 
    });
  }

  function openProductPicker(index: number) {
    const line = proposal?.lines[index];
    setProductPickerLineIndex(index);
    setProductSearch(line?.rawLabel || '');
    setProductCategoryFilter('');
    setProductSupplierFilter(proposal?.supplierId || '');
    setProductUnitFilter(line?.inputUnitId || '');
  }

  function selectProductForLine(product: Product) {
    if (productPickerLineIndex === null) return;
    patchLine(productPickerLineIndex, {
      productId: product.id,
      inputUnitId: product.unitId || null,
    });
    setProductPickerLineIndex(null);
  }

  async function createProductForLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (productPickerLineIndex === null || !pickerLine) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const unitId = String(form.get('unitId') || '').trim();
    const categoryId = String(form.get('categoryId') || '').trim();
    const primarySupplierId = String(form.get('primarySupplierId') || '').trim();
    if (!name || !unitId) return;
    setCreatingProduct(true);
    setError(undefined);
    try {
      const product = await api.createProduct(token, {
        name,
        unitId,
        categoryId: categoryId || undefined,
        primarySupplierId: primarySupplierId || undefined,
        description: `Créé depuis Kokki pour la ligne facture : ${pickerLine.rawLabel}`,
      });
      patchLine(productPickerLineIndex, {
        productId: product.id,
        inputUnitId: product.unitId || unitId,
      });
      setProductPickerLineIndex(null);
      onApplied();
    } catch (e: any) {
      setError(e.message || 'Impossible de créer le produit');
    } finally {
      setCreatingProduct(false);
    }
  }

  function editableProposalLines(lines: StockProposal['lines']) {
    return lines.map((line) => ({
      id: line.id,
      productId: line.productId || null,
      rawLabel: line.rawLabel,
      supplierSku: line.supplierSku || null,
      quantity: Number(line.quantity),
      purchaseUnit: line.purchaseUnit || null,
      inputUnitId: line.inputUnitId || null,
      unitPriceExVat: line.unitPriceExVat == null ? null : Number(line.unitPriceExVat),
      lotNumber: line.lotNumber || null,
      expiryDate: line.expiryDate || null,
      notes: line.notes || null,
    }));
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="stock-assistant-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={`stock-assistant-panel-container ${proposal ? 'split-active' : ''}`}
            style={{ width: proposal ? '1020px' : '440px' }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Chat Pane */}
            <div className="stock-assistant-chat-pane">
              <div className="stock-chat-header">
                <div className="stock-chat-header-info">
                  <div className="stock-chat-header-avatar">
                    <img 
                      src="/kokki-transparent.png" 
                      alt="Kokki" 
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                    />
                  </div>
                  <div className="stock-chat-status">
                    <span className="stock-chat-status-title">Kokki</span>
                    <span className="stock-chat-status-dot">En ligne</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button 
                    className="stock-chat-header-btn-new"
                    onClick={handleNewConversation}
                    title="Nouvelle conversation"
                  >
                    <Plus size={18} />
                  </button>
                  <button className="stock-chat-header-close" onClick={onClose}>
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div ref={feedRef} className="stock-chat-feed">
                {items.map((item) => (
                  <motion.div 
                    key={item.id}
                    initial={{ scale: 0.95, opacity: 0, y: 12 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`stock-chat-feed-item ${item.role === 'user' ? 'user' : 'assistant'}`}
                    style={{ 
                      display: 'flex', 
                      gap: '8px', 
                      alignItems: 'flex-start', 
                      alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start', 
                      maxWidth: '85%' 
                    }}
                  >
                    {item.role === 'assistant' && (
                      <div className="stock-chat-feed-avatar">
                        <img 
                          src="/kokki-transparent.png" 
                          alt="Kokki" 
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                        />
                      </div>
                    )}
                    <div className={`stock-chat-bubble-wrapper ${item.role}`} style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                      <div className="stock-chat-bubble">
                        {item.text}
                        {item.fileName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, opacity: 0.8, fontSize: '0.8rem' }}>
                            <Paperclip size={12} /> {item.fileName}
                          </div>
                        )}
                      </div>
                      <div className="stock-chat-bubble-meta">
                        {item.role === 'user' ? 'Vous' : 'Kokki'}
                      </div>

                      {item.proposalId && (
                        <div className="stock-chat-proposal-card">
                          <div className="stock-chat-proposal-card-header">
                            <FileText size={16} />
                            <span>Proposition de Stock</span>
                            <span className={`stock-proposal-badge ${proposal?.status === 'APPLIED' ? 'status-applied' : 'status-needs-review'}`}>
                              {proposal?.id === item.proposalId && proposal?.status === 'APPLIED' ? 'Appliqué' : 'À vérifier'}
                            </span>
                          </div>
                          <div className="stock-chat-proposal-card-body">
                            Générée automatiquement par l'IA. Prête pour révision et validation.
                          </div>
                          <div className="stock-chat-proposal-card-actions">
                            <button 
                              className="btn-review"
                              onClick={async () => {
                                setError(undefined);
                                try {
                                  const prop = await api.stockAssistantProposal(token, item.proposalId!);
                                  setProposal(prop);
                                } catch (e: any) {
                                  setError(e.message || 'Impossible de charger la proposition');
                                }
                              }}
                            >
                              Vérifier & Appliquer <ArrowRight size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                      {visibleChoices(item.choices).length ? (
                        <div className="stock-chat-choice-list">
                          {visibleChoices(item.choices).map((choice, index) => (
                            <button key={`${choice.type}-${choice.value || choice.label}-${index}`} disabled={busy} onClick={() => void sendChoice(choice)}>
                              <span>{choice.label}</span>
                              {choice.description ? <small>{choice.description}</small> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                ))}

                {busy && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', alignSelf: 'flex-start', marginLeft: '0.25rem' }}>
                    <div className="stock-chat-feed-avatar" style={{ marginTop: 0 }}>
                      <img 
                        src="/kokki-transparent.png" 
                        alt="Kokki" 
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                      />
                    </div>
                    <div className="typing-indicator" style={{ margin: 0 }}>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                )}
                {showQuickCards && (
                  <div className="stock-chat-quick-cards">
                    <div className="stock-chat-quick-cards-title">
                      <Zap size={13} style={{ fill: '#f59e0b', color: '#f59e0b' }} />
                      <span>Actions rapides</span>
                    </div>
                    <div className="stock-chat-quick-cards-grid">
                      {quickCards.map((card) => (
                        <button 
                          key={card.id} 
                          disabled={busy} 
                          onClick={() => handleQuickCard(card)}
                          className={`stock-chat-quick-card-btn ${card.id}`}
                        >
                          <div className={`quick-card-icon-wrapper ${card.id}`}>
                            {card.id === 'stock' && <Search size={15} />}
                            {card.id === 'receipt' && <PlusCircle size={15} />}
                            {card.id === 'waste' && <MinusCircle size={15} />}
                            {card.id === 'transfer' && <ArrowLeftRight size={15} />}
                            {card.id === 'low' && <AlertTriangle size={15} />}
                            {card.id === 'invoice' && <Paperclip size={15} />}
                          </div>
                          <div className="stock-chat-quick-card-text">
                            <span>{card.title}</span>
                            <small>{card.subtitle}</small>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div style={{ padding: '0.5rem 1.25rem', background: '#fef2f2', color: '#991b1b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              <div className="stock-chat-input-area">
                {attachedFile && (
                  <div className="stock-chat-attachment-bar">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Paperclip size={14} /> {attachedFile.name}
                    </span>
                    <button onClick={() => setAttachedFile(undefined)}><X size={14} /></button>
                  </div>
                )}
                
                <div className="stock-chat-input-row">
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    accept="application/pdf,image/*" 
                    style={{ display: 'none' }} 
                    onChange={(event) => setAttachedFile(event.target.files?.[0] || undefined)} 
                  />
                  <button 
                    className="btn btn-secondary btn-icon-only" 
                    title="Joindre une facture (PDF, Image)" 
                    disabled={busy} 
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={18} />
                  </button>
                  <input 
                    value={message} 
                    onChange={e => setMessage(e.target.value)} 
                    placeholder={attachedFile ? `Envoyer avec ${attachedFile.name}...` : "Message à Kokki (ex : réception, perte...)"} 
                    onKeyDown={e => e.key === 'Enter' && send()}
                    disabled={busy}
                  />
                  <button 
                    className="btn btn-primary btn-icon-only" 
                    disabled={busy || (!message.trim() && !attachedFile)} 
                    onClick={send}
                    style={{ background: '#0f766e', border: 'none' }}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Split Proposal Review Pane */}
            {proposal && (
              <div className="stock-assistant-proposal-pane">
                <div className="stock-proposal-header">
                  <div className="stock-proposal-header-title">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h3>Proposition de mouvement</h3>
                      <span className={`stock-proposal-type-badge ${proposal.type.toLowerCase()}`}>
                        {proposal.type === 'RECEIPT' ? 'Réception' : proposal.type === 'TRANSFER' ? 'Transfert' : proposal.type === 'WASTE' ? 'Perte' : proposal.type}
                      </span>
                    </div>
                    <span className="stock-proposal-header-subtitle">
                      Source : <strong>{proposal.sourceType}</strong>
                      {proposalSupplierName && <> • Fournisseur : <strong>{proposalSupplierName}</strong></>}
                    </span>
                  </div>
                  <button className="stock-proposal-header-close" onClick={() => setProposal(undefined)}>
                    <X size={18} />
                  </button>
                </div>

                <div className="stock-proposal-body">
                  {Boolean(proposal.duplicateWarning) && (
                    <div style={{ display: 'flex', gap: 10, padding: '1rem', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 16, color: '#b45309', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(217, 119, 6, 0.05)' }}>
                      <AlertTriangle size={20} style={{ flexShrink: 0, color: '#d97706' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem' }}>Attention : doublon potentiel</strong>
                        <p style={{ margin: '0.25rem 0 0', lineHeight: 1.4, color: '#92400e' }}>Ce document semble avoir déjà été traité. Un motif de confirmation est requis.</p>
                      </div>
                    </div>
                  )}

                  <div className="stock-proposal-meta-grid">
                    <div className="stock-proposal-field">
                      <label>Fournisseur détecté</label>
                      <input value={proposalSupplierName || 'Non identifié'} disabled />
                    </div>
                    <div className="stock-proposal-field">
                      <label>Site de stockage</label>
                      <select 
                        value={proposal.locationId || ''} 
                        onChange={e => setProposal({ ...proposal, locationId: e.target.value || null })}
                      >
                        <option value="">Sélectionner un site</option>
                        {siteChoices.map(({ site, location }) => (
                          <option key={site.id} value={location!.id}>{site.name}</option>
                        ))}
                      </select>
                    </div>

                    {proposal.type === 'TRANSFER' && (
                      <>
                        <div className="stock-proposal-field">
                          <label>Site source</label>
                          <select 
                            value={proposal.sourceLocationId || ''} 
                            onChange={e => setProposal({ ...proposal, sourceLocationId: e.target.value || null })}
                          >
                            <option value="">Sélectionner source</option>
                            {siteChoices.map(({ site, location }) => (
                              <option key={site.id} value={location!.id}>{site.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="stock-proposal-field">
                          <label>Site destination</label>
                          <select 
                            value={proposal.destinationLocationId || ''} 
                            onChange={e => setProposal({ ...proposal, destinationLocationId: e.target.value || null })}
                          >
                            <option value="">Sélectionner destination</option>
                            {siteChoices.map(({ site, location }) => (
                              <option key={site.id} value={location!.id}>{site.name}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                  {Boolean(proposal.duplicateWarning) && (
                    <div className="stock-proposal-field">
                      <label>Motif de confirmation du doublon</label>
                      <input 
                        placeholder="Raison du double enregistrement (ex: facture rectificative...)" 
                        value={proposal.duplicateOverrideReason || ''} 
                        onChange={e => setProposal({ ...proposal, duplicateOverrideReason: e.target.value })} 
                      />
                    </div>
                  )}

                  <div className="stock-proposal-lines-container">
                    <div className="stock-proposal-lines-header">
                      <span>Articles à enregistrer</span>
                      <span className="stock-proposal-lines-count">{proposal.lines.length} articles</span>
                    </div>
                    <div className="stock-proposal-lines-list">
                      {proposal.lines.map((line, i) => {
                        const isMatched = Boolean(line.productId);
                        const statusClass = isMatched ? 'matched' : 'unmatched';
                        return (
                          <div key={line.id || i} className={`stock-proposal-line-card ${statusClass}`}>
                            <div className="stock-proposal-line-card-header">
                              <span className="stock-proposal-line-title">
                                <span className={`stock-proposal-line-status-dot-large ${statusClass}`} />
                                {line.rawLabel}
                              </span>
                              <span className={`stock-proposal-line-status-badge ${statusClass}`}>
                                {isMatched ? 'Prêt' : 'À associer'}
                              </span>
                            </div>

                            <div className="stock-proposal-line-card-body">
                              <div className="stock-proposal-line-association-row">
                                <label className="stock-proposal-field-label">Produit ToqueHub associé</label>
                                <button
                                  type="button"
                                  className={`stock-proposal-product-picker-trigger ${statusClass}`}
                                  onClick={() => openProductPicker(i)}
                                >
                                  <Search size={14} />
                                  <span>{isMatched ? products.find((product) => product.id === line.productId)?.name || 'Produit associé' : 'Associer à un produit...'}</span>
                                </button>
                              </div>

                              <div className="stock-proposal-line-inputs-grid">
                                <div className="stock-proposal-input-group">
                                  <label>Quantité</label>
                                  <input 
                                    type="number" 
                                    value={line.quantity} 
                                    onChange={e => patchLine(i, { quantity: Number(e.target.value) })} 
                                  />
                                </div>

                                <div className="stock-proposal-input-group">
                                  <label>Unité</label>
                                  <select 
                                    value={line.inputUnitId || ''} 
                                    onChange={e => patchLine(i, { inputUnitId: e.target.value || null })}
                                  >
                                    <option value="">Unité</option>
                                    {units.map(u => (
                                      <option key={u.id} value={u.id}>{u.symbol}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="stock-proposal-input-group">
                                  <label>N° Lot</label>
                                  <input 
                                    value={line.lotNumber || ''} 
                                    placeholder="—" 
                                    onChange={e => patchLine(i, { lotNumber: e.target.value || null })} 
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="stock-proposal-footer">
                  <button className="btn-reject" disabled={busy} onClick={rejectProposal}>
                    <Trash2 size={16} /> Rejeter
                  </button>
                  <button 
                    className="btn-apply" 
                    disabled={busy || proposal.status === 'APPLIED' || !proposal.locationId || (Boolean(proposal.duplicateWarning) && !proposal.duplicateOverrideReason)} 
                    onClick={saveAndApply}
                  >
                    {busy ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" /> Traitement...
                      </>
                    ) : (
                      <>
                        <Check size={16} /> Valider & Appliquer
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {productPickerLineIndex !== null && pickerLine && (
              <div className="stock-assistant-product-modal-backdrop" onClick={() => setProductPickerLineIndex(null)}>
                <div className="stock-assistant-product-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="stock-assistant-product-modal-header">
                    <div>
                      <span className="stock-assistant-product-modal-kicker">Association de produit</span>
                      <h3>{pickerLine.rawLabel}</h3>
                    </div>
                    <button type="button" className="stock-assistant-product-modal-close" onClick={() => setProductPickerLineIndex(null)}><X size={20} /></button>
                  </div>

                  <div className="stock-assistant-product-modal-toolbar">
                    <div className="stock-assistant-product-modal-search">
                      <Search size={18} />
                      <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Rechercher par nom, référence, fournisseur..." autoFocus />
                    </div>
                    <div className="stock-assistant-product-modal-filters">
                      <select value={productCategoryFilter} onChange={(event) => setProductCategoryFilter(event.target.value)}>
                        <option value="">Toutes catégories</option>
                        {categories.filter((category) => !category.isArchived).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                      <select value={productSupplierFilter} onChange={(event) => setProductSupplierFilter(event.target.value)}>
                        <option value="">Tous fournisseurs</option>
                        {suppliers.filter((supplier) => !supplier.isArchived).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                      </select>
                      <select value={productUnitFilter} onChange={(event) => setProductUnitFilter(event.target.value)}>
                        <option value="">Toutes unités</option>
                        {units.filter((unit) => !unit.isArchived).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="stock-assistant-product-modal-body">
                    <div className="stock-assistant-product-results-pane">
                      <span className="stock-assistant-product-pane-title">Résultats de recherche ({filteredProducts.length})</span>
                      <div className="stock-assistant-product-results">
                        {filteredProducts.map((product) => (
                          <button key={product.id} type="button" className="stock-assistant-product-result" onClick={() => selectProductForLine(product)}>
                            <span className="stock-assistant-product-result-name">{product.name}</span>
                            <span className="stock-assistant-product-result-meta">
                              {product.sku || product.reference ? `Réf. ${product.sku ?? product.reference} · ` : ''}
                              {product.category?.name || categories.find((category) => category.id === product.categoryId)?.name || 'Sans catégorie'} · {product.primarySupplier?.name || product.supplier?.name || suppliers.find((supplier) => supplier.id === (product.primarySupplierId ?? product.supplierId))?.name || 'Sans fournisseur'} · {product.unit?.symbol || units.find((unit) => unit.id === product.unitId)?.symbol || '—'}
                            </span>
                          </button>
                        ))}
                        {!filteredProducts.length && (
                          <div className="stock-assistant-product-empty">
                            <PlusCircle size={28} />
                            <strong>Aucun produit trouvé</strong>
                            <span>Créez le produit ci-contre pour l'associer directement à cette ligne.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <form className="stock-assistant-product-create-pane" onSubmit={createProductForLine}>
                      <div className="stock-assistant-product-create-header">
                        <span className="stock-assistant-product-modal-kicker">Nouveau produit</span>
                        <strong>Création rapide & association</strong>
                      </div>
                      <div className="stock-assistant-product-create-form">
                        <label className="stock-assistant-input-label">
                          Nom du produit
                          <input name="name" defaultValue={pickerLine.rawLabel || productSearch} required />
                        </label>
                        <div className="stock-assistant-product-create-grid">
                          <label className="stock-assistant-input-label">
                            Unité
                            <select name="unitId" defaultValue={pickerLine.inputUnitId || ''} required>
                              <option value="">Choisir...</option>
                              {units.filter((unit) => !unit.isArchived).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}
                            </select>
                          </label>
                          <label className="stock-assistant-input-label">
                            Catégorie
                            <select name="categoryId" defaultValue={productCategoryFilter}>
                              <option value="">Aucune</option>
                              {categories.filter((category) => !category.isArchived).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                            </select>
                          </label>
                          <label className="stock-assistant-input-label">
                            Fournisseur
                            <select name="primarySupplierId" defaultValue={proposal?.supplierId || productSupplierFilter}>
                              <option value="">Aucun</option>
                              {suppliers.filter((supplier) => !supplier.isArchived).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                            </select>
                          </label>
                        </div>
                        <button type="submit" className="btn-create-associate" disabled={creatingProduct}>
                          {creatingProduct ? 'Création...' : 'Créer et associer'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function normalizeAssistantSearch(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

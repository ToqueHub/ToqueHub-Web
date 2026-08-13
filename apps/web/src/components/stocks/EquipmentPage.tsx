import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  Download,
  ExternalLink,
  FileText,
  Layers,
  LayoutGrid,
  MapPin,
  PackagePlus,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Upload,
  WalletCards,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import type {
  Article,
  ArticlesResponse,
  Category,
  EquipmentAcquisitionMode,
  EquipmentCondition,
  EquipmentDocument,
  Product,
  Site,
  Supplier,
  Unit,
} from '../../types';

const acquisitionLabels: Record<EquipmentAcquisitionMode, string> = {
  CASH: 'Comptant',
  CREDIT: 'Crédit',
  LEASING: 'Leasing',
  RENTAL: 'Location',
};

const conditionLabels: Record<EquipmentCondition, string> = {
  IN_SERVICE: 'En service',
  TO_MONITOR: 'À surveiller',
  OUT_OF_SERVICE: 'Hors service',
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value: unknown) {
  return numberValue(value).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}

function shortDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
}

function equipmentQuantity(article: Article, siteId: string) {
  if (!siteId) return numberValue(article.stock.quantity);
  return numberValue(article.stockBySite.find((site) => site.siteId === siteId)?.quantity);
}

function equipmentValue(article: Article, siteId: string) {
  if (!siteId) return numberValue(article.stock.value);
  return equipmentQuantity(article, siteId) * numberValue(article.product.averagePrice);
}

export type EquipmentFormPayload = {
  product: {
    name: string;
    sku?: string | null;
    description?: string | null;
    unitId: string;
    categoryId?: string | null;
    primarySupplierId?: string | null;
    averagePrice?: number;
    minimumStock?: number;
    kind: 'EQUIPMENT';
    equipment: {
      brand?: string | null;
      model?: string | null;
      purchaseUrl?: string | null;
      purchasedAt?: string | null;
      warrantyEndsAt?: string | null;
      condition: EquipmentCondition;
      targetQuantity?: number | null;
      acquisitionMode: EquipmentAcquisitionMode;
      financingProvider?: string | null;
      financingStart?: string | null;
      financingEnd?: string | null;
      monthlyPayment?: number | null;
      financedAmount?: number | null;
      buyoutValue?: number | null;
      notes?: string | null;
    };
  };
  siteId?: string;
  quantity?: number;
  previousQuantity?: number;
  documentFiles: File[];
};

export function EquipmentPage({
  data,
  categories,
  suppliers,
  sites,
  onAdd,
  onImportOcr,
  onMovement,
  onCreateCategory,
  onEdit,
}: {
  data: ArticlesResponse;
  categories: Category[];
  suppliers: Supplier[];
  sites: Site[];
  onAdd: () => void;
  onImportOcr: () => void;
  onMovement: (productId?: string) => void;
  onCreateCategory: () => void;
  onEdit: (article: Article) => void;
}) {
  const activeSites = sites.filter((site) => !site.isArchived && !site.archivedAt);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [subTab, setSubTab] = useState<'catalog' | 'categories'>('catalog');
  const [status, setStatus] = useState<'all' | 'in_stock' | 'restock' | 'financed' | 'attention'>(
    'all',
  );
  const now = Date.now();

  const equipmentStats = useMemo(() => {
    const items = data.items;
    const quantity = items.reduce((sum, item) => sum + equipmentQuantity(item, siteId), 0);
    const value = items.reduce((sum, item) => sum + equipmentValue(item, siteId), 0);
    const restock = items.filter((item) => {
      const current = equipmentQuantity(item, siteId);
      const target = numberValue(item.product.equipmentProfile?.targetQuantity);
      const minimum = numberValue(item.stock.minimumStock);
      return (minimum > 0 && current <= minimum) || (target > 0 && current < target);
    });
    const financed = items.filter((item) => {
      const profile = item.product.equipmentProfile;
      if (!profile || profile.acquisitionMode === 'CASH') return false;
      return !profile.financingEnd || new Date(profile.financingEnd).getTime() >= now;
    });
    const monthly = financed.reduce(
      (sum, item) => sum + numberValue(item.product.equipmentProfile?.monthlyPayment),
      0,
    );
    return { quantity, value, restock, financed, monthly };
  }, [data.items, now, siteId]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr-FR');
    return data.items.filter((article) => {
      const product = article.product;
      const profile = product.equipmentProfile;
      if (
        normalizedSearch &&
        ![
          product.name,
          product.sku,
          profile?.brand,
          profile?.model,
          product.primarySupplier?.name,
          product.category?.name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('fr-FR').includes(normalizedSearch))
      )
        return false;
      if (categoryId && product.categoryId !== categoryId) return false;
      if (supplierId && product.primarySupplierId !== supplierId) return false;
      if (status === 'in_stock' && equipmentQuantity(article, siteId) <= 0) return false;
      if (
        status === 'restock' &&
        !equipmentStats.restock.some((item) => item.product.id === product.id)
      )
        return false;
      if (
        status === 'financed' &&
        !equipmentStats.financed.some((item) => item.product.id === product.id)
      )
        return false;
      if (
        status === 'attention' &&
        profile?.condition !== 'TO_MONITOR' &&
        profile?.condition !== 'OUT_OF_SERVICE'
      )
        return false;
      return true;
    });
  }, [
    categoryId,
    data.items,
    equipmentStats.financed,
    equipmentStats.restock,
    search,
    siteId,
    status,
    supplierId,
  ]);

  const subNavigation = (
    <div className="stocks-settings-tabs equipment-subtabs" role="tablist" aria-label="Matériel">
      <button
        type="button"
        className={subTab === 'catalog' ? 'active' : ''}
        onClick={() => setSubTab('catalog')}
        role="tab"
        aria-selected={subTab === 'catalog'}
      >
        <LayoutGrid size={15} /> Parc matériel
      </button>
      <button
        type="button"
        className={subTab === 'categories' ? 'active' : ''}
        onClick={() => setSubTab('categories')}
        role="tab"
        aria-selected={subTab === 'categories'}
      >
        <Layers size={15} /> Catégories
      </button>
    </div>
  );

  if (subTab === 'categories') {
    return (
      <div className="stocks-dashboard-grid articles-page">
        {subNavigation}
        <header className="stocks-products-header">
          <div className="stocks-products-heading">
            <span className="card-title">Catégories de matériel</span>
            <span className="section-tagline">
              Organisez le matériel sans mélanger les catégories du catalogue Produits.
            </span>
          </div>
          <div className="stocks-products-actions">
            <button type="button" className="btn btn-primary" onClick={onCreateCategory}>
              <Plus size={15} /> Ajouter une catégorie
            </button>
          </div>
        </header>

        <section className="articles-table-card">
          <div className="table-wrapper">
            <table className="table-modern articles-table">
              <thead>
                <tr>
                  <th>Catégorie</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Matériels</th>
                </tr>
              </thead>
              <tbody>
                {categories.length ? (
                  categories.map((category) => (
                    <tr key={category.id}>
                      <td>
                        <strong>{category.name}</strong>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {category.description || 'Aucune description'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 750 }}>
                        {
                          data.items.filter(
                            (article) =>
                              (article.product.categoryId ?? article.product.category?.id) ===
                              category.id,
                          ).length
                        }
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>
                      <div className="empty-state-modern-widget">
                        <div className="empty-state-icon-modern">🏷️</div>
                        <span className="empty-state-title-modern">
                          Aucune catégorie de matériel
                        </span>
                        <span className="empty-state-desc-modern">
                          Créez votre première famille de matériel.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="stocks-dashboard-grid articles-page">
      {subNavigation}
      <header className="stocks-products-header">
        <div className="stocks-products-heading">
          <span className="card-title">Matériel</span>
          <span className="section-tagline">
            Catalogue et stock du matériel réunis dans une seule vue.
          </span>
        </div>
        <div className="stocks-products-toolbar">
          {activeSites.length > 1 ? (
            <select
              className="stocks-toolbar-site-select"
              aria-label="Site actif"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
            >
              <option value="">Tous les sites</option>
              {activeSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          ) : activeSites[0] ? (
            <div className="stocks-site-selector stocks-site-selector-static">
              <span className="stocks-site-selector-icon" aria-hidden="true">
                <MapPin size={18} />
              </span>
              <span className="stocks-site-selector-field">
                <span>Site actif</span>
                <strong>{activeSites[0].name}</strong>
              </span>
            </div>
          ) : null}
          <div className="stocks-products-actions">
            <button type="button" className="btn btn-secondary" onClick={onImportOcr}>
              <Sparkles size={15} /> Analyser
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => onMovement()}>
              <ArrowRight size={15} /> Mouvement
            </button>
            <button type="button" className="btn btn-primary" onClick={onAdd}>
              <Plus size={15} /> Ajouter
            </button>
          </div>
        </div>
      </header>

      <div className="stocks-metrics-strip">
        <div
          className="stocks-metric-item orange"
          onClick={() => setStatus('all')}
          title="Afficher tout le matériel"
        >
          <div className="metric-icon-wrapper">
            <Wrench size={16} />
          </div>
          <div className="metric-text-wrapper">
            <span className="stocks-metric-value">{data.summary.articleCount}</span>
            <span className="stocks-metric-label">Références</span>
          </div>
        </div>
        <div className="stocks-metric-divider" />
        <div
          className="stocks-metric-item emerald"
          onClick={() => setStatus('in_stock')}
          title="Filtrer : En parc"
        >
          <div className="metric-icon-wrapper">
            <Boxes size={16} />
          </div>
          <div className="metric-text-wrapper">
            <span className="stocks-metric-value">
              {equipmentStats.quantity.toLocaleString('fr-FR')}
            </span>
            <span className="stocks-metric-label">En parc</span>
          </div>
        </div>
        <div className="stocks-metric-divider" />
        <div
          className="stocks-metric-item blue"
          onClick={() => setStatus('restock')}
          title="Filtrer : À racheter"
        >
          <div className="metric-icon-wrapper">
            <PackagePlus size={16} />
          </div>
          <div className="metric-text-wrapper">
            <span className="stocks-metric-value">{equipmentStats.restock.length}</span>
            <span className="stocks-metric-label">À racheter</span>
          </div>
        </div>
        <div className="stocks-metric-divider" />
        <div className="stocks-metric-item purple">
          <div className="metric-icon-wrapper">
            <TrendingUp size={16} />
          </div>
          <div className="metric-text-wrapper">
            <span className="stocks-metric-value">{currency(equipmentStats.value)}</span>
            <span className="stocks-metric-label">Valeur matériel</span>
          </div>
        </div>
        <div className="stocks-metric-divider" />
        <div
          className="stocks-metric-item orange"
          onClick={() => setStatus('financed')}
          title="Filtrer : Financements actifs"
        >
          <div className="metric-icon-wrapper">
            <WalletCards size={16} />
          </div>
          <div className="metric-text-wrapper">
            <span className="stocks-metric-value">{currency(equipmentStats.monthly)}</span>
            <span className="stocks-metric-label">Mensualités actives</span>
          </div>
        </div>
      </div>

      <div className="articles-page-layout">
        <section className="articles-table-card">
          <div className="stocks-filter-bar">
            <div className="search-input-wrapper">
              <Search size={16} />
              <input
                className="search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un matériel, référence, fournisseur…"
              />
            </div>
            <div className="filter-selects">
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Toutes catégories</option>
                {categories
                  .filter((category) => !category.isArchived)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
              <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="">Tous fournisseurs</option>
                {suppliers
                  .filter((supplier) => !supplier.isArchived)
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
              </select>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="all">Tous les statuts</option>
                <option value="in_stock">En parc</option>
                <option value="restock">À racheter</option>
                <option value="financed">Financement actif</option>
                <option value="attention">À surveiller</option>
              </select>
              {search || categoryId || supplierId || status !== 'all' ? (
                <button
                  type="button"
                  className="btn-clear-filters"
                  onClick={() => {
                    setSearch('');
                    setCategoryId('');
                    setSupplierId('');
                    setStatus('all');
                  }}
                  title="Réinitialiser les filtres"
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="table-wrapper">
            <table className="table-modern articles-table">
              <thead>
                <tr>
                  <th>Matériel</th>
                  <th>Référence</th>
                  <th>Fournisseur</th>
                  <th>Catégorie</th>
                  <th style={{ textAlign: 'right' }}>Quantité</th>
                  <th style={{ textAlign: 'right' }}>Valeur</th>
                  <th>Acquisition</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((article) => {
                    const product = article.product;
                    const profile = product.equipmentProfile;
                    const condition = profile?.condition ?? 'IN_SERVICE';
                    const isRestock = equipmentStats.restock.some(
                      (item) => item.product.id === product.id,
                    );
                    const badgeClass =
                      condition === 'OUT_OF_SERVICE'
                        ? 'badge-loss'
                        : condition === 'TO_MONITOR' || isRestock
                          ? 'badge-correction'
                          : 'badge-reception';
                    const badgeLabel =
                      condition === 'OUT_OF_SERVICE'
                        ? conditionLabels.OUT_OF_SERVICE
                        : condition === 'TO_MONITOR'
                          ? conditionLabels.TO_MONITOR
                          : isRestock
                            ? 'À racheter'
                            : conditionLabels.IN_SERVICE;
                    return (
                      <tr
                        key={product.id}
                        onClick={() => onEdit(article)}
                        className="clickable-row"
                      >
                        <td>
                          <strong>{product.name}</strong>
                          <small style={{ display: 'block', color: 'var(--text-muted)' }}>
                            {[profile?.brand, profile?.model].filter(Boolean).join(' · ') ||
                              product.unit?.symbol ||
                              'Unité non définie'}
                          </small>
                        </td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          {product.sku || '—'}
                        </td>
                        <td>{product.primarySupplier?.name || '—'}</td>
                        <td>{product.category?.name || 'Sans catégorie'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 750 }}>
                          {equipmentQuantity(article, siteId).toLocaleString('fr-FR')}{' '}
                          {product.unit?.symbol ?? ''}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {currency(equipmentValue(article, siteId))}
                        </td>
                        <td>
                          {acquisitionLabels[profile?.acquisitionMode ?? 'CASH']}
                          {profile?.acquisitionMode !== 'CASH' ? (
                            <small style={{ display: 'block', color: 'var(--text-muted)' }}>
                              Fin le {shortDate(profile?.financingEnd)}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state-modern-widget">
                        <div className="empty-state-icon-modern">🧰</div>
                        <span className="empty-state-title-modern">Aucun matériel trouvé</span>
                        <span className="empty-state-desc-modern">
                          Ajoutez votre premier matériel manuellement ou depuis une facture.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export function EquipmentForm({
  token,
  article,
  categories,
  units,
  suppliers,
  sites,
  onSubmit,
  onClose,
}: {
  token: string;
  article?: Article | null;
  categories: Category[];
  units: Unit[];
  suppliers: Supplier[];
  sites: Site[];
  onSubmit: (payload: EquipmentFormPayload) => Promise<void>;
  onClose: () => void;
}) {
  const product = article?.product;
  const profile = product?.equipmentProfile;
  const pieceUnit = units.find(
    (unit) => unit.type === 'COUNT' || unit.symbol.toLocaleLowerCase('fr-FR').includes('pièce'),
  );
  const defaultSiteId =
    article?.stockBySite.find((site) => site.siteId)?.siteId ??
    sites.find((site) => site.isPrimary || site.isMain)?.id ??
    sites[0]?.id ??
    '';
  const initialQuantity = article
    ? numberValue(
        article.stockBySite.find((site) => site.siteId === defaultSiteId)?.quantity ??
          article.stock.quantity,
      )
    : 1;
  const [tab, setTab] = useState<'details' | 'financing' | 'documents'>('details');
  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [brand, setBrand] = useState(profile?.brand ?? '');
  const [model, setModel] = useState(profile?.model ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [unitId, setUnitId] = useState(product?.unitId ?? pieceUnit?.id ?? units[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState(product?.primarySupplierId ?? '');
  const [siteId, setSiteId] = useState(defaultSiteId);
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [minimumStock, setMinimumStock] = useState(
    String(numberValue(product?.minimumStock) || ''),
  );
  const [targetQuantity, setTargetQuantity] = useState(
    String(numberValue(profile?.targetQuantity) || ''),
  );
  const [averagePrice, setAveragePrice] = useState(
    String(numberValue(product?.averagePrice) || ''),
  );
  const [condition, setCondition] = useState<EquipmentCondition>(
    profile?.condition ?? 'IN_SERVICE',
  );
  const [purchaseUrl, setPurchaseUrl] = useState(profile?.purchaseUrl ?? '');
  const [purchasedAt, setPurchasedAt] = useState(profile?.purchasedAt?.slice(0, 10) ?? '');
  const [warrantyEndsAt, setWarrantyEndsAt] = useState(profile?.warrantyEndsAt?.slice(0, 10) ?? '');
  const [acquisitionMode, setAcquisitionMode] = useState<EquipmentAcquisitionMode>(
    profile?.acquisitionMode ?? 'CASH',
  );
  const [financingProvider, setFinancingProvider] = useState(profile?.financingProvider ?? '');
  const [financingStart, setFinancingStart] = useState(profile?.financingStart?.slice(0, 10) ?? '');
  const [financingEnd, setFinancingEnd] = useState(profile?.financingEnd?.slice(0, 10) ?? '');
  const [monthlyPayment, setMonthlyPayment] = useState(
    String(numberValue(profile?.monthlyPayment) || ''),
  );
  const [financedAmount, setFinancedAmount] = useState(
    String(numberValue(profile?.financedAmount) || ''),
  );
  const [buyoutValue, setBuyoutValue] = useState(String(numberValue(profile?.buyoutValue) || ''));
  const [notes, setNotes] = useState(profile?.notes ?? '');
  const [documents, setDocuments] = useState<EquipmentDocument[]>([]);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(Boolean(product?.id));
  const [documentsError, setDocumentsError] = useState<string>();
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!product?.id) {
      setDocuments([]);
      setDocumentsLoading(false);
      return;
    }
    let active = true;
    setDocumentsLoading(true);
    setDocumentsError(undefined);
    api
      .equipmentDocuments(token, product.id)
      .then((items) => {
        if (active) setDocuments(items);
      })
      .catch((err) => {
        if (active)
          setDocumentsError(
            err instanceof Error ? err.message : 'Impossible de charger les documents.',
          );
      })
      .finally(() => {
        if (active) setDocumentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [product?.id, token]);

  const nullable = (value: string) => value.trim() || null;
  const nullableNumber = (value: string) => (value.trim() === '' ? null : numberValue(value));

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !unitId) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit({
        product: {
          name: name.trim(),
          sku: nullable(sku),
          description: nullable(description),
          unitId,
          categoryId: categoryId || null,
          primarySupplierId: supplierId || null,
          averagePrice: numberValue(averagePrice),
          minimumStock: numberValue(minimumStock),
          kind: 'EQUIPMENT',
          equipment: {
            brand: nullable(brand),
            model: nullable(model),
            purchaseUrl: nullable(purchaseUrl),
            purchasedAt: purchasedAt || null,
            warrantyEndsAt: warrantyEndsAt || null,
            condition,
            targetQuantity: nullableNumber(targetQuantity),
            acquisitionMode,
            financingProvider: acquisitionMode === 'CASH' ? null : nullable(financingProvider),
            financingStart: acquisitionMode === 'CASH' ? null : financingStart || null,
            financingEnd: acquisitionMode === 'CASH' ? null : financingEnd || null,
            monthlyPayment: acquisitionMode === 'CASH' ? null : nullableNumber(monthlyPayment),
            financedAmount: acquisitionMode === 'CASH' ? null : nullableNumber(financedAmount),
            buyoutValue: acquisitionMode === 'CASH' ? null : nullableNumber(buyoutValue),
            notes: nullable(notes),
          },
        },
        siteId: siteId || undefined,
        quantity: numberValue(quantity),
        previousQuantity: initialQuantity,
        documentFiles,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Le matériel n’a pas pu être enregistré.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitForm} className="product-sheet-form equipment-form">
      {error ? (
        <div className="alert-modern error">
          <AlertTriangle size={16} /> {error}
        </div>
      ) : null}
      <div className="product-sheet-form-body">
        <div className="product-sheet-tabs" role="tablist" aria-label="Sections matériel">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'details'}
            className={tab === 'details' ? 'active' : ''}
            onClick={() => setTab('details')}
          >
            <Wrench size={15} /> Fiche matériel
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'financing'}
            className={tab === 'financing' ? 'active' : ''}
            onClick={() => setTab('financing')}
          >
            <WalletCards size={15} /> Achat et financement
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'documents'}
            className={tab === 'documents' ? 'active' : ''}
            onClick={() => setTab('documents')}
          >
            <FileText size={15} /> Documents
            {documents.length + documentFiles.length > 0 ? (
              <span className="equipment-document-tab-count">
                {documents.length + documentFiles.length}
              </span>
            ) : null}
          </button>
        </div>
        <div className="product-sheet-form-panel">
          {tab === 'details' ? (
            <div className="product-sheet-form-grid">
              <label>
                Nom du matériel *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex : Four mixte, bac GN…"
                  required
                  autoFocus
                />
              </label>
              <label>
                Référence / SKU
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Référence fournisseur"
                />
              </label>
              <label>
                Marque
                <input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="ex : Rational"
                />
              </label>
              <label>
                Modèle
                <input value={model} onChange={(e) => setModel(e.target.value)} />
              </label>
              <label>
                Catégorie
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Sans catégorie</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fournisseur
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Non renseigné</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Site
                <select
                  value={siteId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSiteId(next);
                    if (article)
                      setQuantity(
                        String(
                          numberValue(
                            article.stockBySite.find((site) => site.siteId === next)?.quantity,
                          ),
                        ),
                      );
                  }}
                >
                  <option value="">Site général</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Unité
                <select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.symbol})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantité actuelle
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
              <label>
                Seuil minimum
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={minimumStock}
                  onChange={(e) => setMinimumStock(e.target.value)}
                />
              </label>
              <label>
                Quantité cible
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={targetQuantity}
                  onChange={(e) => setTargetQuantity(e.target.value)}
                />
              </label>
              <label>
                État
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as EquipmentCondition)}
                >
                  {Object.entries(conditionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="product-sheet-wide">
                Description
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Informations utiles pour identifier le matériel…"
                />
              </label>
            </div>
          ) : null}

          {tab === 'financing' ? (
            <div className="product-sheet-form-grid">
              <label>
                Prix unitaire HT
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={averagePrice}
                  onChange={(e) => setAveragePrice(e.target.value)}
                />
              </label>
              <label>
                Mode d’acquisition
                <select
                  value={acquisitionMode}
                  onChange={(e) => setAcquisitionMode(e.target.value as EquipmentAcquisitionMode)}
                >
                  {Object.entries(acquisitionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date d’achat
                <input
                  type="date"
                  value={purchasedAt}
                  onChange={(e) => setPurchasedAt(e.target.value)}
                />
              </label>
              <label>
                Fin de garantie
                <input
                  type="date"
                  value={warrantyEndsAt}
                  onChange={(e) => setWarrantyEndsAt(e.target.value)}
                />
              </label>
              <label className="product-sheet-wide">
                Site ou page d’achat
                <span className="equipment-url-input">
                  <input
                    type="url"
                    value={purchaseUrl}
                    onChange={(e) => setPurchaseUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  {purchaseUrl ? (
                    <a
                      href={purchaseUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Ouvrir le site d’achat"
                    >
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </span>
              </label>
              {acquisitionMode !== 'CASH' ? (
                <>
                  <label>
                    Organisme / bailleur
                    <input
                      value={financingProvider}
                      onChange={(e) => setFinancingProvider(e.target.value)}
                    />
                  </label>
                  <label>
                    Montant financé
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={financedAmount}
                      onChange={(e) => setFinancedAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    Début
                    <input
                      type="date"
                      value={financingStart}
                      onChange={(e) => setFinancingStart(e.target.value)}
                    />
                  </label>
                  <label>
                    Fin
                    <input
                      type="date"
                      value={financingEnd}
                      onChange={(e) => setFinancingEnd(e.target.value)}
                    />
                  </label>
                  <label>
                    Mensualité
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={monthlyPayment}
                      onChange={(e) => setMonthlyPayment(e.target.value)}
                    />
                  </label>
                  <label>
                    Valeur de rachat
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={buyoutValue}
                      onChange={(e) => setBuyoutValue(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <div className="product-sheet-note product-sheet-wide">
                  <CalendarClock size={16} /> Aucun échéancier nécessaire pour un achat comptant.
                </div>
              )}
              <label className="product-sheet-wide">
                Notes
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
          ) : null}

          {tab === 'documents' ? (
            <div className="equipment-documents-panel">
              <div className="equipment-documents-heading">
                <div>
                  <strong>Contrats et documents du matériel</strong>
                  <p>
                    Ajoutez le contrat d’achat, de location ou de leasing au format PDF ou JPG.
                  </p>
                </div>
                <Paperclip size={22} />
              </div>

              <label className="equipment-document-dropzone">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
                  onChange={(event) => {
                    const selected = Array.from(event.target.files ?? []);
                    const invalid = selected.find(
                      (file) =>
                        !['application/pdf', 'image/jpeg'].includes(file.type) ||
                        file.size > 20 * 1024 * 1024,
                    );
                    if (invalid) {
                      setDocumentsError(
                        'Seuls les fichiers PDF, JPG ou JPEG de moins de 20 Mo sont acceptés.',
                      );
                      event.target.value = '';
                      return;
                    }
                    setDocumentsError(undefined);
                    setDocumentFiles((current) => [...current, ...selected].slice(0, 8));
                    event.target.value = '';
                  }}
                />
                <span className="equipment-document-dropzone-icon">
                  <Upload size={22} />
                </span>
                <span>
                  <strong>Ajouter un document</strong>
                  <small>PDF, JPG ou JPEG · 20 Mo maximum par fichier</small>
                </span>
              </label>

              {documentsError ? (
                <div className="alert-modern error">
                  <AlertTriangle size={16} /> {documentsError}
                </div>
              ) : null}

              {documentsLoading ? (
                <div className="equipment-documents-empty">Chargement des documents…</div>
              ) : documents.length || documentFiles.length ? (
                <div className="equipment-document-list">
                  {documents.map((document) => (
                    <div key={document.id} className="equipment-document-row">
                      <span className="equipment-document-file-icon">
                        <FileText size={18} />
                      </span>
                      <span className="equipment-document-copy">
                        <strong>{document.originalName}</strong>
                        <small>
                          {(document.sizeBytes / 1024 / 1024).toLocaleString('fr-FR', {
                            maximumFractionDigits: 2,
                          })}{' '}
                          Mo · Ajouté le {new Date(document.uploadedAt).toLocaleDateString('fr-FR')}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={downloadingDocumentId === document.id}
                        onClick={async () => {
                          if (!product?.id) return;
                          setDownloadingDocumentId(document.id);
                          setDocumentsError(undefined);
                          try {
                            await api.downloadEquipmentDocument(token, product.id, document);
                          } catch (err) {
                            setDocumentsError(
                              err instanceof Error
                                ? err.message
                                : 'Impossible de télécharger le document.',
                            );
                          } finally {
                            setDownloadingDocumentId(undefined);
                          }
                        }}
                      >
                        <Download size={14} />
                        {downloadingDocumentId === document.id ? 'Téléchargement…' : 'Télécharger'}
                      </button>
                    </div>
                  ))}
                  {documentFiles.map((file, index) => (
                    <div key={`${file.name}-${file.size}-${index}`} className="equipment-document-row pending">
                      <span className="equipment-document-file-icon">
                        <FileText size={18} />
                      </span>
                      <span className="equipment-document-copy">
                        <strong>{file.name}</strong>
                        <small>
                          {(file.size / 1024 / 1024).toLocaleString('fr-FR', {
                            maximumFractionDigits: 2,
                          })}{' '}
                          Mo · Sera lié à l’enregistrement
                        </small>
                      </span>
                      <button
                        type="button"
                        className="equipment-document-remove"
                        aria-label={`Retirer ${file.name}`}
                        onClick={() =>
                          setDocumentFiles((current) =>
                            current.filter((_, fileIndex) => fileIndex !== index),
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="equipment-documents-empty">
                  <FileText size={28} />
                  <strong>Aucun document lié</strong>
                  <span>Ajoutez ici le contrat associé à ce matériel.</span>
                </div>
              )}

              {!product ? (
                <div className="product-sheet-note">
                  <Paperclip size={16} /> Le document sera envoyé après la création du matériel.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="modal-footer product-sheet-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Annuler
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !name.trim() || !unitId}
        >
          {submitting
            ? 'Enregistrement…'
            : product
              ? 'Enregistrer les modifications'
              : 'Ajouter le matériel'}
        </button>
      </div>
    </form>
  );
}

export function withEquipmentKind(data: ArticlesResponse): ArticlesResponse {
  return {
    ...data,
    items: data.items.filter((item) => item.product.kind === 'EQUIPMENT'),
  };
}

export function equipmentProduct(article?: Article | null): Product | null {
  return article?.product ?? null;
}

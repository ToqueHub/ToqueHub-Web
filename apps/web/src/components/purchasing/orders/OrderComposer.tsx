import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../../api/client';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import type {
  Category,
  Product,
  PurchaseOrder,
  PurchasingBootstrap,
  PurchasingDeliveryMode,
  Supplier,
} from '../../../types';
import { Modal } from '../../ui/Modal';
import { messageOf, productOrderFactor, productOrderUnitPrice } from '../components/PurchasingUi';
import {
  DeliverySelection,
  FAVORITES_FILTER_ID,
  MENU_PRODUCTS_FILTER_ID,
  OrderCatalog,
  SupplierSelection,
  type ComposerLine,
} from './OrderCatalog';

type ComposerStep = 'supplier' | 'delivery' | 'catalog';

export function OrderComposerButton({
  bootstrap,
  onSaved,
  flash,
  token,
}: {
  bootstrap: PurchasingBootstrap;
  onSaved: () => void;
  flash: (kind: 'success' | 'error', message: string) => void;
  token: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<PurchaseOrder | null>(null);
  const close = () => {
    setOpen(false);
    setActiveOrder(null);
    onSaved();
  };
  return (
    <>
      <button
        className="btn btn-primary"
        onClick={() => {
          setActiveOrder(null);
          setOpen(true);
        }}
      >
        <Plus size={17} /> Nouvelle commande
      </button>
      {open ? (
        <OrderComposer
          key={activeOrder?.id ?? 'new-order'}
          bootstrap={bootstrap}
          token={token}
          order={activeOrder}
          onDraftReady={(draft) => {
            setActiveOrder(draft);
            onSaved();
          }}
          onClose={close}
          onSaved={close}
          flash={flash}
        />
      ) : null}
    </>
  );
}

export function OrderComposer({
  bootstrap,
  token,
  order,
  onDraftReady,
  onClose,
  onSaved,
  flash,
}: {
  bootstrap: PurchasingBootstrap;
  token: string;
  order: PurchaseOrder | null;
  onDraftReady?: (order: PurchaseOrder) => void;
  onClose: () => void;
  onSaved: () => void;
  flash: (kind: 'success' | 'error', message: string) => void;
}) {
  const initialSupplier =
    order?.supplier ?? bootstrap.suppliers.find((item) => item.id === order?.supplierId);
  const orderableBootstrapSuppliers = bootstrap.suppliers.filter(isOrderableSupplier);
  const [step, setStep] = useState<ComposerStep>(
    order
      ? initialSupplier?.purchasingProfile?.deliveryMode === 'SCHEDULED_DAYS' &&
        !order.expectedDeliveryDate
        ? 'delivery'
        : 'catalog'
      : 'supplier',
  );
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? '');
  const [supplierOptions, setSupplierOptions] = useState<Supplier[]>(() =>
    initialSupplier && !orderableBootstrapSuppliers.some((item) => item.id === initialSupplier.id)
      ? [initialSupplier, ...orderableBootstrapSuppliers]
      : orderableBootstrapSuppliers,
  );
  const [supplierSearch, setSupplierSearch] = useState('');
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [resumingDraft, setResumingDraft] = useState(false);
  const [siteId, setSiteId] = useState(order?.siteId ?? bootstrap.sites[0]?.id ?? '');
  const [deliveryDate, setDeliveryDate] = useState(order?.expectedDeliveryDate?.slice(0, 10) ?? '');
  const [deliveryMode, setDeliveryMode] = useState<PurchasingDeliveryMode>(
    initialSupplier?.purchasingProfile?.deliveryMode ?? 'ON_DEMAND',
  );
  const [deliveryOptions, setDeliveryOptions] = useState<string[]>([]);
  const [contextLoading, setContextLoading] = useState(Boolean(order));
  const [categories, setCategories] = useState<Category[]>([]);
  const [recent, setRecent] = useState<Product[]>([]);
  const [frequent, setFrequent] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productPage, setProductPage] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  const [favoritePendingIds, setFavoritePendingIds] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [supplierMessage, setSupplierMessage] = useState(order?.supplierMessage ?? '');
  const [lines, setLines] = useState<ComposerLine[]>(() =>
    (order?.lines ?? [])
      .map((line) => {
        const product =
          line.product ?? bootstrap.products.find((item) => item.id === line.productId);
        return product
          ? {
              product,
              quantity: Number(line.orderedQuantity),
              unitPrice: productOrderUnitPrice(product),
              vatRate: Number(line.vatRate),
              unitsPerOrderUnit: productOrderFactor(product),
            }
          : null;
      })
      .filter((line): line is ComposerLine => Boolean(line)),
  );
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'deleting' | 'error'>(
    order ? 'saved' : 'dirty',
  );
  const versionRef = useRef(order?.version ?? 1);
  const debouncedSupplierSearch = useDebouncedValue(supplierSearch);
  const debouncedProductSearch = useDebouncedValue(productSearch);
  const selectedSupplier = supplierOptions.find((supplier) => supplier.id === supplierId);

  const totals = useMemo(() => {
    const articles = lines.reduce(
      (sum, line) => {
        const excludingTax = line.quantity * line.unitPrice;
        return {
          ht: sum.ht + excludingTax,
          tax: sum.tax + (excludingTax * line.vatRate) / 100,
        };
      },
      { ht: 0, tax: 0 },
    );
    const deliveryFee = Number(selectedSupplier?.purchasingProfile?.deliveryFee ?? 0);
    return {
      articlesHt: articles.ht,
      deliveryFee,
      ht: articles.ht + deliveryFee,
      tax: articles.tax,
    };
  }, [lines, selectedSupplier?.purchasingProfile?.deliveryFee]);

  const payload = () => ({
    supplierId,
    siteId,
    expectedDeliveryDate: deliveryDate || undefined,
    currency: order?.currency ?? bootstrap.settings.defaultCurrency,
    notes: notes || undefined,
    supplierMessage: supplierMessage || undefined,
    lines: lines.map((line) => ({
      productId: line.product.id,
      unitId: line.product.unitId,
      supplierReference: line.product.sku || line.product.reference || undefined,
      supplierLabel: line.product.name,
      quantity: line.quantity,
      unitsPerOrderUnit: line.unitsPerOrderUnit,
      vatRate: line.vatRate,
    })),
  });
  const formSignature = JSON.stringify(payload());
  const lastSavedSignature = useRef(formSignature);
  const autosavePromise = useRef<Promise<void> | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const closingRef = useRef(false);

  const clearAutosaveTimer = () => {
    if (autosaveTimer.current === null) return;
    window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = null;
  };

  useEffect(() => {
    if (step !== 'supplier') return;
    let active = true;
    setSuppliersLoading(true);
    void api
      .purchasingSuppliers(token, {
        search: debouncedSupplierSearch.trim() || undefined,
        page: 1,
        pageSize: 30,
      })
      .then((response) => {
        if (!active) return;
        setSupplierOptions((current) => {
          const selected = current.find((item) => item.id === supplierId);
          const orderableItems = response.items.filter(isOrderableSupplier);
          return selected && !orderableItems.some((item) => item.id === selected.id)
            ? [selected, ...orderableItems]
            : orderableItems;
        });
      })
      .catch((error) => active && flash('error', messageOf(error)))
      .finally(() => active && setSuppliersLoading(false));
    return () => {
      active = false;
    };
  }, [debouncedSupplierSearch, flash, step, supplierId, token]);

  const loadSupplierContext = async (supplier: Supplier, preserveDate = false) => {
    setContextLoading(true);
    try {
      const [delivery, categoryItems, highlights] = await Promise.all([
        api.purchasingDeliveryOptions(token, supplier.id),
        api.purchasingCategories(token, supplier.id, siteId),
        api.purchasingProductHighlights(token, supplier.id, siteId),
      ]);
      setDeliveryMode(delivery.mode);
      setDeliveryOptions(delivery.dates);
      setCategories(categoryItems);
      setRecent(highlights.recent);
      setFrequent(highlights.frequent);
      setDeliveryDate((current) =>
        preserveDate && current ? current : (delivery.earliest?.slice(0, 10) ?? ''),
      );
      return delivery.mode;
    } catch (error) {
      flash('error', messageOf(error, 'Impossible de charger le catalogue du fournisseur.'));
      return supplier.purchasingProfile?.deliveryMode ?? 'ON_DEMAND';
    } finally {
      setContextLoading(false);
    }
  };

  useEffect(() => {
    if (!order || !initialSupplier) return;
    void loadSupplierContext(initialSupplier, true);
    // Le contexte initial d'une commande existante ne doit être chargé qu'une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  useEffect(() => {
    if (step !== 'catalog' || !supplierId) return;
    let active = true;
    setProductsLoading(true);
    void api
      .purchasingProducts(token, {
        supplierId,
        siteId,
        categoryId:
          categoryId && categoryId !== FAVORITES_FILTER_ID && categoryId !== MENU_PRODUCTS_FILTER_ID
            ? categoryId
            : undefined,
        favoriteOnly: categoryId === FAVORITES_FILTER_ID || undefined,
        menuOnly: categoryId === MENU_PRODUCTS_FILTER_ID || undefined,
        search: debouncedProductSearch.trim() || undefined,
        page: 1,
        pageSize: 24,
      })
      .then((response) => {
        if (!active) return;
        setProducts(response.items);
        setProductTotal(response.total);
        setProductPage(1);
      })
      .catch(
        (error) =>
          active && flash('error', messageOf(error, 'Impossible de charger les produits Stocks.')),
      )
      .finally(() => active && setProductsLoading(false));
    return () => {
      active = false;
    };
  }, [categoryId, debouncedProductSearch, flash, siteId, step, supplierId, token]);

  useEffect(() => {
    if (!order || step !== 'catalog' || formSignature === lastSavedSignature.current) return;
    setSaveState('dirty');
    if (!lines.length || closingRef.current) return;
    const timer = window.setTimeout(() => {
      autosaveTimer.current = null;
      setSaveState('saving');
      const request = api
        .updatePurchaseOrder(token, order.id, {
          ...payload(),
          expectedVersion: versionRef.current,
        })
        .then((saved) => {
          versionRef.current = saved.version;
          lastSavedSignature.current = formSignature;
          setSaveState('saved');
        })
        .catch((error) => {
          if (!closingRef.current) {
            setSaveState('error');
            flash('error', messageOf(error));
          }
        })
        .finally(() => {
          if (autosavePromise.current === request) autosavePromise.current = null;
        });
      autosavePromise.current = request;
    }, 900);
    autosaveTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autosaveTimer.current === timer) autosaveTimer.current = null;
    };
    // La signature contient déjà toutes les valeurs métier autosauvegardées.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSignature, order?.id, step, token]);

  const selectSupplier = async (supplier: Supplier) => {
    if (!order && onDraftReady) {
      if (!siteId || resumingDraft) return;
      setResumingDraft(true);
      try {
        const draft = await api.resumePurchaseOrderDraft(token, {
          supplierId: supplier.id,
          siteId,
        });
        onDraftReady(draft);
      } catch (error) {
        flash('error', messageOf(error, 'Impossible de créer ou reprendre ce brouillon.'));
        setResumingDraft(false);
      }
      return;
    }
    const changed = supplier.id !== supplierId;
    setSupplierId(supplier.id);
    setSupplierOptions((current) =>
      current.some((item) => item.id === supplier.id) ? current : [supplier, ...current],
    );
    if (changed) {
      setLines([]);
      setProducts([]);
      setProductSearch('');
      setCategoryId('');
    }
    const mode = await loadSupplierContext(supplier);
    setStep(mode === 'SCHEDULED_DAYS' ? 'delivery' : 'catalog');
  };

  const loadMoreProducts = async () => {
    const nextPage = productPage + 1;
    setProductsLoading(true);
    try {
      const response = await api.purchasingProducts(token, {
        supplierId,
        siteId,
        categoryId:
          categoryId && categoryId !== FAVORITES_FILTER_ID && categoryId !== MENU_PRODUCTS_FILTER_ID
            ? categoryId
            : undefined,
        favoriteOnly: categoryId === FAVORITES_FILTER_ID || undefined,
        menuOnly: categoryId === MENU_PRODUCTS_FILTER_ID || undefined,
        search: productSearch.trim() || undefined,
        page: nextPage,
        pageSize: 24,
      });
      setProducts((current) => [
        ...current,
        ...response.items.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setProductTotal(response.total);
      setProductPage(nextPage);
    } catch (error) {
      flash('error', messageOf(error, 'Impossible de charger les produits suivants.'));
    } finally {
      setProductsLoading(false);
    }
  };

  const setQuantity = (product: Product, quantity: number) => {
    const safeQuantity = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (safeQuantity <= 0) return current.filter((line) => line.product.id !== product.id);
      if (existing)
        return current.map((line) =>
          line.product.id === product.id ? { ...line, product, quantity: safeQuantity } : line,
        );
      return [
        ...current,
        {
          product,
          quantity: safeQuantity,
          unitPrice: productOrderUnitPrice(product),
          vatRate: 0,
          unitsPerOrderUnit: productOrderFactor(product),
        },
      ];
    });
  };

  const toggleFavorite = async (product: Product) => {
    if (favoritePendingIds.has(product.id) || !bootstrap.canManageProductFavorites) return;
    setFavoritePendingIds((current) => new Set(current).add(product.id));
    try {
      const updated = await api.updateProductFavorite(token, product.id, !product.isFavorite);
      const mergeUpdated = (item: Product) =>
        item.id === updated.id ? { ...item, ...updated } : item;
      setProducts((current) => {
        const next = current.map(mergeUpdated);
        return categoryId === FAVORITES_FILTER_ID && !updated.isFavorite
          ? next.filter((item) => item.id !== updated.id)
          : next;
      });
      if (categoryId === FAVORITES_FILTER_ID && !updated.isFavorite) {
        setProductTotal((current) => Math.max(0, current - 1));
      }
      setRecent((current) => current.map(mergeUpdated));
      setFrequent((current) => current.map(mergeUpdated));
      setLines((current) =>
        current.map((line) =>
          line.product.id === updated.id
            ? { ...line, product: { ...line.product, ...updated } }
            : line,
        ),
      );
    } catch (error) {
      flash('error', messageOf(error, 'Impossible de modifier ce favori.'));
    } finally {
      setFavoritePendingIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  };

  const addSuggestions = async () => {
    setSuggesting(true);
    try {
      const result = await api.purchasingSuggestions(token, supplierId, siteId);
      setLines((current) => {
        const byId = new Map(current.map((line) => [line.product.id, line]));
        result.items.forEach((item) =>
          byId.set(item.product.id, {
            product: item.product,
            quantity: item.recommendedQuantity,
            unitPrice: productOrderUnitPrice(item.product),
            vatRate: 0,
            unitsPerOrderUnit: productOrderFactor(item.product),
          }),
        );
        return [...byId.values()];
      });
      if (!result.items.length)
        flash('success', 'Les stocks actuels ne nécessitent aucun réassort pour ce fournisseur.');
    } catch (error) {
      flash('error', messageOf(error));
    } finally {
      setSuggesting(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (order && saveState === 'saved') {
      onSaved();
      return;
    }
    if (!supplierId || !siteId || !lines.length) {
      flash('error', 'Sélectionnez un fournisseur, un site et au moins un produit.');
      return;
    }
    if (deliveryMode === 'SCHEDULED_DAYS' && !deliveryDate) {
      flash('error', 'Sélectionnez un jour de livraison autorisé.');
      return;
    }
    setSaving(true);
    try {
      if (order) {
        const saved = await api.updatePurchaseOrder(token, order.id, {
          ...payload(),
          expectedVersion: versionRef.current,
        });
        versionRef.current = saved.version;
      } else {
        await api.createPurchaseOrder(token, payload());
      }
      flash('success', order ? 'Commande enregistrée.' : 'Commande créée.');
      onSaved();
    } catch (error) {
      flash('error', messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = order
    ? saveState === 'saved'
      ? 'Fermer'
      : saveState === 'deleting'
        ? 'Suppression du brouillon…'
        : saveState === 'saving'
          ? 'Enregistrement automatique…'
          : 'Enregistrer et fermer'
    : 'Enregistrer la commande';

  const closeComposer = async () => {
    if (!order) {
      onClose();
      return;
    }
    if (closingRef.current) return;
    closingRef.current = true;
    clearAutosaveTimer();
    setSaveState(lines.length ? 'saving' : 'deleting');
    if (autosavePromise.current) await autosavePromise.current;
    if (!lines.length) {
      try {
        await api.deletePurchaseOrderDraft(token, order.id);
        flash('success', 'Brouillon vide supprimé.');
        onClose();
      } catch (error) {
        closingRef.current = false;
        setSaveState('error');
        flash('error', messageOf(error, 'Le brouillon vide n’a pas pu être supprimé.'));
      }
      return;
    }
    if (step !== 'catalog') {
      onClose();
      return;
    }
    if (formSignature === lastSavedSignature.current) {
      onClose();
      return;
    }
    setSaveState('saving');
    try {
      const saved = await api.updatePurchaseOrder(token, order.id, {
        ...payload(),
        expectedVersion: versionRef.current,
      });
      versionRef.current = saved.version;
      lastSavedSignature.current = formSignature;
      setSaveState('saved');
      onClose();
    } catch (error) {
      closingRef.current = false;
      setSaveState('error');
      flash('error', messageOf(error, 'Le brouillon n’a pas pu être enregistré.'));
    }
  };

  return (
    <Modal
      isOpen
      size="full"
      title={order ? `Modifier ${order.number}` : 'Nouvelle commande'}
      onClose={() => void closeComposer()}
      bodyClassName="purchasing-composer purchasing-catalog-modal"
      overlayClassName="purchasing-composer-overlay"
    >
      {order ? (
        <div className={`purchasing-save-state ${saveState}`}>
          <span />
          {saveState === 'saved'
            ? 'Commande enregistrée'
            : saveState === 'saving'
              ? 'Enregistrement automatique…'
              : saveState === 'deleting'
                ? 'Suppression du brouillon vide…'
                : saveState === 'error'
                  ? 'Conflit ou erreur d’enregistrement'
                  : 'Modifications en attente'}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.25rem',
            margin: '0 auto 1.25rem',
            paddingBottom: '1.25rem',
            borderBottom: '1px solid var(--light-border)',
            width: '100%',
            maxWidth: '620px',
            flexWrap: 'wrap',
          }}
        >
          {[
            { id: 'supplier', label: 'Fournisseur', index: 1 },
            { id: 'delivery', label: 'Livraison', index: 2 },
            { id: 'catalog', label: 'Catalogue', index: 3 },
          ].map((s, idx, arr) => {
            const isActive = step === s.id;
            const isCompleted =
              (step === 'delivery' && s.id === 'supplier') ||
              (step === 'catalog' && (s.id === 'supplier' || s.id === 'delivery'));

            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    cursor: isCompleted ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (isCompleted) {
                      setStep(s.id as ComposerStep);
                    }
                  }}
                >
                  <span
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: isActive
                        ? 'var(--primary)'
                        : isCompleted
                          ? 'var(--success-bg)'
                          : 'var(--light-bg)',
                      color: isActive
                        ? 'white'
                        : isCompleted
                          ? 'var(--success)'
                          : 'var(--text-muted)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      border: isActive
                        ? 'none'
                        : isCompleted
                          ? '1px solid rgba(16, 185, 129, 0.2)'
                          : '1px solid var(--light-border)',
                      transition: 'all 0.25s',
                    }}
                  >
                    {s.index}
                  </span>
                  <span
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: isActive ? 750 : 500,
                      color: isActive
                        ? 'var(--text-main)'
                        : isCompleted
                          ? 'var(--success)'
                          : 'var(--text-muted)',
                      transition: 'all 0.25s',
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < arr.length - 1 && (
                  <span
                    style={{ color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 300 }}
                    aria-hidden="true"
                  >
                    →
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {step === 'supplier' ? (
        <SupplierSelection
          suppliers={supplierOptions}
          search={supplierSearch}
          loading={suppliersLoading || resumingDraft}
          onSearch={setSupplierSearch}
          onSelect={(supplier) => void selectSupplier(supplier)}
        />
      ) : null}
      {step === 'delivery' && selectedSupplier ? (
        <DeliverySelection
          supplier={selectedSupplier}
          dates={deliveryOptions}
          selectedDate={deliveryDate}
          loading={contextLoading}
          onBack={() => setStep('supplier')}
          onSelect={(date) => {
            setDeliveryDate(date);
            setStep('catalog');
          }}
        />
      ) : null}
      {step === 'catalog' && selectedSupplier ? (
        <form className="purchasing-catalog-form" onSubmit={save}>
          <OrderCatalog
            bootstrap={bootstrap}
            supplier={selectedSupplier}
            deliveryDate={deliveryDate}
            deliveryOptions={deliveryOptions}
            products={products}
            categories={categories}
            recent={recent}
            frequent={frequent}
            lines={lines}
            productSearch={productSearch}
            categoryId={categoryId}
            productsLoading={productsLoading || contextLoading}
            favoritePendingIds={favoritePendingIds}
            productTotal={productTotal}
            siteId={siteId}
            supplierMessage={supplierMessage}
            notes={notes}
            totals={totals}
            saving={saving || saveState === 'saving' || saveState === 'deleting'}
            suggesting={suggesting}
            saveLabel={saveLabel}
            canChangeSupplier={!order}
            onBack={() => setStep('supplier')}
            onSearch={setProductSearch}
            onCategory={setCategoryId}
            onLoadMore={() => void loadMoreProducts()}
            onQuantity={setQuantity}
            onToggleFavorite={(product) => void toggleFavorite(product)}
            onSuggestions={() => void addSuggestions()}
            onSite={setSiteId}
            onDeliveryDate={setDeliveryDate}
            onSupplierMessage={setSupplierMessage}
            onNotes={setNotes}
          />
        </form>
      ) : null}
    </Modal>
  );
}

function isOrderableSupplier(supplier: Supplier) {
  return (
    supplier.purchasingProfile?.deliveryMode !== 'NO_DELIVERY' &&
    supplier.purchasingProfile?.orderingEnabled !== false
  );
}

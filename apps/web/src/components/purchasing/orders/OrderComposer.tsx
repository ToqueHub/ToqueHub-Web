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
import { messageOf } from '../components/PurchasingUi';
import {
  DeliverySelection,
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
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus size={17} /> Nouvelle commande
      </button>
      {open ? (
        <OrderComposer
          bootstrap={bootstrap}
          token={token}
          order={null}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onSaved();
          }}
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
  onClose,
  onSaved,
  flash,
}: {
  bootstrap: PurchasingBootstrap;
  token: string;
  order: PurchaseOrder | null;
  onClose: () => void;
  onSaved: () => void;
  flash: (kind: 'success' | 'error', message: string) => void;
}) {
  const initialSupplier =
    order?.supplier ?? bootstrap.suppliers.find((item) => item.id === order?.supplierId);
  const [step, setStep] = useState<ComposerStep>(order ? 'catalog' : 'supplier');
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? '');
  const [supplierOptions, setSupplierOptions] = useState<Supplier[]>(() =>
    initialSupplier && !bootstrap.suppliers.some((item) => item.id === initialSupplier.id)
      ? [initialSupplier, ...bootstrap.suppliers]
      : bootstrap.suppliers,
  );
  const [supplierSearch, setSupplierSearch] = useState('');
  const [suppliersLoading, setSuppliersLoading] = useState(false);
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
              unitPrice: Number(
                product.averagePrice ?? product.averagePurchasePrice ?? line.unitPrice ?? 0,
              ),
              vatRate: Number(line.vatRate),
              unitsPerOrderUnit: Number(line.unitsPerOrderUnit),
            }
          : null;
      })
      .filter((line): line is ComposerLine => Boolean(line)),
  );
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>(
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
          return selected && !response.items.some((item) => item.id === selected.id)
            ? [selected, ...response.items]
            : response.items;
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
        api.purchasingCategories(token, supplier.id),
        api.purchasingProductHighlights(token, supplier.id),
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
        categoryId: categoryId || undefined,
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
  }, [categoryId, debouncedProductSearch, flash, step, supplierId, token]);

  useEffect(() => {
    if (!order || step !== 'catalog' || formSignature === lastSavedSignature.current) return;
    setSaveState('dirty');
    const timer = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        const saved = await api.updatePurchaseOrder(token, order.id, {
          ...payload(),
          expectedVersion: versionRef.current,
        });
        versionRef.current = saved.version;
        lastSavedSignature.current = formSignature;
        setSaveState('saved');
      } catch (error) {
        setSaveState('error');
        flash('error', messageOf(error));
      }
    }, 900);
    return () => window.clearTimeout(timer);
    // La signature contient déjà toutes les valeurs métier autosauvegardées.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSignature, order?.id, step, token]);

  const selectSupplier = async (supplier: Supplier) => {
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
        categoryId: categoryId || undefined,
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
          unitPrice: Number(product.averagePrice ?? product.averagePurchasePrice ?? 0),
          vatRate: 0,
          unitsPerOrderUnit: Number(product.unitsPerPackage ?? 1),
        },
      ];
    });
  };

  const addSuggestions = async () => {
    setSuggesting(true);
    try {
      const result = await api.purchasingSuggestions(token, supplierId);
      setLines((current) => {
        const byId = new Map(current.map((line) => [line.product.id, line]));
        result.items.forEach((item) =>
          byId.set(item.product.id, {
            product: item.product,
            quantity: item.recommendedQuantity,
            unitPrice: Number(item.product.averagePrice ?? item.product.averagePurchasePrice ?? 0),
            vatRate: 0,
            unitsPerOrderUnit: Number(item.product.unitsPerPackage ?? 1),
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
      : saveState === 'saving'
        ? 'Enregistrement automatique…'
        : 'Enregistrer et fermer'
    : 'Enregistrer la commande';

  return (
    <Modal
      isOpen
      size="full"
      title={order ? `Modifier ${order.number}` : 'Nouvelle commande'}
      subtitle="Fournisseur → livraison → catalogue → panier"
      onClose={onClose}
      bodyClassName="purchasing-composer purchasing-catalog-modal"
    >
      {order ? (
        <div className={`purchasing-save-state ${saveState}`}>
          <span />
          {saveState === 'saved'
            ? 'Commande enregistrée'
            : saveState === 'saving'
              ? 'Enregistrement automatique…'
              : saveState === 'error'
                ? 'Conflit ou erreur d’enregistrement'
                : 'Modifications en attente'}
        </div>
      ) : null}
      {step === 'supplier' ? (
        <SupplierSelection
          suppliers={supplierOptions}
          search={supplierSearch}
          loading={suppliersLoading}
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
            productTotal={productTotal}
            siteId={siteId}
            supplierMessage={supplierMessage}
            notes={notes}
            totals={totals}
            saving={saving || saveState === 'saving'}
            suggesting={suggesting}
            saveLabel={saveLabel}
            canChangeSupplier={!order}
            onBack={() => setStep('supplier')}
            onSearch={setProductSearch}
            onCategory={setCategoryId}
            onLoadMore={() => void loadMoreProducts()}
            onQuantity={setQuantity}
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

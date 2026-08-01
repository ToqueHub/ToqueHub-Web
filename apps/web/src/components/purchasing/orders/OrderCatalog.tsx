import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  Truck,
} from 'lucide-react';
import type { Category, Product, Supplier, PurchasingBootstrap } from '../../../types';
import { dateLabel, money } from '../components/PurchasingUi';

export type ComposerLine = {
  product: Product;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  unitsPerOrderUnit: number;
};

export function SupplierSelection({
  suppliers,
  search,
  loading,
  onSearch,
  onSelect,
}: {
  suppliers: Supplier[];
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onSelect: (supplier: Supplier) => void;
}) {
  return (
    <section className="purchasing-choice-step">
      <div className="purchasing-step-heading">
        <span>Nouvelle commande</span>
        <h2>Quel fournisseur souhaitez-vous sélectionner&nbsp;?</h2>
        <p>Seuls les produits associés à ce fournisseur dans Stocks seront proposés.</p>
      </div>
      <div className="purchasing-supplier-search" role="search">
        <Search className="purchasing-supplier-search-icon" size={18} aria-hidden="true" />
        <input
          className="search-input purchasing-supplier-search-input"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Rechercher un fournisseur Stocks"
          aria-label="Rechercher un fournisseur Stocks"
          autoFocus
        />
      </div>
      <div className="purchasing-supplier-grid">
        {suppliers.map((supplier, idx) => {
          const scheduled = supplier.purchasingProfile?.deliveryMode === 'SCHEDULED_DAYS';
          return (
            <motion.button
              type="button"
              className="purchasing-supplier-card"
              key={supplier.id}
              onClick={() => onSelect(supplier)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.2 }}
              whileHover={{
                scale: 1.02,
                y: -2,
                borderColor: '#10b981',
                boxShadow: '0 8px 16px rgba(16,185,129,0.06)',
              }}
              style={{
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            >
              <span className="purchasing-supplier-icon">
                <Truck size={22} />
              </span>
              <span>
                <strong>{supplier.name}</strong>
                <small>
                  {supplier.productCount ?? 0} produit
                  {(supplier.productCount ?? 0) > 1 ? 's' : ''} ·{' '}
                  {scheduled ? 'Livraison programmée' : 'Livraison selon disponibilité'}
                </small>
              </span>
              <ChevronRight size={19} className="chevron-indicator" />
            </motion.button>
          );
        })}
      </div>
      {!suppliers.length && !loading ? (
        <div className="purchasing-catalog-empty">
          <Truck size={28} />
          <strong>Aucun fournisseur trouvé</strong>
          <span>Ajoutez ou configurez le fournisseur depuis Stocks.</span>
        </div>
      ) : null}
      {loading ? (
        <div className="purchasing-catalog-loading">Chargement des fournisseurs…</div>
      ) : null}
    </section>
  );
}

export function DeliverySelection({
  supplier,
  dates,
  selectedDate,
  loading,
  onBack,
  onSelect,
}: {
  supplier: Supplier;
  dates: string[];
  selectedDate: string;
  loading: boolean;
  onBack: () => void;
  onSelect: (date: string) => void;
}) {
  const availableDates = [...new Set(dates.map((date) => date.slice(0, 10)))].sort();
  const initialMonth = (selectedDate || availableDates[0] || localDateKey(new Date())).slice(0, 7);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const firstMonth = availableDates[0]?.slice(0, 7) ?? visibleMonth;
  const lastMonth = availableDates.at(-1)?.slice(0, 7) ?? visibleMonth;
  const available = new Set(availableDates);
  const monthDays = calendarMonthDays(visibleMonth);
  const monthTitle = monthDate(visibleMonth).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <section className="purchasing-choice-step">
      <button type="button" className="purchasing-back-link" onClick={onBack}>
        <ArrowLeft size={16} /> Changer de fournisseur
      </button>
      <div className="purchasing-step-heading">
        <span>{supplier.name}</span>
        <h2>Quel jour souhaitez-vous être livré&nbsp;?</h2>
        <p>Les dates respectent les jours autorisés, le délai et l’heure limite du fournisseur.</p>
      </div>
      {loading ? (
        <div className="purchasing-catalog-loading">Calcul des dates disponibles…</div>
      ) : null}
      {availableDates.length && !loading ? (
        <div className="purchasing-delivery-calendar">
          <div className="purchasing-calendar-header">
            <button
              type="button"
              aria-label="Mois précédent"
              disabled={visibleMonth <= firstMonth}
              onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <strong>{monthTitle}</strong>
            <button
              type="button"
              aria-label="Mois suivant"
              disabled={visibleMonth >= lastMonth}
              onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="purchasing-calendar-weekdays" aria-hidden="true">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="purchasing-calendar-grid">
            {monthDays.map((date, index) => {
              if (!date)
                return <span className="purchasing-calendar-empty" key={`empty-${index}`} />;
              const isAvailable = available.has(date);
              const label = dateLabel(`${date}T12:00:00`);
              return (
                <button
                  type="button"
                  className={`${isAvailable ? 'available' : 'unavailable'}${selectedDate === date ? ' selected' : ''}`}
                  aria-label={`${label}, ${isAvailable ? 'disponible' : 'indisponible'}`}
                  disabled={!isAvailable}
                  key={date}
                  onClick={() => onSelect(date)}
                >
                  <span>{Number(date.slice(-2))}</span>
                </button>
              );
            })}
          </div>
          <div className="purchasing-calendar-legend">
            <span>
              <i className="available" /> Disponible
            </span>
            <span>
              <i /> Indisponible
            </span>
          </div>
        </div>
      ) : null}
      {!availableDates.length && !loading ? (
        <div className="purchasing-catalog-empty">
          <CalendarDays size={28} />
          <strong>Aucune date disponible</strong>
          <span>Vérifiez les jours et le délai dans Stocks &gt; Fournisseurs.</span>
        </div>
      ) : null}
    </section>
  );
}

function monthDate(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1, 12);
}

function shiftMonth(month: string, offset: number) {
  const date = monthDate(month);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calendarMonthDays(month: string) {
  const date = monthDate(month);
  const year = date.getFullYear();
  const monthNumber = date.getMonth();
  const leadingDays = (date.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber + 1, 0).getDate();
  const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - leadingDays + 1;
    return day < 1 || day > daysInMonth
      ? null
      : `${year}-${String(monthNumber + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });
}

export function OrderCatalog({
  bootstrap,
  supplier,
  deliveryDate,
  deliveryOptions,
  products,
  categories,
  recent,
  frequent,
  lines,
  productSearch,
  categoryId,
  productsLoading,
  productTotal,
  siteId,
  supplierMessage,
  notes,
  totals,
  saving,
  suggesting,
  saveLabel,
  canChangeSupplier,
  onBack,
  onSearch,
  onCategory,
  onLoadMore,
  onQuantity,
  onSuggestions,
  onSite,
  onDeliveryDate,
  onSupplierMessage,
  onNotes,
}: {
  bootstrap: PurchasingBootstrap;
  supplier: Supplier;
  deliveryDate: string;
  deliveryOptions: string[];
  products: Product[];
  categories: Category[];
  recent: Product[];
  frequent: Product[];
  lines: ComposerLine[];
  productSearch: string;
  categoryId: string;
  productsLoading: boolean;
  productTotal: number;
  siteId: string;
  supplierMessage: string;
  notes: string;
  totals: { articlesHt: number; deliveryFee: number; ht: number; tax: number };
  saving: boolean;
  suggesting: boolean;
  saveLabel: string;
  canChangeSupplier: boolean;
  onBack: () => void;
  onSearch: (value: string) => void;
  onCategory: (value: string) => void;
  onLoadMore: () => void;
  onQuantity: (product: Product, quantity: number) => void;
  onSuggestions: () => void;
  onSite: (value: string) => void;
  onDeliveryDate: (value: string) => void;
  onSupplierMessage: (value: string) => void;
  onNotes: (value: string) => void;
}) {
  const quantityOf = (productId: string) =>
    lines.find((line) => line.product.id === productId)?.quantity ?? 0;
  return (
    <div className="purchasing-catalog-layout">
      <main className="purchasing-catalog-main">
        <div className="purchasing-catalog-toolbar">
          <div>
            {canChangeSupplier ? (
              <button type="button" className="purchasing-back-link" onClick={onBack}>
                <ArrowLeft size={15} /> Fournisseurs
              </button>
            ) : null}
            <strong>{supplier.name}</strong>
            <span>
              {deliveryDate ? `Livraison ${dateLabel(deliveryDate)}` : 'Date à confirmer'}
            </span>
          </div>
          <label className="search-input-wrapper">
            <Search size={17} />
            <input
              className="search-input"
              value={productSearch}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Rechercher un produit ou une référence"
            />
          </label>
        </div>
        <div className="purchasing-category-filter" aria-label="Filtrer par catégorie">
          <button
            type="button"
            className={!categoryId ? 'active' : ''}
            onClick={() => onCategory('')}
          >
            Toutes les catégories
          </button>
          {categories.map((category) => (
            <button
              type="button"
              className={categoryId === category.id ? 'active' : ''}
              key={category.id}
              onClick={() => onCategory(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
        {!productSearch && !categoryId && recent.length ? (
          <ProductShelf
            title="Derniers produits commandés"
            products={recent}
            quantityOf={quantityOf}
            onQuantity={onQuantity}
          />
        ) : null}
        {!productSearch && !categoryId && frequent.length ? (
          <ProductShelf
            title="Produits souvent commandés"
            products={frequent}
            quantityOf={quantityOf}
            onQuantity={onQuantity}
          />
        ) : null}
        <section className="purchasing-catalog-section">
          <div className="purchasing-catalog-section-title">
            <div>
              <span>Catalogue Stocks</span>
              <strong>
                {categoryId
                  ? categories.find((category) => category.id === categoryId)?.name
                  : 'Tous les produits'}
              </strong>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={suggesting}
              onClick={onSuggestions}
            >
              <Sparkles size={15} /> Suggestions de réassort
            </button>
          </div>
          {products.length ? (
            <div className="purchasing-product-grid">
              {products.map((product) => (
                <ProductCard
                  product={product}
                  quantity={quantityOf(product.id)}
                  onQuantity={onQuantity}
                  key={product.id}
                />
              ))}
            </div>
          ) : !productsLoading ? (
            <div className="purchasing-catalog-empty">
              <Package size={28} />
              <strong>Aucun produit dans cette sélection</strong>
              <span>
                Les produits sont gérés depuis Stocks et rattachés au fournisseur principal.
              </span>
            </div>
          ) : null}
          {productsLoading ? (
            <div className="purchasing-catalog-loading">Chargement du catalogue…</div>
          ) : null}
          {products.length < productTotal ? (
            <button
              type="button"
              className="btn btn-secondary purchasing-load-more"
              disabled={productsLoading}
              onClick={onLoadMore}
            >
              Afficher plus de produits ({products.length}/{productTotal})
            </button>
          ) : null}
        </section>
      </main>
      <aside className="purchasing-cart">
        <div className="purchasing-cart-header">
          <span>
            <ShoppingCart size={19} /> Panier
          </span>
          <strong>{lines.length}</strong>
        </div>
        <div className="purchasing-cart-lines">
          {lines.map((line) => (
            <article key={line.product.id}>
              <div>
                <strong>{line.product.name}</strong>
                <span>{money(line.quantity * line.unitPrice)} HT</span>
              </div>
              <QuantityControl
                quantity={line.quantity}
                onChange={(quantity) => onQuantity(line.product, quantity)}
                removeLabel="Supprimer du panier"
              />
            </article>
          ))}
          {!lines.length ? (
            <div className="purchasing-cart-empty">
              <ShoppingCart size={26} />
              <span>Ajoutez les quantités depuis le catalogue.</span>
            </div>
          ) : null}
        </div>
        <div className="purchasing-cart-settings">
          <label>
            <span>Site de livraison</span>
            <select value={siteId} onChange={(event) => onSite(event.target.value)} required>
              {bootstrap.sites.map((site) => (
                <option value={site.id} key={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Date attendue</span>
            <select value={deliveryDate} onChange={(event) => onDeliveryDate(event.target.value)}>
              <option value="">À confirmer</option>
              {deliveryOptions.map((date) => (
                <option value={date.slice(0, 10)} key={date}>
                  {dateLabel(date)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Message fournisseur</span>
            <textarea
              rows={2}
              value={supplierMessage}
              onChange={(event) => onSupplierMessage(event.target.value)}
              placeholder="Instructions visibles sur la commande"
            />
          </label>
          <label>
            <span>Note interne</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(event) => onNotes(event.target.value)}
              placeholder="Visible uniquement dans ToqueHub"
            />
          </label>
        </div>
        {supplier.purchasingProfile?.orderEmail ? null : (
          <p className="purchasing-cart-warning">
            E-mail de commande manquant dans Stocks &gt; Fournisseurs.
          </p>
        )}
        {Number(supplier.purchasingProfile?.minimumOrder ?? 0) > totals.articlesHt ? (
          <p className="purchasing-cart-warning">
            Minimum HT : {money(Number(supplier.purchasingProfile?.minimumOrder ?? 0))}. Il manque{' '}
            {money(Number(supplier.purchasingProfile?.minimumOrder ?? 0) - totals.articlesHt)}.
          </p>
        ) : null}
        <div className="purchasing-cart-totals">
          <span>
            Articles HT <strong>{money(totals.articlesHt)}</strong>
          </span>
          {totals.deliveryFee ? (
            <span>
              Livraison <strong>{money(totals.deliveryFee)}</strong>
            </span>
          ) : null}
          <span>
            TVA <strong>{money(totals.tax)}</strong>
          </span>
          <span className="total">
            Total TTC <strong>{money(totals.ht + totals.tax)}</strong>
          </span>
        </div>
        <button
          type="submit"
          className="btn btn-primary purchasing-cart-submit"
          disabled={saving || !lines.length || !siteId}
        >
          {saving ? 'Enregistrement…' : saveLabel}
        </button>
      </aside>
    </div>
  );
}

function ProductShelf({
  title,
  products,
  quantityOf,
  onQuantity,
}: {
  title: string;
  products: Product[];
  quantityOf: (productId: string) => number;
  onQuantity: (product: Product, quantity: number) => void;
}) {
  return (
    <section className="purchasing-catalog-section compact">
      <div className="purchasing-catalog-section-title">
        <strong>{title}</strong>
      </div>
      <div className="purchasing-product-shelf">
        {products.map((product) => (
          <ProductCard
            product={product}
            quantity={quantityOf(product.id)}
            onQuantity={onQuantity}
            compact
            key={product.id}
          />
        ))}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  quantity,
  onQuantity,
  compact = false,
}: {
  product: Product;
  quantity: number;
  onQuantity: (product: Product, quantity: number) => void;
  compact?: boolean;
}) {
  return (
    <article className={`purchasing-product-card${compact ? ' compact' : ''}`}>
      <div className="purchasing-product-visual">
        <Package size={compact ? 25 : 31} />
        {product.category?.name ? <span>{product.category.name}</span> : null}
      </div>
      <div className="purchasing-product-copy">
        <strong>{product.name}</strong>
        <span>
          {product.sku || 'Sans référence'} ·{' '}
          {product.packageLabel || product.unit?.symbol || 'unité'}
        </span>
      </div>
      <div className="purchasing-product-meta">
        <strong>{money(Number(product.averagePrice ?? 0))} HT</strong>
        <span>Stock {Number(product.stockQuantity ?? 0)}</span>
      </div>
      <QuantityControl
        quantity={quantity}
        onChange={(next) => onQuantity(product, next)}
        removeLabel={`Retirer ${product.name}`}
      />
    </article>
  );
}

function QuantityControl({
  quantity,
  onChange,
  removeLabel,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
  removeLabel: string;
}) {
  if (quantity <= 0)
    return (
      <button type="button" className="purchasing-add-product" onClick={() => onChange(1)}>
        <Plus size={16} /> Ajouter
      </button>
    );
  return (
    <div className="purchasing-quantity-control">
      <button
        type="button"
        aria-label={quantity <= 1 ? removeLabel : 'Diminuer la quantité'}
        onClick={() => onChange(quantity - 1)}
      >
        {quantity <= 1 ? <Trash2 size={14} /> : <Minus size={14} />}
      </button>
      <input
        type="number"
        min="0"
        step="0.001"
        value={quantity}
        aria-label="Quantité"
        onChange={(event) => onChange(Math.max(0, Number(event.target.value)))}
      />
      <button
        type="button"
        aria-label="Augmenter la quantité"
        onClick={() => onChange(quantity + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

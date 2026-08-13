import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Boxes, Search, X } from 'lucide-react';
import type { Product } from '../types';

type Props = {
  open: boolean;
  products: Product[];
  selectedProductId?: string;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  onClose: () => void;
  onSelect: (product: Product) => void;
};

function normalize(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR')
    .trim();
}

function money(value?: number | string | null) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
    Number(value ?? 0),
  );
}

export function ProductPickerModal({
  open,
  products,
  selectedProductId = '',
  title = 'Catalogue des produits Stocks',
  subtitle = 'Sélectionnez un produit dans la liste ci-dessous.',
  emptyMessage = 'Aucun produit ne correspond à vos critères de recherche.',
  onClose,
  onSelect,
}: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setCategory('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => product.category?.name)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((left, right) => left.localeCompare(right, 'fr')),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const needle = normalize(search);
    return products.filter((product) => {
      if (category && product.category?.name !== category) return false;
      if (!needle) return true;
      return normalize(
        [
          product.name,
          product.sku,
          product.gtin,
          product.category?.name,
          product.primarySupplier?.name,
        ]
          .filter(Boolean)
          .join(' '),
      ).includes(needle);
    });
  }, [category, products, search]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'rgba(9, 13, 22, 0.45)',
        backdropFilter: 'blur(4px)',
      }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-picker-title"
        style={{
          width: 'min(920px, 100%)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 16,
          background: '#fff',
          color: '#1e293b',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,.1), 0 10px 10px -5px rgba(0,0,0,.04)',
        }}
      >
        <header
          style={{
            padding: '1.25rem 1.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <div>
            <h2 id="product-picker-title" style={{ margin: 0, fontSize: '1.15rem' }}>
              {title}
            </h2>
            <span style={{ fontSize: '.8rem', color: '#64748b' }}>{subtitle}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 34,
              height: 34,
              display: 'grid',
              placeItems: 'center',
              border: 0,
              borderRadius: 8,
              background: '#f1f5f9',
              color: '#64748b',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </header>

        <div
          style={{
            padding: '1rem 1.75rem',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(180px, 1fr)',
            gap: '1rem',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
          }}
        >
          <label style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ position: 'absolute', left: 11, color: '#94a3b8' }} />
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par nom, SKU, GTIN / EAN ou fournisseur…"
              style={{ width: '100%', padding: '.6rem 2.25rem', margin: 0 }}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                style={{
                  position: 'absolute',
                  right: 8,
                  display: 'grid',
                  placeItems: 'center',
                  border: 0,
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            ) : null}
          </label>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.75rem' }}>
          {filteredProducts.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '.75rem .5rem' }}>Produit</th>
                  <th style={{ padding: '.75rem .5rem' }}>Catégorie</th>
                  <th style={{ padding: '.75rem .5rem' }}>SKU / GTIN</th>
                  <th style={{ padding: '.75rem .5rem', textAlign: 'right' }}>Prix moyen d’achat</th>
                  <th style={{ padding: '.75rem .5rem', textAlign: 'center' }}>Unité</th>
                  <th style={{ padding: '.75rem .5rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const selected = product.id === selectedProductId;
                  return (
                    <tr
                      key={product.id}
                      onClick={() => onSelect(product)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #f1f5f9',
                        background: selected ? '#f0fdf4' : undefined,
                      }}
                    >
                      <td style={{ padding: '.75rem .5rem', fontWeight: 700 }}>{product.name}</td>
                      <td style={{ padding: '.75rem .5rem' }}>{product.category?.name ?? '—'}</td>
                      <td style={{ padding: '.75rem .5rem', color: '#475569' }}>
                        {[product.sku, product.gtin].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td style={{ padding: '.75rem .5rem', textAlign: 'right' }}>
                        {money(product.averagePurchasePrice ?? product.averagePrice)}
                      </td>
                      <td style={{ padding: '.75rem .5rem', textAlign: 'center' }}>
                        {product.unit?.symbol ?? product.unit?.name ?? '—'}
                      </td>
                      <td style={{ padding: '.75rem .5rem', textAlign: 'right' }}>
                        <button type="button" className="btn btn-secondary btn-sm">
                          {selected ? 'Sélectionné' : 'Choisir'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#94a3b8' }}>
              <Boxes size={32} style={{ marginBottom: '.75rem' }} />
              <div>{emptyMessage}</div>
            </div>
          )}
        </div>

        <footer
          style={{
            padding: '1rem 1.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid #f1f5f9',
            background: '#f8fafc',
            color: '#64748b',
            fontSize: '.8rem',
          }}
        >
          <span>
            {filteredProducts.length} produit(s) affiché(s) sur {products.length}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Fermer
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

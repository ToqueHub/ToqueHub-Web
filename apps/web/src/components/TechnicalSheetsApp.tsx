// @ts-nocheck
import { activeLanguage, activeLocale } from '../i18n/runtime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChefHat,
  ClipboardList,
  Copy,
  Edit3,
  FileText,
  Info,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Utensils,
  Upload,
  X,
  AlertCircle,
  Clock,
  Eye,
  CheckCircle2,
  MapPin,
  ArrowLeft,
  Camera,
  Check,
  ArrowRight,
  ShieldCheck,
  Scale,
} from 'lucide-react';
import { api } from '../api/client';
import { TechnicalSheetAssistantPanel } from './TechnicalSheetAssistantPanel';
import {
  TechnicalSheetPickerModal,
  type TechnicalSheetPickerItem,
} from './TechnicalSheetPickerModal';
import type {
  Product,
  TechnicalSheetCategory,
  TechnicalSheetDashboard,
  TechnicalSheetOnboarding,
  TechnicalSheetRecipe,
  TechnicalSheetRecipeImportStatus,
  TechnicalSheetRecipePayload,
  TechnicalSheetSalesTaxPolicy,
  Unit,
} from '../types';

type TechnicalSheetsTab = 'dashboard' | 'recipes' | 'categories' | 'costs';

type TechnicalSheetsAppProps = {
  token: string;
  tab: TechnicalSheetsTab;
  stocksInstalled: boolean;
  products: Product[];
  units: Unit[];
  onboardingOpen?: boolean;
  onOnboardingClose?: () => void;
  onNavigate: (tab: TechnicalSheetsTab) => void;
};

const statuses = [
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'ACTIVE', label: 'Actif' },
];

const MAX_RECIPE_IMPORT_FILES = 10;
const TECHNICAL_SHEETS_PENDING_RECIPE_ACTION_KEY = 'toquehub.technicalSheets.pendingRecipeAction';
const TECHNICAL_SHEETS_CATEGORY_TOUR_TARGET = 'technical-sheets-add-category';
const TECHNICAL_SHEETS_CATEGORY_REQUIRED_MESSAGE =
  'Veuillez créer une catégorie avant de créer une fiche technique.';

const emptyRecipe: TechnicalSheetRecipePayload = {
  name: '',
  description: '',
  categoryId: '',
  photoUrl: '',
  stockPolicy: 'MAKE_TO_STOCK',
  trackOutputStock: false,
  createOutputProduct: false,
  outputProductKind: 'FINISHED',
  yieldMode: 'PORTIONS',
  referencePortions: 10,
  prepTimeMinutes: 0,
  cookTimeMinutes: 0,
  status: 'DRAFT',
  ingredients: [],
  steps: [],
};

const money = (value?: number | string | null) => `${Number(value ?? 0).toFixed(2)} €`;
const date = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(activeLocale()) : '—';
const isArchived = (item?: { isArchived?: boolean; archivedAt?: string | null }) =>
  Boolean(item?.isArchived || item?.archivedAt);
const recipeImportWorking = (status: TechnicalSheetRecipeImportStatus) =>
  !['vérifier', 'erreur'].includes(status.state);
const formatImportBytes = (value: number) =>
  value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} Mo`
    : `${Math.max(1, Math.round(value / 1024))} Ko`;

function normalizedUnitSymbol(symbol?: string | null) {
  return String(symbol ?? '')
    .trim()
    .toLocaleLowerCase('fr');
}

function unitCanonicalFactor(unit?: Unit | null) {
  const symbol = normalizedUnitSymbol(unit?.symbol);
  const type = String(unit?.type ?? unit?.unitType ?? '').toUpperCase();
  if (type === 'MASS') {
    return (
      {
        t: 1_000_000,
        tonne: 1_000_000,
        tonnes: 1_000_000,
        kg: 1_000,
        kilo: 1_000,
        kilos: 1_000,
        kilogramme: 1_000,
        kilogrammes: 1_000,
        g: 1,
        gr: 1,
        gramme: 1,
        grammes: 1,
        mg: 0.001,
      }[symbol] ?? null
    );
  }
  if (type === 'VOLUME') {
    return (
      {
        l: 1_000,
        litre: 1_000,
        litres: 1_000,
        dl: 100,
        cl: 10,
        ml: 1,
      }[symbol] ?? null
    );
  }
  return null;
}

function convertRecipeQuantity(quantity: number, fromUnit?: Unit | null, toUnit?: Unit | null) {
  if (!Number.isFinite(quantity)) return null;
  if (!fromUnit || !toUnit) return null;
  if (fromUnit.id === toUnit.id) return quantity;
  const fromType = String(fromUnit.type ?? fromUnit.unitType ?? '').toUpperCase();
  const toType = String(toUnit.type ?? toUnit.unitType ?? '').toUpperCase();
  if (!fromType || fromType !== toType) return null;
  const fromFactor = unitCanonicalFactor(fromUnit);
  const toFactor = unitCanonicalFactor(toUnit);
  return fromFactor != null && toFactor != null ? (quantity * fromFactor) / toFactor : null;
}

function recipeReferenceYield(recipe?: TechnicalSheetRecipe | null) {
  if (!recipe) return 0;
  return recipe.yieldMode === 'MASS'
    ? Number(recipe.totalMassGrams ?? 0)
    : Number(recipe.referencePortions ?? 0);
}

function ingredientMassGrams(
  line: NonNullable<TechnicalSheetRecipePayload['ingredients']>[number],
  products: Product[],
  units: Unit[],
  recipes: TechnicalSheetRecipe[],
) {
  const source = recipes.find((recipe) => recipe.id === line.sourceTechnicalSheetId);
  if (source) {
    if (source.yieldMode === 'MASS') {
      const lineUnit = units.find((item) => item.id === line.unitId);
      const factor = unitCanonicalFactor(lineUnit);
      return factor == null ? null : Number(line.quantity || 0) * factor;
    }
    const referenceYield = recipeReferenceYield(source);
    const sourceMass = Number(source.totalMassGrams ?? 0);
    return referenceYield > 0 && sourceMass > 0
      ? (sourceMass * Number(line.quantity || 0)) / referenceYield
      : null;
  }
  const unit = units.find((item) => item.id === line.unitId);
  if (String(unit?.type ?? unit?.unitType ?? '').toUpperCase() === 'MASS') {
    const factor = unitCanonicalFactor(unit);
    return factor == null ? null : Number(line.quantity || 0) * factor;
  }
  const product = products.find((item) => item.id === line.productId);
  const stockUnit = product?.unit ?? units.find((item) => item.id === product?.unitId);
  const quantityInStockUnit = convertRecipeQuantity(Number(line.quantity || 0), unit, stockUnit);
  const unitWeight = Number(product?.unitWeightGrams ?? product?.netWeightGrams ?? 0);
  return quantityInStockUnit != null && unitWeight > 0 ? quantityInStockUnit * unitWeight : null;
}

function ingredientCostEstimate(
  line: NonNullable<TechnicalSheetRecipePayload['ingredients']>[number],
  products: Product[],
  units: Unit[],
  recipes: TechnicalSheetRecipe[],
) {
  const source = recipes.find((recipe) => recipe.id === line.sourceTechnicalSheetId);
  if (source) {
    const referenceYield = recipeReferenceYield(source);
    const requestedYield =
      source.yieldMode === 'MASS'
        ? ingredientMassGrams(line, products, units, recipes)
        : Number(line.quantity || 0);
    return referenceYield > 0 && requestedYield != null
      ? (Number(source.totalCost ?? source.costTotal ?? 0) * requestedYield) / referenceYield
      : null;
  }
  const product = products.find((item) => item.id === line.productId);
  if (!product) return null;
  const lineUnit = units.find((item) => item.id === line.unitId);
  const productUnit = product.unit ?? units.find((item) => item.id === product.unitId);
  const quantityInStockUnit = convertRecipeQuantity(
    Number(line.quantity || 0),
    lineUnit,
    productUnit,
  );
  return quantityInStockUnit == null
    ? null
    : quantityInStockUnit * Number(product.averagePrice ?? product.averagePurchasePrice ?? 0);
}

function formatMass(grams: number) {
  if (!Number.isFinite(grams) || grams <= 0) return 'Non calculable';
  if (grams >= 1_000) {
    return `${(grams / 1_000).toLocaleString(activeLocale(), {
      maximumFractionDigits: 3,
    })} kg`;
  }
  return `${grams.toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} g`;
}

function recipePayloadForSave(
  form: TechnicalSheetRecipePayload,
  importDocumentId: string | null,
): TechnicalSheetRecipePayload {
  const payload: TechnicalSheetRecipePayload = {
    ...form,
    stockPolicy: 'MAKE_TO_STOCK',
    status: form.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
    trackOutputStock: true,
    createOutputProduct: true,
    outputProductName: form.name.trim(),
    outputProductKind: form.mode === 'PRODUCTION' ? 'INTERMEDIATE' : 'FINISHED',
    ingredients: (form.ingredients ?? []).map(
      ({ id: _id, componentType: _componentType, ...ingredient }) => ({
        ...ingredient,
        sourceTechnicalSheetId: ingredient.sourceTechnicalSheetId || undefined,
        section: ingredient.section?.trim() || undefined,
      }),
    ),
    steps: (form.steps ?? []).map(({ id: _id, ...step }) => step),
  };
  if (importDocumentId) payload.importDocumentId = importDocumentId;
  else delete payload.importDocumentId;
  return payload;
}

// Component Local Modal Container with Framer Motion
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="modal-overlay"
          onClick={onClose}
          style={{ pointerEvents: 'auto', zIndex: 1100 }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="modal-content-wrapper"
            style={{ maxWidth: '800px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{title}</h3>
              <button className="modal-close-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem' }}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Searchable custom autocomplete component for selecting products
function ProductSelect({
  products,
  value,
  onChange,
  placeholder = 'Rechercher un produit Stocks...',
}: {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');

  const selectedProduct = products.find((p) => p.id === value);
  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())),
  );

  const categoriesList = useMemo(() => {
    const names = products.map((p) => p.category?.name).filter(Boolean) as string[];
    return Array.from(new Set(names));
  }, [products]);

  const catalogFiltered = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(catalogSearch.toLowerCase()));
      const matchesCategory = !catalogCategory || p.category?.name === catalogCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, catalogSearch, catalogCategory]);

  useEffect(() => {
    if (selectedProduct) {
      setSearch(selectedProduct.name);
    } else {
      setSearch('');
    }
  }, [value, selectedProduct]);

  return (
    <div className="custom-autocomplete-wrapper" style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', position: 'relative', alignItems: 'center', flex: 1 }}>
          <input
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              // Delay to allow clicking on dropdown items
              setTimeout(() => setIsOpen(false), 200);
            }}
            style={{ width: '100%', marginBottom: 0, paddingRight: value ? '30px' : '10px' }}
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setSearch('');
              }}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsCatalogOpen(true)}
          title="Parcourir le catalogue"
          style={{
            height: '38px',
            width: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            cursor: 'pointer',
            color: '#475569',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#e2e8f0')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#f1f5f9')}
        >
          <ClipboardList size={16} />
        </button>
      </div>

      {isOpen && (
        <div
          className="custom-autocomplete-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'white',
            border: '1px solid var(--light-border)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 1200,
            marginTop: '4px',
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}
            >
              Aucun produit trouvé
            </div>
          ) : (
            filtered.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  onChange(p.id);
                  setSearch(p.name);
                  setIsOpen(false);
                }}
                style={{
                  padding: '0.6rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.88rem',
                  borderBottom: '1px solid #f1f5f9',
                  background: value === p.id ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                  color: value === p.id ? 'var(--primary)' : 'var(--text-main)',
                  fontWeight: value === p.id ? 600 : 400,
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
              >
                <strong>{p.name}</strong> {p.sku ? ` · ${p.sku}` : ''}
              </div>
            ))
          )}
        </div>
      )}

      {isCatalogOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(9, 13, 22, 0.45)',
            backdropFilter: 'blur(4px)',
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
          onClick={() => setIsCatalogOpen(false)}
        >
          <div
            style={{
              maxWidth: '820px',
              width: '100%',
              maxHeight: '85vh',
              background: 'white',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
              color: '#1e293b',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.75rem',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#ffffff',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  Catalogue des Produits Stocks
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Sélectionnez un ingrédient dans la liste ci-dessous
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsCatalogOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Filters */}
            <div
              style={{
                padding: '1rem 1.75rem',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '1rem',
              }}
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Rechercher par nom ou code/SKU..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    background: '#ffffff',
                    marginBottom: 0,
                  }}
                />
                <Search
                  size={14}
                  style={{ position: 'absolute', left: '10px', color: '#94a3b8' }}
                />
                {catalogSearch && (
                  <button
                    type="button"
                    onClick={() => setCatalogSearch('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#94a3b8',
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <select
                value={catalogCategory}
                onChange={(e) => setCatalogCategory(e.target.value)}
                style={{
                  padding: '0.55rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  background: '#ffffff',
                  marginBottom: 0,
                }}
              >
                <option value="">Toutes les catégories</option>
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Modal List Area */}
            <div
              style={{
                overflowY: 'auto',
                flex: 1,
                padding: '1rem 1.75rem',
              }}
            >
              {catalogFiltered.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: '2px solid #e2e8f0',
                        textAlign: 'left',
                        color: '#475569',
                        fontWeight: 600,
                      }}
                    >
                      <th style={{ padding: '0.75rem 0.5rem' }}>Produit</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Catégorie</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>SKU/Code</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                        Prix moyen d'achat
                      </th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Unité</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogFiltered.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => {
                          onChange(p.id);
                          setSearch(p.name);
                          setIsCatalogOpen(false);
                        }}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td
                          style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: '#0f172a' }}
                        >
                          {p.name}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          {p.category?.name ? (
                            <span
                              style={{
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                              }}
                            >
                              {p.category.name}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: '0.75rem 0.5rem',
                            fontFamily: 'monospace',
                            color: '#475569',
                          }}
                        >
                          {p.sku ?? <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td
                          style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 500 }}
                        >
                          {p.averagePurchasePrice
                            ? money(p.averagePurchasePrice)
                            : money(p.averagePrice ?? 0)}
                        </td>
                        <td
                          style={{
                            padding: '0.75rem 0.5rem',
                            textAlign: 'center',
                            color: '#64748b',
                          }}
                        >
                          {p.unit?.symbol ?? p.unit?.name ?? '—'}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{
                              fontSize: '0.8rem',
                              padding: '0.3rem 0.6rem',
                              borderRadius: '6px',
                              background: value === p.id ? 'var(--primary)' : '#ffffff',
                              color: value === p.id ? '#ffffff' : 'var(--text-main)',
                              borderColor: value === p.id ? 'var(--primary)' : '#cbd5e1',
                            }}
                          >
                            {value === p.id ? 'Sélectionné' : 'Choisir'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '3rem 1.5rem',
                    color: '#94a3b8',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <Search size={32} style={{ color: '#cbd5e1' }} />
                  <span>Aucun ingrédient ne correspond à vos critères de recherche.</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '1rem 1.75rem',
                borderTop: '1px solid #f1f5f9',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                color: '#64748b',
              }}
            >
              <span>
                Affichage de {catalogFiltered.length} produit(s) sur {products.length} au total
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsCatalogOpen(false)}
                style={{ height: '32px', padding: '0 1rem', fontSize: '0.85rem' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable Metric card matching Stocks dashboard
function MetricCard({
  label,
  value,
  icon,
  tone = 'emerald',
  onClick,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: string;
  onClick?: () => void;
}) {
  return (
    <motion.div
      className={`metric-card-modern tone-${tone}`}
      whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(9, 13, 22, 0.05)' }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick();
        }
      }}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="metric-header">
        <div className={`metric-icon-wrapper-modern tone-${tone}`}>{icon}</div>
      </div>
      <div className="metric-body-modern">
        <span className="metric-value-modern" style={{ fontSize: '1.8rem' }}>
          {value}
        </span>
        <span className="metric-label-modern" style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
          {label}
        </span>
      </div>
      <div className="metric-shine" />
    </motion.div>
  );
}

export function TechnicalSheetsApp({
  token,
  tab,
  stocksInstalled,
  products,
  units,
  onboardingOpen = false,
  onOnboardingClose,
  onNavigate,
}: TechnicalSheetsAppProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [dashboard, setDashboard] = useState<TechnicalSheetDashboard>();
  const [onboarding, setOnboarding] = useState<TechnicalSheetOnboarding>();
  const [onboardingVisible, setOnboardingVisible] = useState(onboardingOpen);
  const [pendingFirstRecipeAction, setPendingFirstRecipeAction] = useState<'ocr' | 'manual' | null>(
    () => {
      const pending = sessionStorage.getItem(TECHNICAL_SHEETS_PENDING_RECIPE_ACTION_KEY);
      return pending === 'ocr' || pending === 'manual' ? pending : null;
    },
  );
  const [recipes, setRecipes] = useState<TechnicalSheetRecipe[]>([]);
  const [categories, setCategories] = useState<TechnicalSheetCategory[]>([]);
  const [salesTaxPolicy, setSalesTaxPolicy] = useState<TechnicalSheetSalesTaxPolicy>();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [recipeDialog, setRecipeDialog] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<TechnicalSheetRecipe | null>(null);
  const [form, setForm] = useState<TechnicalSheetRecipePayload>(emptyRecipe);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryCreationTourOpen, setCategoryCreationTourOpen] = useState(false);
  const [categoryReassignmentOpen, setCategoryReassignmentOpen] = useState(false);
  const [categoryReassignmentTotal, setCategoryReassignmentTotal] = useState(0);
  const [duplicateOpen, setDuplicateOpen] = useState<TechnicalSheetRecipe | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [availableProducts, setAvailableProducts] = useState<Product[]>(products);
  const [importOpen, setImportOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importStatuses, setImportStatuses] = useState<TechnicalSheetRecipeImportStatus[]>([]);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [retryingFailedImports, setRetryingFailedImports] = useState(false);
  const [removingImportDocumentIds, setRemovingImportDocumentIds] = useState<string[]>([]);
  const [reviewingImportDocumentId, setReviewingImportDocumentId] = useState<string | null>(null);
  const [kokkiOpen, setKokkiOpen] = useState(false);
  const [reviewingKokkiDraftId, setReviewingKokkiDraftId] = useState<string | null>(null);
  const [reviewingKokkiPricing, setReviewingKokkiPricing] = useState<{
    targetSellingPriceExclTax?: number | null;
    targetSellingPriceInclTax?: number | null;
  } | null>(null);

  async function load() {
    if (!stocksInstalled) return;
    setLoading(true);
    setError(undefined);
    try {
      const recipeQuery =
        tab === 'recipes'
          ? {
              includeArchived: true,
              search: search || undefined,
              categoryId: categoryFilter || undefined,
              status: statusFilter || undefined,
              pageSize: 200,
            }
          : { includeArchived: true, pageSize: 200 };
      const [dash, cats, recipeList, onboardingState] = await Promise.all([
        api.technicalSheetsDashboard(token).catch(() => undefined),
        api.technicalSheetCategories(token),
        api.technicalSheetRecipes(token, recipeQuery),
        api.technicalSheetsOnboarding(token).catch(() => undefined),
      ]);
      setDashboard(dash);
      setOnboarding(onboardingState);
      setCategories(cats);
      setRecipes(recipeList.items ?? recipeList);
      setSalesTaxPolicy(recipeList.salesTaxPolicy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des fiches techniques impossible.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [stocksInstalled, tab, search, categoryFilter, statusFilter]);
  useEffect(() => {
    setAvailableProducts(products);
  }, [products]);
  useEffect(() => {
    if (onboardingOpen) setOnboardingVisible(true);
  }, [onboardingOpen]);
  useEffect(() => {
    const draftId = localStorage.getItem('toquehub_open_kokki_draft');
    if (!draftId || !stocksInstalled) return;
    localStorage.removeItem('toquehub_open_kokki_draft');
    void api
      .technicalSheetAssistantDraft(token, draftId)
      .then(openKokkiDraft)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Brouillon Kokki introuvable.'),
      );
  }, [token, stocksInstalled, tab]);
  useEffect(() => {
    if (tab !== 'recipes' || !pendingFirstRecipeAction) return undefined;
    const frame = window.requestAnimationFrame(() => {
      sessionStorage.removeItem(TECHNICAL_SHEETS_PENDING_RECIPE_ACTION_KEY);
      if (pendingFirstRecipeAction === 'ocr') setImportOpen(true);
      else openRecipe();
      setPendingFirstRecipeAction(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingFirstRecipeAction, tab]);

  async function refreshImportStatuses() {
    try {
      const response = await api.technicalSheetRecipeImportStatuses(token);
      const nextStatuses = response.statuses ?? [];
      setImportStatuses(nextStatuses);
      return nextStatuses;
    } catch {
      // Le chargement principal reste utilisable si le suivi d'import est momentanément indisponible.
      return importStatuses;
    }
  }

  useEffect(() => {
    if (!stocksInstalled) return;
    void refreshImportStatuses();
  }, [stocksInstalled, token]);

  useEffect(() => {
    if (!importStatuses.some(recipeImportWorking)) return undefined;
    const timer = window.setInterval(() => void refreshImportStatuses(), 2500);
    return () => window.clearInterval(timer);
  }, [token, importStatuses.some(recipeImportWorking)]);

  const activeProducts = useMemo(
    () => availableProducts.filter((product) => !isArchived(product)),
    [availableProducts],
  );
  const activeCategories = useMemo(
    () => categories.filter((category) => !isArchived(category)),
    [categories],
  );
  const recipesWithoutActiveCategory = useMemo(() => {
    const activeCategoryIds = new Set(activeCategories.map((category) => category.id));
    return recipes
      .filter(
        (recipe) =>
          !isArchived(recipe) && (!recipe.categoryId || !activeCategoryIds.has(recipe.categoryId)),
      )
      .sort((left, right) => left.name.localeCompare(right.name, 'fr'));
  }, [activeCategories, recipes]);

  useEffect(() => {
    if (activeCategories.length) setCategoryCreationTourOpen(false);
  }, [activeCategories.length]);

  function requireActiveCategory() {
    if (activeCategories.length) return true;
    setSuccess(undefined);
    setError(TECHNICAL_SHEETS_CATEGORY_REQUIRED_MESSAGE);
    setRecipeDialog(false);
    setImportOpen(false);
    setKokkiOpen(false);
    setCategoryCreationTourOpen(true);
    onNavigate('categories');
    return false;
  }

  function openRecipe(recipe?: TechnicalSheetRecipe) {
    if (!recipe && !requireActiveCategory()) return;
    setReviewingImportDocumentId(null);
    setReviewingKokkiDraftId(null);
    setReviewingKokkiPricing(null);
    setEditingRecipe(recipe ?? null);
    setForm(
      recipe
        ? {
            name: recipe.name,
            description: recipe.description ?? '',
            categoryId: recipe.categoryId ?? recipe.category?.id ?? '',
            photoUrl: recipe.photoUrl ?? recipe.photoDataUrl ?? '',
            mode: recipe.mode ?? 'ASSEMBLY',
            stockPolicy: 'MAKE_TO_STOCK',
            trackOutputStock: Boolean(recipe.outputProductId),
            outputProductId: recipe.outputProductId ?? undefined,
            outputProductName: recipe.outputProduct?.name ?? recipe.name,
            outputProductKind:
              recipe.outputProduct?.kind === 'INTERMEDIATE' ? 'INTERMEDIATE' : 'FINISHED',
            yieldUnitId: recipe.yieldUnitId ?? recipe.outputProduct?.unitId ?? undefined,
            yieldMode: recipe.yieldMode ?? 'PORTIONS',
            referencePortions: Number(recipe.referencePortions ?? recipe.portions ?? 10),
            prepTimeMinutes: Number(recipe.prepTimeMinutes ?? 0),
            cookTimeMinutes: Number(recipe.cookTimeMinutes ?? 0),
            status: ['ACTIVE', 'VALIDATED'].includes(recipe.status) ? 'ACTIVE' : 'DRAFT',
            ingredients: (recipe.ingredients ?? []).map((line) => ({
              id: line.id,
              productId: line.productId,
              componentType: line.sourceTechnicalSheetId ? 'SUB_RECIPE' : 'PRODUCT',
              sourceTechnicalSheetId: line.sourceTechnicalSheetId ?? undefined,
              unitId: line.unitId,
              quantity: Number(line.quantity),
              comment: line.comment ?? '',
              section: line.section ?? '',
            })),
            steps: (recipe.steps ?? []).map((step, index) => ({
              id: step.id,
              order: step.order ?? index + 1,
              title: step.title ?? '',
              description: step.description ?? '',
              section: step.section ?? '',
              estimatedTimeMinutes: Number(step.estimatedTimeMinutes ?? 0),
            })),
          }
        : {
            ...emptyRecipe,
            categoryId: categories.find((cat) => !isArchived(cat))?.id ?? '',
            ingredients: [],
            steps: [],
          },
    );
    setRecipeDialog(true);
  }

  async function saveRecipe() {
    if (!form.mode) return setError('Choisissez Assemblage ou Fabrication.');
    if (!form.name.trim()) return setError('Le nom de la fiche est requis.');
    if (!form.categoryId) return setError('Choisissez une catégorie recette.');
    if (
      (form.yieldMode ?? 'PORTIONS') === 'PORTIONS' &&
      (!form.referencePortions || form.referencePortions <= 0)
    ) {
      return setError('Le nombre de portions obtenues doit être positif.');
    }
    if (
      form.yieldMode === 'MASS' &&
      !(form.ingredients ?? []).some(
        (line) =>
          ingredientMassGrams(line, availableProducts, units, recipes) != null ||
          Boolean(line.sourceTechnicalSheetId),
      )
    ) {
      return setError(
        'Ajoutez au moins un ingrédient en unité de masse pour calculer le poids total.',
      );
    }
    if (
      (form.ingredients ?? []).some(
        (line) =>
          !line.sourceTechnicalSheetId &&
          !line.productId &&
          !(line.createProduct && line.productName?.trim()),
      )
    ) {
      return setError(
        'Chaque ingrédient doit être associé à un produit Stocks ou défini comme nouveau produit.',
      );
    }
    if (
      form.mode === 'PRODUCTION' &&
      (form.ingredients ?? []).some((line) => line.sourceTechnicalSheetId)
    ) {
      return setError(
        'Une fabrication ne peut pas contenir de sous-recette. Utilisez une fiche Assemblage.',
      );
    }
    if (form.status === 'ACTIVE' && !(form.ingredients ?? []).length) {
      return setError('Ajoutez au moins un ingrédient avant de rendre la fiche active.');
    }
    if (form.status === 'ACTIVE' && form.mode === 'PRODUCTION' && !(form.steps ?? []).length) {
      return setError('Ajoutez au moins une étape avant de rendre une fabrication active.');
    }
    const invalidStepDurationIndex = (form.steps ?? []).findIndex((step) => {
      const duration = Number(step.estimatedTimeMinutes);
      return !Number.isInteger(duration) || duration <= 0;
    });
    if (invalidStepDurationIndex >= 0) {
      const invalidStep = form.steps?.[invalidStepDurationIndex];
      const stepLabel = invalidStep?.title?.trim()
        ? `« ${invalidStep.title.trim()} »`
        : `n° ${invalidStepDurationIndex + 1}`;
      setError(`Indiquez une durée entière supérieure à 0 minute pour l’étape ${stepLabel}.`);
      window.setTimeout(
        () =>
          document
            .getElementById(`technical-sheet-step-duration-${invalidStepDurationIndex}`)
            ?.focus(),
        0,
      );
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const payload = recipePayloadForSave(form, !editingRecipe ? reviewingImportDocumentId : null);
      const savedRecipeName = form.name.trim();
      const savedRecipe = editingRecipe
        ? await api.updateTechnicalSheetRecipe(token, editingRecipe.id, payload)
        : await api.createTechnicalSheetRecipe(token, payload);
      const restoredFromArchive = savedRecipe.restoredFromArchive === true;
      if (
        reviewingKokkiPricing &&
        (reviewingKokkiPricing.targetSellingPriceExclTax != null ||
          reviewingKokkiPricing.targetSellingPriceInclTax != null)
      ) {
        await api.updateTechnicalSheetRecipePricing(token, savedRecipe.id, reviewingKokkiPricing);
        setReviewingKokkiPricing(null);
      }
      if (reviewingKokkiDraftId) {
        await api
          .markTechnicalSheetAssistantDraftApplied(token, reviewingKokkiDraftId)
          .catch(() => undefined);
        setReviewingKokkiDraftId(null);
      }
      let nextImport: TechnicalSheetRecipeImportStatus | undefined;
      let remainingReadyCount = 0;
      if (reviewingImportDocumentId) {
        const completedDocumentId = reviewingImportDocumentId;
        setReviewingImportDocumentId(null);
        const refreshedStatuses = (await refreshImportStatuses()).filter(
          (status) => status.document.id !== completedDocumentId,
        );
        setImportStatuses(refreshedStatuses);
        const remainingReady = refreshedStatuses.filter(
          (status) => status.state === 'vérifier' && status.result,
        );
        nextImport = remainingReady[0];
        remainingReadyCount = remainingReady.length;
      }
      const refreshedProducts = await api.allProducts(token).catch(() => undefined);
      if (refreshedProducts) setAvailableProducts(refreshedProducts);
      await load();
      if (nextImport) {
        showImportedRecipe(nextImport, false);
        setSuccess(
          `Fiche « ${savedRecipeName} » ${restoredFromArchive ? 'réactivée à partir de sa version archivée' : 'créée'}. La fiche suivante est prête à être vérifiée (${remainingReadyCount} restante${remainingReadyCount > 1 ? 's' : ''}).`,
        );
      } else {
        setRecipeDialog(false);
        setSuccess(
          editingRecipe
            ? 'Fiche technique mise à jour.'
            : restoredFromArchive
              ? 'Fiche technique archivée réactivée avec le nouvel import.'
              : 'Fiche technique créée.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setLoading(false);
    }
  }

  function closeOnboarding() {
    setOnboardingVisible(false);
    onOnboardingClose?.();
  }

  async function completeOnboardingCategories(names: string[]) {
    setLoading(true);
    setError(undefined);
    try {
      const next = await api.completeTechnicalSheetsOnboardingCategories(token, names);
      setOnboarding(next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création des catégories recettes impossible.');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  function startFirstRecipe(mode: 'ocr' | 'manual') {
    closeOnboarding();
    queueFirstRecipeAction(mode);
  }

  function queueFirstRecipeAction(mode: 'ocr' | 'manual') {
    sessionStorage.setItem(TECHNICAL_SHEETS_PENDING_RECIPE_ACTION_KEY, mode);
    setPendingFirstRecipeAction(mode);
    onNavigate('recipes');
  }

  async function createCategory() {
    if (!categoryName.trim()) return;
    setError(undefined);
    try {
      await api.createTechnicalSheetCategory(token, {
        name: categoryName.trim(),
        description: categoryDescription.trim() || undefined,
      });
      setCategoryName('');
      setCategoryDescription('');
      setCategoryCreationTourOpen(false);
      setSuccess('Catégorie créée. Vous pouvez maintenant créer une fiche technique.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création de la catégorie impossible.');
    }
  }

  function openCategoryReassignment() {
    if (!activeCategories.length) {
      setError('Créez d’abord une catégorie afin de pouvoir réaffecter les fiches techniques.');
      onNavigate('categories');
      return;
    }
    setCategoryReassignmentTotal(recipesWithoutActiveCategory.length);
    setCategoryReassignmentOpen(true);
  }

  async function reassignRecipeCategory(recipeId: string, categoryId: string) {
    setError(undefined);
    const remainingBeforeSave = recipesWithoutActiveCategory.length;
    const updated = await api.reassignTechnicalSheetRecipeCategory(token, recipeId, categoryId);
    setRecipes((current) => current.map((recipe) => (recipe.id === recipeId ? updated : recipe)));
    if (remainingBeforeSave === 1) {
      setCategoryReassignmentOpen(false);
      setSuccess('Toutes les fiches techniques ont été réaffectées à une catégorie active.');
    }
  }

  async function deleteCategory(id: string) {
    const category = categories.find((item) => item.id === id);
    if (!category) return;
    const affectedRecipes = recipes.filter(
      (recipe) => !isArchived(recipe) && recipe.categoryId === category.id,
    );
    const warning = affectedRecipes.length
      ? ` ${affectedRecipes.length} fiche${affectedRecipes.length > 1 ? 's' : ''} technique${affectedRecipes.length > 1 ? 's' : ''} devront ensuite être réaffectée${affectedRecipes.length > 1 ? 's' : ''}.`
      : '';
    if (!window.confirm(`Supprimer la catégorie « ${category.name} » ?${warning}`)) return;
    try {
      await api.archiveTechnicalSheetCategory(token, id);
      setSuccess(
        affectedRecipes.length
          ? `Catégorie supprimée. ${affectedRecipes.length} fiche${affectedRecipes.length > 1 ? 's sont' : ' est'} maintenant à réaffecter.`
          : 'Catégorie supprimée.',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression de la catégorie impossible.');
    }
  }

  async function deleteRecipe(recipe: TechnicalSheetRecipe) {
    if (
      !window.confirm(
        `Supprimer définitivement « ${recipe.name} » ? Cette action effacera la fiche, ses ingrédients, ses étapes et son historique. Elle est irréversible.`,
      )
    )
      return;
    setError(undefined);
    try {
      await api.deleteTechnicalSheetRecipe(token, recipe.id);
      setSuccess(`La fiche « ${recipe.name} » a été supprimée définitivement.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression de la fiche impossible.');
    }
  }

  async function exportRecipePdf(recipe: TechnicalSheetRecipe) {
    setError(undefined);
    try {
      const file = await api.exportTechnicalSheetRecipePdf(token, recipe.id, activeLanguage());
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      setSuccess(`La fiche « ${recipe.name} » a été exportée en PDF.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export de la fiche impossible.');
    }
  }

  async function duplicateRecipe() {
    if (!duplicateOpen) return;
    await api.duplicateTechnicalSheetRecipe(token, duplicateOpen.id, {
      name: duplicateName.trim() || `${duplicateOpen.name} – copie`,
      copyGeneral: true,
      copyPhoto: true,
      copyIngredients: true,
      copySteps: true,
      copyCategory: true,
    });
    setDuplicateOpen(null);
    setDuplicateName('');
    setSuccess('Variante créée en brouillon.');
    await load();
  }

  async function updateRecipePricing(
    recipeId: string,
    payload: {
      targetSellingPriceExclTax?: number | null;
      targetSellingPriceInclTax?: number | null;
    },
  ) {
    setError(undefined);
    const updated = await api.updateTechnicalSheetRecipePricing(token, recipeId, payload);
    setRecipes((current) => current.map((recipe) => (recipe.id === recipeId ? updated : recipe)));
    return updated;
  }

  async function submitRecipeImports() {
    if (!importFiles.length) return;
    setImportSubmitting(true);
    setError(undefined);
    try {
      const response = await api.uploadTechnicalSheetRecipeImports(token, importFiles);
      setImportStatuses(response.statuses ?? []);
      setImportFiles([]);
      setSuccess(
        `${response.statuses.length} fiche${response.statuses.length > 1 ? 's' : ''} envoyée${response.statuses.length > 1 ? 's' : ''} en analyse. Le traitement continue pendant votre navigation.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import des fiches techniques impossible.');
    } finally {
      setImportSubmitting(false);
    }
  }

  async function retryFailedRecipeImports() {
    if (retryingFailedImports) return;
    setRetryingFailedImports(true);
    setError(undefined);
    try {
      const response = await api.retryFailedTechnicalSheetRecipeImports(token);
      const replacements = new Map(
        (response.statuses ?? []).map((status) => [status.document.id, status]),
      );
      setImportStatuses((current) =>
        current.map((status) => replacements.get(status.document.id) ?? status),
      );
      if (response.retried) {
        setSuccess(
          `${response.retried} analyse${response.retried > 1 ? 's' : ''} OCR relancée${response.retried > 1 ? 's' : ''}.`,
        );
      } else {
        setSuccess('Aucune analyse OCR en erreur à relancer.');
        await refreshImportStatuses();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relance des analyses OCR impossible.');
    } finally {
      setRetryingFailedImports(false);
    }
  }

  async function dismissRecipeImport(documentId: string) {
    if (removingImportDocumentIds.includes(documentId)) return;
    setRemovingImportDocumentIds((current) => [...current, documentId]);
    setError(undefined);
    try {
      await api.dismissTechnicalSheetRecipeImport(token, documentId);
      setImportStatuses((current) => current.filter((status) => status.document.id !== documentId));
      setSuccess('Analyse OCR retirée du suivi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression du suivi OCR impossible.');
    } finally {
      setRemovingImportDocumentIds((current) => current.filter((id) => id !== documentId));
    }
  }

  function showImportedRecipe(status: TechnicalSheetRecipeImportStatus, announce = true) {
    const result = status.result;
    if (!result) return;
    if (!requireActiveCategory()) return;
    setEditingRecipe(null);
    setReviewingImportDocumentId(status.document.id);
    setReviewingKokkiDraftId(null);
    setReviewingKokkiPricing(null);
    setForm({
      ...emptyRecipe,
      ...result.payload,
      mode: result.payload.mode ?? 'PRODUCTION',
      stockPolicy: 'MAKE_TO_STOCK',
      importDocumentId: status.document.id,
      categoryId:
        result.payload.categoryId || categories.find((category) => !isArchived(category))?.id || '',
      ingredients: result.payload.ingredients ?? [],
      steps: result.payload.steps ?? [],
    });
    setImportOpen(false);
    setRecipeDialog(true);
    if (announce) {
      const matchedSubRecipes = result.matchedSubRecipesCount
        ? ` ${result.matchedSubRecipesCount} sous-recette(s) reconnue(s).`
        : '';
      const created = result.newProductsCount
        ? ` ${result.newProductsCount} nouveau(x) produit(s) Stocks seront créés avec la fiche.`
        : '';
      const unresolved = result.unresolvedIngredientsCount
        ? ` ${result.unresolvedIngredientsCount} ingrédient(s) doivent être vérifiés avant l’enregistrement.`
        : '';
      const skipped = result.skippedIngredientsCount
        ? ` ${result.skippedIngredientsCount} ingrédient(s) restent à saisir.`
        : '';
      setSuccess(
        `Analyse prête : ${result.matchedIngredientsCount} ingrédient(s) rapproché(s) avec Stocks.${matchedSubRecipes}${created}${unresolved}${skipped}`,
      );
    }
  }

  function openImportedRecipe(status: TechnicalSheetRecipeImportStatus) {
    showImportedRecipe(status, true);
  }

  function openKokkiDraft(draft: any) {
    const target = draft.targetTechnicalSheetId
      ? (recipes.find((recipe) => recipe.id === draft.targetTechnicalSheetId) ?? null)
      : null;
    if (!target && !requireActiveCategory()) return;
    setReviewingImportDocumentId(null);
    setReviewingKokkiDraftId(draft.id);
    setReviewingKokkiPricing({
      targetSellingPriceExclTax: draft.payload?.targetSellingPriceExclTax ?? null,
      targetSellingPriceInclTax: draft.payload?.targetSellingPriceInclTax ?? null,
    });
    setEditingRecipe(target);
    setForm({
      ...emptyRecipe,
      ...draft.payload,
      ingredients: draft.payload?.ingredients ?? [],
      steps: draft.payload?.steps ?? [],
    });
    setKokkiOpen(false);
    setRecipeDialog(true);
  }

  if (!stocksInstalled) {
    return <BlockingState onInstallStocks={() => onNavigate('dashboard')} />;
  }

  return (
    <div
      className="technical-sheets-shell"
      style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}
    >
      <motion.section
        className="welcome-hero theme-emerald technical-sheets-dashboard-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="technical-sheets-dashboard-hero-copy">
          <span className="welcome-tag">
            <ChefHat size={14} /> Fiches Techniques
          </span>
          <h1 className="welcome-title">Fiches Techniques</h1>
          <p className="welcome-desc">
            Centralisez et maîtrisez l’ensemble de vos préparations culinaires, avec des
            ingrédients, unités et prix d'achat directement synchronisés avec vos Stocks.
          </p>
        </div>
        <div className="technical-sheets-dashboard-hero-actions toquehub-hero-actions">
          <button
            type="button"
            className="btn btn-secondary btn-outline"
            onClick={() => setOnboardingVisible(true)}
          >
            <Sparkles size={16} /> Guide de configuration
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate('recipes')}
          >
            <Plus size={16} /> Ajouter une fiche technique
          </button>
        </div>
      </motion.section>

      <TechnicalSheetAssistantPanel
        token={token}
        isOpen={kokkiOpen}
        onClose={() => setKokkiOpen(false)}
        onOpenDraft={openKokkiDraft}
      />

      {error ? (
        <div className="alert-modern error">
          <AlertCircle size={18} />
          <div>{error}</div>
          <button className="alert-dismiss" onClick={() => setError(undefined)}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      {success ? (
        <div className="alert-modern success">
          <CheckCircle2 size={18} />
          <div>{success}</div>
          <button className="alert-dismiss" onClick={() => setSuccess(undefined)}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div className="technical-sheets-tabs-row">
        <div className="hr-tabs technical-sheets-tabs">
          {(
            [
              ['dashboard', 'Tableau de bord'],
              ['recipes', 'Fiches techniques'],
              ['categories', 'Catégories recettes'],
              ['costs', 'Coûts'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? 'active' : ''}
              onClick={() => onNavigate(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'recipes' ? (
          <div className="technical-sheets-list-actions">
            <button className="btn btn-primary" onClick={() => openRecipe()}>
              <Plus size={16} /> Créer une fiche
            </button>
            <button className="btn btn-secondary" onClick={() => setImportOpen(true)}>
              <Upload size={16} /> Importer des fiches
            </button>
          </div>
        ) : null}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'dashboard' && (
            <DashboardTab
              dashboard={dashboard}
              recipes={recipes}
              recipesWithoutActiveCategory={recipesWithoutActiveCategory}
              onOpenRecipes={() => onNavigate('recipes')}
              onRectifyCategories={openCategoryReassignment}
            />
          )}
          {tab === 'recipes' && (
            <RecipesTab
              recipes={recipes}
              categories={categories.filter((category) => !isArchived(category))}
              search={search}
              categoryFilter={categoryFilter}
              statusFilter={statusFilter}
              onSearch={setSearch}
              onCategoryFilter={setCategoryFilter}
              onStatusFilter={setStatusFilter}
              onClearFilters={() => {
                setSearch('');
                setCategoryFilter('');
                setStatusFilter('');
              }}
              importStatuses={importStatuses}
              onImport={() => setImportOpen(true)}
              onOpenImportedRecipe={openImportedRecipe}
              onEdit={openRecipe}
              onDelete={deleteRecipe}
              onExport={exportRecipePdf}
              onDuplicate={(recipe) => {
                if (!requireActiveCategory()) return;
                setDuplicateOpen(recipe);
                setDuplicateName(`${recipe.name} – variante`);
              }}
            />
          )}
          {tab === 'categories' && (
            <ReferencesTab
              title="Catégories recettes"
              icon={<ClipboardList size={18} />}
              items={activeCategories}
              recipesWithoutActiveCategory={recipesWithoutActiveCategory}
              name={categoryName}
              description={categoryDescription}
              onName={setCategoryName}
              onDescription={setCategoryDescription}
              onCreate={createCategory}
              onArchive={deleteCategory}
              onRectify={openCategoryReassignment}
            />
          )}
          {tab === 'costs' && (
            <CostsTab
              recipes={recipes}
              categories={categories.filter((category) => !isArchived(category))}
              salesTaxPolicy={salesTaxPolicy}
              onSavePricing={updateRecipePricing}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {onboardingVisible ? (
        <TechnicalSheetsOnboardingWizard
          onboarding={onboarding}
          categories={categories.filter((category) => !isArchived(category))}
          onCreateCategories={completeOnboardingCategories}
          onImport={() => startFirstRecipe('ocr')}
          onManual={() => startFirstRecipe('manual')}
          onClose={closeOnboarding}
        />
      ) : null}

      {categoryCreationTourOpen ? (
        <TechnicalSheetCategoryCreationTour onClose={() => setCategoryCreationTourOpen(false)} />
      ) : null}

      {/* Create / Edit Dialog Component */}
      <RecipeDialog
        open={recipeDialog}
        form={form}
        setForm={setForm}
        products={activeProducts}
        units={units}
        recipes={recipes}
        categories={categories.filter((cat) => !isArchived(cat))}
        editing={Boolean(editingRecipe)}
        editingRecipeId={editingRecipe?.id}
        onClose={() => {
          setRecipeDialog(false);
          setReviewingImportDocumentId(null);
        }}
        onSave={saveRecipe}
        loading={loading}
      />

      <Modal
        isOpen={categoryReassignmentOpen && Boolean(recipesWithoutActiveCategory.length)}
        onClose={() => setCategoryReassignmentOpen(false)}
        title="Réaffecter les catégories"
      >
        {recipesWithoutActiveCategory[0] ? (
          <CategoryReassignmentPanel
            recipe={recipesWithoutActiveCategory[0]}
            categories={activeCategories}
            remaining={recipesWithoutActiveCategory.length}
            total={Math.max(categoryReassignmentTotal, recipesWithoutActiveCategory.length)}
            onSave={reassignRecipeCategory}
            onCancel={() => setCategoryReassignmentOpen(false)}
          />
        ) : null}
      </Modal>

      <Modal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importer une ou plusieurs fiches techniques"
      >
        <RecipeImportPanel
          files={importFiles}
          statuses={importStatuses}
          submitting={importSubmitting}
          retryingFailed={retryingFailedImports}
          removingDocumentIds={removingImportDocumentIds}
          onFiles={setImportFiles}
          onSubmit={submitRecipeImports}
          onRetryFailed={retryFailedRecipeImports}
          onRemoveStatus={dismissRecipeImport}
          onOpenResult={openImportedRecipe}
        />
      </Modal>

      {/* Duplicate Dialog Component */}
      <Modal
        isOpen={Boolean(duplicateOpen)}
        onClose={() => setDuplicateOpen(null)}
        title="Dupliquer une fiche technique"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              fontSize: '0.88rem',
              fontWeight: 600,
            }}
          >
            Nom de la variante
            <input
              value={duplicateName}
              onChange={(event) => setDuplicateName(event.target.value)}
              placeholder="ex: Potimarron velouté - Copie"
              autoFocus
            />
          </label>
          <div
            className="alert-modern info"
            style={{ fontSize: '0.82rem', margin: 0, borderRadius: '8px' }}
          >
            La copie reprend les informations générales, la photo, les ingrédients, les étapes et la
            catégorie, puis repart à l'état de brouillon.
          </div>
          <div
            className="modal-footer"
            style={{
              margin: '1rem -1.5rem -1.5rem',
              padding: '1rem 1.5rem',
              background: '#f8fafc',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDuplicateOpen(null)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={duplicateRecipe}
              disabled={!duplicateName.trim()}
            >
              Dupliquer la fiche
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const TECHNICAL_SHEET_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  Entrées: 'Préparations servies en début de repas.',
  Plats: 'Recettes principales et plats complets.',
  Desserts: 'Desserts à l’assiette et préparations sucrées.',
  Sauces: 'Sauces, jus, coulis et bases d’accompagnement.',
  Bases: 'Fonds, appareils et préparations intermédiaires réutilisables.',
  Crèmes: 'Crèmes salées ou sucrées et garnitures.',
  Mousses: 'Mousses salées, sucrées et textures aérées.',
  Accompagnements: 'Garnitures et préparations complémentaires.',
  'Petit-déjeuner': 'Préparations pour le service du matin.',
  Pâtisserie: 'Gâteaux, entremets et préparations pâtissières.',
  Boulangerie: 'Pains, viennoiseries et pâtes levées.',
  Boissons: 'Boissons préparées et recettes liquides.',
  Cocktails: 'Cocktails alcoolisés et assemblages de bar.',
  'Cocktails sans alcool': 'Mocktails, jus composés et boissons sans alcool.',
  'Cafés et boissons chaudes': 'Cafés, chocolats, thés et boissons chaudes.',
  'Sirops et infusions': 'Sirops maison, infusions et bases de boissons.',
};

function TechnicalSheetsIllustration() {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
      <div
        className="card-modern"
        style={{
          background: '#0f172a',
          color: 'white',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0 30px 60px rgba(9, 13, 22, 0.25)',
          padding: '1.5rem',
          borderRadius: '20px',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Structure des Recettes</span>
            <span
              className="badge badge-reception"
              style={{
                fontSize: '0.72rem',
                textTransform: 'none',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#10b981',
                borderColor: 'transparent',
              }}
            >
              Prêt
            </span>
          </div>

          {[
            { label: 'Catégories de recettes', val: 100, color: '#10b981' },
            { label: 'Coût matière & Ingrédients', val: 100, color: '#3b82f6' },
            { label: 'Fiches techniques créées', val: 100, color: '#f59e0b' },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.03)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{item.label}</span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Actif</span>
              </div>
              <div
                className="progress-bar-bg"
                style={{ height: '5px', background: 'rgba(255, 255, 255, 0.1)' }}
              >
                <div
                  className="progress-bar-fill"
                  style={{ width: `${item.val}%`, background: item.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TechnicalSheetsOnboardingWelcome({
  onNext,
  onClose,
}: {
  onNext: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: '3rem',
        alignItems: 'center',
        padding: '3.5rem 3rem',
        height: '100%',
        flexGrow: 1,
        position: 'relative',
      }}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.5rem',
            right: '1.5rem',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.5rem',
            borderRadius: '50%',
            transition: 'background 0.2s',
            zIndex: 10,
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#f1f5f9')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          aria-label="Fermer"
        >
          <X size={20} />
        </button>
      )}
      <div>
        <span
          className="badge badge-reception"
          style={{
            marginBottom: '1.25rem',
            display: 'inline-flex',
            fontSize: '0.8rem',
            gap: '0.35rem',
            border: '1px solid var(--light-border)',
            background: 'rgba(255,255,255,0.7)',
            textTransform: 'none',
          }}
        >
          <Sparkles size={14} color="#10b981" /> Configuration Guidée
        </span>
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: '-0.04em',
            marginBottom: '1.5rem',
            color: 'var(--text-main)',
          }}
        >
          Bienvenue sur le module <span style={{ color: '#10b981' }}>Fiches Techniques</span>
        </h1>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.98rem',
            lineHeight: 1.6,
            marginBottom: '2rem',
          }}
        >
          Sélectionnez les catégories adaptées à votre établissement, puis créez votre première
          recette manuellement ou à partir de l’import OCR déjà intégré.
        </p>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.9rem',
              color: 'var(--text-main)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                flexShrink: 0,
              }}
            >
              <ClipboardList size={16} />
            </div>
            <span>Choisir vos catégories recettes</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.9rem',
              color: 'var(--text-main)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                flexShrink: 0,
              }}
            >
              <Upload size={16} />
            </div>
            <span>Importer une ou plusieurs fiches par OCR</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.9rem',
              color: 'var(--text-main)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.1)',
                color: '#f59e0b',
                flexShrink: 0,
              }}
            >
              <FileText size={16} />
            </div>
            <span>Créer votre première fiche manuellement</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={onNext}
            style={{ padding: '0.8rem 1.5rem', fontSize: '0.92rem' }}
          >
            Démarrer la configuration <ArrowRight size={18} />
          </button>
          {onClose && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: '0.8rem 1.5rem', fontSize: '0.92rem' }}
            >
              Faire plus tard
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <TechnicalSheetsIllustration />
      </div>
    </div>
  );
}

function TechnicalSheetsOnboardingAside({
  step,
  categoryCount,
  recipeCount,
}: {
  step: 'categories' | 'recipe';
  categoryCount: number;
  recipeCount: number;
}) {
  const steps = [
    { key: 'welcome', label: 'Bienvenue' },
    { key: 'categories', label: 'Catégories recettes' },
    { key: 'recipe', label: 'Première recette' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        height: '100%',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ChefHat size={28} color="#10b981" />
          <span
            style={{
              fontWeight: 850,
              fontSize: '1.2rem',
              color: 'white',
              letterSpacing: '-0.03em',
            }}
          >
            TOQUE<span style={{ color: '#10b981' }}>HUB</span> RECETTES
          </span>
        </div>

        <div>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: '#10b981',
              letterSpacing: '0.15em',
            }}
          >
            Installation guidée
          </span>
          <h3
            style={{
              color: 'white',
              fontSize: '1.35rem',
              marginTop: '0.3rem',
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            Assistant Fiches Techniques
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {steps.map((item, idx) => {
            const isPast = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            return (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                  color: isPast || isCurrent ? 'white' : 'rgba(255, 255, 255, 0.35)',
                  fontWeight: isCurrent ? 700 : 500,
                  fontSize: '0.9rem',
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isPast
                      ? '#10b981'
                      : isCurrent
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(255, 255, 255, 0.05)',
                    border: isCurrent ? '1.5px solid #10b981' : '1px solid transparent',
                    color: isPast ? 'white' : isCurrent ? '#10b981' : 'inherit',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                  }}
                >
                  {isPast ? '✓' : idx + 1}
                </div>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div
          style={{
            padding: '1rem',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <span
            style={{
              color: '#94a3b8',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              fontWeight: 800,
              letterSpacing: '0.05em',
            }}
          >
            Statut initial
          </span>
          <div style={{ color: 'white', fontSize: '1rem', fontWeight: 800, marginTop: '0.2rem' }}>
            Prêt pour démarrer
          </div>
          <p
            style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', lineHeight: 1.4 }}
          >
            {categoryCount} catégorie(s), {recipeCount} recette(s)
          </p>
        </div>

        <div
          style={{
            padding: '1.25rem',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <ShieldCheck size={20} color="#10b981" style={{ marginBottom: '0.4rem' }} />
          <h4 style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700 }}>
            Référentiel partagé
          </h4>
          <p
            style={{
              color: '#94a3b8',
              fontSize: '0.75rem',
              marginTop: '0.25rem',
              lineHeight: 1.45,
            }}
          >
            Les ingrédients, unités et prix d’achat viennent toujours du module Stocks.
          </p>
        </div>
      </div>
    </div>
  );
}

function TechnicalSheetsOnboardingWizard({
  onboarding,
  categories,
  onCreateCategories,
  onImport,
  onManual,
  onClose,
}: {
  onboarding?: TechnicalSheetOnboarding;
  categories: TechnicalSheetCategory[];
  onCreateCategories: (names: string[]) => Promise<void>;
  onImport: () => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'welcome' | 'categories' | 'recipe'>('welcome');
  const existingNames = useMemo(
    () => new Set(categories.map((category) => category.name.trim().toLowerCase())),
    [categories],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(onboarding?.selectedCategoryNames ?? categories.map((category) => category.name)),
  );
  const [customName, setCustomName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const suggestions = onboarding?.suggestedCategories?.length
    ? onboarding.suggestedCategories
    : Object.keys(TECHNICAL_SHEET_CATEGORY_DESCRIPTIONS);
  const canAddCustom =
    Boolean(customName.trim()) &&
    ![...selected, ...suggestions].some(
      (candidate) => candidate.toLowerCase() === customName.trim().toLowerCase(),
    );
  const stepIndex = step === 'welcome' ? 1 : step === 'categories' ? 2 : 3;
  const progress = Math.round((stepIndex / 3) * 100);

  useEffect(() => {
    if (!onboarding?.selectedCategoryNames?.length) return;
    setSelected((current) => new Set([...current, ...onboarding.selectedCategoryNames]));
  }, [onboarding?.selectedCategoryNames?.join('|')]);

  function toggle(name: string) {
    if (existingNames.has(name.toLowerCase())) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    if (
      [...selected, ...suggestions].some(
        (candidate) => candidate.toLowerCase() === name.toLowerCase(),
      )
    )
      return;
    setSelected((current) => new Set([...current, name]));
    setCustomName('');
  }

  async function submitCategories() {
    if (!selected.size) return;
    setSubmitting(true);
    setLocalError(undefined);
    try {
      await onCreateCategories([...selected]);
      setStep('recipe');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Création des catégories impossible.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-overlay hr-wizard-overlay technical-sheets-onboarding-overlay"
      style={{
        background:
          'radial-gradient(circle at 10% 20%, rgba(16, 185, 129, 0.15) 0%, transparent 55%), radial-gradient(circle at 90% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%), rgba(15, 23, 42, 0.55)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '2rem 1.5rem',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Decorative Blur Spheres */}
      <div
        style={{
          position: 'absolute',
          width: '560px',
          height: '560px',
          borderRadius: '50%',
          background: 'rgba(16, 185, 129, 0.05)',
          filter: 'blur(100px)',
          right: '-180px',
          top: '-180px',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '420px',
          height: '420px',
          borderRadius: '50%',
          background: 'rgba(59, 130, 246, 0.05)',
          filter: 'blur(80px)',
          left: '-160px',
          bottom: '20px',
          pointerEvents: 'none',
        }}
      />

      <motion.div
        className="modal-card hr-wizard-modal technical-sheets-onboarding-modal"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 24, stiffness: 220 }}
        style={{
          width: '100%',
          maxWidth: step === 'welcome' ? '920px' : '1080px',
          height: 'min(720px, calc(100vh - 4rem))',
          padding: 0,
          borderRadius: '24px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'white',
          boxShadow: '0 30px 80px rgba(9, 13, 22, 0.08)',
          border: 'none',
          zIndex: 10,
        }}
      >
        {step === 'welcome' ? (
          <TechnicalSheetsOnboardingWelcome
            onNext={() => setStep('categories')}
            onClose={onClose}
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.1fr 2fr',
              height: '100%',
              width: '100%',
              minHeight: 0,
              flexGrow: 1,
            }}
          >
            {/* Sidebar */}
            <div
              style={{
                background: '#0f172a',
                color: 'white',
                padding: '2.5rem 2rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                minHeight: 0,
              }}
            >
              <TechnicalSheetsOnboardingAside
                step={step}
                categoryCount={categories.length}
                recipeCount={onboarding?.completed ? 1 : 0}
              />
            </div>

            {/* Main Content Area */}
            <div
              style={{
                padding: '2.5rem',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'auto',
                minHeight: 0,
                justifyContent: 'space-between',
              }}
            >
              {/* Stepper Progress bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.5rem',
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                <div
                  style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column', flexGrow: 1 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      className="badge badge-reception"
                      style={{
                        background: 'rgba(16, 185, 129, 0.08)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.15)',
                        textTransform: 'none',
                        fontSize: '0.8rem',
                      }}
                    >
                      Étape {stepIndex} / 3
                    </span>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                        marginRight: '2.5rem',
                      }}
                    >
                      {Math.round(progress)}%
                    </span>
                  </div>
                  <div
                    className="progress-bar-bg"
                    style={{
                      height: '6px',
                      background: '#f1f5f9',
                      borderRadius: '3px',
                      overflow: 'hidden',
                      marginRight: '2.5rem',
                    }}
                  >
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: '#10b981',
                        borderRadius: '3px',
                      }}
                    ></div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.5rem',
                    borderRadius: '50%',
                    transition: 'background 0.2s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  aria-label="Fermer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Step rendering with AnimatePresence */}
              <div
                style={{
                  flexGrow: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  justifyContent: 'space-between',
                }}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.16 }}
                    style={{
                      flexGrow: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                      justifyContent: 'space-between',
                    }}
                  >
                    {step === 'categories' ? (
                      <div
                        className="hr-catalog technical-sheets-category-step"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          height: '100%',
                          minHeight: 0,
                          justifyContent: 'space-between',
                        }}
                      >
                        <div
                          className="hr-catalog-scroll"
                          style={{ overflow: 'auto', flex: 1, paddingRight: '0.25rem' }}
                        >
                          <h2
                            style={{
                              fontSize: '1.5rem',
                              fontWeight: 800,
                              color: 'var(--text-main)',
                              margin: '0 0 0.35rem',
                            }}
                          >
                            Choisissez vos catégories recettes
                          </h2>
                          <p className="muted" style={{ marginBottom: 16, fontSize: '0.9rem' }}>
                            Cochez uniquement les familles utiles. Elles resteront modifiables
                            depuis l’onglet Catégories recettes.
                          </p>
                          {localError ? (
                            <div className="alert-modern error" style={{ marginBottom: '1rem' }}>
                              <AlertCircle size={16} /> {localError}
                            </div>
                          ) : null}

                          <div
                            className="hr-catalog-grid"
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                              gap: '0.75rem',
                              marginBottom: '1.25rem',
                            }}
                          >
                            {suggestions.map((name) => {
                              const isSelected =
                                selected.has(name) ||
                                [...selected].some(
                                  (selectedName) =>
                                    selectedName.toLowerCase() === name.toLowerCase(),
                                );
                              const exists = existingNames.has(name.toLowerCase());
                              return (
                                <button
                                  type="button"
                                  key={name}
                                  className={`hr-catalog-card ${isSelected ? 'selected' : ''}`}
                                  onClick={() => toggle(name)}
                                  aria-pressed={isSelected}
                                  style={{
                                    border: isSelected ? '2px solid #10b981' : '1px solid #e2e8f0',
                                    borderRadius: '16px',
                                    padding: '1.25rem',
                                    background: isSelected ? 'rgba(16, 185, 129, 0.04)' : 'white',
                                    boxShadow: isSelected
                                      ? '0 10px 25px rgba(16,185,129,0.06)'
                                      : '0 2px 4px rgba(0,0,0,0.02)',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.75rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <div
                                    className="hr-catalog-check"
                                    style={{
                                      background: isSelected ? '#10b981' : '#f1f5f9',
                                      color: isSelected ? 'white' : 'transparent',
                                      borderRadius: '8px',
                                      width: '24px',
                                      height: '24px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      border: isSelected ? 'none' : '2px solid #cbd5e1',
                                      flexShrink: 0,
                                      marginTop: '2px',
                                    }}
                                  >
                                    {isSelected ? <Check size={14} strokeWidth={3} /> : null}
                                  </div>
                                  <div
                                    className="hr-catalog-body"
                                    style={{
                                      textAlign: 'left',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '0.25rem',
                                    }}
                                  >
                                    <strong
                                      style={{
                                        fontSize: '0.95rem',
                                        color: '#1e293b',
                                        fontWeight: 700,
                                      }}
                                    >
                                      {name}
                                    </strong>
                                    <span
                                      style={{
                                        fontSize: '0.82rem',
                                        color: '#64748b',
                                        lineHeight: 1.35,
                                      }}
                                    >
                                      {TECHNICAL_SHEET_CATEGORY_DESCRIPTIONS[name] ??
                                        'Catégorie personnalisable pour vos recettes.'}
                                    </span>
                                    {exists ? (
                                      <small
                                        style={{
                                          fontSize: '0.75rem',
                                          color: '#94a3b8',
                                          marginTop: '0.25rem',
                                        }}
                                      >
                                        Déjà créée
                                      </small>
                                    ) : null}
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          <div
                            className="hr-catalog-custom"
                            style={{
                              display: 'flex',
                              gap: '0.5rem',
                              marginBottom: '1rem',
                              marginTop: '1.25rem',
                            }}
                          >
                            <input
                              placeholder="Ajouter une catégorie personnalisée…"
                              value={customName}
                              onChange={(event) => setCustomName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  addCustom();
                                }
                              }}
                              style={{
                                borderRadius: '10px',
                                height: '44px',
                                border: '1px solid #cbd5e1',
                                padding: '0 0.75rem',
                                flex: 1,
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={!canAddCustom}
                              onClick={addCustom}
                              style={{ height: '44px', borderRadius: '10px' }}
                            >
                              Ajouter
                            </button>
                          </div>
                        </div>

                        <div
                          className="hr-catalog-actions"
                          style={{
                            borderTop: '1px solid #eef2f7',
                            background: 'rgba(255,255,255,0.9)',
                            padding: '1rem 0 0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>
                            {selected.size} catégorie{selected.size > 1 ? 's' : ''} sélectionnée
                            {selected.size > 1 ? 's' : ''}
                          </span>
                          <div className="row-actions" style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setStep('welcome')}
                              style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}
                            >
                              Retour
                            </button>
                            <button
                              className="btn btn-primary"
                              disabled={!selected.size || submitting}
                              onClick={() => void submitCategories()}
                              style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}
                            >
                              {submitting ? 'Création…' : 'Valider les catégories'}{' '}
                              <ArrowRight size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1.25rem',
                          height: '100%',
                          minHeight: 0,
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          <div>
                            <h2
                              style={{
                                fontSize: '1.5rem',
                                fontWeight: 800,
                                color: 'var(--text-main)',
                                margin: 0,
                              }}
                            >
                              {onboarding?.completed
                                ? 'Votre référentiel contient déjà une recette'
                                : 'Créez votre première recette'}
                            </h2>
                            <p
                              style={{
                                color: 'var(--text-muted)',
                                fontSize: '0.92rem',
                                marginTop: '0.35rem',
                                lineHeight: 1.5,
                              }}
                            >
                              Choisissez le parcours adapté. Les deux utilisent exactement les
                              écrans et contrôles déjà présents dans le module.
                            </p>
                          </div>

                          <div
                            className="onboarding-options-grid"
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '1rem',
                              marginTop: '2rem',
                            }}
                          >
                            <button
                              type="button"
                              className="onboarding-option-card blue"
                              onClick={onImport}
                            >
                              <div className="onboarding-option-icon">
                                <Upload size={18} />
                              </div>
                              <div className="onboarding-option-content">
                                <span className="onboarding-option-title">Importer avec l'OCR</span>
                                <span className="onboarding-option-desc">
                                  Déposez PDF, images, Pages ou Numbers. Jusqu'à{' '}
                                  {MAX_RECIPE_IMPORT_FILES} fiches peuvent être analysées ensemble.
                                </span>
                                <small
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    marginTop: '0.75rem',
                                    color: '#2563eb',
                                    fontSize: '0.78rem',
                                    fontWeight: 750,
                                  }}
                                >
                                  Ouvrir l’import existant <ArrowRight size={14} />
                                </small>
                              </div>
                            </button>

                            <button
                              type="button"
                              className="onboarding-option-card emerald"
                              onClick={onManual}
                            >
                              <div className="onboarding-option-icon">
                                <FileText size={18} />
                              </div>
                              <div className="onboarding-option-content">
                                <span className="onboarding-option-title">Créer manuellement</span>
                                <span className="onboarding-option-desc">
                                  Renseignez les informations, ingrédients Stocks, quantités et
                                  étapes de préparation.
                                </span>
                                <small
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    marginTop: '0.75rem',
                                    color: '#10b981',
                                    fontSize: '0.78rem',
                                    fontWeight: 750,
                                  }}
                                >
                                  Créer une fiche <ArrowRight size={14} />
                                </small>
                              </div>
                            </button>
                          </div>
                        </div>

                        <div
                          className="hr-catalog-actions sticky"
                          style={{
                            borderTop: '1px solid #eef2f7',
                            background: 'rgba(255,255,255,0.9)',
                            padding: '1rem 0 0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setStep('categories')}
                            style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}
                          >
                            Retour
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}
                          >
                            {onboarding?.completed ? 'Terminer' : 'Faire plus tard'}
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function BlockingState({ onInstallStocks }: { onInstallStocks: () => void }) {
  return (
    <div
      className="card-modern"
      style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '720px', margin: '2rem auto' }}
    >
      <ChefHat size={48} style={{ margin: '0 auto 1.5rem', color: 'var(--primary)' }} />
      <h2
        style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          marginBottom: '1rem',
          color: 'var(--text-main)',
        }}
      >
        Stocks est requis
      </h2>
      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: '0.95rem',
          lineHeight: 1.6,
          marginBottom: '2rem',
        }}
      >
        Les fiches techniques ne créent aucun produit : elles consomment les produits, unités,
        catégories produits, conversions et prix d’achat du module Stocks. Installez ou configurez
        Stocks avant de créer une fiche.
      </p>
      <button className="btn btn-primary" onClick={onInstallStocks}>
        Aller au tableau de bord
      </button>
    </div>
  );
}

function CategoryReassignmentAlert({
  recipes,
  onRectify,
  compact = false,
}: {
  recipes: TechnicalSheetRecipe[];
  onRectify: () => void;
  compact?: boolean;
}) {
  const visibleNames = recipes.slice(0, compact ? 3 : 5).map((recipe) => recipe.name);
  const hiddenCount = recipes.length - visibleNames.length;
  return (
    <motion.div
      className={`technical-sheets-category-alert${compact ? ' compact' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
    >
      <div className="technical-sheets-category-alert-icon">
        <AlertCircle size={20} />
      </div>
      <div className="technical-sheets-category-alert-copy">
        <strong>
          {recipes.length} fiche{recipes.length > 1 ? 's techniques sont' : ' technique est'} à
          réaffecter
        </strong>
        <p>
          {compact ? 'Sans catégorie active : ' : 'Ces fiches n’ont plus de catégorie active : '}
          <span>{visibleNames.join(', ')}</span>
          {hiddenCount > 0 ? ` et ${hiddenCount} autre${hiddenCount > 1 ? 's' : ''}` : ''}.
        </p>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={onRectify}>
        Rectifier
        <ArrowRight size={15} />
      </button>
    </motion.div>
  );
}

function CategoryReassignmentPanel({
  recipe,
  categories,
  remaining,
  total,
  onSave,
  onCancel,
}: {
  recipe: TechnicalSheetRecipe;
  categories: TechnicalSheetCategory[];
  remaining: number;
  total: number;
  onSave: (recipeId: string, categoryId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const currentPosition = Math.max(1, total - remaining + 1);

  useEffect(() => {
    setCategoryId(categories[0]?.id ?? '');
    setLocalError(undefined);
  }, [recipe.id, categories]);

  async function submit() {
    if (!categoryId) {
      setLocalError('Choisissez une catégorie active pour continuer.');
      return;
    }
    setSaving(true);
    setLocalError(undefined);
    try {
      await onSave(recipe.id, categoryId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Réaffectation impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="technical-sheets-reassignment-panel">
      <div
        className="technical-sheets-reassignment-progress"
        aria-label={`Fiche ${currentPosition} sur ${total}`}
      >
        <div>
          <span>Réaffectation en cours</span>
          <strong>
            Fiche {currentPosition} sur {total}
          </strong>
        </div>
        <div className="technical-sheets-reassignment-progress-track">
          <span style={{ width: `${Math.min(100, (currentPosition / total) * 100)}%` }} />
        </div>
      </div>

      <div className="technical-sheets-reassignment-recipe">
        <div className="technical-sheets-reassignment-recipe-visual">
          {recipe.photoUrl || recipe.photoDataUrl ? (
            <img src={recipe.photoUrl || recipe.photoDataUrl} alt="" />
          ) : (
            <ChefHat size={28} />
          )}
        </div>
        <div>
          <span>Fiche technique à corriger</span>
          <h4>{recipe.name}</h4>
          <p>
            Ancienne catégorie : <strong>{recipe.category?.name ?? 'aucune catégorie'}</strong>
          </p>
        </div>
      </div>

      <label className="technical-sheets-reassignment-select">
        <span>Nouvelle catégorie</span>
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          autoFocus
        >
          <option value="">Sélectionner une catégorie</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <small>L’enregistrement ne modifie aucune autre information de la fiche.</small>
      </label>

      {localError ? (
        <div className="alert-modern error technical-sheets-reassignment-error">
          <AlertCircle size={17} /> {localError}
        </div>
      ) : null}

      <div className="technical-sheets-reassignment-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Terminer plus tard
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={saving || !categoryId}
        >
          {saving ? (
            <>
              <RefreshCw size={16} className="spin" /> Enregistrement…
            </>
          ) : remaining === 1 ? (
            <>
              <Check size={16} /> Enregistrer et terminer
            </>
          ) : (
            <>
              Enregistrer et suivant <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function DashboardTab({
  dashboard,
  recipes,
  recipesWithoutActiveCategory,
  onOpenRecipes,
  onRectifyCategories,
}: {
  dashboard?: TechnicalSheetDashboard;
  recipes: TechnicalSheetRecipe[];
  recipesWithoutActiveCategory: TechnicalSheetRecipe[];
  onOpenRecipes: () => void;
  onRectifyCategories: () => void;
}) {
  const latest = dashboard?.latestRecipes ?? recipes.slice(0, 5);
  const topProducts = dashboard?.topProducts ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {recipesWithoutActiveCategory.length ? (
        <CategoryReassignmentAlert
          recipes={recipesWithoutActiveCategory}
          onRectify={onRectifyCategories}
        />
      ) : null}

      <div className="metrics-grid">
        <MetricCard
          label="Fiches techniques"
          value={dashboard?.recipeCount ?? recipes.length}
          icon={<FileText size={20} />}
          tone="emerald"
          onClick={onOpenRecipes}
        />
      </div>

      <div className="double-panel">
        <div className="card-modern">
          <div className="section-header-modern" style={{ marginBottom: '1.5rem' }}>
            <div className="section-info">
              <span className="card-title">Dernières fiches modifiées</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={onOpenRecipes}>
              Voir tout
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {latest.length ? (
              latest.map((recipe) => (
                <div
                  key={recipe.id}
                  style={{
                    padding: '1rem 1.25rem',
                    border: '1px solid var(--light-border)',
                    borderRadius: '12px',
                    background: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                  }}
                  onClick={onOpenRecipes}
                >
                  <strong style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>
                    {recipe.name}
                  </strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {recipe.category?.name ?? 'Sans catégorie'} · Modifié le{' '}
                    {date(recipe.updatedAt)} · Par{' '}
                    {recipe.author?.firstName ?? recipe.author?.email ?? '—'}
                  </span>
                </div>
              ))
            ) : (
              <div className="alert-modern info">Aucune fiche modifiée pour le moment.</div>
            )}
          </div>
        </div>

        <div className="card-modern">
          <span className="card-title" style={{ marginBottom: '1.5rem', display: 'block' }}>
            Produits les plus utilisés
          </span>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              marginBottom: '1.5rem',
            }}
          >
            {topProducts.length ? (
              topProducts.map((product) => (
                <div
                  key={product.productId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    border: '1px solid var(--light-border)',
                    borderRadius: '12px',
                    background: 'white',
                  }}
                >
                  <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>
                    {product.name}
                  </strong>
                  <span
                    className="badge badge-reception"
                    style={{ fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    {product.count} recettes
                  </span>
                </div>
              ))
            ) : (
              <div className="alert-modern info">
                Données calculées depuis les lignes d’ingrédients liées aux produits Stocks.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecipeImportStatusBar({
  statuses,
  onOpenTracking,
  onOpenResult,
}: {
  statuses: TechnicalSheetRecipeImportStatus[];
  onOpenTracking: () => void;
  onOpenResult: (status: TechnicalSheetRecipeImportStatus) => void;
}) {
  const readyStatuses = statuses.filter((status) => status.state === 'vérifier' && status.result);
  const errors = statuses.filter((status) => status.state === 'erreur');
  const working = statuses.filter(recipeImportWorking);
  const featured = readyStatuses[0] ?? working[0] ?? statuses[0];
  const tone = readyStatuses.length
    ? 'ready'
    : errors.length && !working.length
      ? 'error'
      : 'working';
  const label = readyStatuses.length
    ? `${readyStatuses.length} fiche${readyStatuses.length > 1 ? 's' : ''} prête${readyStatuses.length > 1 ? 's' : ''} à vérifier`
    : errors.length && !working.length
      ? `${errors.length} import${errors.length > 1 ? 's' : ''} en erreur`
      : `${working.length} fiche${working.length > 1 ? 's' : ''} en cours d’analyse`;
  const progressClass =
    featured.state === 'vérifier'
      ? 'success'
      : featured.state === 'erreur'
        ? 'error'
        : featured.state === 'analyse'
          ? 'analyzing'
          : 'pending';
  return (
    <motion.section
      className={`stocks-ocr-dashboard-status ${tone}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="stocks-ocr-dashboard-status-main">
        <div className="stocks-ocr-dashboard-status-icon">
          {readyStatuses.length ? (
            <CheckCircle2 size={18} />
          ) : errors.length && !working.length ? (
            <AlertCircle size={18} />
          ) : (
            <Clock size={18} />
          )}
        </div>
        <div className="stocks-ocr-dashboard-status-copy">
          <span>{label}</span>
          <small>
            {statuses.length} fichier{statuses.length > 1 ? 's' : ''} suivi
            {statuses.length > 1 ? 's' : ''} · le traitement continue pendant la navigation
          </small>
          <div className="ocr-status-progress-bar">
            <div
              className={`ocr-status-progress-fill ${progressClass}`}
              style={{ width: `${featured.progress}%` }}
            />
          </div>
        </div>
      </div>
      <div className="stocks-ocr-dashboard-status-actions">
        {readyStatuses[0] ? (
          <button className="btn btn-primary btn-sm" onClick={() => onOpenResult(readyStatuses[0])}>
            Vérifier <ArrowRight size={13} />
          </button>
        ) : null}
        <button className="btn btn-secondary btn-sm" onClick={onOpenTracking}>
          Suivi des imports
        </button>
      </div>
    </motion.section>
  );
}

function RecipeImportPanel({
  files,
  statuses,
  submitting,
  retryingFailed,
  removingDocumentIds,
  onFiles,
  onSubmit,
  onRetryFailed,
  onRemoveStatus,
  onOpenResult,
}: {
  files: File[];
  statuses: TechnicalSheetRecipeImportStatus[];
  submitting: boolean;
  retryingFailed: boolean;
  removingDocumentIds: string[];
  onFiles: (files: File[]) => void;
  onSubmit: () => Promise<void>;
  onRetryFailed: () => Promise<void>;
  onRemoveStatus: (documentId: string) => Promise<void>;
  onOpenResult: (status: TechnicalSheetRecipeImportStatus) => void;
}) {
  const failedStatuses = statuses.filter((status) => status.state === 'erreur');
  const addFiles = (next: File[]) => {
    const unique = [...files, ...next]
      .filter(
        (file, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.name === file.name &&
              candidate.size === file.size &&
              candidate.lastModified === file.lastModified,
          ) === index,
      )
      .slice(0, MAX_RECIPE_IMPORT_FILES);
    onFiles(unique);
  };
  return (
    <div>
      <label
        className="stocks-ocr-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(Array.from(event.dataTransfer.files ?? []));
        }}
      >
        <FileText size={32} />
        <span>Déposer vos fiches techniques ici ou cliquer pour parcourir</span>
        <small>
          PDF, images, Pages et Numbers · jusqu’à {MAX_RECIPE_IMPORT_FILES} fichiers simultanés · 20
          Mo par fichier
        </small>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,image/avif,.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.avif,.pages,.numbers"
          multiple
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = '';
          }}
        />
      </label>

      {files.length ? (
        <div style={{ marginTop: '1rem' }}>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.5rem',
            }}
          >
            Fichiers prêts pour l’analyse ({files.length})
          </div>
          <div className="stocks-ocr-file-list">
            {files.map((file, index) => (
              <div
                className="stocks-ocr-file-row"
                key={`${file.name}-${file.size}-${file.lastModified}`}
              >
                <FileText size={18} />
                <div className="stocks-ocr-file-row-details">
                  <span>{file.name}</span>
                  <small>{formatImportBytes(file.size)}</small>
                </div>
                <button
                  type="button"
                  className="stocks-ocr-file-remove"
                  onClick={() => onFiles(files.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="modal-footer"
        style={{
          margin: '1rem -1.5rem 0',
          padding: '1.1rem 1.5rem',
          background: '#fafbfe',
          borderTop: '1px solid var(--light-border)',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {failedStatuses.length ? (
          <button
            type="button"
            className="production-btn-primary"
            disabled={retryingFailed || submitting}
            onClick={() => void onRetryFailed()}
          >
            <RefreshCw size={17} className={retryingFailed ? 'spin' : undefined} />
            {retryingFailed
              ? 'Relance en cours…'
              : `Actualiser les analyses en erreur (${failedStatuses.length})`}
          </button>
        ) : (
          <span />
        )}
        <button
          className="btn btn-primary"
          disabled={!files.length || submitting}
          onClick={() => void onSubmit()}
        >
          {submitting
            ? 'Préparation de l’import…'
            : `Lancer l’analyse OCR${files.length > 1 ? ` (${files.length})` : ''}`}
        </button>
      </div>

      {statuses.length ? (
        <div style={{ marginTop: '1.5rem' }}>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.75rem',
            }}
          >
            Suivi des analyses ({statuses.length})
          </div>
          <div className="ocr-statuses-list">
            {statuses.map((status) => {
              const progressClass =
                status.state === 'vérifier'
                  ? 'success'
                  : status.state === 'erreur'
                    ? 'error'
                    : status.state === 'analyse'
                      ? 'analyzing'
                      : 'pending';
              const stateLabel =
                status.state === 'vérifier'
                  ? 'Prête à vérifier'
                  : status.state === 'erreur'
                    ? status.errorMessage || 'Erreur d’analyse'
                    : status.state === 'analyse'
                      ? 'Extraction et rapprochement Stocks…'
                      : 'Dans la file d’attente';
              return (
                <div
                  className="ocr-status-card"
                  key={status.document.id}
                  style={
                    status.state === 'vérifier' ? { borderLeft: '3px solid #10b981' } : undefined
                  }
                >
                  <div className="ocr-status-card-info">
                    <span className="ocr-status-card-title">{status.document.originalName}</span>
                    <div className="ocr-status-card-meta">
                      <span>{formatImportBytes(status.document.sizeBytes)}</span>
                      <span>•</span>
                      <span>{stateLabel}</span>
                    </div>
                    <div className="ocr-status-progress-bar">
                      <div
                        className={`ocr-status-progress-fill ${progressClass}`}
                        style={{ width: `${status.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="ocr-status-card-actions">
                    {status.result ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onOpenResult(status)}
                      >
                        Vérifier <ArrowRight size={12} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="modal-close-btn ocr-status-card-remove"
                      onClick={() => void onRemoveStatus(status.document.id)}
                      disabled={
                        recipeImportWorking(status) ||
                        removingDocumentIds.includes(status.document.id)
                      }
                      aria-label={`Retirer ${status.document.originalName} du suivi`}
                      title={
                        recipeImportWorking(status)
                          ? 'L’analyse en cours ne peut pas être retirée.'
                          : 'Retirer cette analyse du suivi'
                      }
                    >
                      {removingDocumentIds.includes(status.document.id) ? (
                        <RefreshCw size={14} className="spin" />
                      ) : (
                        <X size={15} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RecipesTab(props: {
  recipes: TechnicalSheetRecipe[];
  categories: TechnicalSheetCategory[];
  search: string;
  categoryFilter: string;
  statusFilter: string;
  onSearch: (v: string) => void;
  onCategoryFilter: (v: string) => void;
  onStatusFilter: (v: string) => void;
  onClearFilters: () => void;
  importStatuses: TechnicalSheetRecipeImportStatus[];
  onImport: () => void;
  onOpenImportedRecipe: (status: TechnicalSheetRecipeImportStatus) => void;
  onEdit: (r: TechnicalSheetRecipe) => void;
  onDelete: (r: TechnicalSheetRecipe) => void;
  onExport: (r: TechnicalSheetRecipe) => void;
  onDuplicate: (r: TechnicalSheetRecipe) => void;
}) {
  const hasActiveFilters = Boolean(props.search || props.categoryFilter || props.statusFilter);
  const filtered = props.recipes.filter((recipe) => {
    const haystack = [recipe.name, recipe.description, recipe.category?.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchesSearch = haystack.includes(props.search.toLowerCase());
    const matchesCategory =
      !props.categoryFilter ||
      recipe.categoryId === props.categoryFilter ||
      recipe.category?.id === props.categoryFilter;
    const matchesStatus = !props.statusFilter || recipe.status === props.statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {props.importStatuses.length ? (
        <RecipeImportStatusBar
          statuses={props.importStatuses}
          onOpenTracking={props.onImport}
          onOpenResult={props.onOpenImportedRecipe}
        />
      ) : null}
      <div className="technical-sheets-filter-card">
        <div className="stocks-filter-bar">
          <div className="search-input-wrapper">
            <Search size={16} />
            <input
              className="search-input"
              placeholder="Rechercher une fiche, un ingrédient, une catégorie…"
              value={props.search}
              onChange={(event) => props.onSearch(event.target.value)}
            />
          </div>
          <div className="filter-selects">
            <select
              value={props.categoryFilter}
              onChange={(event) => props.onCategoryFilter(event.target.value)}
            >
              <option value="">Toutes catégories</option>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              value={props.statusFilter}
              onChange={(event) => props.onStatusFilter(event.target.value)}
            >
              <option value="">Tous les statuts</option>
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            {props.search || props.categoryFilter || props.statusFilter ? (
              <button
                type="button"
                className="btn-clear-filters"
                onClick={props.onClearFilters}
                title="Réinitialiser les filtres"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {filtered.length ? (
        <div className="recipe-grid">
          {filtered.map((recipe) => (
            <div
              className="card-modern recipe-card"
              key={recipe.id}
              style={{
                opacity: isArchived(recipe) ? 0.65 : 1,
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              }}
            >
              {recipe.photoUrl && (
                <div className="recipe-image-container">
                  <img src={recipe.photoUrl} alt={recipe.name} />
                </div>
              )}
              <div
                style={{
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  flexGrow: 1,
                  gap: '1rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '1.1rem',
                        fontWeight: 800,
                        color: 'var(--text-main)',
                        lineHeight: 1.25,
                      }}
                    >
                      {recipe.name}
                    </h3>
                    <p
                      style={{
                        margin: '0.25rem 0 0 0',
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {recipe.category?.name ?? 'Sans catégorie'} ·{' '}
                      {recipe.yieldMode === 'MASS'
                        ? formatMass(Number(recipe.totalMassGrams ?? 0))
                        : `${recipe.referencePortions ?? recipe.portions ?? 1} portions`}
                    </p>
                  </div>
                  <span
                    className={`badge ${recipe.status === 'ACTIVE' ? 'badge-reception' : 'badge-production'}`}
                  >
                    {statuses.find((s) => s.value === recipe.status)?.label ?? recipe.status}
                  </span>
                </div>

                <div className="recipe-chips-row">
                  <span
                    className="badge badge-production"
                    style={{
                      background: 'rgba(16, 185, 129, 0.06)',
                      color: 'var(--primary)',
                      border: '1px solid rgba(16, 185, 129, 0.15)',
                      fontWeight: 600,
                    }}
                  >
                    Total {money(recipe.costTotal ?? recipe.totalCost)}
                  </span>
                  <span
                    className="badge badge-reception"
                    style={{
                      background: 'rgba(59, 130, 246, 0.06)',
                      color: '#2563eb',
                      border: '1px solid rgba(59, 130, 246, 0.15)',
                      fontWeight: 600,
                    }}
                  >
                    {recipe.yieldMode === 'MASS'
                      ? `Kilo ${money(recipe.costPerKg)}`
                      : `Portion ${money(recipe.costPerPortion)}`}
                  </span>
                  <span className="badge badge-inventory" style={{ fontSize: '0.78rem' }}>
                    {date(recipe.updatedAt)}
                  </span>
                </div>

                {recipe.hasNonCalculableLines || recipe.nonCalculableLinesCount ? (
                  <div
                    className="alert-modern error"
                    style={{
                      padding: '0.4rem 0.6rem',
                      fontSize: '0.78rem',
                      margin: 0,
                      borderRadius: '8px',
                    }}
                  >
                    Non calculable : conversion ou prix Stocks manquant.
                  </div>
                ) : null}

                <div
                  className="recipe-actions-row"
                  style={{
                    marginTop: 'auto',
                    display: 'flex',
                    gap: '0.25rem',
                    flexWrap: 'wrap',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #f1f5f9',
                  }}
                >
                  <button
                    className="icon-btn"
                    onClick={() => props.onEdit(recipe)}
                    title="Modifier"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => props.onDuplicate(recipe)}
                    title="Dupliquer"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => props.onExport(recipe)}
                    title="Exporter et imprimer la fiche"
                    aria-label={`Exporter et imprimer ${recipe.name}`}
                  >
                    <Printer size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => props.onDelete(recipe)}
                    title="Supprimer définitivement"
                    aria-label={`Supprimer définitivement ${recipe.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-modern" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            {hasActiveFilters ? 'Aucune fiche ne correspond aux filtres' : 'Aucune fiche technique'}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {hasActiveFilters
              ? 'Modifiez la recherche, la catégorie ou le statut pour élargir les résultats.'
              : 'Créez une première fiche en sélectionnant uniquement des produits Stocks.'}
          </p>
          <button
            className={hasActiveFilters ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={hasActiveFilters ? props.onClearFilters : props.onCreate}
          >
            {hasActiveFilters ? 'Réinitialiser les filtres' : 'Créer une fiche'}
          </button>
        </div>
      )}
    </div>
  );
}

function TechnicalSheetCategoryCreationTour({ onClose }: { onClose: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const refreshRect = () => {
    if (window.innerWidth < 760) {
      setRect(null);
      return;
    }
    const target = document.querySelector<HTMLElement>(
      `[data-tour="${TECHNICAL_SHEETS_CATEGORY_TOUR_TARGET}"]`,
    );
    if (!target) {
      setRect(null);
      return;
    }
    const next = target.getBoundingClientRect();
    setRect(next.width && next.height ? next : null);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-tour="${TECHNICAL_SHEETS_CATEGORY_TOUR_TARGET}"]`,
      );
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      window.requestAnimationFrame(refreshRect);
    });
    const target = document.querySelector<HTMLElement>(
      `[data-tour="${TECHNICAL_SHEETS_CATEGORY_TOUR_TARGET}"]`,
    );
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refreshRect) : null;
    if (target) observer?.observe(target);
    const mutationObserver =
      typeof MutationObserver !== 'undefined' ? new MutationObserver(refreshRect) : null;
    if (document.body) mutationObserver?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', refreshRect);
    window.addEventListener('scroll', refreshRect, true);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', refreshRect);
      window.removeEventListener('scroll', refreshRect, true);
    };
  }, []);

  useEffect(() => {
    cardRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const cardStyle = useMemo(() => {
    if (!rect) return undefined;
    const width = Math.min(450, window.innerWidth - 32);
    const estimatedHeight = 270;
    const gap = 18;
    const left = Math.min(
      window.innerWidth - width - 16,
      Math.max(16, rect.left + rect.width / 2 - width / 2),
    );
    const below = rect.bottom + estimatedHeight + gap < window.innerHeight;
    return {
      left,
      top: below ? rect.bottom + gap : Math.max(16, rect.top - estimatedHeight - gap),
      transform: 'none',
    };
  }, [rect]);

  return (
    <div className="workspace-mini-tour" aria-live="assertive">
      {rect ? (
        <div
          className="workspace-mini-tour-highlight"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      ) : (
        <div className="workspace-mini-tour-backdrop" />
      )}
      <div
        className={`workspace-mini-tour-card ${rect ? '' : 'centered'}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="technical-sheet-category-tour-title"
        tabIndex={-1}
        ref={cardRef}
      >
        <button
          className="workspace-mini-tour-close"
          type="button"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X size={18} />
        </button>
        <span className="workspace-onboarding-kicker">
          <AlertCircle size={14} /> Catégorie requise
        </span>
        <h2 id="technical-sheet-category-tour-title">Créez d’abord une catégorie</h2>
        <p>
          Veuillez créer une catégorie avant de créer une fiche technique. Saisissez son nom, puis
          cliquez sur le bouton mis en évidence.
        </p>
        <div className="workspace-mini-tour-dots" aria-hidden="true">
          <i className="active" />
        </div>
        <footer>
          <span />
          <button className="btn btn-primary" type="button" onClick={onClose}>
            J’ai compris
          </button>
        </footer>
      </div>
    </div>
  );
}

function ReferencesTab({
  title,
  icon,
  items,
  recipesWithoutActiveCategory,
  name,
  description,
  onName,
  onDescription,
  onCreate,
  onArchive,
  onRectify,
}: {
  title: string;
  icon: React.ReactNode;
  items: TechnicalSheetCategory[];
  recipesWithoutActiveCategory: TechnicalSheetRecipe[];
  name: string;
  description: string;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  onCreate: () => void;
  onArchive: (id: string) => void;
  onRectify: () => void;
}) {
  return (
    <div className="double-panel">
      <div className="card-modern">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <span
            className="card-title"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {icon} {title}
          </span>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Nom
            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder="ex: Entrées, Desserts, Sauces..."
            />
          </label>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Description
            <textarea
              rows={3}
              value={description}
              onChange={(e) => onDescription(e.target.value)}
              placeholder="Description optionnelle de la catégorie..."
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={onCreate}
            disabled={!name.trim()}
            data-tour={TECHNICAL_SHEETS_CATEGORY_TOUR_TARGET}
          >
            Ajouter la catégorie
          </button>
        </div>
      </div>

      <div
        className="card-modern"
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        <span className="card-title">Catégories actives</span>
        {recipesWithoutActiveCategory.length ? (
          <CategoryReassignmentAlert
            recipes={recipesWithoutActiveCategory}
            onRectify={onRectify}
            compact
          />
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            maxHeight: '400px',
            overflowY: 'auto',
            paddingRight: '4px',
          }}
        >
          {items.length ? (
            items.map((item) => (
              <div
                key={item.id}
                className="reference-item-card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  border: '1px solid var(--light-border)',
                  borderRadius: '12px',
                  background: 'white',
                }}
              >
                <div>
                  <strong
                    style={{ display: 'block', fontSize: '0.92rem', color: 'var(--text-main)' }}
                  >
                    {item.name}
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {item.description ?? '—'}
                  </span>
                </div>
                <button
                  className="icon-btn danger"
                  style={{ padding: '0.4rem' }}
                  onClick={() => onArchive(item.id)}
                  title="Supprimer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <div className="technical-sheets-empty-categories">
              Aucune catégorie active. Ajoutez-en une pour classer vos fiches techniques.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CostsTab({
  recipes,
  categories,
  salesTaxPolicy,
  onSavePricing,
}: {
  recipes: TechnicalSheetRecipe[];
  categories: TechnicalSheetCategory[];
  salesTaxPolicy?: TechnicalSheetSalesTaxPolicy;
  onSavePricing: (
    recipeId: string,
    payload: {
      targetSellingPriceExclTax?: number | null;
      targetSellingPriceInclTax?: number | null;
    },
  ) => Promise<TechnicalSheetRecipe>;
}) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const filtered = recipes.filter((recipe) => {
    const haystack = [
      recipe.name,
      recipe.description,
      recipe.category?.name,
      ...(recipe.ingredients ?? []).map((line) => line.product?.name),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchesSearch = haystack.includes(search.trim().toLowerCase());
    const matchesCategory =
      !categoryFilter ||
      recipe.categoryId === categoryFilter ||
      recipe.category?.id === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const sorted = [...filtered].sort(
    (a, b) => Number(b.costTotal ?? b.totalCost ?? 0) - Number(a.costTotal ?? a.totalCost ?? 0),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="technical-sheets-filter-card">
        <div className="stocks-filter-bar">
          <div className="search-input-wrapper">
            <Search size={16} />
            <input
              className="search-input"
              placeholder="Rechercher une fiche, un ingrédient, une catégorie…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="filter-selects">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">Toutes catégories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {search || categoryFilter ? (
              <button
                type="button"
                className="btn-clear-filters"
                onClick={() => {
                  setSearch('');
                  setCategoryFilter('');
                }}
                title="Réinitialiser les filtres"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={`technical-sheets-tax-policy ${salesTaxPolicy?.configured ? 'configured' : 'missing'}`}
      >
        <div>
          <strong>
            {salesTaxPolicy?.configured
              ? `TVA vente restauration : ${salesTaxPolicy.rate}% · ${salesTaxPolicy.countryLabel}`
              : 'Pays de réglementation non configuré'}
          </strong>
          <span>
            {salesTaxPolicy?.configured
              ? salesTaxPolicy.scopeLabel
              : 'Configurez le pays réglementaire de l’organisation pour calculer les prix TTC.'}
          </span>
        </div>
        <span
          className={`badge ${salesTaxPolicy?.configured ? 'badge-reception' : 'badge-correction'}`}
        >
          {salesTaxPolicy?.configured ? 'Onboarding réglementaire' : 'TTC indisponible'}
        </span>
      </div>

      <div className="card-modern">
        <div className="section-header-modern" style={{ marginBottom: '1.5rem' }}>
          <div className="section-info">
            <span className="card-title">Coûts, prix de vente visés et marge brute</span>
            <span className="section-tagline">
              Le coût HT vient des produits Stocks. L’unité économique suit le rendement choisi :
              portion ou kilo.
            </span>
          </div>
        </div>

        {sorted.length ? (
          <div className="table-wrapper technical-sheets-cost-table-wrapper">
            <table className="table-modern technical-sheets-cost-table">
              <colgroup>
                <col className="technical-sheets-cost-col-recipe" />
                <col className="technical-sheets-cost-col-total" />
                <col className="technical-sheets-cost-col-portion" />
                <col className="technical-sheets-cost-col-price" />
                <col className="technical-sheets-cost-col-price" />
                <col className="technical-sheets-cost-col-margin" />
              </colgroup>
              <thead>
                <tr>
                  <th>Recette / Fiche technique</th>
                  <th style={{ textAlign: 'right' }}>Coût HT recette</th>
                  <th style={{ textAlign: 'right' }}>Coût HT / portion ou kg</th>
                  <th>Prix de vente HT visé</th>
                  <th>Prix de vente TTC visé</th>
                  <th>Marge brute</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((recipe) => (
                  <CostPricingRow
                    key={recipe.id}
                    recipe={recipe}
                    salesTaxPolicy={salesTaxPolicy}
                    onSave={onSavePricing}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="technical-sheets-cost-empty">
            <strong>Aucune fiche ne correspond à la recherche</strong>
            <span>Modifiez le texte recherché ou la catégorie sélectionnée.</span>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSearch('');
                setCategoryFilter('');
              }}
            >
              Réinitialiser les filtres
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CostPricingRow({
  recipe,
  salesTaxPolicy,
  onSave,
}: {
  recipe: TechnicalSheetRecipe;
  salesTaxPolicy?: TechnicalSheetSalesTaxPolicy;
  onSave: (
    recipeId: string,
    payload: {
      targetSellingPriceExclTax?: number | null;
      targetSellingPriceInclTax?: number | null;
    },
  ) => Promise<TechnicalSheetRecipe>;
}) {
  const rate = salesTaxPolicy?.rate ?? null;
  const initialHt =
    recipe.targetSellingPriceExclTax == null
      ? ''
      : Number(recipe.targetSellingPriceExclTax).toFixed(2);
  const initialTtc =
    recipe.targetSellingPriceInclTax == null
      ? ''
      : Number(recipe.targetSellingPriceInclTax).toFixed(2);
  const [ht, setHt] = useState(initialHt);
  const [ttc, setTtc] = useState(initialTtc);
  const [savedHt, setSavedHt] = useState(initialHt);
  const [savedTtc, setSavedTtc] = useState(initialTtc);
  const [lastEdited, setLastEdited] = useState<'ht' | 'ttc'>('ht');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const onSaveRef = useRef(onSave);
  const latestValuesRef = useRef({ ht, ttc, lastEdited });
  const saveRevisionRef = useRef(0);
  const dirtyRef = useRef(false);

  onSaveRef.current = onSave;
  latestValuesRef.current = { ht, ttc, lastEdited };

  useEffect(() => {
    const nextHt =
      recipe.targetSellingPriceExclTax == null
        ? ''
        : Number(recipe.targetSellingPriceExclTax).toFixed(2);
    const nextTtc =
      recipe.targetSellingPriceInclTax == null
        ? ''
        : Number(recipe.targetSellingPriceInclTax).toFixed(2);
    setSavedHt(nextHt);
    setSavedTtc(nextTtc);
    if (!dirtyRef.current) {
      setHt(nextHt);
      setTtc(nextTtc);
    }
  }, [recipe.targetSellingPriceExclTax, recipe.targetSellingPriceInclTax]);

  const currentHt = ht === '' ? null : Number(ht);
  const costBasis = Number(
    recipe.yieldMode === 'MASS' ? (recipe.costPerKg ?? 0) : (recipe.costPerPortion ?? 0),
  );
  const marginAmount =
    currentHt == null || !Number.isFinite(currentHt) ? null : currentHt - costBasis;
  const marginRate = marginAmount == null || !currentHt ? null : (marginAmount / currentHt) * 100;
  const dirty = ht !== savedHt || ttc !== savedTtc;
  dirtyRef.current = dirty;

  function changeHt(value: string) {
    setHt(value);
    setLastEdited('ht');
    setError(undefined);
    setSaveState('idle');
    const number = Number(value);
    setTtc(
      value === '' || !Number.isFinite(number) || rate == null
        ? ''
        : (number * (1 + rate / 100)).toFixed(2),
    );
  }

  function changeTtc(value: string) {
    setTtc(value);
    setLastEdited('ttc');
    setError(undefined);
    setSaveState('idle');
    const number = Number(value);
    setHt(
      value === '' || !Number.isFinite(number) || rate == null
        ? ''
        : (number / (1 + rate / 100)).toFixed(2),
    );
  }

  useEffect(() => {
    if (!dirty) return;
    const value = lastEdited === 'ttc' ? ttc : ht;
    if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) return;

    const timer = window.setTimeout(async () => {
      const submitted = { ...latestValuesRef.current };
      const revision = ++saveRevisionRef.current;
      setSaveState('saving');
      setError(undefined);
      try {
        const updated = await onSaveRef.current(
          recipe.id,
          submitted.lastEdited === 'ttc'
            ? { targetSellingPriceInclTax: submitted.ttc === '' ? null : Number(submitted.ttc) }
            : { targetSellingPriceExclTax: submitted.ht === '' ? null : Number(submitted.ht) },
        );
        if (revision !== saveRevisionRef.current) return;
        const nextHt =
          updated.targetSellingPriceExclTax == null
            ? ''
            : Number(updated.targetSellingPriceExclTax).toFixed(2);
        const nextTtc =
          updated.targetSellingPriceInclTax == null
            ? ''
            : Number(updated.targetSellingPriceInclTax).toFixed(2);
        setSavedHt(nextHt);
        setSavedTtc(nextTtc);
        const submittedValueIsStillCurrent =
          latestValuesRef.current.ht === submitted.ht &&
          latestValuesRef.current.ttc === submitted.ttc;
        if (submittedValueIsStillCurrent) {
          setHt(nextHt);
          setTtc(nextTtc);
        }
        setSaveState(submittedValueIsStillCurrent ? 'saved' : 'idle');
        window.setTimeout(() => {
          if (saveRevisionRef.current === revision) setSaveState('idle');
        }, 1800);
      } catch (err) {
        if (revision !== saveRevisionRef.current) return;
        setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
        setSaveState('error');
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [dirty, ht, lastEdited, recipe.id, ttc]);

  return (
    <tr>
      <td data-label="Recette">
        <strong className="technical-sheets-cost-name">{recipe.name}</strong>
        <span className="technical-sheets-cost-meta">
          {recipe.category?.name ?? 'Sans catégorie'} ·{' '}
          {recipe.yieldMode === 'MASS'
            ? formatMass(Number(recipe.totalMassGrams ?? 0))
            : `${Number(recipe.referencePortions ?? 1)} portion(s)`}{' '}
          · calculé le {date(recipe.lastCostCalculationAt)}
        </span>
        {(recipe.nonCalculableLinesCount ?? 0) > 0 ? (
          <span className="badge badge-loss">
            {recipe.nonCalculableLinesCount} ligne(s) non calculable(s)
          </span>
        ) : null}
      </td>
      <td data-label="Coût HT recette" className="technical-sheets-cost-money">
        {money(recipe.costTotal ?? recipe.totalCost)}
      </td>
      <td data-label="Coût HT / portion" className="technical-sheets-cost-money primary">
        {recipe.yieldMode === 'MASS'
          ? `${money(recipe.costPerKg)} / kg`
          : money(recipe.costPerPortion)}
      </td>
      <td data-label="Prix HT visé">
        <div className="technical-sheets-price-input">
          <input
            type="number"
            min="0"
            step="0.01"
            value={ht}
            onChange={(event) => changeHt(event.target.value)}
            placeholder="0,00"
          />
          <span>{recipe.yieldMode === 'MASS' ? '€ HT/kg' : '€ HT'}</span>
        </div>
        {saveState !== 'idle' ? (
          <small className={`technical-sheets-pricing-status ${saveState}`}>
            {saveState === 'saving'
              ? 'Enregistrement…'
              : saveState === 'saved'
                ? 'Enregistré'
                : 'Échec de l’enregistrement'}
          </small>
        ) : null}
        {error ? <small className="technical-sheets-pricing-error">{error}</small> : null}
      </td>
      <td data-label="Prix TTC visé">
        <div className="technical-sheets-price-input">
          <input
            type="number"
            min="0"
            step="0.01"
            value={ttc}
            onChange={(event) => changeTtc(event.target.value)}
            placeholder={rate == null ? 'Pays requis' : '0,00'}
            disabled={rate == null}
          />
          <span>{recipe.yieldMode === 'MASS' ? '€ TTC/kg' : '€ TTC'}</span>
        </div>
        <small className="technical-sheets-tax-rate">
          {rate == null ? 'Taux indisponible' : `TVA ${rate}%`}
        </small>
      </td>
      <td data-label="Marge brute">
        {marginAmount == null ? (
          <span className="technical-sheets-margin-empty">Prix visé requis</span>
        ) : (
          <div className={`technical-sheets-margin ${marginAmount >= 0 ? 'positive' : 'negative'}`}>
            <strong>{money(marginAmount)}</strong>
            <span>{marginRate == null ? '—' : `${marginRate.toFixed(1)} % du prix HT`}</span>
          </div>
        )}
      </td>
    </tr>
  );
}

function RecipeCompositionNode({
  line,
  ratio,
  recipes,
  products,
  units,
  visited = [],
}: {
  line: any;
  ratio: number;
  recipes: TechnicalSheetRecipe[];
  products: Product[];
  units: Unit[];
  visited?: string[];
}) {
  const source = recipes.find((recipe) => recipe.id === line.sourceTechnicalSheetId);
  const product = products.find((item) => item.id === line.productId);
  const unit = units.find((item) => item.id === line.unitId);
  const required = Number(line.quantity || 0) * ratio;
  if (!source) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '0.4rem 0.65rem',
          color: '#475569',
          fontSize: '0.78rem',
        }}
      >
        <span>{product?.name || line.productName || 'Produit'}</span>
        <strong>
          {required.toLocaleString(activeLocale(), { maximumFractionDigits: 3 })}{' '}
          {unit?.symbol || ''}
        </strong>
      </div>
    );
  }
  if (visited.includes(source.id)) {
    return (
      <div style={{ color: '#b91c1c', fontSize: '0.78rem', padding: '0.4rem 0.65rem' }}>
        Cycle détecté vers {source.name}
      </div>
    );
  }
  const childRatio = required / Math.max(Number(source.referencePortions || 1), 0.001);
  return (
    <div style={{ borderLeft: '3px solid #86efac', margin: '0.45rem 0', paddingLeft: '0.65rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '0.45rem 0.65rem',
          background: '#f0fdf4',
          borderRadius: '8px',
          color: '#166534',
          fontSize: '0.8rem',
        }}
      >
        <strong>{source.name}</strong>
        <span>
          {required.toLocaleString(activeLocale(), { maximumFractionDigits: 3 })}{' '}
          {unit?.symbol || source.yieldUnit?.symbol || ''}
        </span>
      </div>
      <div style={{ paddingLeft: '0.45rem' }}>
        {(source.ingredients ?? []).map((child, index) => (
          <RecipeCompositionNode
            key={`${source.id}-${child.id || index}`}
            line={child}
            ratio={childRatio}
            recipes={recipes}
            products={products}
            units={units}
            visited={[...visited, source.id]}
          />
        ))}
      </div>
    </div>
  );
}

function RecipeDialog({
  open,
  form,
  setForm,
  products,
  units,
  recipes,
  categories,
  editing,
  editingRecipeId,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  form: TechnicalSheetRecipePayload;
  setForm: (f: TechnicalSheetRecipePayload) => void;
  products: Product[];
  units: Unit[];
  recipes: TechnicalSheetRecipe[];
  categories: TechnicalSheetCategory[];
  editing: boolean;
  editingRecipeId?: string;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
}) {
  const ingredients = form.ingredients ?? [];
  const steps = form.steps ?? [];
  const totalMassGrams = useMemo(
    () =>
      ingredients.reduce(
        (total, line) => total + (ingredientMassGrams(line, products, units, recipes) ?? 0),
        0,
      ),
    [ingredients, units, recipes],
  );
  const ingredientCosts = useMemo(
    () => ingredients.map((line) => ingredientCostEstimate(line, products, units, recipes)),
    [ingredients, products, units, recipes],
  );
  const totalCost = ingredientCosts.reduce((total, cost) => total + (cost ?? 0), 0);
  const hasNonCalculableCost = ingredientCosts.some((cost) => cost == null);
  const [previewMode, setPreviewMode] = useState<'PORTIONS' | 'MASS'>(form.yieldMode ?? 'PORTIONS');
  const [previewQuantity, setPreviewQuantity] = useState(
    (form.yieldMode ?? 'PORTIONS') === 'MASS'
      ? Math.max(totalMassGrams / 1_000, 0.001)
      : Number(form.referencePortions || 1),
  );
  const previousMassGramsRef = useRef(totalMassGrams);
  const previewBase =
    previewMode === 'MASS' ? totalMassGrams / 1_000 : Number(form.referencePortions || 0);
  const previewRatio = previewBase > 0 ? previewQuantity / previewBase : 0;
  const costPerPortion =
    (form.yieldMode ?? 'PORTIONS') === 'PORTIONS' && Number(form.referencePortions || 0) > 0
      ? totalCost / Number(form.referencePortions)
      : null;
  const costPerKg = totalMassGrams > 0 ? totalCost / (totalMassGrams / 1_000) : null;
  const subRecipeOptions = recipes.filter(
    (recipe) =>
      !recipe.isArchived &&
      recipe.mode === 'PRODUCTION' &&
      ['ACTIVE', 'VALIDATED'].includes(recipe.status) &&
      recipe.outputProductId &&
      recipe.id !== editingRecipeId,
  );
  const [subRecipePickerIndex, setSubRecipePickerIndex] = useState<number | null>(null);
  const subRecipePickerItems = useMemo<TechnicalSheetPickerItem[]>(
    () =>
      subRecipeOptions.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        category: recipe.category?.name ?? 'Sans catégorie',
        group: recipe.category?.name ?? 'Sans catégorie',
        referenceLabel:
          recipe.yieldMode === 'MASS'
            ? formatMass(Number(recipe.totalMassGrams ?? 0))
            : `${Number(recipe.referencePortions ?? 1).toLocaleString(activeLocale())} portions`,
        durationMinutes: Number(recipe.totalTimeMinutes ?? 0) || null,
        contextLabel: 'Préparation active',
      })),
    [recipes, editingRecipeId],
  );

  useEffect(() => {
    if (!open) return;
    const mode = form.yieldMode ?? 'PORTIONS';
    setPreviewMode(mode);
    setPreviewQuantity(
      mode === 'MASS'
        ? Math.max(totalMassGrams / 1_000, 0.001)
        : Number(form.referencePortions || 1),
    );
  }, [open, form.yieldMode]);

  useEffect(() => {
    if (open && previewMode === 'MASS' && previousMassGramsRef.current <= 0 && totalMassGrams > 0) {
      setPreviewQuantity(totalMassGrams / 1_000);
    }
    previousMassGramsRef.current = totalMassGrams;
  }, [open, previewMode, totalMassGrams]);

  const patchIngredient = (index: number, patch: Partial<(typeof ingredients)[number]>) => {
    const next = [...ingredients];
    next[index] = { ...next[index], ...patch };
    setForm({ ...form, ingredients: next });
  };

  const selectSubRecipe = (index: number, technicalSheetId: string) => {
    const line = ingredients[index];
    const source = subRecipeOptions.find((recipe) => recipe.id === technicalSheetId);
    patchIngredient(
      index,
      source
        ? {
            componentType: 'SUB_RECIPE',
            sourceTechnicalSheetId: source.id,
            productId: source.outputProductId ?? '',
            unitId: source.yieldUnitId ?? source.outputProduct?.unitId ?? line.unitId,
            section: line.section || source.name,
            createProduct: false,
          }
        : { sourceTechnicalSheetId: '', productId: '' },
    );
  };

  const patchStep = (index: number, patch: Partial<(typeof steps)[number]>) => {
    const next = [...steps];
    next[index] = { ...next[index], ...patch };
    setForm({ ...form, steps: next });
  };

  const selectRecipeMode = (mode: 'ASSEMBLY' | 'PRODUCTION') => {
    const production = mode === 'PRODUCTION';
    setForm({
      ...form,
      mode,
      stockPolicy: 'MAKE_TO_STOCK',
      yieldMode: form.yieldMode ?? 'PORTIONS',
      referencePortions: Math.max(Number(form.referencePortions || (production ? 10 : 1)), 1),
      trackOutputStock: true,
      createOutputProduct: true,
      outputProductKind: production ? 'INTERMEDIATE' : 'FINISHED',
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#1e293b',
          }}
        >
          {/* Header */}
          <div
            style={{
              height: '72px',
              padding: '0 2rem',
              background: '#ffffff',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: '#64748b',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <ArrowLeft size={18} />
                <span>Retour</span>
              </button>
              <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  {editing ? 'Modifier la fiche technique' : 'Créer une fiche technique'}
                  {form.name && (
                    <span style={{ color: '#64748b', fontWeight: 400, fontSize: '1.1rem' }}>
                      · {form.name}
                    </span>
                  )}
                </h2>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Status Badge */}
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  background: form.status === 'ACTIVE' ? '#ecfdf5' : '#f1f5f9',
                  color: form.status === 'ACTIVE' ? '#059669' : '#475569',
                  border: form.status === 'ACTIVE' ? '1px solid #10b981' : '1px solid #cbd5e1',
                  marginRight: '0.5rem',
                }}
              >
                {form.status === 'ACTIVE' ? 'Actif' : 'Brouillon'}
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{ height: '40px', padding: '0 1.25rem' }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading || !form.name.trim() || !form.categoryId}
                onClick={onSave}
                style={{
                  height: '40px',
                  padding: '0 1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 600,
                }}
              >
                {loading
                  ? 'Enregistrement...'
                  : editing
                    ? 'Enregistrer les modifications'
                    : 'Créer la fiche technique'}
              </button>
            </div>
          </div>

          {!form.mode ? (
            <div className="technical-sheet-mode-overlay">
              <section className="technical-sheet-mode-panel">
                <header className="technical-sheet-mode-header">
                  <span className="technical-sheet-mode-kicker">
                    <Sparkles size={14} /> Création guidée
                  </span>
                  <h2>Quel résultat souhaitez-vous obtenir ?</h2>
                  <p>
                    Choisissez selon l’utilisation du résultat final. ToqueHub préparera ensuite les
                    champs adaptés à votre fiche. Ce choix pourra être modifié plus tard.
                  </p>
                </header>

                <div className="technical-sheet-mode-grid">
                  <button
                    type="button"
                    className="technical-sheet-mode-card final"
                    onClick={() => selectRecipeMode('ASSEMBLY')}
                  >
                    <div className="technical-sheet-mode-card-top">
                      <span className="technical-sheet-mode-icon">
                        <Utensils size={25} />
                      </span>
                      <span className="technical-sheet-mode-label">Servi ou vendu directement</span>
                    </div>
                    <strong>Plat ou produit fini</strong>
                    <p>
                      Choisissez cette option pour une recette terminée que vous servez ou vendez
                      directement au client.
                    </p>
                    <div className="technical-sheet-mode-examples">
                      <span>Plat</span>
                      <span>Sandwich</span>
                      <span>Cocktail</span>
                      <span>Dessert</span>
                    </div>
                    <span className="technical-sheet-mode-action">
                      Choisir ce type de fiche <ArrowRight size={16} />
                    </span>
                  </button>

                  <button
                    type="button"
                    className="technical-sheet-mode-card preparation"
                    onClick={() => selectRecipeMode('PRODUCTION')}
                  >
                    <div className="technical-sheet-mode-card-top">
                      <span className="technical-sheet-mode-icon">
                        <ChefHat size={26} />
                      </span>
                      <span className="technical-sheet-mode-label">
                        Réutilisé dans d’autres recettes
                      </span>
                    </div>
                    <strong>Préparation intermédiaire</strong>
                    <p>
                      Choisissez cette option pour une préparation fabriquée à l’avance, stockée
                      puis utilisée dans un ou plusieurs produits finis.
                    </p>
                    <div className="technical-sheet-mode-examples">
                      <span>Sauce</span>
                      <span>Ganache</span>
                      <span>Pâte</span>
                      <span>Biscuit</span>
                    </div>
                    <span className="technical-sheet-mode-action">
                      Choisir ce type de fiche <ArrowRight size={16} />
                    </span>
                  </button>
                </div>

                <div className="technical-sheet-mode-help">
                  <Info size={18} />
                  <div>
                    <strong>Vous hésitez ?</strong>
                    <span>
                      Si le résultat est directement présenté au client, choisissez « Plat ou
                      produit fini ». S’il sert à fabriquer autre chose, choisissez « Préparation
                      intermédiaire ».
                    </span>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {/* Main Body */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '400px 1fr',
              flex: 1,
              overflow: 'hidden',
              background: '#f8fafc',
            }}
          >
            {/* Sidebar (Left) */}
            <div
              style={{
                background: '#ffffff',
                borderRight: '1px solid #e2e8f0',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  background: form.mode === 'PRODUCTION' ? '#ecfdf5' : '#eff6ff',
                  border: `1px solid ${form.mode === 'PRODUCTION' ? '#a7f3d0' : '#bfdbfe'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      color: '#64748b',
                      textTransform: 'uppercase',
                    }}
                  >
                    Type de fiche
                  </span>
                  <strong style={{ color: form.mode === 'PRODUCTION' ? '#047857' : '#1d4ed8' }}>
                    {form.mode === 'PRODUCTION'
                      ? 'Fabrication / préparation'
                      : 'Assemblage / produit fini'}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, mode: undefined })}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: '#64748b',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Changer
                </button>
              </div>

              {/* Image Preview / Cover */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                  Photo de couverture
                </span>
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    borderRadius: '12px',
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {form.photoUrl ? (
                    <img
                      src={form.photoUrl}
                      alt="Aperçu de la recette"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          const fallback = parent.querySelector('.photo-fallback');
                          if (fallback) fallback.removeAttribute('style');
                        }
                      }}
                    />
                  ) : null}
                  <div className="photo-fallback" style={form.photoUrl ? { display: 'none' } : {}}>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: '#94a3b8',
                      }}
                    >
                      <Camera size={36} />
                      <span style={{ fontSize: '0.8rem' }}>Aucune image configurée</span>
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="URL de la photo (https://...)"
                  value={form.photoUrl ?? ''}
                  onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
                  style={{
                    fontSize: '0.85rem',
                    padding: '0.6rem 0.8rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    width: '100%',
                    marginTop: '0.25rem',
                  }}
                />
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '0.25rem 0' }} />

              {/* Form Metadata */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  Nom de la fiche *
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="ex: Velouté de potimarron"
                    required
                    style={{
                      padding: '0.65rem 0.8rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                    }}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  Catégorie recette *
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    required
                    style={{
                      padding: '0.65rem 0.8rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      background: 'white',
                    }}
                  >
                    <option value="">Choisir une catégorie...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  Description
                  <textarea
                    rows={4}
                    value={form.description ?? ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Détails généraux de la préparation..."
                    style={{
                      padding: '0.65rem 0.8rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
                </label>

                <hr
                  style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '0.25rem 0' }}
                />

                {/* Metrics block */}
                <h3
                  style={{
                    margin: 0,
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#64748b',
                  }}
                >
                  Paramètres de la fiche
                </h3>

                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  Rendement de référence
                  <select
                    value={form.yieldMode ?? 'PORTIONS'}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        yieldMode: event.target.value as 'PORTIONS' | 'MASS',
                        yieldUnitId: undefined,
                      })
                    }
                    style={{
                      padding: '0.65rem 0.8rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      background: 'white',
                      width: '100%',
                    }}
                  >
                    <option value="PORTIONS">Nombre de portions obtenues</option>
                    <option value="MASS">Masse totale obtenue</option>
                  </select>
                  <small style={{ color: '#64748b', fontWeight: 500, lineHeight: 1.4 }}>
                    Ce rendement décrit le résultat d’une fiche complète. Le multiplicateur reste
                    séparé dans l’aperçu des besoins.
                  </small>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    {(form.yieldMode ?? 'PORTIONS') === 'PORTIONS'
                      ? 'Portions obtenues'
                      : 'Masse totale calculée'}
                    <div style={{ position: 'relative' }}>
                      {(form.yieldMode ?? 'PORTIONS') === 'PORTIONS' ? (
                        <input
                          type="number"
                          step="any"
                          min={0.001}
                          value={form.referencePortions ?? 1}
                          onChange={(e) =>
                            setForm({ ...form, referencePortions: Number(e.target.value) })
                          }
                          style={{
                            padding: '0.65rem 0.8rem 0.65rem 2.25rem',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            width: '100%',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            minHeight: '40px',
                            padding: '0.65rem 0.8rem 0.65rem 2.25rem',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            width: '100%',
                            background: '#f8fafc',
                            color: totalMassGrams > 0 ? '#0f172a' : '#b45309',
                          }}
                        >
                          {formatMass(totalMassGrams)}
                        </div>
                      )}
                      {(form.yieldMode ?? 'PORTIONS') === 'PORTIONS' ? (
                        <Utensils
                          size={14}
                          style={{
                            position: 'absolute',
                            left: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#94a3b8',
                          }}
                        />
                      ) : (
                        <Scale
                          size={14}
                          style={{
                            position: 'absolute',
                            left: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#94a3b8',
                          }}
                        />
                      )}
                    </div>
                    {(form.yieldMode ?? 'PORTIONS') === 'PORTIONS' ? (
                      <small style={{ color: '#64748b', fontWeight: 500 }}>
                        Masse des ingrédients : {formatMass(totalMassGrams)}
                      </small>
                    ) : null}
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Statut de la fiche
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      style={{
                        padding: '0.65rem 0.8rem',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        background: 'white',
                        width: '100%',
                      }}
                    >
                      {statuses.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Prépa (min)
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min={0}
                        value={form.prepTimeMinutes ?? 0}
                        onChange={(e) =>
                          setForm({ ...form, prepTimeMinutes: Number(e.target.value) })
                        }
                        style={{
                          padding: '0.65rem 0.8rem 0.65rem 2.25rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          width: '100%',
                        }}
                      />
                      <Clock
                        size={14}
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#94a3b8',
                        }}
                      />
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Cuisson (min)
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min={0}
                        value={form.cookTimeMinutes ?? 0}
                        onChange={(e) =>
                          setForm({ ...form, cookTimeMinutes: Number(e.target.value) })
                        }
                        style={{
                          padding: '0.65rem 0.8rem 0.65rem 2.25rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          width: '100%',
                        }}
                      />
                      <Clock
                        size={14}
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#94a3b8',
                        }}
                      />
                    </div>
                  </label>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '0.65rem',
                  }}
                >
                  <div
                    style={{
                      padding: '0.7rem 0.8rem',
                      borderRadius: '10px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        color: '#64748b',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                      }}
                    >
                      COÛT TOTAL DE LA FICHE
                    </span>
                    <strong style={{ display: 'block', color: '#166534', marginTop: '0.2rem' }}>
                      {money(totalCost)}
                    </strong>
                  </div>
                  {(form.yieldMode ?? 'PORTIONS') === 'PORTIONS' ? (
                    <div
                      style={{
                        padding: '0.7rem 0.8rem',
                        borderRadius: '10px',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          color: '#64748b',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                        }}
                      >
                        COÛT PAR PORTION
                      </span>
                      <strong style={{ display: 'block', color: '#1d4ed8', marginTop: '0.2rem' }}>
                        {costPerPortion == null ? '—' : money(costPerPortion)}
                      </strong>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '0.7rem 0.8rem',
                        borderRadius: '10px',
                        background: '#fff7ed',
                        border: '1px solid #fed7aa',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          color: '#64748b',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                        }}
                      >
                        COÛT PAR KILO
                      </span>
                      <strong style={{ display: 'block', color: '#c2410c', marginTop: '0.2rem' }}>
                        {costPerKg == null ? '—' : money(costPerKg)}
                      </strong>
                    </div>
                  )}
                </div>
                {hasNonCalculableCost ? (
                  <small style={{ color: '#b45309', lineHeight: 1.4 }}>
                    Certaines lignes n’ont pas de prix ou de conversion compatible : le total
                    affiché est partiel.
                  </small>
                ) : null}
              </div>
            </div>

            {/* Right Pane (Ingredients and Steps workspace) */}
            <div
              style={{
                padding: '2.5rem 3rem',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '2.5rem',
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #eff6ff, #f8fafc)',
                  borderRadius: '16px',
                  border: '1px solid #bfdbfe',
                  padding: '1.25rem 1.5rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    marginBottom: '0.8rem',
                  }}
                >
                  <div>
                    <strong style={{ color: '#1e3a8a' }}>Aperçu automatique des besoins</strong>
                    <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                      La quantité souhaitée calcule un multiplicateur sans modifier le rendement de
                      la fiche.
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'end',
                      gap: '0.55rem',
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        color: '#334155',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                      }}
                    >
                      Calculer par
                      <select
                        value={previewMode}
                        onChange={(event) => {
                          const mode = event.target.value as 'PORTIONS' | 'MASS';
                          setPreviewMode(mode);
                          setPreviewQuantity(
                            mode === 'MASS'
                              ? Math.max(totalMassGrams / 1_000, 0.001)
                              : Math.max(Number(form.referencePortions || 0), 0.001),
                          );
                        }}
                        style={{ minWidth: '125px', margin: 0 }}
                      >
                        <option value="PORTIONS">Portions</option>
                        <option value="MASS">Masse totale</option>
                      </select>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        color: '#334155',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                      }}
                    >
                      {previewMode === 'MASS' ? 'Masse souhaitée (kg)' : 'Portions souhaitées'}
                      <input
                        type="number"
                        min={0.001}
                        step="any"
                        value={previewQuantity}
                        onChange={(e) =>
                          setPreviewQuantity(Math.max(Number(e.target.value || 0), 0.001))
                        }
                        style={{ width: '125px', margin: 0 }}
                      />
                    </label>
                    <div
                      style={{
                        minWidth: '105px',
                        padding: '0.55rem 0.7rem',
                        borderRadius: '9px',
                        background: '#dbeafe',
                        color: '#1e3a8a',
                        textAlign: 'center',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700 }}>
                        MULTIPLICATEUR
                      </span>
                      <strong>
                        ×{previewRatio.toLocaleString(activeLocale(), { maximumFractionDigits: 3 })}
                      </strong>
                    </div>
                  </div>
                </div>
                {previewBase <= 0 ? (
                  <div style={{ color: '#b45309', fontSize: '0.78rem', marginBottom: '0.75rem' }}>
                    {previewMode === 'MASS'
                      ? 'Ajoutez un ingrédient en unité de masse pour simuler un poids total.'
                      : 'Renseignez le nombre de portions obtenues pour simuler par portions.'}
                  </div>
                ) : null}
                {ingredients.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                        gap: '0.55rem',
                      }}
                    >
                      {ingredients.slice(0, 8).map((line, index) => {
                        const product = products.find((item) => item.id === line.productId);
                        const source = recipes.find(
                          (item) => item.id === line.sourceTechnicalSheetId,
                        );
                        const unit = units.find((item) => item.id === line.unitId);
                        const lineCost = ingredientCosts[index];
                        return (
                          <div
                            key={index}
                            style={{
                              background: '#fff',
                              border: '1px solid #dbeafe',
                              borderRadius: '9px',
                              padding: '0.65rem 0.75rem',
                            }}
                          >
                            <span
                              style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}
                            >
                              {source
                                ? `Sous-recette · ${source.name}`
                                : product?.name || line.productName || 'Composant'}
                            </span>
                            <strong style={{ display: 'block', color: '#1e3a8a' }}>
                              {(Number(line.quantity) * previewRatio).toLocaleString(
                                activeLocale(),
                                {
                                  maximumFractionDigits: 3,
                                },
                              )}{' '}
                              {unit?.symbol || ''}
                            </strong>
                            <small style={{ color: '#64748b' }}>
                              {lineCost == null
                                ? 'Coût non calculable'
                                : `Coût utilisé ${money(lineCost * previewRatio)}`}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                    {ingredients.some((line) => line.sourceTechnicalSheetId) ? (
                      <div
                        style={{
                          background: '#ffffff',
                          border: '1px solid #bbf7d0',
                          borderRadius: '11px',
                          padding: '0.8rem',
                        }}
                      >
                        <div
                          style={{
                            color: '#166534',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            marginBottom: '0.35rem',
                          }}
                        >
                          Arbre de fabrication
                        </div>
                        <div
                          style={{ color: '#64748b', fontSize: '0.72rem', marginBottom: '0.55rem' }}
                        >
                          Les préparations intermédiaires sont automatiquement décomposées jusqu’aux
                          produits Stocks.
                        </div>
                        {ingredients.map((line, index) => (
                          <RecipeCompositionNode
                            key={`composition-${line.sourceTechnicalSheetId || line.productId || index}`}
                            line={line}
                            ratio={previewRatio}
                            recipes={recipes}
                            products={products}
                            units={units}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
                    Ajoutez un composant pour voir le calcul.
                  </span>
                )}
              </div>

              {/* Ingredients Section */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: '2rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h3
                      style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}
                    >
                      {form.mode === 'PRODUCTION'
                        ? 'Ingrédients de fabrication'
                        : 'Composants de l’assemblage'}
                    </h3>
                    <span
                      style={{
                        background: '#eff6ff',
                        color: '#2563eb',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                      }}
                    >
                      {ingredients.length} {ingredients.length > 1 ? 'composants' : 'composant'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                    {form.mode === 'ASSEMBLY' ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!subRecipeOptions.length}
                        title={
                          subRecipeOptions.length
                            ? 'Ajouter une fabrication déjà active'
                            : 'Créez et activez d’abord une fiche de fabrication'
                        }
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          borderRadius: '8px',
                          padding: '0.4rem 0.8rem',
                        }}
                        onClick={() =>
                          setForm({
                            ...form,
                            ingredients: [
                              ...ingredients,
                              {
                                componentType: 'SUB_RECIPE',
                                productId: '',
                                sourceTechnicalSheetId: '',
                                unitId: units[0]?.id ?? '',
                                quantity: 1,
                                section: '',
                                comment: '',
                              },
                            ],
                          })
                        }
                      >
                        <Copy size={14} /> Ajouter une sous-recette
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        borderRadius: '8px',
                        padding: '0.4rem 0.8rem',
                      }}
                      onClick={() =>
                        setForm({
                          ...form,
                          ingredients: [
                            ...ingredients,
                            {
                              componentType: 'PRODUCT',
                              productId: '',
                              unitId: units[0]?.id ?? '',
                              quantity: 1,
                              section: '',
                              comment: '',
                            },
                          ],
                        })
                      }
                    >
                      <Plus size={14} /> Ajouter un produit
                    </button>
                  </div>
                </div>

                {ingredients.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {ingredients.map((line, index) => {
                      const selectedProduct = products.find((p) => p.id === line.productId);
                      const selectedSubRecipe = subRecipeOptions.find(
                        (recipe) => recipe.id === line.sourceTechnicalSheetId,
                      );
                      const stockUnit =
                        selectedProduct?.unit ??
                        units.find((unit) => unit.id === selectedProduct?.unitId);
                      const stockUnitPrice = Number(
                        selectedProduct?.averagePrice ?? selectedProduct?.averagePurchasePrice ?? 0,
                      );
                      const stockMassFactor = unitCanonicalFactor(stockUnit);
                      const stockPricePerKg =
                        selectedProduct &&
                        String(stockUnit?.type ?? stockUnit?.unitType ?? '').toUpperCase() ===
                          'MASS' &&
                        stockMassFactor
                          ? stockUnitPrice * (1_000 / stockMassFactor)
                          : null;
                      const usedCost = ingredientCosts[index];
                      return (
                        <div
                          key={index}
                          style={{
                            padding: '1.25rem',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                            transition: 'border-color 0.2s',
                            position: 'relative',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#cbd5e1')}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '2.5fr 1fr 1fr auto',
                              gap: '0.75rem',
                              alignItems: 'end',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                margin: 0,
                              }}
                            >
                              {line.componentType === 'SUB_RECIPE' || line.sourceTechnicalSheetId
                                ? 'Sous-recette'
                                : 'Produit Stocks'}
                              {line.componentType === 'SUB_RECIPE' ||
                              line.sourceTechnicalSheetId ? (
                                <button
                                  type="button"
                                  className={
                                    selectedSubRecipe
                                      ? 'technical-sheet-picker-trigger selected'
                                      : 'technical-sheet-picker-trigger'
                                  }
                                  onClick={() => setSubRecipePickerIndex(index)}
                                >
                                  <span className="technical-sheet-picker-trigger-icon">
                                    <Search size={18} />
                                  </span>
                                  <span className="technical-sheet-picker-trigger-copy">
                                    <strong>
                                      {selectedSubRecipe?.name ?? 'Rechercher une préparation'}
                                    </strong>
                                    <small>
                                      {selectedSubRecipe
                                        ? `${selectedSubRecipe.category?.name ?? 'Sans catégorie'} · rendement ${
                                            selectedSubRecipe.yieldMode === 'MASS'
                                              ? formatMass(
                                                  Number(selectedSubRecipe.totalMassGrams ?? 0),
                                                )
                                              : `${Number(
                                                  selectedSubRecipe.referencePortions ?? 1,
                                                ).toLocaleString(activeLocale())} portions`
                                          }`
                                        : `${subRecipeOptions.length} préparation(s) active(s)`}
                                    </small>
                                  </span>
                                  <span className="technical-sheet-picker-trigger-action">
                                    {selectedSubRecipe ? 'Changer' : 'Rechercher'}
                                  </span>
                                </button>
                              ) : line.createProduct && !line.productId ? (
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.35rem',
                                    padding: '0.65rem',
                                    border: '1px solid #a7f3d0',
                                    borderRadius: '8px',
                                    background: '#ecfdf5',
                                  }}
                                >
                                  <span
                                    style={{
                                      color: '#047857',
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                    }}
                                  >
                                    Nouveau produit Stocks à créer
                                  </span>
                                  <input
                                    value={line.productName ?? ''}
                                    onChange={(event) =>
                                      patchIngredient(index, { productName: event.target.value })
                                    }
                                    aria-label="Nom du nouveau produit Stocks"
                                    style={{ margin: 0, background: '#ffffff' }}
                                  />
                                  {line.productSku || line.productGtin ? (
                                    <span
                                      style={{
                                        color: '#64748b',
                                        fontSize: '0.7rem',
                                        fontWeight: 500,
                                      }}
                                    >
                                      {[
                                        line.productSku ? `SAP ${line.productSku}` : '',
                                        line.productGtin ? `GTIN ${line.productGtin}` : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                              {line.componentType !== 'SUB_RECIPE' &&
                              !line.sourceTechnicalSheetId ? (
                                <ProductSelect
                                  products={products}
                                  value={line.productId ?? ''}
                                  placeholder={
                                    line.createProduct
                                      ? 'Ou associer à un produit existant...'
                                      : undefined
                                  }
                                  onChange={(productId) => {
                                    const product = products.find((p) => p.id === productId);
                                    patchIngredient(
                                      index,
                                      productId
                                        ? {
                                            productId,
                                            unitId: product?.unitId ?? line.unitId,
                                            createProduct: false,
                                            componentType: 'PRODUCT',
                                          }
                                        : { productId },
                                    );
                                  }}
                                />
                              ) : null}
                            </div>
                            <label
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                margin: 0,
                              }}
                            >
                              Quantité
                              <input
                                type="number"
                                step="any"
                                min={0.001}
                                value={line.quantity}
                                onChange={(e) =>
                                  patchIngredient(index, { quantity: Number(e.target.value) })
                                }
                                required
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  fontSize: '0.85rem',
                                }}
                              />
                            </label>
                            <label
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                margin: 0,
                              }}
                            >
                              Unité
                              <select
                                value={line.unitId}
                                onChange={(e) => patchIngredient(index, { unitId: e.target.value })}
                                required
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  fontSize: '0.85rem',
                                  background: 'white',
                                  marginBottom: 0,
                                }}
                              >
                                {units.map((unit) => (
                                  <option key={unit.id} value={unit.id}>
                                    {unit.name} ({unit.symbol})
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="icon-btn danger"
                              style={{
                                height: '36px',
                                width: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                borderRadius: '8px',
                                border: '1px solid #fee2e2',
                                background: '#fef2f2',
                                color: '#ef4444',
                                cursor: 'pointer',
                              }}
                              onClick={() =>
                                setForm({
                                  ...form,
                                  ingredients: ingredients.filter((_, i) => i !== index),
                                })
                              }
                              title="Supprimer la ligne"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {form.mode === 'PRODUCTION' ? (
                              <input
                                placeholder="Phase (ex. Ganache)"
                                value={line.section ?? ''}
                                onChange={(e) =>
                                  patchIngredient(index, { section: e.target.value })
                                }
                                style={{
                                  fontSize: '0.85rem',
                                  padding: '0.5rem 0.75rem',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  width: '180px',
                                  marginBottom: 0,
                                  background: '#ffffff',
                                }}
                              />
                            ) : null}
                            <input
                              placeholder="Commentaire de préparation (ex: émincé finement, réserver le jus...)"
                              value={line.comment ?? ''}
                              onChange={(e) => patchIngredient(index, { comment: e.target.value })}
                              style={{
                                fontSize: '0.85rem',
                                padding: '0.5rem 0.75rem',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                width: '100%',
                                marginBottom: 0,
                                background: '#ffffff',
                              }}
                            />
                            {selectedProduct ? (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '0.45rem',
                                  flexWrap: 'wrap',
                                  justifyContent: 'flex-end',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    color: '#475569',
                                    whiteSpace: 'nowrap',
                                    background: '#f1f5f9',
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '6px',
                                  }}
                                >
                                  Prix Stocks : {money(stockUnitPrice)} /{' '}
                                  {stockUnit?.symbol ?? 'unité'}
                                </span>
                                {stockPricePerKg != null ? (
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      color: '#475569',
                                      whiteSpace: 'nowrap',
                                      background: '#fff7ed',
                                      padding: '0.3rem 0.6rem',
                                      borderRadius: '6px',
                                    }}
                                  >
                                    Prix au kilo : {money(stockPricePerKg)} / kg
                                  </span>
                                ) : null}
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    color: usedCost == null ? '#b45309' : '#166534',
                                    whiteSpace: 'nowrap',
                                    background: usedCost == null ? '#fffbeb' : '#f0fdf4',
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '6px',
                                    fontWeight: 700,
                                  }}
                                >
                                  Coût utilisé :{' '}
                                  {usedCost == null ? 'conversion requise' : money(usedCost)}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '2.5rem 1.5rem',
                      border: '2px dashed #e2e8f0',
                      borderRadius: '12px',
                      color: '#94a3b8',
                      fontSize: '0.88rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <ChefHat size={32} style={{ color: '#cbd5e1' }} />
                    <span>
                      Aucun ingrédient renseigné pour le moment. Cliquez sur "Ajouter un ingrédient"
                      pour commencer.
                    </span>
                  </div>
                )}
              </div>

              {/* Steps Section */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: '2rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h3
                      style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}
                    >
                      Étapes de préparation
                    </h3>
                    <span
                      style={{
                        background: '#f0fdf4',
                        color: '#16a34a',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                      }}
                    >
                      {steps.length} {steps.length > 1 ? 'étapes' : 'étape'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      borderRadius: '8px',
                      padding: '0.4rem 0.8rem',
                    }}
                    onClick={() =>
                      setForm({
                        ...form,
                        steps: [
                          ...steps,
                          {
                            order: steps.length + 1,
                            title: '',
                            description: '',
                            estimatedTimeMinutes: 0,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={14} /> Ajouter une étape
                  </button>
                </div>

                {steps.length > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                      position: 'relative',
                    }}
                  >
                    {/* Vertical timeline line */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '20px',
                        top: '15px',
                        bottom: '15px',
                        width: '2px',
                        background: '#e2e8f0',
                        zIndex: 0,
                      }}
                    />

                    {steps.map((step, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          gap: '1.25rem',
                          position: 'relative',
                          zIndex: 1,
                        }}
                      >
                        {/* Timeline Step number circle */}
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: '#3b82f6',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            flexShrink: 0,
                            border: '4px solid #ffffff',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            alignSelf: 'flex-start',
                            marginTop: '6px',
                            lineHeight: '32px',
                            textAlign: 'center',
                          }}
                        >
                          {step.order}
                        </div>

                        <div
                          style={{
                            flex: 1,
                            padding: '1.25rem',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            display: 'grid',
                            gridTemplateColumns:
                              form.mode === 'PRODUCTION'
                                ? '75px 1.2fr 1.5fr 2.4fr 110px auto'
                                : '80px 2fr 3fr 120px auto',
                            gap: '0.75rem',
                            alignItems: 'end',
                            transition: 'border-color 0.2s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#cbd5e1')}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                        >
                          <label
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.35rem',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              margin: 0,
                            }}
                          >
                            Ordre
                            <input
                              type="number"
                              min={1}
                              value={step.order}
                              onChange={(e) => patchStep(index, { order: Number(e.target.value) })}
                              style={{
                                padding: '0.5rem 0.75rem',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                marginBottom: 0,
                              }}
                            />
                          </label>
                          {form.mode === 'PRODUCTION' ? (
                            <label
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                margin: 0,
                              }}
                            >
                              Phase
                              <input
                                value={step.section ?? ''}
                                onChange={(e) => patchStep(index, { section: e.target.value })}
                                placeholder="ex: Ganache"
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  fontSize: '0.85rem',
                                  marginBottom: 0,
                                }}
                              />
                            </label>
                          ) : null}
                          <label
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.35rem',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              margin: 0,
                            }}
                          >
                            Titre de l'étape
                            <input
                              value={step.title}
                              onChange={(e) => patchStep(index, { title: e.target.value })}
                              placeholder="ex: Cuisson, Dressage..."
                              required
                              style={{
                                padding: '0.5rem 0.75rem',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                marginBottom: 0,
                              }}
                            />
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.35rem',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              margin: 0,
                            }}
                          >
                            Instructions
                            <input
                              value={step.description}
                              onChange={(e) => patchStep(index, { description: e.target.value })}
                              placeholder="Détails étape..."
                              required
                              style={{
                                padding: '0.5rem 0.75rem',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                marginBottom: 0,
                              }}
                            />
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.35rem',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              margin: 0,
                            }}
                          >
                            <span>
                              Durée (min) <span style={{ color: '#dc2626' }}>*</span>
                            </span>
                            <div style={{ position: 'relative' }}>
                              <input
                                id={`technical-sheet-step-duration-${index}`}
                                type="number"
                                min={1}
                                step={1}
                                required
                                aria-required="true"
                                aria-invalid={
                                  !Number.isInteger(Number(step.estimatedTimeMinutes)) ||
                                  Number(step.estimatedTimeMinutes) <= 0
                                }
                                value={step.estimatedTimeMinutes || ''}
                                onChange={(e) =>
                                  patchStep(index, {
                                    estimatedTimeMinutes:
                                      e.target.value === '' ? 0 : Number(e.target.value),
                                  })
                                }
                                placeholder="Obligatoire"
                                style={{
                                  padding: '0.5rem 0.75rem 0.5rem 2.0rem',
                                  border:
                                    Number.isInteger(Number(step.estimatedTimeMinutes)) &&
                                    Number(step.estimatedTimeMinutes) > 0
                                      ? '1px solid #cbd5e1'
                                      : '1px solid #fca5a5',
                                  borderRadius: '8px',
                                  fontSize: '0.85rem',
                                  width: '100%',
                                  marginBottom: 0,
                                }}
                              />
                              <Clock
                                size={12}
                                style={{
                                  position: 'absolute',
                                  left: '8px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  color: '#94a3b8',
                                }}
                              />
                            </div>
                          </label>
                          <button
                            type="button"
                            className="icon-btn danger"
                            style={{
                              height: '36px',
                              width: '36px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              borderRadius: '8px',
                              border: '1px solid #fee2e2',
                              background: '#fef2f2',
                              color: '#ef4444',
                              cursor: 'pointer',
                            }}
                            onClick={() =>
                              setForm({
                                ...form,
                                steps: steps
                                  .filter((_, i) => i !== index)
                                  .map((s, i) => ({ ...s, order: i + 1 })),
                              })
                            }
                            title="Supprimer l'étape"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '2.5rem 1.5rem',
                      border: '2px dashed #e2e8f0',
                      borderRadius: '12px',
                      color: '#94a3b8',
                      fontSize: '0.88rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <ClipboardList size={32} style={{ color: '#cbd5e1' }} />
                    <span>
                      Aucune étape renseignée pour le moment. Cliquez sur "Ajouter une étape" pour
                      commencer.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Bottom Validation Banner */}
          <div
            style={{
              height: '64px',
              background: '#ffffff',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '0 2.5rem',
              flexShrink: 0,
              boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.02)',
            }}
          >
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{ height: '36px', fontSize: '0.88rem' }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading || !form.name.trim() || !form.categoryId}
                onClick={onSave}
                style={{ height: '36px', fontSize: '0.88rem', fontWeight: 600 }}
              >
                {loading
                  ? 'Enregistrement...'
                  : editing
                    ? 'Enregistrer les modifications'
                    : 'Créer la fiche technique'}
              </button>
            </div>
          </div>

          <TechnicalSheetPickerModal
            open={open && subRecipePickerIndex !== null}
            items={subRecipePickerItems}
            selectedSheetId={
              subRecipePickerIndex === null
                ? ''
                : (ingredients[subRecipePickerIndex]?.sourceTechnicalSheetId ?? '')
            }
            title="Catalogue des préparations"
            subtitle="Recherchez une fiche de fabrication active, puis choisissez-la comme sous-recette."
            emptyMessage="Aucune préparation active ne correspond à cette recherche."
            onClose={() => setSubRecipePickerIndex(null)}
            onSelectSheet={(item) => {
              if (subRecipePickerIndex === null) return;
              selectSubRecipe(subRecipePickerIndex, item.id);
              setSubRecipePickerIndex(null);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

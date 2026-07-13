// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Archive,
  Calculator,
  ChefHat,
  ClipboardList,
  Copy,
  Download,
  Edit3,
  FileText,
  History,
  Plus,
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
} from 'lucide-react';
import { api } from '../api/client';
import type {
  Product,
  TechnicalSheetCategory,
  TechnicalSheetDashboard,
  TechnicalSheetHistoryEntry,
  TechnicalSheetOnboarding,
  TechnicalSheetRecipe,
  TechnicalSheetRecipeImportStatus,
  TechnicalSheetRecipePayload,
  TechnicalSheetSalesTaxPolicy,
  TechnicalSheetSimulation,
  TechnicalSheetSimulationPayload,
  Unit,
} from '../types';

type TechnicalSheetsTab = 'dashboard' | 'recipes' | 'categories' | 'costs' | 'production';

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
  { value: 'VALIDATED', label: 'Validé' },
  { value: 'ARCHIVED', label: 'Archivé' },
];

const MAX_RECIPE_IMPORT_FILES = 10;

const emptyRecipe: TechnicalSheetRecipePayload = {
  name: '',
  description: '',
  categoryId: '',
  photoUrl: '',
  referencePortions: 10,
  prepTimeMinutes: 0,
  cookTimeMinutes: 0,
  status: 'DRAFT',
  ingredients: [],
  steps: [],
};

const money = (value?: number | string | null) => `${Number(value ?? 0).toFixed(2)} €`;
const date = (value?: string | null) => (value ? new Date(value).toLocaleDateString('fr-FR') : '—');
const isArchived = (item?: { isArchived?: boolean; archivedAt?: string | null }) => Boolean(item?.isArchived || item?.archivedAt);
const recipeImportWorking = (status: TechnicalSheetRecipeImportStatus) => !['vérifier', 'erreur'].includes(status.state);
const formatImportBytes = (value: number) => value >= 1024 * 1024 ? `${(value / (1024 * 1024)).toFixed(1)} Mo` : `${Math.max(1, Math.round(value / 1024))} Ko`;

function recipePayloadForSave(form: TechnicalSheetRecipePayload, importDocumentId: string | null): TechnicalSheetRecipePayload {
  const payload: TechnicalSheetRecipePayload = {
    ...form,
    ingredients: (form.ingredients ?? []).map(({ id: _id, ...ingredient }) => ingredient),
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
        <div className="modal-overlay" onClick={onClose} style={{ pointerEvents: 'auto', zIndex: 1100 }}>
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
            <div className="modal-body" style={{ padding: '1.5rem' }}>{children}</div>
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
  placeholder = "Rechercher un produit Stocks..."
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

  const selectedProduct = products.find(p => p.id === value);
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const categoriesList = useMemo(() => {
    const names = products.map(p => p.category?.name).filter(Boolean) as string[];
    return Array.from(new Set(names));
  }, [products]);

  const catalogFiltered = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
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
                color: 'var(--text-muted)'
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
            flexShrink: 0
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
        >
          <ClipboardList size={16} />
        </button>
      </div>

      {isOpen && (
        <div className="custom-autocomplete-dropdown" style={{
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
          marginTop: '4px'
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Aucun produit trouvé
            </div>
          ) : (
            filtered.map(p => (
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
                  fontWeight: value === p.id ? 600 : 400
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
            padding: '2rem'
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
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.75rem',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#ffffff'
            }}>
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
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Filters */}
            <div style={{
              padding: '1rem 1.75rem',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: '1rem'
            }}>
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
                    marginBottom: 0
                  }}
                />
                <Search size={14} style={{ position: 'absolute', left: '10px', color: '#94a3b8' }} />
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
                      color: '#94a3b8'
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
                  marginBottom: 0
                }}
              >
                <option value="">Toutes les catégories</option>
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Modal List Area */}
            <div style={{
              overflowY: 'auto',
              flex: 1,
              padding: '1rem 1.75rem'
            }}>
              {catalogFiltered.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569', fontWeight: 600 }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Produit</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Catégorie</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>SKU/Code</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Prix moyen d'achat</th>
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
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: '#0f172a' }}>{p.name}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          {p.category?.name ? (
                            <span style={{
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 500
                            }}>
                              {p.category.name}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', color: '#475569' }}>
                          {p.sku ?? <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 500 }}>
                          {p.averagePurchasePrice ? money(p.averagePurchasePrice) : money(p.averagePrice ?? 0)}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#64748b' }}>
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
                              borderColor: value === p.id ? 'var(--primary)' : '#cbd5e1'
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
                <div style={{
                  textAlign: 'center',
                  padding: '3rem 1.5rem',
                  color: '#94a3b8',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  <Search size={32} style={{ color: '#cbd5e1' }} />
                  <span>Aucun ingrédient ne correspond à vos critères de recherche.</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.75rem',
              borderTop: '1px solid #f1f5f9',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
              color: '#64748b'
            }}>
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
function MetricCard({ label, value, icon, tone = 'emerald', onClick }: { label: string; value: string | number; icon: React.ReactNode; tone?: string; onClick?: () => void }) {
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
        <div className={`metric-icon-wrapper-modern tone-${tone}`}>
          {icon}
        </div>
        <span className="metric-badge-trend">Mise à jour</span>
      </div>
      <div className="metric-body-modern">
        <span className="metric-value-modern" style={{ fontSize: '1.8rem' }}>{value}</span>
        <span className="metric-label-modern" style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>{label}</span>
      </div>
      <div className="metric-shine" />
    </motion.div>
  );
}

export function TechnicalSheetsApp({ token, tab, stocksInstalled, products, units, onboardingOpen = false, onOnboardingClose, onNavigate }: TechnicalSheetsAppProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [dashboard, setDashboard] = useState<TechnicalSheetDashboard>();
  const [onboarding, setOnboarding] = useState<TechnicalSheetOnboarding>();
  const [onboardingVisible, setOnboardingVisible] = useState(onboardingOpen);
  const [pendingFirstRecipeAction, setPendingFirstRecipeAction] = useState<'ocr' | 'manual' | null>(null);
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
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [requestedPortions, setRequestedPortions] = useState(50);
  const [simulation, setSimulation] = useState<TechnicalSheetSimulation>();
  const [history, setHistory] = useState<TechnicalSheetHistoryEntry[]>([]);
  const [duplicateOpen, setDuplicateOpen] = useState<TechnicalSheetRecipe | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [availableProducts, setAvailableProducts] = useState<Product[]>(products);
  const [importOpen, setImportOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importStatuses, setImportStatuses] = useState<TechnicalSheetRecipeImportStatus[]>([]);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [reviewingImportDocumentId, setReviewingImportDocumentId] = useState<string | null>(null);

  async function load() {
    if (!stocksInstalled) return;
    setLoading(true);
    setError(undefined);
    try {
      const recipeQuery = tab === 'recipes'
        ? { includeArchived: true, search: search || undefined, categoryId: categoryFilter || undefined, status: statusFilter || undefined, pageSize: 200 }
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

  useEffect(() => { void load(); }, [stocksInstalled, tab, search, categoryFilter, statusFilter]);
  useEffect(() => { setAvailableProducts(products); }, [products]);
  useEffect(() => { if (onboardingOpen) setOnboardingVisible(true); }, [onboardingOpen]);
  useEffect(() => {
    if (tab !== 'recipes' || !pendingFirstRecipeAction) return undefined;
    const frame = window.requestAnimationFrame(() => {
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

  const selectedRecipe = useMemo(() => recipes.find((recipe) => recipe.id === selectedRecipeId) ?? recipes[0], [recipes, selectedRecipeId]);
  const activeProducts = useMemo(() => availableProducts.filter((product) => !isArchived(product)), [availableProducts]);
  const averageCost = dashboard?.averageMaterialCost ?? (recipes.length ? recipes.reduce((sum, recipe) => sum + Number(recipe.costTotal ?? recipe.totalCost ?? 0), 0) / recipes.length : 0);

  function openRecipe(recipe?: TechnicalSheetRecipe) {
    setReviewingImportDocumentId(null);
    setEditingRecipe(recipe ?? null);
    setForm(recipe ? {
      name: recipe.name,
      description: recipe.description ?? '',
      categoryId: recipe.categoryId ?? recipe.category?.id ?? '',
      photoUrl: recipe.photoUrl ?? recipe.photoDataUrl ?? '',
      referencePortions: Number(recipe.referencePortions ?? recipe.portions ?? 10),
      prepTimeMinutes: Number(recipe.prepTimeMinutes ?? 0),
      cookTimeMinutes: Number(recipe.cookTimeMinutes ?? 0),
      status: recipe.status ?? 'DRAFT',
      ingredients: (recipe.ingredients ?? []).map((line) => ({
        id: line.id,
        productId: line.productId,
        unitId: line.unitId,
        quantity: Number(line.quantity),
        comment: line.comment ?? '',
      })),
      steps: (recipe.steps ?? []).map((step, index) => ({ id: step.id, order: step.order ?? index + 1, title: step.title ?? '', description: step.description ?? '', estimatedTimeMinutes: Number(step.estimatedTimeMinutes ?? 0) })),
    } : { ...emptyRecipe, categoryId: categories.find((cat) => !isArchived(cat))?.id ?? '', ingredients: [], steps: [] });
    setRecipeDialog(true);
  }

  async function saveRecipe() {
    if (!form.name.trim()) return setError('Le nom de la fiche est requis.');
    if (!form.categoryId) return setError('Choisissez une catégorie recette.');
    if (!form.referencePortions || form.referencePortions <= 0) return setError('Les portions de référence doivent être positives.');
    if ((form.ingredients ?? []).some((line) => !line.productId && !(line.createProduct && line.productName?.trim()))) {
      return setError('Chaque ingrédient doit être associé à un produit Stocks ou défini comme nouveau produit.');
    }
    setLoading(true);
    setError(undefined);
    try {
      const payload = recipePayloadForSave(form, !editingRecipe ? reviewingImportDocumentId : null);
      const savedRecipeName = form.name.trim();
      if (editingRecipe) await api.updateTechnicalSheetRecipe(token, editingRecipe.id, payload);
      else await api.createTechnicalSheetRecipe(token, payload);
      let nextImport: TechnicalSheetRecipeImportStatus | undefined;
      let remainingReadyCount = 0;
      if (reviewingImportDocumentId) {
        const completedDocumentId = reviewingImportDocumentId;
        setReviewingImportDocumentId(null);
        const refreshedStatuses = (await refreshImportStatuses()).filter((status) => status.document.id !== completedDocumentId);
        setImportStatuses(refreshedStatuses);
        const remainingReady = refreshedStatuses.filter((status) => status.state === 'vérifier' && status.result);
        nextImport = remainingReady[0];
        remainingReadyCount = remainingReady.length;
      }
      const refreshedProducts = await api.products(token).catch(() => undefined);
      if (refreshedProducts) setAvailableProducts(refreshedProducts);
      await load();
      if (nextImport) {
        showImportedRecipe(nextImport, false);
        setSuccess(`Fiche « ${savedRecipeName} » créée. La fiche suivante est prête à être vérifiée (${remainingReadyCount} restante${remainingReadyCount > 1 ? 's' : ''}).`);
      } else {
        setRecipeDialog(false);
        setSuccess(editingRecipe ? 'Fiche technique mise à jour.' : 'Fiche technique créée.');
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
    setPendingFirstRecipeAction(mode);
    closeOnboarding();
    onNavigate('recipes');
  }

  async function createCategory() {
    if (!categoryName.trim()) return;
    await api.createTechnicalSheetCategory(token, { name: categoryName.trim(), description: categoryDescription.trim() || undefined });
    setCategoryName('');
    setCategoryDescription('');
    await load();
  }

  async function archiveRecipe(recipe: TechnicalSheetRecipe) {
    if (!window.confirm(`Archiver « ${recipe.name} » ? L’historique et les coûts seront conservés.`)) return;
    await api.archiveTechnicalSheetRecipe(token, recipe.id);
    setSuccess('Fiche archivée sans suppression des données.');
    await load();
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

  async function recalculate(recipe: TechnicalSheetRecipe) {
    await api.recalculateTechnicalSheetRecipe(token, recipe.id);
    setSuccess('Coûts recalculés depuis les prix d’achat Stocks et instantané enregistré.');
    await load();
  }

  async function updateRecipePricing(recipeId: string, payload: { targetSellingPriceExclTax?: number | null; targetSellingPriceInclTax?: number | null }) {
    setError(undefined);
    const updated = await api.updateTechnicalSheetRecipePricing(token, recipeId, payload);
    setRecipes((current) => current.map((recipe) => recipe.id === recipeId ? updated : recipe));
    return updated;
  }

  async function showHistory(recipe: TechnicalSheetRecipe) {
    setSelectedRecipeId(recipe.id);
    setHistory(await api.technicalSheetRecipeHistory(token, recipe.id));
    onNavigate('recipes');
  }

  async function simulate() {
    const recipe = selectedRecipe;
    if (!recipe) return;
    const payload: TechnicalSheetSimulationPayload = { recipeId: recipe.id, requestedPortions };
    const result = await api.simulateTechnicalSheetProduction(token, payload);
    setSimulation(result);
    setSuccess('Simulation proportionnelle préparée. Aucun mouvement de stock déclenché.');
  }

  async function downloadSimulation(format: 'csv' | 'pdf') {
    if (!simulation?.id) return;
    const file = await (format === 'csv' ? api.exportTechnicalSheetProductionCsv(token, simulation.id) : api.exportTechnicalSheetProductionPdf(token, simulation.id));
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitRecipeImports() {
    if (!importFiles.length) return;
    setImportSubmitting(true);
    setError(undefined);
    try {
      const response = await api.uploadTechnicalSheetRecipeImports(token, importFiles);
      setImportStatuses(response.statuses ?? []);
      setImportFiles([]);
      setSuccess(`${response.statuses.length} fiche${response.statuses.length > 1 ? 's' : ''} envoyée${response.statuses.length > 1 ? 's' : ''} en analyse. Le traitement continue pendant votre navigation.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import des fiches techniques impossible.');
    } finally {
      setImportSubmitting(false);
    }
  }

  function showImportedRecipe(status: TechnicalSheetRecipeImportStatus, announce = true) {
    const result = status.result;
    if (!result) return;
    setEditingRecipe(null);
    setReviewingImportDocumentId(status.document.id);
    setForm({
      ...emptyRecipe,
      ...result.payload,
      importDocumentId: status.document.id,
      categoryId: result.payload.categoryId || categories.find((category) => !isArchived(category))?.id || '',
      ingredients: result.payload.ingredients ?? [],
      steps: result.payload.steps ?? [],
    });
    setImportOpen(false);
    setRecipeDialog(true);
    if (announce) {
      const created = result.newProductsCount ? ` ${result.newProductsCount} nouveau(x) produit(s) Stocks seront créés avec la fiche.` : '';
      const skipped = result.skippedIngredientsCount ? ` ${result.skippedIngredientsCount} ingrédient(s) restent à saisir.` : '';
      setSuccess(`Analyse prête : ${result.matchedIngredientsCount} ingrédient(s) rapproché(s) avec Stocks.${created}${skipped}`);
    }
  }

  function openImportedRecipe(status: TechnicalSheetRecipeImportStatus) {
    showImportedRecipe(status, true);
  }

  if (!stocksInstalled) {
    return <BlockingState onInstallStocks={() => onNavigate('dashboard')} />;
  }

  return (
    <div className="technical-sheets-shell" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <motion.section
        className="welcome-hero theme-emerald"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="welcome-tag"><ChefHat size={14} /> Fiches Techniques</span>
        <h1 className="welcome-title">Fiches Techniques</h1>
        <p className="welcome-desc">
          Centralisez et maîtrisez l’ensemble de vos préparations culinaires, avec des ingrédients, unités et prix d'achat directement synchronisés avec vos Stocks.
        </p>
      </motion.section>

      {error ? (
        <div className="alert-modern error">
          <AlertCircle size={18} />
          <div>{error}</div>
          <button className="alert-dismiss" onClick={() => setError(undefined)}><X size={16} /></button>
        </div>
      ) : null}
      
      {success ? (
        <div className="alert-modern success">
          <CheckCircle2 size={18} />
          <div>{success}</div>
          <button className="alert-dismiss" onClick={() => setSuccess(undefined)}><X size={16} /></button>
        </div>
      ) : null}

      <div className="hr-tabs technical-sheets-tabs">
        {([
          ['dashboard', 'Tableau de bord'],
          ['recipes', 'Fiches techniques'],
          ['categories', 'Catégories recettes'],
          ['costs', 'Coûts'],
          ['production', 'Production théorique'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            onClick={() => onNavigate(value)}
          >
            {label}
          </button>
        ))}
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
              categories={categories}
              averageCost={averageCost}
              onStartOnboarding={() => setOnboardingVisible(true)}
              onOpenRecipes={() => onNavigate('recipes')}
              onOpenCategories={() => onNavigate('categories')}
              onOpenCosts={() => onNavigate('costs')}
              onOpenProduction={() => onNavigate('production')}
              loading={loading}
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
              onClearFilters={() => { setSearch(''); setCategoryFilter(''); setStatusFilter(''); }}
              onCreate={() => openRecipe()}
              importStatuses={importStatuses}
              onImport={() => setImportOpen(true)}
              onOpenImportedRecipe={openImportedRecipe}
              onEdit={openRecipe}
              onArchive={archiveRecipe}
              onDuplicate={(recipe) => { setDuplicateOpen(recipe); setDuplicateName(`${recipe.name} – variante`); }}
              onRecalculate={recalculate}
              onHistory={showHistory}
              selectedHistory={history}
            />
          )}
          {tab === 'categories' && (
            <ReferencesTab
              title="Catégories recettes"
              icon={<ClipboardList size={18} />}
              items={categories}
              name={categoryName}
              description={categoryDescription}
              onName={setCategoryName}
              onDescription={setCategoryDescription}
              onCreate={createCategory}
              onArchive={(id) => api.archiveTechnicalSheetCategory(token, id).then(load)}
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
          {tab === 'production' && (
            <ProductionTab
              recipes={recipes}
              selectedRecipe={selectedRecipe}
              selectedRecipeId={selectedRecipeId}
              portions={requestedPortions}
              simulation={simulation}
              onRecipe={setSelectedRecipeId}
              onPortions={setRequestedPortions}
              onSimulate={simulate}
              onDownload={downloadSimulation}
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

      {/* Create / Edit Dialog Component */}
      <RecipeDialog
        open={recipeDialog}
        form={form}
        setForm={setForm}
        products={activeProducts}
        units={units}
        categories={categories.filter((cat) => !isArchived(cat))}
        editing={Boolean(editingRecipe)}
        onClose={() => { setRecipeDialog(false); setReviewingImportDocumentId(null); }}
        onSave={saveRecipe}
        loading={loading}
      />

      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Importer une ou plusieurs fiches techniques">
        <RecipeImportPanel
          files={importFiles}
          statuses={importStatuses}
          submitting={importSubmitting}
          onFiles={setImportFiles}
          onSubmit={submitRecipeImports}
          onOpenResult={openImportedRecipe}
        />
      </Modal>

      {/* Duplicate Dialog Component */}
      <Modal isOpen={Boolean(duplicateOpen)} onClose={() => setDuplicateOpen(null)} title="Dupliquer une fiche technique">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.88rem', fontWeight: 600 }}>
            Nom de la variante
            <input
              value={duplicateName}
              onChange={(event) => setDuplicateName(event.target.value)}
              placeholder="ex: Potimarron velouté - Copie"
              autoFocus
            />
          </label>
          <div className="alert-modern info" style={{ fontSize: '0.82rem', margin: 0, borderRadius: '8px' }}>
            La copie reprend les informations générales, la photo, les ingrédients, les étapes et la catégorie, puis repart à l'état de brouillon.
          </div>
          <div className="modal-footer" style={{ margin: '1rem -1.5rem -1.5rem', padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setDuplicateOpen(null)}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={duplicateRecipe} disabled={!duplicateName.trim()}>
              Dupliquer la fiche
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const TECHNICAL_SHEET_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Entrées': 'Préparations servies en début de repas.',
  'Plats': 'Recettes principales et plats complets.',
  'Desserts': 'Desserts à l’assiette et préparations sucrées.',
  'Sauces': 'Sauces, jus, coulis et bases d’accompagnement.',
  'Accompagnements': 'Garnitures et préparations complémentaires.',
  'Petit-déjeuner': 'Préparations pour le service du matin.',
  'Pâtisserie': 'Gâteaux, entremets et préparations pâtissières.',
  'Boulangerie': 'Pains, viennoiseries et pâtes levées.',
  'Boissons': 'Boissons préparées et recettes liquides.',
};

function TechnicalSheetsOnboardingWizard({ onboarding, categories, onCreateCategories, onImport, onManual, onClose }: {
  onboarding?: TechnicalSheetOnboarding;
  categories: TechnicalSheetCategory[];
  onCreateCategories: (names: string[]) => Promise<void>;
  onImport: () => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'welcome' | 'categories' | 'recipe'>('welcome');
  const existingNames = useMemo(() => new Set(categories.map((category) => category.name.trim().toLowerCase())), [categories]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(onboarding?.selectedCategoryNames ?? categories.map((category) => category.name)));
  const [customName, setCustomName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const suggestions = onboarding?.suggestedCategories?.length ? onboarding.suggestedCategories : Object.keys(TECHNICAL_SHEET_CATEGORY_DESCRIPTIONS);
  const customSelections = [...selected].filter((name) => !suggestions.some((suggestion) => suggestion.toLowerCase() === name.toLowerCase()));
  const canAddCustom = Boolean(customName.trim()) && ![...selected, ...suggestions].some((candidate) => candidate.toLowerCase() === customName.trim().toLowerCase());
  const stepIndex = step === 'welcome' ? 1 : step === 'categories' ? 2 : 3;
  const progress = Math.round(stepIndex / 3 * 100);

  useEffect(() => {
    if (!onboarding?.selectedCategoryNames?.length) return;
    setSelected((current) => new Set([...current, ...onboarding.selectedCategoryNames]));
  }, [onboarding?.selectedCategoryNames?.join('|')]);

  function toggle(name: string) {
    if (existingNames.has(name.toLowerCase())) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    if ([...selected, ...suggestions].some((candidate) => candidate.toLowerCase() === name.toLowerCase())) return;
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
    <div className="modal-overlay hr-wizard-overlay technical-sheets-onboarding-overlay">
      <motion.div className="modal-card hr-wizard-modal technical-sheets-onboarding-modal" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', damping: 24, stiffness: 220 }}>
        {step === 'welcome' ? (
          <div className="technical-sheets-onboarding-welcome">
            <button type="button" className="technical-sheets-onboarding-close" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
            <div>
              <span className="badge badge-reception technical-sheets-onboarding-badge"><Sparkles size={14} /> Configuration guidée</span>
              <h1>Bienvenue sur le module <span>Fiches Techniques</span></h1>
              <p>Sélectionnez les catégories adaptées à votre établissement, puis créez votre première recette manuellement ou à partir de l’import OCR déjà intégré.</p>
              <div className="technical-sheets-onboarding-benefits">
                <div><ClipboardList size={17} /><span>Choisir vos catégories recettes</span></div>
                <div><Upload size={17} /><span>Importer une ou plusieurs fiches par OCR</span></div>
                <div><FileText size={17} /><span>Créer votre première fiche manuellement</span></div>
              </div>
              <div className="row-actions">
                <button className="btn btn-primary" onClick={() => setStep('categories')}>Démarrer la configuration <ArrowRight size={17} /></button>
                <button className="btn btn-secondary" onClick={onClose}>Faire plus tard</button>
              </div>
            </div>
            <div className="technical-sheets-onboarding-illustration">
              <div><ChefHat size={72} /></div>
              <strong>De la recette au coût matière</strong>
              <span>Produits et unités restent synchronisés avec Stocks.</span>
            </div>
          </div>
        ) : (
          <div className="technical-sheets-onboarding-layout">
            <aside className="technical-sheets-onboarding-aside">
              <div>
                <div className="technical-sheets-onboarding-brand"><ChefHat size={28} /><span>TOQUE<strong>HUB</strong></span></div>
                <span className="technical-sheets-onboarding-kicker">Installation guidée</span>
                <h3>Assistant Fiches Techniques</h3>
                <div className="technical-sheets-onboarding-steps">
                  {[
                    ['welcome', 'Bienvenue'],
                    ['categories', 'Catégories recettes'],
                    ['recipe', 'Première recette'],
                  ].map(([key, label], index) => {
                    const current = index + 1 === stepIndex;
                    const done = index + 1 < stepIndex;
                    return <div key={key} className={current ? 'current' : done ? 'done' : ''}><span>{done ? '✓' : index + 1}</span><strong>{label}</strong></div>;
                  })}
                </div>
              </div>
              <div className="technical-sheets-onboarding-note"><CheckCircle2 size={19} /><strong>Référentiel partagé</strong><p>Les ingrédients, unités et prix d’achat viennent toujours du module Stocks.</p></div>
            </aside>
            <main className={`technical-sheets-onboarding-main ${step === 'categories' ? 'technical-sheets-onboarding-main--categories' : ''}`}>
              <div className="technical-sheets-onboarding-progress">
                <div><span className="badge badge-reception">Étape {stepIndex} / 3</span><strong>{progress}%</strong></div>
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
                <button type="button" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
              </div>

              {step === 'categories' ? (
                <div className="hr-catalog technical-sheets-category-step">
                  <div className="hr-catalog-scroll">
                    <h2>Choisissez vos catégories recettes</h2>
                    <p className="muted">Cochez uniquement les familles utiles. Elles resteront modifiables depuis l’onglet Catégories recettes.</p>
                    {localError ? <div className="alert-modern error"><AlertCircle size={16} /> {localError}</div> : null}
                    <div className="hr-catalog-grid">
                      {suggestions.map((name) => {
                        const isSelected = selected.has(name) || [...selected].some((selectedName) => selectedName.toLowerCase() === name.toLowerCase());
                        const exists = existingNames.has(name.toLowerCase());
                        return (
                          <button type="button" key={name} className={`hr-catalog-card ${isSelected ? 'selected' : ''}`} onClick={() => toggle(name)} aria-pressed={isSelected}>
                            <div className={isSelected ? 'hr-catalog-check' : 'hr-catalog-check-empty'}>{isSelected ? <Check size={14} strokeWidth={3} /> : null}</div>
                            <div className="hr-catalog-body"><strong>{name}</strong><span>{TECHNICAL_SHEET_CATEGORY_DESCRIPTIONS[name] ?? 'Catégorie personnalisable pour vos recettes.'}</span>{exists ? <small>Déjà créée</small> : null}</div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="hr-catalog-custom">
                      <input value={customName} onChange={(event) => setCustomName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustom(); } }} placeholder="Ajouter une catégorie personnalisée…" />
                      <button type="button" className="btn btn-secondary" disabled={!canAddCustom} onClick={addCustom}>Ajouter</button>
                    </div>
                    {customSelections.length ? <div className="hr-catalog-tags">{customSelections.map((name) => <span key={name} className="badge badge-reception">{name}<button type="button" onClick={() => toggle(name)}><X size={12} /></button></span>)}</div> : null}
                  </div>
                  <div className="hr-catalog-actions sticky">
                    <span>{selected.size} catégorie{selected.size > 1 ? 's' : ''} sélectionnée{selected.size > 1 ? 's' : ''}</span>
                    <div className="row-actions"><button className="btn btn-secondary" onClick={() => setStep('welcome')}>Retour</button><button className="btn btn-primary" disabled={!selected.size || submitting} onClick={() => void submitCategories()}>{submitting ? 'Création…' : 'Valider les catégories'} <ArrowRight size={16} /></button></div>
                  </div>
                </div>
              ) : (
                <div className="technical-sheets-first-recipe-step">
                  <div><h2>{onboarding?.completed ? 'Votre référentiel contient déjà une recette' : 'Créez votre première recette'}</h2><p>Choisissez le parcours adapté. Les deux utilisent exactement les écrans et contrôles déjà présents dans le module.</p></div>
                  <div className="technical-sheets-onboarding-choices">
                    <button type="button" onClick={onImport}><div><Upload size={25} /></div><strong>Importer avec l’OCR</strong><span>Déposez PDF, images, Pages ou Numbers. Jusqu’à {MAX_RECIPE_IMPORT_FILES} fiches peuvent être analysées ensemble.</span><small>Ouvrir l’import existant <ArrowRight size={14} /></small></button>
                    <button type="button" onClick={onManual}><div><FileText size={25} /></div><strong>Créer manuellement</strong><span>Renseignez les informations, ingrédients Stocks, quantités et étapes de préparation.</span><small>Créer une fiche <ArrowRight size={14} /></small></button>
                  </div>
                  <div className="hr-catalog-actions sticky"><button className="btn btn-secondary" onClick={() => setStep('categories')}>Retour</button><button className="btn btn-secondary" onClick={onClose}>{onboarding?.completed ? 'Terminer' : 'Faire plus tard'}</button></div>
                </div>
              )}
            </main>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function BlockingState({ onInstallStocks }: { onInstallStocks: () => void }) {
  return (
    <div className="card-modern" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '720px', margin: '2rem auto' }}>
      <ChefHat size={48} style={{ margin: '0 auto 1.5rem', color: 'var(--primary)' }} />
      <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-main)' }}>Stocks est requis</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
        Les fiches techniques ne créent aucun produit : elles consomment les produits, unités, catégories produits, conversions et prix d’achat du module Stocks. Installez ou configurez Stocks avant de créer une fiche.
      </p>
      <button className="btn btn-primary" onClick={onInstallStocks}>
        Aller au tableau de bord
      </button>
    </div>
  );
}

function DashboardTab({ dashboard, recipes, categories, averageCost, onStartOnboarding, onOpenRecipes, onOpenCategories, onOpenCosts, onOpenProduction, loading }: { dashboard?: TechnicalSheetDashboard; recipes: TechnicalSheetRecipe[]; categories: TechnicalSheetCategory[]; averageCost: number; onStartOnboarding: () => void; onOpenRecipes: () => void; onOpenCategories: () => void; onOpenCosts: () => void; onOpenProduction: () => void; loading: boolean }) {
  const latest = dashboard?.latestRecipes ?? recipes.slice(0, 5);
  const topProducts = dashboard?.topProducts ?? [];
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="stats-grid">
        <MetricCard label="Fiches techniques" value={dashboard?.recipeCount ?? recipes.length} icon={<FileText size={20} />} tone="emerald" onClick={onOpenRecipes} />
        <MetricCard label="Catégories recettes" value={dashboard?.categoryCount ?? categories.filter((c) => !isArchived(c)).length} icon={<ClipboardList size={20} />} tone="blue" onClick={onOpenCategories} />
        <MetricCard label="Coût matière moyen" value={money(averageCost)} icon={<Calculator size={20} />} tone="orange" onClick={onOpenCosts} />
        <MetricCard label="Produits Stocks utilisés" value={dashboard?.usedStockProductsCount ?? '—'} icon={<Utensils size={20} />} tone="purple" onClick={onOpenProduction} />
      </div>
      
      <div className="double-panel">
        <div className="card-modern">
          <div className="section-header-modern" style={{ marginBottom: '1.5rem' }}>
            <div className="section-info">
              <span className="card-title">Dernières fiches modifiées</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={onOpenRecipes}>Voir tout</button>
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
                    cursor: 'pointer'
                  }}
                  onClick={onOpenRecipes}
                >
                  <strong style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>{recipe.name}</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {recipe.category?.name ?? 'Sans catégorie'} · Modifié le {date(recipe.updatedAt)} · Par {recipe.author?.firstName ?? recipe.author?.email ?? '—'}
                  </span>
                </div>
              ))
            ) : (
              <div className="alert-modern info">Aucune fiche modifiée pour le moment.</div>
            )}
          </div>
        </div>
        
        <div className="card-modern">
          <span className="card-title" style={{ marginBottom: '1.5rem', display: 'block' }}>Produits les plus utilisés</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
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
                    background: 'white'
                  }}
                >
                  <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{product.name}</strong>
                  <span className="badge badge-reception" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
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
          <button
            className="btn btn-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            disabled={loading}
            onClick={onStartOnboarding}
          >
            <Sparkles size={16} /> Configuration guidée Fiches Techniques
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipeImportStatusBar({ statuses, onOpenTracking, onOpenResult }: { statuses: TechnicalSheetRecipeImportStatus[]; onOpenTracking: () => void; onOpenResult: (status: TechnicalSheetRecipeImportStatus) => void }) {
  const readyStatuses = statuses.filter((status) => status.state === 'vérifier' && status.result);
  const errors = statuses.filter((status) => status.state === 'erreur');
  const working = statuses.filter(recipeImportWorking);
  const featured = readyStatuses[0] ?? working[0] ?? statuses[0];
  const tone = readyStatuses.length ? 'ready' : errors.length && !working.length ? 'error' : 'working';
  const label = readyStatuses.length
    ? `${readyStatuses.length} fiche${readyStatuses.length > 1 ? 's' : ''} prête${readyStatuses.length > 1 ? 's' : ''} à vérifier`
    : errors.length && !working.length
      ? `${errors.length} import${errors.length > 1 ? 's' : ''} en erreur`
      : `${working.length} fiche${working.length > 1 ? 's' : ''} en cours d’analyse`;
  const progressClass = featured.state === 'vérifier' ? 'success' : featured.state === 'erreur' ? 'error' : featured.state === 'analyse' ? 'analyzing' : 'pending';
  return (
    <motion.section className={`stocks-ocr-dashboard-status ${tone}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="stocks-ocr-dashboard-status-main">
        <div className="stocks-ocr-dashboard-status-icon">
          {readyStatuses.length ? <CheckCircle2 size={18} /> : errors.length && !working.length ? <AlertCircle size={18} /> : <Clock size={18} />}
        </div>
        <div className="stocks-ocr-dashboard-status-copy">
          <span>{label}</span>
          <small>{statuses.length} fichier{statuses.length > 1 ? 's' : ''} suivi{statuses.length > 1 ? 's' : ''} · le traitement continue pendant la navigation</small>
          <div className="ocr-status-progress-bar">
            <div className={`ocr-status-progress-fill ${progressClass}`} style={{ width: `${featured.progress}%` }} />
          </div>
        </div>
      </div>
      <div className="stocks-ocr-dashboard-status-actions">
        {readyStatuses[0] ? (
          <button className="btn btn-primary btn-sm" onClick={() => onOpenResult(readyStatuses[0])}>
            Vérifier <ArrowRight size={13} />
          </button>
        ) : null}
        <button className="btn btn-secondary btn-sm" onClick={onOpenTracking}>Suivi des imports</button>
      </div>
    </motion.section>
  );
}

function RecipeImportPanel({ files, statuses, submitting, onFiles, onSubmit, onOpenResult }: { files: File[]; statuses: TechnicalSheetRecipeImportStatus[]; submitting: boolean; onFiles: (files: File[]) => void; onSubmit: () => Promise<void>; onOpenResult: (status: TechnicalSheetRecipeImportStatus) => void }) {
  const addFiles = (next: File[]) => {
    const unique = [...files, ...next].filter((file, index, all) => all.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified) === index).slice(0, MAX_RECIPE_IMPORT_FILES);
    onFiles(unique);
  };
  return (
    <div>
      <label
        className="stocks-ocr-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files ?? [])); }}
      >
        <FileText size={32} />
        <span>Déposer vos fiches techniques ici ou cliquer pour parcourir</span>
        <small>PDF, images, Pages et Numbers · jusqu’à {MAX_RECIPE_IMPORT_FILES} fichiers simultanés · 20 Mo par fichier</small>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,image/avif,.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.avif,.pages,.numbers"
          multiple
          onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ''; }}
        />
      </label>

      {files.length ? (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Fichiers prêts pour l’analyse ({files.length})</div>
          <div className="stocks-ocr-file-list">
            {files.map((file, index) => (
              <div className="stocks-ocr-file-row" key={`${file.name}-${file.size}-${file.lastModified}`}>
                <FileText size={18} />
                <div className="stocks-ocr-file-row-details"><span>{file.name}</span><small>{formatImportBytes(file.size)}</small></div>
                <button type="button" className="stocks-ocr-file-remove" onClick={() => onFiles(files.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="modal-footer" style={{ margin: '1rem -1.5rem 0', padding: '1.1rem 1.5rem', background: '#fafbfe', borderTop: '1px solid var(--light-border)' }}>
        <button className="btn btn-primary" disabled={!files.length || submitting} onClick={() => void onSubmit()}>
          {submitting ? 'Préparation de l’import…' : `Lancer l’analyse OCR${files.length > 1 ? ` (${files.length})` : ''}`}
        </button>
      </div>

      {statuses.length ? (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Suivi des analyses ({statuses.length})</div>
          <div className="ocr-statuses-list">
            {statuses.map((status) => {
              const progressClass = status.state === 'vérifier' ? 'success' : status.state === 'erreur' ? 'error' : status.state === 'analyse' ? 'analyzing' : 'pending';
              const stateLabel = status.state === 'vérifier' ? 'Prête à vérifier' : status.state === 'erreur' ? status.errorMessage || 'Erreur d’analyse' : status.state === 'analyse' ? 'Extraction et rapprochement Stocks…' : 'Dans la file d’attente';
              return (
                <div className="ocr-status-card" key={status.document.id} style={status.state === 'vérifier' ? { borderLeft: '3px solid #10b981' } : undefined}>
                  <div className="ocr-status-card-info">
                    <span className="ocr-status-card-title">{status.document.originalName}</span>
                    <div className="ocr-status-card-meta"><span>{formatImportBytes(status.document.sizeBytes)}</span><span>•</span><span>{stateLabel}</span></div>
                    <div className="ocr-status-progress-bar"><div className={`ocr-status-progress-fill ${progressClass}`} style={{ width: `${status.progress}%` }} /></div>
                  </div>
                  {status.result ? <div className="ocr-status-card-actions"><button className="btn btn-primary btn-sm" onClick={() => onOpenResult(status)}>Vérifier <ArrowRight size={12} /></button></div> : null}
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
  onCreate: () => void;
  importStatuses: TechnicalSheetRecipeImportStatus[];
  onImport: () => void;
  onOpenImportedRecipe: (status: TechnicalSheetRecipeImportStatus) => void;
  onEdit: (r: TechnicalSheetRecipe) => void;
  onArchive: (r: TechnicalSheetRecipe) => void;
  onDuplicate: (r: TechnicalSheetRecipe) => void;
  onRecalculate: (r: TechnicalSheetRecipe) => void;
  onHistory: (r: TechnicalSheetRecipe) => void;
  selectedHistory: TechnicalSheetHistoryEntry[];
}) {
  const hasActiveFilters = Boolean(props.search || props.categoryFilter || props.statusFilter);
  const filtered = props.recipes.filter(recipe => {
    const haystack = [recipe.name, recipe.description, recipe.category?.name].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = haystack.includes(props.search.toLowerCase());
    const matchesCategory = !props.categoryFilter || recipe.categoryId === props.categoryFilter || recipe.category?.id === props.categoryFilter;
    const matchesStatus = !props.statusFilter || recipe.status === props.statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {props.importStatuses.length ? (
        <RecipeImportStatusBar statuses={props.importStatuses} onOpenTracking={props.onImport} onOpenResult={props.onOpenImportedRecipe} />
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
            <select value={props.categoryFilter} onChange={(event) => props.onCategoryFilter(event.target.value)}>
              <option value="">Toutes catégories</option>
              {props.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select value={props.statusFilter} onChange={(event) => props.onStatusFilter(event.target.value)}>
              <option value="">Tous les statuts</option>
              {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
            {(props.search || props.categoryFilter || props.statusFilter) ? (
              <button type="button" className="btn-clear-filters" onClick={props.onClearFilters} title="Réinitialiser les filtres"><X size={16} /></button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="technical-sheets-list-actions">
        <button className="btn btn-primary" onClick={props.onCreate}>
          <Plus size={16} /> Créer une fiche
        </button>
        <button className="btn btn-secondary" onClick={props.onImport}>
          <Upload size={16} /> Importer des fiches
        </button>
      </div>
      
      {filtered.length ? (
        <div className="recipe-grid">
          {filtered.map((recipe) => (
            <div
              className="card-modern recipe-card"
              key={recipe.id}
              style={{ opacity: isArchived(recipe) ? 0.65 : 1, display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              {recipe.photoUrl && (
                <div className="recipe-image-container">
                  <img src={recipe.photoUrl} alt={recipe.name} />
                </div>
              )}
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.25 }}>
                      {recipe.name}
                    </h3>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {recipe.category?.name ?? 'Sans catégorie'} · {recipe.referencePortions ?? recipe.portions ?? 1} portions
                    </p>
                  </div>
                  <span className={`badge ${recipe.status === 'VALIDATED' ? 'badge-reception' : recipe.status === 'ARCHIVED' ? 'badge-loss' : 'badge-production'}`}>
                    {statuses.find((s) => s.value === recipe.status)?.label ?? recipe.status}
                  </span>
                </div>
                
                <div className="recipe-chips-row">
                  <span className="badge badge-production" style={{ background: 'rgba(16, 185, 129, 0.06)', color: 'var(--primary)', border: '1px solid rgba(16, 185, 129, 0.15)', fontWeight: 600 }}>
                    Total {money(recipe.costTotal ?? recipe.totalCost)}
                  </span>
                  <span className="badge badge-reception" style={{ background: 'rgba(59, 130, 246, 0.06)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.15)', fontWeight: 600 }}>
                    Portion {money(recipe.costPerPortion)}
                  </span>
                  <span className="badge badge-inventory" style={{ fontSize: '0.78rem' }}>
                    {date(recipe.updatedAt)}
                  </span>
                </div>
                
                {recipe.hasNonCalculableLines || recipe.nonCalculableLinesCount ? (
                  <div className="alert-modern error" style={{ padding: '0.4rem 0.6rem', fontSize: '0.78rem', margin: 0, borderRadius: '8px' }}>
                    Non calculable : conversion ou prix Stocks manquant.
                  </div>
                ) : null}
                
                <div className="recipe-actions-row" style={{ marginTop: 'auto', display: 'flex', gap: '0.25rem', flexWrap: 'wrap', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                  <button className="icon-btn" onClick={() => props.onEdit(recipe)} title="Modifier"><Edit3 size={15} /></button>
                  <button className="icon-btn" onClick={() => props.onDuplicate(recipe)} title="Dupliquer"><Copy size={15} /></button>
                  <button className="icon-btn" onClick={() => props.onRecalculate(recipe)} title="Recalculer coût"><RefreshCw size={15} /></button>
                  <button className="icon-btn" onClick={() => props.onHistory(recipe)} title="Historique"><History size={15} /></button>
                  <button className="icon-btn danger" onClick={() => props.onArchive(recipe)} title="Archiver"><Archive size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-modern" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>{hasActiveFilters ? 'Aucune fiche ne correspond aux filtres' : 'Aucune fiche technique'}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {hasActiveFilters ? 'Modifiez la recherche, la catégorie ou le statut pour élargir les résultats.' : 'Créez une première fiche en sélectionnant uniquement des produits Stocks.'}
          </p>
          <button className={hasActiveFilters ? 'btn btn-secondary' : 'btn btn-primary'} onClick={hasActiveFilters ? props.onClearFilters : props.onCreate}>
            {hasActiveFilters ? 'Réinitialiser les filtres' : 'Créer une fiche'}
          </button>
        </div>
      )}
      
      {props.selectedHistory.length ? (
        <div className="card-modern" style={{ marginTop: '1.5rem' }}>
          <span className="card-title" style={{ display: 'block', marginBottom: '1rem' }}>Historique</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {props.selectedHistory.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--light-border)',
                  borderRadius: '10px',
                  background: '#f8fafc'
                }}
              >
                <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-main)' }}>{entry.action}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {date(entry.createdAt)} · {entry.user?.firstName ?? entry.user?.email ?? 'Utilisateur'} · {entry.summary}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReferencesTab({
  title,
  icon,
  items,
  name,
  description,
  onName,
  onDescription,
  onCreate,
  onArchive
}: {
  title: string;
  icon: React.ReactNode;
  items: TechnicalSheetCategory[];
  name: string;
  description: string;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  onCreate: () => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div className="double-panel">
      <div className="card-modern">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {icon} {title}
          </span>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
            Nom
            <input value={name} onChange={(e) => onName(e.target.value)} placeholder="ex: Entrées, Desserts, Sauces..." />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
            Description
            <textarea
              rows={3}
              value={description}
              onChange={(e) => onDescription(e.target.value)}
              placeholder="Description optionnelle de la catégorie..."
            />
          </label>
          <button className="btn btn-primary" onClick={onCreate} disabled={!name.trim()}>
            Ajouter la catégorie
          </button>
        </div>
      </div>
      
      <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <span className="card-title">Catégories actives</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
          {items.map((item) => (
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
                opacity: isArchived(item) ? 0.55 : 1
              }}
            >
              <div>
                <strong style={{ display: 'block', fontSize: '0.92rem', color: 'var(--text-main)' }}>{item.name}</strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.description ?? '—'}</span>
              </div>
              <button
                className="icon-btn danger"
                style={{ padding: '0.4rem' }}
                onClick={() => onArchive(item.id)}
                title="Archiver"
              >
                <Archive size={16} />
              </button>
            </div>
          ))}
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
  onSavePricing: (recipeId: string, payload: { targetSellingPriceExclTax?: number | null; targetSellingPriceInclTax?: number | null }) => Promise<TechnicalSheetRecipe>;
}) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const filtered = recipes.filter((recipe) => {
    const haystack = [recipe.name, recipe.description, recipe.category?.name, ...(recipe.ingredients ?? []).map((line) => line.product?.name)].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = haystack.includes(search.trim().toLowerCase());
    const matchesCategory = !categoryFilter || recipe.categoryId === categoryFilter || recipe.category?.id === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const sorted = [...filtered].sort((a, b) => Number(b.costTotal ?? b.totalCost ?? 0) - Number(a.costTotal ?? a.totalCost ?? 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="technical-sheets-filter-card">
        <div className="stocks-filter-bar">
          <div className="search-input-wrapper">
            <Search size={16} />
            <input className="search-input" placeholder="Rechercher une fiche, un ingrédient, une catégorie…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="filter-selects">
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">Toutes catégories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            {(search || categoryFilter) ? <button type="button" className="btn-clear-filters" onClick={() => { setSearch(''); setCategoryFilter(''); }} title="Réinitialiser les filtres"><X size={16} /></button> : null}
          </div>
        </div>
      </div>

      <div className={`technical-sheets-tax-policy ${salesTaxPolicy?.configured ? 'configured' : 'missing'}`}>
        <div>
          <strong>{salesTaxPolicy?.configured ? `TVA vente restauration : ${salesTaxPolicy.rate}% · ${salesTaxPolicy.countryLabel}` : 'Pays de réglementation non configuré'}</strong>
          <span>{salesTaxPolicy?.configured ? salesTaxPolicy.scopeLabel : 'Configurez le pays réglementaire de l’organisation pour calculer les prix TTC.'}</span>
        </div>
        <span className={`badge ${salesTaxPolicy?.configured ? 'badge-reception' : 'badge-correction'}`}>{salesTaxPolicy?.configured ? 'Onboarding réglementaire' : 'TTC indisponible'}</span>
      </div>

      <div className="card-modern">
        <div className="section-header-modern" style={{ marginBottom: '1.5rem' }}>
        <div className="section-info">
          <span className="card-title">Coûts, prix de vente visés et marge brute</span>
          <span className="section-tagline">Le coût HT vient des produits Stocks. Les objectifs de vente sont exprimés par portion.</span>
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
                  <th style={{ textAlign: 'right' }}>Coût HT / portion</th>
                  <th>Prix de vente HT visé</th>
                  <th>Prix de vente TTC visé</th>
                  <th>Marge brute</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((recipe) => <CostPricingRow key={recipe.id} recipe={recipe} salesTaxPolicy={salesTaxPolicy} onSave={onSavePricing} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="technical-sheets-cost-empty">
            <strong>Aucune fiche ne correspond à la recherche</strong>
            <span>Modifiez le texte recherché ou la catégorie sélectionnée.</span>
            <button className="btn btn-secondary" onClick={() => { setSearch(''); setCategoryFilter(''); }}>Réinitialiser les filtres</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CostPricingRow({ recipe, salesTaxPolicy, onSave }: { recipe: TechnicalSheetRecipe; salesTaxPolicy?: TechnicalSheetSalesTaxPolicy; onSave: (recipeId: string, payload: { targetSellingPriceExclTax?: number | null; targetSellingPriceInclTax?: number | null }) => Promise<TechnicalSheetRecipe> }) {
  const rate = salesTaxPolicy?.rate ?? null;
  const initialHt = recipe.targetSellingPriceExclTax == null ? '' : Number(recipe.targetSellingPriceExclTax).toFixed(2);
  const initialTtc = recipe.targetSellingPriceInclTax == null ? '' : Number(recipe.targetSellingPriceInclTax).toFixed(2);
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
    const nextHt = recipe.targetSellingPriceExclTax == null ? '' : Number(recipe.targetSellingPriceExclTax).toFixed(2);
    const nextTtc = recipe.targetSellingPriceInclTax == null ? '' : Number(recipe.targetSellingPriceInclTax).toFixed(2);
    setSavedHt(nextHt);
    setSavedTtc(nextTtc);
    if (!dirtyRef.current) {
      setHt(nextHt);
      setTtc(nextTtc);
    }
  }, [recipe.targetSellingPriceExclTax, recipe.targetSellingPriceInclTax]);

  const currentHt = ht === '' ? null : Number(ht);
  const costPerPortion = Number(recipe.costPerPortion ?? 0);
  const marginAmount = currentHt == null || !Number.isFinite(currentHt) ? null : currentHt - costPerPortion;
  const marginRate = marginAmount == null || !currentHt ? null : marginAmount / currentHt * 100;
  const dirty = ht !== savedHt || ttc !== savedTtc;
  dirtyRef.current = dirty;

  function changeHt(value: string) {
    setHt(value);
    setLastEdited('ht');
    setError(undefined);
    setSaveState('idle');
    const number = Number(value);
    setTtc(value === '' || !Number.isFinite(number) || rate == null ? '' : (number * (1 + rate / 100)).toFixed(2));
  }

  function changeTtc(value: string) {
    setTtc(value);
    setLastEdited('ttc');
    setError(undefined);
    setSaveState('idle');
    const number = Number(value);
    setHt(value === '' || !Number.isFinite(number) || rate == null ? '' : (number / (1 + rate / 100)).toFixed(2));
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
        const updated = await onSaveRef.current(recipe.id, submitted.lastEdited === 'ttc'
          ? { targetSellingPriceInclTax: submitted.ttc === '' ? null : Number(submitted.ttc) }
          : { targetSellingPriceExclTax: submitted.ht === '' ? null : Number(submitted.ht) });
        if (revision !== saveRevisionRef.current) return;
        const nextHt = updated.targetSellingPriceExclTax == null ? '' : Number(updated.targetSellingPriceExclTax).toFixed(2);
        const nextTtc = updated.targetSellingPriceInclTax == null ? '' : Number(updated.targetSellingPriceInclTax).toFixed(2);
        setSavedHt(nextHt);
        setSavedTtc(nextTtc);
        const submittedValueIsStillCurrent = latestValuesRef.current.ht === submitted.ht && latestValuesRef.current.ttc === submitted.ttc;
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
        <span className="technical-sheets-cost-meta">{recipe.category?.name ?? 'Sans catégorie'} · {Number(recipe.referencePortions ?? 1)} portion(s) · calculé le {date(recipe.lastCostCalculationAt)}</span>
        {(recipe.nonCalculableLinesCount ?? 0) > 0 ? <span className="badge badge-loss">{recipe.nonCalculableLinesCount} ligne(s) non calculable(s)</span> : null}
      </td>
      <td data-label="Coût HT recette" className="technical-sheets-cost-money">{money(recipe.costTotal ?? recipe.totalCost)}</td>
      <td data-label="Coût HT / portion" className="technical-sheets-cost-money primary">{money(recipe.costPerPortion)}</td>
      <td data-label="Prix HT visé">
        <div className="technical-sheets-price-input"><input type="number" min="0" step="0.01" value={ht} onChange={(event) => changeHt(event.target.value)} placeholder="0,00" /><span>€ HT</span></div>
        {saveState !== 'idle' ? <small className={`technical-sheets-pricing-status ${saveState}`}>{saveState === 'saving' ? 'Enregistrement…' : saveState === 'saved' ? 'Enregistré' : 'Échec de l’enregistrement'}</small> : null}
        {error ? <small className="technical-sheets-pricing-error">{error}</small> : null}
      </td>
      <td data-label="Prix TTC visé"><div className="technical-sheets-price-input"><input type="number" min="0" step="0.01" value={ttc} onChange={(event) => changeTtc(event.target.value)} placeholder={rate == null ? 'Pays requis' : '0,00'} disabled={rate == null} /><span>€ TTC</span></div><small className="technical-sheets-tax-rate">{rate == null ? 'Taux indisponible' : `TVA ${rate}%`}</small></td>
      <td data-label="Marge brute">
        {marginAmount == null ? <span className="technical-sheets-margin-empty">Prix visé requis</span> : <div className={`technical-sheets-margin ${marginAmount >= 0 ? 'positive' : 'negative'}`}><strong>{money(marginAmount)}</strong><span>{marginRate == null ? '—' : `${marginRate.toFixed(1)} % du prix HT`}</span></div>}
      </td>
    </tr>
  );
}

function ProductionTab({
  recipes,
  selectedRecipe,
  selectedRecipeId,
  portions,
  simulation,
  onRecipe,
  onPortions,
  onSimulate,
  onDownload
}: {
  recipes: TechnicalSheetRecipe[];
  selectedRecipe?: TechnicalSheetRecipe;
  selectedRecipeId: string;
  portions: number;
  simulation?: TechnicalSheetSimulation;
  onRecipe: (id: string) => void;
  onPortions: (n: number) => void;
  onSimulate: () => void;
  onDownload: (format: 'csv' | 'pdf') => void;
}) {
  return (
    <div className="double-panel">
      <div className="card-modern">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <span className="card-title">Simulation proportionnelle</span>
          
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
            Sélectionner une fiche technique
            <select
              value={selectedRecipeId || selectedRecipe?.id || ''}
              onChange={(e) => onRecipe(e.target.value)}
            >
              <option value="">Choisir une fiche...</option>
              {recipes.filter((r) => r.status !== 'ARCHIVED').map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
          </label>
          
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
            Portions demandées
            <input
              type="number"
              min={1}
              value={portions}
              onChange={(e) => onPortions(Number(e.target.value))}
            />
          </label>
          
          <button
            className="btn btn-primary"
            onClick={onSimulate}
            disabled={!selectedRecipeId && !selectedRecipe?.id}
          >
            Simuler la production
          </button>
          
          <div className="alert-modern info" style={{ fontSize: '0.8rem', borderRadius: '8px' }}>
            La simulation ne déclenche aucun mouvement de stock physique en V1.
          </div>
        </div>
      </div>
      
      <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title">Résultats de simulation</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={!simulation?.id}
              onClick={() => onDownload('csv')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Download size={12} /> CSV
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={!simulation?.id}
              onClick={() => onDownload('pdf')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Download size={12} /> PDF
            </button>
          </div>
        </div>
        
        {simulation ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div
              style={{
                padding: '1rem',
                background: 'rgba(16, 185, 129, 0.04)',
                borderRadius: '12px',
                border: '1px solid rgba(16, 185, 129, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <strong style={{ display: 'block', color: 'var(--text-main)', fontSize: '0.95rem' }}>
                  {simulation.recipe?.name ?? selectedRecipe?.name}
                </strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {simulation.requestedPortions} portions demandées
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Coût estimé</span>
                <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>{money(simulation.estimatedCost)}</strong>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Ingrédients requis :
              </span>
              {simulation.lines?.map((line) => (
                <div
                  key={`${line.productId}-${line.unitId}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    border: '1px solid var(--light-border)',
                    borderRadius: '10px',
                    background: '#f8fafc'
                  }}
                >
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{line.productName}</span>
                  <strong style={{ fontSize: '0.88rem', color: 'var(--primary)' }}>
                    {Number(line.quantity).toFixed(3)} {line.unitSymbol} · {money(line.estimatedCost)}
                  </strong>
                </div>
              ))}
            </div>
            
            {simulation.allergens?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Allergènes présents :
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {simulation.allergens.map((allergen) => (
                    <span
                      key={allergen.id}
                      className="badge badge-loss"
                      style={{ background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.15)', fontWeight: 600 }}
                    >
                      {allergen.icon ? `${allergen.icon} ` : ''}{allergen.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="alert-modern info">
            Sélectionnez une fiche et un nombre de portions pour proportionner les ingrédients.
          </div>
        )}
      </div>
    </div>
  );
}

function RecipeDialog({ open, form, setForm, products, units, categories, editing, onClose, onSave, loading }: { open: boolean; form: TechnicalSheetRecipePayload; setForm: (f: TechnicalSheetRecipePayload) => void; products: Product[]; units: Unit[]; categories: TechnicalSheetCategory[]; editing: boolean; onClose: () => void; onSave: () => void; loading: boolean }) {
  const ingredients = form.ingredients ?? [];
  const steps = form.steps ?? [];
  
  const patchIngredient = (index: number, patch: Partial<(typeof ingredients)[number]>) => {
    const next = [...ingredients];
    next[index] = { ...next[index], ...patch };
    setForm({ ...form, ingredients: next });
  };
  
  const patchStep = (index: number, patch: Partial<(typeof steps)[number]>) => {
    const next = [...steps];
    next[index] = { ...next[index], ...patch };
    setForm({ ...form, steps: next });
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
            color: '#1e293b'
          }}
        >
          {/* Header */}
          <div style={{
            height: '72px',
            padding: '0 2rem',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
          }}>
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
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                <ArrowLeft size={18} />
                <span>Retour</span>
              </button>
              <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                background: form.status === 'VALIDATED' ? '#ecfdf5' : '#f1f5f9',
                color: form.status === 'VALIDATED' ? '#059669' : '#475569',
                border: form.status === 'VALIDATED' ? '1px solid #10b981' : '1px solid #cbd5e1',
                marginRight: '0.5rem'
              }}>
                {form.status === 'VALIDATED' ? 'Validé' : 'Brouillon'}
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
                  fontWeight: 600
                }}
              >
                {loading ? 'Enregistrement...' : editing ? 'Enregistrer les modifications' : 'Créer la fiche technique'}
              </button>
            </div>
          </div>

          {/* Main Body */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '400px 1fr',
            flex: 1,
            overflow: 'hidden',
            background: '#f8fafc'
          }}>
            {/* Sidebar (Left) */}
            <div style={{
              background: '#ffffff',
              borderRight: '1px solid #e2e8f0',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              overflowY: 'auto'
            }}>
              {/* Image Preview / Cover */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Photo de couverture</span>
                <div style={{
                  width: '100%',
                  aspectRatio: '16/9',
                  borderRadius: '12px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}>
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
                  <div
                    className="photo-fallback"
                    style={form.photoUrl ? { display: 'none' } : {}}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: '#94a3b8' }}>
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
                    marginTop: '0.25rem'
                  }}
                />
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '0.25rem 0' }} />

              {/* Form Metadata */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
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
                      fontSize: '0.9rem'
                    }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
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
                      background: 'white'
                    }}
                  >
                    <option value="">Choisir une catégorie...</option>
                    {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
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
                      fontFamily: 'inherit'
                    }}
                  />
                </label>

                <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '0.25rem 0' }} />

                {/* Metrics block */}
                <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>
                  Paramètres de Production
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
                    Portions
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min={1}
                        value={form.referencePortions ?? 1}
                        onChange={(e) => setForm({ ...form, referencePortions: Number(e.target.value) })}
                        style={{
                          padding: '0.65rem 0.8rem 0.65rem 2.25rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          width: '100%'
                        }}
                      />
                      <Utensils size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    </div>
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
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
                        width: '100%'
                      }}
                    >
                      {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
                    Prépa (min)
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min={0}
                        value={form.prepTimeMinutes ?? 0}
                        onChange={(e) => setForm({ ...form, prepTimeMinutes: Number(e.target.value) })}
                        style={{
                          padding: '0.65rem 0.8rem 0.65rem 2.25rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          width: '100%'
                        }}
                      />
                      <Clock size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    </div>
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
                    Cuisson (min)
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min={0}
                        value={form.cookTimeMinutes ?? 0}
                        onChange={(e) => setForm({ ...form, cookTimeMinutes: Number(e.target.value) })}
                        style={{
                          padding: '0.65rem 0.8rem 0.65rem 2.25rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '0.9rem',
                          width: '100%'
                        }}
                      />
                      <Clock size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Pane (Ingredients and Steps workspace) */}
            <div style={{
              padding: '2.5rem 3rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2.5rem'
            }}>
              {/* Ingredients Section */}
              <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '2rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      Ingrédients Stocks
                    </h3>
                    <span style={{
                      background: '#eff6ff',
                      color: '#2563eb',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px'
                    }}>
                      {ingredients.length} {ingredients.length > 1 ? 'produits' : 'produit'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '8px', padding: '0.4rem 0.8rem' }}
                    onClick={() => setForm({ ...form, ingredients: [...ingredients, { productId: '', unitId: units[0]?.id ?? '', quantity: 1, comment: '' }] })}
                  >
                    <Plus size={14} /> Ajouter un ingrédient
                  </button>
                </div>

                {ingredients.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {ingredients.map((line, index) => {
                      const selectedProduct = products.find(p => p.id === line.productId);
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
                            position: 'relative'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>
                              Produit Stocks
                              {line.createProduct && !line.productId ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.65rem', border: '1px solid #a7f3d0', borderRadius: '8px', background: '#ecfdf5' }}>
                                  <span style={{ color: '#047857', fontSize: '0.72rem', fontWeight: 700 }}>Nouveau produit Stocks à créer</span>
                                  <input
                                    value={line.productName ?? ''}
                                    onChange={(event) => patchIngredient(index, { productName: event.target.value })}
                                    aria-label="Nom du nouveau produit Stocks"
                                    style={{ margin: 0, background: '#ffffff' }}
                                  />
                                  {line.productSku || line.productGtin ? (
                                    <span style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 500 }}>
                                      {[line.productSku ? `SAP ${line.productSku}` : '', line.productGtin ? `GTIN ${line.productGtin}` : ''].filter(Boolean).join(' · ')}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                              <ProductSelect
                                products={products}
                                value={line.productId ?? ''}
                                placeholder={line.createProduct ? 'Ou associer à un produit existant...' : undefined}
                                onChange={(productId) => {
                                  const product = products.find(p => p.id === productId);
                                  patchIngredient(index, productId
                                    ? { productId, unitId: product?.unitId ?? line.unitId, createProduct: false }
                                    : { productId });
                                }}
                              />
                            </div>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>
                              Quantité
                              <input
                                type="number"
                                step="any"
                                min={0.001}
                                value={line.quantity}
                                onChange={(e) => patchIngredient(index, { quantity: Number(e.target.value) })}
                                required
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  fontSize: '0.85rem'
                                }}
                              />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>
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
                                  marginBottom: 0
                                }}
                              >
                                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}
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
                                cursor: 'pointer'
                              }}
                              onClick={() => setForm({ ...form, ingredients: ingredients.filter((_, i) => i !== index) })}
                              title="Supprimer la ligne"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
                                background: '#ffffff'
                              }}
                            />
                            {selectedProduct?.averagePurchasePrice ? (
                              <span style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', background: '#f1f5f9', padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
                                Prix estimé : {(Number(selectedProduct.averagePurchasePrice) * line.quantity).toFixed(2)} €
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '2.5rem 1.5rem',
                    border: '2px dashed #e2e8f0',
                    borderRadius: '12px',
                    color: '#94a3b8',
                    fontSize: '0.88rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <ChefHat size={32} style={{ color: '#cbd5e1' }} />
                    <span>Aucun ingrédient renseigné pour le moment. Cliquez sur "Ajouter un ingrédient" pour commencer.</span>
                  </div>
                )}
              </div>

              {/* Steps Section */}
              <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '2rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      Étapes de préparation
                    </h3>
                    <span style={{
                      background: '#f0fdf4',
                      color: '#16a34a',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px'
                    }}>
                      {steps.length} {steps.length > 1 ? 'étapes' : 'étape'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '8px', padding: '0.4rem 0.8rem' }}
                    onClick={() => setForm({ ...form, steps: [...steps, { order: steps.length + 1, title: '', description: '', estimatedTimeMinutes: 0 }] })}
                  >
                    <Plus size={14} /> Ajouter une étape
                  </button>
                </div>

                {steps.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
                    {/* Vertical timeline line */}
                    <div style={{
                      position: 'absolute',
                      left: '20px',
                      top: '15px',
                      bottom: '15px',
                      width: '2px',
                      background: '#e2e8f0',
                      zIndex: 0
                    }} />

                    {steps.map((step, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          gap: '1.25rem',
                          position: 'relative',
                          zIndex: 1
                        }}
                      >
                        {/* Timeline Step number circle */}
                        <div style={{
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
                          textAlign: 'center'
                        }}>
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
                            gridTemplateColumns: '80px 2fr 3fr 120px auto',
                            gap: '0.75rem',
                            alignItems: 'end',
                            transition: 'border-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                        >
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>
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
                                marginBottom: 0
                              }}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>
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
                                marginBottom: 0
                              }}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>
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
                                marginBottom: 0
                              }}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>
                            Durée (min)
                            <div style={{ position: 'relative' }}>
                              <input
                                type="number"
                                min={0}
                                value={step.estimatedTimeMinutes}
                                onChange={(e) => patchStep(index, { estimatedTimeMinutes: Number(e.target.value) })}
                                style={{
                                  padding: '0.5rem 0.75rem 0.5rem 2.0rem',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  fontSize: '0.85rem',
                                  width: '100%',
                                  marginBottom: 0
                                }}
                              />
                              <Clock size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
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
                              cursor: 'pointer'
                            }}
                            onClick={() => setForm({ ...form, steps: steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })) })}
                            title="Supprimer l'étape"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '2.5rem 1.5rem',
                    border: '2px dashed #e2e8f0',
                    borderRadius: '12px',
                    color: '#94a3b8',
                    fontSize: '0.88rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <ClipboardList size={32} style={{ color: '#cbd5e1' }} />
                    <span>Aucune étape renseignée pour le moment. Cliquez sur "Ajouter une étape" pour commencer.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Bottom Validation Banner */}
          <div style={{
            height: '64px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 2.5rem',
            flexShrink: 0,
            boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.02)'
          }}>
            <label className="toggle-inline" style={{ userSelect: 'none', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.status === 'VALIDATED'}
                onChange={(e) => setForm({ ...form, status: e.target.checked ? 'VALIDATED' : 'DRAFT' })}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155' }}>
                Fiche validée comme référence de production
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} style={{ height: '36px', fontSize: '0.88rem' }}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading || !form.name.trim() || !form.categoryId}
                onClick={onSave}
                style={{ height: '36px', fontSize: '0.88rem', fontWeight: 600 }}
              >
                {loading ? 'Enregistrement...' : editing ? 'Enregistrer les modifications' : 'Créer la fiche technique'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

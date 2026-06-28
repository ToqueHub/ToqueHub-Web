// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
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
  Wheat,
  X,
  AlertCircle,
  Clock,
  Eye,
  CheckCircle2,
  MapPin,
  ArrowLeft,
  Camera
} from 'lucide-react';
import { api } from '../api/client';
import type {
  Product,
  TechnicalSheetAllergen,
  TechnicalSheetCategory,
  TechnicalSheetDashboard,
  TechnicalSheetHistoryEntry,
  TechnicalSheetRecipe,
  TechnicalSheetRecipePayload,
  TechnicalSheetSimulation,
  TechnicalSheetSimulationPayload,
  Unit,
} from '../types';

type TechnicalSheetsTab = 'dashboard' | 'recipes' | 'categories' | 'costs' | 'allergens' | 'production';

type TechnicalSheetsAppProps = {
  token: string;
  tab: TechnicalSheetsTab;
  stocksInstalled: boolean;
  products: Product[];
  units: Unit[];
  onNavigate: (tab: TechnicalSheetsTab) => void;
  onInstalled?: (installedApps?: string[]) => void;
};

const statuses = [
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'VALIDATED', label: 'Validé' },
  { value: 'ARCHIVED', label: 'Archivé' },
];

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

// Multi-select custom allergen component
function AllergenMultiSelect({
  allergens,
  selectedIds,
  onChange
}: {
  allergens: TechnicalSheetAllergen[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleAllergen = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedNames = allergens
    .filter(a => selectedIds.includes(a.id))
    .map(a => a.name)
    .join(', ');

  return (
    <div className="custom-multiselect-wrapper" style={{ position: 'relative', width: '100%' }}>
      <div
        className="custom-multiselect-trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '0.55rem 0.85rem',
          border: '1.5px solid var(--light-border)',
          borderRadius: '12px',
          background: 'white',
          fontSize: '0.88rem',
          cursor: 'pointer',
          minHeight: '38px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none'
        }}
      >
        <span style={{
          color: selectedIds.length > 0 ? 'var(--text-main)' : 'var(--text-muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '150px',
          fontSize: '0.82rem'
        }}>
          {selectedIds.length > 0 ? selectedNames : "Allergènes..."}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>▼</span>
      </div>

      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1199 }}
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'white',
            border: '1px solid var(--light-border)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '180px',
            overflowY: 'auto',
            zIndex: 1200,
            marginTop: '4px',
            padding: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem'
          }}>
            {allergens.map(a => {
              const isChecked = selectedIds.includes(a.id);
              return (
                <label
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.4rem 0.6rem',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    borderRadius: '6px',
                    background: isChecked ? '#f1f5f9' : 'transparent',
                    userSelect: 'none',
                    margin: 0,
                    fontWeight: 500,
                    color: 'var(--text-main)'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleAllergen(a.id)}
                    style={{ margin: 0, width: 'auto' }}
                  />
                  <span>{a.icon} {a.name}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Reusable Metric card matching Stocks dashboard
function MetricCard({ label, value, icon, tone = 'emerald' }: { label: string; value: string | number; icon: React.ReactNode; tone?: string }) {
  return (
    <motion.div
      className={`metric-card-modern tone-${tone}`}
      whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(9, 13, 22, 0.05)' }}
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

export function TechnicalSheetsApp({ token, tab, stocksInstalled, products, units, onNavigate, onInstalled }: TechnicalSheetsAppProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [dashboard, setDashboard] = useState<TechnicalSheetDashboard>();
  const [recipes, setRecipes] = useState<TechnicalSheetRecipe[]>([]);
  const [categories, setCategories] = useState<TechnicalSheetCategory[]>([]);
  const [allergens, setAllergens] = useState<TechnicalSheetAllergen[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [recipeDialog, setRecipeDialog] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<TechnicalSheetRecipe | null>(null);
  const [form, setForm] = useState<TechnicalSheetRecipePayload>(emptyRecipe);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [allergenName, setAllergenName] = useState('');
  const [allergenIcon, setAllergenIcon] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [requestedPortions, setRequestedPortions] = useState(50);
  const [simulation, setSimulation] = useState<TechnicalSheetSimulation>();
  const [history, setHistory] = useState<TechnicalSheetHistoryEntry[]>([]);
  const [duplicateOpen, setDuplicateOpen] = useState<TechnicalSheetRecipe | null>(null);
  const [duplicateName, setDuplicateName] = useState('');

  async function load() {
    if (!stocksInstalled) return;
    setLoading(true);
    setError(undefined);
    try {
      const [dash, cats, alls, recipeList] = await Promise.all([
        api.technicalSheetsDashboard(token).catch(() => undefined),
        api.technicalSheetCategories(token),
        api.technicalSheetAllergens(token),
        api.technicalSheetRecipes(token, { includeArchived: true, search: search || undefined, status: statusFilter || undefined }),
      ]);
      setDashboard(dash);
      setCategories(cats);
      setAllergens(alls);
      setRecipes(recipeList.items ?? recipeList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des fiches techniques impossible.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [stocksInstalled, search, statusFilter]);

  const selectedRecipe = useMemo(() => recipes.find((recipe) => recipe.id === selectedRecipeId) ?? recipes[0], [recipes, selectedRecipeId]);
  const activeProducts = useMemo(() => products.filter((product) => !isArchived(product)), [products]);
  const averageCost = dashboard?.averageMaterialCost ?? (recipes.length ? recipes.reduce((sum, recipe) => sum + Number(recipe.costTotal ?? recipe.totalCost ?? 0), 0) / recipes.length : 0);

  function openRecipe(recipe?: TechnicalSheetRecipe) {
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
        allergenIds: line.allergens?.map((allergen) => allergen.id) ?? line.allergenIds ?? [],
      })),
      steps: (recipe.steps ?? []).map((step, index) => ({ id: step.id, order: step.order ?? index + 1, title: step.title ?? '', description: step.description ?? '', estimatedTimeMinutes: Number(step.estimatedTimeMinutes ?? 0) })),
    } : { ...emptyRecipe, categoryId: categories.find((cat) => !isArchived(cat))?.id ?? '', ingredients: [], steps: [] });
    setRecipeDialog(true);
  }

  async function saveRecipe() {
    if (!form.name.trim()) return setError('Le nom de la fiche est requis.');
    if (!form.categoryId) return setError('Choisissez une catégorie recette.');
    if (!form.referencePortions || form.referencePortions <= 0) return setError('Les portions de référence doivent être positives.');
    setLoading(true);
    setError(undefined);
    try {
      if (editingRecipe) await api.updateTechnicalSheetRecipe(token, editingRecipe.id, form);
      else await api.createTechnicalSheetRecipe(token, form);
      setRecipeDialog(false);
      setSuccess(editingRecipe ? 'Fiche technique mise à jour.' : 'Fiche technique créée.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setLoading(false);
    }
  }

  async function installModule() {
    setLoading(true);
    setError(undefined);
    try {
      const summary = await api.installTechnicalSheets(token);
      onInstalled?.(summary.installedApplications);
      setSuccess('Fiches Techniques installé : catégories recettes et allergènes standards préchargés.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation impossible. Stocks doit être installé auparavant.');
    } finally {
      setLoading(false);
    }
  }

  async function createCategory() {
    if (!categoryName.trim()) return;
    await api.createTechnicalSheetCategory(token, { name: categoryName.trim(), description: categoryDescription.trim() || undefined });
    setCategoryName('');
    setCategoryDescription('');
    await load();
  }

  async function createAllergen() {
    if (!allergenName.trim()) return;
    await api.createTechnicalSheetAllergen(token, { name: allergenName.trim(), icon: allergenIcon.trim() || undefined });
    setAllergenName('');
    setAllergenIcon('');
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
      copyAllergens: true,
      copyCategory: true,
      resetToDraft: true,
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
    const blob = await (format === 'csv' ? api.exportTechnicalSheetProductionCsv(token, simulation.id) : api.exportTechnicalSheetProductionPdf(token, simulation.id));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production-${simulation.id}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
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
          ['allergens', 'Allergènes'],
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
              onInstall={installModule}
              onOpenRecipes={() => onNavigate('recipes')}
              loading={loading}
            />
          )}
          {tab === 'recipes' && (
            <RecipesTab
              recipes={recipes}
              search={search}
              statusFilter={statusFilter}
              onSearch={setSearch}
              onStatusFilter={setStatusFilter}
              onCreate={() => openRecipe()}
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
          {tab === 'allergens' && (
            <AllergensTab
              allergens={allergens}
              name={allergenName}
              icon={allergenIcon}
              onName={setAllergenName}
              onIcon={setAllergenIcon}
              onCreate={createAllergen}
              onArchive={(id) => api.archiveTechnicalSheetAllergen(token, id).then(load)}
            />
          )}
          {tab === 'costs' && (
            <CostsTab
              recipes={recipes}
              onRecalculate={recalculate}
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

      {/* Create / Edit Dialog Component */}
      <RecipeDialog
        open={recipeDialog}
        form={form}
        setForm={setForm}
        products={activeProducts}
        units={units}
        categories={categories.filter((cat) => !isArchived(cat))}
        allergens={allergens.filter((allergen) => !isArchived(allergen))}
        editing={Boolean(editingRecipe)}
        onClose={() => setRecipeDialog(false)}
        onSave={saveRecipe}
        loading={loading}
      />

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
            La copie reprend les informations générales, la photo, les ingrédients, les étapes, la catégorie et les allergènes, puis repart à l'état de brouillon.
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

function DashboardTab({ dashboard, recipes, categories, averageCost, onInstall, onOpenRecipes, loading }: { dashboard?: TechnicalSheetDashboard; recipes: TechnicalSheetRecipe[]; categories: TechnicalSheetCategory[]; averageCost: number; onInstall: () => void; onOpenRecipes: () => void; loading: boolean }) {
  const latest = dashboard?.latestRecipes ?? recipes.slice(0, 5);
  const topProducts = dashboard?.topProducts ?? [];
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="stats-grid">
        <MetricCard label="Fiches techniques" value={dashboard?.recipeCount ?? recipes.length} icon={<FileText size={20} />} tone="emerald" />
        <MetricCard label="Catégories recettes" value={dashboard?.categoryCount ?? categories.filter((c) => !isArchived(c)).length} icon={<ClipboardList size={20} />} tone="blue" />
        <MetricCard label="Coût matière moyen" value={money(averageCost)} icon={<Calculator size={20} />} tone="orange" />
        <MetricCard label="Produits Stocks utilisés" value={dashboard?.usedStockProductsCount ?? '—'} icon={<Utensils size={20} />} tone="purple" />
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
            onClick={onInstall}
          >
            <Sparkles size={16} /> Installer / précharger Fiches Techniques
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipesTab(props: {
  recipes: TechnicalSheetRecipe[];
  search: string;
  statusFilter: string;
  onSearch: (v: string) => void;
  onStatusFilter: (v: string) => void;
  onCreate: () => void;
  onEdit: (r: TechnicalSheetRecipe) => void;
  onArchive: (r: TechnicalSheetRecipe) => void;
  onDuplicate: (r: TechnicalSheetRecipe) => void;
  onRecalculate: (r: TechnicalSheetRecipe) => void;
  onHistory: (r: TechnicalSheetRecipe) => void;
  selectedHistory: TechnicalSheetHistoryEntry[];
}) {
  const filtered = props.recipes.filter(recipe => {
    const haystack = [recipe.name, recipe.description, recipe.category?.name].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = haystack.includes(props.search.toLowerCase());
    const matchesStatus = !props.statusFilter || recipe.status === props.statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="filter-bar" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="search-input-wrapper" style={{ flexGrow: 1 }}>
          <Search size={18} />
          <input
            className="search-input"
            placeholder="Recherche nom, description, catégorie..."
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
          />
        </div>
        <select
          value={props.statusFilter}
          onChange={(e) => props.onStatusFilter(e.target.value)}
          style={{ minWidth: '150px' }}
        >
          <option value="">Tous les statuts</option>
          {statuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={props.onCreate}>
          <Plus size={16} /> Créer une fiche
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
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>Aucune fiche technique</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Créez une première fiche en sélectionnant uniquement des produits Stocks.
          </p>
          <button className="btn btn-primary" onClick={props.onCreate}>
            Créer une fiche
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

function AllergensTab({
  allergens,
  name,
  icon,
  onName,
  onIcon,
  onCreate,
  onArchive
}: {
  allergens: TechnicalSheetAllergen[];
  name: string;
  icon: string;
  onName: (v: string) => void;
  onIcon: (v: string) => void;
  onCreate: () => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card-modern">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
            Nom de l'allergène
            <input value={name} onChange={(e) => onName(e.target.value)} placeholder="ex: Gluten, Lactose, Arachides..." />
          </label>
          <label style={{ width: '150px', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
            Icône / Code
            <input value={icon} onChange={(e) => onIcon(e.target.value)} placeholder="ex: 🌾, 🥛, 🥜" />
          </label>
          <button className="btn btn-primary" onClick={onCreate} disabled={!name.trim()} style={{ height: '38px' }}>
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </div>
      
      <div className="recipe-grid">
        {allergens.map((allergen) => (
          <div
            key={allergen.id}
            className="card-modern reference-item-card"
            style={{
              padding: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              opacity: isArchived(allergen) ? 0.55 : 1
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>{allergen.icon || '⚠️'}</span>
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>{allergen.name}</strong>
            </div>
            <button
              className="icon-btn danger"
              style={{ padding: '0.4rem' }}
              onClick={() => onArchive(allergen.id)}
              title="Archiver"
            >
              <Archive size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostsTab({
  recipes,
  onRecalculate
}: {
  recipes: TechnicalSheetRecipe[];
  onRecalculate: (r: TechnicalSheetRecipe) => void;
}) {
  const sorted = [...recipes].sort((a, b) => Number(b.costTotal ?? b.totalCost ?? 0) - Number(a.costTotal ?? a.totalCost ?? 0));

  return (
    <div className="card-modern">
      <div className="section-header-modern" style={{ marginBottom: '1.5rem' }}>
        <div className="section-info">
          <span className="card-title">Comparaison des coûts</span>
          <span className="section-tagline">Recalculer les coûts théoriques des recettes à partir des derniers prix d'achat Stocks.</span>
        </div>
      </div>
      
      <div className="table-wrapper">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Recette / Fiche Technique</th>
              <th>Dernier calcul</th>
              <th>Lignes non calculables</th>
              <th style={{ textAlign: 'right' }}>Coût total</th>
              <th style={{ textAlign: 'right' }}>Coût / portion</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((recipe) => (
              <tr key={recipe.id} style={{ transition: 'all 0.2s' }}>
                <td style={{ fontWeight: 600 }}>{recipe.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{date(recipe.lastCostCalculationAt)}</td>
                <td>
                  {recipe.nonCalculableLinesCount ?? 0 > 0 ? (
                    <span className="badge badge-loss" style={{ fontSize: '0.8rem' }}>
                      {recipe.nonCalculableLinesCount} ligne(s)
                    </span>
                  ) : (
                    <span className="badge badge-reception" style={{ fontSize: '0.8rem' }}>0</span>
                  )}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(recipe.costTotal ?? recipe.totalCost)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{money(recipe.costPerPortion)}</td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onRecalculate(recipe)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <RefreshCw size={12} /> Recalculer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
                      {allergen.icon} {allergen.name}
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

function RecipeDialog({ open, form, setForm, products, units, categories, allergens, editing, onClose, onSave, loading }: { open: boolean; form: TechnicalSheetRecipePayload; setForm: (f: TechnicalSheetRecipePayload) => void; products: Product[]; units: Unit[]; categories: TechnicalSheetCategory[]; allergens: TechnicalSheetAllergen[]; editing: boolean; onClose: () => void; onSave: () => void; loading: boolean }) {
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
                    onClick={() => setForm({ ...form, ingredients: [...ingredients, { productId: '', unitId: units[0]?.id ?? '', quantity: 1, comment: '', allergenIds: [] }] })}
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
                          <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1.5fr auto', gap: '0.75rem', alignItems: 'end' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>
                              Produit Stocks
                              <ProductSelect
                                products={products}
                                value={line.productId}
                                onChange={(productId) => {
                                  const product = products.find(p => p.id === productId);
                                  patchIngredient(index, { productId, unitId: product?.unitId ?? line.unitId });
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>
                              Allergènes
                              <AllergenMultiSelect
                                allergens={allergens}
                                selectedIds={line.allergenIds ?? []}
                                onChange={(ids) => patchIngredient(index, { allergenIds: ids })}
                              />
                            </div>
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

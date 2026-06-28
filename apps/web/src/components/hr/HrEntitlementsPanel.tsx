import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Search, Settings2, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import type {
  HrCollaborator,
  HrDepartment,
  HrPosition,
  LegalRightDetail,
  LegalRightSearchItem,
  LegalRightsDiagnosticsResponse,
  PlanningEntitlementCatalogItem,
  PlanningEntitlementCatalogResponse,
  RegulatoryCountryCode,
} from '../../types';

type RightsFilter =
  | 'all'
  | 'activated'
  | 'available'
  | 'review'
  | 'private'
  | 'public'
  | 'working-time'
  | 'leave'
  | 'absence'
  | 'recovery';

type UnifiedRightStatus = 'activated' | 'available' | 'review' | 'manual';

type DetailState =
  | { type: 'legal'; right: LegalRightDetail }
  | { type: 'internal'; card: UnifiedRightCard }
  | null;

type UnifiedRightCard = {
  id: string;
  kind: 'legal' | 'internal';
  legalRightId?: string;
  catalogItemId?: string;
  ruleVersionId?: string;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  status: UnifiedRightStatus;
  sourceLabel: string;
  contextLabel: string;
  tags: string[];
  sectors: string[];
  activated: boolean;
  requiresReview: boolean;
  searchText: string;
  legal?: LegalRightSearchItem;
  catalog?: PlanningEntitlementCatalogItem;
};

type Props = {
  token: string;
  collaborators: HrCollaborator[];
  departments: HrDepartment[];
  positions: HrPosition[];
  canWrite: boolean;
  regulatoryCountryCode?: RegulatoryCountryCode | null;
  onConfigureRegulatoryCountry?: () => void;
};

const FILTERS: Array<{ key: RightsFilter; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'activated', label: 'Activés' },
  { key: 'available', label: 'Disponibles' },
  { key: 'review', label: 'À valider' },
  { key: 'private', label: 'Privé' },
  { key: 'public', label: 'Public' },
  { key: 'working-time', label: 'Temps de travail' },
  { key: 'leave', label: 'Congés' },
  { key: 'absence', label: 'Absences' },
  { key: 'recovery', label: 'Récupération' },
];

const COUNTRY_LABELS: Record<RegulatoryCountryCode, string> = {
  FR: 'France',
  FI: 'Finlande',
};

function countryLabel(country?: RegulatoryCountryCode | null) {
  return country ? COUNTRY_LABELS[country] ?? country : 'Pays non configuré';
}

function categoryLabel(category?: string | null) {
  const normalized = String(category ?? '').toLowerCase();
  if (normalized.includes('temps') || normalized.includes('working')) return 'Temps de travail';
  if (normalized.includes('absence') || normalized.includes('maladie')) return 'Absences';
  if (normalized.includes('récup') || normalized.includes('recup') || normalized.includes('compens')) return 'Récupération';
  if (normalized.includes('congé') || normalized.includes('conge') || normalized.includes('leave')) return 'Congés';
  if (normalized.includes('public')) return 'Fonction publique';
  return category ? String(category) : 'Droit salarié';
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function shortenDescription(value?: string | null) {
  const description = String(value ?? '').trim();
  if (!description) return 'Paramétrage disponible pour cet établissement.';
  if (description.length <= 145) return description;
  return `${description.slice(0, 142).trim()}…`;
}

function formatContext(item: LegalRightSearchItem) {
  const rule = item.rules[0];
  if (rule?.agreement) {
    return [rule.agreement.name, rule.agreement.idcc ? `IDCC ${rule.agreement.idcc}` : null].filter(Boolean).join(' · ');
  }
  if (rule?.publicRegime) return rule.publicRegime.name;
  if (rule?.regime) return rule.regime.name;
  return 'Base légale';
}

function sourceLabel(item: LegalRightSearchItem) {
  const source = item.rules[0]?.sourceLabel?.trim();
  if (!source) return 'Base légale';
  if (/service public/i.test(source)) return 'Service Public';
  if (/légifrance|legifrance/i.test(source)) return 'Légifrance';
  if (/convention/i.test(source)) return 'Convention';
  return source;
}

function legalSectors(item: LegalRightSearchItem) {
  const sectors = new Set<string>();
  item.rules.forEach((rule) => {
    const regimeType = rule.regime?.type?.toLowerCase();
    if (regimeType) sectors.add(regimeType);
    if (rule.agreement) sectors.add('private');
    if (rule.publicRegime) sectors.add('public');
  });
  return Array.from(sectors);
}

function catalogSectors(item: PlanningEntitlementCatalogItem) {
  const framework = String(item.employmentFramework ?? '').toLowerCase();
  if (framework === 'mixed') return ['private', 'public', 'common'];
  if (framework === 'private') return ['private'];
  if (framework === 'public') return ['public'];
  return ['common'];
}

function compactText(value?: string | null) {
  return normalizeText(String(value ?? '')).replace(/[^a-z0-9]+/g, ' ').trim();
}

function catalogLegalHints(item: PlanningEntitlementCatalogItem) {
  const code = compactText(item.code);
  const label = compactText(item.label);
  const hints = new Set([code, label, compactText(item.category), compactText(item.accountType)]);

  if (/paid|conges? payes?|leave/.test(`${code} ${label}`)) hints.add('conges payes');
  if (/annual|annuels/.test(`${code} ${label}`)) hints.add('conges annuels');
  if (/overtime|heures? sup/.test(`${code} ${label}`)) hints.add('heures supplementaires');
  if (/recovery|recup|compens/.test(`${code} ${label}`)) hints.add('recuperation');
  if (/rtt/.test(`${code} ${label}`)) hints.add('rtt');
  if (/sick|maladie/.test(`${code} ${label}`)) hints.add('maladie');
  if (/training|formation/.test(`${code} ${label}`)) hints.add('formation');
  if (/statutaire|statutory/.test(`${code} ${label}`)) hints.add('statutaire');

  return Array.from(hints).filter((hint) => hint.length > 2);
}

function catalogMatchesLegalRight(item: PlanningEntitlementCatalogItem, right: LegalRightSearchItem) {
  const rightTitle = compactText(right.name);
  const itemLabel = compactText(item.label);
  if (itemLabel.length >= 8 && rightTitle.includes(itemLabel)) return true;

  return catalogLegalHints(item).some((hint) => hint.length >= 8 && rightTitle.includes(hint));
}

function statusLabel(status: UnifiedRightStatus) {
  if (status === 'activated') return 'Activé';
  if (status === 'review') return 'À valider';
  if (status === 'manual') return 'Manuel';
  return 'Disponible';
}

function statusClass(status: UnifiedRightStatus) {
  return `right-status ${status}`;
}

function buildLegalCard(item: LegalRightSearchItem, linkedCatalog?: PlanningEntitlementCatalogItem): UnifiedRightCard {
  const rule = item.rules[0];
  const requiresReview = item.rules.some((entry) => entry.validationStatus !== 'active');
  const activated = Boolean(item.activated || linkedCatalog?.active);
  const status: UnifiedRightStatus = activated ? 'activated' : requiresReview ? 'review' : 'available';
  const tags = [...new Set([item.category, ...item.tags, rule?.stableId, rule?.agreement?.idcc].filter(Boolean).map(String))];
  const contextLabel = formatContext(item);
  const source = sourceLabel(item);
  const searchText = normalizeText([item.name, item.description, item.category, contextLabel, source, tags.join(' ')].join(' '));

  return {
    id: `legal-${item.id}`,
    kind: 'legal',
    legalRightId: item.id,
    catalogItemId: linkedCatalog?.id,
    ruleVersionId: linkedCatalog?.sourceRuleVersionId ?? rule?.id,
    title: item.name,
    description: shortenDescription(item.description),
    category: item.category,
    categoryLabel: categoryLabel(item.category),
    status,
    sourceLabel: source,
    contextLabel,
    tags,
    sectors: legalSectors(item),
    activated,
    requiresReview,
    searchText,
    legal: item,
    catalog: linkedCatalog,
  };
}

function buildInternalCard(item: PlanningEntitlementCatalogItem): UnifiedRightCard {
  const activated = Boolean(item.active);
  const status: UnifiedRightStatus = activated ? 'activated' : item.isSystemTemplate ? 'available' : 'manual';
  const tags = [...new Set([item.category, item.accountType, item.unit, ...(item.examples ?? [])].filter(Boolean).map(String))];
  const contextLabel = item.employmentFramework ? String(item.employmentFramework) : 'Modèle établissement';
  const source = item.sourceLabel?.trim() || 'Interne';
  const searchText = normalizeText([item.label, item.shortDescription, item.longDescription, item.category, contextLabel, source, tags.join(' ')].join(' '));

  return {
    id: `internal-${item.id}`,
    kind: 'internal',
    catalogItemId: item.id,
    title: item.label,
    description: shortenDescription(item.shortDescription ?? item.description ?? item.longDescription),
    category: item.category,
    categoryLabel: categoryLabel(item.category),
    status,
    sourceLabel: source,
    contextLabel,
    tags,
    sectors: catalogSectors(item),
    activated,
    requiresReview: Boolean(item.requiresAdminValidation || item.legalValidationStatus === 'requires_review'),
    searchText,
    catalog: item,
  };
}

function filterMatches(card: UnifiedRightCard, filter: RightsFilter) {
  if (filter === 'all') return true;
  if (filter === 'activated') return card.activated;
  if (filter === 'available') return !card.activated && card.status !== 'manual';
  if (filter === 'review') return card.requiresReview || card.status === 'review';
  if (filter === 'private') return card.sectors.includes('private') || card.sectors.includes('common');
  if (filter === 'public') return card.sectors.includes('public') || card.sectors.includes('common');

  const haystack = `${normalizeText(card.category)} ${card.searchText}`;
  if (filter === 'working-time') return /temps|travail|heure|pause|repos|nuit|dimanche|ferie/.test(haystack);
  if (filter === 'leave') return /conge|cp|rtt|cet/.test(haystack);
  if (filter === 'absence') return /absence|maladie|enfant|deces|mariage|naissance|maternite|paternite/.test(haystack);
  if (filter === 'recovery') return /recuperation|recup|compensateur|rcr|cor|heure verte|annualisation/.test(haystack);
  return true;
}

export function HrEntitlementsPanel({
  token,
  canWrite,
  regulatoryCountryCode,
  onConfigureRegulatoryCountry,
}: Props) {
  const [catalog, setCatalog] = useState<PlanningEntitlementCatalogResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<LegalRightsDiagnosticsResponse | null>(null);
  const [legalResults, setLegalResults] = useState<LegalRightSearchItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<RightsFilter>('all');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>(null);

  async function loadData(query = searchTerm) {
    setError(null);
    setLoading(true);
    try {
      const [nextCatalog, nextDiagnostics, nextLegal] = await Promise.all([
        api.hrEntitlementCatalog(token, { search: query.trim() || undefined }),
        api.legalRightsDiagnostics(token),
        regulatoryCountryCode
          ? api.legalRightsSearch(token, {
              query: query.trim() || undefined,
              regime: 'all',
              status: 'all',
              includeRequiresReview: true,
            })
          : Promise.resolve({ items: [] as LegalRightSearchItem[] }),
      ]);
      setCatalog(nextCatalog);
      setDiagnostics(nextDiagnostics);
      setLegalResults(nextLegal.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Droits indisponibles');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(searchTerm);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchTerm, token, regulatoryCountryCode]);

  const cards = useMemo(() => {
    const catalogItems = catalog?.items ?? [];
    const legalConfigByRightId = new Map<string, PlanningEntitlementCatalogItem>();
    const inferredCatalogMatches = new Set<string>();

    catalogItems
      .filter((item) => item.sourceLegalRightId)
      .forEach((item) => {
        legalConfigByRightId.set(item.sourceLegalRightId as string, item);
      });

    catalogItems
      .filter((item) => !item.sourceLegalRightId)
      .forEach((item) => {
        const match = legalResults.find((right) => catalogMatchesLegalRight(item, right));
        if (match) {
          inferredCatalogMatches.add(item.id);
        }
      });

    const legalCards = legalResults.map((item) => buildLegalCard(item, legalConfigByRightId.get(item.id)));
    const legalIds = new Set(legalResults.map((item) => item.id));
    const manualCards = catalogItems
      .filter((item) => !inferredCatalogMatches.has(item.id))
      .filter((item) => !item.sourceLegalRightId || !legalIds.has(item.sourceLegalRightId))
      .map(buildInternalCard);

    return [...legalCards, ...manualCards]
      .filter((card) => filterMatches(card, activeFilter))
      .filter((card) => !searchTerm.trim() || card.searchText.includes(normalizeText(searchTerm)))
      .sort((a, b) => {
        if (a.activated !== b.activated) return a.activated ? -1 : 1;
        if (a.requiresReview !== b.requiresReview) return a.requiresReview ? 1 : -1;
        return a.title.localeCompare(b.title, 'fr');
      });
  }, [catalog?.items, legalResults, activeFilter, searchTerm]);

  const country = countryLabel(regulatoryCountryCode);
  const rightsCount = diagnostics?.legalBase?.rightsCount ?? legalResults.length;
  const configuredCount = diagnostics?.establishmentConfigurations?.enabled ?? catalog?.counts.active ?? 0;
  const organizationType = catalog?.setup.organizationType ? String(catalog.setup.organizationType) : 'Restaurant / Café';
  const emptyCountry = !regulatoryCountryCode;
  const finlandPending = regulatoryCountryCode === 'FI' && rightsCount === 0;

  async function activateCard(card: UnifiedRightCard) {
    if (!canWrite) return;
    setActionLoading(card.id);
    setError(null);
    try {
      if (card.kind === 'legal' && card.legalRightId) {
        await api.activateLegalRight(token, card.legalRightId, { ruleVersionId: card.ruleVersionId });
      } else if (card.catalogItemId) {
        await api.activateHrEntitlementCatalogItem(token, card.catalogItemId, { targetMode: 'NONE' });
      }
      await loadData(searchTerm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation impossible');
    } finally {
      setActionLoading(null);
    }
  }

  async function openDetail(card: UnifiedRightCard) {
    setError(null);
    if (card.kind !== 'legal' || !card.legalRightId) {
      setDetail({ type: 'internal', card });
      return;
    }

    setActionLoading(`detail-${card.id}`);
    try {
      const right = await api.legalRightDetail(token, card.legalRightId);
      setDetail({ type: 'legal', right });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Détail indisponible');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <section className="rights-catalog-shell">
      <div className="rights-page-head">
        <div className="rights-title-block">
          <span className="rights-title-icon"><ShieldCheck size={20} /></span>
          <div>
            <h2>Droits salariés</h2>
            <p>
              {country} · {organizationType} · {rightsCount} droits disponibles · {configuredCount} configurés
            </p>
          </div>
        </div>
        {onConfigureRegulatoryCountry ? (
          <button type="button" className="link-button subtle" onClick={onConfigureRegulatoryCountry}>
            Modifier dans Organisation &gt; Général
          </button>
        ) : null}
      </div>

      <div className="rights-toolbar">
        <label className="search-field rights-search-field">
          <Search size={18} />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Rechercher un droit, une convention, un tag…"
          />
        </label>
        <div className="rights-filter-row" aria-label="Filtres droits salariés">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={activeFilter === filter.key ? 'active' : ''}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="alert compact-alert">{error}</div> : null}

      {emptyCountry ? (
        <div className="rights-empty-state">
          <strong>Pays de réglementation non configuré</strong>
          <span>Choisissez le pays dans Organisation &gt; Général pour charger les droits applicables.</span>
          {onConfigureRegulatoryCountry ? (
            <button type="button" onClick={onConfigureRegulatoryCountry}>Configurer le pays</button>
          ) : null}
        </div>
      ) : finlandPending ? (
        <div className="rights-empty-state">
          <strong>Base Finlande en préparation</strong>
          <span>Les modèles internes restent disponibles pendant la préparation du référentiel légal.</span>
        </div>
      ) : null}

      {!emptyCountry && !finlandPending ? (
        <>
          <div className="rights-catalog-meta">
            <span>{loading ? 'Chargement…' : `${cards.length} résultat(s)`}</span>
            <span>{cards.filter((card) => card.activated).length} activé(s)</span>
          </div>

          <div className="rights-catalog-grid">
            {cards.map((card) => (
              <article key={card.id} className={`right-catalog-card ${card.activated ? 'is-active' : ''}`}>
                <div className="right-card-topline">
                  <span className="right-category">{card.categoryLabel}</span>
                  <span className={statusClass(card.status)} title={card.status === 'review' ? 'Cette règle doit être vérifiée juridiquement avant usage définitif.' : undefined}>
                    {statusLabel(card.status)}
                  </span>
                </div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <div className="right-card-context">
                  <span>{card.sourceLabel}</span>
                  <span>{card.contextLabel}</span>
                </div>
                {card.tags.length ? (
                  <div className="right-card-tags">
                    {card.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                ) : null}
                <footer>
                  <button type="button" className="btn compact ghost" onClick={() => void openDetail(card)} disabled={actionLoading === `detail-${card.id}`}>
                    <FileText size={15} /> Détail
                  </button>
                  {card.activated ? (
                    <button type="button" className="btn compact muted" disabled>
                      <CheckCircle2 size={15} /> Configuré
                    </button>
                  ) : canWrite ? (
                    <button type="button" className="btn compact" onClick={() => void activateCard(card)} disabled={actionLoading === card.id}>
                      <Settings2 size={15} /> {actionLoading === card.id ? 'Activation…' : 'Activer'}
                    </button>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>

          {!loading && cards.length === 0 ? (
            <div className="rights-empty-state">
              <strong>Aucun droit trouvé</strong>
              <span>Essayez une recherche plus large ou le filtre Tous.</span>
            </div>
          ) : null}
        </>
      ) : null}

      {detail ? (
        <RightDetailPanel detail={detail} onClose={() => setDetail(null)} />
      ) : null}
    </section>
  );
}

function RightDetailPanel({ detail, onClose }: { detail: DetailState; onClose: () => void }) {
  if (!detail) return null;

  if (detail.type === 'internal') {
    const card = detail.card;
    return (
      <aside className="rights-detail-panel">
        <header>
          <div>
            <span>{card.sourceLabel}</span>
            <h3>{card.title}</h3>
          </div>
          <button type="button" className="btn compact ghost" onClick={onClose}>Fermer</button>
        </header>
        <p>{card.catalog?.longDescription || card.description}</p>
        <div className="rights-detail-row">
          <strong>{card.categoryLabel}</strong>
          <span>{statusLabel(card.status)} · {card.contextLabel}</span>
        </div>
      </aside>
    );
  }

  const right = detail.right;
  return (
    <aside className="rights-detail-panel">
      <header>
        <div>
          <span>Base légale</span>
          <h3>{right.name}</h3>
        </div>
        <button type="button" className="btn compact ghost" onClick={onClose}>Fermer</button>
      </header>
      {right.description ? <p>{right.description}</p> : null}
      <div className="rights-detail-rules">
        {right.rules.map((rule) => (
          <div key={rule.id} className="rights-detail-row">
            <strong>{rule.agreement?.name || rule.publicRegime?.name || rule.regime?.name || 'Règle applicable'}</strong>
            <span>
              {rule.validationStatus === 'active' ? 'Actif' : 'À valider juridiquement'} · {rule.unit} · {rule.formulaType}
            </span>
            {rule.sourceUrl ? <a href={rule.sourceUrl} target="_blank" rel="noreferrer">{rule.sourceLabel || 'Source'}</a> : <em>{rule.sourceLabel || 'Source non renseignée'}</em>}
          </div>
        ))}
      </div>
    </aside>
  );
}

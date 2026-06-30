import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Layers3, Search, Settings2, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
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
  RegulatorySector,
} from '../../types';

type RightsPrimaryFilter =
  | 'recommended'
  | 'all'
  | 'included'
  | 'activated'
  | 'conventional'
  | 'public'
  | 'review'
  | 'manual';

type UnifiedRightStatus = 'included' | 'included_requires_review' | 'activated' | 'available' | 'review' | 'manual';

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
  sourceLayer: string;
  autoApplicable: boolean;
  applicableByDefault: boolean;
  requiresConfiguration: boolean;
  employeeCounterSupported: boolean;
  establishmentConfigurationId?: string | null;
  uiStatus?: string | null;
  validationStatus?: string | null;
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
  regulatorySector?: RegulatorySector | null;
  onConfigureRegulatoryCountry?: () => void;
};

const PRIMARY_FILTERS: Array<{
  key: RightsPrimaryFilter;
  label: string;
  hint: string;
  tone: 'emerald' | 'blue' | 'purple' | 'amber' | 'slate';
  Icon: typeof Layers3;
}> = [
  { key: 'recommended', label: 'Recommandés', hint: 'Pour mon établissement', tone: 'emerald', Icon: Sparkles },
  { key: 'included', label: 'Inclus obligatoires', hint: 'Socle automatique', tone: 'blue', Icon: ShieldCheck },
  { key: 'activated', label: 'Activés établissement', hint: 'Droits configurés', tone: 'blue', Icon: CheckCircle2 },
  { key: 'conventional', label: 'Conventionnels', hint: 'Conventions privées', tone: 'purple', Icon: Layers3 },
  { key: 'public', label: 'Public', hint: 'Statuts publics', tone: 'purple', Icon: ShieldCheck },
  { key: 'manual', label: 'Manuels', hint: 'Templates internes', tone: 'slate', Icon: Wrench },
  { key: 'review', label: 'À valider', hint: 'Validation juridique', tone: 'amber', Icon: AlertTriangle },
  { key: 'all', label: 'Tous', hint: 'Catalogue complet', tone: 'slate', Icon: Layers3 },
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
  if (item.sourceLayer === 'common_law') return 'Socle commun France';
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
  if (status === 'included' || status === 'included_requires_review') return 'Inclus automatiquement';
  if (status === 'activated') return 'Activé';
  if (status === 'review') return 'À valider juridiquement';
  if (status === 'manual') return 'Manuel';
  return 'Disponible';
}

function statusClass(status: UnifiedRightStatus) {
  return `right-status ${status}`;
}

function statusBadges(card: UnifiedRightCard) {
  const badges: Array<{ key: string; label: string; className: string }> = [];
  if (card.autoApplicable) {
    badges.push({ key: 'included', label: 'Inclus automatiquement', className: 'included' });
  } else {
    badges.push({ key: card.status, label: statusLabel(card.status), className: card.status });
  }
  if (card.requiresReview && !badges.some((badge) => badge.className === 'review')) {
    badges.push({ key: 'review', label: 'À valider juridiquement', className: 'review' });
  }
  return badges;
}

function legalRegimeParam(sector?: RegulatorySector | null) {
  if (sector === 'PUBLIC') return 'public';
  if (sector === 'PRIVATE') return 'private';
  return 'all';
}

function buildLegalCard(item: LegalRightSearchItem, linkedCatalog?: PlanningEntitlementCatalogItem): UnifiedRightCard {
  const rule = item.rules.find((entry) => entry.sourceLayer === 'common_law') ?? item.rules[0];
  const validationStatus = item.validationStatus ?? (item.rules.some((entry) => entry.validationStatus === 'active') ? 'active' : item.rules[0]?.validationStatus);
  const autoApplicable = Boolean(item.autoApplicable || item.applicableByDefault || item.uiStatus === 'included' || item.uiStatus === 'included_requires_review');
  const requiresReview = item.uiStatus === 'included_requires_review' || item.uiStatus === 'requires_review' || validationStatus === 'requires_review' || item.rules.some((entry) => entry.validationStatus !== 'active');
  const activated = Boolean(item.activated || linkedCatalog?.active);
  const status: UnifiedRightStatus = autoApplicable
    ? (requiresReview ? 'included_requires_review' : 'included')
    : activated
      ? 'activated'
      : requiresReview
        ? 'review'
        : 'available';
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
    sourceLayer: item.sourceLayer ?? 'legal_reference',
    autoApplicable,
    applicableByDefault: Boolean(item.applicableByDefault || autoApplicable),
    requiresConfiguration: Boolean(item.requiresConfiguration),
    employeeCounterSupported: Boolean(item.employeeCounterSupported),
    establishmentConfigurationId: item.establishmentConfigurationId ?? item.organizationRuleId ?? null,
    uiStatus: item.uiStatus ?? status,
    validationStatus: validationStatus ?? null,
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
    sourceLayer: item.isLegalConfiguration ? 'legal_reference' : 'manual_template',
    autoApplicable: false,
    applicableByDefault: false,
    requiresConfiguration: false,
    employeeCounterSupported: false,
    establishmentConfigurationId: item.isLegalConfiguration ? item.id : null,
    uiStatus: activated ? 'activated' : status,
    validationStatus: item.legalValidationStatus ?? null,
    searchText,
    catalog: item,
  };
}

function isManualLegalDuplicate(card: UnifiedRightCard) {
  if (card.sourceLayer !== 'manual_template') return false;
  const haystack = `${compactText(card.title)} ${compactText(card.category)} ${compactText(card.catalog?.code)} ${compactText(card.catalog?.accountType)}`;
  return /conges? payes?|paid leave|annual leave|heures? supplementaires?|overtime/.test(haystack);
}

function isConventionalRight(card: UnifiedRightCard) {
  return card.sourceLayer === 'collective_agreement'
    || Boolean(card.legal?.rules?.some((rule) => rule.agreement))
    || /idcc|hcr|restauration|hpa|fehap|hospitalisation|cafeteria|casino/i.test(`${card.contextLabel} ${card.sourceLabel}`);
}

function isPublicRight(card: UnifiedRightCard) {
  return card.sourceLayer === 'public_regime'
    || card.sourceLayer === 'public_status'
    || card.sectors.includes('public')
    || Boolean(card.legal?.rules?.some((rule) => rule.publicRegime))
    || /fonction publique|fph|fpt|fpe|public/i.test(`${card.contextLabel} ${card.sourceLabel}`);
}

function isRecommendedForOrganization(card: UnifiedRightCard, sector?: RegulatorySector | null, organizationType?: string | null) {
  if (card.autoApplicable || card.activated) return true;
  if (isManualLegalDuplicate(card)) return false;

  const establishment = normalizeText(organizationType ?? '');
  const haystack = `${card.searchText} ${normalizeText(card.contextLabel)} ${normalizeText(card.sourceLabel)}`;

  if (sector === 'PUBLIC') {
    return isPublicRight(card) || (card.sourceLayer === 'manual_template' && Boolean(card.catalog?.isRecommended));
  }

  if (sector === 'PRIVATE') {
    if (isPublicRight(card)) return false;
    if (/restaurant|cafe|hotel|traiteur/.test(establishment)) return /hcr|1979|hotel cafe restaurant/.test(haystack) || card.activated;
    if (/collectivite|cuisine centrale|cantine/.test(establishment)) return /restauration collective|1266/.test(haystack) || card.activated;
    if (/rapide|fast/.test(establishment)) return /restauration rapide|1501/.test(haystack) || card.activated;
    if (/camping|plein air|hpa/.test(establishment)) return /hpa|plein air|1631/.test(haystack) || card.activated;
    if (/ehpad|clinique|hospitalisation/.test(establishment)) return /fehap|hospitalisation privee|2264|29|0029/.test(haystack) || card.activated;
    return isConventionalRight(card) || (card.sourceLayer === 'manual_template' && Boolean(card.catalog?.isRecommended));
  }

  return card.autoApplicable || card.activated || card.sourceLayer === 'manual_template';
}

function primaryFilterMatches(card: UnifiedRightCard, filter: RightsPrimaryFilter, sector?: RegulatorySector | null, organizationType?: string | null) {
  if (filter !== 'all' && isManualLegalDuplicate(card)) return false;
  if (filter === 'recommended') return isRecommendedForOrganization(card, sector, organizationType);
  if (filter === 'all') return true;
  if (filter === 'included') return card.autoApplicable;
  if (filter === 'activated') return card.activated;
  if (filter === 'conventional') return isConventionalRight(card) && !isPublicRight(card);
  if (filter === 'public') return isPublicRight(card);
  if (filter === 'review') return card.requiresReview;
  if (filter === 'manual') return card.sourceLayer === 'manual_template' || card.status === 'manual';
  return true;
}

function sectorLabel(sector?: RegulatorySector | null) {
  if (sector === 'PRIVATE') return 'Secteur privé';
  if (sector === 'PUBLIC') return 'Secteur public';
  return 'Secteur non configuré';
}

export function HrEntitlementsPanel({
  token,
  canWrite,
  regulatoryCountryCode,
  regulatorySector,
  onConfigureRegulatoryCountry,
}: Props) {
  const [catalog, setCatalog] = useState<PlanningEntitlementCatalogResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<LegalRightsDiagnosticsResponse | null>(null);
  const [legalResults, setLegalResults] = useState<LegalRightSearchItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<RightsPrimaryFilter>('recommended');
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
              country: regulatoryCountryCode,
              regime: legalRegimeParam(regulatorySector),
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
    if (!regulatoryCountryCode || !regulatorySector) return;
    const timer = window.setTimeout(() => {
      void loadData(searchTerm);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchTerm, token, regulatoryCountryCode, regulatorySector]);

  const allCards = useMemo(() => {
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
      .filter((card) => !searchTerm.trim() || card.searchText.includes(normalizeText(searchTerm)))
      .sort((a, b) => {
        if (a.autoApplicable !== b.autoApplicable) return a.autoApplicable ? -1 : 1;
        if (a.legal?.priorityCommonLaw !== b.legal?.priorityCommonLaw) return a.legal?.priorityCommonLaw ? -1 : 1;
        if (a.activated !== b.activated) return a.activated ? -1 : 1;
        if (a.requiresReview !== b.requiresReview) return a.requiresReview ? 1 : -1;
        return a.title.localeCompare(b.title, 'fr');
      });
  }, [catalog?.items, legalResults, searchTerm]);

  const organizationType = catalog?.setup.organizationType ? String(catalog.setup.organizationType) : 'Restaurant / Café';

  const cards = useMemo(() => {
    return allCards.filter((card) => primaryFilterMatches(card, activeFilter, regulatorySector, organizationType));
  }, [allCards, activeFilter, regulatorySector, organizationType]);

  const filterCounts = useMemo<Record<RightsPrimaryFilter, number>>(() => {
    return PRIMARY_FILTERS.reduce((acc, filter) => {
      acc[filter.key] = allCards.filter((card) => primaryFilterMatches(card, filter.key, regulatorySector, organizationType)).length;
      return acc;
    }, {} as Record<RightsPrimaryFilter, number>);
  }, [allCards, regulatorySector, organizationType]);

  const country = countryLabel(regulatoryCountryCode);
  const rightsCount = cards.length;
  const configuredCount = diagnostics?.establishmentConfigurations?.enabled ?? catalog?.counts.active ?? 0;
  const emptyCountry = !regulatoryCountryCode;
  const emptySector = !regulatorySector;
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
      if (activeFilter) await loadData(searchTerm);
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
              {country} · {sectorLabel(regulatorySector)} · {organizationType}
            {` · ${rightsCount} droits · ${configuredCount} configurés`}
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
        <label className="rights-search-field" aria-label="Rechercher un droit">
          <Search size={20} />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Rechercher un droit, une convention, un tag…"
          />
        </label>
        <div className="rights-kpi-filter-grid" aria-label="Filtres droits salariés">
          {PRIMARY_FILTERS.map((filter) => {
            const Icon = filter.Icon;
            const isActive = activeFilter === filter.key;
            const hasLoadedCounts = Boolean(catalog || legalResults.length);
            return (
            <button
              key={filter.key}
              type="button"
              className={`rights-kpi-filter ${filter.tone}${isActive ? ' active' : ''}`}
              onClick={() => {
                setActiveFilter(filter.key);
              }}
              aria-pressed={isActive}
            >
              <span className="rights-kpi-filter-head">
                <span className={`rights-kpi-filter-icon ${filter.tone}`}>
                  <Icon size={22} />
                </span>
                <span className="rights-kpi-filter-badge">{isActive ? 'Ouvert' : 'Cliquer'}</span>
              </span>
              <strong>{hasLoadedCounts ? filterCounts[filter.key] : '–'}</strong>
              <span className="rights-kpi-filter-label">{filter.label}</span>
              <small>{filter.hint}</small>
            </button>
            );
          })}
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
      ) : emptySector ? (
        <div className="rights-empty-state">
          <strong>Secteur non configuré</strong>
          <span>Choisissez Secteur privé ou Secteur public dans Organisation &gt; Général pour afficher uniquement les droits correspondants.</span>
          {onConfigureRegulatoryCountry ? (
            <button type="button" onClick={onConfigureRegulatoryCountry}>Configurer le secteur</button>
          ) : null}
        </div>
      ) : finlandPending ? (
        <div className="rights-empty-state">
          <strong>Base Finlande en préparation</strong>
          <span>Les modèles internes restent disponibles pendant la préparation du référentiel légal.</span>
        </div>
      ) : null}

      {!emptyCountry && !emptySector && !finlandPending ? (
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
                  <span className="right-status-list">
                    {statusBadges(card).map((badge) => (
                      <span key={badge.key} className={statusClass(badge.className as UnifiedRightStatus)}>
                        {badge.label}
                      </span>
                    ))}
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
                  {card.autoApplicable ? (
                    <button type="button" className="btn compact muted" disabled>
                      <ShieldCheck size={15} /> Inclus
                    </button>
                  ) : card.activated ? (
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
              Actif · {rule.unit} · {rule.formulaType}
            </span>
            {rule.sourceUrl ? <a href={rule.sourceUrl} target="_blank" rel="noreferrer">{rule.sourceLabel || 'Source'}</a> : <em>{rule.sourceLabel || 'Source non renseignée'}</em>}
          </div>
        ))}
      </div>
    </aside>
  );
}

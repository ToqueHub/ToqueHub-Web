import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Database,
  FileText,
  GitBranch,
  Info,
  Layers,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import { ApiError, api } from '../api/client';
import type {
  ArchitectureAnalysis,
  ArchitectureDuplicateAlert,
  ArchitectureImpact,
  ArchitectureModule,
  ArchitecturePrismaModel,
  ArchitectureRelation,
  ArchitectureTableMap,
  UserSession,
} from '../types';

type SectionKey = 'global' | 'modules' | 'dataMap' | 'relations' | 'schema' | 'duplicates' | 'impact' | 'roadmap' | 'docs';

type GraphEdge = {
  source: string;
  target: string;
  type?: string;
  label?: string;
};

type GraphNode = {
  id: string;
  label: string;
  type: 'module' | 'table' | 'entity';
  module?: string;
  x: number;
  y: number;
};

const sections: Array<{ key: SectionKey; label: string; icon: typeof Layers }> = [
  { key: 'global', label: 'Vue globale', icon: Network },
  { key: 'modules', label: 'Modules', icon: Boxes },
  { key: 'dataMap', label: 'Data Map', icon: Database },
  { key: 'relations', label: 'Relations', icon: GitBranch },
  { key: 'schema', label: 'Schéma Prisma', icon: FileText },
  { key: 'duplicates', label: 'Doublons', icon: AlertTriangle },
  { key: 'impact', label: 'Impact', icon: ShieldCheck },
  { key: 'roadmap', label: 'Roadmap', icon: Sparkles },
  { key: 'docs', label: 'Documentation', icon: BookOpen },
];

const fallbackAnalysis: ArchitectureAnalysis = {
  summary: { modules: 2, tables: 0, relations: 0, users: 0, organizations: 0, products: 0, suppliers: 0 },
  modules: [
    {
      id: 'core',
      name: 'Core',
      status: 'actif',
      description: 'Fondation du système.',
      ownedData: ['organisations', 'utilisateurs', 'rôles', 'permissions', 'sites'],
      consumedData: [],
      consumerModules: ['Stocks'],
      dependencies: [],
    },
    {
      id: 'stocks',
      name: 'Stocks',
      status: 'installé',
      description: 'Gestion des stocks.',
      ownedData: ['produits', 'catégories', 'unités', 'fournisseurs', 'stocks', 'mouvements'],
      consumedData: ['utilisateurs', 'organisations', 'sites'],
      consumerModules: [],
      dependencies: ['Core'],
    },
  ],
  dataMap: [],
  relations: [],
  prismaModels: [],
  duplicateAlerts: [],
  impact: [],
  roadmap: [
    { module: 'Core', status: 'actif', description: 'Socle multi-organisation, utilisateurs, rôles et paramètres.' },
    { module: 'Stocks', status: 'installé', description: 'Périmètre réel de gestion produits, fournisseurs, stocks et mouvements.' },
  ],
  documentation: [],
};

function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(textOf).join(' ');
  return String(value);
}

function includesQuery(value: unknown, query: string) {
  return textOf(value).toLowerCase().includes(query.toLowerCase());
}

function list(value?: string[]) {
  return value?.length ? value : ['—'];
}

function statusColor(status?: string) {
  const s = status?.toLowerCase() ?? '';
  if (s.includes('actif') || s.includes('install') || s.includes('termin')) return 'success';
  if (s.includes('dev')) return 'warning';
  if (s.includes('dépr') || s.includes('depr')) return 'error';
  return 'default';
}

function severityColor(level?: string) {
  const s = level?.toLowerCase() ?? '';
  if (s.includes('crit')) return 'error';
  if (s.includes('attention') || s.includes('warn')) return 'warning';
  return 'info';
}

function tableName(table: ArchitectureTableMap) {
  return table.table ?? table.name ?? table.model ?? 'Table';
}

function moduleName(module: ArchitectureModule) {
  return module.name ?? module.id ?? 'Module';
}

function cleanGraphId(value: unknown) {
  return String(value ?? '').replace(/^table:/, '').replace(/^module:/, '');
}

function getRelationSource(relation: ArchitectureRelation | GraphEdge) {
  const row = relation as Record<string, unknown>;
  return cleanGraphId(row.source ?? row.from ?? row.sourceTable ?? row.fromTable ?? row.fromModel ?? row.model ?? 'source');
}

function getRelationTarget(relation: ArchitectureRelation | GraphEdge) {
  const row = relation as Record<string, unknown>;
  return cleanGraphId(row.target ?? row.to ?? row.targetTable ?? row.toTable ?? row.toModel ?? row.relatedModel ?? 'target');
}

function moduleOwnedData(module: ArchitectureModule) {
  return module.ownedData ?? module.ownedTables ?? [];
}

function moduleConsumedData(module: ArchitectureModule) {
  return module.consumedData ?? module.consumedTables ?? [];
}

function normalizeAnalysis(payload: ArchitectureAnalysis): ArchitectureAnalysis {
  const relations = Array.isArray(payload.relations) ? payload.relations : ((payload.relations as { edges?: ArchitectureRelation[] } | undefined)?.edges ?? []);
  return {
    ...fallbackAnalysis,
    ...payload,
    relations,
    prismaModels: payload.prismaModels ?? payload.schema ?? [],
    duplicateAlerts: payload.duplicateAlerts ?? payload.duplicates ?? [],
    impact: payload.impact ?? payload.impacts ?? [],
    modules: (payload.modules ?? []).map((module) => ({
      ...module,
      ownedData: module.ownedData ?? module.ownedTables ?? [],
      consumedData: module.consumedData ?? module.consumedTables ?? [],
    })),
    dataMap: (payload.dataMap ?? []).map((row) => ({
      ...row,
      ownerModule: row.ownerModule ?? row.owner ?? 'Core',
      consumerModules: row.consumerModules ?? row.consumers ?? [],
    })),
  };
}

export function ArchitectureCenter({ session }: { session: UserSession }) {
  const [analysis, setAnalysis] = useState<ArchitectureAnalysis>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [denied, setDenied] = useState(false);
  const [section, setSection] = useState<SectionKey>('global');
  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [relationTypeFilter, setRelationTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedModuleId, setSelectedModuleId] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(undefined);
    setDenied(false);
    api.architecture(session.accessToken)
      .then((payload) => {
        if (!mounted) return;
        const merged = normalizeAnalysis(payload);
        setAnalysis(merged);
        setSelectedModuleId(merged.modules?.[0]?.id ?? merged.modules?.[0]?.name ?? '');
      })
      .catch((err) => {
        if (!mounted) return;
        if (err instanceof ApiError && err.status === 403) setDenied(true);
        setError(err instanceof Error ? err.message : 'Analyse d’architecture indisponible.');
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [session.accessToken]);

  const data = analysis ?? fallbackAnalysis;
  const relationRows = Array.isArray(data.relations) ? data.relations : data.relations.edges;
  const owners = useMemo(() => Array.from(new Set(data.dataMap.map((row) => row.ownerModule).filter(Boolean))) as string[], [data.dataMap]);
  const relationTypes = useMemo(() => Array.from(new Set(relationRows.map((row) => row.type).filter(Boolean))) as string[], [relationRows]);
  const statuses = useMemo(() => Array.from(new Set(data.modules.map((row) => row.status).filter(Boolean))) as string[], [data.modules]);

  const filteredModules = useMemo(() => data.modules.filter((item) =>
    includesQuery(item, query) && (statusFilter === 'all' || item.status === statusFilter)
  ), [data.modules, query, statusFilter]);

  const filteredDataMap = useMemo(() => data.dataMap.filter((item) =>
    includesQuery(item, query) && (ownerFilter === 'all' || item.ownerModule === ownerFilter)
  ), [data.dataMap, query, ownerFilter]);

  const filteredRelations = useMemo(() => relationRows.filter((item) =>
    includesQuery(item, query) && (relationTypeFilter === 'all' || item.type === relationTypeFilter)
  ), [relationRows, query, relationTypeFilter]);

  const filteredModels = useMemo(() => (data.prismaModels ?? data.schema ?? []).filter((item) => includesQuery(item, query)), [data.prismaModels, data.schema, query]);
  const filteredAlerts = useMemo(() => data.duplicateAlerts.filter((item) =>
    includesQuery(item, query) && (severityFilter === 'all' || item.level === severityFilter)
  ), [data.duplicateAlerts, query, severityFilter]);
  const filteredDocs = useMemo(() => data.documentation.filter((item) => includesQuery(item, query)), [data.documentation, query]);

  const selectedModule = data.modules.find((item) => (item.id ?? item.name) === selectedModuleId) ?? data.modules[0];
  const selectedImpact = (data.impact ?? data.impacts ?? []).find((item) => item.moduleId === selectedModuleId || item.module === selectedModule?.name || item.moduleName === selectedModule?.name || item.module === selectedModule?.id);

  if (loading) {
    return <ArchitectureState icon={<CircularProgress size={26} />} title="Analyse en cours" text="Lecture du schéma Prisma, des compteurs réels et des dépendances détectées…" />;
  }

  if (denied) {
    return <ArchitectureState icon={<ShieldCheck />} title="Accès refusé" text="Le centre d’architecture est strictement réservé aux administrateurs." />;
  }

  if (error && !analysis) {
    return <ArchitectureState icon={<AlertTriangle />} title="Erreur d’analyse" text={error} />;
  }

  return (
    <div className="architecture-center">
      <section className="welcome-hero architecture-hero">
        <span className="welcome-tag"><Network size={14} /> Paramètres avancés · Architecture</span>
        <h1 className="welcome-title">Architecture ToqueHub</h1>
        <p className="welcome-desc">Visualisez l’ensemble de votre environnement et des relations entre les modules.</p>
      </section>

      {error ? <div className="alert-modern error"><AlertTriangle /> <div>{error}</div></div> : null}

      <div className="architecture-toolbar card-modern">
        <TextField
          label="Recherche globale"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          size="small"
          fullWidth
          slotProps={{ input: { startAdornment: <Search size={16} style={{ marginRight: 8, color: '#64748b' }} /> } }}
        />
        <div className="architecture-filter-row">
          <ArchitectureSelect label="Propriétaire" value={ownerFilter} values={owners} onChange={setOwnerFilter} />
          <ArchitectureSelect label="Alerte" value={severityFilter} values={['information', 'attention', 'critique']} onChange={setSeverityFilter} />
          <ArchitectureSelect label="Relation" value={relationTypeFilter} values={relationTypes} onChange={setRelationTypeFilter} />
          <ArchitectureSelect label="Statut" value={statusFilter} values={statuses} onChange={setStatusFilter} />
        </div>
      </div>

      <SummaryGrid analysis={data} />

      <Box className="architecture-tabs-card">
        <Tabs value={section} onChange={(_, value) => setSection(value)} variant="scrollable" scrollButtons="auto">
          {sections.map((item) => <Tab key={item.key} value={item.key} label={item.label} />)}
        </Tabs>
      </Box>

      <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        {section === 'global' && <GlobalView analysis={data} />}
        {section === 'modules' && <ModulesView modules={filteredModules} />}
        {section === 'dataMap' && <DataMapView rows={filteredDataMap} />}
        {section === 'relations' && <RelationsView modules={data.modules} tables={data.dataMap} relations={filteredRelations} graphEdges={data.graph?.edges ?? []} />}
        {section === 'schema' && <SchemaView models={filteredModels} />}
        {section === 'duplicates' && <DuplicatesView alerts={filteredAlerts} />}
        {section === 'impact' && (
          <ImpactView
            modules={data.modules}
            selectedModuleId={selectedModuleId}
            setSelectedModuleId={setSelectedModuleId}
            selectedModule={selectedModule}
            impact={selectedImpact}
          />
        )}
        {section === 'roadmap' && <RoadmapView analysis={data} />}
        {section === 'docs' && <DocumentationView docs={filteredDocs} analysis={data} />}
      </motion.div>
    </div>
  );
}

function ArchitectureState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="card-modern architecture-state">
      <div className="architecture-state-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function ArchitectureSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <FormControl size="small" className="architecture-select">
      <InputLabel>{label}</InputLabel>
      <Select value={value} label={label} onChange={(event) => onChange(event.target.value)}>
        <MenuItem value="all">Tous</MenuItem>
        {values.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
      </Select>
    </FormControl>
  );
}

function SummaryGrid({ analysis }: { analysis: ArchitectureAnalysis }) {
  const metrics = [
    ['Modules', analysis.summary.modules ?? analysis.modules.length],
    ['Tables', analysis.summary.tables ?? analysis.dataMap.length],
    ['Relations', analysis.summary.relations ?? (Array.isArray(analysis.relations) ? analysis.relations.length : analysis.relations.edges.length)],
    ['Utilisateurs', analysis.summary.users ?? 0],
    ['Organisations', analysis.summary.organizations ?? 0],
    ['Produits', analysis.summary.products ?? 0],
    ['Fournisseurs', analysis.summary.suppliers ?? 0],
  ];
  return (
    <div className="architecture-metrics-grid">
      {metrics.map(([label, value], index) => (
        <div className="metric-card architecture-metric" key={label}>
          <div className={`metric-icon-wrapper ${index % 3 === 0 ? 'emerald' : index % 3 === 1 ? 'blue' : 'purple'}`}><Database size={22} /></div>
          <div className="metric-content"><span className="metric-value">{value}</span><span className="metric-label">{label}</span></div>
        </div>
      ))}
    </div>
  );
}

function GlobalView({ analysis }: { analysis: ArchitectureAnalysis }) {
  return (
    <div className="architecture-grid two">
      <div className="card-modern architecture-map-card">
        <span className="card-title"><Network size={18} /> Vue d’ensemble</span>
        <div className="architecture-hierarchy">
          <div className="arch-root">ToqueHub</div>
          <div className="arch-branches">
            {analysis.modules.map((module) => (
              <div className="arch-branch" key={module.id ?? module.name}>
                <strong>{moduleName(module)}</strong>
                <Chip size="small" label={module.status ?? 'actif'} color={statusColor(module.status) as any} />
                <ul>{list(moduleOwnedData(module)).slice(0, 8).map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ))}
            <div className="arch-branch database"><strong>Base PostgreSQL</strong><span>{analysis.dataMap.length} tables cartographiées</span></div>
          </div>
        </div>
      </div>
      <div className="card-modern">
        <span className="card-title"><Info size={18} /> Règle fondamentale</span>
        <p className="architecture-copy">Chaque donnée possède un propriétaire unique. Les autres modules consomment la donnée existante au lieu de la recréer.</p>
        <div className="architecture-owner-list">
          {analysis.dataMap.slice(0, 10).map((row) => <div key={tableName(row)}><strong>{tableName(row)}</strong><span>{row.ownerModule ?? 'Déduit automatiquement'}</span></div>)}
          {!analysis.dataMap.length ? <p className="empty-copy">Aucune table détectée.</p> : null}
        </div>
      </div>
    </div>
  );
}

function ModulesView({ modules }: { modules: ArchitectureModule[] }) {
  if (!modules.length) return <EmptyState text="Aucun module ne correspond à la recherche." />;
  return (
    <div className="architecture-grid two">
      {modules.map((module) => (
        <div className="card-modern architecture-module-card" key={module.id ?? module.name}>
          <div className="architecture-card-heading"><h3>{moduleName(module)}</h3><Chip label={module.status ?? 'actif'} color={statusColor(module.status) as any} size="small" /></div>
          <p>{module.description}</p>
          <ArchitectureList title="Données possédées" items={moduleOwnedData(module)} />
          <ArchitectureList title="Données consommées" items={moduleConsumedData(module)} />
          <ArchitectureList title="Modules consommateurs" items={module.consumerModules} />
          <ArchitectureList title="Dépendances" items={module.dependencies} />
        </div>
      ))}
    </div>
  );
}

function DataMapView({ rows }: { rows: ArchitectureTableMap[] }) {
  if (!rows.length) return <EmptyState text="Aucune table cartographiée." />;
  return (
    <div className="card-modern architecture-table-card">
      <div className="architecture-table-wrap"><table className="architecture-table"><thead><tr><th>Table</th><th>Module propriétaire</th><th>Modules consommateurs</th><th>Description</th><th>Confiance</th><th>Origine</th></tr></thead><tbody>
        {rows.map((row) => <tr key={tableName(row)}><td><strong>{tableName(row)}</strong></td><td>{row.ownerModule ?? '—'}</td><td>{list(row.consumerModules).join(', ')}</td><td>{row.description ?? '—'}</td><td>{row.confidence ?? '—'}</td><td>{row.source ?? row.origin ?? 'Analyse automatique'}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function RelationsView({ modules, tables, relations, graphEdges }: { modules: ArchitectureModule[]; tables: ArchitectureTableMap[]; relations: ArchitectureRelation[]; graphEdges?: GraphEdge[] }) {
  return <ArchitectureGraph modules={modules} tables={tables} relations={relations} graphEdges={graphEdges ?? []} />;
}

function SchemaView({ models }: { models: ArchitecturePrismaModel[] }) {
  if (!models.length) return <EmptyState text="Schéma indisponible ou aucun modèle détecté." />;
  return (
    <div className="architecture-grid two">
      {models.map((model) => <div className="card-modern architecture-schema-card" key={model.name}>
        <div className="architecture-card-heading"><h3>{model.name}</h3><Chip label={model.table ?? model.dbName ?? model.name} size="small" /></div>
        <p className="card-subtitle">Module propriétaire : {model.ownerModule ?? 'déterminé automatiquement'}</p>
        <div className="architecture-fields">{model.fields?.map((field) => <div key={field.name}><strong>{field.name}</strong><span>{field.type}{field.isRequired === false || field.optional ? '?' : ''}</span></div>)}</div>
        <ArchitectureList title="Relations" items={model.relations?.map((r) => textOf(r))} />
        <ArchitectureList title="Clés étrangères" items={model.foreignKeys} />
        <ArchitectureList title="Index" items={model.indexes} />
        <ArchitectureList title="Contraintes uniques" items={model.uniqueConstraints} />
      </div>)}
    </div>
  );
}

function DuplicatesView({ alerts }: { alerts: ArchitectureDuplicateAlert[] }) {
  if (!alerts.length) return <EmptyState text="Aucune alerte de doublon détectée." />;
  return <div className="architecture-grid two">{alerts.map((alert, index) => <div className={`card-modern duplicate-card ${alert.level ?? 'information'}`} key={`${alert.title ?? alert.message}-${index}`}>
    <Chip label={alert.level ?? 'information'} color={severityColor(alert.level) as any} size="small" />
    <h3>{alert.title ?? 'Risque de duplication'}</h3>
    <p>{alert.message ?? alert.description}</p>
    <div className="architecture-chip-row">{[alert.source, alert.target, ...(alert.tables ?? [])].filter(Boolean).map((item) => <Chip key={item} label={item} size="small" variant="outlined" />)}</div>
  </div>)}</div>;
}

function ImpactView({ modules, selectedModuleId, setSelectedModuleId, selectedModule, impact }: { modules: ArchitectureModule[]; selectedModuleId: string; setSelectedModuleId: (id: string) => void; selectedModule?: ArchitectureModule; impact?: ArchitectureImpact }) {
  if (!modules.length) return <EmptyState text="Aucun module sélectionnable." />;
  return (
    <div className="architecture-grid two">
      <div className="card-modern">
        <FormControl fullWidth size="small"><InputLabel>Module</InputLabel><Select value={selectedModuleId} label="Module" onChange={(event) => setSelectedModuleId(event.target.value)}>{modules.map((module) => <MenuItem key={module.id ?? module.name} value={module.id ?? module.name}>{moduleName(module)}</MenuItem>)}</Select></FormControl>
        <div className="architecture-impact-block"><h3>{selectedModule ? moduleName(selectedModule) : 'Aucun module sélectionné'}</h3><p>{selectedModule?.description}</p></div>
      </div>
      <div className="card-modern">
        <ArchitectureList title="Tables possédées" items={impact?.ownedTables ?? (selectedModule ? moduleOwnedData(selectedModule) : [])} />
        <ArchitectureList title="Tables utilisées" items={impact?.usedTables ?? (selectedModule ? moduleConsumedData(selectedModule) : [])} />
        <ArchitectureList title="Modules dépendants" items={impact?.dependentModules ?? selectedModule?.consumerModules} />
        <ArchitectureList title="Modules impactés" items={impact?.impactedModules} />
        <ArchitectureList title="Risques en cas de désactivation" items={impact?.risks ?? impact?.deactivationRisks ?? ['Données indisponibles pour les consommateurs directs.']} />
        <ArchitectureList title="Dépendances critiques" items={impact?.criticalDependencies ?? selectedModule?.dependencies} />
      </div>
    </div>
  );
}

function RoadmapView({ analysis }: { analysis: ArchitectureAnalysis }) {
  const roadmap: Array<{ module: string; status: string; description?: string; note?: string }> = analysis.roadmap?.length ? analysis.roadmap : analysis.modules.map((module) => ({ module: moduleName(module), status: module.status ?? 'actif', description: module.description }));
  return <div className="card-modern architecture-roadmap">{roadmap.map((item) => <div key={item.module} className="roadmap-item"><div><strong>{item.module}</strong><p>{item.description ?? item.note}</p></div><Chip label={item.status} color={statusColor(item.status) as any} /></div>)}</div>;
}

function DocumentationView({ docs, analysis }: { docs: ArchitectureAnalysis['documentation']; analysis: ArchitectureAnalysis }) {
  const generated = docs.length ? docs : [
    { title: 'Architecture', content: `ToqueHub contient ${analysis.modules.length} modules actifs/installés et ${analysis.dataMap.length} tables détectées.` },
    { title: 'Modules', content: analysis.modules.map((m) => `${moduleName(m)} possède ${list(moduleOwnedData(m)).join(', ')}.`).join('\n') },
    { title: 'Tables', content: analysis.dataMap.map((t) => `${tableName(t)} → ${t.ownerModule ?? 'non déterminé'}`).join('\n') || 'Aucune table détectée.' },
    { title: 'Relations', content: `${Array.isArray(analysis.relations) ? analysis.relations.length : analysis.relations.edges.length} relations détectées automatiquement.` },
    { title: 'Roadmap', content: 'Seuls Core et Stocks sont présentés comme actifs/installés en v1 selon l’état réel.' },
  ];
  return <div className="architecture-grid two">{generated.map((doc) => <div className="card-modern architecture-doc" key={doc.title}><h3>{doc.title}</h3><p>{doc.content ?? doc.body?.join('\n')}</p></div>)}</div>;
}

function ArchitectureList({ title, items }: { title: string; items?: Array<string | Record<string, unknown> | unknown> }) {
  return <div className="architecture-list"><span>{title}</span><div>{list(items?.map(textOf)).map((item) => <Chip key={item} size="small" label={item} variant="outlined" />)}</div></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="card-modern architecture-empty"><Info /><p>{text}</p></div>;
}

function ArchitectureGraph({ modules, tables, relations, graphEdges }: { modules: ArchitectureModule[]; tables: ArchitectureTableMap[]; relations: ArchitectureRelation[]; graphEdges: GraphEdge[] }) {
  const [selected, setSelected] = useState<GraphNode>();
  const [view, setView] = useState({ x: 40, y: 40, scale: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const { nodes, edges } = useMemo(() => {
    const resultNodes: GraphNode[] = [];
    const allModuleNames = modules.map(moduleName);
    modules.forEach((module, index) => resultNodes.push({ id: moduleName(module), label: moduleName(module), type: 'module', x: 80, y: 80 + index * 130 }));
    tables.forEach((table, index) => {
      const owner = table.ownerModule ?? 'Core';
      resultNodes.push({ id: tableName(table), label: tableName(table), type: 'table', module: owner, x: 360 + (index % 4) * 210, y: 60 + Math.floor(index / 4) * 92 });
    });
    const apiEdges = graphEdges.map((edge) => ({ source: getRelationSource(edge), target: getRelationTarget(edge), type: edge.label ?? edge.type ?? 'relation' }));
    const explicitDependencyEdges = modules.flatMap((module) => (module.dependencies ?? [])
      .filter((dependency) => allModuleNames.includes(dependency))
      .map((dependency) => ({ source: moduleName(module), target: dependency, type: 'dépend de' })));
    const resultEdges = [
      ...tables.map((table) => ({ source: table.ownerModule ?? 'Core', target: tableName(table), type: 'propriété' })),
      ...relations.map((relation) => ({ source: getRelationSource(relation), target: getRelationTarget(relation), type: (relation as Record<string, unknown>).label ? String((relation as Record<string, unknown>).label) : relation.type ?? 'relation' })),
      ...apiEdges,
      ...explicitDependencyEdges,
    ];
    return { nodes: resultNodes, edges: resultEdges };
  }, [modules, tables, relations, graphEdges]);

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selectedEdges = selected ? edges.filter((edge) => edge.source === selected.id || edge.target === selected.id) : [];

  return (
    <div className="architecture-grid graph-layout">
      <div className="card-modern architecture-graph-card">
        <div className="architecture-card-heading"><h3>Graphe des dépendances</h3><span className="card-subtitle">Zoom molette · déplacement souris · sélection nœud</span></div>
        <svg
          className="architecture-graph"
          viewBox="0 0 980 620"
          onWheel={(event) => { event.preventDefault(); setView((v) => ({ ...v, scale: Math.max(0.55, Math.min(1.8, v.scale + (event.deltaY > 0 ? -0.08 : 0.08))) })); }}
          onMouseDown={(event) => { drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }; }}
          onMouseMove={(event) => { if (!drag.current) return; setView((v) => ({ ...v, x: drag.current!.vx + event.clientX - drag.current!.x, y: drag.current!.vy + event.clientY - drag.current!.y })); }}
          onMouseUp={() => { drag.current = null; }}
          onMouseLeave={() => { drag.current = null; }}
        >
          <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" /></marker></defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {edges.map((edge, index) => {
              const source = byId.get(edge.source); const target = byId.get(edge.target);
              if (!source || !target) return null;
              const highlight = selectedEdges.includes(edge);
              return <g key={`${edge.source}-${edge.target}-${index}`}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={highlight ? 'graph-edge highlight' : 'graph-edge'} markerEnd="url(#arrow)" /><text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 4} className="graph-label">{edge.type}</text></g>;
            })}
            {nodes.map((node) => <g key={node.id} onClick={() => setSelected(node)} className="graph-node"><circle cx={node.x} cy={node.y} r={node.type === 'module' ? 34 : 25} className={`${node.type} ${selected?.id === node.id ? 'selected' : ''}`} /><text x={node.x} y={node.y + 48} textAnchor="middle">{node.label}</text></g>)}
          </g>
        </svg>
      </div>
      <div className="card-modern architecture-node-detail">
        <h3>{selected?.label ?? 'Sélectionnez un nœud'}</h3>
        <p>{selected ? `Type : ${selected.type}${selected.module ? ` · Module : ${selected.module}` : ''}` : 'Le détail latéral affiche les liens directs et le contexte du nœud sélectionné.'}</p>
        <ArchitectureList title="Liens directs" items={selectedEdges.map((edge) => `${edge.source} → ${edge.target}`)} />
      </div>
    </div>
  );
}

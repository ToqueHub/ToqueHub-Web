import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Archive,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  GitBranch,
  Mail,
  MapPin,
  NotebookText,
  RotateCw,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { CoreUser, HrCollaborator, HrCollaboratorPayload, HrDepartment, HrHistoryEntry, HrPosition, HrReferencePayload, HrRotation, HrRotationDay, HrRotationPayload, HrRotationWeek, HrSummary, Site } from '../types';

const statusLabels: Record<string, string> = {
  ACTIVE: 'Actif',
  ABSENT: 'Absent',
  SUSPENDED: 'Suspendu',
  LEFT: 'Départ',
};

const statusOptions = [
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'SUSPENDED', label: 'Suspendu' },
  { value: 'LEFT', label: 'Départ' },
];

type HrTab = 'dashboard' | 'collaborators' | 'departments' | 'positions' | 'rotations' | 'orgchart';

type HrAppProps = {
  tab: HrTab;
  summary?: HrSummary;
  collaborators: HrCollaborator[];
  departments: HrDepartment[];
  positions: HrPosition[];
  rotations: HrRotation[];
  users: CoreUser[];
  sites: Site[];
  canWrite: boolean;
  loading?: boolean;
  onNavigate: (tab: HrTab) => void;
  onCreateCollaborator: (payload: HrCollaboratorPayload) => Promise<void>;
  onUpdateCollaborator: (id: string, payload: Partial<HrCollaboratorPayload>) => Promise<void>;
  onArchiveCollaborator: (id: string) => Promise<void>;
  onCreateDepartment: (payload: HrReferencePayload) => Promise<void>;
  onUpdateDepartment: (id: string, payload: HrReferencePayload) => Promise<void>;
  onArchiveDepartment: (id: string) => Promise<void>;
  onCreatePosition: (payload: HrReferencePayload) => Promise<void>;
  onUpdatePosition: (id: string, payload: HrReferencePayload) => Promise<void>;
  onArchivePosition: (id: string) => Promise<void>;
  onCreateRotation: (payload: HrRotationPayload) => Promise<void>;
  onUpdateRotation: (id: string, payload: Partial<HrRotationPayload>) => Promise<void>;
  onArchiveRotation: (id: string) => Promise<void>;
  onAssignRotation: (rotationId: string, employeeId: string, startDate?: string) => Promise<void>;
  onRemoveRotationAssignment: (rotationId: string, employeeId: string) => Promise<void>;
  onSetCollaboratorRotation: (employeeId: string, rotationId: string, startDate?: string) => Promise<void>;
  onRemoveCollaboratorRotation: (employeeId: string) => Promise<void>;
};

export function HrApp({
  tab,
  summary,
  collaborators,
  departments,
  positions,
  rotations,
  users,
  sites,
  canWrite,
  loading,
  onNavigate,
  onCreateCollaborator,
  onUpdateCollaborator,
  onArchiveCollaborator,
  onCreateDepartment,
  onUpdateDepartment,
  onArchiveDepartment,
  onCreatePosition,
  onUpdatePosition,
  onArchivePosition,
  onCreateRotation,
  onUpdateRotation,
  onArchiveRotation,
  onAssignRotation,
  onRemoveRotationAssignment,
  onSetCollaboratorRotation,
  onRemoveCollaboratorRotation,
}: HrAppProps) {
  const [collaboratorModal, setCollaboratorModal] = useState<HrCollaborator | 'new' | null>(null);
  const [selectedCollaborator, setSelectedCollaborator] = useState<HrCollaborator | null>(null);
  const [rotationModal, setRotationModal] = useState<HrRotation | 'new' | null>(null);
  const [selectedRotation, setSelectedRotation] = useState<HrRotation | null>(null);
  const [referenceModal, setReferenceModal] = useState<{ type: 'department' | 'position'; item?: HrDepartment | HrPosition } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [linkFilter, setLinkFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [orgDepartment, setOrgDepartment] = useState('');

  const activeDepartments = departments.filter((department) => !isArchived(department));
  const activePositions = positions.filter((position) => !isArchived(position));
  const visibleCollaborators = useMemo(() => collaborators.filter((collaborator) => {
    if (!showArchived && isArchived(collaborator)) return false;
    const haystack = [collaborator.firstName, collaborator.lastName, collaborator.email, collaborator.department?.name, collaborator.position?.name].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesStatus = !statusFilter || collaborator.status === statusFilter;
    const matchesDepartment = !departmentFilter || collaborator.departmentId === departmentFilter || collaborator.department?.id === departmentFilter;
    const matchesPosition = !positionFilter || collaborator.positionId === positionFilter || collaborator.position?.id === positionFilter;
    const hasAccount = Boolean(collaborator.userId || collaborator.user?.id);
    const matchesLink = !linkFilter || (linkFilter === 'linked' ? hasAccount : !hasAccount);
    return matchesSearch && matchesStatus && matchesDepartment && matchesPosition && matchesLink;
  }), [collaborators, search, statusFilter, departmentFilter, positionFilter, linkFilter, showArchived]);

  const selectableUsers = useMemo(() => {
    const merged = [...users];
    if (collaboratorModal && collaboratorModal !== 'new' && collaboratorModal.user && !merged.some((user) => user.id === collaboratorModal.user?.id)) {
      merged.push(collaboratorModal.user);
    }
    return merged;
  }, [collaboratorModal, users]);

  return (
    <div className="hr-shell">
      <div className="hr-hero">
        <div>
          <span className="welcome-tag">ToqueHub RH</span>
          <h1>Ressources Humaines</h1>
          <p>Vue d’ensemble de votre organisation. Centralisez les collaborateurs, services, postes et responsables sans recréer le Core.</p>
        </div>
        {canWrite ? <button className="btn btn-primary" onClick={() => setCollaboratorModal('new')}><Plus size={16} /> Nouveau collaborateur</button> : null}
      </div>

      <div className="hr-tabs">
        {[
          ['dashboard', 'Tableau de bord'],
          ['collaborators', 'Collaborateurs'],
          ['departments', 'Services'],
          ['positions', 'Postes'],
          ['rotations', 'Roulements'],
          ['orgchart', 'Organigramme'],
        ].map(([value, label]) => (
          <button key={value} className={tab === value ? 'active' : ''} onClick={() => onNavigate(value as HrTab)}>{label}</button>
        ))}
      </div>

      {loading ? <div className="card-modern">Chargement du référentiel RH…</div> : null}

      {tab === 'dashboard' ? (
        <HrDashboard summary={summary} collaborators={collaborators} departments={departments} positions={positions} onOpenCollaborators={() => onNavigate('collaborators')} />
      ) : null}

      {tab === 'collaborators' ? (
        <div className="card-modern">
          <div className="section-header-modern">
            <div className="section-info">
              <span className="card-title"><UsersRound size={18} /> Collaborateurs</span>
              <span className="section-tagline">Une personne peut exister avec ou sans compte ToqueHub. Les archives restent consultables.</span>
            </div>
            {canWrite ? <button className="btn btn-primary" onClick={() => setCollaboratorModal('new')}><Plus size={16} /> Ajouter</button> : null}
          </div>
          <div className="filter-bar hr-filter-grid">
            <div className="search-input-wrapper"><Search /><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, email, poste, service…" /></div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tous statuts</option>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="">Tous services</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
            <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}><option value="">Tous postes</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select>
            <select value={linkFilter} onChange={(event) => setLinkFilter(event.target.value)}><option value="">Compte ToqueHub</option><option value="linked">Avec compte</option><option value="unlinked">Sans compte</option></select>
            <label className="toggle-inline"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Archives</label>
          </div>
          <CollaboratorsTable collaborators={visibleCollaborators} canWrite={canWrite} onOpen={setSelectedCollaborator} onEdit={setCollaboratorModal} onArchive={onArchiveCollaborator} onCreate={() => setCollaboratorModal('new')} />
        </div>
      ) : null}

      {tab === 'departments' ? (
        <ReferencePage title="Services" icon={<Building2 size={18} />} description="Structurez Cuisine, Pâtisserie, Soins, Administration… Les services archivés ne sont plus proposés par défaut." items={departments} canWrite={canWrite} onCreate={() => setReferenceModal({ type: 'department' })} onEdit={(item) => setReferenceModal({ type: 'department', item })} onArchive={onArchiveDepartment} />
      ) : null}

      {tab === 'positions' ? (
        <ReferencePage title="Postes" icon={<BriefcaseBusiness size={18} />} description="Décrivez les fonctions principales : Chef de cuisine, Infirmier, Animateur…" items={positions} canWrite={canWrite} onCreate={() => setReferenceModal({ type: 'position' })} onEdit={(item) => setReferenceModal({ type: 'position', item })} onArchive={onArchivePosition} />
      ) : null}

      {tab === 'rotations' ? (
        <RotationsPage rotations={rotations} collaborators={collaborators} departments={departments} canWrite={canWrite} onCreate={() => setRotationModal('new')} onEdit={setRotationModal} onOpen={setSelectedRotation} onArchive={onArchiveRotation} onAssign={onAssignRotation} onRemoveAssignment={onRemoveRotationAssignment} />
      ) : null}

      {tab === 'orgchart' ? (
        <OrgChart collaborators={collaborators.filter((collaborator) => !isArchived(collaborator))} departments={departments} departmentFilter={orgDepartment} onDepartmentFilter={setOrgDepartment} />
      ) : null}

      {collaboratorModal ? (
        <CollaboratorModal
          collaborator={collaboratorModal === 'new' ? undefined : collaboratorModal}
          collaborators={collaborators.filter((item) => !isArchived(item))}
          departments={activeDepartments}
          positions={activePositions}
          users={selectableUsers}
          sites={sites.filter((site) => !isArchived(site))}
          onClose={() => setCollaboratorModal(null)}
          onSubmit={async (payload) => {
            if (collaboratorModal === 'new') await onCreateCollaborator(payload);
            else await onUpdateCollaborator(collaboratorModal.id, payload);
            setCollaboratorModal(null);
          }}
        />
      ) : null}

      {selectedCollaborator ? <CollaboratorSheet collaborator={selectedCollaborator} rotations={rotations} onClose={() => setSelectedCollaborator(null)} onEdit={() => { setCollaboratorModal(selectedCollaborator); setSelectedCollaborator(null); }} canWrite={canWrite} onSetRotation={onSetCollaboratorRotation} onRemoveRotation={onRemoveCollaboratorRotation} /> : null}

      {selectedRotation ? <RotationDetailSheet rotation={selectedRotation} collaborators={collaborators} canWrite={canWrite} onClose={() => setSelectedRotation(null)} onEdit={() => { setRotationModal(selectedRotation); setSelectedRotation(null); }} onAssign={onAssignRotation} onRemoveAssignment={onRemoveRotationAssignment} /> : null}

      {rotationModal ? (
        <RotationModal
          rotation={rotationModal === 'new' ? undefined : rotationModal}
          departments={activeDepartments}
          onClose={() => setRotationModal(null)}
          onSubmit={async (payload) => {
            if (rotationModal === 'new') await onCreateRotation(payload);
            else await onUpdateRotation(rotationModal.id, payload);
            setRotationModal(null);
          }}
        />
      ) : null}

      {referenceModal ? (
        <ReferenceModal
          title={referenceModal.type === 'department' ? 'Service' : 'Poste'}
          item={referenceModal.item}
          onClose={() => setReferenceModal(null)}
          onSubmit={async (payload) => {
            if (referenceModal.type === 'department') {
              if (referenceModal.item) await onUpdateDepartment(referenceModal.item.id, payload);
              else await onCreateDepartment(payload);
            } else if (referenceModal.item) await onUpdatePosition(referenceModal.item.id, payload);
            else await onCreatePosition(payload);
            setReferenceModal(null);
          }}
        />
      ) : null}
    </div>
  );
}

function HrDashboard({ summary, collaborators, departments, positions, onOpenCollaborators }: { summary?: HrSummary; collaborators: HrCollaborator[]; departments: HrDepartment[]; positions: HrPosition[]; onOpenCollaborators: () => void }) {
  const activeCollaborators = collaborators.filter((collaborator) => !isArchived(collaborator));
  const latest = [...activeCollaborators].sort((a, b) => dateValue(b.hireDate) - dateValue(a.hireDate)).slice(0, 5);
  const distribution = useMemo(() => {
    const counts = new Map<string, number>();
    activeCollaborators.forEach((collaborator) => counts.set(collaborator.department?.name ?? 'Autres', (counts.get(collaborator.department?.name ?? 'Autres') ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [activeCollaborators]);
  const max = Math.max(1, ...distribution.map(([, count]) => count));
  const stats = [
    { label: 'Collaborateurs', value: summary?.counts?.collaborators ?? activeCollaborators.length, icon: UsersRound },
    { label: 'Services', value: summary?.counts?.departments ?? departments.filter((item) => !isArchived(item)).length, icon: Building2 },
    { label: 'Postes', value: summary?.counts?.positions ?? positions.filter((item) => !isArchived(item)).length, icon: BriefcaseBusiness },
    { label: 'Avec compte ToqueHub', value: summary?.counts?.linkedCollaborators ?? activeCollaborators.filter((item) => item.userId || item.user).length, icon: ShieldCheck },
    { label: 'Roulements actifs', value: summary?.counts?.activeRotations ?? '—', icon: RotateCw },
    { label: 'Avec roulement', value: summary?.counts?.collaboratorsWithRotation ?? activeCollaborators.filter((item) => activeRotation(item)).length, icon: CalendarDays },
    { label: 'Sans roulement', value: summary?.counts?.collaboratorsWithoutRotation ?? activeCollaborators.filter((item) => !activeRotation(item)).length, icon: Clock },
    { label: 'Durée hebdo moyenne', value: formatMinutes(summary?.counts?.averageWeeklyRotationMinutes), icon: Clock },
  ];

  return <>
    <div className="hr-stat-grid">{stats.map((stat, index) => <motion.div key={stat.label} className="card-modern hr-stat-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}><div className="metric-icon-wrapper emerald"><stat.icon /></div><div><span>{stat.label}</span><strong>{stat.value}</strong></div></motion.div>)}</div>
    <div className="double-panel">
      <div className="card-modern">
        <div className="section-header-modern"><span className="card-title"><Sparkles size={18} /> Dernières arrivées</span><button className="btn btn-secondary" onClick={onOpenCollaborators}>Voir tous <ChevronRight size={16} /></button></div>
        {latest.length === 0 ? <EmptyState title="Aucun collaborateur" description="Ajoutez votre premier collaborateur RH avec ou sans compte ToqueHub." /> : <div className="hr-list">{latest.map((collaborator) => <PersonRow key={collaborator.id} collaborator={collaborator} detail={formatDate(collaborator.hireDate)} />)}</div>}
      </div>
      <div className="card-modern">
        <span className="card-title"><Building2 size={18} /> Répartition des services</span>
        {distribution.length === 0 ? <EmptyState title="Aucune répartition" description="La visualisation apparaîtra dès qu’un collaborateur sera rattaché à un service." /> : <div className="hr-bars">{distribution.map(([name, count]) => <div key={name} className="hr-bar-row"><div><strong>{name}</strong><span>{count} collaborateur{count > 1 ? 's' : ''}</span></div><div className="hr-bar"><span style={{ width: `${(count / max) * 100}%` }} /></div></div>)}</div>}
      </div>
    </div>
  </>;
}

function CollaboratorsTable({ collaborators, canWrite, onOpen, onEdit, onArchive, onCreate }: { collaborators: HrCollaborator[]; canWrite: boolean; onOpen: (item: HrCollaborator) => void; onEdit: (item: HrCollaborator) => void; onArchive: (id: string) => void; onCreate: () => void }) {
  if (collaborators.length === 0) return <EmptyState title="Aucun résultat" description="Aucun collaborateur ne correspond aux filtres ou le référentiel est vide." action={canWrite ? <button className="btn btn-primary" onClick={onCreate}><Plus size={16} /> Créer un collaborateur</button> : undefined} />;
  return <div className="table-wrapper"><table className="table-modern hr-table"><thead><tr><th>Photo</th><th>Nom complet</th><th>Poste</th><th>Service</th><th>Date d’embauche</th><th>Compte ToqueHub</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{collaborators.map((collaborator) => <tr key={collaborator.id}><td><AvatarInitial collaborator={collaborator} /></td><td><button className="link-button" onClick={() => onOpen(collaborator)}>{fullName(collaborator)}</button><small>{collaborator.email || 'Email non renseigné'}</small></td><td>{collaborator.position?.name ?? '—'}</td><td>{collaborator.department?.name ?? '—'}</td><td>{formatDate(collaborator.hireDate)}</td><td>{collaborator.user || collaborator.userId ? <span className="badge badge-reception">Lié</span> : <span className="badge">Aucun</span>}</td><td><StatusBadge status={collaborator.status} /></td><td><div className="row-actions"><button className="icon-btn" onClick={() => onOpen(collaborator)} title="Fiche"><ChevronRight size={16} /></button>{canWrite ? <><button className="icon-btn" onClick={() => onEdit(collaborator)} title="Modifier"><Edit3 size={16} /></button><button className="icon-btn danger" onClick={() => onArchive(collaborator.id)} title="Archiver"><Archive size={16} /></button></> : null}</div></td></tr>)}</tbody></table></div>;
}

function ReferencePage({ title, icon, description, items, canWrite, onCreate, onEdit, onArchive }: { title: string; icon: React.ReactNode; description: string; items: Array<HrDepartment | HrPosition>; canWrite: boolean; onCreate: () => void; onEdit: (item: HrDepartment | HrPosition) => void; onArchive: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const filtered = items.filter((item) => (showArchived || !isArchived(item)) && `${item.name} ${item.description ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="card-modern"><div className="section-header-modern"><div className="section-info"><span className="card-title">{icon} {title}</span><span className="section-tagline">{description}</span></div>{canWrite ? <button className="btn btn-primary" onClick={onCreate}><Plus size={16} /> Ajouter</button> : null}</div><div className="filter-bar"><div className="search-input-wrapper"><Search /><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Rechercher ${title.toLowerCase()}…`} /></div><label className="toggle-inline"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Archives</label></div>{filtered.length === 0 ? <EmptyState title={`Aucun ${title.toLowerCase()}`} description="Les données de départ sont créées à l’installation de RH et restent modifiables." action={canWrite ? <button className="btn btn-primary" onClick={onCreate}>Créer</button> : undefined} /> : <div className="apps-grid compact-grid">{filtered.map((item) => <motion.div key={item.id} className="app-card compact-card" whileHover={{ y: -3 }}><div className="app-card-icon">{icon}</div><h3>{item.name}</h3><p>{item.description || 'Référence RH'}</p>{isArchived(item) ? <span className="badge">Archivé</span> : null}{canWrite ? <div className="row-actions"><button className="btn btn-secondary" onClick={() => onEdit(item)}><Edit3 size={14} /> Modifier</button><button className="btn btn-secondary" onClick={() => onArchive(item.id)}><Archive size={14} /> Archiver</button></div> : null}</motion.div>)}</div>}</div>;
}

function OrgChart({ collaborators, departments, departmentFilter, onDepartmentFilter }: { collaborators: HrCollaborator[]; departments: HrDepartment[]; departmentFilter: string; onDepartmentFilter: (value: string) => void }) {
  const visible = collaborators.filter((item) => !departmentFilter || item.departmentId === departmentFilter || item.department?.id === departmentFilter);
  const byManager = new Map<string, HrCollaborator[]>();
  visible.forEach((item) => {
    const key = item.managerId ?? item.manager?.id ?? 'root';
    byManager.set(key, [...(byManager.get(key) ?? []), item]);
  });
  const roots = visible.filter((item) => !(item.managerId || item.manager?.id) || !visible.some((candidate) => candidate.id === (item.managerId ?? item.manager?.id)));
  return <div className="card-modern"><div className="section-header-modern"><div className="section-info"><span className="card-title"><GitBranch size={18} /> Organigramme</span><span className="section-tagline">Visualisez les rattachements responsable → collaborateur et repérez les personnes sans responsable.</span></div><select value={departmentFilter} onChange={(event) => onDepartmentFilter(event.target.value)}><option value="">Tous services</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>{roots.length === 0 ? <EmptyState title="Aucun lien hiérarchique" description="Renseignez un responsable dans la fiche collaborateur pour construire l’organigramme." /> : <div className="org-tree">{roots.map((root) => <OrgNode key={root.id} collaborator={root} byManager={byManager} depth={0} />)}</div>}<div className="hr-note"><strong>Sans responsable :</strong> {roots.length} collaborateur{roots.length > 1 ? 's' : ''} au premier niveau.</div></div>;
}

function OrgNode({ collaborator, byManager, depth }: { collaborator: HrCollaborator; byManager: Map<string, HrCollaborator[]>; depth: number }) {
  const children = (byManager.get(collaborator.id) ?? []).filter((child) => child.id !== collaborator.id);
  return <div className="org-node" style={{ marginLeft: depth ? 24 : 0 }}><div className="org-card"><AvatarInitial collaborator={collaborator} /><div><strong>{fullName(collaborator)}</strong><span>{collaborator.position?.name ?? 'Poste non renseigné'} · {collaborator.department?.name ?? 'Service non renseigné'}</span></div></div>{children.map((child) => <OrgNode key={child.id} collaborator={child} byManager={byManager} depth={depth + 1} />)}</div>;
}

function RotationsPage({ rotations, collaborators, departments, canWrite, onCreate, onEdit, onOpen, onArchive, onAssign, onRemoveAssignment }: { rotations: HrRotation[]; collaborators: HrCollaborator[]; departments: HrDepartment[]; canWrite: boolean; onCreate: () => void; onEdit: (rotation: HrRotation) => void; onOpen: (rotation: HrRotation) => void; onArchive: (id: string) => void; onAssign: (rotationId: string, employeeId: string, startDate?: string) => Promise<void>; onRemoveAssignment: (rotationId: string, employeeId: string) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [assigning, setAssigning] = useState<Record<string, string>>({});
  const filtered = rotations.filter((rotation) => (showArchived || !isArchived(rotation)) && `${rotation.name} ${rotation.description ?? ''} ${rotationDepartment(rotation)?.name ?? 'Tous services'}`.toLowerCase().includes(query.toLowerCase()));
  const availableFor = (rotation: HrRotation) => collaborators.filter((collaborator) => !isArchived(collaborator) && !activeRotation(collaborator) && (!rotationDepartment(rotation)?.id || collaborator.departmentId === rotationDepartment(rotation)?.id || collaborator.department?.id === rotationDepartment(rotation)?.id));
  return <div className="card-modern"><div className="section-header-modern"><div className="section-info"><span className="card-title"><RotateCw size={18} /> Roulements</span><span className="section-tagline">Définissez les cycles de travail réutilisables de votre établissement.</span></div>{canWrite ? <button className="btn btn-primary" onClick={onCreate}><Plus size={16} /> Créer</button> : null}</div><div className="filter-bar"><div className="search-input-wrapper"><Search /><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, service, description…" /></div><label className="toggle-inline"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Archives</label></div>{filtered.length === 0 ? <EmptyState title="Aucun roulement" description="Créez vos cycles de travail standards : matin, soir, week-end, polyvalence…" action={canWrite ? <button className="btn btn-primary" onClick={onCreate}><Plus size={16} /> Nouveau roulement</button> : undefined} /> : <div className="table-wrapper"><table className="table-modern hr-table"><thead><tr><th>Nom</th><th>Service</th><th>Cycle</th><th>Durée hebdomadaire</th><th>Collaborateurs assignés</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{filtered.map((rotation) => { const assignments = activeAssignments(rotation); const available = availableFor(rotation); const currentValue = assigning[rotation.id] ?? ''; return <tr key={rotation.id}><td><button className="link-button" onClick={() => onOpen(rotation)}>{rotation.name}</button><small>{rotation.description || 'Cycle standard'}</small></td><td>{rotationDepartment(rotation)?.name ?? 'Tous services'}</td><td>{rotation.cycleWeeks} semaine{rotation.cycleWeeks > 1 ? 's' : ''}</td><td>{formatMinutes(rotationMetrics(rotation).averageWeeklyMinutes)}</td><td><strong>{assignments.length}</strong>{assignments.length ? <small>{assignments.map((assignment) => fullName(assignment.collaborator ?? assignment.employee ?? {})).join(', ')}</small> : <small>Aucun</small>}{canWrite && !isArchived(rotation) ? <div className="inline-assign"><select value={currentValue} onChange={(e) => setAssigning((prev) => ({ ...prev, [rotation.id]: e.target.value }))}><option value="">Assigner…</option>{available.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{fullName(collaborator)}</option>)}</select><button className="btn btn-secondary" disabled={!currentValue} onClick={async () => { await onAssign(rotation.id, currentValue); setAssigning((prev) => ({ ...prev, [rotation.id]: '' })); }}>Ajouter</button></div> : null}</td><td>{isArchived(rotation) ? <span className="badge">Archivé</span> : <span className="badge badge-reception">Actif</span>}</td><td><div className="row-actions"><button className="icon-btn" onClick={() => onOpen(rotation)} title="Détail"><Eye size={16} /></button>{canWrite ? <><button className="icon-btn" onClick={() => onEdit(rotation)} title="Modifier"><Edit3 size={16} /></button><button className="icon-btn danger" onClick={() => onArchive(rotation.id)} title="Archiver"><Archive size={16} /></button></> : null}</div>{canWrite && assignments.map((assignment) => { const employee = assignment.collaborator ?? assignment.employee; return employee ? <button key={assignment.id} className="link-button danger-text" onClick={() => onRemoveAssignment(rotation.id, employee.id)}>Retirer {fullName(employee)}</button> : null; })}</td></tr>; })}</tbody></table></div>}</div>;
}

function RotationModal({ rotation, departments, onClose, onSubmit }: { rotation?: HrRotation; departments: HrDepartment[]; onClose: () => void; onSubmit: (payload: HrRotationPayload) => Promise<void> }) {
  const [form, setForm] = useState<HrRotationPayload>(() => ({ name: rotation?.name ?? '', description: rotation?.description ?? '', departmentId: rotationDepartment(rotation)?.id ?? '', cycleWeeks: rotation?.cycleWeeks ?? 1, weeks: normalizeWeeks(rotation) }));
  const [submitting, setSubmitting] = useState(false);
  const metrics = cycleMetrics(form.weeks);
  function setCycleWeeks(value: number) { setForm((prev) => ({ ...prev, cycleWeeks: value, weeks: normalizeWeeks({ ...prev, cycleWeeks: value, weeks: prev.weeks }) })); }
  function updateDay(weekIndex: number, dayOfWeek: number, patch: Partial<HrRotationDay>) { setForm((prev) => ({ ...prev, weeks: prev.weeks.map((week) => week.weekIndex === weekIndex ? { ...week, days: week.days.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day) } : week) })); }
  return (
    <div className="modal-overlay">
      <motion.form
        className="modal-card hr-modal rotation-modal"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          try {
            await onSubmit({
              ...form,
              departmentId: form.departmentId || null,
              weeks: form.weeks.map((week) => ({
                ...week,
                days: week.days.map((day) => ({
                  ...day,
                  breakMinutes: Number(day.breakMinutes ?? 0),
                })),
              })),
            });
          } finally {
            setSubmitting(false);
          }
        }}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="modal-header">
          <h2>{rotation ? 'Modifier le roulement' : 'Nouveau roulement'}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1.5rem 1.75rem', maxHeight: 'calc(85vh - 140px)', overflowY: 'auto' }}>
          {/* Informations générales */}
          <div className="rotation-section">
            <span className="rotation-section-title">Informations générales</span>
            <div className="rotation-general-grid">
              <input
                placeholder="Nom du roulement *"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
              <select
                value={form.departmentId ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, departmentId: e.target.value }))}
              >
                <option value="">Tous services</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              <textarea
                placeholder="Description du roulement (ex: horaires, contraintes, spécificités...)"
                value={form.description ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>

          {/* Définition du cycle */}
          <div className="rotation-section">
            <span className="rotation-section-title">Définition du cycle</span>
            
            <div className="rotation-cycle-controls">
              <div className="rotation-cycle-select-wrapper">
                <label style={{ fontSize: '0.8rem', fontWeight: 650, color: 'var(--text-muted)' }}>Longueur du cycle</label>
                <select value={form.cycleWeeks} onChange={(e) => setCycleWeeks(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((week) => (
                    <option key={week} value={week}>
                      Cycle sur {week} semaine{week > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rotation-totals">
                <div className="rotation-total-card">
                  <span>Durée hebdomadaire</span>
                  <strong>{formatMinutes(metrics.averageWeeklyMinutes)}</strong>
                </div>
                <div className="rotation-total-card">
                  <span>Jours travaillés</span>
                  <strong>{metrics.workedDays} j</strong>
                </div>
                <div className="rotation-total-card">
                  <span>Jours de repos</span>
                  <strong>{metrics.restDays} j</strong>
                </div>
                <div className="rotation-total-card">
                  <span>Amplitude moyenne</span>
                  <strong>{formatMinutes(metrics.averagePresenceMinutes)}</strong>
                </div>
              </div>
            </div>

            {form.weeks.map((week) => (
              <div key={week.weekIndex} className="rotation-week-editor">
                <h3>
                  <span>{weekLabel(week.weekIndex)}</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    Total : {formatMinutes(weekMetrics(week).totalMinutes)}
                  </span>
                </h3>
                <div className="rotation-days-grid">
                  {week.days.map((day) => {
                    const duration = dayDuration(day);
                    const isRest = day.mode === 'REST';
                    return (
                      <div key={day.dayOfWeek} className={`rotation-day-card ${isRest ? 'rest' : ''}`}>
                        <strong>{dayName(day.dayOfWeek)}</strong>
                        <select
                          value={day.mode}
                          onChange={(e) => updateDay(week.weekIndex, day.dayOfWeek, { mode: e.target.value })}
                        >
                          <option value="WORK">Travail</option>
                          <option value="REST">Repos</option>
                        </select>
                        {!isRest ? (
                          <>
                            <input
                              type="time"
                              value={day.startTime ?? '08:00'}
                              onChange={(e) => updateDay(week.weekIndex, day.dayOfWeek, { startTime: e.target.value })}
                            />
                            <input
                              type="time"
                              value={day.endTime ?? '16:00'}
                              onChange={(e) => updateDay(week.weekIndex, day.dayOfWeek, { endTime: e.target.value })}
                            />
                            <input
                              type="number"
                              min={0}
                              step={5}
                              value={day.breakMinutes ?? 0}
                              onChange={(e) => updateDay(week.weekIndex, day.dayOfWeek, { breakMinutes: Number(e.target.value) })}
                              placeholder="Pause (min)"
                            />
                            <small>
                              {formatMinutes(duration.worked)} ({formatMinutes(duration.presence)} amp)
                              {duration.endsNextDay ? ' +1j' : ''}
                            </small>
                          </>
                        ) : (
                          <span className="rest-label">Repos</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions" style={{ padding: '1.25rem 1.75rem', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

function RotationDetailSheet({ rotation, collaborators, canWrite, onClose, onEdit, onAssign, onRemoveAssignment }: { rotation: HrRotation; collaborators: HrCollaborator[]; canWrite: boolean; onClose: () => void; onEdit: () => void; onAssign: (rotationId: string, employeeId: string, startDate?: string) => Promise<void>; onRemoveAssignment: (rotationId: string, employeeId: string) => Promise<void> }) {
  const [employeeId, setEmployeeId] = useState('');
  const metrics = rotationMetrics(rotation);
  const available = collaborators.filter((collaborator) => !isArchived(collaborator) && !activeRotation(collaborator) && (!rotationDepartment(rotation)?.id || collaborator.departmentId === rotationDepartment(rotation)?.id || collaborator.department?.id === rotationDepartment(rotation)?.id));
  return <div className="modal-overlay"><motion.div className="modal-card hr-sheet" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}><div className="modal-header"><div><h2>{rotation.name}</h2><p>{rotationDepartment(rotation)?.name ?? 'Tous services'} · Cycle {rotation.cycleWeeks} semaine{rotation.cycleWeeks > 1 ? 's' : ''}</p></div><div className="row-actions">{canWrite ? <button className="btn btn-secondary" onClick={onEdit}><Edit3 size={14} /> Modifier</button> : null}<button className="modal-close-btn" onClick={onClose}><X size={18} /></button></div></div><div className="rotation-totals"><span>Durée hebdo <strong>{formatMinutes(metrics.averageWeeklyMinutes)}</strong></span><span>Jours travaillés <strong>{metrics.workedDays}</strong></span><span>Repos <strong>{metrics.restDays}</strong></span><span>Amplitude moyenne <strong>{formatMinutes(metrics.averagePresenceMinutes)}</strong></span></div><RotationCalendar rotation={rotation} /><div className="card-modern"><span className="card-title"><UsersRound size={18} /> Collaborateurs associés</span>{canWrite && !isArchived(rotation) ? <div className="inline-assign"><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Ajouter un collaborateur disponible</option>{available.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{fullName(collaborator)} · {collaborator.department?.name ?? '—'}</option>)}</select><button className="btn btn-primary" disabled={!employeeId} onClick={async () => { await onAssign(rotation.id, employeeId); setEmployeeId(''); }}>Assigner</button></div> : null}<div className="hr-list">{activeAssignments(rotation).map((assignment) => { const employee = assignment.collaborator ?? assignment.employee; return employee ? <div className="hr-person-row" key={assignment.id}><AvatarInitial collaborator={employee} /><div><strong>{fullName(employee)}</strong><span>Depuis {formatDate(assignment.startDate)}</span></div>{canWrite ? <button className="btn btn-secondary" onClick={() => onRemoveAssignment(rotation.id, employee.id)}>Retirer</button> : null}</div> : null; })}</div></div></motion.div></div>;
}

function RotationCalendar({ rotation }: { rotation: HrRotation }) {
  return <div className="rotation-calendar">{normalizeWeeks(rotation).map((week) => <div key={week.weekIndex} className="rotation-calendar-week"><h3>{weekLabel(week.weekIndex)} · {formatMinutes(weekMetrics(week).totalMinutes)}</h3><div className="rotation-days-grid">{week.days.map((day) => { const duration = dayDuration(day); return <div key={day.dayOfWeek} className={`rotation-day-card ${day.mode === 'REST' ? 'rest' : ''}`}><strong>{dayName(day.dayOfWeek)}</strong>{day.mode === 'REST' ? <span className="rest-label">Repos</span> : <><span>{day.startTime} → {day.endTime}</span><small>Pause {day.breakMinutes ?? 0} min</small><small>{formatMinutes(duration.worked)} travaillées</small>{duration.endsNextDay ? <span className="badge badge-warning">Fin le lendemain</span> : null}</>}</div>; })}</div></div>)}</div>;
}

function CollaboratorModal({ collaborator, collaborators, departments, positions, users, sites, onClose, onSubmit }: { collaborator?: HrCollaborator; collaborators: HrCollaborator[]; departments: HrDepartment[]; positions: HrPosition[]; users: CoreUser[]; sites: Site[]; onClose: () => void; onSubmit: (payload: HrCollaboratorPayload) => Promise<void> }) {
  const [form, setForm] = useState<HrCollaboratorPayload>({
    photoUrl: collaborator?.photoUrl ?? collaborator?.photoDataUrl ?? '',
    firstName: collaborator?.firstName ?? '',
    lastName: collaborator?.lastName ?? '',
    email: collaborator?.email ?? '',
    phone: collaborator?.phone ?? '',
    address: collaborator?.address ?? '',
    birthDate: toInputDate(collaborator?.birthDate),
    hireDate: toInputDate(collaborator?.hireDate) || new Date().toISOString().slice(0, 10),
    departmentId: collaborator?.departmentId ?? collaborator?.department?.id ?? '',
    positionId: collaborator?.positionId ?? collaborator?.position?.id ?? '',
    siteId: collaborator?.mainSiteId ?? collaborator?.siteId ?? collaborator?.mainSite?.id ?? collaborator?.site?.id ?? '',
    employeeNumber: collaborator?.employeeNumber ?? '',
    notes: collaborator?.notes ?? '',
    status: collaborator?.status ?? 'ACTIVE',
    userId: collaborator?.userId ?? collaborator?.user?.id ?? '',
    managerId: collaborator?.managerId ?? collaborator?.manager?.id ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const availableManagers = collaborators.filter((item) => item.id !== collaborator?.id);
  const availableUsers = users.filter((user) => user.status !== 'DISABLED' || user.id === form.userId);
  const set = (key: keyof HrCollaboratorPayload, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ ...form, email: form.email || undefined, phone: form.phone || undefined, address: form.address || undefined, birthDate: form.birthDate || undefined, siteId: form.siteId || undefined, employeeNumber: form.employeeNumber || undefined, notes: form.notes || undefined, userId: form.userId || undefined, managerId: form.managerId || undefined });
    } finally { setSubmitting(false); }
  }
  return (
    <div className="modal-overlay">
      <motion.form
        className="modal-card hr-modal"
        onSubmit={submit}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="modal-header">
          <h2>{collaborator ? 'Modifier le collaborateur' : 'Nouveau collaborateur'}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '1.25rem 1.75rem 0.5rem 1.75rem' }}>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Minimum obligatoire : prénom, nom, date d’embauche, service et poste. Le compte ToqueHub reste optionnel.
          </p>
        </div>
        <div style={{ padding: '0 1.75rem 1.75rem 1.75rem' }}>
          <FormSection title="Informations générales">
            <input placeholder="URL photo optionnelle" value={form.photoUrl ?? ''} onChange={(e) => set('photoUrl', e.target.value)} />
            <input placeholder="Prénom *" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
            <input placeholder="Nom *" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
            <input type="email" placeholder="Email optionnel" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            <input placeholder="Téléphone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            <input placeholder="Adresse" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
            <label>
              Date de naissance
              <input type="date" value={form.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value)} />
            </label>
          </FormSection>
          <FormSection title="Informations professionnelles">
            <label>
              Date d’embauche *
              <input type="date" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} required />
            </label>
            <select value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)} required>
              <option value="">Service *</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <select value={form.positionId} onChange={(e) => set('positionId', e.target.value)} required>
              <option value="">Poste *</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
            </select>
            <select value={form.siteId ?? ''} onChange={(e) => set('siteId', e.target.value)}>
              <option value="">Site principal optionnel</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <input placeholder="Numéro de matricule" value={form.employeeNumber ?? ''} onChange={(e) => set('employeeNumber', e.target.value)} />
            <select value={form.managerId ?? ''} onChange={(e) => set('managerId', e.target.value)}>
              <option value="">Aucun responsable</option>
              {availableManagers.map((item) => (
                <option key={item.id} value={item.id}>
                  {fullName(item)}
                </option>
              ))}
            </select>
            <textarea placeholder="Notes" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </FormSection>
          <FormSection title="Statut et liaison ToqueHub">
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <select value={form.userId ?? ''} onChange={(e) => set('userId', e.target.value)}>
              <option value="">Aucun compte ToqueHub</option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {displayUser(user)}
                </option>
              ))}
            </select>
          </FormSection>
        </div>
        <div className="modal-actions" style={{ padding: '1.25rem 1.75rem', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

function ReferenceModal({
  title,
  item,
  onClose,
  onSubmit,
}: {
  title: string;
  item?: HrDepartment | HrPosition;
  onClose: () => void;
  onSubmit: (payload: HrReferencePayload) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="modal-overlay">
      <motion.form
        className="modal-card hr-modal"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          try {
            await onSubmit({ name, description: description || undefined });
          } finally {
            setSubmitting(false);
          }
        }}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="modal-header">
          <h2>{item ? `Modifier ${title.toLowerCase()}` : `Nouveau ${title.toLowerCase()}`}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '1.75rem' }}>
          <FormSection title="Détails">
            <input placeholder="Nom *" value={name} onChange={(event) => setName(event.target.value)} required />
            <textarea placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </FormSection>
        </div>
        <div className="modal-actions" style={{ padding: '1.25rem 1.75rem', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            Enregistrer
          </button>
        </div>
      </motion.form>
    </div>
  );
}

function CollaboratorSheet({ collaborator, rotations, canWrite, onClose, onEdit, onSetRotation, onRemoveRotation }: { collaborator: HrCollaborator; rotations: HrRotation[]; canWrite: boolean; onClose: () => void; onEdit: () => void; onSetRotation: (employeeId: string, rotationId: string, startDate?: string) => Promise<void>; onRemoveRotation: (employeeId: string) => Promise<void> }) {
  const [rotationId, setRotationId] = useState('');
  const currentRotation = activeRotation(collaborator);
  const compatibleRotations = rotations.filter((rotation) => !isArchived(rotation) && (!rotationDepartment(rotation)?.id || rotationDepartment(rotation)?.id === (collaborator.departmentId ?? collaborator.department?.id)));
  return (
    <div className="modal-overlay">
      <motion.div
        className="modal-card hr-sheet"
        initial={{ x: 30, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 30, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      >
        <div className="modal-header">
          <div className="hr-profile-head">
            <AvatarInitial collaborator={collaborator} />
            <div>
              <h2>{fullName(collaborator)}</h2>
              <p>{collaborator.position?.name ?? 'Poste non renseigné'} · {collaborator.department?.name ?? 'Service non renseigné'}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {canWrite ? (
              <button
                className="btn btn-secondary"
                onClick={onEdit}
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', height: 'auto' }}
              >
                <Edit3 size={14} /> Modifier
              </button>
            ) : null}
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="hr-sheet-grid">
          <InfoBlock
            title="Informations personnelles"
            rows={[
              [<Mail size={14} />, collaborator.email || 'Non renseigné'],
              [<Phone size={14} />, collaborator.phone || 'Non renseigné'],
              [<MapPin size={14} />, collaborator.address || 'Non renseignée'],
              [<CalendarDays size={14} />, formatDate(collaborator.birthDate)],
            ]}
          />
          <InfoBlock
            title="Informations professionnelles"
            rows={[
              [<BriefcaseBusiness size={14} />, collaborator.position?.name ?? '—'],
              [<Building2 size={14} />, collaborator.department?.name ?? '—'],
              [
                <MapPin size={14} />,
                collaborator.mainSite?.name ?? collaborator.site?.name ?? 'Site principal optionnel non défini',
              ],
              [<UserRound size={14} />, collaborator.manager ? fullName(collaborator.manager) : 'Aucun responsable'],
            ]}
          />
          <InfoBlock
            title="Compte ToqueHub associé"
            rows={[
              [
                <ShieldCheck size={14} />,
                collaborator.user ? displayUser(collaborator.user) : 'Aucun compte associé',
              ],
            ]}
          />
          <InfoBlock
            title="Organisation de travail"
            rows={[
              [<Building2 size={14} />, `Service : ${collaborator.department?.name ?? '—'}`],
              [<BriefcaseBusiness size={14} />, `Poste : ${collaborator.position?.name ?? '—'}`],
              [<RotateCw size={14} />, `Roulement : ${currentRotation?.name ?? 'Aucun roulement actif'}`],
              [<Clock size={14} />, currentRotation ? `Durée hebdo : ${formatMinutes(rotationMetrics(currentRotation).averageWeeklyMinutes)}` : 'Durée hebdo : —'],
              [<CalendarDays size={14} />, currentRotation ? `${rotationMetrics(currentRotation).workedDays} jours travaillés / ${rotationMetrics(currentRotation).restDays} repos` : 'Jours travaillés / repos : —'],
              [<Building2 size={14} />, `Service du roulement : ${currentRotation ? rotationDepartment(currentRotation)?.name ?? 'Tous services' : '—'}`],
            ]}
          />
          <InfoBlock title="Notes" rows={[[<NotebookText size={14} />, collaborator.notes || 'Aucune note']]} />
        </div>
        <div className="card-modern" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          <div className="section-header-modern"><span className="card-title"><RotateCw size={18} /> Organisation de travail</span>{currentRotation ? <span className="badge badge-reception">1 roulement actif</span> : <span className="badge">Aucun</span>}</div>
          {canWrite ? <div className="inline-assign"><select value={rotationId} onChange={(e) => setRotationId(e.target.value)}><option value="">Sélectionner un roulement compatible</option>{compatibleRotations.map((rotation) => <option key={rotation.id} value={rotation.id}>{rotation.name} · {rotationDepartment(rotation)?.name ?? 'Tous services'}</option>)}</select><button className="btn btn-primary" disabled={!rotationId} onClick={async () => { await onSetRotation(collaborator.id, rotationId); setRotationId(''); }}>Modifier le roulement</button>{currentRotation ? <button className="btn btn-secondary" onClick={() => onRemoveRotation(collaborator.id)}>Retirer le roulement</button> : null}</div> : null}
        </div>
        <div className="card-modern" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          <span className="card-title">Historique</span>
          <HistoryList history={collaborator.history ?? []} />
        </div>
        <div className="hr-future" style={{ borderTop: '1px dashed var(--light-border)', paddingTop: '1.25rem', marginTop: 'auto' }}>
          <span>Contrats</span>
          <span>Formations</span>
          <span>Documents</span>
          <span>Congés</span>
          <span>Planning</span>
        </div>
      </motion.div>
    </div>
  );
}

function activeRotation(collaborator: HrCollaborator) { return collaborator.activeRotation ?? collaborator.activeRotationAssignment?.rotation ?? collaborator.rotationAssignment?.rotation ?? null; }
function activeAssignments(rotation: HrRotation) { return (rotation.activeAssignments ?? rotation.assignments ?? []).filter((assignment) => !assignment.endDate); }
function rotationDepartment(rotation?: HrRotation | null) { return rotation?.department ?? rotation?.service ?? null; }
function dayName(day: number) { return ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][day - 1] ?? `Jour ${day}`; }
function weekLabel(index: number) { return ['Semaine A', 'Semaine B', 'Semaine C', 'Semaine D'][index - 1] ?? `Semaine ${index}`; }
function defaultDay(dayOfWeek: number): HrRotationDay { return dayOfWeek <= 5 ? { dayOfWeek, mode: 'WORK', startTime: '08:00', endTime: '16:00', breakMinutes: 30 } : { dayOfWeek, mode: 'REST', breakMinutes: 0 }; }
function normalizeWeeks(rotation?: Pick<HrRotation, 'cycleWeeks' | 'weeks' | 'days'> | HrRotationPayload | null): HrRotationWeek[] { const sourceWeeks = rotation?.weeks ?? (rotation as any)?.cycle?.weeks; const count = Math.min(4, Math.max(1, Number(rotation?.cycleWeeks ?? sourceWeeks?.length ?? 1))); return Array.from({ length: count }, (_, index) => { const weekIndex = index + 1; const existing = sourceWeeks?.find((week: any) => week.weekIndex === weekIndex || week.weekNumber === weekIndex); const legacyDays = weekIndex === 1 && rotation && 'days' in rotation ? rotation.days : undefined; return { weekIndex, label: weekLabel(weekIndex), days: Array.from({ length: 7 }, (_, dayIndex) => { const dayOfWeek = dayIndex + 1; const found = existing?.days?.find((day: any) => day.dayOfWeek === dayOfWeek); return found ? { ...found, dayOfWeek } : legacyDays?.find((day: HrRotationDay) => day.dayOfWeek === dayOfWeek) ?? defaultDay(dayOfWeek); }) }; }); }
function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset className="hr-form-section"><legend>{title}</legend>{children}</fieldset>; }
function minutesOf(time?: string | null) { if (!time) return 0; const [hours, minutes] = time.split(':').map(Number); return (hours || 0) * 60 + (minutes || 0); }
function dayDuration(day: HrRotationDay) { if (day.mode === 'REST') return { presence: 0, worked: 0, endsNextDay: false }; const start = minutesOf(day.startTime ?? '08:00'); let end = minutesOf(day.endTime ?? '16:00'); const endsNextDay = end <= start; if (endsNextDay) end += 24 * 60; const presence = Math.max(0, end - start); return { presence, worked: Math.max(0, presence - Number(day.breakMinutes ?? 0)), endsNextDay }; }
function weekMetrics(week: HrRotationWeek) { const work = week.days.filter((day) => day.mode !== 'REST'); const totalMinutes = work.reduce((sum, day) => sum + dayDuration(day).worked, 0); const totalPresence = work.reduce((sum, day) => sum + dayDuration(day).presence, 0); return { totalMinutes, workedDays: work.length, restDays: 7 - work.length, averagePresenceMinutes: work.length ? Math.round(totalPresence / work.length) : 0 }; }
function cycleMetrics(weeks: HrRotationWeek[]) { const weekly = weeks.map(weekMetrics); const divisor = Math.max(1, weekly.length); return { averageWeeklyMinutes: Math.round(weekly.reduce((sum, item) => sum + item.totalMinutes, 0) / divisor), workedDays: Math.round(weekly.reduce((sum, item) => sum + item.workedDays, 0) / divisor), restDays: Math.round(weekly.reduce((sum, item) => sum + item.restDays, 0) / divisor), averagePresenceMinutes: Math.round(weekly.reduce((sum, item) => sum + item.averagePresenceMinutes, 0) / divisor) }; }
function rotationMetrics(rotation: HrRotation) { const computed = cycleMetrics(normalizeWeeks(rotation)); const metrics = rotation.metrics as any; return { averageWeeklyMinutes: metrics?.averageWeeklyMinutes ?? metrics?.weeklyMinutes ?? metrics?.weeklyHoursMinutesAverage ?? computed.averageWeeklyMinutes, workedDays: metrics?.workedDays ?? metrics?.workedDaysAverage ?? computed.workedDays, restDays: metrics?.restDays ?? metrics?.restDaysAverage ?? computed.restDays, averagePresenceMinutes: metrics?.averagePresenceMinutes ?? metrics?.averageDailyPresenceMinutes ?? computed.averagePresenceMinutes }; }
function formatMinutes(value?: number | null) { if (value === undefined || value === null || Number.isNaN(value)) return '—'; const hours = Math.floor(value / 60); const minutes = Math.round(value % 60); return `${hours}h${minutes.toString().padStart(2, '0')}`; }
function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) { return <div className="empty-state"><div className="empty-state-icon">👥</div><span className="empty-state-title">{title}</span><span className="empty-state-desc">{description}</span>{action}</div>; }
function PersonRow({ collaborator, detail }: { collaborator: HrCollaborator; detail?: string }) { return <div className="hr-person-row"><AvatarInitial collaborator={collaborator} /><div><strong>{fullName(collaborator)}</strong><span>{collaborator.position?.name ?? '—'} · {collaborator.department?.name ?? '—'}</span></div><small>{detail}</small></div>; }
function AvatarInitial({ collaborator }: { collaborator: HrCollaborator }) { const photo = collaborator.photoUrl ?? collaborator.photoDataUrl; return photo ? <img className="hr-avatar" src={photo} alt="" /> : <div className="hr-avatar">{`${collaborator.firstName?.[0] ?? ''}${collaborator.lastName?.[0] ?? ''}`.toUpperCase() || 'RH'}</div>; }
function StatusBadge({ status }: { status?: string }) { const className = status === 'ACTIVE' ? 'badge-reception' : status === 'ABSENT' ? 'badge-warning' : status === 'LEFT' ? 'badge-danger' : ''; return <span className={`badge ${className}`}>{statusLabels[status ?? 'ACTIVE'] ?? status ?? 'Actif'}</span>; }
function HistoryList({ history }: { history: HrHistoryEntry[] }) { return history.length === 0 ? <p className="muted">L’historique utile apparaîtra ici : création, changements de statut, service, poste, liaison et archivage.</p> : <div className="hr-history">{history.map((entry) => <div key={entry.id ?? `${entry.createdAt}-${entry.type}`}><strong>{entry.label ?? entry.type}</strong><span>{entry.description}</span><small>{formatDate(entry.createdAt)}</small></div>)}</div>; }
function InfoBlock({ title, rows }: { title: string; rows: Array<[React.ReactNode, React.ReactNode]> }) { return <div className="hr-info-block"><h3>{title}</h3>{rows.map(([icon, value], index) => <div key={index}>{icon}<span>{value}</span></div>)}</div>; }
function fullName(item: { firstName?: string | null; lastName?: string | null }) { return `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim() || 'Collaborateur'; }
function displayUser(user: Pick<CoreUser, 'firstName' | 'lastName' | 'email'>) { return `${`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email} · ${user.email}`; }
function isArchived(item: { isArchived?: boolean; archivedAt?: string | null }) { return Boolean(item.isArchived || item.archivedAt); }
function formatDate(value?: string | null) { if (!value) return '—'; return new Intl.DateTimeFormat('fr-FR').format(new Date(value)); }
function dateValue(value?: string | null) { return value ? new Date(value).getTime() : 0; }
function toInputDate(value?: string | null) { return value ? new Date(value).toISOString().slice(0, 10) : ''; }

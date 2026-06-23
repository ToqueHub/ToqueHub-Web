import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Archive,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Edit3,
  Eye,
  GitBranch,
  HelpCircle,
  Info,
  Mail,
  MapPin,
  NotebookText,
  Printer,
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
import type { CoreUser, HrCollaborator, HrCollaboratorPayload, HrDepartment, HrDocument, HrHistoryEntry, HrPosition, HrReferencePayload, HrRotation, HrRotationDay, HrRotationPayload, HrRotationWeek, HrSummary, Site } from '../types';
import { HR_CATALOG } from '../hr-catalog';
import { CollaboratorModal as CollaboratorDossierModal } from './hr/collaborator/CollaboratorModal';

const statusLabels: Record<string, string> = {
  ACTIVE: 'Actif',
  ABSENT: 'Absent',
  SUSPENDED: 'Suspendu',
  LEFT: 'Départ',
  DEPARTED: 'Départ',
};

const statusOptions = [
  { value: 'ACTIVE', label: 'Actif' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'SUSPENDED', label: 'Suspendu' },
  { value: 'DEPARTED', label: 'Départ' },
];

const HR_WIZARD_SERVICES_KEY = 'toquehub.hrWizard.selectedServices';

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
  onboarding?: any;
  canWrite: boolean;
  loading?: boolean;
  onNavigate: (tab: HrTab) => void;
  onCreateCollaborator: (payload: HrCollaboratorPayload) => Promise<HrCollaborator | void>;
  onUpdateCollaborator: (id: string, payload: Partial<HrCollaboratorPayload>) => Promise<HrCollaborator | void>;
  onArchiveCollaborator: (id: string) => Promise<void>;
  onUploadCollaboratorDocument: (employeeId: string, payload: { file: File; category: string; notes?: string; expiresAt?: string }) => Promise<void>;
  onDeleteCollaboratorDocument: (employeeId: string, documentId: string) => Promise<void>;
  onReplaceCollaboratorDocument: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>;
  onViewCollaboratorDocument: (employeeId: string, document: HrDocument) => Promise<void>;
  onDownloadCollaboratorDocument: (employeeId: string, document: HrDocument) => Promise<void>;
  onCreateDepartment: (payload: HrReferencePayload) => Promise<void>;
  onCreateDepartmentsBulk: (names: string[]) => Promise<void>;
  onUpdateDepartment: (id: string, payload: HrReferencePayload) => Promise<void>;
  onArchiveDepartment: (id: string) => Promise<void>;
  onCreatePosition: (payload: HrReferencePayload) => Promise<void>;
  onCreatePositionsBulk: (items: HrReferencePayload[]) => Promise<void>;
  onUpdatePosition: (id: string, payload: HrReferencePayload) => Promise<void>;
  onArchivePosition: (id: string) => Promise<void>;
  onCreateRotation: (payload: HrRotationPayload) => Promise<void>;
  onUpdateRotation: (id: string, payload: Partial<HrRotationPayload>) => Promise<void>;
  onArchiveRotation: (id: string) => Promise<void>;
  onAssignRotation: (rotationId: string, employeeId: string, startDate?: string) => Promise<void>;
  onRemoveRotationAssignment: (rotationId: string, employeeId: string) => Promise<void>;
  onSetCollaboratorRotation: (employeeId: string, rotationId: string, startDate?: string) => Promise<void>;
  onRemoveCollaboratorRotation: (employeeId: string) => Promise<void>;
  onCompleteServices?: (names?: string[]) => Promise<void>;
  onCompletePositions?: () => Promise<void>;
  onUnlockEmployees?: () => Promise<void>;
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
  onboarding,
  canWrite,
  loading,
  onNavigate,
  onCreateCollaborator,
  onUpdateCollaborator,
  onArchiveCollaborator,
  onUploadCollaboratorDocument,
  onDeleteCollaboratorDocument,
  onReplaceCollaboratorDocument,
  onViewCollaboratorDocument,
  onDownloadCollaboratorDocument,
  onCreateDepartment,
  onCreateDepartmentsBulk,
  onUpdateDepartment,
  onArchiveDepartment,
  onCreatePosition,
  onCreatePositionsBulk,
  onUpdatePosition,
  onArchivePosition,
  onCreateRotation,
  onUpdateRotation,
  onArchiveRotation,
  onAssignRotation,
  onRemoveRotationAssignment,
  onSetCollaboratorRotation,
  onRemoveCollaboratorRotation,
  onCompleteServices,
  onCompletePositions,
  onUnlockEmployees,
}: HrAppProps) {
  const [collaboratorModal, setCollaboratorModal] = useState<HrCollaborator | 'new' | null>(null);
  const [selectedCollaborator, setSelectedCollaborator] = useState<HrCollaborator | null>(null);
  const [rotationModal, setRotationModal] = useState<HrRotation | 'new' | null>(null);
  const [selectedRotation, setSelectedRotation] = useState<HrRotation | null>(null);
  const [referenceModal, setReferenceModal] = useState<{ type: 'department' | 'position'; item?: HrDepartment | HrPosition } | null>(null);
  const [departmentSetupOpen, setDepartmentSetupOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
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

  const hasDepartments = departments.filter((d) => !isArchived(d)).length > 0;
  const hasPositions = positions.filter((p) => !isArchived(p)).length > 0;
  const hasCollaborators = collaborators.filter((c) => !isArchived(c)).length > 0;
  const onboardingHasServices = onboarding ? Boolean(onboarding.servicesCompletedAt) : hasDepartments;
  const onboardingHasPositions = onboarding ? Boolean(onboarding.positionsCompletedAt) : hasPositions;
  const employeesUnlocked = onboarding ? Boolean(onboarding.employeesUnlockedAt) : hasCollaborators;
  const canAccessCollaborators = employeesUnlocked;
  const canAccessRotationsAndOrg = employeesUnlocked;
  const needsInitialWizard = canWrite && !employeesUnlocked;
  const canRenderWizard = canWrite && wizardOpen && !onboarding?.completedAt;

  useEffect(() => {
    if (needsInitialWizard) setWizardOpen(true);
  }, [needsInitialWizard]);

  const visibleTabs: [HrTab, string][] = [
    ['dashboard', 'Tableau de bord'],
    ['departments', 'Services'],
    ...(onboardingHasServices && onboardingHasPositions ? [['positions', 'Postes'] as [HrTab, string]] : []),
    ...(canAccessCollaborators ? [['collaborators', 'Collaborateurs'] as [HrTab, string]] : []),
    ...(canAccessRotationsAndOrg ? [['rotations', 'Roulements'] as [HrTab, string]] : []),
    ...(canAccessRotationsAndOrg ? [['orgchart', 'Organigramme'] as [HrTab, string]] : []),
  ];

  return (
    <div className="hr-shell">
      <div className="hr-hero">
        <div>
          <span className="welcome-tag">ToqueHub RH</span>
          <h1>Ressources Humaines</h1>
          <p>Vue d’ensemble de votre organisation. Centralisez les collaborateurs, services, postes et responsables sans recréer le Core.</p>
        </div>
        {canWrite && canAccessCollaborators ? <button className="btn btn-primary" onClick={() => setCollaboratorModal('new')}><Plus size={16} /> Nouveau collaborateur</button> : null}
      </div>

      <div className="hr-tabs">
        {visibleTabs.map(([value, label]) => (
          <button key={value} className={tab === value ? 'active' : ''} onClick={() => onNavigate(value)}>{label}</button>
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
        <ReferencePage title="Services" icon={<Building2 size={18} />} description="Structurez Cuisine, Pâtisserie, Soins, Administration… Les services archivés ne sont plus proposés par défaut." items={departments} canWrite={canWrite} onCreate={() => setDepartmentSetupOpen(true)} onEdit={(item) => setReferenceModal({ type: 'department', item })} onArchive={onArchiveDepartment} />
      ) : null}

      {tab === 'positions' ? (
        <PositionsPage positions={positions} departments={departments} canWrite={canWrite} onCreate={() => setReferenceModal({ type: 'position' })} onEdit={(item: HrPosition) => setReferenceModal({ type: 'position', item })} onArchive={onArchivePosition} />
      ) : null}

      {tab === 'rotations' ? (
        <RotationsPage rotations={rotations} collaborators={collaborators} departments={departments} canWrite={canWrite} onCreate={() => setRotationModal('new')} onEdit={setRotationModal} onOpen={setSelectedRotation} onArchive={onArchiveRotation} onAssign={onAssignRotation} onRemoveAssignment={onRemoveRotationAssignment} />
      ) : null}

      {tab === 'orgchart' ? (
        <OrgChart collaborators={collaborators.filter((collaborator) => !isArchived(collaborator))} departments={departments} departmentFilter={orgDepartment} onDepartmentFilter={setOrgDepartment} />
      ) : null}

      {collaboratorModal ? (
        <CollaboratorDossierModal
          collaborator={collaboratorModal === 'new' ? undefined : collaboratorModal}
          collaborators={collaborators.filter((item) => !isArchived(item))}
          departments={activeDepartments}
          positions={activePositions}
          users={selectableUsers}
          sites={sites.filter((site) => !isArchived(site))}
          rotations={rotations}
          onClose={() => setCollaboratorModal(null)}
          onDeleteDocument={async (employeeId, documentId) => {
            await onDeleteCollaboratorDocument(employeeId, documentId);
            setCollaboratorModal((current) => current && current !== 'new' && current.id === employeeId ? { ...current, documents: (current.documents ?? []).filter((document) => document.id !== documentId) } : current);
          }}
          onReplaceDocument={async (employeeId, documentId, file) => {
            const updated = await onReplaceCollaboratorDocument(employeeId, documentId, file);
            if (updated) setCollaboratorModal((current) => current && current !== 'new' && current.id === employeeId ? { ...current, documents: (current.documents ?? []).map((document) => document.id === documentId ? updated : document) } : current);
            return updated;
          }}
          onViewDocument={onViewCollaboratorDocument}
          onDownloadDocument={onDownloadCollaboratorDocument}
          onSubmit={async (payload, documents) => {
            const saved = collaboratorModal === 'new' ? await onCreateCollaborator(payload) : await onUpdateCollaborator(collaboratorModal.id, payload);
            const employeeId = saved?.id ?? (collaboratorModal !== 'new' ? collaboratorModal.id : undefined);
            if (employeeId && documents.length) {
              for (const document of documents) {
                await onUploadCollaboratorDocument(employeeId, document);
              }
            }
            setCollaboratorModal(null);
          }}
        />
      ) : null}

      {selectedCollaborator ? <CollaboratorSheet collaborator={selectedCollaborator} rotations={rotations} onClose={() => setSelectedCollaborator(null)} onEdit={() => { setCollaboratorModal(selectedCollaborator); setSelectedCollaborator(null); }} canWrite={canWrite} onSetRotation={onSetCollaboratorRotation} onRemoveRotation={onRemoveCollaboratorRotation} onSaveNotes={async (notes) => { const updated = await onUpdateCollaborator(selectedCollaborator.id, collaboratorToPayload(selectedCollaborator, { notes })); setSelectedCollaborator((current) => current?.id === selectedCollaborator.id ? { ...(updated ?? current), notes } : current); }} onViewDocument={onViewCollaboratorDocument} onReplaceDocument={async (employeeId, documentId, file) => { const updated = await onReplaceCollaboratorDocument(employeeId, documentId, file); if (updated) setSelectedCollaborator((current) => current?.id === employeeId ? { ...current, documents: (current.documents ?? []).map((document) => document.id === documentId ? updated : document) } : current); return updated; }} onDeleteDocument={async (employeeId, documentId) => { await onDeleteCollaboratorDocument(employeeId, documentId); setSelectedCollaborator((current) => current?.id === employeeId ? { ...current, documents: (current.documents ?? []).filter((document) => document.id !== documentId) } : current); }} onDownloadDocument={onDownloadCollaboratorDocument} /> : null}

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
          type={referenceModal.type}
          departments={activeDepartments}
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

      {departmentSetupOpen ? (
        <DepartmentSetupModal
          departments={departments}
          positions={positions}
          onClose={() => setDepartmentSetupOpen(false)}
          onCreateDepartmentsBulk={onCreateDepartmentsBulk}
          onCreatePositionsBulk={onCreatePositionsBulk}
        />
      ) : null}

      {canRenderWizard ? (
        <HrOnboardingWizard
          collaborators={collaborators}
          departments={departments}
          positions={positions}
          users={users}
          sites={sites}
          rotations={rotations}
          onboarding={onboarding}
          onCreateCollaborator={onCreateCollaborator}
          onUploadCollaboratorDocument={onUploadCollaboratorDocument}
          onCreateDepartmentsBulk={onCreateDepartmentsBulk}
          onCreatePositionsBulk={onCreatePositionsBulk}
          onCompleteServices={onCompleteServices}
          onCompletePositions={onCompletePositions}
          onUnlockEmployees={onUnlockEmployees}
          onFinished={() => {
            sessionStorage.removeItem(HR_WIZARD_SERVICES_KEY);
            setWizardOpen(false);
            onNavigate('collaborators');
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
  const collaboratorsMissingContract = activeCollaborators.filter((c) => !hasContractCoverage(c));
  const withoutContract = collaboratorsMissingContract.length;
  const withoutPosition = activeCollaborators.filter((c) => !c.positionId && !c.position).length;
  const withoutManager = activeCollaborators.filter((c) => !c.managerId && !c.manager).length;
  const contractsEndingSoon = activeCollaborators.filter((c) => {
    const endDate = c.activeContract?.endDate || c.contractEndDate;
    return endDate && new Date(endDate).getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000 && new Date(endDate).getTime() > Date.now();
  }).length;
  const reviewsSoon = activeCollaborators.filter((c) => {
    const dueDate = c.nextSalaryReview?.dueDate || c.nextReviewDate;
    return dueDate && new Date(dueDate).getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000 && new Date(dueDate).getTime() > Date.now();
  }).length;
  const canWrite = false;
  const hasDepartments = departments.filter((d) => !isArchived(d)).length > 0;
  const hasPositions = positions.filter((p) => !isArchived(p)).length > 0;
  const hasCollaborators = activeCollaborators.length > 0;
  const onboardingHasServices = hasDepartments;
  const onboardingHasPositions = hasPositions;
  const employeesUnlocked = hasCollaborators;
  const onboardingComplete = true;
  const [configExpanded, setConfigExpanded] = useState(false);
  const onCreateDepartmentsBulk = async (_names: string[]) => {};
  const onCreatePositionsBulk = async (_items: HrReferencePayload[]) => {};
  const onCompleteServices = undefined as undefined | ((names?: string[]) => Promise<void>);
  const onCompletePositions = undefined as undefined | (() => Promise<void>);
  const onUnlockEmployees = undefined as undefined | (() => Promise<void>);
  const stats = [
    { label: 'Collaborateurs', value: summary?.counts?.collaborators ?? activeCollaborators.length, icon: UsersRound },
    { label: 'Services', value: summary?.counts?.departments ?? departments.filter((item) => !isArchived(item)).length, icon: Building2 },
    { label: 'Postes', value: summary?.counts?.positions ?? positions.filter((item) => !isArchived(item)).length, icon: BriefcaseBusiness },
    { label: 'Avec compte ToqueHub', value: summary?.counts?.linkedCollaborators ?? activeCollaborators.filter((item) => item.userId || item.user).length, icon: ShieldCheck },
    { label: 'Roulements actifs', value: summary?.counts?.activeRotations ?? '—', icon: RotateCw },
    { label: 'Avec roulement', value: summary?.counts?.collaboratorsWithRotation ?? activeCollaborators.filter((item) => activeRotation(item)).length, icon: CalendarDays },
    { label: 'Sans roulement', value: summary?.counts?.collaboratorsWithoutRotation ?? activeCollaborators.filter((item) => !activeRotation(item)).length, icon: Clock },
    { label: 'Durée hebdo moyenne', value: formatMinutes(summary?.counts?.averageWeeklyRotationMinutes), icon: Clock },
    ...(withoutContract ? [{ label: 'Sans contrat', value: withoutContract, icon: ShieldCheck }] : []),
    ...(withoutPosition ? [{ label: 'Sans poste principal', value: withoutPosition, icon: BriefcaseBusiness }] : []),
    ...(withoutManager ? [{ label: 'Sans responsable', value: withoutManager, icon: UserRound }] : []),
    ...(contractsEndingSoon ? [{ label: 'Contrats à échéance', value: contractsEndingSoon, icon: CalendarDays }] : []),
    ...(reviewsSoon ? [{ label: 'Revalorisations prévues', value: reviewsSoon, icon: Sparkles }] : []),
  ];

  const nextStepLabel = !onboardingHasServices
    ? 'Sélectionner les services'
    : !onboardingHasPositions
    ? 'Sélectionner les postes'
    : !employeesUnlocked
    ? 'Valider la structure RH'
    : 'Configuration terminée';

  return <>
    {collaboratorsMissingContract.length ? (
      <div className="alert-modern error hr-dashboard-alert">
        <ShieldCheck size={18} />
        <div>
          <strong>Contrat manquant</strong>
          <span>Contrat manquant pour : {collaboratorsMissingContract.map(fullName).join(', ')}</span>
        </div>
      </div>
    ) : null}
    {canWrite ? (
      <div className="card-modern" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(59,130,246,0.04) 100%)', borderColor: 'rgba(16,185,129,0.15)' }}>
        <div className="section-header-modern" style={{ justifyContent: 'space-between' }}>
          <span className="card-title"><Sparkles size={18} /> Configuration initiale du module RH</span>
          {configExpanded ? (
            <button type="button" className="btn btn-secondary" onClick={() => setConfigExpanded(false)}>Replier</button>
          ) : null}
        </div>
        {!configExpanded ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 500, color: '#334155' }}>{nextStepLabel}</p>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                {onboardingHasServices ? `${departments.filter((d) => !isArchived(d)).length} services` : 'Aucun service configuré'}
                {onboardingHasPositions ? ` · ${positions.filter((p) => !isArchived(p)).length} postes` : ''}
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setConfigExpanded(true)}>
              {onboardingComplete ? 'Déplier' : 'Continuer la configuration'}
            </button>
          </div>
        ) : !onboardingHasServices ? (
          <ServiceCatalogGrid onSubmit={async (names) => { await onCreateDepartmentsBulk(names); if (onCompleteServices) await onCompleteServices(); setConfigExpanded(true); }} />
        ) : !onboardingHasPositions ? (
          <PositionCatalogSelector departments={departments} onSubmit={async (items) => { await onCreatePositionsBulk(items); if (onCompletePositions) await onCompletePositions(); if (onUnlockEmployees) await onUnlockEmployees(); setConfigExpanded(false); }} />
        ) : !employeesUnlocked ? (
          <OnboardingStructureReview departments={departments} positions={positions} onOpenCollaborators={onOpenCollaborators} onUnlockEmployees={onUnlockEmployees} onClose={() => setConfigExpanded(false)} />
        ) : (
          <OnboardingStructureReview departments={departments} positions={positions} onOpenCollaborators={onOpenCollaborators} onClose={() => setConfigExpanded(false)} />
        )}
      </div>
    ) : null}
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

function HrOnboardingWizard({
  collaborators,
  departments,
  positions,
  users,
  sites,
  rotations,
  onboarding,
  onCreateCollaborator,
  onUploadCollaboratorDocument,
  onCreateDepartmentsBulk,
  onCreatePositionsBulk,
  onCompleteServices,
  onCompletePositions,
  onUnlockEmployees,
  onFinished,
}: {
  collaborators: HrCollaborator[];
  departments: HrDepartment[];
  positions: HrPosition[];
  users: CoreUser[];
  sites: Site[];
  rotations: HrRotation[];
  onboarding?: any;
  onCreateCollaborator: (payload: HrCollaboratorPayload) => Promise<HrCollaborator | void>;
  onUploadCollaboratorDocument: (employeeId: string, payload: { file: File; category: string; notes?: string; expiresAt?: string }) => Promise<void>;
  onCreateDepartmentsBulk: (names: string[]) => Promise<void>;
  onCreatePositionsBulk: (items: HrReferencePayload[]) => Promise<void>;
  onCompleteServices?: (names?: string[]) => Promise<void>;
  onCompletePositions?: () => Promise<void>;
  onUnlockEmployees?: () => Promise<void>;
  onFinished: () => void;
}) {
  const hasServices = Boolean(onboarding?.servicesCompletedAt);
  const hasPositions = Boolean(onboarding?.positionsCompletedAt);
  const [selectedServiceNames, setSelectedServiceNames] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(HR_WIZARD_SERVICES_KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  const [selectedPositionsByDept, setSelectedPositionsByDept] = useState<Record<string, Set<string>>>({});
  const [creatingCollaborator, setCreatingCollaborator] = useState(false);
  const [employeesUnlockedInWizard, setEmployeesUnlockedInWizard] = useState(Boolean(onboarding?.employeesUnlockedAt));
  const [step, setStep] = useState<'welcome' | 'services' | 'positions' | 'review'>(() => {
    if (!hasServices) return 'welcome';
    if (!hasPositions) return 'positions';
    return 'review';
  });

  useEffect(() => {
    if (step === 'positions' && selectedServiceNames.length === 0) setStep('services');
  }, [selectedServiceNames.length, step]);
  useEffect(() => {
    if (onboarding?.employeesUnlockedAt) setEmployeesUnlockedInWizard(true);
  }, [onboarding?.employeesUnlockedAt]);

  const wizardDepartments = useMemo(() => {
    const active = departments.filter((department) => !isArchived(department));
    if (!selectedServiceNames.length) return active;
    const selected = new Set(selectedServiceNames.map((name) => name.trim().toLowerCase()));
    return active.filter((department) => selected.has(department.name.trim().toLowerCase()));
  }, [departments, selectedServiceNames]);
  const wizardDepartmentIds = new Set(wizardDepartments.map((department) => department.id));
  const wizardPositions = selectedServiceNames.length
    ? positions.filter((position) => wizardDepartmentIds.has(position.departmentId ?? '') || (position.department?.id ? wizardDepartmentIds.has(position.department.id) : false))
    : positions;
  const activeWizardCollaborators = collaborators.filter((collaborator) => !isArchived(collaborator));
  const stepIndex = step === 'welcome' ? 1 : step === 'services' ? 2 : step === 'positions' ? 3 : 4;

  return (
    <div className="modal-overlay hr-wizard-overlay">
      <motion.div
        className="modal-card hr-wizard-modal"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 24, stiffness: 220 }}
      >
        <div className="modal-header hr-wizard-header">
          <div>
            <span className="welcome-tag">Assistant RH</span>
            <h2>{step === 'welcome' ? 'Bienvenue sur le module Ressources Humaines' : step === 'services' ? 'Configuration initiale du module' : step === 'positions' ? 'Creation des postes' : 'Premier collaborateur'}</h2>
            <p>{stepIndex} / 4</p>
          </div>
        </div>

        {step === 'welcome' ? (
          <div className="hr-wizard-welcome">
            <div className="hr-wizard-hero-card">
              <div className="hr-wizard-icon"><UsersRound size={32} /></div>
              <div>
                <span className="welcome-tag">Configuration guidee</span>
                <p>
                  Ici, vous pourrez gerer vos collaborateurs, vos services et vos postes. L'assistant va d'abord construire la structure RH, puis vous accompagner vers la creation du premier collaborateur.
                </p>
              </div>
            </div>
            <div className="hr-wizard-bullets">
              <span><Building2 size={16} /> Choisir les services</span>
              <span><BriefcaseBusiness size={16} /> Creer les postes par service</span>
              <span><UserRound size={16} /> Ajouter le premier collaborateur</span>
            </div>
            <div className="hr-catalog-actions sticky">
              <span className="muted">Vous pourrez modifier cette structure plus tard.</span>
              <button className="btn btn-primary" onClick={() => setStep('services')}>Suivant</button>
            </div>
          </div>
        ) : step === 'services' ? (
          <ServiceCatalogGrid initialNames={selectedServiceNames} onBack={() => setStep('welcome')} onSubmit={async (names) => { setSelectedServiceNames(names); sessionStorage.setItem(HR_WIZARD_SERVICES_KEY, JSON.stringify(names)); await onCreateDepartmentsBulk(names); if (onCompleteServices) await onCompleteServices(names); setStep('positions'); }} />
        ) : step === 'positions' ? (
          <PositionCatalogSelector departments={wizardDepartments} initialSelection={selectedPositionsByDept} onSelectionChange={setSelectedPositionsByDept} onBack={() => setStep('services')} onSubmit={async (items) => { await onCreatePositionsBulk(items); if (onCompletePositions) await onCompletePositions(); setStep('review'); }} />
        ) : (
          <OnboardingCollaboratorStep
            departments={wizardDepartments}
            positions={wizardPositions}
            collaborators={activeWizardCollaborators}
            employeesUnlocked={employeesUnlockedInWizard}
            onBack={() => setStep('positions')}
            onCreate={() => setCreatingCollaborator(true)}
            onUnlockEmployees={async () => {
              if (onUnlockEmployees) await onUnlockEmployees();
              setEmployeesUnlockedInWizard(true);
            }}
            onFinished={onFinished}
          />
        )}
        {creatingCollaborator ? (
          <CollaboratorDossierModal
            collaborators={activeWizardCollaborators}
            departments={wizardDepartments}
            positions={wizardPositions}
            users={users}
            sites={sites.filter((site) => !isArchived(site))}
            rotations={rotations}
            onClose={() => setCreatingCollaborator(false)}
            onSubmit={async (payload, documents) => {
              const saved = await onCreateCollaborator(payload);
              if (saved?.id && documents.length) {
                for (const document of documents) await onUploadCollaboratorDocument(saved.id, document);
              }
              setCreatingCollaborator(false);
            }}
          />
        ) : null}
      </motion.div>
    </div>
  );
}

function ServiceCatalogGrid({ initialNames = [], onBack, onSubmit }: { initialNames?: string[]; onBack?: () => void; onSubmit: (names: string[]) => Promise<void> }) {
  const initialSelected = () => new Set(initialNames.map((name) => HR_CATALOG.find((item) => item.name.toLowerCase() === name.toLowerCase())?.id ?? `custom-${name}`));
  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [customName, setCustomName] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (initialNames.length) setSelected(initialSelected());
  }, [initialNames.join('|')]);
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectedItems = HR_CATALOG.filter((item) => selected.has(item.id));
  const customSelectedNames = [...selected].filter((id) => id.startsWith('custom-')).map((id) => id.replace('custom-', ''));
  const selectedNames = [...selectedItems.map((item) => item.name), ...customSelectedNames];
  const visibleCatalog = HR_CATALOG.filter((item) => `${item.name} ${item.description} ${item.examplePositions.join(' ')}`.toLowerCase().includes(serviceQuery.trim().toLowerCase()));
  const canAddCustom = customName.trim().length > 0 && !selectedNames.some((name) => name.toLowerCase() === customName.trim().toLowerCase());
  return (
    <div className="hr-catalog">
      <p className="muted" style={{ marginBottom: 12 }}>Sélectionnez les services présents dans votre établissement. Vous pourrez ajouter des services personnalisés plus tard.</p>
      <div className="search-input-wrapper hr-wizard-search"><Search /><input className="search-input" value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} placeholder="Rechercher un service : cafe, cuisine, direction..." /></div>
      <div className="hr-catalog-grid">
        {visibleCatalog.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <button type="button" key={item.id} className={`hr-catalog-card ${isSelected ? 'selected' : ''}`} onClick={() => toggle(item.id)}>
              <div className="hr-catalog-check">{isSelected ? <Check size={16} /> : <div className="hr-catalog-check-empty" />}</div>
              <div className="hr-catalog-body">
                <strong>{item.name}</strong>
                <span>{item.description}</span>
                {item.examplePositions.length ? <small>Ex. : {item.examplePositions.join(', ')}</small> : null}
              </div>
            </button>
          );
        })}
      </div>
      <div className="hr-catalog-custom">
        <input placeholder="Ajouter un service personnalisé…" value={customName} onChange={(e) => setCustomName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canAddCustom) { setSelected((prev) => new Set([...prev, `custom-${customName.trim()}`])); setCustomName(''); } }} />
        <button type="button" className="btn btn-secondary" disabled={!canAddCustom} onClick={() => { if (canAddCustom) { setSelected((prev) => new Set([...prev, `custom-${customName.trim()}`])); setCustomName(''); } }}>Ajouter</button>
      </div>
      {customSelectedNames.length ? (
        <div className="hr-catalog-tags">
          {customSelectedNames.map((name) => (
            <span key={name} className="badge badge-reception">{name} <button type="button" className="icon-btn" onClick={() => toggle(`custom-${name}`)}><X size={12} /></button></span>
          ))}
        </div>
      ) : null}
      <div className="hr-catalog-actions sticky">
        <span className="muted">{selected.size} service{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}</span>
        <div className="row-actions">
          {onBack ? <button type="button" className="btn btn-secondary" disabled={submitting} onClick={onBack}>Retour</button> : null}
          <button className="btn btn-primary" disabled={selected.size === 0 || submitting} onClick={async () => { setSubmitting(true); try { await onSubmit(selectedNames); } finally { setSubmitting(false); } }}>
            {submitting ? 'Création…' : 'Valider et créer les services'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PositionCatalogSelector({ departments, initialSelection = {}, onSelectionChange, onBack, onSubmit }: { departments: HrDepartment[]; initialSelection?: Record<string, Set<string>>; onSelectionChange?: (selection: Record<string, Set<string>>) => void; onBack?: () => void; onSubmit: (items: HrReferencePayload[]) => Promise<void> }) {
  const [selectedByDept, setSelectedByDept] = useState<Record<string, Set<string>>>(() => Object.fromEntries(Object.entries(initialSelection).map(([key, value]) => [key, new Set(value)])));
  const [customByDept, setCustomByDept] = useState<Record<string, string>>({});
  const activeDepartments = departments.filter((d) => !isArchived(d));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const initialSelectionKey = useMemo(() => Object.entries(initialSelection).map(([key, value]) => `${key}:${[...value].sort().join('|')}`).sort().join(';'), [initialSelection]);
  useEffect(() => {
    if (!initialSelectionKey) return;
    setSelectedByDept(Object.fromEntries(Object.entries(initialSelection).map(([key, value]) => [key, new Set(value)])));
  }, [initialSelectionKey]);
  useEffect(() => {
    onSelectionChange?.(selectedByDept);
  }, [onSelectionChange, selectedByDept]);
  const updateSelectedByDept = (updater: (prev: Record<string, Set<string>>) => Record<string, Set<string>>) => setSelectedByDept((prev) => {
    const next = updater(prev);
    return next;
  });
  const togglePosition = (deptId: string, position: string) => updateSelectedByDept((prev) => {
    const next = { ...prev, [deptId]: new Set(prev[deptId] ?? []) };
    if (next[deptId].has(position)) next[deptId].delete(position); else next[deptId].add(position);
    return next;
  });
  const addCustom = (deptId: string) => {
    const name = customByDept[deptId]?.trim();
    if (!name) return;
    updateSelectedByDept((prev) => ({ ...prev, [deptId]: new Set([...(prev[deptId] ?? []), name]) }));
    setCustomByDept((prev) => ({ ...prev, [deptId]: '' }));
  };
  const currentDepartment = activeDepartments[Math.min(currentIndex, Math.max(activeDepartments.length - 1, 0))];
  const currentCatalog = currentDepartment ? HR_CATALOG.find((c) => c.name.toLowerCase() === currentDepartment.name.toLowerCase()) ?? HR_CATALOG.find((c) => c.id === 'autre') : undefined;
  const currentSelected = currentDepartment ? selectedByDept[currentDepartment.id] ?? new Set<string>() : new Set<string>();
  const currentCatalogPositions = currentCatalog?.positions ?? [];
  const currentSuggestions = [...currentCatalogPositions, ...[...currentSelected].filter((position) => !currentCatalogPositions.some((item) => normalizeLabel(item) === normalizeLabel(position)))];
  const isLast = currentIndex >= activeDepartments.length - 1;
  const totalSelected = Object.values(selectedByDept).reduce((sum, set) => sum + set.size, 0);
  const payload = () => activeDepartments.flatMap((department) => [...(selectedByDept[department.id] ?? new Set<string>())].map((name) => ({ name, departmentId: department.id, description: buildJobDescription(name, department.name) })));
  if (!currentDepartment) return <EmptyState title="Aucun service actif" description="Créez d’abord les services avant de sélectionner les postes." />;
  return (
    <div className="hr-catalog">
      <p className="muted" style={{ marginBottom: 12 }}>Sélectionnez les postes pour chaque service. Le parcours avance service par service pour construire une base RH propre.</p>
      <div className="hr-position-stepper">
        {activeDepartments.map((department, index) => (
          <button key={department.id} type="button" className={index === currentIndex ? 'active' : ''} onClick={() => setCurrentIndex(index)}>
            {index + 1}. {department.name}
            {(selectedByDept[department.id]?.size ?? 0) ? <span>{selectedByDept[department.id]?.size}</span> : null}
          </button>
        ))}
      </div>
      <div className="hr-position-accordion-item">
        <div className="hr-position-accordion-header">
          <div>
            <strong>{currentDepartment.name}</strong>
            <span className="muted">Étape {currentIndex + 1} sur {activeDepartments.length} · {currentSelected.size} poste{currentSelected.size > 1 ? 's' : ''} sélectionné{currentSelected.size > 1 ? 's' : ''}</span>
          </div>
          <span className="badge badge-reception">{currentSuggestions.length} suggestions</span>
        </div>
        <div className="hr-position-accordion-body">
          <div className="hr-checkbox-group compact">
            {currentSuggestions.map((pos) => (
              <label key={pos} className="hr-checkbox-label">
                <input type="checkbox" checked={currentSelected.has(pos)} onChange={() => togglePosition(currentDepartment.id, pos)} />
                {pos}
              </label>
            ))}
          </div>
          <div className="hr-position-custom">
            <input placeholder={`Ajouter un poste personnalisé à ${currentDepartment.name}…`} value={customByDept[currentDepartment.id] ?? ''} onChange={(e) => setCustomByDept((prev) => ({ ...prev, [currentDepartment.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') addCustom(currentDepartment.id); }} />
            <button type="button" className="btn btn-secondary" onClick={() => addCustom(currentDepartment.id)}>Ajouter</button>
          </div>
        </div>
      </div>
      <div className="hr-catalog-actions sticky">
        <span className="muted">{totalSelected} poste{totalSelected > 1 ? 's' : ''} sélectionné{totalSelected > 1 ? 's' : ''}</span>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" disabled={submitting} onClick={() => currentIndex === 0 ? onBack?.() : setCurrentIndex((index) => Math.max(index - 1, 0))}>Retour</button>
          {!isLast ? (
            <button type="button" className="btn btn-primary" disabled={submitting} onClick={() => setCurrentIndex((index) => Math.min(index + 1, activeDepartments.length - 1))}>Suivant</button>
          ) : (
            <button className="btn btn-primary" disabled={totalSelected === 0 || submitting} onClick={async () => { setSubmitting(true); try { await onSubmit(payload()); } finally { setSubmitting(false); } }}>
              {submitting ? 'Création…' : 'Terminer et créer les postes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingCollaboratorStep({ departments, positions, collaborators, employeesUnlocked, onBack, onCreate, onUnlockEmployees, onFinished }: { departments: HrDepartment[]; positions: HrPosition[]; collaborators: HrCollaborator[]; employeesUnlocked: boolean; onBack: () => void; onCreate: () => void; onUnlockEmployees?: () => Promise<void>; onFinished: () => void }) {
  const activeDepartments = departments.filter((d) => !isArchived(d));
  const activePositions = positions.filter((p) => !isArchived(p));
  const [unlocking, setUnlocking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const canCreate = employeesUnlocked || !onUnlockEmployees;
  async function unlockAndCreate() {
    if (!canCreate && onUnlockEmployees) {
      setUnlocking(true);
      try {
        await onUnlockEmployees();
      } finally {
        setUnlocking(false);
      }
    }
    onCreate();
  }
  return (
    <div className="hr-catalog">
      <p className="muted" style={{ marginBottom: 12 }}>Validez la structure choisie, puis ajoutez un ou plusieurs collaborateurs avec leur service et leur poste.</p>
      <div className="hr-review-grid">
        <div className="card-modern" style={{ padding: 16 }}>
          <span className="card-title"><Building2 size={16} /> Services retenus ({activeDepartments.length})</span>
          <div className="hr-position-tags">{activeDepartments.map((d) => <span key={d.id} className="badge badge-reception">{d.name}</span>)}</div>
        </div>
        <div className="card-modern" style={{ padding: 16 }}>
          <span className="card-title"><BriefcaseBusiness size={16} /> Postes crees ({activePositions.length})</span>
          <div className="hr-position-tags">{activePositions.map((p) => <span key={p.id} className="badge">{p.name}</span>)}</div>
        </div>
      </div>
      <div className="hr-wizard-hero-card">
        <div className="hr-wizard-icon"><UserRound size={30} /></div>
        <div>
          <span className="welcome-tag">Derniere etape</span>
          <p>{collaborators.length ? `${collaborators.length} collaborateur${collaborators.length > 1 ? 's' : ''} deja cree${collaborators.length > 1 ? 's' : ''}. Vous pouvez en ajouter un autre ou terminer l'initialisation.` : 'Creez le premier collaborateur pour finaliser la base RH initiale.'}</p>
        </div>
      </div>
      <div className="hr-catalog-actions sticky">
        <span className="muted">{collaborators.length} collaborateur{collaborators.length > 1 ? 's' : ''} actif{collaborators.length > 1 ? 's' : ''}</span>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" disabled={unlocking || finishing} onClick={onBack}>Retour</button>
          <button type="button" className="btn btn-secondary" disabled={unlocking || finishing} onClick={unlockAndCreate}>{unlocking ? 'Validation...' : collaborators.length ? 'Ajouter un autre collaborateur' : 'Ajouter un collaborateur'}</button>
          <button type="button" className="btn btn-primary" disabled={!collaborators.length || unlocking || finishing} onClick={async () => { setFinishing(true); try { onFinished(); } finally { setFinishing(false); } }}>
            Terminer l'initialisation
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingStructureReview({ departments, positions, onOpenCollaborators, onUnlockEmployees, onClose }: { departments: HrDepartment[]; positions: HrPosition[]; onOpenCollaborators: () => void; onUnlockEmployees?: () => Promise<void>; onClose?: () => void }) {
  const activeDepartments = departments.filter((d) => !isArchived(d));
  const activePositions = positions.filter((p) => !isArchived(p));
  const [unlocking, setUnlocking] = useState(false);
  return (
    <div className="hr-catalog">
      <p className="muted" style={{ marginBottom: 12 }}>Vérifiez la structure créée avant de débloquer l’accès aux collaborateurs.</p>
      <div className="hr-review-grid">
        <div className="card-modern" style={{ padding: 16 }}>
          <span className="card-title"><Building2 size={16} /> Services créés ({activeDepartments.length})</span>
          <div className="hr-position-tags">{activeDepartments.map((d) => <span key={d.id} className="badge badge-reception">{d.name}</span>)}</div>
        </div>
        <div className="card-modern" style={{ padding: 16 }}>
          <span className="card-title"><BriefcaseBusiness size={16} /> Postes créés ({activePositions.length})</span>
          <div className="hr-position-tags">{activePositions.map((p) => <span key={p.id} className="badge">{p.name}</span>)}</div>
        </div>
      </div>
      <div className="hr-catalog-actions sticky" style={{ justifyContent: 'center', gap: '0.75rem' }}>
        {onClose ? <button className="btn btn-secondary" onClick={onClose}>Replier</button> : null}
        {onUnlockEmployees ? (
          <button className="btn btn-primary" disabled={unlocking} onClick={async () => { setUnlocking(true); try { await onUnlockEmployees(); } finally { setUnlocking(false); } }}>
            {unlocking ? 'Validation…' : 'Valider la structure RH'}
          </button>
        ) : null}
      </div>
    </div>
  );
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
  const total = visible.length;
  const withManager = visible.filter((e) => e.managerId || e.manager?.id).length;
  return <div className="card-modern"><div className="section-header-modern"><div className="section-info"><span className="card-title"><GitBranch size={18} /> Organigramme</span><span className="section-tagline">Visualisez les rattachements responsable → collaborateur et repérez les personnes sans responsable.</span></div><select value={departmentFilter} onChange={(event) => onDepartmentFilter(event.target.value)}><option value="">Tous services</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>{roots.length === 0 ? <EmptyState title="Aucun lien hiérarchique" description="Renseignez un responsable dans la fiche collaborateur pour construire l’organigramme." /> : <div className="org-pyramid">{roots.map((root) => <OrgNode key={root.id} collaborator={root} byManager={byManager} depth={0} />)}</div>}<div className="hr-note"><strong>{total}</strong> collaborateur{total > 1 ? 's' : ''} affiché{total > 1 ? 's' : ''} · <strong>{withManager}</strong> avec responsable · <strong>{roots.length}</strong> au premier niveau</div></div>;
}

function OrgNode({ collaborator, byManager, depth }: { collaborator: HrCollaborator; byManager: Map<string, HrCollaborator[]>; depth: number }) {
  const children = (byManager.get(collaborator.id) ?? []).filter((child) => child.id !== collaborator.id);
  const isRoot = depth === 0;
  return (
    <div className={`org-node ${isRoot ? 'org-root' : ''}`}>
      <div className="org-branch">
        <div className="org-card">
          <AvatarInitial collaborator={collaborator} />
          <div>
            <strong>{fullName(collaborator)}</strong>
            <span>{collaborator.position?.name ?? 'Poste non renseigné'} · {collaborator.department?.name ?? 'Service non renseigné'}</span>
          </div>
        </div>
      </div>
      {children.length > 0 ? (
        <div className="org-children">
          {children.map((child) => <OrgNode key={child.id} collaborator={child} byManager={byManager} depth={depth + 1} />)}
        </div>
      ) : null}
    </div>
  );
}

function PositionsPage({ positions, departments, canWrite, onCreate, onEdit, onArchive }: { positions: HrPosition[]; departments: HrDepartment[]; canWrite: boolean; onCreate: () => void; onEdit: (item: HrPosition) => void; onArchive: (id: string) => void }) {
  const [activeDeptId, setActiveDeptId] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const activePositions = positions.filter((p) => !isArchived(p));
  const activeDepartments = departments.filter((d) => !isArchived(d));

  const positionsByDept = useMemo(() => {
    const map = new Map<string, HrPosition[]>();
    map.set('all', activePositions);
    activeDepartments.forEach((dept) => {
      const catalog = HR_CATALOG.find((c) => c.name.toLowerCase() === dept.name.toLowerCase());
      const catalogPositions = new Set((catalog?.positions ?? []).map((p) => p.toLowerCase()));
      const matched = activePositions.filter((p) => p.departmentId === dept.id || p.department?.id === dept.id || (!p.departmentId && catalogPositions.has(p.name.toLowerCase())));
      if (matched.length) map.set(dept.id, matched);
    });
    return map;
  }, [activePositions, activeDepartments]);

  const deptOptions = ['all', ...activeDepartments.filter((d) => (positionsByDept.get(d.id)?.length ?? 0) > 0).map((d) => d.id)];
  const visiblePositions = (positionsByDept.get(activeDeptId) ?? activePositions).filter((p) => (showArchived || !isArchived(p)) && p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="card-modern">
      <div className="section-header-modern">
        <div className="section-info">
          <span className="card-title"><BriefcaseBusiness size={18} /> Postes</span>
          <span className="section-tagline">Les postes sont organisés par service. Sélectionnez un service pour filtrer.</span>
        </div>
        {canWrite ? <button className="btn btn-primary" onClick={onCreate}><Plus size={16} /> Ajouter</button> : null}
      </div>
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="search-input-wrapper"><Search /><input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un poste…" /></div>
        <div className="hr-position-tabs" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {deptOptions.map((id) => (
            <button key={id} type="button" className={`btn ${activeDeptId === id ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }} onClick={() => setActiveDeptId(id)}>
              {id === 'all' ? 'Tous' : activeDepartments.find((d) => d.id === id)?.name}
            </button>
          ))}
        </div>
        <label className="toggle-inline"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archives</label>
      </div>
      {visiblePositions.length === 0 ? (
        <EmptyState title="Aucun poste" description="Les postes apparaissent ici une fois créés dans le catalogue ou manuellement." action={canWrite ? <button className="btn btn-primary" onClick={onCreate}>Créer</button> : undefined} />
      ) : (
        <div className="apps-grid compact-grid">
          {visiblePositions.map((item) => (
            <motion.div key={item.id} className="app-card compact-card" whileHover={{ y: -3 }}>
              <div className="app-card-icon"><BriefcaseBusiness size={18} /></div>
              <h3>{item.name}</h3>
              <p>{jobDescriptionSummary(item.description) || 'Fiche de poste RH'}</p>
              {isArchived(item) ? <span className="badge">Archivé</span> : null}
              {canWrite ? (
                <div className="row-actions">
                  <button className="btn btn-secondary" onClick={() => onEdit(item)}><Edit3 size={14} /> Modifier</button>
                  <button className="btn btn-secondary" onClick={() => printJobDescriptionPdf({ name: item.name, departmentName: item.department?.name ?? activeDepartments.find((department) => department.id === item.departmentId)?.name, description: item.description || buildJobDescription(item.name, item.department?.name ?? activeDepartments.find((department) => department.id === item.departmentId)?.name) })}><Printer size={14} /> PDF</button>
                  <button className="btn btn-secondary" onClick={() => onArchive(item.id)}><Archive size={14} /> Archiver</button>
                </div>
              ) : null}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
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

function DepartmentSetupModal({ departments, positions, onClose, onCreateDepartmentsBulk, onCreatePositionsBulk }: { departments: HrDepartment[]; positions: HrPosition[]; onClose: () => void; onCreateDepartmentsBulk: (names: string[]) => Promise<void>; onCreatePositionsBulk: (items: HrReferencePayload[]) => Promise<void> }) {
  const [step, setStep] = useState<'services' | 'positions'>('services');
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const selectedDepartments = useMemo(() => {
    const selected = new Set(selectedNames.map((name) => normalizeLabel(name)));
    return departments.filter((department) => !isArchived(department) && selected.has(normalizeLabel(department.name)));
  }, [departments, selectedNames]);
  const initialPositionSelection = useMemo(() => {
    const selection: Record<string, Set<string>> = {};
    selectedDepartments.forEach((department) => {
      const names = positions
        .filter((position) => !isArchived(position) && (position.departmentId === department.id || position.department?.id === department.id))
        .map((position) => position.name);
      if (names.length) selection[department.id] = new Set(names);
    });
    return selection;
  }, [positions, selectedDepartments]);
  return (
    <div className="modal-overlay hr-wizard-overlay">
      <motion.div
        className="modal-card hr-wizard-modal"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 24, stiffness: 220 }}
      >
        <div className="modal-header hr-wizard-header">
          <div>
            <span className="welcome-tag">Assistant RH</span>
            <h2>{step === 'services' ? 'Ajouter un service' : 'Ajouter les postes associés'}</h2>
            <p>{step === 'services' ? '1 / 2' : '2 / 2'}</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        {step === 'services' ? (
          <ServiceCatalogGrid
            onBack={onClose}
            onSubmit={async (names) => {
              setSelectedNames(names);
              await onCreateDepartmentsBulk(names);
              setStep('positions');
            }}
          />
        ) : selectedDepartments.length ? (
          <PositionCatalogSelector
            departments={selectedDepartments}
            initialSelection={initialPositionSelection}
            onBack={() => setStep('services')}
            onSubmit={async (items) => {
              await onCreatePositionsBulk(items);
              onClose();
            }}
          />
        ) : (
          <div className="hr-catalog">
            <EmptyState title="Préparation des services" description="Les services sélectionnés sont en cours de chargement avant la sélection des postes." />
            <div className="hr-catalog-actions sticky">
              <span className="muted">{selectedNames.length} service{selectedNames.length > 1 ? 's' : ''} sélectionné{selectedNames.length > 1 ? 's' : ''}</span>
              <button type="button" className="btn btn-secondary" onClick={() => setStep('services')}>Retour</button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ReferenceModal({
  title,
  item,
  type,
  departments = [],
  onClose,
  onSubmit,
}: {
  title: string;
  item?: HrDepartment | HrPosition;
  type: 'department' | 'position';
  departments?: HrDepartment[];
  onClose: () => void;
  onSubmit: (payload: HrReferencePayload) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [departmentId, setDepartmentId] = useState((item as HrPosition)?.departmentId ?? (item as HrPosition)?.department?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const selectedDepartmentName = departments.find((department) => department.id === departmentId)?.name;
  const generatedDescription = type === 'position' && name.trim() ? buildJobDescription(name.trim(), selectedDepartmentName) : '';
  const completeDescription = () => {
    if (generatedDescription) setDescription(generatedDescription);
  };

  return (
    <div className="modal-overlay">
      <motion.form
        className="modal-card hr-modal"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          try {
            await onSubmit({ name, description: description || generatedDescription || undefined, departmentId: type === 'position' ? departmentId || null : undefined });
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
            <input placeholder="Nom *" value={name} onChange={(event) => {
              const nextName = event.target.value;
              setName(nextName);
              if (type === 'position' && !description.trim() && nextName.trim()) setDescription(buildJobDescription(nextName.trim(), selectedDepartmentName));
            }} required />
            {type === 'position' ? (
              <label>
                Service rattaché
                <select value={departmentId} onChange={(event) => {
                  const nextDepartmentId = event.target.value;
                  const nextDepartmentName = departments.find((department) => department.id === nextDepartmentId)?.name;
                  setDepartmentId(nextDepartmentId);
                  if (!description.trim() && name.trim()) setDescription(buildJobDescription(name.trim(), nextDepartmentName));
                }} required>
                  <option value="">—</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </label>
            ) : null}
            {type === 'position' ? (
              <div className="hr-job-description-actions">
                <button type="button" className="btn btn-secondary" disabled={!generatedDescription} onClick={completeDescription}>Completer automatiquement</button>
                <button type="button" className="btn btn-secondary" disabled={!name.trim()} onClick={() => printJobDescriptionPdf({ name, departmentName: selectedDepartmentName, description: description || generatedDescription })}><Printer size={14} /> Telecharger PDF</button>
              </div>
            ) : null}
            <textarea className={type === 'position' ? 'hr-job-description-textarea' : undefined} placeholder={type === 'position' ? 'Fiche de poste complete...' : 'Description'} value={description} onChange={(event) => setDescription(event.target.value)} />
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

function CollaboratorSheet({ collaborator, rotations, canWrite, onClose, onEdit, onSetRotation, onRemoveRotation, onSaveNotes, onViewDocument, onReplaceDocument, onDeleteDocument, onDownloadDocument }: { collaborator: HrCollaborator; rotations: HrRotation[]; canWrite: boolean; onClose: () => void; onEdit: () => void; onSetRotation: (employeeId: string, rotationId: string, startDate?: string) => Promise<void>; onRemoveRotation: (employeeId: string) => Promise<void>; onSaveNotes: (notes: string) => Promise<void>; onViewDocument: (employeeId: string, document: HrDocument) => Promise<void>; onReplaceDocument: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDeleteDocument: (employeeId: string, documentId: string) => Promise<void>; onDownloadDocument: (employeeId: string, document: HrDocument) => Promise<void> }) {
  const [rotationId, setRotationId] = useState('');
  const [detailSection, setDetailSection] = useState<'contracts' | 'trainings' | 'documents' | 'leaves' | 'planning'>('contracts');
  const initialNotes = cleanLegacyHrNotes(collaborator.notes);
  const [notesDraft, setNotesDraft] = useState(initialNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  useEffect(() => setNotesDraft(cleanLegacyHrNotes(collaborator.notes)), [collaborator.id, collaborator.notes]);
  const currentRotation = activeRotation(collaborator);
  const compatibleRotations = rotations.filter((rotation) => !isArchived(rotation) && (!rotationDepartment(rotation)?.id || rotationDepartment(rotation)?.id === (collaborator.departmentId ?? collaborator.department?.id)));
  const primaryContract = collaborator.activeContract ?? collaborator.contracts?.find((contract) => contract.status === 'ACTIVE') ?? collaborator.contracts?.[0];
  const contractType = primaryContract?.contractType ?? collaborator.contractType;
  const contractWeeklyMinutes = primaryContract?.weeklyHours ?? collaborator.contractWeeklyMinutes;
  const contractEndDate = primaryContract?.endDate ?? collaborator.contractEndDate;
  const trialEndDate = primaryContract?.trialEndDate ?? collaborator.trialEndDate;
  const contractDocuments = (collaborator.documents ?? []).filter((document) => document.category === 'CONTRACT' || document.category === 'AMENDMENT');
  const hasContract = Boolean(contractType || contractDocuments.length);
  const hasDocuments = Boolean(collaborator.documents?.length);
  const hasTrainings = false;
  const hourlyRate = collaborator.currentCompensation?.hourlyRate ?? collaborator.hourlyRate ?? null;
  const compensationCurrency = collaborator.currentCompensation?.currency ?? collaborator.currency ?? 'EUR';
  const contractWeeklyHours = contractWeeklyMinutes != null ? contractWeeklyMinutes / 60 : null;
  const weeklyGross = hourlyRate != null && contractWeeklyHours != null ? hourlyRate * contractWeeklyHours : null;
  const closeSheet = async () => {
    const nextNotes = notesDraft.trim();
    if (nextNotes !== cleanLegacyHrNotes(collaborator.notes).trim()) {
      setSavingNotes(true);
      try {
        await onSaveNotes(nextNotes);
      } catch (error) {
        alert(error instanceof Error ? error.message : "Impossible d'enregistrer la note.");
        return;
      } finally {
        setSavingNotes(false);
      }
    }
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={() => void closeSheet()}>
      <motion.div
        className="modal-card hr-sheet"
        onClick={(event) => event.stopPropagation()}
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
              <p>
                {collaborator.position?.name ?? 'Poste non renseigné'}
                {' · '}
                {collaborator.department?.name ?? 'Service non renseigné'}
                {collaborator.mainSite?.name || collaborator.site?.name ? ` · ${collaborator.mainSite?.name ?? collaborator.site?.name}` : null}
              </p>
              <div className="hr-profile-badges">
                <StatusBadge status={collaborator.status} />
                {collaborator.user || collaborator.userId ? <span className="badge badge-reception">Compte ToqueHub</span> : null}
                {hasContract ? <span className="badge badge-reception">Contrat {contractType}</span> : null}
              </div>
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
            <button type="button" className="modal-close-btn" onClick={() => void closeSheet()} aria-label="Fermer">
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
              [<BriefcaseBusiness size={14} />, `Poste principal : ${collaborator.position?.name ?? 'Non renseigné'}`],
              ...(collaborator.secondaryPositions?.length ? [[<BriefcaseBusiness size={14} />, <div className="hr-position-badges">{collaborator.secondaryPositions.map((p) => <span key={p.id} className="badge badge-reception">{p.name}</span>)}</div>] as [React.ReactNode, React.ReactNode]] : []),
              [<Building2 size={14} />, `Service : ${collaborator.department?.name ?? 'Non renseigné'}`],
              [<MapPin size={14} />, `Établissement : ${collaborator.mainSite?.name ?? collaborator.site?.name ?? 'Non renseigné'}`],
              [<CalendarDays size={14} />, `Date d’embauche : ${formatDate(collaborator.hireDate)}`],
              [<UserRound size={14} />, collaborator.manager ? `Responsable : ${fullName(collaborator.manager)}` : 'Responsable : Non renseigné'],
              [<NotebookText size={14} />, `Matricule : ${collaborator.employeeNumber || 'Non renseigné'}`],
              [<ShieldCheck size={14} />, `Contrat : ${contractType || 'Non renseigné'}`],
              [<Clock size={14} />, contractWeeklyMinutes != null ? `Durée contractuelle : ${formatMinutes(contractWeeklyMinutes)}` : 'Durée contractuelle : Non renseignée'],
              [<CalendarDays size={14} />, contractEndDate ? `Fin de contrat : ${formatDate(contractEndDate)}` : 'Fin de contrat : —'],
              [<CalendarDays size={14} />, trialEndDate ? `Fin période d'essai : ${formatDate(trialEndDate)}` : 'Fin période d\'essai : —'],
            ] as [React.ReactNode, React.ReactNode][]}
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
              [<BriefcaseBusiness size={14} />, `Poste principal : ${collaborator.position?.name ?? '—'}`],
              ...(collaborator.secondaryPositions?.length ? [[<BriefcaseBusiness size={14} />, <div className="hr-position-badges">{collaborator.secondaryPositions.map((p) => <span key={p.id} className="badge badge-reception">{p.name}</span>)}</div>] as [React.ReactNode, React.ReactNode]] : []),
              [<MapPin size={14} />, `Établissement : ${collaborator.mainSite?.name ?? collaborator.site?.name ?? '—'}`],
              [<RotateCw size={14} />, `Roulement : ${currentRotation?.name ?? 'Aucun roulement actif'}`],
              [<Clock size={14} />, currentRotation ? `Durée hebdo roulement : ${formatMinutes(rotationMetrics(currentRotation).averageWeeklyMinutes)}` : 'Durée hebdo roulement : —'],
              [<Clock size={14} />, contractWeeklyMinutes != null ? `Durée hebdo contrat : ${formatMinutes(contractWeeklyMinutes)}` : 'Durée hebdo contrat : —'],
              ...(currentRotation && contractWeeklyMinutes != null ? [[<Clock size={14} />, `Écart contrat / roulement : ${formatMinutes(Math.abs((contractWeeklyMinutes ?? 0) - (rotationMetrics(currentRotation).averageWeeklyMinutes ?? 0)))}`] as [React.ReactNode, React.ReactNode]] : []),
              [<CalendarDays size={14} />, currentRotation ? `${rotationMetrics(currentRotation).workedDays} jours travaillés / ${rotationMetrics(currentRotation).restDays} repos` : 'Jours travaillés / repos : —'],
              [<Building2 size={14} />, `Service du roulement : ${currentRotation ? rotationDepartment(currentRotation)?.name ?? 'Tous services' : '—'}`],
            ] as [React.ReactNode, React.ReactNode][]}
          />
          <InfoBlock
            title="Rémunération"
            rows={[
              [<ShieldCheck size={14} />, hourlyRate != null ? 'Taux horaire : ' + hourlyRate.toFixed(2) + ' ' + compensationCurrency : 'Taux horaire : Non renseigne'],
              ...(weeklyGross != null ? [
                [<CalendarDays size={14} />, 'Hebdomadaire brut : ' + weeklyGross.toFixed(2) + ' ' + compensationCurrency] as [React.ReactNode, React.ReactNode],
                [<CalendarDays size={14} />, 'Mensuel brut estime : ' + ((weeklyGross * 52) / 12).toFixed(2) + ' ' + compensationCurrency] as [React.ReactNode, React.ReactNode],
                [<CalendarDays size={14} />, 'Annuel brut estime : ' + (weeklyGross * 52).toFixed(2) + ' ' + compensationCurrency] as [React.ReactNode, React.ReactNode],
              ] : []),
              [<CalendarDays size={14} />, collaborator.currentCompensation?.effectiveFrom ? `Dernière revalorisation : ${formatDate(collaborator.currentCompensation.effectiveFrom)}` : collaborator.rateEffectiveDate ? `Dernière revalorisation : ${formatDate(collaborator.rateEffectiveDate)}` : 'Dernière revalorisation : —'],
              [<CalendarDays size={14} />, collaborator.nextSalaryReview?.dueDate ? `Prochaine revalorisation : ${formatDate(collaborator.nextSalaryReview.dueDate)}` : collaborator.nextReviewDate ? `Prochaine revalorisation : ${formatDate(collaborator.nextReviewDate)}` : 'Prochaine revalorisation : —'],
            ] as [React.ReactNode, React.ReactNode][]}
          />
          <div className="hr-info-block hr-notes-editor">
            <h3>Notes</h3>
            <textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Ajouter une note RH visible sur cette fiche..." />
            <small>{savingNotes ? 'Sauvegarde en cours...' : notesDraft.trim() !== cleanLegacyHrNotes(collaborator.notes).trim() ? 'La note sera sauvegardee a la fermeture.' : 'Sauvegarde'}</small>
          </div>
        </div>
        <div className="card-modern" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          <div className="section-header-modern"><span className="card-title"><RotateCw size={18} /> Organisation de travail</span>{currentRotation ? <span className="badge badge-reception">1 roulement actif</span> : <span className="badge">Aucun</span>}</div>
          {canWrite ? <div className="inline-assign"><select value={rotationId} onChange={(e) => setRotationId(e.target.value)}><option value="">Sélectionner un roulement compatible</option>{compatibleRotations.map((rotation) => <option key={rotation.id} value={rotation.id}>{rotation.name} · {rotationDepartment(rotation)?.name ?? 'Tous services'}</option>)}</select><button className="btn btn-primary" disabled={!rotationId} onClick={async () => { await onSetRotation(collaborator.id, rotationId); setRotationId(''); }}>Modifier le roulement</button>{currentRotation ? <button className="btn btn-secondary" onClick={() => onRemoveRotation(collaborator.id)}>Retirer le roulement</button> : null}</div> : null}
        </div>
        <div className="card-modern" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          <span className="card-title">Historique</span>
          <HistoryList history={collaborator.history ?? []} />
        </div>
        <div className="hr-future-cards">
          {[
            { id: 'contracts' as const, label: 'Contrats', icon: <ShieldCheck size={18} />, status: hasContract ? 'ok' : 'critical', hint: hasContract ? `Contrat ${contractType ?? 'PDF'}` : 'Contrat manquant' },
            { id: 'trainings' as const, label: 'Formations', icon: <Sparkles size={18} />, status: hasTrainings ? 'ok' : 'pending', hint: hasTrainings ? 'À jour' : 'À paramétrer' },
            { id: 'documents' as const, label: 'Documents', icon: <NotebookText size={18} />, status: hasDocuments ? 'ok' : 'missing', hint: hasDocuments ? `${collaborator.documents?.length} document${(collaborator.documents?.length ?? 0) > 1 ? 's' : ''}` : 'Aucun document' },
            { id: 'leaves' as const, label: 'Congés', icon: <CalendarDays size={18} />, status: 'pending', hint: 'À venir' },
            { id: 'planning' as const, label: 'Planning', icon: <Clock size={18} />, status: currentRotation ? 'ok' : 'missing', hint: currentRotation ? `Roulement : ${currentRotation.name}` : 'Non assigné' },
          ].map((item) => (
            <button key={item.label} type="button" className={`hr-future-card ${detailSection === item.id ? 'active' : ''} ${item.status}`} onClick={() => setDetailSection(item.id)}>
              <div className="hr-future-icon">{item.icon}</div>
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>
        <CollaboratorDetailPanel collaborator={collaborator} section={detailSection} currentRotation={currentRotation} primaryContract={primaryContract} contractType={contractType} contractWeeklyMinutes={contractWeeklyMinutes} contractEndDate={contractEndDate} trialEndDate={trialEndDate} canWrite={false} onViewDocument={onViewDocument} onReplaceDocument={onReplaceDocument} onDeleteDocument={onDeleteDocument} onDownloadDocument={onDownloadDocument} />
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
function DocumentList({ employeeId, documents, canWrite, onView, onReplace, onDelete, onDownload }: { employeeId: string; documents: HrDocument[]; canWrite: boolean; onView: (employeeId: string, document: HrDocument) => Promise<void>; onReplace: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDelete: (employeeId: string, documentId: string) => Promise<void>; onDownload: (employeeId: string, document: HrDocument) => Promise<void> }) {
  return (
    <div className="hr-document-list">
      {documents.map((document) => (
        <div key={document.id} className="hr-document-row">
          <div>
            <strong>{document.originalName}</strong>
            <span>{documentCategoryLabel(document.category)} · {formatBytes(document.sizeBytes)} · {document.expiresAt ? 'Echeance ' + formatDate(document.expiresAt) : 'Sans echeance'}</span>
          </div>
          <div className="row-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onView(employeeId, document)}>Voir</button>
            <button type="button" className="btn btn-secondary" onClick={() => onDownload(employeeId, document)}>Telecharger</button>
            {canWrite ? <label className="btn btn-secondary hr-file-action">Remplacer<input type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onReplace(employeeId, document.id, file); event.currentTarget.value = ''; }} /></label> : null}
            {canWrite ? <button type="button" className="icon-btn danger" onClick={() => onDelete(employeeId, document.id)} title="Supprimer"><Archive size={16} /></button> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
function CollaboratorDetailPanel({ collaborator, section, currentRotation, primaryContract, contractType, contractWeeklyMinutes, contractEndDate, trialEndDate, canWrite, onViewDocument, onReplaceDocument, onDeleteDocument, onDownloadDocument }: { collaborator: HrCollaborator; section: 'contracts' | 'trainings' | 'documents' | 'leaves' | 'planning'; currentRotation?: HrRotation | null; primaryContract?: any; contractType?: string | null; contractWeeklyMinutes?: number | null; contractEndDate?: string | null; trialEndDate?: string | null; canWrite: boolean; onViewDocument: (employeeId: string, document: HrDocument) => Promise<void>; onReplaceDocument: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDeleteDocument: (employeeId: string, documentId: string) => Promise<void>; onDownloadDocument: (employeeId: string, document: HrDocument) => Promise<void> }) {
  const title = section === 'contracts' ? 'Contrat de travail' : section === 'trainings' ? 'Formations' : section === 'documents' ? 'Documents justificatifs' : section === 'leaves' ? 'Conges' : 'Planning';
  const contractDocuments = (collaborator.documents ?? []).filter((document) => document.category === 'CONTRACT' || document.category === 'AMENDMENT');
  const trainingDocuments = (collaborator.documents ?? []).filter((document) => document.category === 'CERTIFICATION' || document.category === 'DIPLOMA');
  const visibleDocuments = section === 'contracts' ? contractDocuments : section === 'trainings' ? trainingDocuments : collaborator.documents ?? [];
  return (
    <div className="card-modern hr-detail-panel">
      <div className="section-header-modern">
        <span className="card-title">{title}</span>
        {section === 'contracts' && (contractType || contractDocuments.length) ? <span className="badge badge-reception">Complet</span> : null}
        {section === 'documents' && collaborator.documents?.length ? <span className="badge badge-reception">{collaborator.documents.length} document{collaborator.documents.length > 1 ? 's' : ''}</span> : null}
        {section === 'planning' && currentRotation ? <span className="badge badge-reception">Assigne</span> : null}
      </div>
      {section === 'contracts' ? (
        contractType || contractDocuments.length ? (
          <div className="hr-detail-grid">
            {contractType ? <InfoBlock title="Contrat actif" rows={[
              [<ShieldCheck size={14} />, 'Type : ' + contractType],
              [<CalendarDays size={14} />, 'Debut : ' + formatDate(primaryContract?.startDate ?? collaborator.hireDate)],
              [<CalendarDays size={14} />, 'Fin : ' + (contractEndDate ? formatDate(contractEndDate) : 'Non prevue')],
              [<CalendarDays size={14} />, "Fin periode d'essai : " + (trialEndDate ? formatDate(trialEndDate) : 'Non renseignee')],
              [<Clock size={14} />, 'Duree hebdo : ' + (contractWeeklyMinutes != null ? formatMinutes(contractWeeklyMinutes) : 'Non renseignee')],
            ]} /> : null}
            {contractDocuments.length ? <DocumentList employeeId={collaborator.id} documents={contractDocuments} canWrite={canWrite} onView={onViewDocument} onReplace={onReplaceDocument} onDelete={onDeleteDocument} onDownload={onDownloadDocument} /> : null}
            {collaborator.contracts?.length ? <InfoBlock title="Historique" rows={collaborator.contracts.map((contract) => [<ShieldCheck size={14} />, contract.contractType + ' · ' + (contract.status ?? 'ACTIVE') + ' · ' + formatDate(contract.startDate) + (contract.endDate ? ' -> ' + formatDate(contract.endDate) : '')] as [React.ReactNode, React.ReactNode])} /> : null}
          </div>
        ) : <EmptyState title="Contrat manquant" description="Ajoutez un type de contrat ou joignez le contrat de travail PDF dans la fiche collaborateur." />
      ) : null}
      {section === 'trainings' ? (
        trainingDocuments.length ? <DocumentList employeeId={collaborator.id} documents={trainingDocuments} canWrite={canWrite} onView={onViewDocument} onReplace={onReplaceDocument} onDelete={onDeleteDocument} onDownload={onDownloadDocument} /> : <EmptyState title="Formations a parametrer" description="Les documents de formation classes en certification ou diplome apparaitront ici. Les formations obligatoires seront reliees plus tard." />
      ) : null}
      {section === 'documents' ? (
        visibleDocuments.length ? <DocumentList employeeId={collaborator.id} documents={visibleDocuments} canWrite={canWrite} onView={onViewDocument} onReplace={onReplaceDocument} onDelete={onDeleteDocument} onDownload={onDownloadDocument} /> : <EmptyState title="Aucun document" description="Les justificatifs PDF du collaborateur apparaitront ici apres enregistrement dans la fiche collaborateur." />
      ) : null}
      {section === 'leaves' ? <EmptyState title="Conges a venir" description="La liaison avec les absences et conges sera traitee dans une prochaine etape." /> : null}
      {section === 'planning' ? (
        currentRotation ? <InfoBlock title="Roulement actif" rows={[
          [<RotateCw size={14} />, currentRotation.name],
          [<Building2 size={14} />, rotationDepartment(currentRotation)?.name ?? 'Tous services'],
          [<Clock size={14} />, 'Duree hebdo : ' + formatMinutes(rotationMetrics(currentRotation).averageWeeklyMinutes)],
          [<CalendarDays size={14} />, rotationMetrics(currentRotation).workedDays + ' jours travailles / ' + rotationMetrics(currentRotation).restDays + ' repos'],
        ]} /> : <EmptyState title="Planning non assigne" description="Assignez un roulement pour afficher l'organisation de travail du collaborateur." />
      ) : null}
    </div>
  );
}
function fullName(item: { firstName?: string | null; lastName?: string | null }) { return `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim() || 'Collaborateur'; }
function displayUser(user: Pick<CoreUser, 'firstName' | 'lastName' | 'email'>) { return `${`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email} · ${user.email}`; }
function isArchived(item: { isArchived?: boolean; archivedAt?: string | null }) { return Boolean(item.isArchived || item.archivedAt); }
function normalizeLabel(value?: string | null) { return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function hasContractCoverage(collaborator: HrCollaborator) {
  return Boolean(collaborator.activeContract?.contractType || collaborator.contractType || (collaborator.documents ?? []).some((document) => document.category === 'CONTRACT' || document.category === 'AMENDMENT'));
}
function jobDescriptionSummary(description?: string | null) {
  if (!description?.trim()) return '';
  const missionIndex = description.indexOf('Mission generale');
  const source = missionIndex >= 0 ? description.slice(missionIndex + 'Mission generale'.length) : description;
  return source.replace(/\s+/g, ' ').trim().slice(0, 220) + (source.trim().length > 220 ? '...' : '');
}
function buildJobDescription(positionName: string, departmentName?: string | null) {
  const catalog = HR_CATALOG.find((item) => normalizeLabel(item.name) === normalizeLabel(departmentName) || item.positions.some((position) => normalizeLabel(position) === normalizeLabel(positionName)));
  const service = departmentName || catalog?.name || 'Service RH';
  const context = catalog?.description || `Activites rattachees au service ${service}.`;
  const normalized = normalizeLabel(`${positionName} ${service}`);
  const isManager = /responsable|directeur|chef|manager|maitre|coordinateur|gouvernant general/.test(normalized);
  const isProduction = /cuisine|patisserie|boulanger|production|commis|cuisinier|plongeur|preparateur|conditionneur|econome|magasinier/.test(normalized);
  const isService = /salle|serveur|bar|barista|accueil|reception|sommelier|runner|comptoir|hote|hotesse/.test(normalized);
  const isSupport = /administratif|comptable|rh|paie|achat|stock|maintenance|securite|logistique|entretien/.test(normalized);
  const missions = isManager
    ? ['Organiser et superviser l activite quotidienne du service.', 'Animer l equipe, repartir les priorites et accompagner la montee en competence.', 'Garantir la qualite de service, le respect des procedures internes et la bonne communication avec les autres services.', 'Suivre les indicateurs utiles et alerter la direction en cas d ecart.']
    : isProduction
      ? ['Preparer et realiser les productions selon les standards de l etablissement.', 'Respecter les fiches techniques, les quantites, les delais et les consignes d hygiene.', 'Participer a la mise en place, au rangement et a l entretien du poste de travail.', 'Signaler les besoins, anomalies, ruptures ou risques operationnels au responsable.']
      : isService
        ? ['Accueillir, conseiller et servir les clients avec professionnalisme.', 'Assurer la mise en place, le suivi du service et la fluidite de l experience client.', 'Appliquer les standards de presentation, d encaissement et de communication de l etablissement.', 'Transmettre les informations utiles aux equipes operationnelles et a la hierarchie.']
        : isSupport
          ? ['Assurer le traitement rigoureux des activites administratives ou support du service.', 'Tenir a jour les informations, documents et suivis necessaires au bon fonctionnement de l etablissement.', 'Collaborer avec les services internes et respecter les procedures de controle.', 'Identifier les anomalies et proposer des actions correctives simples.']
          : ['Realiser les missions confiees dans le respect des standards de l etablissement.', 'Contribuer a la qualite de service et a la satisfaction client ou interne.', 'Appliquer les procedures, consignes de securite et regles d organisation.', 'Alerter le responsable en cas de difficulte, risque ou besoin particulier.'];
  return [
    `FICHE DE POSTE - ${positionName}`,
    '',
    `Service rattache : ${service}`,
    `Contexte du service : ${context}`,
    '',
    'Mission generale',
    `${positionName} contribue au bon fonctionnement du service ${service} en assurant les missions operationnelles, relationnelles et organisationnelles liees a son metier. Le poste s exerce dans le respect des standards ToqueHub de qualite, de tracabilite, d hygiene, de securite et de collaboration interservices.`,
    '',
    'Missions principales',
    ...missions.map((mission) => `- ${mission}`),
    '',
    'Competences attendues',
    '- Maitrise des gestes, outils et procedures propres au poste.',
    '- Sens de l organisation, ponctualite et fiabilite dans l execution.',
    '- Communication claire avec les responsables, collegues et interlocuteurs concernes.',
    '- Respect des regles d hygiene, de securite, de confidentialite et de tenue professionnelle.',
    '',
    'Responsabilites',
    '- Appliquer les consignes transmises et rendre compte de l avancement.',
    '- Maintenir un environnement de travail propre, sur et conforme aux attentes de l etablissement.',
    '- Participer a l amelioration continue du service par des retours terrain utiles.',
    '',
    'Indicateurs de suivi',
    '- Qualite du travail realise et respect des delais.',
    '- Fiabilite des informations transmises.',
    '- Satisfaction client ou satisfaction interne selon le poste.',
    '- Respect des procedures et absence d incident majeur.',
    '',
    'Evolution et polyvalence',
    'Cette fiche peut etre adaptee par l utilisateur selon l organisation, le niveau d autonomie, les responsabilites exactes, les horaires, les formations obligatoires et les specificites de l etablissement.',
  ].join('\n');
}
function printJobDescriptionPdf({ name, departmentName, description }: { name: string; departmentName?: string | null; description?: string | null }) {
  const content = description?.trim() || buildJobDescription(name, departmentName);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Fiche de poste - ${escapeHtml(name)}</title><style>@page{margin:18mm}body{font-family:Arial,sans-serif;color:#172033;line-height:1.48}h1{font-size:24px;margin:0 0 4px;color:#00a878}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 24px}.sheet{max-width:760px;margin:0 auto}.content{white-space:pre-wrap;font-size:13px;border-top:2px solid #d9f6ed;padding-top:18px}.footer{margin-top:24px;font-size:11px;color:#64748b}.print-button{float:right;padding:10px 14px;border:1px solid #d7e3ee;background:#00a878;color:white;border-radius:8px;font-weight:700;cursor:pointer}@media print{.print-button{display:none}}</style></head><body><div class="sheet"><button class="print-button" onclick="window.print()">Telecharger en PDF</button><h1>Fiche de poste</h1><h2>${escapeHtml(name)}${departmentName ? ` - ${escapeHtml(departmentName)}` : ''}</h2><div class="content">${escapeHtml(content)}</div><div class="footer">Document RH genere depuis ToqueHub. Fiche modifiable dans la description du poste.</div></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const win = window.open(url, '_blank', 'noopener,noreferrer,width=900,height=1200');
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (!win) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  }
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}
function collaboratorToPayload(collaborator: HrCollaborator, patch: Partial<HrCollaboratorPayload> = {}): HrCollaboratorPayload {
  return {
    photoUrl: collaborator.photoUrl ?? collaborator.photoDataUrl ?? undefined,
    firstName: collaborator.firstName,
    lastName: collaborator.lastName,
    email: collaborator.email ?? undefined,
    phone: collaborator.phone ?? undefined,
    address: collaborator.address ?? undefined,
    birthDate: toInputDate(collaborator.birthDate) || undefined,
    hireDate: toInputDate(collaborator.hireDate) || new Date().toISOString().slice(0, 10),
    departmentId: collaborator.departmentId ?? collaborator.department?.id ?? '',
    positionId: collaborator.positionId ?? collaborator.position?.id ?? '',
    secondaryPositionIds: collaborator.secondaryPositionIds ?? collaborator.secondaryPositions?.map((position) => position.id) ?? [],
    siteId: collaborator.mainSiteId ?? collaborator.siteId ?? collaborator.mainSite?.id ?? collaborator.site?.id ?? undefined,
    employeeNumber: collaborator.employeeNumber ?? undefined,
    notes: collaborator.notes ?? undefined,
    status: collaborator.status === 'LEFT' ? 'DEPARTED' : collaborator.status,
    userId: collaborator.userId ?? collaborator.user?.id ?? undefined,
    managerId: collaborator.managerId ?? collaborator.manager?.id ?? undefined,
    contractType: collaborator.activeContract?.contractType ?? collaborator.contractType ?? undefined,
    contractEndDate: toInputDate(collaborator.activeContract?.endDate) || toInputDate(collaborator.contractEndDate) || undefined,
    trialEndDate: toInputDate(collaborator.activeContract?.trialEndDate) || toInputDate(collaborator.trialEndDate) || undefined,
    contractWeeklyMinutes: collaborator.activeContract?.weeklyHours ?? collaborator.contractWeeklyMinutes ?? undefined,
    hourlyRate: collaborator.currentCompensation?.hourlyRate ?? collaborator.hourlyRate ?? undefined,
    currency: collaborator.currentCompensation?.currency ?? collaborator.currency ?? undefined,
    rateEffectiveDate: toInputDate(collaborator.currentCompensation?.effectiveFrom) || toInputDate(collaborator.rateEffectiveDate) || undefined,
    nextReviewDate: toInputDate(collaborator.nextSalaryReview?.dueDate) || toInputDate(collaborator.nextReviewDate) || undefined,
    reviewFrequency: collaborator.reviewFrequency ?? undefined,
    ...patch,
  };
}
function documentCategoryLabel(value?: string | null) {
  const labels: Record<string, string> = { CONTRACT: 'Contrat', AMENDMENT: 'Avenant', CERTIFICATION: 'Formation', DIPLOMA: 'Diplome', IDENTITY: 'Identite', ADMINISTRATIVE: 'Administratif', OTHER: 'Autre' };
  return labels[value ?? 'OTHER'] ?? value ?? 'Autre';
}
function formatBytes(value?: number | null) { if (!value) return '—'; if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`; return `${(value / 1024 / 1024).toFixed(1)} Mo`; }
function formatDate(value?: string | null) { if (!value) return '—'; return new Intl.DateTimeFormat('fr-FR').format(new Date(value)); }
function dateValue(value?: string | null) { return value ? new Date(value).getTime() : 0; }
function toInputDate(value?: string | null) { return value ? new Date(value).toISOString().slice(0, 10) : ''; }
function cleanLegacyHrNotes(value?: string | null) { return value && /Documents PDF a joindre|Documents PDF à joindre|Formations:/i.test(value) ? '' : value ?? ''; }


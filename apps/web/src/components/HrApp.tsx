import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Archive,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  GitBranch,
  Info,
  Mail,
  MapPin,
  NotebookText,
  ListChecks,
  Printer,
  Phone,
  Plus,
  Trash2,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  X,
  ChefHat,
  ArrowRight,
} from 'lucide-react';
import { api } from '../api/client';
import type { CoreRole, CoreUser, HrCollaborator, HrCollaboratorPayload, HrContractAnalysis, HrDepartment, HrDocument, HrHistoryEntry, HrPosition, HrPositionTaskPreset, HrReferencePayload, HrSummary, OperationalTaskCategory, RegulatoryCountryCode, Site, ToqueHubAccountCreationPayload } from '../types';
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

type HrTab = 'dashboard' | 'collaborators' | 'departments' | 'positions' | 'orgchart';

type HrAppProps = {
  tab: HrTab;
  summary?: HrSummary;
  collaborators: HrCollaborator[];
  departments: HrDepartment[];
  positions: HrPosition[];
  roles: CoreRole[];
  users: CoreUser[];
  sites: Site[];
  primarySiteId?: string | null;
  regulatoryCountryCode?: RegulatoryCountryCode | null;
  onboarding?: any;
  canWrite: boolean;
  loading?: boolean;
  onNavigate: (tab: HrTab) => void;
  onCreateCollaborator: (payload: HrCollaboratorPayload, toqueHubAccount?: ToqueHubAccountCreationPayload) => Promise<HrCollaborator | void>;
  onAnalyzeCollaboratorContract: (files: File[]) => Promise<HrContractAnalysis>;
  onUpdateCollaborator: (id: string, payload: Partial<HrCollaboratorPayload>) => Promise<HrCollaborator | void>;
  onArchiveCollaborator: (id: string) => Promise<void>;
  onUploadCollaboratorDocument: (employeeId: string, payload: { file: File; category: string; notes?: string; expiresAt?: string }) => Promise<void>;
  onDeleteCollaboratorDocument: (employeeId: string, documentId: string) => Promise<void>;
  onReplaceCollaboratorDocument: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>;
  onViewCollaboratorDocument: (employeeId: string, document: HrDocument) => Promise<void>;
  onPreviewCollaboratorDocument: (employeeId: string, document: HrDocument) => Promise<string>;
  onDownloadCollaboratorDocument: (employeeId: string, document: HrDocument) => Promise<void>;
  onCreateDepartment: (payload: HrReferencePayload) => Promise<void>;
  onCreateDepartmentsBulk: (names: string[]) => Promise<void>;
  onUpdateDepartment: (id: string, payload: HrReferencePayload) => Promise<void>;
  onArchiveDepartment: (id: string) => Promise<void>;
  onCreatePosition: (payload: HrReferencePayload) => Promise<void>;
  onCreatePositionsBulk: (items: HrReferencePayload[]) => Promise<void>;
  onUpdatePosition: (id: string, payload: HrReferencePayload) => Promise<void>;
  onArchivePosition: (id: string) => Promise<void>;
  onCompleteServices?: (names?: string[]) => Promise<void>;
  onCompletePositions?: () => Promise<void>;
  onUnlockEmployees?: () => Promise<void>;
  onExitToOverview?: () => void;
  canCreateToqueHubAccount?: boolean;
};

export function HrApp({
  tab,
  summary,
  collaborators,
  departments,
  positions,
  roles,
  users,
  sites,
  primarySiteId,
  regulatoryCountryCode,
  onboarding,
  canWrite,
  loading,
  onNavigate,
  onCreateCollaborator,
  onAnalyzeCollaboratorContract,
  onUpdateCollaborator,
  onArchiveCollaborator,
  onUploadCollaboratorDocument,
  onDeleteCollaboratorDocument,
  onReplaceCollaboratorDocument,
  onViewCollaboratorDocument,
  onPreviewCollaboratorDocument,
  onDownloadCollaboratorDocument,
  onCreateDepartment,
  onCreateDepartmentsBulk,
  onUpdateDepartment,
  onArchiveDepartment,
  onCreatePosition,
  onCreatePositionsBulk,
  onUpdatePosition,
  onArchivePosition,
  onCompleteServices,
  onCompletePositions,
  onUnlockEmployees,
  onExitToOverview,
  canCreateToqueHubAccount = false,
}: HrAppProps) {
  const [collaboratorModal, setCollaboratorModal] = useState<HrCollaborator | 'new' | null>(null);
  const [selectedCollaborator, setSelectedCollaborator] = useState<HrCollaborator | null>(null);
  const [referenceModal, setReferenceModal] = useState<{ type: 'department' | 'position'; item?: HrDepartment | HrPosition } | null>(null);
  const [departmentSetupOpen, setDepartmentSetupOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [orgDepartment, setOrgDepartment] = useState('');

  const activeDepartments = departments.filter((department) => !isArchived(department));
  const activePositions = positions.filter((position) => !isArchived(position));
  const activeSites = sites.filter((site) => !isArchived(site));
  const visibleCollaborators = useMemo(() => collaborators.filter((collaborator) => {
    if (!showArchived && isArchived(collaborator)) return false;
    const haystack = [collaborator.firstName, collaborator.lastName, collaborator.email, collaborator.department?.name, collaborator.position?.name, collaborator.mainSite?.name, collaborator.site?.name].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesStatus = !statusFilter || collaborator.status === statusFilter;
    const matchesDepartment = !departmentFilter || collaborator.departmentId === departmentFilter || collaborator.department?.id === departmentFilter;
    const matchesPosition = !positionFilter || collaborator.positionId === positionFilter || collaborator.position?.id === positionFilter;
    const matchesSite = !siteFilter || collaborator.mainSiteId === siteFilter || collaborator.siteId === siteFilter || collaborator.mainSite?.id === siteFilter || collaborator.site?.id === siteFilter;
    return matchesSearch && matchesStatus && matchesDepartment && matchesPosition && matchesSite;
  }), [collaborators, search, statusFilter, departmentFilter, positionFilter, siteFilter, showArchived]);

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
  const canAccessOrgChart = employeesUnlocked;
  const needsInitialWizard = canWrite && !employeesUnlocked;
  const canRenderWizard = canWrite && wizardOpen;

  useEffect(() => {
    if (needsInitialWizard) setWizardOpen(true);
  }, [needsInitialWizard]);

  const visibleTabs: [HrTab, string][] = [
    ['dashboard', 'Tableau de bord'],
    ['departments', 'Services'],
    ...(onboardingHasServices && onboardingHasPositions ? [['positions', 'Postes'] as [HrTab, string]] : []),
    ...(canAccessCollaborators ? [['collaborators', 'Collaborateurs'] as [HrTab, string]] : []),
    ...(canAccessOrgChart ? [['orgchart', 'Organigramme'] as [HrTab, string]] : []),
  ];

  return (
    <div className="hr-shell">
      <motion.section
        className="welcome-hero stocks-hero hr-hero"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div>
          <span className="welcome-tag"><UsersRound size={14} /> ToqueHub RH</span>
          <h1 className="welcome-title">Ressources Humaines</h1>
          <p className="welcome-desc">Pilotez vos équipes en un seul endroit : collaborateurs, services, postes et responsabilités, avec une organisation claire et toujours à jour.</p>
        </div>
        <div className="hr-hero-actions">
          {tab === 'dashboard' && canWrite ? (
            <button className="btn btn-secondary btn-outline hr-hero-guide" type="button" onClick={() => setWizardOpen(true)}>
              <Sparkles size={16} /> Guide de configuration
            </button>
          ) : null}
          {canWrite && canAccessCollaborators ? <button className="btn btn-primary" onClick={() => setCollaboratorModal('new')}><Plus size={16} /> Nouveau collaborateur</button> : null}
        </div>
      </motion.section>

      <div className="hr-tabs">
        {visibleTabs.map(([value, label]) => (
          <button key={value} className={tab === value ? 'active' : ''} onClick={() => onNavigate(value)}>{label}</button>
        ))}
      </div>

      {loading ? <div className="card-modern">Chargement du référentiel RH…</div> : null}

      {tab === 'dashboard' ? (
        <HrDashboard
          summary={summary}
          collaborators={collaborators}
          onNavigate={onNavigate}
        />
      ) : null}

      {tab === 'collaborators' ? (
        <div className="card-modern">
          <div className="section-header-modern">
            <div className="section-info">
              <span className="card-title"><UsersRound size={18} /> Collaborateurs</span>
              <span className="section-tagline">Consultez le poste, le service et le site principal de chaque collaborateur. Les archives restent accessibles.</span>
            </div>
            {canWrite ? <button className="btn btn-primary" onClick={() => setCollaboratorModal('new')}><Plus size={16} /> Ajouter</button> : null}
          </div>
          <div className="filter-bar hr-filter-grid">
            <div className="search-input-wrapper"><Search /><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, email, poste, service, site…" /></div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tous statuts</option>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="">Tous services</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
            <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}><option value="">Tous postes</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select>
            <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}><option value="">Tous les sites</option>{activeSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
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

      {tab === 'orgchart' ? (
        <OrgChart collaborators={collaborators.filter((collaborator) => !isArchived(collaborator))} departments={departments} departmentFilter={orgDepartment} onDepartmentFilter={setOrgDepartment} />
      ) : null}

      {collaboratorModal ? (
        <CollaboratorDossierModal
          collaborator={collaboratorModal === 'new' ? undefined : collaboratorModal}
          collaborators={collaborators.filter((item) => !isArchived(item))}
          departments={activeDepartments}
          positions={activePositions}
          roles={roles}
          users={selectableUsers}
          sites={sites.filter((site) => !isArchived(site))}
          primarySiteId={primarySiteId}
          regulatoryCountryCode={regulatoryCountryCode}
          canCreateToqueHubAccount={canCreateToqueHubAccount}
          onAnalyzeContract={onAnalyzeCollaboratorContract}
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
          onSubmit={async (payload, documents, options) => {
            const isCreating = collaboratorModal === 'new';
            const saved = isCreating ? await onCreateCollaborator(payload, options.toqueHubAccount) : await onUpdateCollaborator(collaboratorModal.id, payload);
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

      {selectedCollaborator ? <CollaboratorSheet collaborator={selectedCollaborator} regulatoryCountryCode={regulatoryCountryCode} onClose={() => setSelectedCollaborator(null)} onEdit={() => { setCollaboratorModal(selectedCollaborator); setSelectedCollaborator(null); }} canWrite={canWrite} onSaveNotes={async (notes) => { const updated = await onUpdateCollaborator(selectedCollaborator.id, collaboratorToPayload(selectedCollaborator, { notes })); setSelectedCollaborator((current) => current?.id === selectedCollaborator.id ? { ...(updated ?? current), notes } : current); }} onViewDocument={onViewCollaboratorDocument} onPreviewDocument={onPreviewCollaboratorDocument} onReplaceDocument={async (employeeId, documentId, file) => { const updated = await onReplaceCollaboratorDocument(employeeId, documentId, file); if (updated) setSelectedCollaborator((current) => current?.id === employeeId ? { ...current, documents: (current.documents ?? []).map((document) => document.id === documentId ? updated : document) } : current); return updated; }} onDeleteDocument={async (employeeId, documentId) => { await onDeleteCollaboratorDocument(employeeId, documentId); setSelectedCollaborator((current) => current?.id === employeeId ? { ...current, documents: (current.documents ?? []).filter((document) => document.id !== documentId) } : current); }} onDownloadDocument={onDownloadCollaboratorDocument} /> : null}

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
          regulatoryCountryCode={regulatoryCountryCode}
          onboarding={onboarding}
          onCreateCollaborator={onCreateCollaborator}
          onAnalyzeCollaboratorContract={onAnalyzeCollaboratorContract}
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
          onClose={() => {
            setWizardOpen(false);
            if (onExitToOverview) {
              onExitToOverview();
            }
          }}
        />
      ) : null}
    </div>
  );
}

function HrDashboard({
  summary,
  collaborators,
  onNavigate,
}: {
  summary?: HrSummary;
  collaborators: HrCollaborator[];
  onNavigate: (tab: HrTab) => void;
}) {
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
  const contractsEndingSoon = activeCollaborators.filter((c) => {
    const endDate = c.activeContract?.endDate || c.contractEndDate;
    return endDate && new Date(endDate).getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000 && new Date(endDate).getTime() > Date.now();
  }).length;
  const reviewsSoon = activeCollaborators.filter((c) => {
    const dueDate = c.nextSalaryReview?.dueDate || c.nextReviewDate;
    return dueDate && new Date(dueDate).getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000 && new Date(dueDate).getTime() > Date.now();
  }).length;
  const stats: Array<{ label: string; value: React.ReactNode; icon: typeof UsersRound; tone: string; target?: HrTab }> = [
    { label: 'Collaborateurs', value: summary?.counts?.collaborators ?? activeCollaborators.length, icon: UsersRound, tone: 'emerald', target: 'collaborators' },
    ...(withoutContract ? [{ label: 'Sans contrat', value: withoutContract, icon: ShieldCheck, tone: 'orange' }] : []),
    ...(withoutPosition ? [{ label: 'Sans poste principal', value: withoutPosition, icon: BriefcaseBusiness, tone: 'blue' }] : []),
    ...(contractsEndingSoon ? [{ label: 'Contrats à échéance', value: contractsEndingSoon, icon: CalendarDays, tone: 'purple' }] : []),
    ...(reviewsSoon ? [{ label: 'Revalorisations prévues', value: reviewsSoon, icon: Sparkles, tone: 'orange' }] : []),
  ];

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
    <div className="metrics-grid hr-metrics-grid">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return <HrMetric key={stat.label} icon={<Icon size={20} />} value={stat.value} label={stat.label} tone={stat.tone} delay={index + 1} onClick={stat.target ? () => onNavigate(stat.target!) : undefined} />;
      })}
    </div>
    <div className="double-panel">
      <motion.div
        className="card-modern widget-card-modern hr-dashboard-widget"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
      >
        <div className="card-title-container">
          <span className="card-title"><Sparkles size={18} /> Dernières arrivées</span>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('collaborators')}>Voir tous <ChevronRight size={16} /></button>
        </div>
        {latest.length === 0 ? <EmptyState title="Aucun collaborateur" description="Ajoutez votre premier collaborateur RH avec ou sans compte ToqueHub." /> : <div className="hr-list">{latest.map((collaborator) => <PersonRow key={collaborator.id} collaborator={collaborator} detail={formatDate(collaborator.hireDate)} />)}</div>}
      </motion.div>
      <motion.div
        className="card-modern widget-card-modern hr-dashboard-widget"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35 }}
      >
        <span className="card-title"><Building2 size={18} /> Répartition des services</span>
        {distribution.length === 0 ? <EmptyState title="Aucune répartition" description="La visualisation apparaîtra dès qu’un collaborateur sera rattaché à un service." /> : <div className="hr-bars">{distribution.map(([name, count]) => <div key={name} className="hr-bar-row"><div><strong>{name}</strong><span>{count} collaborateur{count > 1 ? 's' : ''}</span></div><div className="hr-bar"><span style={{ width: `${(count / max) * 100}%` }} /></div></div>)}</div>}
      </motion.div>
    </div>
  </>;
}

function HrMetric({ icon, value, label, tone, delay = 0, onClick }: { icon: React.ReactNode; value: React.ReactNode; label: string; tone: string; delay?: number; onClick?: () => void }) {
  return (
    <motion.div
      className={`metric-card-modern tone-${tone}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Ouvrir l’onglet ${label}` : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: delay * 0.05, ease: 'easeOut' }}
      whileHover={{ y: -5, boxShadow: '0 20px 30px rgba(9, 13, 22, 0.06)' }}
    >
      <div className="metric-header">
        <div className={`metric-icon-wrapper-modern tone-${tone}`}>
          {icon}
        </div>
        <span className="metric-badge-trend">Mise à jour</span>
      </div>
      <div className="metric-body-modern">
        <span className="metric-value-modern">{value}</span>
        <span className="metric-label-modern">{label}</span>
      </div>
      <div className="metric-shine" />
    </motion.div>
  );
}

function HrIllustration() {
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
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Structure de l'Équipe</span>
            <span className="badge badge-reception" style={{ fontSize: '0.72rem', textTransform: 'none', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', borderColor: 'transparent' }}>Actif</span>
          </div>

          {[
            { label: 'Services de cuisine & salle', val: 100, color: '#10b981' },
            { label: 'Fiches de postes définies', val: 100, color: '#3b82f6' },
            { label: 'Collaborateurs enregistrés', val: 100, color: '#f59e0b' },
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{item.label}</span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Prêt</span>
              </div>
              <div className="progress-bar-bg" style={{ height: '5px', background: 'rgba(255, 255, 255, 0.1)' }}>
                <div className="progress-bar-fill" style={{ width: `${item.val}%`, background: item.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ onStart, onClose }: { onStart: () => void; onClose?: () => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '3rem', alignItems: 'center', padding: '3.5rem 3rem', height: '100%', flexGrow: 1, position: 'relative' }}>
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
          onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          aria-label="Fermer"
        >
          <X size={20} />
        </button>
      )}
      <div>
        <span className="badge badge-reception" style={{ marginBottom: '1.25rem', display: 'inline-flex', fontSize: '0.8rem', gap: '0.35rem', border: '1px solid var(--light-border)', background: 'rgba(255,255,255,0.7)', textTransform: 'none' }}>
          <Sparkles size={14} color="#10b981" /> Configuration Guidée
        </span>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.04em', marginBottom: '1.5rem', color: 'var(--text-main)' }}>
          Bienvenue sur le module <span style={{ color: '#10b981' }}>Ressources Humaines</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.6, marginBottom: '2rem' }}>
          Ici, vous pourrez gérer vos collaborateurs, vos services et vos postes. L'assistant va d'abord construire la structure RH de votre établissement, puis vous accompagner dans la création du premier collaborateur.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', flexShrink: 0 }}><Building2 size={16} /></div>
            <span>Sélectionner les services de votre établissement</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', flexShrink: 0 }}><BriefcaseBusiness size={16} /></div>
            <span>Créer les postes de travail associés par service</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', flexShrink: 0 }}><UserRound size={16} /></div>
            <span>Ajouter votre premier collaborateur</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onStart} style={{ padding: '0.8rem 1.5rem', fontSize: '0.92rem' }}>
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
        <HrIllustration />
      </div>
    </div>
  );
}

function HrOnboardingAside({ step }: { step: 'services' | 'positions' | 'review' }) {
  const steps = [
    { key: 'welcome', label: 'Bienvenue' },
    { key: 'services', label: 'Sélection des services' },
    { key: 'positions', label: 'Création des postes' },
    { key: 'review', label: 'Premier collaborateur' },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ChefHat size={28} color="#10b981" />
          <span style={{ fontWeight: 850, fontSize: '1.2rem', color: 'white', letterSpacing: '-0.03em' }}>
            TOQUE<span style={{ color: '#10b981' }}>HUB</span> RH
          </span>
        </div>

        <div>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: '#10b981', letterSpacing: '0.15em' }}>
            Installation guidée
          </span>
          <h3 style={{ color: 'white', fontSize: '1.35rem', marginTop: '0.3rem', fontWeight: 800, lineHeight: 1.25 }}>
            Assistant RH
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
                    background: isPast ? '#10b981' : isCurrent ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
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

      <div style={{ padding: '1.25rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <ShieldCheck size={20} color="#10b981" style={{ marginBottom: '0.4rem' }} />
        <h4 style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700 }}>Données de l'établissement</h4>
        <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', lineHeight: 1.45 }}>
          Les services, postes et fiches des collaborateurs créés restent modifiables à tout moment.
        </p>
      </div>
    </div>
  );
}

function HrOnboardingWizard({
  collaborators,
  departments,
  positions,
  users,
  sites,
  regulatoryCountryCode,
  onboarding,
  onCreateCollaborator,
  onAnalyzeCollaboratorContract,
  onUploadCollaboratorDocument,
  onCreateDepartmentsBulk,
  onCreatePositionsBulk,
  onCompleteServices,
  onCompletePositions,
  onUnlockEmployees,
  onFinished,
  onClose,
}: {
  collaborators: HrCollaborator[];
  departments: HrDepartment[];
  positions: HrPosition[];
  users: CoreUser[];
  sites: Site[];
  regulatoryCountryCode?: RegulatoryCountryCode | null;
  onboarding?: any;
  onCreateCollaborator: (payload: HrCollaboratorPayload) => Promise<HrCollaborator | void>;
  onAnalyzeCollaboratorContract: (files: File[]) => Promise<HrContractAnalysis>;
  onUploadCollaboratorDocument: (employeeId: string, payload: { file: File; category: string; notes?: string; expiresAt?: string }) => Promise<void>;
  onCreateDepartmentsBulk: (names: string[]) => Promise<void>;
  onCreatePositionsBulk: (items: HrReferencePayload[]) => Promise<void>;
  onCompleteServices?: (names?: string[]) => Promise<void>;
  onCompletePositions?: () => Promise<void>;
  onUnlockEmployees?: () => Promise<void>;
  onFinished: () => void;
  onClose?: () => void;
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
  const progress = (stepIndex / 4) * 100;

  return (
    <div
      className="modal-overlay hr-wizard-overlay"
      style={{
        background: 'radial-gradient(circle at 10% 20%, rgba(16, 185, 129, 0.15) 0%, transparent 55%), radial-gradient(circle at 90% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%), rgba(15, 23, 42, 0.55)',
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
      <div style={{ position: 'absolute', width: '560px', height: '560px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.05)', filter: 'blur(100px)', right: '-180px', top: '-180px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: '420px', height: '420px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.05)', filter: 'blur(80px)', left: '-160px', bottom: '20px', pointerEvents: 'none' }} />

      <motion.div
        className="modal-card hr-wizard-modal"
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
          <WelcomeStep onStart={() => setStep('services')} onClose={onClose} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 2fr', height: '100%', width: '100%', minHeight: 0, flexGrow: 1 }}>
            {/* Sidebar */}
            <div style={{ background: '#0f172a', color: 'white', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', minHeight: 0 }}>
              <HrOnboardingAside step={step} />
            </div>

            {/* Main Content Area */}
            <div style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0, justifyContent: 'space-between' }}>
              {/* Stepper Progress bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0, position: 'relative' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column', flexGrow: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="badge badge-reception" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.15)', textTransform: 'none', fontSize: '0.8rem' }}>
                      Étape {stepIndex} / 4
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: onClose ? '2.5rem' : '0' }}>{Math.round(progress)}%</span>
                  </div>
                  <div className="progress-bar-bg" style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', marginRight: onClose ? '2.5rem' : '0' }}>
                    <div className="progress-bar-fill" style={{ width: `${progress}%`, height: '100%', background: '#10b981', borderRadius: '3px' }}></div>
                  </div>
                </div>

                {onClose && (
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
                    onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    aria-label="Fermer"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              {/* Step rendering with AnimatePresence */}
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.16 }}
                    style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
                  >
                    {step === 'services' && (
                      <ServiceCatalogGrid
                        initialNames={selectedServiceNames}
                        onBack={() => setStep('welcome')}
                        onSubmit={async (names) => {
                          setSelectedServiceNames(names);
                          sessionStorage.setItem(HR_WIZARD_SERVICES_KEY, JSON.stringify(names));
                          await onCreateDepartmentsBulk(names);
                          if (onCompleteServices) await onCompleteServices(names);
                          setStep('positions');
                        }}
                      />
                    )}
                    {step === 'positions' && (
                      <PositionCatalogSelector
                        departments={wizardDepartments}
                        initialSelection={selectedPositionsByDept}
                        onSelectionChange={setSelectedPositionsByDept}
                        onBack={() => setStep('services')}
                        onSubmit={async (items) => {
                          await onCreatePositionsBulk(items);
                          if (onCompletePositions) await onCompletePositions();
                          setStep('review');
                        }}
                      />
                    )}
                    {step === 'review' && (
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
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}
        {creatingCollaborator ? (
          <CollaboratorDossierModal
            collaborators={activeWizardCollaborators}
            departments={wizardDepartments}
            positions={wizardPositions}
            roles={[]}
            users={users}
            sites={sites.filter((site) => !isArchived(site))}
            regulatoryCountryCode={regulatoryCountryCode}
            onAnalyzeContract={onAnalyzeCollaboratorContract}
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
    <div className="hr-catalog" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="hr-catalog-scroll">
        <p className="muted" style={{ marginBottom: 16, fontSize: '0.9rem' }}>Sélectionnez les services présents dans votre établissement. Vous pourrez en ajouter d'autres plus tard.</p>
        <div className="search-input-wrapper hr-wizard-search" style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '0.25rem 0.75rem', background: '#f8fafc', marginBottom: '1.25rem' }}>
          <Search size={18} style={{ color: '#64748b' }} />
          <input className="search-input" value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} placeholder="Rechercher un service : cafe, cuisine, direction..." style={{ border: 'none', background: 'transparent', boxShadow: 'none', height: '38px', fontSize: '0.9rem' }} />
        </div>
        <div className="hr-catalog-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {visibleCatalog.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <button
                type="button"
                key={item.id}
                className={`hr-catalog-card ${isSelected ? 'selected' : ''}`}
                onClick={() => toggle(item.id)}
                style={{
                  border: isSelected ? '2px solid #10b981' : '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  background: isSelected ? 'rgba(16, 185, 129, 0.04)' : 'white',
                  boxShadow: isSelected ? '0 10px 25px rgba(16,185,129,0.06)' : '0 2px 4px rgba(0,0,0,0.02)',
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
                <div className="hr-catalog-body" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <strong style={{ fontSize: '0.95rem', color: '#1e293b', fontWeight: 700 }}>{item.name}</strong>
                  <span style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.35 }}>{item.description}</span>
                  {item.examplePositions.length ? <small style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Ex. : {item.examplePositions.join(', ')}</small> : null}
                </div>
              </button>
            );
          })}
        </div>
        <div className="hr-catalog-custom" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input placeholder="Ajouter un service personnalisé…" value={customName} onChange={(e) => setCustomName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canAddCustom) { setSelected((prev) => new Set([...prev, `custom-${customName.trim()}`])); setCustomName(''); } }} style={{ borderRadius: '10px', height: '44px', border: '1px solid #cbd5e1', padding: '0 0.75rem', flex: 1 }} />
          <button type="button" className="btn btn-secondary" disabled={!canAddCustom} onClick={() => { if (canAddCustom) { setSelected((prev) => new Set([...prev, `custom-${customName.trim()}`])); setCustomName(''); } }} style={{ height: '44px', borderRadius: '10px' }}>Ajouter</button>
        </div>
        {customSelectedNames.length ? (
          <div className="hr-catalog-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
            {customSelectedNames.map((name) => (
              <span key={name} className="badge badge-reception" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.65rem' }}>
                {name}
                <button type="button" className="icon-btn" onClick={() => toggle(`custom-${name}`)} style={{ border: 'none', background: 'transparent', display: 'inline-flex', padding: 0, cursor: 'pointer', color: '#ef4444' }}><X size={12} /></button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="hr-catalog-actions" style={{ borderTop: '1px solid #eef2f7', background: 'rgba(255,255,255,0.9)', padding: '1rem 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>{selected.size} service{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}</span>
        <div className="row-actions" style={{ display: 'flex', gap: '0.75rem' }}>
          {onBack ? <button type="button" className="btn btn-secondary" disabled={submitting} onClick={onBack} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>Retour</button> : null}
          <button className="btn btn-primary" disabled={selected.size === 0 || submitting} onClick={async () => { setSubmitting(true); try { await onSubmit(selectedNames); } finally { setSubmitting(false); } }} style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}>
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
    <div className="hr-catalog" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="hr-catalog-scroll">
        <p className="muted" style={{ marginBottom: 16, fontSize: '0.9rem' }}>Sélectionnez les postes pour chaque service. Le parcours avance service par service.</p>
        <div className="hr-position-stepper" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {activeDepartments.map((department, index) => {
            const isActive = index === currentIndex;
            const isDone = (selectedByDept[department.id]?.size ?? 0) > 0;
            return (
              <button
                key={department.id}
                type="button"
                className={isActive ? 'active' : ''}
                onClick={() => setCurrentIndex(index)}
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.85rem',
                  borderRadius: '8px',
                  border: isActive ? '1px solid #10b981' : isDone ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid #e2e8f0',
                  background: isActive ? 'rgba(16, 185, 129, 0.08)' : isDone ? 'rgba(16, 185, 129, 0.02)' : '#f8fafc',
                  color: isActive ? '#10b981' : 'var(--text-main)',
                  fontWeight: isActive ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer',
                }}
              >
                {index + 1}. {department.name}
                {isDone ? (
                  <span style={{ fontSize: '0.72rem', background: '#10b981', color: 'white', padding: '0.05rem 0.35rem', borderRadius: '10px', fontWeight: 800 }}>
                    {selectedByDept[department.id]?.size}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="hr-position-accordion-item" style={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', background: '#f8fafc', marginBottom: '1.5rem' }}>
          <div className="hr-position-accordion-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
            <div>
              <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>{currentDepartment.name}</strong>
              <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '0.5rem' }}>
                Étape {currentIndex + 1} sur {activeDepartments.length} · {currentSelected.size} poste{currentSelected.size > 1 ? 's' : ''} sélectionné{currentSelected.size > 1 ? 's' : ''}
              </span>
            </div>
            <span className="badge badge-reception" style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.08)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.15)', textTransform: 'none' }}>
              {currentSuggestions.length} suggestion{currentSuggestions.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="hr-position-accordion-body" style={{ padding: '1.25rem' }}>
            <div className="hr-catalog-grid hr-position-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {currentSuggestions.map((pos) => {
                const isSelected = currentSelected.has(pos);
                return (
                  <button
                    type="button"
                    key={pos}
                    className={`hr-catalog-card hr-position-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => togglePosition(currentDepartment.id, pos)}
                    style={{
                      border: isSelected ? '2px solid #10b981' : '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '1rem',
                      background: isSelected ? 'rgba(16, 185, 129, 0.04)' : 'white',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      textAlign: 'left',
                      cursor: 'pointer',
                      minHeight: '100px',
                      justifyContent: 'space-between',
                      boxShadow: isSelected ? '0 10px 25px rgba(16,185,129,0.04)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 700 }}>{pos}</strong>
                      <div
                        className="hr-catalog-check"
                        style={{
                          background: isSelected ? '#10b981' : '#f1f5f9',
                          color: isSelected ? 'white' : 'transparent',
                          borderRadius: '6px',
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: isSelected ? 'none' : '2px solid #cbd5e1',
                          flexShrink: 0,
                        }}
                      >
                        {isSelected ? <Check size={12} strokeWidth={3} /> : null}
                      </div>
                    </div>
                    <small style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.3 }}>
                      {buildJobDescription(pos, currentDepartment.name).split('\n').find((line) => line.trim().length > 50) ?? 'Poste rattaché au service sélectionné.'}
                    </small>
                  </button>
                );
              })}
            </div>
            <div className="hr-position-custom" style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                placeholder={`Ajouter un poste personnalisé à ${currentDepartment.name}…`}
                value={customByDept[currentDepartment.id] ?? ''}
                onChange={(e) => setCustomByDept((prev) => ({ ...prev, [currentDepartment.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') addCustom(currentDepartment.id); }}
                style={{ borderRadius: '10px', height: '40px', border: '1px solid #cbd5e1', padding: '0 0.75rem', flex: 1 }}
              />
              <button type="button" className="btn btn-secondary" onClick={() => addCustom(currentDepartment.id)} style={{ height: '40px', borderRadius: '10px' }}>Ajouter</button>
            </div>
          </div>
        </div>
      </div>
      <div className="hr-catalog-actions" style={{ borderTop: '1px solid #eef2f7', background: 'rgba(255,255,255,0.9)', padding: '1rem 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>{totalSelected} poste{totalSelected > 1 ? 's' : ''} sélectionné{totalSelected > 1 ? 's' : ''}</span>
        <div className="row-actions" style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" disabled={submitting} onClick={() => currentIndex === 0 ? onBack?.() : setCurrentIndex((index) => Math.max(index - 1, 0))} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>Retour</button>
          {!isLast ? (
            <button type="button" className="btn btn-primary" disabled={submitting} onClick={() => setCurrentIndex((index) => Math.min(index + 1, activeDepartments.length - 1))} style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}>Suivant</button>
          ) : (
            <button className="btn btn-primary" disabled={totalSelected === 0 || submitting} onClick={async () => { setSubmitting(true); try { await onSubmit(payload()); } finally { setSubmitting(false); } }} style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}>
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
  const previewLimit = 4;
  const departmentPreview = activeDepartments.slice(0, previewLimit);
  const positionPreview = activePositions.slice(0, previewLimit);
  const hiddenDepartmentCount = Math.max(0, activeDepartments.length - departmentPreview.length);
  const hiddenPositionCount = Math.max(0, activePositions.length - positionPreview.length);
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
    <div className="hr-catalog hr-onboarding-review-step">
      <div className="hr-onboarding-review-scroll">
        <p className="muted" style={{ marginBottom: 16, fontSize: '0.9rem' }}>Validez la structure choisie, puis ajoutez un ou plusieurs collaborateurs avec leur service et leur poste.</p>
        <button
          type="button"
          className="hr-wizard-hero-card hr-wizard-hero-card-action"
          disabled={unlocking || finishing}
          onClick={() => void unlockAndCreate()}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '1.25rem',
            alignItems: 'center',
            padding: '1.5rem',
            border: '1px solid rgba(16, 185, 129, 0.18)',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(59, 130, 246, 0.04) 100%)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.01)',
            marginBottom: '1.5rem',
            width: '100%',
          }}
        >
          <div
            className="hr-wizard-icon"
            style={{
              width: '56px',
              height: '56px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
              color: 'white',
              boxShadow: '0 10px 25px rgba(16, 185, 129, 0.2)',
            }}
          >
            <UserRound size={28} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <span className="welcome-tag" style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: '#10b981', letterSpacing: '0.05em' }}>Dernière étape</span>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.45 }}>{collaborators.length ? `${collaborators.length} collaborateur${collaborators.length > 1 ? 's' : ''} déjà créé${collaborators.length > 1 ? 's' : ''}. Vous pouvez en ajouter un autre ou terminer l'initialisation.` : 'Créez le premier collaborateur pour finaliser la base RH initiale.'}</p>
          </div>
        </button>
        <div className="hr-onboarding-structure-heading">
          <strong>Structure configurée</strong>
          <span>Ces listes restent consultables sans masquer l’action principale.</span>
        </div>
        <div className="hr-review-grid hr-onboarding-review-grid">
          <div className="card-modern hr-onboarding-summary-card" style={{ padding: '1.25rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}><Building2 size={16} color="#10b981" /> Services retenus ({activeDepartments.length})</span>
            <div className="hr-position-tags hr-onboarding-summary-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
              {departmentPreview.map((d) => <span key={d.id} className="badge badge-reception" style={{ padding: '0.35rem 0.6rem' }}>{d.name}</span>)}
              {hiddenDepartmentCount ? <span className="badge hr-onboarding-more-badge">+ {hiddenDepartmentCount} autre{hiddenDepartmentCount > 1 ? 's' : ''}</span> : null}
            </div>
          </div>
          <div className="card-modern hr-onboarding-summary-card" style={{ padding: '1.25rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}><BriefcaseBusiness size={16} color="#3b82f6" /> Postes créés ({activePositions.length})</span>
            <div className="hr-position-tags hr-onboarding-summary-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
              {positionPreview.map((p) => <span key={p.id} className="badge" style={{ padding: '0.35rem 0.6rem' }}>{p.name}</span>)}
              {hiddenPositionCount ? <span className="badge hr-onboarding-more-badge">+ {hiddenPositionCount} autre{hiddenPositionCount > 1 ? 's' : ''}</span> : null}
            </div>
          </div>
        </div>
        <p className="hr-onboarding-structure-note">La liste complète restera disponible dans les onglets Services et Postes après l’initialisation.</p>
      </div>
      <div className="hr-catalog-actions hr-onboarding-review-actions" style={{ borderTop: '1px solid #eef2f7', background: 'rgba(255,255,255,0.9)', padding: '1rem 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>{collaborators.length} collaborateur{collaborators.length > 1 ? 's' : ''} actif{collaborators.length > 1 ? 's' : ''}</span>
        <div className="row-actions" style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" disabled={unlocking || finishing} onClick={onBack} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}>Retour</button>
          <button type="button" className="btn btn-secondary" disabled={unlocking || finishing} onClick={unlockAndCreate} style={{ borderRadius: '10px', padding: '0.5rem 1.25rem', borderColor: '#10b981', color: '#059669', background: 'rgba(16, 185, 129, 0.02)' }}>{unlocking ? 'Validation...' : collaborators.length ? 'Ajouter un autre collaborateur' : 'Ajouter un collaborateur'}</button>
          <button type="button" className="btn btn-primary" disabled={!collaborators.length || unlocking || finishing} onClick={async () => { setFinishing(true); try { onFinished(); } finally { setFinishing(false); } }} style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}>
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
  return <div className="table-wrapper"><table className="table-modern hr-table"><thead><tr><th>Photo</th><th>Nom complet</th><th>Poste</th><th>Service</th><th>Date d’embauche</th><th>Site principal</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{collaborators.map((collaborator) => <tr key={collaborator.id}><td><AvatarInitial collaborator={collaborator} /></td><td><button className="link-button" onClick={() => onOpen(collaborator)}>{fullName(collaborator)}</button><small>{collaborator.email || 'Email non renseigné'}</small></td><td>{collaborator.position?.name ?? '—'}</td><td>{collaborator.department?.name ?? '—'}</td><td>{formatDate(collaborator.hireDate)}</td><td>{collaborator.mainSite?.name || collaborator.site?.name || '—'}</td><td><StatusBadge status={collaborator.status} /></td><td><div className="row-actions"><button className="icon-btn" onClick={() => onOpen(collaborator)} title="Fiche"><ChevronRight size={16} /></button>{canWrite ? <><button className="icon-btn" onClick={() => onEdit(collaborator)} title="Modifier"><Edit3 size={16} /></button><button className="icon-btn danger" onClick={() => onArchive(collaborator.id)} title="Archiver"><Archive size={16} /></button></> : null}</div></td></tr>)}</tbody></table></div>;
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
  const [activeTab, setActiveTab] = useState<'description' | 'tasks'>('description');
  const [taskPresets, setTaskPresets] = useState<HrPositionTaskPreset[]>(
    type === 'position' ? ((item as HrPosition)?.taskPresets ?? []) : [],
  );
  const [submitting, setSubmitting] = useState(false);
  const selectedDepartmentName = departments.find((department) => department.id === departmentId)?.name;
  const canUseTechnicalSheets = type === 'position' && positionSupportsTechnicalSheets(name, selectedDepartmentName);
  const generatedDescription = type === 'position' && name.trim() ? buildJobDescription(name.trim(), selectedDepartmentName) : '';
  const completeDescription = () => {
    if (generatedDescription) setDescription(generatedDescription);
  };

  return (
    <div className="modal-overlay">
      <motion.form
        className={`modal-card hr-modal${type === 'position' ? ' hr-position-modal' : ''}`}
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          try {
            await onSubmit({
              name,
              description: description || generatedDescription || undefined,
              departmentId: type === 'position' ? departmentId || null : undefined,
              taskPresets: type === 'position'
                ? taskPresets.map((task) => canUseTechnicalSheets
                  ? task
                  : { ...task, requiresTechnicalSheet: false, defaultDurationMinutes: task.defaultDurationMinutes ?? 30 })
                : undefined,
            });
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
        <div className={type === 'position' ? 'hr-reference-modal-body' : undefined} style={type === 'position' ? undefined : { padding: '1.75rem', overflowY: 'auto' }}>
          {type === 'position' && (
            <div className="hr-reference-tabs">
              <button type="button" onClick={() => setActiveTab('description')} style={hrReferenceTabStyle(activeTab === 'description')}>
                <NotebookText size={17} /> Fiche de poste
              </button>
              <button type="button" onClick={() => setActiveTab('tasks')} style={hrReferenceTabStyle(activeTab === 'tasks')}>
                <ListChecks size={17} /> Tâches
              </button>
            </div>
          )}
          {(type !== 'position' || activeTab === 'description') && <div className={type === 'position' ? 'hr-reference-description' : undefined}><FormSection title="Détails">
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
          </FormSection></div>}
          {type === 'position' && activeTab === 'tasks' && (
            <div className="hr-reference-tasks"><FormSection title="Tâches proposées dans Production">
              <p style={{ margin: '0 0 .3rem', color: '#64748b', lineHeight: 1.5 }}>
                Ces raccourcis seront proposés aux responsables lorsqu’ils planifient une tâche pour ce poste.
              </p>
              <div className="hr-reference-task-grid">
                {taskPresets.map((task, index) => (
                  <div key={task.id || index} className="hr-reference-task-card">
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.55rem' }}>
                      <input
                        value={task.title}
                        onChange={(event) => setTaskPresets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))}
                        placeholder="Ex. Nettoyage des toilettes"
                        required
                      />
                      <button type="button" className="btn btn-secondary" aria-label="Supprimer la tâche" onClick={() => setTaskPresets((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
                      <label>
                        Type
                        <select value={task.category} onChange={(event) => setTaskPresets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value as OperationalTaskCategory } : item))}>
                          <option value="KITCHEN">Cuisine</option><option value="SERVICE">Salle / service</option><option value="HOUSEKEEPING">Ménage</option><option value="RECEPTION">Réception</option><option value="MAINTENANCE">Maintenance</option><option value="LOGISTICS">Logistique</option><option value="MANAGEMENT">Encadrement</option><option value="OTHER">Autre</option>
                        </select>
                      </label>
                      <label>
                        Durée habituelle (min)
                        <input type="number" min="5" step="5" disabled={canUseTechnicalSheets && task.requiresTechnicalSheet} value={canUseTechnicalSheets && task.requiresTechnicalSheet ? '' : task.defaultDurationMinutes ?? 30} onChange={(event) => setTaskPresets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, defaultDurationMinutes: Number(event.target.value) || 5 } : item))} />
                      </label>
                    </div>
                    {canUseTechnicalSheets && (
                      <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '.55rem', fontWeight: 800 }}>
                          <input type="checkbox" checked={Boolean(task.requiresTechnicalSheet)} onChange={(event) => setTaskPresets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, requiresTechnicalSheet: event.target.checked, defaultDurationMinutes: event.target.checked ? null : item.defaultDurationMinutes ?? 30 } : item))} />
                          Choisir une fiche technique ou une étape
                        </label>
                        {task.requiresTechnicalSheet && <small style={{ color: '#64748b' }}>La durée sera reprise automatiquement depuis la fiche choisie.</small>}
                      </>
                    )}
                  </div>
                ))}
                {!taskPresets.length && <div style={{ padding: '1rem', borderRadius: '13px', background: '#f8fafc', color: '#64748b', textAlign: 'center' }}>Aucune tâche type. Vous pouvez en ajouter une ; les nouveaux postes reçoivent aussi des suggestions automatiquement.</div>}
                <button type="button" className="btn btn-secondary" onClick={() => setTaskPresets((current) => [...current, { id: `task-${Date.now()}`, title: '', category: defaultTaskCategory(selectedDepartmentName), defaultDurationMinutes: 30 }])}>
                  <Plus size={16} /> Ajouter une tâche type
                </button>
              </div>
            </FormSection></div>
          )}
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

function positionSupportsTechnicalSheets(positionName?: string, departmentName?: string) {
  const normalize = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const department = normalize(departmentName);
  const position = normalize(positionName);
  if (/cuisine|patisserie|boulangerie/.test(department)) return true;
  return /cuisin|chef de cuisine|sous-chef|patis|boulanger|barista|barman|barmaid|mixologue|traiteur|chocolatier|confiseur|glacier/.test(position);
}

function defaultTaskCategory(departmentName?: string): OperationalTaskCategory {
  const name = (departmentName ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/cuisine|patisserie|boulangerie/.test(name)) return 'KITCHEN';
  if (/salle|bar|cafe|evenement/.test(name)) return 'SERVICE';
  if (/hebergement|entretien|menage/.test(name)) return 'HOUSEKEEPING';
  if (/reception/.test(name)) return 'RECEPTION';
  if (/maintenance/.test(name)) return 'MAINTENANCE';
  if (/achat|stock|magasin|logistique/.test(name)) return 'LOGISTICS';
  if (/direction|administration|ressources humaines/.test(name)) return 'MANAGEMENT';
  return 'OTHER';
}

function hrReferenceTabStyle(active: boolean): React.CSSProperties {
  return {
    border: 0,
    borderRadius: '10px',
    padding: '.7rem .8rem',
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '.45rem',
    background: active ? 'white' : 'transparent',
    color: active ? '#059669' : '#64748b',
    fontWeight: 900,
    boxShadow: active ? '0 3px 10px rgba(15, 23, 42, .08)' : 'none',
    cursor: 'pointer',
  };
}

function CollaboratorSheet({ collaborator, regulatoryCountryCode, canWrite, onClose, onEdit, onSaveNotes, onViewDocument, onPreviewDocument, onReplaceDocument, onDeleteDocument, onDownloadDocument }: { collaborator: HrCollaborator; regulatoryCountryCode?: RegulatoryCountryCode | null; canWrite: boolean; onClose: () => void; onEdit: () => void; onSaveNotes: (notes: string) => Promise<void>; onViewDocument: (employeeId: string, document: HrDocument) => Promise<void>; onPreviewDocument: (employeeId: string, document: HrDocument) => Promise<string>; onReplaceDocument: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDeleteDocument: (employeeId: string, documentId: string) => Promise<void>; onDownloadDocument: (employeeId: string, document: HrDocument) => Promise<void> }) {
  const [detailSection, setDetailSection] = useState<'contracts' | 'trainings' | 'documents' | 'leaves' | 'planning'>('contracts');
  const initialNotes = cleanLegacyHrNotes(collaborator.notes);
  const [notesDraft, setNotesDraft] = useState(initialNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<HrDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const detailPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => setNotesDraft(cleanLegacyHrNotes(collaborator.notes)), [collaborator.id, collaborator.notes]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  const primaryContract = collaborator.activeContract ?? collaborator.contracts?.find((contract) => contract.status === 'ACTIVE') ?? collaborator.contracts?.[0];
  const contractType = primaryContract?.contractType ?? collaborator.contractType;
  const contractWeeklyMinutes = toFiniteNumber(primaryContract?.weeklyHours ?? collaborator.contractWeeklyMinutes);
  const contractEndDate = primaryContract?.endDate ?? collaborator.contractEndDate;
  const trialEndDate = primaryContract?.trialEndDate ?? collaborator.trialEndDate;
  const contractDocuments = (collaborator.documents ?? []).filter((document) => document.category === 'CONTRACT' || document.category === 'AMENDMENT');
  const allDocuments = collaborator.documents ?? [];
  const trainingDocuments = allDocuments.filter(isTrainingDocument);
  const hasContract = Boolean(contractType || contractDocuments.length);
  const hasDocuments = Boolean(allDocuments.length);
  const trainingNames = collaborator.trainingNames ?? [];
  const hasTrainings = Boolean(trainingNames.length || trainingDocuments.length);
  const leaveSummary = calculatePaidLeaveSummary(collaborator, regulatoryCountryCode);
  const hourlyRate = toFiniteNumber(collaborator.currentCompensation?.hourlyRate ?? collaborator.hourlyRate);
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
  async function previewInSheet(document: HrDocument) {
    setPreviewDocument(document);
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const nextUrl = await onPreviewDocument(collaborator.id, document);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Impossible d'afficher l'aperçu PDF.");
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return '';
      });
    } finally {
      setPreviewLoading(false);
    }
  }
  function openDetailSection(section: 'contracts' | 'trainings' | 'documents' | 'leaves' | 'planning') {
    setDetailSection(section);
    window.setTimeout(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }
  useEffect(() => {
    const firstDocument =
      detailSection === 'contracts'
        ? contractDocuments[0]
        : detailSection === 'trainings'
          ? trainingDocuments[0]
          : detailSection === 'documents'
            ? allDocuments[0]
            : null;
    setPreviewError('');
    if (firstDocument) {
      void previewInSheet(firstDocument);
      return;
    }
    setPreviewDocument(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
  }, [collaborator.id, detailSection]);
  const positionName = collaborator.position?.name?.trim();
  const departmentName = collaborator.department?.name?.trim();
  const siteName = (collaborator.mainSite?.name || collaborator.site?.name)?.trim();
  const managerName = collaborator.manager
    ? `${collaborator.manager.firstName ?? ''} ${collaborator.manager.lastName ?? ''}`.trim()
    : '';
  const location = formatLocation(collaborator);
  const secondaryPositions = (collaborator.secondaryPositions ?? []).filter((position) => hasText(position.name));
  const headerDetails = [positionName, departmentName, siteName].filter(hasText);
  const personalRows: InfoRow[] = [];
  const professionalRows: InfoRow[] = [];
  const organizationRows: InfoRow[] = [];
  const compensationRows: InfoRow[] = [];

  if (hasText(collaborator.email)) personalRows.push([<Mail size={14} />, collaborator.email]);
  if (hasText(collaborator.phone)) personalRows.push([<Phone size={14} />, collaborator.phone]);
  if (hasText(collaborator.address)) personalRows.push([<MapPin size={14} />, collaborator.address]);
  if (hasText(location)) personalRows.push([<MapPin size={14} />, location]);
  if (hasText(collaborator.birthDate)) personalRows.push([<CalendarDays size={14} />, formatDate(collaborator.birthDate)]);
  if (hasText(collaborator.personalIdentityNumber)) {
    personalRows.push([
      <ShieldCheck size={14} />,
      `${regulatoryCountryCode === 'FI' ? 'Henkilötunnus' : regulatoryCountryCode === 'FR' ? 'N° sécurité sociale' : 'Identifiant personnel'} : ${maskPersonalIdentityNumber(collaborator.personalIdentityNumber)}`,
    ]);
  }
  if (hasText(collaborator.primaryLanguage)) personalRows.push([<NotebookText size={14} />, `Langue principale : ${collaborator.primaryLanguage}`]);
  if (hasText(collaborator.secondaryLanguage)) personalRows.push([<NotebookText size={14} />, `Langue secondaire : ${collaborator.secondaryLanguage}`]);
  const emergencyContactName = [
    collaborator.emergencyContactFirstName,
    collaborator.emergencyContactLastName,
  ].filter(hasText).join(' ');
  const emergencyContactDetails = [
    emergencyContactName,
    collaborator.emergencyContactPhone,
    collaborator.emergencyContactEmail,
  ].filter(hasText);
  if (emergencyContactDetails.length) {
    personalRows.push([
      <ShieldCheck size={14} />,
      `Contact d’urgence : ${emergencyContactDetails.join(' · ')}`,
    ]);
  } else if (hasText(collaborator.emergencyContact)) {
    personalRows.push([<ShieldCheck size={14} />, `Contact d’urgence : ${collaborator.emergencyContact}`]);
  }

  if (hasText(positionName)) professionalRows.push([<BriefcaseBusiness size={14} />, `Poste principal : ${positionName}`]);
  if (secondaryPositions.length) {
    professionalRows.push([
      <BriefcaseBusiness size={14} />,
      <div className="hr-position-badges">
        {secondaryPositions.map((position) => <span key={position.id} className="badge badge-reception">{position.name}</span>)}
      </div>,
    ]);
  }
  if (hasText(departmentName)) professionalRows.push([<Building2 size={14} />, `Service : ${departmentName}`]);
  if (hasText(siteName)) professionalRows.push([<MapPin size={14} />, `Établissement : ${siteName}`]);
  if (hasText(collaborator.hireDate)) professionalRows.push([<CalendarDays size={14} />, `Date d’embauche : ${formatDate(collaborator.hireDate)}`]);
  if (hasText(managerName)) professionalRows.push([<UserRound size={14} />, `Responsable : ${managerName}`]);
  if (hasText(collaborator.employeeNumber)) professionalRows.push([<NotebookText size={14} />, `Matricule : ${collaborator.employeeNumber}`]);
  if (hasText(contractType)) professionalRows.push([<ShieldCheck size={14} />, `Contrat : ${contractType}`]);
  if (contractWeeklyMinutes != null) professionalRows.push([<Clock size={14} />, `Durée contractuelle : ${formatMinutes(contractWeeklyMinutes)}`]);
  if (hasText(contractEndDate)) professionalRows.push([<CalendarDays size={14} />, `Fin de contrat : ${formatDate(contractEndDate)}`]);
  if (hasText(trialEndDate)) professionalRows.push([<CalendarDays size={14} />, `Fin période d'essai : ${formatDate(trialEndDate)}`]);

  if (hasText(departmentName)) organizationRows.push([<Building2 size={14} />, `Service : ${departmentName}`]);
  if (hasText(positionName)) organizationRows.push([<BriefcaseBusiness size={14} />, `Poste principal : ${positionName}`]);
  if (secondaryPositions.length) {
    organizationRows.push([
      <BriefcaseBusiness size={14} />,
      <div className="hr-position-badges">
        {secondaryPositions.map((position) => <span key={position.id} className="badge badge-reception">{position.name}</span>)}
      </div>,
    ]);
  }
  if (hasText(siteName)) organizationRows.push([<MapPin size={14} />, `Établissement : ${siteName}`]);
  if (contractWeeklyMinutes != null) organizationRows.push([<Clock size={14} />, `Durée hebdo contrat : ${formatMinutes(contractWeeklyMinutes)}`]);

  if (hourlyRate != null) compensationRows.push([<ShieldCheck size={14} />, `Taux horaire : ${formatMoneyAmount(hourlyRate, compensationCurrency)}`]);
  if (weeklyGross != null) {
    compensationRows.push(
      [<CalendarDays size={14} />, `Hebdomadaire brut : ${formatMoneyAmount(weeklyGross, compensationCurrency)}`],
      [<CalendarDays size={14} />, `Mensuel brut estimé : ${formatMoneyAmount((weeklyGross * 52) / 12, compensationCurrency)}`],
      [<CalendarDays size={14} />, `Annuel brut estimé : ${formatMoneyAmount(weeklyGross * 52, compensationCurrency)}`],
    );
  }
  const lastReviewDate = collaborator.currentCompensation?.effectiveFrom ?? collaborator.rateEffectiveDate;
  const nextReviewDate = collaborator.nextSalaryReview?.dueDate ?? collaborator.nextReviewDate;
  if (hasText(lastReviewDate)) compensationRows.push([<CalendarDays size={14} />, `Dernière revalorisation : ${formatDate(lastReviewDate)}`]);
  if (hasText(nextReviewDate)) compensationRows.push([<CalendarDays size={14} />, `Prochaine revalorisation : ${formatDate(nextReviewDate)}`]);

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
              {headerDetails.length ? <p>{headerDetails.join(' · ')}</p> : null}
              <div className="hr-profile-badges">
                <StatusBadge status={collaborator.status} />
                {collaborator.user || collaborator.userId ? <span className="badge badge-reception">Compte ToqueHub</span> : null}
                {hasContract ? <span className="badge badge-reception">{contractType ? `Contrat ${contractType}` : 'Contrat'}</span> : null}
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
          <InfoBlock title="Informations personnelles" rows={personalRows} />
          <InfoBlock title="Informations professionnelles" rows={professionalRows} />
          <InfoBlock
            title="Compte ToqueHub associé"
            rows={collaborator.user ? [[<ShieldCheck size={14} />, displayUser(collaborator.user)]] : []}
            wide
          />
          <InfoBlock title="Organisation de travail" rows={organizationRows} />
          <InfoBlock title="Rémunération" rows={compensationRows} />
          {initialNotes.trim() ? (
            <div className="hr-info-block hr-info-block-wide hr-notes-editor">
              <h3>Notes</h3>
              <textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} />
              <small>{savingNotes ? 'Sauvegarde en cours...' : notesDraft.trim() !== cleanLegacyHrNotes(collaborator.notes).trim() ? 'La note sera sauvegardée à la fermeture.' : 'Sauvegardée'}</small>
            </div>
          ) : null}
        </div>
        <div className="card-modern" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          <span className="card-title">Historique</span>
          <HistoryList history={collaborator.history ?? []} />
        </div>
        <div className="hr-future-cards">
          {[
            { id: 'contracts' as const, label: 'Contrats', icon: <ShieldCheck size={18} />, status: hasContract ? 'ok' : 'critical', hint: hasContract ? `Contrat ${contractType ?? 'PDF'}` : 'Contrat manquant' },
            { id: 'trainings' as const, label: 'Formations', icon: <Sparkles size={18} />, status: hasTrainings ? 'ok' : 'pending', hint: hasTrainings ? `${trainingNames.length + trainingDocuments.length} élément${trainingNames.length + trainingDocuments.length > 1 ? 's' : ''}` : 'À paramétrer' },
            { id: 'documents' as const, label: 'Documents', icon: <NotebookText size={18} />, status: hasDocuments ? 'ok' : 'missing', hint: hasDocuments ? `${collaborator.documents?.length} document${(collaborator.documents?.length ?? 0) > 1 ? 's' : ''}` : 'Aucun document' },
            { id: 'leaves' as const, label: 'Congés', icon: <CalendarDays size={18} />, status: leaveSummary ? 'ok' : 'pending', hint: leaveSummary ? `${formatLeaveNumber(leaveSummary.balanceDays)} j estimés` : 'Pays à configurer' },
            { id: 'planning' as const, label: 'Planning', icon: <Clock size={18} />, status: 'pending', hint: 'Géré dans Planning' },
          ].map((item) => (
            <button key={item.label} type="button" className={`hr-future-card ${detailSection === item.id ? 'active' : ''} ${item.status}`} onClick={() => openDetailSection(item.id)}>
              <div className="hr-future-icon">{item.icon}</div>
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>
        <div ref={detailPanelRef}>
          <CollaboratorDetailPanel collaborator={collaborator} regulatoryCountryCode={regulatoryCountryCode} section={detailSection} primaryContract={primaryContract} contractType={contractType} contractWeeklyMinutes={contractWeeklyMinutes} contractEndDate={contractEndDate} trialEndDate={trialEndDate} canWrite={canWrite} previewDocument={previewDocument} previewUrl={previewUrl} previewLoading={previewLoading} previewError={previewError} onPreviewDocument={previewInSheet} onViewDocument={onViewDocument} onReplaceDocument={onReplaceDocument} onDeleteDocument={onDeleteDocument} onDownloadDocument={onDownloadDocument} />
        </div>
      </motion.div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset className="hr-form-section"><legend>{title}</legend>{children}</fieldset>; }
function formatMinutes(value?: number | null) { if (value === undefined || value === null || Number.isNaN(value)) return '—'; const hours = Math.floor(value / 60); const minutes = Math.round(value % 60); return `${hours}h${minutes.toString().padStart(2, '0')}`; }
function toFiniteNumber(value: unknown): number | null { if (value === undefined || value === null || value === '') return null; const number = typeof value === 'number' ? value : Number(value); return Number.isFinite(number) ? number : null; }
function formatMoneyAmount(value: unknown, currency = 'EUR', fallback = '—') { const number = toFiniteNumber(value); return number != null ? `${number.toFixed(2)} ${currency}` : fallback; }
function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) { return <div className="empty-state"><div className="empty-state-icon">👥</div><span className="empty-state-title">{title}</span><span className="empty-state-desc">{description}</span>{action}</div>; }
function PersonRow({ collaborator, detail }: { collaborator: HrCollaborator; detail?: string }) { return <div className="hr-person-row"><AvatarInitial collaborator={collaborator} /><div><strong>{fullName(collaborator)}</strong><span>{collaborator.position?.name ?? '—'} · {collaborator.department?.name ?? '—'}</span></div><small>{detail}</small></div>; }
function AvatarInitial({ collaborator }: { collaborator: HrCollaborator }) { const photo = collaborator.photoUrl ?? collaborator.photoDataUrl; return photo ? <img className="hr-avatar" src={photo} alt="" /> : <div className="hr-avatar">{`${collaborator.firstName?.[0] ?? ''}${collaborator.lastName?.[0] ?? ''}`.toUpperCase() || 'RH'}</div>; }
function StatusBadge({ status }: { status?: string }) { const className = status === 'ACTIVE' ? 'badge-reception' : status === 'ABSENT' ? 'badge-warning' : status === 'LEFT' ? 'badge-danger' : ''; return <span className={`badge ${className}`}>{statusLabels[status ?? 'ACTIVE'] ?? status ?? 'Actif'}</span>; }
function HistoryList({ history }: { history: HrHistoryEntry[] }) { return history.length === 0 ? <p className="muted">L’historique utile apparaîtra ici : création, changements de statut, service, poste, liaison et archivage.</p> : <div className="hr-history">{history.map((entry) => <div key={entry.id ?? `${entry.createdAt}-${entry.type}`}><strong>{entry.label ?? entry.type}</strong><span>{entry.description}</span><small>{formatDate(entry.createdAt)}</small></div>)}</div>; }
type InfoRow = [React.ReactNode, React.ReactNode];
function InfoBlock({ title, rows, wide = false }: { title: string; rows: InfoRow[]; wide?: boolean }) {
  if (!rows.length) return null;
  return <div className={`hr-info-block${wide ? ' hr-info-block-wide' : ''}`}><h3>{title}</h3>{rows.map(([icon, value], index) => <div key={index}>{icon}<span>{value}</span></div>)}</div>;
}
function DocumentList({ employeeId, documents, canWrite, selectedDocumentId, onPreview, onView, onReplace, onDelete, onDownload }: { employeeId: string; documents: HrDocument[]; canWrite: boolean; selectedDocumentId?: string | null; onPreview: (document: HrDocument) => void; onView: (employeeId: string, document: HrDocument) => Promise<void>; onReplace: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDelete: (employeeId: string, documentId: string) => Promise<void>; onDownload: (employeeId: string, document: HrDocument) => Promise<void> }) {
  return (
    <div className="hr-document-list">
      {documents.map((document) => (
        <div
          key={document.id}
          className={`hr-document-row ${selectedDocumentId === document.id ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onPreview(document)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onPreview(document);
            }
          }}
        >
          <div>
            <strong>{document.originalName}</strong>
            <span>{documentCategoryLabel(document.category)} · {formatBytes(document.sizeBytes)} · {document.expiresAt ? 'Echeance ' + formatDate(document.expiresAt) : 'Sans echeance'}</span>
          </div>
          <div className="row-actions" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="btn btn-secondary" onClick={() => onPreview(document)}>Voir</button>
            <button type="button" className="btn btn-secondary" onClick={() => onView(employeeId, document)}>Nouvel onglet</button>
            <button type="button" className="btn btn-secondary" onClick={() => onDownload(employeeId, document)}>Telecharger</button>
            {canWrite ? <label className="btn btn-secondary hr-file-action">Remplacer<input type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onReplace(employeeId, document.id, file); event.currentTarget.value = ''; }} /></label> : null}
            {canWrite ? <button type="button" className="icon-btn danger" onClick={() => onDelete(employeeId, document.id)} title="Supprimer"><Archive size={16} /></button> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
function CollaboratorDetailPanel({ collaborator, regulatoryCountryCode, section, primaryContract, contractType, contractWeeklyMinutes, contractEndDate, trialEndDate, canWrite, previewDocument, previewUrl, previewLoading, previewError, onPreviewDocument, onViewDocument, onReplaceDocument, onDeleteDocument, onDownloadDocument }: { collaborator: HrCollaborator; regulatoryCountryCode?: RegulatoryCountryCode | null; section: 'contracts' | 'trainings' | 'documents' | 'leaves' | 'planning'; primaryContract?: any; contractType?: string | null; contractWeeklyMinutes?: number | null; contractEndDate?: string | null; trialEndDate?: string | null; canWrite: boolean; previewDocument: HrDocument | null; previewUrl: string; previewLoading: boolean; previewError: string; onPreviewDocument: (document: HrDocument) => void; onViewDocument: (employeeId: string, document: HrDocument) => Promise<void>; onReplaceDocument: (employeeId: string, documentId: string, file: File) => Promise<HrDocument | void>; onDeleteDocument: (employeeId: string, documentId: string) => Promise<void>; onDownloadDocument: (employeeId: string, document: HrDocument) => Promise<void> }) {
  const title = section === 'contracts' ? 'Contrat de travail' : section === 'trainings' ? 'Formations' : section === 'documents' ? 'Documents justificatifs' : section === 'leaves' ? 'Conges' : 'Planning';
  const contractDocuments = (collaborator.documents ?? []).filter((document) => document.category === 'CONTRACT' || document.category === 'AMENDMENT');
  const trainingDocuments = (collaborator.documents ?? []).filter(isTrainingDocument);
  const trainingNames = collaborator.trainingNames ?? [];
  const visibleDocuments = section === 'contracts' ? contractDocuments : section === 'trainings' ? trainingDocuments : collaborator.documents ?? [];
  const canShowPreview = section === 'contracts' || section === 'documents' || (section === 'trainings' && trainingDocuments.length > 0);
  return (
    <div className="card-modern hr-detail-panel">
      <div className="section-header-modern">
        <span className="card-title">{title}</span>
        {section === 'contracts' && (contractType || contractDocuments.length) ? <span className="badge badge-reception">Complet</span> : null}
        {section === 'trainings' && (trainingNames.length || trainingDocuments.length) ? <span className="badge badge-reception">{trainingNames.length + trainingDocuments.length} élément{trainingNames.length + trainingDocuments.length > 1 ? 's' : ''}</span> : null}
        {section === 'documents' && collaborator.documents?.length ? <span className="badge badge-reception">{collaborator.documents.length} document{collaborator.documents.length > 1 ? 's' : ''}</span> : null}
      </div>
      {section === 'contracts' ? (
        contractType || contractDocuments.length ? (
          <div className="hr-detail-grid">
            {contractType ? <InfoBlock title="Contrat actif" rows={[
              [<ShieldCheck size={14} />, 'Type : ' + contractType],
              ...(hasText(primaryContract?.startDate ?? collaborator.hireDate)
                ? [[<CalendarDays size={14} />, `Début : ${formatDate(primaryContract?.startDate ?? collaborator.hireDate)}`] as InfoRow]
                : []),
              ...(hasText(contractEndDate)
                ? [[<CalendarDays size={14} />, `Fin : ${formatDate(contractEndDate)}`] as InfoRow]
                : []),
              ...(hasText(trialEndDate)
                ? [[<CalendarDays size={14} />, `Fin période d'essai : ${formatDate(trialEndDate)}`] as InfoRow]
                : []),
              ...(contractWeeklyMinutes != null
                ? [[<Clock size={14} />, `Durée hebdo : ${formatMinutes(contractWeeklyMinutes)}`] as InfoRow]
                : []),
            ]} /> : null}
            {contractDocuments.length ? <DocumentList employeeId={collaborator.id} documents={contractDocuments} canWrite={canWrite} selectedDocumentId={previewDocument?.id} onPreview={onPreviewDocument} onView={onViewDocument} onReplace={onReplaceDocument} onDelete={onDeleteDocument} onDownload={onDownloadDocument} /> : null}
            {collaborator.contracts?.length ? <InfoBlock title="Historique" rows={collaborator.contracts.map((contract) => [<ShieldCheck size={14} />, contract.contractType + ' · ' + (contract.status ?? 'ACTIVE') + ' · ' + formatDate(contract.startDate) + (contract.endDate ? ' -> ' + formatDate(contract.endDate) : '')] as [React.ReactNode, React.ReactNode])} /> : null}
          </div>
        ) : <EmptyState title="Contrat manquant" description="Ajoutez un type de contrat ou joignez le contrat de travail PDF dans la fiche collaborateur." />
      ) : null}
      {section === 'trainings' ? (
        trainingNames.length || trainingDocuments.length ? (
          <div className="hr-detail-stack">
            {trainingNames.length ? <div className="hr-training-list">{trainingNames.map((training) => <span key={training} className="badge badge-reception">{training}</span>)}</div> : null}
            {trainingDocuments.length ? <DocumentList employeeId={collaborator.id} documents={trainingDocuments} canWrite={canWrite} selectedDocumentId={previewDocument?.id} onPreview={onPreviewDocument} onView={onViewDocument} onReplace={onReplaceDocument} onDelete={onDeleteDocument} onDownload={onDownloadDocument} /> : null}
          </div>
        ) : <EmptyState title="Formations a parametrer" description="Les formations choisies dans la fiche collaborateur et les certificats PDF apparaitront ici." />
      ) : null}
      {section === 'documents' ? (
        visibleDocuments.length ? <DocumentList employeeId={collaborator.id} documents={visibleDocuments} canWrite={canWrite} selectedDocumentId={previewDocument?.id} onPreview={onPreviewDocument} onView={onViewDocument} onReplace={onReplaceDocument} onDelete={onDeleteDocument} onDownload={onDownloadDocument} /> : <EmptyState title="Aucun document" description="Les justificatifs PDF du collaborateur apparaitront ici apres enregistrement dans la fiche collaborateur." />
      ) : null}
      {canShowPreview ? <PdfPreview document={previewDocument} url={previewUrl} loading={previewLoading} error={previewError} /> : null}
      {section === 'leaves' ? <LeaveBalancePanel collaborator={collaborator} regulatoryCountryCode={regulatoryCountryCode} /> : null}
      {section === 'planning' ? <EmptyState title="Planning géré dans le module Planning" description="Les roulements et cycles de travail sont configurés dans Planning pour éviter les doublons avec RH." /> : null}
    </div>
  );
}
function LeaveBalancePanel({ collaborator, regulatoryCountryCode }: { collaborator: HrCollaborator; regulatoryCountryCode?: RegulatoryCountryCode | null }) {
  const summary = calculatePaidLeaveSummary(collaborator, regulatoryCountryCode);
  if (!summary) {
    return <EmptyState title="Pays de réglementation à configurer" description="Sélectionnez France ou Finlande dans Organisation > Général pour calculer le droit légal minimal de congés." />;
  }
  return (
    <div className="hr-leave-balance">
      <div className="hr-leave-balance-main">
        <div>
          <span className="welcome-tag">Solde estimé</span>
          <strong>{formatLeaveNumber(summary.balanceDays)} jours</strong>
          <small>{summary.countryLabel} · {summary.periodLabel}</small>
        </div>
        <CalendarDays size={28} />
      </div>
      <div className="hr-leave-kpis">
        <div><span>Droit annuel</span><strong>{formatLeaveNumber(summary.annualDays)} j</strong></div>
        <div><span>Acquis</span><strong>{formatLeaveNumber(summary.accruedDays)} j</strong></div>
        <div><span>Pris</span><strong>{formatLeaveNumber(summary.usedDays)} j</strong></div>
        <div><span>Rythme</span><strong>{formatLeaveNumber(summary.monthlyRate)} j/mois</strong></div>
      </div>
      <div className="hr-leave-note">
        <Info size={15} />
        <span>{summary.note}</span>
      </div>
    </div>
  );
}
function PdfPreview({ document, url, loading, error }: { document: HrDocument | null; url: string; loading: boolean; error: string }) {
  if (!document && !loading && !error) return <div className="hr-pdf-preview empty"><NotebookText size={18} /><span>Sélectionnez un document pour afficher son aperçu PDF ici.</span></div>;
  return (
    <div className="hr-pdf-preview">
      <div className="hr-pdf-preview-header">
        <strong>{document?.originalName ?? 'Aperçu PDF'}</strong>
        {document ? <span>{documentCategoryLabel(document.category)}</span> : null}
      </div>
      {loading ? <div className="hr-pdf-preview-state">Chargement de l’aperçu...</div> : null}
      {error ? <div className="hr-pdf-preview-state error">{error}</div> : null}
      {!loading && !error && url ? <iframe title={`Aperçu PDF - ${document?.originalName ?? 'document RH'}`} src={url} /> : null}
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
function isTrainingDocument(document: HrDocument) {
  return ['CERTIFICATION', 'DIPLOMA'].includes(document.category) || /formation|training|certificat|dipl[oô]me/i.test(`${document.category} ${document.originalName} ${document.notes ?? ''}`);
}
type PaidLeaveSummary = {
  countryLabel: string;
  periodLabel: string;
  annualDays: number;
  monthlyRate: number;
  accruedDays: number;
  usedDays: number;
  balanceDays: number;
  note: string;
};
function calculatePaidLeaveSummary(collaborator: HrCollaborator, regulatoryCountryCode?: RegulatoryCountryCode | null): PaidLeaveSummary | null {
  if (!regulatoryCountryCode) return null;
  const hireDate = parseDateSafe(collaborator.hireDate);
  if (!hireDate) return null;
  const today = startOfDay(new Date());
  const config = paidLeaveConfig(regulatoryCountryCode, hireDate, today);
  if (!config) return null;
  const start = maxDate(config.periodStart, startOfDay(hireDate));
  const end = minDate(today, config.periodEnd);
  const elapsedMonths = end < start ? 0 : Math.min(12, inclusiveDays(start, end) / 30.4375);
  const accruedDays = roundLeaveDays(Math.min(config.annualDays, elapsedMonths * config.monthlyRate));
  const usedDays = roundLeaveDays(approvedPaidLeaveDays(collaborator, config.periodStart, config.periodEnd));
  return {
    countryLabel: regulatoryCountryLabel(regulatoryCountryCode),
    periodLabel: `${formatShortDate(config.periodStart)} - ${formatShortDate(config.periodEnd)}`,
    annualDays: config.annualDays,
    monthlyRate: config.monthlyRate,
    accruedDays,
    usedDays,
    balanceDays: roundLeaveDays(accruedDays - usedDays),
    note: config.note,
  };
}
function regulatoryCountryLabel(countryCode: RegulatoryCountryCode) {
  return countryCode === 'FI' ? 'Finlande' : 'France';
}
function paidLeaveConfig(countryCode: RegulatoryCountryCode, hireDate: Date, today: Date) {
  if (countryCode === 'FR') {
    const periodStart = new Date(today.getFullYear(), 5, 1);
    if (today < periodStart) periodStart.setFullYear(periodStart.getFullYear() - 1);
    const periodEnd = new Date(periodStart.getFullYear() + 1, 4, 31);
    return {
      periodStart,
      periodEnd,
      annualDays: 30,
      monthlyRate: 2.5,
      note: 'Estimation légale minimale France: 2,5 jours ouvrables par mois de travail effectif, hors convention, report et règles internes.',
    };
  }
  if (countryCode === 'FI') {
    const periodStart = new Date(today.getFullYear(), 3, 1);
    if (today < periodStart) periodStart.setFullYear(periodStart.getFullYear() - 1);
    const periodEnd = new Date(periodStart.getFullYear() + 1, 2, 31);
    const oneYearBeforePeriodEnd = new Date(periodEnd);
    oneYearBeforePeriodEnd.setFullYear(oneYearBeforePeriodEnd.getFullYear() - 1);
    const monthlyRate = startOfDay(hireDate) <= startOfDay(oneYearBeforePeriodEnd) ? 2.5 : 2;
    return {
      periodStart,
      periodEnd,
      annualDays: monthlyRate * 12,
      monthlyRate,
      note: 'Estimation légale minimale Finlande: 2 ou 2,5 jours par mois de référence selon l’ancienneté, hors convention et règles internes.',
    };
  }
  return null;
}
function approvedPaidLeaveDays(collaborator: HrCollaborator, periodStart: Date, periodEnd: Date) {
  const absences = Array.isArray((collaborator as HrCollaborator & { absences?: Array<Record<string, any>> }).absences) ? (collaborator as HrCollaborator & { absences?: Array<Record<string, any>> }).absences ?? [] : [];
  return absences.reduce((total, absence) => {
    const type = String(absence.type ?? absence.code ?? '').toUpperCase();
    const status = String(absence.status ?? '').toUpperCase();
    if (!['CONGE', 'PAID_LEAVE', 'LEAVE'].includes(type) || status !== 'APPROVED') return total;
    const start = maxDate(parseDateSafe(String(absence.startDate ?? '')) ?? periodStart, periodStart);
    const end = minDate(parseDateSafe(String(absence.endDate ?? '')) ?? start, periodEnd);
    return end < start ? total : total + inclusiveDays(start, end);
  }, 0);
}
function parseDateSafe(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function minDate(a: Date, b: Date) { return a < b ? a : b; }
function maxDate(a: Date, b: Date) { return a > b ? a : b; }
function inclusiveDays(start: Date, end: Date) { return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000) + 1; }
function roundLeaveDays(value: number) { return Math.round(value * 10) / 10; }
function formatLeaveNumber(value: number) { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value); }
function formatShortDate(value: Date) { return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(value); }
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
function collaboratorSecondaryPositionIds(collaborator: HrCollaborator) {
  if (collaborator.secondaryPositionIds?.length) return validUuidList(collaborator.secondaryPositionIds);
  return validUuidList((collaborator.secondaryPositions ?? []).map((item) => {
    const relation = item as HrPosition & { positionId?: string | null; position?: HrPosition | null };
    return relation.positionId ?? relation.position?.id ?? relation.id;
  }));
}
function validUuidList(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => isUuid(value)))];
}
function isUuid(value?: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
function collaboratorToPayload(collaborator: HrCollaborator, patch: Partial<HrCollaboratorPayload> = {}): HrCollaboratorPayload {
  const revaluationEnabled = Boolean(
    collaborator.nextSalaryReview?.dueDate ||
    collaborator.nextReviewDate ||
    collaborator.reviewFrequency,
  );
  return {
    photoUrl: collaborator.photoUrl ?? collaborator.photoDataUrl ?? undefined,
    firstName: collaborator.firstName,
    lastName: collaborator.lastName,
    email: collaborator.email ?? undefined,
    phone: collaborator.phone ?? undefined,
    address: collaborator.address ?? undefined,
    postalCode: collaborator.postalCode ?? undefined,
    city: collaborator.city ?? undefined,
    country: collaborator.country ?? undefined,
    primaryLanguage: collaborator.primaryLanguage ?? undefined,
    secondaryLanguage: collaborator.secondaryLanguage ?? undefined,
    emergencyContact: collaborator.emergencyContact ?? undefined,
    emergencyContactFirstName: collaborator.emergencyContactFirstName ?? undefined,
    emergencyContactLastName: collaborator.emergencyContactLastName ?? undefined,
    emergencyContactPhone: collaborator.emergencyContactPhone ?? undefined,
    emergencyContactEmail: collaborator.emergencyContactEmail ?? undefined,
    birthDate: toInputDate(collaborator.birthDate) || undefined,
    personalIdentityNumber: collaborator.personalIdentityNumber ?? undefined,
    hireDate: toInputDate(collaborator.hireDate) || new Date().toISOString().slice(0, 10),
    departmentId: collaborator.departmentId ?? collaborator.department?.id ?? '',
    positionId: collaborator.positionId ?? collaborator.position?.id ?? '',
    secondaryPositionIds: collaboratorSecondaryPositionIds(collaborator),
    siteId: collaborator.mainSiteId ?? collaborator.siteId ?? collaborator.mainSite?.id ?? collaborator.site?.id ?? undefined,
    secondarySiteIds: collaborator.secondarySiteIds ?? collaborator.secondarySites?.map((item) => 'siteId' in item ? item.siteId : item.id) ?? [],
    employeeNumber: collaborator.employeeNumber ?? undefined,
    notes: collaborator.notes ?? undefined,
    status: collaborator.status === 'LEFT' ? 'DEPARTED' : collaborator.status,
    userId: collaborator.userId ?? collaborator.user?.id ?? undefined,
    managerId: collaborator.managerId ?? collaborator.manager?.id ?? undefined,
    contractType: collaborator.activeContract?.contractType ?? collaborator.contractType ?? undefined,
    contractEndDate: toInputDate(collaborator.activeContract?.endDate) || toInputDate(collaborator.contractEndDate) || undefined,
    trialEndDate: toInputDate(collaborator.activeContract?.trialEndDate) || toInputDate(collaborator.trialEndDate) || undefined,
    contractWeeklyMinutes: collaborator.activeContract?.weeklyHours ?? collaborator.contractWeeklyMinutes ?? undefined,
    trainingNames: collaborator.trainingNames ?? undefined,
    hourlyRate: collaborator.currentCompensation?.hourlyRate ?? collaborator.hourlyRate ?? undefined,
    currency: collaborator.currentCompensation?.currency ?? collaborator.currency ?? undefined,
    rateEffectiveDate: revaluationEnabled ? toInputDate(collaborator.currentCompensation?.effectiveFrom) || toInputDate(collaborator.rateEffectiveDate) || undefined : undefined,
    nextReviewDate: revaluationEnabled ? toInputDate(collaborator.nextSalaryReview?.dueDate) || toInputDate(collaborator.nextReviewDate) || undefined : undefined,
    reviewFrequency: revaluationEnabled ? collaborator.reviewFrequency ?? undefined : undefined,
    revaluationEnabled,
    ...patch,
  };
}
function documentCategoryLabel(value?: string | null) {
  const labels: Record<string, string> = { CONTRACT: 'Contrat', AMENDMENT: 'Avenant', CERTIFICATION: 'Formation', DIPLOMA: 'Diplome', IDENTITY: 'Identite', ADMINISTRATIVE: 'CV / administratif', OTHER: 'Autre' };
  return labels[value ?? 'OTHER'] ?? value ?? 'Autre';
}
function formatBytes(value?: number | null) { if (!value) return '—'; if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`; return `${(value / 1024 / 1024).toFixed(1)} Mo`; }
function maskPersonalIdentityNumber(value?: string | null) {
  const cleaned = value?.trim();
  if (!cleaned) return '';
  const visible = cleaned.slice(-4);
  return `${'•'.repeat(Math.max(4, Math.min(cleaned.length - visible.length, 10)))}${visible}`;
}
function formatLocation(collaborator: Pick<HrCollaborator, 'postalCode' | 'city' | 'country'>) {
  const location = [collaborator.postalCode, collaborator.city, collaborator.country].filter(hasText).join(' ');
  return location;
}
function hasText(value?: string | null): value is string { return Boolean(value?.trim()); }
function formatDate(value?: string | null) { if (!value) return '—'; return new Intl.DateTimeFormat('fr-FR').format(new Date(value)); }
function dateValue(value?: string | null) { return value ? new Date(value).getTime() : 0; }
function toInputDate(value?: string | null) { return value ? new Date(value).toISOString().slice(0, 10) : ''; }
function cleanLegacyHrNotes(value?: string | null) { return value && /Documents PDF a joindre|Documents PDF à joindre|Formations:/i.test(value) ? '' : value ?? ''; }

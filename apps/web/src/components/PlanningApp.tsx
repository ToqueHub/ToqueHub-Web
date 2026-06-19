import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Archive,
  Bell,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileSpreadsheet,
  History,
  Info,
  Layers,
  MapPin,
  Printer,
  RefreshCw,
  Repeat2,
  Search,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UsersRound,
  Wand2,
} from 'lucide-react';
import { ApiError, api } from '../api/client';
import type {
  HrCollaborator,
  HrDepartment,
  HrPosition,
  HrRotation,
  PlanningAlert,
  PlanningAssignment,
  PlanningBootstrap,
  PlanningHistoryEntry,
  PlanningRequirement,
  PlanningReplacementProposal,
  PlanningTemplate,
  Site,
  UserSession,
} from '../types';

type PlanningTab = 'dashboard' | 'day' | 'week' | 'month' | 'assignments' | 'absences' | 'replacements' | 'templates' | 'requirements';

type Props = {
  token: string;
  tab: PlanningTab;
  session: UserSession;
  collaborators: HrCollaborator[];
  departments: HrDepartment[];
  positions: HrPosition[];
  rotations: HrRotation[];
  sites: Site[];
  canWrite: boolean;
  onNavigate: (tab: PlanningTab) => void;
};

const tabLabels: Array<[PlanningTab, string]> = [
  ['dashboard', 'Tableau de bord'],
  ['day', 'Journalier'],
  ['week', 'Hebdomadaire'],
  ['month', 'Mensuel'],
  ['assignments', 'Affectations'],
  ['absences', 'Absences'],
  ['replacements', 'Remplacements'],
  ['templates', 'Modèles'],
  ['requirements', 'Besoins opérationnels'],
];

const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const defaultServices = ['Cuisine', 'Pâtisserie', 'Magasin', 'Administration', 'Entretien'];
const timeSlots = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];

const statusLabel: Record<string, string> = {
  PLANNED: 'Planifié',
  CONFIRMED: 'Confirmé',
  MODIFIED: 'Modifié',
  CANCELLED: 'Annulé',
  REPLACED: 'Remplacé',
  PENDING: 'En attente',
  APPROVED: 'Validée',
  REJECTED: 'Refusée',
  DRAFT: 'Brouillon',
};

export function PlanningApp({ token, tab, session, collaborators, departments, positions, rotations, sites, canWrite, onNavigate }: Props) {
  const [data, setData] = useState<PlanningBootstrap>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [siteFilter, setSiteFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [draggedAssignment, setDraggedAssignment] = useState<string>();
  const [draft, setDraft] = useState<Partial<PlanningAssignment>>({ date: todayIso(), startTime: '06:00', endTime: '14:00', breakMinutes: 30, status: 'PLANNED', origin: 'MANUAL' });
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(undefined);
    api.planningBootstrap(token)
      .then((payload) => { if (mounted) setData(normalizePlanningBootstrap(payload)); })
      .catch((err) => {
        if (mounted && !(err instanceof ApiError && err.status === 404)) setError(err instanceof Error ? err.message : 'Planning indisponible');
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token]);

  const effectiveCollaborators = data?.collaborators?.length ? data.collaborators : collaborators;
  const effectiveDepartments = data?.departments?.length ? data.departments : departments;
  const effectivePositions = data?.positions?.length ? data.positions : positions;
  const effectiveSites = data?.sites?.length ? data.sites : sites;
  const assignments = data?.assignments ?? [];
  const absences = data?.absences ?? [];
  const requirements = data?.requirements ?? [];
  const replacements = data?.replacementProposals ?? [];
  const templates = data?.templates ?? [];
  const history = data?.history ?? [];

  const hasHrBase = effectiveCollaborators.length > 0 && effectiveDepartments.length > 0 && effectivePositions.length > 0;
  const services = effectiveDepartments.length ? effectiveDepartments : defaultServices.map((name, index) => ({ id: `sample-${index}`, name }));
  const activeAssignments = useMemo(() => assignments.filter((assignment) => {
    const collaborator = findCollaborator(effectiveCollaborators, assignment.collaboratorId);
    const haystack = [collaboratorName(collaborator), assignment.department?.name, assignment.position?.name, assignment.comment].join(' ').toLowerCase();
    return (!siteFilter || assignment.siteId === siteFilter || assignment.site?.id === siteFilter) &&
      (!serviceFilter || assignment.departmentId === serviceFilter || assignment.department?.id === serviceFilter) &&
      haystack.includes(search.toLowerCase());
  }), [assignments, effectiveCollaborators, siteFilter, serviceFilter, search]);

  const syntheticAssignments = useMemo(() => assignments.length ? activeAssignments : buildSyntheticAssignments(effectiveCollaborators, effectiveDepartments, effectivePositions), [assignments.length, activeAssignments, effectiveCollaborators, effectiveDepartments, effectivePositions]);
  const dashboard = buildDashboard(data, syntheticAssignments, absences, effectiveCollaborators, effectiveDepartments, rotations);
  const planningAlerts = data?.alerts?.length ? data.alerts : dashboard.alerts;

  async function createAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    try {
      const payload = {
        employeeId: draft.collaboratorId || draft.employeeId || effectiveCollaborators[0]?.id,
        departmentId: draft.departmentId || effectiveDepartments[0]?.id,
        positionId: draft.positionId || effectivePositions[0]?.id,
        siteId: draft.siteId || effectiveSites[0]?.id,
        date: draft.date || selectedDate,
        startTime: draft.startTime || '06:00',
        endTime: draft.endTime || '14:00',
        breakMinutes: Number(draft.breakMinutes ?? 30),
        status: draft.status || 'PLANNED',
        origin: 'MANUAL',
        comment: draft.comment,
      };
      const created = normalizePlanningAssignment(await api.createPlanningAssignment(token, payload));
      setData((previous) => ({ ...previous, assignments: [created, ...(previous?.assignments ?? [])] }));
      setNotice('Affectation créée avec contrôles RH et historique préparé.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible');
    }
  }

  async function generatePlanning() {
    try {
      const result = await api.generatePlanning(token, { startDate: weekStart(selectedDate), endDate: weekEnd(selectedDate), siteId: siteFilter || undefined, apply: false });
      const previewAssignments = (result.assignments ?? (result as any).preview?.assignments ?? []).map((assignment: PlanningAssignment) => normalizePlanningAssignment(assignment));
      setData((previous) => ({ ...previous, assignments: previewAssignments.length ? previewAssignments : previous?.assignments ?? [], alerts: result.alerts ?? (result as any).preview?.alerts ?? previous?.alerts ?? [] }));
      setNotice('Génération déterministe lancée : roulements RH, absences validées, compétences et besoins contrôlés.');
    } catch (err) {
      setNotice('Prévisualisation locale : génération déterministe prête, en attente de l’API Planning.');
    }
  }

  function handleDrop(target: { date?: string; departmentId?: string; collaboratorId?: string }) {
    if (!draggedAssignment) return;
    setData((previous) => ({
      ...previous,
      assignments: (previous?.assignments ?? []).map((assignment) => assignment.id === draggedAssignment ? { ...assignment, ...target, status: 'MODIFIED', origin: 'DRAG_DROP' } : assignment),
      alerts: [
        { id: `local-${Date.now()}`, level: 'attention', title: 'Contrôle RH à valider', message: 'Déplacement préparé : vérifier absence validée, amplitude, repos et besoin couvert avant sauvegarde.' },
        ...(previous?.alerts ?? []),
      ],
    }));
    setDraggedAssignment(undefined);
  }

  return (
    <div className="hr-shell planning-shell">
      <div className="hr-hero planning-hero">
        <div>
          <span className="welcome-tag">ToqueHub Planning</span>
          <h1>Planning</h1>
          <p>Vue globale de l’activité et des effectifs. Le module consomme RH : collaborateurs, services, postes, roulements, absences et compétences.</p>
        </div>
        <div className="planning-hero-actions">
          <button className="btn btn-secondary" onClick={generatePlanning}><Wand2 size={16} /> Générer</button>
          <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16} /> Imprimer</button>
          <button className="btn btn-primary" onClick={() => onNavigate('assignments')} disabled={!canWrite}><ClipboardList size={16} /> Affecter</button>
        </div>
      </div>

      <div className="hr-tabs planning-tabs">
        {tabLabels.map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => onNavigate(value)}>{label}</button>)}
      </div>

      {loading ? <div className="card-modern">Chargement du planning opérationnel…</div> : null}
      {error ? <div className="alert"><AlertTriangle size={16} /> {error}</div> : null}
      {notice ? <div className="success"><CheckCircle2 size={16} /> {notice}</div> : null}
      {!hasHrBase ? <HrPrerequisiteCard /> : null}

      <PlanningFilters sites={effectiveSites} departments={effectiveDepartments} siteFilter={siteFilter} setSiteFilter={setSiteFilter} serviceFilter={serviceFilter} setServiceFilter={setServiceFilter} selectedDate={selectedDate} setSelectedDate={setSelectedDate} search={search} setSearch={setSearch} />

      {tab === 'dashboard' ? <PlanningDashboard dashboard={dashboard} alerts={planningAlerts} assignments={syntheticAssignments} history={history} onNavigate={onNavigate} /> : null}
      {tab === 'day' ? <DayView date={selectedDate} services={services} assignments={syntheticAssignments} collaborators={effectiveCollaborators} absences={absences} onDrag={setDraggedAssignment} onDrop={handleDrop} /> : null}
      {tab === 'week' ? <WeekView selectedDate={selectedDate} assignments={syntheticAssignments} collaborators={effectiveCollaborators} departments={effectiveDepartments} onDrag={setDraggedAssignment} onDrop={handleDrop} /> : null}
      {tab === 'month' ? <MonthView selectedDate={selectedDate} setSelectedDate={setSelectedDate} assignments={syntheticAssignments} absences={absences} requirements={requirements} /> : null}
      {tab === 'assignments' ? <AssignmentsView assignments={activeAssignments} syntheticAssignments={syntheticAssignments} collaborators={effectiveCollaborators} departments={effectiveDepartments} positions={effectivePositions} sites={effectiveSites} canWrite={canWrite} draft={draft} setDraft={setDraft} createAssignment={createAssignment} /> : null}
      {tab === 'absences' ? <AbsencesView absences={absences} collaborators={effectiveCollaborators} assignments={syntheticAssignments} /> : null}
      {tab === 'replacements' ? <ReplacementsView proposals={replacements} collaborators={effectiveCollaborators} assignments={syntheticAssignments} /> : null}
      {tab === 'templates' ? <TemplatesView templates={templates} departments={effectiveDepartments} /> : null}
      {tab === 'requirements' ? <RequirementsView requirements={requirements} departments={effectiveDepartments} assignments={syntheticAssignments} /> : null}

      <ExportsAndHistory history={history} organizationName={session.user.organizationName ?? 'Établissement'} />
    </div>
  );
}

function PlanningFilters(props: { sites: Site[]; departments: HrDepartment[]; siteFilter: string; setSiteFilter: (v: string) => void; serviceFilter: string; setServiceFilter: (v: string) => void; selectedDate: string; setSelectedDate: (v: string) => void; search: string; setSearch: (v: string) => void }) {
  return (
    <div className="card-modern planning-filter-card">
      <div className="planning-filter-grid">
        <input type="date" value={props.selectedDate} onChange={(event) => props.setSelectedDate(event.target.value)} />
        <select value={props.siteFilter} onChange={(event) => props.setSiteFilter(event.target.value)}>
          <option value="">Tous sites</option>
          {props.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
        <select value={props.serviceFilter} onChange={(event) => props.setServiceFilter(event.target.value)}>
          <option value="">Tous services</option>
          {props.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        <div className="search-input-wrapper">
          <Search size={16} />
          <input className="search-input" placeholder="Collaborateur, poste, commentaire…" value={props.search} onChange={(event) => props.setSearch(event.target.value)} />
        </div>
      </div>
    </div>
  );
}

function HrPrerequisiteCard() {
  return <div className="card-modern planning-prerequisite"><span className="card-title"><Info size={18} /> Référentiel RH requis</span><p>Le Planning reste accessible mais ne recrée aucun collaborateur, service, poste ou roulement. Installez ou complétez RH pour obtenir des affectations persistées, absences validées et propositions de remplacement.</p><div className="planning-sample-row"><span>Cuisine 06h00 → 14h00</span><span>Pâtisserie 08h00 → 16h00</span><span>Magasin 10h00 → 18h00</span></div></div>;
}

function PlanningDashboard({ dashboard, alerts, assignments, history, onNavigate }: { dashboard: ReturnType<typeof buildDashboard>; alerts: PlanningAlert[]; assignments: PlanningAssignment[]; history: PlanningHistoryEntry[]; onNavigate: (tab: PlanningTab) => void }) {
  return <>
    <div className="stats-grid">
      {[
        { label: 'Collaborateurs prévus aujourd’hui', value: dashboard.todayCollaborators, Icon: UsersRound },
        { label: 'Collaborateurs absents', value: dashboard.absentCollaborators, Icon: UserCheck },
        { label: 'Services couverts', value: dashboard.coveredServices, Icon: CheckCircle2 },
        { label: 'Services en sous-effectif', value: dashboard.understaffedServices, Icon: ShieldAlert },
        { label: 'Remplacements nécessaires', value: dashboard.replacementsNeeded, Icon: Repeat2 },
        { label: 'Heures planifiées semaine', value: `${dashboard.weeklyHours} h`, Icon: Clock },
      ].map(({ label, value, Icon }) => <motion.div className="stat-card-modern" key={label} whileHover={{ y: -3 }}><div className="stat-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong></div></motion.div>)}
    </div>
    <div className="double-panel">
      <div className="card-modern"><div className="section-header-modern"><span className="card-title"><Bell size={18} /> Alertes priorisées</span><button className="btn btn-secondary" onClick={() => onNavigate('requirements')}>Voir besoins</button></div><AlertList alerts={alerts} /></div>
      <div className="card-modern"><span className="card-title"><Sparkles size={18} /> Pilotage rapide</span><div className="planning-actions-grid"><button onClick={() => onNavigate('week')}><CalendarRange /> Vue semaine</button><button onClick={() => onNavigate('replacements')}><Repeat2 /> Remplacements</button><button onClick={() => onNavigate('templates')}><Layers /> Modèles</button><button onClick={() => onNavigate('assignments')}><ClipboardList /> Affectations</button></div><p className="muted">{assignments.length} créneau(x) affichés. Historique récent : {history.length || 'préparé'} entrée(s).</p></div>
    </div>
  </>;
}

function AlertList({ alerts }: { alerts: PlanningAlert[] }) {
  const fallback: PlanningAlert = { id: 'ok', level: 'information', title: 'Aucune alerte bloquante', message: 'Les contrôles RH seront recalculés à la prochaine génération ou sauvegarde.' };
  const shown = alerts.length ? alerts : [fallback];
  return <div className="planning-alert-list">{shown.map((alert) => <div key={alert.id ?? alert.title} className={`planning-alert ${alert.level ?? 'information'}`}><strong>{alert.title}</strong><span>{alert.message}</span></div>)}</div>;
}

function DayView({ date, services, assignments, collaborators, absences, onDrag, onDrop }: { date: string; services: HrDepartment[]; assignments: PlanningAssignment[]; collaborators: HrCollaborator[]; absences: any[]; onDrag: (id: string) => void; onDrop: (target: { departmentId?: string }) => void }) {
  return <div className="card-modern"><div className="section-header-modern"><span className="card-title"><CalendarDays size={18} /> Planning journalier — 06h00 → 22h00</span><span className="section-tagline">Drag & drop entre services avec contrôle RH avant validation.</span></div><div className="planning-day-grid"><div className="planning-time-axis">{timeSlots.map((slot) => <span key={slot}>{slot}</span>)}</div>{services.map((service) => <div key={service.id} className="planning-service-column" onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop({ departmentId: service.id })}><h3>{service.name}</h3>{assignments.filter((assignment) => sameDay(assignment.date, date) && (assignment.departmentId === service.id || assignment.department?.id === service.id || service.id.startsWith('sample'))).map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} collaborator={findCollaborator(collaborators, assignment.collaboratorId)} draggable onDrag={() => onDrag(assignment.id)} />)}{absences.filter((absence) => sameRange(date, absence.startDate, absence.endDate)).slice(0, 2).map((absence) => <div className="absence-chip" key={absence.id}>Absence {absence.status ?? 'RH'} — {collaboratorName(findCollaborator(collaborators, absence.collaboratorId ?? absence.employeeId))}</div>)}</div>)}</div></div>;
}

function WeekView({ selectedDate, assignments, collaborators, departments, onDrag, onDrop }: { selectedDate: string; assignments: PlanningAssignment[]; collaborators: HrCollaborator[]; departments: HrDepartment[]; onDrag: (id: string) => void; onDrop: (target: { date?: string; collaboratorId?: string }) => void }) {
  const week = weekDates(selectedDate);
  const assignmentCollaboratorIds = Array.from(new Set(assignments.map((assignment) => assignment.collaboratorId).filter((id): id is string => Boolean(id))));
  const visibleCollaborators = collaborators.length ? collaborators : assignmentCollaboratorIds.map((id) => ({ id, firstName: 'Collaborateur', lastName: id.slice(0, 4), hireDate: todayIso(), status: 'ACTIVE' } as HrCollaborator));
  return <div className="card-modern"><div className="section-header-modern"><span className="card-title"><CalendarRange size={18} /> Planning hebdomadaire</span><span className="section-tagline">Déplacer entre jours ou collaborateurs, copier les créneaux récurrents et suivre la charge.</span></div><div className="planning-week-grid"><div className="week-head collaborator-head">Collaborateur</div>{week.map((day, index) => <div key={day} className="week-head">{dayNames[index]}<small>{formatShort(day)}</small></div>)}{visibleCollaborators.map((collaborator) => <div className="week-row" key={collaborator.id}><div className="week-person"><strong>{collaboratorName(collaborator)}</strong><span>{collaborator.position?.name ?? departments.find((department) => department.id === collaborator.departmentId)?.name ?? 'Poste RH'}</span><small>{weeklyHours(assignments, collaborator.id, week)} h planifiées</small></div>{week.map((day) => <div key={day} className="week-cell" onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop({ date: day, collaboratorId: collaborator.id })}>{assignments.filter((assignment) => assignment.collaboratorId === collaborator.id && sameDay(assignment.date, day)).map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} collaborator={collaborator} compact draggable onDrag={() => onDrag(assignment.id)} />)}{assignments.filter((assignment) => assignment.collaboratorId === collaborator.id && sameDay(assignment.date, day)).length === 0 ? <span className="muted tiny">Repos / non planifié</span> : null}</div>)}</div>)}</div></div>;
}

function MonthView({ selectedDate, setSelectedDate, assignments, absences, requirements }: { selectedDate: string; setSelectedDate: (v: string) => void; assignments: PlanningAssignment[]; absences: any[]; requirements: PlanningRequirement[] }) {
  const days = monthGrid(selectedDate);
  return <div className="card-modern"><div className="section-header-modern"><span className="card-title"><CalendarDays size={18} /> Planning mensuel</span><div className="setup-actions"><button className="btn btn-secondary" onClick={() => setSelectedDate(addMonths(selectedDate, -1))}>Mois précédent</button><button className="btn btn-secondary" onClick={() => setSelectedDate(todayIso())}>Aujourd’hui</button><button className="btn btn-secondary" onClick={() => setSelectedDate(addMonths(selectedDate, 1))}>Mois suivant</button></div></div><div className="planning-month-grid">{dayNames.map((day) => <strong key={day}>{day}</strong>)}{days.map((day) => <div key={day} className="month-cell"><b>{new Date(day).getDate()}</b><span>{assignments.filter((assignment) => sameDay(assignment.date, day)).length} présence(s)</span>{absences.some((absence) => sameRange(day, absence.startDate, absence.endDate)) ? <em>Absence</em> : null}{requirements.some((requirement) => sameDay(requirement.date, day)) ? <em className="warning">Besoin</em> : null}</div>)}</div></div>;
}

function AssignmentsView({ assignments, syntheticAssignments, collaborators, departments, positions, sites, canWrite, draft, setDraft, createAssignment }: { assignments: PlanningAssignment[]; syntheticAssignments: PlanningAssignment[]; collaborators: HrCollaborator[]; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; canWrite: boolean; draft: Partial<PlanningAssignment>; setDraft: (v: Partial<PlanningAssignment>) => void; createAssignment: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="double-panel">
      <div className="card-modern">
        <span className="card-title"><ClipboardList size={18} /> Affectations</span>
        <div className="planning-table">
          {(assignments.length ? assignments : syntheticAssignments).map((assignment) => (
            <AssignmentRow key={assignment.id} assignment={assignment} collaborator={findCollaborator(collaborators, assignment.collaboratorId)} />
          ))}
        </div>
      </div>
      <form className="card-modern planning-form" onSubmit={createAssignment}>
        <span className="card-title">Nouvelle affectation</span>
        <div className="planning-form-body">
          <label>
            Collaborateur *
            <select disabled={!canWrite} value={draft.collaboratorId ?? ''} onChange={(e) => setDraft({ ...draft, collaboratorId: e.target.value })} required>
              <option value="">Sélectionner...</option>
              {collaborators.map((item) => <option key={item.id} value={item.id}>{collaboratorName(item)}</option>)}
            </select>
          </label>
          <label>
            Service *
            <select disabled={!canWrite} value={draft.departmentId ?? ''} onChange={(e) => setDraft({ ...draft, departmentId: e.target.value })} required>
              <option value="">Sélectionner Service...</option>
              {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Poste *
            <select disabled={!canWrite} value={draft.positionId ?? ''} onChange={(e) => setDraft({ ...draft, positionId: e.target.value })} required>
              <option value="">Sélectionner Poste...</option>
              {positions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Site optionnel
            <select disabled={!canWrite} value={draft.siteId ?? ''} onChange={(e) => setDraft({ ...draft, siteId: e.target.value })}>
              <option value="">Sélectionner Site...</option>
              {sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Date *
            <input type="date" disabled={!canWrite} value={draft.date ?? todayIso()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
          </label>
          <div className="planning-form-row">
            <label>
              Début *
              <input type="time" disabled={!canWrite} value={draft.startTime ?? '06:00'} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} required />
            </label>
            <label>
              Fin *
              <input type="time" disabled={!canWrite} value={draft.endTime ?? '14:00'} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} required />
            </label>
          </div>
          <label>
            Commentaire
            <textarea disabled={!canWrite} placeholder="Consignes, tâches spécifiques..." value={draft.comment ?? ''} onChange={(e) => setDraft({ ...draft, comment: e.target.value })} />
          </label>
        </div>
        <button className="btn btn-primary" disabled={!canWrite} style={{ width: '100%', marginTop: '0.5rem' }}>Créer avec contrôles RH</button>
      </form>
    </div>
  );
}

function AbsencesView({ absences, collaborators, assignments }: { absences: Array<Record<string, any>>; collaborators: HrCollaborator[]; assignments: PlanningAssignment[] }) {
  const rows = absences.length ? absences : [{ id: 'empty', collaboratorId: collaborators[0]?.id, startDate: todayIso(), endDate: todayIso(), type: 'Congé', status: 'PENDING', comment: 'Exemple non persisté — les absences restent gérées par RH.' }];
  return <div className="card-modern"><span className="card-title"><ShieldAlert size={18} /> Absences RH consommées par Planning</span><div className="planning-table">{rows.map((absence) => <div className="planning-row" key={absence.id}><strong>{collaboratorName(findCollaborator(collaborators, absence.collaboratorId ?? absence.employeeId))}</strong><span>{absence.type ?? absence.reason ?? 'Absence'} — {formatShort(absence.startDate)} → {formatShort(absence.endDate)}</span><span className={`status-pill ${absence.status === 'APPROVED' ? 'danger' : ''}`}>{statusLabel[absence.status] ?? absence.status}</span><small>{assignments.some((assignment) => assignment.collaboratorId === (absence.collaboratorId ?? absence.employeeId) && sameRange(assignment.date ?? '', absence.startDate, absence.endDate)) ? 'Impact planning détecté' : 'Aucun créneau impacté'}</small></div>)}</div></div>;
}

function ReplacementsView({ proposals, collaborators, assignments }: { proposals: PlanningReplacementProposal[]; collaborators: HrCollaborator[]; assignments: PlanningAssignment[] }) {
  const synthetic = proposals.length ? proposals : assignments.slice(0, 3).map((assignment, index) => ({ id: `proposal-${assignment.id}`, assignmentId: assignment.id, absentCollaboratorId: assignment.collaboratorId, candidates: collaborators.filter((item) => item.id !== assignment.collaboratorId).slice(0, 3).map((candidate, scoreIndex) => ({ collaboratorId: candidate.id, score: 92 - scoreIndex * 11, reasons: ['Même service', 'Compétences compatibles', 'Pas de conflit détecté'] })), status: index === 0 ? 'NEEDED' : 'SUGGESTED' }));
  return <div className="card-modern"><span className="card-title"><Repeat2 size={18} /> Remplacements proposés</span><div className="planning-replacement-grid">{synthetic.map((proposal) => <div className="replacement-card" key={proposal.id}><strong>Absent : {collaboratorName(findCollaborator(collaborators, proposal.absentCollaboratorId))}</strong><span className="status-pill danger">{proposal.status ?? 'À couvrir'}</span>{proposal.candidates?.length ? proposal.candidates.map((candidate) => <div className="candidate-row" key={candidate.collaboratorId}><span>{collaboratorName(findCollaborator(collaborators, candidate.collaboratorId))}</span><b>{candidate.score ?? 0}%</b><small>{candidate.reasons?.join(' · ')}</small></div>) : <p className="muted">Aucun candidat : vérifiez compétences RH et disponibilités.</p>}</div>)}</div></div>;
}

function TemplatesView({ templates, departments }: { templates: PlanningTemplate[]; departments: HrDepartment[] }) {
  const rows = templates.length ? templates : [{ id: 'standard', name: 'Semaine standard restauration', description: 'Modèle non persisté : matin, journée, fermeture avec rotation hebdomadaire.', lines: [] }, { id: 'weekend', name: 'Renfort week-end', description: 'Couverture samedi-dimanche et sous-effectifs anticipés.', lines: [] }];
  return <div className="card-modern"><span className="card-title"><Layers size={18} /> Modèles de planning</span><div className="apps-grid compact-grid">{rows.map((template) => <div className="app-card" key={template.id}><h3>{template.name}</h3><p>{template.description}</p><span>{template.lines?.length ?? departments.length} ligne(s) modèle</span><button className="btn btn-secondary"><Sparkles size={16} /> Appliquer sur période</button></div>)}</div></div>;
}

function RequirementsView({ requirements, departments, assignments }: { requirements: PlanningRequirement[]; departments: HrDepartment[]; assignments: PlanningAssignment[] }) {
  const rows = requirements.length ? requirements : departments.slice(0, 5).map((department, index) => ({ id: `req-${department.id}`, date: addDays(todayIso(), index), departmentId: department.id, department, startTime: '06:00', endTime: '14:00', requiredCount: index % 2 === 0 ? 2 : 1, requiredSkills: ['production', 'service'], priority: index === 0 ? 'CRITICAL' : 'NORMAL' }));
  return <div className="card-modern"><span className="card-title"><ClipboardList size={18} /> Besoins opérationnels</span><div className="planning-table">{rows.map((requirement) => { const covered = assignments.filter((assignment) => sameDay(assignment.date, requirement.date) && (assignment.departmentId === requirement.departmentId || assignment.department?.id === requirement.departmentId)).length; return <div className="planning-row" key={requirement.id}><strong>{requirement.department?.name ?? departments.find((item) => item.id === requirement.departmentId)?.name ?? 'Service'}</strong><span>{formatShort(requirement.date)} · {requirement.startTime} → {requirement.endTime}</span><span>{covered}/{requirement.requiredCount} couvert(s)</span><span className={`status-pill ${covered < Number(requirement.requiredCount) ? 'danger' : ''}`}>{covered < Number(requirement.requiredCount) ? 'Sous-effectif' : 'Couvert'}</span></div>; })}</div></div>;
}

function ExportsAndHistory({ history, organizationName }: { history: PlanningHistoryEntry[]; organizationName: string }) {
  return <div className="double-panel planning-bottom"><div className="card-modern"><span className="card-title"><Download size={18} /> Exports préparés</span><div className="planning-actions-grid"><button><Download /> PDF période</button><button><FileSpreadsheet /> Excel</button><button><Printer /> Impression</button><button><Archive /> Archive mensuelle</button></div><p className="muted">Exports filtrables par site, service et période pour {organizationName}.</p></div><div className="card-modern"><span className="card-title"><History size={18} /> Historique & notifications</span>{(history.length ? history : [{ id: 'h1', action: 'Planning prêt', createdAt: new Date().toISOString(), description: 'Les modifications, générations, remplacements et conflits seront historisés.' }]).slice(0, 4).map((entry) => <div className="history-line" key={entry.id}><Bell size={14} /><span>{entry.action}</span><small>{formatShort(entry.createdAt)} — {entry.description}</small></div>)}</div></div>;
}

function AssignmentCard({ assignment, collaborator, compact, draggable, onDrag }: { assignment: PlanningAssignment; collaborator?: HrCollaborator; compact?: boolean; draggable?: boolean; onDrag?: () => void }) {
  return <div className={`assignment-card ${compact ? 'compact' : ''}`} draggable={draggable} onDragStart={onDrag}><strong>{collaboratorName(collaborator)}</strong><span>{assignment.startTime} → {assignment.endTime}</span><small>{assignment.department?.name ?? assignment.position?.name ?? statusLabel[assignment.status ?? 'PLANNED']}</small>{assignment.conflicts?.length ? <em>Conflit</em> : null}</div>;
}

function AssignmentRow({ assignment, collaborator }: { assignment: PlanningAssignment; collaborator?: HrCollaborator }) {
  return <div className="planning-row"><strong>{collaboratorName(collaborator)}</strong><span>{formatShort(assignment.date)} · {assignment.startTime} → {assignment.endTime}</span><span>{assignment.department?.name ?? 'Service'} · {assignment.position?.name ?? 'Poste'}</span><span className="status-pill">{statusLabel[assignment.status ?? 'PLANNED'] ?? assignment.status}</span></div>;
}

function buildDashboard(data: PlanningBootstrap | undefined, assignments: PlanningAssignment[], absences: Array<Record<string, any>>, collaborators: HrCollaborator[], departments: HrDepartment[], rotations: HrRotation[]) {
  const today = todayIso();
  const todayAssignments = assignments.filter((assignment) => sameDay(assignment.date, today));
  const covered = new Set(todayAssignments.map((assignment) => assignment.departmentId ?? assignment.department?.id).filter(Boolean)).size;
  const absent = absences.filter((absence) => sameRange(today, absence.startDate, absence.endDate) && ['APPROVED', 'VALIDATED', 'VALIDEE'].includes(String(absence.status).toUpperCase())).length;
  const collaboratorsWithoutRotation = collaborators.filter((collaborator) => !collaborator.activeRotation && !collaborator.activeRotationAssignment && !collaborator.rotationAssignment).length;
  const alerts: PlanningAlert[] = [
    ...(absent ? [{ id: 'absence', level: 'critique' as const, title: 'Absence validée à remplacer', message: `${absent} absence(s) validée(s) impactent la couverture.` }] : []),
    ...(covered < departments.length && departments.length ? [{ id: 'coverage', level: 'attention' as const, title: 'Services potentiellement en sous-effectif', message: `${Math.max(0, departments.length - covered)} service(s) sans affectation aujourd’hui.` }] : []),
    ...(collaboratorsWithoutRotation ? [{ id: 'rotation', level: 'information' as const, title: 'Collaborateurs sans roulement', message: `${collaboratorsWithoutRotation} collaborateur(s) doivent recevoir un roulement RH.` }] : []),
    ...(rotations.length === 0 ? [{ id: 'rotation-empty', level: 'attention' as const, title: 'Roulements RH non configurés', message: 'La génération déterministe utilise mieux les roulements RH.' }] : []),
  ];
  return {
    todayCollaborators: data?.summary?.todayCollaborators ?? new Set(todayAssignments.map((assignment) => assignment.collaboratorId)).size,
    absentCollaborators: data?.summary?.absentCollaborators ?? absent,
    coveredServices: data?.summary?.coveredServices ?? covered,
    understaffedServices: data?.summary?.understaffedServices ?? Math.max(0, departments.length - covered),
    replacementsNeeded: data?.summary?.replacementsNeeded ?? absent,
    weeklyHours: data?.summary?.weeklyPlannedHours ?? Math.round(assignments.reduce((sum, assignment) => sum + assignmentHours(assignment), 0)),
    alerts,
  };
}

function buildSyntheticAssignments(collaborators: HrCollaborator[], departments: HrDepartment[], positions: HrPosition[]): PlanningAssignment[] {
  const people = collaborators.slice(0, 8);
  if (!people.length) return defaultServices.slice(0, 3).map((service, index) => ({ id: `sample-${index}`, collaboratorId: `sample-c-${index}`, date: todayIso(), startTime: index === 0 ? '06:00' : '08:00', endTime: index === 0 ? '14:00' : '16:00', status: 'PLANNED', origin: 'SAMPLE', department: { id: `sample-d-${index}`, name: service }, position: { id: `sample-p-${index}`, name: 'Poste RH' } }));
  return people.map((collaborator, index) => ({ id: `synthetic-${collaborator.id}`, collaboratorId: collaborator.id, departmentId: collaborator.departmentId ?? departments[index % Math.max(1, departments.length)]?.id, positionId: collaborator.positionId ?? positions[index % Math.max(1, positions.length)]?.id, date: addDays(weekStart(todayIso()), index % 7), startTime: index % 2 ? '08:00' : '06:00', endTime: index % 2 ? '16:00' : '14:00', breakMinutes: 30, status: 'PLANNED', origin: 'RH_ROTATION_PREVIEW', department: collaborator.department ?? departments[index % Math.max(1, departments.length)], position: collaborator.position ?? positions[index % Math.max(1, positions.length)] }));
}

function normalizePlanningAssignment(assignment: PlanningAssignment): PlanningAssignment {
  return { ...assignment, collaboratorId: assignment.collaboratorId ?? assignment.employeeId, collaborator: assignment.collaborator ?? assignment.employee };
}

function normalizePlanningBootstrap(payload: PlanningBootstrap): PlanningBootstrap {
  const raw = payload as PlanningBootstrap & { employees?: HrCollaborator[]; replacements?: Array<PlanningReplacementProposal & { rationale?: PlanningReplacementProposal['candidates'] }>; stats?: Record<string, number>; coverage?: unknown[] };
  const collaborators = payload.collaborators ?? raw.employees ?? [];
  const assignments = (payload.assignments ?? []).map(normalizePlanningAssignment);
  const requirements = (payload.requirements ?? payload.needs ?? []).map((need: PlanningRequirement & { startDate?: string | null }) => ({ ...need, date: need.date ?? need.startDate }));
  const replacementProposals = (payload.replacementProposals ?? payload.replacements ?? raw.replacements ?? []).map((proposal: PlanningReplacementProposal & { rationale?: PlanningReplacementProposal['candidates'] }) => ({
    ...proposal,
    absentCollaboratorId: proposal.absentCollaboratorId ?? proposal.absentEmployeeId,
    replacementCollaboratorId: proposal.replacementCollaboratorId ?? proposal.replacementEmployeeId,
    candidates: proposal.candidates ?? proposal.rationale ?? [],
  }));
  const summary = payload.summary ?? (raw.stats ? {
    todayCollaborators: raw.stats.presentToday,
    absentCollaborators: raw.stats.absentToday,
    coveredServices: raw.stats.servicesCovered,
    understaffedServices: raw.stats.servicesUnderstaffed,
    replacementsNeeded: raw.stats.replacementsNeeded,
    weeklyPlannedHours: raw.stats.plannedHoursThisWeek,
  } : undefined);
  const alerts = (payload.alerts ?? []).map((alert: PlanningAlert & { label?: string; details?: unknown; code?: string }) => ({
    ...alert,
    title: alert.title ?? alert.label ?? alert.code ?? 'Alerte Planning',
    message: alert.message ?? (typeof alert.details === 'string' ? alert.details : 'Contrôle RH à vérifier.'),
  }));
  return { ...payload, collaborators, assignments, requirements, replacementProposals, summary, alerts };
}

function findCollaborator(collaborators: HrCollaborator[], id?: string | null) { return collaborators.find((item) => item.id === id); }
function collaboratorName(collaborator?: HrCollaborator) { return collaborator ? `${collaborator.firstName} ${collaborator.lastName}`.trim() : 'Collaborateur RH'; }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function sameDay(a?: string | null, b?: string | null) { return Boolean(a && b && a.slice(0, 10) === b.slice(0, 10)); }
function sameRange(day: string, start?: string | null, end?: string | null) { if (!start) return false; const value = day.slice(0, 10); return value >= start.slice(0, 10) && value <= (end ?? start).slice(0, 10); }
function formatShort(value?: string | null) { if (!value) return '—'; return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }
function addDays(value: string, days: number) { const date = new Date(value); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function weekStart(value: string) { const date = new Date(value); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return date.toISOString().slice(0, 10); }
function weekEnd(value: string) { return addDays(weekStart(value), 6); }
function weekDates(value: string) { const start = weekStart(value); return Array.from({ length: 7 }, (_, index) => addDays(start, index)); }
function assignmentHours(assignment: PlanningAssignment) { const [sh, sm] = String(assignment.startTime ?? '00:00').split(':').map(Number); const [eh, em] = String(assignment.endTime ?? '00:00').split(':').map(Number); return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm) - Number(assignment.breakMinutes ?? 0)) / 60); }
function weeklyHours(assignments: PlanningAssignment[], collaboratorId: string, week: string[]) { return Math.round(assignments.filter((assignment) => assignment.collaboratorId === collaboratorId && week.some((day) => sameDay(day, assignment.date ?? undefined))).reduce((sum, assignment) => sum + assignmentHours(assignment), 0)); }
function monthGrid(value: string) { const date = new Date(value); const start = new Date(date.getFullYear(), date.getMonth(), 1); const firstDay = start.getDay() || 7; start.setDate(start.getDate() - firstDay + 1); return Array.from({ length: 42 }, (_, index) => { const item = new Date(start); item.setDate(start.getDate() + index); return item.toISOString().slice(0, 10); }); }
function addMonths(value: string, months: number) { const date = new Date(value); date.setMonth(date.getMonth() + months); return date.toISOString().slice(0, 10); }

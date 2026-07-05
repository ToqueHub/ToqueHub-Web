import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Coins,
  FileSignature,
  Info,
  Layers,
  ListChecks,
  RefreshCw,
  Repeat2,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { ApiError, api } from '../api/client';
import type {
  HrCollaborator,
  HrDepartment,
  HrPosition,
  PlanningAlert,
  PlanningAssignment,
  PlanningBootstrap,
  PlanningDashboardResponse,
  PlanningDayPresetPayload,
  PlanningEmployeeTemplateAssignment,
  PlanningPeriodStatus,
  PlanningRequirement,
  PlanningReplacementProposal,
  PlanningSummary,
  PlanningTemplate,
  PlanningTemplateDay,
  PlanningWeeklyRotationPayload,
  Site,
  UserSession,
} from '../types';

type PlanningTab = 'dashboard' | 'planning' | 'settings' | 'attendance';
type PlanningView = 'day' | 'week' | 'month' | 'year';
type SettingKey = 'needs' | 'presets' | 'availability' | 'rules' | 'costs' | 'notifications' | 'exports' | 'imports';
type InitialPlanningStep = 'services' | 'needs' | 'presets' | 'done';
type DashboardPeriod = 'week' | 'month' | 'year';
type PlanningDashboardBlockKey = 'periodStatus' | 'planningSetup' | 'plannedHours' | 'estimatedCost' | 'activeAlerts' | 'alertsToReview' | 'planning' | 'departmentHours' | 'actions' | 'history';
type PlanningBlockMode = 'day' | 'week' | 'month';
type PlanningBlockSize = 'small' | 'medium' | 'large';
type PlanningDashboardConfig = {
  blocks: Record<PlanningDashboardBlockKey, boolean>;
  pinnedBlockIds: PlanningDashboardBlockKey[];
  planningBlockMode: PlanningBlockMode;
  planningBlockSize: PlanningBlockSize;
};
type DashboardPeriodRange = { startDate: string; endDate: string; label: string; mode: DashboardPeriod | PlanningBlockMode };
type DashboardPeriodData = { range: DashboardPeriodRange; summary: PlanningDashboardResponse | null; assignments: PlanningAssignment[] };
type PlanningSetupStatus = 'todo' | 'partial' | 'done';
type PlanningRotationOption = Pick<PlanningTemplate, 'id' | 'name' | 'description' | 'departmentId' | 'siteId' | 'days' | 'employeeIds' | 'source' | 'templateType'>;
type PlanningSetupStep = {
  key: string;
  title: string;
  description: string;
  status: PlanningSetupStatus;
  actionLabel?: string;
  action?: () => void;
};
type QuickAssignmentSelection = {
  kind: 'day-preset' | 'custom' | 'weekly-rotation';
  label: string;
  startTime: string;
  endTime: string;
  businessStatus: string;
  origin?: string;
  templateId?: string;
  preset?: Partial<PlanningAssignment>;
  rotation?: PlanningRotationOption;
};
type CalendarAssignmentGroup = {
  employeeId: string;
  collaborator?: HrCollaborator;
  assignments: PlanningAssignment[];
  businessStatus: string;
  hasConflict: boolean;
};
type RequirementPayload = Partial<PlanningRequirement> & {
  departmentId: string;
  startDate: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  season?: string;
  timeSlot?: string;
};

type Props = {
  token: string;
  tab: PlanningTab;
  session: UserSession;
  collaborators: HrCollaborator[];
  departments: HrDepartment[];
  positions: HrPosition[];
  sites: Site[];
  canWrite: boolean;
  dashboardCustomizeSignal?: number;
  onDashboardCustomizeSignalConsumed?: () => void;
  onNavigate: (tab: PlanningTab) => void;
};

const tabLabels: Array<[PlanningTab, string]> = [
  ['dashboard', 'Dashboard'],
  ['planning', 'Planning'],
  ['settings', 'Paramétrage'],
  ['attendance', 'Émargement'],
];

const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

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
  NON_SIGNE: 'Non signé',
  SIGNE: 'Signé',
  A_VALIDER: 'À valider',
  VALIDE: 'Validé',
  ANOMALIE: 'Anomalie',
};

const PLANNING_INITIAL_SETUP_PREFIX = 'toquehub.planning.initialSetup.completed';
const PLANNING_DASHBOARD_CONFIG_KEY = 'toquehub.planning.dashboard.config';
const defaultPlanningDashboardConfig: PlanningDashboardConfig = {
  pinnedBlockIds: ['periodStatus', 'planning'],
  planningBlockMode: 'day',
  planningBlockSize: 'medium',
  blocks: {
    periodStatus: true,
    planningSetup: true,
    plannedHours: true,
    estimatedCost: true,
    activeAlerts: true,
    alertsToReview: true,
    planning: true,
    departmentHours: true,
    actions: true,
    history: true,
  },
};
const initialPlanningSteps: InitialPlanningStep[] = ['services', 'needs', 'presets', 'done'];
const planningBusinessStatuses = [
  { value: 'work', label: 'Travail', className: 'work', countsHours: true },
  { value: 'rest', label: 'Repos', className: 'rest', countsHours: false },
  { value: 'vacation', label: 'Vacances', className: 'vacation', countsHours: false },
  { value: 'sick', label: 'Maladie', className: 'sick', countsHours: true },
  { value: 'vv', label: 'VV', className: 'vv', countsHours: false },
  { value: 'leave', label: 'Congé', className: 'leave', countsHours: false },
  { value: 'other', label: 'Autre', className: 'other', countsHours: false },
];

export function PlanningApp({ token, tab, session, collaborators, departments, positions, sites, canWrite, dashboardCustomizeSignal, onDashboardCustomizeSignalConsumed, onNavigate }: Props) {
  const [data, setData] = useState<PlanningBootstrap>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [siteFilter, setSiteFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [seasonalTemplateId, setSeasonalTemplateId] = useState('');
  const [search, setSearch] = useState('');
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('month');
  const [planningView, setPlanningView] = useState<PlanningView>('month');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [customStart, setCustomStart] = useState('10:00');
  const [customEnd, setCustomEnd] = useState('17:00');
  const [quickBusinessStatus, setQuickBusinessStatus] = useState('work');
  const [lastCustomSignature, setLastCustomSignature] = useState('');
  const [quickPanelOpen, setQuickPanelOpen] = useState(true);
  const [quickAssignmentSelection, setQuickAssignmentSelection] = useState<QuickAssignmentSelection | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<PlanningAssignment | null>(null);
  const [selectedSetting, setSelectedSetting] = useState<SettingKey>('needs');
  const [dashboardConfig, setDashboardConfig] = useState<PlanningDashboardConfig>(() => loadPlanningDashboardConfig());
  const [dashboardPeriodData, setDashboardPeriodData] = useState<DashboardPeriodData | null>(null);
  const [showDashboardCustomizer, setShowDashboardCustomizer] = useState(false);
  const planningSetupStorageKey = `${PLANNING_INITIAL_SETUP_PREFIX}.${session.user.organizationId ?? session.user.id}`;
  const [initialSetupCompleted, setInitialSetupCompleted] = useState(() => localStorage.getItem(planningSetupStorageKey) === 'true');
  const [showInitialSetup, setShowInitialSetup] = useState(() => localStorage.getItem(planningSetupStorageKey) !== 'true');
  const [initialSetupStep, setInitialSetupStep] = useState<InitialPlanningStep>('services');

  useEffect(() => {
    const completed = localStorage.getItem(planningSetupStorageKey) === 'true';
    setInitialSetupCompleted(completed);
    setShowInitialSetup(!completed);
  }, [planningSetupStorageKey]);

  useEffect(() => {
    void loadContext({ showLoading: !data });
  }, [token, selectedDate, siteFilter, serviceFilter, employeeFilter, seasonalTemplateId]);

  useEffect(() => {
    let cancelled = false;
    const range = getDashboardPeriodRange(dashboardPeriod, selectedDate);
    async function loadDashboardPeriod() {
      try {
        const params = {
          startDate: range.startDate,
          endDate: range.endDate,
          siteId: siteFilter || undefined,
          departmentId: serviceFilter || undefined,
          employeeId: employeeFilter || undefined,
        };
        const summary = await api.planningDashboard(token, params);
        if (!cancelled) setDashboardPeriodData({ range, summary, assignments: [] });
      } catch {
        if (!cancelled) setDashboardPeriodData({ range, summary: null, assignments: [] });
      }
    }
    void loadDashboardPeriod();
    return () => { cancelled = true; };
  }, [token, dashboardPeriod, selectedDate, siteFilter, serviceFilter, employeeFilter]);

  useEffect(() => {
    if (!dashboardCustomizeSignal) return;
    setShowDashboardCustomizer(true);
    onDashboardCustomizeSignalConsumed?.();
  }, [dashboardCustomizeSignal, onDashboardCustomizeSignalConsumed]);

  useEffect(() => {
    if (tab !== 'dashboard') setShowDashboardCustomizer(false);
  }, [tab]);

  useEffect(() => {
    localStorage.setItem(PLANNING_DASHBOARD_CONFIG_KEY, JSON.stringify(dashboardConfig));
  }, [dashboardConfig]);

  async function loadContext(options: { showLoading?: boolean } = {}) {
    let mounted = true;
    const showLoading = options.showLoading ?? !data;
    if (showLoading) setLoading(true);
    setError(undefined);
    const selected = new Date(selectedDate);
    try {
      const payload = await api.planningContext(token, {
        month: selected.getMonth() + 1,
        year: selected.getFullYear(),
        siteId: siteFilter || undefined,
        departmentId: serviceFilter || undefined,
        employeeId: employeeFilter || undefined,
        seasonalTemplateId: seasonalTemplateId || undefined,
      });
      if (mounted) setData(normalizePlanningBootstrap(payload));
    } catch (err) {
      if (mounted && !(err instanceof ApiError && err.status === 404)) setError(err instanceof Error ? err.message : 'Planning indisponible');
    } finally {
      if (mounted && showLoading) setLoading(false);
    }
    return () => { mounted = false; };
  }

  const effectiveCollaborators = data?.collaborators?.length ? data.collaborators : collaborators;
  const effectiveDepartments = data?.departments?.length ? data.departments : departments;
  const effectivePositions = data?.positions?.length ? data.positions : positions;
  const effectiveSites = data?.sites?.length ? data.sites : sites;
  const templates = data?.templates ?? [];
  const planningDayPresets = planningSettingsArray<PlanningTemplate>(data?.settings, 'dayPresets').length ? planningSettingsArray<PlanningTemplate>(data?.settings, 'dayPresets') : dayPresetTemplates(templates);
  const planningWeeklyRotations = planningSettingsArray<PlanningTemplate>(data?.settings, 'weeklyRotations');
  const effectiveRotations: PlanningRotationOption[] = planningWeeklyRotations;
  const employeeTemplateAssignments = planningSettingsArray<PlanningEmployeeTemplateAssignment>(data?.settings, 'employeeTemplateAssignments');
  const assignments = data?.assignments ?? [];
  const absences = data?.absences ?? [];
  const requirements = data?.requirements ?? [];
  const replacements = data?.replacementProposals ?? [];
  const alerts = data?.alerts ?? [];
  const attendanceRows = Array.isArray(data?.attendance?.rows) ? data.attendance.rows as Array<Record<string, any>> : [];
  const periodStatus = data?.periodStatus ?? data?.planning?.periodStatus as PlanningPeriodStatus | undefined;
  const periodPayload = currentMonthPeriod(selectedDate, siteFilter);
  const selectedEmployee = findCollaborator(effectiveCollaborators, selectedEmployeeId || employeeFilter);

  const filteredAssignments = useMemo(() => assignments.filter((assignment) => {
    const collaborator = findCollaborator(effectiveCollaborators, assignment.collaboratorId);
    const haystack = [collaboratorName(collaborator), assignment.department?.name, assignment.position?.name, assignment.comment].join(' ').toLowerCase();
    return (!siteFilter || assignment.siteId === siteFilter || assignment.site?.id === siteFilter) &&
      (!serviceFilter || assignment.departmentId === serviceFilter || assignment.department?.id === serviceFilter) &&
      (!employeeFilter || assignment.collaboratorId === employeeFilter || assignment.employeeId === employeeFilter) &&
      haystack.includes(search.toLowerCase());
  }), [assignments, effectiveCollaborators, siteFilter, serviceFilter, employeeFilter, search]);

  const dashboard = buildDashboard(data, filteredAssignments, alerts, replacements, requirements);
  const monthDays = data?.planning?.month?.days as Array<Record<string, any>> | undefined;
  const hasHrBase = effectiveCollaborators.length > 0 && effectiveDepartments.length > 0 && effectivePositions.length > 0;
  const setup = buildPlanningSetup({
    collaborators: effectiveCollaborators,
    departments: effectiveDepartments,
    requirements,
    templates,
    onNavigate,
    openSetting,
  });

  function openSetting(setting: SettingKey) {
    setSelectedSetting(setting);
    onNavigate('settings');
  }

  function openInitialSetup(step: InitialPlanningStep = 'services') {
    setInitialSetupStep(step);
    setShowInitialSetup(true);
  }

  function completeInitialSetup() {
    localStorage.setItem(planningSetupStorageKey, 'true');
    setInitialSetupCompleted(true);
    setShowInitialSetup(false);
    onNavigate('planning');
  }

  async function createQuickAssignment(startTime: string, endTime: string, origin = 'MANUAL', templateId?: string, preset?: Partial<PlanningAssignment>, dateOverride?: string, businessStatusOverride?: string) {
    if (!canWrite) return;
    const collaborator = selectedEmployee;
    if (!collaborator) {
      setNotice('Sélectionnez d’abord un collaborateur pour affecter un créneau.');
      return;
    }
    const date = dateOverride ?? selectedDate;
    const businessStatus = cleanBusinessStatus(businessStatusOverride ?? presetBusinessStatus(preset) ?? quickBusinessStatus);
    const effectiveStart = businessStatusCountsHours(businessStatus) ? startTime : (startTime || '00:00');
    const effectiveEnd = businessStatusCountsHours(businessStatus) ? endTime : (endTime || startTime || '00:00');
    const overlap = assignments.find((assignment) => {
      const employeeId = assignment.collaboratorId ?? assignment.employeeId;
      return employeeId === collaborator.id && assignment.status !== 'CANCELLED' && sameDay(assignment.date, date) && rangesOverlap(effectiveStart, effectiveEnd, assignment.startTime, assignment.endTime);
    });
    if (overlap) {
      setError(`${collaboratorName(collaborator)} a déjà une affectation qui chevauche ce créneau.`);
      return;
    }
    const departmentId = preset?.departmentId || collaborator.departmentId || serviceFilter || effectiveDepartments[0]?.id;
    const positionId = preset?.positionId || collaborator.positionId || effectivePositions.find((position) => position.departmentId === departmentId)?.id || effectivePositions[0]?.id;
    if (!departmentId || !positionId) {
      setError('Référentiel RH incomplet : service et poste sont requis pour créer une affectation.');
      return;
    }
    try {
      await api.upsertPlanningDayAssignment(token, {
        employeeId: collaborator.id,
        departmentId,
        positionId,
        siteId: preset?.siteId || siteFilter || collaborator.mainSiteId || collaborator.siteId || effectiveSites[0]?.id,
        date,
        startTime: effectiveStart,
        endTime: effectiveEnd,
        breakMinutes: preset?.breakMinutes ?? 30,
        status: 'PLANNED',
        origin,
        templateId,
        comment: serializeAssignmentMeta({ businessStatus }),
      });
      setNotice(`Affectation ajoutée le ${formatShort(date)} pour ${collaboratorName(collaborator)}.`);
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible');
    }
  }

  function saveCustomShift() {
    if (!selectedEmployee || !selectedDate || !customStart || !customEnd) return;
    const signature = `${selectedDate}:${selectedEmployee.id}:${customStart}-${customEnd}`;
    if (signature === lastCustomSignature) return;
    setLastCustomSignature(signature);
    setQuickAssignmentSelection({ kind: 'custom', label: `Personnalisé ${customStart} - ${customEnd}`, startTime: customStart, endTime: customEnd, businessStatus: quickBusinessStatus, origin: 'MANUAL' });
    setNotice(`Mode affectation activé : ${collaboratorName(selectedEmployee)} - Personnalisé ${customStart} - ${customEnd} - ${businessStatusLabel(quickBusinessStatus)}`);
  }

  async function updateAssignment(assignment: PlanningAssignment, patch: Partial<PlanningAssignment> & { businessStatus?: string }) {
    if (!canWrite) return;
    const employeeId = patch.employeeId ?? patch.collaboratorId ?? assignment.employeeId ?? assignment.collaboratorId;
    const departmentId = patch.departmentId ?? assignment.departmentId;
    const positionId = patch.positionId ?? assignment.positionId;
    const date = normalizePlanningDate(patch.date ?? assignment.date);
    const businessStatus = cleanBusinessStatus(patch.businessStatus ?? assignmentBusinessStatus(assignment));
    const startTime = patch.startTime ?? assignment.startTime ?? '00:00';
    const endTime = patch.endTime ?? assignment.endTime ?? startTime;
    if (!employeeId || !departmentId || !positionId || !date) {
      setError('Affectation incomplète : collaborateur, service, poste et date sont nécessaires.');
      return;
    }
    const overlap = assignments.find((item) => {
      const itemEmployeeId = item.employeeId ?? item.collaboratorId;
      return item.id !== assignment.id && item.status !== 'CANCELLED' && itemEmployeeId === employeeId && sameDay(item.date, date) && rangesOverlap(startTime, endTime, item.startTime, item.endTime);
    });
    if (overlap) {
      setError('Ce collaborateur a déjà un créneau qui chevauche cet horaire.');
      return;
    }
    try {
      await api.updatePlanningAssignment(token, assignment.id, {
        employeeId,
        departmentId,
        positionId,
        siteId: patch.siteId ?? assignment.siteId ?? undefined,
        date,
        startTime,
        endTime,
        breakMinutes: Number(patch.breakMinutes ?? assignment.breakMinutes ?? 0),
        status: patch.status ?? assignment.status ?? 'PLANNED',
        origin: patch.origin ?? assignment.origin ?? 'MANUAL',
        comment: serializeAssignmentMeta({ businessStatus }),
      });
      setEditingAssignment(null);
      setNotice(patch.status === 'CANCELLED' ? 'Affectation supprimée du planning.' : 'Affectation modifiée.');
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Modification impossible');
    }
  }

  async function deleteAssignment(assignment: PlanningAssignment) {
    await updateAssignment(assignment, { status: 'CANCELLED' });
  }

  async function saveDayPreset(payload: PlanningDayPresetPayload, id?: string) {
    if (!canWrite) return;
    try {
      if (id) await api.updatePlanningDayPreset(token, id, payload);
      else await api.createPlanningDayPreset(token, payload);
      setNotice(id ? 'Preset jour modifié.' : 'Preset jour créé.');
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement du preset impossible');
    }
  }

  async function deleteDayPreset(id: string) {
    if (!canWrite || !window.confirm('Archiver ce preset jour ?')) return;
    try {
      await api.deletePlanningDayPreset(token, id);
      setNotice('Preset jour archivé.');
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archivage du preset impossible');
    }
  }

  async function saveWeeklyRotation(payload: PlanningWeeklyRotationPayload, id?: string) {
    if (!canWrite) return;
    try {
      if (id) await api.updatePlanningWeeklyRotation(token, id, payload);
      else await api.createPlanningWeeklyRotation(token, payload);
      setNotice(id ? 'Roulement Planning modifié.' : 'Roulement Planning créé.');
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement du roulement impossible');
    }
  }

  async function deleteWeeklyRotation(id: string) {
    if (!canWrite || !window.confirm('Archiver ce roulement Planning ?')) return;
    try {
      await api.deletePlanningWeeklyRotation(token, id);
      setNotice('Roulement Planning archivé.');
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archivage du roulement impossible');
    }
  }

  async function saveEmployeeTemplateAssignment(payload: PlanningEmployeeTemplateAssignment) {
    if (!canWrite) return;
    try {
      await api.setPlanningEmployeeTemplates(token, payload);
      setNotice('Attribution collaborateur enregistrée.');
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attribution impossible');
    }
  }

  async function applyRotation(rotation: PlanningRotationOption, dateOverride?: string) {
    if (!selectedEmployee) {
      setNotice('Sélectionnez d’abord un collaborateur pour appliquer un roulement.');
      return;
    }
    const targetDate = dateOverride ?? selectedDate;
    try {
      const result = await api.applyPlanningRotation(token, rotation.id, {
        employeeId: selectedEmployee.id,
        siteId: siteFilter || undefined,
        startDate: weekStart(targetDate),
        endDate: weekEnd(targetDate),
        replaceExisting: true,
      });
      setNotice(`${result.appliedAssignments?.length ?? 0} affectation(s) appliquée(s) sur la semaine du ${formatShort(weekStart(targetDate))}.`);
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Application du roulement impossible');
    }
  }

  async function saveRequirement(payload: RequirementPayload, id?: string) {
    if (!canWrite) return;
    try {
      if (id) await api.updatePlanningRequirement(token, id, payload);
      else await api.createPlanningRequirement(token, payload);
      setNotice(id ? 'Besoin par service modifié.' : 'Besoin par service créé.');
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement du besoin impossible');
    }
  }

  async function deleteRequirement(id: string) {
    if (!canWrite) return;
    const confirmed = window.confirm('Supprimer ce besoin par service ? Les alertes de couverture seront recalculées.');
    if (!confirmed) return;
    try {
      await api.deletePlanningRequirement(token, id);
      setNotice('Besoin par service supprimé.');
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression du besoin impossible');
    }
  }

  async function controlPlanningPeriod() {
    if (!canWrite) return;
    try {
      const result = await api.controlPlanningPeriod(token, periodPayload);
      setNotice(result.publishable ? 'Planning contrôlé : aucune alerte bloquante.' : `Planning contrôlé : ${result.control?.blockingAlerts ?? 0} alerte(s) bloquante(s).`);
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Contrôle du planning impossible');
    }
  }

  async function publishPlanningPeriod(force = false) {
    if (!canWrite) return;
    const message = force ? 'Publier malgré les alertes ou sans contrôle complet ?' : 'Publier le planning de la période sélectionnée ?';
    if (!window.confirm(message)) return;
    try {
      await api.publishPlanningPeriod(token, { ...periodPayload, force });
      setNotice('Planning publié. Les notifications salariés sont préparées pour un canal futur.');
      await loadContext({ showLoading: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && !force) {
        const confirmed = window.confirm(`${err.message}. Forcer la publication ?`);
        if (confirmed) await publishPlanningPeriod(true);
        return;
      }
      setError(err instanceof Error ? err.message : 'Publication impossible');
    }
  }

  async function lockPlanningPeriod() {
    if (!canWrite) return;
    if (!window.confirm('Verrouiller cette période pour préparer paie/export ? Les modifications resteront possibles seulement avec avertissement.')) return;
    try {
      await api.lockPlanningPeriod(token, periodPayload);
      setNotice('Période verrouillée pour paie/export futur.');
      await loadContext({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verrouillage impossible');
    }
  }

  return (
    <div className="hr-shell planning-shell">
      <div className="hr-hero planning-hero">
        <div>
          <span className="welcome-tag">ToqueHub Planning</span>
          <h1>Planning</h1>
          <p>Construisez le planning mensuel avec les données RH en lecture seule et les affectations Planning réelles.</p>
        </div>
        <div className="planning-hero-actions">
          <button className="btn btn-secondary" onClick={() => void loadContext()}><RefreshCw size={16} /> Actualiser</button>
          <button className="btn btn-primary" onClick={() => onNavigate('planning')}><CalendarDays size={16} /> Construire</button>
        </div>
      </div>

      <div className="hr-tabs planning-tabs">
        {tabLabels.map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => onNavigate(value)}>{label}</button>)}
      </div>

      {loading ? <div className="card-modern">Chargement du contexte Planning réel...</div> : null}
      {error ? <div className="alert"><AlertTriangle size={16} /> {error}</div> : null}
      {notice ? <div className="success"><CheckCircle2 size={16} /> {notice}</div> : null}
      {!hasHrBase ? <OnboardingCard /> : null}
      {['dashboard', 'planning', 'attendance'].includes(tab) && (tab !== 'dashboard' || dashboardConfig.blocks.periodStatus) ? (
        <PeriodWorkflowPanel
          status={periodStatus}
          canWrite={canWrite}
          onControl={controlPlanningPeriod}
          onPublish={() => publishPlanningPeriod(false)}
          onLock={lockPlanningPeriod}
        />
      ) : null}

      {tab === 'dashboard' ? (
        <PlanningDashboard
          dashboard={dashboard}
          alerts={alerts}
          setup={setup}
          period={dashboardPeriod}
          setPeriod={setDashboardPeriod}
          config={dashboardConfig}
          onConfigChange={setDashboardConfig}
          hoursByDepartment={data?.dashboard?.hoursByDepartment as Array<Record<string, any>> | undefined}
          actions={data?.dashboard?.actions as Array<Record<string, any>> | undefined}
          history={data?.historyHuman}
          assignments={filteredAssignments}
          selectedDate={selectedDate}
          dashboardPeriodData={dashboardPeriodData}
          onOpenPlanning={(view) => { setPlanningView(view); onNavigate('planning'); }}
        />
      ) : null}

      {tab === 'planning' ? (
        <PlanningWorkspace
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          siteFilter={siteFilter}
          setSiteFilter={setSiteFilter}
          serviceFilter={serviceFilter}
          setServiceFilter={setServiceFilter}
          employeeFilter={employeeFilter}
          setEmployeeFilter={setEmployeeFilter}
          seasonalTemplateId={seasonalTemplateId}
          setSeasonalTemplateId={setSeasonalTemplateId}
          search={search}
          setSearch={setSearch}
          sites={effectiveSites}
          departments={effectiveDepartments}
          collaborators={effectiveCollaborators}
          assignments={filteredAssignments}
          requirements={requirements}
          monthDays={monthDays}
          planningView={planningView}
          setPlanningView={setPlanningView}
          selectedEmployeeId={selectedEmployeeId}
          setSelectedEmployeeId={setSelectedEmployeeId}
          selectedEmployee={selectedEmployee}
          templates={templates}
          rotations={effectiveRotations}
          replacements={replacements}
          onOpenSettings={() => openSetting('presets')}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
          quickBusinessStatus={quickBusinessStatus}
          setQuickBusinessStatus={setQuickBusinessStatus}
          saveCustomShift={saveCustomShift}
          createQuickAssignment={createQuickAssignment}
          quickPanelOpen={quickPanelOpen}
          setQuickPanelOpen={setQuickPanelOpen}
          quickAssignmentSelection={quickAssignmentSelection}
          setQuickAssignmentSelection={setQuickAssignmentSelection}
          applyRotation={applyRotation}
          onEditAssignment={setEditingAssignment}
        />
      ) : null}

      {tab === 'settings' ? (
        <PlanningSettings
          selected={selectedSetting}
          setSelected={setSelectedSetting}
          requirements={requirements}
          templates={templates}
          rotations={planningWeeklyRotations}
          dayPresets={planningDayPresets}
          employeeTemplateAssignments={employeeTemplateAssignments}
          absences={absences}
          departments={effectiveDepartments}
          positions={effectivePositions}
          sites={effectiveSites}
          collaborators={effectiveCollaborators}
          settings={data?.settings}
          setup={setup}
          onOpenInitialSetup={() => openInitialSetup('services')}
          selectedDate={selectedDate}
          canWrite={canWrite}
          onSaveRequirement={saveRequirement}
          onDeleteRequirement={deleteRequirement}
          onSaveDayPreset={saveDayPreset}
          onDeleteDayPreset={deleteDayPreset}
          onSaveWeeklyRotation={saveWeeklyRotation}
          onDeleteWeeklyRotation={deleteWeeklyRotation}
          onSaveEmployeeTemplateAssignment={saveEmployeeTemplateAssignment}
        />
      ) : null}

      {tab === 'attendance' ? (
        <AttendanceView rows={attendanceRows} assignments={filteredAssignments} collaborators={effectiveCollaborators} selectedMonth={selectedDate.slice(0, 7)} employeeFilter={employeeFilter} />
      ) : null}

      {showInitialSetup ? (
        <PlanningInitialSetupModal
          step={initialSetupStep}
          setStep={setInitialSetupStep}
          setup={setup}
          departments={effectiveDepartments}
          positions={effectivePositions}
          sites={effectiveSites}
          collaborators={effectiveCollaborators}
          requirements={requirements}
          dayPresets={planningDayPresets}
          canWrite={canWrite}
          selectedDate={selectedDate}
          onSaveRequirement={saveRequirement}
          onDeleteRequirement={deleteRequirement}
          onSaveDayPreset={saveDayPreset}
          onDeleteDayPreset={deleteDayPreset}
          onClose={() => initialSetupCompleted ? setShowInitialSetup(false) : openInitialSetup('services')}
          onComplete={completeInitialSetup}
        />
      ) : null}
      {editingAssignment ? (
        <AssignmentEditModal
          assignment={editingAssignment}
          collaborators={effectiveCollaborators}
          departments={effectiveDepartments}
          positions={effectivePositions}
          sites={effectiveSites}
          canWrite={canWrite}
          onClose={() => setEditingAssignment(null)}
          onSave={updateAssignment}
          onDelete={deleteAssignment}
        />
      ) : null}
      {showDashboardCustomizer ? (
        <PlanningDashboardCustomizer
          config={dashboardConfig}
          onChange={setDashboardConfig}
          onClose={() => setShowDashboardCustomizer(false)}
        />
      ) : null}
    </div>
  );
}

function PlanningInitialSetupModal({
  step,
  setStep,
  setup,
  departments,
  positions,
  sites,
  collaborators,
  requirements,
  dayPresets,
  canWrite,
  selectedDate,
  onSaveRequirement,
  onDeleteRequirement,
  onSaveDayPreset,
  onDeleteDayPreset,
  onClose,
  onComplete,
}: {
  step: InitialPlanningStep;
  setStep: (step: InitialPlanningStep) => void;
  setup: ReturnType<typeof buildPlanningSetup>;
  departments: HrDepartment[];
  positions: HrPosition[];
  sites: Site[];
  collaborators: HrCollaborator[];
  requirements: PlanningRequirement[];
  dayPresets: PlanningTemplate[];
  canWrite: boolean;
  selectedDate: string;
  onSaveRequirement: (payload: RequirementPayload, id?: string) => Promise<void>;
  onDeleteRequirement: (id: string) => Promise<void>;
  onSaveDayPreset: (payload: PlanningDayPresetPayload, id?: string) => Promise<void>;
  onDeleteDayPreset: (id: string) => Promise<void>;
  onClose: () => void;
  onComplete: () => void;
}) {
  const index = initialPlanningSteps.indexOf(step);
  const progress = Math.round(((index + 1) / initialPlanningSteps.length) * 100);
  const canGoBack = index > 0;
  const canGoNext = index < initialPlanningSteps.length - 1;

  function goNext() {
    if (canGoNext) setStep(initialPlanningSteps[index + 1]);
  }

  function goBack() {
    if (canGoBack) setStep(initialPlanningSteps[index - 1]);
  }

  return (
    <div className="modal-overlay hr-wizard-overlay planning-initial-overlay">
      <motion.div className="modal-card hr-wizard-modal planning-initial-modal" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className="hr-wizard-header planning-initial-header">
          <div>
            <span className="welcome-tag">Configuration initiale - {progress}% prêt</span>
            <h2>Préparer Planning</h2>
            <p>Quelques choix simples suffisent. Vous pourrez tout ajuster plus tard dans Paramétrage.</p>
          </div>
          <div className="planning-initial-progress">
            <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
          </div>
        </div>

        <div className="planning-initial-body">
          <div className="planning-initial-rail">
            {setup.steps.slice(0, 4).map((item) => <span key={item.key} className={item.status}>{item.title}</span>)}
          </div>

          {step === 'services' ? <InitialServicesStep departments={departments} collaborators={collaborators} /> : null}
          {step === 'needs' ? <InitialNeedsStep requirements={requirements} departments={departments} positions={positions} sites={sites} selectedDate={selectedDate} canWrite={canWrite} onSaveRequirement={onSaveRequirement} onDeleteRequirement={onDeleteRequirement} /> : null}
          {step === 'presets' ? <InitialPresetsStep dayPresets={dayPresets} departments={departments} positions={positions} sites={sites} canWrite={canWrite} onSaveDayPreset={onSaveDayPreset} onDeleteDayPreset={onDeleteDayPreset} /> : null}
          {step === 'done' ? <InitialDoneStep setup={setup} /> : null}
        </div>

        <div className="hr-catalog-actions sticky planning-initial-actions">
          <button className="btn btn-secondary" type="button" disabled={!canGoBack} onClick={goBack}>Retour</button>
          <div className="setup-actions">
            {step === 'done' ? (
              <button className="btn btn-primary" type="button" onClick={onComplete}>Ouvrir Planning</button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={goNext}>Continuer</button>
            )}
            {step === 'done' ? <button className="btn btn-secondary" type="button" onClick={onClose}>Fermer</button> : null}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function InitialServicesStep({ departments, collaborators }: { departments: HrDepartment[]; collaborators: HrCollaborator[] }) {
  const activeCollaborators = collaborators.filter((item) => item.status === 'ACTIVE' && !item.isArchived && !item.archivedAt);
  const ready = departments.length > 0 && activeCollaborators.length > 0;
  return (
    <div className="planning-initial-step">
      <div className="hr-wizard-hero-card">
        <div className="hr-wizard-icon"><UserRound size={30} /></div>
        <div><h3>Services à planifier</h3><p>Planning réutilise les services et collaborateurs RH. Vous n’avez rien à refaire si RH est prêt.</p></div>
      </div>
      <div className="planning-service-summary">
        <div><strong>{departments.length}</strong><span>services RH détectés</span></div>
        <div><strong>{activeCollaborators.length}</strong><span>collaborateurs actifs</span></div>
        <div className={ready ? 'ready' : 'missing'}><strong>{ready ? 'Validé' : 'À compléter'}</strong><span>{ready ? 'Socle RH suffisant' : 'Ajoutez au moins un service et un collaborateur actif dans RH.'}</span></div>
      </div>
    </div>
  );
}

function InitialNeedsStep(props: { requirements: PlanningRequirement[]; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; selectedDate: string; canWrite: boolean; onSaveRequirement: (payload: RequirementPayload, id?: string) => Promise<void>; onDeleteRequirement: (id: string) => Promise<void> }) {
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<RequirementFormState>(() => defaultRequirementForm(props.selectedDate, props.departments[0]?.id ?? ''));
  const departmentPositions = props.positions.filter((position) => !form.departmentId || position.departmentId === form.departmentId);
  const selectedSlot = requirementSlots.find((item) => item.value === form.timeSlot) ?? requirementSlots[2];

  function update<K extends keyof RequirementFormState>(key: K, value: RequirementFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.departmentId) return;
    await props.onSaveRequirement({
      departmentId: form.departmentId,
      positionId: form.positionId || undefined,
      siteId: form.siteId || undefined,
      season: form.season,
      timeSlot: form.timeSlot,
      label: requirementSummaryFromForm(form, props.departments),
      startDate: form.startDate,
      endDate: form.endDate || form.startDate,
      startTime: form.startTime,
      endTime: form.endTime,
      requiredCount: Math.max(1, Number(form.requiredCount) || 1),
      priority: form.priority,
      comment: JSON.stringify({ planningNeedMeta: { season: form.season, timeSlot: form.timeSlot, daysOfWeek: form.daysOfWeek, recurrence: form.recurrence } }),
    }, editingId);
    setEditingId(undefined);
    setForm(defaultRequirementForm(props.selectedDate, props.departments[0]?.id ?? ''));
  }

  function editNeed(need: PlanningRequirement) {
    const slot = requirementSlots.find((item) => item.value === need.timeSlot) ?? requirementSlots[2];
    const metadata = need.metadata ?? {};
    setEditingId(need.id);
    setForm({
      season: need.season || 'normale',
      timeSlot: slot.value,
      startDate: (need.startDate ?? need.date ?? props.selectedDate).slice(0, 10),
      endDate: (need.endDate ?? need.startDate ?? need.date ?? props.selectedDate).slice(0, 10),
      daysOfWeek: Array.isArray(metadata.daysOfWeek) ? metadata.daysOfWeek.map(Number).filter((day) => day >= 1 && day <= 7) : [1, 2, 3, 4, 5],
      recurrence: typeof metadata.recurrence === 'string' ? metadata.recurrence : 'weekly',
      siteId: need.siteId ?? '',
      departmentId: need.departmentId ?? props.departments[0]?.id ?? '',
      positionId: need.positionId ?? '',
      requiredCount: String(need.requiredCount ?? 1),
      startTime: need.startTime ?? slot.startTime,
      endTime: need.endTime ?? slot.endTime,
      priority: need.priority ?? 'NORMAL',
    });
  }

  return (
    <div className="planning-initial-step">
      <div className="hr-wizard-hero-card">
        <div className="hr-wizard-icon"><ClipboardList size={30} /></div>
        <div><h3>Quand avez-vous besoin de personnel ?</h3><p>Choisissez un type de période, les jours concernés, le service, le créneau et le nombre de personnes. Vous verrez un résumé humain avant validation.</p></div>
      </div>
      <form className="planning-initial-form" onSubmit={(event) => void submit(event)}>
        <div className="planning-form-row">
          <label className="planning-field">Période début<input type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} /></label>
          <label className="planning-field">Période fin<input type="date" value={form.endDate} onChange={(event) => update('endDate', event.target.value)} /></label>
          <label className="planning-field">Créneau<select value={form.timeSlot} onChange={(event) => {
            const slot = requirementSlots.find((item) => item.value === event.target.value);
            setForm((current) => ({ ...current, timeSlot: event.target.value, startTime: slot?.startTime ?? current.startTime, endTime: slot?.endTime ?? current.endTime }));
          }}>{requirementSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label>
        </div>
        <div className="planning-day-picker">
          {dayNames.map((day, index) => {
            const value = index + 1;
            return <button key={day} type="button" className={form.daysOfWeek.includes(value) ? 'active' : ''} onClick={() => setForm((current) => ({ ...current, daysOfWeek: toggleNumber(current.daysOfWeek, value), recurrence: 'weekly' }))}>{day.slice(0, 3)}</button>;
          })}
          <button type="button" className={form.recurrence === 'second-sunday' ? 'active wide' : 'wide'} onClick={() => setForm((current) => ({ ...current, recurrence: 'second-sunday', daysOfWeek: [7], timeSlot: 'midi', startTime: '11:00', endTime: '15:00' }))}>2e dimanche</button>
        </div>
        <div className="planning-form-row">
          <label className="planning-field">Service<select value={form.departmentId} onChange={(event) => update('departmentId', event.target.value)} required><option value="">Choisir...</option>{props.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label className="planning-field">Personnes<input type="number" min="1" max="100" value={form.requiredCount} onChange={(event) => update('requiredCount', event.target.value)} /></label>
          <label className="planning-field">Poste<select value={form.positionId} onChange={(event) => update('positionId', event.target.value)}><option value="">Optionnel</option>{departmentPositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select></label>
        </div>
        <div className="planning-form-row">
          <label className="planning-field">Site<select value={form.siteId} onChange={(event) => update('siteId', event.target.value)}><option value="">Tous sites</option>{props.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
          <label className="planning-field">Début<input type="time" value={form.startTime} onChange={(event) => update('startTime', event.target.value)} /></label>
          <label className="planning-field">Fin<input type="time" value={form.endTime} onChange={(event) => update('endTime', event.target.value)} /></label>
        </div>
        <div className="planning-rule-preview">{requirementSummaryFromForm(form, props.departments)} - {selectedSlot.label}</div>
        <div className="setup-actions">
          <button className="btn btn-primary" type="submit" disabled={!props.canWrite || !form.departmentId}>{editingId ? 'Modifier ce besoin' : 'Ajouter ce besoin'}</button>
          {editingId ? <button className="btn btn-secondary" type="button" onClick={() => { setEditingId(undefined); setForm(defaultRequirementForm(props.selectedDate, props.departments[0]?.id ?? '')); }}>Annuler</button> : null}
        </div>
      </form>
      <RequirementRuleList requirements={props.requirements} departments={props.departments} positions={props.positions} onEdit={editNeed} onDelete={props.onDeleteRequirement} canWrite={props.canWrite} />
    </div>
  );
}

function InitialPresetsStep(props: { dayPresets: PlanningTemplate[]; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; canWrite: boolean; onSaveDayPreset: (payload: PlanningDayPresetPayload, id?: string) => Promise<void>; onDeleteDayPreset: (id: string) => Promise<void> }) {
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<PlanningDayPresetPayload>(() => defaultDayPresetForm(props.departments[0]?.id));
  const quickPresets = [
    { name: 'Ouverture', startTime: '08:00', endTime: '14:00', businessStatus: 'work' },
    { name: 'Midi', startTime: '11:00', endTime: '15:00', businessStatus: 'work' },
    { name: 'Fermeture', startTime: '14:00', endTime: '18:30', businessStatus: 'work' },
    { name: 'Repos', startTime: '00:00', endTime: '00:00', businessStatus: 'rest' },
  ];

  async function submit(event: FormEvent) {
    event.preventDefault();
    await props.onSaveDayPreset({ ...form, departmentId: form.departmentId || undefined, positionId: form.positionId || undefined, siteId: form.siteId || undefined, breakMinutes: Number(form.breakMinutes ?? 0) }, editingId);
    setEditingId(undefined);
    setForm(defaultDayPresetForm(props.departments[0]?.id));
  }

  function editPreset(preset: PlanningTemplate) {
    setEditingId(preset.id);
    setForm({ name: preset.name, description: preset.description ?? '', startTime: preset.startTime ?? preset.lines?.[0]?.startTime ?? '10:00', endTime: preset.endTime ?? preset.lines?.[0]?.endTime ?? '17:00', departmentId: preset.departmentId ?? undefined, positionId: preset.positionId ?? preset.lines?.[0]?.positionId ?? undefined, siteId: preset.siteId ?? undefined, breakMinutes: preset.breakMinutes ?? preset.lines?.[0]?.breakMinutes ?? 30, paidBreak: !!preset.paidBreak, businessStatus: presetBusinessStatus(preset) ?? 'work' });
  }

  return (
    <div className="planning-initial-step">
      <div className="hr-wizard-hero-card">
        <div className="hr-wizard-icon"><Clock size={30} /></div>
        <div><h3>Presets horaires</h3><p>Créez quelques horaires types. Ils serviront ensuite à affecter rapidement les collaborateurs.</p></div>
      </div>
      <div className="planning-preset-quick-grid">
        {quickPresets.map((preset) => <button key={preset.name} type="button" className="planning-preset-card" onClick={() => setForm((current) => ({ ...current, ...preset }))}><strong>{preset.name}</strong><span>{preset.businessStatus === 'rest' ? 'Repos' : `${preset.startTime} - ${preset.endTime}`}</span></button>)}
      </div>
      <form className="planning-initial-form" onSubmit={(event) => void submit(event)}>
        <div className="planning-form-row">
          <label className="planning-field">Nom<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
          <label className="planning-field">Début<input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} required /></label>
          <label className="planning-field">Fin<input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} required /></label>
          <label className="planning-field">Statut<select value={form.businessStatus ?? 'work'} onChange={(event) => setForm((current) => ({ ...current, businessStatus: event.target.value }))}>{planningBusinessStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        </div>
        <div className="planning-form-row">
          <label className="planning-field">Service<select value={form.departmentId ?? ''} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value || undefined, positionId: '' }))}><option value="">Libre</option>{props.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label className="planning-field">Poste<select value={form.positionId ?? ''} onChange={(event) => setForm((current) => ({ ...current, positionId: event.target.value || undefined }))}><option value="">Libre</option>{props.positions.filter((position) => !form.departmentId || position.departmentId === form.departmentId).map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select></label>
          <label className="planning-field">Pause<input type="number" min="0" max="720" value={form.breakMinutes ?? 30} onChange={(event) => setForm((current) => ({ ...current, breakMinutes: Number(event.target.value) }))} /></label>
        </div>
        <div className="setup-actions">
          <button className="btn btn-primary" type="submit" disabled={!props.canWrite}>{editingId ? 'Modifier ce preset' : 'Ajouter ce preset'}</button>
          {editingId ? <button className="btn btn-secondary" type="button" onClick={() => { setEditingId(undefined); setForm(defaultDayPresetForm(props.departments[0]?.id)); }}>Annuler</button> : null}
        </div>
      </form>
      <PresetRuleList presets={props.dayPresets} onEdit={editPreset} onDelete={props.onDeleteDayPreset} canWrite={props.canWrite} />
    </div>
  );
}

function InitialDoneStep({ setup }: { setup: ReturnType<typeof buildPlanningSetup> }) {
  return (
    <div className="planning-initial-step done">
      <div className="hr-wizard-hero-card">
        <div className="hr-wizard-icon"><CheckCircle2 size={30} /></div>
        <div><h3>Planning est prêt</h3><p>Vous pouvez ouvrir le planning complet. Cette configuration restera accessible depuis Planning &gt; Paramétrage &gt; Configuration initiale.</p></div>
      </div>
      <div className="planning-service-summary">
        {setup.steps.map((item) => <div key={item.key}><strong>{setupStatusLabel(item.status)}</strong><span>{item.title}</span></div>)}
      </div>
    </div>
  );
}

function RequirementRuleList({ requirements, departments, positions, onEdit, onDelete, canWrite }: { requirements: PlanningRequirement[]; departments: HrDepartment[]; positions: HrPosition[]; onEdit?: (need: PlanningRequirement) => void; onDelete: (id: string) => Promise<void>; canWrite: boolean }) {
  return (
    <div className="planning-rule-list-cards">
      {requirements.slice(0, 8).map((need) => <div key={need.id} className="planning-rule-card"><strong>{requirementSummary(need, departments)}</strong><span>{formatPeriod(need.startDate ?? need.date, need.endDate)} - {need.startTime} à {need.endTime}</span><small>{need.position?.name ?? positions.find((item) => item.id === need.positionId)?.name ?? 'Tous postes'}</small><div className="setup-actions">{onEdit ? <button className="btn btn-secondary btn-compact" type="button" onClick={() => onEdit(need)}>Modifier</button> : null}<button className="btn btn-secondary btn-compact danger" type="button" disabled={!canWrite} onClick={() => void onDelete(need.id)}>Supprimer</button></div></div>)}
      {!requirements.length ? <div className="planning-empty-state"><strong>Aucun besoin encore créé</strong><span>Ajoutez seulement les besoins évidents pour démarrer. Le détail pourra venir plus tard.</span></div> : null}
    </div>
  );
}

function PresetRuleList({ presets, onEdit, onDelete, canWrite }: { presets: PlanningTemplate[]; onEdit?: (preset: PlanningTemplate) => void; onDelete: (id: string) => Promise<void>; canWrite: boolean }) {
  return (
    <div className="planning-preset-list">
      {presets.slice(0, 8).map((preset) => <div key={preset.id} className="planning-preset-list-card"><strong>{preset.name}</strong><span>{preset.startTime ?? preset.lines?.[0]?.startTime ?? '--:--'} - {preset.endTime ?? preset.lines?.[0]?.endTime ?? '--:--'}</span><small>{preset.departmentId ? 'Service lié' : 'Libre'}</small><div className="setup-actions">{onEdit ? <button className="btn btn-secondary btn-compact" type="button" onClick={() => onEdit(preset)}>Modifier</button> : null}<button className="btn btn-secondary btn-compact danger" type="button" disabled={!canWrite} onClick={() => void onDelete(preset.id)}>Supprimer</button></div></div>)}
      {!presets.length ? <div className="planning-empty-state"><strong>Aucun preset encore créé</strong><span>Ajoutez Ouverture, Midi ou Fermeture pour commencer.</span></div> : null}
    </div>
  );
}

function PlanningDashboard({ dashboard, alerts, setup, period, setPeriod, config, onConfigChange, hoursByDepartment, actions, history, assignments, selectedDate, dashboardPeriodData, onOpenPlanning }: { dashboard: ReturnType<typeof buildDashboard>; alerts: PlanningAlert[]; setup: ReturnType<typeof buildPlanningSetup>; period: DashboardPeriod; setPeriod: (value: DashboardPeriod) => void; config: PlanningDashboardConfig; onConfigChange: (value: PlanningDashboardConfig) => void; hoursByDepartment?: Array<Record<string, any>>; actions?: Array<Record<string, any>>; history?: Array<Record<string, any>>; assignments: PlanningAssignment[]; selectedDate: string; dashboardPeriodData: DashboardPeriodData | null; onOpenPlanning: (view: PlanningView) => void }) {
  const periodRange = getDashboardPeriodRange(period, selectedDate);
  const scheduleRange = getPlanningScheduleRange(config.planningBlockMode, selectedDate);
  const remoteMatches = dashboardPeriodData?.range.startDate === periodRange.startDate && dashboardPeriodData.range.endDate === periodRange.endDate;
  const periodAssignments = assignments.filter((assignment) => assignmentInRange(assignment, periodRange));
  const scheduleAssignments = assignments.filter((assignment) => assignmentInRange(assignment, scheduleRange));
  const remoteDashboard = remoteMatches ? dashboardPeriodData.summary?.dashboard : undefined;
  const remoteSummary = remoteMatches ? (dashboardPeriodData.summary?.stats ?? remoteDashboard?.summary) : undefined;
  const localAlerts = alertsForPeriod(alerts, periodAssignments, periodRange);
  const periodAlerts = remoteMatches && dashboardPeriodData.summary?.alerts?.length ? dashboardPeriodData.summary.alerts : localAlerts;
  const periodDashboard = applyPlanningSummary(buildDashboard(undefined, periodAssignments, periodAlerts, [], [], periodRange), remoteSummary);
  const distribution = remoteDashboard?.hoursByDepartment?.length ? normalizeHoursByDepartment(remoteDashboard.hoursByDepartment) : periodAssignments.length ? normalizeHoursByDepartment(departmentHoursFromAssignments(periodAssignments)) : normalizeHoursByDepartment(hoursByDepartment);
  const actionRows = remoteDashboard?.actions?.length ? remoteDashboard.actions : actions?.length ? actions : [];
  const kpis = [
    { key: 'plannedHours' as const, label: 'Heures planifiées', value: formatMinutesValue(periodDashboard.plannedMinutes), Icon: Clock },
    { key: 'estimatedCost' as const, label: 'Coût estimé', value: Number(periodDashboard.estimatedCost) > 0 ? `${periodDashboard.estimatedCost} €` : 'Non configuré', Icon: Coins },
    { key: 'activeAlerts' as const, label: 'Alertes actives', value: periodDashboard.activeAlerts, Icon: Bell },
  ].filter((item) => config.blocks[item.key]);
  function setPlanningMode(mode: PlanningBlockMode) {
    onConfigChange({ ...config, planningBlockMode: mode });
  }
  return (
    <>
      {!setup.complete && config.blocks.planningSetup ? <PlanningSetupCompact setup={setup} /> : null}
      <div className="planning-toolbar">
        <div>
          <span className="section-tagline">Période dashboard</span>
          <h2>{periodRange.label}</h2>
        </div>
        <div className="planning-segmented">
          {(['week', 'month', 'year'] as DashboardPeriod[]).map((value) => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{value === 'week' ? 'Semaine' : value === 'year' ? 'Année' : 'Mois'}</button>)}
        </div>
      </div>

      {kpis.length ? (
        <div className="stats-grid planning-kpi-grid">
          {kpis.map(({ label, value, Icon }) => <motion.div className="stat-card-modern" key={label} whileHover={{ y: -2 }}><div className="stat-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong></div></motion.div>)}
        </div>
      ) : null}

      <div className="planning-dashboard-grid">
        {config.blocks.planning ? <PlanningSchedulePreview assignments={scheduleAssignments} selectedDate={selectedDate} mode={config.planningBlockMode} size={config.planningBlockSize} periodRange={scheduleRange} setMode={setPlanningMode} onOpenPlanning={onOpenPlanning} embedded readOnly /> : null}
        {config.blocks.alertsToReview ? <div className="card-modern">
          <div className="section-header-modern"><span className="card-title"><ShieldAlert size={18} /> Alertes à vérifier</span><span className="section-tagline">{periodDashboard.priorityAlerts} à vérifier</span></div>
          <AlertList alerts={periodAlerts} />
        </div> : null}
        {config.blocks.departmentHours ? <div className="card-modern">
          <div className="section-header-modern"><span className="card-title"><Layers size={18} /> Répartition heures par service</span></div>
          <DepartmentHours distribution={distribution} />
        </div> : null}
        {config.blocks.actions ? <div className="card-modern planning-actions-panel">
          <div className="section-header-modern"><span className="card-title"><ListChecks size={18} /> Actions à traiter</span><span className="section-tagline">{periodDashboard.actionsToProcess} action(s)</span></div>
          {actionRows.length ? actionRows.slice(0, 6).map((action, index) => <div className="planning-action-line" key={`${action.type ?? 'action'}-${action.entityId ?? index}`}><strong>{action.label ?? action.type ?? 'Action Planning'}</strong><span>{action.priority ?? 'NORMAL'}</span></div>) : <p className="muted">Aucune action bloquante à traiter sur la période.</p>}
        </div> : null}
        {config.blocks.history ? <div className="card-modern planning-actions-panel">
          <div className="section-header-modern"><span className="card-title"><Clock size={18} /> Historique période</span></div>
          {history?.length ? history.slice(0, 5).map((item, index) => <div className="planning-action-line" key={String(item.id ?? index)}><strong>{String(item.label ?? item.action ?? 'Événement')}</strong><span>{formatShort(String(item.date ?? item.createdAt ?? ''))} {item.actor ? `- ${item.actor}` : ''}</span></div>) : <p className="muted">Aucun événement de période enregistré.</p>}
        </div> : null}
      </div>
    </>
  );
}

function PlanningSchedulePreview({ assignments, selectedDate, mode, size, periodRange, setMode, onOpenPlanning, embedded, readOnly }: { assignments: PlanningAssignment[]; selectedDate: string; mode: PlanningBlockMode; size: PlanningBlockSize; periodRange: DashboardPeriodRange; setMode: (value: PlanningBlockMode) => void; onOpenPlanning: (view: PlanningView) => void; embedded?: boolean; readOnly?: boolean }) {
  const activeAssignments = assignments.filter((assignment) => assignment.status !== 'CANCELLED');
  const selectedMonth = selectedDate.slice(0, 7);
  const selectedWeek = weekDates(selectedDate);
  const dayAssignments = activeAssignments.filter((assignment) => sameDay(assignment.date, selectedDate));
  const weekAssignments = activeAssignments.filter((assignment) => selectedWeek.some((day) => sameDay(assignment.date, day)));
  const monthAssignments = activeAssignments.filter((assignment) => normalizePlanningDate(assignment.date).startsWith(selectedMonth));
  const dayGroups = groupAssignmentsForDay(dayAssignments);
  const compactSlots = summarizeShiftSlots(dayAssignments);
  const monthDays = normalizeMonthDays(selectedDate);
  const weekCollaborators = collaboratorsFromAssignments(weekAssignments);
  const monthCollaborators = collaboratorsFromAssignments(monthAssignments);
  const currentView: PlanningView = mode === 'day' ? 'day' : mode === 'week' ? 'week' : 'month';
  const showCompact = size === 'small';
  const showMedium = size === 'medium';
  return (
    <div className={`card-modern planning-widget-card planning-block-${size} ${embedded ? 'embedded' : ''}`}>
      <div className="section-header-modern">
        <div>
          <span className="card-title"><CalendarDays size={18} /> Planning</span>
          <span className="section-tagline">{sizeLabel(size)} · {periodRange.startDate} au {periodRange.endDate}</span>
        </div>
        <div className="planning-segmented compact">
          {(['day', 'week', 'month'] as const).map((item) => <button key={item} type="button" className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item === 'day' ? 'Jour' : item === 'week' ? 'Semaine' : 'Mois'}</button>)}
        </div>
      </div>
      {mode === 'day' && showCompact ? (
        <div className="planning-widget-body planning-schedule-day compact">
          <strong>Planning - Aujourd’hui</strong>
          <span>{uniqueEmployeeCount(dayAssignments)} personne{uniqueEmployeeCount(dayAssignments) > 1 ? 's' : ''} prévue{uniqueEmployeeCount(dayAssignments) > 1 ? 's' : ''}</span>
          {compactSlots.slice(0, 4).map((slot) => <span key={slot.range}>{slot.range} · {slot.count} pers.</span>)}
          {!compactSlots.length ? <span>Aucun shift prévu</span> : null}
        </div>
      ) : null}
      {mode === 'day' && !showCompact ? (
        <div className="planning-widget-body planning-schedule-day">
          <strong>Planning - Jour - {formatShort(selectedDate)}</strong>
          {dayGroups.length ? dayGroups.map((group) => (
            <div key={`${group.department}-${group.range}`} className="planning-schedule-group">
              <span>{group.department}</span>
              <strong>{group.range}</strong>
              {group.assignments.slice(0, showMedium ? 6 : group.assignments.length).map((assignment) => <small key={assignment.id}>{collaboratorName(assignment.collaborator ?? assignment.employee)}{assignment.position?.name ? ` - ${assignment.position.name}` : ''}</small>)}
              {showMedium && group.assignments.length > 6 ? <small>Voir les {group.assignments.length} personnes dans le planning.</small> : null}
            </div>
          )) : <span>Aucun shift prévu</span>}
        </div>
      ) : null}
      {mode === 'week' ? (
        <PlanningWeekCalendar
          selectedDate={selectedDate}
          assignments={weekAssignments}
          requirements={[]}
          collaborators={weekCollaborators}
          selectedEmployeeId=""
          onDayClick={() => onOpenPlanning('week')}
          readOnly
          embedded
          compact={showCompact || showMedium}
        />
      ) : null}
      {mode === 'month' && showCompact ? (
        <div className="planning-widget-body planning-schedule-month compact">
          <strong>Planning - {capitalize(monthLabel(selectedDate))}</strong>
          <span>{new Set(monthAssignments.map((assignment) => normalizePlanningDate(assignment.date))).size} jour{monthAssignments.length > 1 ? 's' : ''} planifié{monthAssignments.length > 1 ? 's' : ''}</span>
          <span>{uniqueEmployeeCount(activeAssignments)} personne{uniqueEmployeeCount(activeAssignments) > 1 ? 's' : ''} sur la période chargée</span>
        </div>
      ) : null}
      {mode === 'month' && !showCompact ? (
        <PlanningMonthlyCalendar
          selectedDate={selectedDate}
          onDayClick={() => onOpenPlanning('month')}
          assignments={monthAssignments}
          requirements={[]}
          collaborators={monthCollaborators}
          selectedEmployeeId=""
          days={monthDays}
          readOnly
          embedded
          compact={size === 'medium'}
        />
      ) : null}
      <button type="button" className="btn btn-primary" onClick={() => onOpenPlanning(currentView)}>{readOnly ? 'Ouvrir le planning' : 'Voir le détail'}</button>
    </div>
  );
}

function PlanningDashboardCustomizer({ config, onChange, onClose }: { config: PlanningDashboardConfig; onChange: (value: PlanningDashboardConfig) => void; onClose: () => void }) {
  const blocks: Array<{ key: PlanningDashboardBlockKey; label: string; zone: string; description: string }> = [
    { key: 'periodStatus', label: 'Statut période', zone: 'PILOTAGE', description: 'Contrôler, publier et verrouiller la période.' },
    { key: 'planningSetup', label: 'Planning à finaliser', zone: 'SETUP', description: 'Étapes utiles avant exploitation.' },
    { key: 'plannedHours', label: 'Heures planifiées', zone: 'KPI', description: 'Total prévu sur la période.' },
    { key: 'estimatedCost', label: 'Coût estimé', zone: 'KPI', description: 'Affiché seulement si les coûts sont configurés.' },
    { key: 'activeAlerts', label: 'Alertes actives', zone: 'ALERTS', description: 'Nombre de points ouverts.' },
    { key: 'alertsToReview', label: 'Alertes à vérifier', zone: 'ALERTS', description: 'Liste des points à traiter.' },
    { key: 'planning', label: 'Planning', zone: 'SCHEDULE', description: 'Vue directe jour, semaine ou mois.' },
    { key: 'departmentHours', label: 'Répartition heures par service', zone: 'ANALYSE', description: 'Lecture par service.' },
    { key: 'actions', label: 'Actions à traiter', zone: 'ACTIONS', description: 'Actions opérationnelles de période.' },
    { key: 'history', label: 'Historique période', zone: 'HISTORIQUE', description: 'Derniers événements enregistrés.' },
  ];
  function toggle(key: PlanningDashboardBlockKey) {
    onChange({ ...config, blocks: { ...config.blocks, [key]: !config.blocks[key] } });
  }
  function togglePin(key: PlanningDashboardBlockKey) {
    const pinned = config.pinnedBlockIds.includes(key);
    onChange({ ...config, pinnedBlockIds: pinned ? config.pinnedBlockIds.filter((item) => item !== key) : [...config.pinnedBlockIds, key] });
  }
  const sortedBlocks = [...blocks].sort((a, b) => Number(config.pinnedBlockIds.includes(b.key)) - Number(config.pinnedBlockIds.includes(a.key)) || a.label.localeCompare(b.label));
  return (
    <div className="modal-overlay planning-edit-overlay" onClick={onClose}>
      <div className="card-modern planning-edit-modal planning-dashboard-customizer" onClick={(event) => event.stopPropagation()}>
        <div className="section-header-modern">
          <div>
            <span className="card-title"><SlidersHorizontal size={18} /> Personnaliser le Dashboard Planning</span>
            <span className="section-tagline">Choisissez les blocs visibles, leur ordre prioritaire et la taille du Planning.</span>
          </div>
          <button type="button" className="btn btn-secondary btn-compact" onClick={onClose}>Fermer</button>
        </div>
        <div className="customizer-section">
          <span className="customizer-section-title">Blocs Planning</span>
          <div className="customizer-toggle-list">
            {sortedBlocks.map((block) => {
              const pinned = config.pinnedBlockIds.includes(block.key);
              return (
              <div className="customizer-toggle-row" key={block.key}>
                <div className="customizer-toggle-info">
                  <span className="customizer-toggle-label">{block.label}</span>
                  <span className="customizer-toggle-desc">{block.zone} · planning · {block.description}</span>
                </div>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => togglePin(block.key)}>{pinned ? 'Désépingler' : 'Épingler'}</button>
                <label className="switch-control">
                  <input type="checkbox" checked={config.blocks[block.key]} onChange={() => toggle(block.key)} />
                  <span className="slider-round" />
                </label>
              </div>
            ); })}
          </div>
        </div>
        <div className="customizer-section">
          <span className="customizer-section-title">Planning</span>
          <div className="planning-customizer-controls">
            <div>
              <span className="customizer-toggle-label">Taille</span>
              <div className="planning-segmented">
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <button key={size} type="button" className={config.planningBlockSize === size ? 'active' : ''} onClick={() => onChange({ ...config, planningBlockSize: size })}>{size === 'small' ? 'Petit' : size === 'large' ? 'Grand' : 'Moyen'}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="customizer-toggle-label">Affichage</span>
              <div className="planning-segmented">
                {(['day', 'week', 'month'] as const).map((mode) => (
                  <button key={mode} type="button" className={config.planningBlockMode === mode ? 'active' : ''} onClick={() => onChange({ ...config, planningBlockMode: mode })}>{mode === 'day' ? 'Jour' : mode === 'week' ? 'Semaine' : 'Mois'}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="customizer-section">
          <span className="customizer-section-title">Repère</span>
          <div className="customizer-toggle-list">
            <div className="customizer-toggle-row">
              <div className="customizer-toggle-info">
                <span className="customizer-toggle-label">Petit · Moyen · Grand</span>
                <span className="customizer-toggle-desc">Petit condense le jour, moyen privilégie la semaine, grand laisse respirer le mois.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PeriodWorkflowPanel({ status, canWrite, onControl, onPublish, onLock }: { status?: PlanningPeriodStatus; canWrite: boolean; onControl: () => Promise<void>; onPublish: () => Promise<void>; onLock: () => Promise<void> }) {
  const code = status?.status ?? 'DRAFT';
  const blocking = Number(status?.blockingAlerts ?? 0);
  const warning = Number(status?.warningAlerts ?? 0);
  return (
    <div className="card-modern planning-period-panel">
      <div>
        <span className="section-tagline">Statut période</span>
        <strong className={`period-status ${String(code).toLowerCase()}`}>{status?.label ?? periodStatusLabel(code)}</strong>
        <small>{status?.period?.startDate ? `${formatShort(status.period.startDate)} à ${formatShort(status.period.endDate)}` : 'Période mensuelle sélectionnée'} - stockage temporaire historique</small>
      </div>
      <div className="planning-period-summary">
        <span>{blocking} bloquante(s)</span>
        <span>{warning} avertissement(s)</span>
        {status?.modifiedAfterLock ? <span className="status-pill warning">Modifié après verrouillage</span> : null}
      </div>
      <div className="setup-actions">
        <button className="btn btn-secondary" type="button" disabled={!canWrite} onClick={() => void onControl()}><ShieldAlert size={16} /> Contrôler</button>
        <button className="btn btn-primary" type="button" disabled={!canWrite} onClick={() => void onPublish()}><Bell size={16} /> Publier</button>
        <button className="btn btn-secondary" type="button" disabled={!canWrite} onClick={() => void onLock()}><FileSignature size={16} /> Verrouiller période</button>
      </div>
      {code === 'LOCKED' ? <p className="muted">Période verrouillée pour paie/export futur. Toute modification doit être confirmée par un manager.</p> : null}
      {code === 'MODIFIED_AFTER_PUBLICATION' ? <p className="muted">Le planning publié a été modifié. Un nouveau contrôle ou une republication peut être nécessaire.</p> : null}
    </div>
  );
}

function PlanningWorkspace(props: {
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  siteFilter: string;
  setSiteFilter: (value: string) => void;
  serviceFilter: string;
  setServiceFilter: (value: string) => void;
  employeeFilter: string;
  setEmployeeFilter: (value: string) => void;
  seasonalTemplateId: string;
  setSeasonalTemplateId: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  sites: Site[];
  departments: HrDepartment[];
  collaborators: HrCollaborator[];
  assignments: PlanningAssignment[];
  requirements: PlanningRequirement[];
  monthDays?: Array<Record<string, any>>;
  planningView: PlanningView;
  setPlanningView: (value: PlanningView) => void;
  selectedEmployeeId: string;
  setSelectedEmployeeId: (value: string) => void;
  selectedEmployee?: HrCollaborator;
  templates: PlanningTemplate[];
  rotations: PlanningRotationOption[];
  replacements: PlanningReplacementProposal[];
  onOpenSettings: () => void;
  customStart: string;
  setCustomStart: (value: string) => void;
  customEnd: string;
  setCustomEnd: (value: string) => void;
  quickBusinessStatus: string;
  setQuickBusinessStatus: (value: string) => void;
  saveCustomShift: () => void;
  createQuickAssignment: (startTime: string, endTime: string, origin?: string, templateId?: string, preset?: Partial<PlanningAssignment>, dateOverride?: string, businessStatusOverride?: string) => Promise<void>;
  quickPanelOpen: boolean;
  setQuickPanelOpen: (value: boolean) => void;
  quickAssignmentSelection: QuickAssignmentSelection | null;
  setQuickAssignmentSelection: (value: QuickAssignmentSelection | null) => void;
  applyRotation: (rotation: PlanningRotationOption, dateOverride?: string) => Promise<void>;
  onEditAssignment: (assignment: PlanningAssignment) => void;
}) {
  const days = normalizeMonthDays(props.selectedDate, props.monthDays);
  const activeQuickMode = props.quickAssignmentSelection && props.selectedEmployee
    ? `${collaboratorName(props.selectedEmployee)} - ${props.quickAssignmentSelection.label}`
    : null;
  const viewLabels: Record<PlanningView, string> = { day: 'Journalier', week: 'Semaine', month: 'Mois', year: 'Annuel' };
  async function handleDayClick(day: string) {
    if (!props.quickAssignmentSelection) {
      props.setSelectedDate(day);
      return;
    }
    props.setSelectedDate(day);
    if (props.quickAssignmentSelection.kind === 'weekly-rotation' && props.quickAssignmentSelection.rotation) {
      await props.applyRotation(props.quickAssignmentSelection.rotation, day);
      return;
    }
    await props.createQuickAssignment(
      props.quickAssignmentSelection.startTime,
      props.quickAssignmentSelection.endTime,
      props.quickAssignmentSelection.origin,
      props.quickAssignmentSelection.templateId,
      props.quickAssignmentSelection.preset,
      day,
      props.quickAssignmentSelection.businessStatus,
    );
  }
  return (
    <div className={`planning-workspace-grid ${props.quickPanelOpen ? '' : 'panel-closed'}`}>
      <div className="planning-main-column">
        <PlanningPlannerFilters {...props} />
        <div className="planning-view-bar">
          <div className="planning-segmented">
            {(['day', 'week', 'month', 'year'] as PlanningView[]).map((view) => (
              <button key={view} type="button" className={props.planningView === view ? 'active' : ''} onClick={() => props.setPlanningView(view)}>{viewLabels[view]}</button>
            ))}
          </div>
          <span className="muted tiny">{props.planningView === 'day' ? 'Toutes les personnes prévues sur la journée.' : props.planningView === 'week' ? 'Vue semaine par jour, avec les affectations en pastilles.' : props.planningView === 'year' ? 'Synthèse charge, absences et zones à vérifier.' : 'Vue calendrier avec détail complet par jour.'}</span>
        </div>
        {activeQuickMode || !props.quickPanelOpen ? (
          <div className={`quick-mode-banner ${activeQuickMode ? 'active' : ''}`}>
            <span>{activeQuickMode ? `Mode affectation actif : ${activeQuickMode}` : 'Panneau affectation rapide masqué'}</span>
            <div className="setup-actions">
              {activeQuickMode ? <button className="btn btn-secondary btn-compact" type="button" onClick={() => props.setQuickAssignmentSelection(null)}>Quitter</button> : null}
              {!props.quickPanelOpen ? <button className="btn btn-secondary btn-compact" type="button" onClick={() => props.setQuickPanelOpen(true)}>Affectation rapide</button> : null}
            </div>
          </div>
        ) : null}
        {props.planningView === 'day' ? (
          <DailyPlanningView selectedDate={props.selectedDate} assignments={props.assignments} collaborators={props.collaborators} departments={props.departments} onDayClick={handleDayClick} activeQuickMode={Boolean(props.quickAssignmentSelection)} onEditAssignment={props.onEditAssignment} />
        ) : props.planningView === 'week' ? (
          <WeeklyPlanningView selectedDate={props.selectedDate} assignments={props.assignments} requirements={props.requirements} collaborators={props.collaborators} selectedEmployeeId={props.employeeFilter} activeQuickMode={Boolean(props.quickAssignmentSelection)} onDayClick={handleDayClick} onEditAssignment={props.onEditAssignment} />
        ) : props.planningView === 'year' ? (
          <YearPlanningView selectedDate={props.selectedDate} assignments={props.assignments} absences={[]} onOpenMonth={(date) => { props.setSelectedDate(date); props.setPlanningView('month'); }} />
        ) : (
          <PlanningMonthlyCalendar
            selectedDate={props.selectedDate}
            onDayClick={handleDayClick}
            assignments={props.assignments}
            requirements={props.requirements}
            collaborators={props.collaborators}
            selectedEmployeeId={props.employeeFilter}
            days={days}
            activeQuickMode={Boolean(props.quickAssignmentSelection)}
            onEditAssignment={props.onEditAssignment}
          />
        )}
      </div>
      {props.quickPanelOpen ? <QuickAssignmentPanel {...props} /> : null}
    </div>
  );
}

function PlanningPlannerFilters(props: { selectedDate: string; setSelectedDate: (value: string) => void; siteFilter: string; setSiteFilter: (value: string) => void; serviceFilter: string; setServiceFilter: (value: string) => void; employeeFilter: string; setEmployeeFilter: (value: string) => void; seasonalTemplateId: string; setSeasonalTemplateId: (value: string) => void; search: string; setSearch: (value: string) => void; sites: Site[]; departments: HrDepartment[]; collaborators: HrCollaborator[]; templates: PlanningTemplate[] }) {
  const selectedYear = new Date(props.selectedDate).getFullYear();
  const years = Array.from({ length: 9 }, (_, index) => selectedYear - 2 + index);
  return (
    <div className="card-modern planning-filter-card">
      <div className="planning-month-header">
        <div>
          <span className="section-tagline">Calendrier mensuel</span>
          <h2>{monthLabel(props.selectedDate)}</h2>
        </div>
        <div className="setup-actions">
          <button className="btn btn-secondary" onClick={() => props.setSelectedDate(addMonths(props.selectedDate, -1))}><ChevronLeft size={16} /> Mois précédent</button>
          <button className="btn btn-secondary" onClick={() => props.setSelectedDate(todayIso())}>Aujourd’hui</button>
          <button className="btn btn-secondary" onClick={() => props.setSelectedDate(addMonths(props.selectedDate, 1))}>Mois suivant <ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="planning-filter-grid planning-desktop-filters">
        <input type="month" value={props.selectedDate.slice(0, 7)} onChange={(event) => props.setSelectedDate(`${event.target.value}-01`)} />
        <select value={selectedYear} onChange={(event) => props.setSelectedDate(setYear(props.selectedDate, Number(event.target.value)))}>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select value={props.siteFilter} onChange={(event) => props.setSiteFilter(event.target.value)}>
          <option value="">Tous sites</option>
          {props.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
        <select value={props.serviceFilter} onChange={(event) => props.setServiceFilter(event.target.value)}>
          <option value="">Tous services</option>
          {props.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        <select value={props.seasonalTemplateId} onChange={(event) => props.setSeasonalTemplateId(event.target.value)}>
          <option value="">Modèle saisonnier</option>
          {props.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
        <select value={props.employeeFilter} onChange={(event) => props.setEmployeeFilter(event.target.value)}>
          <CollaboratorOptions collaborators={props.collaborators} placeholder="Voir salarié" />
        </select>
        <div className="search-input-wrapper">
          <Search size={16} />
          <input className="search-input" placeholder="Nom, poste, commentaire..." value={props.search} onChange={(event) => props.setSearch(event.target.value)} />
        </div>
      </div>
    </div>
  );
}

function DailyPlanningView({ selectedDate, assignments, collaborators, departments, onDayClick, activeQuickMode, onEditAssignment }: { selectedDate: string; assignments: PlanningAssignment[]; collaborators: HrCollaborator[]; departments: HrDepartment[]; onDayClick: (day: string) => void | Promise<void>; activeQuickMode: boolean; onEditAssignment: (assignment: PlanningAssignment) => void }) {
  const dayAssignments = assignments.filter((assignment) => sameDay(assignment.date, selectedDate) && assignment.status !== 'CANCELLED');
  const serviceNames = new Map(departments.map((department) => [department.id, department.name]));
  const groups = new Map<string, PlanningAssignment[]>();
  dayAssignments.forEach((assignment) => {
    const key = assignment.department?.name ?? assignment.service?.name ?? serviceNames.get(String(assignment.departmentId ?? assignment.serviceId ?? '')) ?? 'Sans service';
    groups.set(key, [...(groups.get(key) ?? []), assignment]);
  });
  return (
    <div className={`card-modern planning-detail-view ${activeQuickMode ? 'assignment-target' : ''}`}>
      <div className="section-header-modern">
        <div><span className="section-tagline">Planning journalier</span><h2>{formatAttendanceDate(selectedDate)}</h2></div>
        <button className="btn btn-secondary" type="button" onClick={() => void onDayClick(selectedDate)}>{activeQuickMode ? 'Affecter sur ce jour' : 'Sélectionner le jour'}</button>
      </div>
      {Array.from(groups.entries()).map(([service, items]) => (
        <section className="planning-day-service" key={service}>
          <strong>{service}</strong>
          <div className="planning-shift-stack">
            {items.sort((a, b) => timeLabel(a.startTime).localeCompare(timeLabel(b.startTime))).map((assignment) => {
              const collaborator = findCollaborator(collaborators, assignment.employeeId ?? assignment.collaboratorId);
              return <button key={assignment.id} type="button" className="planning-shift-row" onClick={() => onEditAssignment(assignment)}><span>{collaboratorName(collaborator)}</span><strong>{assignmentDisplayRange(assignment)}</strong><em>{assignment.position?.name ?? collaborator?.position?.name ?? 'Poste non renseigné'}</em></button>;
            })}
          </div>
        </section>
      ))}
      {!dayAssignments.length ? <GuidedEmptyState title="Aucun shift ce jour" description="Ajoutez une affectation rapide ou appliquez un roulement pour alimenter la journée." /> : null}
    </div>
  );
}

function WeeklyPlanningView({ selectedDate, assignments, requirements, collaborators, selectedEmployeeId, activeQuickMode, onDayClick, onEditAssignment }: { selectedDate: string; assignments: PlanningAssignment[]; requirements: PlanningRequirement[]; collaborators: HrCollaborator[]; selectedEmployeeId: string; activeQuickMode: boolean; onDayClick: (day: string) => void | Promise<void>; onEditAssignment: (assignment: PlanningAssignment) => void }) {
  const days = weekDates(selectedDate);
  const weekAssignments = assignments.filter((assignment) => days.some((day) => sameDay(assignment.date, day)) && assignment.status !== 'CANCELLED');
  const activeCollaborators = collaborators.filter((collaborator) => weekAssignments.some((assignment) => (assignment.employeeId ?? assignment.collaboratorId) === collaborator.id));
  const plannedMinutes = weekAssignments.reduce((sum, assignment) => sum + Math.round(assignmentHours(assignment) * 60), 0);
  return (
    <div className="card-modern planning-week-view planning-calendar-card">
      <div className="section-header-modern">
        <div><span className="section-tagline">Planning semaine</span><h2>{formatShort(days[0])} au {formatShort(days[6])}</h2></div>
        <div className="setup-actions">
          <span className="status-pill">{activeCollaborators.length} collaborateur(s)</span>
          <span className="status-pill">{formatMinutesValue(plannedMinutes)} planifiées</span>
        </div>
      </div>
      <PlanningWeekCalendar
        selectedDate={selectedDate}
        assignments={weekAssignments}
        requirements={requirements}
        collaborators={collaborators}
        selectedEmployeeId={selectedEmployeeId}
        activeQuickMode={activeQuickMode}
        onDayClick={onDayClick}
        onEditAssignment={onEditAssignment}
      />
      {!activeCollaborators.length ? <GuidedEmptyState title="Aucun collaborateur planifié" description="La semaine sélectionnée ne contient pas encore d’affectations." /> : null}
    </div>
  );
}

function PlanningWeekCalendar({ selectedDate, assignments, requirements, collaborators, selectedEmployeeId, onDayClick, activeQuickMode = false, onEditAssignment, readOnly = false, embedded = false, compact = false }: { selectedDate: string; assignments: PlanningAssignment[]; requirements: PlanningRequirement[]; collaborators: HrCollaborator[]; selectedEmployeeId: string; onDayClick: (day: string) => void | Promise<void>; activeQuickMode?: boolean; onEditAssignment?: (assignment: PlanningAssignment) => void; readOnly?: boolean; embedded?: boolean; compact?: boolean }) {
  const days = weekDates(selectedDate);
  const visibleLimit = compact ? 2 : 6;
  return (
    <div className={`${embedded ? 'planning-calendar-card planning-calendar-card-embedded' : 'planning-week-calendar-inner'} planning-week-calendar-card ${compact ? 'compact' : ''}`}>
      <div className={`planning-week-card-grid ${embedded ? 'embedded' : ''}`}>
        {days.map((day) => {
          const dayAssignments = assignments.filter((assignment) => sameDay(assignment.date, day) && assignment.status !== 'CANCELLED');
          const assignmentGroups = consolidateAssignmentsByEmployee(dayAssignments, collaborators);
          const dayRequirements = requirements.filter((requirement) => requirementMatchesDay(requirement, day));
          const tone = dayTone(dayAssignments, dayRequirements);
          return (
            <div key={day} role="button" tabIndex={0} className={`month-cell planning-month-cell planning-week-day-card ${tone} ${sameDay(day, selectedDate) ? 'selected' : ''} ${activeQuickMode ? 'assignment-target' : ''} ${readOnly ? 'read-only' : ''}`} onClick={() => void onDayClick(day)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void onDayClick(day); } }}>
              <div className="planning-week-day-title">
                <span>{dayNameShort(isoDayOfWeek(day))}</span>
                <b>{formatShort(day)}</b>
              </div>
              <div className="month-shift-list">
                {assignmentGroups.slice(0, visibleLimit).map((group) => {
                  const dimmed = Boolean(selectedEmployeeId && group.employeeId !== selectedEmployeeId);
                  const status = businessStatusConfig(group.businessStatus);
                  const interactive = Boolean(onEditAssignment && !readOnly);
                  return <span key={group.employeeId} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} className={`assignment-pill status-${status.className} ${group.hasConflict ? 'conflict' : ''} ${dimmed ? 'dimmed' : ''} ${!interactive ? 'read-only' : ''}`} onClick={(event) => { event.stopPropagation(); if (interactive) onEditAssignment?.(group.assignments[0]); }} onKeyDown={(event) => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); onEditAssignment?.(group.assignments[0]); } }}><strong>{shortName(group.collaborator)}</strong>{group.assignments.map((assignment) => <small key={assignment.id}>{assignmentDisplayRange(assignment)}</small>)}<em>{businessStatusLabel(group.businessStatus)}</em></span>;
                })}
                {assignmentGroups.length > visibleLimit ? <button type="button" className="month-more-button" onClick={(event) => { event.stopPropagation(); void onDayClick(day); }}>{`+ ${assignmentGroups.length - visibleLimit} autre(s)`}</button> : null}
                {!assignmentGroups.length ? <em className={dayRequirements.length ? 'need-open' : 'day-closed'}>{dayRequirements.length ? 'Besoin ouvert' : 'Fermé'}</em> : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="planning-legend">
        <span><i className="legend-green" /> Correct</span>
        <span><i className="legend-orange" /> Alerte quota</span>
        <span><i className="legend-red" /> Conflit / sous-effectif</span>
        <span><i className="legend-grey" /> Fermé / repos</span>
      </div>
    </div>
  );
}

function YearPlanningView({ selectedDate, assignments, onOpenMonth }: { selectedDate: string; assignments: PlanningAssignment[]; absences?: Array<Record<string, any>>; onOpenMonth: (date: string) => void }) {
  const year = parseLocalDate(selectedDate).getFullYear();
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = `${year}-${String(index + 1).padStart(2, '0')}-01`;
    const monthAssignments = assignments.filter((assignment) => normalizePlanningDate(assignment.date).startsWith(date.slice(0, 7)) && assignment.status !== 'CANCELLED');
    const plannedMinutes = monthAssignments.reduce((sum, assignment) => sum + Math.round(assignmentHours(assignment) * 60), 0);
    const alerts = monthAssignments.filter((assignment) => assignment.conflicts?.length).length;
    return { date, label: monthLabel(date), plannedMinutes, alerts, people: new Set(monthAssignments.map((assignment) => assignment.employeeId ?? assignment.collaboratorId)).size };
  });
  return (
    <div className="card-modern planning-year-view">
      <div className="section-header-modern"><div><span className="section-tagline">Planning annuel</span><h2>{year}</h2></div><span className="status-pill">Synthèse</span></div>
      <div className="planning-year-grid">
        {months.map((month) => <button key={month.date} type="button" onClick={() => onOpenMonth(month.date)}><strong>{capitalize(month.label)}</strong><span>{formatMinutesValue(month.plannedMinutes)} prévues · {month.people} personne(s)</span><em>{month.alerts ? `${month.alerts} à vérifier` : 'OK'}</em></button>)}
      </div>
    </div>
  );
}

function PlanningMonthlyCalendar({ selectedDate, onDayClick, assignments, requirements, collaborators, selectedEmployeeId, days, activeQuickMode = false, onEditAssignment, readOnly = false, embedded = false, compact = false }: { selectedDate: string; onDayClick: (day: string) => void | Promise<void>; assignments: PlanningAssignment[]; requirements: PlanningRequirement[]; collaborators: HrCollaborator[]; selectedEmployeeId: string; days: string[]; activeQuickMode?: boolean; onEditAssignment?: (assignment: PlanningAssignment) => void; readOnly?: boolean; embedded?: boolean; compact?: boolean }) {
  const selectedMonth = selectedDate.slice(0, 7);
  const [expandedWeekKeys, setExpandedWeekKeys] = useState<string[]>([]);
  const weeks = chunkDaysByWeek(days);
  return (
    <div className={`${embedded ? 'planning-calendar-card planning-calendar-card-embedded' : 'card-modern planning-calendar-card'} ${compact ? 'compact' : ''}`}>
      <div className={`planning-month-grid planning-month-grid-final ${embedded ? 'embedded' : ''}`}>
        {dayNames.map((day) => <strong key={day} className="planning-month-weekday">{day}</strong>)}
        {weeks.map((week) => {
          const weekKey = `${week[0]}_${week[week.length - 1]}`;
          const expandedWeek = expandedWeekKeys.includes(weekKey);
          return (
            <div key={weekKey} className={`planning-month-week-row ${expandedWeek ? 'expanded' : ''}`}>
              <div className="planning-month-week-grid">
                {expandedWeek ? (
                  <div className="planning-month-week-actions">
                    <span>Semaine du {formatShort(week[0])} au {formatShort(week[week.length - 1])}</span>
                    <button type="button" className="month-more-button" onClick={(event) => { event.stopPropagation(); setExpandedWeekKeys((current) => current.filter((key) => key !== weekKey)); }}>Réduire la semaine</button>
                  </div>
                ) : null}
                {week.map((day) => {
                  const dayAssignments = assignments.filter((assignment) => sameDay(assignment.date, day) && assignment.status !== 'CANCELLED');
                  const assignmentGroups = consolidateAssignmentsByEmployee(dayAssignments, collaborators);
                  const dayRequirements = requirements.filter((requirement) => requirementMatchesDay(requirement, day));
                  const tone = dayTone(dayAssignments, dayRequirements);
                  const outsideMonth = day.slice(0, 7) !== selectedMonth;
                  return (
                    <div key={day} role="button" tabIndex={0} className={`month-cell planning-month-cell ${tone} ${outsideMonth ? 'outside' : ''} ${sameDay(day, selectedDate) ? 'selected' : ''} ${expandedWeek ? 'expanded-week' : ''} ${activeQuickMode ? 'assignment-target' : ''} ${readOnly ? 'read-only' : ''}`} onClick={() => void onDayClick(day)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void onDayClick(day); } }}>
                      <b>{dayNumber(day)}</b>
                      <div className="month-shift-list">
                        {assignmentGroups.slice(0, expandedWeek ? assignmentGroups.length : 3).map((group) => {
                          const dimmed = Boolean(selectedEmployeeId && group.employeeId !== selectedEmployeeId);
                          const status = businessStatusConfig(group.businessStatus);
                          const interactive = Boolean(onEditAssignment && !readOnly);
                          return <span key={group.employeeId} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} className={`assignment-pill status-${status.className} ${group.hasConflict ? 'conflict' : ''} ${dimmed ? 'dimmed' : ''} ${!interactive ? 'read-only' : ''}`} onClick={(event) => { event.stopPropagation(); if (interactive) onEditAssignment?.(group.assignments[0]); }} onKeyDown={(event) => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); onEditAssignment?.(group.assignments[0]); } }}><strong>{shortName(group.collaborator)}</strong>{group.assignments.map((assignment) => <small key={assignment.id}>{assignmentDisplayRange(assignment)}</small>)}<em>{businessStatusLabel(group.businessStatus)}</em></span>;
                        })}
                        {!expandedWeek && assignmentGroups.length > 3 ? <button type="button" className="month-more-button" onClick={(event) => { event.stopPropagation(); setExpandedWeekKeys((current) => current.includes(weekKey) ? current : [...current, weekKey]); }}>{`Voir les ${assignmentGroups.length} personnes`}</button> : null}
                        {!assignmentGroups.length ? <em className={dayRequirements.length ? 'need-open' : 'day-closed'}>{dayRequirements.length ? 'Besoin ouvert' : 'Fermé'}</em> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="planning-legend">
        <span><i className="legend-green" /> Correct</span>
        <span><i className="legend-orange" /> Alerte quota</span>
        <span><i className="legend-red" /> Conflit / sous-effectif</span>
        <span><i className="legend-grey" /> Fermé / repos</span>
      </div>
    </div>
  );
}

function QuickAssignmentPanel(props: { selectedDate: string; collaborators: HrCollaborator[]; selectedEmployeeId: string; setSelectedEmployeeId: (value: string) => void; selectedEmployee?: HrCollaborator; templates: PlanningTemplate[]; rotations: PlanningRotationOption[]; assignments: PlanningAssignment[]; replacements: PlanningReplacementProposal[]; onOpenSettings: () => void; customStart: string; setCustomStart: (value: string) => void; customEnd: string; setCustomEnd: (value: string) => void; quickBusinessStatus: string; setQuickBusinessStatus: (value: string) => void; saveCustomShift: () => void; createQuickAssignment: (startTime: string, endTime: string, origin?: string, templateId?: string, preset?: Partial<PlanningAssignment>, dateOverride?: string, businessStatusOverride?: string) => Promise<void>; quickAssignmentSelection: QuickAssignmentSelection | null; setQuickAssignmentSelection: (value: QuickAssignmentSelection | null) => void; setQuickPanelOpen: (value: boolean) => void; applyRotation: (rotation: PlanningRotationOption, dateOverride?: string) => Promise<void> }) {
  const presets = dayPresets(props.templates);
  const selectedDay = normalizePlanningDate(props.selectedDate);
  const week = weekDates(selectedDay);
  const monthPeriod = currentMonthPeriod(selectedDay);
  const employeeAssignments = props.selectedEmployee ? props.assignments.filter((assignment) => (assignment.collaboratorId ?? assignment.employeeId) === props.selectedEmployee?.id && assignment.status !== 'CANCELLED') : [];
  const contractMinutes = contractWeeklyMinutes(props.selectedEmployee);
  const quotaColumns = [
    { key: 'day', label: 'Jour', planned: plannedAssignmentMinutes(employeeAssignments, selectedDay, selectedDay), quota: contractMinutes ? Math.round(contractMinutes / 5) : null },
    { key: 'week', label: 'Semaine', planned: plannedAssignmentMinutes(employeeAssignments, week[0], week[6]), quota: contractMinutes || null },
    { key: 'month', label: 'Mois', planned: plannedAssignmentMinutes(employeeAssignments, monthPeriod.startDate, monthPeriod.endDate), quota: contractMinutes ? Math.round((contractMinutes * businessDaysBetween(monthPeriod.startDate, monthPeriod.endDate)) / 5) : null },
  ];
  const secondary = secondaryPositions(props.selectedEmployee);
  const replacementRows = props.replacements.slice(0, 3);
  function selectPreset(preset: ReturnType<typeof dayPresets>[number]) {
    props.setQuickAssignmentSelection({
      kind: 'day-preset',
      label: `${preset.label} - ${businessStatusLabel(props.quickBusinessStatus)}`,
      startTime: preset.startTime,
      endTime: preset.endTime,
      businessStatus: props.quickBusinessStatus,
      origin: 'TEMPLATE',
      templateId: preset.templateId,
      preset,
    });
  }
  function selectRotation(rotation: PlanningRotationOption) {
    props.setQuickAssignmentSelection({
      kind: 'weekly-rotation',
      label: `Roulement semaine ${rotation.name}`,
      startTime: '',
      endTime: '',
      businessStatus: 'work',
      rotation,
    });
  }

  return (
    <aside className="card-modern quick-assignment-panel">
      <div className="section-header-modern">
        <div>
          <span className="card-title"><Sparkles size={18} /> Affectation rapide</span>
          <span className="section-tagline">{formatShort(props.selectedDate)} - Enregistrement automatique</span>
        </div>
        <button className="btn btn-secondary btn-compact" type="button" onClick={() => props.setQuickPanelOpen(false)}>Masquer</button>
      </div>

      <label className="planning-field">
        Collaborateur
        <select value={props.selectedEmployeeId} onChange={(event) => props.setSelectedEmployeeId(event.target.value)}>
          <CollaboratorOptions collaborators={props.collaborators} placeholder="Sélectionner..." />
        </select>
      </label>

      {props.selectedEmployee ? (
        <>
          <label className="planning-field">
            Statut
            <select value={props.quickBusinessStatus} onChange={(event) => props.setQuickBusinessStatus(event.target.value)}>
              {planningBusinessStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
          <div className="quick-section">
            <strong>Presets jour</strong>
            <div className="chip-row">
              {presets.map((preset) => {
                const selected = props.quickAssignmentSelection?.templateId === preset.templateId && props.quickAssignmentSelection?.startTime === preset.startTime && props.quickAssignmentSelection?.endTime === preset.endTime;
                return <button key={preset.id} className={`planning-chip ${selected ? 'active' : ''}`} type="button" onClick={() => selectPreset(preset)}>{preset.label}<small>{presetRangeLabel(preset)} - {businessStatusLabel(presetBusinessStatus(preset) ?? props.quickBusinessStatus)}</small></button>;
              })}
            </div>
            {!presets.length ? <GuidedEmptyState title="Aucun preset jour" description="Créez d’abord un horaire type pour affecter rapidement vos salariés." actionLabel="Configurer les presets" onAction={props.onOpenSettings} /> : null}
          </div>
          {props.quickAssignmentSelection ? <div className="quick-selected-mode"><strong>Mode affectation actif</strong><span>{collaboratorName(props.selectedEmployee)} - {props.quickAssignmentSelection.label}</span><button className="btn btn-secondary btn-compact" type="button" onClick={() => props.setQuickAssignmentSelection(null)}>Annuler sélection</button></div> : null}
          <div className="quick-section">
            <strong>Roulements semaine</strong>
            <div className="chip-row">
              {props.rotations.slice(0, 5).map((rotation) => <button key={rotation.id} className={`planning-chip ${props.quickAssignmentSelection?.kind === 'weekly-rotation' && props.quickAssignmentSelection.rotation?.id === rotation.id ? 'active' : ''}`} type="button" onClick={() => selectRotation(rotation)}><Repeat2 size={13} /> {rotation.name}</button>)}
            </div>
            {props.rotations.length ? <span className="muted tiny">Roulements configurés dans Planning.</span> : <GuidedEmptyState title="Aucun roulement semaine" description="Vous pouvez planifier en manuel ou préparer les roulements dans Paramétrage." actionLabel="Voir les roulements" onAction={props.onOpenSettings} />}
          </div>
          <div className="quick-section">
            <strong>Horaire personnalisé</strong>
            <div className="planning-form-row">
              <label className="planning-field">Début<input type="time" value={props.customStart} onChange={(event) => props.setCustomStart(event.target.value)} /></label>
              <label className="planning-field">Fin<input type="time" value={props.customEnd} onChange={(event) => props.setCustomEnd(event.target.value)} /></label>
            </div>
            <button className="btn btn-secondary btn-compact" type="button" onClick={props.saveCustomShift}>Utiliser cet horaire</button>
          </div>
          <div className="quota-box">
            <div className="quota-box-head">
              <span>Quotas</span>
              <small>{formatShort(week[0])} - {formatShort(week[6])}</small>
            </div>
            <div className="quota-box-grid">
              {quotaColumns.map((item) => (
                <div key={item.key} className="quota-box-column">
                  <span>{item.label}</span>
                  <strong>{formatMinutesValue(item.planned)}</strong>
                  <small>{item.quota == null ? 'Quota non défini' : `/ ${formatMinutesValue(item.quota)}`}</small>
                  <small>{item.quota == null ? 'Solde --' : `Solde ${formatMinutesValue(item.quota - item.planned)}`}</small>
                </div>
              ))}
            </div>
            <small>Postes secondaires : {secondary.length ? secondary.join(', ') : 'aucun'}</small>
          </div>
          <div className="quick-section">
            <strong>Remplacements suggérés</strong>
            {replacementRows.length ? replacementRows.map((proposal) => <span key={proposal.id} className="replacement-mini">{proposal.status ?? 'À traiter'} - {proposal.candidates?.length ?? 0} candidat(s)</span>) : <span className="muted tiny">Aucun remplacement réel suggéré.</span>}
          </div>
        </>
      ) : <p className="muted">Sélectionnez un collaborateur pour afficher ses presets, roulements, quotas et remplacements.</p>}
    </aside>
  );
}

function AssignmentEditModal({ assignment, collaborators, departments, positions, sites, canWrite, onClose, onSave, onDelete }: { assignment: PlanningAssignment; collaborators: HrCollaborator[]; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; canWrite: boolean; onClose: () => void; onSave: (assignment: PlanningAssignment, patch: Partial<PlanningAssignment> & { businessStatus?: string }) => Promise<void>; onDelete: (assignment: PlanningAssignment) => Promise<void> }) {
  const [form, setForm] = useState(() => ({
    employeeId: assignment.employeeId ?? assignment.collaboratorId ?? '',
    departmentId: assignment.departmentId ?? '',
    positionId: assignment.positionId ?? '',
    siteId: assignment.siteId ?? '',
    businessStatus: assignmentBusinessStatus(assignment),
    startTime: timeLabel(assignment.startTime),
    endTime: timeLabel(assignment.endTime),
    breakMinutes: Number(assignment.breakMinutes ?? 0),
  }));
  const availablePositions = positions.filter((position) => !form.departmentId || position.departmentId === form.departmentId);
  const status = businessStatusConfig(form.businessStatus);
  return (
    <div className="modal-overlay planning-edit-overlay" onClick={onClose}>
      <div className="card-modern planning-edit-modal" onClick={(event) => event.stopPropagation()}>
        <div className="section-header-modern">
          <div>
            <span className="card-title"><CalendarDays size={18} /> Modifier l’affectation</span>
            <span className="section-tagline">{formatAttendanceDate(assignment.date)} - {businessStatusLabel(form.businessStatus)}</span>
          </div>
          <span className={`status-pill status-${status.className}`}>{status.label}</span>
        </div>
        <div className="planning-form-row">
          <label className="planning-field">Collaborateur<select value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}><CollaboratorOptions collaborators={collaborators} /></select></label>
          <label className="planning-field">Statut<select value={form.businessStatus} onChange={(event) => setForm((current) => ({ ...current, businessStatus: event.target.value }))}>{planningBusinessStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        <div className="planning-form-row">
          <label className="planning-field">Début<input type="time" value={form.startTime} disabled={!businessStatusCountsHours(form.businessStatus)} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} /></label>
          <label className="planning-field">Fin<input type="time" value={form.endTime} disabled={!businessStatusCountsHours(form.businessStatus)} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} /></label>
          <label className="planning-field">Pause<input type="number" min="0" max="720" value={form.breakMinutes} disabled={!businessStatusCountsHours(form.businessStatus)} onChange={(event) => setForm((current) => ({ ...current, breakMinutes: Number(event.target.value) }))} /></label>
        </div>
        <div className="planning-form-row">
          <label className="planning-field">Service<select value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value, positionId: '' }))}>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label className="planning-field">Poste<select value={form.positionId} onChange={(event) => setForm((current) => ({ ...current, positionId: event.target.value }))}>{availablePositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select></label>
          <label className="planning-field">Site<select value={form.siteId} onChange={(event) => setForm((current) => ({ ...current, siteId: event.target.value }))}><option value="">Aucun</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        </div>
        <div className="setup-actions">
          <button className="btn btn-primary" type="button" disabled={!canWrite} onClick={() => void onSave(assignment, { ...form, siteId: form.siteId || undefined, breakMinutes: businessStatusCountsHours(form.businessStatus) ? form.breakMinutes : 0, startTime: businessStatusCountsHours(form.businessStatus) ? form.startTime : '00:00', endTime: businessStatusCountsHours(form.businessStatus) ? form.endTime : '00:00' })}>Enregistrer</button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Annuler</button>
          <button className="btn btn-secondary danger" type="button" disabled={!canWrite} onClick={() => void onDelete(assignment)}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}

function PlanningSettings({ selected, setSelected, requirements, templates, rotations, dayPresets, employeeTemplateAssignments, absences, departments, positions, sites, collaborators, settings, setup, onOpenInitialSetup, selectedDate, canWrite, onSaveRequirement, onDeleteRequirement, onSaveDayPreset, onDeleteDayPreset, onSaveWeeklyRotation, onDeleteWeeklyRotation, onSaveEmployeeTemplateAssignment }: { selected: SettingKey; setSelected: (value: SettingKey) => void; requirements: PlanningRequirement[]; templates: PlanningTemplate[]; rotations: PlanningTemplate[]; dayPresets: PlanningTemplate[]; employeeTemplateAssignments: PlanningEmployeeTemplateAssignment[]; absences: Array<Record<string, any>>; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; collaborators: HrCollaborator[]; settings?: Record<string, any>; setup: ReturnType<typeof buildPlanningSetup>; onOpenInitialSetup: () => void; selectedDate: string; canWrite: boolean; onSaveRequirement: (payload: RequirementPayload, id?: string) => Promise<void>; onDeleteRequirement: (id: string) => Promise<void>; onSaveDayPreset: (payload: PlanningDayPresetPayload, id?: string) => Promise<void>; onDeleteDayPreset: (id: string) => Promise<void>; onSaveWeeklyRotation: (payload: PlanningWeeklyRotationPayload, id?: string) => Promise<void>; onDeleteWeeklyRotation: (id: string) => Promise<void>; onSaveEmployeeTemplateAssignment: (payload: PlanningEmployeeTemplateAssignment) => Promise<void> }) {
  const cards: Array<{ key: SettingKey; title: string; description: string; count: string; status: PlanningSetupStatus; Icon: typeof ClipboardList }> = [
    { key: 'needs', title: 'Besoins par service', description: 'Saison, jour, créneau, service et besoin opérationnel.', count: `${requirements.length} besoin(s)`, status: requirements.length ? 'done' : 'todo', Icon: ClipboardList },
    { key: 'presets', title: 'Presets & roulements', description: 'Presets journaliers et roulements semaine propriétaires Planning.', count: `${dayPresets.length + rotations.length} élément(s)`, status: dayPresets.length && rotations.length ? 'done' : dayPresets.length || rotations.length ? 'partial' : 'todo', Icon: Repeat2 },
    { key: 'availability', title: 'Indisponibilités & absences', description: 'Absences RH en lecture seule et futures indisponibilités Planning.', count: `${absences.length} absence(s)`, status: 'partial', Icon: ShieldAlert },
    { key: 'rules', title: 'Règles planning', description: 'Couverture, repos, quota, pauses et conflits configurables.', count: 'Préparé', status: 'done', Icon: SlidersHorizontal },
    { key: 'costs', title: 'Coûts', description: 'Salaire brut RH et estimation employeur.', count: 'Non configuré', status: 'partial', Icon: Coins },
    { key: 'notifications', title: 'Notifications', description: 'Publication et rappels salariés futurs.', count: 'Préparé', status: 'partial', Icon: Bell },
    { key: 'exports', title: 'Exports', description: 'PDF, tableur et paie futurs.', count: 'Préparé', status: 'partial', Icon: FileSignature },
    { key: 'imports', title: 'Imports', description: 'ODS/XLSX et dictionnaire de codes.', count: 'Préparé', status: 'partial', Icon: RefreshCw },
  ];
  return (
    <>
      <PlanningSetupPanel setup={setup} compact={false} onOpenInitialSetup={onOpenInitialSetup} />
      <div className="planning-settings-layout">
        <div className="planning-settings-tabs">
          {cards.map(({ key, title, count, status, Icon }) => <button key={key} className={`settings-tab ${selected === key ? 'active' : ''}`} onClick={() => setSelected(key)}><Icon size={16} /><span>{title}</span><small>{count}</small><em className={`setup-status ${status}`}>{setupStatusLabel(status)}</em></button>)}
        </div>
        <div className="card-modern settings-detail">
          <SettingsDetail selected={selected} requirements={requirements} templates={templates} rotations={rotations} dayPresets={dayPresets} employeeTemplateAssignments={employeeTemplateAssignments} absences={absences} departments={departments} positions={positions} sites={sites} collaborators={collaborators} settings={settings} selectedDate={selectedDate} canWrite={canWrite} onSaveRequirement={onSaveRequirement} onDeleteRequirement={onDeleteRequirement} onSaveDayPreset={onSaveDayPreset} onDeleteDayPreset={onDeleteDayPreset} onSaveWeeklyRotation={onSaveWeeklyRotation} onDeleteWeeklyRotation={onDeleteWeeklyRotation} onSaveEmployeeTemplateAssignment={onSaveEmployeeTemplateAssignment} />
        </div>
      </div>
    </>
  );
}

function SettingsDetail({ selected, requirements, rotations, dayPresets, employeeTemplateAssignments, absences, departments, positions, sites, collaborators, settings, selectedDate, canWrite, onSaveRequirement, onDeleteRequirement, onSaveDayPreset, onDeleteDayPreset, onSaveWeeklyRotation, onDeleteWeeklyRotation, onSaveEmployeeTemplateAssignment }: { selected: SettingKey; requirements: PlanningRequirement[]; templates: PlanningTemplate[]; rotations: PlanningTemplate[]; dayPresets: PlanningTemplate[]; employeeTemplateAssignments: PlanningEmployeeTemplateAssignment[]; absences: Array<Record<string, any>>; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; collaborators: HrCollaborator[]; settings?: Record<string, any>; selectedDate: string; canWrite: boolean; onSaveRequirement: (payload: RequirementPayload, id?: string) => Promise<void>; onDeleteRequirement: (id: string) => Promise<void>; onSaveDayPreset: (payload: PlanningDayPresetPayload, id?: string) => Promise<void>; onDeleteDayPreset: (id: string) => Promise<void>; onSaveWeeklyRotation: (payload: PlanningWeeklyRotationPayload, id?: string) => Promise<void>; onDeleteWeeklyRotation: (id: string) => Promise<void>; onSaveEmployeeTemplateAssignment: (payload: PlanningEmployeeTemplateAssignment) => Promise<void> }) {
  if (selected === 'needs') return <NeedsSettingsDetail requirements={requirements} departments={departments} positions={positions} sites={sites} selectedDate={selectedDate} canWrite={canWrite} onSaveRequirement={onSaveRequirement} onDeleteRequirement={onDeleteRequirement} />;
  if (selected === 'presets') return <PresetsRotationsSettings dayPresets={dayPresets} weeklyRotations={rotations} assignments={employeeTemplateAssignments} departments={departments} positions={positions} sites={sites} collaborators={collaborators} canWrite={canWrite} onSaveDayPreset={onSaveDayPreset} onDeleteDayPreset={onDeleteDayPreset} onSaveWeeklyRotation={onSaveWeeklyRotation} onDeleteWeeklyRotation={onDeleteWeeklyRotation} onSaveEmployeeTemplateAssignment={onSaveEmployeeTemplateAssignment} />;
  if (selected === 'availability') return <><span className="card-title">Indisponibilités & absences</span><div className="settings-list">{absences.map((absence) => <div key={absence.id}><strong>{collaboratorName(findCollaborator(collaborators, absence.employeeId ?? absence.collaboratorId))}</strong><span>{absence.type ?? absence.reason ?? 'Absence'} - {formatShort(absence.startDate)} à {formatShort(absence.endDate)} - lecture seule RH</span></div>)}{!absences.length ? <p className="muted">Aucune absence RH sur la période. Les indisponibilités Planning auront leur propre stockage plus tard.</p> : null}</div></>;
  if (selected === 'rules') return <PlanningRulesSettings rules={settings?.rules as Array<Record<string, any>> | undefined} />;
  if (selected === 'costs') return <EmployerCostsSettings />;
  if (selected === 'notifications') return <PlaceholderList title="Notifications" items={['Publication Planning', 'Rappels émargement', 'Alertes manager']} />;
  if (selected === 'exports') return <PlaceholderList title="Exports" items={['Export planning', 'Export paie', 'Export compteurs']} />;
  return <PlaceholderList title="Imports" items={['Import ODS/XLSX', 'Dictionnaire de codes', 'Rapport de contrôle']} />;
}

function PresetsRotationsSettings({ dayPresets, weeklyRotations, assignments, departments, positions, sites, collaborators, canWrite, onSaveDayPreset, onDeleteDayPreset, onSaveWeeklyRotation, onDeleteWeeklyRotation, onSaveEmployeeTemplateAssignment }: { dayPresets: PlanningTemplate[]; weeklyRotations: PlanningTemplate[]; assignments: PlanningEmployeeTemplateAssignment[]; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; collaborators: HrCollaborator[]; canWrite: boolean; onSaveDayPreset: (payload: PlanningDayPresetPayload, id?: string) => Promise<void>; onDeleteDayPreset: (id: string) => Promise<void>; onSaveWeeklyRotation: (payload: PlanningWeeklyRotationPayload, id?: string) => Promise<void>; onDeleteWeeklyRotation: (id: string) => Promise<void>; onSaveEmployeeTemplateAssignment: (payload: PlanningEmployeeTemplateAssignment) => Promise<void> }) {
  const [editingPresetId, setEditingPresetId] = useState<string>();
  const [presetForm, setPresetForm] = useState<PlanningDayPresetPayload>(() => defaultDayPresetForm(departments[0]?.id));
  const [editingRotationId, setEditingRotationId] = useState<string>();
  const [rotationForm, setRotationForm] = useState<PlanningWeeklyRotationPayload>(() => defaultWeeklyRotationForm(departments[0]?.id));
  const [assignmentEmployeeId, setAssignmentEmployeeId] = useState(collaborators[0]?.id ?? '');
  const selectedAssignment = assignments.find((item) => item.employeeId === assignmentEmployeeId);

  useEffect(() => {
    if (!assignmentEmployeeId && collaborators[0]?.id) setAssignmentEmployeeId(collaborators[0].id);
  }, [assignmentEmployeeId, collaborators]);

  function editPreset(template: PlanningTemplate) {
    setEditingPresetId(template.id);
    setPresetForm({ name: template.name, description: template.description ?? '', startTime: template.startTime ?? template.lines?.[0]?.startTime ?? '10:00', endTime: template.endTime ?? template.lines?.[0]?.endTime ?? '17:00', departmentId: template.departmentId ?? undefined, positionId: template.positionId ?? template.lines?.[0]?.positionId ?? undefined, siteId: template.siteId ?? undefined, breakMinutes: template.breakMinutes ?? template.lines?.[0]?.breakMinutes ?? 30, paidBreak: !!template.paidBreak, businessStatus: presetBusinessStatus(template) ?? 'work' });
  }

  function editRotation(template: PlanningTemplate) {
    setEditingRotationId(template.id);
    setRotationForm({ name: template.name, description: template.description ?? '', departmentId: template.departmentId ?? undefined, siteId: template.siteId ?? undefined, days: template.days?.length ? template.days : defaultWeekDays() });
  }

  async function submitPreset(event: FormEvent) {
    event.preventDefault();
    await onSaveDayPreset({ ...presetForm, departmentId: presetForm.departmentId || undefined, positionId: presetForm.positionId || undefined, siteId: presetForm.siteId || undefined, breakMinutes: Number(presetForm.breakMinutes ?? 0) }, editingPresetId);
    setEditingPresetId(undefined);
    setPresetForm(defaultDayPresetForm(departments[0]?.id));
  }

  async function submitRotation(event: FormEvent) {
    event.preventDefault();
    await onSaveWeeklyRotation({ ...rotationForm, departmentId: rotationForm.departmentId || undefined, siteId: rotationForm.siteId || undefined, days: rotationForm.days ?? defaultWeekDays() }, editingRotationId);
    setEditingRotationId(undefined);
    setRotationForm(defaultWeeklyRotationForm(departments[0]?.id));
  }

  function updateRotationDay(dayOfWeek: number, patch: Partial<PlanningTemplateDay>) {
    const days = Array.isArray(rotationForm.days) ? rotationForm.days : defaultWeekDays();
    setRotationForm((current) => ({ ...current, days: days.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day) }));
  }

  async function submitAssignment(event: FormEvent) {
    event.preventDefault();
    if (!assignmentEmployeeId) return;
    await onSaveEmployeeTemplateAssignment({
      employeeId: assignmentEmployeeId,
      dayPresetIds: selectedAssignment?.dayPresetIds ?? [],
      weeklyRotationIds: selectedAssignment?.weeklyRotationIds ?? [],
      defaultWeeklyRotationId: selectedAssignment?.defaultWeeklyRotationId ?? undefined,
    });
  }

  function toggleAssignment(kind: 'day' | 'rotation', id: string) {
    const current = selectedAssignment ?? { employeeId: assignmentEmployeeId, dayPresetIds: [], weeklyRotationIds: [], defaultWeeklyRotationId: null };
    const nextDayIds = kind === 'day' ? toggleId(current.dayPresetIds, id) : current.dayPresetIds;
    const nextRotationIds = kind === 'rotation' ? toggleId(current.weeklyRotationIds, id) : current.weeklyRotationIds;
    void onSaveEmployeeTemplateAssignment({ employeeId: assignmentEmployeeId, dayPresetIds: nextDayIds, weeklyRotationIds: nextRotationIds, defaultWeeklyRotationId: current.defaultWeeklyRotationId && nextRotationIds.includes(current.defaultWeeklyRotationId) ? current.defaultWeeklyRotationId : null });
  }

  function setDefaultRotation(id: string) {
    const current = selectedAssignment ?? { employeeId: assignmentEmployeeId, dayPresetIds: [], weeklyRotationIds: [], defaultWeeklyRotationId: null };
    const rotationIds = current.weeklyRotationIds.includes(id) ? current.weeklyRotationIds : [...current.weeklyRotationIds, id];
    void onSaveEmployeeTemplateAssignment({ employeeId: assignmentEmployeeId, dayPresetIds: current.dayPresetIds, weeklyRotationIds: rotationIds, defaultWeeklyRotationId: current.defaultWeeklyRotationId === id ? null : id });
  }

  return (
    <>
      <div className="section-header-modern"><span className="card-title">Presets & roulements</span><span className="section-tagline">Horaires types, cycles et affectations par défaut.</span></div>
      <div className="planning-settings-controls planning-settings-split">
        <form className="planning-need-form" onSubmit={(event) => void submitPreset(event)}>
          <strong>Presets horaires</strong>
          <div className="planning-form-row">
            <label className="planning-field">Nom<input value={presetForm.name} onChange={(event) => setPresetForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label className="planning-field">Début<input type="time" value={presetForm.startTime} onChange={(event) => setPresetForm((current) => ({ ...current, startTime: event.target.value }))} required /></label>
            <label className="planning-field">Fin<input type="time" value={presetForm.endTime} onChange={(event) => setPresetForm((current) => ({ ...current, endTime: event.target.value }))} required /></label>
            <label className="planning-field">Pause<input type="number" min="0" max="720" value={presetForm.breakMinutes ?? 0} onChange={(event) => setPresetForm((current) => ({ ...current, breakMinutes: Number(event.target.value) }))} /></label>
            <label className="planning-field">Statut<select value={presetForm.businessStatus ?? 'work'} onChange={(event) => setPresetForm((current) => ({ ...current, businessStatus: event.target.value }))}>{planningBusinessStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          </div>
          <div className="planning-form-row">
            <label className="planning-field">Service<select value={presetForm.departmentId ?? ''} onChange={(event) => setPresetForm((current) => ({ ...current, departmentId: event.target.value || undefined, positionId: '' }))}><option value="">Libre</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
            <label className="planning-field">Poste<select value={presetForm.positionId ?? ''} onChange={(event) => setPresetForm((current) => ({ ...current, positionId: event.target.value || undefined }))}><option value="">Libre</option>{positions.filter((position) => !presetForm.departmentId || position.departmentId === presetForm.departmentId).map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select></label>
            <label className="planning-field">Site<select value={presetForm.siteId ?? ''} onChange={(event) => setPresetForm((current) => ({ ...current, siteId: event.target.value || undefined }))}><option value="">Tous</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
          </div>
          <div className="setup-actions"><button className="btn btn-primary" type="submit" disabled={!canWrite}>{editingPresetId ? 'Modifier preset' : 'Créer preset'}</button>{editingPresetId ? <button className="btn btn-secondary" type="button" onClick={() => { setEditingPresetId(undefined); setPresetForm(defaultDayPresetForm(departments[0]?.id)); }}>Annuler</button> : null}</div>
        </form>
        <div className="settings-list planning-settings-list">
          {dayPresets.map((preset) => <div key={preset.id} className="planning-settings-item"><div><strong>{cleanBusinessLabel(preset.name)}</strong><span>{presetRangeLabel(preset)} · Pause {preset.breakMinutes ?? preset.lines?.[0]?.breakMinutes ?? 0} min · {businessStatusLabel(presetBusinessStatus(preset) ?? 'work')}</span><small>{presetDefaultScope(preset, departments, positions, sites)} · {preset.employeeIds?.length ?? 0} personne(s) associée(s)</small></div><div className="planning-item-actions"><button className="btn btn-secondary btn-compact" type="button" onClick={() => editPreset(preset)}>Modifier</button><button className="btn btn-secondary btn-compact" type="button" disabled={!canWrite} onClick={() => { setEditingPresetId(undefined); setPresetForm({ ...presetForm, name: `${cleanBusinessLabel(preset.name)} copie`, startTime: preset.startTime ?? preset.lines?.[0]?.startTime ?? '10:00', endTime: preset.endTime ?? preset.lines?.[0]?.endTime ?? '17:00', breakMinutes: preset.breakMinutes ?? preset.lines?.[0]?.breakMinutes ?? 30, departmentId: preset.departmentId ?? undefined, positionId: preset.positionId ?? preset.lines?.[0]?.positionId ?? undefined, siteId: preset.siteId ?? undefined, paidBreak: !!preset.paidBreak, businessStatus: presetBusinessStatus(preset) ?? 'work' }); }}>Dupliquer</button><button className="btn btn-secondary btn-compact danger" type="button" disabled={!canWrite} onClick={() => void onDeleteDayPreset(preset.id)}>Archiver</button></div></div>)}
          {!dayPresets.length ? <p className="muted">Aucun preset horaire Planning.</p> : null}
        </div>
      </div>
      <div className="planning-settings-controls planning-settings-split">
        <form className="planning-need-form" onSubmit={(event) => void submitRotation(event)}>
          <strong>Roulements</strong>
          <div className="planning-form-row">
            <label className="planning-field">Nom<input value={rotationForm.name} onChange={(event) => setRotationForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label className="planning-field">Service<select value={rotationForm.departmentId ?? ''} onChange={(event) => setRotationForm((current) => ({ ...current, departmentId: event.target.value || undefined }))}><option value="">Tous</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
            <label className="planning-field">Site<select value={rotationForm.siteId ?? ''} onChange={(event) => setRotationForm((current) => ({ ...current, siteId: event.target.value || undefined }))}><option value="">Tous</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
          </div>
          <div className="planning-week-editor">
            {(Array.isArray(rotationForm.days) ? rotationForm.days : defaultWeekDays()).map((day) => <div key={day.dayOfWeek} className="planning-week-row"><strong>{dayNameFromNumber(day.dayOfWeek)}</strong><label>Statut<select value={day.mode} onChange={(event) => updateRotationDay(day.dayOfWeek, { mode: event.target.value })}><option value="WORK">Travail</option><option value="REST">Repos</option><option value="LEAVE">Congé</option><option value="CLOSED">Fermé</option></select></label><label>Début<input type="time" value={day.startTime ?? ''} disabled={day.mode !== 'WORK'} onChange={(event) => updateRotationDay(day.dayOfWeek, { startTime: event.target.value })} /></label><label>Fin<input type="time" value={day.endTime ?? ''} disabled={day.mode !== 'WORK'} onChange={(event) => updateRotationDay(day.dayOfWeek, { endTime: event.target.value })} /></label><label>Pause<input type="number" min="0" max="720" value={day.breakMinutes ?? 0} disabled={day.mode !== 'WORK'} onChange={(event) => updateRotationDay(day.dayOfWeek, { breakMinutes: Number(event.target.value) })} /></label></div>)}
          </div>
          <div className="setup-actions"><button className="btn btn-primary" type="submit" disabled={!canWrite}>{editingRotationId ? 'Modifier roulement' : 'Créer roulement'}</button>{editingRotationId ? <button className="btn btn-secondary" type="button" onClick={() => { setEditingRotationId(undefined); setRotationForm(defaultWeeklyRotationForm(departments[0]?.id)); }}>Annuler</button> : null}</div>
        </form>
        <div className="settings-list planning-settings-list">
          {weeklyRotations.map((rotation) => <div key={rotation.id} className="planning-settings-item"><div><strong>{cleanBusinessLabel(rotation.name)}</strong><span>{weeklyRotationSummary(rotation)} · {rotation.employeeIds?.length ?? 0} personne(s) associée(s)</span><small>{presetDefaultScope(rotation, departments, positions, sites)}</small></div><div className="planning-item-actions"><button className="btn btn-secondary btn-compact" type="button" onClick={() => editRotation(rotation)}>Modifier</button><button className="btn btn-secondary btn-compact" type="button" disabled={!canWrite} onClick={() => { setEditingRotationId(undefined); setRotationForm({ name: `${cleanBusinessLabel(rotation.name)} copie`, description: rotation.description ?? '', departmentId: rotation.departmentId ?? undefined, siteId: rotation.siteId ?? undefined, days: rotation.days?.length ? rotation.days : defaultWeekDays() }); }}>Dupliquer</button><button className="btn btn-secondary btn-compact danger" type="button" disabled={!canWrite} onClick={() => void onDeleteWeeklyRotation(rotation.id)}>Archiver</button></div></div>)}
          {!weeklyRotations.length ? <p className="muted">Aucun roulement Planning.</p> : null}
        </div>
      </div>
      <form className="planning-need-form" onSubmit={(event) => void submitAssignment(event)}>
        <strong>Affectations par défaut</strong>
        <label className="planning-field">Collaborateur<select value={assignmentEmployeeId} onChange={(event) => setAssignmentEmployeeId(event.target.value)}><CollaboratorOptions collaborators={collaborators} placeholder="Choisir..." /></select></label>
        <div className="settings-list">
          <div><strong>Presets jour attribués</strong><span>{dayPresets.map((preset) => <button key={preset.id} type="button" className={`planning-chip ${selectedAssignment?.dayPresetIds?.includes(preset.id) ? 'active' : ''}`} disabled={!assignmentEmployeeId || !canWrite} onClick={() => toggleAssignment('day', preset.id)}>{preset.name}</button>)}</span></div>
          <div><strong>Roulements attribués</strong><span>{weeklyRotations.map((rotation) => <button key={rotation.id} type="button" className={`planning-chip ${selectedAssignment?.weeklyRotationIds?.includes(rotation.id) ? 'active' : ''}`} disabled={!assignmentEmployeeId || !canWrite} onClick={() => toggleAssignment('rotation', rotation.id)}>{rotation.name}</button>)}</span></div>
          <div><strong>Roulement par défaut</strong><span>{weeklyRotations.map((rotation) => <button key={rotation.id} type="button" className={`planning-chip ${selectedAssignment?.defaultWeeklyRotationId === rotation.id ? 'active' : ''}`} disabled={!assignmentEmployeeId || !canWrite} onClick={() => setDefaultRotation(rotation.id)}>{rotation.name}</button>)}</span></div>
        </div>
        <p className="muted">Les attributions s’appuient sur les collaborateurs RH existants, sans les recréer dans Planning.</p>
      </form>
    </>
  );
}

const requirementSeasons = [
  ['basse', 'Basse'],
  ['normale', 'Normale'],
  ['haute', 'Haute'],
  ['evenement-brunch', 'Événement / brunch'],
] as const;

const requirementSlots = [
  { value: 'journee', label: 'Journée', startTime: '09:00', endTime: '17:00' },
  { value: 'matin', label: 'Matin', startTime: '07:00', endTime: '12:00' },
  { value: 'midi', label: 'Midi', startTime: '11:00', endTime: '15:00' },
  { value: 'soir', label: 'Soir', startTime: '18:00', endTime: '23:00' },
  { value: 'fermeture', label: 'Fermeture', startTime: '20:00', endTime: '00:00' },
  { value: 'personnalise', label: 'Personnalisé', startTime: '10:00', endTime: '17:00' },
] as const;

type RequirementFormState = {
  season: string;
  timeSlot: string;
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  recurrence: string;
  siteId: string;
  departmentId: string;
  positionId: string;
  requiredCount: string;
  startTime: string;
  endTime: string;
  priority: string;
};

function NeedsSettingsDetail({ requirements, departments, positions, sites, selectedDate, canWrite, onSaveRequirement, onDeleteRequirement }: { requirements: PlanningRequirement[]; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; selectedDate: string; canWrite: boolean; onSaveRequirement: (payload: RequirementPayload, id?: string) => Promise<void>; onDeleteRequirement: (id: string) => Promise<void> }) {
  const [editingId, setEditingId] = useState<string>();
  const [seasonFilter, setSeasonFilter] = useState('');
  const [viewMode, setViewMode] = useState<'day' | 'service'>('day');
  const [form, setForm] = useState<RequirementFormState>(() => defaultRequirementForm(selectedDate, departments[0]?.id ?? ''));
  const departmentPositions = positions.filter((position) => !form.departmentId || position.departmentId === form.departmentId);
  const filteredRequirements = requirements.filter((need) => !seasonFilter || need.season === seasonFilter);
  const sortedRequirements = [...filteredRequirements].sort((a, b) => {
    const left = viewMode === 'service' ? `${a.department?.name ?? a.departmentId ?? ''}-${a.startDate ?? a.date ?? ''}` : `${a.startDate ?? a.date ?? ''}-${a.department?.name ?? a.departmentId ?? ''}`;
    const right = viewMode === 'service' ? `${b.department?.name ?? b.departmentId ?? ''}-${b.startDate ?? b.date ?? ''}` : `${b.startDate ?? b.date ?? ''}-${b.department?.name ?? b.departmentId ?? ''}`;
    return left.localeCompare(right);
  });

  useEffect(() => {
    setForm((current) => current.departmentId ? current : { ...current, departmentId: departments[0]?.id ?? '' });
  }, [departments]);

  function update<K extends keyof RequirementFormState>(key: K, value: RequirementFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateSlot(value: string) {
    const slot = requirementSlots.find((item) => item.value === value);
    setForm((current) => ({ ...current, timeSlot: value, startTime: slot?.startTime ?? current.startTime, endTime: slot?.endTime ?? current.endTime }));
  }

  function editNeed(need: PlanningRequirement) {
    const slot = requirementSlots.find((item) => item.value === need.timeSlot) ?? requirementSlots.find((item) => item.startTime === need.startTime && item.endTime === need.endTime) ?? requirementSlots[0];
    setEditingId(need.id);
    const metadata = need.metadata ?? {};
    setForm({
      season: need.season || 'normale',
      timeSlot: slot.value,
      startDate: (need.startDate ?? need.date ?? selectedDate).slice(0, 10),
      endDate: (need.endDate ?? need.startDate ?? need.date ?? selectedDate).slice(0, 10),
      daysOfWeek: Array.isArray(metadata.daysOfWeek) ? metadata.daysOfWeek.map(Number).filter((day) => day >= 1 && day <= 7) : [1, 2, 3, 4, 5],
      recurrence: typeof metadata.recurrence === 'string' ? metadata.recurrence : 'weekly',
      siteId: need.siteId ?? '',
      departmentId: need.departmentId ?? departments[0]?.id ?? '',
      positionId: need.positionId ?? '',
      requiredCount: String(need.requiredCount ?? 1),
      startTime: need.startTime ?? slot.startTime,
      endTime: need.endTime ?? slot.endTime,
      priority: need.priority ?? 'NORMAL',
    });
  }

  function reset() {
    setEditingId(undefined);
    setForm(defaultRequirementForm(selectedDate, departments[0]?.id ?? ''));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.departmentId) return;
    await onSaveRequirement({
      departmentId: form.departmentId,
      positionId: form.positionId || undefined,
      siteId: form.siteId || undefined,
      season: form.season,
      timeSlot: form.timeSlot,
      label: requirementSummaryFromForm(form, departments),
      startDate: form.startDate,
      endDate: form.endDate || form.startDate,
      startTime: form.startTime,
      endTime: form.endTime,
      requiredCount: Math.max(1, Number(form.requiredCount) || 1),
      priority: form.priority,
      comment: JSON.stringify({ planningNeedMeta: { season: form.season, timeSlot: form.timeSlot, daysOfWeek: form.daysOfWeek, recurrence: form.recurrence } }),
    }, editingId);
    reset();
  }

  return (
    <>
      <div className="section-header-modern">
        <span className="card-title">Quand avez-vous besoin de personnel ?</span>
        <span className="section-tagline">{requirements.length} besoin(s) réel(s) - période, jours, service, créneau, volume</span>
      </div>
      <div className="planning-settings-controls">
        <label className="planning-field">Filtre saison
          <select value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)}>
            <option value="">Toutes saisons</option>
            {requirementSeasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div className="planning-segmented">
          <button type="button" className={viewMode === 'day' ? 'active' : ''} onClick={() => setViewMode('day')}>Par jour</button>
          <button type="button" className={viewMode === 'service' ? 'active' : ''} onClick={() => setViewMode('service')}>Par service</button>
        </div>
      </div>
      <form className="planning-need-form" onSubmit={(event) => void submit(event)}>
        <div className="planning-form-row">
          <label className="planning-field">Saison
            <select value={form.season} onChange={(event) => update('season', event.target.value)}>
              {requirementSeasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="planning-field">Début de période
            <input type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} />
          </label>
          <label className="planning-field">Fin de période
            <input type="date" value={form.endDate} onChange={(event) => update('endDate', event.target.value)} />
          </label>
          <label className="planning-field">Créneau
            <select value={form.timeSlot} onChange={(event) => updateSlot(event.target.value)}>
              {requirementSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
            </select>
          </label>
        </div>
        <div className="planning-form-row">
          <label className="planning-field">Service
            <select value={form.departmentId} onChange={(event) => update('departmentId', event.target.value)} required>
              <option value="">Choisir...</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>
          <label className="planning-field">Poste
            <select value={form.positionId} onChange={(event) => update('positionId', event.target.value)}>
              <option value="">Tous postes</option>
              {departmentPositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
            </select>
          </label>
          <label className="planning-field">Site
            <select value={form.siteId} onChange={(event) => update('siteId', event.target.value)}>
              <option value="">Tous sites</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
        </div>
        <div className="planning-day-picker">
          {dayNames.map((day, index) => {
            const value = index + 1;
            const selected = form.daysOfWeek.includes(value);
            return <button key={day} type="button" className={selected ? 'active' : ''} onClick={() => setForm((current) => ({ ...current, daysOfWeek: toggleNumber(current.daysOfWeek, value) }))}>{day.slice(0, 3)}</button>;
          })}
          <select value={form.recurrence} onChange={(event) => update('recurrence', event.target.value)}>
            <option value="weekly">Chaque semaine</option>
            <option value="second-sunday">Chaque deuxième dimanche du mois</option>
          </select>
        </div>
        <div className="planning-form-row">
          <label className="planning-field">Début
            <input type="time" value={form.startTime} onChange={(event) => update('startTime', event.target.value)} />
          </label>
          <label className="planning-field">Fin
            <input type="time" value={form.endTime} onChange={(event) => update('endTime', event.target.value)} />
          </label>
          <label className="planning-field">Personnes
            <input type="number" min="1" max="100" value={form.requiredCount} onChange={(event) => update('requiredCount', event.target.value)} />
          </label>
          <label className="planning-field">Niveau d’alerte
            <select value={form.priority} onChange={(event) => update('priority', event.target.value)}>
              <option value="LOW">Info</option>
              <option value="NORMAL">Avertissement</option>
              <option value="HIGH">Avertissement fort</option>
              <option value="CRITICAL">Bloquant</option>
            </select>
          </label>
        </div>
        <div className="setup-actions">
          <button className="btn btn-primary" type="submit" disabled={!canWrite || !departments.length}>{editingId ? 'Modifier' : 'Créer'}</button>
          {editingId ? <button className="btn btn-secondary" type="button" onClick={reset}>Annuler</button> : null}
        </div>
      </form>
      <div className="planning-table compact">
        {sortedRequirements.map((need) => <div className="planning-row planning-row-actions" key={need.id}><strong>{viewMode === 'service' ? need.department?.name ?? departments.find((item) => item.id === need.departmentId)?.name ?? 'Service' : formatPeriod(need.startDate ?? need.date, need.endDate)}</strong><span>{requirementSummary(need, departments)} - {need.startTime} à {need.endTime}</span><span>{need.position?.name ?? positions.find((item) => item.id === need.positionId)?.name ?? 'Tous postes'}</span><span className="status-pill">{need.requiredCount ?? 0} requis</span><button className="btn btn-secondary btn-compact" type="button" onClick={() => editNeed(need)}>Modifier</button><button className="btn btn-secondary btn-compact danger" type="button" disabled={!canWrite} onClick={() => void onDeleteRequirement(need.id)}>Supprimer</button></div>)}
        {!requirements.length ? <div className="planning-empty-state"><strong>Définissez vos premiers besoins</strong><span>Exemples : mardi midi salle 2 personnes, vendredi fermeture bar 1 personne, dimanche brunch cuisine 3 personnes.</span></div> : null}
        {requirements.length && !sortedRequirements.length ? <p className="muted">Aucun besoin ne correspond au filtre saison sélectionné.</p> : null}
      </div>
    </>
  );
}

const fallbackPlanningRules = [
  { key: 'closing-covered', name: 'Fermeture obligatoire couverte', description: 'Alerte si un besoin fermeture n’a aucune affectation couvrante.', status: 'active', impact: 'blocking', requiredData: ['Besoins fermeture', 'Affectations'] },
  { key: 'minimum-by-service', name: 'Minimum par service', description: 'Compare les besoins par service aux affectations du jour et du créneau.', status: 'active', impact: 'warning', requiredData: ['Besoins', 'Affectations'] },
  { key: 'required-position-present', name: 'Poste obligatoire présent', description: 'Alerte si un besoin avec poste défini n’est pas couvert par ce poste.', status: 'active', impact: 'warning', requiredData: ['Postes RH', 'Besoins avec poste'] },
  { key: 'weekly-quota', name: 'Quota hebdomadaire', description: 'Compare planifié et durée contractuelle RH.', status: 'active', impact: 'warning', requiredData: ['Contrats RH', 'Affectations'] },
  { key: 'mandatory-break', name: 'Pause obligatoire', description: 'Préparé pour profils configurables entreprise.', status: 'to_configure', impact: 'warning', requiredData: ['Règles configurables'] },
  { key: 'minimum-rest-between-shifts', name: 'Repos minimum entre shifts', description: 'Préparé pour les règles configurables de l’établissement.', status: 'to_configure', impact: 'warning', requiredData: ['Règles configurables'] },
  { key: 'availability-respected', name: 'Indisponibilité respectée', description: 'Absences RH approuvées déjà bloquantes; indisponibilités Planning futures.', status: 'partial', impact: 'blocking', requiredData: ['Absences RH', 'Indisponibilités futures'] },
  { key: 'overlap-forbidden', name: 'Chevauchement interdit', description: 'Détecte les shifts qui se chevauchent pour un même salarié.', status: 'active', impact: 'blocking', requiredData: ['Affectations'] },
];

function PlanningRulesSettings({ rules }: { rules?: Array<Record<string, any>> }) {
  const rows = rules?.length ? rules : fallbackPlanningRules;
  return (
    <>
      <div className="section-header-modern"><span className="card-title">Règles planning</span><span className="section-tagline">Calculées quand les données existent, sinon préparées</span></div>
      <div className="settings-list planning-rule-list">
        {rows.map((rule) => <div key={String(rule.key ?? rule.name)}><strong>{rule.name}</strong><span>{rule.description}</span><div className="rule-meta-row"><span className={`status-pill ${rule.status === 'active' ? 'success' : rule.status === 'partial' ? 'warning' : ''}`}>{ruleStatusLabel(rule.status)}</span><span className="status-pill">{impactLabel(rule.impact)}</span><small>{(rule.requiredData ?? []).join(', ')}</small></div></div>)}
      </div>
    </>
  );
}

function PayrollRulesSettings({ profile }: { profile?: Record<string, any> }) {
  const families = (profile?.families as string[] | undefined) ?? ['heures supplémentaires', 'dimanche', 'jours fériés', 'nuit', 'pauses', 'arrondis', 'primes'];
  return (
    <>
      <div className="section-header-modern"><span className="card-title">Règles paie & majorations</span><span className="section-tagline">Configuration entreprise, sans règles légales codées en dur</span></div>
      <div className="payroll-profile-box">
        <label className="planning-field">Profil actuel
          <select value="custom" disabled>
            <option value="custom">Règles internes</option>
          </select>
        </label>
        <p className="muted">Les règles Planning restent configurables par entreprise. Le calcul paie réel sera branché dans un lot dédié.</p>
      </div>
      <div className="settings-list">
        {families.map((family) => <div key={family}><strong>{family}</strong><span>Famille de règle préparée pour majorations, arrondis, exports paie et coût futur.</span></div>)}
      </div>
    </>
  );
}

function EmployerCostsSettings() {
  return (
    <>
      <div className="section-header-modern"><span className="card-title">Coûts employeur</span><span className="section-tagline">Mode simple préparé</span></div>
      <div className="payroll-profile-box">
        <label className="planning-field">Coefficient employeur simple
          <input type="number" min="1" step="0.01" value="1.42" disabled />
        </label>
        <p className="muted">Le dashboard utilise déjà les salaires RH disponibles pour un coût estimé basique. Le coefficient configurable reste placeholder tant qu’aucun stockage cohérent n’est validé.</p>
      </div>
      <div className="settings-list">
        <div><strong>Formule préparée</strong><span>Brut RH x coefficient employeur, puis règles avancées paie/comptabilité plus tard.</span></div>
        <div><strong>Mode avancé futur</strong><span>Majorations, primes, charges, exports paie et ventilation comptable.</span></div>
      </div>
    </>
  );
}

function PlanningSetupCompact({ setup }: { setup: ReturnType<typeof buildPlanningSetup> }) {
  const missing = setup.steps.filter((step) => step.status !== 'done').slice(0, 4);
  return (
    <div className="card-modern planning-setup-banner">
      <div>
        <span className="card-title"><Sparkles size={18} /> Planning à finaliser</span>
        <p className="muted">{setup.doneCount}/{setup.steps.length} étape(s) prêtes pour un planning exploitable.</p>
      </div>
      <div className="planning-setup-missing">
        {missing.map((step) => <button key={step.key} type="button" onClick={step.action} className={`setup-status ${step.status}`}>{step.title}</button>)}
      </div>
    </div>
  );
}

function PlanningSetupPanel({ setup, compact, onOpenInitialSetup }: { setup: ReturnType<typeof buildPlanningSetup>; compact: boolean; onOpenInitialSetup: () => void }) {
  const collapsed = setup.complete;
  return (
    <div className={`card-modern planning-setup-panel ${compact ? 'compact' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="section-header-modern">
        <div>
          <span className="card-title"><Sparkles size={18} /> {setup.complete ? 'Configuration Planning terminée' : 'Configuration Planning à compléter'}</span>
          <span className="section-tagline">{setup.progress}% prêt - Mode : Hybride</span>
        </div>
        <button className="btn btn-secondary btn-compact" type="button" onClick={onOpenInitialSetup}>Modifier les paramètres</button>
      </div>
      {!collapsed ? (
        <>
          <div className="progress-bar-bg planning-setup-progress"><div className="progress-bar-fill" style={{ width: `${setup.progress}%` }} /></div>
          <div className="planning-setup-summary-grid">
            {setup.steps.slice(0, 4).map((step) => (
              <div key={step.key} className={`planning-setup-summary ${step.status}`}>
                <strong>{step.title}</strong>
                <span>{step.description}</span>
              </div>
            ))}
          </div>
          <p className="muted">Besoins, presets, statuts et roulements restent modifiables depuis les sections ci-dessous.</p>
        </>
      ) : null}
    </div>
  );
}

function GuidedEmptyState({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="planning-empty-state guided"><strong>{title}</strong><span>{description}</span>{actionLabel && onAction ? <button type="button" className="btn btn-secondary btn-compact" onClick={onAction}>{actionLabel}</button> : null}</div>;
}

function AttendanceView({ rows, assignments, collaborators, selectedMonth, employeeFilter }: { rows: Array<Record<string, any>>; assignments: PlanningAssignment[]; collaborators: HrCollaborator[]; selectedMonth: string; employeeFilter: string }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [attendanceView, setAttendanceView] = useState<'sheets' | 'validation'>('sheets');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const displayRows = rows.length ? rows : assignments.map((assignment) => ({ assignmentId: assignment.id, employeeId: assignment.employeeId ?? assignment.collaboratorId, employeeName: collaboratorName(findCollaborator(collaborators, assignment.employeeId ?? assignment.collaboratorId)), date: assignment.date, plannedStartTime: assignment.startTime, plannedEndTime: assignment.endTime, plannedMinutes: Math.round(assignmentHours(assignment) * 60), declaredMinutes: null, validatedMinutes: null, varianceMinutes: null, status: 'DRAFT', statusLabel: 'Non signe', persistence: false }));
  const filteredRows = displayRows.filter((row) => String(row.date ?? '').slice(0, 7) === selectedMonth && (!employeeFilter || row.employeeId === employeeFilter) && (!statusFilter || normalizeAttendanceStatus(row.status) === statusFilter));
  const employeeSummaries = attendanceEmployeeSummaries(filteredRows, collaborators);
  const activeEmployeeId = selectedEmployee || employeeFilter;
  const detailRows = activeEmployeeId ? filteredRows.filter((row) => row.employeeId === activeEmployeeId) : [];
  const detailCollaborator = findCollaborator(collaborators, activeEmployeeId);

  return (
    <div className="card-modern attendance-card">
      <div className="section-header-modern">
        <div><span className="card-title"><FileSignature size={18} /> Emargement</span><span className="section-tagline">Feuilles d'heures par collaborateur.</span></div>
        <span className="status-pill">{rows.length ? 'Persistant' : 'Signature a venir'}</span>
      </div>
      <div className="planning-segmented">
        <button type="button" className={attendanceView === 'sheets' ? 'active' : ''} onClick={() => setAttendanceView('sheets')}>Feuilles d'heures</button>
        <button type="button" className={attendanceView === 'validation' ? 'active' : ''} onClick={() => setAttendanceView('validation')}>Validation manager</button>
      </div>
      <div className="planning-settings-controls">
        <label className="planning-field">Mois<input type="month" value={selectedMonth} disabled /></label>
        <label className="planning-field">Statut
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Tous</option>
            <option value="NOT_SIGNED">Non signe</option>
            <option value="TO_VALIDATE">A valider</option>
            <option value="VALIDATED">Valide</option>
            <option value="REJECTED">A reprendre</option>
          </select>
        </label>
      </div>
      {activeEmployeeId ? (
        <div className="attendance-detail-panel">
          <div className="section-header-modern">
            <div><span className="section-tagline">Feuille d'emargement</span><h3>{collaboratorName(detailCollaborator)} - {monthLabel(`${selectedMonth}-01`)}</h3></div>
            <button className="btn btn-secondary" type="button" onClick={() => setSelectedEmployee('')}>Retour collaborateurs</button>
          </div>
          <div className="planning-table attendance-detail-table">
            {detailRows.map((row, index) => <div className="planning-row planning-row-actions" key={(row as any).id ?? row.assignmentId ?? index}><strong>{formatShort(row.date)}</strong><span>{attendancePlannedLabel(row)}</span><span>{row.declaredMinutes == null ? 'A signer' : formatMinutesValue(Number(row.declaredMinutes))}</span><span>{row.validatedMinutes == null ? '-' : formatMinutesValue(Number(row.validatedMinutes))}</span><span>{row.varianceMinutes == null ? 'Ecart n.c.' : formatSignedMinutes(Number(row.varianceMinutes))}</span><span className="status-pill">{attendanceStatusLabel(row.status)}</span></div>)}
          </div>
        </div>
      ) : (
        <div className="planning-table attendance-table">
          {employeeSummaries.map((item) => <button type="button" className="planning-row attendance-employee-row" key={item.employeeId} onClick={() => setSelectedEmployee(item.employeeId)}><strong>{item.employeeName}</strong><span>{formatMinutesValue(item.plannedMinutes)}</span><span>{item.declaredMinutes == null ? 'Non signe' : formatMinutesValue(item.declaredMinutes)}</span><span>{item.validatedMinutes == null ? '-' : formatMinutesValue(item.validatedMinutes)}</span><span>{item.varianceMinutes == null ? 'Ecart n.c.' : formatSignedMinutes(item.varianceMinutes)}</span><span className="status-pill">{attendanceSummaryStatusLabel(item.status)}</span></button>)}
          {!employeeSummaries.length ? <GuidedEmptyState title="Aucune feuille d'emargement" description="Les heures planifiees alimentent cette vue. Les signatures salaries et heures declarees reelles seront ajoutees plus tard." /> : null}
        </div>
      )}
      <p className="muted">Aucune signature reelle n'est simulee lorsque la ligne n'existe pas encore. Les statuts visibles restent metier : non signe, a valider, valide, a reprendre.</p>
    </div>
  );
}
function AlertList({ alerts }: { alerts: PlanningAlert[] }) {
  const shown = alerts.length ? alerts : [{ id: 'ok', level: 'information', title: 'Aucune alerte prioritaire', message: 'Les alertes apparaîtront ici depuis planning_conflicts, besoins, absences RH et remplacements.' }];
  return <div className="planning-alert-list">{shown.slice(0, 8).map((alert) => <div key={alert.id ?? alert.title} className={`planning-alert ${alert.level ?? 'information'}`}><strong>{alert.title ?? alert.label ?? alert.code ?? 'Alerte Planning'}</strong><span>{alert.message ?? 'Contrôle Planning à vérifier.'}</span>{alert.createdAt ? <small>{formatShort(alert.createdAt)}</small> : null}</div>)}</div>;
}

function DepartmentHours({ distribution }: { distribution: Array<{ name: string; hours: number; percent: number }> }) {
  if (!distribution.length) return <p className="muted">Aucune heure planifiée par service sur la période.</p>;
  return <div className="department-hours-list">{distribution.map((item) => <div key={item.name} className="department-hour-row"><div><strong>{item.name}</strong><span>{formatMinutesValue(Math.round(item.hours * 60))} - {item.percent}%</span></div><div className="hour-bar"><i style={{ width: `${item.percent}%` }} /></div></div>)}</div>;
}

function PlaceholderList({ title, items }: { title: string; items: string[] }) {
  return <><span className="card-title">{title}</span><div className="settings-list">{items.map((item) => <div key={item}><strong>{item}</strong><span>Configuration prévue sans règle codée en dur pour ce lot.</span></div>)}</div></>;
}

function OnboardingCard() {
  return <div className="card-modern planning-prerequisite"><span className="card-title"><Info size={18} /> Structure de démarrage</span><p>Complétez RH avant de planifier. Le futur onboarding guidera besoins, presets, roulements et règles internes.</p><div className="planning-sample-row"><span>Socle RH</span><span>Besoins récurrents</span><span>Règles configurables</span></div></div>;
}

function buildDashboard(data: PlanningBootstrap | undefined, assignments: PlanningAssignment[], alerts: PlanningAlert[], replacements: PlanningReplacementProposal[], requirements: PlanningRequirement[], period?: DashboardPeriodRange) {
  const plannedMinutes = assignments.reduce((sum, assignment) => sum + Math.round(assignmentHours(assignment) * 60), 0);
  const estimatedCost = assignments.reduce((sum, assignment) => sum + (Math.round(assignmentHours(assignment) * 60) / 60) * employeeHourlyRate(assignment.collaborator ?? assignment.employee), 0);
  const priorityAlerts = alerts.filter((alert) => ['critique', 'attention', 'critical', 'warning'].includes(String(alert.level)));
  const fallbackAlerts = alerts.length ? alerts.length : requirements.length + replacements.length;
  return {
    plannedMinutes,
    plannedHours: data?.summary?.plannedHours ?? Math.round((plannedMinutes / 60) * 10) / 10,
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    activeAlerts: fallbackAlerts,
    priorityAlerts: priorityAlerts.length,
    actionsToProcess: data?.summary?.actionsToProcess ?? replacements.length,
  };
}

function applyPlanningSummary(base: ReturnType<typeof buildDashboard>, summary?: PlanningSummary | null) {
  if (!summary) return base;
  return {
    ...base,
    plannedMinutes: Number(summary.plannedMinutes ?? base.plannedMinutes) || 0,
    plannedHours: Number(summary.plannedHours ?? base.plannedHours) || 0,
    estimatedCost: Number(summary.estimatedCost ?? base.estimatedCost) || 0,
    activeAlerts: Number(summary.activeAlerts ?? base.activeAlerts) || 0,
    priorityAlerts: Number(summary.priorityAlerts ?? base.priorityAlerts) || 0,
    actionsToProcess: Number(summary.actionsToProcess ?? base.actionsToProcess) || 0,
  };
}

function planningSettingsArray<T>(settings: Record<string, any> | undefined, key: string): T[] {
  const value = settings?.[key];
  return Array.isArray(value) ? value as T[] : [];
}

function dayPresetTemplates(templates: PlanningTemplate[]) {
  return templates.filter((template) => template.templateType === 'DAY_PRESET' || template.periodType === 'DAY_PRESET' || template.content?.type === 'DAY_PRESET');
}

function weeklyRotationTemplates(templates: PlanningTemplate[]) {
  return templates.filter((template) => template.templateType === 'WEEKLY_ROTATION' || template.periodType === 'WEEKLY_ROTATION' || template.content?.type === 'WEEKLY_ROTATION');
}

function defaultDayPresetForm(departmentId?: string): PlanningDayPresetPayload {
  return { name: '', startTime: '10:00', endTime: '17:00', departmentId: departmentId || undefined, breakMinutes: 30, paidBreak: false, businessStatus: 'work' };
}

function defaultWeeklyRotationForm(departmentId?: string): PlanningWeeklyRotationPayload {
  return { name: '', departmentId: departmentId || undefined, days: defaultWeekDays() };
}

function defaultWeekDays(): PlanningTemplateDay[] {
  return [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, key: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][dayOfWeek - 1], mode: dayOfWeek <= 5 ? 'WORK' : 'REST', startTime: dayOfWeek <= 5 ? '10:00' : null, endTime: dayOfWeek <= 5 ? '17:00' : null, breakMinutes: 30 }));
}

function toggleId(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function dayNameFromNumber(dayOfWeek: number) {
  return dayNames[Math.max(0, Math.min(6, dayOfWeek - 1))] ?? `Jour ${dayOfWeek}`;
}

function currentMonthPeriod(selectedDate: string, siteId?: string) {
  const date = new Date(`${selectedDate.slice(0, 10)}T12:00:00`);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { startDate: localIso(start), endDate: localIso(end), siteId: siteId || undefined };
}

function localIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function periodStatusLabel(status: string) {
  return status === 'CONTROLLED' ? 'Contrôlé' : status === 'PUBLISHED' ? 'Publié' : status === 'MODIFIED_AFTER_PUBLICATION' ? 'Modifié après publication' : status === 'LOCKED' ? 'Verrouillé' : 'Brouillon';
}

function buildPlanningSetup({ collaborators, departments, requirements, templates, onNavigate, openSetting }: { collaborators: HrCollaborator[]; departments: HrDepartment[]; requirements: PlanningRequirement[]; templates: PlanningTemplate[]; onNavigate: (tab: PlanningTab) => void; openSetting: (setting: SettingKey) => void }) {
  const activeCollaborators = collaborators.filter((collaborator) => collaborator.status !== 'DEPARTED');
  const presets = dayPresets(templates);
  const steps: PlanningSetupStep[] = [
    { key: 'services', title: 'Socle RH', description: `${departments.length} service(s) RH, ${activeCollaborators.length} collaborateur(s) actif(s).`, status: departments.length && activeCollaborators.length ? 'done' : departments.length || activeCollaborators.length ? 'partial' : 'todo', actionLabel: 'Voir RH', action: () => onNavigate('settings') },
    { key: 'needs', title: 'Besoins récurrents', description: requirements.length ? `${requirements.length} règle(s) créée(s).` : 'Créez quelques règles de base.', status: requirements.length ? 'done' : 'partial', actionLabel: 'Configurer', action: () => openSetting('needs') },
    { key: 'presets', title: 'Presets horaires', description: presets.length ? `${presets.length} preset(s) disponible(s).` : 'Ajoutez les horaires types.', status: presets.length ? 'done' : 'partial', actionLabel: 'Configurer', action: () => openSetting('presets') },
  ];
  const doneCount = steps.filter((step) => step.status === 'done').length;
  return { steps, doneCount, progress: Math.round((doneCount / steps.length) * 100), complete: steps.every((step) => step.status === 'done') };
}

function normalizePlanningBootstrap(payload: PlanningBootstrap): PlanningBootstrap {
  const raw = payload as PlanningBootstrap & { employees?: HrCollaborator[]; replacements?: Array<PlanningReplacementProposal & { rationale?: PlanningReplacementProposal['candidates'] }>; stats?: Record<string, number> };
  const collaborators = payload.collaborators ?? raw.employees ?? [];
  const assignments = (payload.assignments ?? []).map(normalizePlanningAssignment);
  const requirements = (payload.requirements ?? payload.needs ?? []).map((need: PlanningRequirement & { startDate?: string | null }) => ({ ...need, date: need.date ?? need.startDate }));
  const replacementProposals = (payload.replacementProposals ?? payload.replacements ?? raw.replacements ?? []).map((proposal: PlanningReplacementProposal & { rationale?: PlanningReplacementProposal['candidates'] }) => ({
    ...proposal,
    absentCollaboratorId: proposal.absentCollaboratorId ?? proposal.absentEmployeeId,
    replacementCollaboratorId: proposal.replacementCollaboratorId ?? proposal.replacementEmployeeId,
    candidates: proposal.candidates ?? proposal.rationale ?? [],
  }));
  const alerts = (payload.alerts ?? []).map((alert: PlanningAlert & { label?: string; details?: unknown; code?: string }) => ({
    ...alert,
    title: alert.title ?? alert.label ?? alert.code ?? 'Alerte Planning',
    message: alert.message ?? (typeof alert.details === 'string' ? alert.details : 'Contrôle Planning à vérifier.'),
  }));
  return { ...payload, collaborators, assignments, requirements, replacementProposals, alerts };
}

function normalizePlanningAssignment(assignment: PlanningAssignment): PlanningAssignment {
  const businessStatus = assignment.businessStatus ?? assignmentBusinessStatus(assignment);
  return { ...assignment, businessStatus, date: normalizePlanningDate(assignment.date), collaboratorId: assignment.collaboratorId ?? assignment.employeeId, collaborator: assignment.collaborator ?? assignment.employee };
}

function assignmentBusinessStatus(assignment: Partial<PlanningAssignment>) {
  if (assignment.businessStatus) return cleanBusinessStatus(assignment.businessStatus);
  const meta = parseAssignmentMeta(assignment.comment);
  return cleanBusinessStatus(meta.businessStatus);
}

function presetBusinessStatus(preset?: Partial<PlanningTemplate> | Partial<PlanningAssignment> | null) {
  if (!preset) return undefined;
  const raw = (preset as Partial<PlanningTemplate>).businessStatus ?? (preset as Partial<PlanningTemplate>).content?.businessStatus ?? (preset as Partial<PlanningAssignment>).businessStatus;
  return raw ? cleanBusinessStatus(String(raw)) : undefined;
}

function parseAssignmentMeta(comment?: string | null): { businessStatus?: string } {
  if (!comment) return {};
  try {
    const parsed = JSON.parse(comment);
    return parsed?.planningAssignmentMeta ?? parsed ?? {};
  } catch {
    return {};
  }
}

function serializeAssignmentMeta(meta: { businessStatus: string }) {
  return JSON.stringify({ planningAssignmentMeta: { businessStatus: cleanBusinessStatus(meta.businessStatus) } });
}

function cleanBusinessStatus(value?: string | null) {
  return planningBusinessStatuses.some((status) => status.value === value) ? String(value) : 'work';
}

function businessStatusConfig(value?: string | null) {
  return planningBusinessStatuses.find((status) => status.value === cleanBusinessStatus(value)) ?? planningBusinessStatuses[0];
}

function businessStatusLabel(value?: string | null) { return businessStatusConfig(value).label; }
function businessStatusCountsHours(value?: string | null) { return businessStatusConfig(value).countsHours; }

function assignmentDisplayRange(assignment: PlanningAssignment) {
  const status = assignmentBusinessStatus(assignment);
  return businessStatusCountsHours(status) && timeToMinutes(assignment.startTime) !== timeToMinutes(assignment.endTime) ? timeRange(assignment) : businessStatusLabel(status);
}

function presetRangeLabel(preset: Partial<PlanningTemplate> & { startTime?: string | null; endTime?: string | null }) {
  const status = presetBusinessStatus(preset);
  return status && !businessStatusCountsHours(status) ? businessStatusLabel(status) : `${timeLabel(preset.startTime)} - ${timeLabel(preset.endTime)}`;
}

function consolidateAssignmentsByEmployee(assignments: PlanningAssignment[], collaborators: HrCollaborator[]): CalendarAssignmentGroup[] {
  const groups = new Map<string, PlanningAssignment[]>();
  assignments.filter((assignment) => assignment.status !== 'CANCELLED').forEach((assignment) => {
    const employeeId = assignment.employeeId ?? assignment.collaboratorId;
    if (!employeeId) return;
    groups.set(employeeId, [...(groups.get(employeeId) ?? []), assignment]);
  });
  return Array.from(groups.entries()).map(([employeeId, items]) => {
    const sorted = [...items].sort((a, b) => (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0));
    const hasConflict = sorted.some((item, index) => sorted.slice(index + 1).some((other) => rangesOverlap(item.startTime, item.endTime, other.startTime, other.endTime)));
    return { employeeId, collaborator: findCollaborator(collaborators, employeeId) ?? sorted[0]?.collaborator ?? sorted[0]?.employee ?? undefined, assignments: sorted, businessStatus: assignmentBusinessStatus(sorted[0]), hasConflict };
  });
}

function dayPresets(templates: PlanningTemplate[]) {
  const templatePresets = dayPresetTemplates(templates).flatMap((template) => (template.lines?.length ? template.lines : [{ startTime: template.startTime, endTime: template.endTime, breakMinutes: template.breakMinutes, departmentId: template.departmentId, positionId: template.positionId, siteId: template.siteId, businessStatus: template.businessStatus }]).map((line, index) => ({
    id: `${template.id}-${index}`,
    templateId: template.id,
    label: line.comment ?? template.name,
    startTime: line.startTime ?? '10:00',
    endTime: line.endTime ?? '17:00',
    departmentId: line.departmentId ?? template.departmentId,
    positionId: line.positionId,
    siteId: line.siteId ?? template.siteId,
    breakMinutes: line.breakMinutes,
    businessStatus: presetBusinessStatus(line) ?? presetBusinessStatus(template) ?? 'work',
  })));
  return templatePresets.filter((preset) => preset.startTime && preset.endTime).slice(0, 8);
}

function defaultRequirementForm(selectedDate: string, departmentId: string): RequirementFormState {
  const end = addMonths(selectedDate, 3);
  return { season: 'normale', timeSlot: 'midi', startDate: selectedDate, endDate: end, daysOfWeek: [1, 2, 3, 4, 5], recurrence: 'weekly', siteId: '', departmentId, positionId: '', requiredCount: '1', startTime: '11:00', endTime: '15:00', priority: 'NORMAL' };
}

function normalizeHoursByDepartment(rows?: Array<Record<string, any>>) {
  const values = (rows ?? []).map((row) => ({ name: String(row.departmentName ?? row.name ?? 'Service'), hours: Number(row.plannedHours ?? row.hours ?? 0) })).filter((row) => row.hours > 0);
  const total = values.reduce((sum, row) => sum + row.hours, 0);
  return values.map((row) => ({ ...row, percent: total ? Math.round((row.hours / total) * 100) : 0 }));
}

function dayTone(assignments: PlanningAssignment[], requirements: PlanningRequirement[]) {
  if (assignments.some((assignment) => assignment.conflicts?.some((conflict) => ['BLOCKING', 'critical', 'critique'].includes(String(conflict.level ?? conflict.code))))) return 'tone-red';
  if (requirements.length && assignments.length < requirements.reduce((sum, item) => sum + Number(item.requiredCount ?? 0), 0)) return 'tone-red';
  if (assignments.some((assignment) => assignment.conflicts?.length) || requirements.length) return 'tone-orange';
  if (assignments.length) return 'tone-green';
  return 'tone-grey';
}

function requirementMatchesDay(requirement: PlanningRequirement, day: string) {
  const start = normalizePlanningDate(requirement.date ?? requirement.startDate);
  if (!start) return false;
  const end = normalizePlanningDate(requirement.endDate ?? start);
  if (day < start || day > end) return false;
  const metadata = requirement.metadata ?? {};
  if (metadata.recurrence === 'second-sunday') return isSecondSunday(day);
  const days = Array.isArray(metadata.daysOfWeek) ? metadata.daysOfWeek.map(Number).filter((value) => value >= 1 && value <= 7) : [];
  if (!days.length) return true;
  return days.includes(isoDayOfWeek(day));
}

function findCollaborator(collaborators: HrCollaborator[], id?: string | null) { return collaborators.find((item) => item.id === id); }
function collaboratorName(collaborator?: HrCollaborator | null) { return collaborator ? `${collaborator.firstName} ${collaborator.lastName}`.trim() : 'Collaborateur RH'; }
function collaboratorPositionTitle(collaborator?: HrCollaborator | null) { return formatPositionTitle(collaborator?.position?.name); }
function CollaboratorOptions({ collaborators, placeholder }: { collaborators: HrCollaborator[]; placeholder?: string }) {
  return (
    <>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {groupCollaboratorsByPosition(collaborators).map((group) => (
        <optgroup key={group.positionName} label={group.positionName}>
          {group.collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaboratorName(collaborator)}</option>)}
        </optgroup>
      ))}
    </>
  );
}
function groupCollaboratorsByPosition(collaborators: HrCollaborator[]) {
  const groups = new Map<string, HrCollaborator[]>();
  collaborators.forEach((collaborator) => {
    const title = collaboratorPositionTitle(collaborator);
    groups.set(title, [...(groups.get(title) ?? []), collaborator]);
  });
  return [...groups.entries()]
    .map(([positionName, items]) => ({ positionName, collaborators: items.sort(compareCollaboratorsByLastName) }))
    .sort((a, b) => comparePositionTitles(a.positionName, b.positionName));
}
function compareCollaboratorsByLastName(a: HrCollaborator, b: HrCollaborator) {
  const lastName = String(a.lastName ?? '').localeCompare(String(b.lastName ?? ''), 'fr-FR', { sensitivity: 'base' });
  if (lastName !== 0) return lastName;
  const firstName = String(a.firstName ?? '').localeCompare(String(b.firstName ?? ''), 'fr-FR', { sensitivity: 'base' });
  if (firstName !== 0) return firstName;
  return collaboratorName(a).localeCompare(collaboratorName(b), 'fr-FR', { sensitivity: 'base' });
}
function comparePositionTitles(a: string, b: string) {
  const missing = 'Poste non renseigné';
  if (a === missing && b !== missing) return 1;
  if (b === missing && a !== missing) return -1;
  return a.localeCompare(b);
}
function formatPositionTitle(value?: string | null) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean ? capitalize(clean) : 'Poste non renseigné';
}
function shortName(collaborator?: HrCollaborator) { return collaborator ? `${collaborator.firstName}`.trim() || collaborator.lastName : 'RH'; }
function ruleStatusLabel(value?: unknown) { return value === 'active' ? 'Actif' : value === 'partial' ? 'Partiel' : value === 'to_configure' ? 'À configurer' : value === 'future' ? 'Futur' : 'Préparé'; }
function impactLabel(value?: unknown) { return value === 'blocking' ? 'Bloquant' : value === 'warning' ? 'Avertissement' : 'Info'; }
function setupStatusLabel(value: PlanningSetupStatus) { return value === 'done' ? 'Terminé' : value === 'partial' ? 'Partiel' : 'À faire'; }
function loadPlanningDashboardConfig(): PlanningDashboardConfig {
  try {
    const stored = localStorage.getItem(PLANNING_DASHBOARD_CONFIG_KEY);
    if (!stored) return defaultPlanningDashboardConfig;
    const parsed = JSON.parse(stored) as Partial<PlanningDashboardConfig> & { planningMode?: PlanningBlockMode };
    const storedMode = parsed.planningBlockMode ?? parsed.planningMode;
    return {
      pinnedBlockIds: Array.isArray(parsed.pinnedBlockIds) ? parsed.pinnedBlockIds.filter((item): item is PlanningDashboardBlockKey => item in defaultPlanningDashboardConfig.blocks) : defaultPlanningDashboardConfig.pinnedBlockIds,
      planningBlockMode: storedMode === 'week' || storedMode === 'month' ? storedMode : 'day',
      planningBlockSize: parsed.planningBlockSize === 'small' || parsed.planningBlockSize === 'large' ? parsed.planningBlockSize : 'medium',
      blocks: { ...defaultPlanningDashboardConfig.blocks, ...(parsed.blocks ?? {}) },
    };
  } catch {
    return defaultPlanningDashboardConfig;
  }
}
function requirementSummary(need: PlanningRequirement, departments: HrDepartment[]) {
  const department = need.department?.name ?? departments.find((item) => item.id === need.departmentId)?.name ?? 'Service';
  const metadata = need.metadata ?? {};
  const days = Array.isArray(metadata.daysOfWeek) ? metadata.daysOfWeek.map(Number).filter((day) => day >= 1 && day <= 7) : [];
  const recurrence = metadata.recurrence === 'second-sunday' ? 'chaque deuxième dimanche du mois' : days.length ? days.map(dayNameShort).join(' et ') : 'tous les jours';
  return `${department} : ${need.requiredCount ?? 1} personne(s) ${recurrence} ${need.timeSlotLabel ?? need.label ?? 'créneau'}`;
}
function requirementSummaryFromForm(form: RequirementFormState, departments: HrDepartment[]) {
  const department = departments.find((item) => item.id === form.departmentId)?.name ?? 'Service';
  const recurrence = form.recurrence === 'second-sunday' ? 'chaque deuxième dimanche du mois' : form.daysOfWeek.length ? form.daysOfWeek.map(dayNameShort).join(' et ') : 'tous les jours';
  const slot = requirementSlots.find((item) => item.value === form.timeSlot)?.label.toLowerCase() ?? form.timeSlot;
  return `${department} : ${form.requiredCount || 1} personne(s) ${recurrence} ${slot}`;
}
function dayNameShort(day: number) { return ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][Math.max(0, Math.min(6, day - 1))] ?? 'jour'; }
function toggleNumber(values: number[], value: number) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort((a, b) => a - b); }
function isoDayOfWeek(value: string) { const day = new Date(`${value.slice(0, 10)}T12:00:00`).getDay(); return day === 0 ? 7 : day; }
function isSecondSunday(value: string) { const date = new Date(`${value.slice(0, 10)}T12:00:00`); return date.getDay() === 0 && date.getDate() >= 8 && date.getDate() <= 14; }
function formatPeriod(start?: string | null, end?: string | null) { return end && normalizePlanningDate(end) !== normalizePlanningDate(start) ? `${formatShort(start)} - ${formatShort(end)}` : formatShort(start); }
function todayIso() { return localDateIso(new Date()); }
function sameDay(a?: string | null, b?: string | null) { const dayA = normalizePlanningDate(a); const dayB = normalizePlanningDate(b); return Boolean(dayA && dayB && dayA === dayB); }
function formatShort(value?: string | null) { if (!value) return '--'; return parseLocalDate(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }
function formatAttendanceDate(value?: string | null) { if (!value) return '--'; return parseLocalDate(value).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }); }
function monthLabel(value: string) { return parseLocalDate(value).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); }
function addDays(value: string, days: number) { const date = parseLocalDate(value); date.setDate(date.getDate() + days); return localDateIso(date); }
function weekStart(value: string) { const date = parseLocalDate(value); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return localDateIso(date); }
function weekEnd(value: string) { return addDays(weekStart(value), 6); }
function weekDates(value: string) { const start = weekStart(value); return Array.from({ length: 7 }, (_, index) => addDays(start, index)); }
function monthGrid(value: string) { const date = parseLocalDate(value); const start = new Date(date.getFullYear(), date.getMonth(), 1); const firstDay = start.getDay() || 7; start.setDate(start.getDate() - firstDay + 1); return Array.from({ length: 42 }, (_, index) => { const item = new Date(start); item.setDate(start.getDate() + index); return localDateIso(item); }); }
function chunkDaysByWeek(days: string[]) { return Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => days.slice(index * 7, index * 7 + 7)).filter((week) => week.length); }
function normalizeMonthDays(selectedDate: string, monthDays?: Array<Record<string, any>>) {
  const base = monthGrid(selectedDate);
  const incoming = (monthDays ?? []).map((day) => normalizePlanningDate(String(day.date ?? ''))).filter(Boolean);
  if (!incoming.length) return base;
  const merged = new Set([...base, ...incoming]);
  return Array.from(merged).sort().filter((day) => day >= base[0] && day <= base[base.length - 1]);
}
function addMonths(value: string, months: number) { const date = parseLocalDate(value); date.setMonth(date.getMonth() + months); return localDateIso(date); }
function setYear(value: string, year: number) { const date = parseLocalDate(value); date.setFullYear(year); return localDateIso(date); }
function dayNumber(value: string) { return parseLocalDate(value).getDate(); }
function normalizePlanningDate(value?: string | null) {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw.slice(0, 10) : localDateIso(date);
}
function parseLocalDate(value: string) { const iso = normalizePlanningDate(value); const [year, month, day] = iso.split('-').map(Number); return new Date(year || 1970, (month || 1) - 1, day || 1, 12, 0, 0); }
function localDateIso(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`; }
function timeToMinutes(value?: string | null) { const time = timeLabel(value); const [hours, minutes] = time.split(':').map(Number); return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null; }
function rangesOverlap(startA?: string | null, endA?: string | null, startB?: string | null, endB?: string | null) {
  const aStart = timeToMinutes(startA), aEnd = timeToMinutes(endA), bStart = timeToMinutes(startB), bEnd = timeToMinutes(endB);
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return aStart < bEnd && aEnd > bStart;
}
function assignmentHours(assignment: PlanningAssignment) {
  if (!businessStatusCountsHours(assignmentBusinessStatus(assignment))) return 0;
  const start = timeToMinutes(assignment.startTime);
  const end = timeToMinutes(assignment.endTime);
  if (start == null || end == null) return 0;
  const adjustedEnd = end <= start ? end + 24 * 60 : end;
  return Math.max(0, (adjustedEnd - start - Number(assignment.breakMinutes ?? 0)) / 60);
}
function timeRange(assignment: PlanningAssignment) { return `${timeLabel(assignment.startTime)} - ${timeLabel(assignment.endTime)}`; }
function timeLabel(value?: string | null) {
  if (!value) return '--:--';
  const raw = String(value);
  if (/^\d{2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return raw.slice(0, 5);
}
function groupAssignmentsForDay(assignments: PlanningAssignment[]) {
  const groups = new Map<string, { department: string; range: string; assignments: PlanningAssignment[] }>();
  assignments.forEach((assignment) => {
    const department = assignment.department?.name ?? assignment.service?.name ?? 'Sans service';
    const range = assignmentDisplayRange(assignment);
    const key = `${department}:${range}`;
    const group = groups.get(key) ?? { department, range, assignments: [] };
    group.assignments.push(assignment);
    groups.set(key, group);
  });
  return [...groups.values()].map((group) => ({
    ...group,
    assignments: group.assignments.sort((a, b) => collaboratorName(a.collaborator ?? a.employee).localeCompare(collaboratorName(b.collaborator ?? b.employee))),
  })).sort((a, b) => a.department.localeCompare(b.department) || a.range.localeCompare(b.range));
}
function buildMonthScheduleRows(assignments: PlanningAssignment[]) {
  const rows = new Map<string, PlanningAssignment[]>();
  assignments.forEach((assignment) => {
    const date = normalizePlanningDate(assignment.date);
    rows.set(date, [...(rows.get(date) ?? []), assignment]);
  });
  return [...rows.entries()].map(([date, dayAssignments]) => ({
    date,
    assignments: dayAssignments.sort((a, b) => assignmentDisplayRange(a).localeCompare(assignmentDisplayRange(b)) || collaboratorName(a.collaborator ?? a.employee).localeCompare(collaboratorName(b.collaborator ?? b.employee))),
  })).sort((a, b) => a.date.localeCompare(b.date));
}
function getDashboardPeriodRange(mode: DashboardPeriod, selectedDate: string): DashboardPeriodRange {
  if (mode === 'week') {
    const startDate = weekStart(selectedDate);
    const endDate = addDays(startDate, 6);
    return { mode, startDate, endDate, label: 'Semaine sélectionnée' };
  }
  if (mode === 'year') {
    const date = parseLocalDate(selectedDate);
    return { mode, startDate: `${date.getFullYear()}-01-01`, endDate: `${date.getFullYear()}-12-31`, label: 'Année sélectionnée' };
  }
  const date = parseLocalDate(selectedDate);
  const startDate = localDateIso(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  const endDate = localDateIso(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
  return { mode, startDate, endDate, label: 'Mois sélectionné' };
}
function getPlanningScheduleRange(mode: PlanningBlockMode, selectedDate: string): DashboardPeriodRange {
  if (mode === 'day') return { mode, startDate: selectedDate, endDate: selectedDate, label: 'Jour sélectionné' };
  if (mode === 'week') {
    const startDate = weekStart(selectedDate);
    return { mode, startDate, endDate: addDays(startDate, 6), label: 'Semaine affichée' };
  }
  const date = parseLocalDate(selectedDate);
  const startDate = localDateIso(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  const endDate = localDateIso(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
  return { mode, startDate, endDate, label: 'Mois affiché' };
}
function assignmentInRange(assignment: PlanningAssignment, period: DashboardPeriodRange) {
  const date = normalizePlanningDate(assignment.date);
  return Boolean(date && date >= period.startDate && date <= period.endDate && assignment.status !== 'CANCELLED');
}
function alertsForPeriod(alerts: PlanningAlert[], assignments: PlanningAssignment[], period: DashboardPeriodRange) {
  const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const conflictAlerts = assignments.flatMap((assignment) => assignment.conflicts ?? []);
  const explicitAlerts = alerts.filter((alert) => {
    if (alert.entityId && assignmentIds.has(alert.entityId)) return true;
    const date = normalizePlanningDate(alert.createdAt);
    return Boolean(date && date >= period.startDate && date <= period.endDate);
  });
  const seen = new Set<string>();
  return [...explicitAlerts, ...conflictAlerts].filter((alert) => {
    const key = alert.id ?? `${alert.level}:${alert.title ?? alert.label ?? alert.code}:${alert.message ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function departmentHoursFromAssignments(assignments: PlanningAssignment[]) {
  const rows = new Map<string, { departmentId: string; departmentName: string; plannedMinutes: number; plannedHours: number }>();
  assignments.forEach((assignment) => {
    const departmentId = assignment.departmentId ?? assignment.department?.id ?? assignment.serviceId ?? assignment.service?.id ?? 'none';
    const departmentName = assignment.department?.name ?? assignment.service?.name ?? 'Sans service';
    const current = rows.get(departmentId) ?? { departmentId, departmentName, plannedMinutes: 0, plannedHours: 0 };
    current.plannedMinutes += Math.round(assignmentHours(assignment) * 60);
    current.plannedHours = Math.round((current.plannedMinutes / 60) * 10) / 10;
    rows.set(departmentId, current);
  });
  return [...rows.values()].sort((a, b) => b.plannedMinutes - a.plannedMinutes);
}
function summarizeShiftSlots(assignments: PlanningAssignment[]) {
  const slots = new Map<string, number>();
  assignments.forEach((assignment) => {
    const key = assignmentDisplayRange(assignment);
    slots.set(key, (slots.get(key) ?? 0) + 1);
  });
  return [...slots.entries()].map(([range, count]) => ({ range, count })).sort((a, b) => a.range.localeCompare(b.range));
}
function uniqueEmployeeCount(assignments: PlanningAssignment[]) { return new Set(assignments.map((assignment) => assignment.employeeId ?? assignment.collaboratorId).filter(Boolean)).size; }
function collaboratorsFromAssignments(assignments: PlanningAssignment[]) {
  const rows = new Map<string, HrCollaborator>();
  assignments.forEach((assignment) => {
    const employee = assignment.collaborator ?? assignment.employee;
    const employeeId = assignment.employeeId ?? assignment.collaboratorId ?? employee?.id;
    if (employee && employeeId) rows.set(employeeId, employee);
  });
  return [...rows.values()];
}
function daysBetween(startDate: string, endDate: string) {
  const start = parseLocalDate(startDate).getTime();
  const end = parseLocalDate(endDate).getTime();
  return Math.max(0, Math.round((end - start) / 86400000));
}
function employeeHourlyRate(collaborator?: HrCollaborator | null) { return Number(collaborator?.currentCompensation?.hourlyRate ?? collaborator?.hourlyRate ?? 0) || 0; }
function sizeLabel(size: PlanningBlockSize) { return size === 'small' ? 'Petit' : size === 'large' ? 'Grand' : 'Moyen'; }
function attendancePlannedLabel(row: Record<string, any>) { return row.plannedStartTime && row.plannedEndTime ? `${timeLabel(row.plannedStartTime)} - ${timeLabel(row.plannedEndTime)}` : 'Repos'; }
function normalizeAttendanceStatus(status?: string | null) {
  if (status === 'VALIDATED' || status === 'VALIDE') return 'VALIDATED';
  if (status === 'SUBMITTED' || status === 'SIGNED' || status === 'A_VALIDER' || status === 'SIGNE') return 'TO_VALIDATE';
  if (status === 'REJECTED' || status === 'ANOMALIE') return 'REJECTED';
  return 'NOT_SIGNED';
}
function attendanceStatusLabel(status?: string | null) { return attendanceSummaryStatusLabel(normalizeAttendanceStatus(status)); }
function attendanceSummaryStatusLabel(status?: string | null) {
  const labels: Record<string, string> = { NOT_SIGNED: 'Non signé', TO_VALIDATE: 'À valider', VALIDATED: 'Validé', REJECTED: 'À reprendre' };
  return labels[String(status ?? 'NOT_SIGNED')] ?? 'Non signé';
}
function attendanceEmployeeSummaries(rows: Array<Record<string, any>>, collaborators: HrCollaborator[]) {
  const groups = new Map<string, Array<Record<string, any>>>();
  rows.forEach((row) => groups.set(String(row.employeeId), [...(groups.get(String(row.employeeId)) ?? []), row]));
  return [...groups.entries()].map(([employeeId, employeeRows]) => {
    const plannedMinutes = employeeRows.reduce((sum, row) => sum + Number(row.plannedMinutes ?? 0), 0);
    const declaredRows = employeeRows.filter((row) => row.declaredMinutes != null || normalizeAttendanceStatus(row.status) !== 'NOT_SIGNED');
    const validatedRows = employeeRows.filter((row) => normalizeAttendanceStatus(row.status) === 'VALIDATED');
    const declaredMinutes = declaredRows.length ? employeeRows.reduce((sum, row) => sum + Number(row.declaredMinutes ?? 0), 0) : null;
    const validatedMinutes = validatedRows.length ? employeeRows.reduce((sum, row) => sum + Number(row.validatedMinutes ?? 0), 0) : null;
    return {
      employeeId,
      employeeName: String(employeeRows[0]?.employeeName ?? collaboratorName(findCollaborator(collaborators, employeeId))),
      plannedMinutes,
      declaredMinutes,
      validatedMinutes,
      varianceMinutes: declaredMinutes == null ? null : declaredMinutes - plannedMinutes,
      status: validatedRows.length === employeeRows.length && employeeRows.length ? 'VALIDATED' : declaredRows.length ? 'TO_VALIDATE' : 'NOT_SIGNED',
    };
  }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}
function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function formatSignedMinutes(value: number) {
  if (!Number.isFinite(value) || value === 0) return '0h00';
  return `${value > 0 ? '+' : '-'}${formatMinutesValue(Math.abs(value))}`;
}
function cleanBusinessLabel(value?: string | null) {
  const raw = String(value ?? '').trim();
  return raw.replace(/^ODS_TEST_[^_]+_?/i, '').replace(/^ODS[_ -]?/i, '').replace(/[_]+/g, ' ').trim() || raw || 'Sans libellé';
}
function presetDefaultScope(template: PlanningTemplate, departments: HrDepartment[], positions: HrPosition[], sites: Site[]) {
  const department = departments.find((item) => item.id === template.departmentId)?.name;
  const position = positions.find((item) => item.id === template.positionId || item.id === template.lines?.[0]?.positionId)?.name;
  const site = sites.find((item) => item.id === template.siteId)?.name;
  return [department, position, site].filter(Boolean).join(' · ') || 'Sans périmètre par défaut';
}
function capitalize(value: string) { return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value; }
function formatMinutesValue(value: number) {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(Math.round(Number(value) || 0));
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${hours}h${String(minutes).padStart(2, '0')}`;
}
function formatDaysValue(value: number) {
  const amount = Math.round((Number(value) || 0) * 10) / 10;
  return `${amount} j`;
}
function formatHours(value: number) { return formatMinutesValue(Math.round((Number.isFinite(value) ? value : 0) * 60)); }
function contractWeeklyMinutes(collaborator?: HrCollaborator) { return Number(collaborator?.activeContract?.weeklyHours ?? collaborator?.contracts?.[0]?.weeklyHours ?? collaborator?.contractWeeklyMinutes ?? 0) || 0; }
function secondaryPositions(collaborator?: HrCollaborator) { return (collaborator?.secondaryPositions ?? []).map((position) => position.name).filter(Boolean); }
function plannedAssignmentMinutes(assignments: PlanningAssignment[], startDate: string, endDate: string) {
  return assignments.reduce((sum, assignment) => {
    const date = normalizePlanningDate(assignment.date);
    if (!date || date < startDate || date > endDate || assignment.status === 'CANCELLED') return sum;
    return sum + Math.round(assignmentHours(assignment) * 60);
  }, 0);
}
function businessDaysBetween(startDate: string, endDate: string) {
  let days = 0;
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    if (isoDayOfWeek(date) <= 5) days += 1;
  }
  return days;
}
function minutesToHours(minutes?: number | null) { return Math.round(Number(minutes ?? 0) / 60 * 10) / 10; }
function weeklyRotationSummary(rotation: PlanningTemplate) {
  const days = Array.isArray(rotation.days) ? rotation.days : [];
  const working = days.filter((day) => day.mode === 'WORK');
  if (!working.length) return 'Aucun jour travaillé';
  const first = working[0];
  const allSame = working.every((day) => timeLabel(day.startTime) === timeLabel(first.startTime) && timeLabel(day.endTime) === timeLabel(first.endTime));
  const dayLabel = compactDayRange(working.map((day) => day.dayOfWeek));
  return `${dayLabel} ${allSame ? `${timeLabel(first.startTime)}-${timeLabel(first.endTime)}` : 'horaires variables'}`;
}
function compactDayRange(days: number[]) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.join(',') === '1,2,3,4,5') return 'Lun-Ven';
  if (sorted.join(',') === '1,2,3,4,5,6,7') return 'Tous les jours';
  return sorted.map((day) => dayNameFromNumber(day).slice(0, 3)).join(', ');
}

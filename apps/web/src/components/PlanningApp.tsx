import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  FileSignature,
  Info,
  Layers,
  ListChecks,
  Repeat2,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { ApiError, api } from '../api/client';
import { GuidedWizard } from './ui/GuidedWizard';
import { GuidedWelcome } from './ui/GuidedWelcome';
import type {
  HrCollaborator,
  HrDepartment,
  HrPosition,
  PlanningAlert,
  PlanningAssignment,
  PlanningBootstrap,
  PlanningCrossSiteReplacement,
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

type PlanningTab = 'dashboard' | 'planning' | 'settings' | 'attendance' | 'exports';
type PlanningView = 'day' | 'week' | 'month' | 'year';
type SettingKey = 'presets' | 'availability' | 'rules' | 'costs' | 'notifications';
type InitialPlanningStep = 'welcome' | 'services' | 'presets' | 'done';
type DashboardPeriod = 'week' | 'month' | 'year';
type PlanningDashboardBlockKey = 'periodStatus' | 'planningSetup' | 'plannedHours' | 'estimatedCost' | 'activeAlerts' | 'alertsToReview' | 'planning' | 'departmentHours' | 'actions';
type PlanningBlockMode = 'day' | 'week' | 'month';
type PlanningBlockSize = 'small' | 'medium' | 'large';
type PlanningDashboardConfig = {
  blocks: Record<PlanningDashboardBlockKey, boolean>;
  pinnedBlockIds: PlanningDashboardBlockKey[];
  planningBlockMode: PlanningBlockMode;
  planningBlockSize: PlanningBlockSize;
};
type DashboardPeriodRange = { startDate: string; endDate: string; label: string; mode: DashboardPeriod | PlanningBlockMode };
type DashboardPeriodData = { range: DashboardPeriodRange; siteId: string; summary: PlanningDashboardResponse | null; assignments: PlanningAssignment[] };
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
type PendingSiteReplacementConfirmation = {
  rotation: PlanningRotationOption;
  targetDate: string;
  employeeId: string;
  siteId: string;
  replacements: PlanningCrossSiteReplacement[];
  busy?: boolean;
};
type CalendarAssignmentGroup = {
  employeeId: string;
  collaborator?: HrCollaborator;
  assignments: PlanningAssignment[];
  businessStatus: string;
  hasConflict: boolean;
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
  ['exports', 'Export'],
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
const PLANNING_INITIAL_SETUP_DISMISSED_PREFIX = 'toquehub.planning.initialSetup.dismissed';
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
  },
};
const initialPlanningSteps: InitialPlanningStep[] = ['welcome', 'services', 'presets', 'done'];
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
  const [siteReplacementConfirmation, setSiteReplacementConfirmation] = useState<PendingSiteReplacementConfirmation | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<PlanningAssignment | null>(null);
  const [selectedSetting, setSelectedSetting] = useState<SettingKey>('presets');
  const [dashboardConfig, setDashboardConfig] = useState<PlanningDashboardConfig>(() => loadPlanningDashboardConfig());
  const [dashboardSiteFilter, setDashboardSiteFilter] = useState('');
  const [dashboardPeriodData, setDashboardPeriodData] = useState<DashboardPeriodData | null>(null);
  const [showDashboardCustomizer, setShowDashboardCustomizer] = useState(false);
  const [planningSiteInitialized, setPlanningSiteInitialized] = useState(false);
  const [publishingPeriod, setPublishingPeriod] = useState(false);
  const planningSetupStorageKey = `${PLANNING_INITIAL_SETUP_PREFIX}.${session.user.organizationId ?? session.user.id}`;
  const planningSetupDismissedStorageKey = `${PLANNING_INITIAL_SETUP_DISMISSED_PREFIX}.${session.user.organizationId ?? session.user.id}`;
  const [initialSetupCompleted, setInitialSetupCompleted] = useState(() => localStorage.getItem(planningSetupStorageKey) === 'true');
  const [showInitialSetup, setShowInitialSetup] = useState(() => localStorage.getItem(planningSetupStorageKey) !== 'true' && localStorage.getItem(planningSetupDismissedStorageKey) !== 'true');
  const [initialSetupStep, setInitialSetupStep] = useState<InitialPlanningStep>('services');

  useEffect(() => {
    const completed = localStorage.getItem(planningSetupStorageKey) === 'true';
    setInitialSetupCompleted(completed);
    setShowInitialSetup(!completed && localStorage.getItem(planningSetupDismissedStorageKey) !== 'true');
  }, [planningSetupStorageKey, planningSetupDismissedStorageKey]);

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
          siteId: dashboardSiteFilter || undefined,
          departmentId: serviceFilter || undefined,
          employeeId: employeeFilter || undefined,
        };
        const summary = await api.planningDashboard(token, params);
        if (!cancelled) setDashboardPeriodData({ range, siteId: dashboardSiteFilter, summary, assignments: [] });
      } catch {
        if (!cancelled) setDashboardPeriodData({ range, siteId: dashboardSiteFilter, summary: null, assignments: [] });
      }
    }
    void loadDashboardPeriod();
    return () => { cancelled = true; };
  }, [token, dashboardPeriod, selectedDate, dashboardSiteFilter, serviceFilter, employeeFilter]);

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

  // Une liste vide est un résultat valide lorsqu'un filtre de site ne trouve personne.
  // Ne jamais la remplacer par le référentiel global : cela affichait des collaborateurs
  // d'un autre site et produisait ensuite une prévisualisation de roulement vide.
  const effectiveCollaborators = data ? data.collaborators ?? [] : collaborators;
  const effectiveDepartments = data ? data.departments ?? [] : departments;
  const effectivePositions = data ? data.positions ?? [] : positions;
  const effectiveSites = data ? data.sites ?? [] : sites;
  const primaryPlanningSiteId = session.user.primarySiteId || effectiveSites.find((site) => site.isPrimary || site.isMain)?.id || effectiveSites[0]?.id || '';
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

  useEffect(() => {
    if (planningSiteInitialized || !primaryPlanningSiteId) return;
    setSiteFilter(primaryPlanningSiteId);
    setPlanningSiteInitialized(true);
  }, [planningSiteInitialized, primaryPlanningSiteId]);

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
    templates,
    rotations: planningWeeklyRotations,
    onNavigate,
    openSetting,
  });

  function openSetting(setting: SettingKey) {
    setSelectedSetting(setting);
    onNavigate('settings');
  }

  function openInitialSetup(step: InitialPlanningStep = 'welcome') {
    localStorage.removeItem(planningSetupDismissedStorageKey);
    setInitialSetupStep(step);
    setShowInitialSetup(true);
  }

  function dismissInitialSetup() {
    localStorage.setItem(planningSetupDismissedStorageKey, 'true');
    setShowInitialSetup(false);
  }

  function completeInitialSetup() {
    localStorage.setItem(planningSetupStorageKey, 'true');
    localStorage.removeItem(planningSetupDismissedStorageKey);
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
    if (!siteFilter) {
      setError('Sélectionnez un site précis pour affecter un collaborateur. “Tous sites” sert uniquement à consulter le planning global.');
      return;
    }
    const date = dateOverride ?? selectedDate;
    const businessStatus = cleanBusinessStatus(businessStatusOverride ?? presetBusinessStatus(preset) ?? quickBusinessStatus);
    const effectiveStart = businessStatusCountsHours(businessStatus) ? startTime : (startTime || '00:00');
    const effectiveEnd = businessStatusCountsHours(businessStatus) ? endTime : (endTime || startTime || '00:00');
    const targetSiteId = preset?.siteId || siteFilter;
    const overlap = assignments.find((assignment) => {
      const employeeId = assignment.collaboratorId ?? assignment.employeeId;
      return employeeId === collaborator.id && assignment.status !== 'CANCELLED' && sameDay(assignment.date, date) && rangesOverlap(effectiveStart, effectiveEnd, assignment.startTime, assignment.endTime);
    });
    if (overlap) {
      const sameSite = !targetSiteId || !overlap.siteId || overlap.siteId === targetSiteId || overlap.site?.id === targetSiteId;
      setError(sameSite
        ? `${collaboratorName(collaborator)} a déjà une affectation qui chevauche ce créneau.`
        : `${collaboratorName(collaborator)} est déjà affecté sur ce même créneau dans un autre site.`);
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
        siteId: targetSiteId,
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
      const targetSiteId = patch.siteId ?? assignment.siteId ?? '';
      const sameSite = !targetSiteId || !overlap.siteId || overlap.siteId === targetSiteId || overlap.site?.id === targetSiteId;
      setError(sameSite ? 'Ce collaborateur a déjà un créneau qui chevauche cet horaire.' : 'Ce collaborateur est déjà affecté sur ce même créneau dans un autre site.');
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
    setError(undefined);
    setNotice(undefined);
    if (!selectedEmployee) {
      setNotice('Sélectionnez d’abord un collaborateur pour appliquer un roulement.');
      return;
    }
    if (!siteFilter) {
      setError('Sélectionnez un site précis pour appliquer un roulement. “Tous sites” est une vue de consultation.');
      return;
    }
    const targetDate = dateOverride ?? selectedDate;
    try {
      const payload = {
        employeeId: selectedEmployee.id,
        siteId: siteFilter || undefined,
        startDate: weekStart(targetDate),
        endDate: weekEnd(targetDate),
      };
      const preview = await api.previewPlanningRotation(token, rotation.id, payload);
      if (!preview.assignments?.length) {
        const reason = preview.diagnostics?.reason;
        setError(reason || "Ce roulement ne contient aucune journée de travail applicable pour ce collaborateur sur la semaine choisie. Vérifiez son statut actif, son service, son poste et les jours du roulement.");
        return;
      }
      if (preview.crossSiteReplacements?.length) {
        setSiteReplacementConfirmation({ rotation, targetDate, employeeId: selectedEmployee.id, siteId: siteFilter, replacements: preview.crossSiteReplacements });
        return;
      }
      await applyRotationConfirmed(rotation, targetDate, selectedEmployee.id, siteFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Application du roulement impossible');
    }
  }

  async function applyRotationConfirmed(rotation: PlanningRotationOption, targetDate: string, employeeId: string, targetSiteId: string) {
    const result = await api.applyPlanningRotation(token, rotation.id, {
      employeeId,
      siteId: targetSiteId || undefined,
      startDate: weekStart(targetDate),
      endDate: weekEnd(targetDate),
      replaceExisting: true,
    });
    const appliedCount = result.appliedAssignments?.length ?? 0;
    const skippedCount = result.skipped?.length ?? 0;
    await loadContext({ showLoading: false });
    if (!appliedCount) {
      setNotice(undefined);
      setError(`Aucune affectation n'a été enregistrée.${result.skipped?.[0]?.message ? ` ${result.skipped[0].message}` : ''}`);
      return;
    }
    setNotice(`${appliedCount} affectation(s) appliquée(s) sur la semaine du ${formatShort(weekStart(targetDate))}.`);
    if (skippedCount) setError(`${skippedCount} journée(s) n'ont pas pu être enregistrées. ${result.skipped?.[0]?.message ?? ''}`.trim());
  }

  async function confirmSiteReplacement() {
    if (!siteReplacementConfirmation) return;
    setSiteReplacementConfirmation({ ...siteReplacementConfirmation, busy: true });
    try {
      await applyRotationConfirmed(siteReplacementConfirmation.rotation, siteReplacementConfirmation.targetDate, siteReplacementConfirmation.employeeId, siteReplacementConfirmation.siteId);
      setSiteReplacementConfirmation(null);
    } catch (err) {
      setSiteReplacementConfirmation({ ...siteReplacementConfirmation, busy: false });
      setError(err instanceof Error ? err.message : 'Application du roulement impossible');
    }
  }

  async function publishPlanningPeriod() {
    if (!canWrite || publishingPeriod) return;
    setPublishingPeriod(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const control = await api.controlPlanningPeriod(token, periodPayload);
      if (!control.publishable) {
        await loadContext({ showLoading: false });
        const blockingAlerts = control.control?.blockingAlerts ?? 0;
        setError(
          `Publication impossible : ${blockingAlerts} alerte(s) bloquante(s) détectée(s). Corrigez-les avant de publier.`,
        );
        return;
      }
      await api.publishPlanningPeriod(token, periodPayload);
      await loadContext({ showLoading: false });
      setNotice('Planning contrôlé et publié. Les notifications salariés sont préparées pour un canal futur.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publication impossible');
    } finally {
      setPublishingPeriod(false);
    }
  }

  return (
    <div className="hr-shell planning-shell">
      <div className="hr-hero planning-hero">
        <div>
          <span className="welcome-tag">ToqueHub Planning</span>
          <h1>Planning</h1>
          <p>Organisez les équipes, répartissez les affectations et anticipez les besoins de chaque établissement depuis un calendrier partagé.</p>
        </div>
        <div className="planning-hero-actions">
          {tab === 'dashboard' ? (
            <button className="btn btn-secondary btn-outline planning-hero-guide" type="button" onClick={() => openInitialSetup('services')}>
              <Sparkles size={16} /> Guide de configuration
            </button>
          ) : null}
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
          publishing={publishingPeriod}
          onPublish={publishPlanningPeriod}
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
          assignments={assignments}
          sites={effectiveSites}
          selectedDate={selectedDate}
          dashboardSiteFilter={dashboardSiteFilter}
          setDashboardSiteFilter={setDashboardSiteFilter}
          dashboardPeriodData={dashboardPeriodData}
          onboardingCompleted={initialSetupCompleted}
          onResumeOnboarding={() => openInitialSetup('services')}
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
          canWrite={canWrite}
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

      {tab === 'exports' ? (
        <div className="card-modern settings-detail planning-export-page">
          <PlanningExportsSettings token={token} selectedDate={selectedDate} siteFilter={siteFilter} serviceFilter={serviceFilter} employeeFilter={employeeFilter} />
        </div>
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
          dayPresets={planningDayPresets}
          weeklyRotations={planningWeeklyRotations}
          canWrite={canWrite}
          onSaveDayPreset={saveDayPreset}
          onDeleteDayPreset={deleteDayPreset}
          onSaveWeeklyRotation={saveWeeklyRotation}
          onDeleteWeeklyRotation={deleteWeeklyRotation}
          onClose={dismissInitialSetup}
          onComplete={completeInitialSetup}
        />
      ) : null}
      {siteReplacementConfirmation ? (
        <PlanningSiteReplacementModal
          confirmation={siteReplacementConfirmation}
          sites={effectiveSites}
          onCancel={() => setSiteReplacementConfirmation(null)}
          onConfirm={confirmSiteReplacement}
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

function PlanningIllustration() {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
      <div
        className="card-modern"
        style={{
          background: '#0f172a',
          color: 'white',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 30px 60px rgba(9, 13, 22, 0.3)',
          padding: '1.5rem',
          borderRadius: '22px',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#ffffff' }}>Structure du Planning</span>
            <span
              className="badge badge-reception"
              style={{
                fontSize: '0.72rem',
                textTransform: 'none',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#6ee7b7',
                border: '1px solid rgba(110, 231, 183, 0.25)',
              }}
            >
              Prêt
            </span>
          </div>

          {[
            { label: 'Socle RH & Collaborateurs', val: 100, color: '#10b981' },
            { label: 'Presets & Horaires types', val: 85, color: '#34d399' },
            { label: 'Génération & Contrôle', val: 65, color: '#38bdf8' },
          ].map((bar) => (
            <div key={bar.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', marginBottom: '.35rem', color: '#94a3b8' }}>
                <span>{bar.label}</span>
                <span style={{ fontWeight: 700, color: bar.color }}>{bar.val}%</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${bar.val}%`, height: '100%', background: bar.color, borderRadius: '999px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanningOnboardingAside({ step }: { step: InitialPlanningStep }) {
  const steps: Array<{ key: InitialPlanningStep; label: string; icon: any }> = [
    { key: 'services', label: '1. Services & Collaborateurs', icon: Building2 },
    { key: 'presets', label: '2. Presets & Roulements', icon: Clock },
    { key: 'done', label: '3. Validation', icon: CheckCircle2 },
  ];
  return (
    <div className="operational-task-wizard-sidebar">
      <div>
        <span className="operational-task-wizard-kicker">MODULE PLANNING</span>
        <h2>Préparer le planning</h2>
        <p>Un parcours guidé simple pour calibrer vos équipes et vos roulements d’horaires types.</p>
      </div>
      <div className="operational-task-wizard-steps">
        {steps.map((item) => {
          const Icon = item.icon;
          const isCurrent = step === item.key;
          const isDone = (step === 'presets' && item.key === 'services') || (step === 'done' && item.key !== 'done');
          return (
            <div
              key={item.key}
              className={`operational-task-wizard-step${isCurrent ? ' active' : ''}${isDone ? ' complete' : ''}`}
            >
              <span className="operational-task-wizard-step-icon">
                {isDone ? <Check size={18} /> : <Icon size={18} />}
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{isDone ? 'Validé' : isCurrent ? 'En cours' : 'À venir'}</small>
              </span>
            </div>
          );
        })}
      </div>
      <div className="operational-task-wizard-note">
        <Users size={18} />
        <span>Les collaborateurs et services proviennent automatiquement du module RH.</span>
      </div>
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
  dayPresets,
  weeklyRotations,
  canWrite,
  onSaveDayPreset,
  onDeleteDayPreset,
  onSaveWeeklyRotation,
  onDeleteWeeklyRotation,
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
  dayPresets: PlanningTemplate[];
  weeklyRotations: PlanningTemplate[];
  canWrite: boolean;
  onSaveDayPreset: (payload: PlanningDayPresetPayload, id?: string) => Promise<void>;
  onDeleteDayPreset: (id: string) => Promise<void>;
  onSaveWeeklyRotation: (payload: PlanningWeeklyRotationPayload, id?: string) => Promise<void>;
  onDeleteWeeklyRotation: (id: string) => Promise<void>;
  onClose: () => void;
  onComplete: () => void;
}) {
  const stepOrder: InitialPlanningStep[] = ['welcome', 'services', 'presets', 'done'];
  const realStepIndex = step === 'welcome' ? 1 : step === 'services' ? 1 : step === 'presets' ? 2 : 3;

  function goNext() {
    const idx = stepOrder.indexOf(step);
    if (idx < stepOrder.length - 1) setStep(stepOrder[idx + 1]);
  }

  function goBack() {
    const idx = stepOrder.indexOf(step);
    if (idx > 1) setStep(stepOrder[idx - 1]);
    else if (idx === 1) setStep('welcome');
  }

  return (
    <GuidedWizard
      welcome={
        step === 'welcome' ? (
          <GuidedWelcome
            title={
              <>
                Bienvenue sur le module <span>Planning & Roulements</span>
              </>
            }
            description="Le socle RH (services, postes, collaborateurs) est synchronisé automatiquement. Calibrez vos créneaux d'horaires types et roulements hebdomadaires pour une gestion de planning sans effort."
            benefits={[
              {
                icon: <Building2 size={16} />,
                text: 'Organigramme RH connecté automatiquement (services, postes, collaborateurs)',
              },
              {
                icon: <Clock size={16} />,
                text: "Presets d'horaires types & roulements hebdomadaires réutilisables",
              },
              {
                icon: <CalendarDays size={16} />,
                text: 'Détection dynamique des conflits et gestion des disponibilités',
                tone: 'warning',
              },
            ]}
            illustration={<PlanningIllustration />}
            onNext={() => setStep('services')}
            onClose={onClose}
          />
        ) : undefined
      }
      sidebar={<PlanningOnboardingAside step={step} />}
      step={realStepIndex}
      totalSteps={3}
      onClose={onClose}
    >
      {step === 'services' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', minHeight: '100%' }}>
          <InitialServicesStep departments={departments} collaborators={collaborators} />
          <div style={{ marginTop: 'auto', paddingTop: '1.2rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '.65rem' }}>
            <button className="production-btn-primary" type="button" onClick={goNext}>
              Continuer <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}

      {step === 'presets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <InitialPresetsStep
            dayPresets={dayPresets}
            weeklyRotations={weeklyRotations}
            departments={departments}
            positions={positions}
            sites={sites}
            canWrite={canWrite}
            onSaveDayPreset={onSaveDayPreset}
            onDeleteDayPreset={onDeleteDayPreset}
            onSaveWeeklyRotation={onSaveWeeklyRotation}
            onDeleteWeeklyRotation={onDeleteWeeklyRotation}
          />
          <div style={{ marginTop: 'auto', paddingTop: '1.2rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '.65rem' }}>
            <button className="production-btn-glass" style={{ color: '#475569', borderColor: '#cbd5e1', background: 'white' }} type="button" onClick={goBack}>
              <ChevronLeft size={17} /> Retour
            </button>
            <button className="production-btn-primary" type="button" onClick={goNext}>
              Continuer <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', minHeight: '100%' }}>
          <InitialDoneStep setup={setup} />
          <div style={{ marginTop: 'auto', paddingTop: '1.2rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '.65rem' }}>
            <button className="production-btn-glass" style={{ color: '#475569', borderColor: '#cbd5e1', background: 'white' }} type="button" onClick={goBack}>
              <ChevronLeft size={17} /> Retour
            </button>
            <div style={{ display: 'flex', gap: '.65rem' }}>
              <button className="production-btn-glass" style={{ color: '#475569', borderColor: '#cbd5e1', background: 'white' }} type="button" onClick={onClose}>
                Fermer
              </button>
              <button className="production-btn-primary" type="button" onClick={onComplete}>
                Ouvrir le Planning <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </div>
      )}
    </GuidedWizard>
  );
}

function InitialServicesStep({ departments, collaborators }: { departments: HrDepartment[]; collaborators: HrCollaborator[] }) {
  const activeCollaborators = collaborators.filter((item) => item.status === 'ACTIVE' && !item.isArchived && !item.archivedAt);
  const ready = departments.length > 0 && activeCollaborators.length > 0;
  return (
    <div className="planning-initial-step">
      <div className="production-metric-card" style={{ padding: '1.2rem 1.4rem', borderRadius: '20px', background: 'white', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', placeItems: 'center', width: '48px', height: '48px', borderRadius: '14px', background: '#ecfdf5', color: '#10b981', flexShrink: 0 }}>
          <UserRound size={26} />
        </div>
        <div>
          <h3 style={{ margin: '0 0 .25rem', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>Services & Collaborateurs RH</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '.88rem', lineHeight: 1.5 }}>
            Le Planning est directement alimenté par l’organigramme et les collaborateurs configurés dans le module RH. Aucune double saisie requise.
          </p>
        </div>
      </div>
      <div className="planning-service-summary">
        <div className="planning-choice-card">
          <strong style={{ fontSize: '1.4rem', color: '#10b981' }}>{departments.length}</strong>
          <span>Services RH détectés</span>
        </div>
        <div className="planning-choice-card">
          <strong style={{ fontSize: '1.4rem', color: '#2563eb' }}>{activeCollaborators.length}</strong>
          <span>Collaborateurs actifs</span>
        </div>
        <div className={ready ? 'ready' : 'missing'}>
          <strong style={{ fontSize: '1.1rem' }}>{ready ? '✓ Socle RH opérationnel' : '⚠ Action requise'}</strong>
          <span>{ready ? 'Votre structure RH est prête pour générer vos plannings.' : 'Ajoutez au moins un service et un collaborateur actif dans le module RH.'}</span>
        </div>
      </div>
    </div>
  );
}

function InitialPresetsStep(props: { dayPresets: PlanningTemplate[]; weeklyRotations: PlanningTemplate[]; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; canWrite: boolean; onSaveDayPreset: (payload: PlanningDayPresetPayload, id?: string) => Promise<void>; onDeleteDayPreset: (id: string) => Promise<void>; onSaveWeeklyRotation: (payload: PlanningWeeklyRotationPayload, id?: string) => Promise<void>; onDeleteWeeklyRotation: (id: string) => Promise<void> }) {
  const [preference, setPreference] = useState<'preset' | 'rotation' | null>(null);
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<PlanningDayPresetPayload>(() => defaultDayPresetForm(props.departments[0]?.id));
  const [editingRotationId, setEditingRotationId] = useState<string>();
  const [rotationForm, setRotationForm] = useState<PlanningWeeklyRotationPayload>(() => defaultWeeklyRotationForm(props.departments[0]?.id));
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

  async function submitRotation(event: FormEvent) {
    event.preventDefault();
    await props.onSaveWeeklyRotation({ ...rotationForm, departmentId: rotationForm.departmentId || undefined, siteId: rotationForm.siteId || undefined, days: rotationForm.days ?? defaultWeekDays() }, editingRotationId);
    setEditingRotationId(undefined);
    setRotationForm(defaultWeeklyRotationForm(props.departments[0]?.id));
  }

  function editRotation(rotation: PlanningTemplate) {
    setEditingRotationId(rotation.id);
    setRotationForm({ name: rotation.name, description: rotation.description ?? '', departmentId: rotation.departmentId ?? undefined, siteId: rotation.siteId ?? undefined, days: rotation.days?.length ? rotation.days : defaultWeekDays() });
  }

  function updateRotationDay(dayOfWeek: number, patch: Partial<PlanningTemplateDay>) {
    setRotationForm((current) => {
      const days = Array.isArray(current.days) ? current.days : defaultWeekDays();
      return { ...current, days: days.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day) };
    });
  }

  return (
    <div className="planning-initial-step">
      <div className="production-metric-card" style={{ padding: '1.1rem 1.3rem', borderRadius: '20px', background: 'white', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', placeItems: 'center', width: '44px', height: '44px', borderRadius: '13px', background: '#dbeafe', color: '#1d4ed8', flexShrink: 0 }}>
          <Clock size={24} />
        </div>
        <div>
          <h3 style={{ margin: '0 0 .2rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Presets & Roulements horaires</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '.86rem', lineHeight: 1.45 }}>
            Définissez des créneaux types pour accélérer la planification hebdo.
          </p>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#64748b', marginBottom: '.55rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Comment préférez-vous commencer ?</div>
        <div className="planning-choice-grid">
          <button type="button" className={`planning-choice-card${preference === 'preset' ? ' selected' : ''}`} onClick={() => setPreference('preset')}>
            <Clock size={22} color="#2563eb" />
            <strong>Presets journaliers</strong>
            <span>Idéal si vous utilisez plusieurs horaires dans une même journée : ouverture, midi, fermeture ou repos.</span>
          </button>
          <button type="button" className={`planning-choice-card${preference === 'rotation' ? ' selected' : ''}`} onClick={() => setPreference('rotation')}>
            <Repeat2 size={22} color="#10b981" />
            <strong>Roulements hebdomadaires</strong>
            <span>Idéal si les horaires d'une équipe changent peu et se répètent d'une semaine à l'autre.</span>
          </button>
        </div>
        <p className="muted" style={{ margin: '.65rem 0 0' }}>Ce choix organise seulement cette configuration guidée. Presets et roulements resteront tous les deux accessibles dans Paramétrage.</p>
      </div>

      {preference === 'preset' ? <>
      <div>
        <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#64748b', marginBottom: '.4rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Raccourcis d’horaires types</div>
        <div className="planning-preset-quick-grid">
          {quickPresets.map((preset) => (
            <button key={preset.name} type="button" className="planning-preset-card" onClick={() => setForm((current) => ({ ...current, ...preset }))}>
              <strong>{preset.name}</strong>
              <span style={{ fontWeight: 700, color: preset.businessStatus === 'rest' ? '#b45309' : '#047857' }}>
                {preset.businessStatus === 'rest' ? 'Journée de Repos' : `${preset.startTime} – ${preset.endTime}`}
              </span>
            </button>
          ))}
        </div>
      </div>

      <form className="planning-initial-form" onSubmit={(event) => void submit(event)}>
        <strong style={{ fontSize: '1.02rem', color: '#0f172a' }}>Créer / Modifier un créneau type</strong>
        <div className="planning-form-row">
          <label className="planning-field">Nom<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required style={{ borderRadius: '11px' }} /></label>
          <label className="planning-field">Début<input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} required style={{ borderRadius: '11px' }} /></label>
          <label className="planning-field">Fin<input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} required style={{ borderRadius: '11px' }} /></label>
        </div>
        <div className="planning-form-row">
          <label className="planning-field">Statut<select value={form.businessStatus ?? 'work'} onChange={(event) => setForm((current) => ({ ...current, businessStatus: event.target.value }))} style={{ borderRadius: '11px' }}>{planningBusinessStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          <label className="planning-field">Service<select value={form.departmentId ?? ''} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value || undefined, positionId: '' }))} style={{ borderRadius: '11px' }}><option value="">Libre</option>{props.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label className="planning-field">Pause (min)<input type="number" min="0" max="720" value={form.breakMinutes ?? 30} onChange={(event) => setForm((current) => ({ ...current, breakMinutes: Number(event.target.value) }))} style={{ borderRadius: '11px' }} /></label>
        </div>
        <div style={{ display: 'flex', gap: '.65rem', justifyContent: 'flex-end', marginTop: '.3rem' }}>
          <button className="production-btn-primary" style={{ minHeight: '38px', borderRadius: '11px', fontSize: '.84rem' }} type="submit" disabled={!props.canWrite}>
            {editingId ? 'Enregistrer les modifications' : 'Ajouter ce créneau'}
          </button>
          {editingId ? <button className="production-btn-glass" style={{ color: '#475569', borderColor: '#cbd5e1', background: 'white', minHeight: '38px', borderRadius: '11px' }} type="button" onClick={() => { setEditingId(undefined); setForm(defaultDayPresetForm(props.departments[0]?.id)); }}>Annuler</button> : null}
        </div>
      </form>

      <PresetRuleList presets={props.dayPresets} onEdit={editPreset} onDelete={props.onDeleteDayPreset} canWrite={props.canWrite} />
      </> : null}

      {preference === 'rotation' ? <>
      <form className="planning-initial-form" onSubmit={(event) => void submitRotation(event)}>
        <strong style={{ fontSize: '1.02rem', color: '#0f172a' }}>Roulements hebdomadaires</strong>
        <div className="planning-form-row">
          <label className="planning-field">Nom<input value={rotationForm.name} onChange={(event) => setRotationForm((current) => ({ ...current, name: event.target.value }))} required style={{ borderRadius: '11px' }} /></label>
          <label className="planning-field">Service<select value={rotationForm.departmentId ?? ''} onChange={(event) => setRotationForm((current) => ({ ...current, departmentId: event.target.value || undefined }))} style={{ borderRadius: '11px' }}><option value="">Tous</option>{props.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label className="planning-field">Site<select value={rotationForm.siteId ?? ''} onChange={(event) => setRotationForm((current) => ({ ...current, siteId: event.target.value || undefined }))} style={{ borderRadius: '11px' }}><option value="">Tous</option>{props.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        </div>
        <div className="planning-week-editor" style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '.75rem', background: '#f8fafc' }}>
          {(Array.isArray(rotationForm.days) ? rotationForm.days : defaultWeekDays()).map((day) => (
            <div key={day.dayOfWeek} className="planning-week-row" style={{ display: 'grid', gridTemplateColumns: '80px repeat(4, minmax(0, 1fr))', gap: '.5rem', alignItems: 'center', marginBottom: '.4rem' }}>
              <strong style={{ fontSize: '.85rem' }}>{dayNameFromNumber(day.dayOfWeek)}</strong>
              <label><select value={day.mode} onChange={(event) => updateRotationDay(day.dayOfWeek, { mode: event.target.value })} style={{ width: '100%', padding: '.35rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}><option value="WORK">Travail</option><option value="REST">Repos</option><option value="LEAVE">Congé</option><option value="CLOSED">Fermé</option></select></label>
              <label><input type="time" value={day.startTime ?? ''} disabled={day.mode !== 'WORK'} onChange={(event) => updateRotationDay(day.dayOfWeek, { startTime: event.target.value })} style={{ width: '100%', padding: '.35rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} /></label>
              <label><input type="time" value={day.endTime ?? ''} disabled={day.mode !== 'WORK'} onChange={(event) => updateRotationDay(day.dayOfWeek, { endTime: event.target.value })} style={{ width: '100%', padding: '.35rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} /></label>
              <label><input type="number" min="0" max="720" value={day.breakMinutes ?? 0} disabled={day.mode !== 'WORK'} onChange={(event) => updateRotationDay(day.dayOfWeek, { breakMinutes: Number(event.target.value) })} style={{ width: '100%', padding: '.35rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} /></label>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '.65rem', justifyContent: 'flex-end', marginTop: '.3rem' }}>
          <button className="production-btn-primary" style={{ minHeight: '38px', borderRadius: '11px', fontSize: '.84rem' }} type="submit" disabled={!props.canWrite}>
            {editingRotationId ? 'Enregistrer le roulement' : 'Ajouter ce roulement'}
          </button>
          {editingRotationId ? <button className="production-btn-glass" style={{ color: '#475569', borderColor: '#cbd5e1', background: 'white', minHeight: '38px', borderRadius: '11px' }} type="button" onClick={() => { setEditingRotationId(undefined); setRotationForm(defaultWeeklyRotationForm(props.departments[0]?.id)); }}>Annuler</button> : null}
        </div>
      </form>
      <RotationRuleList rotations={props.weeklyRotations} onEdit={editRotation} onDelete={props.onDeleteWeeklyRotation} canWrite={props.canWrite} />
      </> : null}
    </div>
  );
}

function InitialDoneStep({ setup }: { setup: ReturnType<typeof buildPlanningSetup> }) {
  return (
    <div className="planning-initial-step done">
      <div className="production-metric-card" style={{ padding: '1.4rem 1.6rem', borderRadius: '22px', background: 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)', border: '1px solid #a7f3d0', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.08)' }}>
        <div style={{ display: 'grid', placeItems: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#10b981', color: 'white', flexShrink: 0 }}>
          <CheckCircle2 size={30} />
        </div>
        <div>
          <h3 style={{ margin: '0 0 .25rem', fontSize: '1.35rem', fontWeight: 800, color: '#047857' }}>Le module Planning est prêt !</h3>
          <p style={{ margin: 0, color: '#334155', fontSize: '.9rem', lineHeight: 1.5 }}>
            Votre configuration initiale est terminée. Vous pouvez ouvrir le planning complet et commencer à affecter vos équipes.
          </p>
        </div>
      </div>
      <div className="planning-service-summary" style={{ marginTop: '.5rem' }}>
        {setup.steps.map((item) => (
          <div key={item.key} className={item.status === 'done' ? 'ready' : 'missing'} style={{ borderRadius: '16px', padding: '1rem' }}>
            <strong style={{ fontSize: '1.05rem' }}>{setupStatusLabel(item.status)}</strong>
            <span style={{ fontSize: '.88rem', color: '#475569' }}>{item.title}</span>
          </div>
        ))}
      </div>
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

function RotationRuleList({ rotations, onEdit, onDelete, canWrite }: { rotations: PlanningTemplate[]; onEdit?: (rotation: PlanningTemplate) => void; onDelete: (id: string) => Promise<void>; canWrite: boolean }) {
  return (
    <div className="planning-preset-list">
      {rotations.slice(0, 8).map((rotation) => <div key={rotation.id} className="planning-preset-list-card"><strong>{rotation.name}</strong><span>{weeklyRotationSummary(rotation)}</span><small>{rotation.employeeIds?.length ?? 0} personne(s) associée(s)</small><div className="setup-actions">{onEdit ? <button className="btn btn-secondary btn-compact" type="button" onClick={() => onEdit(rotation)}>Modifier</button> : null}<button className="btn btn-secondary btn-compact danger" type="button" disabled={!canWrite} onClick={() => void onDelete(rotation.id)}>Supprimer</button></div></div>)}
      {!rotations.length ? <div className="planning-empty-state"><strong>Aucun roulement encore créé</strong><span>Ajoutez un roulement semaine pour préparer les cycles réguliers.</span></div> : null}
    </div>
  );
}

function PlanningDashboard({ dashboard, alerts, setup, period, setPeriod, config, onConfigChange, hoursByDepartment, actions, assignments, sites, selectedDate, dashboardSiteFilter, setDashboardSiteFilter, dashboardPeriodData, onboardingCompleted, onResumeOnboarding, onOpenPlanning }: { dashboard: ReturnType<typeof buildDashboard>; alerts: PlanningAlert[]; setup: ReturnType<typeof buildPlanningSetup>; period: DashboardPeriod; setPeriod: (value: DashboardPeriod) => void; config: PlanningDashboardConfig; onConfigChange: (value: PlanningDashboardConfig) => void; hoursByDepartment?: Array<Record<string, any>>; actions?: Array<Record<string, any>>; assignments: PlanningAssignment[]; sites: Site[]; selectedDate: string; dashboardSiteFilter: string; setDashboardSiteFilter: (value: string) => void; dashboardPeriodData: DashboardPeriodData | null; onboardingCompleted: boolean; onResumeOnboarding: () => void; onOpenPlanning: (view: PlanningView) => void }) {
  const periodRange = getDashboardPeriodRange(period, selectedDate);
  const scheduleRange = getPlanningScheduleRange(config.planningBlockMode, selectedDate);
  const remoteMatches = dashboardPeriodData?.range.startDate === periodRange.startDate && dashboardPeriodData.range.endDate === periodRange.endDate && dashboardPeriodData.siteId === dashboardSiteFilter;
  const siteAssignments = assignments.filter((assignment) => assignmentMatchesSite(assignment, dashboardSiteFilter));
  const periodAssignments = siteAssignments.filter((assignment) => assignmentInRange(assignment, periodRange));
  const scheduleAssignments = siteAssignments.filter((assignment) => assignmentInRange(assignment, scheduleRange));
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
      {!onboardingCompleted && config.blocks.planningSetup ? <PlanningSetupCompact setup={setup} onResume={onResumeOnboarding} /> : null}
      <div className="planning-toolbar">
        <div>
          <span className="section-tagline">Période dashboard</span>
          <h2>{periodRange.label}</h2>
        </div>
        <div className="planning-dashboard-controls">
          <label className="planning-field planning-dashboard-site-field">
            Site
            <select value={dashboardSiteFilter} onChange={(event) => setDashboardSiteFilter(event.target.value)}>
              <option value="">Tous sites</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
          <div className="planning-segmented">
            {(['week', 'month', 'year'] as DashboardPeriod[]).map((value) => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{value === 'week' ? 'Semaine' : value === 'year' ? 'Année' : 'Mois'}</button>)}
          </div>
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
    { key: 'periodStatus', label: 'Statut période', zone: 'PILOTAGE', description: 'Contrôler automatiquement puis publier la période.' },
    { key: 'planningSetup', label: 'Planning à finaliser', zone: 'SETUP', description: 'Étapes utiles avant exploitation.' },
    { key: 'plannedHours', label: 'Heures planifiées', zone: 'KPI', description: 'Total prévu sur la période.' },
    { key: 'estimatedCost', label: 'Coût estimé', zone: 'KPI', description: 'Affiché seulement si les coûts sont configurés.' },
    { key: 'activeAlerts', label: 'Alertes actives', zone: 'ALERTS', description: 'Nombre de points ouverts.' },
    { key: 'alertsToReview', label: 'Alertes à vérifier', zone: 'ALERTS', description: 'Liste des points à traiter.' },
    { key: 'planning', label: 'Planning', zone: 'SCHEDULE', description: 'Vue directe jour, semaine ou mois.' },
    { key: 'departmentHours', label: 'Répartition heures par service', zone: 'ANALYSE', description: 'Lecture par service.' },
    { key: 'actions', label: 'Actions à traiter', zone: 'ACTIONS', description: 'Actions opérationnelles de période.' },
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

function PeriodWorkflowPanel({ status, canWrite, publishing, onPublish }: { status?: PlanningPeriodStatus; canWrite: boolean; publishing: boolean; onPublish: () => Promise<void> }) {
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
        <button className="btn btn-primary" type="button" disabled={!canWrite || publishing} onClick={() => void onPublish()}><Bell size={16} /> {publishing ? 'Contrôle en cours...' : 'Publier'}</button>
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

function QuickAssignmentPanel(props: { selectedDate: string; siteFilter: string; collaborators: HrCollaborator[]; selectedEmployeeId: string; setSelectedEmployeeId: (value: string) => void; selectedEmployee?: HrCollaborator; templates: PlanningTemplate[]; rotations: PlanningRotationOption[]; assignments: PlanningAssignment[]; replacements: PlanningReplacementProposal[]; onOpenSettings: () => void; customStart: string; setCustomStart: (value: string) => void; customEnd: string; setCustomEnd: (value: string) => void; quickBusinessStatus: string; setQuickBusinessStatus: (value: string) => void; saveCustomShift: () => void; createQuickAssignment: (startTime: string, endTime: string, origin?: string, templateId?: string, preset?: Partial<PlanningAssignment>, dateOverride?: string, businessStatusOverride?: string) => Promise<void>; quickAssignmentSelection: QuickAssignmentSelection | null; setQuickAssignmentSelection: (value: QuickAssignmentSelection | null) => void; setQuickPanelOpen: (value: boolean) => void; applyRotation: (rotation: PlanningRotationOption, dateOverride?: string) => Promise<void> }) {
  const presets = dayPresets(props.templates);
  const readOnlyAllSites = !props.siteFilter;
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
        <select value={props.selectedEmployeeId} disabled={readOnlyAllSites} onChange={(event) => props.setSelectedEmployeeId(event.target.value)}>
          <CollaboratorOptions collaborators={props.collaborators} placeholder="Sélectionner..." />
        </select>
      </label>

      {readOnlyAllSites ? (
        <p className="muted">Tous sites est une vue globale de consultation. Sélectionnez un site précis pour affecter un collaborateur.</p>
      ) : props.selectedEmployee ? (
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
                return <button key={preset.id} className={`planning-chip ${selected ? 'active' : ''}`} type="button" disabled={readOnlyAllSites} onClick={() => selectPreset(preset)}>{preset.label}<small>{presetRangeLabel(preset)} - {businessStatusLabel(presetBusinessStatus(preset) ?? props.quickBusinessStatus)}</small></button>;
              })}
            </div>
            {!presets.length ? <GuidedEmptyState title="Aucun preset jour" description="Créez d’abord un horaire type pour affecter rapidement vos salariés." actionLabel="Configurer les presets" onAction={props.onOpenSettings} /> : null}
          </div>
          {props.quickAssignmentSelection ? <div className="quick-selected-mode"><strong>Mode affectation actif</strong><span>{collaboratorName(props.selectedEmployee)} - {props.quickAssignmentSelection.label}</span><button className="btn btn-secondary btn-compact" type="button" onClick={() => props.setQuickAssignmentSelection(null)}>Annuler sélection</button></div> : null}
          <div className="quick-section">
            <strong>Roulements semaine</strong>
            <div className="chip-row">
              {props.rotations.slice(0, 5).map((rotation) => <button key={rotation.id} className={`planning-chip ${props.quickAssignmentSelection?.kind === 'weekly-rotation' && props.quickAssignmentSelection.rotation?.id === rotation.id ? 'active' : ''}`} type="button" disabled={readOnlyAllSites} onClick={() => selectRotation(rotation)}><Repeat2 size={13} /> {rotation.name}</button>)}
            </div>
            {props.rotations.length ? <span className="muted tiny">Roulements configurés dans Planning.</span> : <GuidedEmptyState title="Aucun roulement semaine" description="Vous pouvez planifier en manuel ou préparer les roulements dans Paramétrage." actionLabel="Voir les roulements" onAction={props.onOpenSettings} />}
          </div>
          <div className="quick-section">
            <strong>Horaire personnalisé</strong>
            <div className="planning-form-row">
              <label className="planning-field">Début<input type="time" value={props.customStart} onChange={(event) => props.setCustomStart(event.target.value)} /></label>
              <label className="planning-field">Fin<input type="time" value={props.customEnd} onChange={(event) => props.setCustomEnd(event.target.value)} /></label>
            </div>
            <button className="btn btn-secondary btn-compact" type="button" disabled={readOnlyAllSites} onClick={props.saveCustomShift}>Utiliser cet horaire</button>
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

function PlanningSiteReplacementModal({ confirmation, sites, onCancel, onConfirm }: { confirmation: PendingSiteReplacementConfirmation; sites: Site[]; onCancel: () => void; onConfirm: () => void }) {
  const targetSiteName = sites.find((site) => site.id === confirmation.siteId)?.name ?? 'le site sélectionné';
  const firstReplacement = confirmation.replacements[0];
  const existingSiteName = firstReplacement?.existingSiteName || 'un autre site';
  return (
    <div className="modal-overlay planning-edit-overlay" onClick={confirmation.busy ? undefined : onCancel}>
      <div className="card-modern planning-edit-modal planning-replace-modal" onClick={(event) => event.stopPropagation()}>
        <div className="section-header-modern">
          <div>
            <span className="card-title"><AlertTriangle size={18} /> Remplacer des horaires ?</span>
            <span className="section-tagline">Une affectation existe déjà sur un autre site pour cette semaine.</span>
          </div>
          <span className="status-pill status-other">Confirmation</span>
        </div>
        <div className="planning-replace-warning">
          <strong>L’employé est déjà attribué sur le site : {existingSiteName}.</strong>
          <span>Souhaitez-vous remplacer ces horaires par ceux sélectionnés sur {targetSiteName} ?</span>
        </div>
        <div className="planning-replace-list">
          {confirmation.replacements.map((replacement, index) => (
            <div key={replacement.assignmentId ?? `${replacement.date}-${index}`} className="planning-replace-item">
              <div>
                <strong>{formatShort(replacement.date)} · {replacement.existingSiteName ?? 'Autre site'}</strong>
                <span>{timeWindowLabel(replacement.existingStartTime, replacement.existingEndTime)} sera remplacé par {timeWindowLabel(replacement.targetStartTime, replacement.targetEndTime)}.</span>
              </div>
            </div>
          ))}
        </div>
        <div className="setup-actions planning-replace-actions">
          <button className="btn btn-secondary" type="button" disabled={confirmation.busy} onClick={onCancel}>Non, ne pas modifier</button>
          <button className="btn btn-primary" type="button" disabled={confirmation.busy} onClick={onConfirm}>{confirmation.busy ? 'Modification...' : 'Oui, modifier'}</button>
        </div>
      </div>
    </div>
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

function PlanningSettings({ selected, setSelected, templates, rotations, dayPresets, employeeTemplateAssignments, absences, departments, positions, sites, collaborators, settings, canWrite, onSaveDayPreset, onDeleteDayPreset, onSaveWeeklyRotation, onDeleteWeeklyRotation, onSaveEmployeeTemplateAssignment }: { selected: SettingKey; setSelected: (value: SettingKey) => void; templates: PlanningTemplate[]; rotations: PlanningTemplate[]; dayPresets: PlanningTemplate[]; employeeTemplateAssignments: PlanningEmployeeTemplateAssignment[]; absences: Array<Record<string, any>>; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; collaborators: HrCollaborator[]; settings?: Record<string, any>; canWrite: boolean; onSaveDayPreset: (payload: PlanningDayPresetPayload, id?: string) => Promise<void>; onDeleteDayPreset: (id: string) => Promise<void>; onSaveWeeklyRotation: (payload: PlanningWeeklyRotationPayload, id?: string) => Promise<void>; onDeleteWeeklyRotation: (id: string) => Promise<void>; onSaveEmployeeTemplateAssignment: (payload: PlanningEmployeeTemplateAssignment) => Promise<void> }) {
  const activeSetting: SettingKey = selected === 'costs' || selected === 'notifications' ? 'presets' : selected;

  useEffect(() => {
    if (selected === 'costs' || selected === 'notifications') setSelected('presets');
  }, [selected, setSelected]);

  const cards: Array<{ key: SettingKey; title: string; description: string; count: string; status: PlanningSetupStatus; Icon: typeof Repeat2 }> = [
    { key: 'presets', title: 'Presets / roulements horaires', description: 'Presets journaliers et roulements semaine propriétaires Planning.', count: `${dayPresets.length + rotations.length} élément(s)`, status: dayPresets.length && rotations.length ? 'done' : dayPresets.length || rotations.length ? 'partial' : 'todo', Icon: Repeat2 },
    { key: 'availability', title: 'Indisponibilités & absences', description: 'Absences RH en lecture seule et futures indisponibilités Planning.', count: `${absences.length} absence(s)`, status: 'partial', Icon: ShieldAlert },
    { key: 'rules', title: 'Règles planning', description: 'Couverture, repos, quota, pauses et conflits configurables.', count: 'Préparé', status: 'done', Icon: SlidersHorizontal },
  ];
  return (
    <div className="planning-settings-layout">
        <div className="planning-settings-tabs">
          {cards.map(({ key, title, count, status, Icon }) => <button key={key} className={`settings-tab ${activeSetting === key ? 'active' : ''}`} onClick={() => setSelected(key)}><Icon size={16} /><span>{title}</span><small>{count}</small><em className={`setup-status ${status}`}>{setupStatusLabel(status)}</em></button>)}
        </div>
        <div className="card-modern settings-detail">
          <SettingsDetail selected={activeSetting} templates={templates} rotations={rotations} dayPresets={dayPresets} employeeTemplateAssignments={employeeTemplateAssignments} absences={absences} departments={departments} positions={positions} sites={sites} collaborators={collaborators} settings={settings} canWrite={canWrite} onSaveDayPreset={onSaveDayPreset} onDeleteDayPreset={onDeleteDayPreset} onSaveWeeklyRotation={onSaveWeeklyRotation} onDeleteWeeklyRotation={onDeleteWeeklyRotation} onSaveEmployeeTemplateAssignment={onSaveEmployeeTemplateAssignment} />
        </div>
    </div>
  );
}

function SettingsDetail({ selected, rotations, dayPresets, employeeTemplateAssignments, absences, departments, positions, sites, collaborators, settings, canWrite, onSaveDayPreset, onDeleteDayPreset, onSaveWeeklyRotation, onDeleteWeeklyRotation, onSaveEmployeeTemplateAssignment }: { selected: SettingKey; templates: PlanningTemplate[]; rotations: PlanningTemplate[]; dayPresets: PlanningTemplate[]; employeeTemplateAssignments: PlanningEmployeeTemplateAssignment[]; absences: Array<Record<string, any>>; departments: HrDepartment[]; positions: HrPosition[]; sites: Site[]; collaborators: HrCollaborator[]; settings?: Record<string, any>; canWrite: boolean; onSaveDayPreset: (payload: PlanningDayPresetPayload, id?: string) => Promise<void>; onDeleteDayPreset: (id: string) => Promise<void>; onSaveWeeklyRotation: (payload: PlanningWeeklyRotationPayload, id?: string) => Promise<void>; onDeleteWeeklyRotation: (id: string) => Promise<void>; onSaveEmployeeTemplateAssignment: (payload: PlanningEmployeeTemplateAssignment) => Promise<void> }) {
  if (selected === 'presets') return <PresetsRotationsSettings dayPresets={dayPresets} weeklyRotations={rotations} assignments={employeeTemplateAssignments} departments={departments} positions={positions} sites={sites} collaborators={collaborators} canWrite={canWrite} onSaveDayPreset={onSaveDayPreset} onDeleteDayPreset={onDeleteDayPreset} onSaveWeeklyRotation={onSaveWeeklyRotation} onDeleteWeeklyRotation={onDeleteWeeklyRotation} onSaveEmployeeTemplateAssignment={onSaveEmployeeTemplateAssignment} />;
  if (selected === 'availability') return <><span className="card-title">Indisponibilités & absences</span><div className="settings-list">{absences.map((absence) => <div key={absence.id}><strong>{collaboratorName(findCollaborator(collaborators, absence.employeeId ?? absence.collaboratorId))}</strong><span>{absence.type ?? absence.reason ?? 'Absence'} - {formatShort(absence.startDate)} à {formatShort(absence.endDate)} - lecture seule RH</span></div>)}{!absences.length ? <p className="muted">Aucune absence RH sur la période. Les indisponibilités Planning auront leur propre stockage plus tard.</p> : null}</div></>;
  if (selected === 'rules') return <PlanningRulesSettings rules={settings?.rules as Array<Record<string, any>> | undefined} />;
  if (selected === 'costs') return <EmployerCostsSettings />;
  if (selected === 'notifications') return <PlaceholderList title="Notifications" items={['Publication Planning', 'Rappels émargement', 'Alertes manager']} />;
  return null;
}

function PlanningExportsSettings({ token, selectedDate, siteFilter, serviceFilter, employeeFilter }: { token: string; selectedDate: string; siteFilter: string; serviceFilter: string; employeeFilter: string }) {
  const [exportType, setExportType] = useState<'planning' | 'attendance' | null>(null);
  const [startDate, setStartDate] = useState(selectedDate);
  const [endDate, setEndDate] = useState(selectedDate);
  const [attendanceMonth, setAttendanceMonth] = useState(selectedDate.slice(0, 7));
  const [busy, setBusy] = useState<'planning' | 'attendance' | null>(null);
  const [message, setMessage] = useState('');
  const rangeIsValid = Boolean(startDate && endDate && endDate >= startDate);
  const rangeDayCount = rangeIsValid
    ? Math.round((parseLocalDate(endDate).getTime() - parseLocalDate(startDate).getTime()) / 86_400_000) + 1
    : 0;

  useEffect(() => {
    if (exportType === 'planning') return;
    setStartDate(selectedDate);
    setEndDate(selectedDate);
  }, [selectedDate, exportType]);

  useEffect(() => {
    if (exportType !== 'attendance') setAttendanceMonth(selectedDate.slice(0, 7));
  }, [selectedDate, exportType]);

  async function downloadPlanning() {
    setMessage('');
    if (!startDate || !endDate) {
      setMessage('Sélectionnez une date de début et une date de fin.');
      return;
    }
    if (endDate < startDate) {
      setMessage('La date de fin doit être postérieure ou égale à la date de début.');
      return;
    }
    setBusy('planning');
    try {
      await api.downloadPlanningPdf(token, {
        mode: 'custom',
        startDate,
        endDate,
        siteId: siteFilter || undefined,
        departmentId: serviceFilter || undefined,
        employeeId: employeeFilter || undefined,
      });
      setMessage(`Planning exporté sur ${rangeDayCount} jour${rangeDayCount > 1 ? 's' : ''}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de générer l'export.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadAttendance() {
    setMessage('');
    if (!/^\d{4}-\d{2}$/.test(attendanceMonth)) {
      setMessage('Sélectionnez le mois à exporter.');
      return;
    }
    const [year, month] = attendanceMonth.split('-').map(Number);
    setBusy('attendance');
    try {
      await api.downloadPlanningAttendancePdf(token, {
        month,
        year,
        siteId: siteFilter || undefined,
        departmentId: serviceFilter || undefined,
      });
      const label = parseLocalDate(`${attendanceMonth}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      setMessage(`Feuilles d’émargement générées pour ${label}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de générer les feuilles d’émargement.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="section-header-modern">
        <span className="card-title">Exports RH</span>
        <span className="section-tagline">Choisissez le document à préparer</span>
      </div>
      <div className="planning-export-launch">
        <button className={`planning-export-choice ${exportType === 'planning' ? 'active' : ''}`} type="button" onClick={() => { setExportType('planning'); setMessage(''); }}>
          <span className="planning-export-choice-icon"><CalendarDays size={20} /></span>
          <span className="planning-export-choice-copy">
            <strong>Planning des équipes</strong>
            <small>Le planning à transmettre aux collaborateurs sur une période personnalisée.</small>
          </span>
          <em>Choisir une période</em>
        </button>
        <button className={`planning-export-choice ${exportType === 'attendance' ? 'active' : ''}`} type="button" onClick={() => { setExportType('attendance'); setMessage(''); }}>
          <span className="planning-export-choice-icon"><ListChecks size={20} /></span>
          <span className="planning-export-choice-copy">
            <strong>Feuilles d’émargement</strong>
            <small>Une feuille nominative mensuelle avec les shifts, la signature et les rectifications.</small>
          </span>
          <em>Choisir un mois</em>
        </button>
      </div>
      {exportType === 'planning' ? (
        <div className="planning-export-range-panel">
          <div className="planning-export-range-header">
            <div>
              <strong>Choisir la période</strong>
              <span>Les deux dates sont incluses dans le document.</span>
            </div>
          </div>
          <div className="planning-export-range-grid">
            <label className="planning-field">Date de début<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="planning-field">Date de fin<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label>
          </div>
          <div className={`planning-export-range-summary ${rangeIsValid ? '' : 'invalid'}`}>
            <CalendarDays size={17} />
            <span>{rangeIsValid ? `${rangeDayCount} jour${rangeDayCount > 1 ? 's' : ''} sélectionné${rangeDayCount > 1 ? 's' : ''}` : 'Vérifiez les dates sélectionnées'}</span>
          </div>
          <div className="setup-actions planning-export-actions">
            <button className="btn btn-secondary" type="button" disabled={busy !== null} onClick={() => { setExportType(null); setMessage(''); }}>Annuler</button>
            <button className="btn btn-primary" type="button" disabled={busy !== null || !rangeIsValid} onClick={() => void downloadPlanning()}><FileSignature size={16} /> {busy === 'planning' ? 'Génération...' : 'Exporter le planning'}</button>
          </div>
        </div>
      ) : null}
      {exportType === 'attendance' ? (
        <div className="planning-export-range-panel planning-attendance-export-panel">
          <div className="planning-export-range-header">
            <div>
              <strong>Exporter les feuilles d’émargement</strong>
              <span>Tous les collaborateurs ayant des heures sur le mois auront leur propre feuille nominative.</span>
            </div>
          </div>
          <div className="planning-export-month-grid">
            <label className="planning-field">Mois à exporter<input type="month" value={attendanceMonth} onChange={(event) => setAttendanceMonth(event.target.value)} /></label>
            <div className="planning-attendance-export-info">
              <ListChecks size={18} />
              <span>Chaque shift comportera une zone de signature et une case de rectification à remplir en cas d’écart.</span>
            </div>
          </div>
          <div className="setup-actions planning-export-actions">
            <button className="btn btn-secondary" type="button" disabled={busy !== null} onClick={() => { setExportType(null); setMessage(''); }}>Annuler</button>
            <button className="btn btn-primary" type="button" disabled={busy !== null || !attendanceMonth} onClick={() => void downloadAttendance()}><FileSignature size={16} /> {busy === 'attendance' ? 'Génération...' : 'Exporter les feuilles'}</button>
          </div>
        </div>
      ) : null}
      {message ? <p className={message.startsWith('Planning exporté') || message.startsWith('Feuilles d’émargement générées') ? 'success' : 'alert'}>{message}</p> : null}
    </>
  );
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
      <div className="section-header-modern"><span className="card-title">Presets / roulements horaires</span><span className="section-tagline">Horaires types, cycles et affectations par défaut.</span></div>
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
          <strong>Roulements horaires</strong>
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

const fallbackPlanningRules = [
  { key: 'closing-covered', name: 'Fermeture obligatoire couverte', description: 'Alerte si un créneau de fermeture n’a aucune affectation couvrante.', status: 'active', impact: 'blocking', requiredData: ['Créneaux fermeture', 'Affectations'] },
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
      <div className="section-header-modern"><span className="card-title">Règles planning</span><span className="section-tagline">Contrôles appliqués avant la publication du planning</span></div>
      <div className="settings-list planning-rule-list">
        {rows.map((rule) => (
          <div className={`planning-rule-item rule-status-${String(rule.status ?? 'prepared')}`} key={String(rule.key ?? rule.name)}>
            <div className="planning-rule-heading">
              <span className="planning-rule-icon"><ShieldCheck size={18} /></span>
              <div className="planning-rule-copy">
                <strong>{rule.name}</strong>
                <span>{rule.description}</span>
              </div>
            </div>
            <div className="planning-rule-badges">
              <span className={`planning-rule-badge status-${String(rule.status ?? 'prepared')}`}>{ruleStatusLabel(rule.status)}</span>
              <span className={`planning-rule-badge impact-${String(rule.impact ?? 'information')}`}>{impactLabel(rule.impact)}</span>
            </div>
            <div className="planning-rule-sources">
              <small>Données vérifiées</small>
              <div>
                {(rule.requiredData ?? []).map((source: string) => <span key={source}>{source}</span>)}
              </div>
            </div>
          </div>
        ))}
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
  const [employerCoefficient, setEmployerCoefficient] = useState('1.42');

  return (
    <>
      <div className="section-header-modern"><span className="card-title">Coûts employeur</span><span className="section-tagline">Mode simple préparé</span></div>
      <div className="payroll-profile-box">
        <label className="planning-field">Coefficient employeur simple
          <input
            type="number"
            min="1"
            step="0.01"
            value={employerCoefficient}
            onChange={(event) => setEmployerCoefficient(event.target.value)}
          />
        </label>
        <p className="muted">Le dashboard utilise les salaires RH disponibles pour préparer une estimation simple du coût employeur.</p>
      </div>
    </>
  );
}

function PlanningSetupCompact({ setup, onResume }: { setup: ReturnType<typeof buildPlanningSetup>; onResume: () => void }) {
  const missing = setup.steps.filter((step) => step.status !== 'done').slice(0, 4);
  return (
    <div
      className="card-modern planning-setup-banner"
      style={{
        padding: '1.1rem 1.4rem',
        borderRadius: '22px',
        background: 'linear-gradient(135deg, #091322 0%, #0f2b26 100%)',
        color: 'white',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        boxShadow: '0 12px 30px rgba(9, 19, 34, 0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '.85rem' }}>
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#6ee7b7',
            border: '1px solid rgba(110, 231, 183, 0.25)',
          }}
        >
          <Sparkles size={20} />
        </div>
        <div>
          <span style={{ fontSize: '.72rem', fontWeight: 800, color: '#6ee7b7', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            CONFIGURATION INITIALE
          </span>
          <h4 style={{ margin: '.15rem 0 0', fontSize: '1.05rem', fontWeight: 800, color: 'white' }}>
            Planning à finaliser
          </h4>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '.82rem' }}>
            {setup.doneCount}/{setup.steps.length} étape(s) prêtes pour un planning exploitable.
          </p>
        </div>
      </div>
      <div className="planning-setup-missing" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        {missing.map((step) => (
          <button
            key={step.key}
            type="button"
            onClick={step.action}
            className="production-btn-glass"
            style={{
              padding: '.4rem .8rem',
              minHeight: '34px',
              fontSize: '.78rem',
              borderRadius: '10px',
              borderColor: step.status === 'todo' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.2)',
              color: step.status === 'todo' ? '#fde68a' : 'white',
            }}
          >
            {step.title}
          </button>
        ))}
        <button
          type="button"
          onClick={onResume}
          className="production-btn-primary"
          style={{ minHeight: '34px', padding: '.4rem .9rem', borderRadius: '10px', fontSize: '.78rem' }}
        >
          Reprendre l'onboarding <ArrowRight size={15} />
        </button>
      </div>
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
  const shown = alerts.length ? alerts : [{ id: 'ok', level: 'information', title: 'Aucune alerte prioritaire', message: 'Les alertes apparaîtront ici depuis planning_conflicts, shifts, absences RH et remplacements.' }];
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
  return <div className="card-modern planning-prerequisite"><span className="card-title"><Info size={18} /> Structure de démarrage</span><p>Complétez RH avant de planifier. Le futur onboarding guidera les presets, roulements et règles internes.</p><div className="planning-sample-row"><span>Socle RH</span><span>Presets / roulements</span><span>Règles configurables</span></div></div>;
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

function buildPlanningSetup({ collaborators, departments, templates, rotations, onNavigate, openSetting }: { collaborators: HrCollaborator[]; departments: HrDepartment[]; templates: PlanningTemplate[]; rotations: PlanningTemplate[]; onNavigate: (tab: PlanningTab) => void; openSetting: (setting: SettingKey) => void }) {
  const activeCollaborators = collaborators.filter((collaborator) => collaborator.status !== 'DEPARTED');
  const presets = dayPresets(templates);
  const presetCount = presets.length + rotations.length;
  const steps: PlanningSetupStep[] = [
    { key: 'services', title: 'Socle RH', description: `${departments.length} service(s) RH, ${activeCollaborators.length} collaborateur(s) actif(s).`, status: departments.length && activeCollaborators.length ? 'done' : departments.length || activeCollaborators.length ? 'partial' : 'todo', actionLabel: 'Voir RH', action: () => onNavigate('settings') },
    { key: 'presets', title: 'Presets / roulements horaires', description: presetCount ? `${presetCount} élément(s) disponible(s).` : 'Ajoutez les horaires types et les roulements.', status: presetCount ? 'done' : 'todo', actionLabel: 'Configurer', action: () => openSetting('presets') },
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
function dayNameShort(day: number) { return ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][Math.max(0, Math.min(6, day - 1))] ?? 'jour'; }
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
function timeWindowLabel(start?: string | null, end?: string | null) { return `${timeLabel(start)} - ${timeLabel(end)}`; }
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
function assignmentMatchesSite(assignment: PlanningAssignment, siteId: string) {
  if (!siteId) return true;
  return assignment.siteId === siteId || assignment.site?.id === siteId;
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

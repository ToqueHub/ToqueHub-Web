import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  ChefHat,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Eye,
  FileText,
  Filter,
  GripVertical,
  Kanban,
  LayoutGrid,
  Loader2,
  ListChecks,
  Package,
  Pencil,
  Play,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Scissors,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table,
  UserRound,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { GuidedWizard } from './ui/GuidedWizard';
import { ProductionFabricationCalendar } from './ProductionFabricationCalendar';
import {
  TechnicalSheetPickerModal,
  type TechnicalSheetPickerItem,
} from './TechnicalSheetPickerModal';
import type {
  HrDepartment,
  HrPosition,
  MenuPlan,
  OperationalTask,
  OperationalTaskAssignee,
  OperationalTaskCategory,
  OperationalTaskPayload,
  OperationalTaskOptions,
  ProductionCampaign,
  ProductionProfile,
  Site,
  UserSession,
} from '../types';

type ProductionAppProps = {
  token: string;
  session: UserSession;
  tab: 'fabrication' | 'planning';
};

type ViewMode = 'day' | 'week';
type TaskMode = '' | 'MANUAL' | 'PRESET' | 'TECHNICAL_SHEET' | 'TECHNICAL_SHEET_STEP';

type TaskDraft = {
  mode: TaskMode;
  title: string;
  description: string;
  category: OperationalTaskCategory;
  departmentId: string;
  positionId: string;
  siteId: string;
  assignedEmployeeId: string;
  assignedEmployeeIds: string[];
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  quantity: string;
  unitLabel: string;
  positionTaskPresetId: string;
  technicalSheetId: string;
  technicalSheetStepId: string;
  productionBatchId: string;
  productionOperationId: string;
};

const categoryOptions: Array<{ value: OperationalTaskCategory; label: string }> = [
  { value: 'KITCHEN', label: 'Cuisine / fabrication' },
  { value: 'SERVICE', label: 'Salle / service' },
  { value: 'HOUSEKEEPING', label: 'Hébergement / ménage' },
  { value: 'RECEPTION', label: 'Réception' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'LOGISTICS', label: 'Achats / logistique' },
  { value: 'MANAGEMENT', label: 'Encadrement' },
  { value: 'OTHER', label: 'Autre' },
];

const categoryColor: Record<OperationalTaskCategory, string> = {
  KITCHEN: '#f97316',
  SERVICE: '#8b5cf6',
  HOUSEKEEPING: '#06b6d4',
  RECEPTION: '#2563eb',
  MAINTENANCE: '#64748b',
  LOGISTICS: '#ca8a04',
  MANAGEMENT: '#111827',
  OTHER: '#10b981',
};

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
};

function parseDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function addDays(value: string, amount: number) {
  const date = parseDay(value);
  date.setDate(date.getDate() + amount);
  return dayKey(date);
}

function startOfWeek(value: string) {
  const date = parseDay(value);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return dayKey(date);
}

function localIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function endTimeFromDuration(startTime: string, durationMinutes: number) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, hours * 60 + minutes + durationMinutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function minutesBetween(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  return Math.max(5, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}

function formatDay(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(
    'fr-FR',
    options ?? { weekday: 'long', day: 'numeric', month: 'long' },
  )
    .format(parseDay(value))
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function taskDay(value: string) {
  const date = new Date(value);
  return dayKey(date);
}

const TIMELINE_HOUR_HEIGHT = 72;
const TIMELINE_MIN_TASK_MINUTES = 60;
const TIMELINE_DEFAULT_START = 0;
const TIMELINE_DEFAULT_END = 24 * 60;

type TimelineTaskLayout = {
  task: OperationalTask;
  startMinute: number;
  endMinute: number;
  visualEndMinute: number;
  lane: number;
  laneCount: number;
};

function minuteInDay(value: string, day: string) {
  const date = new Date(value);
  const valueDay = taskDay(value);
  if (valueDay < day) return 0;
  if (valueDay > day) return 24 * 60;
  return date.getHours() * 60 + date.getMinutes();
}

function formatTimelineMinute(value: number) {
  const bounded = Math.min(24 * 60, Math.max(0, value));
  const hours = bounded === 24 * 60 ? 24 : Math.floor(bounded / 60);
  const minutes = bounded === 24 * 60 ? 0 : bounded % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildTimelineLayout(tasks: OperationalTask[], day: string): TimelineTaskLayout[] {
  const entries = tasks
    .map((task) => {
      const startMinute = minuteInDay(task.startsAt, day);
      const endMinute = Math.max(startMinute + 5, minuteInDay(task.endsAt, day));
      return {
        task,
        startMinute,
        endMinute,
        visualEndMinute: Math.min(
          24 * 60,
          Math.max(endMinute, startMinute + TIMELINE_MIN_TASK_MINUTES),
        ),
      };
    })
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const result: TimelineTaskLayout[] = [];
  let group: Array<Omit<TimelineTaskLayout, 'laneCount'>> = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;

  const flushGroup = () => {
    const laneCount = Math.max(1, laneEnds.length);
    result.push(...group.map((entry) => ({ ...entry, laneCount })));
    group = [];
    laneEnds = [];
    groupEnd = -1;
  };

  entries.forEach((entry) => {
    if (group.length && entry.startMinute >= groupEnd) flushGroup();
    let lane = laneEnds.findIndex((endMinute) => endMinute <= entry.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.visualEndMinute);
    } else {
      laneEnds[lane] = entry.visualEndMinute;
    }
    group.push({ ...entry, lane });
    groupEnd = Math.max(groupEnd, entry.visualEndMinute);
  });
  if (group.length) flushGroup();
  return result;
}

function employeeName(
  employee?: OperationalTaskAssignee | OperationalTask['assignedEmployee'] | null,
) {
  if (!employee) return 'Non assignée';
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function taskSiteName(task: OperationalTask) {
  return (
    task.site?.name ?? task.assignedEmployee?.mainSite?.name ?? task.planningAssignment?.site?.name
  );
}

function taskTeamLabel(task: OperationalTask) {
  const names = (task.assignments ?? [])
    .map((assignment) => employeeName(assignment.employee))
    .filter((name) => name !== 'Non assignée');
  if (names.length) return names.join(', ');
  return employeeName(task.assignedEmployee);
}

function productionStepCount(task: OperationalTask) {
  return task.technicalSheet?.steps?.length ?? task.productionBatch?.operations?.length ?? 0;
}

function canSplitProductionRecipe(task: OperationalTask) {
  return (
    task.source === 'PRODUCTION' &&
    Boolean(task.productionBatchId) &&
    !task.productionOperationId &&
    !task.technicalSheetStepId &&
    productionStepCount(task) > 1
  );
}

function campaignQuantity(campaign: ProductionCampaign) {
  const mode =
    campaign.targetMode ?? (campaign.technicalSheet?.yieldMode === 'MASS' ? 'MASS' : 'PORTIONS');
  const raw = Number(
    campaign.targetQuantity ?? campaign.grossRequirement ?? campaign.plannedPortions,
  );
  return {
    value: mode === 'MASS' ? raw / 1000 : raw,
    unit: mode === 'MASS' ? 'kg' : 'portions',
  };
}

function emptyDraft(
  date: string,
  departmentId = '',
  assignedEmployeeId = '',
  siteId = '',
): TaskDraft {
  return {
    mode: '',
    title: '',
    description: '',
    category: 'OTHER',
    departmentId,
    positionId: '',
    siteId,
    assignedEmployeeId,
    assignedEmployeeIds: assignedEmployeeId ? [assignedEmployeeId] : [],
    date,
    startTime: '09:00',
    endTime: '10:00',
    durationMinutes: 60,
    quantity: '',
    unitLabel: '',
    positionTaskPresetId: '',
    technicalSheetId: '',
    technicalSheetStepId: '',
    productionBatchId: '',
    productionOperationId: '',
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Une erreur est survenue.';
}

function normalizeLabel(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function categoryForDepartment(name?: string | null): OperationalTaskCategory {
  const normalized = normalizeLabel(name);
  if (/cuisine|patisserie|boulangerie/.test(normalized)) return 'KITCHEN';
  if (/salle|bar|cafe|evenement/.test(normalized)) return 'SERVICE';
  if (/hebergement|entretien|menage/.test(normalized)) return 'HOUSEKEEPING';
  if (/reception/.test(normalized)) return 'RECEPTION';
  if (/maintenance/.test(normalized)) return 'MAINTENANCE';
  if (/achat|stock|magasin|logistique/.test(normalized)) return 'LOGISTICS';
  if (/direction|administration|ressources humaines/.test(normalized)) return 'MANAGEMENT';
  return 'OTHER';
}

export function ProductionApp({ token, session, tab }: ProductionAppProps) {
  const [view, setView] = useState<ViewMode>('day');
  const [anchorDate, setAnchorDate] = useState(today());
  const [siteFilter, setSiteFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [departments, setDepartments] = useState<HrDepartment[]>([]);
  const [taskContext, setTaskContext] = useState({
    ownEmployeeId: '',
    managesPeople: false,
    canCreateUnassigned: false,
  });
  const [positions, setPositions] = useState<HrPosition[]>([]);
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [expiryNotice, setExpiryNotice] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStep, setEditorStep] = useState<1 | 2 | 3>(1);
  const [taskSheetPickerMode, setTaskSheetPickerMode] = useState<'sheet' | 'step' | null>(null);
  const [serviceSearch, setServiceSearch] = useState('');
  const [menuImporterOpen, setMenuImporterOpen] = useState(false);
  const [menus, setMenus] = useState<MenuPlan[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuGenerating, setMenuGenerating] = useState(false);
  const [menuDraft, setMenuDraft] = useState({
    menuId: '',
    departmentId: '',
    siteId: '',
    date: today(),
    serviceTime: '12:00',
  });
  const [editingTask, setEditingTask] = useState<OperationalTask | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft(today()));
  const [assignees, setAssignees] = useState<OperationalTaskAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taskOptions, setTaskOptions] = useState<OperationalTaskOptions>({
    presets: [],
    technicalSheets: [],
    productionBatches: [],
  });
  const [taskOptionsLoading, setTaskOptionsLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<ProductionCampaign[]>([]);
  const [productionProfiles, setProductionProfiles] = useState<ProductionProfile[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignError, setCampaignError] = useState('');
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignStatus, setCampaignStatus] = useState('');
  const [fabricationContext, setFabricationContext] = useState({
    startDate: startOfWeek(today()),
    endDate: addDays(startOfWeek(today()), 7),
    siteId: '',
    mode: 'week' as 'day' | 'week' | 'month',
    label: '',
  });
  const [catererEventFilter, setCatererEventFilter] = useState<{
    id: string;
    reference: string;
    name: string;
    orderIds: Set<string>;
  }>();

  const period = useMemo(() => {
    const start = view === 'week' ? startOfWeek(anchorDate) : anchorDate;
    const end = addDays(start, view === 'week' ? 7 : 1);
    return { start, end };
  }, [anchorDate, view]);

  const days = useMemo(
    () =>
      Array.from({ length: view === 'week' ? 7 : 1 }, (_, index) => addDays(period.start, index)),
    [period.start, view],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const expiry = await api.expireUnassignedProductionCampaigns(token);
      if (expiry.cancelledCount > 0) {
        setExpiryNotice(
          `${expiry.cancelledCount} fabrication${expiry.cancelledCount > 1 ? 's' : ''} échue${
            expiry.cancelledCount > 1 ? 's' : ''
          } annulée${expiry.cancelledCount > 1 ? 's' : ''} automatiquement · stocks libérés.`,
        );
      }
      const [hr, context, availableSites, taskList] = await Promise.all([
        api.hrBootstrap(token),
        api.productionTaskContext(token),
        api.sites(token).catch(() => []),
        api.productionTasks(token, {
          startDate: localIso(period.start, '00:00'),
          endDate: localIso(period.end, '00:00'),
          siteId: siteFilter || undefined,
          departmentId: departmentFilter || undefined,
        }),
      ]);
      setSites(availableSites.filter((site) => !site.isArchived && !site.archivedAt));
      setDepartments(context.departments ?? []);
      setTaskContext({
        ownEmployeeId: context.ownEmployeeId ?? '',
        managesPeople: context.managesPeople,
        canCreateUnassigned: context.canCreateUnassigned,
      });
      setPositions((hr.positions ?? []).filter((item) => !item.isArchived));
      setTasks(taskList);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [departmentFilter, period.end, period.start, siteFilter, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCampaigns = useCallback(async () => {
    if (tab !== 'fabrication') return;
    setCampaignsLoading(true);
    setCampaignError('');
    try {
      const expiry = await api.expireUnassignedProductionCampaigns(token);
      if (expiry.cancelledCount > 0) {
        setExpiryNotice(
          `${expiry.cancelledCount} fabrication${expiry.cancelledCount > 1 ? 's' : ''} échue${
            expiry.cancelledCount > 1 ? 's' : ''
          } annulée${expiry.cancelledCount > 1 ? 's' : ''} automatiquement · stocks libérés.`,
        );
      }
      const eventId = sessionStorage.getItem('toquehub.production.catererEventId');
      const [result, profilesResult, event] = await Promise.all([
        api.productionCampaigns(token, { pageSize: 200 }),
        api.productionProfiles(token, { pageSize: 200 }),
        eventId
          ? api.catererEvent(token, eventId).catch(() => undefined)
          : Promise.resolve(undefined),
      ]);
      setCampaigns(result.items ?? []);
      setProductionProfiles(profilesResult ?? []);
      if (event) {
        const orderIds = new Set(
          event.prestations
            .flatMap((prestation) =>
              (prestation.menu.productionLinks ?? []).map((link) => link.productionOrderId),
            )
            .filter((id): id is string => Boolean(id)),
        );
        setCatererEventFilter({
          id: event.id,
          reference: event.reference,
          name: event.name,
          orderIds,
        });
      } else {
        setCatererEventFilter(undefined);
        sessionStorage.removeItem('toquehub.production.catererEventId');
      }
    } catch (loadError) {
      setCampaignError(errorMessage(loadError));
    } finally {
      setCampaignsLoading(false);
    }
  }, [tab, token]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (!editorOpen || !draft.departmentId || !draft.date || !draft.startTime || !draft.endTime) {
      setAssignees([]);
      return;
    }
    const startsAt = localIso(draft.date, draft.startTime);
    const endsAt = localIso(draft.date, draft.endTime);
    if (new Date(startsAt) >= new Date(endsAt)) {
      setAssignees([]);
      return;
    }
    let active = true;
    setAssigneesLoading(true);
    api
      .productionTaskAssignees(token, {
        departmentId: draft.departmentId,
        startsAt,
        endsAt,
        taskId: editingTask?.id,
      })
      .then((result) => {
        if (!active) return;
        setAssignees([...result].sort((a, b) => Number(b.available) - Number(a.available)));
      })
      .catch((assigneeError) => {
        if (!active) return;
        setAssignees([]);
        setError(errorMessage(assigneeError));
      })
      .finally(() => {
        if (active) setAssigneesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    draft.date,
    draft.departmentId,
    draft.endTime,
    draft.startTime,
    editingTask?.id,
    editorOpen,
    token,
  ]);

  useEffect(() => {
    if (!editorOpen || !draft.departmentId) {
      setTaskOptions({ presets: [], technicalSheets: [], productionBatches: [] });
      return;
    }
    let active = true;
    setTaskOptionsLoading(true);
    api
      .productionTaskOptions(token, {
        departmentId: draft.departmentId,
        siteId: draft.siteId || undefined,
        technicalSheetId: draft.technicalSheetId || undefined,
        startDate: localIso(draft.date, '00:00'),
        endDate: localIso(addDays(draft.date, 1), '00:00'),
      })
      .then((result) => {
        if (active) setTaskOptions(result);
      })
      .catch((optionsError) => {
        if (active) setError(errorMessage(optionsError));
      })
      .finally(() => {
        if (active) setTaskOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [draft.date, draft.departmentId, draft.siteId, draft.technicalSheetId, editorOpen, token]);

  const positionsForDepartment = useMemo(
    () =>
      positions.filter(
        (position) => !position.departmentId || position.departmentId === draft.departmentId,
      ),
    [draft.departmentId, positions],
  );
  const selectedSite = sites.find((site) => site.id === draft.siteId);
  const selectedDepartment = departments.find((department) => department.id === draft.departmentId);
  const selectedSheet = taskOptions.technicalSheets.find(
    (sheet) => sheet.id === draft.technicalSheetId,
  );
  const taskSheetPickerItems = useMemo<TechnicalSheetPickerItem[]>(
    () =>
      taskOptions.technicalSheets.map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        category: sheet.isOnCurrentMenu ? 'Au menu actuellement' : 'Fiche active',
        group: sheet.isOnCurrentMenu ? 'Au menu actuellement' : 'Autres fiches actives',
        referenceLabel: sheet.referencePortions
          ? `${Number(sheet.referencePortions).toLocaleString('fr-FR')} portions`
          : null,
        durationMinutes: sheet.totalTimeMinutes,
        contextLabel: sheet.menuNames.length ? sheet.menuNames.join(', ') : null,
        featured: sheet.isOnCurrentMenu,
        steps: sheet.steps.map((step) => ({
          id: step.id,
          order: step.order,
          title: step.title,
          description: step.description,
          estimatedMinutes: step.estimatedMinutes,
        })),
      })),
    [taskOptions.technicalSheets],
  );
  const selectedTechnicalSheetStep = selectedSheet?.steps.find(
    (step) => step.id === draft.technicalSheetStepId,
  );
  const selectedBatch = taskOptions.productionBatches.find(
    (batch) => batch.id === draft.productionBatchId,
  );
  const selectedAssignee = assignees.find((employee) => employee.id === draft.assignedEmployeeId);
  const presetsForAssignee = selectedAssignee?.positionId
    ? taskOptions.presets.filter((preset) => preset.positionId === selectedAssignee.positionId)
    : taskOptions.presets;
  const supportsTechnicalSheets =
    presetsForAssignee.some((preset) => preset.requiresTechnicalSheet) ||
    Boolean(editingTask?.technicalSheetId);
  const taskSelectionComplete =
    draft.mode === 'MANUAL' ||
    (draft.mode === 'PRESET' && Boolean(draft.positionTaskPresetId)) ||
    (draft.mode === 'TECHNICAL_SHEET' && Boolean(draft.technicalSheetId)) ||
    (draft.mode === 'TECHNICAL_SHEET_STEP' &&
      Boolean(draft.technicalSheetId && draft.technicalSheetStepId));
  const visibleDepartments = departments.filter((department) =>
    normalizeLabel(department.name).includes(normalizeLabel(serviceSearch)),
  );
  const personStepComplete = Boolean(draft.assignedEmployeeId) || taskContext.canCreateUnassigned;

  function chooseDepartment(departmentId: string) {
    const department = departments.find((item) => item.id === departmentId);
    setDraft((current) => ({
      ...current,
      departmentId,
      mode: '',
      category: categoryForDepartment(department?.name),
      positionId: '',
      assignedEmployeeId: '',
      assignedEmployeeIds: [],
      positionTaskPresetId: '',
      technicalSheetId: '',
      technicalSheetStepId: '',
      productionBatchId: '',
      productionOperationId: '',
      title: '',
      description: '',
    }));
  }

  function chooseAssignee(assignedEmployeeId: string) {
    const employee = assignees.find((item) => item.id === assignedEmployeeId);
    setDraft((current) => ({
      ...current,
      assignedEmployeeId,
      assignedEmployeeIds: assignedEmployeeId ? [assignedEmployeeId] : [],
      positionId: employee?.positionId ?? '',
      mode: '',
      positionTaskPresetId: '',
      technicalSheetId: '',
      technicalSheetStepId: '',
      productionBatchId: '',
      productionOperationId: '',
      title: '',
      description: '',
    }));
  }

  function toggleAssignee(employeeId: string) {
    const employee = assignees.find((item) => item.id === employeeId);
    setDraft((current) => {
      const selected = current.assignedEmployeeIds.includes(employeeId);
      const assignedEmployeeIds = selected
        ? current.assignedEmployeeIds.filter((id) => id !== employeeId)
        : [...current.assignedEmployeeIds, employeeId];
      const leadId =
        current.assignedEmployeeId === employeeId && selected
          ? (assignedEmployeeIds[0] ?? '')
          : current.assignedEmployeeId || employeeId;
      const lead = assignees.find((item) => item.id === leadId);
      return {
        ...current,
        assignedEmployeeIds,
        assignedEmployeeId: leadId,
        positionId: lead?.positionId ?? employee?.positionId ?? current.positionId,
      };
    });
  }

  function selectTaskMode(mode: TaskMode) {
    if (draft.mode === mode) return;
    if (
      draft.technicalSheetId &&
      (draft.mode === 'TECHNICAL_SHEET' || draft.mode === 'TECHNICAL_SHEET_STEP') &&
      (mode === 'TECHNICAL_SHEET' || mode === 'TECHNICAL_SHEET_STEP')
    ) {
      switchTechnicalSheetMode(mode);
      return;
    }
    setDraft((current) => ({
      ...current,
      mode,
      title: mode === 'MANUAL' ? current.title : '',
      description: mode === 'MANUAL' ? current.description : '',
      category: categoryForDepartment(selectedDepartment?.name),
      positionId: mode === 'PRESET' ? current.positionId : '',
      positionTaskPresetId: '',
      technicalSheetId: '',
      technicalSheetStepId: '',
      productionBatchId: '',
      productionOperationId: '',
      quantity: '',
      unitLabel: '',
    }));
  }

  function openTaskSheetPicker(mode: 'sheet' | 'step') {
    const taskMode = mode === 'step' ? 'TECHNICAL_SHEET_STEP' : 'TECHNICAL_SHEET';
    selectTaskMode(taskMode);
    setTaskSheetPickerMode(mode);
  }

  function switchTechnicalSheetMode(mode: 'TECHNICAL_SHEET' | 'TECHNICAL_SHEET_STEP') {
    if (!selectedSheet) {
      selectTaskMode(mode);
      return;
    }
    const duration = selectedSheet.totalTimeMinutes;
    setDraft((current) => ({
      ...current,
      mode,
      technicalSheetStepId: '',
      productionBatchId: '',
      productionOperationId: '',
      title: mode === 'TECHNICAL_SHEET' ? `Préparer · ${selectedSheet.name}` : '',
      description:
        mode === 'TECHNICAL_SHEET' && selectedSheet.menuNames.length
          ? `Fiche présente dans : ${selectedSheet.menuNames.join(', ')}.`
          : '',
      durationMinutes: duration,
      endTime: endTimeFromDuration(current.startTime, duration),
    }));
  }

  function selectPreset(presetId: string) {
    const preset = taskOptions.presets.find((item) => `${item.positionId}:${item.id}` === presetId);
    if (!preset) return;
    if (preset.requiresTechnicalSheet) {
      setDraft((current) => ({
        ...current,
        mode: 'TECHNICAL_SHEET',
        category: preset.category,
        positionId: preset.positionId,
        positionTaskPresetId: preset.id,
        title: '',
        description: preset.description ?? '',
        technicalSheetId: '',
        technicalSheetStepId: '',
        productionBatchId: '',
        productionOperationId: '',
      }));
      return;
    }
    const duration = Math.max(5, preset.defaultDurationMinutes ?? 30);
    setDraft((current) => ({
      ...current,
      mode: 'PRESET',
      title: preset.title,
      description: preset.description ?? '',
      category: preset.category,
      positionId: preset.positionId,
      positionTaskPresetId: preset.id,
      technicalSheetId: '',
      technicalSheetStepId: '',
      productionBatchId: '',
      productionOperationId: '',
      durationMinutes: duration,
      endTime: endTimeFromDuration(current.startTime, duration),
    }));
  }

  function selectTechnicalSheet(technicalSheetId: string) {
    const sheet = taskOptions.technicalSheets.find((item) => item.id === technicalSheetId);
    if (!sheet) {
      setDraft((current) => ({
        ...current,
        technicalSheetId: '',
        technicalSheetStepId: '',
        productionBatchId: '',
        productionOperationId: '',
        title: '',
      }));
      return;
    }
    const isStepMode = draft.mode === 'TECHNICAL_SHEET_STEP';
    const duration = sheet.totalTimeMinutes;
    setDraft((current) => ({
      ...current,
      technicalSheetId: sheet.id,
      technicalSheetStepId: '',
      productionBatchId: '',
      productionOperationId: '',
      title: isStepMode ? '' : `Préparer · ${sheet.name}`,
      description: isStepMode
        ? ''
        : sheet.menuNames.length
          ? `Fiche présente dans : ${sheet.menuNames.join(', ')}.`
          : current.description,
      category: categoryForDepartment(selectedDepartment?.name),
      durationMinutes: duration,
      endTime: endTimeFromDuration(current.startTime, duration),
      quantity: current.quantity || String(sheet.referencePortions ?? ''),
      unitLabel: current.unitLabel || 'portions',
    }));
  }

  function selectTechnicalSheetStep(stepId: string, technicalSheetId = selectedSheet?.id ?? '') {
    const sheet = taskOptions.technicalSheets.find((item) => item.id === technicalSheetId);
    const step = sheet?.steps.find((item) => item.id === stepId);
    if (!step || !sheet) return;
    const stepIndex = sheet.steps.findIndex((item) => item.id === stepId);
    setDraft((current) => ({
      ...current,
      mode: 'TECHNICAL_SHEET_STEP',
      technicalSheetId: sheet.id,
      technicalSheetStepId: step.id,
      productionBatchId:
        taskOptions.productionBatches.find(
          (batch) =>
            batch.id === current.productionBatchId && batch.order.technicalSheetId === sheet.id,
        )?.id ?? '',
      productionOperationId:
        taskOptions.productionBatches
          .find(
            (batch) =>
              batch.id === current.productionBatchId && batch.order.technicalSheetId === sheet.id,
          )
          ?.operations.find((operation) => operation.position === stepIndex)?.id ?? '',
      title: `${step.title} · ${sheet.name}`,
      description: step.description ?? '',
      durationMinutes: step.estimatedMinutes,
      endTime: endTimeFromDuration(current.startTime, step.estimatedMinutes),
      quantity: current.quantity || String(sheet.referencePortions ?? ''),
      unitLabel: current.unitLabel || 'portions',
    }));
  }

  function openCreate(date = anchorDate) {
    setEditingTask(null);
    setEditorStep(1);
    setServiceSearch('');
    setDraft(
      emptyDraft(
        date,
        departmentFilter || '',
        taskContext.canCreateUnassigned ? '' : taskContext.ownEmployeeId,
        siteFilter || '',
      ),
    );
    setEditorOpen(true);
    setError('');
  }

  async function openMenuImporter() {
    setError('');
    setMenuImporterOpen(true);
    setMenuLoading(true);
    const kitchenDepartment =
      departments.find((department) => /cuisine|kitchen/i.test(department.name)) ?? departments[0];
    setMenuDraft({
      menuId: '',
      departmentId: kitchenDepartment?.id ?? '',
      siteId: siteFilter || '',
      date: anchorDate,
      serviceTime: '12:00',
    });
    try {
      const result = await api.menusList(token);
      const withRecipes = result.filter((menu) =>
        menu.items?.some((item) => Boolean(item.technicalSheetId)),
      );
      setMenus(withRecipes);
      setMenuDraft((current) => ({ ...current, menuId: withRecipes[0]?.id ?? '' }));
    } catch (menuError) {
      setMenus([]);
      setError(errorMessage(menuError));
    } finally {
      setMenuLoading(false);
    }
  }

  async function generateFromMenu(event: FormEvent) {
    event.preventDefault();
    if (!menuDraft.menuId || !menuDraft.departmentId) {
      setError('Choisissez un menu et le service RH qui réalisera les recettes.');
      return;
    }
    setMenuGenerating(true);
    setError('');
    try {
      await api.generateProductionTasksFromMenu(token, menuDraft);
      setMenuImporterOpen(false);
      setAnchorDate(menuDraft.date);
      await load();
    } catch (menuError) {
      setError(errorMessage(menuError));
    } finally {
      setMenuGenerating(false);
    }
  }

  function openEdit(task: OperationalTask) {
    const start = new Date(task.startsAt);
    const end = new Date(task.endsAt);
    setEditingTask(task);
    setEditorStep(3);
    setServiceSearch('');
    setDraft({
      mode: task.technicalSheetStepId
        ? 'TECHNICAL_SHEET_STEP'
        : task.technicalSheetId
          ? 'TECHNICAL_SHEET'
          : task.positionTaskPresetId
            ? 'PRESET'
            : 'MANUAL',
      title: task.title,
      description: task.description ?? '',
      category: task.category,
      departmentId: task.departmentId,
      positionId: task.positionId ?? '',
      siteId: task.siteId ?? '',
      assignedEmployeeId: task.assignedEmployeeId ?? '',
      assignedEmployeeIds: task.assignments?.length
        ? task.assignments.map((assignment) => assignment.employeeId)
        : task.assignedEmployeeId
          ? [task.assignedEmployeeId]
          : [],
      date: taskDay(task.startsAt),
      startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
      durationMinutes: Math.max(5, Math.round((end.getTime() - start.getTime()) / 60_000)),
      quantity: task.quantity == null ? '' : String(task.quantity),
      unitLabel: task.unitLabel ?? '',
      positionTaskPresetId: task.positionTaskPresetId ?? '',
      technicalSheetId: task.technicalSheetId ?? '',
      technicalSheetStepId: task.technicalSheetStepId ?? '',
      productionBatchId: task.productionBatchId ?? '',
      productionOperationId: task.productionOperationId ?? '',
    });
    setEditorOpen(true);
    setError('');
  }

  async function saveTask(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!draft.title.trim() || !draft.departmentId) {
      setError('Indiquez au minimum un titre et un service RH.');
      return;
    }
    const startsAt = localIso(draft.date, draft.startTime);
    const endsAt = localIso(draft.date, draft.endTime);
    if (new Date(startsAt) >= new Date(endsAt)) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    const payload: OperationalTaskPayload = {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      category: draft.category,
      departmentId: draft.departmentId,
      positionId: draft.positionId || null,
      siteId: draft.siteId || null,
      assignedEmployeeId: draft.assignedEmployeeId || null,
      assignedEmployeeIds: draft.assignedEmployeeIds,
      startsAt,
      endsAt,
      isTimeScheduled:
        editingTask?.source === 'PRODUCTION' ? true : (editingTask?.isTimeScheduled ?? true),
      quantity: draft.quantity === '' ? null : Number(draft.quantity),
      unitLabel: draft.unitLabel.trim() || null,
      source: editingTask?.source ?? (draft.technicalSheetId ? 'TECHNICAL_SHEET' : 'MANUAL'),
      technicalSheetId: draft.technicalSheetId || null,
      technicalSheetStepId: draft.technicalSheetStepId || null,
      productionBatchId: draft.productionBatchId || null,
      productionOperationId: draft.productionOperationId || null,
      positionTaskPresetId: draft.positionTaskPresetId || null,
    };
    setSaving(true);
    try {
      if (editingTask) await api.updateProductionTask(token, editingTask.id, payload);
      else await api.createProductionTask(token, payload);
      setEditorOpen(false);
      setEditingTask(null);
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function splitRecipeTask(task: OperationalTask) {
    setBusyId(task.id);
    setError('');
    try {
      await api.splitProductionRecipeTask(token, task.id);
      setEditorOpen(false);
      setEditingTask(null);
      await load();
    } catch (splitError) {
      setError(errorMessage(splitError));
    } finally {
      setBusyId('');
    }
  }

  async function scheduleProductionTask(taskId: string, day: string, startMinute?: number) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.source !== 'PRODUCTION' || !task.productionBatchId) {
      return;
    }
    const originalStart = new Date(task.startsAt);
    const originalEnd = new Date(task.endsAt);
    const startsAt = parseDay(day);
    const boundedStartMinute =
      startMinute == null
        ? originalStart.getHours() * 60 + originalStart.getMinutes()
        : Math.min(23 * 60 + 45, Math.max(0, Math.round(startMinute / 15) * 15));
    startsAt.setHours(Math.floor(boundedStartMinute / 60), boundedStartMinute % 60, 0, 0);
    const endsAt = new Date(
      startsAt.getTime() + Math.max(5 * 60_000, originalEnd.getTime() - originalStart.getTime()),
    );
    setBusyId(task.id);
    setError('');
    try {
      const updated = await api.updateProductionTask(token, task.id, {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        isTimeScheduled: true,
      });
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
    } catch (moveError) {
      setError(errorMessage(moveError));
    } finally {
      setBusyId('');
    }
  }

  async function exportSelectedServicePdf() {
    if (!departmentFilter) return;
    setExportingPdf(true);
    setError('');
    try {
      await api.downloadProductionOperationalPdf(token, {
        date: anchorDate,
        serviceId: departmentFilter,
        siteId: siteFilter || undefined,
      });
    } catch (exportError) {
      setError(errorMessage(exportError));
    } finally {
      setExportingPdf(false);
    }
  }

  const activeTasks = tasks.filter((task) => task.status !== 'CANCELLED');
  const pendingProductionTasks = activeTasks.filter(
    (task) =>
      task.source === 'PRODUCTION' &&
      Boolean(task.productionBatchId) &&
      task.isTimeScheduled === false,
  );
  const scheduledTasks = activeTasks.filter(
    (task) =>
      !(
        task.source === 'PRODUCTION' &&
        Boolean(task.productionBatchId) &&
        task.isTimeScheduled === false
      ),
  );
  const unassignedTasks = scheduledTasks.filter(
    (task) => !task.assignedEmployeeId && !task.assignments?.length,
  );
  const periodCampaigns = useMemo(
    () =>
      campaigns.filter((campaign) => {
        const date = dayKey(new Date(campaign.productionDate));
        return (
          date >= fabricationContext.startDate &&
          date < fabricationContext.endDate &&
          (!fabricationContext.siteId || campaign.siteId === fabricationContext.siteId)
        );
      }),
    [
      campaigns,
      fabricationContext.endDate,
      fabricationContext.siteId,
      fabricationContext.startDate,
    ],
  );

  if (tab === 'fabrication') {
    return (
      <section className="fabrication-unified-workspace">
        <ProductionFabricationCalendar
          token={token}
          campaigns={campaigns}
          profiles={productionProfiles}
          sites={sites}
          departments={departments}
          loading={campaignsLoading}
          onRefresh={loadCampaigns}
          onContextChange={setFabricationContext}
        >
          <FabricationView
            token={token}
            campaigns={periodCampaigns}
            loading={campaignsLoading}
            error={campaignError}
            search={campaignSearch}
            status={campaignStatus}
            eventFilter={catererEventFilter}
            onSearch={setCampaignSearch}
            onStatus={setCampaignStatus}
            onClearEvent={() => {
              sessionStorage.removeItem('toquehub.production.catererEventId');
              setCatererEventFilter(undefined);
            }}
            onRefresh={() => void loadCampaigns()}
            embedded
            periodLabel={fabricationContext.label}
          />
        </ProductionFabricationCalendar>
      </section>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ─── Hero En-tête Modernisé ─── */}
      <motion.section
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="production-hero-card"
      >
        <div className="production-hero-glow" />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1.2rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div>
            <div className="production-hero-badge">
              <Sparkles size={13} />
              <span>Organisation Opérationnelle</span>
            </div>
            <h2 className="production-hero-title">Planning des tâches</h2>
            <p className="production-hero-desc">
              Cuisine, réception, ménage, salle ou maintenance : orchestrez vos équipes en temps
              réel en vous appuyant directement sur la structure RH.
            </p>
          </div>
          <div className="production-hero-actions">
            {departmentFilter && view === 'day' && (
              <button
                type="button"
                onClick={() => void exportSelectedServicePdf()}
                className="production-btn-glass"
                disabled={exportingPdf}
              >
                {exportingPdf ? <Loader2 size={18} className="spin" /> : <Printer size={18} />}
                Exporter le service en PDF
              </button>
            )}
            <button
              type="button"
              onClick={() => void openMenuImporter()}
              className="production-btn-glass"
              disabled={!departments.length}
            >
              <CalendarDays size={18} /> Depuis un menu
            </button>
            <button
              type="button"
              onClick={() => openCreate()}
              className="production-btn-primary"
              disabled={!departments.length}
            >
              <Plus size={19} /> Nouvelle tâche
            </button>
          </div>
        </div>
      </motion.section>

      {/* ─── Barre de contrôle & Métriques ─── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="production-panel"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
            <div style={segmentedStyle}>
              <button
                type="button"
                onClick={() => setView('day')}
                style={segmentButtonStyle(view === 'day')}
              >
                Jour
              </button>
              <button
                type="button"
                onClick={() => setView('week')}
                style={segmentButtonStyle(view === 'week')}
              >
                Semaine
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
              <button
                type="button"
                aria-label="Période précédente"
                onClick={() => setAnchorDate((date) => addDays(date, view === 'week' ? -7 : -1))}
                style={iconButtonStyle}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                type="button"
                onClick={() => setAnchorDate(today())}
                style={secondaryButtonStyle}
              >
                Aujourd’hui
              </button>
              <button
                type="button"
                aria-label="Période suivante"
                onClick={() => setAnchorDate((date) => addDays(date, view === 'week' ? 7 : 1))}
                style={iconButtonStyle}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="production-planning-filters">
            <label>
              <Building2 size={18} />
              <span>Site</span>
              <select
                value={siteFilter}
                onChange={(event) => setSiteFilter(event.target.value)}
                style={{ ...inputStyle, minWidth: '190px', borderRadius: '13px' }}
              >
                <option value="">Tous les sites</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Users size={18} />
              <span>Service</span>
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                style={{ ...inputStyle, minWidth: '210px', borderRadius: '13px' }}
              >
                <option value="">Tous mes services</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="production-placement-indicator">
          <Metric
            label="À placer"
            value={pendingProductionTasks.length}
            icon={AlertCircle}
            color="#d97706"
            bg="#fef3c7"
          />
        </div>
      </motion.section>

      {error && (
        <div style={errorStyle}>
          <AlertCircle size={19} /> <span>{error}</span>
        </div>
      )}

      {expiryNotice && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            padding: '0.9rem 1.05rem',
            border: '1px solid #a7f3d0',
            borderRadius: '14px',
            color: '#047857',
            background: '#ecfdf5',
            fontWeight: 700,
          }}
        >
          <CheckCircle2 size={19} />
          <span>{expiryNotice}</span>
          <button
            type="button"
            aria-label="Fermer l’information"
            onClick={() => setExpiryNotice('')}
            style={{
              marginLeft: 'auto',
              display: 'grid',
              placeItems: 'center',
              border: 0,
              color: 'inherit',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {unassignedTasks.length > 0 && (
        <section className="production-suggestions-panel">
          <div className="production-suggestions-heading">
            <span>
              <Sparkles size={17} /> Suggestions à affecter
            </span>
            <strong>
              {unassignedTasks.length} tâche{unassignedTasks.length > 1 ? 's' : ''}
            </strong>
          </div>
          <div className="production-suggestions-list">
            {unassignedTasks.slice(0, 8).map((task) => (
              <button key={task.id} type="button" onClick={() => openEdit(task)}>
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    {formatDay(taskDay(task.startsAt), {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                    {' · '}
                    {formatTime(task.startsAt)}
                    {taskSiteName(task) ? ` · ${taskSiteName(task)}` : ''}
                  </small>
                </span>
                <em>À affecter</em>
              </button>
            ))}
          </div>
        </section>
      )}

      <div
        className={`production-planning-workspace${
          pendingProductionTasks.length > 0 ? ' has-queue' : ''
        }`}
      >
        <div className="production-planning-calendar-region">
          {!departments.length && !loading ? (
            <section
              style={{
                ...panelStyle,
                textAlign: 'center',
                padding: '3.5rem 1.5rem',
                borderRadius: '24px',
              }}
            >
              <div
                style={{
                  display: 'inline-grid',
                  placeItems: 'center',
                  width: '64px',
                  height: '64px',
                  borderRadius: '20px',
                  background: '#ecfdf5',
                  color: '#10b981',
                  marginBottom: '1rem',
                }}
              >
                <Users size={32} />
              </div>
              <h3 style={{ margin: '0 0 .4rem', fontSize: '1.35rem', fontWeight: 800 }}>
                Commencez par vos services RH
              </h3>
              <p
                style={{
                  margin: 0,
                  color: '#64748b',
                  maxWidth: '480px',
                  marginInline: 'auto',
                  lineHeight: 1.5,
                }}
              >
                Créez vos services et collaborateurs dans le module RH. Ils seront automatiquement
                synchronisés dans le planning opérationnel.
              </p>
            </section>
          ) : loading ? (
            <section
              style={{
                ...panelStyle,
                display: 'grid',
                placeItems: 'center',
                minHeight: '300px',
                borderRadius: '24px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.75rem',
                  color: '#64748b',
                  fontWeight: 800,
                  fontSize: '1.05rem',
                }}
              >
                <Loader2 size={24} className="spin" color="#10b981" /> Chargement du planning
                opérationnel…
              </div>
            </section>
          ) : (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="production-panel production-planning-calendar-panel"
              style={{ padding: view === 'week' ? '.9rem' : '1.25rem', overflowX: 'auto' }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: view === 'week' ? 'repeat(7, minmax(230px, 1fr))' : '1fr',
                  gap: '.85rem',
                  minWidth: view === 'week' ? '1610px' : undefined,
                }}
              >
                {days.map((day) => {
                  const dayTasks = scheduledTasks.filter((task) => taskDay(task.startsAt) === day);
                  return (
                    <DayColumn
                      key={day}
                      day={day}
                      tasks={dayTasks}
                      today={day === today()}
                      compact={view === 'week'}
                      onCreate={() => openCreate(day)}
                      onEdit={openEdit}
                      onMoveTask={scheduleProductionTask}
                    />
                  );
                })}
              </div>
            </motion.section>
          )}
        </div>

        {pendingProductionTasks.length > 0 && (
          <ProductionPlanningQueue
            tasks={pendingProductionTasks}
            busyId={busyId}
            onEdit={openEdit}
            onSplit={splitRecipeTask}
          />
        )}
      </div>

      <AnimatePresence>
        {menuImporterOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              ...overlayStyle,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(8px)',
            }}
            role="presentation"
            onMouseDown={(event) =>
              event.target === event.currentTarget && setMenuImporterOpen(false)
            }
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onSubmit={generateFromMenu}
              style={{
                ...modalStyle,
                width: 'min(580px, 100%)',
                padding: '1.6rem 1.8rem',
                borderRadius: '24px',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.25)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: '46px',
                      height: '46px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                      color: '#059669',
                      border: '1px solid #a7f3d0',
                      flexShrink: 0,
                    }}
                  >
                    <Utensils size={22} />
                  </div>
                  <div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '.35rem',
                        color: '#059669',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        padding: '.2rem .55rem',
                        borderRadius: '999px',
                        fontSize: '.7rem',
                        fontWeight: 800,
                        letterSpacing: '.06em',
                        marginBottom: '.35rem',
                      }}
                    >
                      MENU → TÂCHES
                    </div>
                    <h3
                      style={{
                        margin: '0 0 .3rem',
                        fontSize: '1.45rem',
                        fontWeight: 800,
                        color: '#0f172a',
                      }}
                    >
                      Préparer un service
                    </h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '.88rem', lineHeight: 1.5 }}>
                      Une tâche simple sera créée pour chaque fiche technique du menu. Vous pourrez
                      ensuite les répartir entre les cuisiniers.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => setMenuImporterOpen(false)}
                  style={{
                    ...iconButtonStyle,
                    borderRadius: '12px',
                    width: '36px',
                    height: '36px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <X size={18} color="#64748b" />
                </button>
              </div>

              <div style={{ display: 'grid', gap: '1.1rem', marginTop: '1.4rem' }}>
                <Field label="Menu" required>
                  <select
                    value={menuDraft.menuId}
                    onChange={(event) =>
                      setMenuDraft((current) => ({ ...current, menuId: event.target.value }))
                    }
                    style={{ ...inputStyle, borderRadius: '13px', padding: '.7rem .85rem' }}
                    disabled={menuLoading}
                  >
                    <option value="">
                      {menuLoading ? 'Chargement des menus…' : 'Choisir un menu…'}
                    </option>
                    {menus.map((menu) => (
                      <option key={menu.id} value={menu.id}>
                        {menu.name} ·{' '}
                        {menu.items?.filter((item) => item.technicalSheetId).length ?? 0} recette(s)
                      </option>
                    ))}
                  </select>
                  {!menuLoading && menus.length === 0 && (
                    <small
                      style={{
                        color: '#b45309',
                        fontWeight: 600,
                        marginTop: '.25rem',
                        display: 'block',
                      }}
                    >
                      Aucun menu contenant des fiches techniques n’est disponible.
                    </small>
                  )}
                </Field>

                <Field label="Service RH responsable" required>
                  <select
                    value={menuDraft.departmentId}
                    onChange={(event) =>
                      setMenuDraft((current) => ({ ...current, departmentId: event.target.value }))
                    }
                    style={{ ...inputStyle, borderRadius: '13px', padding: '.7rem .85rem' }}
                  >
                    <option value="">Choisir un service…</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <div style={twoColumnStyle}>
                  <Field label="Date du service">
                    <input
                      type="date"
                      value={menuDraft.date}
                      onChange={(event) =>
                        setMenuDraft((current) => ({ ...current, date: event.target.value }))
                      }
                      style={{ ...inputStyle, borderRadius: '13px', padding: '.65rem .85rem' }}
                    />
                  </Field>
                  <Field label="Heure du service">
                    <input
                      type="time"
                      value={menuDraft.serviceTime}
                      onChange={(event) =>
                        setMenuDraft((current) => ({ ...current, serviceTime: event.target.value }))
                      }
                      style={{ ...inputStyle, borderRadius: '13px', padding: '.65rem .85rem' }}
                    />
                  </Field>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '.75rem',
                  marginTop: '1.6rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <button
                  type="button"
                  onClick={() => setMenuImporterOpen(false)}
                  style={{
                    ...secondaryButtonStyle,
                    borderRadius: '13px',
                    minHeight: '42px',
                    padding: '0 1.1rem',
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="production-btn-primary"
                  style={{ minHeight: '42px', borderRadius: '13px', padding: '0 1.25rem' }}
                  disabled={
                    menuGenerating ||
                    menuLoading ||
                    !menus.length ||
                    !menuDraft.menuId ||
                    !menuDraft.departmentId
                  }
                >
                  {menuGenerating ? (
                    <Loader2 size={18} className="spin" />
                  ) : (
                    <CalendarDays size={18} />
                  )}{' '}
                  Créer les tâches
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {editorOpen && (
        <GuidedWizard
          step={editingTask ? 1 : editorStep}
          totalSteps={editingTask ? 1 : 3}
          onClose={() => setEditorOpen(false)}
          sidebar={
            <OperationalTaskWizardSidebar
              step={editingTask ? 3 : editorStep}
              editing={Boolean(editingTask)}
              siteName={selectedSite?.name}
              departmentName={selectedDepartment?.name}
              assigneeName={
                editingTask
                  ? taskTeamLabel(editingTask)
                  : draft.assignedEmployeeIds.length > 1
                    ? `${employeeName(selectedAssignee)} + ${draft.assignedEmployeeIds.length - 1}`
                    : draft.assignedEmployeeId
                      ? employeeName(selectedAssignee)
                      : 'À assigner plus tard'
              }
              taskName={draft.title}
            />
          }
        >
          <form onSubmit={saveTask} className="operational-task-wizard-form">
            <div className="operational-task-wizard-body">
              {editorStep === 1 && (
                <section className="operational-task-step">
                  <div className="operational-task-step-heading">
                    <span>Site et service responsables</span>
                    <h2>Où se déroule la tâche ?</h2>
                    <p>
                      Choisissez d’abord le site, puis le service issu du module RH qui réalisera la
                      tâche.
                    </p>
                  </div>
                  <label className="operational-task-site-select">
                    <span>
                      <Building2 size={17} /> Site
                    </span>
                    <select
                      value={draft.siteId}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, siteId: event.target.value }))
                      }
                    >
                      <option value="">Aucun site spécifique</option>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="operational-task-search">
                    <Building2 size={19} />
                    <input
                      autoFocus
                      value={serviceSearch}
                      onChange={(event) => setServiceSearch(event.target.value)}
                      placeholder="Rechercher un service…"
                    />
                  </div>
                  <div className="operational-task-choice-grid departments">
                    {visibleDepartments.map((department) => {
                      const active = draft.departmentId === department.id;
                      return (
                        <button
                          key={department.id}
                          type="button"
                          className={
                            active ? 'operational-task-choice active' : 'operational-task-choice'
                          }
                          onClick={() => chooseDepartment(department.id)}
                        >
                          <span className="operational-task-choice-icon">
                            <Building2 size={20} />
                          </span>
                          <span>
                            <strong>{department.name}</strong>
                            <small>Service RH</small>
                          </span>
                          <span className="operational-task-choice-check">
                            {active ? <Check size={17} /> : <Circle size={15} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {!visibleDepartments.length && (
                    <div className="operational-task-empty">
                      Aucun service ne correspond à cette recherche.
                    </div>
                  )}
                </section>
              )}

              {editorStep === 2 && (
                <section className="operational-task-step">
                  <div className="operational-task-step-heading">
                    <span>Équipe disponible</span>
                    <h2>Qui doit réaliser cette tâche ?</h2>
                    <p>
                      Sélectionnez une ou plusieurs personnes. La première devient responsable
                      principal et chaque membre retrouvera la même tâche dans son planning.
                    </p>
                  </div>
                  {assigneesLoading ? (
                    <div className="operational-task-loading">
                      <Loader2 size={24} className="spin" /> Vérification des disponibilités…
                    </div>
                  ) : (
                    <div className="operational-task-choice-grid people">
                      {taskContext.canCreateUnassigned && (
                        <button
                          type="button"
                          className={
                            !draft.assignedEmployeeIds.length
                              ? 'operational-task-choice active'
                              : 'operational-task-choice'
                          }
                          onClick={() => chooseAssignee('')}
                        >
                          <span className="operational-task-choice-icon">
                            <Users size={20} />
                          </span>
                          <span>
                            <strong>À assigner plus tard</strong>
                            <small>La tâche restera visible dans les tâches non attribuées</small>
                          </span>
                          <span className="operational-task-choice-check">
                            {!draft.assignedEmployeeIds.length ? (
                              <Check size={17} />
                            ) : (
                              <Circle size={15} />
                            )}
                          </span>
                        </button>
                      )}
                      {assignees.map((employee) => {
                        const active = draft.assignedEmployeeIds.includes(employee.id);
                        const isLead = draft.assignedEmployeeId === employee.id;
                        return (
                          <button
                            key={employee.id}
                            type="button"
                            disabled={!employee.available && !active}
                            className={
                              active ? 'operational-task-choice active' : 'operational-task-choice'
                            }
                            onClick={() => toggleAssignee(employee.id)}
                          >
                            <span className="operational-task-avatar">
                              {employee.firstName?.[0]}
                              {employee.lastName?.[0]}
                            </span>
                            <span>
                              <strong>{employeeName(employee)}</strong>
                              <small>
                                {employee.position?.name ?? 'Sans poste'} ·{' '}
                                {employee.availabilityLabel}
                                {isLead ? ' · Responsable' : ''}
                              </small>
                            </span>
                            <span className="operational-task-choice-check">
                              {active ? <Check size={17} /> : <Circle size={15} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {!assigneesLoading && !assignees.length && !taskContext.canCreateUnassigned && (
                    <div className="operational-task-empty">
                      Aucune personne disponible sur ce créneau.
                    </div>
                  )}
                </section>
              )}

              {editorStep === 3 && (
                <section className="operational-task-step">
                  <div className="operational-task-step-heading compact">
                    <span>{editingTask ? 'Modification rapide' : 'Tâche et horaire'}</span>
                    <h2>{editingTask ? 'Récapitulatif de la tâche' : 'Que faut-il réaliser ?'}</h2>
                    <p>
                      {editingTask
                        ? 'Modifiez directement les informations utiles sans recommencer le parcours de planification.'
                        : 'Choisissez un raccourci du poste, une fiche technique pour les métiers concernés, ou saisissez librement la tâche.'}
                    </p>
                  </div>
                  {!editingTask && (
                    <>
                      {taskOptionsLoading ? (
                        <div className="operational-task-loading">
                          <Loader2 size={24} className="spin" /> Chargement des tâches proposées…
                        </div>
                      ) : (
                        <div className="operational-task-mode-grid">
                          {supportsTechnicalSheets && (
                            <button
                              type="button"
                              onClick={() => openTaskSheetPicker('sheet')}
                              style={taskModeButtonStyle(draft.mode === 'TECHNICAL_SHEET')}
                            >
                              <ChefHat size={20} /> Fiche complète
                            </button>
                          )}
                          {supportsTechnicalSheets && (
                            <button
                              type="button"
                              onClick={() => openTaskSheetPicker('step')}
                              style={taskModeButtonStyle(draft.mode === 'TECHNICAL_SHEET_STEP')}
                            >
                              <ListChecks size={20} /> Une étape
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => selectTaskMode('PRESET')}
                            style={taskModeButtonStyle(draft.mode === 'PRESET')}
                          >
                            <RotateCcw size={20} /> Tâche du poste
                          </button>
                          <button
                            type="button"
                            onClick={() => selectTaskMode('MANUAL')}
                            style={taskModeButtonStyle(draft.mode === 'MANUAL')}
                          >
                            <Pencil size={20} /> Saisie libre
                          </button>
                        </div>
                      )}

                      {draft.mode === 'PRESET' && (
                        <div className="operational-task-selection-panel">
                          <Field label="Tâche habituelle du poste" required>
                            <select
                              value={
                                draft.positionTaskPresetId
                                  ? `${draft.positionId}:${draft.positionTaskPresetId}`
                                  : ''
                              }
                              onChange={(event) => selectPreset(event.target.value)}
                              style={inputStyle}
                            >
                              <option value="">Choisir une tâche…</option>
                              {presetsForAssignee.map((preset) => (
                                <option
                                  key={`${preset.positionId}:${preset.id}`}
                                  value={`${preset.positionId}:${preset.id}`}
                                >
                                  {preset.positionName} · {preset.title}
                                </option>
                              ))}
                            </select>
                            {!presetsForAssignee.length && (
                              <small style={{ color: '#b45309' }}>
                                Ajoutez les tâches types depuis RH → Postes → Modifier → Tâches.
                              </small>
                            )}
                          </Field>
                        </div>
                      )}

                      {(draft.mode === 'TECHNICAL_SHEET' ||
                        draft.mode === 'TECHNICAL_SHEET_STEP') && (
                        <div className="operational-task-selection-panel technical-sheet">
                          <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => openTaskSheetPicker('sheet')}
                              style={smallSegmentStyle(draft.mode === 'TECHNICAL_SHEET')}
                            >
                              Fiche complète
                            </button>
                            <button
                              type="button"
                              onClick={() => openTaskSheetPicker('step')}
                              style={smallSegmentStyle(draft.mode === 'TECHNICAL_SHEET_STEP')}
                            >
                              Une étape
                            </button>
                          </div>
                          <Field label="Fiche technique" required>
                            <button
                              type="button"
                              className={
                                selectedSheet
                                  ? 'technical-sheet-picker-trigger selected'
                                  : 'technical-sheet-picker-trigger'
                              }
                              onClick={() =>
                                openTaskSheetPicker(
                                  draft.mode === 'TECHNICAL_SHEET_STEP' ? 'step' : 'sheet',
                                )
                              }
                            >
                              <span className="technical-sheet-picker-trigger-icon">
                                <Search size={18} />
                              </span>
                              <span className="technical-sheet-picker-trigger-copy">
                                <strong>
                                  {selectedSheet?.name ?? 'Rechercher une fiche technique'}
                                </strong>
                                <small>
                                  {selectedSheet
                                    ? `${selectedSheet.totalTimeMinutes} min${
                                        selectedSheet.referencePortions
                                          ? ` · ${Number(
                                              selectedSheet.referencePortions,
                                            ).toLocaleString('fr-FR')} portions`
                                          : ''
                                      }`
                                    : `${taskOptions.technicalSheets.length} fiche(s) active(s) disponible(s)`}
                                </small>
                              </span>
                              <span className="technical-sheet-picker-trigger-action">
                                {selectedSheet ? 'Changer' : 'Rechercher'}
                              </span>
                            </button>
                            {selectedSheet?.isOnCurrentMenu && (
                              <small style={{ color: '#047857', fontWeight: 800 }}>
                                Présente dans : {selectedSheet.menuNames.join(', ')}
                              </small>
                            )}
                          </Field>
                          {draft.mode === 'TECHNICAL_SHEET_STEP' && draft.technicalSheetId && (
                            <Field label="Étape à réaliser" required>
                              <button
                                type="button"
                                className={
                                  selectedTechnicalSheetStep
                                    ? 'technical-sheet-picker-trigger step selected'
                                    : 'technical-sheet-picker-trigger step'
                                }
                                onClick={() => setTaskSheetPickerMode('step')}
                              >
                                <span className="technical-sheet-picker-trigger-icon">
                                  <ListChecks size={18} />
                                </span>
                                <span className="technical-sheet-picker-trigger-copy">
                                  <strong>
                                    {selectedTechnicalSheetStep
                                      ? `${selectedTechnicalSheetStep.order}. ${selectedTechnicalSheetStep.title}`
                                      : 'Choisir une étape'}
                                  </strong>
                                  <small>
                                    {selectedTechnicalSheetStep
                                      ? `${selectedTechnicalSheetStep.estimatedMinutes} min · ${
                                          selectedSheet?.name ?? 'Fiche technique'
                                        }`
                                      : `${selectedSheet?.steps.length ?? 0} étape(s) disponible(s)`}
                                  </small>
                                </span>
                                <span className="technical-sheet-picker-trigger-action">
                                  {selectedTechnicalSheetStep ? 'Changer' : 'Choisir'}
                                </span>
                              </button>
                              {!selectedSheet?.steps.length && (
                                <small style={{ color: '#b45309' }}>
                                  Cette fiche ne contient aucune étape planifiable.
                                </small>
                              )}
                            </Field>
                          )}
                          {draft.technicalSheetId && (
                            <Field label="Lot d’exécution mobile (facultatif)">
                              <select
                                value={draft.productionBatchId}
                                onChange={(event) => {
                                  const productionBatchId = event.target.value;
                                  const batch = taskOptions.productionBatches.find(
                                    (item) => item.id === productionBatchId,
                                  );
                                  const stepIndex =
                                    selectedSheet?.steps.findIndex(
                                      (item) => item.id === draft.technicalSheetStepId,
                                    ) ?? -1;
                                  const operation =
                                    stepIndex >= 0
                                      ? batch?.operations.find(
                                          (item) => item.position === stepIndex,
                                        )
                                      : undefined;
                                  setDraft((current) => ({
                                    ...current,
                                    productionBatchId,
                                    productionOperationId: operation?.id ?? '',
                                  }));
                                }}
                                style={inputStyle}
                              >
                                <option value="">Aucun lot lié — consultation uniquement</option>
                                {taskOptions.productionBatches.map((batch) => (
                                  <option key={batch.id} value={batch.id}>
                                    {batch.reference} · {String(batch.plannedQuantity)}{' '}
                                    {batch.unit?.symbol ?? ''} · {batch.order.number}
                                  </option>
                                ))}
                              </select>
                              {!taskOptions.productionBatches.length && (
                                <small style={{ color: '#b45309' }}>
                                  Aucun lot validé et exécutable pour cette fiche à cette date.
                                </small>
                              )}
                            </Field>
                          )}
                          {draft.mode === 'TECHNICAL_SHEET_STEP' && selectedBatch && (
                            <Field label="Opération du lot" required>
                              <select
                                value={draft.productionOperationId}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    productionOperationId: event.target.value,
                                  }))
                                }
                                style={inputStyle}
                              >
                                <option value="">Choisir l’opération à synchroniser…</option>
                                {selectedBatch.operations.map((operation) => (
                                  <option key={operation.id} value={operation.id}>
                                    {operation.position + 1}. {operation.title}
                                  </option>
                                ))}
                              </select>
                              <small style={{ color: '#64748b' }}>
                                Cette opération sera pilotée depuis la tablette.
                              </small>
                            </Field>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {(editingTask || taskSelectionComplete) && (
                    <div className="operational-task-recap">
                      <div className="operational-task-recap-title">
                        <div>
                          <Check size={18} />
                          <span>
                            {editingTask ? 'Informations modifiables' : 'Récapitulatif de la tâche'}
                          </span>
                        </div>
                        {editingTask && canSplitProductionRecipe(editingTask) && (
                          <button
                            type="button"
                            className="production-planning-split-button"
                            disabled={busyId === editingTask.id}
                            onClick={() => splitRecipeTask(editingTask)}
                          >
                            {busyId === editingTask.id ? (
                              <Loader2 size={14} className="spin" />
                            ) : (
                              <Scissors size={14} />
                            )}
                            Découper en {productionStepCount(editingTask)} étapes
                          </button>
                        )}
                      </div>
                      {editingTask && (
                        <>
                          <div className="operational-task-quick-context">
                            <Field label="Site">
                              <select
                                value={draft.siteId}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    siteId: event.target.value,
                                  }))
                                }
                                style={inputStyle}
                              >
                                <option value="">Aucun site spécifique</option>
                                {sites.map((site) => (
                                  <option key={site.id} value={site.id}>
                                    {site.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Service responsable" required>
                              <select
                                value={draft.departmentId}
                                onChange={(event) => {
                                  const department = departments.find(
                                    (item) => item.id === event.target.value,
                                  );
                                  setDraft((current) => ({
                                    ...current,
                                    departmentId: event.target.value,
                                    category: categoryForDepartment(department?.name),
                                    positionId: '',
                                    assignedEmployeeId: '',
                                    assignedEmployeeIds: [],
                                  }));
                                }}
                                style={inputStyle}
                              >
                                {departments.map((department) => (
                                  <option key={department.id} value={department.id}>
                                    {department.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          </div>
                          <div className="operational-task-quick-team">
                            <span>Équipe affectée</span>
                            {assigneesLoading ? (
                              <div className="operational-task-loading compact">
                                <Loader2 size={18} className="spin" /> Disponibilités…
                              </div>
                            ) : (
                              <div className="operational-task-quick-team-list">
                                {taskContext.canCreateUnassigned && (
                                  <button
                                    type="button"
                                    className={
                                      !draft.assignedEmployeeIds.length ? 'active' : undefined
                                    }
                                    onClick={() =>
                                      setDraft((current) => ({
                                        ...current,
                                        assignedEmployeeId: '',
                                        assignedEmployeeIds: [],
                                        positionId: '',
                                      }))
                                    }
                                  >
                                    Non affectée
                                  </button>
                                )}
                                {assignees.map((employee) => (
                                  <button
                                    key={employee.id}
                                    type="button"
                                    disabled={
                                      !employee.available &&
                                      !draft.assignedEmployeeIds.includes(employee.id)
                                    }
                                    className={
                                      draft.assignedEmployeeIds.includes(employee.id)
                                        ? 'active'
                                        : undefined
                                    }
                                    onClick={() => toggleAssignee(employee.id)}
                                  >
                                    {employeeName(employee)}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                      <div className="operational-task-recap-grid">
                        <div className="operational-task-recap-column">
                          <Field label="Que faut-il faire ?" required>
                            <input
                              value={draft.title}
                              onChange={(event) =>
                                setDraft((current) => ({ ...current, title: event.target.value }))
                              }
                              placeholder="Ex. Préparer la mise en place du déjeuner"
                              style={inputStyle}
                            />
                          </Field>
                          <Field label="Type de tâche">
                            <select
                              value={draft.category}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  category: event.target.value as OperationalTaskCategory,
                                }))
                              }
                              style={inputStyle}
                            >
                              {categoryOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Consigne (facultatif)">
                            <textarea
                              value={draft.description}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                              rows={4}
                              placeholder="Informations utiles pour réaliser la tâche…"
                              style={{ ...inputStyle, resize: 'vertical' }}
                            />
                          </Field>
                        </div>
                        <div className="operational-task-recap-column">
                          <div className="operational-task-schedule-grid">
                            <Field label="Date">
                              <input
                                type="date"
                                value={draft.date}
                                onChange={(event) =>
                                  setDraft((current) => ({ ...current, date: event.target.value }))
                                }
                                style={inputStyle}
                              />
                            </Field>
                            <Field label="Début">
                              <input
                                type="time"
                                value={draft.startTime}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    startTime: event.target.value,
                                    endTime: endTimeFromDuration(
                                      event.target.value,
                                      current.durationMinutes,
                                    ),
                                  }))
                                }
                                style={inputStyle}
                              />
                            </Field>
                            <Field label="Durée (min)">
                              <input
                                type="number"
                                min="5"
                                step="5"
                                value={draft.durationMinutes}
                                onChange={(event) => {
                                  const durationMinutes = Math.max(
                                    5,
                                    Number(event.target.value) || 5,
                                  );
                                  setDraft((current) => ({
                                    ...current,
                                    durationMinutes,
                                    endTime: endTimeFromDuration(
                                      current.startTime,
                                      durationMinutes,
                                    ),
                                  }));
                                }}
                                style={inputStyle}
                              />
                            </Field>
                            <Field label="Fin">
                              <input
                                type="time"
                                value={draft.endTime}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    endTime: event.target.value,
                                    durationMinutes: minutesBetween(
                                      current.startTime,
                                      event.target.value,
                                    ),
                                  }))
                                }
                                style={inputStyle}
                              />
                            </Field>
                          </div>
                          {positionsForDepartment.length > 0 && (
                            <Field label="Poste attendu (facultatif)">
                              <select
                                value={draft.positionId}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    positionId: event.target.value,
                                  }))
                                }
                                style={inputStyle}
                                disabled={Boolean(selectedAssignee || draft.positionTaskPresetId)}
                              >
                                <option value="">Tous les postes du service</option>
                                {positionsForDepartment.map((position) => (
                                  <option key={position.id} value={position.id}>
                                    {position.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          )}
                          {draft.category === 'KITCHEN' && (
                            <div style={twoColumnStyle}>
                              <Field label="Quantité (facultatif)">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={draft.quantity}
                                  onChange={(event) =>
                                    setDraft((current) => ({
                                      ...current,
                                      quantity: event.target.value,
                                    }))
                                  }
                                  placeholder="Ex. 30"
                                  style={inputStyle}
                                />
                              </Field>
                              <Field label="Unité">
                                <input
                                  value={draft.unitLabel}
                                  onChange={(event) =>
                                    setDraft((current) => ({
                                      ...current,
                                      unitLabel: event.target.value,
                                    }))
                                  }
                                  placeholder="portions, plaques…"
                                  style={inputStyle}
                                />
                              </Field>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {error && (
                    <div style={errorStyle}>
                      <AlertCircle size={18} /> {error}
                    </div>
                  )}
                </section>
              )}
            </div>

            <footer className="operational-task-wizard-footer">
              {editingTask ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditorOpen(false)}
                    style={secondaryButtonStyle}
                  >
                    Annuler
                  </button>
                  <span />
                  <button
                    type="submit"
                    style={primaryButtonStyle}
                    disabled={saving || !draft.title.trim() || !draft.departmentId}
                  >
                    {saving ? <Loader2 size={18} className="spin" /> : <Check size={18} />}
                    Enregistrer les modifications
                  </button>
                </>
              ) : (
                <>
                  {editorStep === 1 && (
                    <button
                      type="button"
                      onClick={() => setEditorOpen(false)}
                      style={secondaryButtonStyle}
                    >
                      Annuler
                    </button>
                  )}
                  {editorStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setEditorStep((editorStep - 1) as 1 | 2)}
                      style={secondaryButtonStyle}
                    >
                      <ChevronLeft size={17} /> Retour
                    </button>
                  )}
                  <span />
                  {editorStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => setEditorStep((editorStep + 1) as 2 | 3)}
                      style={primaryButtonStyle}
                      disabled={
                        editorStep === 1
                          ? !draft.departmentId
                          : assigneesLoading || !personStepComplete
                      }
                    >
                      Continuer <ChevronRight size={17} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      style={primaryButtonStyle}
                      disabled={saving || !taskSelectionComplete || !draft.title.trim()}
                    >
                      {saving ? <Loader2 size={18} className="spin" /> : <Check size={18} />}
                      Créer la tâche
                    </button>
                  )}
                </>
              )}
            </footer>
          </form>
        </GuidedWizard>
      )}

      <TechnicalSheetPickerModal
        open={Boolean(taskSheetPickerMode && editorOpen)}
        items={taskSheetPickerItems}
        selectionMode={taskSheetPickerMode ?? 'sheet'}
        initialSheetId={taskSheetPickerMode === 'step' ? draft.technicalSheetId : ''}
        selectedSheetId={draft.technicalSheetId}
        selectedStepId={draft.technicalSheetStepId}
        title={
          taskSheetPickerMode === 'step'
            ? 'Choisir une recette et une étape'
            : 'Catalogue des fiches techniques'
        }
        subtitle={
          taskSheetPickerMode === 'step'
            ? 'Recherchez la recette, puis sélectionnez l’étape précise à placer sur le planning.'
            : 'Recherchez la recette complète à placer sur le planning opérationnel.'
        }
        onClose={() => setTaskSheetPickerMode(null)}
        onSelectSheet={(item) => {
          selectTechnicalSheet(item.id);
          setTaskSheetPickerMode(null);
        }}
        onSelectStep={(item, step) => {
          selectTechnicalSheetStep(step.id, item.id);
          setTaskSheetPickerMode(null);
        }}
      />

      <div style={{ color: '#64748b', fontSize: '.82rem', textAlign: 'center' }}>
        Connecté en tant que {session.user.firstName || session.user.email}. Les droits
        d’assignation suivent automatiquement l’organigramme RH.
      </div>
    </div>
  );
}

const priorityCopy: Record<
  string,
  { label: string; color: string; background: string; border: string }
> = {
  URGENT: { label: 'Urgent', color: '#be123c', background: '#ffe4e6', border: '#fecdd3' },
  HIGH: { label: 'Haute', color: '#c2410c', background: '#ffedd5', border: '#fed7aa' },
  NORMAL: { label: 'Normale', color: '#1d4ed8', background: '#dbeafe', border: '#bfdbfe' },
  LOW: { label: 'Basse', color: '#475569', background: '#f1f5f9', border: '#e2e8f0' },
};

const productionStatusCopy: Record<
  string,
  { label: string; color: string; background: string; icon: React.ComponentType<{ size?: number }> }
> = {
  DRAFT: { label: 'Brouillon', color: '#475569', background: '#f1f5f9', icon: Circle },
  PROPOSED: { label: 'Proposée', color: '#c2410c', background: '#ffedd5', icon: Sparkles },
  PLANNED: { label: 'Planifiée', color: '#4338ca', background: '#e0e7ff', icon: CalendarDays },
  VALIDATED: { label: 'Validée', color: '#0284c7', background: '#e0f2fe', icon: CheckCircle2 },
  IN_PROGRESS: { label: 'En cours', color: '#1d4ed8', background: '#dbeafe', icon: Play },
  PARTIALLY_COMPLETED: {
    label: 'Partiellement terminée',
    color: '#a16207',
    background: '#fef3c7',
    icon: Clock3,
  },
  COMPLETED: { label: 'Terminée', color: '#047857', background: '#d1fae5', icon: Check },
  BLOCKED: { label: 'Bloquée', color: '#be123c', background: '#ffe4e6', icon: AlertCircle },
  CANCELLED: { label: 'Annulée', color: '#64748b', background: '#f1f5f9', icon: X },
};

function FabricationView({
  token,
  campaigns,
  loading,
  error,
  search,
  status,
  eventFilter,
  onSearch,
  onStatus,
  onClearEvent,
  onRefresh,
  embedded = false,
  periodLabel,
}: {
  token: string;
  campaigns: ProductionCampaign[];
  loading: boolean;
  error: string;
  search: string;
  status: string;
  eventFilter?: { id: string; reference: string; name: string; orderIds: Set<string> };
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onClearEvent: () => void;
  onRefresh: () => void;
  embedded?: boolean;
  periodLabel?: string;
}) {
  const [selected, setSelected] = useState<ProductionCampaign>();
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'kanban'>('table');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [modalTab, setModalTab] = useState<'general' | 'requirements' | 'hr'>('general');
  const [validatingId, setValidatingId] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');

  const visible = useMemo(() => {
    return campaigns.filter((campaign) => {
      if (eventFilter && !eventFilter.orderIds.has(campaign.id)) return false;
      if (status && campaign.status !== status) return false;
      if (priorityFilter && campaign.priority !== priorityFilter) return false;
      const needle = normalizeLabel(search);
      if (!needle) return true;
      const fullText = `${campaign.number} ${campaign.name} ${campaign.technicalSheet?.name ?? ''} ${campaign.site?.name ?? ''}`;
      return normalizeLabel(fullText).includes(needle);
    });
  }, [campaigns, eventFilter, priorityFilter, search, status]);

  const portions = visible.reduce((sum, campaign) => {
    const quantity = campaignQuantity(campaign);
    return quantity.unit === 'portions' ? sum + quantity.value : sum;
  }, 0);
  const kilograms = visible.reduce((sum, campaign) => {
    const quantity = campaignQuantity(campaign);
    return quantity.unit === 'kg' ? sum + quantity.value : sum;
  }, 0);
  const activeCount = visible.filter((campaign) =>
    ['VALIDATED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(campaign.status),
  ).length;
  const completedCount = visible.filter((campaign) => campaign.status === 'COMPLETED').length;
  const plannedCount = visible.filter((campaign) =>
    ['DRAFT', 'PROPOSED', 'PLANNED'].includes(campaign.status),
  ).length;

  const handleValidateCampaign = async (campaign: ProductionCampaign) => {
    setValidatingId(campaign.id);
    setActionError('');
    try {
      await api.validateProductionCampaign(token, campaign.id);
      onRefresh();
      setSelected((prev) => (prev?.id === campaign.id ? { ...prev, status: 'VALIDATED' } : prev));
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setValidatingId('');
    }
  };

  return (
    <div className={embedded ? 'fabrication-details embedded' : 'fabrication-details'}>
      {/* ─── HERO CARD MODERNISÉ ─── */}
      {!embedded && (
        <motion.section
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="production-hero-card"
        >
          <div className="production-hero-glow" />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1.2rem',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div>
              <div className="production-hero-badge">
                <ChefHat size={13} /> FABRICATION & PRODUCTION
              </div>
              <h2 className="production-hero-title">Campagnes de production</h2>
              <p className="production-hero-desc">
                Retrouvez les fabrications générées depuis les événements Traiteur, les menus et les
                fiches techniques. Les équipes RH restent facultatives.
              </p>
            </div>
            <div className="production-hero-actions">
              <button
                type="button"
                className="production-btn-glass"
                onClick={onRefresh}
                disabled={loading}
                title="Rafraîchir les campagnes"
              >
                <RefreshCw size={17} className={loading ? 'spin' : undefined} />
                <span>Actualiser</span>
              </button>
            </div>
          </div>
        </motion.section>
      )}

      {embedded && (
        <div className="fabrication-details-heading">
          <div>
            <span>
              <ListChecks size={15} /> Suivi de fabrication
            </span>
            <h3>Fabrications intégrées au calendrier</h3>
            <p>
              {periodLabel || 'Période sélectionnée'} · événements traiteur, menus et recettes
              libres
            </p>
          </div>
          <button
            type="button"
            className="production-btn-glass"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={17} className={loading ? 'spin' : undefined} />
            Actualiser
          </button>
        </div>
      )}

      {/* ─── ÉVÉNEMENT TRAITEUR ACTIF (Optionnel) ─── */}
      <AnimatePresence>
        {eventFilter && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              ...panelStyle,
              padding: '1rem 1.25rem',
              borderLeft: '4px solid #10b981',
              background: 'linear-gradient(90deg, #ecfdf5 0%, #ffffff 100%)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: '38px',
                  height: '38px',
                  borderRadius: '12px',
                  background: '#10b981',
                  color: 'white',
                }}
              >
                <Utensils size={18} />
              </div>
              <div>
                <div
                  style={{
                    color: '#047857',
                    fontSize: '.72rem',
                    fontWeight: 850,
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  Filtre actif · Événement Traiteur
                </div>
                <strong style={{ fontSize: '1.02rem', color: '#0f172a' }}>
                  {eventFilter.reference} · {eventFilter.name}
                </strong>
                <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: '.1rem' }}>
                  {visible.length} fabrication{visible.length === 1 ? '' : 's'} liée
                  {visible.length === 1 ? '' : 's'} à cet événement
                </div>
              </div>
            </div>
            <button type="button" style={secondaryButtonStyle} onClick={onClearEvent}>
              Afficher toutes les productions
            </button>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ─── DASHBOARD MÉTRIQUES CLIQUEABLES ─── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="production-panel fabrication-tracking-overview"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '.85rem',
          }}
        >
          <div
            className="production-metric-card"
            style={{ cursor: 'pointer', border: !status ? '2px solid #10b981' : undefined }}
            onClick={() => onStatus('')}
          >
            <div
              className="production-metric-icon-wrap"
              style={{ background: '#f1f5f9', color: '#0f172a' }}
            >
              <ListChecks size={18} />
            </div>
            <div>
              <div className="production-metric-val" style={{ color: '#0f172a' }}>
                {visible.length}
              </div>
              <div className="production-metric-lbl">Total productions</div>
            </div>
          </div>

          <div
            className="production-metric-card"
            style={{
              cursor: 'pointer',
              border:
                status === 'PLANNED' || status === 'VALIDATED' ? '2px solid #6366f1' : undefined,
            }}
            onClick={() => onStatus(status === 'VALIDATED' ? '' : 'VALIDATED')}
          >
            <div
              className="production-metric-icon-wrap"
              style={{ background: '#ede9fe', color: '#6366f1' }}
            >
              <CalendarDays size={18} />
            </div>
            <div>
              <div className="production-metric-val" style={{ color: '#4338ca' }}>
                {plannedCount}
              </div>
              <div className="production-metric-lbl">Planifiées / Validées</div>
            </div>
          </div>

          <div
            className="production-metric-card"
            style={{
              cursor: 'pointer',
              border: status === 'IN_PROGRESS' ? '2px solid #2563eb' : undefined,
            }}
            onClick={() => onStatus(status === 'IN_PROGRESS' ? '' : 'IN_PROGRESS')}
          >
            <div
              className="production-metric-icon-wrap"
              style={{ background: '#dbeafe', color: '#1d4ed8' }}
            >
              <Play size={18} />
            </div>
            <div>
              <div className="production-metric-val" style={{ color: '#1d4ed8' }}>
                {activeCount}
              </div>
              <div className="production-metric-lbl">En fabrication</div>
            </div>
          </div>

          <div
            className="production-metric-card"
            style={{
              cursor: 'pointer',
              border: status === 'COMPLETED' ? '2px solid #10b981' : undefined,
            }}
            onClick={() => onStatus(status === 'COMPLETED' ? '' : 'COMPLETED')}
          >
            <div
              className="production-metric-icon-wrap"
              style={{ background: '#d1fae5', color: '#047857' }}
            >
              <Check size={18} />
            </div>
            <div>
              <div className="production-metric-val" style={{ color: '#047857' }}>
                {completedCount}
              </div>
              <div className="production-metric-lbl">Terminées</div>
            </div>
          </div>

          <div
            className="production-metric-card"
            style={{ background: '#faf5ff', border: '1px solid #f3e8ff' }}
          >
            <div
              className="production-metric-icon-wrap"
              style={{ background: '#f3e8ff', color: '#7c3aed' }}
            >
              <ChefHat size={18} />
            </div>
            <div>
              <div className="production-metric-val" style={{ color: '#7c3aed' }}>
                {Math.round(portions).toLocaleString('fr-FR')} port.
                {kilograms > 0
                  ? ` · ${kilograms.toLocaleString('fr-FR', {
                      maximumFractionDigits: 2,
                    })} kg`
                  : ''}
              </div>
              <div className="production-metric-lbl">Quantités planifiées</div>
            </div>
          </div>
        </div>

        {/* ─── BARRE DE FILTRES ET CHANGER DE VUE MODERNISÉE ─── */}
        <div className="fabrication-toolbar-container">
          <div className="fabrication-filters-group">
            {/* Champ de recherche */}
            <div className="fabrication-search-box">
              <Search size={16} color="#64748b" style={{ flexShrink: 0 }} />
              <input
                className="fabrication-search-input"
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Rechercher une recette, un numéro, un site…"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => onSearch('')}
                  style={{
                    border: 0,
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <X size={15} color="#94a3b8" />
                </button>
              )}
            </div>

            {/* Select Statut */}
            <div className="fabrication-select-wrapper">
              <Filter size={15} color="#64748b" style={{ flexShrink: 0 }} />
              <select
                className="fabrication-select-input"
                value={status}
                onChange={(event) => onStatus(event.target.value)}
              >
                <option value="">Tous les statuts</option>
                {Object.entries(productionStatusCopy).map(([val, copy]) => (
                  <option key={val} value={val}>
                    {copy.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                color="#64748b"
                style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }}
              />
            </div>

            {/* Select Priorité */}
            <div className="fabrication-select-wrapper">
              <SlidersHorizontal size={15} color="#64748b" style={{ flexShrink: 0 }} />
              <select
                className="fabrication-select-input"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
              >
                <option value="">Toutes priorités</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">Haute</option>
                <option value="NORMAL">Normale</option>
                <option value="LOW">Basse</option>
              </select>
              <ChevronDown
                size={14}
                color="#64748b"
                style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }}
              />
            </div>
          </div>

          {/* Switcher de Vue (Tableau / Grille / Kanban) */}
          <div className="fabrication-view-switcher">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`fabrication-view-btn${viewMode === 'table' ? ' active' : ''}`}
            >
              <Table size={15} /> Tableau
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`fabrication-view-btn${viewMode === 'grid' ? ' active' : ''}`}
            >
              <LayoutGrid size={15} /> Grille
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`fabrication-view-btn${viewMode === 'kanban' ? ' active' : ''}`}
            >
              <Kanban size={15} /> Kanban
            </button>
          </div>
        </div>
      </motion.section>

      {error ? (
        <div style={errorStyle}>
          <AlertCircle size={19} /> {error}
        </div>
      ) : null}

      {/* ─── CONTENU PRINCIPAL PAR VUE ─── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="production-panel fabrication-tracking-results"
        style={{ padding: viewMode === 'kanban' ? '1rem' : 0, overflow: 'hidden' }}
      >
        {loading ? (
          <div
            style={{
              minHeight: 320,
              display: 'grid',
              placeItems: 'center',
              color: '#64748b',
              fontWeight: 750,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '.75rem',
              }}
            >
              <Loader2 size={28} className="spin" color="#10b981" />
              <span>Chargement des campagnes de fabrication…</span>
            </div>
          </div>
        ) : !visible.length ? (
          <div
            style={{
              minHeight: 300,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              padding: '3rem 1.5rem',
            }}
          >
            <div style={{ maxWidth: 420 }}>
              <div
                style={{
                  display: 'inline-grid',
                  placeItems: 'center',
                  width: '64px',
                  height: '64px',
                  borderRadius: '20px',
                  background: '#f1f5f9',
                  color: '#94a3b8',
                  marginBottom: '1rem',
                }}
              >
                <ChefHat size={32} />
              </div>
              <h3 style={{ margin: '0 0 .4rem', fontSize: '1.2rem', fontWeight: 800 }}>
                Aucune campagne de production trouvée
              </h3>
              <p className="muted" style={{ margin: 0, fontSize: '.9rem', lineHeight: 1.5 }}>
                Générez une fabrication depuis un événement Traiteur, un menu planifié ou une fiche
                technique, ou ajustez vos critères de recherche.
              </p>
              {(search || status || priorityFilter) && (
                <button
                  type="button"
                  style={{ ...secondaryButtonStyle, marginTop: '1.1rem' }}
                  onClick={() => {
                    onSearch('');
                    onStatus('');
                    setPriorityFilter('');
                  }}
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          </div>
        ) : viewMode === 'table' ? (
          /* ─── VUE TABLEAU MODERNISÉE ─── */
          <div style={{ overflowX: 'auto' }}>
            <table className="table-modern" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Campagne / Ref</th>
                  <th>Production & Recette</th>
                  <th>Site</th>
                  <th>Quantité</th>
                  <th>Priorité</th>
                  <th>Statut</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((campaign) => {
                  const statusInfo = productionStatusCopy[campaign.status] ?? {
                    label: campaign.status,
                    color: '#475569',
                    background: '#f1f5f9',
                    icon: Circle,
                  };
                  const priorityInfo = priorityCopy[campaign.priority] ?? priorityCopy.NORMAL;
                  const StatusIcon = statusInfo.icon;
                  const sheetName = campaign.technicalSheet?.name;

                  return (
                    <tr key={campaign.id} className="fabrication-table-row">
                      <td>
                        <div style={{ fontWeight: 850, color: '#0f172a', fontSize: '.92rem' }}>
                          {campaign.number}
                        </div>
                        <div
                          className="muted"
                          style={{
                            fontSize: '.76rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '.35rem',
                            marginTop: '.15rem',
                          }}
                        >
                          <Clock3 size={13} color="#94a3b8" />
                          <span>
                            {new Date(campaign.productionDate).toLocaleDateString('fr-FR')}{' '}
                            {campaign.plannedTime ? `à ${campaign.plannedTime}` : ''}
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong style={{ fontSize: '.94rem', color: '#0f172a' }}>
                          {campaign.name}
                        </strong>
                        {sheetName && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '.35rem',
                              marginTop: '.2rem',
                              color: '#047857',
                              fontSize: '.8rem',
                              fontWeight: 650,
                            }}
                          >
                            <ChefHat size={13} /> {sheetName}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.35rem',
                            padding: '.25rem .6rem',
                            borderRadius: '8px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            color: '#334155',
                            fontSize: '.78rem',
                            fontWeight: 700,
                          }}
                        >
                          <Building2 size={13} color="#64748b" />
                          {campaign.site?.name ?? 'Site non renseigné'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 850, fontSize: '.95rem', color: '#0f172a' }}>
                          {campaignQuantity(campaign).value.toLocaleString('fr-FR', {
                            maximumFractionDigits: 3,
                          })}{' '}
                          <span style={{ fontSize: '.78rem', color: '#64748b', fontWeight: 600 }}>
                            {campaignQuantity(campaign).unit}
                          </span>
                        </div>
                        {campaign.requirements?.length ? (
                          <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: '.1rem' }}>
                            {campaign.requirements.length} ingrédient
                            {campaign.requirements.length > 1 ? 's' : ''}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.3rem',
                            padding: '.22rem .55rem',
                            borderRadius: '999px',
                            color: priorityInfo.color,
                            background: priorityInfo.background,
                            border: `1px solid ${priorityInfo.border}`,
                            fontSize: '.72rem',
                            fontWeight: 800,
                          }}
                        >
                          {priorityInfo.label}
                        </span>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.4rem',
                            color: statusInfo.color,
                            background: statusInfo.background,
                            padding: '.35rem .75rem',
                            borderRadius: '999px',
                            fontWeight: 800,
                            fontSize: '.76rem',
                          }}
                        >
                          <StatusIcon size={14} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="production-btn-primary"
                          style={{
                            minHeight: '36px',
                            padding: '.45rem .85rem',
                            fontSize: '.8rem',
                            borderRadius: '10px',
                          }}
                          onClick={() => {
                            setSelected(campaign);
                            setModalTab('general');
                          }}
                        >
                          <Eye size={14} /> Consulter
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'grid' ? (
          /* ─── VUE GRILLE MODERNISÉE ─── */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1.1rem',
              padding: '1.25rem',
            }}
          >
            {visible.map((campaign) => {
              const statusInfo = productionStatusCopy[campaign.status] ?? {
                label: campaign.status,
                color: '#475569',
                background: '#f1f5f9',
                icon: Circle,
              };
              const priorityInfo = priorityCopy[campaign.priority] ?? priorityCopy.NORMAL;
              const StatusIcon = statusInfo.icon;
              const sheetName = campaign.technicalSheet?.name;

              return (
                <div key={campaign.id} className="fabrication-campaign-card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '.5rem',
                      alignItems: 'center',
                      marginBottom: '.75rem',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '.75rem',
                        fontWeight: 850,
                        color: '#64748b',
                        letterSpacing: '.04em',
                      }}
                    >
                      {campaign.number}
                    </span>
                    <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                      <span
                        style={{
                          padding: '.2rem .5rem',
                          borderRadius: '999px',
                          color: priorityInfo.color,
                          background: priorityInfo.background,
                          fontSize: '.68rem',
                          fontWeight: 800,
                        }}
                      >
                        {priorityInfo.label}
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.3rem',
                          padding: '.2rem .55rem',
                          borderRadius: '999px',
                          color: statusInfo.color,
                          background: statusInfo.background,
                          fontSize: '.7rem',
                          fontWeight: 800,
                        }}
                      >
                        <StatusIcon size={12} />
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>

                  <h3
                    style={{
                      margin: '0 0 .4rem',
                      fontSize: '1.05rem',
                      fontWeight: 800,
                      color: '#0f172a',
                      lineHeight: 1.3,
                    }}
                  >
                    {campaign.name}
                  </h3>

                  {sheetName && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '.4rem',
                        color: '#047857',
                        background: '#ecfdf5',
                        padding: '.35rem .65rem',
                        borderRadius: '10px',
                        fontSize: '.8rem',
                        fontWeight: 700,
                        marginBottom: '.85rem',
                      }}
                    >
                      <ChefHat size={14} />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {sheetName}
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '.6rem',
                      padding: '.75rem',
                      background: '#f8fafc',
                      borderRadius: '13px',
                      marginBottom: '1rem',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '.7rem',
                          color: '#64748b',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        Quantité
                      </div>
                      <div
                        style={{
                          fontSize: '1rem',
                          fontWeight: 850,
                          color: '#0f172a',
                          marginTop: '.1rem',
                        }}
                      >
                        {campaignQuantity(campaign).value.toLocaleString('fr-FR', {
                          maximumFractionDigits: 3,
                        })}{' '}
                        {campaignQuantity(campaign).unit}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '.7rem',
                          color: '#64748b',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        Date & Heure
                      </div>
                      <div
                        style={{
                          fontSize: '.84rem',
                          fontWeight: 750,
                          color: '#334155',
                          marginTop: '.1rem',
                        }}
                      >
                        {new Date(campaign.productionDate).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        {campaign.plannedTime || ''}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '.5rem',
                      marginTop: 'auto',
                      paddingTop: '.65rem',
                      borderTop: '1px solid #f1f5f9',
                    }}
                  >
                    <span
                      style={{
                        color: '#64748b',
                        fontSize: '.78rem',
                        fontWeight: 650,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '.35rem',
                      }}
                    >
                      <Building2 size={14} /> {campaign.site?.name ?? 'Site non défini'}
                    </span>
                    <button
                      type="button"
                      style={{
                        ...secondaryButtonStyle,
                        minHeight: '34px',
                        padding: '.4rem .75rem',
                        fontSize: '.78rem',
                      }}
                      onClick={() => {
                        setSelected(campaign);
                        setModalTab('general');
                      }}
                    >
                      <Eye size={14} /> Détails
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ─── VUE KANBAN MODERNISÉE ─── */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {[
              {
                title: 'À Planifier / Validées',
                statuses: ['DRAFT', 'PROPOSED', 'PLANNED', 'VALIDATED'],
                color: '#4338ca',
                bg: '#e0e7ff',
              },
              {
                title: 'En Fabrication',
                statuses: ['IN_PROGRESS', 'PARTIALLY_COMPLETED'],
                color: '#1d4ed8',
                bg: '#dbeafe',
              },
              {
                title: 'Terminées & Historique',
                statuses: ['COMPLETED', 'BLOCKED', 'CANCELLED'],
                color: '#047857',
                bg: '#d1fae5',
              },
            ].map((col) => {
              const colCampaigns = visible.filter((item) => col.statuses.includes(item.status));
              return (
                <div
                  key={col.title}
                  style={{
                    background: '#f8fafc',
                    borderRadius: '18px',
                    border: '1px solid #e2e8f0',
                    padding: '.9rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '.75rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingBottom: '.6rem',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    <strong style={{ fontSize: '.92rem', color: '#0f172a' }}>{col.title}</strong>
                    <span
                      style={{
                        background: col.bg,
                        color: col.color,
                        borderRadius: '999px',
                        padding: '.2rem .6rem',
                        fontSize: '.75rem',
                        fontWeight: 850,
                      }}
                    >
                      {colCampaigns.length}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.65rem', flex: 1 }}>
                    {!colCampaigns.length ? (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '2rem 1rem',
                          color: '#94a3b8',
                          fontSize: '.82rem',
                          fontWeight: 650,
                        }}
                      >
                        Aucune fabrication dans cette colonne
                      </div>
                    ) : (
                      colCampaigns.map((campaign) => {
                        const statusInfo = productionStatusCopy[campaign.status] ?? {
                          label: campaign.status,
                          color: '#475569',
                          background: '#f1f5f9',
                          icon: Circle,
                        };
                        const StatusIcon = statusInfo.icon;

                        return (
                          <div
                            key={campaign.id}
                            className="fabrication-campaign-card"
                            style={{ padding: '.85rem' }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '.4rem',
                                alignItems: 'center',
                              }}
                            >
                              <span
                                style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b' }}
                              >
                                {campaign.number}
                              </span>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '.25rem',
                                  padding: '.15rem .45rem',
                                  borderRadius: '999px',
                                  background: statusInfo.background,
                                  color: statusInfo.color,
                                  fontSize: '.68rem',
                                  fontWeight: 800,
                                }}
                              >
                                <StatusIcon size={11} /> {statusInfo.label}
                              </span>
                            </div>

                            <strong
                              style={{
                                display: 'block',
                                margin: '.35rem 0 .2rem',
                                fontSize: '.9rem',
                                color: '#0f172a',
                              }}
                            >
                              {campaign.name}
                            </strong>

                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '.78rem',
                                color: '#475569',
                                marginTop: '.5rem',
                              }}
                            >
                              <span>
                                <strong>
                                  {campaignQuantity(campaign).value.toLocaleString('fr-FR', {
                                    maximumFractionDigits: 3,
                                  })}
                                </strong>{' '}
                                {campaignQuantity(campaign).unit}
                              </span>
                              <button
                                type="button"
                                style={{
                                  ...secondaryButtonStyle,
                                  minHeight: '30px',
                                  padding: '.25rem .55rem',
                                  fontSize: '.74rem',
                                  borderRadius: '8px',
                                }}
                                onClick={() => {
                                  setSelected(campaign);
                                  setModalTab('general');
                                }}
                              >
                                Vue
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>

      {/* ─── MODAL DE DÉTAILS MODERNISÉ ("CONSULTER") ─── */}
      <AnimatePresence>
        {selected && (
          <div
            style={overlayStyle}
            role="presentation"
            onMouseDown={(event) => event.target === event.currentTarget && setSelected(undefined)}
          >
            <motion.section
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              transition={{ duration: 0.22 }}
              style={{ ...modalStyle, width: 'min(840px, 100%)', borderRadius: '26px' }}
            >
              {/* Header Modal */}
              <header
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  borderBottom: '1px solid #f1f5f9',
                  paddingBottom: '1rem',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.5rem',
                      marginBottom: '.3rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '.78rem',
                        fontWeight: 850,
                        color: '#10b981',
                        letterSpacing: '.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {selected.number}
                    </span>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '.3rem',
                        padding: '.2rem .55rem',
                        borderRadius: '999px',
                        color: (productionStatusCopy[selected.status] ?? productionStatusCopy.DRAFT)
                          .color,
                        background: (
                          productionStatusCopy[selected.status] ?? productionStatusCopy.DRAFT
                        ).background,
                        fontSize: '.72rem',
                        fontWeight: 800,
                      }}
                    >
                      {(productionStatusCopy[selected.status] ?? productionStatusCopy.DRAFT).label}
                    </span>
                    <span
                      style={{
                        padding: '.2rem .55rem',
                        borderRadius: '999px',
                        color: (priorityCopy[selected.priority] ?? priorityCopy.NORMAL).color,
                        background: (priorityCopy[selected.priority] ?? priorityCopy.NORMAL)
                          .background,
                        fontSize: '.72rem',
                        fontWeight: 800,
                      }}
                    >
                      Priorité {(priorityCopy[selected.priority] ?? priorityCopy.NORMAL).label}
                    </span>
                  </div>
                  <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#0f172a' }}>
                    {selected.name}
                  </h2>
                  <div
                    style={{
                      color: '#64748b',
                      fontSize: '.84rem',
                      marginTop: '.2rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.4rem',
                    }}
                  >
                    <Clock3 size={14} /> Planifiée pour le{' '}
                    {new Date(selected.productionDate).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}{' '}
                    {selected.plannedTime ? `à ${selected.plannedTime}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  style={iconButtonStyle}
                  onClick={() => setSelected(undefined)}
                >
                  <X size={18} />
                </button>
              </header>

              {/* Barre d'onglets du Modal */}
              <div
                style={{
                  display: 'flex',
                  gap: '.5rem',
                  borderBottom: '1px solid #e2e8f0',
                  marginTop: '1rem',
                }}
              >
                <button
                  type="button"
                  className={`fabrication-modal-tab${modalTab === 'general' ? ' active' : ''}`}
                  onClick={() => setModalTab('general')}
                >
                  <FileText size={15} /> Aperçu Général
                </button>
                <button
                  type="button"
                  className={`fabrication-modal-tab${modalTab === 'requirements' ? ' active' : ''}`}
                  onClick={() => setModalTab('requirements')}
                >
                  <Package size={15} /> Ingrédients & Besoins ({selected.requirements?.length ?? 0})
                </button>
                <button
                  type="button"
                  className={`fabrication-modal-tab${modalTab === 'hr' ? ' active' : ''}`}
                  onClick={() => setModalTab('hr')}
                >
                  <Users size={15} /> Équipes RH (Facultatives)
                </button>
              </div>

              {actionError && (
                <div style={{ ...errorStyle, marginTop: '1rem' }}>
                  <AlertCircle size={18} /> {actionError}
                </div>
              )}

              {/* Contenu Onglet 1: Aperçu Général */}
              {modalTab === 'general' && (
                <div
                  style={{
                    marginTop: '1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                      gap: '.75rem',
                    }}
                  >
                    <DetailCard
                      label="Recette de base"
                      value={selected.technicalSheet?.name ?? 'Fiche personnalisée'}
                    />
                    <DetailCard
                      label="Quantité planifiée"
                      value={`${campaignQuantity(selected).value.toLocaleString('fr-FR', {
                        maximumFractionDigits: 3,
                      })} ${campaignQuantity(selected).unit}`}
                    />
                    <DetailCard
                      label="Site de fabrication"
                      value={selected.site?.name ?? 'Non assigné'}
                    />
                    <DetailCard
                      label="Source de création"
                      value={
                        selected.source === 'CATERER'
                          ? 'Événement Traiteur'
                          : selected.source === 'MENU'
                            ? 'Menu Planifié'
                            : 'Fiche Technique'
                      }
                    />
                  </div>

                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: '16px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '.6rem',
                    }}
                  >
                    <strong
                      style={{
                        fontSize: '.9rem',
                        color: '#0f172a',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '.4rem',
                      }}
                    >
                      <ShieldCheck size={16} color="#10b981" /> Statut des lots d'exécution mobile
                    </strong>
                    <p style={{ margin: 0, color: '#475569', fontSize: '.84rem', lineHeight: 1.5 }}>
                      {selected.batches?.length
                        ? `${selected.batches.length} lot(s) mobile(s) prêt(s) ou en cours d'exécution sur tablette.`
                        : 'Cette campagne peut être synchronisée avec les tablettes en cuisine dès sa validation.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Contenu Onglet 2: Besoins Matières */}
              {modalTab === 'requirements' && (
                <div style={{ marginTop: '1.1rem' }}>
                  <h3
                    style={{
                      margin: '0 0 .8rem',
                      fontSize: '1.05rem',
                      fontWeight: 800,
                      color: '#0f172a',
                    }}
                  >
                    Matières premières et ingrédients requis
                  </h3>
                  {selected.requirements?.length ? (
                    <div
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        overflow: 'hidden',
                      }}
                    >
                      <table className="table-modern" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Ingrédient / Produit</th>
                            <th style={{ textAlign: 'right' }}>Quantité nécessaire</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.requirements.map((req) => (
                            <tr key={req.id}>
                              <td>
                                <strong>
                                  {req.productNameSnapshot ?? req.product?.name ?? 'Produit'}
                                </strong>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <strong style={{ color: '#047857', fontSize: '.95rem' }}>
                                  {Number(req.requiredQuantity).toLocaleString('fr-FR')}{' '}
                                  {req.unitSymbolSnapshot ?? req.unit?.symbol ?? ''}
                                </strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p
                      className="muted"
                      style={{
                        padding: '1rem',
                        background: '#f8fafc',
                        borderRadius: '14px',
                        border: '1px solid #e2e8f0',
                        margin: 0,
                      }}
                    >
                      Les besoins matières seront calculés et verrouillés lors de la validation
                      finale de la campagne.
                    </p>
                  )}
                </div>
              )}

              {/* Contenu Onglet 3: Équipes RH */}
              {modalTab === 'hr' && (
                <div
                  style={{
                    marginTop: '1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}
                >
                  <div
                    style={{
                      padding: '1.1rem',
                      borderRadius: '18px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      color: '#166534',
                    }}
                  >
                    <strong
                      style={{
                        display: 'block',
                        fontSize: '.95rem',
                        marginBottom: '.3rem',
                        color: '#14532d',
                      }}
                    >
                      Équipes RH optionnelles
                    </strong>
                    <p style={{ margin: 0, fontSize: '.88rem', lineHeight: 1.5 }}>
                      Retrouvez les fabrications générées depuis les événements Traiteur, les menus
                      et les fiches techniques. Les équipes RH restent facultatives. Vous pouvez
                      exploiter vos fabrications librement ou affecter un service/responsable si
                      votre module RH est configuré.
                    </p>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '.85rem',
                    }}
                  >
                    <DetailCard
                      label="Service RH affecté"
                      value={selected.service?.name ?? 'Aucun service restreint'}
                    />
                    <DetailCard
                      label="Responsable désigné"
                      value={
                        selected.responsibleEmployeeId
                          ? 'Collaborateur affecté'
                          : 'Non assigné (Libre)'
                      }
                    />
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <footer
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  marginTop: '1.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <button type="button" style={secondaryButtonStyle} onClick={() => window.print()}>
                  <Printer size={16} /> Imprimer la fiche
                </button>
                <div style={{ display: 'flex', gap: '.65rem' }}>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => setSelected(undefined)}
                  >
                    Fermer
                  </button>
                  {['DRAFT', 'PROPOSED', 'PLANNED'].includes(selected.status) && (
                    <button
                      type="button"
                      style={primaryButtonStyle}
                      disabled={validatingId === selected.id}
                      onClick={() => void handleValidateCampaign(selected)}
                    >
                      {validatingId === selected.id ? (
                        <Loader2 size={16} className="spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Valider la campagne
                    </button>
                  )}
                </div>
              </footer>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '.8rem',
        borderRadius: 13,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
      }}
    >
      <div
        style={{ color: '#64748b', fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase' }}
      >
        {label}
      </div>
      <strong style={{ display: 'block', marginTop: '.3rem' }}>{value}</strong>
    </div>
  );
}

function ProductionPlanningQueue({
  tasks,
  busyId,
  onEdit,
  onSplit,
}: {
  tasks: OperationalTask[];
  busyId: string;
  onEdit: (task: OperationalTask) => void;
  onSplit: (task: OperationalTask) => void;
}) {
  const recipeGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string;
        name: string;
        tasks: OperationalTask[];
      }
    >();

    tasks.forEach((task) => {
      const id =
        task.productionBatch?.order.id ??
        task.productionBatchId ??
        task.technicalSheetId ??
        task.id;
      const current = groups.get(id);
      const name = task.technicalSheet?.name ?? task.productionBatch?.order.name ?? task.title;
      if (current) {
        current.tasks.push(task);
      } else {
        groups.set(id, { id, name, tasks: [task] });
      }
    });

    return Array.from(groups.values()).map((group) => ({
      ...group,
      tasks: group.tasks.sort((left, right) => {
        const leftOrder =
          left.technicalSheetStep?.order ??
          (left.productionOperation ? left.productionOperation.position + 1 : 0);
        const rightOrder =
          right.technicalSheetStep?.order ??
          (right.productionOperation ? right.productionOperation.position + 1 : 0);
        return leftOrder - rightOrder;
      }),
    }));
  }, [tasks]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="production-planning-queue"
    >
      <div className="production-planning-queue-heading">
        <div>
          <span>
            <ChefHat size={16} /> Fabrications à organiser
          </span>
          <h3>À placer sur le planning</h3>
          <p>Glissez la recette entière ou une étape sur l’heure souhaitée.</p>
        </div>
        <strong>
          {recipeGroups.length} recette{recipeGroups.length > 1 ? 's' : ''}
        </strong>
      </div>
      <div className="production-planning-recipe-list">
        {recipeGroups.map((group) => {
          const recipeTask = group.tasks.find((task) => !task.technicalSheetStepId);
          const referenceTask = recipeTask ?? group.tasks[0];
          const stepCount = productionStepCount(referenceTask);
          return (
            <article key={group.id} className="production-planning-recipe">
              <div className="production-planning-recipe-heading">
                <div>
                  <span>Recette</span>
                  <h4>{group.name}</h4>
                  <p>
                    {referenceTask.quantity != null && (
                      <>
                        {String(referenceTask.quantity)} {referenceTask.unitLabel ?? ''}
                        {' · '}
                      </>
                    )}
                    {taskTeamLabel(referenceTask)}
                  </p>
                </div>
                {recipeTask && canSplitProductionRecipe(recipeTask) && (
                  <button
                    type="button"
                    className="production-planning-split-button"
                    disabled={busyId === recipeTask.id}
                    onClick={() => onSplit(recipeTask)}
                  >
                    {busyId === recipeTask.id ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Scissors size={14} />
                    )}
                    {stepCount} étapes
                  </button>
                )}
              </div>

              <div className="production-planning-recipe-tasks">
                {group.tasks.map((task) => {
                  const isStep = Boolean(task.technicalSheetStepId || task.productionOperationId);
                  const stepOrder =
                    task.technicalSheetStep?.order ??
                    (task.productionOperation ? task.productionOperation.position + 1 : undefined);
                  const taskLabel = isStep
                    ? (task.technicalSheetStep?.title ??
                      task.productionOperation?.title ??
                      task.title.split(' · ')[0])
                    : 'Recette entière';
                  const duration = Math.max(
                    5,
                    Math.round(
                      (new Date(task.endsAt).getTime() - new Date(task.startsAt).getTime()) /
                        60_000,
                    ),
                  );
                  return (
                    <div
                      key={task.id}
                      className={`production-planning-compact-task${
                        isStep ? ' is-step' : ' is-recipe'
                      }`}
                      draggable={Boolean(task.productionBatchId)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'application/x-toquehub-production-task',
                          task.id,
                        );
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                    >
                      <div className="production-planning-compact-task-top">
                        <span>
                          {isStep ? `Étape ${stepOrder ?? '—'}/${stepCount}` : 'Ensemble'}
                        </span>
                        <GripVertical size={14} />
                      </div>
                      <strong title={taskLabel}>{taskLabel}</strong>
                      <div className="production-planning-compact-task-footer">
                        <span>
                          <Clock3 size={12} /> {duration} min
                        </span>
                        <button
                          type="button"
                          aria-label={`Choisir la date et l’heure pour ${taskLabel}`}
                          title="Choisir la date et l’heure"
                          onClick={() => onEdit(task)}
                        >
                          <CalendarDays size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      <div className="production-planning-queue-help">
        <GripVertical size={16} />
        Glissez un bloc sur l’heure de démarrage.
      </div>
    </motion.section>
  );
}

function DayColumn({
  day,
  tasks,
  today: isToday,
  compact,
  onCreate,
  onEdit,
  onMoveTask,
}: {
  day: string;
  tasks: OperationalTask[];
  today: boolean;
  compact: boolean;
  onCreate: () => void;
  onEdit: (task: OperationalTask) => void;
  onMoveTask: (taskId: string, day: string, startMinute?: number) => void;
}) {
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes('application/x-toquehub-production-task')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const taskId = event.dataTransfer.getData('application/x-toquehub-production-task');
    if (!taskId) return;
    event.preventDefault();
    onMoveTask(taskId, day);
  }

  return (
    <div
      className={`production-day-col${isToday ? ' is-today' : ''}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="production-day-header">
        <div>
          <div
            style={{
              fontWeight: 800,
              fontSize: compact ? '.92rem' : '1.08rem',
              color: isToday ? '#065f46' : '#0f172a',
            }}
          >
            {formatDay(
              day,
              compact ? { weekday: 'short', day: 'numeric', month: 'short' } : undefined,
            )}
          </div>
          <div
            style={{
              color: isToday ? '#047857' : '#64748b',
              fontSize: '.74rem',
              fontWeight: 600,
              marginTop: '.1rem',
            }}
          >
            {tasks.length} tâche{tasks.length === 1 ? '' : 's'}
            {isToday ? ' · Aujourd’hui' : ''}
          </div>
        </div>
        <button
          type="button"
          aria-label="Ajouter une tâche"
          onClick={onCreate}
          style={{
            ...iconButtonStyle,
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: isToday ? '#ffffff' : '#f1f5f9',
            borderColor: isToday ? '#a7f3d0' : '#e2e8f0',
          }}
        >
          <Plus size={16} color={isToday ? '#059669' : '#475569'} />
        </button>
      </div>
      {compact ? (
        tasks.length ? (
          <div style={{ display: 'grid', gap: '.65rem', flex: 1, alignContent: 'start' }}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onEdit={() => onEdit(task)} />
            ))}
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <button type="button" onClick={onCreate} className="production-empty-day-btn">
              <Plus size={18} />
              <span>Planifier une tâche</span>
            </button>
          </div>
        )
      ) : (
        <DayTimeline day={day} tasks={tasks} onEdit={onEdit} onMoveTask={onMoveTask} />
      )}
    </div>
  );
}

function DayTimeline({
  day,
  tasks,
  onEdit,
  onMoveTask,
}: {
  day: string;
  tasks: OperationalTask[];
  onEdit: (task: OperationalTask) => void;
  onMoveTask: (taskId: string, day: string, startMinute: number) => void;
}) {
  const [dragPreviewMinute, setDragPreviewMinute] = useState<number | null>(null);
  const layout = buildTimelineLayout(tasks, day);
  const firstMinute = layout.length
    ? Math.min(
        TIMELINE_DEFAULT_START,
        Math.floor(Math.min(...layout.map((entry) => entry.startMinute)) / 60) * 60,
      )
    : TIMELINE_DEFAULT_START;
  const lastMinute = Math.min(
    24 * 60,
    Math.max(
      TIMELINE_DEFAULT_END,
      layout.length
        ? Math.ceil(Math.max(...layout.map((entry) => entry.visualEndMinute)) / 60) * 60
        : TIMELINE_DEFAULT_END,
    ),
  );
  const timelineHeight = ((lastMinute - firstMinute) / 60) * TIMELINE_HOUR_HEIGHT;
  const hourMarks = Array.from(
    { length: Math.floor((lastMinute - firstMinute) / 60) + 1 },
    (_, index) => firstMinute + index * 60,
  );
  const quarterMarks = Array.from(
    { length: Math.floor((lastMinute - firstMinute) / 15) + 1 },
    (_, index) => firstMinute + index * 15,
  );

  function pointerMinute(event: DragEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.min(bounds.height, Math.max(0, event.clientY - bounds.top));
    const rawMinute =
      firstMinute + (relativeY / Math.max(1, bounds.height)) * (lastMinute - firstMinute);
    return Math.min(lastMinute - 15, Math.max(firstMinute, Math.round(rawMinute / 15) * 15));
  }

  return (
    <div className="production-day-timeline">
      <div className="production-time-rail" style={{ height: `${timelineHeight}px` }}>
        {quarterMarks
          .filter((minute) => minute % 60 !== 0)
          .map((minute) => (
            <span
              key={`tick-${minute}`}
              className={`production-quarter-tick${minute % 30 === 0 ? ' is-half' : ''}`}
              style={{ top: `${((minute - firstMinute) / 60) * TIMELINE_HOUR_HEIGHT}px` }}
            />
          ))}
        {hourMarks.map((minute, index) => (
          <span
            key={minute}
            className={`production-time-label${index === 0 ? ' first' : index === hourMarks.length - 1 ? ' last' : ''}`}
            style={{ top: `${((minute - firstMinute) / 60) * TIMELINE_HOUR_HEIGHT}px` }}
          >
            {formatTimelineMinute(minute)}
          </span>
        ))}
        {dragPreviewMinute != null && (
          <span
            className="production-drag-time-marker"
            style={{
              top: `${((dragPreviewMinute - firstMinute) / 60) * TIMELINE_HOUR_HEIGHT}px`,
            }}
          >
            {formatTimelineMinute(dragPreviewMinute)}
          </span>
        )}
      </div>
      <div
        className="production-timeline-canvas"
        style={{ height: `${timelineHeight}px` }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('application/x-toquehub-production-task')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDragPreviewMinute(pointerMinute(event));
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragPreviewMinute(null);
          }
        }}
        onDrop={(event) => {
          const taskId = event.dataTransfer.getData('application/x-toquehub-production-task');
          if (!taskId) return;
          event.preventDefault();
          event.stopPropagation();
          const startMinute = pointerMinute(event);
          setDragPreviewMinute(null);
          onMoveTask(taskId, day, startMinute);
        }}
      >
        {quarterMarks.map((minute) => (
          <span
            key={minute}
            className={`production-quarter-line${
              minute % 60 === 0 ? ' is-hour' : minute % 30 === 0 ? ' is-half' : ''
            }`}
            style={{ top: `${((minute - firstMinute) / 60) * TIMELINE_HOUR_HEIGHT}px` }}
          />
        ))}
        {dragPreviewMinute != null && (
          <div
            className="production-drop-preview"
            style={{
              top: `${((dragPreviewMinute - firstMinute) / 60) * TIMELINE_HOUR_HEIGHT}px`,
              height: `${TIMELINE_HOUR_HEIGHT / 4}px`,
            }}
          >
            <span>Départ {formatTimelineMinute(dragPreviewMinute)} · créneau de 15 min</span>
          </div>
        )}
        {layout.map((entry) => {
          const laneWidth = 100 / entry.laneCount;
          const top = ((entry.startMinute - firstMinute) / 60) * TIMELINE_HOUR_HEIGHT;
          const height = ((entry.visualEndMinute - entry.startMinute) / 60) * TIMELINE_HOUR_HEIGHT;
          return (
            <div
              key={entry.task.id}
              className="production-timeline-task"
              style={{
                top: `${top + 5}px`,
                height: `${Math.max(64, height - 8)}px`,
                left: `calc(${entry.lane * laneWidth}% + 8px)`,
                width: `calc(${laneWidth}% - 12px)`,
              }}
            >
              <TimelineTaskCard
                task={entry.task}
                dense={entry.laneCount >= 4}
                onEdit={() => onEdit(entry.task)}
              />
            </div>
          );
        })}
        {layout.length === 0 && (
          <div className="production-timeline-empty-hint">
            <GripVertical size={20} />
            <strong>Déposez ici une recette ou une étape</strong>
            <span>Choisissez précisément son heure de démarrage.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineTaskCard({
  task,
  dense,
  onEdit,
}: {
  task: OperationalTask;
  dense: boolean;
  onEdit: () => void;
}) {
  return (
    <article
      className={`production-timeline-task-card${dense ? ' is-dense' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Modifier ${task.title}`}
      title={`${task.title} — cliquer pour modifier`}
      draggable={Boolean(task.source === 'PRODUCTION' && task.productionBatchId)}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit();
        }
      }}
      onDragStart={(event) => {
        if (!task.productionBatchId) return;
        event.dataTransfer.setData('application/x-toquehub-production-task', task.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <span
        className="production-task-accent-bar"
        style={{ background: categoryColor[task.category] }}
      />
      <div className="production-timeline-task-main">
        <div className="production-timeline-task-topline">
          <span className="production-timeline-task-time">
            <Clock3 size={13} /> {formatTime(task.startsAt)}–{formatTime(task.endsAt)}
          </span>
        </div>
        <strong>{task.title}</strong>
        <span className="production-timeline-task-meta">
          {[taskSiteName(task), task.department?.name, taskTeamLabel(task)]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
    </article>
  );
}

function TaskCard({ task, onEdit }: { task: OperationalTask; onEdit: () => void }) {
  return (
    <article
      className="production-task-card-v2"
      role="button"
      tabIndex={0}
      aria-label={`Modifier ${task.title}`}
      title={`${task.title} — cliquer pour modifier`}
      draggable={Boolean(task.source === 'PRODUCTION' && task.productionBatchId)}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit();
        }
      }}
      onDragStart={(event) => {
        if (!task.productionBatchId) return;
        event.dataTransfer.setData('application/x-toquehub-production-task', task.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <div
        className="production-task-accent-bar"
        style={{ background: categoryColor[task.category] }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            gap: '.35rem',
            alignItems: 'center',
            color: '#64748b',
            fontSize: '.72rem',
            fontWeight: 800,
          }}
        >
          {task.source === 'PRODUCTION' && task.productionBatchId && (
            <GripVertical size={13} color="#94a3b8" />
          )}
          <Clock3 size={13} color="#94a3b8" /> {formatTime(task.startsAt)}–{formatTime(task.endsAt)}
        </div>
        <h4
          style={{
            margin: '.25rem 0 .15rem',
            fontSize: '.92rem',
            fontWeight: 750,
            color: '#0f172a',
            lineHeight: 1.3,
          }}
        >
          {task.title}
        </h4>
      </div>
      <div style={{ color: '#64748b', fontSize: '.74rem', fontWeight: 600, marginTop: '.1rem' }}>
        {[taskSiteName(task), task.department?.name ?? 'Service', taskTeamLabel(task)]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {task.technicalSheet && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '.3rem',
            marginTop: '.4rem',
            color: '#047857',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: '999px',
            padding: '.2rem .5rem',
            fontSize: '.68rem',
            fontWeight: 800,
          }}
        >
          <ChefHat size={12} />{' '}
          {task.technicalSheetStep
            ? `Étape ${task.technicalSheetStep.order} · ${task.technicalSheetStep.title}`
            : 'Fiche complète'}
        </div>
      )}
      {task.technicalSheet && (
        <div
          style={{
            marginTop: '.3rem',
            color: task.productionBatchId ? '#047857' : '#b45309',
            fontSize: '.68rem',
            fontWeight: 750,
          }}
        >
          {task.productionBatchId
            ? `Lot mobile lié${task.productionBatch?.reference ? ` · ${task.productionBatch.reference}` : ''}`
            : 'Lot mobile non lié'}
        </div>
      )}
      {task.quantity != null && (
        <div style={{ marginTop: '.3rem', fontSize: '.74rem', fontWeight: 800, color: '#334155' }}>
          {String(task.quantity)} {task.unitLabel ?? ''}
        </div>
      )}
      {!task.planningAssignmentId && task.assignedEmployeeId && (
        <div
          style={{
            display: 'flex',
            gap: '.25rem',
            alignItems: 'center',
            color: '#b45309',
            fontSize: '.68rem',
            marginTop: '.35rem',
            fontWeight: 700,
          }}
        >
          <AlertCircle size={12} /> Hors créneau Planning
        </div>
      )}
    </article>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  color = '#0f172a',
  bg = '#f8fafc',
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color?: string;
  bg?: string;
}) {
  return (
    <div className="production-metric-card">
      <div className="production-metric-icon-wrap" style={{ background: bg, color }}>
        <Icon size={18} />
      </div>
      <div>
        <div className="production-metric-val" style={{ color }}>
          {value}
        </div>
        <div className="production-metric-lbl">{label}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: 'grid',
        gap: '.38rem',
        color: '#334155',
        fontSize: '.82rem',
        fontWeight: 850,
      }}
    >
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

function OperationalTaskWizardSidebar({
  step,
  editing,
  siteName,
  departmentName,
  assigneeName,
  taskName,
}: {
  step: 1 | 2 | 3;
  editing: boolean;
  siteName?: string;
  departmentName?: string;
  assigneeName: string;
  taskName: string;
}) {
  if (editing) {
    return (
      <div className="operational-task-wizard-sidebar">
        <div>
          <span className="operational-task-wizard-kicker">MODIFICATION RAPIDE</span>
          <h2>Modifier la tâche</h2>
          <p>Toutes les informations utiles sont réunies sur un seul écran.</p>
        </div>
        <div className="operational-task-quick-summary">
          <div>
            <ListChecks size={18} />
            <span>
              <strong>Tâche</strong>
              <small>{taskName || 'Sans titre'}</small>
            </span>
          </div>
          <div>
            <Building2 size={18} />
            <span>
              <strong>Lieu et service</strong>
              <small>
                {[siteName, departmentName].filter(Boolean).join(' · ') || 'Non renseigné'}
              </small>
            </span>
          </div>
          <div>
            <UserRound size={18} />
            <span>
              <strong>Équipe</strong>
              <small>{assigneeName}</small>
            </span>
          </div>
        </div>
        <div className="operational-task-wizard-note">
          <CheckCircle2 size={18} />
          <span>Un seul enregistrement met à jour la tâche et son horaire.</span>
        </div>
      </div>
    );
  }

  const items = [
    {
      index: 1,
      icon: Building2,
      label: 'Site & service',
      detail: [siteName, departmentName].filter(Boolean).join(' · ') || 'À sélectionner',
    },
    {
      index: 2,
      icon: UserRound,
      label: 'Personne',
      detail: step > 1 ? assigneeName : 'Après le service',
    },
    { index: 3, icon: ListChecks, label: 'Tâche', detail: taskName || 'Type et horaire' },
  ];
  return (
    <div className="operational-task-wizard-sidebar">
      <div>
        <span className="operational-task-wizard-kicker">PLANNING OPÉRATIONNEL</span>
        <h2>Planifier une tâche</h2>
        <p>
          Un parcours court, alimenté par les services, les postes et les collaborateurs déjà
          configurés dans RH.
        </p>
      </div>
      <div className="operational-task-wizard-steps">
        {items.map((item) => {
          const Icon = item.icon;
          const active = step === item.index;
          const complete = step > item.index;
          return (
            <div
              key={item.index}
              className={`operational-task-wizard-step${active ? ' active' : ''}${complete ? ' complete' : ''}`}
            >
              <span className="operational-task-wizard-step-icon">
                {complete ? <Check size={18} /> : <Icon size={18} />}
              </span>
              <span>
                <strong>
                  {item.index}. {item.label}
                </strong>
                <small>{item.detail}</small>
              </span>
            </div>
          );
        })}
      </div>
      <div className="operational-task-wizard-note">
        <Users size={18} />
        <span>Les droits d’assignation suivent automatiquement l’organigramme RH.</span>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: '1.1rem',
  borderRadius: '22px',
  background: 'white',
  border: '1px solid #e2e8f0',
  boxShadow: '0 12px 34px rgba(15, 23, 42, .055)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '44px',
  border: '1px solid #cbd5e1',
  borderRadius: '11px',
  padding: '.65rem .75rem',
  background: 'white',
  color: '#0f172a',
  font: 'inherit',
  boxSizing: 'border-box',
};

function taskModeButtonStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: '78px',
    border: `1px solid ${active ? '#10b981' : '#cbd5e1'}`,
    borderRadius: '13px',
    background: active ? '#ecfdf5' : 'white',
    color: active ? '#047857' : '#334155',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '.35rem',
    padding: '.65rem',
    font: 'inherit',
    fontSize: '.82rem',
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: active ? '0 6px 16px rgba(16, 185, 129, .12)' : 'none',
  };
}

function smallSegmentStyle(active: boolean): React.CSSProperties {
  return {
    border: `1px solid ${active ? '#10b981' : '#d1fae5'}`,
    borderRadius: '999px',
    background: active ? '#10b981' : 'white',
    color: active ? 'white' : '#047857',
    padding: '.45rem .75rem',
    font: 'inherit',
    fontSize: '.78rem',
    fontWeight: 900,
    cursor: 'pointer',
  };
}

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '.45rem',
  minHeight: '42px',
  padding: '.62rem 1rem',
  border: 0,
  borderRadius: '12px',
  background: '#10b981',
  color: 'white',
  fontWeight: 900,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '40px',
  padding: '.55rem .8rem',
  border: '1px solid #dbe3ec',
  borderRadius: '11px',
  background: 'white',
  color: '#334155',
  fontWeight: 850,
  cursor: 'pointer',
};

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  width: '40px',
  height: '40px',
  border: '1px solid #dbe3ec',
  borderRadius: '11px',
  background: 'white',
  color: '#475569',
  cursor: 'pointer',
};

const segmentedStyle: React.CSSProperties = {
  display: 'flex',
  padding: '4px',
  gap: '3px',
  background: '#eef2f7',
  borderRadius: '12px',
};

const segmentButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: '.55rem .8rem',
  border: 0,
  borderRadius: '9px',
  background: active ? 'white' : 'transparent',
  color: active ? '#047857' : '#64748b',
  boxShadow: active ? '0 2px 7px rgba(15, 23, 42, .1)' : 'none',
  fontWeight: 900,
  cursor: 'pointer',
});

const errorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '.55rem',
  padding: '.8rem 1rem',
  borderRadius: '13px',
  background: '#fff1f2',
  border: '1px solid #fecdd3',
  color: '#be123c',
  fontWeight: 750,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1200,
  display: 'grid',
  placeItems: 'center',
  padding: '1rem',
  background: 'rgba(15, 23, 42, .55)',
  backdropFilter: 'blur(3px)',
};

const modalStyle: React.CSSProperties = {
  width: 'min(680px, 100%)',
  maxHeight: 'calc(100vh - 2rem)',
  overflowY: 'auto',
  padding: '1.35rem',
  borderRadius: '22px',
  background: 'white',
  boxShadow: '0 30px 80px rgba(15, 23, 42, .3)',
};

const twoColumnStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '.75rem',
};

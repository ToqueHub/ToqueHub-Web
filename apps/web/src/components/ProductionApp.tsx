import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  ChefHat,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Loader2,
  ListChecks,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { GuidedWizard } from './ui/GuidedWizard';
import type {
  HrDepartment,
  HrPosition,
  MenuPlan,
  OperationalTask,
  OperationalTaskAssignee,
  OperationalTaskCategory,
  OperationalTaskPayload,
  OperationalTaskOptions,
  OperationalTaskStatus,
  UserSession,
} from '../types';

type ProductionAppProps = {
  token: string;
  session: UserSession;
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
  assignedEmployeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  quantity: string;
  unitLabel: string;
  positionTaskPresetId: string;
  technicalSheetId: string;
  technicalSheetStepId: string;
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

const statusCopy: Record<
  OperationalTaskStatus,
  { label: string; color: string; background: string }
> = {
  TODO: { label: 'À faire', color: '#475569', background: '#f1f5f9' },
  IN_PROGRESS: { label: 'En cours', color: '#1d4ed8', background: '#dbeafe' },
  COMPLETED: { label: 'Terminée', color: '#047857', background: '#d1fae5' },
  CANCELLED: { label: 'Annulée', color: '#b91c1c', background: '#fee2e2' },
};

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
  return new Intl.DateTimeFormat('fr-FR', options ?? { weekday: 'long', day: 'numeric', month: 'long' })
    .format(parseDay(value))
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function taskDay(value: string) {
  const date = new Date(value);
  return dayKey(date);
}

function employeeName(employee?: OperationalTaskAssignee | OperationalTask['assignedEmployee'] | null) {
  if (!employee) return 'Non assignée';
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function emptyDraft(date: string, departmentId = '', assignedEmployeeId = ''): TaskDraft {
  return {
    mode: '',
    title: '',
    description: '',
    category: 'OTHER',
    departmentId,
    positionId: '',
    assignedEmployeeId,
    date,
    startTime: '09:00',
    endTime: '10:00',
    durationMinutes: 60,
    quantity: '',
    unitLabel: '',
    positionTaskPresetId: '',
    technicalSheetId: '',
    technicalSheetStepId: '',
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Une erreur est survenue.';
}

function normalizeLabel(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

export function ProductionApp({ token, session }: ProductionAppProps) {
  const [view, setView] = useState<ViewMode>('day');
  const [anchorDate, setAnchorDate] = useState(today());
  const [departmentFilter, setDepartmentFilter] = useState('');
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
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStep, setEditorStep] = useState<1 | 2 | 3>(1);
  const [serviceSearch, setServiceSearch] = useState('');
  const [menuImporterOpen, setMenuImporterOpen] = useState(false);
  const [menus, setMenus] = useState<MenuPlan[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuGenerating, setMenuGenerating] = useState(false);
  const [menuDraft, setMenuDraft] = useState({
    menuId: '',
    departmentId: '',
    date: today(),
    serviceTime: '12:00',
  });
  const [editingTask, setEditingTask] = useState<OperationalTask | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft(today()));
  const [assignees, setAssignees] = useState<OperationalTaskAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taskOptions, setTaskOptions] = useState<OperationalTaskOptions>({ presets: [], technicalSheets: [] });
  const [taskOptionsLoading, setTaskOptionsLoading] = useState(false);

  const period = useMemo(() => {
    const start = view === 'week' ? startOfWeek(anchorDate) : anchorDate;
    const end = addDays(start, view === 'week' ? 7 : 1);
    return { start, end };
  }, [anchorDate, view]);

  const days = useMemo(
    () => Array.from({ length: view === 'week' ? 7 : 1 }, (_, index) => addDays(period.start, index)),
    [period.start, view],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [hr, context, taskList] = await Promise.all([
        api.hrBootstrap(token),
        api.productionTaskContext(token),
        api.productionTasks(token, {
          startDate: localIso(period.start, '00:00'),
          endDate: localIso(period.end, '00:00'),
          departmentId: departmentFilter || undefined,
        }),
      ]);
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
  }, [departmentFilter, period.end, period.start, token]);

  useEffect(() => {
    void load();
  }, [load]);

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
        setAssignees(
          [...result].sort((a, b) => Number(b.available) - Number(a.available)),
        );
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
  }, [draft.date, draft.departmentId, draft.endTime, draft.startTime, editingTask?.id, editorOpen, token]);

  useEffect(() => {
    if (!editorOpen || !draft.departmentId) {
      setTaskOptions({ presets: [], technicalSheets: [] });
      return;
    }
    let active = true;
    setTaskOptionsLoading(true);
    api.productionTaskOptions(token, draft.departmentId)
      .then((result) => { if (active) setTaskOptions(result); })
      .catch((optionsError) => { if (active) setError(errorMessage(optionsError)); })
      .finally(() => { if (active) setTaskOptionsLoading(false); });
    return () => { active = false; };
  }, [draft.departmentId, editorOpen, token]);

  const positionsForDepartment = useMemo(
    () => positions.filter((position) => !position.departmentId || position.departmentId === draft.departmentId),
    [draft.departmentId, positions],
  );
  const selectedDepartment = departments.find((department) => department.id === draft.departmentId);
  const selectedSheet = taskOptions.technicalSheets.find((sheet) => sheet.id === draft.technicalSheetId);
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
    (draft.mode === 'TECHNICAL_SHEET_STEP' && Boolean(draft.technicalSheetId && draft.technicalSheetStepId));
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
      positionTaskPresetId: '',
      technicalSheetId: '',
      technicalSheetStepId: '',
      title: '',
      description: '',
    }));
  }

  function chooseAssignee(assignedEmployeeId: string) {
    const employee = assignees.find((item) => item.id === assignedEmployeeId);
    setDraft((current) => ({
      ...current,
      assignedEmployeeId,
      positionId: employee?.positionId ?? '',
      mode: '',
      positionTaskPresetId: '',
      technicalSheetId: '',
      technicalSheetStepId: '',
      title: '',
      description: '',
    }));
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
      quantity: '',
      unitLabel: '',
    }));
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
      title: mode === 'TECHNICAL_SHEET' ? `Préparer · ${selectedSheet.name}` : '',
      description: mode === 'TECHNICAL_SHEET' && selectedSheet.menuNames.length ? `Fiche présente dans : ${selectedSheet.menuNames.join(', ')}.` : '',
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
      durationMinutes: duration,
      endTime: endTimeFromDuration(current.startTime, duration),
    }));
  }

  function selectTechnicalSheet(technicalSheetId: string) {
    const sheet = taskOptions.technicalSheets.find((item) => item.id === technicalSheetId);
    if (!sheet) {
      setDraft((current) => ({ ...current, technicalSheetId: '', technicalSheetStepId: '', title: '' }));
      return;
    }
    const isStepMode = draft.mode === 'TECHNICAL_SHEET_STEP';
    const duration = sheet.totalTimeMinutes;
    setDraft((current) => ({
      ...current,
      technicalSheetId: sheet.id,
      technicalSheetStepId: '',
      title: isStepMode ? '' : `Préparer · ${sheet.name}`,
      description: isStepMode ? '' : (sheet.menuNames.length ? `Fiche présente dans : ${sheet.menuNames.join(', ')}.` : current.description),
      category: categoryForDepartment(selectedDepartment?.name),
      durationMinutes: duration,
      endTime: endTimeFromDuration(current.startTime, duration),
      quantity: current.quantity || String(sheet.referencePortions ?? ''),
      unitLabel: current.unitLabel || 'portions',
    }));
  }

  function selectTechnicalSheetStep(stepId: string) {
    const step = selectedSheet?.steps.find((item) => item.id === stepId);
    if (!step || !selectedSheet) return;
    setDraft((current) => ({
      ...current,
      technicalSheetStepId: step.id,
      title: `${step.title} · ${selectedSheet.name}`,
      description: step.description ?? '',
      durationMinutes: step.estimatedMinutes,
      endTime: endTimeFromDuration(current.startTime, step.estimatedMinutes),
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
    setEditorStep(1);
    setServiceSearch('');
    setDraft({
      mode: task.technicalSheetStepId ? 'TECHNICAL_SHEET_STEP' : task.technicalSheetId ? 'TECHNICAL_SHEET' : task.positionTaskPresetId ? 'PRESET' : 'MANUAL',
      title: task.title,
      description: task.description ?? '',
      category: task.category,
      departmentId: task.departmentId,
      positionId: task.positionId ?? '',
      assignedEmployeeId: task.assignedEmployeeId ?? '',
      date: taskDay(task.startsAt),
      startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
      durationMinutes: Math.max(5, Math.round((end.getTime() - start.getTime()) / 60_000)),
      quantity: task.quantity == null ? '' : String(task.quantity),
      unitLabel: task.unitLabel ?? '',
      positionTaskPresetId: task.positionTaskPresetId ?? '',
      technicalSheetId: task.technicalSheetId ?? '',
      technicalSheetStepId: task.technicalSheetStepId ?? '',
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
      assignedEmployeeId: draft.assignedEmployeeId || null,
      startsAt,
      endsAt,
      quantity: draft.quantity === '' ? null : Number(draft.quantity),
      unitLabel: draft.unitLabel.trim() || null,
      source: editingTask?.source ?? (draft.technicalSheetId ? 'TECHNICAL_SHEET' : 'MANUAL'),
      technicalSheetId: draft.technicalSheetId || null,
      technicalSheetStepId: draft.technicalSheetStepId || null,
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

  async function changeStatus(task: OperationalTask, status: OperationalTaskStatus) {
    setBusyId(task.id);
    setError('');
    try {
      const updated = await api.updateProductionTaskStatus(token, task.id, status);
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
    } catch (statusError) {
      setError(errorMessage(statusError));
    } finally {
      setBusyId('');
    }
  }

  const activeTasks = tasks.filter((task) => task.status !== 'CANCELLED');
  const completedCount = activeTasks.filter((task) => task.status === 'COMPLETED').length;
  const inProgressCount = activeTasks.filter((task) => task.status === 'IN_PROGRESS').length;
  const unassignedCount = activeTasks.filter((task) => !task.assignedEmployeeId).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      <section
        style={{
          padding: '1.35rem',
          borderRadius: '24px',
          background: 'linear-gradient(135deg, #07111f 0%, #102a2a 100%)',
          color: 'white',
          boxShadow: '0 20px 50px rgba(15, 23, 42, .12)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ opacity: 0.72, fontSize: '.78rem', fontWeight: 800, letterSpacing: '.1em' }}>
              ORGANISATION OPÉRATIONNELLE
            </div>
            <h2 style={{ margin: '.3rem 0 .35rem', fontSize: 'clamp(1.55rem, 2.5vw, 2.15rem)' }}>
              Planning des tâches
            </h2>
            <p style={{ margin: 0, maxWidth: '690px', color: '#cbd5e1', lineHeight: 1.5 }}>
              Cuisine, réception, ménage, salle ou maintenance : chaque responsable organise son équipe à partir des services et responsables définis dans RH.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => void openMenuImporter()}
              style={{ ...secondaryButtonStyle, color: 'white', borderColor: 'rgba(255,255,255,.28)', background: 'rgba(255,255,255,.08)' }}
              disabled={!departments.length}
            >
              <CalendarDays size={18} /> Depuis un menu
            </button>
            <button type="button" onClick={() => openCreate()} style={primaryButtonStyle} disabled={!departments.length}>
              <Plus size={19} /> Nouvelle tâche
            </button>
          </div>
        </div>
      </section>

      <section style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.8rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <div style={segmentedStyle}>
              <button type="button" onClick={() => setView('day')} style={segmentButtonStyle(view === 'day')}>
                Jour
              </button>
              <button type="button" onClick={() => setView('week')} style={segmentButtonStyle(view === 'week')}>
                Semaine
              </button>
            </div>
            <button
              type="button"
              aria-label="Période précédente"
              onClick={() => setAnchorDate((date) => addDays(date, view === 'week' ? -7 : -1))}
              style={iconButtonStyle}
            >
              <ChevronLeft size={19} />
            </button>
            <button type="button" onClick={() => setAnchorDate(today())} style={secondaryButtonStyle}>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '.55rem', fontWeight: 800 }}>
            <Users size={18} color="#64748b" />
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              style={{ ...inputStyle, minWidth: '210px' }}
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
        <div style={{ marginTop: '1rem', display: 'flex', gap: '.65rem', flexWrap: 'wrap' }}>
          <Metric label="Tâches" value={activeTasks.length} />
          <Metric label="En cours" value={inProgressCount} color="#2563eb" />
          <Metric label="Terminées" value={completedCount} color="#059669" />
          <Metric label="À assigner" value={unassignedCount} color="#d97706" />
        </div>
      </section>

      {error && (
        <div style={errorStyle}>
          <AlertCircle size={19} /> <span>{error}</span>
        </div>
      )}

      {!departments.length && !loading ? (
        <section style={{ ...panelStyle, textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Users size={36} color="#10b981" />
          <h3 style={{ margin: '.8rem 0 .35rem' }}>Commencez par vos services RH</h3>
          <p style={{ margin: 0, color: '#64748b' }}>
            Créez les services et les collaborateurs dans RH. Ils seront réutilisés ici sans aucune double saisie.
          </p>
        </section>
      ) : loading ? (
        <section style={{ ...panelStyle, display: 'grid', placeItems: 'center', minHeight: '280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', color: '#64748b', fontWeight: 800 }}>
            <Loader2 size={22} className="spin" /> Chargement du planning…
          </div>
        </section>
      ) : (
        <section style={{ ...panelStyle, padding: view === 'week' ? '.85rem' : '1.15rem', overflowX: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: view === 'week' ? 'repeat(7, minmax(220px, 1fr))' : '1fr',
              gap: '.75rem',
              minWidth: view === 'week' ? '1540px' : undefined,
            }}
          >
            {days.map((day) => {
              const dayTasks = activeTasks.filter((task) => taskDay(task.startsAt) === day);
              return (
                <DayColumn
                  key={day}
                  day={day}
                  tasks={dayTasks}
                  today={day === today()}
                  compact={view === 'week'}
                  busyId={busyId}
                  onCreate={() => openCreate(day)}
                  onEdit={openEdit}
                  onStatus={changeStatus}
                />
              );
            })}
          </div>
        </section>
      )}

      {menuImporterOpen && (
        <div style={overlayStyle} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setMenuImporterOpen(false)}>
          <form onSubmit={generateFromMenu} style={{ ...modalStyle, width: 'min(560px, 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ color: '#10b981', fontSize: '.75rem', fontWeight: 900, letterSpacing: '.08em' }}>MENU → TÂCHES</div>
                <h3 style={{ margin: '.25rem 0 .35rem', fontSize: '1.4rem' }}>Préparer un service</h3>
                <p style={{ margin: 0, color: '#64748b', lineHeight: 1.45 }}>
                  Une tâche simple sera créée pour chaque fiche technique du menu. Vous pourrez ensuite les répartir entre les cuisiniers.
                </p>
              </div>
              <button type="button" aria-label="Fermer" onClick={() => setMenuImporterOpen(false)} style={iconButtonStyle}><X size={19} /></button>
            </div>
            <div style={{ display: 'grid', gap: '.9rem', marginTop: '1.2rem' }}>
              <Field label="Menu" required>
                <select value={menuDraft.menuId} onChange={(event) => setMenuDraft((current) => ({ ...current, menuId: event.target.value }))} style={inputStyle} disabled={menuLoading}>
                  <option value="">{menuLoading ? 'Chargement des menus…' : 'Choisir un menu…'}</option>
                  {menus.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      {menu.name} · {menu.items?.filter((item) => item.technicalSheetId).length ?? 0} recette(s)
                    </option>
                  ))}
                </select>
                {!menuLoading && menus.length === 0 && <small style={{ color: '#b45309' }}>Aucun menu contenant des fiches techniques n’est disponible.</small>}
              </Field>
              <Field label="Service RH responsable" required>
                <select value={menuDraft.departmentId} onChange={(event) => setMenuDraft((current) => ({ ...current, departmentId: event.target.value }))} style={inputStyle}>
                  <option value="">Choisir un service…</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </Field>
              <div style={twoColumnStyle}>
                <Field label="Date du service"><input type="date" value={menuDraft.date} onChange={(event) => setMenuDraft((current) => ({ ...current, date: event.target.value }))} style={inputStyle} /></Field>
                <Field label="Heure du service"><input type="time" value={menuDraft.serviceTime} onChange={(event) => setMenuDraft((current) => ({ ...current, serviceTime: event.target.value }))} style={inputStyle} /></Field>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.65rem', marginTop: '1.2rem' }}>
              <button type="button" onClick={() => setMenuImporterOpen(false)} style={secondaryButtonStyle}>Annuler</button>
              <button type="submit" style={primaryButtonStyle} disabled={menuGenerating || menuLoading || !menus.length}>
                {menuGenerating ? <Loader2 size={18} className="spin" /> : <CalendarDays size={18} />} Créer les tâches
              </button>
            </div>
          </form>
        </div>
      )}

      {editorOpen && (
        <GuidedWizard
          step={editorStep}
          totalSteps={3}
          onClose={() => setEditorOpen(false)}
          sidebar={(
            <OperationalTaskWizardSidebar
              step={editorStep}
              editing={Boolean(editingTask)}
              departmentName={selectedDepartment?.name}
              assigneeName={draft.assignedEmployeeId ? employeeName(selectedAssignee) : 'À assigner plus tard'}
              taskName={draft.title}
            />
          )}
        >
          <form onSubmit={saveTask} className="operational-task-wizard-form">
            <div className="operational-task-wizard-body">
              {editorStep === 1 && (
                <section className="operational-task-step">
                  <div className="operational-task-step-heading">
                    <span>Service responsable</span>
                    <h2>Dans quel service se déroule la tâche ?</h2>
                    <p>Les services viennent directement du module RH. Recherchez puis sélectionnez l’équipe concernée.</p>
                  </div>
                  <div className="operational-task-search">
                    <Building2 size={19} />
                    <input autoFocus value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Rechercher un service…" />
                  </div>
                  <div className="operational-task-choice-grid departments">
                    {visibleDepartments.map((department) => {
                      const active = draft.departmentId === department.id;
                      return (
                        <button key={department.id} type="button" className={active ? 'operational-task-choice active' : 'operational-task-choice'} onClick={() => chooseDepartment(department.id)}>
                          <span className="operational-task-choice-icon"><Building2 size={20} /></span>
                          <span><strong>{department.name}</strong><small>Service RH</small></span>
                          <span className="operational-task-choice-check">{active ? <Check size={17} /> : <Circle size={15} />}</span>
                        </button>
                      );
                    })}
                  </div>
                  {!visibleDepartments.length && <div className="operational-task-empty">Aucun service ne correspond à cette recherche.</div>}
                </section>
              )}

              {editorStep === 2 && (
                <section className="operational-task-step">
                  <div className="operational-task-step-heading">
                    <span>Collaborateur disponible</span>
                    <h2>À qui souhaitez-vous confier cette tâche ?</h2>
                    <p>Les disponibilités sont vérifiées sur le planning pour le créneau indiqué. Vous pourrez encore modifier l’horaire à l’étape suivante.</p>
                  </div>
                  {assigneesLoading ? (
                    <div className="operational-task-loading"><Loader2 size={24} className="spin" /> Vérification des disponibilités…</div>
                  ) : (
                    <div className="operational-task-choice-grid people">
                      {taskContext.canCreateUnassigned && (
                        <button type="button" className={!draft.assignedEmployeeId ? 'operational-task-choice active' : 'operational-task-choice'} onClick={() => chooseAssignee('')}>
                          <span className="operational-task-choice-icon"><Users size={20} /></span>
                          <span><strong>À assigner plus tard</strong><small>La tâche restera visible dans les tâches non attribuées</small></span>
                          <span className="operational-task-choice-check">{!draft.assignedEmployeeId ? <Check size={17} /> : <Circle size={15} />}</span>
                        </button>
                      )}
                      {assignees.map((employee) => {
                        const active = draft.assignedEmployeeId === employee.id;
                        return (
                          <button key={employee.id} type="button" disabled={!employee.available} className={active ? 'operational-task-choice active' : 'operational-task-choice'} onClick={() => chooseAssignee(employee.id)}>
                            <span className="operational-task-avatar">{employee.firstName?.[0]}{employee.lastName?.[0]}</span>
                            <span><strong>{employeeName(employee)}</strong><small>{employee.position?.name ?? 'Sans poste'} · {employee.availabilityLabel}</small></span>
                            <span className="operational-task-choice-check">{active ? <Check size={17} /> : <Circle size={15} />}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {!assigneesLoading && !assignees.length && !taskContext.canCreateUnassigned && <div className="operational-task-empty">Aucune personne disponible sur ce créneau.</div>}
                </section>
              )}

              {editorStep === 3 && (
                <section className="operational-task-step">
                  <div className="operational-task-step-heading compact">
                    <span>Tâche et horaire</span>
                    <h2>Que faut-il réaliser ?</h2>
                    <p>Choisissez un raccourci du poste, une fiche technique pour les métiers concernés, ou saisissez librement la tâche.</p>
                  </div>
                  {taskOptionsLoading ? (
                    <div className="operational-task-loading"><Loader2 size={24} className="spin" /> Chargement des tâches proposées…</div>
                  ) : (
                    <div className="operational-task-mode-grid">
                      {supportsTechnicalSheets && <button type="button" onClick={() => selectTaskMode('TECHNICAL_SHEET')} style={taskModeButtonStyle(draft.mode === 'TECHNICAL_SHEET')}><ChefHat size={20} /> Fiche complète</button>}
                      {supportsTechnicalSheets && <button type="button" onClick={() => selectTaskMode('TECHNICAL_SHEET_STEP')} style={taskModeButtonStyle(draft.mode === 'TECHNICAL_SHEET_STEP')}><ListChecks size={20} /> Une étape</button>}
                      <button type="button" onClick={() => selectTaskMode('PRESET')} style={taskModeButtonStyle(draft.mode === 'PRESET')}><RotateCcw size={20} /> Tâche du poste</button>
                      <button type="button" onClick={() => selectTaskMode('MANUAL')} style={taskModeButtonStyle(draft.mode === 'MANUAL')}><Pencil size={20} /> Saisie libre</button>
                    </div>
                  )}

                  {draft.mode === 'PRESET' && (
                    <div className="operational-task-selection-panel">
                      <Field label="Tâche habituelle du poste" required>
                        <select value={draft.positionTaskPresetId ? `${draft.positionId}:${draft.positionTaskPresetId}` : ''} onChange={(event) => selectPreset(event.target.value)} style={inputStyle}>
                          <option value="">Choisir une tâche…</option>
                          {presetsForAssignee.map((preset) => <option key={`${preset.positionId}:${preset.id}`} value={`${preset.positionId}:${preset.id}`}>{preset.positionName} · {preset.title}</option>)}
                        </select>
                        {!presetsForAssignee.length && <small style={{ color: '#b45309' }}>Ajoutez les tâches types depuis RH → Postes → Modifier → Tâches.</small>}
                      </Field>
                    </div>
                  )}

                  {(draft.mode === 'TECHNICAL_SHEET' || draft.mode === 'TECHNICAL_SHEET_STEP') && (
                    <div className="operational-task-selection-panel technical-sheet">
                      <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => switchTechnicalSheetMode('TECHNICAL_SHEET')} style={smallSegmentStyle(draft.mode === 'TECHNICAL_SHEET')}>Fiche complète</button>
                        <button type="button" onClick={() => switchTechnicalSheetMode('TECHNICAL_SHEET_STEP')} style={smallSegmentStyle(draft.mode === 'TECHNICAL_SHEET_STEP')}>Une étape</button>
                      </div>
                      <Field label="Fiche technique" required>
                        <select value={draft.technicalSheetId} onChange={(event) => selectTechnicalSheet(event.target.value)} style={inputStyle}>
                          <option value="">Choisir une fiche…</option>
                          {taskOptions.technicalSheets.some((sheet) => sheet.isOnCurrentMenu) && <optgroup label="Au menu actuellement">{taskOptions.technicalSheets.filter((sheet) => sheet.isOnCurrentMenu).map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.name} · {sheet.totalTimeMinutes} min</option>)}</optgroup>}
                          <optgroup label="Autres fiches actives">{taskOptions.technicalSheets.filter((sheet) => !sheet.isOnCurrentMenu).map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.name} · {sheet.totalTimeMinutes} min</option>)}</optgroup>
                        </select>
                        {selectedSheet?.isOnCurrentMenu && <small style={{ color: '#047857', fontWeight: 800 }}>Présente dans : {selectedSheet.menuNames.join(', ')}</small>}
                      </Field>
                      {draft.mode === 'TECHNICAL_SHEET_STEP' && draft.technicalSheetId && (
                        <Field label="Étape à réaliser" required>
                          <select value={draft.technicalSheetStepId} onChange={(event) => selectTechnicalSheetStep(event.target.value)} style={inputStyle}>
                            <option value="">Choisir une étape…</option>
                            {selectedSheet?.steps.map((step) => <option key={step.id} value={step.id}>{step.order}. {step.title} · {step.estimatedMinutes} min</option>)}
                          </select>
                          {!selectedSheet?.steps.length && <small style={{ color: '#b45309' }}>Cette fiche ne contient aucune étape planifiable.</small>}
                        </Field>
                      )}
                    </div>
                  )}

                  {taskSelectionComplete && (
                    <div className="operational-task-recap">
                      <div className="operational-task-recap-title"><Check size={18} /><span>Récapitulatif de la tâche</span></div>
                      <div className="operational-task-recap-grid">
                        <div className="operational-task-recap-column">
                          <Field label="Que faut-il faire ?" required>
                            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ex. Préparer la mise en place du déjeuner" style={inputStyle} />
                          </Field>
                          <Field label="Type de tâche">
                            <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as OperationalTaskCategory }))} style={inputStyle}>
                              {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </Field>
                          <Field label="Consigne (facultatif)">
                            <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="Informations utiles pour réaliser la tâche…" style={{ ...inputStyle, resize: 'vertical' }} />
                          </Field>
                        </div>
                        <div className="operational-task-recap-column">
                          <div className="operational-task-schedule-grid">
                            <Field label="Date"><input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} style={inputStyle} /></Field>
                            <Field label="Début"><input type="time" value={draft.startTime} onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value, endTime: endTimeFromDuration(event.target.value, current.durationMinutes) }))} style={inputStyle} /></Field>
                            <Field label="Durée (min)"><input type="number" min="5" step="5" value={draft.durationMinutes} onChange={(event) => { const durationMinutes = Math.max(5, Number(event.target.value) || 5); setDraft((current) => ({ ...current, durationMinutes, endTime: endTimeFromDuration(current.startTime, durationMinutes) })); }} style={inputStyle} /></Field>
                            <Field label="Fin"><input type="time" value={draft.endTime} onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value, durationMinutes: minutesBetween(current.startTime, event.target.value) }))} style={inputStyle} /></Field>
                          </div>
                          {positionsForDepartment.length > 0 && (
                            <Field label="Poste attendu (facultatif)">
                              <select value={draft.positionId} onChange={(event) => setDraft((current) => ({ ...current, positionId: event.target.value }))} style={inputStyle} disabled={Boolean(selectedAssignee || draft.positionTaskPresetId)}>
                                <option value="">Tous les postes du service</option>
                                {positionsForDepartment.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
                              </select>
                            </Field>
                          )}
                          {draft.category === 'KITCHEN' && (
                            <div style={twoColumnStyle}>
                              <Field label="Quantité (facultatif)"><input type="number" min="0" step="any" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} placeholder="Ex. 30" style={inputStyle} /></Field>
                              <Field label="Unité"><input value={draft.unitLabel} onChange={(event) => setDraft((current) => ({ ...current, unitLabel: event.target.value }))} placeholder="portions, plaques…" style={inputStyle} /></Field>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {error && <div style={errorStyle}><AlertCircle size={18} /> {error}</div>}
                </section>
              )}
            </div>

            <footer className="operational-task-wizard-footer">
              {editorStep === 1 && <button type="button" onClick={() => setEditorOpen(false)} style={secondaryButtonStyle}>Annuler</button>}
              {editorStep > 1 && <button type="button" onClick={() => setEditorStep((editorStep - 1) as 1 | 2)} style={secondaryButtonStyle}><ChevronLeft size={17} /> Retour</button>}
              <span />
              {editorStep < 3 ? (
                <button type="button" onClick={() => setEditorStep((editorStep + 1) as 2 | 3)} style={primaryButtonStyle} disabled={editorStep === 1 ? !draft.departmentId : assigneesLoading || !personStepComplete}>
                  Continuer <ChevronRight size={17} />
                </button>
              ) : (
                <button type="submit" style={primaryButtonStyle} disabled={saving || !taskSelectionComplete || !draft.title.trim()}>
                  {saving ? <Loader2 size={18} className="spin" /> : <Check size={18} />}
                  {editingTask ? 'Enregistrer les modifications' : 'Créer la tâche'}
                </button>
              )}
            </footer>
          </form>
        </GuidedWizard>
      )}

      <div style={{ color: '#64748b', fontSize: '.82rem', textAlign: 'center' }}>
        Connecté en tant que {session.user.firstName || session.user.email}. Les droits d’assignation suivent automatiquement l’organigramme RH.
      </div>
    </div>
  );
}

function DayColumn({
  day,
  tasks,
  today: isToday,
  compact,
  busyId,
  onCreate,
  onEdit,
  onStatus,
}: {
  day: string;
  tasks: OperationalTask[];
  today: boolean;
  compact: boolean;
  busyId: string;
  onCreate: () => void;
  onEdit: (task: OperationalTask) => void;
  onStatus: (task: OperationalTask, status: OperationalTaskStatus) => void;
}) {
  return (
    <div style={{ borderRadius: '18px', background: isToday ? '#f0fdf9' : '#f8fafc', border: `1px solid ${isToday ? '#a7f3d0' : '#e2e8f0'}`, minHeight: '330px', padding: '.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', marginBottom: '.7rem' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: compact ? '.88rem' : '1.05rem' }}>
            {formatDay(day, compact ? { weekday: 'short', day: 'numeric', month: 'short' } : undefined)}
          </div>
          <div style={{ color: '#64748b', fontSize: '.72rem', marginTop: '.1rem' }}>
            {tasks.length} tâche{tasks.length === 1 ? '' : 's'}{isToday ? ' · Aujourd’hui' : ''}
          </div>
        </div>
        <button type="button" aria-label="Ajouter une tâche" onClick={onCreate} style={{ ...iconButtonStyle, width: '34px', height: '34px' }}>
          <Plus size={17} />
        </button>
      </div>
      <div style={{ display: 'grid', gap: '.55rem' }}>
        {tasks.length === 0 ? (
          <button type="button" onClick={onCreate} style={{ border: '1px dashed #cbd5e1', borderRadius: '14px', padding: '1.25rem .7rem', color: '#94a3b8', background: 'transparent', cursor: 'pointer' }}>
            Journée libre · ajouter une tâche
          </button>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} busy={busyId === task.id} onEdit={() => onEdit(task)} onStatus={(status) => onStatus(task, status)} />
          ))
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  busy,
  onEdit,
  onStatus,
}: {
  task: OperationalTask;
  busy: boolean;
  onEdit: () => void;
  onStatus: (status: OperationalTaskStatus) => void;
}) {
  const status = statusCopy[task.status];
  const nextStatus = task.status === 'TODO' ? 'IN_PROGRESS' : task.status === 'IN_PROGRESS' ? 'COMPLETED' : 'TODO';
  return (
    <article style={{ position: 'relative', overflow: 'hidden', borderRadius: '14px', background: 'white', border: '1px solid #e2e8f0', padding: '.75rem .75rem .7rem .9rem', boxShadow: '0 5px 14px rgba(15, 23, 42, .04)' }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: '4px', background: categoryColor[task.category] }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.4rem', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', color: '#64748b', fontSize: '.72rem', fontWeight: 800 }}>
            <Clock3 size={13} /> {formatTime(task.startsAt)}–{formatTime(task.endsAt)}
          </div>
          <h4 style={{ margin: '.3rem 0 .18rem', fontSize: '.92rem', lineHeight: 1.25 }}>{task.title}</h4>
        </div>
        <button type="button" aria-label="Modifier" onClick={onEdit} style={{ ...iconButtonStyle, width: '30px', height: '30px', flexShrink: 0 }}>
          <Pencil size={14} />
        </button>
      </div>
      <div style={{ color: '#64748b', fontSize: '.74rem', lineHeight: 1.4 }}>
        {task.department?.name ?? 'Service'} · {employeeName(task.assignedEmployee)}
      </div>
      {task.technicalSheet && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.28rem', marginTop: '.35rem', color: '#047857', background: '#ecfdf5', borderRadius: '999px', padding: '.22rem .45rem', fontSize: '.67rem', fontWeight: 850 }}>
          <ChefHat size={12} /> {task.technicalSheetStep ? `Étape ${task.technicalSheetStep.order} · ${task.technicalSheetStep.title}` : 'Fiche complète'}
        </div>
      )}
      {task.quantity != null && (
        <div style={{ marginTop: '.28rem', fontSize: '.74rem', fontWeight: 800 }}>
          {String(task.quantity)} {task.unitLabel ?? ''}
        </div>
      )}
      {!task.planningAssignmentId && task.assignedEmployeeId && (
        <div style={{ display: 'flex', gap: '.25rem', alignItems: 'center', color: '#b45309', fontSize: '.68rem', marginTop: '.35rem' }}>
          <AlertCircle size={12} /> Hors créneau Planning
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.4rem', marginTop: '.55rem' }}>
        <span style={{ color: status.color, background: status.background, borderRadius: '999px', padding: '.25rem .48rem', fontSize: '.68rem', fontWeight: 900 }}>
          {status.label}
        </span>
        <div style={{ display: 'flex', gap: '.3rem' }}>
          {task.status !== 'COMPLETED' && (
            <button type="button" disabled={busy} onClick={() => onStatus(nextStatus)} title={nextStatus === 'IN_PROGRESS' ? 'Démarrer' : 'Terminer'} style={{ ...iconButtonStyle, width: '30px', height: '30px', color: '#047857' }}>
              {busy ? <Loader2 size={14} className="spin" /> : nextStatus === 'IN_PROGRESS' ? <Play size={14} /> : <Check size={15} />}
            </button>
          )}
          {task.status === 'COMPLETED' && (
            <button type="button" disabled={busy} onClick={() => onStatus('TODO')} title="Rouvrir" style={{ ...iconButtonStyle, width: '30px', height: '30px' }}>
              {busy ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value, color = '#0f172a' }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', borderRadius: '999px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '.42rem .7rem' }}>
      <span style={{ color, fontWeight: 950 }}>{value}</span>
      <span style={{ color: '#64748b', fontSize: '.78rem', fontWeight: 700 }}>{label}</span>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: '.38rem', color: '#334155', fontSize: '.82rem', fontWeight: 850 }}>
      <span>{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  );
}

function OperationalTaskWizardSidebar({
  step,
  editing,
  departmentName,
  assigneeName,
  taskName,
}: {
  step: 1 | 2 | 3;
  editing: boolean;
  departmentName?: string;
  assigneeName: string;
  taskName: string;
}) {
  const items = [
    { index: 1, icon: Building2, label: 'Service', detail: departmentName || 'À sélectionner' },
    { index: 2, icon: UserRound, label: 'Personne', detail: step > 1 ? assigneeName : 'Après le service' },
    { index: 3, icon: ListChecks, label: 'Tâche', detail: taskName || 'Type et horaire' },
  ];
  return (
    <div className="operational-task-wizard-sidebar">
      <div>
        <span className="operational-task-wizard-kicker">PLANNING OPÉRATIONNEL</span>
        <h2>{editing ? 'Modifier la tâche' : 'Planifier une tâche'}</h2>
        <p>Un parcours court, alimenté par les services, les postes et les collaborateurs déjà configurés dans RH.</p>
      </div>
      <div className="operational-task-wizard-steps">
        {items.map((item) => {
          const Icon = item.icon;
          const active = step === item.index;
          const complete = step > item.index;
          return (
            <div key={item.index} className={`operational-task-wizard-step${active ? ' active' : ''}${complete ? ' complete' : ''}`}>
              <span className="operational-task-wizard-step-icon">{complete ? <Check size={18} /> : <Icon size={18} />}</span>
              <span><strong>{item.index}. {item.label}</strong><small>{item.detail}</small></span>
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

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ClipboardList,
  Clock3,
  Edit3,
  Loader2,
  MapPin,
  Plus,
  Repeat2,
  Search,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { activeLocale } from '../i18n/runtime';
import type {
  OperationalTaskCategory,
  OperationalTaskPreset,
  OperationalTaskPresetOptions,
  OperationalTaskPresetPayload,
} from '../types';

type Props = { token: string };
type TechnicalSheetOption = OperationalTaskPresetOptions['technicalSheets'][number];
type PresetContentMode = '' | 'TECHNICAL_SHEET' | 'POSITION_TASK' | 'MANUAL';

type Draft = {
  contentMode: PresetContentMode;
  name: string;
  description: string;
  category: OperationalTaskCategory;
  departmentId: string;
  siteId: string;
  assignedEmployeeId: string;
  assignedEmployeeIds: string[];
  positionId: string;
  positionTaskPresetId: string;
  technicalSheetId: string;
  technicalSheetStepId: string;
  serviceWeekdays: number[];
  leadDays: number;
  startTime: string;
  endTime: string;
  quantity: string;
  unitLabel: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
};

const CATEGORIES: Array<{ value: OperationalTaskCategory; label: string }> = [
  { value: 'KITCHEN', label: 'Cuisine' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'HOUSEKEEPING', label: 'Entretien' },
  { value: 'RECEPTION', label: 'Réception' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'LOGISTICS', label: 'Logistique' },
  { value: 'MANAGEMENT', label: 'Management' },
  { value: 'OTHER', label: 'Autre' },
];

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const ANY_SITE = '__ANY_SITE__';

function employeeName(employee: OperationalTaskPresetOptions['employees'][number]) {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function employeeMatchesSite(
  employee: OperationalTaskPresetOptions['employees'][number],
  siteId: string,
) {
  if (siteId === ANY_SITE) return true;
  if (!siteId) return false;
  if (employee.mainSiteId === siteId || employee.siteId === siteId) return true;
  return (employee.secondarySites ?? []).some((secondarySite) =>
    'siteId' in secondarySite ? secondarySite.siteId === siteId : secondarySite.id === siteId,
  );
}

function presetEmployeeIds(preset: OperationalTaskPreset) {
  const assignedIds = (preset.assignments ?? []).map((assignment) => assignment.employeeId);
  return assignedIds.length ? assignedIds : [preset.assignedEmployeeId];
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase(activeLocale())
    .trim();
}

function TechnicalSheetSearch({
  sheets,
  value,
  onChange,
}: {
  sheets: TechnicalSheetOption[];
  value: string;
  onChange: (sheetId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const selectedSheet = sheets.find((sheet) => sheet.id === value);
  const filteredSheets = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query || query === normalizeSearch(selectedSheet?.name ?? '')) return sheets;
    return sheets.filter((sheet) =>
      normalizeSearch(`${sheet.name} ${sheet.steps.map((step) => step.title).join(' ')}`).includes(
        query,
      ),
    );
  }, [search, selectedSheet?.name, sheets]);
  const catalogSheets = useMemo(() => {
    const query = normalizeSearch(catalogSearch);
    if (!query) return sheets;
    return sheets.filter((sheet) =>
      normalizeSearch(`${sheet.name} ${sheet.steps.map((step) => step.title).join(' ')}`).includes(
        query,
      ),
    );
  }, [catalogSearch, sheets]);

  useEffect(() => {
    setSearch(selectedSheet?.name ?? '');
  }, [selectedSheet?.id, selectedSheet?.name]);

  const selectSheet = (sheet?: TechnicalSheetOption) => {
    onChange(sheet?.id ?? '');
    setSearch(sheet?.name ?? '');
    setOpen(false);
    setCatalogOpen(false);
  };

  return (
    <div className="operational-preset-field">
      <span>Fiche technique</span>
      <div className="operational-sheet-search">
        <div className="operational-sheet-search-row">
          <div className="operational-sheet-search-input">
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              role="combobox"
              aria-label="Rechercher une fiche technique"
              aria-expanded={open}
              aria-controls="operational-sheet-search-results"
              aria-autocomplete="list"
              placeholder="Rechercher une fiche technique…"
              value={search}
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setSearch(event.target.value);
                setOpen(true);
              }}
              onBlur={() => window.setTimeout(() => setOpen(false), 150)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
                if (event.key === 'Enter' && open) {
                  event.preventDefault();
                  if (filteredSheets[0]) selectSheet(filteredSheets[0]);
                }
              }}
            />
            {value ? (
              <button
                type="button"
                className="operational-sheet-search-clear"
                aria-label="Retirer la fiche technique"
                title="Tâche sans fiche technique"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSheet()}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="operational-sheet-catalog-trigger"
            title="Parcourir les fiches techniques"
            aria-label="Parcourir les fiches techniques"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setOpen(false);
              setCatalogSearch('');
              setCatalogOpen(true);
            }}
          >
            <ClipboardList size={17} />
          </button>
        </div>

        {open ? (
          <div
            id="operational-sheet-search-results"
            className="operational-sheet-search-results"
            role="listbox"
          >
            <button
              type="button"
              className={!value ? 'is-selected' : undefined}
              role="option"
              aria-selected={!value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSheet()}
            >
              <strong>Tâche sans fiche technique</strong>
              <small>Créer une tâche libre</small>
            </button>
            {filteredSheets.length ? (
              filteredSheets.map((sheet) => (
                <button
                  type="button"
                  key={sheet.id}
                  className={sheet.id === value ? 'is-selected' : undefined}
                  role="option"
                  aria-selected={sheet.id === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSheet(sheet)}
                >
                  <strong>{sheet.name}</strong>
                  <small>
                    {sheet.referencePortions == null
                      ? 'Portions non renseignées'
                      : `${sheet.referencePortions} portions`}
                    {sheet.steps.length
                      ? ` · ${sheet.steps.length} étape${sheet.steps.length > 1 ? 's' : ''}`
                      : ''}
                  </small>
                </button>
              ))
            ) : (
              <p>Aucune fiche technique trouvée.</p>
            )}
          </div>
        ) : null}
      </div>

      {catalogOpen ? (
        <div
          className="operational-sheet-catalog-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCatalogOpen(false);
          }}
        >
          <section
            className="operational-sheet-catalog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="operational-sheet-catalog-title"
          >
            <header>
              <div>
                <span>Catalogue de production</span>
                <h3 id="operational-sheet-catalog-title">Fiches techniques</h3>
                <p>Recherchez puis sélectionnez la préparation à planifier.</p>
              </div>
              <button
                type="button"
                aria-label="Fermer le catalogue"
                onClick={() => setCatalogOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="operational-sheet-catalog-search">
              <Search size={17} aria-hidden="true" />
              <input
                type="text"
                autoFocus
                placeholder="Rechercher par nom ou étape…"
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setCatalogOpen(false);
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (catalogSheets[0]) selectSheet(catalogSheets[0]);
                  }
                }}
              />
              {catalogSearch ? (
                <button
                  type="button"
                  aria-label="Effacer la recherche"
                  onClick={() => setCatalogSearch('')}
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <div className="operational-sheet-catalog-list">
              <button
                type="button"
                className={`operational-sheet-catalog-item${!value ? ' is-selected' : ''}`}
                onClick={() => selectSheet()}
              >
                <span className="operational-sheet-catalog-item-icon">
                  <Plus size={18} />
                </span>
                <span>
                  <strong>Tâche sans fiche technique</strong>
                  <small>Créer librement le nom, la quantité et les consignes.</small>
                </span>
              </button>
              {catalogSheets.map((sheet) => (
                <button
                  type="button"
                  key={sheet.id}
                  className={`operational-sheet-catalog-item${sheet.id === value ? ' is-selected' : ''}`}
                  onClick={() => selectSheet(sheet)}
                >
                  <span className="operational-sheet-catalog-item-icon">
                    <ChefHat size={18} />
                  </span>
                  <span>
                    <strong>{sheet.name}</strong>
                    <small>
                      {sheet.referencePortions == null
                        ? 'Portions non renseignées'
                        : `${sheet.referencePortions} portions`}
                      {sheet.totalTimeMinutes
                        ? ` · ${sheet.totalTimeMinutes} min`
                        : sheet.steps.length
                          ? ` · ${sheet.steps.length} étape${sheet.steps.length > 1 ? 's' : ''}`
                          : ''}
                    </small>
                  </span>
                  <span className="operational-sheet-catalog-select">Sélectionner</span>
                </button>
              ))}
              {!catalogSheets.length ? (
                <div className="operational-sheet-catalog-empty">
                  <Search size={24} />
                  <strong>Aucune fiche trouvée</strong>
                  <span>Essayez un autre nom ou le titre d’une étape.</span>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function emptyDraft(): Draft {
  return {
    contentMode: '',
    name: '',
    description: '',
    category: 'KITCHEN',
    departmentId: '',
    siteId: '',
    assignedEmployeeId: '',
    assignedEmployeeIds: [],
    positionId: '',
    positionTaskPresetId: '',
    technicalSheetId: '',
    technicalSheetStepId: '',
    serviceWeekdays: [6],
    leadDays: 1,
    startTime: '06:00',
    endTime: '10:00',
    quantity: '',
    unitLabel: '',
    startsOn: today(),
    endsOn: '',
    isActive: true,
  };
}

function weekdayName(day: number, style: 'long' | 'short' = 'long') {
  const reference = new Date(Date.UTC(2026, 7, 30 + day));
  return new Intl.DateTimeFormat(activeLocale(), { weekday: style, timeZone: 'UTC' }).format(
    reference,
  );
}

function preparationWeekday(serviceDay: number, leadDays: number) {
  return (((serviceDay - (leadDays % 7)) % 7) + 7) % 7;
}

function weekdayList(days: number[]) {
  return new Intl.ListFormat(activeLocale(), { style: 'long', type: 'conjunction' }).format(
    days.map((day) => weekdayName(day)),
  );
}

function scheduleDescription(draft: Draft) {
  if (!draft.serviceWeekdays.length) return 'Choisissez au moins un jour de service.';
  const preparationDays = Array.from(
    new Set(draft.serviceWeekdays.map((day) => preparationWeekday(day, draft.leadDays))),
  );
  const service = weekdayList(draft.serviceWeekdays);
  const preparation = draft.leadDays === 0 ? 'le même jour' : weekdayList(preparationDays);
  return `Service ${service}. Préparation ${preparation}, de ${draft.startTime} à ${draft.endTime}.`;
}

function endTimeFromDuration(startTime: string, durationMinutes?: number | null) {
  const [hours, minutes] = startTime.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return startTime;
  const total = Math.min(hours * 60 + minutes + Math.max(5, durationMinutes ?? 30), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function draftSignature(draft: Draft) {
  return JSON.stringify({
    ...draft,
    serviceWeekdays: [...draft.serviceWeekdays].sort((a, b) => a - b),
  });
}

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(activeLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function message(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Une erreur est survenue.';
}

function presetToDraft(preset: OperationalTaskPreset): Draft {
  return {
    contentMode: preset.positionTaskPresetId
      ? 'POSITION_TASK'
      : preset.technicalSheetId
        ? 'TECHNICAL_SHEET'
        : 'MANUAL',
    name: preset.name,
    description: preset.description ?? '',
    category: preset.category,
    departmentId: preset.departmentId,
    siteId: preset.siteId ?? ANY_SITE,
    assignedEmployeeId: preset.assignedEmployeeId,
    assignedEmployeeIds: presetEmployeeIds(preset),
    positionId: preset.positionId ?? '',
    positionTaskPresetId: preset.positionTaskPresetId ?? '',
    technicalSheetId: preset.technicalSheetId ?? '',
    technicalSheetStepId: preset.technicalSheetStepId ?? '',
    serviceWeekdays: preset.serviceWeekdays,
    leadDays: preset.leadDays,
    startTime: preset.startTime,
    endTime: preset.endTime,
    quantity: preset.technicalSheetId && preset.quantity != null ? String(preset.quantity) : '',
    unitLabel: preset.technicalSheetId ? (preset.unitLabel ?? '') : '',
    startsOn: preset.startsOn?.slice(0, 10) ?? '',
    endsOn: preset.endsOn?.slice(0, 10) ?? '',
    isActive: preset.isActive,
  };
}

function payload(draft: Draft): OperationalTaskPresetPayload {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    category: draft.category,
    departmentId: draft.departmentId,
    siteId: draft.siteId === ANY_SITE ? null : draft.siteId || null,
    assignedEmployeeId: draft.assignedEmployeeId,
    assignedEmployeeIds: draft.assignedEmployeeIds,
    positionId: draft.positionId || null,
    positionTaskPresetId: draft.positionTaskPresetId || null,
    technicalSheetId: draft.technicalSheetId || null,
    technicalSheetStepId: draft.technicalSheetStepId || null,
    serviceWeekdays: draft.serviceWeekdays,
    leadDays: draft.leadDays,
    startTime: draft.startTime,
    endTime: draft.endTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Helsinki',
    quantity: draft.quantity === '' ? null : Number(draft.quantity),
    unitLabel: draft.unitLabel.trim() || null,
    startsOn: draft.startsOn || null,
    endsOn: draft.endsOn || null,
    isActive: draft.isActive,
  };
}

export function OperationalPresetsApp({ token }: Props) {
  const [options, setOptions] = useState<OperationalTaskPresetOptions>({
    canManage: false,
    departments: [],
    sites: [],
    employees: [],
    positionTaskPresets: [],
    technicalSheets: [],
  });
  const [presets, setPresets] = useState<OperationalTaskPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<OperationalTaskPreset | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [initialDraft, setInitialDraft] = useState<Draft>(emptyDraft);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editorNotice, setEditorNotice] = useState('');
  const advancedRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextOptions, nextPresets] = await Promise.all([
        api.productionTaskPresetOptions(token),
        api.productionTaskPresets(token, {
          departmentId: departmentFilter || undefined,
          employeeId: employeeFilter || undefined,
        }),
      ]);
      setOptions(nextOptions);
      setPresets(nextPresets);
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, [departmentFilter, employeeFilter, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!advancedOpen) return;
    const frame = window.requestAnimationFrame(() => {
      advancedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [advancedOpen]);

  const filterEmployees = useMemo(
    () =>
      options.employees.filter(
        (employee) => !departmentFilter || employee.departmentId === departmentFilter,
      ),
    [departmentFilter, options.employees],
  );
  const selectedSheet = options.technicalSheets.find(
    (sheet) => sheet.id === draft.technicalSheetId,
  );
  const selectedEmployees = draft.assignedEmployeeIds
    .map((employeeId) => options.employees.find((employee) => employee.id === employeeId))
    .filter((employee): employee is OperationalTaskPresetOptions['employees'][number] =>
      Boolean(employee),
    );
  const selectedPositionIds = new Set(
    selectedEmployees.map((employee) => employee.positionId).filter(Boolean),
  );
  const availablePositionTaskPresets = (options.positionTaskPresets ?? []).filter((preset) =>
    selectedPositionIds.has(preset.positionId),
  );
  const positionTaskGroups = [
    ...new Set(availablePositionTaskPresets.map((preset) => preset.positionName)),
  ]
    .sort((left, right) => left.localeCompare(right, activeLocale()))
    .map((positionName) => ({
      positionName,
      tasks: availablePositionTaskPresets.filter((preset) => preset.positionName === positionName),
    }));
  const selectedPositionTask = availablePositionTaskPresets.find(
    (preset) => preset.positionId === draft.positionId && preset.id === draft.positionTaskPresetId,
  );
  const selectedDepartment = options.departments.find(
    (department) => department.id === draft.departmentId,
  );
  const selectedSite = options.sites.find((site) => site.id === draft.siteId);
  const hasMultipleSites = options.sites.length > 1;
  const siteHasBeenChosen = !hasMultipleSites || Boolean(draft.siteId);
  const effectiveSiteChoice = draft.siteId || options.sites[0]?.id || ANY_SITE;
  const siteEmployees = options.employees.filter((employee) =>
    employeeMatchesSite(employee, effectiveSiteChoice),
  );
  const availableDepartments = options.departments.filter((department) =>
    siteEmployees.some((employee) => employee.departmentId === department.id),
  );
  const departmentEmployees = siteEmployees.filter(
    (employee) => employee.departmentId === draft.departmentId,
  );
  const availablePositions = [
    ...new Map(
      departmentEmployees
        .filter((employee) => employee.position?.id)
        .map((employee) => [employee.position!.id, employee.position!]),
    ).values(),
  ].sort((left, right) => left.name.localeCompare(right.name, activeLocale()));
  const selectedPosition = availablePositions.find((position) => position.id === draft.positionId);
  const selectedStep = selectedSheet?.steps.find((step) => step.id === draft.technicalSheetStepId);
  const selectedCategory = CATEGORIES.find((category) => category.value === draft.category);
  const timeRangeInvalid = Boolean(
    draft.startTime && draft.endTime && draft.endTime <= draft.startTime,
  );
  const dateRangeInvalid = Boolean(draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn);
  const quantityInvalid = Boolean(
    selectedSheet &&
    draft.quantity !== '' &&
    (!Number.isFinite(Number(draft.quantity)) || Number(draft.quantity) < 0.001),
  );
  const advancedSummary = [
    selectedStep ? `Étape : ${selectedStep.title}` : '',
    draft.category !== 'KITCHEN' ? (selectedCategory?.label ?? '') : '',
    draft.startsOn && draft.startsOn !== today() ? `À partir du ${formatDate(draft.startsOn)}` : '',
    draft.endsOn ? `Jusqu’au ${formatDate(draft.endsOn)}` : '',
    draft.description.trim() ? 'Consignes ajoutées' : '',
    !draft.isActive ? 'En pause' : '',
  ].filter(Boolean);

  function employeesForScope(siteId: string, departmentId: string, positionId = '') {
    if (!siteId || !departmentId) return [];
    return options.employees.filter(
      (employee) =>
        employeeMatchesSite(employee, siteId) &&
        employee.departmentId === departmentId &&
        (!positionId || employee.positionId === positionId),
    );
  }

  function assignmentForScope(siteId: string, departmentId: string, positionId = '') {
    const employees = employeesForScope(siteId, departmentId, positionId);
    return {
      assignedEmployeeId: employees[0]?.id ?? '',
      assignedEmployeeIds: employees.map((employee) => employee.id),
    };
  }

  function createDraftFromFilters() {
    const next = emptyDraft();
    next.siteId =
      options.sites.length === 1 ? options.sites[0].id : options.sites.length ? '' : ANY_SITE;
    if (departmentFilter) next.departmentId = departmentFilter;
    if (employeeFilter) {
      const employee = options.employees.find((item) => item.id === employeeFilter);
      next.departmentId = employee?.departmentId ?? next.departmentId;
      next.positionId = employee?.positionId ?? '';
      next.siteId =
        options.sites.length === 1 ? options.sites[0].id : employee?.mainSiteId || '';
      Object.assign(next, assignmentForScope(next.siteId, next.departmentId, next.positionId));
    } else if (next.departmentId && next.siteId) {
      Object.assign(next, assignmentForScope(next.siteId, next.departmentId));
    }
    return next;
  }

  function openCreate() {
    const next = createDraftFromFilters();
    setEditing(null);
    setDraft(next);
    setInitialDraft(next);
    setAdvancedOpen(false);
    setEditorOpen(true);
    setEditorNotice('');
    setError('');
  }

  function openEdit(preset: OperationalTaskPreset) {
    const next = presetToDraft(preset);
    if (options.sites.length === 1) next.siteId = options.sites[0].id;
    if (!options.sites.length) next.siteId = ANY_SITE;
    if (hasMultipleSites && next.siteId === ANY_SITE) next.siteId = '';
    Object.assign(
      next,
      assignmentForScope(next.siteId, next.departmentId, next.positionId),
    );
    setEditing(preset);
    setDraft(next);
    setInitialDraft(next);
    setAdvancedOpen(false);
    setEditorOpen(true);
    setEditorNotice('');
    setError('');
  }

  function chooseSite(siteId: string) {
    setDraft((current) => ({
      ...current,
      siteId,
      departmentId: '',
      positionId: '',
      assignedEmployeeId: '',
      assignedEmployeeIds: [],
      positionTaskPresetId: '',
    }));
  }

  function chooseDepartment(departmentId: string) {
    setDraft((current) => {
      return {
        ...current,
        departmentId,
        positionId: '',
        positionTaskPresetId: '',
        ...assignmentForScope(current.siteId || effectiveSiteChoice, departmentId),
      };
    });
  }

  function choosePosition(positionId: string) {
    setDraft((current) => ({
      ...current,
      positionId,
      positionTaskPresetId: '',
      ...assignmentForScope(current.siteId || effectiveSiteChoice, current.departmentId, positionId),
    }));
  }

  function selectContentMode(contentMode: Exclude<PresetContentMode, '' | 'MANUAL'>) {
    setDraft((current) =>
      current.contentMode === contentMode
        ? current
        : {
            ...current,
            contentMode,
            name: '',
            description: '',
            category: contentMode === 'TECHNICAL_SHEET' ? 'KITCHEN' : current.category,
            positionTaskPresetId: '',
            technicalSheetId: '',
            technicalSheetStepId: '',
            quantity: '',
            unitLabel: '',
          },
    );
  }

  function selectPositionTask(value: string) {
    const separator = value.indexOf(':');
    const positionId = separator >= 0 ? value.slice(0, separator) : '';
    const taskId = separator >= 0 ? value.slice(separator + 1) : '';
    const task = availablePositionTaskPresets.find(
      (item) => item.positionId === positionId && item.id === taskId,
    );
    if (!task) {
      setDraft((current) => ({
        ...current,
        positionId: '',
        positionTaskPresetId: '',
        ...assignmentForScope(
          current.siteId || options.sites[0]?.id || ANY_SITE,
          current.departmentId,
        ),
        technicalSheetId: '',
        technicalSheetStepId: '',
        name: '',
        quantity: '',
        unitLabel: '',
      }));
      return;
    }
    setDraft((current) => ({
      ...current,
      contentMode: 'POSITION_TASK',
      positionId: task.positionId,
      positionTaskPresetId: task.id,
      ...assignmentForScope(
        current.siteId || options.sites[0]?.id || ANY_SITE,
        current.departmentId,
        task.positionId,
      ),
      category: task.category,
      name: task.title,
      description: task.description ?? '',
      technicalSheetId: '',
      technicalSheetStepId: '',
      quantity: '',
      unitLabel: '',
      endTime: task.requiresTechnicalSheet
        ? current.endTime
        : endTimeFromDuration(current.startTime, task.defaultDurationMinutes),
    }));
  }

  function selectTechnicalSheet(technicalSheetId: string) {
    const sheet = options.technicalSheets.find((item) => item.id === technicalSheetId);
    const taskTitle = selectedPositionTask?.title;
    const previousSuggestedName = selectedSheet
      ? taskTitle
        ? `${taskTitle} ${selectedSheet.name}`
        : `Préparer ${selectedSheet.name}`
      : (taskTitle ?? '');
    setDraft((value) => ({
      ...value,
      technicalSheetId,
      technicalSheetStepId: '',
      name:
        !value.name.trim() || value.name === previousSuggestedName || value.name === taskTitle
          ? sheet
            ? taskTitle
              ? `${taskTitle} ${sheet.name}`
              : `Préparer ${sheet.name}`
            : (taskTitle ?? '')
          : value.name,
      quantity: sheet
        ? sheet.referencePortions == null
          ? value.quantity
          : String(sheet.referencePortions)
        : '',
      unitLabel: sheet ? 'portions' : '',
      endTime: sheet ? endTimeFromDuration(value.startTime, sheet.totalTimeMinutes) : value.endTime,
    }));
  }

  function closeEditor() {
    if (saving) return;
    if (
      draftSignature(draft) !== draftSignature(initialDraft) &&
      !window.confirm('Abandonner les modifications apportées à ce preset ?')
    ) {
      return;
    }
    setEditorOpen(false);
    setEditing(null);
    setEditorNotice('');
    setError('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const createAnother = submitter?.value === 'create-another';
    if (hasMultipleSites && !draft.siteId) {
      setError('Choisissez d’abord le site concerné.');
      return;
    }
    if (!draft.assignedEmployeeIds.length || !draft.assignedEmployeeId || !draft.departmentId) {
      setError('Choisissez un service contenant au moins un collaborateur actif pour ce périmètre.');
      return;
    }
    if (!draft.contentMode) {
      setError('Choisissez une fiche technique ou une tâche liée au poste.');
      return;
    }
    if (draft.contentMode === 'TECHNICAL_SHEET' && !selectedSheet) {
      setError('Choisissez la fiche technique à préparer.');
      return;
    }
    if (draft.contentMode === 'POSITION_TASK' && !selectedPositionTask) {
      setError('Choisissez une tâche disponible pour le poste des collaborateurs.');
      return;
    }
    if (selectedPositionTask?.requiresTechnicalSheet && !selectedSheet) {
      setError('Cette tâche du poste nécessite une fiche technique.');
      return;
    }
    if (!draft.name.trim()) {
      setError('Donnez un nom à ce preset.');
      return;
    }
    if (!draft.serviceWeekdays.length) {
      setError('Choisissez au moins un jour de service.');
      return;
    }
    if (timeRangeInvalid) {
      setError('L’heure de fin doit être postérieure à l’heure de début.');
      return;
    }
    if (dateRangeInvalid) {
      setError('La date de fin doit être postérieure à la date de début.');
      setAdvancedOpen(true);
      return;
    }
    if (selectedSheet && quantityInvalid) {
      setError('La quantité doit être supérieure à zéro.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) await api.updateProductionTaskPreset(token, editing.id, payload(draft));
      else await api.createProductionTaskPreset(token, payload(draft));
      if (createAnother && !editing) {
        const next = createDraftFromFilters();
        setDraft(next);
        setInitialDraft(next);
        setAdvancedOpen(false);
        setEditorNotice('Preset créé. Vous pouvez maintenant en ajouter un autre.');
      } else {
        setEditorOpen(false);
        setEditing(null);
        setEditorNotice('');
      }
      await load();
    } catch (saveError) {
      setError(message(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(preset: OperationalTaskPreset) {
    setBusyId(preset.id);
    setError('');
    try {
      const next = presetToDraft(preset);
      next.isActive = !preset.isActive;
      await api.updateProductionTaskPreset(token, preset.id, payload(next));
      await load();
    } catch (toggleError) {
      setError(message(toggleError));
    } finally {
      setBusyId('');
    }
  }

  async function archive(preset: OperationalTaskPreset) {
    if (!window.confirm(`Supprimer le preset « ${preset.name} » ?`)) return;
    setBusyId(preset.id);
    setError('');
    try {
      await api.archiveProductionTaskPreset(token, preset.id);
      await load();
    } catch (archiveError) {
      setError(message(archiveError));
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="operational-presets-workspace">
      <header className="production-hero-card operational-presets-hero">
        <div className="production-hero-glow" />
        <div className="operational-presets-hero-content">
          <div>
            <div className="production-hero-badge">
              <Repeat2 size={13} /> Presets récurrents
            </div>
            <h2 className="production-hero-title">Planning opérationnel automatique</h2>
            <p className="production-hero-desc">
              Attribuez les préparations récurrentes par site, service et poste. Elles sont
              déposées automatiquement au bon jour et à la bonne heure dans le planning.
            </p>
          </div>
          {options.canManage && (
            <button type="button" className="production-btn-primary" onClick={openCreate}>
              <Plus size={18} /> Nouveau preset
            </button>
          )}
        </div>
      </header>

      <div className="production-panel operational-presets-toolbar">
        <label>
          <span>Service</span>
          <select
            value={departmentFilter}
            onChange={(event) => {
              setDepartmentFilter(event.target.value);
              setEmployeeFilter('');
            }}
          >
            <option value="">Tous les services</option>
            {options.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Collaborateur</span>
          <select
            value={employeeFilter}
            onChange={(event) => setEmployeeFilter(event.target.value)}
          >
            <option value="">Tous les collaborateurs</option>
            {filterEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} {employee.lastName}
              </option>
            ))}
          </select>
        </label>
        <div className="operational-presets-count">
          <strong>{presets.length}</strong>
          <span>preset{presets.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {error && !editorOpen && (
        <div className="operational-presets-error">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <div className="operational-presets-loading">
          <Loader2 size={22} className="spin" /> Chargement des presets…
        </div>
      ) : presets.length ? (
        <div className="operational-presets-grid">
          {presets.map((preset) => {
            const team = (preset.assignments ?? [])
              .map((assignment) => assignment.employee)
              .filter((employee): employee is OperationalTaskPresetOptions['employees'][number] =>
                Boolean(employee),
              );
            const teamNames = (
              team.length ? team : preset.assignedEmployee ? [preset.assignedEmployee] : []
            )
              .map(employeeName)
              .join(', ');
            return (
              <article
                key={preset.id}
                className={`operational-preset-card${preset.isActive ? '' : ' is-inactive'}`}
              >
                <div className="operational-preset-card-heading">
                  <div className="operational-preset-icon">
                    {preset.technicalSheet ? (
                      <ChefHat size={20} />
                    ) : preset.positionTaskPresetId ? (
                      <ClipboardList size={20} />
                    ) : (
                      <Repeat2 size={20} />
                    )}
                  </div>
                  <div>
                    <span>{preset.department?.name ?? 'Service'}</span>
                    <h3>{preset.name}</h3>
                  </div>
                  <button
                    type="button"
                    className={`operational-preset-state${preset.isActive ? ' is-active' : ''}`}
                    disabled={!options.canManage || busyId === preset.id}
                    onClick={() => void toggle(preset)}
                  >
                    {preset.isActive ? 'Actif' : 'En pause'}
                  </button>
                </div>

                <div className="operational-preset-facts">
                  <span>
                    <CalendarDays size={15} />
                    Service {preset.serviceWeekdays.map((day) => weekdayName(day)).join(', ')}
                  </span>
                  <span>
                    <Clock3 size={15} />
                    Préparation{' '}
                    {preset.serviceWeekdays
                      .map((day) => weekdayName(preparationWeekday(day, preset.leadDays)))
                      .join(', ')}{' '}
                    · {preset.startTime}–{preset.endTime}
                  </span>
                  <span>
                    <UsersRound size={15} /> {teamNames || 'Équipe non renseignée'}
                  </span>
                  {preset.site && (
                    <span>
                      <MapPin size={15} /> {preset.site.name}
                    </span>
                  )}
                </div>

                <div className="operational-preset-summary">
                  {preset.technicalSheet && <strong>{preset.technicalSheet.name}</strong>}
                  {preset.positionTaskPresetId && preset.position ? (
                    <strong>Tâche du poste · {preset.position.name}</strong>
                  ) : null}
                  {preset.quantity != null && (
                    <span>
                      {String(preset.quantity)} {preset.unitLabel || 'portions'}
                    </span>
                  )}
                  {(preset.startsOn || preset.endsOn) && (
                    <small>
                      {preset.startsOn ? `Du ${formatDate(preset.startsOn)}` : 'Sans début'} ·{' '}
                      {preset.endsOn ? `au ${formatDate(preset.endsOn)}` : 'sans fin'}
                    </small>
                  )}
                </div>

                {options.canManage && (
                  <div className="operational-preset-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => openEdit(preset)}
                    >
                      <Edit3 size={15} /> Modifier
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary danger"
                      disabled={busyId === preset.id}
                      onClick={() => void archive(preset)}
                    >
                      {busyId === preset.id ? (
                        <Loader2 size={15} className="spin" />
                      ) : (
                        <Trash2 size={15} />
                      )}
                      Supprimer
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="operational-presets-empty">
          <Repeat2 size={30} />
          <strong>Aucun preset opérationnel</strong>
          <span>
            Créez par exemple « Croissants du samedi » avec une préparation automatique le vendredi.
          </span>
          {options.canManage && (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus size={16} /> Créer le premier preset
            </button>
          )}
        </div>
      )}

      {editorOpen && (
        <div
          className="modal-overlay operational-preset-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <form
            className="modal-card hr-modal hr-collaborator-modal operational-preset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="operational-preset-title"
            onSubmit={save}
          >
            <div className="modal-header hr-modal-sticky">
              <div>
                <span className="operational-preset-modal-kicker">Récurrence opérationnelle</span>
                <h2 id="operational-preset-title">
                  {editing ? 'Modifier le preset' : 'Nouveau preset'}
                </h2>
                <p>Définissez le périmètre, le contenu et la récurrence de cette opération.</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                aria-label="Fermer"
                onClick={closeEditor}
                disabled={saving}
              >
                <X size={20} />
              </button>
            </div>
            <div className="hr-collaborator-body operational-preset-form">
              {error && (
                <div className="operational-presets-error" role="alert">
                  <AlertCircle size={18} /> {error}
                </div>
              )}
              {editorNotice && (
                <div className="operational-preset-notice" role="status">
                  {editorNotice}
                </div>
              )}

              <section className="operational-preset-section operational-preset-assignees-section">
                <div className="operational-preset-section-heading">
                  <span className="operational-preset-section-icon">
                    <UsersRound size={18} />
                  </span>
                  <div>
                    <h3>Qui s’en charge ?</h3>
                    <p>Choisissez le site, le service, puis tous les postes ou un poste précis.</p>
                  </div>
                </div>

                {hasMultipleSites ? (
                  <label className="operational-preset-site-choice">
                    <span>Dans quel site ?</span>
                    <select
                      value={draft.siteId}
                      onChange={(event) => chooseSite(event.target.value)}
                    >
                      <option value="">Choisir un site avant l’équipe…</option>
                      {options.sites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : options.sites[0] ? (
                  <div className="operational-preset-site-context">
                    <MapPin size={17} />
                    <span>
                      <strong>{options.sites[0].name}</strong>
                      <small>Site unique · sélection automatique</small>
                    </span>
                  </div>
                ) : null}

                {siteHasBeenChosen ? (
                  <div className="operational-preset-scope-picker">
                    <div className="operational-preset-scope-grid">
                      <label>
                        <span>Service</span>
                        <select
                          value={draft.departmentId}
                          onChange={(event) => chooseDepartment(event.target.value)}
                        >
                          <option value="">Choisir un service…</option>
                          {availableDepartments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Poste</span>
                        <select
                          value={draft.positionId}
                          disabled={!draft.departmentId}
                          onChange={(event) => choosePosition(event.target.value)}
                        >
                          <option value="">Libre — tous les postes du service</option>
                          {availablePositions.map((position) => (
                            <option key={position.id} value={position.id}>
                              {position.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {draft.departmentId ? (
                      <div className="operational-preset-scope-summary" aria-live="polite">
                        <span>
                          <MapPin size={15} />
                          {selectedSite?.name ?? options.sites[0]?.name ?? 'Site'}
                        </span>
                        <span>
                          <UsersRound size={15} />
                          {selectedDepartment?.name ?? 'Service'}
                        </span>
                        <span>
                          <ClipboardList size={15} />
                          {selectedPosition?.name ?? 'Tous les postes du service'}
                        </span>
                        <strong>
                          {selectedEmployees.length} collaborateur
                          {selectedEmployees.length > 1 ? 's' : ''} concerné
                          {selectedEmployees.length > 1 ? 's' : ''}
                        </strong>
                      </div>
                    ) : null}

                    {draft.departmentId && !selectedEmployees.length ? (
                      <p className="operational-preset-team-empty" role="alert">
                        Aucun collaborateur actif ne correspond à ce site, ce service et ce poste.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="operational-preset-site-required">
                    <MapPin size={18} />
                    <span>
                      Choisissez d’abord un site pour afficher ses services et ses postes.
                    </span>
                  </div>
                )}
              </section>

              <section className="operational-preset-section operational-preset-content-section">
                <div className="operational-preset-section-heading">
                  <span className="operational-preset-section-icon">
                    <ChefHat size={18} />
                  </span>
                  <div>
                    <h3>Quoi préparer ?</h3>
                    <p>
                      {selectedEmployees.length
                        ? 'Choisissez une fiche technique ou une tâche liée au poste.'
                        : 'Définissez d’abord le site, le service et le poste.'}
                    </p>
                  </div>
                </div>
                {!selectedEmployees.length ? (
                  <div className="operational-preset-content-required">
                    <UsersRound size={18} />
                    <span>Le contenu proposé dépend du périmètre sélectionné.</span>
                  </div>
                ) : (
                  <>
                    <div
                      className="operational-preset-content-modes"
                      role="group"
                      aria-label="Type de preset"
                    >
                      <button
                        type="button"
                        className={draft.contentMode === 'TECHNICAL_SHEET' ? 'is-selected' : ''}
                        aria-pressed={draft.contentMode === 'TECHNICAL_SHEET'}
                        onClick={() => selectContentMode('TECHNICAL_SHEET')}
                      >
                        <ChefHat size={18} />
                        <span>
                          <strong>Fiche technique</strong>
                          <small>Préparation et quantités</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={draft.contentMode === 'POSITION_TASK' ? 'is-selected' : ''}
                        aria-pressed={draft.contentMode === 'POSITION_TASK'}
                        onClick={() => selectContentMode('POSITION_TASK')}
                      >
                        <ClipboardList size={18} />
                        <span>
                          <strong>Tâche du poste</strong>
                          <small>Depuis les réglages RH</small>
                        </span>
                      </button>
                    </div>

                    {draft.contentMode ? (
                      <div className="operational-preset-form-grid operational-preset-what-grid">
                        {draft.contentMode === 'POSITION_TASK' ? (
                          <label className="is-wide">
                            <span>Tâche attitrée au poste</span>
                            <select
                              value={
                                draft.positionId && draft.positionTaskPresetId
                                  ? `${draft.positionId}:${draft.positionTaskPresetId}`
                                  : ''
                              }
                              onChange={(event) => selectPositionTask(event.target.value)}
                            >
                              <option value="">Choisir une tâche…</option>
                              {positionTaskGroups.map((group) => (
                                <optgroup key={group.positionName} label={group.positionName}>
                                  {group.tasks.map((task) => (
                                    <option
                                      key={`${task.positionId}:${task.id}`}
                                      value={`${task.positionId}:${task.id}`}
                                    >
                                      {task.title}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            {!availablePositionTaskPresets.length ? (
                              <small className="operational-preset-field-error">
                                Aucune tâche n’est configurée pour les postes sélectionnés.
                              </small>
                            ) : null}
                          </label>
                        ) : null}

                        {draft.contentMode === 'TECHNICAL_SHEET' ||
                        selectedPositionTask?.requiresTechnicalSheet ? (
                          <TechnicalSheetSearch
                            sheets={options.technicalSheets}
                            value={draft.technicalSheetId}
                            onChange={selectTechnicalSheet}
                          />
                        ) : null}

                        <label className="is-wide">
                          <span>Nom du preset</span>
                          <input
                            required
                            maxLength={180}
                            value={draft.name}
                            placeholder="Ex. Croissants du samedi"
                            onChange={(event) =>
                              setDraft((value) => ({ ...value, name: event.target.value }))
                            }
                          />
                        </label>
                        {selectedSheet ? (
                          <>
                            <label>
                              <span>Quantité</span>
                              <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                aria-invalid={quantityInvalid}
                                value={draft.quantity}
                                onChange={(event) =>
                                  setDraft((value) => ({ ...value, quantity: event.target.value }))
                                }
                              />
                              {quantityInvalid && (
                                <small className="operational-preset-field-error">
                                  La quantité doit être supérieure à zéro.
                                </small>
                              )}
                            </label>
                            <label>
                              <span>Unité</span>
                              <input
                                maxLength={40}
                                value={draft.unitLabel}
                                placeholder="portions"
                                onChange={(event) =>
                                  setDraft((value) => ({ ...value, unitLabel: event.target.value }))
                                }
                              />
                            </label>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <p className="operational-preset-content-hint">
                        Les tâches affichées sont celles définies dans RH → Postes → Tâches.
                      </p>
                    )}
                  </>
                )}
              </section>

              <section className="operational-preset-section operational-preset-schedule-section">
                <div className="operational-preset-section-heading">
                  <span className="operational-preset-section-icon">
                    <CalendarDays size={18} />
                  </span>
                  <div>
                    <h3>Quand ?</h3>
                    <p>Définissez le rythme de service et de préparation.</p>
                  </div>
                </div>
                <fieldset className="operational-preset-days">
                  <legend>Jours de service</legend>
                  <div>
                    {WEEKDAYS.map((day) => {
                      const selected = draft.serviceWeekdays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={selected}
                          title={weekdayName(day)}
                          className={selected ? 'is-selected' : ''}
                          onClick={() =>
                            setDraft((value) => ({
                              ...value,
                              serviceWeekdays: selected
                                ? value.serviceWeekdays.filter((item) => item !== day)
                                : [...value.serviceWeekdays, day],
                            }))
                          }
                        >
                          {weekdayName(day, 'short')}
                        </button>
                      );
                    })}
                  </div>
                  {!draft.serviceWeekdays.length && (
                    <small className="operational-preset-field-error">
                      Sélectionnez au moins un jour.
                    </small>
                  )}
                </fieldset>
                <div className="operational-preset-schedule-grid">
                  <label>
                    <span>Préparer</span>
                    <select
                      value={draft.leadDays}
                      onChange={(event) =>
                        setDraft((value) => ({
                          ...value,
                          leadDays: Number(event.target.value),
                        }))
                      }
                    >
                      {Array.from({ length: 15 }, (_, days) => (
                        <option key={days} value={days}>
                          {days === 0 ? 'Le même jour' : `${days} jour${days > 1 ? 's' : ''} avant`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Début</span>
                    <input
                      type="time"
                      required
                      aria-invalid={timeRangeInvalid}
                      value={draft.startTime}
                      onChange={(event) =>
                        setDraft((value) => ({ ...value, startTime: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>Fin</span>
                    <input
                      type="time"
                      required
                      aria-invalid={timeRangeInvalid}
                      value={draft.endTime}
                      onChange={(event) =>
                        setDraft((value) => ({ ...value, endTime: event.target.value }))
                      }
                    />
                  </label>
                </div>
                {timeRangeInvalid && (
                  <small className="operational-preset-field-error">
                    L’heure de fin doit être postérieure à l’heure de début.
                  </small>
                )}
                <div className="operational-preset-preview" aria-live="polite">
                  <Repeat2 size={17} />
                  <span>{scheduleDescription(draft)}</span>
                </div>
              </section>

              <div
                ref={advancedRef}
                className={`operational-preset-advanced${advancedOpen ? ' is-open' : ''}`}
              >
                <button
                  type="button"
                  className="operational-preset-advanced-toggle"
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((value) => !value)}
                >
                  <span className="operational-preset-advanced-label">
                    <SlidersHorizontal size={17} />
                    <span>
                      <strong>Paramètres avancés</strong>
                      <small>
                        {advancedSummary.length
                          ? `${advancedSummary.length} réglage${advancedSummary.length > 1 ? 's' : ''} personnalisé${advancedSummary.length > 1 ? 's' : ''}`
                          : 'Facultatif'}
                      </small>
                    </span>
                  </span>
                  <ChevronDown size={18} />
                </button>
                {!advancedOpen && advancedSummary.length > 0 && (
                  <div className="operational-preset-advanced-summary">
                    {advancedSummary.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                )}
                {advancedOpen && (
                  <div className="operational-preset-advanced-panel">
                    <div className="operational-preset-form-grid">
                      {selectedSheet?.steps.length ? (
                        <label className="is-wide">
                          <span>Étape précise de la fiche</span>
                          <select
                            value={draft.technicalSheetStepId}
                            onChange={(event) =>
                              setDraft((value) => ({
                                ...value,
                                technicalSheetStepId: event.target.value,
                              }))
                            }
                          >
                            <option value="">Fiche complète</option>
                            {selectedSheet.steps.map((step) => (
                              <option key={step.id} value={step.id}>
                                {step.order}. {step.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label>
                        <span>Catégorie</span>
                        <select
                          value={draft.category}
                          onChange={(event) =>
                            setDraft((value) => ({
                              ...value,
                              category: event.target.value as OperationalTaskCategory,
                            }))
                          }
                        >
                          {CATEGORIES.map((category) => (
                            <option key={category.value} value={category.value}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Actif à partir du</span>
                        <input
                          type="date"
                          aria-invalid={dateRangeInvalid}
                          value={draft.startsOn}
                          onChange={(event) =>
                            setDraft((value) => ({ ...value, startsOn: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span>Fin de récurrence</span>
                        <input
                          type="date"
                          aria-invalid={dateRangeInvalid}
                          value={draft.endsOn}
                          onChange={(event) =>
                            setDraft((value) => ({ ...value, endsOn: event.target.value }))
                          }
                        />
                      </label>
                      {dateRangeInvalid && (
                        <small className="operational-preset-field-error is-wide">
                          La fin de récurrence doit être postérieure à la date de début.
                        </small>
                      )}
                      <label className="is-wide">
                        <span>Consignes</span>
                        <textarea
                          rows={3}
                          maxLength={4000}
                          value={draft.description}
                          placeholder="Consignes visibles dans le planning opérationnel"
                          onChange={(event) =>
                            setDraft((value) => ({ ...value, description: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <label className="operational-preset-active-toggle">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(event) =>
                          setDraft((value) => ({ ...value, isActive: event.target.checked }))
                        }
                      />
                      <span>Activer immédiatement ce preset</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions hr-modal-footer operational-preset-footer">
              {!editing ? (
                <button
                  type="submit"
                  className="btn btn-secondary operational-preset-footer-more"
                  name="saveMode"
                  value="create-another"
                  disabled={saving}
                >
                  Créer et en ajouter un autre
                </button>
              ) : (
                <span className="muted">Modifiez le périmètre ou la récurrence du preset.</span>
              )}
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeEditor}
                  disabled={saving}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  name="saveMode"
                  value="save"
                  disabled={saving}
                >
                  {saving ? <Loader2 size={16} className="spin" /> : <Repeat2 size={16} />}
                  {editing ? 'Enregistrer' : 'Créer le preset'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

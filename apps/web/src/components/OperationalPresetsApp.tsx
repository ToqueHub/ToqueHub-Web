import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChefHat,
  Clock3,
  Edit3,
  Loader2,
  MapPin,
  Plus,
  Repeat2,
  Trash2,
  UserRound,
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

type Draft = {
  name: string;
  description: string;
  category: OperationalTaskCategory;
  departmentId: string;
  siteId: string;
  assignedEmployeeId: string;
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

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function emptyDraft(): Draft {
  return {
    name: '',
    description: '',
    category: 'KITCHEN',
    departmentId: '',
    siteId: '',
    assignedEmployeeId: '',
    technicalSheetId: '',
    technicalSheetStepId: '',
    serviceWeekdays: [6],
    leadDays: 1,
    startTime: '06:00',
    endTime: '10:00',
    quantity: '1',
    unitLabel: 'portions',
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
    name: preset.name,
    description: preset.description ?? '',
    category: preset.category,
    departmentId: preset.departmentId,
    siteId: preset.siteId ?? '',
    assignedEmployeeId: preset.assignedEmployeeId,
    technicalSheetId: preset.technicalSheetId ?? '',
    technicalSheetStepId: preset.technicalSheetStepId ?? '',
    serviceWeekdays: preset.serviceWeekdays,
    leadDays: preset.leadDays,
    startTime: preset.startTime,
    endTime: preset.endTime,
    quantity: preset.quantity == null ? '' : String(preset.quantity),
    unitLabel: preset.unitLabel ?? '',
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
    siteId: draft.siteId || null,
    assignedEmployeeId: draft.assignedEmployeeId,
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

  const employeesForDepartment = useMemo(
    () =>
      options.employees.filter(
        (employee) => !draft.departmentId || employee.departmentId === draft.departmentId,
      ),
    [draft.departmentId, options.employees],
  );
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

  function openCreate() {
    const next = emptyDraft();
    if (departmentFilter) next.departmentId = departmentFilter;
    if (employeeFilter) {
      const employee = options.employees.find((item) => item.id === employeeFilter);
      next.assignedEmployeeId = employeeFilter;
      next.departmentId = employee?.departmentId ?? next.departmentId;
      next.siteId = employee?.mainSiteId ?? '';
    }
    setEditing(null);
    setDraft(next);
    setEditorOpen(true);
    setError('');
  }

  function openEdit(preset: OperationalTaskPreset) {
    setEditing(preset);
    setDraft(presetToDraft(preset));
    setEditorOpen(true);
    setError('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      !draft.name.trim() ||
      !draft.departmentId ||
      !draft.assignedEmployeeId ||
      !draft.serviceWeekdays.length
    ) {
      setError('Indiquez un nom, un service, un collaborateur et au moins un jour.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) await api.updateProductionTaskPreset(token, editing.id, payload(draft));
      else await api.createProductionTaskPreset(token, payload(draft));
      setEditorOpen(false);
      setEditing(null);
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
              Attribuez les préparations récurrentes par service et collaborateur. Elles sont
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
          {presets.map((preset) => (
            <article
              key={preset.id}
              className={`operational-preset-card${preset.isActive ? '' : ' is-inactive'}`}
            >
              <div className="operational-preset-card-heading">
                <div className="operational-preset-icon">
                  {preset.technicalSheet ? <ChefHat size={20} /> : <Repeat2 size={20} />}
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
                  <UserRound size={15} /> {preset.assignedEmployee?.firstName}{' '}
                  {preset.assignedEmployee?.lastName}
                </span>
                {preset.site && (
                  <span>
                    <MapPin size={15} /> {preset.site.name}
                  </span>
                )}
              </div>

              <div className="operational-preset-summary">
                {preset.technicalSheet && <strong>{preset.technicalSheet.name}</strong>}
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
          ))}
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
            if (event.target === event.currentTarget && !saving) setEditorOpen(false);
          }}
        >
          <form className="modal-content operational-preset-modal" onSubmit={save}>
            <div className="modal-header">
              <div>
                <span className="operational-preset-modal-kicker">Récurrence opérationnelle</span>
                <h2>{editing ? 'Modifier le preset' : 'Nouveau preset'}</h2>
              </div>
              <button type="button" onClick={() => setEditorOpen(false)} disabled={saving}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body operational-preset-form">
              {error && (
                <div className="operational-presets-error">
                  <AlertCircle size={18} /> {error}
                </div>
              )}
              <div className="operational-preset-form-grid">
                <label className="is-wide">
                  <span>Nom du preset</span>
                  <input
                    required
                    value={draft.name}
                    placeholder="Ex. Croissants du samedi"
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, name: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Service responsable</span>
                  <select
                    required
                    value={draft.departmentId}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        departmentId: event.target.value,
                        assignedEmployeeId: '',
                      }))
                    }
                  >
                    <option value="">Choisir…</option>
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
                    required
                    value={draft.assignedEmployeeId}
                    onChange={(event) => {
                      const employee = options.employees.find(
                        (item) => item.id === event.target.value,
                      );
                      setDraft((value) => ({
                        ...value,
                        assignedEmployeeId: event.target.value,
                        siteId: value.siteId || employee?.mainSiteId || '',
                      }));
                    }}
                  >
                    <option value="">Choisir…</option>
                    {employeesForDepartment.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.firstName} {employee.lastName} · {employee.position?.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Site</span>
                  <select
                    value={draft.siteId}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, siteId: event.target.value }))
                    }
                  >
                    <option value="">Site du collaborateur</option>
                    {options.sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </label>
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
              </div>

              <fieldset className="operational-preset-days">
                <legend>Jour(s) où le produit est servi</legend>
                <div>
                  {WEEKDAYS.map((day) => {
                    const selected = draft.serviceWeekdays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
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
              </fieldset>

              <div className="operational-preset-form-grid">
                <label>
                  <span>Préparer combien de jours avant ?</span>
                  <input
                    type="number"
                    min="0"
                    max="14"
                    value={draft.leadDays}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, leadDays: Number(event.target.value) }))
                    }
                  />
                </label>
                <div className="operational-preset-preview">
                  <Repeat2 size={16} />
                  <span>
                    {draft.serviceWeekdays.length
                      ? `${draft.serviceWeekdays.map((day) => weekdayName(day)).join(', ')} → ${draft.serviceWeekdays.map((day) => weekdayName(preparationWeekday(day, draft.leadDays))).join(', ')}`
                      : 'Choisissez au moins un jour'}
                  </span>
                </div>
                <label>
                  <span>Heure de début</span>
                  <input
                    type="time"
                    required
                    value={draft.startTime}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, startTime: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Heure de fin</span>
                  <input
                    type="time"
                    required
                    value={draft.endTime}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, endTime: event.target.value }))
                    }
                  />
                </label>
                <label className="is-wide">
                  <span>Fiche technique à produire</span>
                  <select
                    value={draft.technicalSheetId}
                    onChange={(event) => {
                      const sheet = options.technicalSheets.find(
                        (item) => item.id === event.target.value,
                      );
                      setDraft((value) => ({
                        ...value,
                        technicalSheetId: event.target.value,
                        technicalSheetStepId: '',
                        name: value.name || (sheet ? `Préparer ${sheet.name}` : ''),
                        quantity:
                          sheet?.referencePortions == null
                            ? value.quantity
                            : String(sheet.referencePortions),
                        unitLabel: sheet ? 'portions' : value.unitLabel,
                      }));
                    }}
                  >
                    <option value="">Tâche sans fiche technique</option>
                    {options.technicalSheets.map((sheet) => (
                      <option key={sheet.id} value={sheet.id}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedSheet?.steps.length ? (
                  <label className="is-wide">
                    <span>Étape précise (optionnel)</span>
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
                  <span>Nombre de portions</span>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={draft.quantity}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, quantity: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Unité</span>
                  <input
                    value={draft.unitLabel}
                    placeholder="portions"
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, unitLabel: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Actif à partir du</span>
                  <input
                    type="date"
                    value={draft.startsOn}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, startsOn: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Fin de récurrence (optionnel)</span>
                  <input
                    type="date"
                    value={draft.endsOn}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, endsOn: event.target.value }))
                    }
                  />
                </label>
                <label className="is-wide">
                  <span>Consignes</span>
                  <textarea
                    rows={3}
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
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditorOpen(false)}
                disabled={saving}
              >
                Annuler
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Loader2 size={16} className="spin" /> : <Repeat2 size={16} />}
                {editing ? 'Enregistrer' : 'Créer le preset'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

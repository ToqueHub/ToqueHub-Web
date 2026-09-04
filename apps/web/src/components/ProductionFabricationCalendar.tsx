import { activeLocale } from '../i18n/runtime';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crown,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import {
  TechnicalSheetPickerModal,
  type TechnicalSheetPickerItem,
} from './TechnicalSheetPickerModal';
import type {
  HrDepartment,
  ProductionCampaign,
  ProductionDayClosure,
  ProductionDayClosureItem,
  ProductionDayValidation,
  ProductionProfile,
  MenuPlan,
  OperationalTaskAssignee,
  Site,
} from '../types';

type CalendarMode = 'day' | 'week' | 'month';
type ProductionQuantityMode = 'PORTIONS' | 'MASS';

type Props = {
  token: string;
  campaigns: ProductionCampaign[];
  profiles: ProductionProfile[];
  sites: Site[];
  defaultSiteId?: string;
  departments: HrDepartment[];
  loading: boolean;
  focusDate?: string;
  focusMode?: CalendarMode;
  campaignIds?: Set<string>;
  onRefresh: () => Promise<void> | void;
  children?: ReactNode;
  onContextChange?: (context: {
    startDate: string;
    endDate: string;
    siteId: string;
    mode: CalendarMode;
    label: string;
  }) => void;
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Brouillon',
  PROPOSED: 'À valider',
  PLANNED: 'Planifiée',
  VALIDATED: 'Planifiée',
  IN_PROGRESS: 'En cours',
  PARTIALLY_COMPLETED: 'En cours',
  COMPLETED: 'Terminée',
  BLOCKED: 'Bloquée',
  CANCELLED: 'Annulée',
};

function dayKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function parseDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
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

function startOfMonth(value: string) {
  const date = parseDay(value);
  date.setDate(1);
  return dayKey(date);
}

function monthGridStart(value: string) {
  return startOfWeek(startOfMonth(value));
}

function formatDay(value: string, compact = false) {
  return new Intl.DateTimeFormat(
    activeLocale(),
    compact
      ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  )
    .format(parseDay(value))
    .replace(/^./, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Une erreur est survenue.';
}

function menuItemName(item: NonNullable<MenuPlan['items']>[number]) {
  return item.technicalSheet?.name ?? item.product?.name ?? 'Produit du menu';
}

function menuPortions(menu: MenuPlan, item: NonNullable<MenuPlan['items']>[number]) {
  if (item.portionsOverride != null) return Number(item.portionsOverride);
  const guests = Number(menu.totalGuests ?? menu.expectedGuests ?? menu.guestCount ?? 0);
  return menu.activity === 'RESTAURANT_CAFE' ? guests : guests * Number(item.servingQuantity ?? 1);
}

function menuServiceLabel(service: MenuPlan['service']) {
  return (
    {
      BREAKFAST: 'Petit-déjeuner',
      LUNCH: 'Déjeuner',
      DINNER: 'Dîner',
      SNACK: 'Vitrine / snack',
      EVENT: 'Événement',
      BUFFET: 'Buffet',
    }[service] ?? service
  );
}

function collaboratorName(employee: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  return (
    [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() ||
    employee.email ||
    'Collaborateur'
  );
}

function campaignDurationMinutes(campaign: ProductionCampaign) {
  // Les lots d'une même campagne reprennent les mêmes opérations et peuvent être
  // réalisés en parallèle. Les additionner multiplierait artificiellement la durée de
  // la recette par le nombre de lots (50 lots de 31 min devenaient une tâche de 25 h 50).
  const operationMinutes = Math.max(
    0,
    ...(campaign.batches ?? []).map((batch) =>
      (batch.operations ?? []).reduce(
        (batchTotal, operation) => batchTotal + Math.max(Number(operation.activeMinutes ?? 0), 0),
        0,
      ),
    ),
  );
  return Math.max(operationMinutes, 60);
}

function campaignShortages(campaign: ProductionCampaign) {
  return (campaign.requirements ?? []).filter((requirement) =>
    ['INSUFFICIENT_STOCK', 'UNIT_NOT_CONVERTIBLE', 'PRODUCT_ARCHIVED'].includes(requirement.status),
  );
}

function campaignIsEditable(campaign: ProductionCampaign) {
  return (
    ['DRAFT', 'PROPOSED', 'PLANNED', 'BLOCKED'].includes(campaign.status) &&
    (campaign.batches ?? []).every((batch) => batch.status === 'TO_PREPARE')
  );
}

function productionQuantityPlan(
  profile: ProductionProfile | undefined,
  mode: ProductionQuantityMode,
  target: number,
) {
  const sheet = profile?.technicalSheet;
  const referencePortions = Number(sheet?.referencePortions ?? 0);
  const totalMassGrams = Number(sheet?.totalMassGrams ?? 0);
  const referenceYield = Number(profile?.referenceYield ?? 0);
  const validTarget = Number.isFinite(target) && target > 0;
  const factor =
    mode === 'MASS'
      ? validTarget && totalMassGrams > 0
        ? (target * 1000) / totalMassGrams
        : 0
      : validTarget && referencePortions > 0
        ? target / referencePortions
        : 0;
  return {
    factor,
    grossRequirement: referenceYield * factor,
    portions: referencePortions > 0 ? referencePortions * factor : null,
    massKilograms: totalMassGrams > 0 ? (totalMassGrams * factor) / 1000 : null,
  };
}

function profileDurationMinutes(profile: ProductionProfile | undefined) {
  const sheet = profile?.technicalSheet;
  const stepMinutes = (sheet?.steps ?? []).reduce(
    (total, step) =>
      total +
      Math.max(
        Number(
          step.estimatedTimeMinutes ??
            (step as typeof step & { estimatedMinutes?: number | string | null })
              .estimatedMinutes ??
            0,
        ),
        0,
      ),
    0,
  );
  return Math.max(Number(sheet?.totalTimeMinutes ?? 0), stepMinutes, 30);
}

function campaignTargetDisplay(campaign: ProductionCampaign) {
  const mode =
    campaign.targetMode ?? (campaign.technicalSheet?.yieldMode === 'MASS' ? 'MASS' : 'PORTIONS');
  const raw = Number(
    campaign.targetQuantity ?? campaign.grossRequirement ?? campaign.plannedPortions,
  );
  return {
    mode,
    value: mode === 'MASS' ? raw / 1000 : raw,
    unit: mode === 'MASS' ? 'kg' : 'portions',
  };
}

function linkedMenuItemIds(menu: MenuPlan) {
  const linked = new Set<string>();
  const linkedSheets = new Set<string>();
  for (const link of menu.productionLinks ?? []) {
    if (link.productionOrder?.status === 'CANCELLED') continue;
    link.snapshot?.lines?.forEach((line) => {
      if (line.menuItemId) linked.add(line.menuItemId);
      if (line.technicalSheetId) linkedSheets.add(line.technicalSheetId);
    });
    if (link.productionOrder?.technicalSheetId) {
      linkedSheets.add(link.productionOrder.technicalSheetId);
    }
  }
  menu.items?.forEach((item) => {
    if (item.id && item.technicalSheetId && linkedSheets.has(item.technicalSheetId)) {
      linked.add(item.id);
    }
  });
  return linked;
}

export function ProductionFabricationCalendar({
  token,
  campaigns,
  profiles,
  sites,
  defaultSiteId,
  departments,
  loading,
  focusDate,
  focusMode,
  campaignIds,
  onRefresh,
  children,
  onContextChange,
}: Props) {
  const [mode, setMode] = useState<CalendarMode>('week');
  const [anchor, setAnchor] = useState(dayKey(new Date()));
  const [siteId, setSiteId] = useState('');
  const [siteInitialized, setSiteInitialized] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createRecipePickerOpen, setCreateRecipePickerOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createAssigneesLoading, setCreateAssigneesLoading] = useState(false);
  const [createAssigneeOptions, setCreateAssigneeOptions] = useState<OperationalTaskAssignee[]>([]);
  const [createEmployeeIds, setCreateEmployeeIds] = useState<string[]>([]);
  const [createLeadId, setCreateLeadId] = useState('');
  const [validateBusy, setValidateBusy] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({
    siteId: '',
    profileId: '',
    serviceId: '',
    date: dayKey(new Date()),
    time: '08:00',
    quantityMode: 'PORTIONS' as ProductionQuantityMode,
    target: '20',
  });
  const [closure, setClosure] = useState<ProductionDayClosure | null>(null);
  const [closureLoading, setClosureLoading] = useState(false);
  const [closureSaving, setClosureSaving] = useState(false);
  const [dayValidation, setDayValidation] = useState<ProductionDayValidation | null>(null);
  const [dayValidationLoading, setDayValidationLoading] = useState(false);
  const [dayValidationSaving, setDayValidationSaving] = useState(false);
  const [menus, setMenus] = useState<MenuPlan[]>([]);
  const [catalogs, setCatalogs] = useState<MenuPlan[]>([]);
  const [menusLoading, setMenusLoading] = useState(false);
  const [menuReloadKey, setMenuReloadKey] = useState(0);
  const [menuPlanner, setMenuPlanner] = useState<MenuPlan | null>(null);
  const [menuPlanning, setMenuPlanning] = useState(false);
  const [menuDraft, setMenuDraft] = useState<{
    serviceId: string;
    plannedTime: string;
    lines: Record<string, { selected: boolean; portions: string }>;
  }>({ serviceId: '', plannedTime: '08:00', lines: {} });
  const [catalogPlannerDate, setCatalogPlannerDate] = useState<string | null>(null);
  const [catalogPlanning, setCatalogPlanning] = useState(false);
  const [assignmentCampaign, setAssignmentCampaign] = useState<ProductionCampaign | null>(null);
  const [assignmentOptions, setAssignmentOptions] = useState<OperationalTaskAssignee[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentEmployeeIds, setAssignmentEmployeeIds] = useState<string[]>([]);
  const [assignmentLeadId, setAssignmentLeadId] = useState('');
  const [validationCampaign, setValidationCampaign] = useState<ProductionCampaign | null>(null);
  const [validationOverrideReason, setValidationOverrideReason] = useState('');
  const [validationError, setValidationError] = useState('');
  const [editingCampaign, setEditingCampaign] = useState<ProductionCampaign | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editDraft, setEditDraft] = useState({
    serviceId: '',
    productionDate: dayKey(new Date()),
    plannedTime: '08:00',
    quantityMode: 'PORTIONS' as ProductionQuantityMode,
    targetPortions: '1',
  });
  const [catalogDraft, setCatalogDraft] = useState<{
    catalogId: string;
    siteId: string;
    serviceId: string;
    plannedTime: string;
    lines: Record<string, { selected: boolean; targetPortions: string }>;
  }>({
    catalogId: '',
    siteId: '',
    serviceId: '',
    plannedTime: '08:00',
    lines: {},
  });

  useEffect(() => {
    if (siteInitialized || !sites.length) return;
    const initialSiteId =
      sites.find((site) => site.id === defaultSiteId)?.id ??
      sites.find((site) => site.isPrimary || site.isMain)?.id ??
      sites[0]?.id ??
      '';
    setSiteId(initialSiteId);
    setSiteInitialized(true);
  }, [defaultSiteId, siteInitialized, sites]);

  useEffect(() => {
    if (focusDate) setAnchor(dayKey(focusDate));
    if (focusMode) setMode(focusMode);
  }, [focusDate, focusMode]);

  const visibleCampaigns = useMemo(
    () =>
      campaigns.filter(
        (campaign) =>
          campaign.status !== 'CANCELLED' &&
          (!siteId || campaign.siteId === siteId) &&
          (!campaignIds || campaignIds.has(campaign.id)),
      ),
    [campaignIds, campaigns, siteId],
  );
  const allSitesReadOnly = !siteId;

  function requireSelectedSite(action: string) {
    if (siteId) return true;
    setError(
      `Sélectionnez un site précis pour ${action}. « Tous les sites » est une vue de consultation.`,
    );
    return false;
  }

  const calendarDays = useMemo(() => {
    if (mode === 'day') return [anchor];
    if (mode === 'week') {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    const start = monthGridStart(anchor);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [anchor, mode]);

  const periodLabel = useMemo(
    () =>
      mode === 'month'
        ? new Intl.DateTimeFormat(activeLocale(), { month: 'long', year: 'numeric' }).format(
            parseDay(anchor),
          )
        : mode === 'week'
          ? `${formatDay(calendarDays[0], true)} – ${formatDay(calendarDays.at(-1)!, true)}`
          : formatDay(anchor),
    [anchor, calendarDays, mode],
  );

  useEffect(() => {
    const startDate = calendarDays[0];
    const endDate = addDays(calendarDays.at(-1)!, 1);
    onContextChange?.({ startDate, endDate, siteId, mode, label: periodLabel });
  }, [calendarDays, mode, onContextChange, periodLabel, siteId]);

  useEffect(() => {
    let active = true;
    setMenusLoading(true);
    Promise.all([
      api.menusList(token, {
        startDate: calendarDays[0],
        endDate: addDays(calendarDays.at(-1)!, 1),
        siteId: siteId || undefined,
        pageSize: 200,
      }),
      api.menusList(token, { kind: 'CATALOG', pageSize: 200 }),
    ])
      .then(([datedMenus, catalogMenus]) => {
        if (active) {
          setMenus(datedMenus.filter((menu) => Boolean(menu.date)));
          setCatalogs(
            catalogMenus.filter(
              (menu) =>
                menu.status !== 'ARCHIVED' &&
                (menu.items ?? []).some((item) => item.technicalSheetId),
            ),
          );
        }
      })
      .catch(() => {
        if (active) {
          setMenus([]);
          setCatalogs([]);
        }
      })
      .finally(() => {
        if (active) setMenusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [calendarDays, menuReloadKey, siteId, token]);

  const campaignsByDay = useMemo(() => {
    const grouped = new Map<string, ProductionCampaign[]>();
    visibleCampaigns.forEach((campaign) => {
      const key = dayKey(campaign.productionDate);
      grouped.set(key, [...(grouped.get(key) ?? []), campaign]);
    });
    return grouped;
  }, [visibleCampaigns]);

  const menusByDay = useMemo(() => {
    const grouped = new Map<string, MenuPlan[]>();
    menus.forEach((menu) => {
      if (!menu.date) return;
      const key = dayKey(menu.date);
      grouped.set(key, [...(grouped.get(key) ?? []), menu]);
    });
    return grouped;
  }, [menus]);

  const availableProfiles = profiles;

  const selectedSiteProfiles = availableProfiles.filter(
    (profile) => profile.siteId === draft.siteId,
  );
  const selectedDraftProfile = availableProfiles.find((profile) => profile.id === draft.profileId);
  const createRecipePickerItems = useMemo<TechnicalSheetPickerItem[]>(
    () =>
      selectedSiteProfiles.map((profile) => {
        const sheet = profile.technicalSheet;
        const isMass = sheet?.yieldMode === 'MASS';
        const referenceValue = isMass
          ? Number(sheet?.totalMassGrams ?? 0) / 1000
          : Number(sheet?.referencePortions ?? 0);
        return {
          id: profile.id,
          name: sheet?.name ?? profile.outputProduct?.name ?? 'Fabrication',
          category: sheet?.category?.name ?? null,
          group: sheet?.category?.name ?? 'Sans catégorie',
          referenceLabel:
            referenceValue > 0
              ? isMass
                ? `${referenceValue.toLocaleString(activeLocale())} kg`
                : `${referenceValue.toLocaleString(activeLocale())} portions`
              : null,
          durationMinutes: profileDurationMinutes(profile),
          contextLabel: profile.outputProduct?.name
            ? `Produit fini : ${profile.outputProduct.name}`
            : null,
          steps: (sheet?.steps ?? [])
            .filter((step) => Boolean(step.id))
            .map((step) => ({
              id: step.id!,
              order: step.order,
              title: step.title || `Étape ${step.order}`,
              description: step.description,
              estimatedMinutes: Number(step.estimatedTimeMinutes ?? 0),
            })),
        };
      }),
    [selectedSiteProfiles],
  );
  const draftQuantityPlan = productionQuantityPlan(
    selectedDraftProfile,
    draft.quantityMode,
    Number(draft.target),
  );
  const draftDurationMinutes = profileDurationMinutes(selectedDraftProfile);

  useEffect(() => {
    if (!createOpen || !draft.serviceId || !draft.date || !draft.time || !selectedDraftProfile) {
      setCreateAssigneeOptions([]);
      return;
    }
    const startsAt = new Date(`${draft.date}T${draft.time}:00`);
    const endsAt = new Date(startsAt.getTime() + draftDurationMinutes * 60_000);
    let active = true;
    setCreateAssigneesLoading(true);
    api
      .productionTaskAssignees(token, {
        departmentId: draft.serviceId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      })
      .then((employees) => {
        if (!active) return;
        setCreateAssigneeOptions(employees);
        setCreateEmployeeIds((current) =>
          current.filter((employeeId) =>
            employees.some((employee) => employee.id === employeeId && employee.available),
          ),
        );
      })
      .catch(() => {
        if (active) setCreateAssigneeOptions([]);
      })
      .finally(() => {
        if (active) setCreateAssigneesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    createOpen,
    draft.date,
    draft.serviceId,
    draft.time,
    draftDurationMinutes,
    selectedDraftProfile,
    token,
  ]);
  const menuPlannerLinked = menuPlanner ? linkedMenuItemIds(menuPlanner) : new Set<string>();
  const menuPlannerItems = (menuPlanner?.items ?? []).filter(
    (item) => item.id && item.technicalSheetId,
  );
  const selectedCatalog = catalogs.find((catalog) => catalog.id === catalogDraft.catalogId) ?? null;
  const catalogPlannerItems = (selectedCatalog?.items ?? []).filter(
    (item) => item.id && item.technicalSheetId,
  );
  const selectedCatalogDayMenu = catalogDayMenu(
    catalogDraft.catalogId,
    catalogDraft.siteId,
    catalogPlannerDate,
  );
  const catalogHasExistingProductions = Boolean(
    selectedCatalogDayMenu?.productionLinks?.some(
      (link) => link.productionOrder?.status !== 'CANCELLED',
    ),
  );
  function catalogDayMenu(catalogId: string, selectedSiteId: string, selectedDate: string | null) {
    if (!catalogId || !selectedSiteId || !selectedDate) return undefined;
    return menus.find(
      (menu) =>
        menu.sourceMenuId === catalogId &&
        menu.siteId === selectedSiteId &&
        Boolean(menu.date) &&
        dayKey(menu.date!) === selectedDate,
    );
  }

  function catalogLines(
    catalog: MenuPlan | undefined,
    selectedSiteId: string,
    selectedDate: string | null,
  ) {
    const existingMenu = catalog
      ? catalogDayMenu(catalog.id, selectedSiteId, selectedDate)
      : undefined;
    return Object.fromEntries(
      (catalog?.items ?? [])
        .filter((item) => item.id && item.technicalSheetId)
        .map((item) => {
          const existingItem = (existingMenu?.items ?? []).find(
            (candidate) =>
              candidate.technicalSheetId === item.technicalSheetId &&
              (candidate.dietId ?? null) === (item.dietId ?? null),
          );
          const referencePortions = Number(item.technicalSheet?.referencePortions ?? 0);
          const recipeReady = Number.isFinite(referencePortions) && referencePortions > 0;
          return [
            item.id!,
            {
              selected: recipeReady,
              targetPortions: String(
                Math.max(
                  Number(
                    existingItem?.portionsOverride ??
                      item.targetReadyQuantity ??
                      item.portionsOverride ??
                      (referencePortions > 0 ? referencePortions : 20),
                  ),
                  1,
                ),
              ),
            },
          ];
        }),
    );
  }

  function openCreate(date: string) {
    if (!requireSelectedSite('ajouter une recette')) return;
    const selectedSiteId = siteId;
    const kitchen =
      departments.find((department) =>
        /cuisine|pâtisserie|patisserie|production/i.test(department.name),
      ) ?? departments[0];
    setDraft({
      siteId: selectedSiteId,
      profileId: '',
      serviceId: kitchen?.id ?? '',
      date,
      time: '08:00',
      quantityMode: 'PORTIONS',
      target: '20',
    });
    setCreateEmployeeIds([]);
    setCreateLeadId('');
    setCreateAssigneeOptions([]);
    setError('');
    setCreateOpen(true);
    setCreateRecipePickerOpen(true);
  }

  function selectCreateProfile(profileId: string) {
    const profile = availableProfiles.find((candidate) => candidate.id === profileId);
    if (!profile) return;
    setDraft((current) => ({
      ...current,
      profileId: profile.id,
      quantityMode: profile.technicalSheet?.yieldMode === 'MASS' ? 'MASS' : 'PORTIONS',
      target:
        profile.technicalSheet?.yieldMode === 'MASS'
          ? String(Math.max(Number(profile.technicalSheet.totalMassGrams ?? 1000) / 1000, 0.001))
          : String(Math.max(Number(profile.technicalSheet?.referencePortions ?? 20), 1)),
    }));
    setCreateRecipePickerOpen(false);
  }

  function toggleCreateEmployee(employeeId: string) {
    setCreateEmployeeIds((current) => {
      if (current.includes(employeeId)) {
        const next = current.filter((id) => id !== employeeId);
        if (createLeadId === employeeId) setCreateLeadId(next[0] ?? '');
        return next;
      }
      if (!createLeadId) setCreateLeadId(employeeId);
      return [...current, employeeId];
    });
  }

  function openCatalogPlanner(date: string) {
    if (!requireSelectedSite('planifier depuis la carte')) return;
    const selectedSiteId = siteId;
    const catalog =
      catalogs.find(
        (candidate) =>
          candidate.siteId === selectedSiteId &&
          (candidate.items ?? []).some((item) => item.technicalSheetId),
      ) ??
      catalogs.find((candidate) => candidate.isPrimary) ??
      catalogs[0];
    const kitchen =
      departments.find((department) =>
        /cuisine|pâtisserie|patisserie|production/i.test(department.name),
      ) ?? departments[0];
    setCatalogDraft({
      catalogId: catalog?.id ?? '',
      siteId: selectedSiteId,
      serviceId: kitchen?.id ?? '',
      plannedTime: '08:00',
      lines: catalogLines(catalog, selectedSiteId, date),
    });
    setError('');
    setCatalogPlannerDate(date);
  }

  function selectCatalog(catalogId: string) {
    const catalog = catalogs.find((candidate) => candidate.id === catalogId);
    setCatalogDraft((current) => ({
      ...current,
      catalogId,
      lines: catalogLines(catalog, current.siteId, catalogPlannerDate),
    }));
  }

  function selectCatalogSite(selectedSiteId: string) {
    const catalog = catalogs.find((candidate) => candidate.id === catalogDraft.catalogId);
    setCatalogDraft((current) => ({
      ...current,
      siteId: selectedSiteId,
      lines: catalogLines(catalog, selectedSiteId, catalogPlannerDate),
    }));
  }

  async function planCatalogProducts(event: FormEvent) {
    event.preventDefault();
    if (!requireSelectedSite('planifier cette journée depuis la carte')) return;
    if (!catalogPlannerDate || !catalogDraft.catalogId) {
      setError('Choisissez la carte à utiliser pour cette journée.');
      return;
    }
    const lines = Object.entries(catalogDraft.lines)
      .filter(([, line]) => line.selected)
      .map(([menuItemId, line]) => ({
        menuItemId,
        targetPortions: Number(line.targetPortions),
        plannedTime: catalogDraft.plannedTime,
      }));
    if (!catalogDraft.siteId || !catalogDraft.serviceId) {
      setError('Choisissez le site et le service responsables.');
      return;
    }
    if (
      !lines.length ||
      lines.some((line) => !Number.isFinite(line.targetPortions) || line.targetPortions <= 0)
    ) {
      setError('Sélectionnez au moins un produit avec un nombre de portions supérieur à zéro.');
      return;
    }
    setCatalogPlanning(true);
    setError('');
    try {
      await api.planCatalogProductionDay(token, catalogDraft.catalogId, {
        siteId: catalogDraft.siteId,
        date: catalogPlannerDate,
        serviceId: catalogDraft.serviceId,
        plannedTime: catalogDraft.plannedTime,
        lines,
      });
      setAnchor(catalogPlannerDate);
      setSiteId(catalogDraft.siteId);
      setCatalogPlannerDate(null);
      setMenuReloadKey((current) => current + 1);
      await onRefresh();
    } catch (planningError) {
      setError(errorMessage(planningError));
    } finally {
      setCatalogPlanning(false);
    }
  }

  function openMenuPlanner(menu: MenuPlan) {
    if (!requireSelectedSite('planifier ce menu')) return;
    if (!menu.siteId || menu.siteId !== siteId) {
      setError('Ce menu ne correspond pas au site sélectionné.');
      return;
    }
    const linked = linkedMenuItemIds(menu);
    const lines = Object.fromEntries(
      (menu.items ?? [])
        .filter((item) => item.id && item.technicalSheetId)
        .map((item) => {
          const referencePortions = Number(item.technicalSheet?.referencePortions ?? 0);
          const recipeReady = Number.isFinite(referencePortions) && referencePortions > 0;
          return [
            item.id!,
            {
              selected: !linked.has(item.id!) && recipeReady,
              portions: String(Math.max(menuPortions(menu, item), 1)),
            },
          ];
        }),
    );
    const kitchen =
      departments.find((department) =>
        /cuisine|pâtisserie|patisserie|production/i.test(department.name),
      ) ?? departments[0];
    setMenuDraft({
      serviceId: kitchen?.id ?? '',
      plannedTime: '08:00',
      lines,
    });
    setError('');
    setMenuPlanner(menu);
  }

  function toggleMenuLine(menuItemId: string) {
    setMenuDraft((current) => ({
      ...current,
      lines: {
        ...current.lines,
        [menuItemId]: {
          ...current.lines[menuItemId],
          selected: !current.lines[menuItemId]?.selected,
        },
      },
    }));
  }

  async function planMenuProducts(event: FormEvent) {
    event.preventDefault();
    if (!menuPlanner) return;
    if (!requireSelectedSite('planifier ce menu') || menuPlanner.siteId !== siteId) return;
    const lines = Object.entries(menuDraft.lines)
      .filter(([, line]) => line.selected)
      .map(([menuItemId, line]) => ({
        menuItemId,
        portions: Number(line.portions),
        plannedTime: menuDraft.plannedTime,
      }));
    if (!menuDraft.serviceId) {
      setError('Choisissez le service qui réalisera les tâches de production.');
      return;
    }
    if (
      !lines.length ||
      lines.some((line) => !Number.isFinite(line.portions) || line.portions <= 0)
    ) {
      setError('Sélectionnez au moins un produit avec une quantité supérieure à zéro.');
      return;
    }
    setMenuPlanning(true);
    setError('');
    try {
      await api.generateMenuProductions(token, menuPlanner.id, {
        mode: 'DETAILED',
        serviceId: menuDraft.serviceId,
        plannedTime: menuDraft.plannedTime,
        lines,
      });
      setMenuPlanner(null);
      setAnchor(dayKey(menuPlanner.date!));
      setSiteId(menuPlanner.siteId ?? siteId);
      setMenuReloadKey((current) => current + 1);
      await onRefresh();
    } catch (planningError) {
      setError(errorMessage(planningError));
    } finally {
      setMenuPlanning(false);
    }
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    if (!requireSelectedSite('créer cette fabrication')) return;
    const quantityPlan = productionQuantityPlan(
      selectedDraftProfile,
      draft.quantityMode,
      Number(draft.target),
    );
    if (
      !draft.siteId ||
      !draft.profileId ||
      !draft.serviceId ||
      quantityPlan.grossRequirement <= 0
    ) {
      setError(
        'Choisissez la recette, le site, le service et une quantité réalisable supérieure à zéro.',
      );
      return;
    }
    setCreateBusy(true);
    setError('');
    let createdCampaignId = '';
    try {
      const campaign = await api.createProductionCampaign(token, {
        profileId: draft.profileId,
        grossRequirement: String(quantityPlan.grossRequirement),
        targetMode: draft.quantityMode,
        targetQuantity: String(
          draft.quantityMode === 'MASS' ? Number(draft.target) * 1000 : Number(draft.target),
        ),
        neededAt: new Date(`${draft.date}T${draft.time}:00`).toISOString(),
        plannedTime: draft.time,
        serviceId: draft.serviceId,
        priority: 'NORMAL',
        scenarioKind: 'RECOMMENDED',
        createSubRecipeNeeds: true,
      });
      createdCampaignId = campaign.id;
      const leadId = createEmployeeIds.includes(createLeadId) ? createLeadId : createEmployeeIds[0];
      const orderedEmployeeIds = leadId
        ? [...createEmployeeIds.filter((employeeId) => employeeId !== leadId), leadId]
        : createEmployeeIds;
      for (const employeeId of orderedEmployeeIds) {
        const employee = createAssigneeOptions.find((candidate) => candidate.id === employeeId);
        await api.assignProductionEmployee(token, campaign.id, {
          employeeId,
          planningAssignmentId: employee?.planningAssignment?.id,
          mission: `Réaliser ${campaign.name}`,
          plannedMinutes: draftDurationMinutes,
          isLead: employeeId === leadId,
        });
      }
      setCreateOpen(false);
      setAnchor(draft.date);
      setSiteId(draft.siteId);
      await onRefresh();
    } catch (creationError) {
      if (createdCampaignId) {
        setCreateOpen(false);
        setAnchor(draft.date);
        setSiteId(draft.siteId);
        setError(
          `La fabrication a bien été créée, mais l’équipe n’a pas pu être affectée : ${errorMessage(
            creationError,
          )}`,
        );
        await onRefresh();
      } else {
        setError(errorMessage(creationError));
      }
    } finally {
      setCreateBusy(false);
    }
  }

  function openCampaignEditor(campaign: ProductionCampaign) {
    const target = campaignTargetDisplay(campaign);
    setEditingCampaign(campaign);
    setEditDraft({
      serviceId: campaign.serviceId ?? '',
      productionDate: dayKey(campaign.productionDate),
      plannedTime: campaign.plannedTime || '08:00',
      quantityMode: target.mode,
      targetPortions: String(Math.max(target.value || (target.mode === 'MASS' ? 0.001 : 1), 0.001)),
    });
    setEditError('');
  }

  async function saveCampaignChanges(event: FormEvent) {
    event.preventDefault();
    if (!editingCampaign || !campaignIsEditable(editingCampaign)) return;
    if (!requireSelectedSite('modifier cette fabrication')) return;
    if (editingCampaign.siteId !== siteId) {
      setEditError('Cette fabrication ne correspond pas au site sélectionné.');
      return;
    }
    const targetPortions = Number(editDraft.targetPortions);
    const targetQuantity =
      editDraft.quantityMode === 'MASS' ? targetPortions * 1000 : targetPortions;
    const sheet = editingCampaign.technicalSheet;
    const targetReference =
      editDraft.quantityMode === 'MASS'
        ? Number(sheet?.totalMassGrams ?? 0)
        : Number(sheet?.referencePortions ?? 0);
    const nativeReference =
      sheet?.yieldMode === 'MASS'
        ? Number(sheet.totalMassGrams ?? 0)
        : Number(sheet?.referencePortions ?? 0);
    const grossRequirement =
      targetReference > 0 ? (nativeReference * targetQuantity) / targetReference : 0;
    if (!editDraft.serviceId) {
      setEditError('Choisissez le service responsable.');
      return;
    }
    if (!Number.isFinite(targetPortions) || targetPortions <= 0 || grossRequirement <= 0) {
      setEditError(
        'La quantité à produire doit être supérieure à zéro et compatible avec le rendement de la fiche.',
      );
      return;
    }

    setEditSaving(true);
    setEditError('');
    try {
      await api.updateProductionCampaign(token, editingCampaign.id, {
        grossRequirement: String(grossRequirement),
        productionDate: `${editDraft.productionDate}T${editDraft.plannedTime}:00`,
        plannedTime: editDraft.plannedTime,
        serviceId: editDraft.serviceId,
        targetMode: editDraft.quantityMode,
        targetQuantity: String(targetQuantity),
        targetPortions: editingCampaign.menuProductionLinks?.length
          ? String(targetPortions)
          : undefined,
      });
      setEditingCampaign(null);
      setMenuReloadKey((current) => current + 1);
      await onRefresh();
    } catch (campaignEditError) {
      setEditError(errorMessage(campaignEditError));
    } finally {
      setEditSaving(false);
    }
  }

  async function validateCampaign(campaign: ProductionCampaign, allowShortage = false) {
    if (!requireSelectedSite('valider cette fabrication')) return;
    if (campaign.siteId !== siteId) {
      setError('Cette fabrication ne correspond pas au site sélectionné.');
      return;
    }
    setValidateBusy(campaign.id);
    setError('');
    setValidationError('');
    try {
      await api.validateProductionCampaign(token, campaign.id, {
        allowShortage,
        overrideReason: allowShortage ? validationOverrideReason.trim() : undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setValidationCampaign(null);
      setValidationOverrideReason('');
      await onRefresh();
    } catch (campaignValidationError) {
      const message = errorMessage(campaignValidationError);
      if (!allowShortage && /stock|ingrédient|composant|rupture|insuffisant/i.test(message)) {
        setValidationCampaign(campaign);
        setValidationOverrideReason('');
        setValidationError('');
      } else if (allowShortage) {
        setValidationError(message);
      } else {
        setError(message);
      }
    } finally {
      setValidateBusy('');
    }
  }

  async function openAssignment(campaign: ProductionCampaign) {
    if (!requireSelectedSite('affecter des collaborateurs')) return;
    if (campaign.siteId !== siteId) {
      setError('Cette fabrication ne correspond pas au site sélectionné.');
      return;
    }
    if (!campaign.serviceId) {
      setError('Choisissez d’abord le service responsable de cette fabrication.');
      return;
    }
    const startsAt = new Date(
      `${dayKey(campaign.productionDate)}T${campaign.plannedTime || '08:00'}:00`,
    );
    const endsAt = new Date(startsAt.getTime() + campaignDurationMinutes(campaign) * 60_000);
    const currentEmployeeIds = [
      ...new Set([
        ...(campaign.assignments ?? []).map((assignment) => assignment.employeeId),
        ...(campaign.responsibleEmployeeId ? [campaign.responsibleEmployeeId] : []),
      ]),
    ];
    const currentLead =
      campaign.assignments?.find((assignment) => assignment.isLead)?.employeeId ??
      campaign.responsibleEmployeeId ??
      currentEmployeeIds[0] ??
      '';

    setAssignmentCampaign(campaign);
    setAssignmentEmployeeIds(currentEmployeeIds);
    setAssignmentLeadId(currentLead);
    setAssignmentOptions([]);
    setAssignmentError('');
    setAssignmentLoading(true);
    try {
      const options = await api.productionTaskAssignees(token, {
        departmentId: campaign.serviceId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
      setAssignmentOptions(options);
    } catch (assignmentLoadError) {
      setAssignmentError(errorMessage(assignmentLoadError));
    } finally {
      setAssignmentLoading(false);
    }
  }

  function toggleAssignmentEmployee(employeeId: string) {
    setAssignmentEmployeeIds((current) => {
      if (current.includes(employeeId)) {
        const next = current.filter((id) => id !== employeeId);
        if (assignmentLeadId === employeeId) {
          setAssignmentLeadId(next[0] ?? '');
        }
        return next;
      }
      const next = [...current, employeeId];
      if (!assignmentLeadId) setAssignmentLeadId(employeeId);
      return next;
    });
    setAssignmentError('');
  }

  async function saveAssignments(event: FormEvent) {
    event.preventDefault();
    if (!assignmentCampaign) return;
    if (!requireSelectedSite('enregistrer cette affectation')) return;
    if (assignmentCampaign.siteId !== siteId) {
      setAssignmentError('Cette fabrication ne correspond pas au site sélectionné.');
      return;
    }
    if (!assignmentEmployeeIds.length) {
      setAssignmentError('Sélectionnez au moins un collaborateur.');
      return;
    }
    const leadId = assignmentEmployeeIds.includes(assignmentLeadId)
      ? assignmentLeadId
      : assignmentEmployeeIds[0];
    const existingAssignments = assignmentCampaign.assignments ?? [];
    const selected = new Set(assignmentEmployeeIds);
    const plannedMinutes = campaignDurationMinutes(assignmentCampaign);

    setAssignmentSaving(true);
    setAssignmentError('');
    try {
      for (const assignment of existingAssignments) {
        if (!selected.has(assignment.employeeId)) {
          await api.removeProductionAssignment(token, assignmentCampaign.id, assignment.id);
        }
      }
      const orderedEmployeeIds = [
        ...assignmentEmployeeIds.filter((employeeId) => employeeId !== leadId),
        leadId,
      ];
      for (const employeeId of orderedEmployeeIds) {
        const option = assignmentOptions.find((candidate) => candidate.id === employeeId);
        await api.assignProductionEmployee(token, assignmentCampaign.id, {
          employeeId,
          planningAssignmentId: option?.planningAssignment?.id,
          mission: `Fabrication ${assignmentCampaign.name}`,
          plannedMinutes,
          isLead: employeeId === leadId,
        });
      }
      setAssignmentCampaign(null);
      await onRefresh();
    } catch (assignmentSaveError) {
      setAssignmentError(errorMessage(assignmentSaveError));
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function openClosure(date = anchor) {
    const selectedSiteId = siteId;
    if (!selectedSiteId) {
      setError('Choisissez un site avant de clôturer la journée.');
      return;
    }
    setClosureLoading(true);
    setError('');
    try {
      const result = await api.productionDayClosurePreview(token, {
        siteId: selectedSiteId,
        date,
      });
      setClosure({
        ...result,
        items: result.items.map((item) => ({
          ...item,
          remainingPortions: Number(item.remainingPortions ?? 0),
          discardedPortions: Number(item.discardedPortions ?? 0),
          carryOverNextPortions: Number(item.carryOverNextPortions ?? 0),
          lossReason: item.lossReason ?? '',
        })),
      });
    } catch (closureError) {
      setError(errorMessage(closureError));
    } finally {
      setClosureLoading(false);
    }
  }

  function updateClosureItem(orderId: string, patch: Partial<ProductionDayClosureItem>) {
    setClosure((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.orderId === orderId
                ? {
                    ...item,
                    ...patch,
                    estimatedOutPortions: Math.max(
                      item.totalAvailablePortions -
                        Number(patch.remainingPortions ?? item.remainingPortions) -
                        Number(patch.discardedPortions ?? item.discardedPortions),
                      0,
                    ),
                  }
                : item,
            ),
          }
        : current,
    );
  }

  async function closeDay() {
    if (!closure) return;
    if (!requireSelectedSite('clôturer cette journée') || closure.siteId !== siteId) return;
    setClosureSaving(true);
    setError('');
    try {
      const saved = await api.closeProductionDay(token, {
        siteId: closure.siteId,
        date: closure.date,
        items: closure.items.map((item) => ({
          orderId: item.orderId,
          remainingPortions: Number(item.remainingPortions),
          discardedPortions: Number(item.discardedPortions),
          carryOverNextPortions: Number(item.carryOverNextPortions),
          lossReason: item.lossReason?.trim() || undefined,
          notes: item.notes?.trim() || undefined,
        })),
      });
      setClosure(saved);
      await onRefresh();
    } catch (closureError) {
      setError(errorMessage(closureError));
    } finally {
      setClosureSaving(false);
    }
  }

  async function openDayValidation(date = anchor) {
    const selectedSiteId = siteId;
    if (!selectedSiteId) {
      setError('Choisissez un site avant de valider la journée de production.');
      return;
    }
    setDayValidationLoading(true);
    setError('');
    try {
      const preview = await api.productionDayValidationPreview(token, {
        siteId: selectedSiteId,
        date,
      });
      setDayValidation(preview);
    } catch (validationPreviewError) {
      setError(errorMessage(validationPreviewError));
    } finally {
      setDayValidationLoading(false);
    }
  }

  async function confirmProductionDay() {
    if (!dayValidation) return;
    if (
      !requireSelectedSite('valider cette journée de production') ||
      dayValidation.site.id !== siteId
    )
      return;
    setDayValidationSaving(true);
    setError('');
    try {
      const completed = await api.validateProductionDay(token, {
        siteId: dayValidation.site.id,
        date: dayValidation.date,
        idempotencyKey: crypto.randomUUID(),
      });
      setDayValidation(completed);
      await onRefresh();
    } catch (validationError) {
      setError(errorMessage(validationError));
    } finally {
      setDayValidationSaving(false);
    }
  }

  function navigate(direction: number) {
    if (mode === 'day') setAnchor(addDays(anchor, direction));
    else if (mode === 'week') setAnchor(addDays(anchor, direction * 7));
    else {
      const date = parseDay(anchor);
      date.setMonth(date.getMonth() + direction, 1);
      setAnchor(dayKey(date));
    }
  }

  return (
    <>
      <section className="fabrication-calendar-panel">
        {mode === 'day' && (
          <header className="fabrication-calendar-toolbar fabrication-calendar-day-toolbar">
            <div className="fabrication-calendar-actions">
              <button
                type="button"
                className="production-btn-glass"
                onClick={() => void openClosure(anchor)}
                disabled={allSitesReadOnly || closureLoading}
              >
                {closureLoading ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <CheckCircle2 size={17} />
                )}
                Clôturer la journée
              </button>
              <button
                type="button"
                className="production-btn-primary"
                onClick={() => void openDayValidation(anchor)}
                disabled={allSitesReadOnly || dayValidationLoading}
              >
                {dayValidationLoading ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <CheckCircle2 size={17} />
                )}
                Valider la journée de production
              </button>
            </div>
          </header>
        )}

        <div className="fabrication-calendar-navigation">
          <label className="fabrication-calendar-site-field">
            <span>Site de fabrication</span>
            <select
              className="fabrication-calendar-site-select"
              value={siteId}
              onChange={(event) => {
                setSiteId(event.target.value);
                setError('');
              }}
            >
              <option value="">Tous les sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                  {site.id === defaultSiteId || site.isPrimary || site.isMain
                    ? ' (site principal)'
                    : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="fabrication-calendar-modes" role="group" aria-label="Mode du calendrier">
            {(['day', 'week', 'month'] as CalendarMode[]).map((value) => (
              <button
                type="button"
                key={value}
                className={mode === value ? 'active' : ''}
                onClick={() => setMode(value)}
              >
                {value === 'day' ? 'Jour' : value === 'week' ? 'Semaine' : 'Mois'}
              </button>
            ))}
          </div>
          <div className="fabrication-calendar-period">
            <button type="button" onClick={() => navigate(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => setAnchor(dayKey(new Date()))}>
              Aujourd’hui
            </button>
            <strong>{periodLabel}</strong>
            <button type="button" onClick={() => navigate(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {allSitesReadOnly && (
          <div className="fabrication-calendar-readonly">
            <Building2 size={17} />
            <div>
              <strong>Vue globale en lecture seule</strong>
              <span>
                Vous pouvez consulter toutes les fabrications. Sélectionnez un site pour
                planifier, modifier, affecter ou valider une fabrication.
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="fabrication-calendar-error">
            <AlertCircle size={17} /> {error}
          </div>
        )}

        <div className={`fabrication-calendar-grid mode-${mode}`}>
          {calendarDays.map((day) => {
            const dayCampaigns = campaignsByDay.get(day) ?? [];
            const dayMenus = menusByDay.get(day) ?? [];
            const otherMonth =
              mode === 'month' && parseDay(day).getMonth() !== parseDay(anchor).getMonth();
            return (
              <article
                key={day}
                className={`fabrication-calendar-day${day === dayKey(new Date()) ? ' today' : ''}${otherMonth ? ' other-month' : ''}`}
              >
                <div className="fabrication-calendar-day-head">
                  <button
                    type="button"
                    onClick={() => {
                      setAnchor(day);
                      setMode('day');
                    }}
                  >
                    {formatDay(day, mode !== 'day')}
                  </button>
                  <button
                    type="button"
                    aria-label="Planifier depuis la carte"
                    onClick={() => openCatalogPlanner(day)}
                    disabled={allSitesReadOnly}
                    title={allSitesReadOnly ? 'Sélectionnez un site pour planifier' : undefined}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <div className="fabrication-calendar-events">
                  {dayMenus.map((menu) => {
                    const technicalItems = (menu.items ?? []).filter(
                      (item) => item.id && item.technicalSheetId,
                    );
                    const linked = linkedMenuItemIds(menu);
                    const remaining = technicalItems.filter((item) => !linked.has(item.id!));
                    const canPlan =
                      ['VALIDATED', 'PUBLISHED'].includes(menu.status) &&
                      Boolean(menu.siteId) &&
                      remaining.length > 0;
                    if (mode === 'month') {
                      return (
                        <button
                          type="button"
                          key={menu.id}
                          className="fabrication-menu-summary"
                          onClick={() => {
                            setAnchor(day);
                            setMode('day');
                          }}
                        >
                          <BookOpen size={12} />
                          <span>{menu.name}</span>
                          <strong>
                            {linked.size}/{technicalItems.length}
                          </strong>
                        </button>
                      );
                    }
                    return (
                      <div key={menu.id} className="fabrication-menu-card">
                        <div className="fabrication-menu-card-head">
                          <span>
                            <BookOpen size={13} /> {menuServiceLabel(menu.service)}
                          </span>
                          <em>{Number(menu.totalGuests ?? menu.expectedGuests ?? 0)} portions</em>
                        </div>
                        <strong className="fabrication-menu-name">{menu.name}</strong>
                        <div className="fabrication-menu-products">
                          {(menu.items ?? []).map((item) => {
                            const planned = Boolean(item.id && linked.has(item.id));
                            return (
                              <div key={item.id ?? `${item.section}-${menuItemName(item)}`}>
                                <span>{menuItemName(item)}</span>
                                {item.technicalSheetId ? (
                                  <small className={planned ? 'planned' : ''}>
                                    {planned ? (
                                      <>
                                        <Check size={11} /> Planifié
                                      </>
                                    ) : (
                                      `${menuPortions(menu, item)} port.`
                                    )}
                                  </small>
                                ) : (
                                  <small>Produit Stocks</small>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          className="fabrication-menu-plan-button"
                          disabled={!canPlan || allSitesReadOnly}
                          onClick={() => openMenuPlanner(menu)}
                        >
                          {remaining.length === 0 && technicalItems.length ? (
                            <>
                              <Check size={14} /> Production planifiée
                            </>
                          ) : !['VALIDATED', 'PUBLISHED'].includes(menu.status) ? (
                            <>
                              <AlertCircle size={14} /> Menu à valider
                            </>
                          ) : !menu.siteId ? (
                            <>
                              <Building2 size={14} /> Site à définir
                            </>
                          ) : !technicalItems.length ? (
                            <>Aucune fiche à produire</>
                          ) : (
                            <>
                              <Plus size={14} /> Ajouter {remaining.length} produit
                              {remaining.length > 1 ? 's' : ''}
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                  {dayCampaigns.map((campaign) => {
                    const unassigned =
                      !campaign.assignments?.length && !campaign.responsibleEmployeeId;
                    const target = campaignTargetDisplay(campaign);
                    const targetBase = target.mode === 'MASS' ? target.value * 1000 : target.value;
                    const referenceTarget =
                      target.mode === 'MASS'
                        ? Number(campaign.technicalSheet?.totalMassGrams ?? 0)
                        : Number(campaign.technicalSheet?.referencePortions ?? 0);
                    const recipeMultiplier = referenceTarget > 0 ? targetBase / referenceTarget : 0;
                    const canEdit = !allSitesReadOnly && campaignIsEditable(campaign);
                    return (
                      <div
                        key={campaign.id}
                        className={`fabrication-calendar-event status-${campaign.status.toLowerCase()}`}
                      >
                        <button
                          type="button"
                          className="fabrication-calendar-event-open"
                          onClick={() => openCampaignEditor(campaign)}
                          aria-label={`${canEdit ? 'Modifier' : 'Consulter'} la fabrication ${campaign.name}`}
                          title={`${canEdit ? 'Modifier' : 'Consulter'} la fabrication`}
                        />
                        <div className="fabrication-calendar-event-content">
                          <strong>{campaign.name}</strong>
                          <span>
                            <Clock3 size={12} /> {campaign.plannedTime || '08:00'}
                            {' · '}
                            {target.value.toLocaleString(activeLocale(), {
                              maximumFractionDigits: 3,
                            })}{' '}
                            {target.unit}
                            {recipeMultiplier > 0 &&
                              ` · Recette ×${recipeMultiplier.toLocaleString(activeLocale(), {
                                maximumFractionDigits: 2,
                              })}`}
                          </span>
                        </div>
                        <div className="fabrication-calendar-event-footer">
                          <button
                            type="button"
                            className={`fabrication-assignment-button${unassigned ? ' unassigned' : ''}`}
                            onClick={() => void openAssignment(campaign)}
                            disabled={allSitesReadOnly}
                            title={
                              allSitesReadOnly
                                ? 'Sélectionnez un site pour affecter des collaborateurs'
                                : undefined
                            }
                          >
                            <UserPlus size={13} />
                            {unassigned
                              ? 'À affecter'
                              : `${campaign.assignments?.length || 1} affecté${
                                  (campaign.assignments?.length || 1) > 1 ? 's' : ''
                                }`}
                          </button>
                          <em>{statusLabels[campaign.status] ?? campaign.status}</em>
                          {['DRAFT', 'PROPOSED', 'PLANNED'].includes(campaign.status) && (
                            <button
                              type="button"
                              onClick={() => void validateCampaign(campaign)}
                              disabled={allSitesReadOnly || validateBusy === campaign.id}
                            >
                              {validateBusy === campaign.id ? (
                                <Loader2 size={13} className="spin" />
                              ) : (
                                <Check size={13} />
                              )}
                              Valider
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!loading &&
                    !menusLoading &&
                    !dayCampaigns.length &&
                    !dayMenus.length &&
                    mode !== 'month' && (
                      <div className="fabrication-calendar-empty-actions">
                        <button
                          type="button"
                          className="fabrication-calendar-empty"
                          onClick={() => openCatalogPlanner(day)}
                          disabled={allSitesReadOnly}
                        >
                          <BookOpen size={17} />
                          <span>
                            <strong>Planifier depuis la carte</strong>Choisir les produits et les
                            portions
                          </span>
                        </button>
                        <button
                          type="button"
                          className="fabrication-calendar-empty-secondary"
                          onClick={() => openCreate(day)}
                          disabled={allSitesReadOnly}
                        >
                          <Sparkles size={13} /> Ajouter une recette
                        </button>
                      </div>
                    )}
                </div>
              </article>
            );
          })}
        </div>

        {children && <div className="fabrication-calendar-tracking">{children}</div>}
      </section>

      <AnimatePresence>
        {catalogPlannerDate && (
          <div
            className="fabrication-modal-overlay"
            onMouseDown={(event) =>
              event.target === event.currentTarget &&
              !catalogPlanning &&
              setCatalogPlannerDate(null)
            }
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              className="fabrication-catalog-planner-modal"
              onSubmit={planCatalogProducts}
            >
              <header>
                <div>
                  <span>
                    <BookOpen size={16} /> Production du {formatDay(catalogPlannerDate)}
                  </span>
                  <h2>Combien de portions souhaitez-vous produire ?</h2>
                  <p>
                    Le rendement de chaque fiche technique sert à multiplier automatiquement les
                    ingrédients et les besoins de stock.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCatalogPlannerDate(null)}
                  disabled={catalogPlanning}
                >
                  <X size={18} />
                </button>
              </header>

              <div className="fabrication-catalog-planner-settings">
                <label>
                  <span>
                    <BookOpen size={15} /> Carte / menu proposé
                  </span>
                  <select
                    value={catalogDraft.catalogId}
                    onChange={(event) => selectCatalog(event.target.value)}
                  >
                    <option value="">Choisir une carte…</option>
                    {catalogs.map((catalog) => (
                      <option key={catalog.id} value={catalog.id}>
                        {catalog.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    <Building2 size={15} /> Site
                  </span>
                  <select
                    value={catalogDraft.siteId}
                    onChange={(event) => selectCatalogSite(event.target.value)}
                  >
                    <option value="">Choisir un site…</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    <Users size={15} /> Service responsable
                  </span>
                  <select
                    value={catalogDraft.serviceId}
                    onChange={(event) =>
                      setCatalogDraft((current) => ({
                        ...current,
                        serviceId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Choisir un service…</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    <Clock3 size={15} /> Heure
                  </span>
                  <input
                    type="time"
                    value={catalogDraft.plannedTime}
                    onChange={(event) =>
                      setCatalogDraft((current) => ({
                        ...current,
                        plannedTime: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="fabrication-catalog-products">
                {catalogPlannerItems.map((item) => {
                  const referencePortions = Number(item.technicalSheet?.referencePortions ?? 0);
                  const recipeReady = Number.isFinite(referencePortions) && referencePortions > 0;
                  const existingDailyItem = (selectedCatalogDayMenu?.items ?? []).find(
                    (candidate) =>
                      candidate.technicalSheetId === item.technicalSheetId &&
                      (candidate.dietId ?? null) === (item.dietId ?? null),
                  );
                  const alreadyPlanned = Boolean(
                    existingDailyItem &&
                    selectedCatalogDayMenu?.productionLinks?.some(
                      (link) =>
                        link.productionOrder?.status !== 'CANCELLED' &&
                        (link.productionOrder?.technicalSheetId === item.technicalSheetId ||
                          link.snapshot?.lines?.some(
                            (line) => line.menuItemId === existingDailyItem.id,
                          )),
                    ),
                  );
                  const line = catalogDraft.lines[item.id!];
                  const targetPortions = Number(line?.targetPortions ?? 0);
                  const recipeMultiplier =
                    referencePortions > 0 ? targetPortions / referencePortions : 0;
                  return (
                    <article
                      key={item.id}
                      className={`${line?.selected ? 'selected' : ''}${!recipeReady ? ' unavailable' : ''}`}
                    >
                      <button
                        type="button"
                        className="fabrication-menu-line-toggle"
                        onClick={() => {
                          if (!recipeReady) {
                            setError(
                              `Renseignez le nombre de portions dans la fiche technique « ${menuItemName(item)} ».`,
                            );
                            return;
                          }
                          setError('');
                          setCatalogDraft((current) => ({
                            ...current,
                            lines: {
                              ...current.lines,
                              [item.id!]: {
                                ...current.lines[item.id!],
                                selected: !current.lines[item.id!]?.selected,
                              },
                            },
                          }));
                        }}
                        aria-label={
                          recipeReady
                            ? `${line?.selected ? 'Retirer' : 'Ajouter'} ${menuItemName(item)}`
                            : `Rendement manquant dans la fiche technique ${menuItemName(item)}`
                        }
                      >
                        {!recipeReady ? (
                          <AlertCircle size={15} />
                        ) : line?.selected ? (
                          <Check size={15} />
                        ) : (
                          <Plus size={15} />
                        )}
                      </button>
                      <div className="fabrication-catalog-product-name">
                        <strong>{menuItemName(item)}</strong>
                        <span>
                          {item.menuCategory?.name ?? 'Produit de la carte'}
                          {alreadyPlanned && ' · Déjà planifié, portions modifiables'}
                        </span>
                        <span
                          className={`fabrication-recipe-yield${!recipeReady ? ' missing' : ''}`}
                        >
                          {recipeReady
                            ? `Rendement de la fiche : ${referencePortions.toLocaleString(activeLocale())} portions`
                            : 'Rendement manquant dans la fiche technique'}
                        </span>
                      </div>
                      <label>
                        <span>Nombre de portions</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          disabled={!recipeReady}
                          value={line?.targetPortions ?? ''}
                          onChange={(event) => {
                            setError('');
                            setCatalogDraft((current) => ({
                              ...current,
                              lines: {
                                ...current.lines,
                                [item.id!]: {
                                  ...current.lines[item.id!],
                                  targetPortions: event.target.value,
                                },
                              },
                            }));
                          }}
                        />
                      </label>
                      <div className="fabrication-catalog-quantity-result">
                        <span>
                          Fiche de base
                          <strong>{referencePortions.toLocaleString(activeLocale())} portions</strong>
                        </span>
                        <span>
                          Multiplicateur
                          <strong>
                            ×
                            {recipeMultiplier.toLocaleString(activeLocale(), {
                              maximumFractionDigits: 2,
                            })}
                          </strong>
                        </span>
                      </div>
                    </article>
                  );
                })}
                {!catalogs.length && (
                  <div className="fabrication-closure-empty">
                    Aucun produit de carte n’est encore relié à une fiche technique. Configurez
                    d’abord la carte dans le module Menus.
                  </div>
                )}
                {Boolean(catalogs.length) && !catalogPlannerItems.length && (
                  <div className="fabrication-closure-empty">
                    Cette carte ne contient aucune fiche technique à produire.
                  </div>
                )}
              </div>

              {error && (
                <div className="fabrication-calendar-error">
                  <AlertCircle size={17} /> {error}
                </div>
              )}

              <footer>
                <button
                  type="button"
                  className="fabrication-catalog-off-menu"
                  disabled={catalogPlanning}
                  onClick={() => {
                    const date = catalogPlannerDate;
                    setCatalogPlannerDate(null);
                    if (date) openCreate(date);
                  }}
                >
                  <Sparkles size={15} /> Ajouter une recette libre
                </button>
                <div>
                  <button
                    type="button"
                    onClick={() => setCatalogPlannerDate(null)}
                    disabled={catalogPlanning}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="production-btn-primary"
                    disabled={
                      catalogPlanning ||
                      !Object.values(catalogDraft.lines).some((line) => line.selected)
                    }
                  >
                    {catalogPlanning ? (
                      <Loader2 size={17} className="spin" />
                    ) : (
                      <CalendarDays size={17} />
                    )}
                    {catalogHasExistingProductions
                      ? 'Enregistrer les modifications'
                      : 'Planifier la journée'}
                  </button>
                </div>
              </footer>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingCampaign && (
          <div
            className="fabrication-modal-overlay"
            onMouseDown={(event) =>
              event.target === event.currentTarget && !editSaving && setEditingCampaign(null)
            }
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              className="fabrication-planner-modal fabrication-edit-modal"
              onSubmit={saveCampaignChanges}
            >
              <header>
                <div>
                  <span>
                    <Pencil size={16} /> Fabrication planifiée
                  </span>
                  <h2>{editingCampaign.name}</h2>
                  <p>
                    {editingCampaign.number} ·{' '}
                    {statusLabels[editingCampaign.status] ?? editingCampaign.status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCampaign(null)}
                  disabled={editSaving}
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="fabrication-edit-context">
                <div>
                  <Building2 size={18} />
                  <span>Site</span>
                  <strong>{editingCampaign.site?.name ?? 'Site de production'}</strong>
                </div>
                <div>
                  <CalendarDays size={18} />
                  <span>Journée</span>
                  <strong>{formatDay(dayKey(editingCampaign.productionDate))}</strong>
                </div>
              </div>

              <div className="fabrication-planner-form-grid">
                <label>
                  <span>
                    <Users size={15} /> Service responsable
                  </span>
                  <select
                    value={editDraft.serviceId}
                    disabled={allSitesReadOnly || !campaignIsEditable(editingCampaign) || editSaving}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        serviceId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Choisir un service…</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    <CalendarDays size={15} /> Jour de fabrication
                  </span>
                  <input
                    type="date"
                    value={editDraft.productionDate}
                    disabled={allSitesReadOnly || !campaignIsEditable(editingCampaign) || editSaving}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        productionDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>
                    <Clock3 size={15} /> Heure de fabrication
                  </span>
                  <input
                    type="time"
                    value={editDraft.plannedTime}
                    disabled={allSitesReadOnly || !campaignIsEditable(editingCampaign) || editSaving}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        plannedTime: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="fabrication-edit-target">
                  <span>
                    <Sparkles size={15} /> Objectif de fabrication
                  </span>
                  <select
                    value={editDraft.quantityMode}
                    disabled={allSitesReadOnly || !campaignIsEditable(editingCampaign) || editSaving}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        quantityMode: event.target.value as ProductionQuantityMode,
                        targetPortions:
                          event.target.value === 'MASS'
                            ? String(
                                Math.max(
                                  Number(editingCampaign.technicalSheet?.totalMassGrams ?? 1000) /
                                    1000,
                                  0.001,
                                ),
                              )
                            : String(
                                Math.max(
                                  Number(editingCampaign.technicalSheet?.referencePortions ?? 1),
                                  1,
                                ),
                              ),
                      }))
                    }
                  >
                    {editingCampaign.technicalSheet?.yieldMode !== 'MASS' && (
                      <option value="PORTIONS">Nombre de portions</option>
                    )}
                    {Number(editingCampaign.technicalSheet?.totalMassGrams ?? 0) > 0 && (
                      <option value="MASS">Masse totale</option>
                    )}
                  </select>
                  <span>
                    {editDraft.quantityMode === 'MASS'
                      ? 'Masse souhaitée (kg)'
                      : 'Nombre de portions'}
                  </span>
                  <input
                    type="number"
                    min={editDraft.quantityMode === 'MASS' ? '0.001' : '1'}
                    step={editDraft.quantityMode === 'MASS' ? '0.001' : '1'}
                    value={editDraft.targetPortions}
                    disabled={allSitesReadOnly || !campaignIsEditable(editingCampaign) || editSaving}
                    onChange={(event) => {
                      setEditError('');
                      setEditDraft((current) => ({
                        ...current,
                        targetPortions: event.target.value,
                      }));
                    }}
                  />
                </label>
                <div className="fabrication-edit-calculation">
                  <span>Rendement de la fiche</span>
                  <strong>
                    {(
                      Number(
                        editDraft.quantityMode === 'MASS'
                          ? (editingCampaign.technicalSheet?.totalMassGrams ?? 0)
                          : (editingCampaign.technicalSheet?.referencePortions ?? 0),
                      ) / (editDraft.quantityMode === 'MASS' ? 1000 : 1)
                    ).toLocaleString(activeLocale(), {
                      maximumFractionDigits: 3,
                    })}{' '}
                    {editDraft.quantityMode === 'MASS' ? 'kg' : 'portions'}
                  </strong>
                  <span>Multiplicateur recette</span>
                  <strong>
                    ×
                    {(
                      Number(editDraft.targetPortions || 0) /
                      Math.max(
                        Number(
                          editDraft.quantityMode === 'MASS'
                            ? Number(editingCampaign.technicalSheet?.totalMassGrams ?? 1000) / 1000
                            : (editingCampaign.technicalSheet?.referencePortions ?? 1),
                        ),
                        0.001,
                      )
                    ).toLocaleString(activeLocale(), { maximumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              {(allSitesReadOnly || !campaignIsEditable(editingCampaign)) && (
                <div className="fabrication-edit-locked">
                  <AlertCircle size={18} />
                  {allSitesReadOnly
                    ? 'La vue « Tous les sites » est en lecture seule. Sélectionnez le site de cette fabrication pour la modifier.'
                    : 'Cette fabrication a déjà démarré ou a été validée. Ses informations restent consultables, mais ne peuvent plus être modifiées.'}
                </div>
              )}

              {editError && (
                <div className="fabrication-calendar-error">
                  <AlertCircle size={17} /> {editError}
                </div>
              )}

              <footer>
                <button
                  type="button"
                  onClick={() => setEditingCampaign(null)}
                  disabled={editSaving}
                >
                  {!allSitesReadOnly && campaignIsEditable(editingCampaign) ? 'Annuler' : 'Fermer'}
                </button>
                {!allSitesReadOnly && campaignIsEditable(editingCampaign) && (
                  <button type="submit" className="production-btn-primary" disabled={editSaving}>
                    {editSaving ? <Loader2 size={17} className="spin" /> : <Check size={17} />}
                    Enregistrer les modifications
                  </button>
                )}
              </footer>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {assignmentCampaign && (
          <div
            className="fabrication-modal-overlay"
            onMouseDown={(event) =>
              event.target === event.currentTarget &&
              !assignmentSaving &&
              setAssignmentCampaign(null)
            }
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              className="fabrication-assignment-modal"
              onSubmit={saveAssignments}
            >
              <header>
                <div>
                  <span>
                    <Users size={16} /> Équipe de production
                  </span>
                  <h2>Affecter les collaborateurs</h2>
                  <p>
                    {assignmentCampaign.name} ·{' '}
                    {assignmentCampaign.service?.name ?? 'Service responsable'} ·{' '}
                    {assignmentCampaign.plannedTime || '08:00'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignmentCampaign(null)}
                  disabled={assignmentSaving}
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="fabrication-assignment-guide">
                <UserPlus size={19} />
                <div>
                  <strong>Une tâche, toute l’équipe</strong>
                  <span>
                    Chaque personne sélectionnée retrouvera les étapes dans son planning. La
                    couronne désigne le responsable principal. Une personne déjà affectée peut aussi
                    être sélectionnée pour travailler en parallèle pendant les temps d’attente ou de
                    cuisson.
                  </span>
                </div>
              </div>

              <div className="fabrication-assignment-list">
                {assignmentLoading ? (
                  <div className="fabrication-modal-loading">
                    <Loader2 size={20} className="spin" /> Recherche des collaborateurs…
                  </div>
                ) : assignmentOptions.length ? (
                  assignmentOptions.map((employee) => {
                    const selected = assignmentEmployeeIds.includes(employee.id);
                    const isLead = selected && assignmentLeadId === employee.id;
                    return (
                      <article
                        key={employee.id}
                        className={`${selected ? 'selected' : ''}${
                          !employee.available ? ' unavailable' : ''
                        }`}
                      >
                        <button
                          type="button"
                          className="fabrication-assignment-select"
                          disabled={!employee.available && !selected}
                          onClick={() => toggleAssignmentEmployee(employee.id)}
                          aria-label={`${selected ? 'Retirer' : 'Affecter'} ${collaboratorName(employee)}`}
                        >
                          {selected ? <Check size={16} /> : <Plus size={16} />}
                        </button>
                        <div>
                          <strong>{collaboratorName(employee)}</strong>
                          <span>
                            {employee.position?.name ??
                              employee.department?.name ??
                              'Collaborateur'}
                            {' · '}
                            {employee.availabilityLabel}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`fabrication-assignment-lead${isLead ? ' active' : ''}`}
                          disabled={!selected}
                          onClick={() => setAssignmentLeadId(employee.id)}
                          title="Définir comme responsable principal"
                        >
                          <Crown size={17} />
                          {isLead ? 'Responsable' : 'Responsable'}
                        </button>
                      </article>
                    );
                  })
                ) : (
                  <div className="fabrication-closure-empty">
                    Aucun collaborateur n’est rattaché à ce service pour cet horaire.
                  </div>
                )}
              </div>

              {assignmentError && (
                <div className="fabrication-calendar-error">
                  <AlertCircle size={17} /> {assignmentError}
                </div>
              )}

              <footer>
                <button
                  type="button"
                  onClick={() => setAssignmentCampaign(null)}
                  disabled={assignmentSaving}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="production-btn-primary"
                  disabled={assignmentSaving || assignmentLoading || !assignmentEmployeeIds.length}
                >
                  {assignmentSaving ? <Loader2 size={17} className="spin" /> : <Users size={17} />}
                  Enregistrer l’équipe
                </button>
              </footer>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {validationCampaign && (
          <div
            className="fabrication-modal-overlay"
            onMouseDown={(event) =>
              event.target === event.currentTarget &&
              validateBusy !== validationCampaign.id &&
              setValidationCampaign(null)
            }
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              className="fabrication-validation-modal"
              onSubmit={(event) => {
                event.preventDefault();
                void validateCampaign(validationCampaign, true);
              }}
            >
              <header>
                <div>
                  <span>
                    <AlertCircle size={16} /> Contrôle avant validation
                  </span>
                  <h2>Stock insuffisant pour cette fabrication</h2>
                  <p>
                    {validationCampaign.name} ne peut pas réserver tous les ingrédients nécessaires.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setValidationCampaign(null)}
                  disabled={validateBusy === validationCampaign.id}
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="fabrication-shortage-list">
                {campaignShortages(validationCampaign).length ? (
                  campaignShortages(validationCampaign).map((requirement) => {
                    const required = Number(requirement.requiredQuantity ?? 0);
                    const available = Number(requirement.stockAvailable ?? 0);
                    const missing = Math.max(required - available, 0);
                    return (
                      <article key={requirement.id}>
                        <div>
                          <strong>{requirement.productNameSnapshot}</strong>
                          <span>
                            {requirement.status === 'UNIT_NOT_CONVERTIBLE'
                              ? 'Unité de stock incompatible'
                              : requirement.status === 'PRODUCT_ARCHIVED'
                                ? 'Produit archivé'
                                : `Il manque ${missing.toLocaleString(activeLocale(), {
                                    maximumFractionDigits: 3,
                                  })} ${requirement.unitSymbolSnapshot}`}
                          </span>
                        </div>
                        <div>
                          <span>Disponible</span>
                          <strong>
                            {available.toLocaleString(activeLocale(), {
                              maximumFractionDigits: 3,
                            })}{' '}
                            /{' '}
                            {required.toLocaleString(activeLocale(), {
                              maximumFractionDigits: 3,
                            })}{' '}
                            {requirement.unitSymbolSnapshot}
                          </strong>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="fabrication-validation-warning">
                    Le contrôle serveur signale un manque de stock. Rechargez les stocks ou validez
                    avec une justification.
                  </div>
                )}
              </div>

              <label className="fabrication-validation-reason">
                <span>Motif pour valider malgré le stock</span>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  placeholder="Ex. livraison prévue avant le début de la fabrication…"
                  value={validationOverrideReason}
                  onChange={(event) => {
                    setValidationOverrideReason(event.target.value);
                    setValidationError('');
                  }}
                />
                <small>Cette justification sera enregistrée dans l’historique de production.</small>
              </label>

              {validationError && (
                <div className="fabrication-calendar-error">
                  <AlertCircle size={17} /> {validationError}
                </div>
              )}

              <footer>
                <button
                  type="button"
                  onClick={() => setValidationCampaign(null)}
                  disabled={validateBusy === validationCampaign.id}
                >
                  Revenir aux stocks
                </button>
                <button
                  type="submit"
                  className="production-btn-primary danger-confirm"
                  disabled={
                    validateBusy === validationCampaign.id ||
                    validationOverrideReason.trim().length < 5
                  }
                >
                  {validateBusy === validationCampaign.id ? (
                    <Loader2 size={17} className="spin" />
                  ) : (
                    <Check size={17} />
                  )}
                  Valider malgré le stock
                </button>
              </footer>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuPlanner && (
          <div
            className="fabrication-modal-overlay"
            onMouseDown={(event) =>
              event.target === event.currentTarget && !menuPlanning && setMenuPlanner(null)
            }
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              className="fabrication-menu-planner-modal"
              onSubmit={planMenuProducts}
            >
              <header>
                <div>
                  <span>
                    <BookOpen size={16} /> Menu du {formatDay(dayKey(menuPlanner.date!))}
                  </span>
                  <h2>Choisir la production à réaliser</h2>
                  <p>
                    {menuPlanner.name} · {menuPlanner.site?.name ?? 'Site à définir'} ·{' '}
                    {menuServiceLabel(menuPlanner.service)}
                  </p>
                </div>
                <button type="button" onClick={() => setMenuPlanner(null)} disabled={menuPlanning}>
                  <X size={18} />
                </button>
              </header>

              <div className="fabrication-menu-planner-guide">
                <ChefHat size={19} />
                <span>
                  Indiquez ici les quantités à produire. Après validation de la fabrication, les
                  étapes des fiches seront créées dans le planning opérationnel.
                </span>
              </div>

              <div className="fabrication-menu-planner-settings">
                <label>
                  <span>
                    <Users size={15} /> Service responsable
                  </span>
                  <select
                    value={menuDraft.serviceId}
                    onChange={(event) =>
                      setMenuDraft((current) => ({ ...current, serviceId: event.target.value }))
                    }
                  >
                    <option value="">Choisir un service…</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    <Clock3 size={15} /> Prêt pour
                  </span>
                  <input
                    type="time"
                    value={menuDraft.plannedTime}
                    onChange={(event) =>
                      setMenuDraft((current) => ({ ...current, plannedTime: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="fabrication-menu-planner-list">
                {menuPlannerItems.map((item) => {
                  const referencePortions = Number(item.technicalSheet?.referencePortions ?? 0);
                  const recipeReady = Number.isFinite(referencePortions) && referencePortions > 0;
                  const planned = menuPlannerLinked.has(item.id!);
                  const line = menuDraft.lines[item.id!];
                  return (
                    <article
                      key={item.id}
                      className={`${line?.selected ? 'selected' : ''}${planned ? ' planned' : ''}${!recipeReady ? ' unavailable' : ''}`}
                    >
                      <button
                        type="button"
                        className="fabrication-menu-line-toggle"
                        disabled={planned}
                        onClick={() => {
                          if (!recipeReady) {
                            setError(
                              `Renseignez le nombre de portions dans la fiche technique « ${menuItemName(item)} ».`,
                            );
                            return;
                          }
                          setError('');
                          toggleMenuLine(item.id!);
                        }}
                        aria-label={
                          !recipeReady
                            ? `Rendement manquant dans la fiche technique ${menuItemName(item)}`
                            : `${line?.selected ? 'Retirer' : 'Ajouter'} ${menuItemName(item)}`
                        }
                      >
                        {!recipeReady ? (
                          <AlertCircle size={15} />
                        ) : planned || line?.selected ? (
                          <Check size={15} />
                        ) : (
                          <Plus size={15} />
                        )}
                      </button>
                      <div>
                        <strong>{menuItemName(item)}</strong>
                        <span>
                          {item.menuCategory?.name ?? menuServiceLabel(menuPlanner.service)}
                          {planned
                            ? ' · Déjà planifié'
                            : recipeReady
                              ? ` · Rendement de la fiche : ${referencePortions.toLocaleString(activeLocale())} portions`
                              : ' · Rendement manquant dans la fiche technique'}
                        </span>
                      </div>
                      <label>
                        <span>Nombre de portions</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          disabled={planned || !recipeReady}
                          value={line?.portions ?? ''}
                          onChange={(event) =>
                            setMenuDraft((current) => ({
                              ...current,
                              lines: {
                                ...current.lines,
                                [item.id!]: {
                                  ...current.lines[item.id!],
                                  portions: event.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                    </article>
                  );
                })}
                {!menuPlannerItems.length && (
                  <div className="fabrication-closure-empty">
                    Ce menu ne contient aucune fiche technique à produire.
                  </div>
                )}
              </div>

              {error && (
                <div className="fabrication-calendar-error">
                  <AlertCircle size={17} /> {error}
                </div>
              )}

              <footer>
                <button type="button" onClick={() => setMenuPlanner(null)} disabled={menuPlanning}>
                  Annuler
                </button>
                <button
                  type="submit"
                  className="production-btn-primary"
                  disabled={
                    menuPlanning || !Object.values(menuDraft.lines).some((line) => line.selected)
                  }
                >
                  {menuPlanning ? (
                    <Loader2 size={17} className="spin" />
                  ) : (
                    <CalendarDays size={17} />
                  )}
                  Planifier les produits sélectionnés
                </button>
              </footer>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createOpen && (
          <div
            className="fabrication-modal-overlay"
            onMouseDown={(event) => event.target === event.currentTarget && setCreateOpen(false)}
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              className="fabrication-planner-modal"
              onSubmit={createCampaign}
            >
              <header>
                <div>
                  <span>
                    <ChefHat size={16} /> Recette à fabriquer
                  </span>
                  <h2>Ajouter une recette à la fabrication</h2>
                </div>
                <button type="button" onClick={() => setCreateOpen(false)}>
                  <X size={18} />
                </button>
              </header>
              <div className="fabrication-planner-form-grid">
                <label>
                  <span>
                    <Building2 size={15} /> Site
                  </span>
                  <select
                    value={draft.siteId}
                    onChange={(event) => {
                      const nextSite = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        siteId: nextSite,
                        profileId: '',
                        quantityMode: 'PORTIONS',
                        target: '20',
                      }));
                      if (nextSite) setCreateRecipePickerOpen(true);
                    }}
                  >
                    <option value="">Choisir…</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="fabrication-planner-field">
                  <span>
                    <ChefHat size={15} /> Produit / fiche technique
                  </span>
                  <button
                    type="button"
                    className={
                      selectedDraftProfile
                        ? 'technical-sheet-picker-trigger selected'
                        : 'technical-sheet-picker-trigger'
                    }
                    disabled={!draft.siteId}
                    onClick={() => setCreateRecipePickerOpen(true)}
                  >
                    <span className="technical-sheet-picker-trigger-icon">
                      <Search size={18} />
                    </span>
                    <span className="technical-sheet-picker-trigger-copy">
                      <strong>
                        {selectedDraftProfile
                          ? (selectedDraftProfile.technicalSheet?.name ??
                            selectedDraftProfile.outputProduct?.name ??
                            'Fabrication')
                          : 'Rechercher une fiche technique'}
                      </strong>
                      <small>
                        {selectedDraftProfile
                          ? 'Cliquez pour changer de recette'
                          : draft.siteId
                            ? `${selectedSiteProfiles.length} fiche(s) disponible(s) pour ce site`
                            : 'Choisissez d’abord un site'}
                      </small>
                    </span>
                    <span className="technical-sheet-picker-trigger-action">
                      {selectedDraftProfile ? 'Changer' : 'Rechercher'}
                    </span>
                  </button>
                  {draft.siteId && !selectedSiteProfiles.length && (
                    <small>Aucun profil de production configuré pour ce site.</small>
                  )}
                </div>
                <label>
                  <span>
                    <Users size={15} /> Service
                  </span>
                  <select
                    value={draft.serviceId}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, serviceId: event.target.value }))
                    }
                  >
                    <option value="">Choisir…</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    <CalendarDays size={15} /> Date
                  </span>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, date: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>
                    <Clock3 size={15} /> Heure souhaitée
                  </span>
                  <input
                    type="time"
                    value={draft.time}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, time: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>
                    <Sparkles size={15} /> Objectif de fabrication
                  </span>
                  <select
                    value={draft.quantityMode}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        quantityMode: event.target.value as ProductionQuantityMode,
                        target:
                          event.target.value === 'MASS'
                            ? String(
                                Math.max(
                                  Number(
                                    selectedDraftProfile?.technicalSheet?.totalMassGrams ?? 1000,
                                  ) / 1000,
                                  0.001,
                                ),
                              )
                            : String(
                                Math.max(
                                  Number(
                                    selectedDraftProfile?.technicalSheet?.referencePortions ?? 1,
                                  ),
                                  1,
                                ),
                              ),
                      }))
                    }
                  >
                    {selectedDraftProfile?.technicalSheet?.yieldMode !== 'MASS' && (
                      <option value="PORTIONS">Nombre de portions</option>
                    )}
                    {Number(selectedDraftProfile?.technicalSheet?.totalMassGrams ?? 0) > 0 && (
                      <option value="MASS">Masse totale</option>
                    )}
                  </select>
                </label>
                <label>
                  <span>
                    <Sparkles size={15} />{' '}
                    {draft.quantityMode === 'MASS' ? 'Masse souhaitée (kg)' : 'Nombre de portions'}
                  </span>
                  <input
                    type="number"
                    min={draft.quantityMode === 'MASS' ? '0.001' : '1'}
                    step={draft.quantityMode === 'MASS' ? '0.001' : '1'}
                    value={draft.target}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        target: event.target.value,
                      }))
                    }
                  />
                </label>
                {selectedDraftProfile?.technicalSheet && (
                  <section className="fabrication-recipe-needs-preview">
                    <div className="fabrication-recipe-needs-heading">
                      <div>
                        <span>Aperçu automatique des besoins</span>
                        <strong>
                          Recette ×{' '}
                          {draftQuantityPlan.factor.toLocaleString(activeLocale(), {
                            maximumFractionDigits: 3,
                          })}
                        </strong>
                      </div>
                      <small>
                        {draftQuantityPlan.portions != null
                          ? `${draftQuantityPlan.portions.toLocaleString(activeLocale(), {
                              maximumFractionDigits: 2,
                            })} portions`
                          : ''}
                        {draftQuantityPlan.portions != null &&
                        draftQuantityPlan.massKilograms != null
                          ? ' · '
                          : ''}
                        {draftQuantityPlan.massKilograms != null
                          ? `${draftQuantityPlan.massKilograms.toLocaleString(activeLocale(), {
                              maximumFractionDigits: 3,
                            })} kg`
                          : ''}
                      </small>
                    </div>
                    <div className="fabrication-recipe-needs-list">
                      {(selectedDraftProfile.technicalSheet.ingredients ?? []).map((ingredient) => (
                        <div key={ingredient.id}>
                          <span>{ingredient.product?.name ?? 'Ingrédient'}</span>
                          <strong>
                            {(
                              Number(ingredient.quantity ?? 0) * draftQuantityPlan.factor
                            ).toLocaleString(activeLocale(), {
                              maximumFractionDigits: 3,
                            })}{' '}
                            {ingredient.unit?.symbol ?? ''}
                          </strong>
                        </div>
                      ))}
                    </div>
                    <p>
                      Les ingrédients seront réservés à la validation de la fabrication, puis
                      consommés une seule fois lors de sa réalisation.
                    </p>
                  </section>
                )}
                {draft.serviceId && selectedDraftProfile && (
                  <section className="fabrication-create-team">
                    <div className="fabrication-recipe-needs-heading">
                      <div>
                        <span>Équipe affectée</span>
                        <strong>
                          {createEmployeeIds.length
                            ? `${createEmployeeIds.length} personne${
                                createEmployeeIds.length > 1 ? 's' : ''
                              }`
                            : 'À affecter maintenant ou plus tard'}
                        </strong>
                      </div>
                      <small>Créneau de {draftDurationMinutes} min couvert par le planning</small>
                    </div>
                    <div className="fabrication-assignment-list">
                      {createAssigneesLoading ? (
                        <div className="fabrication-modal-loading">
                          <Loader2 size={18} className="spin" /> Recherche des collaborateurs…
                        </div>
                      ) : createAssigneeOptions.length ? (
                        createAssigneeOptions.map((employee) => {
                          const selected = createEmployeeIds.includes(employee.id);
                          const isLead = selected && createLeadId === employee.id;
                          return (
                            <article
                              key={employee.id}
                              className={`${selected ? 'selected' : ''}${
                                !employee.available ? ' unavailable' : ''
                              }`}
                            >
                              <button
                                type="button"
                                className="fabrication-assignment-select"
                                disabled={!employee.available && !selected}
                                onClick={() => toggleCreateEmployee(employee.id)}
                                aria-label={`${
                                  selected ? 'Retirer' : 'Affecter'
                                } ${collaboratorName(employee)}`}
                              >
                                {selected ? <Check size={16} /> : <Plus size={16} />}
                              </button>
                              <div>
                                <strong>{collaboratorName(employee)}</strong>
                                <span>
                                  {employee.position?.name ??
                                    employee.department?.name ??
                                    'Collaborateur'}
                                  {' · '}
                                  {employee.availabilityLabel}
                                </span>
                              </div>
                              <button
                                type="button"
                                className={`fabrication-assignment-lead${isLead ? ' active' : ''}`}
                                disabled={!selected}
                                onClick={() => setCreateLeadId(employee.id)}
                                title="Définir comme responsable principal"
                              >
                                <Crown size={17} />
                                Responsable
                              </button>
                            </article>
                          );
                        })
                      ) : (
                        <div className="fabrication-closure-empty">
                          Aucun collaborateur planifié sur tout ce créneau.
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
              <footer>
                <button type="button" onClick={() => setCreateOpen(false)}>
                  Annuler
                </button>
                <button
                  type="submit"
                  className="production-btn-primary"
                  disabled={
                    createBusy ||
                    !draft.profileId ||
                    !draft.siteId ||
                    !draft.serviceId ||
                    draftQuantityPlan.grossRequirement <= 0
                  }
                >
                  {createBusy ? <Loader2 size={17} className="spin" /> : <Plus size={17} />}
                  Ajouter au calendrier
                </button>
              </footer>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <TechnicalSheetPickerModal
        open={createRecipePickerOpen && createOpen}
        items={createRecipePickerItems}
        selectedSheetId={draft.profileId}
        title="Catalogue des fiches techniques"
        subtitle="Recherchez la recette à ajouter à cette journée de fabrication."
        emptyMessage="Aucune fiche technique de production n’est configurée pour ce site."
        onClose={() => setCreateRecipePickerOpen(false)}
        onSelectSheet={(item) => selectCreateProfile(item.id)}
      />

      <AnimatePresence>
        {dayValidation && (
          <div
            className="fabrication-modal-overlay"
            onMouseDown={(event) =>
              event.target === event.currentTarget && !dayValidationSaving && setDayValidation(null)
            }
          >
            <motion.section
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              className="fabrication-day-validation-modal"
            >
              <header>
                <div>
                  <span>
                    <CheckCircle2 size={16} /> Consommation des stocks
                  </span>
                  <h2>Valider la journée de production</h2>
                  <p>
                    {formatDay(dayValidation.date)} · {dayValidation.site.name} ·{' '}
                    {dayValidation.orders.length} recette
                    {dayValidation.orders.length > 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDayValidation(null)}
                  disabled={dayValidationSaving}
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </header>

              {dayValidation.completed && (
                <div className="fabrication-day-validation-complete">
                  <CheckCircle2 size={20} />
                  <div>
                    <strong>Journée de production déjà validée</strong>
                    <span>
                      Les ingrédients ont été consommés et les fabrications sont entrées en stock.
                    </span>
                  </div>
                </div>
              )}

              {!dayValidation.orders.length ? (
                <div className="fabrication-closure-empty">
                  Aucune fabrication n’est planifiée pour ce site et cette journée.
                </div>
              ) : (
                <>
                  <div className="fabrication-day-stock-summary">
                    <div>
                      <span>Recettes</span>
                      <strong>{dayValidation.orders.length}</strong>
                    </div>
                    <div>
                      <span>Lots à terminer</span>
                      <strong>{dayValidation.pendingBatchCount}</strong>
                    </div>
                    <div>
                      <span>Ingrédients concernés</span>
                      <strong>{dayValidation.totals.length}</strong>
                    </div>
                  </div>

                  {dayValidation.totals.length > 0 && (
                    <section className="fabrication-day-consumption">
                      <div className="fabrication-day-section-title">
                        <span>Consommation totale prévue</span>
                        <small>Les quantités seront retirées des lots réservés en FEFO.</small>
                      </div>
                      <div className="fabrication-day-consumption-grid">
                        {dayValidation.totals.map((ingredient) => (
                          <div key={`${ingredient.productId}:${ingredient.unitId}`}>
                            <span>{ingredient.productName}</span>
                            <strong>
                              {Number(ingredient.quantity).toLocaleString(activeLocale(), {
                                maximumFractionDigits: 3,
                              })}{' '}
                              {ingredient.unitSymbol}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {dayValidation.blockingIssues.length > 0 && (
                    <section className="fabrication-day-blockers">
                      <div className="fabrication-day-section-title">
                        <span>Points à corriger avant validation</span>
                        <small>
                          Les stocks ne seront pas modifiés tant que ces points restent ouverts.
                        </small>
                      </div>
                      {dayValidation.blockingIssues.map((issue, index) => (
                        <div key={`${issue.code}:${issue.orderId}:${index}`}>
                          <AlertCircle size={16} />
                          <span>{issue.message}</span>
                        </div>
                      ))}
                    </section>
                  )}

                  <div className="fabrication-day-orders">
                    {dayValidation.orders.map((order) => (
                      <article key={order.id}>
                        <div className="fabrication-day-order-head">
                          <div>
                            <span>
                              {order.number} · {order.plannedTime}
                            </span>
                            <h3>{order.name}</h3>
                            <small>
                              {order.service?.name ?? 'Service à définir'} ·{' '}
                              {order.team.length
                                ? order.team.map((member) => member.name).join(', ')
                                : 'Équipe à affecter'}
                            </small>
                          </div>
                          <div className="fabrication-day-portion-math">
                            <span>
                              Fiche{' '}
                              {(
                                Number(order.referenceYield ?? order.referencePortions) /
                                (order.quantityMode === 'MASS' ? 1000 : 1)
                              ).toLocaleString(activeLocale(), {
                                maximumFractionDigits: 3,
                              })}{' '}
                              {order.quantityMode === 'MASS' ? 'kg' : 'portions'}
                            </span>
                            <strong>
                              {(
                                Number(order.requestedQuantity ?? order.requestedPortions) /
                                (order.quantityMode === 'MASS' ? 1000 : 1)
                              ).toLocaleString(activeLocale(), {
                                maximumFractionDigits: 3,
                              })}{' '}
                              {order.quantityMode === 'MASS' ? 'kg' : 'portions'}
                            </strong>
                            <em>
                              Recette ×
                              {Number(order.recipeMultiplier).toLocaleString(activeLocale(), {
                                maximumFractionDigits: 2,
                              })}
                            </em>
                          </div>
                        </div>
                        <div className="fabrication-day-order-ingredients">
                          {order.ingredients.map((ingredient) => (
                            <div key={`${order.id}:${ingredient.productId}`}>
                              <span>{ingredient.productName}</span>
                              <strong>
                                {Number(ingredient.quantity).toLocaleString(activeLocale(), {
                                  maximumFractionDigits: 3,
                                })}{' '}
                                {ingredient.unitSymbol}
                              </strong>
                              <small>
                                Réservé :{' '}
                                {Number(ingredient.reservedQuantity).toLocaleString(activeLocale(), {
                                  maximumFractionDigits: 3,
                                })}{' '}
                                {ingredient.unitSymbol}
                              </small>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}

              {error && (
                <div className="fabrication-calendar-error">
                  <AlertCircle size={17} /> {error}
                </div>
              )}

              <footer>
                <button
                  type="button"
                  onClick={() => setDayValidation(null)}
                  disabled={dayValidationSaving}
                >
                  Fermer
                </button>
                {!dayValidation.completed && dayValidation.orders.length > 0 && (
                  <button
                    type="button"
                    className="production-btn-primary"
                    onClick={() => void confirmProductionDay()}
                    disabled={!dayValidation.ready || dayValidationSaving}
                  >
                    {dayValidationSaving ? (
                      <Loader2 size={17} className="spin" />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                    Confirmer et retirer les stocks
                  </button>
                )}
              </footer>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {closure && (
          <div
            className="fabrication-modal-overlay"
            onMouseDown={(event) => event.target === event.currentTarget && setClosure(null)}
          >
            <motion.section
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 14 }}
              className="fabrication-closure-modal"
            >
              <header>
                <div>
                  <span>
                    <CheckCircle2 size={16} /> Clôture de la journée
                  </span>
                  <h2>{formatDay(dayKey(closure.date))}</h2>
                  <p>
                    {closure.site?.name} · {closure.items.length} produit
                    {closure.items.length > 1 ? 's' : ''}
                  </p>
                </div>
                <button type="button" onClick={() => setClosure(null)}>
                  <X size={18} />
                </button>
              </header>
              {!closure.items.length ? (
                <div className="fabrication-closure-empty">
                  Aucune fabrication à clôturer pour cette journée.
                </div>
              ) : (
                <div className="fabrication-closure-items">
                  {closure.items.map((item, index) => (
                    <article key={item.orderId}>
                      <div className="fabrication-closure-product">
                        <span>
                          Produit {index + 1} sur {closure.items.length}
                        </span>
                        <h3>{item.productName}</h3>
                        <small>
                          {item.orderNumber}
                          {item.plannedTime ? ` · ${item.plannedTime}` : ''}
                        </small>
                      </div>
                      <div className="fabrication-closure-summary">
                        <div>
                          <span>Objectif</span>
                          <strong>{item.targetPortions}</strong>
                        </div>
                        <div>
                          <span>Report précédent</span>
                          <strong>{item.openingCarryOverPortions}</strong>
                        </div>
                        <div>
                          <span>Fabriqué</span>
                          <strong>{item.producedPortions}</strong>
                        </div>
                        <div className="total">
                          <span>Total disponible</span>
                          <strong>{item.totalAvailablePortions}</strong>
                        </div>
                      </div>
                      <div className="fabrication-closure-inputs">
                        <label>
                          Restant physique
                          <input
                            type="number"
                            min="0"
                            max={item.totalAvailablePortions}
                            step="1"
                            disabled={closure.status === 'CLOSED'}
                            value={item.remainingPortions}
                            onChange={(event) => {
                              const remainingPortions = Number(event.target.value);
                              updateClosureItem(item.orderId, {
                                remainingPortions,
                                carryOverNextPortions: remainingPortions,
                              });
                            }}
                          />
                        </label>
                        <label>
                          Jeté / perdu
                          <input
                            type="number"
                            min="0"
                            max={item.totalAvailablePortions}
                            step="1"
                            disabled={closure.status === 'CLOSED'}
                            value={item.discardedPortions}
                            onChange={(event) =>
                              updateClosureItem(item.orderId, {
                                discardedPortions: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Report proposé demain
                          <input
                            type="number"
                            min="0"
                            max={item.remainingPortions}
                            step="1"
                            disabled={closure.status === 'CLOSED'}
                            value={item.carryOverNextPortions}
                            onChange={(event) =>
                              updateClosureItem(item.orderId, {
                                carryOverNextPortions: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label className="calculated">
                          Sorti estimé<strong>{item.estimatedOutPortions}</strong>
                        </label>
                      </div>
                      {item.discardedPortions > 0 && (
                        <label className="fabrication-closure-reason">
                          Motif de la perte
                          <input
                            value={item.lossReason ?? ''}
                            disabled={closure.status === 'CLOSED'}
                            onChange={(event) =>
                              updateClosureItem(item.orderId, { lossReason: event.target.value })
                            }
                            placeholder="Invendu, casse, qualité, péremption…"
                          />
                        </label>
                      )}
                    </article>
                  ))}
                </div>
              )}
              <footer>
                <button type="button" onClick={() => setClosure(null)}>
                  Fermer
                </button>
                {closure.status !== 'CLOSED' && closure.items.length > 0 && (
                  <button
                    type="button"
                    className="production-btn-primary"
                    onClick={() => void closeDay()}
                    disabled={closureSaving}
                  >
                    {closureSaving ? (
                      <Loader2 size={17} className="spin" />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                    Clôturer la journée
                  </button>
                )}
                {closure.status === 'CLOSED' && (
                  <span className="fabrication-closure-closed">
                    <Check size={16} /> Journée clôturée
                  </span>
                )}
              </footer>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

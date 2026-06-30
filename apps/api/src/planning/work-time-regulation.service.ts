import { Injectable } from '@nestjs/common';
import { PlanningConflictSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertWorkTimeRegulationDto } from './dto/planning.dto';

type Actor = { id: string; role: string };
type WorkTimeRegulationRecord = Prisma.EstablishmentWorkTimeRegulationGetPayload<Record<string, never>>;
type WorkTimeValidationStatus = 'draft' | 'requires_review' | 'validated';
type WorkTimeRuleStatus = 'validated' | 'to_confirm';
type WorkTimeRule = {
  key: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string | null;
  sourcePage: number | null;
  sourceSection: string;
  confidence: 'high' | 'medium' | 'low';
  status: WorkTimeRuleStatus;
};
type WorkTimeConflict = {
  severity: PlanningConflictSeverity;
  code: string;
  label: string;
  details: Record<string, unknown>;
};

export type WorkTimeRegulationView = {
  id: string | null;
  organizationId: string | null;
  sourceLayer: 'establishment_internal';
  sourceKind: 'work_time_regulation';
  nightWorkEnabled: boolean;
  nightWorkStartTime: string | null;
  nightWorkEndTime: string | null;
  publicHolidayWorkEnabled: boolean;
  publicHolidayDates: string[];
  weekendWorkEnabled: boolean;
  saturdayWorkAllowed: boolean;
  sundayWorkAllowed: boolean;
  compensationsEnabled: boolean;
  teleworkEnabled: boolean;
  teleworkStartTime: string | null;
  teleworkEndTime: string | null;
  teleworkMinBreakMinutes: number | null;
  teleworkDailyQuotaMinutes: number | null;
  teleworkMaxDaysPerWeek: number | null;
  teleworkMaxDaysPerYearFullTime: number | null;
  teleworkMaxDaysPerYearPartTime: number | null;
  internalRulesSourceDocumentId: string | null;
  sourceDocumentName: string | null;
  sourceDocumentMetadata: Record<string, unknown>;
  extractedRules: WorkTimeRule[];
  rulesToConfirm: WorkTimeRule[];
  positionMapping: Record<string, unknown>;
  validationStatus: WorkTimeValidationStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export const INTERNAL_WORK_TIME_CONFLICT_CODES = [
  'INTERNAL_NIGHT_WORK_DETECTED',
  'INTERNAL_PUBLIC_HOLIDAY_WORK_DETECTED',
  'INTERNAL_WEEKEND_WORK_DETECTED',
];

const SOURCE_DOCUMENT_NAME = '2026 06 Règlement du temps de travail.pdf';
const SOURCE_DOCUMENT_METADATA = {
  extractedAt: '2026-06-30',
  documentTitle: 'Règlement du télétravail',
  pageCount: 6,
  extractionMethod: 'visual_review_after_pdf_text_cid_encoding',
  sourceLayer: 'establishment_internal',
};

const EXTRACTED_RULES: WorkTimeRule[] = [
  { key: 'document_scope', label: 'Périmètre du document', value: 'Télétravail Ville de Saran', unit: null, sourcePage: 1, sourceSection: 'Couverture', confidence: 'high', status: 'validated' },
  { key: 'telework_voluntary_reversible', label: 'Télétravail volontaire et réversible', value: true, unit: null, sourcePage: 2, sourceSection: 'Préambule', confidence: 'high', status: 'validated' },
  { key: 'telework_minimum_work_time', label: 'Agent éligible à partir de 80 % du temps complet', value: 80, unit: '%', sourcePage: 2, sourceSection: 'Champ d’application', confidence: 'high', status: 'validated' },
  { key: 'telework_max_days_per_week', label: 'Télétravail maximum par semaine', value: 1, unit: 'jour', sourcePage: 2, sourceSection: 'Organisation du travail', confidence: 'high', status: 'validated' },
  { key: 'telework_max_days_per_year_full_time', label: 'Télétravail maximum annuel temps complet', value: 47, unit: 'jours', sourcePage: 2, sourceSection: 'Organisation du travail', confidence: 'high', status: 'validated' },
  { key: 'telework_max_days_per_year_part_time', label: 'Télétravail maximum annuel 80 % ou 90 %', value: 37, unit: 'jours', sourcePage: 2, sourceSection: 'Organisation du travail', confidence: 'high', status: 'validated' },
  { key: 'telework_half_day_allowed', label: 'Demi-journée de télétravail possible sous conditions', value: true, unit: null, sourcePage: 3, sourceSection: 'Organisation du travail', confidence: 'medium', status: 'to_confirm' },
  { key: 'telework_no_overtime', label: 'Le télétravail ne génère pas d’heures complémentaires ou supplémentaires', value: true, unit: null, sourcePage: 3, sourceSection: 'Dérogations / organisation', confidence: 'high', status: 'validated' },
  { key: 'telework_start_time', label: 'Début plage de travail télétravail', value: '08:00', unit: 'heure', sourcePage: 4, sourceSection: 'Droits et obligations', confidence: 'high', status: 'validated' },
  { key: 'telework_end_time', label: 'Fin plage de travail télétravail', value: '17:00', unit: 'heure', sourcePage: 4, sourceSection: 'Droits et obligations', confidence: 'high', status: 'validated' },
  { key: 'telework_min_break', label: 'Pause méridienne minimale en télétravail', value: 45, unit: 'minutes', sourcePage: 4, sourceSection: 'Droits et obligations', confidence: 'high', status: 'validated' },
  { key: 'telework_daily_quota', label: 'Temps réel comptabilisé dans le quota journalier', value: 436, unit: 'minutes', sourcePage: 4, sourceSection: 'Droits et obligations', confidence: 'high', status: 'validated' },
  { key: 'telework_no_public_reception', label: 'Pas d’accueil public ni rendez-vous professionnel au domicile', value: true, unit: null, sourcePage: 4, sourceSection: 'Droits et obligations', confidence: 'high', status: 'validated' },
  { key: 'telework_equipment_city_only', label: 'Utilisation du matériel fourni par l’établissement', value: true, unit: null, sourcePage: 6, sourceSection: 'Équipement', confidence: 'high', status: 'validated' },
];

const RULES_TO_CONFIRM: WorkTimeRule[] = [
  { key: 'night_work', label: 'Heures de nuit', value: null, unit: 'plage horaire', sourcePage: null, sourceSection: 'Non trouvé dans le PDF fourni', confidence: 'low', status: 'to_confirm' },
  { key: 'public_holiday_work', label: 'Jours fériés travaillés', value: null, unit: null, sourcePage: null, sourceSection: 'Non trouvé dans le PDF fourni', confidence: 'low', status: 'to_confirm' },
  { key: 'weekend_work', label: 'Travail le week-end', value: null, unit: null, sourcePage: null, sourceSection: 'Non trouvé dans le PDF fourni', confidence: 'low', status: 'to_confirm' },
  { key: 'on_call', label: 'Astreintes', value: null, unit: null, sourcePage: null, sourceSection: 'Non trouvé dans le PDF fourni', confidence: 'low', status: 'to_confirm' },
  { key: 'compensations', label: 'Récupération ou compensation interne', value: null, unit: null, sourcePage: null, sourceSection: 'Non trouvé dans le PDF fourni', confidence: 'low', status: 'to_confirm' },
  { key: 'rtt_internal', label: 'RTT ou droit interne dédié', value: null, unit: null, sourcePage: null, sourceSection: 'ARTT seulement mentionné comme contexte de demi-journée', confidence: 'low', status: 'to_confirm' },
];

const TARGET_POSITIONS: Record<string, string> = {
  berenger: 'Chef de production',
  cedric: 'Responsable logistique',
  romain: 'Aide magasinier',
  emmanuel: 'Chef de partie',
  geoffroy: 'Chef de partie',
};

@Injectable()
export class WorkTimeRegulationService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string): Promise<WorkTimeRegulationView> {
    const record = await this.prisma.establishmentWorkTimeRegulation.findUnique({ where: { organizationId } });
    return this.toView(record, organizationId);
  }

  async upsert(organizationId: string, actor: Actor, dto: UpsertWorkTimeRegulationDto): Promise<WorkTimeRegulationView> {
    const data = this.buildWritePayload(dto, actor.id);
    const record = await this.prisma.establishmentWorkTimeRegulation.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ...(this.defaultWritePayload(actor.id) as Record<string, unknown>),
        ...(data as Record<string, unknown>),
      } as Prisma.EstablishmentWorkTimeRegulationUncheckedCreateInput,
      update: data,
    });
    return this.toView(record, organizationId);
  }

  async positionMappingPreview(organizationId: string) {
    const employees = await this.prisma.hrEmployee.findMany({
      where: { organizationId, isArchived: false },
      include: { position: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const matchedExpected = new Set<string>();
    const matches = employees.map((employee) => {
      const fullName = `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim();
      const firstNameKey = this.normalizeName(employee.firstName ?? '');
      const fullNameKey = this.normalizeName(fullName);
      const explicitKey = Object.keys(TARGET_POSITIONS).find((key) => firstNameKey === key || fullNameKey.includes(key));
      const proposedPosition = explicitKey ? TARGET_POSITIONS[explicitKey] : 'Cuisinier';
      if (explicitKey) matchedExpected.add(explicitKey);
      const currentPosition = employee.position?.name ?? null;
      return {
        employeeId: employee.id,
        employeeName: fullName || employee.email || employee.id,
        currentPosition,
        proposedPosition,
        status: currentPosition === proposedPosition ? 'already_matches' : explicitKey ? 'to_confirm_named_match' : 'to_confirm_default_cook',
        confidence: explicitKey ? 'medium' : 'low',
        sourceLayer: 'establishment_internal',
        sourceKind: 'received_business_mapping',
        willModify: false,
      };
    });
    const expectedNamesMissing = Object.keys(TARGET_POSITIONS)
      .filter((key) => !matchedExpected.has(key))
      .map((key) => ({ name: key, proposedPosition: TARGET_POSITIONS[key], status: 'not_found', willModify: false }));
    return { sourceLayer: 'establishment_internal', updated: false, matches, expectedNamesMissing };
  }

  analyzeAssignment(regulation: WorkTimeRegulationView | null | undefined, assignment: Record<string, any>): WorkTimeConflict[] {
    const view = regulation ?? this.defaultView(String(assignment.organizationId ?? ''));
    const conflicts: WorkTimeConflict[] = [];
    const date = this.asDate(assignment.date ?? assignment.startTime);
    const startTime = this.asDate(assignment.startTime);
    const endTime = this.asDate(assignment.endTime);
    if (!date || !startTime || !endTime) return conflicts;
    const plannedMinutes = this.assignmentMinutes(assignment);

    const nightMinutes = this.nightOverlapMinutes(view, startTime, endTime);
    if (nightMinutes > 0) {
      conflicts.push(this.internalConflict(
        view,
        'INTERNAL_NIGHT_WORK_DETECTED',
        this.confirmationLabel(view, 'Heure de nuit détectée'),
        nightMinutes,
        view.nightWorkEnabled && view.validationStatus === 'validated',
      ));
    }

    const holidayDate = this.isoDate(date);
    if (view.publicHolidayDates.includes(holidayDate)) {
      conflicts.push(this.internalConflict(
        view,
        'INTERNAL_PUBLIC_HOLIDAY_WORK_DETECTED',
        this.confirmationLabel(view, 'Jour férié travaillé'),
        plannedMinutes,
        view.publicHolidayWorkEnabled && view.validationStatus === 'validated',
      ));
    }

    const day = date.getDay();
    if (day === 0 || day === 6) {
      const allowed = view.weekendWorkEnabled || (day === 6 && view.saturdayWorkAllowed) || (day === 0 && view.sundayWorkAllowed);
      conflicts.push(this.internalConflict(
        view,
        'INTERNAL_WEEKEND_WORK_DETECTED',
        allowed && view.validationStatus === 'validated' ? 'Travail week-end' : 'Travail week-end - règle interne à confirmer',
        plannedMinutes,
        allowed && view.validationStatus === 'validated',
      ));
    }

    return conflicts;
  }

  trackingSummary(assignments: Array<Record<string, any>>, regulation: WorkTimeRegulationView) {
    const rows = new Map<string, Record<string, unknown>>();
    for (const assignment of assignments) {
      if (assignment.status === 'CANCELLED') continue;
      for (const conflict of this.analyzeAssignment(regulation, assignment)) {
        const details = conflict.details;
        const trackedMinutes = Number(details.trackedMinutes ?? 0);
        if (!trackedMinutes) continue;
        const employeeId = String(assignment.employeeId ?? '');
        if (!employeeId) continue;
        const key = `${employeeId}:${conflict.code}`;
        const employee = assignment.employee ?? {};
        const row = rows.get(key) ?? {
          employeeId,
          employeeName: `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim() || employee.email || employeeId,
          jobTitle: assignment.position?.name ?? employee.position?.name ?? '',
          accountType: 'internal_tracking',
          code: conflict.code,
          label: this.trackingLabel(conflict.code),
          unit: 'MINUTES',
          quantity: 0,
          status: regulation.validationStatus === 'validated' ? 'OK' : 'TO_VALIDATE',
          validationStatus: regulation.validationStatus,
          sourceLayer: 'establishment_internal',
          balanceImpact: 'tracking_only',
          compensationGenerated: false,
        };
        row.quantity = Number(row.quantity ?? 0) + trackedMinutes;
        rows.set(key, row);
      }
    }
    return {
      sourceLayer: 'establishment_internal',
      balanceImpact: 'tracking_only',
      compensationGenerated: false,
      rows: [...rows.values()].sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName)) || String(a.label).localeCompare(String(b.label))),
    };
  }

  private toView(record: WorkTimeRegulationRecord | null, organizationId: string | null): WorkTimeRegulationView {
    if (!record) return this.defaultView(organizationId);
    return {
      id: record.id,
      organizationId: record.organizationId,
      sourceLayer: 'establishment_internal',
      sourceKind: 'work_time_regulation',
      nightWorkEnabled: record.nightWorkEnabled,
      nightWorkStartTime: record.nightWorkStartTime,
      nightWorkEndTime: record.nightWorkEndTime,
      publicHolidayWorkEnabled: record.publicHolidayWorkEnabled,
      publicHolidayDates: this.stringArray(record.publicHolidayDates),
      weekendWorkEnabled: record.weekendWorkEnabled,
      saturdayWorkAllowed: record.saturdayWorkAllowed,
      sundayWorkAllowed: record.sundayWorkAllowed,
      compensationsEnabled: record.compensationsEnabled,
      teleworkEnabled: record.teleworkEnabled,
      teleworkStartTime: record.teleworkStartTime,
      teleworkEndTime: record.teleworkEndTime,
      teleworkMinBreakMinutes: record.teleworkMinBreakMinutes,
      teleworkDailyQuotaMinutes: record.teleworkDailyQuotaMinutes,
      teleworkMaxDaysPerWeek: record.teleworkMaxDaysPerWeek,
      teleworkMaxDaysPerYearFullTime: record.teleworkMaxDaysPerYearFullTime,
      teleworkMaxDaysPerYearPartTime: record.teleworkMaxDaysPerYearPartTime,
      internalRulesSourceDocumentId: record.internalRulesSourceDocumentId,
      sourceDocumentName: record.sourceDocumentName,
      sourceDocumentMetadata: this.objectValue(record.sourceDocumentMetadata),
      extractedRules: this.rulesArray(record.extractedRules, EXTRACTED_RULES),
      rulesToConfirm: this.rulesArray(record.rulesToConfirm, RULES_TO_CONFIRM),
      positionMapping: this.objectValue(record.positionMapping),
      validationStatus: this.validationStatus(record.validationStatus),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private defaultView(organizationId: string | null): WorkTimeRegulationView {
    return {
      id: null,
      organizationId,
      sourceLayer: 'establishment_internal',
      sourceKind: 'work_time_regulation',
      nightWorkEnabled: false,
      nightWorkStartTime: null,
      nightWorkEndTime: null,
      publicHolidayWorkEnabled: false,
      publicHolidayDates: [],
      weekendWorkEnabled: false,
      saturdayWorkAllowed: false,
      sundayWorkAllowed: false,
      compensationsEnabled: false,
      teleworkEnabled: true,
      teleworkStartTime: '08:00',
      teleworkEndTime: '17:00',
      teleworkMinBreakMinutes: 45,
      teleworkDailyQuotaMinutes: 7 * 60 + 16,
      teleworkMaxDaysPerWeek: 1,
      teleworkMaxDaysPerYearFullTime: 47,
      teleworkMaxDaysPerYearPartTime: 37,
      internalRulesSourceDocumentId: null,
      sourceDocumentName: SOURCE_DOCUMENT_NAME,
      sourceDocumentMetadata: SOURCE_DOCUMENT_METADATA,
      extractedRules: EXTRACTED_RULES,
      rulesToConfirm: RULES_TO_CONFIRM,
      positionMapping: { sourceLayer: 'establishment_internal', updated: false },
      validationStatus: 'requires_review',
      createdAt: null,
      updatedAt: null,
    };
  }

  private defaultWritePayload(userId?: string | null) {
    return {
      teleworkEnabled: true,
      teleworkStartTime: '08:00',
      teleworkEndTime: '17:00',
      teleworkMinBreakMinutes: 45,
      teleworkDailyQuotaMinutes: 7 * 60 + 16,
      teleworkMaxDaysPerWeek: 1,
      teleworkMaxDaysPerYearFullTime: 47,
      teleworkMaxDaysPerYearPartTime: 37,
      sourceDocumentName: SOURCE_DOCUMENT_NAME,
      sourceDocumentMetadata: SOURCE_DOCUMENT_METADATA as Prisma.InputJsonValue,
      extractedRules: EXTRACTED_RULES as Prisma.InputJsonValue,
      rulesToConfirm: RULES_TO_CONFIRM as Prisma.InputJsonValue,
      positionMapping: { sourceLayer: 'establishment_internal', updated: false } as Prisma.InputJsonValue,
      validationStatus: 'requires_review',
      createdById: userId ?? null,
      updatedById: userId ?? null,
    };
  }

  private buildWritePayload(dto: UpsertWorkTimeRegulationDto, userId?: string | null): Prisma.EstablishmentWorkTimeRegulationUncheckedUpdateInput {
    const data: Prisma.EstablishmentWorkTimeRegulationUncheckedUpdateInput = { updatedById: userId ?? null };
    const booleanFields = ['nightWorkEnabled', 'publicHolidayWorkEnabled', 'weekendWorkEnabled', 'saturdayWorkAllowed', 'sundayWorkAllowed', 'compensationsEnabled', 'teleworkEnabled'] as const;
    for (const field of booleanFields) if (dto[field] !== undefined) (data as Record<string, unknown>)[field] = Boolean(dto[field]);
    const stringFields = ['nightWorkStartTime', 'nightWorkEndTime', 'teleworkStartTime', 'teleworkEndTime', 'internalRulesSourceDocumentId', 'sourceDocumentName', 'validationStatus'] as const;
    for (const field of stringFields) if (dto[field] !== undefined) (data as Record<string, unknown>)[field] = dto[field] || null;
    const intFields = ['teleworkMinBreakMinutes', 'teleworkDailyQuotaMinutes', 'teleworkMaxDaysPerWeek', 'teleworkMaxDaysPerYearFullTime', 'teleworkMaxDaysPerYearPartTime'] as const;
    for (const field of intFields) if (dto[field] !== undefined) (data as Record<string, unknown>)[field] = Number(dto[field]);
    if (dto.publicHolidayDates !== undefined) data.publicHolidayDates = dto.publicHolidayDates.filter(Boolean) as Prisma.InputJsonValue;
    if (dto.sourceDocumentMetadata !== undefined) data.sourceDocumentMetadata = dto.sourceDocumentMetadata as Prisma.InputJsonValue;
    if (dto.extractedRules !== undefined) data.extractedRules = dto.extractedRules as Prisma.InputJsonValue;
    if (dto.rulesToConfirm !== undefined) data.rulesToConfirm = dto.rulesToConfirm as Prisma.InputJsonValue;
    if (dto.positionMapping !== undefined) data.positionMapping = dto.positionMapping as Prisma.InputJsonValue;
    return data;
  }

  private internalConflict(view: WorkTimeRegulationView, code: string, label: string, trackedMinutes: number, validated: boolean): WorkTimeConflict {
    return {
      severity: validated ? PlanningConflictSeverity.INFO : PlanningConflictSeverity.STRONG_WARNING,
      code,
      label,
      details: {
        sourceLayer: 'establishment_internal',
        sourceKind: 'work_time_regulation',
        sourceDocumentName: view.sourceDocumentName,
        validationStatus: view.validationStatus,
        trackedMinutes,
        unit: 'MINUTES',
        balanceImpact: 'tracking_only',
        compensationGenerated: false,
        legalRightId: null,
        message: validated ? label : `${label}. Aucune majoration ni compensation n’est calculée tant que la règle interne n’est pas validée.`,
      },
    };
  }

  private confirmationLabel(view: WorkTimeRegulationView, label: string) {
    return view.validationStatus === 'validated' ? label : `${label} - règle interne à confirmer`;
  }

  private trackingLabel(code: string) {
    if (code === 'INTERNAL_NIGHT_WORK_DETECTED') return 'Heures de nuit détectées (suivi)';
    if (code === 'INTERNAL_PUBLIC_HOLIDAY_WORK_DETECTED') return 'Heures jour férié détectées (suivi)';
    if (code === 'INTERNAL_WEEKEND_WORK_DETECTED') return 'Heures week-end détectées (suivi)';
    return 'Heures internes détectées (suivi)';
  }

  private nightOverlapMinutes(view: WorkTimeRegulationView, start: Date, end: Date) {
    const nightStart = this.timeToMinutes(view.nightWorkStartTime);
    const nightEnd = this.timeToMinutes(view.nightWorkEndTime);
    if (nightStart == null || nightEnd == null) return 0;
    let total = 0;
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - 1);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);
    last.setDate(last.getDate() + 1);
    while (cursor <= last) {
      const windowStart = new Date(cursor);
      windowStart.setHours(Math.floor(nightStart / 60), nightStart % 60, 0, 0);
      const windowEnd = new Date(cursor);
      windowEnd.setHours(Math.floor(nightEnd / 60), nightEnd % 60, 0, 0);
      if (nightEnd <= nightStart) windowEnd.setDate(windowEnd.getDate() + 1);
      total += this.overlapMinutes(start, end, windowStart, windowEnd);
      cursor.setDate(cursor.getDate() + 1);
    }
    return total;
  }

  private overlapMinutes(start: Date, end: Date, windowStart: Date, windowEnd: Date) {
    const overlapStart = Math.max(start.getTime(), windowStart.getTime());
    const overlapEnd = Math.min(end.getTime(), windowEnd.getTime());
    return Math.max(0, Math.round((overlapEnd - overlapStart) / 60000));
  }

  private assignmentMinutes(assignment: Record<string, any>) {
    const start = this.asDate(assignment.startTime);
    const end = this.asDate(assignment.endTime);
    if (!start || !end) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000) - Number(assignment.breakMinutes ?? 0));
  }

  private timeToMinutes(value?: string | null) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  private asDate(value: unknown) {
    if (value instanceof Date) return value;
    if (!value) return null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isoDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeName(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  }

  private validationStatus(value?: string | null): WorkTimeValidationStatus {
    return value === 'draft' || value === 'validated' ? value : 'requires_review';
  }

  private stringArray(value: Prisma.JsonValue | null | undefined) {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  }

  private objectValue(value: Prisma.JsonValue | null | undefined) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private rulesArray(value: Prisma.JsonValue | null | undefined, fallback: WorkTimeRule[]) {
    return Array.isArray(value) ? value as WorkTimeRule[] : fallback;
  }
}

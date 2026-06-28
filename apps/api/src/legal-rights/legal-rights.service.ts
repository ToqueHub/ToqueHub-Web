import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HrAbsenceStatus, HrAbsenceType, HrEntitlementAccrualFrequency, PlanningAssignmentStatus, PlanningTimeUnit, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePlanningAssignmentMinutes } from '../planning/planning-time';
import { ActivateLegalRightDto, CalculateLegalRightsDto, LegalProfileDto, LegalRightsSearchQueryDto, PlanningComplianceCheckDto, PlanningComplianceShiftDto } from './dto/legal-rights.dto';
import legalSeed from './data/fr-v1.json';
import { seedFrenchLegalRights } from './legal-rights.seed';

type ResolvedLegalProfile = {
  countryCode: 'FR' | 'FI';
  regimeType: 'private' | 'public' | 'common';
  agreementId: string | null;
  agreement: any | null;
  publicRegimeId: string | null;
  publicRegime: any | null;
  establishmentId: string | null;
  contractType: string | null;
  weeklyHours: number | null;
  annualHours: number | null;
  seniorityStartDate: Date | null;
  fullTimeEquivalent: number;
  isSeasonal: boolean;
  localAgreementJson: Record<string, any>;
  source: 'explicit' | 'derived';
  warnings: string[];
};

type RuleSelection = {
  rule: any | null;
  incompleteRules: any[];
  status: 'calculated' | 'incomplete' | 'not_applicable';
  message?: string;
};

type NormalizedShift = PlanningComplianceShiftDto & {
  employeeId: string;
  start: Date;
  end: Date;
  grossMinutes: number;
  plannedMinutes: number;
  breakMinutes: number;
};

const CALCULABLE_FORMULAS = new Set([
  'monthly_accrual',
  'monthly_accrual_capped',
  'family_event_days',
  'sick_child_leave',
  'public_annual_leave',
  'annual_working_time',
  'planning_min_rest',
  'planning_weekly_rest',
  'planning_break_after_work',
  'overtime_threshold',
  'holiday_paid_if_not_worked',
  'pay_multiplier',
]);

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable'];

@Injectable()
export class LegalRightsService {
  private readonly logger = new Logger(LegalRightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async importFranceV1() {
    return seedFrenchLegalRights(this.prisma, legalSeed, { logger: { log: (message) => this.logger.log(message) } });
  }

  async diagnostics(organizationId?: string) {
    try {
      const organization = organizationId ? await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, regulatoryCountryCode: true },
      }) : null;
      const regulatoryCountryCode = this.countryCode(organization?.regulatoryCountryCode);
      const countryWhere = regulatoryCountryCode ? { countryCode: regulatoryCountryCode } : {};
      const [regimes, agreements, publicRegimes, rights, ruleVersions, activeRules, requiresReviewRules, batches, configsTotal, configsEnabled, configsDisabled] = await Promise.all([
        this.prisma.legalRegime.count(),
        this.prisma.collectiveAgreement.count(),
        this.prisma.publicRegime.count(),
        regulatoryCountryCode ? this.prisma.legalRight.count({ where: { ruleVersions: { some: countryWhere } } }) : this.prisma.legalRight.count(),
        this.prisma.legalRightRuleVersion.count({ where: countryWhere }),
        this.prisma.legalRightRuleVersion.count({ where: { ...countryWhere, active: true } }),
        this.prisma.legalRightRuleVersion.count({ where: { ...countryWhere, validationStatus: 'requires_review' } }),
        this.prisma.legalImportBatch.findMany({ orderBy: { importedAt: 'desc' }, take: 1 }),
        organizationId ? this.prisma.hrEntitlementRule.count({ where: { organizationId } }) : Promise.resolve(0),
        organizationId ? this.prisma.hrEntitlementRule.count({ where: { organizationId, enabled: true } }) : Promise.resolve(0),
        organizationId ? this.prisma.hrEntitlementRule.count({ where: { organizationId, enabled: false } }) : Promise.resolve(0),
      ]);
      const latest = batches[0] ?? null;
      return {
        migrationApplied: true,
        organizationId: organization?.id ?? organizationId ?? null,
        regulatoryCountryCode,
        status: regulatoryCountryCode ? 'ready' : 'missing_regulatory_country',
        legalBase: regulatoryCountryCode ? {
          country: regulatoryCountryCode,
          rightsCount: rights,
          ruleVersionsCount: ruleVersions,
          requiresReviewCount: requiresReviewRules,
        } : null,
        establishmentConfigurations: {
          total: configsTotal,
          enabled: configsEnabled,
          disabled: configsDisabled,
        },
        counts: {
          regimes,
          collectiveAgreements: agreements,
          publicRegimes,
          rights,
          ruleVersions,
          activeRules,
          requiresReviewRules,
          sources: legalSeed.sources.length,
        },
        lastImport: latest ? {
          importedAt: latest.importedAt,
          sourceVersion: latest.sourceVersion,
          sourceFile: latest.sourceFile,
          sourceHash: latest.sourceHash,
          status: latest.status,
          counts: latest.counts,
        } : null,
        sourceHash: latest?.sourceHash ?? legalSeed.sourceWorkbookSha256,
        importErrors: latest && latest.status !== 'SUCCESS' ? [`Dernier import en statut ${latest.status}`] : [],
      };
    } catch (error) {
      if (this.isMissingLegalTablesError(error)) {
        return {
          migrationApplied: false,
          counts: {
            regimes: 0,
            collectiveAgreements: 0,
            publicRegimes: 0,
            rights: 0,
            ruleVersions: 0,
            activeRules: 0,
            requiresReviewRules: 0,
            sources: legalSeed.sources.length,
          },
          lastImport: null,
          sourceHash: legalSeed.sourceWorkbookSha256,
          importErrors: ['Les tables legal_* ne sont pas présentes. Lancez la migration avant le seed légal.'],
        };
      }
      throw error;
    }
  }

  async search(q: LegalRightsSearchQueryDto, organizationId?: string) {
    const effectiveDate = this.day(q.effectiveDate ?? new Date());
    const organizationCountry = await this.regulatoryCountryForOrganization(organizationId);
    const countryCode = organizationId ? organizationCountry : this.countryCode(q.country) ?? 'FR';
    if (organizationId && !countryCode) {
      return {
        query: q.query ?? null,
        country: null,
        count: 0,
        status: 'missing_regulatory_country',
        message: 'Choisissez le pays de réglementation dans Organisation > Général pour charger les droits applicables.',
        items: [],
      };
    }
    const resolvedCountryCode = countryCode ?? 'FR';
    const sectorFilter = this.searchSectorFilter(q.regime);
    const validationFilter = this.searchValidationFilter(q);
    const idcc = q.idcc?.trim();
    const publicRegime = q.publicRegime?.trim().toUpperCase();
    const rights = await this.prisma.legalRight.findMany({
      where: {
        active: true,
        ...(q.category ? { category: { contains: q.category, mode: 'insensitive' } } : {}),
        ...(q.tag ? { tags: { has: q.tag } } : {}),
      },
      include: {
        ruleVersions: {
          where: {
            active: true,
            countryCode: resolvedCountryCode,
            effectiveFrom: { lte: effectiveDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
            sector: { in: sectorFilter },
            ...(validationFilter ? { validationStatus: validationFilter } : {}),
            ...(idcc ? { agreement: { idcc } } : {}),
            ...(publicRegime ? { publicRegime: { code: publicRegime } } : {}),
          },
          include: { regime: true, agreement: true, publicRegime: true },
          orderBy: [{ priority: 'asc' }, { validationStatus: 'asc' }],
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      take: 500,
    });
    const terms = this.searchTerms(q.query);
    const activated = await this.activatedLegalRights(organizationId);
    const scored = rights
      .map((right) => ({ right, score: this.searchScore(right, terms, q) }))
      .filter((item) => item.right.ruleVersions.length > 0 && (!terms.length || item.score > 0))
      .sort((a, b) => b.score - a.score || a.right.name.localeCompare(b.right.name))
      .slice(0, 100);

    return {
      query: q.query ?? null,
      country: resolvedCountryCode,
      count: scored.length,
      items: scored.map(({ right, score }) => ({
        id: right.id,
        code: right.code,
        name: right.name,
        category: right.category,
        description: right.description,
        tags: right.tags,
        score,
        activated: activated.has(right.id),
        organizationRuleId: activated.get(right.id) ?? null,
        rules: right.ruleVersions.map((rule) => this.ruleSummary(rule)),
      })),
    };
  }

  async activateRight(organizationId: string, actor: { id: string; role: string }, idOrCode: string, dto: ActivateLegalRightDto = {}) {
    this.assertWrite(actor);
    const countryCode = await this.requireRegulatoryCountry(organizationId);
    const right = await this.prisma.legalRight.findFirst({
      where: { OR: [...(this.isUuid(idOrCode) ? [{ id: idOrCode }] : []), { code: idOrCode.toUpperCase() }] },
      include: {
        ruleVersions: {
          where: { active: true, countryCode },
          include: { regime: true, agreement: true, publicRegime: true },
          orderBy: [{ validationStatus: 'asc' }, { priority: 'asc' }, { effectiveFrom: 'desc' }],
        },
      },
    });
    if (!right) throw new NotFoundException('Droit légal introuvable');
    const selectedRuleVersion = dto.ruleVersionId
      ? right.ruleVersions.find((rule) => rule.id === dto.ruleVersionId)
      : right.ruleVersions.find((rule) => rule.validationStatus === 'active') ?? right.ruleVersions[0];
    if (!selectedRuleVersion) throw new BadRequestException('Aucune version de règle active disponible pour ce droit légal');
    const code = this.organizationLegalRuleCode(countryCode, right.code);
    // Activating a legal right creates an establishment configuration.
    // It never duplicates or mutates the LegalRight/LegalRightRuleVersion source records.
    const metadata = {
      source: `LEGAL_RIGHTS_${countryCode}_V1`,
      sourceLegalRightId: right.id,
      sourceLegalRightCode: right.code,
      sourceRuleVersionId: selectedRuleVersion.id,
      sourceRuleStableId: selectedRuleVersion.stableId,
      validationStatus: selectedRuleVersion.validationStatus,
      agreementId: selectedRuleVersion.agreementId,
      publicRegimeId: selectedRuleVersion.publicRegimeId,
      localOverrideAllowed: true,
    };
    const establishmentConfiguration = await this.prisma.hrEntitlementRule.upsert({
      where: { organizationId_code: { organizationId, code } },
      create: {
        organizationId,
        code,
        label: right.name,
        description: right.description,
        accountType: this.accountTypeFor(right.category, right.code),
        unit: this.planningUnit(selectedRuleVersion.unit),
        accrualFrequency: this.accrualFrequency(selectedRuleVersion.formulaType),
        accrualQuantity: selectedRuleVersion.value,
        startsAfterTrialPeriod: Boolean(selectedRuleVersion.minSeniorityMonths && selectedRuleVersion.minSeniorityMonths > 0),
        minimumSeniorityMonths: selectedRuleVersion.minSeniorityMonths,
        prorateByContractTime: Boolean(selectedRuleVersion.fullTimeEquivalent),
        carryOverEnabled: this.hasTag(right.tags, 'report') || this.hasTag(right.tags, 'récupération') || this.hasTag(right.tags, 'recuperation'),
        enabled: true,
        metadata,
        sourceRightId: right.id,
        sourceRuleVersionId: selectedRuleVersion.id,
        localSettingsJson: (dto.localSettingsJson ?? {}) as Prisma.InputJsonValue,
        overrideReason: dto.overrideReason ?? null,
        createdById: actor.id,
        updatedById: actor.id,
      },
      update: {
        label: right.name,
        description: right.description,
        accountType: this.accountTypeFor(right.category, right.code),
        unit: this.planningUnit(selectedRuleVersion.unit),
        accrualFrequency: this.accrualFrequency(selectedRuleVersion.formulaType),
        accrualQuantity: selectedRuleVersion.value,
        startsAfterTrialPeriod: Boolean(selectedRuleVersion.minSeniorityMonths && selectedRuleVersion.minSeniorityMonths > 0),
        minimumSeniorityMonths: selectedRuleVersion.minSeniorityMonths,
        prorateByContractTime: Boolean(selectedRuleVersion.fullTimeEquivalent),
        carryOverEnabled: this.hasTag(right.tags, 'report') || this.hasTag(right.tags, 'récupération') || this.hasTag(right.tags, 'recuperation'),
        enabled: true,
        metadata,
        sourceRightId: right.id,
        sourceRuleVersionId: selectedRuleVersion.id,
        localSettingsJson: (dto.localSettingsJson ?? {}) as Prisma.InputJsonValue,
        overrideReason: dto.overrideReason ?? null,
        updatedById: actor.id,
      },
    });
    return {
      activated: true,
      establishmentConfiguration,
      rule: establishmentConfiguration,
      legalRight: {
        id: right.id,
        code: right.code,
        name: right.name,
        validationStatus: selectedRuleVersion.validationStatus,
        sourceRuleVersionId: selectedRuleVersion.id,
        sourceRuleStableId: selectedRuleVersion.stableId,
      },
      warning: selectedRuleVersion.validationStatus === 'requires_review'
        ? 'Cette règle est activée comme modèle établissement, mais elle reste à valider juridiquement avant usage RH/paie définitif.'
        : null,
    };
  }

  async detail(idOrCode: string, organizationId?: string) {
    const organizationCountry = await this.regulatoryCountryForOrganization(organizationId);
    const right = await this.prisma.legalRight.findFirst({
      where: { OR: [...(this.isUuid(idOrCode) ? [{ id: idOrCode }] : []), { code: idOrCode.toUpperCase() }] },
      include: {
        ruleVersions: {
          where: organizationCountry ? { countryCode: organizationCountry } : undefined,
          include: { regime: true, agreement: true, publicRegime: true },
          orderBy: [{ priority: 'asc' }, { effectiveFrom: 'desc' }],
        },
      },
    });
    if (!right) throw new NotFoundException('Droit introuvable');
    return {
      id: right.id,
      code: right.code,
      name: right.name,
      category: right.category,
      description: right.description,
      tags: right.tags,
      active: right.active,
      rules: right.ruleVersions.map((rule) => this.ruleDetail(rule)),
    };
  }

  async employeeProfile(organizationId: string, employeeId: string, effectiveDate?: string) {
    await this.ensureEmployee(organizationId, employeeId);
    return this.resolveEmployeeProfile(organizationId, employeeId, this.day(effectiveDate ?? new Date()));
  }

  async upsertEmployeeProfile(organizationId: string, employeeId: string, dto: LegalProfileDto) {
    await this.ensureEmployee(organizationId, employeeId);
    const agreement = dto.agreementId
      ? await this.prisma.collectiveAgreement.findFirst({ where: { id: dto.agreementId, active: true } })
      : dto.idcc
        ? await this.prisma.collectiveAgreement.findFirst({ where: { idcc: dto.idcc, active: true } })
        : null;
    const publicRegime = dto.publicRegimeId
      ? await this.prisma.publicRegime.findFirst({ where: { id: dto.publicRegimeId, active: true } })
      : dto.publicRegime
        ? await this.prisma.publicRegime.findFirst({ where: { code: dto.publicRegime, active: true } })
        : null;
    if (dto.regimeType === 'private' && !agreement) throw new BadRequestException('Convention collective requise pour un profil privé explicite');
    if (dto.regimeType === 'public' && !publicRegime) throw new BadRequestException('Régime public requis pour un profil public explicite');
    const effectiveFrom = this.day(dto.effectiveFrom ?? new Date());
    const existing = await this.prisma.employeeLegalProfile.findFirst({ where: { organizationId, employeeId, effectiveFrom } });
    const payload: Prisma.EmployeeLegalProfileUncheckedCreateInput = {
      organizationId,
      employeeId,
      establishmentId: dto.establishmentId ?? null,
      regimeType: dto.regimeType ?? (publicRegime ? 'public' : 'private'),
      agreementId: agreement?.id ?? null,
      publicRegimeId: publicRegime?.id ?? null,
      contractType: dto.contractType ?? null,
      weeklyHours: dto.weeklyHours == null ? null : new Prisma.Decimal(dto.weeklyHours),
      annualHours: dto.annualHours == null ? null : new Prisma.Decimal(dto.annualHours),
      seniorityStartDate: dto.seniorityStartDate ? this.day(dto.seniorityStartDate) : null,
      fullTimeEquivalent: dto.fullTimeEquivalent == null ? null : new Prisma.Decimal(dto.fullTimeEquivalent),
      isSeasonal: dto.isSeasonal ?? false,
      localAgreementJson: (dto.localAgreementJson ?? {}) as Prisma.InputJsonValue,
      effectiveFrom,
      effectiveTo: dto.effectiveTo ? this.day(dto.effectiveTo) : null,
    };
    const profile = existing
      ? await this.prisma.employeeLegalProfile.update({ where: { id: existing.id }, data: payload })
      : await this.prisma.employeeLegalProfile.create({ data: payload });
    return { profileId: profile.id, profile: await this.resolveEmployeeProfile(organizationId, employeeId, effectiveFrom) };
  }

  async calculate(organizationId: string, dto: CalculateLegalRightsDto): Promise<any> {
    const regulatoryCountry = await this.regulatoryCountryForOrganization(organizationId);
    if (!regulatoryCountry) return this.blockedByMissingRegulatoryCountry();
    const employeeId = dto.employeeId ?? dto.employee_id;
    if (!employeeId) throw new BadRequestException('employee_id est requis');
    const year = new Date().getUTCFullYear();
    const periodStart = this.day(dto.periodStart ?? dto.period_start ?? new Date(Date.UTC(year, 0, 1)));
    const periodEnd = this.endOfDay(dto.periodEnd ?? dto.period_end ?? new Date(Date.UTC(year, 11, 31)));
    if (periodEnd < periodStart) throw new BadRequestException('period_end doit être après period_start');
    const employee = await this.ensureEmployee(organizationId, employeeId);
    const profile = await this.resolveEmployeeProfile(organizationId, employeeId, this.day(dto.effectiveDate ?? periodStart));
    const [rules, absences, shifts] = await Promise.all([
      this.applicableRules(profile, this.day(dto.effectiveDate ?? periodStart)),
      this.absenceInputs(organizationId, employeeId, periodStart, periodEnd, dto.absenceData),
      this.shiftInputs(organizationId, employeeId, periodStart, periodEnd, dto),
    ]);
    const inputHash = this.hash({ employeeId, periodStart, periodEnd, profile, dto });
    const run = dto.persist === false ? null : await this.prisma.legalCalculationRun.create({
      data: { organizationId, employeeId, periodStart, periodEnd, status: 'RUNNING', inputHash },
    });

    const grouped = this.groupRulesByRight(rules);
    const counters = [];
    const audit = [];
    const warnings = [...profile.warnings];
    for (const [rightCode, rightRules] of grouped) {
      const selection = this.selectRule(rightRules);
      if (selection.incompleteRules.length) {
        warnings.push(`Règle plus spécifique à valider pour ${rightCode}: ${selection.incompleteRules.map((rule) => rule.stableId).join(', ')}`);
      }
      if (!selection.rule) {
        if (selection.status === 'incomplete') {
          counters.push(this.incompleteCounter(rightRules[0]?.right, selection));
          audit.push({ ruleId: null, message: selection.message ?? `Règle ${rightCode} incomplète`, input: {}, output: { status: 'incomplete' } });
        }
        continue;
      }
      const result = this.calculateRule(selection.rule, profile, employee, periodStart, periodEnd, absences, shifts, dto.context);
      counters.push(result.counter);
      audit.push({ ruleId: selection.rule.id, message: result.message, input: result.input, output: result.output, sourceUrl: selection.rule.sourceUrl });
      if (result.warning) warnings.push(result.warning);
    }

    const compliance = this.checkShifts(profile, shifts, rules);
    const result = {
      employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`.trim() },
      period: { startDate: this.iso(periodStart), endDate: this.iso(periodEnd) },
      legalProfile: this.profileSummary(profile),
      calculation_status: counters.some((counter) => counter.calculation_status === 'incomplete') ? 'incomplete' : 'complete',
      counters,
      planningAlerts: compliance.alerts,
      overtime: compliance.overtime,
      compensatoryRest: compliance.compensatoryRest,
      warnings,
      rulesUsed: counters.map((counter) => counter.rule).filter(Boolean),
      audit,
    };

    if (run) {
      await this.persistCalculation(organizationId, employeeId, run.id, periodStart, periodEnd, result, audit);
    }
    return result;
  }

  async planningCompliance(organizationId: string, dto: PlanningComplianceCheckDto): Promise<any> {
    const regulatoryCountry = await this.regulatoryCountryForOrganization(organizationId);
    if (!regulatoryCountry) return this.blockedByMissingRegulatoryCountry();
    const employeeId = dto.employeeId ?? dto.employee_id;
    if (!employeeId) throw new BadRequestException('employee_id est requis');
    await this.ensureEmployee(organizationId, employeeId);
    const periodStartInput = dto.periodStart ?? dto.period_start;
    const periodEndInput = dto.periodEnd ?? dto.period_end;
    if (!periodStartInput || !periodEndInput) throw new BadRequestException('period_start et period_end sont requis');
    const periodStart = this.day(periodStartInput);
    const periodEnd = this.endOfDay(periodEndInput);
    const profile = await this.resolveEmployeeProfile(organizationId, employeeId, periodStart);
    const rules = await this.applicableRules(profile, periodStart);
    const shifts = this.normalizeShifts(employeeId, dto.shifts);
    const check = this.checkShifts(profile, shifts, rules);
    return {
      employeeId,
      period: { startDate: this.iso(periodStart), endDate: this.iso(periodEnd) },
      legalProfile: this.profileSummary(profile),
      blockingAlerts: check.alerts.filter((alert) => alert.severity === 'BLOCKING'),
      nonBlockingAlerts: check.alerts.filter((alert) => alert.severity !== 'BLOCKING'),
      alerts: check.alerts,
      overtime: check.overtime,
      compensatoryRest: check.compensatoryRest,
      rightsConsumed: [],
      rulesUsed: check.rulesUsed,
    };
  }

  private async applicableRules(profile: ResolvedLegalProfile, date: Date) {
    const rules = await this.prisma.legalRightRuleVersion.findMany({
      where: {
        active: true,
        countryCode: profile.countryCode,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
        sector: { in: profile.regimeType === 'public' ? ['public', 'common'] : ['private', 'common'] },
      },
      include: { right: true, regime: true, agreement: true, publicRegime: true },
      orderBy: [{ priority: 'asc' }, { stableId: 'asc' }],
    });
    return rules.filter((rule) => {
      if (rule.agreementId && rule.agreementId !== profile.agreementId) return false;
      if (rule.publicRegimeId && rule.publicRegimeId !== profile.publicRegimeId) return false;
      return true;
    });
  }

  private selectRule(rules: any[]): RuleSelection {
    const sorted = [...rules].sort((a, b) => this.ruleSpecificity(b) - this.ruleSpecificity(a) || a.priority - b.priority);
    const calculable = sorted.find((rule) => rule.validationStatus === 'active' && CALCULABLE_FORMULAS.has(rule.formulaType));
    const incompleteRules = sorted.filter((rule) => rule !== calculable && (rule.validationStatus !== 'active' || !CALCULABLE_FORMULAS.has(rule.formulaType)) && this.ruleSpecificity(rule) >= this.ruleSpecificity(calculable));
    if (calculable) return { rule: calculable, incompleteRules, status: 'calculated' };
    if (sorted.length) return { rule: null, incompleteRules: sorted, status: 'incomplete', message: `Aucune règle calculable active pour ${sorted[0].right.code}` };
    return { rule: null, incompleteRules: [], status: 'not_applicable' };
  }

  private calculateRule(rule: any, profile: ResolvedLegalProfile, employee: any, periodStart: Date, periodEnd: Date, absences: any[], shifts: NormalizedShift[], context: unknown) {
    const formula = this.object(rule.formulaJson);
    const ctx = this.object(context);
    let acquired = 0;
    let used = 0;
    let status: 'complete' | 'incomplete' = 'complete';
    let warning: string | undefined;
    const input: Record<string, any> = { formulaType: rule.formulaType, periodStart: this.iso(periodStart), periodEnd: this.iso(periodEnd) };

    if (rule.formulaType === 'monthly_accrual') {
      acquired = this.monthlyAccrual(Number(formula.monthlyValue ?? rule.value ?? 0), periodStart, periodEnd, employee, profile);
      used = this.absenceDays(absences.filter((absence) => String(absence.type) === HrAbsenceType.CONGE), periodStart, periodEnd);
    } else if (rule.formulaType === 'monthly_accrual_capped') {
      acquired = Math.min(Number(formula.annualCap ?? 999), this.monthlyAccrual(Number(formula.monthlyValue ?? rule.value ?? 0), periodStart, periodEnd, employee, profile));
    } else if (rule.formulaType === 'sick_child_leave') {
      const sickChild = this.object(ctx.sickChild);
      if (sickChild.childAge == null || sickChild.childrenUnder16 == null) {
        status = 'incomplete';
        warning = `${rule.right.code}: âge enfant et nombre d'enfants de moins de 16 ans requis`;
      } else if (Number(sickChild.childAge) >= Number(formula.childMaxAge ?? 16)) {
        acquired = 0;
      } else {
        acquired = Number(sickChild.childAge) < 1 || Number(sickChild.childrenUnder16) >= 3
          ? Number(formula.annualDaysIfChildUnderOneOrThreeChildrenUnderSixteen ?? 5)
          : Number(formula.annualDays ?? rule.value ?? 3);
      }
    } else if (rule.formulaType === 'family_event_days') {
      const familyEvent = this.object(ctx.familyEvent);
      if (!familyEvent.type) {
        status = 'incomplete';
        warning = `${rule.right.code}: type d'événement familial requis`;
      } else if (familyEvent.type === formula.event) {
        acquired = Number(formula.days ?? rule.value ?? 0);
      }
    } else if (rule.formulaType === 'public_annual_leave') {
      const weeklyWorkedDays = Number(ctx.weeklyWorkedDays ?? Math.min(5, Math.max(1, Math.round((profile.weeklyHours ?? 35) / 7))));
      acquired = Number(formula.multiplierWorkedDaysPerWeek ?? 5) * weeklyWorkedDays * profile.fullTimeEquivalent;
    } else if (rule.formulaType === 'annual_working_time') {
      acquired = Number(formula.annualHours ?? rule.value ?? 0);
    } else {
      const compliance = this.checkShifts(profile, shifts, [rule]);
      acquired = compliance.overtime.minutes / 60;
      warning = compliance.alerts.length ? `${rule.right.code}: ${compliance.alerts.length} alerte(s) planning` : undefined;
    }

    const roundedAcquired = this.round(acquired);
    const roundedUsed = this.round(used);
    const counter = {
      right: { id: rule.right.id, code: rule.right.code, name: rule.right.name, category: rule.right.category },
      acquired: status === 'incomplete' ? null : roundedAcquired,
      used: status === 'incomplete' ? null : roundedUsed,
      remaining: status === 'incomplete' ? null : this.round(roundedAcquired - roundedUsed),
      unit: rule.unit,
      calculation_status: status,
      validation_status: rule.validationStatus,
      rule: this.ruleSummary(rule),
      source: { label: rule.sourceLabel, url: rule.sourceUrl },
      formula: { type: rule.formulaType, parameters: formula },
    };
    return {
      counter,
      warning,
      message: status === 'incomplete' ? warning ?? `${rule.right.code} incomplet` : `${rule.right.code} calculé depuis ${rule.stableId}`,
      input,
      output: counter,
    };
  }

  private checkShifts(profile: ResolvedLegalProfile, shifts: NormalizedShift[], rules: any[]) {
    const alerts: any[] = [];
    const rulesUsed: any[] = [];
    const minRestRule = this.bestFormulaRule(rules, 'planning_min_rest');
    const weeklyRestRule = this.bestFormulaRule(rules, 'planning_weekly_rest');
    const breakRule = this.bestFormulaRule(rules, 'planning_break_after_work');
    const overtimeRule = this.bestFormulaRule(rules, 'overtime_threshold');
    if (minRestRule) rulesUsed.push(this.ruleSummary(minRestRule));
    if (weeklyRestRule) rulesUsed.push(this.ruleSummary(weeklyRestRule));
    if (breakRule) rulesUsed.push(this.ruleSummary(breakRule));
    if (overtimeRule) rulesUsed.push(this.ruleSummary(overtimeRule));

    const sorted = [...shifts].sort((a, b) => +a.start - +b.start);
    const minRestHours = Number(this.object(minRestRule?.formulaJson).minimumHours ?? 11);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const restHours = (+current.start - +previous.end) / 36e5;
      if (restHours < minRestHours) {
        alerts.push({ code: 'REST_DAILY_INSUFFICIENT', severity: 'BLOCKING', message: `Repos quotidien insuffisant: ${this.round(restHours)}h < ${minRestHours}h`, date: this.iso(current.start), rule: minRestRule ? this.ruleSummary(minRestRule) : null });
      }
    }

    const breakFormula = this.object(breakRule?.formulaJson);
    const trigger = Number(breakFormula.triggerWorkedMinutes ?? 360);
    const minimumBreak = Number(breakFormula.minimumBreakMinutes ?? 20);
    for (const shift of sorted) {
      if (shift.grossMinutes >= trigger && shift.breakMinutes < minimumBreak) {
        alerts.push({ code: 'BREAK_MISSING', severity: 'STRONG_WARNING', message: `Pause obligatoire manquante: ${shift.breakMinutes} min < ${minimumBreak} min`, date: this.iso(shift.start), rule: breakRule ? this.ruleSummary(breakRule) : null });
      }
    }

    const byWeek = new Map<string, NormalizedShift[]>();
    for (const shift of sorted) byWeek.set(this.weekKey(shift.start), [...(byWeek.get(this.weekKey(shift.start)) ?? []), shift]);
    const overtimeFormula = this.object(overtimeRule?.formulaJson);
    const weeklyThresholdMinutes = Number(overtimeFormula.weeklyThresholdHours ?? 35) * 60;
    let overtimeMinutes = 0;
    for (const [week, weekShifts] of byWeek) {
      const minutes = weekShifts.reduce((sum, shift) => sum + shift.plannedMinutes, 0);
      if (minutes > weeklyThresholdMinutes) {
        const extra = minutes - weeklyThresholdMinutes;
        overtimeMinutes += extra;
        alerts.push({ code: 'OVERTIME_WEEKLY', severity: 'STRONG_WARNING', message: `Heures supplémentaires prévues: ${this.round(extra / 60)}h semaine ${week}`, week, rule: overtimeRule ? this.ruleSummary(overtimeRule) : null });
      }
      const weeklyRestFormula = this.object(weeklyRestRule?.formulaJson);
      const maxWorkedDays = Number(weeklyRestFormula.maxWorkedDaysPerWeek ?? 6);
      const workedDays = new Set(weekShifts.map((shift) => this.iso(shift.start))).size;
      if (workedDays > maxWorkedDays) {
        alerts.push({ code: 'WEEKLY_REST_INSUFFICIENT', severity: 'BLOCKING', message: `Repos hebdomadaire insuffisant: ${workedDays} jours travaillés`, week, rule: weeklyRestRule ? this.ruleSummary(weeklyRestRule) : null });
      }
    }

    return {
      alerts,
      overtime: { minutes: overtimeMinutes, hours: this.round(overtimeMinutes / 60) },
      compensatoryRest: overtimeMinutes > 0 ? [{ code: 'RECUP_HS', minutes: overtimeMinutes, reason: 'overtime_threshold', sourceRuleId: overtimeRule?.id ?? null }] : [],
      rulesUsed,
    };
  }

  private async persistCalculation(organizationId: string, employeeId: string, runId: string, periodStart: Date, periodEnd: Date, result: any, audit: any[]) {
    for (const counter of result.counters.filter((item: any) => item.calculation_status !== 'incomplete' && item.right?.id)) {
      await this.prisma.legalRightCounter.upsert({
        where: { organizationId_employeeId_rightId_periodStart_periodEnd: { organizationId, employeeId, rightId: counter.right.id, periodStart, periodEnd } },
        create: {
          organizationId,
          employeeId,
          rightId: counter.right.id,
          periodStart,
          periodEnd,
          acquired: new Prisma.Decimal(counter.acquired ?? 0),
          used: new Prisma.Decimal(counter.used ?? 0),
          remaining: new Prisma.Decimal(counter.remaining ?? 0),
          unit: counter.unit,
          status: 'ACTIVE',
          calculationRunId: runId,
          metadata: { ruleStableId: counter.rule?.stableId ?? null },
        },
        update: {
          acquired: new Prisma.Decimal(counter.acquired ?? 0),
          used: new Prisma.Decimal(counter.used ?? 0),
          remaining: new Prisma.Decimal(counter.remaining ?? 0),
          unit: counter.unit,
          status: 'ACTIVE',
          calculationRunId: runId,
          metadata: { ruleStableId: counter.rule?.stableId ?? null },
        },
      });
    }
    for (const item of audit) {
      await this.prisma.legalCalculationAuditLog.create({
        data: {
          organizationId,
          calculationRunId: runId,
          ruleVersionId: item.ruleId,
          message: item.message,
          inputJson: item.input ?? {},
          outputJson: item.output ?? {},
          sourceUrl: item.sourceUrl ?? null,
        },
      });
    }
    const resultHash = this.hash(result);
    await this.prisma.legalCalculationRun.update({
      where: { id: runId },
      data: { status: result.calculation_status === 'incomplete' ? 'INCOMPLETE' : 'SUCCESS', resultHash },
    });
  }

  private incompleteCounter(right: any, selection: RuleSelection) {
    return {
      right: right ? { id: right.id, code: right.code, name: right.name, category: right.category } : null,
      acquired: null,
      used: null,
      remaining: null,
      unit: selection.incompleteRules[0]?.unit ?? null,
      calculation_status: 'incomplete',
      validation_status: 'requires_review',
      rule: selection.incompleteRules[0] ? this.ruleSummary(selection.incompleteRules[0]) : null,
      source: selection.incompleteRules[0] ? { label: selection.incompleteRules[0].sourceLabel, url: selection.incompleteRules[0].sourceUrl } : null,
      formula: null,
      message: selection.message,
    };
  }

  private async resolveEmployeeProfile(organizationId: string, employeeId: string, date: Date): Promise<ResolvedLegalProfile> {
    const explicit = await this.prisma.employeeLegalProfile.findFirst({
      where: { organizationId, employeeId, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] },
      include: { agreement: true, publicRegime: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (explicit) {
      const countryCode = await this.requireRegulatoryCountry(organizationId);
      return {
        countryCode,
        regimeType: explicit.regimeType as ResolvedLegalProfile['regimeType'],
        agreementId: explicit.agreementId,
        agreement: explicit.agreement,
        publicRegimeId: explicit.publicRegimeId,
        publicRegime: explicit.publicRegime,
        establishmentId: explicit.establishmentId,
        contractType: explicit.contractType,
        weeklyHours: explicit.weeklyHours == null ? null : Number(explicit.weeklyHours),
        annualHours: explicit.annualHours == null ? null : Number(explicit.annualHours),
        seniorityStartDate: explicit.seniorityStartDate,
        fullTimeEquivalent: explicit.fullTimeEquivalent == null ? 1 : Number(explicit.fullTimeEquivalent),
        isSeasonal: explicit.isSeasonal,
        localAgreementJson: this.object(explicit.localAgreementJson),
        source: 'explicit',
        warnings: [],
      };
    }

    const employee = await this.ensureEmployee(organizationId, employeeId);
    const countryCode = await this.requireRegulatoryCountry(organizationId);
    const establishmentType = String(employee.organization?.establishmentType ?? employee.mainSite?.name ?? '').toLowerCase();
    const contractWeeklyMinutes = Number(employee.contractWeeklyMinutes ?? 0);
    const activeContract = employee.contracts?.find((contract: any) => contract.status === 'ACTIVE');
    const weeklyHours = contractWeeklyMinutes > 0 ? contractWeeklyMinutes / 60 : Number(activeContract?.weeklyHours ?? 35);
    const publicCode = this.publicRegimeHint(establishmentType);
    const idcc = publicCode ? null : this.idccHint(establishmentType);
    const [agreement, publicRegime] = await Promise.all([
      idcc ? this.prisma.collectiveAgreement.findFirst({ where: { idcc, active: true } }) : Promise.resolve(null),
      publicCode ? this.prisma.publicRegime.findFirst({ where: { code: publicCode, active: true } }) : Promise.resolve(null),
    ]);
    const warnings = [];
    if (!agreement && !publicRegime) warnings.push('Profil légal déduit sans convention/régime explicite: à confirmer sur DSN, contrat ou paramétrage établissement.');
    return {
      countryCode,
      regimeType: publicRegime ? 'public' : 'private',
      agreementId: agreement?.id ?? null,
      agreement,
      publicRegimeId: publicRegime?.id ?? null,
      publicRegime,
      establishmentId: employee.mainSiteId ?? null,
      contractType: employee.contractType ?? activeContract?.contractType ?? null,
      weeklyHours,
      annualHours: publicRegime ? 1607 : null,
      seniorityStartDate: employee.hireDate,
      fullTimeEquivalent: Math.max(0, Math.min(1, weeklyHours / 35 || 1)),
      isSeasonal: String(employee.contractType ?? '').toLowerCase().includes('saison'),
      localAgreementJson: {},
      source: 'derived',
      warnings,
    };
  }

  private async ensureEmployee(organizationId: string, employeeId: string) {
    const employee = await this.prisma.hrEmployee.findFirst({
      where: { id: employeeId, organizationId },
      include: { organization: true, mainSite: true, contracts: true, position: true, department: true },
    });
    if (!employee) throw new NotFoundException('Collaborateur introuvable');
    return employee;
  }

  private async absenceInputs(organizationId: string, employeeId: string, periodStart: Date, periodEnd: Date, absenceData: unknown) {
    if (Array.isArray(absenceData)) return absenceData;
    return this.prisma.hrAbsence.findMany({
      where: { organizationId, employeeId, status: HrAbsenceStatus.APPROVED, startDate: { lte: periodEnd }, endDate: { gte: periodStart } },
      take: 1000,
    });
  }

  private async shiftInputs(organizationId: string, employeeId: string, periodStart: Date, periodEnd: Date, dto: CalculateLegalRightsDto) {
    if (dto.shifts?.length) return this.normalizeShifts(employeeId, dto.shifts);
    const planningData = this.object(dto.planningData);
    if (Array.isArray(planningData.shifts)) return this.normalizeShifts(employeeId, planningData.shifts);
    const assignments = await this.prisma.planningAssignment.findMany({
      where: { organizationId, employeeId, date: { gte: periodStart, lte: periodEnd }, status: { not: PlanningAssignmentStatus.CANCELLED } },
      select: { id: true, employeeId: true, date: true, startTime: true, endTime: true, breakMinutes: true, status: true },
      take: 5000,
    });
    return this.normalizeShifts(employeeId, assignments.map((assignment) => ({
      id: assignment.id,
      employeeId: assignment.employeeId,
      date: this.iso(assignment.date),
      startTime: assignment.startTime.toISOString(),
      endTime: assignment.endTime.toISOString(),
      breakMinutes: assignment.breakMinutes,
      status: assignment.status,
    })));
  }

  private normalizeShifts(employeeId: string, shifts: Array<any>): NormalizedShift[] {
    return shifts.map((shift) => {
      const start = this.shiftDateTime(shift.date, shift.startTime);
      let end = this.shiftDateTime(shift.date, shift.endTime);
      if (end <= start) end = new Date(+end + 24 * 60 * 60 * 1000);
      const calc = calculatePlanningAssignmentMinutes({ startTime: start, endTime: end, breakMinutes: shift.breakMinutes, status: shift.status });
      return {
        ...shift,
        employeeId: shift.employeeId ?? employeeId,
        start,
        end,
        grossMinutes: calc.grossMinutes,
        plannedMinutes: calc.plannedMinutes,
        breakMinutes: calc.breakMinutes,
      };
    });
  }

  private monthlyAccrual(monthlyValue: number, periodStart: Date, periodEnd: Date, employee: any, profile: ResolvedLegalProfile) {
    const employmentStart = this.maxDate(periodStart, profile.seniorityStartDate ?? employee.hireDate ?? periodStart);
    const employmentEnd = this.minDate(periodEnd, employee.contractEndDate ?? periodEnd);
    if (employmentEnd < employmentStart) return 0;
    let cursor = new Date(Date.UTC(employmentStart.getUTCFullYear(), employmentStart.getUTCMonth(), 1));
    const lastMonth = new Date(Date.UTC(employmentEnd.getUTCFullYear(), employmentEnd.getUTCMonth(), 1));
    let total = 0;
    while (cursor <= lastMonth) {
      const monthStart = cursor;
      const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      const overlapStart = this.maxDate(monthStart, employmentStart, periodStart);
      const overlapEnd = this.minDate(monthEnd, employmentEnd, periodEnd);
      if (overlapEnd >= overlapStart) {
        total += monthlyValue * ((this.daysInclusive(overlapStart, overlapEnd)) / this.daysInclusive(monthStart, monthEnd)) * profile.fullTimeEquivalent;
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return total;
  }

  private absenceDays(absences: any[], periodStart: Date, periodEnd: Date) {
    return absences.reduce((sum, absence) => {
      const start = this.maxDate(this.day(absence.startDate), periodStart);
      const end = this.minDate(this.day(absence.endDate), periodEnd);
      return end >= start ? sum + this.daysInclusive(start, end) : sum;
    }, 0);
  }

  private groupRulesByRight(rules: any[]) {
    const groups = new Map<string, any[]>();
    for (const rule of rules) groups.set(rule.right.code, [...(groups.get(rule.right.code) ?? []), rule]);
    return groups;
  }

  private ruleSpecificity(rule?: any) {
    if (!rule) return -1;
    return (rule.agreementId || rule.publicRegimeId ? 100 : 0) + (rule.regimeId ? 10 : 0);
  }

  private bestFormulaRule(rules: any[], formulaType: string) {
    return rules
      .filter((rule) => rule.formulaType === formulaType && rule.validationStatus === 'active')
      .sort((a, b) => this.ruleSpecificity(b) - this.ruleSpecificity(a) || a.priority - b.priority)[0] ?? null;
  }

  private ruleSummary(rule: any) {
    return {
      id: rule.id,
      stableId: rule.stableId,
      rightCode: rule.right?.code,
      name: rule.right?.name,
      regime: rule.regime ? { code: rule.regime.code, type: rule.regime.type, name: rule.regime.name } : null,
      agreement: rule.agreement ? { key: rule.agreement.key, idcc: rule.agreement.idcc, name: rule.agreement.name } : null,
      publicRegime: rule.publicRegime ? { code: rule.publicRegime.code, name: rule.publicRegime.name } : null,
      unit: rule.unit,
      value: rule.value == null ? null : Number(rule.value),
      formulaType: rule.formulaType,
      priority: rule.priority,
      validationStatus: rule.validationStatus,
      confidenceLevel: rule.confidenceLevel == null ? null : Number(rule.confidenceLevel),
      sourceLabel: rule.sourceLabel,
      sourceUrl: rule.sourceUrl,
    };
  }

  private ruleDetail(rule: any) {
    return {
      ...this.ruleSummary(rule),
      formulaJson: rule.formulaJson,
      conditionsJson: rule.conditionsJson,
      effectiveFrom: this.iso(rule.effectiveFrom),
      effectiveTo: rule.effectiveTo ? this.iso(rule.effectiveTo) : null,
      lastVerifiedAt: rule.lastVerifiedAt ? this.iso(rule.lastVerifiedAt) : null,
      active: rule.active,
    };
  }

  private profileSummary(profile: ResolvedLegalProfile) {
    return {
      regimeType: profile.regimeType,
      agreement: profile.agreement ? { id: profile.agreement.id, key: profile.agreement.key, idcc: profile.agreement.idcc, name: profile.agreement.name } : null,
      publicRegime: profile.publicRegime ? { id: profile.publicRegime.id, code: profile.publicRegime.code, name: profile.publicRegime.name } : null,
      contractType: profile.contractType,
      weeklyHours: profile.weeklyHours,
      annualHours: profile.annualHours,
      seniorityStartDate: profile.seniorityStartDate ? this.iso(profile.seniorityStartDate) : null,
      fullTimeEquivalent: profile.fullTimeEquivalent,
      isSeasonal: profile.isSeasonal,
      source: profile.source,
    };
  }

  private searchTerms(query?: string) {
    return this.normalizeText(query ?? '').split(' ').filter((term) => term.length > 1);
  }

  private searchScore(right: any, terms: string[], q: LegalRightsSearchQueryDto) {
    const normalizedQuery = this.normalizeText(q.query ?? '');
    const primary = this.normalizeText([right.code, right.name, right.category, right.tags?.join(' ')].join(' '));
    const haystack = this.normalizeText([
      right.code,
      right.name,
      right.category,
      right.description,
      right.tags?.join(' '),
      right.ruleVersions.map((rule: any) => `${rule.stableId} ${rule.sourceLabel} ${rule.conditionsJson ? JSON.stringify(rule.conditionsJson) : ''} ${rule.agreement?.name ?? ''} ${rule.agreement?.idcc ?? ''} ${rule.publicRegime?.name ?? ''}`).join(' '),
    ].join(' '));
    let score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 2 : 0), 0);
    if (normalizedQuery && primary.includes(normalizedQuery)) score += 12;
    else if (normalizedQuery && haystack.includes(normalizedQuery)) score += 6;
    if (q.idcc && haystack.includes(q.idcc)) score += 5;
    if (q.publicRegime && haystack.includes(this.normalizeText(q.publicRegime))) score += 5;
    if (q.regime && q.regime !== 'all' && right.ruleVersions.some((rule: any) => rule.sector === q.regime)) score += 3;
    return score;
  }

  private searchSectorFilter(regime?: LegalRightsSearchQueryDto['regime']) {
    if (regime === 'private') return ['private', 'common'];
    if (regime === 'public') return ['public', 'common'];
    if (regime === 'common') return ['common'];
    return ['private', 'public', 'common'];
  }

  private searchValidationFilter(q: LegalRightsSearchQueryDto) {
    if (q.status === 'all') return null;
    if (q.status === 'active') return 'active';
    if (q.status === 'requires_review') return 'requires_review';
    if (q.includeRequiresReview === false) return 'active';
    return { in: ['active', 'requires_review'] };
  }

  private async activatedLegalRights(organizationId?: string) {
    const activated = new Map<string, string>();
    if (!organizationId) return activated;
    const establishmentConfigurations = await this.prisma.hrEntitlementRule.findMany({
      where: { organizationId, enabled: true },
      select: { id: true, metadata: true, sourceRightId: true },
      take: 1000,
    });
    for (const configuration of establishmentConfigurations) {
      const metadata = this.object(configuration.metadata);
      const sourceRightId = configuration.sourceRightId ?? metadata.sourceLegalRightId;
      if (sourceRightId) activated.set(String(sourceRightId), configuration.id);
    }
    return activated;
  }

  private async regulatoryCountryForOrganization(organizationId?: string): Promise<'FR' | 'FI' | null> {
    if (!organizationId) return null;
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { regulatoryCountryCode: true },
    });
    return this.countryCode(organization?.regulatoryCountryCode);
  }

  private async requireRegulatoryCountry(organizationId: string): Promise<'FR' | 'FI'> {
    const countryCode = await this.regulatoryCountryForOrganization(organizationId);
    if (!countryCode) throw new BadRequestException('Le pays de réglementation de l’organisation doit être configuré avant d’utiliser les droits RH.');
    return countryCode;
  }

  private blockedByMissingRegulatoryCountry(): any {
    return {
      calculation_status: 'blocked',
      reason: 'missing_regulatory_country',
      message: 'Le pays de réglementation de l’organisation doit être configuré avant de calculer les droits.',
      counters: [],
      planningAlerts: [],
      warnings: ['Pays de réglementation manquant'],
      rulesUsed: [],
      audit: [],
    };
  }

  private countryCode(value?: string | null): 'FR' | 'FI' | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    return normalized === 'FR' || normalized === 'FI' ? normalized : null;
  }

  private assertWrite(actor: { role: string }) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('RH write access is restricted to managers and administrators');
  }

  private organizationLegalRuleCode(countryCode: string, code: string) {
    return `legal_${countryCode.toLowerCase()}_${this.normalizeCode(code)}`.slice(0, 80);
  }

  private accountTypeFor(category: string, code: string) {
    const normalized = this.normalizeText(`${category} ${code}`);
    if (normalized.includes('recup') || normalized.includes('repos') || normalized.includes('rtt') || normalized.includes('cet')) return 'recovery';
    if (normalized.includes('heure') || normalized.includes('travail') || normalized.includes('pause')) return 'working_time';
    if (normalized.includes('absence') || normalized.includes('maladie') || normalized.includes('enfant')) return 'absence';
    return 'leave';
  }

  private planningUnit(unit?: string | null): PlanningTimeUnit {
    return this.normalizeText(unit ?? '').includes('heure') ? PlanningTimeUnit.MINUTES : PlanningTimeUnit.DAYS;
  }

  private accrualFrequency(formulaType?: string | null): HrEntitlementAccrualFrequency {
    if (formulaType === 'monthly_accrual' || formulaType === 'monthly_accrual_capped') return HrEntitlementAccrualFrequency.MONTHLY;
    if (formulaType === 'family_event_days' || formulaType === 'sick_child_leave') return HrEntitlementAccrualFrequency.EVENT_BASED;
    if (formulaType === 'annual_working_time' || formulaType === 'public_annual_leave') return HrEntitlementAccrualFrequency.YEARLY;
    return HrEntitlementAccrualFrequency.MANUAL;
  }

  private hasTag(tags: string[] | null | undefined, value: string) {
    const normalized = this.normalizeText(value);
    return (tags ?? []).some((tag) => this.normalizeText(tag).includes(normalized));
  }

  private normalizeCode(value: string) {
    return this.normalizeText(value).replace(/\s+/g, '_');
  }

  private isMissingLegalTablesError(error: unknown) {
    const maybe = error as { code?: string; message?: string };
    return maybe.code === 'P2021' || maybe.code === 'P1014' || String(maybe.message ?? '').includes('legal_regimes');
  }

  private idccHint(value: string) {
    if (value.includes('rapide') || value.includes('fast')) return '1501';
    if (value.includes('camping') || value.includes('plein air')) return '1631';
    if (value.includes('collective') || value.includes('cantine')) return '1266';
    if (value.includes('clinique') || value.includes('ehpad privé') || value.includes('hospitalisation privée')) return '2264';
    if (value.includes('cafeteria') || value.includes('cafétéria')) return '2060';
    if (value.includes('casino')) return '2257';
    if (value.includes('hotel') || value.includes('hôtel') || value.includes('restaurant') || value.includes('cafe') || value.includes('café')) return '1979';
    return null;
  }

  private publicRegimeHint(value: string) {
    if (value.includes('hospitalier') || value.includes('hôpital public') || value.includes('hopital public') || value.includes('ehpad public')) return 'FPH';
    if (value.includes('municipal') || value.includes('collectivité') || value.includes('collectivite') || value.includes('territorial') || value.includes('cantine publique')) return 'FPT';
    if (value.includes('état') || value.includes('etat')) return 'FPE';
    return null;
  }

  private shiftDateTime(date: string | Date, time: string | Date) {
    if (time instanceof Date) return time;
    if (typeof time === 'string' && time.includes('T')) return new Date(time);
    const datePart = date instanceof Date ? this.iso(date) : String(date).slice(0, 10);
    const timePart = String(time).length === 5 ? `${time}:00` : String(time);
    return new Date(`${datePart}T${timePart}`);
  }

  private weekKey(date: Date) {
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const weekDay = day.getUTCDay() || 7;
    day.setUTCDate(day.getUTCDate() + 4 - weekDay);
    const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((+day - +yearStart) / 86400000) + 1) / 7);
    return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  private normalizeText(value: string) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private object(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private day(value: string | Date) {
    if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    return new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  }

  private endOfDay(value: string | Date) {
    const day = this.day(value);
    return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 23, 59, 59, 999));
  }

  private iso(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private daysInclusive(start: Date, end: Date) {
    return Math.floor((+this.day(end) - +this.day(start)) / 86400000) + 1;
  }

  private minDate(...dates: Date[]) {
    return new Date(Math.min(...dates.map((date) => +date)));
  }

  private maxDate(...dates: Date[]) {
    return new Date(Math.max(...dates.map((date) => +date)));
  }

  private round(value: number) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item)).digest('hex');
  }
}

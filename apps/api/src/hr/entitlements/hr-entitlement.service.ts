import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HrTimeAccountDirection, HrTimeAccountSourceType, HrEntitlementAccrualFrequency, PlanningTimeUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HrTimeAccountQueryDto } from '../time-accounts/hr-time-account.dto';
import { ActivateHrEntitlementCatalogDto, ActivateHrEntitlementCatalogSelectionDto, AdjustHrEmployeeEntitlementByIdDto, AdjustHrEmployeeEntitlementDto, HrEntitlementCatalogQueryDto, PrepareHrEntitlementCatalogDto, UpsertHrEmployeeEntitlementDto, UpsertHrEntitlementRuleDto } from './hr-entitlement.dto';
import { HrCountryCode, isTemplateRecommendedFor, templatesForCountry } from './hr-entitlement-catalog';

type Actor = { id: string; role: string };

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable'];

@Injectable()
export class HrEntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  // Vocabulary boundary:
  // - HrEntitlementRule = establishment-level configuration, optionally linked to a LegalRight.
  // - HrEntitlementCatalogItem = manual/internal template, never the legal source of truth.
  // - HrEmployeeEntitlement = employee assignment.
  // - HrTimeAccount = balance ledger.
  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('RH write access is restricted to managers and administrators');
  }

  async listEstablishmentConfigurations(organizationId: string) {
    return this.prisma.hrEntitlementRule.findMany({
      where: { organizationId },
      orderBy: [{ enabled: 'desc' }, { label: 'asc' }],
    });
  }

  async setup(organizationId: string) {
    const organization = await this.organization(organizationId);
    const regulatoryCountryCode = this.countryCode(organization.regulatoryCountryCode);
    const catalogCount = regulatoryCountryCode
      ? await this.prisma.hrEntitlementCatalogItem.count({ where: { organizationId, countryCode: regulatoryCountryCode } })
      : 0;
    return {
      hrCountryCode: regulatoryCountryCode,
      regulatoryCountryCode,
      organizationType: organization.establishmentType,
      catalogPrepared: catalogCount > 0,
      catalogCount,
    };
  }

  async prepareCatalog(organizationId: string, actor: Actor, dto: PrepareHrEntitlementCatalogDto) {
    this.assertWrite(actor);
    const organization = await this.organization(organizationId);
    const countryCode = this.requireCountryCode(dto.countryCode);
    const organizationType = dto.organizationType ?? organization.establishmentType ?? null;
    const employmentFramework = dto.employmentFramework ?? null;
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        hrCountryCode: countryCode,
        regulatoryCountryCode: countryCode,
        regulatoryCountrySelectedAt: new Date(),
        regulatoryCountrySelectedById: actor.id,
        ...(dto.organizationType ? { establishmentType: dto.organizationType } : {}),
      },
    });

    // These are manual/internal templates. Legal source data is imported via legal_rights.
    for (const template of templatesForCountry(countryCode)) {
      const recommended = isTemplateRecommendedFor(template, organizationType, employmentFramework);
      await this.prisma.hrEntitlementCatalogItem.upsert({
        where: {
          organizationId_countryCode_code: {
            organizationId,
            countryCode,
            code: template.code,
          },
        },
        create: {
          organizationId,
          countryCode,
          employmentFramework: template.employmentFramework,
          organizationType,
          code: template.code,
          label: template.label,
          shortDescription: template.shortDescription,
          longDescription: template.longDescription,
          description: template.shortDescription,
          category: template.category,
          examples: template.examples,
          accountType: template.accountType,
          unit: template.unit,
          defaultAccrualFrequency: template.defaultAccrualFrequency,
          defaultAccrualQuantity: template.defaultAccrualQuantity == null ? null : new Prisma.Decimal(template.defaultAccrualQuantity),
          defaultStartCondition: template.defaultStartCondition ?? null,
          startsAfterTrialPeriod: template.startsAfterTrialPeriod ?? false,
          minimumSeniorityMonths: template.minimumSeniorityMonths ?? null,
          prorateByContractTime: template.prorateByContractTime ?? false,
          maxBalance: template.maxBalance ?? null,
          carryOverEnabled: template.carryOverEnabled ?? false,
          requiresAdminValidation: template.requiresAdminValidation ?? true,
          isSystemTemplate: true,
          enabledByDefault: template.enabledByDefault ?? false,
          isRecommended: recommended,
          isCommon: template.isCommon ?? false,
          isAdvanced: template.isAdvanced ?? false,
          displayOrder: template.displayOrder,
          sourceTemplateCode: `${countryCode}:${template.code}`,
          sourceLabel: template.sourceLabel ?? null,
          sourceUrl: template.sourceUrl ?? null,
          sourceReference: template.sourceReference ?? null,
          metadata: { recommendedFor: template.recommendedFor ?? [] },
        },
        update: {
          employmentFramework: template.employmentFramework,
          organizationType,
          label: template.label,
          shortDescription: template.shortDescription,
          longDescription: template.longDescription,
          description: template.shortDescription,
          category: template.category,
          examples: template.examples,
          accountType: template.accountType,
          unit: template.unit,
          defaultAccrualFrequency: template.defaultAccrualFrequency,
          defaultAccrualQuantity: template.defaultAccrualQuantity == null ? null : new Prisma.Decimal(template.defaultAccrualQuantity),
          defaultStartCondition: template.defaultStartCondition ?? null,
          startsAfterTrialPeriod: template.startsAfterTrialPeriod ?? false,
          minimumSeniorityMonths: template.minimumSeniorityMonths ?? null,
          prorateByContractTime: template.prorateByContractTime ?? false,
          maxBalance: template.maxBalance ?? null,
          carryOverEnabled: template.carryOverEnabled ?? false,
          requiresAdminValidation: template.requiresAdminValidation ?? true,
          enabledByDefault: template.enabledByDefault ?? false,
          isRecommended: recommended,
          isCommon: template.isCommon ?? false,
          isAdvanced: template.isAdvanced ?? false,
          displayOrder: template.displayOrder,
          sourceLabel: template.sourceLabel ?? null,
          sourceUrl: template.sourceUrl ?? null,
          sourceReference: template.sourceReference ?? null,
          metadata: { recommendedFor: template.recommendedFor ?? [] },
        },
      });
    }

    return this.listCatalog(organizationId, { countryCode, organizationType: organizationType ?? undefined, employmentFramework: employmentFramework ?? undefined });
  }

  async listCatalog(organizationId: string, q: HrEntitlementCatalogQueryDto = {}) {
    const organization = await this.organization(organizationId);
    const countryCode = this.countryCode(organization.regulatoryCountryCode ?? q.countryCode ?? organization.hrCountryCode);
    if (!countryCode) {
      return {
        setup: {
          hrCountryCode: null,
          regulatoryCountryCode: null,
          organizationType: organization.establishmentType,
          catalogPrepared: false,
        },
        items: [],
        categories: [],
        counts: { total: 0, active: 0, recommended: 0 },
      };
    }
    const [manualTemplates, establishmentConfigurations] = await Promise.all([
      this.prisma.hrEntitlementCatalogItem.findMany({
        where: {
          organizationId,
          countryCode,
          ...(q.employmentFramework ? { employmentFramework: { in: [q.employmentFramework, 'MIXED', 'LOCAL'] } } : {}),
          ...(q.category ? { category: q.category } : {}),
          ...(q.advanced === false ? { isAdvanced: false } : {}),
        },
        orderBy: [{ isRecommended: 'desc' }, { displayOrder: 'asc' }, { label: 'asc' }],
      }),
      this.prisma.hrEntitlementRule.findMany({
        where: { organizationId },
        include: { sourceRight: true, sourceRuleVersion: true },
      }),
    ]);
    const search = q.search?.trim().toLowerCase();
    const enabledConfigurationCodes = new Set(establishmentConfigurations.filter(configuration => configuration.enabled).map(configuration => configuration.code));
    const legalBackedConfigurations = establishmentConfigurations
      .filter((configuration) => Boolean(configuration.sourceRightId || this.object(configuration.metadata).sourceLegalRightId))
      .map((configuration) => this.legalConfigurationSummary(configuration, countryCode));
    const catalogEntries = [...manualTemplates.map(template => this.manualTemplateSummary(template, enabledConfigurationCodes.has(template.code))), ...legalBackedConfigurations];
    const filtered = search
      ? catalogEntries.filter(item => `${item.label} ${item.code} ${item.category} ${item.shortDescription ?? ''} ${item.longDescription ?? ''} ${JSON.stringify(item.examples ?? [])}`.toLowerCase().includes(search))
      : catalogEntries;
    const categories = Array.from(new Set(catalogEntries.map(item => item.category))).sort((a, b) => a.localeCompare(b));
    return {
      setup: {
        hrCountryCode: countryCode,
        regulatoryCountryCode: countryCode,
        organizationType: organization.establishmentType,
        catalogPrepared: catalogEntries.length > 0,
      },
      items: filtered,
      categories,
      counts: {
        total: filtered.length,
        active: filtered.filter(item => item.active).length,
        recommended: filtered.filter(item => item.isRecommended).length,
      },
      notice: countryCode === 'FR'
        ? 'Modèles proposés pour France, à valider selon votre convention, votre statut et vos accords internes.'
        : 'Modèles proposés pour Finlande, à valider selon votre organisation et vos règles internes.',
    };
  }

  async activateCatalogItem(organizationId: string, actor: Actor, id: string, dto: ActivateHrEntitlementCatalogDto) {
    this.assertWrite(actor);
    const manualTemplate = await this.prisma.hrEntitlementCatalogItem.findFirst({ where: { id, organizationId } });
    if (!manualTemplate) throw new NotFoundException('Template manuel introuvable');
    const result = await this.activateManualTemplate(organizationId, actor, manualTemplate, dto);
    return {
      item: this.manualTemplateSummary(manualTemplate, true),
      establishmentConfiguration: result.establishmentConfiguration,
      rule: result.establishmentConfiguration,
      targetMode: dto.targetMode ?? 'NONE',
      employeesApplied: result.employees.length,
      employees: result.employees.map(employee => ({ id: employee.id, name: this.employeeName(employee) })),
    };
  }

  async activateCatalogItems(organizationId: string, actor: Actor, dto: ActivateHrEntitlementCatalogSelectionDto) {
    this.assertWrite(actor);
    if (!dto.catalogItemIds.length) throw new BadRequestException('Sélectionnez au moins un droit');
    const manualTemplates = await this.prisma.hrEntitlementCatalogItem.findMany({
      where: { organizationId, id: { in: dto.catalogItemIds } },
      orderBy: [{ isRecommended: 'desc' }, { displayOrder: 'asc' }, { label: 'asc' }],
    });
    if (manualTemplates.length !== dto.catalogItemIds.length) throw new NotFoundException('Un ou plusieurs templates manuels sont introuvables');
    const activated = [];
    const employeeIds = new Set<string>();
    for (const manualTemplate of manualTemplates) {
      const result = await this.activateManualTemplate(organizationId, actor, manualTemplate, dto);
      result.employees.forEach(employee => employeeIds.add(employee.id));
      activated.push({
        item: this.manualTemplateSummary(manualTemplate, true),
        establishmentConfiguration: result.establishmentConfiguration,
        rule: result.establishmentConfiguration,
        employeesApplied: result.employees.length,
      });
    }
    return {
      targetMode: dto.targetMode ?? 'NONE',
      rightsActivated: activated.length,
      employeesTouched: employeeIds.size,
      employeeEntitlementsCreatedOrUpdated: activated.reduce((sum, item) => sum + item.employeesApplied, 0),
      items: activated,
    };
  }

  private async activateManualTemplate(organizationId: string, actor: Actor, manualTemplate: any, dto: ActivateHrEntitlementCatalogDto) {
    const establishmentConfiguration = await this.prisma.hrEntitlementRule.upsert({
      where: { organizationId_code: { organizationId, code: manualTemplate.code } },
      create: {
        organizationId,
        code: manualTemplate.code,
        label: manualTemplate.label,
        description: manualTemplate.longDescription ?? manualTemplate.description,
        accountType: manualTemplate.accountType,
        unit: manualTemplate.unit,
        accrualFrequency: manualTemplate.defaultAccrualFrequency,
        accrualQuantity: manualTemplate.defaultAccrualQuantity,
        startsAfterTrialPeriod: manualTemplate.startsAfterTrialPeriod,
        minimumSeniorityMonths: manualTemplate.minimumSeniorityMonths,
        prorateByContractTime: manualTemplate.prorateByContractTime,
        maxBalance: manualTemplate.maxBalance,
        carryOverEnabled: manualTemplate.carryOverEnabled,
        enabled: true,
        metadata: { sourceCatalogItemId: manualTemplate.id, countryCode: manualTemplate.countryCode, sourceKind: 'manual_template' },
        createdById: actor.id,
      },
      update: {
        label: manualTemplate.label,
        description: manualTemplate.longDescription ?? manualTemplate.description,
        accountType: manualTemplate.accountType,
        unit: manualTemplate.unit,
        accrualFrequency: manualTemplate.defaultAccrualFrequency,
        accrualQuantity: manualTemplate.defaultAccrualQuantity,
        startsAfterTrialPeriod: manualTemplate.startsAfterTrialPeriod,
        minimumSeniorityMonths: manualTemplate.minimumSeniorityMonths,
        prorateByContractTime: manualTemplate.prorateByContractTime,
        maxBalance: manualTemplate.maxBalance,
        carryOverEnabled: manualTemplate.carryOverEnabled,
        enabled: true,
        metadata: { sourceCatalogItemId: manualTemplate.id, countryCode: manualTemplate.countryCode, sourceKind: 'manual_template' },
      },
    });
    const employees = await this.targetEmployees(organizationId, dto);
    for (const employee of employees) {
      await this.upsertEmployeeEntitlement(organizationId, actor, employee.id, {
        entitlementRuleId: establishmentConfiguration.id,
        openingBalance: dto.openingBalance ?? 0,
        openingBalanceDate: dto.openingBalanceDate,
        effectiveFrom: dto.effectiveFrom ?? this.iso(new Date(new Date().getFullYear(), 0, 1)),
        metadata: { sourceCatalogItemId: manualTemplate.id, targetMode: dto.targetMode ?? 'NONE', sourceKind: 'manual_template' },
      });
    }
    return { establishmentConfiguration, employees };
  }

  async createEstablishmentConfiguration(organizationId: string, actor: Actor, dto: UpsertHrEntitlementRuleDto) {
    this.assertWrite(actor);
    return this.prisma.hrEntitlementRule.create({ data: this.establishmentConfigurationPayload(organizationId, actor.id, dto) });
  }

  async updateEstablishmentConfiguration(organizationId: string, actor: Actor, id: string, dto: UpsertHrEntitlementRuleDto) {
    this.assertWrite(actor);
    const existing = await this.prisma.hrEntitlementRule.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Configuration établissement introuvable');
    return this.prisma.hrEntitlementRule.update({
      where: { id, organizationId },
      data: this.establishmentConfigurationPayload(organizationId, existing.createdById ?? actor.id, dto),
    });
  }

  async employee(organizationId: string, employeeId: string, q: HrTimeAccountQueryDto = {}) {
    const employee = await this.ensureEmployee(organizationId, employeeId);
    const periodYear = q.periodYear ?? q.year ?? new Date().getFullYear();
    const [employeeEntitlements, timeAccounts, establishmentConfigurations, catalog] = await Promise.all([
      this.prisma.hrEmployeeEntitlement.findMany({
        where: { organizationId, employeeId },
        include: { entitlementRule: true, policyProfile: true, counterAccount: true },
        orderBy: [{ enabled: 'desc' }, { label: 'asc' }],
      }),
      this.prisma.hrTimeAccount.findMany({ where: { organizationId, employeeId, periodYear }, orderBy: { code: 'asc' } }),
      this.prisma.hrEntitlementRule.findMany({ where: { organizationId, enabled: true }, orderBy: { label: 'asc' } }),
      this.listCatalog(organizationId),
    ]);
    const entitlementCodes = new Set(employeeEntitlements.filter(item => item.enabled).map(item => item.code));
    return {
      employeeId,
      employeeName: this.employeeName(employee),
      periodYear,
      setup: catalog.setup,
      establishmentConfigurations,
      rules: establishmentConfigurations,
      entitlements: employeeEntitlements.map(item => this.entitlementSummary(item, timeAccounts.find(account => account.id === item.counterAccountId) ?? timeAccounts.find(account => account.code === item.code))),
      accounts: timeAccounts.filter(account => entitlementCodes.has(account.code) || account.closingBalance !== 0 || account.openingBalance !== 0).map(account => this.accountSummary(account)),
      catalog: catalog.items,
      alerts: this.entitlementAlerts(employeeEntitlements, timeAccounts),
    };
  }

  async upsertEmployeeEntitlement(organizationId: string, actor: Actor, employeeId: string, dto: UpsertHrEmployeeEntitlementDto) {
    this.assertWrite(actor);
    await this.ensureEmployee(organizationId, employeeId);
    const establishmentConfiguration = dto.entitlementRuleId ? await this.establishmentConfiguration(organizationId, dto.entitlementRuleId) : null;
    const code = this.normalizeCode(dto.code ?? establishmentConfiguration?.code);
    const label = dto.label ?? establishmentConfiguration?.label;
    const accountType = this.normalizeCode(dto.accountType ?? establishmentConfiguration?.accountType);
    const unit = dto.unit ?? establishmentConfiguration?.unit;
    if (!code || !label || !accountType || !unit) throw new BadRequestException('Code, libellé, type de compteur et unité sont requis pour créer un droit');
    const effectiveFrom = dto.effectiveFrom ? this.day(this.parseDate(dto.effectiveFrom)) : null;
    const effectiveTo = dto.effectiveTo ? this.day(this.parseDate(dto.effectiveTo)) : null;
    const openingBalanceDate = dto.openingBalanceDate ? this.day(this.parseDate(dto.openingBalanceDate)) : effectiveFrom;
    const dedupeKey = `employee:${employeeId}:${code}:${effectiveFrom ? this.iso(effectiveFrom) : 'open'}`;
    const existing = await this.prisma.hrEmployeeEntitlement.findFirst({ where: { organizationId, dedupeKey } });
    const periodYear = (openingBalanceDate ?? effectiveFrom ?? new Date()).getFullYear();
    const account = await this.ensureAccount(organizationId, employeeId, periodYear, {
      code,
      accountType,
      label,
      unit,
      openingBalance: dto.openingBalance ?? existing?.openingBalance ?? 0,
    });
    const data: Prisma.HrEmployeeEntitlementUncheckedCreateInput = {
      organizationId,
      employeeId,
      code,
      label,
      accountType,
      unit,
      dedupeKey,
      entitlementRuleId: establishmentConfiguration?.id ?? null,
      policyProfileId: dto.policyProfileId ?? existing?.policyProfileId ?? null,
      counterAccountId: account.id,
      openingBalance: dto.openingBalance ?? existing?.openingBalance ?? 0,
      openingBalanceDate,
      effectiveFrom,
      effectiveTo,
      enabled: dto.enabled ?? existing?.enabled ?? true,
      metadata: (dto.metadata ?? existing?.metadata ?? {}) as Prisma.InputJsonValue,
      createdById: existing?.createdById ?? actor.id,
    };
    const entitlement = existing
      ? await this.prisma.hrEmployeeEntitlement.update({ where: { id: existing.id, organizationId }, data })
      : await this.prisma.hrEmployeeEntitlement.create({ data });
    await this.traceOpeningBalance(organizationId, actor, entitlement, account.id, periodYear);
    await this.rebuildBalances(organizationId, periodYear, employeeId);
    return entitlement;
  }

  async updateEmployeeEntitlement(organizationId: string, actor: Actor, id: string, dto: UpsertHrEmployeeEntitlementDto) {
    this.assertWrite(actor);
    const existing = await this.prisma.hrEmployeeEntitlement.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Droit collaborateur introuvable');
    return this.upsertEmployeeEntitlement(organizationId, actor, existing.employeeId, {
      ...dto,
      code: dto.code ?? existing.code,
      label: dto.label ?? existing.label,
      accountType: dto.accountType ?? existing.accountType,
      unit: dto.unit ?? existing.unit,
      entitlementRuleId: dto.entitlementRuleId ?? existing.entitlementRuleId ?? undefined,
      effectiveFrom: dto.effectiveFrom ?? (existing.effectiveFrom ? this.iso(existing.effectiveFrom) : undefined),
      openingBalance: dto.openingBalance ?? existing.openingBalance,
    });
  }

  async adjust(organizationId: string, actor: Actor, employeeId: string, dto: AdjustHrEmployeeEntitlementDto) {
    this.assertWrite(actor);
    const employee = await this.ensureEmployee(organizationId, employeeId);
    const periodYear = dto.date ? this.parseDate(dto.date).getFullYear() : new Date().getFullYear();
    const entitlement = await this.prisma.hrEmployeeEntitlement.findFirst({ where: { organizationId, employeeId, code: this.normalizeCode(dto.code), enabled: true }, orderBy: { createdAt: 'desc' } });
    if (!entitlement) throw new NotFoundException('Droit collaborateur introuvable');
    const account = await this.ensureAccount(organizationId, employeeId, periodYear, {
      code: entitlement.code,
      accountType: entitlement.accountType,
      label: entitlement.label,
      unit: entitlement.unit,
      openingBalance: entitlement.openingBalance,
    });
    const transaction = await this.prisma.hrTimeAccountTransaction.create({
      data: {
        organizationId,
        accountId: account.id,
        employeeId,
        date: dto.date ? this.day(this.parseDate(dto.date)) : new Date(),
        quantity: dto.quantity,
        unit: entitlement.unit,
        direction: dto.direction,
        sourceType: HrTimeAccountSourceType.MANUAL_ADJUSTMENT,
        idempotencyKey: `manual-entitlement:${actor.id}:${Date.now()}`,
        label: entitlement.label,
        comment: dto.comment ?? null,
        metadata: { employeeName: this.employeeName(employee), entitlementId: entitlement.id },
        createdById: actor.id,
      },
    });
    await this.rebuildBalances(organizationId, periodYear, employeeId);
    return transaction;
  }

  async adjustById(organizationId: string, actor: Actor, employeeId: string, id: string, dto: AdjustHrEmployeeEntitlementByIdDto) {
    const entitlement = await this.prisma.hrEmployeeEntitlement.findFirst({
      where: { id, organizationId, employeeId, enabled: true },
      select: { code: true },
    });
    if (!entitlement) throw new NotFoundException('Droit collaborateur introuvable');
    return this.adjust(organizationId, actor, employeeId, { ...dto, code: entitlement.code });
  }

  private establishmentConfigurationPayload(organizationId: string, actorId: string, dto: UpsertHrEntitlementRuleDto): Prisma.HrEntitlementRuleUncheckedCreateInput {
    return {
      organizationId,
      code: this.normalizeCode(dto.code),
      label: dto.label.trim(),
      description: dto.description ?? null,
      accountType: this.normalizeCode(dto.accountType),
      unit: dto.unit,
      accrualFrequency: dto.accrualFrequency ?? HrEntitlementAccrualFrequency.MANUAL,
      accrualQuantity: dto.accrualQuantity == null ? null : new Prisma.Decimal(dto.accrualQuantity),
      startsAfterTrialPeriod: dto.startsAfterTrialPeriod ?? false,
      minimumSeniorityMonths: dto.minimumSeniorityMonths ?? null,
      prorateByContractTime: dto.prorateByContractTime ?? false,
      maxBalance: dto.maxBalance ?? null,
      carryOverEnabled: dto.carryOverEnabled ?? false,
      enabled: dto.enabled ?? true,
      metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      createdById: actorId,
    };
  }

  private async ensureAccount(organizationId: string, employeeId: string, periodYear: number, input: { code: string; accountType: string; label: string; unit: PlanningTimeUnit; openingBalance?: number }) {
    return this.prisma.hrTimeAccount.upsert({
      where: { organizationId_employeeId_periodYear_code: { organizationId, employeeId, periodYear, code: input.code } },
      create: {
        organizationId,
        employeeId,
        periodYear,
        code: input.code,
        accountType: input.accountType,
        label: input.label,
        unit: input.unit,
        openingBalance: input.openingBalance ?? 0,
        visibleToEmployee: true,
        visibleToManager: true,
        visibleToAdmin: true,
      },
      update: {
        accountType: input.accountType,
        label: input.label,
        unit: input.unit,
        openingBalance: input.openingBalance ?? 0,
        visibleToEmployee: true,
        visibleToManager: true,
        visibleToAdmin: true,
      },
    });
  }

  private async targetEmployees(organizationId: string, dto: ActivateHrEntitlementCatalogDto) {
    const mode = dto.targetMode ?? 'NONE';
    if (mode === 'NONE') return [];
    if (mode === 'DEPARTMENT' && !dto.departmentId) throw new BadRequestException('Service requis pour appliquer un droit par service');
    if (mode === 'POSITION' && !dto.positionId) throw new BadRequestException('Poste requis pour appliquer un droit par poste');
    if (mode === 'MANUAL' && !dto.employeeIds?.length) throw new BadRequestException('Sélection de collaborateurs requise');
    return this.prisma.hrEmployee.findMany({
      where: {
        organizationId,
        isArchived: false,
        status: 'ACTIVE',
        ...(mode === 'DEPARTMENT' ? { departmentId: dto.departmentId } : {}),
        ...(mode === 'POSITION' ? { positionId: dto.positionId } : {}),
        ...(mode === 'MANUAL' ? { id: { in: dto.employeeIds } } : {}),
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private async traceOpeningBalance(organizationId: string, actor: Actor, entitlement: any, accountId: string, periodYear: number) {
    const idempotencyKey = `entitlement-opening:${entitlement.id}:${periodYear}`;
    await this.prisma.hrTimeAccountTransaction.upsert({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
      create: {
        organizationId,
        accountId,
        employeeId: entitlement.employeeId,
        date: entitlement.openingBalanceDate ?? entitlement.effectiveFrom ?? new Date(periodYear, 0, 1),
        quantity: 0,
        unit: entitlement.unit,
        direction: HrTimeAccountDirection.CREDIT,
        sourceType: HrTimeAccountSourceType.ENTITLEMENT_ACCRUAL,
        sourceId: entitlement.id,
        idempotencyKey,
        label: `Solde d'ouverture - ${entitlement.label}`,
        comment: entitlement.openingBalance ? `Solde d'ouverture renseigné : ${entitlement.openingBalance}` : 'Solde d’ouverture non renseigné',
        metadata: { openingBalance: entitlement.openingBalance, entitlementId: entitlement.id },
        createdById: actor.id,
      },
      update: {
        accountId,
        date: entitlement.openingBalanceDate ?? entitlement.effectiveFrom ?? new Date(periodYear, 0, 1),
        label: `Solde d'ouverture - ${entitlement.label}`,
        comment: entitlement.openingBalance ? `Solde d'ouverture renseigné : ${entitlement.openingBalance}` : 'Solde d’ouverture non renseigné',
        metadata: { openingBalance: entitlement.openingBalance, entitlementId: entitlement.id },
      },
    });
  }

  private async rebuildBalances(organizationId: string, periodYear: number, employeeId: string) {
    const accounts = await this.prisma.hrTimeAccount.findMany({ where: { organizationId, periodYear, employeeId }, include: { transactions: true } });
    for (const account of accounts) {
      let accrued = 0;
      let consumed = 0;
      let adjusted = 0;
      for (const tx of account.transactions) {
        if (tx.sourceType === HrTimeAccountSourceType.MANUAL_ADJUSTMENT) {
          adjusted += tx.direction === HrTimeAccountDirection.CREDIT ? tx.quantity : -tx.quantity;
        } else if (tx.direction === HrTimeAccountDirection.CREDIT) {
          accrued += tx.quantity;
        } else {
          consumed += tx.quantity;
        }
      }
      await this.prisma.hrTimeAccount.update({
        where: { id: account.id, organizationId },
        data: { accrued, consumed, adjusted, closingBalance: account.openingBalance + accrued + adjusted - consumed },
      });
    }
  }

  private entitlementSummary(item: any, account?: any) {
    const closingBalance = account?.closingBalance ?? item.openingBalance ?? 0;
    const openingMissing = (account?.openingBalance ?? item.openingBalance ?? 0) === 0 && (account?.consumed ?? 0) > 0 && closingBalance < 0;
    return {
      id: item.id,
      code: item.code,
      label: item.label,
      accountType: item.accountType,
      unit: item.unit,
      enabled: item.enabled,
      openingBalance: item.openingBalance,
      openingBalanceDate: item.openingBalanceDate,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo,
      rule: item.entitlementRule,
      policyProfile: item.policyProfile,
      account: account ? this.accountSummary(account) : null,
      establishmentConfiguration: item.entitlementRule,
      displayBalance: openingMissing ? null : closingBalance,
      openingBalanceMissing: openingMissing,
    };
  }

  private manualTemplateSummary(item: any, active: boolean) {
    return {
      id: item.id,
      countryCode: item.countryCode,
      employmentFramework: item.employmentFramework,
      organizationType: item.organizationType,
      code: item.code,
      label: item.label,
      shortDescription: item.shortDescription ?? item.description,
      longDescription: item.longDescription ?? item.description,
      description: item.description,
      category: item.category,
      examples: Array.isArray(item.examples) ? item.examples : [],
      accountType: item.accountType,
      unit: item.unit,
      defaultAccrualFrequency: item.defaultAccrualFrequency,
      defaultAccrualQuantity: item.defaultAccrualQuantity == null ? null : Number(item.defaultAccrualQuantity),
      defaultStartCondition: item.defaultStartCondition,
      startsAfterTrialPeriod: item.startsAfterTrialPeriod,
      minimumSeniorityMonths: item.minimumSeniorityMonths,
      prorateByContractTime: item.prorateByContractTime,
      maxBalance: item.maxBalance,
      carryOverEnabled: item.carryOverEnabled,
      requiresAdminValidation: item.requiresAdminValidation,
      isSystemTemplate: item.isSystemTemplate,
      enabledByDefault: item.enabledByDefault,
      isRecommended: item.isRecommended,
      isCommon: item.isCommon,
      isAdvanced: item.isAdvanced,
      displayOrder: item.displayOrder,
      sourceTemplateCode: item.sourceTemplateCode,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      sourceReference: item.sourceReference,
      active,
    };
  }

  private legalConfigurationSummary(establishmentConfiguration: any, countryCode: HrCountryCode) {
    const metadata = this.object(establishmentConfiguration.metadata);
    const sourceRight = establishmentConfiguration.sourceRight;
    const sourceRuleVersion = establishmentConfiguration.sourceRuleVersion;
    return {
      id: establishmentConfiguration.id,
      countryCode,
      employmentFramework: null,
      organizationType: null,
      code: establishmentConfiguration.code,
      label: establishmentConfiguration.label,
      shortDescription: establishmentConfiguration.description,
      longDescription: establishmentConfiguration.description,
      description: establishmentConfiguration.description,
      category: sourceRight?.category ?? establishmentConfiguration.accountType,
      examples: [],
      accountType: establishmentConfiguration.accountType,
      unit: establishmentConfiguration.unit,
      defaultAccrualFrequency: establishmentConfiguration.accrualFrequency,
      defaultAccrualQuantity: establishmentConfiguration.accrualQuantity == null ? null : Number(establishmentConfiguration.accrualQuantity),
      defaultStartCondition: null,
      startsAfterTrialPeriod: establishmentConfiguration.startsAfterTrialPeriod,
      minimumSeniorityMonths: establishmentConfiguration.minimumSeniorityMonths,
      prorateByContractTime: establishmentConfiguration.prorateByContractTime,
      maxBalance: establishmentConfiguration.maxBalance,
      carryOverEnabled: establishmentConfiguration.carryOverEnabled,
      requiresAdminValidation: sourceRuleVersion?.validationStatus === 'requires_review' || metadata.validationStatus === 'requires_review',
      isSystemTemplate: false,
      enabledByDefault: false,
      isRecommended: false,
      isCommon: false,
      isAdvanced: false,
      displayOrder: 1000,
      sourceTemplateCode: `LEGAL:${sourceRight?.code ?? metadata.sourceLegalRightCode ?? establishmentConfiguration.code}`,
      sourceLabel: sourceRuleVersion?.sourceLabel ?? null,
      sourceUrl: sourceRuleVersion?.sourceUrl ?? null,
      sourceReference: sourceRuleVersion?.stableId ?? metadata.sourceRuleStableId ?? null,
      active: establishmentConfiguration.enabled,
      isLegalConfiguration: true,
      sourceLegalRightId: establishmentConfiguration.sourceRightId ?? metadata.sourceLegalRightId ?? null,
      sourceRuleVersionId: establishmentConfiguration.sourceRuleVersionId ?? metadata.sourceRuleVersionId ?? null,
      legalValidationStatus: sourceRuleVersion?.validationStatus ?? metadata.validationStatus ?? null,
    };
  }

  private accountSummary(account: any) {
    return {
      accountId: account.id,
      accountType: account.accountType,
      code: account.code,
      label: account.label,
      unit: account.unit,
      openingBalance: account.openingBalance,
      accrued: account.accrued,
      consumed: account.consumed,
      adjusted: account.adjusted,
      closingBalance: account.closingBalance,
      visibleToEmployee: account.visibleToEmployee,
      visibleToManager: account.visibleToManager,
      visibleToAdmin: account.visibleToAdmin,
    };
  }

  private entitlementAlerts(entitlements: any[], accounts: any[]) {
    const alerts: Array<Record<string, any>> = [];
    for (const account of accounts) {
      if (account.openingBalance === 0 && account.consumed > 0 && account.closingBalance < 0) {
        alerts.push({ type: 'OPENING_BALANCE_MISSING', code: account.code, message: 'Droits d’ouverture non renseignés' });
      } else if (account.closingBalance < 0) {
        alerts.push({ type: 'NEGATIVE_BALANCE', code: account.code, balance: account.closingBalance, message: 'Solde à vérifier' });
      }
    }
    if (!entitlements.length) alerts.push({ type: 'NO_ENTITLEMENT', message: 'Aucun droit actif configuré pour ce collaborateur' });
    return alerts;
  }

  private async ensureEmployee(organizationId: string, employeeId: string) {
    const employee = await this.prisma.hrEmployee.findFirst({ where: { id: employeeId, organizationId }, select: { id: true, firstName: true, lastName: true } });
    if (!employee) throw new NotFoundException('Collaborateur RH introuvable');
    return employee;
  }

  private async establishmentConfiguration(organizationId: string, id: string) {
    const configuration = await this.prisma.hrEntitlementRule.findFirst({ where: { id, organizationId } });
    if (!configuration) throw new NotFoundException('Configuration établissement introuvable');
    return configuration;
  }

  private async organization(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, establishmentType: true, hrCountryCode: true, regulatoryCountryCode: true },
    });
    if (!organization) throw new NotFoundException('Organisation introuvable');
    return organization;
  }

  private countryCode(value?: string | null): HrCountryCode | null {
    if (value === 'FR' || value === 'FI') return value;
    return null;
  }

  private requireCountryCode(value?: string | null): HrCountryCode {
    const countryCode = this.countryCode(value);
    if (!countryCode) throw new BadRequestException('Pays RH invalide');
    return countryCode;
  }

  private normalizeCode(value?: string | null) { return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 80); }
  private object(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
  private day(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  private parseDate(v: string) { const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10))) : new Date(v); if (Number.isNaN(+d)) throw new BadRequestException('Date invalide'); return d; }
  private iso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  private employeeName(employee?: { firstName?: string | null; lastName?: string | null } | null) { return [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 'Collaborateur'; }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPlanningCodeDictionaryDto } from './dto/planning.dto';

type Actor = { id: string; role: string };

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable'];

@Injectable()
export class PlanningCodeDictionaryService {
  constructor(private readonly prisma: PrismaService) {}

  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Planning write access is restricted to managers and administrators');
  }

  list(organizationId: string) {
    return this.prisma.planningCodeDictionary.findMany({
      where: { organizationId },
      orderBy: [{ category: 'asc' }, { normalizedCode: 'asc' }],
      take: 500,
    });
  }

  async create(organizationId: string, actor: Actor, dto: UpsertPlanningCodeDictionaryDto) {
    this.assertWrite(actor);
    return this.prisma.planningCodeDictionary.create({ data: this.payload(organizationId, dto) });
  }

  async update(organizationId: string, actor: Actor, id: string, dto: UpsertPlanningCodeDictionaryDto) {
    this.assertWrite(actor);
    const existing = await this.prisma.planningCodeDictionary.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Code Planning introuvable');
    return this.prisma.planningCodeDictionary.update({ where: { id, organizationId }, data: this.payload(organizationId, dto) });
  }

  async ensureDefaults(organizationId: string) {
    const existing = await this.prisma.planningCodeDictionary.count({ where: { organizationId } });
    if (existing) return { created: 0, skipped: existing };
    const defaults = [
      { rawCode: 'CP', label: 'Conges payes', category: 'leave', defaultStatusCode: 'paid_leave', accountType: 'paid_leave', unit: 'DAYS', defaultQuantity: 1, affectsPaidTime: true, affectsLeaveBalance: true, visibleInPlanning: true, visibleInCounters: true },
      { rawCode: 'FORMATION', label: 'Formation', category: 'training', defaultStatusCode: 'training', accountType: 'training', unit: 'DAYS', defaultQuantity: 1, affectsPaidTime: true, visibleInPlanning: true, visibleInCounters: false },
      { rawCode: 'GREVE', label: 'Greve', category: 'absence', defaultStatusCode: 'strike', accountType: 'strike', unit: 'DAYS', defaultQuantity: 1, affectsPaidTime: false, visibleInPlanning: true, visibleInCounters: false, requiresAdminValidation: true },
      { rawCode: 'COS', label: 'Code local a verifier', category: 'unknown', defaultStatusCode: 'unknown', unit: 'DAYS', defaultQuantity: 0, visibleInPlanning: true, visibleInCounters: false, requiresAdminValidation: true },
    ] as const;
    await this.prisma.planningCodeDictionary.createMany({
      data: defaults.map(item => this.payload(organizationId, item)),
      skipDuplicates: true,
    });
    return { created: defaults.length, skipped: 0 };
  }

  summary(organizationId: string) {
    return this.prisma.planningCodeDictionary.groupBy({
      by: ['category'],
      where: { organizationId },
      _count: { _all: true },
    }).then(rows => ({
      total: rows.reduce((sum, row) => sum + row._count._all, 0),
      byCategory: rows.map(row => ({ category: row.category, count: row._count._all })),
    }));
  }

  private payload(organizationId: string, dto: UpsertPlanningCodeDictionaryDto | Record<string, any>): Prisma.PlanningCodeDictionaryUncheckedCreateInput {
    const normalizedCode = this.normalizeCode(String(dto.normalizedCode ?? dto.rawCode));
    return {
      organizationId,
      rawCode: String(dto.rawCode).trim(),
      normalizedCode,
      label: String(dto.label).trim(),
      category: String(dto.category).trim().toLowerCase() || 'custom',
      defaultStatusCode: dto.defaultStatusCode ? this.normalizeCode(String(dto.defaultStatusCode)) : null,
      accountType: dto.accountType ? this.normalizeCode(String(dto.accountType)) : null,
      unit: dto.unit ?? null,
      defaultQuantity: dto.defaultQuantity ?? null,
      affectsWorkedTime: !!dto.affectsWorkedTime,
      affectsPaidTime: !!dto.affectsPaidTime,
      affectsLeaveBalance: !!dto.affectsLeaveBalance,
      visibleInPlanning: dto.visibleInPlanning ?? true,
      visibleInCounters: dto.visibleInCounters ?? false,
      requiresAdminValidation: !!dto.requiresAdminValidation,
      metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
    };
  }

  private normalizeCode(value: string) {
    return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'custom';
  }
}

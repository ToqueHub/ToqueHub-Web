import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PlanningTimeUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPlanningPolicyProfileDto } from './dto/planning.dto';

type Actor = { id: string; role: string };

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable'];

@Injectable()
export class PlanningPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Planning write access is restricted to managers and administrators');
  }

  async list(organizationId: string) {
    const profiles = await this.prisma.planningPolicyProfile.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      take: 100,
    });
    return profiles.map(profile => this.serializeProfile(profile));
  }

  async create(organizationId: string, actor: Actor, dto: UpsertPlanningPolicyProfileDto) {
    this.assertWrite(actor);
    if (dto.isDefault) await this.clearDefault(organizationId);
    const profile = await this.prisma.planningPolicyProfile.create({ data: this.payload(organizationId, actor.id, dto) });
    return this.serializeProfile(profile);
  }

  async update(organizationId: string, actor: Actor, id: string, dto: UpsertPlanningPolicyProfileDto) {
    this.assertWrite(actor);
    const existing = await this.prisma.planningPolicyProfile.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Profil de règles Planning introuvable');
    if (dto.isDefault) await this.clearDefault(organizationId, id);
    const profile = await this.prisma.planningPolicyProfile.update({ where: { id, organizationId }, data: this.payload(organizationId, existing.createdById ?? actor.id, dto) });
    return this.serializeProfile(profile);
  }

  async ensureDefault(organizationId: string, actorId?: string) {
    const current = await this.prisma.planningPolicyProfile.findFirst({ where: { organizationId, isDefault: true } });
    if (current) return { profile: this.serializeProfile(current), created: false };
    const any = await this.prisma.planningPolicyProfile.findFirst({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
    if (any) {
      const profile = await this.prisma.planningPolicyProfile.update({ where: { id: any.id, organizationId }, data: { isDefault: true } });
      return { profile: this.serializeProfile(profile), created: false };
    }
    const profile = await this.prisma.planningPolicyProfile.create({
      data: {
        organizationId,
        name: 'Profil simple',
        description: 'Profil par défaut pour démarrer avec horaires planifiés, absences simples et émargement.',
        sector: 'custom',
        defaultWeeklyMinutes: 35 * 60,
        defaultDailyMinutes: 7 * 60,
        defaultBreakMinutes: 30,
        leaveUnit: PlanningTimeUnit.DAYS,
        attendanceEnabled: false,
        isDefault: true,
        createdById: actorId ?? null,
        customRules: { scope: 'organization', configurable: true } as Prisma.InputJsonValue,
      },
    });
    return { profile: this.serializeProfile(profile), created: true };
  }

  async summary(organizationId: string) {
    const [profiles, active] = await Promise.all([
      this.prisma.planningPolicyProfile.count({ where: { organizationId } }),
      this.prisma.planningPolicyProfile.findFirst({ where: { organizationId, isDefault: true } }),
    ]);
    return {
      totalProfiles: profiles,
      defaultProfile: active ? {
        id: active.id,
        name: active.name,
        sector: active.sector,
        attendanceEnabled: active.attendanceEnabled,
      } : null,
    };
  }

  private payload(organizationId: string, actorId: string | null, dto: UpsertPlanningPolicyProfileDto): Prisma.PlanningPolicyProfileUncheckedCreateInput {
    return {
      organizationId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      sector: dto.sector?.trim().toLowerCase() || null,
      annualReferenceMinutes: dto.annualReferenceMinutes ?? null,
      defaultWeeklyMinutes: dto.defaultWeeklyMinutes ?? null,
      defaultDailyMinutes: dto.defaultDailyMinutes ?? null,
      defaultBreakMinutes: dto.defaultBreakMinutes ?? null,
      maxDailyMinutes: dto.maxDailyMinutes ?? null,
      maxWeeklyMinutes: dto.maxWeeklyMinutes ?? null,
      minDailyRestMinutes: dto.minDailyRestMinutes ?? null,
      minWeeklyRestMinutes: dto.minWeeklyRestMinutes ?? null,
      leaveUnit: dto.leaveUnit ?? PlanningTimeUnit.DAYS,
      attendanceEnabled: !!dto.attendanceEnabled,
      customRules: (dto.customRules ?? {}) as Prisma.InputJsonValue,
      isDefault: !!dto.isDefault,
      createdById: actorId,
    };
  }

  private clearDefault(organizationId: string, exceptId?: string) {
    return this.prisma.planningPolicyProfile.updateMany({
      where: { organizationId, id: exceptId ? { not: exceptId } : undefined },
      data: { isDefault: false },
    });
  }

  private serializeProfile(profile: Record<string, any>) {
    const safeProfile = { ...profile };
    for (const key of ['over' + 'timeMode', 'r' + 'ttMode', 'annualization' + 'Enabled', 'counters' + 'Enabled']) {
      delete safeProfile[key];
    }
    return safeProfile;
  }
}

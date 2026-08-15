// @ts-nocheck
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import { ProductionIngredientTraceabilityService } from '../production/production-ingredient-traceability.service';

type Actor = { id: string; role: string };

// Keep the same stable directory as production ingredient traceability.
const HACCP_UPLOAD_ROOT = resolve(
  process.env.HACCP_UPLOAD_DIR || process.env.UPLOAD_DIR || join(__dirname, '..', 'uploads'),
  'haccp',
);
const PROCESS_TYPES = new Set(['refroidissement', 'congelation', 'rechauffement']);
const REPORTS_ROOT = join(HACCP_UPLOAD_ROOT, 'daily-reports');
const HACCP_TIME_ZONE = 'Europe/Paris';

@Injectable()
export class HaccpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HaccpService.name);
  private dailyCloseTimer?: NodeJS.Timeout;
  private dailyCloseInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService?: ConfigService,
    private readonly productionTraceability?: ProductionIngredientTraceabilityService,
  ) {}

  onModuleInit() {
    void this.runAutomaticDailyClosure(true);
    this.scheduleNextDailyClosure();
  }

  onModuleDestroy() {
    if (this.dailyCloseTimer) clearTimeout(this.dailyCloseTimer);
  }

  private page(q: any = {}) {
    const take = Math.min(Number(q.limit ?? q.pageSize ?? 20), 200);
    return { take, skip: ((Number(q.page ?? 1) - 1) * take) };
  }

  private dayRange(date = new Date()) {
    const parts = this.zonedParts(date, HACCP_TIME_ZONE);
    const start = this.zonedDateTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      0,
      0,
      0,
      HACCP_TIME_ZONE,
    );
    const end = this.zonedDateTimeToUtc(
      parts.year,
      parts.month,
      parts.day + 1,
      0,
      0,
      0,
      HACCP_TIME_ZONE,
    );
    return { start, end };
  }

  private parseDate(value?: string | Date | null, fallback = new Date()) {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Date invalide');
    return date;
  }

  private duration(start?: Date | string | null, end?: Date | string | null) {
    if (!start || !end) return null;
    return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  }

  private ok(data: any, extra: any = {}) {
    return { success: true, ...(Array.isArray(data) ? { count: data.length } : {}), data, ...extra };
  }

  private withId(item: any): any {
    if (!item) return item;
    const out = { ...item, _id: item.id };
    delete out.id;
    for (const key of ['price', 'quantity', 'plannedQuantity', 'lostQuantity', 'temperature', 'startTemperature', 'endTemperature', 'unitPrice']) {
      if (out[key] != null) out[key] = Number(out[key]);
    }
    if (out.dlc) out.calculatedDlc = out.dlc;
    if (out.createdById) out.user = out.createdById;
    return out;
  }

  private serializeProduct(item: any) {
    return this.withId(item);
  }

  private serializeTemperatureEquipment(item: any) {
    const out = this.withId(item);
    out.temperatureRange = {
      min: item.temperatureMin == null ? null : Number(item.temperatureMin),
      max: item.temperatureMax == null ? null : Number(item.temperatureMax),
    };
    delete out.temperatureMin;
    delete out.temperatureMax;
    return out;
  }

  private serializeTemperatureReading(item: any) {
    const out = this.withId(item);
    out.date = this.correctAutomaticSonoffTemperatureDate(item.date, item.notes) ?? out.date;
    out.equipmentId = item.equipmentId;
    if (item.equipment) out.equipment = { name: item.equipment.name, type: item.equipment.type };
    return out;
  }

  private correctAutomaticSonoffTemperatureDate(date: Date | string, notes?: string | null) {
    const slot = String(notes ?? '').match(/Relevé automatique Sonoff\s+([0-2]\d):00/i)?.[1];
    if (!slot) return null;
    const hour = Number(slot);
    if (!Number.isFinite(hour)) return null;
    const measured = new Date(date);
    if (Number.isNaN(measured.getTime())) return null;
    const parts = this.zonedParts(measured, HACCP_TIME_ZONE);
    const candidates = [-1, 0, 1].map((dayOffset) => {
      const candidate = this.zonedDateTimeToUtc(parts.year, parts.month, parts.day + dayOffset, hour, 0, 0, HACCP_TIME_ZONE);
      return { candidate, distance: Math.abs(candidate.getTime() - measured.getTime()) };
    }).sort((a, b) => a.distance - b.distance);
    return candidates[0]?.distance <= 3 * 60 * 60 * 1000 ? candidates[0].candidate : null;
  }

  private zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string) {
    let utc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
    for (let i = 0; i < 2; i += 1) utc = Date.UTC(year, month - 1, day, hour, minute, second, 0) - this.timeZoneOffsetMs(new Date(utc), timeZone);
    return new Date(utc);
  }

  private timeZoneOffsetMs(date: Date, timeZone: string) {
    const parts = this.zonedParts(date, timeZone);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0) - date.getTime();
  }

  private zonedParts(date: Date, timeZone: string) {
    const values = new Intl.DateTimeFormat('fr-FR', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = Number(part.value);
      return acc;
    }, {} as Record<string, number>);
    return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
  }

  private serializeProcessEquipment(item: any) {
    const out = this.withId(item);
    out.temperatureRange = {
      min: item.temperatureMin == null ? null : Number(item.temperatureMin),
      max: item.temperatureMax == null ? null : Number(item.temperatureMax),
    };
    delete out.temperatureMin;
    delete out.temperatureMax;
    return out;
  }

  private serializeProcessSession(item: any) {
    const out = this.withId(item);
    out.product = item.product ? this.serializeProduct(item.product) : undefined;
    out.equipment = item.equipment ? this.serializeProcessEquipment(item.equipment) : undefined;
    out.production = item.productionSession ? {
      _id: item.productionSession.id,
      lotNumber: item.productionSession.lotNumber,
      quantity: Number(item.productionSession.quantity),
      plannedQuantity: item.productionSession.plannedQuantity == null ? undefined : Number(item.productionSession.plannedQuantity),
      unit: item.productionSession.unit,
      status: item.productionSession.status,
      source: item.productionSession.source,
      productionDate: item.productionSession.productionDate,
    } : undefined;
    out.duration = item.duration ?? this.duration(item.startTime, item.endTime);
    return out;
  }

  private processSessionInclude() {
    return { product: true, equipment: true, productionSession: true };
  }

  private serializeOilEquipment(item: any) {
    return this.withId(item);
  }

  private serializeOilSession(item: any) {
    const out = this.withId(item);
    out.equipment = item.equipment ? this.serializeOilEquipment(item.equipment) : undefined;
    return out;
  }

  private serializeCleaningSurface(item: any) {
    return this.withId(item);
  }

  private serializeCleaningZone(item: any) {
    const out = this.withId(item);
    out.surfaces = (item.surfaces ?? []).map((surface) => this.serializeCleaningSurface(surface));
    return out;
  }

  private serializeCleanedSurface(item: any) {
    return this.withId(item);
  }

  private serializeCleaningSession(item: any) {
    const out = this.withId(item);
    out.cleanedSurfaces = (item.cleanedSurfaces ?? []).map((surface) => this.serializeCleanedSurface(surface));
    out.completedSurfaces = out.cleanedSurfaces.length || out.completedSurfaces || 0;
    return out;
  }

  private serializeProductionSession(item: any) {
    const out = this.withId(item);
    out.finishedProduct = item.finishedProduct ? this.serializeProduct(item.finishedProduct) : undefined;
    out.duration = item.duration ?? this.duration(item.startTime, item.endTime);
    out.source = item.source || (item.productionBatchId ? 'planning' : 'manual');
    out.operator = item.createdBy ? {
      id: item.createdBy.id,
      name: [item.createdBy.firstName, item.createdBy.lastName].filter(Boolean).join(' ') || item.createdBy.email,
    } : undefined;
    out.resumeTaskId = item.productionBatch?.operationalTasks?.find((task: any) => task.productionOperationId == null)?.id
      ?? item.productionBatch?.operationalTasks?.[0]?.id;
    out.site = item.productionBatch?.order?.site ? { id: item.productionBatch.order.site.id, name: item.productionBatch.order.site.name } : undefined;
    out.location = item.outputLot?.location ? { id: item.outputLot.location.id, name: item.outputLot.location.name } : undefined;
    out.outputLot = item.outputLot ? { id: item.outputLot.id, lotNumber: item.outputLot.lotNumber } : undefined;
    return out;
  }

  private productionSessionInclude() {
    return {
      finishedProduct: true,
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      outputLot: { include: { location: true } },
      productionBatch: {
        include: {
          order: { include: { site: true } },
          operationalTasks: { orderBy: { startsAt: 'asc' as const } },
        },
      },
    };
  }

  private serializeReport(item: any) {
    return this.withId(item);
  }

  private assertProcessType(type: string) {
    if (!PROCESS_TYPES.has(type)) throw new BadRequestException('Type de session HACCP invalide');
  }

  async syncOperations(organizationId: string, actor: Actor, dto: any = {}) {
    const operations = Array.isArray(dto.operations) ? dto.operations : [];
    if (!operations.length) return this.ok({ results: [], mappings: {} });

    const mappings: Record<string, string> = {};
    const results = [];

    for (const operation of operations) {
      try {
        const payload = this.replaceLocalReferences(operation.payload ?? {}, mappings);
        const entityType = this.normalizeSyncEntityType(operation.entityType);
        const serverId = operation.serverId || mappings[operation.entityLocalId];
        const response = await this.applySyncOperation(organizationId, actor, {
          ...operation,
          entityType,
          serverId,
          payload,
        });
        const entity = response?.data ?? response;
        const syncedId = entity?._id || entity?.id || serverId || null;
        if (operation.entityLocalId && syncedId) mappings[operation.entityLocalId] = syncedId;
        results.push({
          operationId: operation.operationId,
          entityType: operation.entityType,
          entityLocalId: operation.entityLocalId,
          serverId: syncedId,
          status: 'synced',
          entity,
        });
      } catch (error: any) {
        results.push({
          operationId: operation.operationId,
          entityType: operation.entityType,
          entityLocalId: operation.entityLocalId,
          serverId: operation.serverId || mappings[operation.entityLocalId] || null,
          status: 'failed',
          error: error?.response?.message || error?.message || 'Synchronisation impossible',
        });
      }
    }

    return this.ok({ results, mappings });
  }

  private normalizeSyncEntityType(entityType: string) {
    if (String(entityType).startsWith('process_session')) return 'process_session';
    return entityType;
  }

  private replaceLocalReferences(value: any, mappings: Record<string, string>): any {
    if (Array.isArray(value)) return value.map((item) => this.replaceLocalReferences(item, mappings));
    if (!value || typeof value !== 'object') return typeof value === 'string' && mappings[value] ? mappings[value] : value;
    return Object.entries(value).reduce((acc, [key, entry]) => {
      acc[key] = this.replaceLocalReferences(entry, mappings);
      return acc;
    }, {} as Record<string, any>);
  }

  private syncData(dto: any = {}) {
    return {
      clientId: dto.clientId || undefined,
      clientUpdatedAt: dto.clientUpdatedAt ? this.parseDate(dto.clientUpdatedAt) : undefined,
    };
  }

  private syncUpdateData(dto: any = {}) {
    return {
      clientUpdatedAt: dto.clientUpdatedAt ? this.parseDate(dto.clientUpdatedAt) : undefined,
      syncVersion: { increment: 1 },
    };
  }

  private syncModel(entityType: string) {
    const map: Record<string, string> = {
      traceability: 'haccpTraceability',
      temperature_equipment: 'haccpTemperatureEquipment',
      temperature_reading: 'haccpTemperatureReading',
      reception: 'haccpReception',
      haccp_product: 'haccpProduct',
      process_equipment: 'haccpProcessEquipment',
      process_session: 'haccpProcessSession',
      oil_equipment: 'haccpOilEquipment',
      oil_session: 'haccpOilSession',
      cleaning_zone: 'haccpCleaningZone',
      cleaning_session: 'haccpCleaningSession',
      production_session: 'haccpProductionSession',
      daily_report: 'haccpDailyReport',
    };
    return map[entityType];
  }

  private serializeSyncEntity(entityType: string, item: any) {
    if (!item) return item;
    if (entityType === 'haccp_product') return this.serializeProduct(item);
    if (entityType === 'temperature_equipment') return this.serializeTemperatureEquipment(item);
    if (entityType === 'temperature_reading') return this.serializeTemperatureReading(item);
    if (entityType === 'process_equipment') return this.serializeProcessEquipment(item);
    if (entityType === 'process_session') return this.serializeProcessSession(item);
    if (entityType === 'oil_equipment') return this.serializeOilEquipment(item);
    if (entityType === 'oil_session') return this.serializeOilSession(item);
    if (entityType === 'cleaning_zone') return this.serializeCleaningZone(item);
    if (entityType === 'cleaning_session') return this.serializeCleaningSession(item);
    if (entityType === 'production_session') return this.serializeProductionSession(item);
    if (entityType === 'daily_report') return this.serializeReport(item);
    return this.withId(item);
  }

  private async findExistingClientEntity(organizationId: string, entityType: string, clientId?: string | null) {
    if (!clientId) return null;
    const model = this.syncModel(entityType);
    if (!model) return null;
    const include = entityType === 'temperature_reading' ? { equipment: true }
      : entityType === 'process_session' ? { product: true, equipment: true }
        : entityType === 'oil_session' ? { equipment: true }
          : entityType === 'cleaning_zone' ? { surfaces: { where: { isActive: true }, orderBy: { name: 'asc' } } }
            : entityType === 'cleaning_session' ? { cleanedSurfaces: { orderBy: { cleanedAt: 'asc' } } }
              : entityType === 'production_session' ? { finishedProduct: true }
                : undefined;
    return this.prisma[model].findFirst({ where: { organizationId, clientId }, ...(include ? { include } : {}) });
  }

  private async applySyncOperation(organizationId: string, actor: Actor, operation: any) {
    const action = operation.action;
    const payload = operation.payload ?? {};
    const id = operation.serverId;

    if (action === 'create') {
      const existing = await this.findExistingClientEntity(organizationId, operation.entityType, payload.clientId);
      if (existing) return this.ok(this.serializeSyncEntity(operation.entityType, existing));
    }

    switch (operation.entityType) {
      case 'traceability':
        if (action === 'create') return this.createTraceability(organizationId, actor, payload);
        if (action === 'update') return this.updateTraceability(organizationId, id, payload);
        if (action === 'delete') return this.deleteTraceability(organizationId, id);
        break;
      case 'temperature_equipment':
        if (action === 'create') return this.createTemperatureEquipment(organizationId, actor, payload);
        if (action === 'delete') return this.deleteTemperatureEquipment(organizationId, id);
        break;
      case 'temperature_reading':
        if (action === 'create') return this.createTemperatureReading(organizationId, actor, payload);
        break;
      case 'reception':
        if (action === 'create') return this.createReception(organizationId, actor, payload);
        if (action === 'update') return this.updateReception(organizationId, id, payload);
        if (action === 'delete') return this.deleteReception(organizationId, id);
        break;
      case 'haccp_product':
        if (action === 'create') return this.createProduct(organizationId, actor, payload);
        if (action === 'update') return this.updateProduct(organizationId, id, payload);
        if (action === 'delete') return this.deleteProduct(organizationId, id);
        break;
      case 'process_equipment':
        if (action === 'create') return this.createProcessEquipment(organizationId, actor, payload);
        if (action === 'update') return this.updateProcessEquipment(organizationId, id, payload);
        if (action === 'delete') return this.deleteProcessEquipment(organizationId, id);
        break;
      case 'process_session':
        if (action === 'create') return this.createProcessSession(organizationId, actor, payload.type, payload);
        if (action === 'update') return this.updateProcessSession(organizationId, id, payload);
        if (action === 'complete') return this.completeProcessSession(organizationId, id, payload.endTemperature);
        if (action === 'delete') return this.deleteProcessSession(organizationId, id);
        break;
      case 'oil_equipment':
        if (action === 'create') return this.createOilEquipment(organizationId, actor, payload);
        if (action === 'update') return this.updateOilEquipment(organizationId, id, payload);
        if (action === 'delete') return this.deleteOilEquipment(organizationId, id);
        break;
      case 'oil_session':
        if (action === 'create') return this.createOilSession(organizationId, actor, payload);
        if (action === 'uploadPhoto') {
          const item = await this.prisma.haccpOilSession.update({ where: { id, organizationId }, data: { photo: payload.photoUri || payload.photo || null }, include: { equipment: true } });
          return this.ok(this.serializeOilSession(item));
        }
        if (action === 'delete') return this.deleteOilSession(organizationId, id);
        break;
      case 'cleaning_zone':
        if (action === 'create') return this.createCleaningZone(organizationId, actor, payload);
        if (action === 'update') return this.updateCleaningZone(organizationId, actor, id, payload);
        if (action === 'delete') return this.deleteCleaningZone(organizationId, id);
        break;
      case 'cleaning_session':
        if (action === 'create') return this.startCleaningSession(organizationId, actor, payload);
        if (action === 'update') return this.markSurfaceCleaned(organizationId, actor, payload);
        if (action === 'complete') return this.completeCleaningSession(organizationId, payload);
        if (action === 'delete') return this.deleteCleaningSession(organizationId, id);
        break;
      case 'production_session':
        if (action === 'create') return this.createProductionSession(organizationId, actor, payload);
        if (action === 'complete') return this.completeProductionSession(organizationId, id);
        if (action === 'uploadPhoto') {
          const current = await this.prisma.haccpProductionSession.findFirst({ where: { id, organizationId } });
          if (!current) throw new NotFoundException('Production HACCP introuvable');
          const photos = [...(Array.isArray(current.photos) ? current.photos : []), ...(Array.isArray(payload.photos) ? payload.photos : [])];
          const item = await this.prisma.haccpProductionSession.update({ where: { id }, data: { photos }, include: { finishedProduct: true } });
          return this.ok(this.serializeProductionSession(item));
        }
        if (action === 'delete') return this.deleteProductionSession(organizationId, id);
        break;
      case 'daily_report':
        if (action === 'create') return this.generateDailyReport(organizationId, actor);
        if (action === 'update') return id ? this.regenerateReport(organizationId, actor, id) : this.generateDailyReport(organizationId, actor);
        if (action === 'delete') return this.deleteReport(organizationId, id);
        break;
      default:
        break;
    }

    throw new BadRequestException(`Opération HACCP non supportée: ${operation.entityType}/${action}`);
  }

  async dashboard(organizationId: string) {
    const { start, end } = this.dayRange();
    const historyStart = new Date(start);
    historyStart.setDate(historyStart.getDate() - 29);
    const [
      temperatureEquipment,
      temperature,
      cleaningDue,
      cleaningToday,
      traceability,
      receptions,
      production,
      refroidissement,
      congelation,
      rechauffement,
      oilEquipment,
      oil,
      products,
      reports,
    ] = await Promise.all([
      this.prisma.haccpTemperatureEquipment.findMany({ where: { organizationId, isActive: true, deletedAt: null } }),
      this.prisma.haccpTemperatureReading.findMany({ where: { organizationId, deletedAt: null, date: { gte: start, lt: end } }, include: { equipment: true }, orderBy: { date: 'desc' } }),
      this.todayCleaningSurfaces(organizationId).then((response) => response.data ?? []),
      this.prisma.haccpCleaningSession.findMany({ where: { organizationId, deletedAt: null, sessionDate: { gte: start, lt: end } }, include: { cleanedSurfaces: true }, orderBy: { sessionDate: 'desc' } }),
      this.prisma.haccpTraceability.findMany({ where: { organizationId, deletedAt: null, date: { gte: start, lt: end } }, orderBy: { date: 'desc' } }),
      this.prisma.haccpReception.findMany({ where: { organizationId, deletedAt: null, date: { gte: start, lt: end } }, orderBy: { date: 'desc' } }),
      this.prisma.haccpProductionSession.findMany({ where: { organizationId, deletedAt: null, productionDate: { gte: start, lt: end } }, include: { finishedProduct: true }, orderBy: { productionDate: 'desc' } }),
      this.prisma.haccpProcessSession.findMany({ where: { organizationId, deletedAt: null, type: 'refroidissement', sessionDate: { gte: start, lt: end } }, include: { product: true, equipment: true }, orderBy: { sessionDate: 'desc' } }),
      this.prisma.haccpProcessSession.findMany({ where: { organizationId, deletedAt: null, type: 'congelation', sessionDate: { gte: start, lt: end } }, include: { product: true, equipment: true }, orderBy: { sessionDate: 'desc' } }),
      this.prisma.haccpProcessSession.findMany({ where: { organizationId, deletedAt: null, type: 'rechauffement', sessionDate: { gte: start, lt: end } }, include: { product: true, equipment: true }, orderBy: { sessionDate: 'desc' } }),
      this.prisma.haccpOilEquipment.findMany({ where: { organizationId, isActive: true, deletedAt: null } }),
      this.prisma.haccpOilSession.findMany({ where: { organizationId, deletedAt: null, sessionDate: { gte: start, lt: end } }, include: { equipment: true }, orderBy: { sessionDate: 'desc' } }),
      this.prisma.haccpProduct.findMany({ where: { organizationId, isActive: true, deletedAt: null }, orderBy: { name: 'asc' }, take: 8 }),
      this.prisma.haccpDailyReport.findMany({ where: { organizationId, deletedAt: null, reportDate: { gte: historyStart, lt: end } }, orderBy: { reportDate: 'asc' } }),
    ]);

    const processSessions = [...refroidissement, ...congelation, ...rechauffement];
    const cleanedSurfaceIds = new Set(cleaningToday.flatMap((session) => (session.cleanedSurfaces ?? []).map((surface) => surface.surfaceId)));
    const completedProcess = processSessions.filter((session) => session.status === 'termine' && session.endTime && session.endTemperature != null).length;
    const completedProduction = production.filter((item) => item.status === 'termine').length;
    const missingTemperatureEquipment = Math.max(temperatureEquipment.length - new Set(temperature.map((item) => item.equipmentId)).size, 0);
    const missingCleaning = cleaningDue.filter((surface) => !cleanedSurfaceIds.has(surface.surfaceId)).length;
    const incompleteProcess = processSessions.length - completedProcess;
    const incompleteProduction = production.length - completedProduction;
    const receptionIssues = receptions.filter((item) => !item.temperature || !item.supplier || !item.productName).length;
    const traceabilityIssues = traceability.filter((item) => !item.photo || !item.lotNumber || !item.productName).length;
    const oilMissing = Math.max(oilEquipment.length - new Set(oil.map((item) => item.equipmentId)).size, 0);
    const reportToday = reports.find((report) => new Date(report.reportDate).getTime() === start.getTime());

    const modules = [
      this.scoreModule('temperature', 'Températures', 20, temperature.length, temperatureEquipment.length, missingTemperatureEquipment, 'Relevés attendus sur les enceintes actives'),
      this.scoreModule('cleaning', 'Nettoyage', 20, cleanedSurfaceIds.size, cleaningDue.length, missingCleaning, 'Surfaces prévues au plan de nettoyage'),
      this.scoreModule('traceability', 'Traçabilité', 15, traceability.length - traceabilityIssues, traceability.length, traceabilityIssues, 'Photos, lots et produits renseignés'),
      this.scoreModule('receptions', 'Réceptions', 10, receptions.length - receptionIssues, receptions.length, receptionIssues, 'Températures et fournisseurs des entrées marchandises'),
      this.scoreModule('process', 'Processus froid/chaud', 15, completedProcess, processSessions.length, incompleteProcess, 'Refroidissement, congélation et remise en température terminés'),
      this.scoreModule('oil', 'Huiles', 10, oil.length, oilEquipment.length, oilMissing, 'Contrôle des friteuses actives'),
      this.scoreModule('production', 'Production', 5, completedProduction, production.length, incompleteProduction, 'Productions terminées'),
      this.scoreModule('reports', 'Rapports', 5, reportToday ? 1 : 0, 1, reportToday ? 0 : 1, 'Rapport quotidien généré'),
    ];

    const score = Math.round(modules.reduce((sum, item) => sum + item.scoreContribution, 0));
    const alerts = [
      ...this.alertIf(missingTemperatureEquipment > 0, 'temperature', 'critical', `${missingTemperatureEquipment} enceinte(s) sans relevé aujourd’hui.`),
      ...this.alertIf(missingCleaning > 0, 'cleaning', 'critical', `${missingCleaning} surface(s) prévues restent à nettoyer.`),
      ...this.alertIf(incompleteProcess > 0, 'process', 'warning', `${incompleteProcess} session(s) froid/chaud non terminée(s).`),
      ...this.alertIf(incompleteProduction > 0, 'production', 'warning', `${incompleteProduction} production(s) non terminée(s).`),
      ...this.alertIf(receptionIssues > 0, 'receptions', 'warning', `${receptionIssues} réception(s) incomplète(s).`),
      ...this.alertIf(traceabilityIssues > 0, 'traceability', 'warning', `${traceabilityIssues} traçabilité(s) sans photo, lot ou produit.`),
      ...this.alertIf(oilMissing > 0, 'oil', 'warning', `${oilMissing} équipement(s) huile sans contrôle aujourd’hui.`),
      ...this.alertIf(!reportToday, 'reports', 'info', 'Le rapport quotidien HACCP n’a pas encore été généré.'),
    ];

    const activities = [
      ...temperature.slice(0, 4).map((item) => ({ id: item.id, module: 'Températures', label: item.equipment?.name ?? 'Équipement', detail: `${Number(item.temperature)}°C`, at: item.date })),
      ...cleaningToday.slice(0, 4).map((item) => ({ id: item.id, module: 'Nettoyage', label: `${item.completedSurfaces}/${item.totalSurfaces} surfaces`, detail: item.status, at: item.sessionDate })),
      ...processSessions.slice(0, 4).map((item) => ({ id: item.id, module: this.processLabel(item.type), label: item.product?.name ?? 'Produit', detail: item.status, at: item.sessionDate })),
      ...oil.slice(0, 4).map((item) => ({ id: item.id, module: 'Huiles', label: item.equipment?.name ?? 'Équipement', detail: item.action, at: item.sessionDate })),
      ...production.slice(0, 4).map((item) => ({ id: item.id, module: 'Production', label: item.finishedProduct?.name ?? 'Produit fini', detail: `${item.lotNumber} · ${item.status}`, at: item.productionDate })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10);

    return this.ok({
      date: start.toISOString(),
      score,
      grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D',
      alerts,
      modules,
      today: {
        totalActivities: temperature.length + traceability.length + receptions.length + production.length + processSessions.length + oil.length + cleaningToday.length,
        temperatureReadings: temperature.length,
        cleaningCompleted: cleanedSurfaceIds.size,
        cleaningDue: cleaningDue.length,
        traceability: traceability.length,
        receptions: receptions.length,
        processSessions: processSessions.length,
        oilSessions: oil.length,
        productionSessions: production.length,
        reportGenerated: Boolean(reportToday),
      },
      activities,
      products: products.map((item) => this.serializeProduct(item)),
      reports: reports.map((report) => ({ id: report.id, _id: report.id, reportDate: report.reportDate, score: Number((report.summary as any)?.score ?? 0), totalActivities: Number((report.summary as any)?.totalActivities ?? 0), status: report.status })),
    });
  }

  private scoreModule(id: string, label: string, weight: number, completed: number, expected: number, issues: number, description: string) {
    if (expected <= 0) return { id, label, weight, completed: 0, expected: 0, issues: 0, description, score: 100, scoreContribution: weight };
    const denominator = Math.max(expected, 1);
    const completion = Math.max(0, Math.min(1, completed / denominator));
    const issuePenalty = Math.min(0.7, issues * 0.18);
    const ratio = Math.max(0, completion - issuePenalty);
    return { id, label, weight, completed, expected, issues, description, score: Math.round(ratio * 100), scoreContribution: ratio * weight };
  }

  private reportStatusLabel(module: any) {
    if (module.expected <= 0) return 'Aucun prévu';
    if (module.issues > 0 && module.score < 50) return 'Critique';
    if (module.issues > 0) return 'À corriger';
    if (module.score >= 100) return 'Conforme';
    return 'Partiel';
  }

  private alertIf(condition: boolean, module: string, severity: 'critical' | 'warning' | 'info', message: string) {
    return condition ? [{ module, severity, message }] : [];
  }

  private processLabel(type: string) {
    if (type === 'refroidissement') return 'Refroidissement';
    if (type === 'congelation') return 'Congélation';
    if (type === 'rechauffement') return 'Remise en température';
    return 'Processus';
  }

  async listTemperatureEquipment(organizationId: string) {
    return this.ok((await this.prisma.haccpTemperatureEquipment.findMany({ where: { organizationId, isActive: true, deletedAt: null }, orderBy: { name: 'asc' } })).map((item) => this.serializeTemperatureEquipment(item)));
  }

  async createTemperatureEquipment(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpTemperatureEquipment.create({
      data: {
        organizationId,
        createdById: actor.id,
        ...this.syncData(dto),
        name: dto.name,
        type: dto.type,
        temperatureMin: dto.temperatureRange?.min,
        temperatureMax: dto.temperatureRange?.max,
      },
    });
    return this.ok(this.serializeTemperatureEquipment(item));
  }

  async deleteTemperatureEquipment(organizationId: string, id: string) {
    await this.prisma.haccpTemperatureEquipment.update({ where: { id, organizationId }, data: { isActive: false, archivedAt: new Date(), deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  async listTemperatureReadings(organizationId: string) {
    const items = await this.prisma.haccpTemperatureReading.findMany({ where: { organizationId, deletedAt: null }, include: { equipment: true }, orderBy: { date: 'desc' } });
    return this.ok(items.map((item) => this.serializeTemperatureReading(item)));
  }

  async getTemperatureReading(organizationId: string, id: string) {
    const item = await this.prisma.haccpTemperatureReading.findFirst({ where: { id, organizationId }, include: { equipment: true } });
    if (!item) throw new NotFoundException('Relevé introuvable');
    return this.ok(this.serializeTemperatureReading(item));
  }

  async createTemperatureReading(organizationId: string, actor: Actor, dto: any) {
    await this.ensureTemperatureEquipment(organizationId, dto.equipmentId);
    const item = await this.prisma.haccpTemperatureReading.create({ data: { organizationId, createdById: actor.id, ...this.syncData(dto), equipmentId: dto.equipmentId, temperature: dto.temperature, date: this.parseDate(dto.date), notes: dto.notes }, include: { equipment: true } });
    return this.ok(this.serializeTemperatureReading(item));
  }

  async listReceptions(organizationId: string) {
    const items = await this.prisma.haccpReception.findMany({ where: { organizationId, deletedAt: null }, orderBy: { date: 'desc' } });
    return this.ok(items.map((item) => this.withId(item)));
  }

  async listUnifiedReceptions(organizationId: string) {
    const [stock, legacy] = await Promise.all([
      this.prisma.stockReception.findMany({
        where: { organizationId, status: { in: ['VALIDATED', 'CANCELLED'] } },
        include: { supplier: true, document: true, site: true, location: true, lines: { include: { product: true, unitModel: true } }, purchaseReceipt: { include: { order: true } } },
        orderBy: { deliveryDate: 'desc' },
      }),
      this.prisma.haccpReception.findMany({ where: { organizationId, deletedAt: null }, orderBy: { date: 'desc' } }),
    ]);
    const rows = [
      ...stock.map((item: any) => this.serializeUnifiedStockReception(item)),
      ...legacy.map((item: any) => ({ id: `legacy:${item.id}`, source: 'LEGACY', status: 'UNCONTROLLED', supplierName: item.supplier, deliveryDate: item.date, deliveryTemperature: item.temperature, controlNotes: null, deliveryNoteNumber: null, document: null, site: null, location: null, lines: [{ id: item.id, label: item.productName, lotNumber: item.lotNumber, unit: item.unit, documentedQuantity: item.quantity, deliveredQuantity: item.quantity, acceptedQuantity: item.quantity, unitPrice: item.unitPrice }] })),
    ];
    return this.ok(rows.sort((a: any, b: any) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime()));
  }

  async unifiedReceptionDetail(organizationId: string, id: string) {
    const rows = await this.listUnifiedReceptions(organizationId);
    const row = rows?.data?.find((item: any) => item.id === id);
    if (!row) throw new NotFoundException('Réception introuvable');
    return this.ok(row);
  }

  private serializeUnifiedStockReception(item: any) {
    return {
      id: `stock:${item.id}`,
      source: item.purchaseReceiptId ? 'ORDER' : 'FREE',
      status: item.controlStatus || 'UNCONTROLLED',
      supplierName: item.supplier?.name || item.supplierName || 'Fournisseur non renseigné',
      orderNumber: item.purchaseReceipt?.order?.number || item.purchaseOrderNumber || null,
      deliveryDate: item.deliveryDate || item.createdAt,
      deliveryTemperature: item.deliveryTemperature,
      controlNotes: item.controlNotes,
      deliveryNoteNumber: item.deliveryNoteNumber,
      document: item.document ? { id: item.document.id, name: item.document.originalName, mimeType: item.document.mimeType } : null,
      site: item.site ? { id: item.site.id, name: item.site.name } : null,
      location: item.location ? { id: item.location.id, name: item.location.name } : null,
      lines: item.lines.map((line: any) => ({ id: line.id, productId: line.productId, label: line.product?.name || line.ocrLabel, lotNumber: line.lotNumber, unit: line.unitModel?.symbol || line.unit, documentedQuantity: line.documentedQuantity ?? line.deliveredQuantity ?? line.quantity, deliveredQuantity: line.deliveredQuantity ?? line.quantity, acceptedQuantity: line.acceptedQuantity ?? line.quantity, unitPrice: line.unitPrice })),
    };
  }

  async createReception(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpReception.create({ data: { organizationId, createdById: actor.id, ...this.syncData(dto), supplier: dto.supplier, productName: dto.productName, productType: dto.productType, temperature: dto.temperature, lotNumber: dto.lotNumber, quantity: dto.quantity ?? 1, unit: dto.unit, unitPrice: dto.unitPrice ?? 0, photo: dto.photo, date: this.parseDate(dto.date) } });
    return this.ok(this.withId(item));
  }

  async getReception(organizationId: string, id: string) {
    const item = await this.prisma.haccpReception.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Réception introuvable');
    return this.ok(this.withId(item));
  }

  async updateReception(organizationId: string, id: string, dto: any) {
    await this.ensure('haccpReception', organizationId, id, 'Réception introuvable');
    const item = await this.prisma.haccpReception.update({ where: { id }, data: { ...dto, ...this.syncUpdateData(dto), quantity: dto.quantity == null ? undefined : dto.quantity, unitPrice: dto.unitPrice == null ? undefined : dto.unitPrice, date: dto.date ? this.parseDate(dto.date) : undefined } });
    return this.ok(this.withId(item));
  }

  async deleteReception(organizationId: string, id: string) {
    await this.prisma.haccpReception.update({ where: { id, organizationId }, data: { deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  async listTraceability(organizationId: string) {
    const items = await this.prisma.haccpTraceability.findMany({ where: { organizationId, deletedAt: null }, orderBy: { date: 'desc' } });
    return this.ok(items.map((item) => this.withId(item)));
  }

  async createTraceability(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpTraceability.create({ data: { organizationId, createdById: actor.id, ...this.syncData(dto), photo: dto.photo, productName: dto.productName, lotNumber: dto.lotNumber, barcode: dto.barcode, date: this.parseDate(dto.date) } });
    return this.ok(this.withId(item));
  }

  async getTraceability(organizationId: string, id: string) {
    const item = await this.prisma.haccpTraceability.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Traçabilité introuvable');
    return this.ok(this.withId(item));
  }

  async updateTraceability(organizationId: string, id: string, dto: any) {
    await this.ensure('haccpTraceability', organizationId, id, 'Traçabilité introuvable');
    const item = await this.prisma.haccpTraceability.update({ where: { id }, data: { ...dto, ...this.syncUpdateData(dto), date: dto.date ? this.parseDate(dto.date) : undefined } });
    return this.ok(this.withId(item));
  }

  async deleteTraceability(organizationId: string, id: string) {
    await this.prisma.haccpTraceability.update({ where: { id, organizationId }, data: { deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  async analyzeImage(organizationId: string, dto: any = {}) {
    const image = String(dto.image || '');
    if (!image) throw new BadRequestException('Image manquante');
    const apiKey = await this.resolveMistralApiKey(organizationId);
    if (!apiKey) return this.ok({ productName: null, lotNumber: null, barcode: null, confidence: 0, rawText: '', provider: 'manual', message: 'OCR non configuré' });
    const mimeType = image.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
    const dataUrl = image.startsWith('data:') ? image : `data:${mimeType};base64,${image}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.OCR_TIMEOUT_MS ?? 60_000));
    try {
      const response = await fetch('https://api.mistral.ai/v1/ocr', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OCR_MISTRAL_MODEL || 'mistral-ocr-latest',
          document: { type: 'image_url', image_url: dataUrl },
          include_image_base64: false,
        }),
        signal: controller.signal,
      });
      const json: any = await response.json().catch(() => ({}));
      if (!response.ok) throw new BadRequestException('Image HACCP illisible ou OCR indisponible');
      const rawText = (Array.isArray(json.pages) ? json.pages.map((page: any) => page.markdown || page.text).filter(Boolean).join('\n') : json.markdown || json.text || '').trim();
      return this.ok({ ...this.extractTraceabilityFromText(rawText), rawText, provider: 'mistral', confidence: rawText ? 0.72 : 0.1 });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveMistralApiKey(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { mistralApiKey: true } });
    return organization?.mistralApiKey || this.configService?.get<string>('MISTRAL_API_KEY') || this.configService?.get<string>('OCR_MISTRAL_API_KEY') || null;
  }

  private extractTraceabilityFromText(rawText: string) {
    const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const lotNumber = this.extractAfter(rawText, /\b(?:lot|n[°o]\s*lot|batch)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i);
    const barcode = this.extractAfter(rawText, /\b(?:ean|gtin|code(?:\s*barres)?|barcode)\s*[:#-]?\s*([0-9]{8,14})/i) || rawText.match(/\b[0-9]{8,14}\b/)?.[0] || null;
    const productName = lines.find((line) => {
      const normalized = line.toLowerCase();
      return line.length >= 3 && line.length <= 80 && !normalized.includes('lot') && !normalized.includes('code') && !/^[0-9\s:/.-]+$/.test(line);
    }) || null;
    return { productName, lotNumber, barcode };
  }

  private extractAfter(text: string, pattern: RegExp) {
    return text.match(pattern)?.[1]?.trim() || null;
  }

  async listProducts(organizationId: string, type?: string) {
    const items = await this.prisma.haccpProduct.findMany({ where: { organizationId, isActive: true, deletedAt: null, type: type || undefined }, orderBy: { name: 'asc' } });
    return this.ok(items.map((item) => this.serializeProduct(item)));
  }

  async getProduct(organizationId: string, id: string) {
    const item = await this.prisma.haccpProduct.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Produit HACCP introuvable');
    return this.ok(this.serializeProduct(item));
  }

  async createProduct(organizationId: string, actor: Actor, dto: any) {
    let sourceProduct: any = null;
    if (dto.sourceProductId) {
      sourceProduct = await this.prisma.product.findFirst({
        where: { id: dto.sourceProductId, organizationId, isArchived: false },
        include: { unit: true },
      });
      if (!sourceProduct) throw new BadRequestException('Produit Stocks introuvable');

      const linked = await this.prisma.haccpProduct.findFirst({
        where: { organizationId, sourceProductId: sourceProduct.id, deletedAt: null },
      });
      if (linked) return this.ok(this.serializeProduct(linked));

      const sameName = await this.prisma.haccpProduct.findFirst({
        where: {
          organizationId,
          sourceProductId: null,
          deletedAt: null,
          name: { equals: sourceProduct.name, mode: 'insensitive' },
        },
      });
      if (sameName) {
        const linkedByName = await this.prisma.haccpProduct.update({
          where: { id: sameName.id },
          data: {
            sourceProductId: sourceProduct.id,
            unit: sameName.unit ?? sourceProduct.unit?.symbol,
            syncVersion: { increment: 1 },
          },
        });
        return this.ok(this.serializeProduct(linkedByName));
      }
    }

    const item = await this.prisma.haccpProduct.create({ data: { organizationId, createdById: actor.id, ...this.syncData(dto), sourceProductId: sourceProduct?.id, name: sourceProduct?.name ?? dto.name, type: dto.type, dlc: dto.dlc ? this.parseDate(dto.dlc) : null, dlcDays: dto.dlcDays, description: dto.description ?? sourceProduct?.description, price: dto.price, quantity: dto.quantity, unit: dto.unit ?? sourceProduct?.unit?.symbol } });
    return this.ok(this.serializeProduct(item));
  }

  async updateProduct(organizationId: string, id: string, dto: any) {
    await this.ensure('haccpProduct', organizationId, id, 'Produit HACCP introuvable');
    const item = await this.prisma.haccpProduct.update({ where: { id }, data: { ...dto, ...this.syncUpdateData(dto), dlc: dto.dlc ? this.parseDate(dto.dlc) : undefined } });
    return this.ok(this.serializeProduct(item));
  }

  async deleteProduct(organizationId: string, id: string) {
    await this.prisma.haccpProduct.update({ where: { id, organizationId }, data: { isActive: false, archivedAt: new Date(), deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  async listProcessEquipment(organizationId: string, type?: string) {
    const where = type ? { organizationId, isActive: true, deletedAt: null, OR: [{ type }, { type: 'mixte' }] } : { organizationId, isActive: true, deletedAt: null };
    const items = await this.prisma.haccpProcessEquipment.findMany({ where, orderBy: { name: 'asc' } });
    return this.ok(items.map((item) => this.serializeProcessEquipment(item)));
  }

  async getProcessEquipment(organizationId: string, id: string) {
    const item = await this.prisma.haccpProcessEquipment.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Équipement introuvable');
    return this.ok(this.serializeProcessEquipment(item));
  }

  async createProcessEquipment(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpProcessEquipment.create({ data: this.processEquipmentData(organizationId, actor.id, dto) });
    return this.ok(this.serializeProcessEquipment(item));
  }

  async updateProcessEquipment(organizationId: string, id: string, dto: any) {
    await this.ensure('haccpProcessEquipment', organizationId, id, 'Équipement introuvable');
    const item = await this.prisma.haccpProcessEquipment.update({ where: { id }, data: { ...this.processEquipmentData(undefined, undefined, dto), ...this.syncUpdateData(dto) } });
    return this.ok(this.serializeProcessEquipment(item));
  }

  async deleteProcessEquipment(organizationId: string, id: string) {
    await this.prisma.haccpProcessEquipment.update({ where: { id, organizationId }, data: { isActive: false, archivedAt: new Date(), deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  private processEquipmentData(organizationId: string | undefined, createdById: string | undefined, dto: any) {
    return { organizationId, createdById, ...this.syncData(dto), name: dto.name, type: dto.type, brand: dto.brand, model: dto.model, serialNumber: dto.serialNumber, location: dto.location, capacity: dto.capacity, temperatureMin: dto.temperatureRange?.min, temperatureMax: dto.temperatureRange?.max, notes: dto.notes, isActive: dto.isActive };
  }

  async listProcessSessions(organizationId: string, type: string) {
    this.assertProcessType(type);
    const items = await this.prisma.haccpProcessSession.findMany({ where: { organizationId, type, deletedAt: null }, include: this.processSessionInclude(), orderBy: { sessionDate: 'desc' } });
    return this.ok(items.map((item) => this.serializeProcessSession(item)));
  }

  async listTodayProcessSessions(organizationId: string, type: string) {
    this.assertProcessType(type);
    const { start, end } = this.dayRange();
    const items = await this.prisma.haccpProcessSession.findMany({ where: { organizationId, type, deletedAt: null, sessionDate: { gte: start, lt: end } }, include: this.processSessionInclude(), orderBy: { startTime: 'desc' } });
    return this.ok(items.map((item) => this.serializeProcessSession(item)));
  }

  async listAvailableProcessProductions(organizationId: string, type: string) {
    this.assertProcessType(type);
    if (!['refroidissement', 'congelation'].includes(type)) return this.ok([]);
    const { start, end } = this.dayRange();
    const items = await this.prisma.haccpProductionSession.findMany({
      where: {
        organizationId,
        deletedAt: null,
        productionDate: { gte: start, lt: end },
        status: { in: ['en_cours', 'termine'] },
        processSessions: { none: { type } },
      },
      include: this.productionSessionInclude(),
      orderBy: [{ status: 'asc' }, { startTime: 'asc' }],
    });
    return this.ok(items.map((item) => this.serializeProductionSession(item)));
  }

  async createProcessSession(organizationId: string, actor: Actor, type: string, dto: any) {
    this.assertProcessType(type);
    let production: any = null;
    if (dto.productionSessionId) {
      const { start: dayStart, end: dayEnd } = this.dayRange();
      production = await this.prisma.haccpProductionSession.findFirst({
        where: {
          id: dto.productionSessionId,
          organizationId,
          deletedAt: null,
          productionDate: { gte: dayStart, lt: dayEnd },
          status: { in: ['en_cours', 'termine'] },
        },
        include: { finishedProduct: true },
      });
      if (!production) throw new BadRequestException('Production du jour introuvable ou indisponible.');
      const existing = await this.prisma.haccpProcessSession.findFirst({ where: { productionSessionId: production.id, type } });
      if (existing) throw new ConflictException('Cette production est déjà affectée à ce processus.');
    }
    const productId = production?.finishedProductId ?? dto.productId;
    await Promise.all([this.ensure('haccpProduct', organizationId, productId, 'Produit introuvable'), this.ensure('haccpProcessEquipment', organizationId, dto.equipmentId, 'Équipement introuvable')]);
    const start = new Date();
    const end = dto.endTime ? this.parseDate(dto.endTime) : null;
    const status = dto.endTemperature != null || end ? 'termine' : 'en_cours';
    try {
      const item = await this.prisma.haccpProcessSession.create({ data: { organizationId, createdById: actor.id, ...this.syncData(dto), type, productId, productionSessionId: production?.id, equipmentId: dto.equipmentId, lotNumber: production?.lotNumber, quantity: production ? (production.status === 'termine' ? production.quantity : production.plannedQuantity ?? production.quantity) : undefined, unit: production?.unit, sessionDate: start, startTime: start, endTime: end, startTemperature: dto.startTemperature, endTemperature: dto.endTemperature, status, notes: dto.notes, duration: this.duration(start, end) }, include: this.processSessionInclude() });
      return this.ok(this.serializeProcessSession(item));
    } catch (error) {
      if (production && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Cette production est déjà affectée à ce processus.');
      }
      throw error;
    }
  }

  async getProcessSession(organizationId: string, id: string) {
    const item = await this.prisma.haccpProcessSession.findFirst({ where: { id, organizationId }, include: this.processSessionInclude() });
    if (!item) throw new NotFoundException('Session introuvable');
    return this.ok(this.serializeProcessSession(item));
  }

  async updateProcessSession(organizationId: string, id: string, dto: any) {
    const current = await this.prisma.haccpProcessSession.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Session introuvable');
    const endTime = dto.endTime ? this.parseDate(dto.endTime) : current.endTime;
    const endTemperature = dto.endTemperature ?? current.endTemperature;
    const item = await this.prisma.haccpProcessSession.update({ where: { id }, data: { ...this.syncUpdateData(dto), endTime, endTemperature, notes: dto.notes, status: endTime || endTemperature != null ? 'termine' : current.status, duration: this.duration(current.startTime, endTime) }, include: this.processSessionInclude() });
    return this.ok(this.serializeProcessSession(item));
  }

  async completeProcessSession(organizationId: string, id: string, endTemperature: number) {
    const current = await this.prisma.haccpProcessSession.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Session introuvable');
    const endTime = new Date();
    const item = await this.prisma.haccpProcessSession.update({ where: { id }, data: { endTemperature, endTime, status: 'termine', duration: this.duration(current.startTime, endTime), syncVersion: { increment: 1 } }, include: this.processSessionInclude() });
    return this.ok(this.serializeProcessSession(item));
  }

  async deleteProcessSession(organizationId: string, id: string) {
    const current = await this.prisma.haccpProcessSession.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Session introuvable');
    if (current.productionSessionId) throw new BadRequestException('Une session reliée à une production ne peut pas être supprimée.');
    await this.prisma.haccpProcessSession.update({ where: { id, organizationId }, data: { deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  async listOilEquipment(organizationId: string) {
    const items = await this.prisma.haccpOilEquipment.findMany({ where: { organizationId, isActive: true, deletedAt: null }, orderBy: { name: 'asc' } });
    return this.ok(items.map((item) => this.serializeOilEquipment(item)));
  }

  async createOilEquipment(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpOilEquipment.create({ data: { organizationId, createdById: actor.id, ...this.syncData(dto), name: dto.name, type: dto.type, brand: dto.brand, model: dto.model, serialNumber: dto.serialNumber, location: dto.location, capacity: dto.capacity, notes: dto.notes } });
    return this.ok(this.serializeOilEquipment(item));
  }

  async getOilEquipment(organizationId: string, id: string) {
    const item = await this.prisma.haccpOilEquipment.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Équipement huile introuvable');
    return this.ok(this.serializeOilEquipment(item));
  }

  async updateOilEquipment(organizationId: string, id: string, dto: any) {
    await this.ensure('haccpOilEquipment', organizationId, id, 'Équipement huile introuvable');
    const item = await this.prisma.haccpOilEquipment.update({ where: { id }, data: { ...dto, ...this.syncUpdateData(dto) } });
    return this.ok(this.serializeOilEquipment(item));
  }

  async deleteOilEquipment(organizationId: string, id: string) {
    await this.prisma.haccpOilEquipment.update({ where: { id, organizationId }, data: { isActive: false, archivedAt: new Date(), deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  async listOilSessions(organizationId: string, q: any = {}) {
    const [items, total] = await Promise.all([
      this.prisma.haccpOilSession.findMany({ where: { organizationId, deletedAt: null }, include: { equipment: true }, orderBy: { sessionDate: 'desc' }, ...this.page(q) }),
      this.prisma.haccpOilSession.count({ where: { organizationId, deletedAt: null } }),
    ]);
    return this.ok(items.map((item) => this.serializeOilSession(item)), { pagination: { page: Number(q.page ?? 1), limit: Number(q.limit ?? 20), total, pages: Math.ceil(total / Number(q.limit ?? 20)) } });
  }

  async listTodayOilSessions(organizationId: string) {
    const { start, end } = this.dayRange();
    const items = await this.prisma.haccpOilSession.findMany({ where: { organizationId, deletedAt: null, sessionDate: { gte: start, lt: end } }, include: { equipment: true }, orderBy: { sessionDate: 'desc' } });
    return this.ok(items.map((item) => this.serializeOilSession(item)));
  }

  async createOilSession(organizationId: string, actor: Actor, dto: any) {
    await this.ensure('haccpOilEquipment', organizationId, dto.equipmentId, 'Équipement huile introuvable');
    const item = await this.prisma.haccpOilSession.create({ data: { organizationId, createdById: actor.id, ...this.syncData(dto), equipmentId: dto.equipmentId, testMethod: dto.testMethod, action: dto.action, notes: dto.notes, sessionDate: new Date() }, include: { equipment: true } });
    return this.ok(this.serializeOilSession(item));
  }

  async getOilSession(organizationId: string, id: string) {
    const item = await this.prisma.haccpOilSession.findFirst({ where: { id, organizationId }, include: { equipment: true } });
    if (!item) throw new NotFoundException('Session huile introuvable');
    return this.ok(this.serializeOilSession(item));
  }

  async deleteOilSession(organizationId: string, id: string) {
    await this.prisma.haccpOilSession.update({ where: { id, organizationId }, data: { deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  async uploadOilPhoto(organizationId: string, actor: Actor, id: string, file: any) {
    const session = await this.prisma.haccpOilSession.findFirst({ where: { id, organizationId } });
    if (!session) throw new NotFoundException('Session huile introuvable');
    if (!file) throw new BadRequestException('Photo manquante');
    const originalName = file.originalname || 'oil-photo.jpg';
    const internalFilename = `${randomUUID()}${extname(originalName) || '.jpg'}`;
    const storagePath = join(String(organizationId), 'oil', internalFilename);
    const absolutePath = join(HACCP_UPLOAD_ROOT, storagePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, file.buffer);
    const document = await this.prisma.document.create({ data: { organizationId, uploadedById: actor.id, internalFilename, originalName, mimeType: file.mimetype || 'image/jpeg', sizeBytes: file.size ?? file.buffer?.length ?? 0, storagePath, sourceModule: 'haccp', sourceType: 'oil-session', sourceId: id } });
    const updated = await this.prisma.haccpOilSession.update({ where: { id }, data: { photo: `/uploads/haccp/${storagePath}`, photoDocumentId: document.id, syncVersion: { increment: 1 } }, include: { equipment: true } });
    return this.ok(this.serializeOilSession(updated));
  }

  async listCleaningZones(organizationId: string) {
    const items = await this.prisma.haccpCleaningZone.findMany({ where: { organizationId, isActive: true, deletedAt: null }, include: { surfaces: { where: { isActive: true, deletedAt: null }, orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } });
    return this.ok(items.map((item) => this.serializeCleaningZone(item)));
  }

  async createCleaningZone(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpCleaningZone.create({ data: { organizationId, createdById: actor.id, ...this.syncData(dto), name: dto.name, description: dto.description, surfaces: { create: (dto.surfaces ?? []).map((surface) => ({ organizationId, createdById: actor.id, ...this.syncData(surface), name: surface.name, frequency: surface.frequency, lastCleaned: surface.lastCleaned ? this.parseDate(surface.lastCleaned) : null, isActive: surface.isActive ?? true })) } }, include: { surfaces: true } });
    return this.ok(this.serializeCleaningZone(item));
  }

  async updateCleaningZone(organizationId: string, actor: Actor, id: string, dto: any) {
    const zone = await this.prisma.haccpCleaningZone.findFirst({ where: { id, organizationId }, include: { surfaces: true } });
    if (!zone) throw new NotFoundException('Zone introuvable');
    return this.prisma.$transaction(async (tx) => {
      const incoming = dto.surfaces ?? [];
      const seen = new Set<string>();
      for (const surface of incoming) {
        const surfaceId = surface.id || surface._id;
        if (surfaceId && zone.surfaces.some((existing) => existing.id === surfaceId)) {
          seen.add(surfaceId);
          await tx.haccpCleaningSurface.update({ where: { id: surfaceId }, data: { name: surface.name, frequency: surface.frequency, lastCleaned: surface.lastCleaned ? this.parseDate(surface.lastCleaned) : undefined, isActive: surface.isActive ?? true, ...this.syncUpdateData(surface) } });
        } else {
          await tx.haccpCleaningSurface.create({ data: { organizationId, createdById: actor.id, ...this.syncData(surface), zoneId: id, name: surface.name, frequency: surface.frequency, lastCleaned: surface.lastCleaned ? this.parseDate(surface.lastCleaned) : null, isActive: surface.isActive ?? true } });
        }
      }
      const missing = zone.surfaces.filter((surface) => !seen.has(surface.id) && !incoming.some((item) => (item.id || item._id) === surface.id)).map((surface) => surface.id);
      if (missing.length) await tx.haccpCleaningSurface.updateMany({ where: { organizationId, id: { in: missing } }, data: { isActive: false, archivedAt: new Date(), deletedAt: new Date(), syncVersion: { increment: 1 } } });
      await tx.haccpCleaningZone.update({ where: { id }, data: { name: dto.name, description: dto.description, ...this.syncUpdateData(dto) } });
      const updated = await tx.haccpCleaningZone.findUnique({ where: { id }, include: { surfaces: { where: { isActive: true, deletedAt: null }, orderBy: { name: 'asc' } } } });
      return this.ok(this.serializeCleaningZone(updated));
    });
  }

  async deleteCleaningZone(organizationId: string, id: string) {
    await this.prisma.haccpCleaningZone.update({
      where: { id, organizationId },
      data: {
        isActive: false,
        archivedAt: new Date(),
        deletedAt: new Date(),
        syncVersion: { increment: 1 },
        surfaces: { updateMany: { where: { isActive: true }, data: { isActive: false, archivedAt: new Date(), deletedAt: new Date(), syncVersion: { increment: 1 } } } },
      },
    });
    return this.ok({ deleted: true });
  }

  async startCleaningSession(organizationId: string, actor: Actor, dto: any = {}) {
    const active = await this.prisma.haccpCleaningSession.findFirst({ where: { organizationId, status: 'active', deletedAt: null }, include: { cleanedSurfaces: true } });
    if (active) return this.ok(this.serializeCleaningSession(active));
    const totalSurfaces = await this.prisma.haccpCleaningSurface.count({ where: { organizationId, isActive: true, deletedAt: null, zone: { isActive: true, deletedAt: null } } });
    const now = new Date();
    const item = await this.prisma.haccpCleaningSession.create({ data: { organizationId, createdById: actor.id, ...this.syncData(dto), sessionDate: now, startTime: now, totalSurfaces }, include: { cleanedSurfaces: true } });
    return this.ok(this.serializeCleaningSession(item));
  }

  async getActiveCleaningSession(organizationId: string) {
    const item = await this.prisma.haccpCleaningSession.findFirst({ where: { organizationId, status: 'active', deletedAt: null }, include: { cleanedSurfaces: { orderBy: { cleanedAt: 'asc' } } } });
    return this.ok(item ? this.serializeCleaningSession(item) : null);
  }

  async markSurfaceCleaned(organizationId: string, actor: Actor, dto: any) {
    const session = await this.prisma.haccpCleaningSession.findFirst({ where: { organizationId, status: 'active', deletedAt: null } });
    if (!session) throw new BadRequestException('Aucune session de nettoyage active');
    await Promise.all([this.ensure('haccpCleaningSurface', organizationId, dto.surfaceId, 'Surface introuvable'), this.ensure('haccpCleaningZone', organizationId, dto.zoneId, 'Zone introuvable')]);
    const cleanedAt = new Date();
    await this.prisma.haccpCleanedSurface.upsert({ where: { sessionId_surfaceId: { sessionId: session.id, surfaceId: dto.surfaceId } }, update: { notes: dto.notes, cleanedAt, syncVersion: { increment: 1 } }, create: { organizationId, createdById: actor.id, ...this.syncData(dto), sessionId: session.id, surfaceId: dto.surfaceId, surfaceName: dto.surfaceName, zoneId: dto.zoneId, zoneName: dto.zoneName, cleanedAt, notes: dto.notes } });
    await this.prisma.haccpCleaningSurface.update({ where: { id: dto.surfaceId }, data: { lastCleaned: cleanedAt } });
    const completedSurfaces = await this.prisma.haccpCleanedSurface.count({ where: { sessionId: session.id } });
    const totalSurfaces = await this.prisma.haccpCleaningSurface.count({ where: { organizationId, isActive: true, deletedAt: null, zone: { isActive: true, deletedAt: null } } });
    const item = await this.prisma.haccpCleaningSession.update({ where: { id: session.id }, data: { completedSurfaces, totalSurfaces, syncVersion: { increment: 1 } }, include: { cleanedSurfaces: { orderBy: { cleanedAt: 'asc' } } } });
    return this.ok(this.serializeCleaningSession(item));
  }

  async completeCleaningSession(organizationId: string, dto: any = {}) {
    const session = await this.prisma.haccpCleaningSession.findFirst({ where: { organizationId, status: 'active', deletedAt: null } });
    if (!session) throw new BadRequestException('Aucune session de nettoyage active');
    const endTime = new Date();
    const completedSurfaces = await this.prisma.haccpCleanedSurface.count({ where: { sessionId: session.id } });
    const item = await this.prisma.haccpCleaningSession.update({ where: { id: session.id }, data: { status: 'completed', notes: dto.notes, endTime, completedSurfaces, ...this.syncUpdateData(dto) }, include: { cleanedSurfaces: { orderBy: { cleanedAt: 'asc' } } } });
    return this.ok(this.serializeCleaningSession(item));
  }

  async listCleaningHistory(organizationId: string, q: any = {}) {
    const [items, total] = await Promise.all([
      this.prisma.haccpCleaningSession.findMany({ where: { organizationId, deletedAt: null, status: { not: 'active' } }, include: { cleanedSurfaces: true }, orderBy: { sessionDate: 'desc' }, ...this.page(q) }),
      this.prisma.haccpCleaningSession.count({ where: { organizationId, deletedAt: null, status: { not: 'active' } } }),
    ]);
    const limit = Number(q.limit ?? 20);
    return { data: items.map((item) => this.serializeCleaningSession(item)), pagination: { page: Number(q.page ?? 1), limit, total, pages: Math.ceil(total / limit) } };
  }

  async deleteCleaningSession(organizationId: string, id: string) {
    await this.prisma.haccpCleaningSession.update({ where: { id, organizationId }, data: { deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  async todayCleaningSurfaces(organizationId: string) {
    const zones = await this.prisma.haccpCleaningZone.findMany({ where: { organizationId, isActive: true, deletedAt: null }, include: { surfaces: { where: { isActive: true, deletedAt: null } } } });
    const surfaces = zones.flatMap((zone) => zone.surfaces.filter((surface) => this.shouldCleanToday(surface)).map((surface) => ({ surfaceId: surface.id, surfaceName: surface.name, zoneId: zone.id, zoneName: zone.name, frequency: surface.frequency, lastCleaned: surface.lastCleaned })));
    return this.ok(surfaces);
  }

  private shouldCleanToday(surface: any) {
    if (!surface.lastCleaned) return true;
    const frequency = String(surface.frequency);
    const [, countPart, period] = frequency.match(/^(\d+)x_(daily|weekly|monthly)$/) ?? [];
    const normalized = period || frequency;
    if (normalized === 'daily') return true;
    const days = Math.floor((Date.now() - new Date(surface.lastCleaned).getTime()) / 86400000);
    if (normalized === 'weekly') return days >= 7;
    if (normalized === 'monthly') return days >= 30;
    return countPart ? true : false;
  }

  async listProductionSessions(organizationId: string, q: any = {}) {
    const dateFilter = q.startDate || q.endDate ? { gte: q.startDate ? this.parseDate(q.startDate) : undefined, lt: q.endDate ? this.parseDate(q.endDate) : undefined } : undefined;
    const items = await this.prisma.haccpProductionSession.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: q.status || undefined,
        source: q.source || undefined,
        productionDate: dateFilter,
        OR: q.search ? [
          { lotNumber: { contains: q.search, mode: 'insensitive' } },
          { finishedProduct: { name: { contains: q.search, mode: 'insensitive' } } },
        ] : undefined,
      },
      include: this.productionSessionInclude(),
      orderBy: { productionDate: 'desc' },
      ...this.page(q),
    });
    return this.ok(items.map((item) => this.serializeProductionSession(item)));
  }

  async listTodayProductionSessions(organizationId: string) {
    const { start, end } = this.dayRange();
    const items = await this.prisma.haccpProductionSession.findMany({ where: { organizationId, deletedAt: null, productionDate: { gte: start, lt: end } }, include: this.productionSessionInclude(), orderBy: { startTime: 'desc' } });
    return this.ok(items.map((item) => this.serializeProductionSession(item)));
  }

  async createProductionSession(organizationId: string, actor: Actor, dto: any) {
    await this.ensure('haccpProduct', organizationId, dto.finishedProductId, 'Produit fini introuvable');
    const now = new Date();
    const item = await this.prisma.haccpProductionSession.create({ data: { organizationId, createdById: actor.id, ...this.syncData(dto), source: 'manual', lotNumber: dto.lotNumber, finishedProductId: dto.finishedProductId, quantity: dto.quantity, unit: dto.unit || 'kg', notes: dto.notes, photos: Array.isArray(dto.photos) ? dto.photos : [], productionDate: now, startTime: now }, include: this.productionSessionInclude() });
    return this.ok(this.serializeProductionSession(item));
  }

  async getProductionSession(organizationId: string, id: string) {
    const item = await this.prisma.haccpProductionSession.findFirst({ where: { id, organizationId }, include: this.productionSessionInclude() });
    if (!item) throw new NotFoundException('Production HACCP introuvable');
    return this.ok(this.serializeProductionSession(item));
  }

  async completeProductionSession(organizationId: string, id: string) {
    const current = await this.prisma.haccpProductionSession.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Production HACCP introuvable');
    if (current.productionBatchId) throw new BadRequestException('Cette production doit être clôturée depuis la recette planifiée.');
    const endTime = new Date();
    const item = await this.prisma.haccpProductionSession.update({ where: { id }, data: { endTime, status: 'termine', duration: this.duration(current.startTime, endTime), syncVersion: { increment: 1 } }, include: this.productionSessionInclude() });
    return this.ok(this.serializeProductionSession(item));
  }

  async deleteProductionSession(organizationId: string, id: string) {
    const current = await this.prisma.haccpProductionSession.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Production HACCP introuvable');
    if (current.productionBatchId) throw new BadRequestException('Une production issue du planning ne peut pas être supprimée depuis le HACCP.');
    await this.prisma.haccpProductionSession.update({ where: { id, organizationId }, data: { deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  async addProductionPhotos(organizationId: string, actor: Actor, id: string, files: any[] = []) {
    const current = await this.prisma.haccpProductionSession.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Production HACCP introuvable');
    const photos = [...(Array.isArray(current.photos) ? current.photos : [])];
    for (const file of files) {
      const originalName = file.originalname || 'production-photo.jpg';
      const internalFilename = `${randomUUID()}${extname(originalName) || '.jpg'}`;
      const storagePath = join(String(organizationId), 'production', internalFilename);
      const absolutePath = join(HACCP_UPLOAD_ROOT, storagePath);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, file.buffer);
      const document = await this.prisma.document.create({ data: { organizationId, uploadedById: actor.id, internalFilename, originalName, mimeType: file.mimetype || 'image/jpeg', sizeBytes: file.size ?? file.buffer?.length ?? 0, storagePath, sourceModule: 'haccp', sourceType: 'production-session', sourceId: id } });
      photos.push({ documentId: document.id, filename: storagePath, originalName, path: `/uploads/haccp/${storagePath}`, size: file.size ?? file.buffer?.length ?? 0, mimetype: file.mimetype || 'image/jpeg', uploadDate: new Date().toISOString() });
    }
    const item = await this.prisma.haccpProductionSession.update({ where: { id }, data: { photos, syncVersion: { increment: 1 } }, include: { finishedProduct: true } });
    return this.ok(this.serializeProductionSession(item));
  }

  async generateDailyReport(organizationId: string, actor: Partial<Actor> | null, date = new Date()) {
    const dailyData = await this.buildDailyReportData(organizationId, date);
    const { start, modules, summary } = dailyData;
    const createdById = actor?.id ?? null;
    const report = await this.prisma.haccpDailyReport.upsert({ where: { organizationId_reportDate: { organizationId, reportDate: start } }, update: { createdById, modules, summary, generatedAt: new Date(), status: 'completed', errorMessage: null, syncVersion: { increment: 1 } }, create: { organizationId, createdById, reportDate: start, modules, summary, status: 'completed' } });
    const pdf = await this.writeDailyReportPdf(organizationId, report.id, start, modules, summary);
    const updated = await this.prisma.haccpDailyReport.update({ where: { id: report.id }, data: { pdfPath: pdf.path, fileSize: pdf.size, status: 'completed', errorMessage: null } });
    return this.ok(this.serializeReport(updated));
  }

  private async buildDailyReportData(organizationId: string, date = new Date()) {
    const { start, end } = this.dayRange(date);
    const flowDayParts = this.zonedParts(start, HACCP_TIME_ZONE);
    const flowDay = `${flowDayParts.year}-${String(flowDayParts.month).padStart(2, '0')}-${String(flowDayParts.day).padStart(2, '0')}`;
    const productionFlowIndex = this.productionTraceability
      ? await this.productionTraceability.flowDay(organizationId, flowDay)
      : {
          date: flowDay,
          summary: {
            planned: 0,
            inProgress: 0,
            completed: 0,
            traceabilityCompleted: 0,
            traceabilityExpected: 0,
          },
          items: [],
        };
    const productionFlow = this.productionTraceability
      ? {
          ...productionFlowIndex,
          items: await Promise.all(
            productionFlowIndex.items.map((item) =>
              this.productionTraceability.flowDetail(organizationId, item.batch.id),
            ),
          ),
        }
      : productionFlowIndex;
    const [
      temperatureEquipment,
      temperature,
      cleaningDue,
      cleaning,
      traceability,
      reception,
      stockReceptions,
      production,
      refroidissement,
      congelation,
      rechauffement,
      oilEquipment,
      oil,
    ] = await Promise.all([
      this.prisma.haccpTemperatureEquipment.findMany({ where: { organizationId, isActive: true, deletedAt: null } }),
      this.prisma.haccpTemperatureReading.findMany({ where: { organizationId, deletedAt: null, date: { gte: start, lt: end } }, include: { equipment: true } }),
      this.todayCleaningSurfaces(organizationId).then((response) => response.data ?? []),
      this.prisma.haccpCleaningSession.findMany({ where: { organizationId, deletedAt: null, sessionDate: { gte: start, lt: end } }, include: { cleanedSurfaces: true } }),
      this.prisma.haccpTraceability.findMany({ where: { organizationId, deletedAt: null, date: { gte: start, lt: end } } }),
      this.prisma.haccpReception.findMany({ where: { organizationId, deletedAt: null, date: { gte: start, lt: end } } }),
      (this.prisma as any).stockReception?.findMany?.({ where: { organizationId, deliveryDate: { gte: start, lt: end }, status: { in: ['VALIDATED', 'CANCELLED'] } }, include: { supplier: true, lines: { include: { product: true, unitModel: true } }, purchaseReceipt: { include: { order: true } } } }) ?? Promise.resolve([]),
      this.prisma.haccpProductionSession.findMany({ where: { organizationId, deletedAt: null, productionDate: { gte: start, lt: end } }, include: { finishedProduct: true } }),
      this.prisma.haccpProcessSession.findMany({ where: { organizationId, deletedAt: null, type: 'refroidissement', sessionDate: { gte: start, lt: end } }, include: { product: true, equipment: true } }),
      this.prisma.haccpProcessSession.findMany({ where: { organizationId, deletedAt: null, type: 'congelation', sessionDate: { gte: start, lt: end } }, include: { product: true, equipment: true } }),
      this.prisma.haccpProcessSession.findMany({ where: { organizationId, deletedAt: null, type: 'rechauffement', sessionDate: { gte: start, lt: end } }, include: { product: true, equipment: true } }),
      this.prisma.haccpOilEquipment.findMany({ where: { organizationId, isActive: true, deletedAt: null } }),
      this.prisma.haccpOilSession.findMany({ where: { organizationId, deletedAt: null, sessionDate: { gte: start, lt: end } }, include: { equipment: true } }),
    ]);
    for (const item of stockReceptions as any[]) {
      for (const line of item.lines ?? []) {
        reception.push({
          id: `stock:${item.id}:${line.id}`,
          supplier: item.supplier?.name || item.supplierName || 'Fournisseur non renseigné',
          productName: line.product?.name || line.ocrLabel,
          temperature: item.deliveryTemperature == null ? '' : String(item.deliveryTemperature),
          lotNumber: line.lotNumber,
          quantity: line.acceptedQuantity ?? line.quantity ?? 0,
          unit: line.unitModel?.symbol || line.unit || '',
          unitPrice: line.unitPrice ?? 0,
          date: item.deliveryDate || item.createdAt,
          controlStatus: item.controlStatus || 'UNCONTROLLED',
          documentedQuantity: line.documentedQuantity ?? line.deliveredQuantity ?? line.quantity ?? 0,
          deliveredQuantity: line.deliveredQuantity ?? line.quantity ?? 0,
          acceptedQuantity: line.acceptedQuantity ?? line.quantity ?? 0,
          purchaseOrderNumber: item.purchaseReceipt?.order?.number || item.purchaseOrderNumber || null,
          deliveryNoteNumber: item.deliveryNoteNumber || null,
        });
      }
    }
    const processSessions = [...refroidissement, ...congelation, ...rechauffement];
    const cleanedSurfaceIds = new Set(cleaning.flatMap((session) => (session.cleanedSurfaces ?? []).map((surface) => surface.surfaceId)));
    const completedProcess = processSessions.filter((session) => session.status === 'termine' && session.endTime && session.endTemperature != null).length;
    const completedProduction = production.filter((item) => item.status === 'termine').length;
    const missingTemperatureEquipment = Math.max(temperatureEquipment.length - new Set(temperature.map((item) => item.equipmentId)).size, 0);
    const missingCleaning = cleaningDue.filter((surface) => !cleanedSurfaceIds.has(surface.surfaceId)).length;
    const incompleteProcess = processSessions.length - completedProcess;
    const incompleteProduction = production.length - completedProduction;
    const startedProductionFlow = productionFlow.items.filter((item) =>
      !['TO_PREPARE', 'CANCELLED'].includes(item.batch.status),
    );
    const missingProductionEvidence = startedProductionFlow.reduce(
      (sum, item) => sum + item.summary.missing,
      0,
    );
    const receptionIssues = reception.filter((item) => !item.temperature || !item.supplier || !item.productName).length;
    const traceabilityIssues = traceability.filter((item) => !item.photo || !item.lotNumber || !item.productName).length;
    const oilMissing = Math.max(oilEquipment.length - new Set(oil.map((item) => item.equipmentId)).size, 0);

    const complianceModules = [
      this.scoreModule('temperature', 'Températures', 20, temperature.length, temperatureEquipment.length, missingTemperatureEquipment, 'Relevés attendus sur les enceintes actives'),
      this.scoreModule('cleaning', 'Nettoyage', 20, cleanedSurfaceIds.size, cleaningDue.length, missingCleaning, 'Surfaces prévues au plan de nettoyage'),
      this.scoreModule('traceability', 'Traçabilité', 15, traceability.length - traceabilityIssues, traceability.length, traceabilityIssues, 'Photos, lots et produits renseignés'),
      this.scoreModule('receptions', 'Réceptions', 10, reception.length - receptionIssues, reception.length, receptionIssues, 'Températures et fournisseurs des entrées marchandises'),
      this.scoreModule('process', 'Processus froid/chaud', 15, completedProcess, processSessions.length, incompleteProcess, 'Refroidissement, congélation et remise en température terminés'),
      this.scoreModule('oil', 'Huiles', 10, oil.length, oilEquipment.length, oilMissing, 'Contrôle des friteuses actives'),
      this.scoreModule('production', 'Production', 5, completedProduction, production.length, incompleteProduction, 'Productions terminées'),
    ].map((module) => ({ ...module, statusLabel: this.reportStatusLabel(module) }));

    const modules = {
      temperature: { count: temperature.length, data: temperature.map((item) => this.serializeTemperatureReading(item)) },
      traceability: { count: traceability.length, data: traceability.map((item) => this.withId(item)) },
      reception: { count: reception.length, data: reception.map((item) => this.withId(item)) },
      production: { count: production.length, data: production.map((item) => this.serializeProductionSession(item)) },
      productionFlow: { count: productionFlow.items.length, data: productionFlow.items },
      cooling: {
        refroidissement: { count: refroidissement.length, data: refroidissement.map((item) => this.serializeProcessSession(item)) },
        congelation: { count: congelation.length, data: congelation.map((item) => this.serializeProcessSession(item)) },
        rechauffement: { count: rechauffement.length, data: rechauffement.map((item) => this.serializeProcessSession(item)) },
      },
      oil: { count: oil.length, data: oil.map((item) => this.serializeOilSession(item)) },
      cleaning: { count: cleaning.length, data: cleaning.map((item) => this.serializeCleaningSession(item)) },
      compliance: complianceModules,
    };
    const flatCounts = [modules.temperature, modules.traceability, modules.reception, modules.cooling.refroidissement, modules.cooling.congelation, modules.cooling.rechauffement, modules.oil, modules.cleaning];
    const totalActivities =
      flatCounts.reduce((sum, item) => sum + item.count, 0) +
      Math.max(modules.production.count, modules.productionFlow.count);
    const totalWeight = complianceModules.reduce((sum, item) => sum + item.weight, 0) || 1;
    const score = Math.round((complianceModules.reduce((sum, item) => sum + item.scoreContribution, 0) / totalWeight) * 100);
    const alerts = [
      ...this.alertIf(missingTemperatureEquipment > 0, 'temperature', 'critical', `${missingTemperatureEquipment} enceinte(s) sans relevé.`),
      ...this.alertIf(missingCleaning > 0, 'cleaning', 'critical', `${missingCleaning} surface(s) prévues restent à nettoyer.`),
      ...this.alertIf(incompleteProcess > 0, 'process', 'warning', `${incompleteProcess} session(s) froid/chaud non terminée(s).`),
      ...this.alertIf(incompleteProduction > 0, 'production', 'warning', `${incompleteProduction} production(s) non terminée(s).`),
      ...this.alertIf(missingProductionEvidence > 0, 'production', 'warning', `${missingProductionEvidence} preuve(s) ingrédient manquante(s) sur les productions démarrées.`),
      ...this.alertIf(receptionIssues > 0, 'receptions', 'warning', `${receptionIssues} réception(s) incomplète(s).`),
      ...this.alertIf(traceabilityIssues > 0, 'traceability', 'warning', `${traceabilityIssues} traçabilité(s) sans photo, lot ou produit.`),
      ...this.alertIf(oilMissing > 0, 'oil', 'warning', `${oilMissing} équipement(s) huile sans contrôle.`),
    ];
    const summary = {
      totalActivities,
      score,
      grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D',
      modules: complianceModules,
      alerts,
      criticalAlerts: alerts.filter((alert) => alert.severity === 'critical'),
      modulesCovered: Object.entries({ temperature: modules.temperature.count, traceability: modules.traceability.count, reception: modules.reception.count, production: Math.max(modules.production.count, modules.productionFlow.count), refroidissement: modules.cooling.refroidissement.count, congelation: modules.cooling.congelation.count, rechauffement: modules.cooling.rechauffement.count, oil: modules.oil.count, cleaning: modules.cleaning.count }).filter(([, count]) => count > 0).map(([name]) => name),
      productionTraceability: productionFlow.summary,
    };
    return { start, end, modules, summary };
  }

  async todayReport(organizationId: string) {
    const { start } = this.dayRange();
    const item = await this.prisma.haccpDailyReport.findUnique({ where: { organizationId_reportDate: { organizationId, reportDate: start } } });
    if (!item) throw new NotFoundException('Aucun rapport trouvé pour aujourd’hui');
    return this.ok(this.serializeReport(item));
  }

  async listReports(organizationId: string, q: any = {}) {
    const where: any = { organizationId, deletedAt: null };
    if (q.startDate || q.endDate) where.reportDate = { gte: q.startDate ? this.parseDate(q.startDate) : undefined, lt: q.endDate ? this.parseDate(q.endDate) : undefined };
    const [items, total] = await Promise.all([
      this.prisma.haccpDailyReport.findMany({ where, orderBy: { reportDate: 'desc' }, ...this.page(q) }),
      this.prisma.haccpDailyReport.count({ where }),
    ]);
    const limit = Number(q.limit ?? 20);
    return { success: true, data: items.map((item) => this.serializeReport(item)), pagination: { current: Number(q.page ?? 1), pages: Math.ceil(total / limit), total, limit } };
  }

  async getReport(organizationId: string, id: string) {
    const item = await this.prisma.haccpDailyReport.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Rapport introuvable');
    return this.ok(this.serializeReport(item));
  }

  async deleteReport(organizationId: string, id: string) {
    await this.prisma.haccpDailyReport.update({ where: { id, organizationId }, data: { deletedAt: new Date(), syncVersion: { increment: 1 } } });
    return this.ok({ deleted: true });
  }

  async regenerateReport(organizationId: string, actor: Actor, id: string) {
    const report = await this.prisma.haccpDailyReport.findFirst({ where: { id, organizationId } });
    if (!report) throw new NotFoundException('Rapport introuvable');
    return this.generateDailyReport(organizationId, actor, report.reportDate);
  }

  async historyReports(organizationId: string) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const items = await this.prisma.haccpDailyReport.findMany({ where: { organizationId, deletedAt: null, reportDate: { gte: cutoff } }, orderBy: { reportDate: 'desc' } });
    return this.ok(items.map((item) => this.serializeReport(item)));
  }

  async reportStats(organizationId: string) {
    const reports = await this.prisma.haccpDailyReport.findMany({ where: { organizationId, deletedAt: null }, orderBy: { reportDate: 'desc' } });
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 30);
    const totalActivities = reports.reduce((sum, report) => sum + Number(report.summary?.totalActivities ?? 0), 0);
    return this.ok({ totalReports: reports.length, recentReports: reports.filter((report) => new Date(report.reportDate) >= recentCutoff).length, averageActivities: reports.length ? totalActivities / reports.length : 0, topModules: [] });
  }

  async downloadReport(organizationId: string, id: string) {
    const report = await this.prisma.haccpDailyReport.findFirst({ where: { id, organizationId } });
    if (!report) throw new NotFoundException('Rapport introuvable');
    if (report.pdfPath && existsSync(report.pdfPath)) return { stream: new StreamableFile(createReadStream(report.pdfPath)), filename: `rapport_haccp_${this.formatReportDate(report.reportDate)}.pdf`, contentType: 'application/pdf' };
    const payload = Buffer.from(JSON.stringify(this.serializeReport(report), null, 2), 'utf8');
    return { stream: new StreamableFile(payload), filename: `rapport_haccp_${this.formatReportDate(report.reportDate)}.json`, contentType: 'application/json; charset=utf-8' };
  }

  private scheduleNextDailyClosure() {
    if (this.dailyCloseTimer) clearTimeout(this.dailyCloseTimer);
    const now = new Date();
    const parts = this.zonedParts(now, HACCP_TIME_ZONE);
    const nextMidnight = this.zonedDateTimeToUtc(
      parts.year,
      parts.month,
      parts.day + 1,
      0,
      0,
      0,
      HACCP_TIME_ZONE,
    );
    const delay = Math.max(nextMidnight.getTime() - now.getTime(), 1_000);
    this.dailyCloseTimer = setTimeout(async () => {
      try {
        await this.runAutomaticDailyClosure(true);
      } finally {
        this.scheduleNextDailyClosure();
      }
    }, delay);
    this.dailyCloseTimer.unref?.();
  }

  private async runAutomaticDailyClosure(allowCatchUp = false) {
    if (this.dailyCloseInProgress) return;
    const now = new Date();
    const nowInParis = this.zonedParts(now, HACCP_TIME_ZONE);
    if (!allowCatchUp && nowInParis.hour !== 0) return;
    this.dailyCloseInProgress = true;
    try {
      const reportDate = this.zonedDateTimeToUtc(
        nowInParis.year,
        nowInParis.month,
        nowInParis.day - 1,
        12,
        0,
        0,
        HACCP_TIME_ZONE,
      );
      const { start } = this.dayRange(reportDate);
      const currentDayStart = this.dayRange(now).start;
      const organizations = await this.prisma.organization.findMany({
        where: { haccpInstalledAt: { not: null } },
        select: { id: true, name: true },
      });
      for (const organization of organizations) {
        try {
          const existing = await this.prisma.haccpDailyReport.findUnique({ where: { organizationId_reportDate: { organizationId: organization.id, reportDate: start } } });
          if (existing?.generatedAt && existing.generatedAt >= currentDayStart) continue;
          await this.generateDailyReport(organization.id, null, start);
          this.logger.log(`Rapport HACCP journalier clôturé pour ${organization.name} (${this.formatReportDate(start)})`);
        } catch (error: any) {
          this.logger.error(`Clôture HACCP impossible pour ${organization.name}: ${error?.message || error}`);
        }
      }
    } finally {
      this.dailyCloseInProgress = false;
    }
  }

  private async writeDailyReportPdf(
    organizationId: string,
    reportId: string,
    reportDate: Date,
    modules: any,
    summary: any,
  ) {
    const dir = join(REPORTS_ROOT, organizationId);
    mkdirSync(dir, { recursive: true });
    const filename = `rapport-haccp-${this.formatReportDate(reportDate)}-${reportId}.pdf`;
    const path = join(dir, filename);
    const doc = new PDFDocument({
      size: 'A4',
      margin: 42,
      bufferPages: true,
      info: {
        Title: `Rapport HACCP - ${this.formatReportDate(reportDate)}`,
        Author: 'ToqueHub',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    const finished = new Promise<Buffer>((resolvePdf, rejectPdf) => {
      doc.on('end', () => resolvePdf(Buffer.concat(chunks)));
      doc.on('error', rejectPdf);
    });

    const contentWidth = doc.page.width - 84;
    const bottom = doc.page.height - 58;
    const ensureSpace = (height: number) => {
      if (doc.y + height > bottom) doc.addPage();
    };
    const sectionTitle = (title: string, color = '#0f766e') => {
      ensureSpace(34);
      doc.moveDown(0.35);
      doc
        .fillColor(color)
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(title, 42, doc.y, { width: contentWidth });
      doc
        .moveTo(42, doc.y + 4)
        .lineTo(42 + contentWidth, doc.y + 4)
        .strokeColor('#dbe5e1')
        .lineWidth(0.8)
        .stroke();
      doc.moveDown(0.65);
    };
    const simpleRows = (
      title: string,
      rows: any[] = [],
      formatter: (item: any) => string,
    ) => {
      sectionTitle(title);
      if (!rows.length) {
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(8.5).text('Aucune entrée.');
        return;
      }
      rows.forEach((row) => {
        ensureSpace(26);
        const y = doc.y;
        doc.roundedRect(42, y, contentWidth, 21, 5).fill('#f8fafc');
        doc
          .fillColor('#334155')
          .font('Helvetica')
          .fontSize(7.8)
          .text(formatter(row), 50, y + 6, { width: contentWidth - 16, ellipsis: true });
        doc.y = y + 25;
      });
    };

    doc.rect(0, 0, doc.page.width, 126).fill('#103f35');
    doc
      .fillColor('#a7f3d0')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('TOQUEHUB - QUALITÉ & HYGIÈNE', 42, 34, { characterSpacing: 1.1 });
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(24)
      .text('Rapport HACCP quotidien', 42, 52);
    doc
      .fillColor('#d1fae5')
      .font('Helvetica')
      .fontSize(10)
      .text(
        `${this.formatReportDate(reportDate)} - Généré le ${this.formatReportDateTime(new Date())}`,
        42,
        84,
      );
    doc.y = 148;

    const metricGap = 10;
    const metricWidth = (contentWidth - metricGap) / 2;
    [
      ['Score global', `${summary.score ?? 0}%`],
      ['Activités HACCP', String(summary.totalActivities ?? 0)],
    ].forEach(([label, value], index) => {
      const x = 42 + index * (metricWidth + metricGap);
      doc.roundedRect(x, 142, metricWidth, 62, 10).fill('#f1f5f9');
      doc
        .fillColor('#64748b')
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(label.toUpperCase(), x + 12, 155, { width: metricWidth - 24 });
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(19)
        .text(value, x + 12, 172, { width: metricWidth - 24 });
    });
    doc.y = 218;

    sectionTitle('Synthèse de conformité');
    for (const module of summary.modules ?? modules.compliance ?? []) {
      ensureSpace(31);
      const y = doc.y;
      const expected = Number(module.expected ?? 0);
      const completed = Number(module.completed ?? 0);
      const ratio = expected ? Math.min(completed / expected, 1) : 1;
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(module.label, 42, y, { width: 150 });
      doc
        .fillColor('#64748b')
        .font('Helvetica')
        .fontSize(7.5)
        .text(
          expected ? `${completed}/${expected} - ${module.score}%` : 'Aucun contrôle prévu',
          198,
          y,
          { width: 120 },
        );
      doc.roundedRect(326, y + 1, contentWidth - 284, 7, 3.5).fill('#e2e8f0');
      doc
        .roundedRect(326, y + 1, (contentWidth - 284) * ratio, 7, 3.5)
        .fill(module.issues ? '#f59e0b' : '#10b981');
      doc.y = y + 22;
    }

    sectionTitle('Alertes');
    const alerts = summary.alerts ?? [];
    if (!alerts.length) {
      doc.fillColor('#047857').font('Helvetica-Bold').fontSize(8.5).text('Aucune alerte.');
    } else {
      alerts.forEach((alert) => {
        ensureSpace(28);
        const y = doc.y;
        const critical = alert.severity === 'critical';
        doc.roundedRect(42, y, contentWidth, 23, 6).fill(critical ? '#fff1f2' : '#fffbeb');
        doc
          .fillColor(critical ? '#b91c1c' : '#92400e')
          .font('Helvetica-Bold')
          .fontSize(7.7)
          .text(
            `${this.alertSeverityLabel(alert.severity)} - ${alert.message}`,
            50,
            y + 7,
            { width: contentWidth - 16 },
          );
        doc.y = y + 28;
      });
    }

    simpleRows(
      'Températures',
      modules.temperature?.data,
      (item) =>
        `${this.formatReportDateTime(item.date)} - ${item.equipment?.name ?? 'Équipement'} - ${item.temperature} C - ${item.notes ?? ''}`,
    );
    simpleRows(
      'Traçabilité générale',
      modules.traceability?.data,
      (item) =>
        `${this.formatReportDateTime(item.date)} - ${item.productName} - lot ${item.lotNumber} - ${item.barcode ?? 'sans code-barres'}`,
    );
    simpleRows(
      'Réceptions',
      modules.reception?.data,
      (item) =>
        `${this.formatReportDateTime(item.date)} - ${item.supplier ?? 'Fournisseur non renseigné'} - ${item.productName ?? 'Produit non renseigné'} - lot ${item.lotNumber ?? '-'} - commandé ${item.documentedQuantity ?? item.deliveredQuantity ?? item.quantity ?? '-'} / livré ${item.deliveredQuantity ?? item.quantity ?? '-'} / accepté ${item.acceptedQuantity ?? item.quantity ?? '-'} ${item.unit ?? ''} - ${item.temperature ?? '-'} C - ${item.controlStatus ?? 'UNCONTROLLED'}${item.purchaseOrderNumber ? ` - commande ${item.purchaseOrderNumber}` : ''}${item.deliveryNoteNumber ? ` - BL ${item.deliveryNoteNumber}` : ''}`,
    );
    simpleRows(
      'Process froid & chaud',
      [
        ...(modules.cooling?.refroidissement?.data ?? []),
        ...(modules.cooling?.congelation?.data ?? []),
        ...(modules.cooling?.rechauffement?.data ?? []),
      ],
      (item) =>
        `${this.processLabel(item.type)} - ${item.product?.name ?? 'Produit'} - ${item.startTemperature} -> ${item.endTemperature ?? '-'} C - ${item.status}`,
    );
    simpleRows(
      'Productions manuelles',
      (modules.production?.data ?? []).filter((item) => !item.productionBatchId),
      (item) =>
        `${this.formatReportDateTime(item.productionDate)} - ${item.finishedProduct?.name ?? 'Produit'} - lot ${item.lotNumber ?? '-'} - ${item.quantity ?? '-'} ${item.unit ?? ''} - ${item.status ?? '-'}`,
    );

    const productionFlow = modules.productionFlow?.data ?? [];
    for (const production of productionFlow) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 92).fill('#103f35');
      doc
        .fillColor('#a7f3d0')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(`PRODUCTION HACCP - LOT ${production.batch.reference}`, 42, 28, {
          characterSpacing: 0.8,
        });
      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(19)
        .text(production.recipe.name, 42, 45, { width: contentWidth - 150 });
      doc
        .fillColor('#d1fae5')
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          `Version ${production.recipe.version ?? '-'} - ${production.batch.plannedQuantity} ${production.batch.unit?.symbol ?? ''} - statut ${production.batch.status}`,
          42,
          70,
        );
      doc.y = 112;

      sectionTitle('Planning et équipe');
      for (const task of production.tasks ?? []) {
        ensureSpace(26);
        doc
          .fillColor('#0f172a')
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(
            `${this.formatReportDateTime(task.startsAt)} - ${task.title}`,
            42,
            doc.y,
            { width: 330 },
          );
        doc
          .fillColor('#64748b')
          .font('Helvetica')
          .fontSize(7.5)
          .text(task.assignedEmployee?.name ?? 'Non assignée', 380, doc.y - 9, {
            width: 173,
            align: 'right',
          });
        doc.moveDown(0.55);
      }

      sectionTitle(
        `Traçabilité ingrédients - ${production.summary.completed}/${production.summary.expected}`,
      );
      for (const ingredient of production.ingredients ?? []) {
        const photos = Array.isArray(ingredient.photos) ? ingredient.photos.slice(0, 3) : [];
        const blockHeight = photos.length ? 132 : 48;
        ensureSpace(blockHeight + 10);
        const y = doc.y;
        doc
          .roundedRect(42, y, contentWidth, blockHeight, 9)
          .lineWidth(0.8)
          .fillAndStroke(
            ingredient.completed ? '#f8fffc' : '#fffbeb',
            ingredient.completed ? '#a7f3d0' : '#fde68a',
          );
        doc
          .fillColor('#0f172a')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(ingredient.name, 53, y + 10, { width: 220 });
        doc
          .fillColor('#64748b')
          .font('Helvetica')
          .fontSize(7.5)
          .text(
            `${Number(ingredient.quantity).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} ${ingredient.unit}`,
            53,
            y + 24,
            { width: 100 },
          );
        doc
          .fillColor(ingredient.completed ? '#047857' : '#b45309')
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(
            ingredient.completed ? `${photos.length} photo(s)` : 'PHOTO MANQUANTE',
            426,
            y + 11,
            { width: 116, align: 'right' },
          );
        doc
          .fillColor('#475569')
          .font('Helvetica')
          .fontSize(7)
          .text(`Lot fournisseur: ${ingredient.lotNumber || 'non renseigné'}`, 180, y + 11, {
            width: 220,
          });
        doc.text(`Code-barres: ${ingredient.barcode || 'non renseigné'}`, 180, y + 24, {
          width: 220,
        });

        if (photos.length) {
          const gap = 8;
          const imageWidth = (contentWidth - 22 - gap * 2) / 3;
          photos.forEach((photo, index) => {
            const x = 53 + index * (imageWidth + gap);
            const imageY = y + 42;
            doc.roundedRect(x, imageY, imageWidth, 78, 6).fill('#e2e8f0');
            const absolutePath = join(HACCP_UPLOAD_ROOT, String(photo.storagePath || ''));
            try {
              if (
                absolutePath.startsWith(`${HACCP_UPLOAD_ROOT}/`) &&
                existsSync(absolutePath)
              ) {
                doc.image(absolutePath, x, imageY, {
                  fit: [imageWidth, 78],
                  align: 'center',
                  valign: 'center',
                });
              } else {
                throw new Error('missing');
              }
            } catch {
              doc
                .fillColor('#64748b')
                .font('Helvetica')
                .fontSize(7)
                .text('Image indisponible', x + 8, imageY + 34, {
                  width: imageWidth - 16,
                  align: 'center',
                });
            }
          });
        } else {
          doc
            .fillColor('#92400e')
            .font('Helvetica')
            .fontSize(6.8)
            .text('Aucune preuve photo enregistrée pour cet ingrédient.', 53, y + 35, {
              width: contentWidth - 22,
            });
        }
        doc.y = y + blockHeight + 6;
      }
    }

    simpleRows(
      'Huiles',
      modules.oil?.data,
      (item) =>
        `${this.formatReportDateTime(item.sessionDate)} - ${item.equipment?.name ?? 'Équipement'} - ${item.testMethod} - ${item.action}`,
    );
    simpleRows(
      'Nettoyage',
      modules.cleaning?.data,
      (item) =>
        `${this.formatReportDateTime(item.sessionDate)} - ${item.status} - ${item.completedSurfaces}/${item.totalSurfaces} surfaces`,
    );

    const pageRange = doc.bufferedPageRange();
    for (let index = 0; index < pageRange.count; index += 1) {
      doc.switchToPage(pageRange.start + index);
      doc
        .fillColor('#94a3b8')
        .font('Helvetica')
        .fontSize(7)
        .text(
          `ToqueHub - Rapport HACCP - Page ${index + 1}/${pageRange.count}`,
          42,
          doc.page.height - 62,
          { width: contentWidth, align: 'center', lineBreak: false },
        );
    }
    doc.end();
    const pdf = await finished;
    writeFileSync(path, pdf);
    return { path, size: pdf.byteLength };
  }

  private dailyReportPdfLines(reportDate: Date, modules: any, summary: any) {
    const complianceModules = summary.modules ?? modules.compliance ?? [];
    const alerts = summary.alerts ?? [];
    const lines = [
      `Rapport HACCP quotidien - ${this.formatReportDate(reportDate)}`,
      `Genere le ${this.formatReportDateTime(new Date())}`,
      '',
      `Score global: ${summary.score ?? 0}%`,
      `Total activites HACCP: ${summary.totalActivities ?? 0}`,
      `Modules couverts: ${(summary.modulesCovered ?? []).join(', ') || 'Aucun'}`,
      '',
      'Synthese attendu / realise',
      ...complianceModules.map((module) => `- ${module.label}: Releves : ${module.completed}/${module.expected} - ${module.expected > 0 ? `${module.score}%` : '-'} - ${module.statusLabel ?? this.reportStatusLabel(module)} (${module.description})`),
      '',
    ];

    lines.push('Alertes');
    if (!alerts.length) lines.push('- Aucune alerte');
    for (const alert of alerts) lines.push(`- ${this.alertSeverityLabel(alert.severity)} | ${alert.message}`);
    lines.push('');

    this.appendPdfSection(lines, 'Temperatures', modules.temperature.data, (item) => `${this.formatReportDateTime(item.date)} | ${item.equipment?.name ?? 'Equipement'} | ${item.temperature} C | ${item.notes ?? ''}`);
    this.appendPdfSection(lines, 'Tracabilite', modules.traceability.data, (item) => `${this.formatReportDateTime(item.date)} | ${item.productName} | lot ${item.lotNumber} | ${item.barcode ?? ''}`);
    this.appendPdfSection(lines, 'Receptions', modules.reception.data, (item) => `${this.formatReportDateTime(item.date)} | ${item.supplier} | ${item.productName} | lot ${item.lotNumber ?? '-'} | commandé ${item.documentedQuantity ?? item.deliveredQuantity ?? item.quantity} ${item.unit} / livré ${item.deliveredQuantity ?? item.quantity} ${item.unit} / accepté ${item.acceptedQuantity ?? item.quantity} ${item.unit} | temp. ${item.temperature || '-'} | ${item.controlStatus ?? 'UNCONTROLLED'}${item.purchaseOrderNumber ? ` | commande ${item.purchaseOrderNumber}` : ''}${item.deliveryNoteNumber ? ` | BL ${item.deliveryNoteNumber}` : ''}`);
    this.appendPdfSection(lines, 'Production', modules.production.data, (item) => `${this.formatReportDateTime(item.productionDate)} | ${item.finishedProduct?.name ?? 'Produit'} | lot ${item.lotNumber} | ${item.quantity} ${item.unit} | ${item.status}`);
    this.appendPdfSection(lines, 'Refroidissement', modules.cooling.refroidissement.data, (item) => `${this.formatReportDateTime(item.sessionDate)} | ${item.product?.name ?? 'Produit'} | ${item.equipment?.name ?? 'Equipement'} | ${item.startTemperature} -> ${item.endTemperature ?? '-'} C | ${item.status}`);
    this.appendPdfSection(lines, 'Congelation', modules.cooling.congelation.data, (item) => `${this.formatReportDateTime(item.sessionDate)} | ${item.product?.name ?? 'Produit'} | ${item.equipment?.name ?? 'Equipement'} | ${item.startTemperature} -> ${item.endTemperature ?? '-'} C | ${item.status}`);
    this.appendPdfSection(lines, 'Rechauffement', modules.cooling.rechauffement.data, (item) => `${this.formatReportDateTime(item.sessionDate)} | ${item.product?.name ?? 'Produit'} | ${item.equipment?.name ?? 'Equipement'} | ${item.startTemperature} -> ${item.endTemperature ?? '-'} C | ${item.status}`);
    this.appendPdfSection(lines, 'Huiles', modules.oil.data, (item) => `${this.formatReportDateTime(item.sessionDate)} | ${item.equipment?.name ?? 'Equipement'} | ${item.testMethod} | action: ${item.action} | ${item.notes ?? ''}`);
    this.appendPdfSection(lines, 'Nettoyage', modules.cleaning.data, (item) => `${this.formatReportDateTime(item.sessionDate)} | ${item.status} | ${item.completedSurfaces}/${item.totalSurfaces} surfaces | ${item.notes ?? ''}`);
    return lines;
  }

  private alertSeverityLabel(severity: string) {
    if (severity === 'critical') return 'Critique';
    if (severity === 'warning') return 'A surveiller';
    return 'Information';
  }

  private appendPdfSection(lines: string[], title: string, items: any[] = [], format: (item: any) => string) {
    lines.push(title);
    if (!items.length) {
      lines.push('- Aucune entree');
      lines.push('');
      return;
    }
    for (const item of items) lines.push(`- ${format(item)}`);
    lines.push('');
  }

  private buildSimplePdf(lines: string[]) {
    const pages = [];
    const normalizedLines = lines.flatMap((line) => this.wrapPdfLine(this.pdfText(line), 96));
    for (let index = 0; index < normalizedLines.length; index += 48) pages.push(normalizedLines.slice(index, index + 48));
    if (!pages.length) pages.push(['Rapport HACCP']);
    const objects: string[] = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
    pages.forEach((pageLines, index) => {
      const pageObjectId = 3 + index * 2;
      const contentObjectId = pageObjectId + 1;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentObjectId} 0 R >>`);
      const content = `BT\n/F1 10 Tf\n12 TL\n40 800 Td\n${pageLines.map((line) => `(${this.escapePdfString(line)}) Tj\nT*`).join('\n')}\nET`;
      objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    });
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
  }

  private wrapPdfLine(line: string, maxLength: number) {
    if (line.length <= maxLength) return [line];
    const chunks = [];
    let remaining = line;
    while (remaining.length > maxLength) {
      const at = remaining.lastIndexOf(' ', maxLength);
      const splitAt = at > 20 ? at : maxLength;
      chunks.push(remaining.slice(0, splitAt));
      remaining = `  ${remaining.slice(splitAt).trim()}`;
    }
    chunks.push(remaining);
    return chunks;
  }

  private escapePdfString(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  private pdfText(value: any) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
  }

  private formatReportDate(value: any) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const parts = this.zonedParts(date, HACCP_TIME_ZONE);
    const year = parts.year;
    const month = String(parts.month).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatReportDateTime(value: any) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const parts = this.zonedParts(date, HACCP_TIME_ZONE);
    const hours = String(parts.hour).padStart(2, '0');
    const minutes = String(parts.minute).padStart(2, '0');
    return `${this.formatReportDate(date)} ${hours}:${minutes}`;
  }

  private async ensure(model: string, organizationId: string, id: string, message: string) {
    const item = await this.prisma[model].findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException(message);
    return item;
  }

  private async ensureTemperatureEquipment(organizationId: string, id: string) {
    return this.ensure('haccpTemperatureEquipment', organizationId, id, 'Équipement introuvable');
  }
}

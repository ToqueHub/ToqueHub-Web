// @ts-nocheck
import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Actor = { id: string; role: string };

const HACCP_UPLOAD_ROOT = resolve(process.env.HACCP_UPLOAD_DIR || process.env.UPLOAD_DIR || 'uploads', 'haccp');
const PROCESS_TYPES = new Set(['refroidissement', 'congelation', 'rechauffement']);

@Injectable()
export class HaccpService {
  constructor(private readonly prisma: PrismaService) {}

  private page(q: any = {}) {
    const take = Math.min(Number(q.limit ?? q.pageSize ?? 20), 200);
    return { take, skip: ((Number(q.page ?? 1) - 1) * take) };
  }

  private dayRange(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
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
    for (const key of ['price', 'quantity', 'temperature', 'startTemperature', 'endTemperature', 'unitPrice']) {
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
    return this.withId(item);
  }

  private serializeTemperatureReading(item: any) {
    const out = this.withId(item);
    out.equipmentId = item.equipmentId;
    if (item.equipment) out.equipment = { name: item.equipment.name, type: item.equipment.type };
    return out;
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
    out.duration = item.duration ?? this.duration(item.startTime, item.endTime);
    return out;
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
    return out;
  }

  private serializeReport(item: any) {
    return this.withId(item);
  }

  private assertProcessType(type: string) {
    if (!PROCESS_TYPES.has(type)) throw new BadRequestException('Type de session HACCP invalide');
  }

  async listTemperatureEquipment(organizationId: string) {
    return this.ok((await this.prisma.haccpTemperatureEquipment.findMany({ where: { organizationId, isActive: true }, orderBy: { name: 'asc' } })).map((item) => this.serializeTemperatureEquipment(item)));
  }

  async createTemperatureEquipment(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpTemperatureEquipment.create({ data: { organizationId, createdById: actor.id, name: dto.name, type: dto.type } });
    return this.ok(this.serializeTemperatureEquipment(item));
  }

  async deleteTemperatureEquipment(organizationId: string, id: string) {
    await this.prisma.haccpTemperatureEquipment.update({ where: { id, organizationId }, data: { isActive: false, archivedAt: new Date() } });
    return this.ok({ deleted: true });
  }

  async listTemperatureReadings(organizationId: string) {
    const items = await this.prisma.haccpTemperatureReading.findMany({ where: { organizationId }, include: { equipment: true }, orderBy: { date: 'desc' } });
    return this.ok(items.map((item) => this.serializeTemperatureReading(item)));
  }

  async getTemperatureReading(organizationId: string, id: string) {
    const item = await this.prisma.haccpTemperatureReading.findFirst({ where: { id, organizationId }, include: { equipment: true } });
    if (!item) throw new NotFoundException('Relevé introuvable');
    return this.ok(this.serializeTemperatureReading(item));
  }

  async createTemperatureReading(organizationId: string, actor: Actor, dto: any) {
    await this.ensureTemperatureEquipment(organizationId, dto.equipmentId);
    const item = await this.prisma.haccpTemperatureReading.create({ data: { organizationId, createdById: actor.id, equipmentId: dto.equipmentId, temperature: dto.temperature, date: this.parseDate(dto.date), notes: dto.notes }, include: { equipment: true } });
    return this.ok(this.serializeTemperatureReading(item));
  }

  async listReceptions(organizationId: string) {
    const items = await this.prisma.haccpReception.findMany({ where: { organizationId }, orderBy: { date: 'desc' } });
    return this.ok(items.map((item) => this.withId(item)));
  }

  async createReception(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpReception.create({ data: { organizationId, createdById: actor.id, supplier: dto.supplier, productName: dto.productName, productType: dto.productType, temperature: dto.temperature, lotNumber: dto.lotNumber, quantity: dto.quantity ?? 1, unit: dto.unit, unitPrice: dto.unitPrice ?? 0, photo: dto.photo, date: this.parseDate(dto.date) } });
    return this.ok(this.withId(item));
  }

  async getReception(organizationId: string, id: string) {
    const item = await this.prisma.haccpReception.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Réception introuvable');
    return this.ok(this.withId(item));
  }

  async updateReception(organizationId: string, id: string, dto: any) {
    await this.ensure('haccpReception', organizationId, id, 'Réception introuvable');
    const item = await this.prisma.haccpReception.update({ where: { id }, data: { ...dto, quantity: dto.quantity == null ? undefined : dto.quantity, unitPrice: dto.unitPrice == null ? undefined : dto.unitPrice, date: dto.date ? this.parseDate(dto.date) : undefined } });
    return this.ok(this.withId(item));
  }

  async deleteReception(organizationId: string, id: string) {
    await this.prisma.haccpReception.delete({ where: { id, organizationId } });
    return this.ok({ deleted: true });
  }

  async listTraceability(organizationId: string) {
    const items = await this.prisma.haccpTraceability.findMany({ where: { organizationId }, orderBy: { date: 'desc' } });
    return this.ok(items.map((item) => this.withId(item)));
  }

  async createTraceability(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpTraceability.create({ data: { organizationId, createdById: actor.id, photo: dto.photo, productName: dto.productName, lotNumber: dto.lotNumber, barcode: dto.barcode, date: this.parseDate(dto.date) } });
    return this.ok(this.withId(item));
  }

  async getTraceability(organizationId: string, id: string) {
    const item = await this.prisma.haccpTraceability.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Traçabilité introuvable');
    return this.ok(this.withId(item));
  }

  async updateTraceability(organizationId: string, id: string, dto: any) {
    await this.ensure('haccpTraceability', organizationId, id, 'Traçabilité introuvable');
    const item = await this.prisma.haccpTraceability.update({ where: { id }, data: { ...dto, date: dto.date ? this.parseDate(dto.date) : undefined } });
    return this.ok(this.withId(item));
  }

  async deleteTraceability(organizationId: string, id: string) {
    await this.prisma.haccpTraceability.delete({ where: { id, organizationId } });
    return this.ok({ deleted: true });
  }

  analyzeImage() {
    return this.ok({});
  }

  async listProducts(organizationId: string, type?: string) {
    const items = await this.prisma.haccpProduct.findMany({ where: { organizationId, isActive: true, type: type || undefined }, orderBy: { name: 'asc' } });
    return this.ok(items.map((item) => this.serializeProduct(item)));
  }

  async getProduct(organizationId: string, id: string) {
    const item = await this.prisma.haccpProduct.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Produit HACCP introuvable');
    return this.ok(this.serializeProduct(item));
  }

  async createProduct(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpProduct.create({ data: { organizationId, createdById: actor.id, name: dto.name, type: dto.type, dlc: dto.dlc ? this.parseDate(dto.dlc) : null, dlcDays: dto.dlcDays, description: dto.description, price: dto.price, quantity: dto.quantity, unit: dto.unit } });
    return this.ok(this.serializeProduct(item));
  }

  async updateProduct(organizationId: string, id: string, dto: any) {
    await this.ensure('haccpProduct', organizationId, id, 'Produit HACCP introuvable');
    const item = await this.prisma.haccpProduct.update({ where: { id }, data: { ...dto, dlc: dto.dlc ? this.parseDate(dto.dlc) : undefined } });
    return this.ok(this.serializeProduct(item));
  }

  async deleteProduct(organizationId: string, id: string) {
    await this.prisma.haccpProduct.update({ where: { id, organizationId }, data: { isActive: false, archivedAt: new Date() } });
    return this.ok({ deleted: true });
  }

  async listProcessEquipment(organizationId: string, type?: string) {
    const where = type ? { organizationId, isActive: true, OR: [{ type }, { type: 'mixte' }] } : { organizationId, isActive: true };
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
    const item = await this.prisma.haccpProcessEquipment.update({ where: { id }, data: this.processEquipmentData(undefined, undefined, dto) });
    return this.ok(this.serializeProcessEquipment(item));
  }

  async deleteProcessEquipment(organizationId: string, id: string) {
    await this.prisma.haccpProcessEquipment.update({ where: { id, organizationId }, data: { isActive: false, archivedAt: new Date() } });
    return this.ok({ deleted: true });
  }

  private processEquipmentData(organizationId: string | undefined, createdById: string | undefined, dto: any) {
    return { organizationId, createdById, name: dto.name, type: dto.type, brand: dto.brand, model: dto.model, serialNumber: dto.serialNumber, location: dto.location, capacity: dto.capacity, temperatureMin: dto.temperatureRange?.min, temperatureMax: dto.temperatureRange?.max, notes: dto.notes, isActive: dto.isActive };
  }

  async listProcessSessions(organizationId: string, type: string) {
    this.assertProcessType(type);
    const items = await this.prisma.haccpProcessSession.findMany({ where: { organizationId, type }, include: { product: true, equipment: true }, orderBy: { sessionDate: 'desc' } });
    return this.ok(items.map((item) => this.serializeProcessSession(item)));
  }

  async listTodayProcessSessions(organizationId: string, type: string) {
    this.assertProcessType(type);
    const { start, end } = this.dayRange();
    const items = await this.prisma.haccpProcessSession.findMany({ where: { organizationId, type, sessionDate: { gte: start, lt: end } }, include: { product: true, equipment: true }, orderBy: { startTime: 'desc' } });
    return this.ok(items.map((item) => this.serializeProcessSession(item)));
  }

  async createProcessSession(organizationId: string, actor: Actor, type: string, dto: any) {
    this.assertProcessType(type);
    await Promise.all([this.ensure('haccpProduct', organizationId, dto.productId, 'Produit introuvable'), this.ensure('haccpProcessEquipment', organizationId, dto.equipmentId, 'Équipement introuvable')]);
    const start = new Date();
    const end = dto.endTime ? this.parseDate(dto.endTime) : null;
    const status = dto.endTemperature != null || end ? 'termine' : 'en_cours';
    const item = await this.prisma.haccpProcessSession.create({ data: { organizationId, createdById: actor.id, type, productId: dto.productId, equipmentId: dto.equipmentId, sessionDate: start, startTime: start, endTime: end, startTemperature: dto.startTemperature, endTemperature: dto.endTemperature, status, notes: dto.notes, duration: this.duration(start, end) }, include: { product: true, equipment: true } });
    return this.ok(this.serializeProcessSession(item));
  }

  async getProcessSession(organizationId: string, id: string) {
    const item = await this.prisma.haccpProcessSession.findFirst({ where: { id, organizationId }, include: { product: true, equipment: true } });
    if (!item) throw new NotFoundException('Session introuvable');
    return this.ok(this.serializeProcessSession(item));
  }

  async updateProcessSession(organizationId: string, id: string, dto: any) {
    const current = await this.prisma.haccpProcessSession.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Session introuvable');
    const endTime = dto.endTime ? this.parseDate(dto.endTime) : current.endTime;
    const endTemperature = dto.endTemperature ?? current.endTemperature;
    const item = await this.prisma.haccpProcessSession.update({ where: { id }, data: { endTime, endTemperature, notes: dto.notes, status: endTime || endTemperature != null ? 'termine' : current.status, duration: this.duration(current.startTime, endTime) }, include: { product: true, equipment: true } });
    return this.ok(this.serializeProcessSession(item));
  }

  async completeProcessSession(organizationId: string, id: string, endTemperature: number) {
    const current = await this.prisma.haccpProcessSession.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Session introuvable');
    const endTime = new Date();
    const item = await this.prisma.haccpProcessSession.update({ where: { id }, data: { endTemperature, endTime, status: 'termine', duration: this.duration(current.startTime, endTime) }, include: { product: true, equipment: true } });
    return this.ok(this.serializeProcessSession(item));
  }

  async deleteProcessSession(organizationId: string, id: string) {
    await this.prisma.haccpProcessSession.delete({ where: { id, organizationId } });
    return this.ok({ deleted: true });
  }

  async listOilEquipment(organizationId: string) {
    const items = await this.prisma.haccpOilEquipment.findMany({ where: { organizationId, isActive: true }, orderBy: { name: 'asc' } });
    return this.ok(items.map((item) => this.serializeOilEquipment(item)));
  }

  async createOilEquipment(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpOilEquipment.create({ data: { organizationId, createdById: actor.id, name: dto.name, type: dto.type, brand: dto.brand, model: dto.model, serialNumber: dto.serialNumber, location: dto.location, capacity: dto.capacity, notes: dto.notes } });
    return this.ok(this.serializeOilEquipment(item));
  }

  async getOilEquipment(organizationId: string, id: string) {
    const item = await this.prisma.haccpOilEquipment.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Équipement huile introuvable');
    return this.ok(this.serializeOilEquipment(item));
  }

  async updateOilEquipment(organizationId: string, id: string, dto: any) {
    await this.ensure('haccpOilEquipment', organizationId, id, 'Équipement huile introuvable');
    const item = await this.prisma.haccpOilEquipment.update({ where: { id }, data: dto });
    return this.ok(this.serializeOilEquipment(item));
  }

  async deleteOilEquipment(organizationId: string, id: string) {
    await this.prisma.haccpOilEquipment.update({ where: { id, organizationId }, data: { isActive: false, archivedAt: new Date() } });
    return this.ok({ deleted: true });
  }

  async listOilSessions(organizationId: string, q: any = {}) {
    const [items, total] = await Promise.all([
      this.prisma.haccpOilSession.findMany({ where: { organizationId }, include: { equipment: true }, orderBy: { sessionDate: 'desc' }, ...this.page(q) }),
      this.prisma.haccpOilSession.count({ where: { organizationId } }),
    ]);
    return this.ok(items.map((item) => this.serializeOilSession(item)), { pagination: { page: Number(q.page ?? 1), limit: Number(q.limit ?? 20), total, pages: Math.ceil(total / Number(q.limit ?? 20)) } });
  }

  async listTodayOilSessions(organizationId: string) {
    const { start, end } = this.dayRange();
    const items = await this.prisma.haccpOilSession.findMany({ where: { organizationId, sessionDate: { gte: start, lt: end } }, include: { equipment: true }, orderBy: { sessionDate: 'desc' } });
    return this.ok(items.map((item) => this.serializeOilSession(item)));
  }

  async createOilSession(organizationId: string, actor: Actor, dto: any) {
    await this.ensure('haccpOilEquipment', organizationId, dto.equipmentId, 'Équipement huile introuvable');
    const item = await this.prisma.haccpOilSession.create({ data: { organizationId, createdById: actor.id, equipmentId: dto.equipmentId, testMethod: dto.testMethod, action: dto.action, notes: dto.notes, sessionDate: new Date() }, include: { equipment: true } });
    return this.ok(this.serializeOilSession(item));
  }

  async getOilSession(organizationId: string, id: string) {
    const item = await this.prisma.haccpOilSession.findFirst({ where: { id, organizationId }, include: { equipment: true } });
    if (!item) throw new NotFoundException('Session huile introuvable');
    return this.ok(this.serializeOilSession(item));
  }

  async deleteOilSession(organizationId: string, id: string) {
    await this.prisma.haccpOilSession.delete({ where: { id, organizationId } });
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
    const updated = await this.prisma.haccpOilSession.update({ where: { id }, data: { photo: `/uploads/haccp/${storagePath}`, photoDocumentId: document.id }, include: { equipment: true } });
    return this.ok(this.serializeOilSession(updated));
  }

  async listCleaningZones(organizationId: string) {
    const items = await this.prisma.haccpCleaningZone.findMany({ where: { organizationId, isActive: true }, include: { surfaces: { where: { isActive: true }, orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } });
    return this.ok(items.map((item) => this.serializeCleaningZone(item)));
  }

  async createCleaningZone(organizationId: string, actor: Actor, dto: any) {
    const item = await this.prisma.haccpCleaningZone.create({ data: { organizationId, createdById: actor.id, name: dto.name, description: dto.description, surfaces: { create: (dto.surfaces ?? []).map((surface) => ({ organizationId, createdById: actor.id, name: surface.name, frequency: surface.frequency, lastCleaned: surface.lastCleaned ? this.parseDate(surface.lastCleaned) : null, isActive: surface.isActive ?? true })) } }, include: { surfaces: true } });
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
          await tx.haccpCleaningSurface.update({ where: { id: surfaceId }, data: { name: surface.name, frequency: surface.frequency, lastCleaned: surface.lastCleaned ? this.parseDate(surface.lastCleaned) : undefined, isActive: surface.isActive ?? true } });
        } else {
          await tx.haccpCleaningSurface.create({ data: { organizationId, createdById: actor.id, zoneId: id, name: surface.name, frequency: surface.frequency, lastCleaned: surface.lastCleaned ? this.parseDate(surface.lastCleaned) : null, isActive: surface.isActive ?? true } });
        }
      }
      const missing = zone.surfaces.filter((surface) => !seen.has(surface.id) && !incoming.some((item) => (item.id || item._id) === surface.id)).map((surface) => surface.id);
      if (missing.length) await tx.haccpCleaningSurface.updateMany({ where: { organizationId, id: { in: missing } }, data: { isActive: false, archivedAt: new Date() } });
      await tx.haccpCleaningZone.update({ where: { id }, data: { name: dto.name, description: dto.description } });
      const updated = await tx.haccpCleaningZone.findUnique({ where: { id }, include: { surfaces: { where: { isActive: true }, orderBy: { name: 'asc' } } } });
      return this.ok(this.serializeCleaningZone(updated));
    });
  }

  async deleteCleaningZone(organizationId: string, id: string) {
    await this.prisma.haccpCleaningZone.update({
      where: { id, organizationId },
      data: {
        isActive: false,
        archivedAt: new Date(),
        surfaces: { updateMany: { where: { isActive: true }, data: { isActive: false, archivedAt: new Date() } } },
      },
    });
    return this.ok({ deleted: true });
  }

  async startCleaningSession(organizationId: string, actor: Actor) {
    const active = await this.prisma.haccpCleaningSession.findFirst({ where: { organizationId, status: 'active' }, include: { cleanedSurfaces: true } });
    if (active) return this.ok(this.serializeCleaningSession(active));
    const totalSurfaces = await this.prisma.haccpCleaningSurface.count({ where: { organizationId, isActive: true, zone: { isActive: true } } });
    const now = new Date();
    const item = await this.prisma.haccpCleaningSession.create({ data: { organizationId, createdById: actor.id, sessionDate: now, startTime: now, totalSurfaces }, include: { cleanedSurfaces: true } });
    return this.ok(this.serializeCleaningSession(item));
  }

  async getActiveCleaningSession(organizationId: string) {
    const item = await this.prisma.haccpCleaningSession.findFirst({ where: { organizationId, status: 'active' }, include: { cleanedSurfaces: { orderBy: { cleanedAt: 'asc' } } } });
    return this.ok(item ? this.serializeCleaningSession(item) : null);
  }

  async markSurfaceCleaned(organizationId: string, actor: Actor, dto: any) {
    const session = await this.prisma.haccpCleaningSession.findFirst({ where: { organizationId, status: 'active' } });
    if (!session) throw new BadRequestException('Aucune session de nettoyage active');
    await Promise.all([this.ensure('haccpCleaningSurface', organizationId, dto.surfaceId, 'Surface introuvable'), this.ensure('haccpCleaningZone', organizationId, dto.zoneId, 'Zone introuvable')]);
    const cleanedAt = new Date();
    await this.prisma.haccpCleanedSurface.upsert({ where: { sessionId_surfaceId: { sessionId: session.id, surfaceId: dto.surfaceId } }, update: { notes: dto.notes, cleanedAt }, create: { organizationId, createdById: actor.id, sessionId: session.id, surfaceId: dto.surfaceId, surfaceName: dto.surfaceName, zoneId: dto.zoneId, zoneName: dto.zoneName, cleanedAt, notes: dto.notes } });
    await this.prisma.haccpCleaningSurface.update({ where: { id: dto.surfaceId }, data: { lastCleaned: cleanedAt } });
    const completedSurfaces = await this.prisma.haccpCleanedSurface.count({ where: { sessionId: session.id } });
    const totalSurfaces = await this.prisma.haccpCleaningSurface.count({ where: { organizationId, isActive: true, zone: { isActive: true } } });
    const item = await this.prisma.haccpCleaningSession.update({ where: { id: session.id }, data: { completedSurfaces, totalSurfaces }, include: { cleanedSurfaces: { orderBy: { cleanedAt: 'asc' } } } });
    return this.ok(this.serializeCleaningSession(item));
  }

  async completeCleaningSession(organizationId: string, dto: any = {}) {
    const session = await this.prisma.haccpCleaningSession.findFirst({ where: { organizationId, status: 'active' } });
    if (!session) throw new BadRequestException('Aucune session de nettoyage active');
    const endTime = new Date();
    const completedSurfaces = await this.prisma.haccpCleanedSurface.count({ where: { sessionId: session.id } });
    const item = await this.prisma.haccpCleaningSession.update({ where: { id: session.id }, data: { status: 'completed', notes: dto.notes, endTime, completedSurfaces }, include: { cleanedSurfaces: { orderBy: { cleanedAt: 'asc' } } } });
    return this.ok(this.serializeCleaningSession(item));
  }

  async listCleaningHistory(organizationId: string, q: any = {}) {
    const [items, total] = await Promise.all([
      this.prisma.haccpCleaningSession.findMany({ where: { organizationId, status: { not: 'active' } }, include: { cleanedSurfaces: true }, orderBy: { sessionDate: 'desc' }, ...this.page(q) }),
      this.prisma.haccpCleaningSession.count({ where: { organizationId, status: { not: 'active' } } }),
    ]);
    const limit = Number(q.limit ?? 20);
    return { data: items.map((item) => this.serializeCleaningSession(item)), pagination: { page: Number(q.page ?? 1), limit, total, pages: Math.ceil(total / limit) } };
  }

  async deleteCleaningSession(organizationId: string, id: string) {
    await this.prisma.haccpCleaningSession.delete({ where: { id, organizationId } });
    return this.ok({ deleted: true });
  }

  async todayCleaningSurfaces(organizationId: string) {
    const zones = await this.prisma.haccpCleaningZone.findMany({ where: { organizationId, isActive: true }, include: { surfaces: { where: { isActive: true } } } });
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

  async listProductionSessions(organizationId: string) {
    const items = await this.prisma.haccpProductionSession.findMany({ where: { organizationId }, include: { finishedProduct: true }, orderBy: { productionDate: 'desc' } });
    return this.ok(items.map((item) => this.serializeProductionSession(item)));
  }

  async listTodayProductionSessions(organizationId: string) {
    const { start, end } = this.dayRange();
    const items = await this.prisma.haccpProductionSession.findMany({ where: { organizationId, productionDate: { gte: start, lt: end } }, include: { finishedProduct: true }, orderBy: { startTime: 'desc' } });
    return this.ok(items.map((item) => this.serializeProductionSession(item)));
  }

  async createProductionSession(organizationId: string, actor: Actor, dto: any) {
    await this.ensure('haccpProduct', organizationId, dto.finishedProductId, 'Produit fini introuvable');
    const now = new Date();
    const item = await this.prisma.haccpProductionSession.create({ data: { organizationId, createdById: actor.id, lotNumber: dto.lotNumber, finishedProductId: dto.finishedProductId, quantity: dto.quantity, unit: dto.unit || 'kg', notes: dto.notes, photos: Array.isArray(dto.photos) ? dto.photos : [], productionDate: now, startTime: now }, include: { finishedProduct: true } });
    return this.ok(this.serializeProductionSession(item));
  }

  async getProductionSession(organizationId: string, id: string) {
    const item = await this.prisma.haccpProductionSession.findFirst({ where: { id, organizationId }, include: { finishedProduct: true } });
    if (!item) throw new NotFoundException('Production HACCP introuvable');
    return this.ok(this.serializeProductionSession(item));
  }

  async completeProductionSession(organizationId: string, id: string) {
    const current = await this.prisma.haccpProductionSession.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Production HACCP introuvable');
    const endTime = new Date();
    const item = await this.prisma.haccpProductionSession.update({ where: { id }, data: { endTime, status: 'termine', duration: this.duration(current.startTime, endTime) }, include: { finishedProduct: true } });
    return this.ok(this.serializeProductionSession(item));
  }

  async deleteProductionSession(organizationId: string, id: string) {
    await this.prisma.haccpProductionSession.delete({ where: { id, organizationId } });
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
    const item = await this.prisma.haccpProductionSession.update({ where: { id }, data: { photos }, include: { finishedProduct: true } });
    return this.ok(this.serializeProductionSession(item));
  }

  async generateDailyReport(organizationId: string, actor: Actor, date = new Date()) {
    const { start, end } = this.dayRange(date);
    const [temperature, traceability, reception, production, refroidissement, congelation, rechauffement, oil, cleaning] = await Promise.all([
      this.prisma.haccpTemperatureReading.findMany({ where: { organizationId, date: { gte: start, lt: end } }, include: { equipment: true } }),
      this.prisma.haccpTraceability.findMany({ where: { organizationId, date: { gte: start, lt: end } } }),
      this.prisma.haccpReception.findMany({ where: { organizationId, date: { gte: start, lt: end } } }),
      this.prisma.haccpProductionSession.findMany({ where: { organizationId, productionDate: { gte: start, lt: end } }, include: { finishedProduct: true } }),
      this.prisma.haccpProcessSession.findMany({ where: { organizationId, type: 'refroidissement', sessionDate: { gte: start, lt: end } }, include: { product: true, equipment: true } }),
      this.prisma.haccpProcessSession.findMany({ where: { organizationId, type: 'congelation', sessionDate: { gte: start, lt: end } }, include: { product: true, equipment: true } }),
      this.prisma.haccpProcessSession.findMany({ where: { organizationId, type: 'rechauffement', sessionDate: { gte: start, lt: end } }, include: { product: true, equipment: true } }),
      this.prisma.haccpOilSession.findMany({ where: { organizationId, sessionDate: { gte: start, lt: end } }, include: { equipment: true } }),
      this.prisma.haccpCleaningSession.findMany({ where: { organizationId, sessionDate: { gte: start, lt: end } }, include: { cleanedSurfaces: true } }),
    ]);
    const modules = {
      temperature: { count: temperature.length, data: temperature.map((item) => this.serializeTemperatureReading(item)) },
      traceability: { count: traceability.length, data: traceability.map((item) => this.withId(item)) },
      reception: { count: reception.length, data: reception.map((item) => this.withId(item)) },
      production: { count: production.length, data: production.map((item) => this.serializeProductionSession(item)) },
      cooling: {
        refroidissement: { count: refroidissement.length, data: refroidissement.map((item) => this.serializeProcessSession(item)) },
        congelation: { count: congelation.length, data: congelation.map((item) => this.serializeProcessSession(item)) },
        rechauffement: { count: rechauffement.length, data: rechauffement.map((item) => this.serializeProcessSession(item)) },
      },
      oil: { count: oil.length, data: oil.map((item) => this.serializeOilSession(item)) },
      cleaning: { count: cleaning.length, data: cleaning.map((item) => this.serializeCleaningSession(item)) },
    };
    const flatCounts = [modules.temperature, modules.traceability, modules.reception, modules.production, modules.cooling.refroidissement, modules.cooling.congelation, modules.cooling.rechauffement, modules.oil, modules.cleaning];
    const totalActivities = flatCounts.reduce((sum, item) => sum + item.count, 0);
    const summary = { totalActivities, modulesCovered: Object.entries({ temperature: modules.temperature.count, traceability: modules.traceability.count, reception: modules.reception.count, production: modules.production.count, refroidissement: modules.cooling.refroidissement.count, congelation: modules.cooling.congelation.count, rechauffement: modules.cooling.rechauffement.count, oil: modules.oil.count, cleaning: modules.cleaning.count }).filter(([, count]) => count > 0).map(([name]) => name), criticalAlerts: [] };
    const report = await this.prisma.haccpDailyReport.upsert({ where: { organizationId_reportDate: { organizationId, reportDate: start } }, update: { createdById: actor.id, modules, summary, generatedAt: new Date(), status: 'completed', errorMessage: null }, create: { organizationId, createdById: actor.id, reportDate: start, modules, summary, status: 'completed' } });
    return this.ok(this.serializeReport(report));
  }

  async todayReport(organizationId: string) {
    const { start } = this.dayRange();
    const item = await this.prisma.haccpDailyReport.findUnique({ where: { organizationId_reportDate: { organizationId, reportDate: start } } });
    if (!item) throw new NotFoundException('Aucun rapport trouvé pour aujourd’hui');
    return this.ok(this.serializeReport(item));
  }

  async listReports(organizationId: string, q: any = {}) {
    const where: any = { organizationId };
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
    await this.prisma.haccpDailyReport.delete({ where: { id, organizationId } });
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
    const items = await this.prisma.haccpDailyReport.findMany({ where: { organizationId, reportDate: { gte: cutoff } }, orderBy: { reportDate: 'desc' } });
    return this.ok(items.map((item) => this.serializeReport(item)));
  }

  async reportStats(organizationId: string) {
    const reports = await this.prisma.haccpDailyReport.findMany({ where: { organizationId }, orderBy: { reportDate: 'desc' } });
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 30);
    const totalActivities = reports.reduce((sum, report) => sum + Number(report.summary?.totalActivities ?? 0), 0);
    return this.ok({ totalReports: reports.length, recentReports: reports.filter((report) => new Date(report.reportDate) >= recentCutoff).length, averageActivities: reports.length ? totalActivities / reports.length : 0, topModules: [] });
  }

  async downloadReport(organizationId: string, id: string) {
    const report = await this.prisma.haccpDailyReport.findFirst({ where: { id, organizationId } });
    if (!report) throw new NotFoundException('Rapport introuvable');
    if (report.pdfPath && existsSync(report.pdfPath)) return { stream: new StreamableFile(createReadStream(report.pdfPath)), filename: `rapport_haccp_${report.reportDate.toISOString().slice(0, 10)}.pdf`, contentType: 'application/pdf' };
    const payload = Buffer.from(JSON.stringify(this.serializeReport(report), null, 2), 'utf8');
    return { stream: new StreamableFile(payload), filename: `rapport_haccp_${report.reportDate.toISOString().slice(0, 10)}.json`, contentType: 'application/json; charset=utf-8' };
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

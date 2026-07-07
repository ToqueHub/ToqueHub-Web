import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, IotPairingStatus, IotSensorEventType, IotSensorProvider, IotSensorStatus, IotSensorType, Prisma } from '@prisma/client';
import { existsSync, readdirSync } from 'node:fs';
import { Subscription } from 'rxjs';
import type { AuthenticatedUser } from '../../auth/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { MqttJsonMessage, MqttService } from './mqtt.service';
import { inferSensorType, ProviderDevice } from './sensor-provider.interface';
import { HaccpSensorsGateway } from './haccp-sensors.gateway';
import { AssignSensorDto, PairingStartDto, RenameSensorDto, UpdateSensorDto } from './dto/haccp-sensors.dto';
import { Zigbee2MqttProvider } from './zigbee2mqtt.provider';

type Actor = { id: string; role: string };
const HACCP_TEMPERATURE_READING_HOURS = [5, 15, 23];
const HACCP_TEMPERATURE_READING_WINDOW_MINUTES = 10;

@Injectable()
export class HaccpSensorsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HaccpSensorsService.name);
  private subscription?: Subscription;
  private offlineTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mqttService: MqttService,
    private readonly provider: Zigbee2MqttProvider,
    private readonly gateway: HaccpSensorsGateway,
  ) {}

  onModuleInit() {
    this.subscription = this.mqttService.messages$.subscribe((message) => void this.handleMqttMessage(message));
    this.offlineTimer = setInterval(() => void this.runBackgroundMaintenance(), 60_000);
    this.offlineTimer.unref?.();
    void this.runBackgroundMaintenance();
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
    if (this.offlineTimer) clearInterval(this.offlineTimer);
  }

  async summary(organizationId: string) {
    await this.markOfflineSensors(organizationId);
    const sensors = await this.prisma.iotSensor.findMany({ where: { organizationId, isRemoved: false } });
    const total = sensors.length;
    const online = sensors.filter((sensor) => sensor.status === IotSensorStatus.ONLINE).length;
    const offline = sensors.filter((sensor) => sensor.status === IotSensorStatus.OFFLINE).length;
    const batteries = sensors.map((sensor) => this.numberOrNull(sensor.battery)).filter((value): value is number => value != null);
    const averageBattery = batteries.length ? Math.round(batteries.reduce((sum, value) => sum + value, 0) / batteries.length) : null;
    return {
      total,
      online,
      offline,
      unknown: total - online - offline,
      averageBattery,
      globalStatus: total === 0 ? 'unknown' : offline > 0 ? 'warning' : 'ok',
    };
  }

  async gatewayStatus() {
    const mqtt = this.mqttService.getStatus();
    const configuredSerialPort = this.configService.get<string>('ZIGBEE_ADAPTER_PATH')
      || this.configService.get<string>('ZIGBEE2MQTT_SERIAL_PORT')
      || null;
    const serialCandidates = this.detectSerialCandidates();
    const serialPortDetected = configuredSerialPort ? existsSync(configuredSerialPort) : serialCandidates.length > 0;
    const devices = await this.provider.listDevices();
    const status = !mqtt.configured
      ? 'not_configured'
      : !mqtt.connected
        ? 'mqtt_disconnected'
        : !serialPortDetected
          ? 'missing_serial'
          : 'ready';

    return {
      status,
      ready: status === 'ready',
      mqtt,
      zigbee2mqtt: {
        baseTopic: mqtt.baseTopic,
        frontendUrl: this.configService.get<string>('ZIGBEE2MQTT_FRONTEND_URL', 'http://localhost:8080'),
        configuredSerialPort,
        serialPortDetected,
        serialCandidates,
        cachedDeviceCount: devices.length,
      },
      install: {
        dockerCommand: 'docker compose -f docker-compose.iot.yml --profile iot up -d',
        localSetupCommand: 'npm run iot:setup',
        localStartCommand: 'npm run iot:start',
      },
    };
  }

  async list(organizationId: string) {
    await this.markOfflineSensors(organizationId);
    const sensors = await this.prisma.iotSensor.findMany({
      where: { organizationId, isRemoved: false },
      include: this.sensorInclude(),
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
    return sensors.map((sensor) => this.serializeSensor(sensor));
  }

  async get(organizationId: string, id: string) {
    const sensor = await this.prisma.iotSensor.findFirst({
      where: { id, organizationId, isRemoved: false },
      include: this.sensorInclude(true),
    });
    if (!sensor) throw new NotFoundException('Capteur introuvable');
    return this.serializeSensor(sensor);
  }

  async readings(organizationId: string, id: string, query: { from?: string; to?: string; limit?: number }) {
    await this.ensureSensor(organizationId, id);
    const measuredAt: Prisma.DateTimeFilter = {};
    if (query.from) measuredAt.gte = this.parseDate(query.from);
    if (query.to) measuredAt.lte = this.parseDate(query.to);
    const readings = await this.prisma.iotSensorReading.findMany({
      where: { organizationId, sensorId: id, ...(Object.keys(measuredAt).length ? { measuredAt } : {}) },
      orderBy: { measuredAt: 'desc' },
      take: Math.min(Number(query.limit ?? 200), 1000),
    });
    return readings.map((reading) => ({
      ...reading,
      temperature: this.numberOrNull(reading.temperature),
      humidity: this.numberOrNull(reading.humidity),
      battery: this.numberOrNull(reading.battery),
    }));
  }

  async events(organizationId: string, id: string) {
    await this.ensureSensor(organizationId, id);
    return this.prisma.iotSensorEvent.findMany({
      where: { organizationId, sensorId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async temperatureAlerts(organizationId: string) {
    await this.markOfflineSensors(organizationId);
    const [sensors, openAlerts, recentReadings] = await Promise.all([
      this.prisma.iotSensor.findMany({
        where: { organizationId, isRemoved: false },
        include: this.sensorInclude(),
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.iotAlertEvent.findMany({
        where: { organizationId, type: { in: ['TEMPERATURE_OUT_OF_RANGE', 'SENSOR_OFFLINE'] }, status: 'OPEN' },
        include: { sensor: true },
        orderBy: { detectedAt: 'desc' },
        take: 50,
      }),
      this.prisma.iotSensorReading.findMany({
        where: { organizationId, temperature: { not: null } },
        include: { sensor: { include: this.sensorInclude() } },
        orderBy: { measuredAt: 'desc' },
        take: 100,
      }),
    ]);
    const monitoredSensors = sensors.map((sensor) => {
      const serialized = this.serializeSensor(sensor);
      const threshold = this.temperatureThresholdForSensor(serialized, serialized.assignedEquipment);
      const temperatureStatus = this.temperatureStatus(serialized.currentTemperature, threshold);
      return {
        ...serialized,
        threshold,
        temperatureStatus,
        alertOpen: openAlerts.some((alert) => alert.sensorId === sensor.id),
      };
    });
    const assigned = monitoredSensors.filter((sensor) => sensor.assignedEquipment);
    const critical = monitoredSensors.filter((sensor) => sensor.temperatureStatus.status === 'critical').length;
    const warning = monitoredSensors.filter((sensor) => sensor.temperatureStatus.status === 'warning').length;
    return {
      summary: {
        totalSensors: monitoredSensors.length,
        assignedSensors: assigned.length,
        unassignedSensors: monitoredSensors.length - assigned.length,
        onlineSensors: monitoredSensors.filter((sensor) => sensor.status === IotSensorStatus.ONLINE).length,
        offlineSensors: monitoredSensors.filter((sensor) => sensor.status === IotSensorStatus.OFFLINE).length,
        critical,
        warning,
        ok: monitoredSensors.filter((sensor) => sensor.temperatureStatus.status === 'ok').length,
      },
      sensors: monitoredSensors,
      alerts: openAlerts.map((alert) => ({ ...alert, sensor: alert.sensor ? this.serializeSensor({ ...alert.sensor, assignments: [] }) : null })),
      recentReadings: recentReadings.map((reading) => ({
        ...reading,
        temperature: this.numberOrNull(reading.temperature),
        humidity: this.numberOrNull(reading.humidity),
        battery: this.numberOrNull(reading.battery),
        sensor: reading.sensor ? this.serializeSensor(reading.sensor) : null,
      })),
    };
  }

  async update(organizationId: string, id: string, dto: UpdateSensorDto) {
    const current = await this.ensureSensor(organizationId, id);
    const type = dto.type ? this.normalizeType(dto.type) : undefined;
    const metadata = this.withTemperatureThresholdMetadata(current.metadata, dto);
    const sensor = await this.prisma.iotSensor.update({
      where: { id },
      data: {
        userName: dto.userName?.trim() || undefined,
        type,
        metadata: metadata ? this.json(metadata) : undefined,
      },
      include: this.sensorInclude(),
    });
    this.gateway.emitToOrganization(organizationId, 'sensor.updated', this.serializeSensor(sensor));
    return this.serializeSensor(sensor);
  }

  async rename(organizationId: string, actor: Actor, id: string, dto: RenameSensorDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Le nom du capteur est requis');
    const sensor = await this.ensureSensor(organizationId, id);
    await this.provider.renameDevice(sensor.externalId, name);
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.iotSensor.update({
        where: { id },
        data: { userName: name, friendlyName: name, externalId: name },
        include: this.sensorInclude(),
      });
      await tx.iotSensorEvent.create({ data: { organizationId, sensorId: id, actorUserId: actor.id, type: IotSensorEventType.RENAMED, message: `Capteur renommé en ${name}` } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.HACCP_SENSOR_RENAMED, entityType: 'IotSensor', entityId: id, entityName: name } });
      return item;
    });
    this.gateway.emitToOrganization(organizationId, 'sensor.updated', this.serializeSensor(updated));
    return this.serializeSensor(updated);
  }

  async assign(organizationId: string, actor: Actor, id: string, dto: AssignSensorDto) {
    await this.ensureSensor(organizationId, id);
    const equipment = await this.prisma.haccpTemperatureEquipment.findFirst({
      where: { id: dto.haccpTemperatureEquipmentId, organizationId, deletedAt: null, isActive: true },
    });
    if (!equipment) throw new NotFoundException('Équipement HACCP introuvable');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.iotSensorAssignment.updateMany({ where: { organizationId, sensorId: id, unassignedAt: null }, data: { unassignedAt: new Date() } });
      await tx.iotSensorAssignment.create({
        data: {
          organizationId,
          sensorId: id,
          haccpTemperatureEquipmentId: equipment.id,
          assignedById: actor.id,
          notes: dto.notes?.trim() || null,
        },
      });
      await tx.iotSensorEvent.create({ data: { organizationId, sensorId: id, actorUserId: actor.id, type: IotSensorEventType.ASSIGNED, message: `Capteur affecté à ${equipment.name}` } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.HACCP_SENSOR_ASSIGNED, entityType: 'IotSensor', entityId: id, entityName: equipment.name } });
      return tx.iotSensor.findUniqueOrThrow({ where: { id }, include: this.sensorInclude() });
    });
    this.gateway.emitToOrganization(organizationId, 'sensor.updated', this.serializeSensor(updated));
    return this.serializeSensor(updated);
  }

  async unassign(organizationId: string, actor: Actor, id: string) {
    await this.ensureSensor(organizationId, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.iotSensorAssignment.updateMany({ where: { organizationId, sensorId: id, unassignedAt: null }, data: { unassignedAt: new Date() } });
      await tx.iotSensorEvent.create({ data: { organizationId, sensorId: id, actorUserId: actor.id, type: IotSensorEventType.UNASSIGNED, message: 'Capteur désaffecté' } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.HACCP_SENSOR_UNASSIGNED, entityType: 'IotSensor', entityId: id } });
      return tx.iotSensor.findUniqueOrThrow({ where: { id }, include: this.sensorInclude() });
    });
    this.gateway.emitToOrganization(organizationId, 'sensor.updated', this.serializeSensor(updated));
    return this.serializeSensor(updated);
  }

  async remove(organizationId: string, actor: Actor, id: string, removeFromNetwork: boolean) {
    const sensor = await this.ensureSensor(organizationId, id);
    if (removeFromNetwork) await this.provider.removeDevice(sensor.externalId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.iotSensorAssignment.updateMany({ where: { organizationId, sensorId: id, unassignedAt: null }, data: { unassignedAt: new Date() } });
      const item = await tx.iotSensor.update({ where: { id }, data: { isRemoved: true, removedAt: new Date(), status: IotSensorStatus.UNKNOWN }, include: this.sensorInclude() });
      await tx.iotSensorEvent.create({ data: { organizationId, sensorId: id, actorUserId: actor.id, type: IotSensorEventType.REMOVED, message: removeFromNetwork ? 'Capteur supprimé de ToqueHub et du réseau Zigbee' : 'Capteur supprimé de ToqueHub' } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.HACCP_SENSOR_REMOVED, entityType: 'IotSensor', entityId: id, entityName: sensor.userName ?? sensor.friendlyName } });
      return item;
    });
    this.gateway.emitToOrganization(organizationId, 'sensor.updated', this.serializeSensor(updated));
    return this.serializeSensor(updated);
  }

  async startPairing(organizationId: string, actor: Actor, dto: PairingStartDto = {}) {
    await this.expirePairingSessions(organizationId);
    const durationSeconds = dto.durationSeconds ?? Number(this.configService.get('HACCP_PAIRING_DURATION_SECONDS', 180));
    await this.provider.startPairing(durationSeconds);
    const expiresAt = new Date(Date.now() + durationSeconds * 1000);
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.iotPairingSession.updateMany({ where: { organizationId, status: IotPairingStatus.ACTIVE }, data: { status: IotPairingStatus.STOPPED, stoppedAt: new Date() } });
      const item = await tx.iotPairingSession.create({ data: { organizationId, provider: IotSensorProvider.ZIGBEE2MQTT, expiresAt } });
      await tx.iotSensorEvent.create({ data: { organizationId, actorUserId: actor.id, type: IotSensorEventType.PAIRED, message: 'Mode appairage activé' } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.HACCP_SENSOR_PAIRING_STARTED, entityType: 'IotPairingSession', entityId: item.id, entityName: 'Appairage Zigbee' } });
      return item;
    });
    this.gateway.emitToOrganization(organizationId, 'pairing.updated', session);
    return session;
  }

  async stopPairing(organizationId: string, actor: Actor) {
    await this.provider.stopPairing();
    const session = await this.prisma.$transaction(async (tx) => {
      const item = await tx.iotPairingSession.findFirst({ where: { organizationId, status: IotPairingStatus.ACTIVE }, orderBy: { startedAt: 'desc' } });
      if (!item) return null;
      const updated = await tx.iotPairingSession.update({ where: { id: item.id }, data: { status: IotPairingStatus.STOPPED, stoppedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.HACCP_SENSOR_PAIRING_STOPPED, entityType: 'IotPairingSession', entityId: item.id, entityName: 'Appairage Zigbee' } });
      return updated;
    });
    this.gateway.emitToOrganization(organizationId, 'pairing.updated', session);
    return session;
  }

  async currentPairing(organizationId: string) {
    await this.expirePairingSessions(organizationId);
    const session = await this.prisma.iotPairingSession.findFirst({
      where: { organizationId, status: IotPairingStatus.ACTIVE },
      orderBy: { startedAt: 'desc' },
    });
    if (!session) return null;
    const sensors = session.discoveredIds.length
      ? await this.prisma.iotSensor.findMany({ where: { organizationId, id: { in: session.discoveredIds }, isRemoved: false }, include: this.sensorInclude() })
      : [];
    return { ...session, sensors: sensors.map((sensor) => this.serializeSensor(sensor)) };
  }

  async handleMqttMessage(message: MqttJsonMessage) {
    try {
      const base = this.mqttService.baseTopic;
      if (!message.topic.startsWith(`${base}/`)) return;
      const path = message.topic.slice(base.length + 1);
      if (path === 'bridge/devices' && Array.isArray(message.payload)) {
        await Promise.all(message.payload.map((device) => this.handleProviderDevice(this.provider.normalizeDevice(device))));
        return;
      }
      if (path === 'bridge/event') {
        await this.handleBridgeEvent(message.payload);
        return;
      }
      if (path.endsWith('/availability')) {
        const externalId = path.replace(/\/availability$/, '');
        await this.updateAvailability(externalId, message.payload);
        return;
      }
      if (path.startsWith('bridge/')) return;
      await this.handleReading(path, message.payload);
    } catch (error: any) {
      this.logger.warn(`MQTT HACCP handling failed: ${error?.message ?? 'unknown error'}`);
    }
  }

  private async handleBridgeEvent(payload: unknown) {
    if (!payload || typeof payload !== 'object') return;
    const event = payload as Record<string, any>;
    const data = event.data && typeof event.data === 'object' ? event.data : event;
    const externalId = String(data.friendly_name ?? data.friendlyName ?? data.ieee_address ?? data.ieeeAddress ?? '').trim();
    if (!externalId) return;
    await this.handleProviderDevice({
      externalId,
      ieeeAddress: data.ieee_address ?? data.ieeeAddress ?? null,
      friendlyName: data.friendly_name ?? data.friendlyName ?? externalId,
      manufacturer: data.vendor ?? data.manufacturer ?? null,
      model: data.model ?? null,
      type: IotSensorType.GENERIC,
      metadata: event,
    });
  }

  private async handleProviderDevice(device: ProviderDevice | null) {
    if (!device) return;
    const existing = await this.findSensorsByExternal(device.externalId, device.ieeeAddress);
    if (existing.length) {
      await Promise.all(existing.map((sensor) => this.updateDevice(sensor.organizationId, sensor.id, device)));
      return;
    }
    const sessions = await this.activePairingSessions();
    await Promise.all(sessions.map(async (session) => {
      const sensor = await this.restoreOrCreateDevice(session.organizationId, device, true);
      await this.addDiscoveredSensorToSession(session.id, sensor.id);
    }));
  }

  private async handleReading(externalId: string, payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    const readingPayload = payload as Record<string, any>;
    const temperature = this.parseNumber(readingPayload.temperature);
    const humidity = this.parseNumber(readingPayload.humidity);
    const battery = this.parseNumber(readingPayload.battery);
    const linkQuality = this.parseInteger(readingPayload.linkquality ?? readingPayload.linkQuality);
    if (temperature == null && humidity == null && battery == null && linkQuality == null) return;

    let sensors = await this.findSensorsByExternal(externalId, undefined);
    if (!sensors.length) {
      const sessions = await this.activePairingSessions();
      sensors = await Promise.all(sessions.map(async (session) => {
        const sensor = await this.restoreOrCreateDevice(session.organizationId, {
        externalId,
        friendlyName: externalId,
        type: inferSensorType(readingPayload),
        metadata: {},
      }, true);
        await this.addDiscoveredSensorToSession(session.id, sensor.id);
        return sensor;
      }));
    }

    await Promise.all(sensors.map(async (sensor) => {
      if (sensor.isRemoved) return;
      const measuredAt = new Date();
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.iotSensorReading.create({
          data: {
            organizationId: sensor.organizationId,
            sensorId: sensor.id,
            temperature,
            humidity,
            battery,
            linkQuality,
            payload: readingPayload,
            measuredAt,
          },
        });
        await tx.iotSensorEvent.create({
          data: {
            organizationId: sensor.organizationId,
            sensorId: sensor.id,
            type: IotSensorEventType.READING_UPDATED,
            message: 'Nouveau relevé capteur',
            payload: readingPayload,
          },
        });
        const assignment = await tx.iotSensorAssignment.findFirst({
          where: { organizationId: sensor.organizationId, sensorId: sensor.id, unassignedAt: null },
          include: { haccpTemperatureEquipment: true },
          orderBy: { assignedAt: 'desc' },
        });
        if (temperature != null && assignment?.haccpTemperatureEquipmentId) {
          await this.recordScheduledHaccpTemperatureReading(tx, {
            sensor,
            equipment: assignment.haccpTemperatureEquipment,
            equipmentId: assignment.haccpTemperatureEquipmentId,
            temperature,
            measuredAt,
          });
          await this.syncTemperatureAlert(tx, sensor, assignment.haccpTemperatureEquipment, temperature, measuredAt);
        }
        return tx.iotSensor.update({
          where: { id: sensor.id },
          data: {
            currentTemperature: temperature ?? undefined,
            currentHumidity: humidity ?? undefined,
            battery: battery ?? undefined,
            linkQuality: linkQuality ?? undefined,
            lastSeenAt: measuredAt,
            status: IotSensorStatus.ONLINE,
            type: inferSensorType({ temperature: temperature ?? undefined, humidity: humidity ?? undefined }),
          },
          include: this.sensorInclude(),
        });
      });
      const serialized = this.serializeSensor(updated);
      this.gateway.emitToOrganization(sensor.organizationId, 'sensor.reading', serialized);
      this.gateway.emitToOrganization(sensor.organizationId, 'sensor.updated', serialized);
    }));
  }

  private async updateAvailability(externalId: string, payload: unknown) {
    const state = typeof payload === 'string' ? payload : (payload && typeof payload === 'object' ? String((payload as any).state ?? '') : '');
    const status = state.toLowerCase() === 'online' ? IotSensorStatus.ONLINE : state.toLowerCase() === 'offline' ? IotSensorStatus.OFFLINE : null;
    if (!status) return;
    const sensors = await this.findSensorsByExternal(externalId, undefined);
    await Promise.all(sensors.map(async (sensor) => {
      if (sensor.status === status || sensor.isRemoved) return;
      const updated = await this.prisma.iotSensor.update({ where: { id: sensor.id }, data: { status }, include: this.sensorInclude() });
      this.gateway.emitToOrganization(sensor.organizationId, 'sensor.status_changed', this.serializeSensor(updated));
      this.gateway.emitToOrganization(sensor.organizationId, 'sensor.updated', this.serializeSensor(updated));
    }));
  }

  private async createDevice(organizationId: string, device: ProviderDevice, discovered: boolean) {
    const sensor = await this.prisma.$transaction(async (tx) => {
      const created = await tx.iotSensor.create({
        data: {
          organizationId,
          provider: IotSensorProvider.ZIGBEE2MQTT,
          externalId: device.externalId,
          ieeeAddress: device.ieeeAddress,
          manufacturer: device.manufacturer,
          model: device.model,
          friendlyName: device.friendlyName,
          userName: device.friendlyName,
          type: device.type ?? IotSensorType.GENERIC,
          metadata: this.json(device.metadata ?? {}),
          status: IotSensorStatus.UNKNOWN,
        },
        include: this.sensorInclude(),
      });
      await tx.iotSensorEvent.create({ data: { organizationId, sensorId: created.id, type: IotSensorEventType.DISCOVERED, message: 'Capteur détecté automatiquement', payload: this.json(device.metadata ?? {}) } });
      await tx.auditLog.create({ data: { organizationId, action: AuditAction.HACCP_SENSOR_DISCOVERED, entityType: 'IotSensor', entityId: created.id, entityName: created.userName ?? created.friendlyName } });
      return created;
    });
    const serialized = this.serializeSensor(sensor);
    this.gateway.emitToOrganization(organizationId, discovered ? 'sensor.discovered' : 'sensor.updated', serialized);
    return sensor;
  }

  private async syncTemperatureAlert(tx: any, sensor: any, equipment: any, temperature: number, measuredAt: Date) {
    const threshold = this.temperatureThresholdForSensor(sensor, equipment);
    const status = this.temperatureStatus(temperature, threshold);
    const openAlert = await tx.iotAlertEvent.findFirst({
      where: { organizationId: sensor.organizationId, sensorId: sensor.id, type: 'TEMPERATURE_OUT_OF_RANGE', status: 'OPEN' },
      orderBy: { detectedAt: 'desc' },
    });
    if (status.status === 'ok') {
      if (openAlert) await tx.iotAlertEvent.update({ where: { id: openAlert.id }, data: { status: 'RESOLVED', resolvedAt: measuredAt } });
      return;
    }
    const title = status.status === 'critical' ? 'Température critique' : 'Température à surveiller';
    const message = `${equipment?.name ?? 'Enceinte'}: ${temperature.toFixed(1)}°C hors plage ${threshold.min}°C / ${threshold.max}°C`;
    const payload = this.json({ temperature, threshold, equipmentId: equipment?.id ?? null, equipmentName: equipment?.name ?? null });
    if (openAlert) {
      await tx.iotAlertEvent.update({ where: { id: openAlert.id }, data: { severity: status.status === 'critical' ? 'CRITICAL' : 'WARNING', title, message, payload, detectedAt: measuredAt } });
      return;
    }
    await tx.iotAlertEvent.create({
      data: {
        organizationId: sensor.organizationId,
        sensorId: sensor.id,
        type: 'TEMPERATURE_OUT_OF_RANGE',
        severity: status.status === 'critical' ? 'CRITICAL' : 'WARNING',
        status: 'OPEN',
        title,
        message,
        payload,
        detectedAt: measuredAt,
      },
    });
  }

  private async recordScheduledHaccpTemperatureReading(tx: any, params: { sensor: any; equipment?: any; equipmentId: string; temperature: number; measuredAt: Date }) {
    const slot = this.currentHaccpTemperatureSlot(params.measuredAt);
    if (!slot) return false;
    const existing = await tx.haccpTemperatureReading.findFirst({
      where: {
        organizationId: params.sensor.organizationId,
        equipmentId: params.equipmentId,
        deletedAt: null,
        date: slot.date,
        notes: { contains: slot.noteMarker },
      },
    });
    if (existing) return false;
    await tx.haccpTemperatureReading.create({
      data: {
        organizationId: params.sensor.organizationId,
        equipmentId: params.equipmentId,
        temperature: params.temperature,
        date: slot.date,
        notes: `${slot.noteMarker} - capteur ${params.sensor.userName ?? params.sensor.friendlyName ?? params.sensor.externalId}`,
      },
    });
    return true;
  }

  private currentHaccpTemperatureSlot(date: Date) {
    for (const hour of HACCP_TEMPERATURE_READING_HOURS) {
      const slotDate = new Date(date);
      slotDate.setHours(hour, 0, 0, 0);
      const windowEnd = new Date(slotDate.getTime() + HACCP_TEMPERATURE_READING_WINDOW_MINUTES * 60_000);
      if (date >= slotDate && date < windowEnd) {
        const label = `${String(hour).padStart(2, '0')}:00`;
        return { date: slotDate, label, noteMarker: `Relevé automatique Sonoff ${label}` };
      }
    }
    return null;
  }

  private async restoreOrCreateDevice(organizationId: string, device: ProviderDevice, discovered: boolean) {
    const removed = await this.findRemovedSensorByExternal(organizationId, device.externalId, device.ieeeAddress);
    if (!removed) return this.createDevice(organizationId, device, discovered);

    const sensor = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.iotSensor.update({
        where: { id: removed.id },
        data: {
          externalId: device.externalId,
          ieeeAddress: device.ieeeAddress ?? removed.ieeeAddress,
          manufacturer: device.manufacturer ?? removed.manufacturer,
          model: device.model ?? removed.model,
          friendlyName: device.friendlyName ?? removed.friendlyName,
          userName: removed.userName ?? device.friendlyName,
          type: device.type ?? removed.type,
          metadata: this.json(device.metadata ?? removed.metadata ?? {}),
          isRemoved: false,
          removedAt: null,
          status: IotSensorStatus.UNKNOWN,
        },
        include: this.sensorInclude(),
      });
      await tx.iotSensorEvent.create({
        data: {
          organizationId,
          sensorId: updated.id,
          type: IotSensorEventType.DISCOVERED,
          message: 'Capteur restauré automatiquement',
          payload: this.json(device.metadata ?? {}),
        },
      });
      await tx.auditLog.create({ data: { organizationId, action: AuditAction.HACCP_SENSOR_DISCOVERED, entityType: 'IotSensor', entityId: updated.id, entityName: updated.userName ?? updated.friendlyName } });
      return updated;
    });
    const serialized = this.serializeSensor(sensor);
    this.gateway.emitToOrganization(organizationId, discovered ? 'sensor.discovered' : 'sensor.updated', serialized);
    return sensor;
  }

  private async updateDevice(organizationId: string, id: string, device: ProviderDevice) {
    const sensor = await this.prisma.iotSensor.update({
      where: { id },
      data: {
        ieeeAddress: device.ieeeAddress ?? undefined,
        manufacturer: device.manufacturer ?? undefined,
        model: device.model ?? undefined,
        friendlyName: device.friendlyName ?? undefined,
        type: device.type ?? undefined,
        metadata: device.metadata ? this.json(device.metadata) : undefined,
      },
      include: this.sensorInclude(),
    });
    this.gateway.emitToOrganization(organizationId, 'sensor.updated', this.serializeSensor(sensor));
  }

  private async markOfflineSensors(organizationId?: string) {
    const thresholdMinutes = Number(this.configService.get('HACCP_SENSOR_OFFLINE_AFTER_MINUTES', 30));
    const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);
    const sensors = await this.prisma.iotSensor.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        isRemoved: false,
        status: IotSensorStatus.ONLINE,
        lastSeenAt: { lt: cutoff },
      },
      select: { id: true, organizationId: true },
    });
    await Promise.all(sensors.map(async (sensor) => {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.iotSensorEvent.create({ data: { organizationId: sensor.organizationId, sensorId: sensor.id, type: IotSensorEventType.OFFLINE, message: 'Capteur hors ligne automatiquement' } });
        return tx.iotSensor.update({ where: { id: sensor.id }, data: { status: IotSensorStatus.OFFLINE }, include: this.sensorInclude() });
      });
      this.gateway.emitToOrganization(sensor.organizationId, 'sensor.status_changed', this.serializeSensor(updated));
      this.gateway.emitToOrganization(sensor.organizationId, 'sensor.updated', this.serializeSensor(updated));
    }));
  }

  private async runBackgroundMaintenance() {
    try {
      await this.expirePairingSessions();
      await this.markOfflineSensors();
      await this.createDueScheduledHaccpTemperatureReadings();
    } catch (error: any) {
      this.logger.warn(`HACCP sensor maintenance skipped: ${error?.message ?? 'unknown error'}`);
    }
  }

  private async createDueScheduledHaccpTemperatureReadings(now = new Date()) {
    const slot = this.currentHaccpTemperatureSlot(now);
    if (!slot) return;
    const sensors = await this.prisma.iotSensor.findMany({
      where: {
        isRemoved: false,
        currentTemperature: { not: null },
        assignments: {
          some: { unassignedAt: null },
        },
      },
      include: this.sensorInclude(),
    });
    await Promise.all(sensors.map(async (sensor) => {
      const assignment = (sensor.assignments ?? []).find((item: any) => !item.unassignedAt);
      if (!assignment?.haccpTemperatureEquipmentId) return;
      const temperature = this.numberOrNull(sensor.currentTemperature);
      if (temperature == null) return;
      await this.prisma.$transaction(async (tx) => {
        await this.recordScheduledHaccpTemperatureReading(tx, {
          sensor,
          equipment: assignment.haccpTemperatureEquipment,
          equipmentId: assignment.haccpTemperatureEquipmentId,
          temperature,
          measuredAt: now,
        });
        await this.syncTemperatureAlert(tx, sensor, assignment.haccpTemperatureEquipment, temperature, now);
      });
    }));
  }

  private async expirePairingSessions(organizationId?: string) {
    await this.prisma.iotPairingSession.updateMany({
      where: { ...(organizationId ? { organizationId } : {}), status: IotPairingStatus.ACTIVE, expiresAt: { lt: new Date() } },
      data: { status: IotPairingStatus.EXPIRED, stoppedAt: new Date() },
    });
  }

  private activePairingSessions() {
    return this.prisma.iotPairingSession.findMany({
      where: { status: IotPairingStatus.ACTIVE, expiresAt: { gt: new Date() } },
      orderBy: { startedAt: 'desc' },
    });
  }

  private findSensorsByExternal(externalId: string, ieeeAddress?: string | null) {
    return this.prisma.iotSensor.findMany({
      where: {
        provider: IotSensorProvider.ZIGBEE2MQTT,
        isRemoved: false,
        OR: [
          { externalId },
          ...(ieeeAddress ? [{ ieeeAddress }] : []),
        ],
      },
    });
  }

  private findRemovedSensorByExternal(organizationId: string, externalId: string, ieeeAddress?: string | null) {
    return this.prisma.iotSensor.findFirst({
      where: {
        organizationId,
        provider: IotSensorProvider.ZIGBEE2MQTT,
        isRemoved: true,
        OR: [
          { externalId },
          ...(ieeeAddress ? [{ ieeeAddress }] : []),
        ],
      },
      orderBy: { removedAt: 'desc' },
    });
  }

  private async addDiscoveredSensorToSession(sessionId: string, sensorId: string) {
    await this.prisma.iotPairingSession.update({
      where: { id: sessionId },
      data: { discoveredIds: { push: sensorId } },
    }).catch(() => undefined);
  }

  private temperatureThresholdForEquipment(equipment?: { type?: string | null; name?: string | null } | null) {
    const source = `${equipment?.type ?? ''} ${equipment?.name ?? ''}`.toLowerCase();
    if (source.includes('congel') || source.includes('surgel') || source.includes('neg') || source.includes('frozen')) {
      return { min: -30, max: -18, label: 'Congélation' };
    }
    return { min: 0, max: 4, label: 'Froid positif' };
  }

  private temperatureThresholdForSensor(sensor: any, equipment?: { type?: string | null; name?: string | null } | null) {
    const custom = this.extractCustomTemperatureThreshold(sensor?.metadata);
    if (custom) return { min: custom.min, max: custom.max, label: custom.label ?? 'Seuil personnalisé' };
    return this.temperatureThresholdForEquipment(equipment);
  }

  private extractCustomTemperatureThreshold(metadata: any) {
    const threshold = metadata && typeof metadata === 'object' ? metadata.temperatureThreshold : null;
    const min = this.parseNumber(threshold?.min);
    const max = this.parseNumber(threshold?.max);
    if (min == null || max == null || min >= max) return null;
    return { min, max, label: typeof threshold?.label === 'string' ? threshold.label : undefined };
  }

  private withTemperatureThresholdMetadata(metadata: any, dto: UpdateSensorDto) {
    if (dto.temperatureMin == null && dto.temperatureMax == null) return undefined;
    const current = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
    const existing = this.extractCustomTemperatureThreshold(current);
    const min = dto.temperatureMin ?? existing?.min;
    const max = dto.temperatureMax ?? existing?.max;
    if (min == null || max == null || min >= max) throw new BadRequestException('Seuils température invalides');
    current.temperatureThreshold = { min, max, label: 'Seuil personnalisé' };
    return current;
  }

  private temperatureStatus(temperature: number | null | undefined, threshold: { min: number; max: number }) {
    if (temperature == null) return { status: 'unknown', label: 'Sans relevé', delta: null };
    if (temperature < threshold.min) {
      const delta = threshold.min - temperature;
      return { status: delta >= 3 ? 'critical' : 'warning', label: 'Trop froid', delta };
    }
    if (temperature > threshold.max) {
      const delta = temperature - threshold.max;
      return { status: delta >= 3 ? 'critical' : 'warning', label: 'Trop chaud', delta };
    }
    return { status: 'ok', label: 'Conforme', delta: 0 };
  }

  private async ensureSensor(organizationId: string, id: string) {
    const sensor = await this.prisma.iotSensor.findFirst({ where: { id, organizationId, isRemoved: false } });
    if (!sensor) throw new NotFoundException('Capteur introuvable');
    return sensor;
  }

  private sensorInclude(withHistory = false) {
    return {
      assignments: {
        where: withHistory ? undefined : { unassignedAt: null },
        include: { haccpTemperatureEquipment: true },
        orderBy: { assignedAt: 'desc' as const },
        take: withHistory ? 50 : 1,
      },
      ...(withHistory ? {
        readings: { orderBy: { measuredAt: 'desc' as const }, take: 100 },
        events: { orderBy: { createdAt: 'desc' as const }, take: 100 },
      } : {}),
    };
  }

  private serializeSensor(sensor: any) {
    const activeAssignment = (sensor.assignments ?? []).find((assignment: any) => !assignment.unassignedAt) ?? sensor.assignments?.[0] ?? null;
    return {
      ...sensor,
      battery: this.numberOrNull(sensor.battery),
      currentTemperature: this.numberOrNull(sensor.currentTemperature),
      currentHumidity: this.numberOrNull(sensor.currentHumidity),
      temperatureThreshold: this.extractCustomTemperatureThreshold(sensor.metadata),
      assignedEquipment: activeAssignment?.haccpTemperatureEquipment ? {
        id: activeAssignment.haccpTemperatureEquipment.id,
        name: activeAssignment.haccpTemperatureEquipment.name,
        type: activeAssignment.haccpTemperatureEquipment.type,
      } : null,
      readings: sensor.readings?.map((reading: any) => ({
        ...reading,
        temperature: this.numberOrNull(reading.temperature),
        humidity: this.numberOrNull(reading.humidity),
        battery: this.numberOrNull(reading.battery),
      })),
    };
  }

  private normalizeType(type: string) {
    const normalized = type.trim().toUpperCase();
    if (!Object.values(IotSensorType).includes(normalized as IotSensorType)) throw new BadRequestException('Type de capteur invalide');
    return normalized as IotSensorType;
  }

  private parseDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Date invalide');
    return date;
  }

  private parseNumber(value: unknown) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private parseInteger(value: unknown) {
    const number = this.parseNumber(value);
    return number == null ? null : Math.round(number);
  }

  private numberOrNull(value: Prisma.Decimal | number | string | null | undefined) {
    if (value == null) return null;
    return Number(value);
  }

  private json(value: unknown) {
    return value as Prisma.InputJsonValue;
  }

  private detectSerialCandidates() {
    const candidates = new Set<string>();
    const byIdDir = '/dev/serial/by-id';
    try {
      for (const entry of readdirSync(byIdDir)) candidates.add(`${byIdDir}/${entry}`);
    } catch {
      // Device scanning is best-effort; containers may not expose /dev/serial.
    }

    const directories = ['/dev'];
    const patterns = [
      /^ttyUSB\d+$/,
      /^ttyACM\d+$/,
      /^tty\.usbserial/,
      /^tty\.usbmodem/,
      /^tty\.SLAB_USBtoUART/,
      /^tty\.wchusbserial/,
    ];
    for (const directory of directories) {
      try {
        for (const entry of readdirSync(directory)) {
          if (patterns.some((pattern) => pattern.test(entry))) candidates.add(`${directory}/${entry}`);
        }
      } catch {
        // Device scanning is best-effort; containers may not expose /dev.
      }
    }
    return [...candidates].sort();
  }
}

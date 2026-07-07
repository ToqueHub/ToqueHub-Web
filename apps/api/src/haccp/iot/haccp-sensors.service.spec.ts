import { Subject } from 'rxjs';
import { IotPairingStatus, IotSensorStatus, IotSensorType } from '@prisma/client';
import { HaccpSensorsService } from './haccp-sensors.service';

const orgId = '11111111-1111-1111-1111-111111111111';
const actor = { id: '22222222-2222-2222-2222-222222222222', role: 'Administrateur' };

function createPrismaMock() {
  const prisma: any = {
    $transaction: jest.fn(async (fn) => fn(prisma)),
    iotSensor: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    iotSensorReading: { create: jest.fn(), findMany: jest.fn() },
    iotSensorEvent: { create: jest.fn(), findMany: jest.fn() },
    iotSensorAssignment: { updateMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    iotPairingSession: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
    haccpTemperatureEquipment: { findFirst: jest.fn() },
    haccpTemperatureReading: { create: jest.fn(), findFirst: jest.fn() },
    iotAlertEvent: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return prisma;
}

function createService(prisma = createPrismaMock()) {
  const messages$ = new Subject<any>();
  const mqtt = { baseTopic: 'zigbee2mqtt', messages$: messages$.asObservable() };
  const provider = {
    normalizeDevice: jest.fn((device) => ({
      externalId: device.friendly_name,
      ieeeAddress: device.ieee_address,
      friendlyName: device.friendly_name,
      manufacturer: 'Aqara',
      model: 'WSDCGQ11LM',
      type: IotSensorType.TEMPERATURE_HUMIDITY,
      metadata: device,
    })),
    startPairing: jest.fn().mockResolvedValue(undefined),
    stopPairing: jest.fn().mockResolvedValue(undefined),
    renameDevice: jest.fn().mockResolvedValue(undefined),
    removeDevice: jest.fn().mockResolvedValue(undefined),
  };
  const gateway = { emitToOrganization: jest.fn() };
  const config = { get: jest.fn((key: string, fallback?: unknown) => fallback) };
  return { service: new HaccpSensorsService(prisma, config as any, mqtt as any, provider as any, gateway as any), prisma, provider, gateway, messages$ };
}

describe('HaccpSensorsService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a discovered sensor only for active pairing sessions', async () => {
    const { service, prisma, gateway } = createService();
    prisma.iotSensor.findMany.mockResolvedValueOnce([]);
    prisma.iotPairingSession.findMany.mockResolvedValue([{ id: 'pairing-1', organizationId: orgId, status: IotPairingStatus.ACTIVE }]);
    prisma.iotSensor.create.mockResolvedValue({
      id: 'sensor-1',
      organizationId: orgId,
      externalId: 'Frigo 1',
      provider: 'ZIGBEE2MQTT',
      type: IotSensorType.TEMPERATURE_HUMIDITY,
      status: IotSensorStatus.UNKNOWN,
      assignments: [],
    });

    await service.handleMqttMessage({
      topic: 'zigbee2mqtt/bridge/devices',
      payload: [{ ieee_address: '0xabc', friendly_name: 'Frigo 1' }],
    });

    expect(prisma.iotSensor.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: orgId, externalId: 'Frigo 1', ieeeAddress: '0xabc' }),
    }));
    expect(prisma.iotPairingSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pairing-1' } }));
    expect(gateway.emitToOrganization).toHaveBeenCalledWith(orgId, 'sensor.discovered', expect.objectContaining({ id: 'sensor-1' }));
  });

  it('updates an already known sensor instead of creating a duplicate discovery', async () => {
    const { service, prisma } = createService();
    prisma.iotSensor.findMany.mockResolvedValueOnce([{ id: 'sensor-1', organizationId: orgId, externalId: 'Frigo 1' }]);
    prisma.iotSensor.update.mockResolvedValue({ id: 'sensor-1', organizationId: orgId, externalId: 'Frigo 1', assignments: [] });

    await service.handleMqttMessage({
      topic: 'zigbee2mqtt/bridge/devices',
      payload: [{ ieee_address: '0xabc', friendly_name: 'Frigo 1' }],
    });

    expect(prisma.iotSensor.create).not.toHaveBeenCalled();
    expect(prisma.iotSensor.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sensor-1' } }));
  });

  it('stores every reading and updates current sensor values', async () => {
    const { service, prisma, gateway } = createService();
    prisma.iotSensor.findMany.mockResolvedValueOnce([{ id: 'sensor-1', organizationId: orgId, externalId: 'Frigo 1', isRemoved: false }]);
    prisma.iotSensor.update.mockResolvedValue({
      id: 'sensor-1',
      organizationId: orgId,
      externalId: 'Frigo 1',
      currentTemperature: 3.2,
      currentHumidity: 72,
      battery: 87,
      linkQuality: 144,
      status: IotSensorStatus.ONLINE,
      assignments: [],
    });

    await service.handleMqttMessage({
      topic: 'zigbee2mqtt/Frigo 1',
      payload: { temperature: 3.2, humidity: 72, battery: 87, linkquality: 144 },
    });

    expect(prisma.iotSensorReading.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sensorId: 'sensor-1', temperature: 3.2, humidity: 72, battery: 87, linkQuality: 144 }),
    }));
    expect(prisma.iotSensor.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentTemperature: 3.2, currentHumidity: 72, status: IotSensorStatus.ONLINE }),
    }));
    expect(gateway.emitToOrganization).toHaveBeenCalledWith(orgId, 'sensor.reading', expect.objectContaining({ currentTemperature: 3.2 }));
  });

  it('copies assigned sensor temperature readings into HACCP temperature records and opens alerts', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 7, 15, 2, 0, 0));
    const { service, prisma } = createService();
    prisma.iotSensor.findMany.mockResolvedValueOnce([{ id: 'sensor-1', organizationId: orgId, externalId: 'Frigo 1', userName: 'Capteur Frigo 1', isRemoved: false }]);
    prisma.iotSensorAssignment.findFirst.mockResolvedValue({
      haccpTemperatureEquipmentId: 'equipment-1',
      haccpTemperatureEquipment: { id: 'equipment-1', name: 'Frigo positif', type: 'enceinte_positive' },
    });
    prisma.haccpTemperatureReading.findFirst.mockResolvedValue(null);
    prisma.iotAlertEvent.findFirst.mockResolvedValue(null);
    prisma.iotSensor.update.mockResolvedValue({
      id: 'sensor-1',
      organizationId: orgId,
      externalId: 'Frigo 1',
      currentTemperature: 9.5,
      status: IotSensorStatus.ONLINE,
      assignments: [{ haccpTemperatureEquipment: { id: 'equipment-1', name: 'Frigo positif', type: 'enceinte_positive' } }],
    });

    await service.handleMqttMessage({
      topic: 'zigbee2mqtt/Frigo 1',
      payload: { temperature: 9.5, battery: 80 },
    });

    expect(prisma.haccpTemperatureReading.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: orgId,
        equipmentId: 'equipment-1',
        temperature: 9.5,
        date: new Date(2026, 6, 7, 15, 0, 0, 0),
        notes: expect.stringContaining('Relevé automatique Sonoff 15:00 - capteur Capteur Frigo 1'),
      }),
    }));
    expect(prisma.iotAlertEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: orgId,
        sensorId: 'sensor-1',
        type: 'TEMPERATURE_OUT_OF_RANGE',
        severity: 'CRITICAL',
        status: 'OPEN',
      }),
    }));
  });

  it('historizes assignment changes and scopes them to the organization', async () => {
    const { service, prisma } = createService();
    prisma.iotSensor.findFirst.mockResolvedValue({ id: 'sensor-1', organizationId: orgId });
    prisma.haccpTemperatureEquipment.findFirst.mockResolvedValue({ id: 'equipment-1', organizationId: orgId, name: 'Chambre froide positive' });
    prisma.iotSensor.findUniqueOrThrow.mockResolvedValue({ id: 'sensor-1', organizationId: orgId, assignments: [{ haccpTemperatureEquipment: { id: 'equipment-1', name: 'Chambre froide positive', type: 'enceinte_positive' } }] });

    await service.assign(orgId, actor, 'sensor-1', { haccpTemperatureEquipmentId: 'equipment-1' });

    expect(prisma.haccpTemperatureEquipment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'equipment-1', organizationId: orgId }) }));
    expect(prisma.iotSensorAssignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: orgId, sensorId: 'sensor-1', unassignedAt: null } }));
    expect(prisma.iotSensorAssignment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: orgId, sensorId: 'sensor-1', haccpTemperatureEquipmentId: 'equipment-1' }) }));
  });

  it('updates custom temperature alert thresholds on a sensor', async () => {
    const { service, prisma } = createService();
    prisma.iotSensor.findFirst.mockResolvedValue({ id: 'sensor-1', organizationId: orgId, metadata: { model: 'SNZB-02D' } });
    prisma.iotSensor.update.mockResolvedValue({
      id: 'sensor-1',
      organizationId: orgId,
      metadata: { model: 'SNZB-02D', temperatureThreshold: { min: 1, max: 6, label: 'Seuil personnalisé' } },
      assignments: [],
    });

    const response = await service.update(orgId, 'sensor-1', { temperatureMin: 1, temperatureMax: 6 });

    expect(prisma.iotSensor.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ temperatureThreshold: { min: 1, max: 6, label: 'Seuil personnalisé' } }),
      }),
    }));
    expect(response.temperatureThreshold).toMatchObject({ min: 1, max: 6 });
  });

  it('propagates renames to the provider before updating ToqueHub state', async () => {
    const { service, prisma, provider } = createService();
    prisma.iotSensor.findFirst.mockResolvedValue({ id: 'sensor-1', organizationId: orgId, externalId: 'Frigo 1' });
    prisma.iotSensor.update.mockResolvedValue({ id: 'sensor-1', organizationId: orgId, externalId: 'Frigo Nord', userName: 'Frigo Nord', assignments: [] });

    await service.rename(orgId, actor, 'sensor-1', { name: 'Frigo Nord' });

    expect(provider.renameDevice).toHaveBeenCalledWith('Frigo 1', 'Frigo Nord');
    expect(prisma.iotSensor.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userName: 'Frigo Nord', friendlyName: 'Frigo Nord', externalId: 'Frigo Nord' }),
    }));
  });
});

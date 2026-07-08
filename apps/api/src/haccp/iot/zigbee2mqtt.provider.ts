import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { IotSensorProvider } from '@prisma/client';
import { Subscription } from 'rxjs';
import { MqttService } from './mqtt.service';
import { inferSensorType, ProviderDevice, SensorProvider } from './sensor-provider.interface';

@Injectable()
export class Zigbee2MqttProvider implements SensorProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Zigbee2MqttProvider.name);
  private readonly devices = new Map<string, ProviderDevice>();
  private subscription?: Subscription;

  readonly provider = IotSensorProvider.ZIGBEE2MQTT;

  constructor(private readonly mqttService: MqttService) {}

  onModuleInit() {
    this.subscription = this.mqttService.messages$.subscribe((message) => {
      if (message.topic !== `${this.mqttService.baseTopic}/bridge/devices`) return;
      if (!Array.isArray(message.payload)) return;
      const devices = message.payload.map((item) => this.normalizeDevice(item)).filter(Boolean) as ProviderDevice[];
      devices.forEach((device) => this.devices.set(device.externalId, device));
      this.logger.log(`Cached ${devices.length} Zigbee2MQTT devices`);
    });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  startPairing(durationSeconds: number) {
    return this.mqttService.publish(`${this.mqttService.baseTopic}/bridge/request/permit_join`, {
      time: durationSeconds,
    });
  }

  requestDevices() {
    return this.mqttService.publish(`${this.mqttService.baseTopic}/bridge/request/devices`, {});
  }

  stopPairing() {
    return this.mqttService.publish(`${this.mqttService.baseTopic}/bridge/request/permit_join`, { time: 0 });
  }

  async listDevices() {
    return [...this.devices.values()];
  }

  renameDevice(externalId: string, nextName: string) {
    return this.mqttService.publish(`${this.mqttService.baseTopic}/bridge/request/device/rename`, {
      from: externalId,
      to: nextName,
    });
  }

  removeDevice(externalId: string) {
    return this.mqttService.publish(`${this.mqttService.baseTopic}/bridge/request/device/remove`, {
      id: externalId,
      force: true,
    });
  }

  normalizeDevice(value: unknown): ProviderDevice | null {
    const device = value && typeof value === 'object' ? value as Record<string, any> : null;
    if (!device) return null;
    if (String(device.type ?? '').toLowerCase() === 'coordinator') return null;
    const friendlyName = String(device.friendly_name ?? device.friendlyName ?? device.ieee_address ?? '').trim();
    const ieeeAddress = String(device.ieee_address ?? device.ieeeAddress ?? '').trim();
    const externalId = friendlyName || ieeeAddress;
    if (!externalId) return null;
    const definition = device.definition && typeof device.definition === 'object' ? device.definition : {};
    return {
      externalId,
      ieeeAddress: ieeeAddress || null,
      friendlyName: friendlyName || null,
      manufacturer: definition.vendor ?? device.manufacturer ?? null,
      model: definition.model ?? device.model_id ?? device.model ?? null,
      type: inferSensorType({ temperature: this.exposesFeature(definition, 'temperature') ? true : undefined, humidity: this.exposesFeature(definition, 'humidity') ? true : undefined }),
      metadata: device,
    };
  }

  private exposesFeature(definition: Record<string, any>, property: string) {
    const exposes = Array.isArray(definition.exposes) ? definition.exposes : [];
    return JSON.stringify(exposes).includes(`"property":"${property}"`);
  }
}

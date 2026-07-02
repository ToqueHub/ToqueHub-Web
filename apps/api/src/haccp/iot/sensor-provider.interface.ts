import { IotSensorProvider, IotSensorType } from '@prisma/client';

export type ProviderDevice = {
  externalId: string;
  ieeeAddress?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  friendlyName?: string | null;
  type?: IotSensorType;
  metadata?: Record<string, unknown>;
};

export type ProviderReading = {
  externalId: string;
  temperature?: number | null;
  humidity?: number | null;
  battery?: number | null;
  linkQuality?: number | null;
  measuredAt?: Date;
  payload?: Record<string, unknown>;
};

export interface SensorProvider {
  readonly provider: IotSensorProvider;
  startPairing(durationSeconds: number): Promise<void>;
  stopPairing(): Promise<void>;
  listDevices(): Promise<ProviderDevice[]>;
  renameDevice(externalId: string, nextName: string): Promise<void>;
  removeDevice(externalId: string): Promise<void>;
}

export const ZIGBEE_PROVIDER = Symbol('ZIGBEE_PROVIDER');

export function inferSensorType(payload: Record<string, unknown> = {}) {
  const hasTemperature = payload.temperature != null;
  const hasHumidity = payload.humidity != null;
  if (hasTemperature && hasHumidity) return IotSensorType.TEMPERATURE_HUMIDITY;
  if (hasHumidity) return IotSensorType.HUMIDITY;
  if (hasTemperature) return IotSensorType.TEMPERATURE;
  return IotSensorType.GENERIC;
}

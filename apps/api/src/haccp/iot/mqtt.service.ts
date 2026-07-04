import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mqtt, { MqttClient } from 'mqtt';
import { Observable, Subject } from 'rxjs';

export type MqttJsonMessage = {
  topic: string;
  payload: unknown;
};

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private readonly messagesSubject = new Subject<MqttJsonMessage>();
  private client?: MqttClient;
  private configuredUrl?: string;
  private connected = false;
  private lastError: string | null = null;
  private lastConnectedAt: Date | null = null;

  readonly messages$: Observable<MqttJsonMessage> = this.messagesSubject.asObservable();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const url = this.getConfiguredUrl();
    if (!url) {
      this.logger.warn('MQTT_URL is not configured; HACCP sensor provider will stay in offline mode.');
      return;
    }

    this.connect(url);
  }

  private connect(url: string) {
    if (this.client) return;
    this.configuredUrl = url;
    this.client = mqtt.connect(url, {
      username: this.configService.get<string>('MQTT_USERNAME') || undefined,
      password: this.configService.get<string>('MQTT_PASSWORD') || undefined,
      reconnectPeriod: 5_000,
      clean: true,
    });

    this.client.on('connect', () => {
      this.connected = true;
      this.lastError = null;
      this.lastConnectedAt = new Date();
      const topic = `${this.baseTopic}/#`;
      this.logger.log(`Connected to MQTT broker, subscribing to ${topic}`);
      this.client?.subscribe(topic, (error) => {
        if (error) {
          this.lastError = error.message;
          this.logger.error(`MQTT subscribe failed: ${error.message}`);
        }
      });
    });

    this.client.on('message', (topic, buffer) => {
      const raw = buffer.toString('utf8');
      let payload: unknown = raw;
      try {
        payload = JSON.parse(raw);
      } catch {
        // Zigbee2MQTT availability topics can be plain strings.
      }
      this.messagesSubject.next({ topic, payload });
    });

    this.client.on('error', (error) => {
      this.lastError = error.message;
      this.logger.error(`MQTT error: ${error.message}`);
    });
    this.client.on('close', () => {
      this.connected = false;
    });
    this.client.on('offline', () => {
      this.connected = false;
    });
    this.client.on('reconnect', () => this.logger.warn('Reconnecting to MQTT broker...'));
  }

  onModuleDestroy() {
    this.messagesSubject.complete();
    this.client?.end(true);
  }

  get baseTopic() {
    return this.configService.get<string>('ZIGBEE2MQTT_BASE_TOPIC', 'zigbee2mqtt').replace(/^\/|\/$/g, '');
  }

  getStatus() {
    const configuredUrl = this.configuredUrl ?? this.getConfiguredUrl();
    if (configuredUrl && !this.client) this.connect(configuredUrl);

    return {
      configured: Boolean(configuredUrl),
      url: this.sanitizeUrl(configuredUrl),
      connected: this.connected,
      baseTopic: this.baseTopic,
      lastError: this.lastError,
      lastConnectedAt: this.lastConnectedAt,
    };
  }

  publish(topic: string, payload: unknown) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Promise<void>((resolve, reject) => {
      if (!this.client?.connected) {
        reject(new Error('MQTT broker is not connected'));
        return;
      }
      this.client.publish(topic, body, { qos: 0 }, (error) => (error ? reject(error) : resolve()));
    });
  }

  private sanitizeUrl(value?: string) {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.username) url.username = '***';
      if (url.password) url.password = '***';
      return url.toString();
    } catch {
      return value.replace(/\/\/([^:@/]+):([^@/]+)@/, '//***:***@');
    }
  }

  private getConfiguredUrl() {
    const value = this.configService.get<string>('MQTT_URL') ?? process.env.MQTT_URL ?? '';
    const trimmed = value.trim();
    return trimmed || undefined;
  }
}

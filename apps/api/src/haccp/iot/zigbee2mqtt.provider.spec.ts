import { Subject } from 'rxjs';
import { IotSensorType } from '@prisma/client';
import { Zigbee2MqttProvider } from './zigbee2mqtt.provider';

describe('Zigbee2MqttProvider', () => {
  const createProvider = () => {
    const messages$ = new Subject<any>();
    const mqtt = {
      baseTopic: 'zigbee2mqtt',
      messages$: messages$.asObservable(),
      publish: jest.fn().mockResolvedValue(undefined),
    };
    return { provider: new Zigbee2MqttProvider(mqtt as any), mqtt, messages$ };
  };

  it('normalizes Zigbee2MQTT bridge devices without leaking coordinator entries', () => {
    const { provider } = createProvider();
    expect(provider.normalizeDevice({ type: 'Coordinator', friendly_name: 'Coordinator' })).toBeNull();
    expect(provider.normalizeDevice({
      ieee_address: '0xabc',
      friendly_name: 'Frigo 1',
      definition: { vendor: 'Aqara', model: 'WSDCGQ11LM', exposes: [{ features: [{ property: 'temperature' }, { property: 'humidity' }] }] },
    })).toMatchObject({
      externalId: 'Frigo 1',
      ieeeAddress: '0xabc',
      manufacturer: 'Aqara',
      model: 'WSDCGQ11LM',
      type: IotSensorType.TEMPERATURE_HUMIDITY,
    });
  });

  it('publishes pairing, rename and remove commands on Zigbee2MQTT request topics', async () => {
    const { provider, mqtt } = createProvider();
    await provider.startPairing(180);
    await provider.stopPairing();
    await provider.renameDevice('old-name', 'new-name');
    await provider.removeDevice('new-name');

    expect(mqtt.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/request/permit_join', { value: true, time: 180 });
    expect(mqtt.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/request/permit_join', { value: false });
    expect(mqtt.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/request/device/rename', { from: 'old-name', to: 'new-name' });
    expect(mqtt.publish).toHaveBeenCalledWith('zigbee2mqtt/bridge/request/device/remove', { id: 'new-name', force: true });
  });
});

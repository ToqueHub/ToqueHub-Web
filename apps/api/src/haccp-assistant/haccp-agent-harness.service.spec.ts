import { HaccpAgentHarnessService } from './haccp-agent-harness.service';

describe('HaccpAgentHarnessService', () => {
  it('prevents IoT administration from reaching Mistral tools', async () => {
    const mistral = { chatJson: jest.fn() };
    const service = new HaccpAgentHarnessService(mistral as any);
    const call = await service.decide('org', 'change le seuil du capteur frigo', {}, {});
    expect(call).toMatchObject({ tool: 'clarify', decision: 'deterministic' });
    expect(mistral.chatJson).not.toHaveBeenCalled();
  });

  it('prepares a temperature reading instead of writing it', async () => {
    const mistral = { chatJson: jest.fn() };
    const service = new HaccpAgentHarnessService(mistral as any);
    const call = await service.decide('org', 'il fait 4,2°C', { pendingIntent: 'temperature', activeEquipmentId: 'fridge-1' }, {});
    expect(call).toMatchObject({ tool: 'prepare_temperature_reading', args: { equipmentId: 'fridge-1', temperature: 4.2 }, decision: 'deterministic' });
  });

  it('accepts a bare temperature after equipment selection', async () => {
    const mistral = { chatJson: jest.fn() };
    const service = new HaccpAgentHarnessService(mistral as any);
    const call = await service.decide('org', '3', { pendingIntent: 'temperature', activeEquipmentId: 'freezer-1' }, {});
    expect(call).toMatchObject({ tool: 'prepare_temperature_reading', args: { equipmentId: 'freezer-1', temperature: 3 }, decision: 'deterministic' });
    expect(mistral.chatJson).not.toHaveBeenCalled();
  });
});

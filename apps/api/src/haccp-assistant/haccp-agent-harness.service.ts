import { Injectable } from '@nestjs/common';
import { MistralClientService } from '../mistral/mistral-client.service';
const TOOLS = ['get_haccp_dashboard', 'list_haccp_alerts', 'list_temperature_equipment', 'get_temperature_status', 'get_cleaning_status', 'prepare_temperature_reading', 'prepare_cleaning_session', 'prepare_corrective_control', 'clarify'];
const schema = { type: 'object', additionalProperties: false, required: ['tool', 'args', 'confidence'], properties: { tool: { type: 'string', enum: TOOLS }, args: { type: 'object' }, confidence: { type: 'number' } } };
@Injectable()
export class HaccpAgentHarnessService {
  constructor(private readonly mistral: MistralClientService) {}
  async decide(org: string, content: string, state: any, context: any) {
    const guarded = this.guard(content, state); if (guarded) return guarded;
    try {
      const value: any = await this.mistral.chatJson(org, [{ role: 'system', content: 'Tu es Kokki HACCP. Choisis exactement un outil. Les capteurs IoT sont en lecture seule : jamais appairage, seuil, affectation, suppression ou réglage. Toute écriture est un brouillon à valider, jamais une saisie directe. Réponds uniquement en JSON.' }, { role: 'user', content: JSON.stringify({ message: content, state, context, availableTools: TOOLS }) }], 'toquehub_haccp_tool_call', schema, { temperature: 0 });
      if (TOOLS.includes(value?.tool)) return { tool: value.tool, args: value.args || {}, confidence: Number(value.confidence || .7), decision: 'mistral' };
    } catch { /* fallback */ }
    return this.fallback(content, state);
  }
  private guard(content: string, state: any): any {
    // Lorsqu'un équipement vient d'être choisi, « 3 » est une réponse complète
    // au même titre que « 3 °C ». Ne pas laisser Mistral la réinterpréter.
    const temp = content.match(/(-?\d+(?:[,.]\d+)?)(?:\s*°?\s*c\b)?/i);
    if (state?.pendingIntent === 'temperature' && temp) return { tool: 'prepare_temperature_reading', args: { temperature: Number(temp[1].replace(',', '.')), equipmentId: state.activeEquipmentId }, confidence: .99, decision: 'deterministic' };
    if (/\b(appair|supprim.*capteur|seuil|renomm.*capteur|affect.*capteur)\b/i.test(content)) return { tool: 'clarify', args: { message: 'Je peux consulter les capteurs et leurs alertes, mais leurs réglages restent protégés.' }, confidence: .99, decision: 'deterministic' };
    return null;
  }
  private fallback(content: string, state: any): any {
    const t = content.toLowerCase();
    if (/\b(alerte|non.conform|hors plage|capteur)\b/.test(t)) return { tool: 'list_haccp_alerts', args: {}, confidence: .5, decision: 'fallback' };
    if (/\b(nettoy|surface|désinfect)\b/.test(t)) return { tool: 'prepare_cleaning_session', args: { action: /termin|cl[oô]tur/.test(t) ? 'complete' : /marqu|fait/.test(t) ? 'mark' : 'start' }, confidence: .5, decision: 'fallback' };
    if (/\b(temp[ée]rature|frigo|enceinte|froid)\b/.test(t)) {
      const n = content.match(/(-?\d+(?:[,.]\d+)?)\s*°?\s*c\b/i);
      if (n) return { tool: 'prepare_temperature_reading', args: { temperature: Number(n[1].replace(',', '.')) }, confidence: .5, decision: 'fallback' };
      if (/\b(relev[ée]|enregistr|saisir)\b/.test(t)) return { tool: 'prepare_temperature_reading', args: { equipmentName: content }, confidence: .6, decision: 'fallback' };
      return { tool: 'get_temperature_status', args: {}, confidence: .5, decision: 'fallback' };
    }
    if (/\b(score|conforme|haccp|contr[oô]le)\b/.test(t)) return { tool: 'get_haccp_dashboard', args: {}, confidence: .5, decision: 'fallback' };
    return { tool: 'clarify', args: { message: 'Je peux vérifier le score HACCP, les alertes, les températures et le nettoyage du jour.' }, confidence: .3, decision: 'fallback' };
  }
}

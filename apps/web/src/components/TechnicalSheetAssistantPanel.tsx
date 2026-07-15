import { FormEvent, useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { api } from '../api/client';
import type { TechnicalSheetAssistantChoice, TechnicalSheetAssistantConversation, TechnicalSheetAssistantDraft } from '../types';

type Item = { id: string; role: 'user' | 'assistant'; text: string; choices?: TechnicalSheetAssistantChoice[]; draftId?: string };
const welcome: Item = { id: 'welcome', role: 'assistant', text: 'Bonjour ! Je suis Kokki. Je peux préparer une fiche, analyser une recette PDF/photo, calculer un coût ou simuler des portions.' };

export function TechnicalSheetAssistantPanel({ token, isOpen, onClose, onOpenDraft }: { token: string; isOpen: boolean; onClose: () => void; onOpenDraft: (draft: TechnicalSheetAssistantDraft) => void }) {
  const [conversationId, setConversationId] = useState<string>();
  const [items, setItems] = useState<Item[]>([welcome]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [items, busy]);
  useEffect(() => { if (isOpen && !conversationId) void newConversation(); }, [isOpen]);
  async function newConversation() { const c = await api.createTechnicalSheetAssistantConversation(token); setConversationId(c.id); setItems(c.messages?.length ? c.messages.map((m) => ({ id: m.id, role: m.role === 'USER' ? 'user' : 'assistant', text: m.content, choices: m.metadata?.choices, draftId: m.metadata?.draftId || undefined })) : [welcome]); }
  async function send(text = message) { if (!text.trim() || busy) return; setBusy(true); setError(undefined); setItems((v) => [...v, { id: `${Date.now()}u`, role: 'user', text }]); setMessage(''); try { const id = conversationId || (await api.createTechnicalSheetAssistantConversation(token)).id; setConversationId(id); const result = await api.technicalSheetAssistantMessage(token, id, text); setItems((v) => [...v, { id: `${Date.now()}a`, role: 'assistant', text: result.assistantMessage, choices: result.choices, draftId: result.draftId }]); } catch (e: any) { setError(e.message || 'Kokki est indisponible.'); } finally { setBusy(false); } }
  async function choose(choice: TechnicalSheetAssistantChoice) { if (choice.type === 'draft_review' && choice.value) { try { onOpenDraft(await api.technicalSheetAssistantDraft(token, choice.value)); } catch (e: any) { setError(e.message); } return; } await send(choice.label); }
  async function attach(file?: File) { if (!file || busy) return; setBusy(true); setItems((v) => [...v, { id: `${Date.now()}u`, role: 'user', text: `Recette jointe : ${file.name}` }]); try { const id = conversationId || (await api.createTechnicalSheetAssistantConversation(token)).id; setConversationId(id); const result = await api.uploadTechnicalSheetAssistantAttachment(token, id, file); setItems((v) => [...v, { id: `${Date.now()}a`, role: 'assistant', text: result.assistantMessage, draftId: result.draftId, choices: [{ type: 'draft_review', label: 'Ouvrir le brouillon', value: result.draftId }] }]); } catch (e: any) { setError(e.message || 'Analyse impossible.'); } finally { setBusy(false); } }
  if (!isOpen) return null;
  return <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={onClose}><div className="modal-content-wrapper" style={{ width: 'min(680px, 96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><div><strong style={{ display: 'flex', gap: 7, alignItems: 'center' }}><Sparkles size={18} /> Kokki · Fiches Techniques</strong><small>Les fiches restent des brouillons jusqu’à votre enregistrement.</small></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
    <div ref={feedRef} style={{ overflowY: 'auto', minHeight: 280, maxHeight: '55vh', margin: '1rem 0', display: 'grid', gap: 10 }}>{items.map((item) => <div key={item.id} style={{ justifySelf: item.role === 'user' ? 'end' : 'start', maxWidth: '88%', padding: '10px 13px', borderRadius: 12, background: item.role === 'user' ? 'var(--primary, #0f766e)' : 'var(--surface-alt, #f1f5f9)', color: item.role === 'user' ? '#fff' : 'inherit', whiteSpace: 'pre-wrap' }}><div>{item.text}</div>{item.choices?.map((choice, i) => <button key={i} disabled={busy} onClick={() => void choose(choice)} style={{ display: 'block', marginTop: 8 }}><FileText size={14} /> {choice.label}</button>)}</div>)}{busy ? <small>Kokki réfléchit…</small> : null}</div>
    {error ? <div className="alert-modern error">{error}</div> : null}<div style={{ display: 'flex', gap: 8 }}><input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => void attach(e.target.files?.[0])} /><button title="Joindre une recette" onClick={() => fileRef.current?.click()}><Paperclip size={18} /></button><form style={{ flex: 1, display: 'flex', gap: 8 }} onSubmit={(e: FormEvent) => { e.preventDefault(); void send(); }}><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ex. crée une quiche lorraine pour 10 portions" /><button disabled={busy || !message.trim()}><Send size={17} /></button></form></div>
  </div></div>;
}

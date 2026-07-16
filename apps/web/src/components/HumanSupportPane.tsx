import { FormEvent, useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, Send, UserRound, X } from 'lucide-react';
import { api } from '../api/client';
import type { HumanSupportTicket } from '../types';

export function HumanSupportPane({ token, email, transcript, onUnreadChange }: { token: string; email: string; transcript: string; onUnreadChange?: (value: number) => void }) {
  const [ticket, setTicket] = useState<HumanSupportTicket | null>();
  const [message, setMessage] = useState(''); const [phone, setPhone] = useState(''); const [contactEmail, setContactEmail] = useState(email);
  const [file, setFile] = useState<File>(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const fileRef = useRef<HTMLInputElement>(null); const feedRef = useRef<HTMLDivElement>(null);
  const refresh = async () => { try { const active = await api.humanSupportActive(token); setTicket(active); if (active) { await api.markHumanSupportRead(token, active.id); } const unread = await api.humanSupportUnreadCount(token); onUnreadChange?.(unread.unread); } catch (e: any) { setError(e.message || 'Impossible de charger la discussion humaine.'); } };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer); }, [token]);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [ticket?.messages.length, busy]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if ((!message.trim() && !file) || busy) return; setBusy(true); setError(undefined); try { if (!ticket) { if (!contactEmail.trim()) throw new Error('Votre adresse e-mail est obligatoire.'); const created = await api.createHumanSupportTicket(token, { content: message.trim(), email: contactEmail.trim(), phone: phone.trim() || undefined, transcript }, file); setTicket(created); } else { await api.sendHumanSupportMessage(token, ticket.id, message.trim() || undefined, file); await refresh(); } setMessage(''); setFile(undefined); } catch (e: any) { setError(e.message || 'Impossible d’envoyer le message.'); } finally { setBusy(false); } };
  const close = async () => { if (!ticket || busy) return; setBusy(true); try { setTicket(await api.closeHumanSupportTicket(token, ticket.id)); } catch (e: any) { setError(e.message || 'Impossible de fermer la discussion.'); } finally { setBusy(false); } };
  const download = async (id: string, filename: string) => { try { const response = await fetch(api.humanSupportAttachmentUrl(id), { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Téléchargement impossible'); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); } catch (e: any) { setError(e.message); } };
  const closed = ticket?.status === 'CLOSED';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="human-support-banner">
        <UserRound size={16} />
        <span>
          Vous échangez avec un bénévole ToqueHub. Votre email, vos coordonnées facultatives et l’historique Kokki courant seront transmis à l’équipe d’aide.
        </span>
      </div>
      
      <div ref={feedRef} className="stock-chat-feed" style={{ flex: 1 }}>
        {!ticket ? (
          <div style={{ padding: 18, color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, textAlign: 'center', background: 'rgba(255, 255, 255, 0.5)', borderRadius: 16, margin: '16px 20px', border: '1px solid rgba(226, 232, 240, 0.6)' }}>
            Décrivez votre problème. Un bénévole recevra votre message dans Telegram et répondra ici.
          </div>
        ) : (
          ticket.messages.map((item) => (
            <div
              key={item.id}
              className={`stock-chat-feed-item ${item.author === 'USER' ? 'user' : 'assistant'}`}
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
                alignSelf: item.author === 'USER' ? 'flex-end' : 'flex-start',
                maxWidth: '85%'
              }}
            >
              {item.author !== 'USER' && (
                <div className="stock-chat-feed-avatar" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                  <UserRound size={14} />
                </div>
              )}
              <div className={`stock-chat-bubble-wrapper ${item.author === 'USER' ? 'user' : 'assistant'}`}>
                <div className="stock-chat-bubble">
                  {item.content}
                  {item.attachments.map((attachment) => (
                    <button
                      type="button"
                      key={attachment.id}
                      onClick={() => void download(attachment.id, attachment.filename)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, border: 0, background: 'transparent', padding: '7px 0 0', color: 'inherit', cursor: 'pointer' }}
                    >
                      <FileText size={14} />
                      {attachment.filename}
                    </button>
                  ))}
                </div>
                <div className="stock-chat-bubble-meta">
                  {item.author === 'USER' ? 'Vous' : item.author === 'VOLUNTEER' ? `${item.volunteerName || 'Bénévole'} · Bénévole` : 'ToqueHub'}
                  {item.deliveryStatus === 'FAILED' ? ' · non envoyé' : ''}
                </div>
              </div>
            </div>
          ))
        )}
        
        {ticket?.relayError ? (
          <div style={{ color: '#b91c1c', fontSize: 12, padding: '8px 16px', background: '#fef2f2', borderRadius: 8, margin: '8px 20px', border: '1px solid #fee2e2' }}>
            Connexion au bénévole en attente : {ticket.relayError}
          </div>
        ) : null}
        
        {ticket?.status === 'IN_PROGRESS' ? (
          <div style={{ color: '#047857', fontSize: 12, padding: '8px 16px', background: '#ecfdf5', borderRadius: 8, margin: '8px 20px', border: '1px solid #d1fae5' }}>
            {ticket.assignedVolunteer || 'Un bénévole'} a pris en charge votre demande.
          </div>
        ) : null}
      </div>

      {error ? (
        <div style={{ padding: '8px 16px', background: '#fef2f2', color: '#991b1b', fontSize: 12, borderTop: '1px solid #fee2e2' }}>
          {error}
        </div>
      ) : null}

      {ticket && !closed ? (
        <div style={{ padding: '0 24px 12px', display: 'flex', justifyContent: 'flex-end', background: 'rgba(255, 255, 255, 0.72)' }}>
          <button
            type="button"
            className="human-support-close-action-btn"
            onClick={() => void close()}
            disabled={busy}
          >
            Fermer la discussion
          </button>
        </div>
      ) : null}

      {closed ? (
        <div className="human-support-closed-bar">
          <span>Cette discussion est fermée.</span>
          <button
            type="button"
            onClick={() => {
              setTicket(null);
              setMessage('');
              setError(undefined);
            }}
          >
            Nouvelle demande
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="stock-chat-input-area">
          {!ticket ? (
            <div className="human-support-onboarding-inputs">
              <input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Email obligatoire"
                type="email"
                disabled={busy}
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Téléphone (facultatif)"
                disabled={busy}
              />
            </div>
          ) : null}
          {file ? (
            <div className="stock-chat-attachment-bar">
              <span>
                <Paperclip size={14} /> {file.name}
              </span>
              <button type="button" onClick={() => setFile(undefined)}>
                <X size={14} />
              </button>
            </div>
          ) : null}
          <div className="stock-chat-input-row">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,application/pdf,text/plain,.docx,.xlsx"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn btn-secondary btn-icon-only"
              disabled={busy}
              title="Joindre un fichier"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={18} />
            </button>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Écrire au bénévole…"
              disabled={busy}
            />
            <button
              className="btn btn-primary btn-icon-only"
              disabled={busy || (!message.trim() && !file)}
              style={{ background: '#0f766e', border: 'none' }}
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

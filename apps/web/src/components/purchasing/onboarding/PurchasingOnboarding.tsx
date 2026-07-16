import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  KeyRound,
  Mail,
  PackageCheck,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../../../api/client';
import { GuidedWizard } from '../../ui/GuidedWizard';
import { GuidedWelcome } from '../../ui/GuidedWelcome';
import type { PurchasingBootstrap, PurchasingEmailConnection } from '../../../types';
import { Field, messageOf } from '../components/PurchasingUi';
import { OrderComposerButton } from '../orders/OrderComposer';

const ONBOARDING_STEPS = [
  { id: 'welcome', label: 'Bienvenue', icon: Sparkles },
  { id: 'email', label: 'Messagerie fournisseur', icon: Mail },
  { id: 'draft', label: 'Première commande', icon: ShoppingCart },
] as const;

export function PurchasingOnboarding({
  bootstrap,
  forceFirstStep,
  hasOrder,
  token,
  canManage,
  onClose,
  onChanged,
  flash,
}: {
  bootstrap: PurchasingBootstrap;
  forceFirstStep?: boolean;
  hasOrder: boolean;
  token: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  flash: (kind: 'success' | 'error', message: string) => void;
}) {
  const restoredStep = ['catalog', 'suppliers'].includes(bootstrap.onboarding.currentStep)
    ? 'draft'
    : bootstrap.onboarding.currentStep;
  const initial = forceFirstStep
    ? 0
    : Math.max(
        0,
        ONBOARDING_STEPS.findIndex((step) => step.id === restoredStep),
      );
  const [step, setStep] = useState(initial);
  const [working, setWorking] = useState(false);
  const [resendError, setResendError] = useState<string>();
  const existingProvider = bootstrap.settings.activeEmailProvider;
  const [resendPath, setResendPath] = useState<'choice' | 'existing' | 'guide' | 'smtp' | 'google' | 'microsoft'>(
    existingProvider === 'GOOGLE' ? 'google' : existingProvider === 'MICROSOFT' ? 'microsoft' : 'choice',
  );
  const oauthPollRef = useRef<number | null>(null);
  const oauthCompletedRef = useRef(false);
  const [resend, setResend] = useState({
    apiKey: '',
    fromEmail: bootstrap.settings.fromEmail ?? '',
    fromName: bootstrap.settings.fromName ?? 'ToqueHub Achats',
    replyTo: bootstrap.settings.replyTo ?? '',
  });
  const [smtp, setSmtp] = useState({ senderEmail: '', senderName: bootstrap.settings.fromName ?? '', host: '', port: 465, secure: true, username: '', password: '' });
  const [connectedMailbox, setConnectedMailbox] = useState<{ senderEmail?: string | null; senderName?: string | null } | null>(null);
  const [emailConnections, setEmailConnections] = useState<PurchasingEmailConnection[]>([]);
  const [connectionSuccess, setConnectionSuccess] = useState<{ provider: string; email: string } | null>(null);
  const current = ONBOARDING_STEPS[step];
  const stepIndex = step + 1;
  const persist = async (
    nextIndex: number,
    options?: { skipEmailSetup?: boolean; complete?: boolean },
  ) => {
    setWorking(true);
    try {
      const completed = new Set(bootstrap.onboarding.completedSteps);
      completed.add(current.id);
      await api.updatePurchasingOnboarding(token, {
        currentStep: ONBOARDING_STEPS[Math.min(nextIndex, ONBOARDING_STEPS.length - 1)].id,
        completedSteps: [...completed],
        skippedEmailSetup: options?.skipEmailSetup ?? bootstrap.onboarding.skippedEmailSetup,
        completed: options?.complete,
      });
      if (options?.complete) {
        await onChanged();
        onClose();
        return;
      }
      setStep(nextIndex);
      await onChanged();
    } catch (err) {
      flash('error', messageOf(err));
    } finally {
      setWorking(false);
    }
  };
  const saveResend = async () => {
    setWorking(true);
    setResendError(undefined);
    try {
      if (resend.apiKey.trim()) {
        await api.updateOrganizationApiKeys(token, {
          resendApiKey: resend.apiKey.trim(),
        });
        setResend((current) => ({ ...current, apiKey: '' }));
      }
      await api.updatePurchasingSettings(token, {
        fromEmail: resend.fromEmail,
        fromName: resend.fromName,
        replyTo: resend.replyTo || undefined,
      });
      try {
        await api.testPurchasingResend(token);
      } catch (err) {
        const errorMessage = `La clé Resend est enregistrée, mais le test d’envoi a échoué : ${messageOf(err)}`;
        setResendError(errorMessage);
        flash('error', errorMessage);
        await onChanged();
        setWorking(false);
        return;
      }
      flash('success', 'Clé API Resend validée avec un e-mail de test sécurisé.');
      setConnectionSuccess({
        provider: 'Resend API',
        email: resend.fromEmail,
      });
      await onChanged();
    } catch (err) {
      const errorMessage = messageOf(err);
      setResendError(errorMessage);
      flash('error', errorMessage);
    } finally {
      setWorking(false);
    }
  };
  const saveSmtp = async () => {
    setWorking(true);
    setResendError(undefined);
    try {
      await api.configurePurchasingEmailConnection(token, { provider: 'SMTP', senderEmail: smtp.senderEmail, senderName: smtp.senderName, smtpHost: smtp.host, smtpPort: smtp.port, smtpSecure: smtp.secure, smtpUsername: smtp.username, smtpPassword: smtp.password });
      await api.testPurchasingEmailConnection(token, 'SMTP');
      await api.activatePurchasingEmailConnection(token, 'SMTP');
      flash('success', 'Messagerie SMTP connectée et prête à envoyer les commandes.');
      setConnectionSuccess({
        provider: 'SMTP',
        email: smtp.senderEmail,
      });
      await onChanged();
    } catch (err) {
      setResendError(messageOf(err));
      flash('error', messageOf(err));
    } finally {
      setWorking(false);
    }
  };
  const stopOAuthPolling = () => {
    if (oauthPollRef.current) window.clearInterval(oauthPollRef.current);
    oauthPollRef.current = null;
  };
  const completeOAuth = async () => {
    if (oauthCompletedRef.current) return;
    oauthCompletedRef.current = true;
    stopOAuthPolling();
    flash('success', 'Messagerie connectée et activée.');
    try {
      const connections = await api.purchasingEmailConnections(token);
      const conn = connections.find((c) => c.provider === (resendPath === 'google' ? 'GOOGLE' : 'MICROSOFT') && c.status === 'CONNECTED');
      setConnectionSuccess({
        provider: resendPath === 'google' ? 'Google Workspace' : 'Microsoft 365',
        email: conn?.senderEmail || conn?.senderName || 'Adresse connectée',
      });
      await onChanged();
    } catch {
      setConnectionSuccess({
        provider: resendPath === 'google' ? 'Google Workspace' : 'Microsoft 365',
        email: 'Adresse connectée',
      });
    } finally {
      setWorking(false);
    }
  };
  const pollOAuthConnection = (provider: 'GOOGLE' | 'MICROSOFT') => {
    stopOAuthPolling();
    let attempts = 0;
    const check = async () => {
      attempts += 1;
      try {
        const connections = await api.purchasingEmailConnections(token);
        if (connections.some((connection) => connection.provider === provider && connection.status === 'CONNECTED')) {
          await completeOAuth();
          return;
        }
      } catch {
        // The callback can still be finishing; keep polling for this short-lived popup flow.
      }
      if (attempts >= 90) {
        stopOAuthPolling();
        setWorking(false);
      }
    };
    void check();
    oauthPollRef.current = window.setInterval(() => void check(), 2000);
  };
  const connectOAuth = async (provider: 'GOOGLE' | 'MICROSOFT') => {
    setWorking(true);
    setResendError(undefined);
    oauthCompletedRef.current = false;
    try {
      const { url } = await api.startPurchasingEmailOAuth(token, provider);
      window.open(url, 'toquehub-purchasing-email', 'width=980,height=760');
      pollOAuthConnection(provider);
      setWorking(false);
    } catch (err) {
      const message = messageOf(err);
      setResendError(message);
      flash('error', message);
      setWorking(false);
    }
  };
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if ((event.data as { type?: string } | undefined)?.type !== 'toquehub:purchasing-email') return;
      if ((event.data as { ok?: boolean }).ok) {
        void completeOAuth();
      } else flash('error', 'La connexion à la messagerie a été interrompue.');
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // persist is intentionally captured with current onboarding state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash]);
  useEffect(() => () => stopOAuthPolling(), []);
  useEffect(() => {
    let active = true;
    void api.purchasingEmailConnections(token).then((connections) => {
      if (!active) return;
      setEmailConnections(connections);
      const connection = connections.find((item) => item.provider === existingProvider && item.status === 'CONNECTED');
      setConnectedMailbox(connection ?? null);
    }).catch(() => {
      if (active) {
        setEmailConnections([]);
        setConnectedMailbox(null);
      }
    });
    return () => { active = false; };
  }, [existingProvider, token]);
  const isConnected = (provider: PurchasingEmailConnection['provider']) =>
    emailConnections.some((connection) => connection.provider === provider && connection.status === 'CONNECTED');
  const progress = Math.round((stepIndex / ONBOARDING_STEPS.length) * 100);

  // SVG Logos variables for premium quality rendering
  const googleLogo = (
    <svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M12 5.04c1.67 0 3.17.58 4.35 1.71l3.25-3.25C17.63 1.63 14.98 1 12 1 7.35 1 3.39 3.65 1.5 7.5l3.8 2.95C6.2 7.57 8.87 5.04 12 5.04z" />
      <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.51h6.44c-.28 1.48-1.12 2.73-2.38 3.58l3.7 2.87c2.16-1.99 3.43-4.92 3.43-8.61z" />
      <path fill="#FBBC05" d="M5.3 14.5c-.24-.71-.38-1.47-.38-2.25s.14-1.54.38-2.25L1.5 7.05C.54 8.97 0 11.12 0 13.5s.54 4.53 1.5 6.45l3.8-2.95z" />
      <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.7-2.87c-1.03.69-2.34 1.1-4.26 1.1-3.13 0-5.8-2.53-6.75-5.41L1.45 15.8C3.34 19.65 7.3 23 12 23z" />
    </svg>
  );

  const microsoftLogo = (
    <svg viewBox="0 0 23 23" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="10.5" height="10.5" fill="#F25022" />
      <rect x="11.5" y="0" width="10.5" height="10.5" fill="#7FBA00" />
      <rect x="0" y="11.5" width="10.5" height="10.5" fill="#00A4EF" />
      <rect x="11.5" y="11.5" width="10.5" height="10.5" fill="#FFB900" />
    </svg>
  );

  const resendLogo = (
    <svg viewBox="0 0 32 32" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="black" />
      <path d="M9 22V10H15.5C18.1 10 20.2 11.9 20.2 14.3C20.2 16.1 19 17.6 17.4 18.2L21 22H17.2L13.9 18.2H11.5V22H9ZM11.5 15.7H15.2C16.1 15.7 16.8 15.1 16.8 14.3C16.8 13.5 16.1 13 15.2 13H11.5V15.7Z" fill="white" />
    </svg>
  );

  const smtpLogo = (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="8" rx="2" fill="#F1F5F9" stroke="#475569" />
      <rect x="2" y="14" width="20" height="8" rx="2" fill="#F1F5F9" stroke="#475569" />
      <circle cx="6" cy="6" r="1.2" fill="#10B981" />
      <circle cx="6" cy="18" r="1.2" fill="#10B981" />
      <path d="M20 10V14" stroke="#475569" strokeDasharray="2 2" />
    </svg>
  );

  const sidebar = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        height: '100%',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ShoppingCart size={28} color="#10b981" />
          <span
            style={{
              fontWeight: 850,
              fontSize: '1.2rem',
              color: 'white',
              letterSpacing: '-0.03em',
            }}
          >
            TOQUE<span style={{ color: '#10b981' }}>HUB</span> ACHATS
          </span>
        </div>

        <div>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: '#10b981',
              letterSpacing: '0.15em',
            }}
          >
            Installation guidée
          </span>
          <h3
            style={{
              color: 'white',
              fontSize: '1.35rem',
              marginTop: '0.3rem',
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            Assistant Achats
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {ONBOARDING_STEPS.map((item, index) => {
            const done =
              item.id === 'email'
                ? Boolean(bootstrap.settings.activeEmailProvider || bootstrap.settings.resendVerifiedAt)
                : bootstrap.onboarding.completedSteps.includes(item.id) || index < step;
            const isCurrent = index === step;
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={index <= step ? 0 : -1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                  color: done || isCurrent ? 'white' : 'rgba(255, 255, 255, 0.35)',
                  fontWeight: isCurrent ? 700 : 500,
                  fontSize: '0.9rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: index <= step ? 'pointer' : 'default',
                  padding: 0,
                  textAlign: 'left',
                  width: '100%',
                }}
                onClick={() => index <= step && setStep(index)}
                onKeyDown={(e) => {
                  if (index <= step && (e.key === 'Enter' || e.key === ' ')) {
                    setStep(index);
                  }
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: done
                      ? '#10b981'
                      : isCurrent
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(255, 255, 255, 0.05)',
                    border: isCurrent ? '1.5px solid #10b981' : '1px solid transparent',
                    color: done ? 'white' : isCurrent ? '#10b981' : 'inherit',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    flexShrink: 0,
                  }}
                >
                  {done ? '✓' : index + 1}
                </div>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        <div
          style={{
            padding: '1.25rem',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <ShieldCheck size={20} color="#10b981" style={{ marginBottom: '0.4rem' }} />
          <h4 style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>
            Données sécurisées
          </h4>
          <p
            style={{
              color: '#94a3b8',
              fontSize: '0.75rem',
              marginTop: '0.25rem',
              lineHeight: 1.45,
              margin: 0,
            }}
          >
            Les mots de passe et jetons e-mail restent chiffrés dans votre instance.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <GuidedWizard
      welcome={
        step === 0 ? (
          <GuidedWelcome
            title={
              <>
                Bienvenue sur le module <span>Achats fournisseurs</span>
              </>
            }
            description="Préparez vos commandes, envoyez-les depuis votre messagerie professionnelle et contrôlez chaque livraison avant la mise à jour de Stocks."
            benefits={[
              {
                icon: <FileText size={16} />,
                text: 'Créer des commandes depuis les produits et fournisseurs Stocks',
              },
              {
                icon: <Send size={16} />,
                text: 'Envoyer le PDF depuis Gmail, Microsoft, SMTP ou Resend avec une trace de chaque tentative',
              },
              {
                icon: <PackageCheck size={16} />,
                text: 'Comparer les BL et valider les mouvements une seule fois',
              },
            ]}
            illustration={<PurchasingCycleIllustration />}
            onNext={() => setStep(1)}
            onClose={onClose}
          />
        ) : undefined
      }
      sidebar={sidebar}
      step={stepIndex}
      totalSteps={ONBOARDING_STEPS.length}
      onClose={onClose}
    >
      {step === 1 && (
        <div
          className="stocks-onboarding-step purchasing-onboarding-step"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            height: '100%',
            minHeight: 0,
            justifyContent: 'space-between',
          }}
        >
          {connectionSuccess ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'var(--success-bg)',
                color: '#10b981',
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15)',
                marginBottom: '0.5rem',
                border: '2px solid rgba(16, 185, 129, 0.2)'
              }}>
                <CheckCircle2 size={40} />
              </div>

              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, color: '#10b981', letterSpacing: '0.05em' }}>Liaison validée</span>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 850, color: 'var(--text-main)', margin: '0.25rem 0 0.5rem' }}>
                  Compte connecté avec succès !
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', maxWidth: '480px', margin: '0 auto', lineHeight: 1.5 }}>
                  Votre compte <strong style={{ color: 'var(--text-main)' }}>{connectionSuccess.provider}</strong> est maintenant lié à ToqueHub pour l'envoi de vos commandes.
                </p>
              </div>

              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bcf0da',
                borderRadius: '16px',
                padding: '1rem 2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                margin: '0.5rem 0'
              }}>
                <Mail size={18} style={{ color: '#10b981' }} />
                <span style={{ color: '#14532d', fontWeight: 750, fontSize: '0.92rem' }}>
                  {connectionSuccess.email}
                </span>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                maxWidth: '420px',
                background: '#f8fafc',
                padding: '1rem',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <CheckCircle2 size={12} style={{ color: '#10b981' }} />
                  <span>Délivrabilité optimale configurée</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <CheckCircle2 size={12} style={{ color: '#10b981' }} />
                  <span>Les mails de commande partiront automatiquement de cette boîte</span>
                </div>
              </div>

              <div
                className="hr-catalog-actions sticky"
                style={{
                  borderTop: '1px solid #eef2f7',
                  background: 'rgba(255,255,255,0.96)',
                  padding: '1rem 0 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0,
                  margin: '1.5rem 0 0',
                  width: '100%'
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setConnectionSuccess(null);
                    setResendPath('choice');
                  }}
                  style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}
                >
                  <Mail size={16} /> Ajouter une autre messagerie
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void persist(2, { skipEmailSetup: false })}
                  style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}
                >
                  Suivant <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
                <div>
                  <span className="purchasing-stock-step-icon" style={{ display: 'grid', placeItems: 'center', width: '46px', height: '46px', borderRadius: '14px', background: 'var(--success-bg)', color: 'var(--primary)', marginBottom: '0.7rem' }}>
                    <KeyRound size={22} />
                  </span>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                    {resendPath === 'choice' ? "Canal d'expédition" : "Configuration de la messagerie"}
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.35rem', lineHeight: 1.5 }}>
                    {resendPath === 'choice'
                      ? "Sélectionnez le canal d'envoi de vos bons de commande à vos fournisseurs."
                      : "Associez votre service de messagerie professionnelle pour envoyer vos bons de commande en toute sécurité."}
                  </p>
                </div>

                {resendPath === 'choice' && (
                  <div className="onboarding-options-grid" style={{ marginTop: '0.5rem' }}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={`onboarding-option-card blue ${isConnected('GOOGLE') ? 'configured' : ''}`}
                      onClick={() => setResendPath('google')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setResendPath('google'); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="onboarding-option-icon" style={{ background: '#f0f6ff' }}>
                        {googleLogo}
                      </div>
                      <div className="onboarding-option-content">
                        <span className="onboarding-option-title">Google Workspace / Gmail</span>
                        <span className="onboarding-option-desc">
                          Liaison officielle via OAuth 2.0. Idéal pour envoyer depuis votre adresse professionnelle Google.
                        </span>
                        {isConnected('GOOGLE') && <span className="onboarding-option-configured">✓ Déjà configuré · Cliquer pour reconfigurer</span>}
                      </div>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      className={`onboarding-option-card orange ${isConnected('MICROSOFT') ? 'configured' : ''}`}
                      onClick={() => setResendPath('microsoft')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setResendPath('microsoft'); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="onboarding-option-icon" style={{ background: '#fff4f0' }}>
                        {microsoftLogo}
                      </div>
                      <div className="onboarding-option-content">
                        <span className="onboarding-option-title">Microsoft 365 / Outlook</span>
                        <span className="onboarding-option-desc">
                          Connexion instantanée via Microsoft Identity. Recommandé pour les adresses Outlook et Office 365.
                        </span>
                        {isConnected('MICROSOFT') && <span className="onboarding-option-configured">✓ Déjà configuré · Cliquer pour reconfigurer</span>}
                      </div>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      className={`onboarding-option-card emerald ${isConnected('SMTP') ? 'configured' : ''}`}
                      onClick={() => setResendPath('smtp')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setResendPath('smtp'); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="onboarding-option-icon" style={{ background: '#ecfdf5' }}>
                        {smtpLogo}
                      </div>
                      <div className="onboarding-option-content">
                        <span className="onboarding-option-title">Autre messagerie (SMTP)</span>
                        <span className="onboarding-option-desc">
                          Configuration universelle pour OVH, Infomaniak, Zoho Mail ou vos serveurs d'entreprise.
                        </span>
                        {isConnected('SMTP') && <span className="onboarding-option-configured">✓ Déjà configuré · Cliquer pour reconfigurer</span>}
                      </div>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      className={`onboarding-option-card ${bootstrap.settings.resendVerifiedAt ? 'configured' : ''}`}
                      onClick={() => setResendPath('guide')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setResendPath('guide'); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="onboarding-option-icon" style={{ background: '#f8fafc' }}>
                        {resendLogo}
                      </div>
                      <div className="onboarding-option-content">
                        <span className="onboarding-option-title">Service Resend (API)</span>
                        <span className="onboarding-option-desc">
                          Délivrabilité maximale pour les développeurs. Utilisez votre domaine d'envoi et clés d'API existants.
                        </span>
                        {bootstrap.settings.resendVerifiedAt && <span className="onboarding-option-configured">✓ Déjà configuré · Cliquer pour reconfigurer</span>}
                      </div>
                    </div>
                  </div>
                )}

                {(resendPath === 'google' || resendPath === 'microsoft') && (
                  <div className="purchasing-oauth-flow" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', maxWidth: '620px', margin: '0.5rem auto 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                          {isConnected(resendPath === 'google' ? 'GOOGLE' : 'MICROSOFT')
                            ? `${resendPath === 'google' ? 'Google Workspace / Gmail' : 'Microsoft 365 / Outlook'} connecté`
                            : `Connexion ${resendPath === 'google' ? 'Google Workspace' : 'Microsoft 365'}`}
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
                          {isConnected(resendPath === 'google' ? 'GOOGLE' : 'MICROSOFT')
                            ? 'Cette boîte est prête à envoyer vos bons de commande.'
                            : 'Authentification sécurisée OAuth 2.0 en cours d’autorisation.'}
                        </p>
                      </div>
                    </div>

                    <div className="purchasing-oauth-card" style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '2rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '1.5rem',
                      textAlign: 'center'
                    }}>
                      <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '14px',
                        background: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 'var(--shadow-premium)',
                        border: '1px solid #e2e8f0'
                      }}>
                        {resendPath === 'google' ? googleLogo : microsoftLogo}
                      </div>

                      <div>
                        <h4 style={{ margin: 0, fontWeight: 750, fontSize: '1rem' }}>
                          {isConnected(resendPath === 'google' ? 'GOOGLE' : 'MICROSOFT') ? 'Messagerie déjà configurée' : 'Garantie de Sécurité & Confidentialité'}
                        </h4>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.35rem', maxWidth: '420px', lineHeight: 1.45 }}>
                          {isConnected(resendPath === 'google' ? 'GOOGLE' : 'MICROSOFT')
                            ? <>Cette messagerie est déjà prête. Vous pouvez la reconfigurer à tout moment ; les bons de commande partiront depuis{' '}
                              <strong>{connectedMailbox?.senderName || connectedMailbox?.senderEmail || 'cette boîte'}</strong>
                              {connectedMailbox?.senderName && connectedMailbox.senderEmail ? ` (${connectedMailbox.senderEmail})` : ''}.</>
                            : `Vous allez être redirigé vers l'interface sécurisée de Microsoft ou Google pour autoriser l'envoi de vos commandes.`}
                        </p>
                      </div>

                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem',
                        width: '100%',
                        maxWidth: '360px',
                        background: 'white',
                        padding: '1rem',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        textAlign: 'left'
                      }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                          <span>Adresse d'expédition personnalisable</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                          <span>Aucun mot de passe n'est stocké par ToqueHub</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                          <span>Jeton de connexion chiffré dans votre base</span>
                        </div>
                      </div>
                    </div>

                    {resendError && (
                      <div className="alert-modern error" style={{ margin: 0 }}>
                        <AlertTriangle size={18} />
                        <span>{resendError}</span>
                      </div>
                    )}
                  </div>
                )}

                {resendPath === 'guide' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', maxWidth: '680px', margin: '0.5rem auto 0' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                        Activer Resend en 3 étapes
                      </h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
                        Suivez ce guide rapide pour configurer votre nom de domaine d'envoi.
                      </p>
                    </div>

                    <ol style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', listStyle: 'none', padding: 0, margin: 0 }}>
                      {[
                        {
                          step: 1,
                          title: "Création du compte Resend",
                          desc: "Inscrivez-vous gratuitement sur resend.com et validez votre adresse e-mail.",
                          link: "https://resend.com/signup",
                          text: "S'inscrire sur Resend"
                        },
                        {
                          step: 2,
                          title: "Vérification de votre domaine",
                          desc: "Dans l'onglet 'Domains', ajoutez votre domaine de messagerie (ex: restaurant.fr) et configurez les clés DNS SPF/DKIM.",
                          link: "https://resend.com/domains",
                          text: "Configurer mon domaine d'envoi"
                        },
                        {
                          step: 3,
                          title: "Génération de la clé API",
                          desc: "Générez une clé API avec les droits d'envoi ('Sending Access') et copiez-la.",
                          link: "https://resend.com/api-keys",
                          text: "Obtenir une clé API"
                        }
                      ].map((item) => (
                        <li key={item.step} style={{
                          display: 'flex',
                          gap: '1rem',
                          padding: '1rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          background: 'white'
                        }}>
                          <span style={{
                            display: 'grid',
                            placeItems: 'center',
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'var(--primary)',
                            color: 'white',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                            flexShrink: 0
                          }}>
                            {item.step}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                            <strong style={{ fontSize: '0.88rem', fontWeight: 750, color: 'var(--text-main)' }}>{item.title}</strong>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, lineHeight: 1.45 }}>{item.desc}</p>
                            <a href={item.link} target="_blank" rel="noreferrer" style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              color: 'var(--primary-dark)',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              textDecoration: 'none',
                              marginTop: '0.25rem'
                            }}>
                              {item.text} <ExternalLink size={12} />
                            </a>
                          </div>
                        </li>
                      ))}
                    </ol>

                    <div className="purchasing-resend-callout" style={{ margin: 0, padding: '1rem', borderRadius: '12px' }}>
                      <ShieldCheck size={20} />
                      <div>
                        <strong>💡 Quelle adresse d'expédition utiliser ?</strong>
                        <span>Une fois votre domaine vérifié (ex: restaurant.fr), vous pourrez utiliser n'importe quelle adresse comme <code>achats@restaurant.fr</code>.</span>
                      </div>
                    </div>
                  </div>
                )}

                {resendPath === 'existing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', maxWidth: '680px', margin: '0.5rem auto 0' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                        Paramètres de connexion Resend
                      </h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
                        Saisissez votre clé d'API et l'adresse de messagerie d'expédition validée.
                      </p>
                    </div>

                    <div className="purchasing-resend-callout" style={{ margin: 0, padding: '1rem', borderRadius: '12px' }}>
                      <ShieldCheck size={20} />
                      <div>
                        <strong>Sécurisé par défaut</strong>
                        <span>Le test d'envoi envoie un e-mail de validation via l'adresse de test standard.</span>
                      </div>
                    </div>

                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '1.5rem',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '1rem'
                    }}>
                      <div style={{ gridColumn: 'span 2' }}>
                        <Field label="Clé API Resend">
                          <input
                            type="password"
                            value={resend.apiKey}
                            onInput={(event) => setResend({ ...resend, apiKey: event.currentTarget.value })}
                            autoComplete="off"
                            placeholder={
                              bootstrap.settings.resendApiKeyConfigured
                                ? 'Clé enregistrée · saisir pour modifier'
                                : 'Saisissez votre clé API (re_...)'
                            }
                            style={{ width: '100%', borderRadius: '10px', height: '40px' }}
                          />
                        </Field>
                      </div>
                      <div>
                        <Field label="Adresse d’envoi vérifiée">
                          <input
                            type="email"
                            value={resend.fromEmail}
                            onChange={(event) => setResend({ ...resend, fromEmail: event.target.value })}
                            placeholder="commandes@restaurant.fr"
                            style={{ width: '100%', borderRadius: '10px', height: '40px' }}
                          />
                        </Field>
                      </div>
                      <div>
                        <Field label="Nom d’envoi">
                          <input
                            value={resend.fromName}
                            onChange={(event) => setResend({ ...resend, fromName: event.target.value })}
                            placeholder="Restaurant — Commandes"
                            style={{ width: '100%', borderRadius: '10px', height: '40px' }}
                          />
                        </Field>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <Field label="Adresse de réponse (Reply-to) - Facultatif">
                          <input
                            type="email"
                            value={resend.replyTo}
                            onChange={(event) => setResend({ ...resend, replyTo: event.target.value })}
                            placeholder="contact@restaurant.fr"
                            style={{ width: '100%', borderRadius: '10px', height: '40px' }}
                          />
                        </Field>
                      </div>
                    </div>

                    <p className="purchasing-stock-help" style={{ margin: 0 }}>
                      Le domaine de l’adresse d’envoi doit être validé sur Resend.{' '}
                      <button type="button" onClick={() => setResendPath('guide')} style={{ textDecoration: 'underline', color: 'var(--primary-dark)', fontWeight: 700 }}>
                        Voir le guide d'installation
                      </button>
                    </p>

                    {resendError && (
                      <div className="alert-modern error dismissible" style={{ margin: 0 }}>
                        <AlertTriangle size={18} />
                        <span>{resendError}</span>
                        <button className="icon-btn" onClick={() => setResendError(undefined)} aria-label="Fermer">
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {resendPath === 'smtp' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', maxWidth: '680px', margin: '0.5rem auto 0' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                        Configuration de la liaison SMTP
                      </h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
                        Connectez votre propre serveur SMTP professionnel pour envoyer vos e-mails de commande.
                      </p>
                    </div>

                    <div className="purchasing-resend-callout" style={{ margin: 0, padding: '1rem', borderRadius: '12px' }}>
                      <ShieldCheck size={20} />
                      <div>
                        <strong>Configuration recommandée</strong>
                        <span>Utilisez de préférence un mot de passe d'application dédié pour préserver la sécurité de votre boîte.</span>
                      </div>
                    </div>

                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '1.5rem',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '1rem'
                    }}>
                      <div>
                        <Field label="Adresse d’envoi">
                          <input
                            type="email"
                            value={smtp.senderEmail}
                            onChange={(event) => setSmtp({ ...smtp, senderEmail: event.target.value })}
                            placeholder="commandes@restaurant.fr"
                            style={{ width: '100%', borderRadius: '10px', height: '40px' }}
                          />
                        </Field>
                      </div>
                      <div>
                        <Field label="Nom affiché">
                          <input
                            value={smtp.senderName}
                            onChange={(event) => setSmtp({ ...smtp, senderName: event.target.value })}
                            placeholder="Restaurant — Achats"
                            style={{ width: '100%', borderRadius: '10px', height: '40px' }}
                          />
                        </Field>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                          <Field label="Serveur SMTP">
                            <input
                              value={smtp.host}
                              onChange={(event) => setSmtp({ ...smtp, host: event.target.value })}
                              placeholder="smtp.mail.ovh.net, smtp.zoho.eu, etc."
                              style={{ width: '100%', borderRadius: '10px', height: '40px' }}
                            />
                          </Field>
                          <Field label="Port">
                            <input
                              type="number"
                              value={smtp.port}
                              onChange={(event) => setSmtp({ ...smtp, port: Number(event.target.value) })}
                              placeholder="465"
                              style={{ width: '100%', borderRadius: '10px', height: '40px' }}
                            />
                          </Field>
                        </div>
                      </div>
                      <div>
                        <Field label="Identifiant / Nom d'utilisateur">
                          <input
                            value={smtp.username}
                            onChange={(event) => setSmtp({ ...smtp, username: event.target.value })}
                            placeholder="commandes@restaurant.fr"
                            style={{ width: '100%', borderRadius: '10px', height: '40px' }}
                          />
                        </Field>
                      </div>
                      <div>
                        <Field label="Mot de passe d’application">
                          <input
                            type="password"
                            value={smtp.password}
                            onChange={(event) => setSmtp({ ...smtp, password: event.target.value })}
                            autoComplete="new-password"
                            placeholder="••••••••••••••••"
                            style={{ width: '100%', borderRadius: '10px', height: '40px' }}
                          />
                        </Field>
                      </div>
                      <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center' }}>
                        <label className="purchasing-stock-help" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={smtp.secure}
                            onChange={(event) => setSmtp({ ...smtp, secure: event.target.checked })}
                            style={{ cursor: 'pointer' }}
                          />
                          Chiffrement TLS sécurisé (recommandé, port 465)
                        </label>
                      </div>
                    </div>

                    {resendError && (
                      <div className="alert-modern error" style={{ margin: 0 }}>
                        <AlertTriangle size={18} />
                        <span>{resendError}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className="hr-catalog-actions sticky"
                style={{
                  borderTop: '1px solid #eef2f7',
                  background: 'rgba(255,255,255,0.96)',
                  padding: '1rem 0 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0,
                  margin: '1rem 0 0',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={working}
                  onClick={() => {
                    if (resendPath !== 'choice') {
                      setResendPath('choice');
                    } else {
                      setStep(step - 1);
                    }
                  }}
                  style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}
                >
                  <ArrowLeft size={16} /> Retour
                </button>

                {resendPath === 'choice' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={working}
                    onClick={() => void persist(2, { skipEmailSetup: true })}
                    style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}
                  >
                    Configurer plus tard
                  </button>
                )}

                {resendPath === 'existing' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                      working ||
                      (!resend.apiKey.trim() && !bootstrap.settings.resendApiKeyConfigured) ||
                      !resend.fromEmail ||
                      !canManage
                    }
                    onClick={() => void saveResend()}
                    style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}
                  >
                    Enregistrer et tester Resend
                  </button>
                )}

                {resendPath === 'smtp' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={working || !canManage || !smtp.senderEmail || !smtp.host || !smtp.username || !smtp.password}
                    onClick={() => void saveSmtp()}
                    style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}
                  >
                    Tester et activer SMTP
                  </button>
                )}

                {(resendPath === 'google' || resendPath === 'microsoft') && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={working || !canManage}
                    onClick={() => {
                      const provider = resendPath === 'google' ? 'GOOGLE' : 'MICROSOFT';
                      void connectOAuth(provider);
                    }}
                    style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}
                  >
                    {isConnected(resendPath === 'google' ? 'GOOGLE' : 'MICROSOFT') ? `Reconfigurer ${resendPath === 'google' ? 'Google' : 'Microsoft'}` : `Connecter ${resendPath === 'google' ? 'Google' : 'Microsoft'}`} <ArrowRight size={16} />
                  </button>
                )}

                {resendPath === 'guide' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setResendPath('existing')}
                    style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}
                  >
                    J'ai mon domaine & clé API <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div
          className="stocks-onboarding-step purchasing-onboarding-step"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            height: '100%',
            minHeight: 0,
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
            <div>
              <span className="purchasing-stock-step-icon" style={{ display: 'grid', placeItems: 'center', width: '46px', height: '46px', borderRadius: '14px', background: 'var(--success-bg)', color: 'var(--primary)', marginBottom: '0.7rem' }}>
                <ShoppingCart size={22} />
              </span>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Créer la première commande</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.35rem', lineHeight: 1.5 }}>
                Préparez une commande réelle. Elle reste privée et modifiable tant qu’un utilisateur
                autorisé ne l’a pas envoyée.
              </p>
            </div>
            <div
              className="purchasing-final-flow"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'nowrap',
                margin: '1.5rem 0 2rem',
                width: '100%',
              }}
            >
              {[
                { label: 'Préparer', desc: 'Saisie de la commande', color: '#3b82f6', bg: '#eff6ff', icon: FileText },
                { label: 'Envoyer', desc: 'Mail automatique', color: '#10b981', bg: '#ecfdf5', icon: Send },
                { label: 'Réceptionner', desc: 'Entrée en stock', color: '#f59e0b', bg: '#fffbeb', icon: CheckCircle2 },
              ].reduce<React.ReactNode[]>((acc, item, idx) => {
                const Icon = item.icon;
                acc.push(
                  <motion.div
                    key={`card-${idx}`}
                    initial={{ opacity: 0, scale: 0.8, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.1, type: 'spring', stiffness: 120 }}
                    whileHover={{ scale: 1.05, y: -4, borderColor: item.color, boxShadow: '0 12px 24px rgba(0, 0, 0, 0.06)' }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: '1 1 0',
                      minWidth: '95px',
                      maxWidth: '160px',
                      height: '144px',
                      borderRadius: '24px',
                      background: 'white',
                      border: '1.5px solid #e2e8f0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                      cursor: 'pointer',
                      padding: '0.85rem 0.5rem',
                      textAlign: 'center',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '16px',
                        background: item.bg,
                        color: item.color,
                        display: 'grid',
                        placeItems: 'center',
                        marginBottom: '0.65rem',
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontWeight: 500, lineHeight: 1.25 }}>
                      {item.desc}
                    </span>
                  </motion.div>
                );

                if (idx < 2) {
                  acc.push(
                    <motion.span
                      key={`arrow-${idx}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 + 0.15 }}
                      style={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', flexShrink: 0, margin: '0 0.5rem' }}
                    >
                      <ArrowRight size={18} style={{ strokeWidth: 2.5 }} />
                    </motion.span>
                  );
                }
                return acc;
              }, [])}
            </div>
            <div className="purchasing-onboarding-inline-action" style={{ display: 'flex', alignItems: 'center', minHeight: '46px' }}>
              {hasOrder ? (
                <span className="purchasing-inline-note">
                  <CheckCircle2 size={17} /> Première commande prête.
                </span>
              ) : (
                <OrderComposerButton
                  bootstrap={bootstrap}
                  token={token}
                  flash={flash}
                  onSaved={() => void onChanged()}
                />
              )}
            </div>
          </div>

          <div
            className="hr-catalog-actions sticky"
            style={{
              borderTop: '1px solid #eef2f7',
              background: 'rgba(255,255,255,0.96)',
              padding: '1rem 0 1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
              margin: '1rem 0 0',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              disabled={working}
              onClick={() => setStep(step - 1)}
              style={{ borderRadius: '10px', padding: '0.5rem 1.25rem' }}
            >
              <ArrowLeft size={16} /> Retour
            </button>
            <div />
            <button
              type="button"
              className="btn btn-primary"
              disabled={working || !canManage || !hasOrder}
              onClick={() => void persist(step, { complete: true })}
              style={{ borderRadius: '10px', padding: '0.5rem 1.5rem' }}
            >
              Terminer et ouvrir Achats <Check size={16} />
            </button>
          </div>
        </div>
      )}
    </GuidedWizard>
  );
}

function PurchasingCycleIllustration() {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
      <div
        className="card-modern"
        style={{
          background: '#0f172a',
          color: 'white',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0 30px 60px rgba(9, 13, 22, 0.25)',
          padding: '1.5rem',
          borderRadius: '20px',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Cycle d'achats</span>
            <span
              className="badge badge-reception"
              style={{
                fontSize: '0.72rem',
                textTransform: 'none',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#10b981',
                borderColor: 'transparent',
              }}
            >
              Prêt
            </span>
          </div>

          {[
            { label: 'Préparer la commande', val: 100, color: '#10b981' },
            { label: 'Configuration Mail', val: 100, color: '#10b981' },
            { label: 'Réceptionner & valider', val: 100, color: '#f59e0b' },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.03)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{item.label}</span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Actif</span>
              </div>
              <div
                className="progress-bar-bg"
                style={{ height: '5px', background: 'rgba(255, 255, 255, 0.1)' }}
              >
                <div
                  className="progress-bar-fill"
                  style={{ width: `${item.val}%`, background: item.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

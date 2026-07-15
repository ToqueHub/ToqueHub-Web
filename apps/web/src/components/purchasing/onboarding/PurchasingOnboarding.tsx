import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe2,
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
import type { PurchasingBootstrap } from '../../../types';
import { Field, messageOf } from '../components/PurchasingUi';
import { OrderComposerButton } from '../orders/OrderComposer';

const ONBOARDING_STEPS = [
  { id: 'welcome', label: 'Bienvenue', icon: Sparkles },
  { id: 'email', label: 'Envoi Resend', icon: Mail },
  { id: 'draft', label: 'Première commande', icon: ShoppingCart },
] as const;

export function PurchasingOnboarding({
  bootstrap,
  hasOrder,
  token,
  canManage,
  onClose,
  onChanged,
  flash,
}: {
  bootstrap: PurchasingBootstrap;
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
  const initial = Math.max(
    0,
    ONBOARDING_STEPS.findIndex((step) => step.id === restoredStep),
  );
  const [step, setStep] = useState(initial);
  const [working, setWorking] = useState(false);
  const [resendError, setResendError] = useState<string>();
  const [resendPath, setResendPath] = useState<'choice' | 'existing' | 'guide'>(
    bootstrap.settings.resendApiKeyConfigured ? 'existing' : 'choice',
  );
  const [resend, setResend] = useState({
    apiKey: '',
    fromEmail: bootstrap.settings.fromEmail ?? '',
    fromName: bootstrap.settings.fromName ?? 'ToqueHub Achats',
    replyTo: bootstrap.settings.replyTo ?? '',
  });
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
      await persist(2, { skipEmailSetup: false });
    } catch (err) {
      const errorMessage = messageOf(err);
      setResendError(errorMessage);
      flash('error', errorMessage);
      setWorking(false);
    }
  };
  const progress = Math.round((stepIndex / ONBOARDING_STEPS.length) * 100);
  const sidebar = (
    <div className="purchasing-wizard-sidebar">
      <div>
        <div className="stocks-onboarding-brand">
          <ShoppingCart size={28} />
          <span>
            TOQUE<strong>HUB</strong> ACHATS
          </span>
        </div>
        <div>
          <span className="stocks-onboarding-kicker">Installation guidée</span>
          <h3>Kokki · Assistant Achats</h3>
        </div>
        <div className="stocks-onboarding-steps">
          {ONBOARDING_STEPS.map((item, index) => {
            const done =
              item.id === 'email'
                ? Boolean(bootstrap.settings.resendVerifiedAt)
                : bootstrap.onboarding.completedSteps.includes(item.id) || index < step;
            return (
              <button
                key={item.id}
                className={`${index === step ? 'active' : ''} ${done ? 'done' : ''}`}
                disabled={index > step}
                onClick={() => index <= step && setStep(index)}
              >
                <span>{done ? <Check size={14} /> : index + 1}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="purchasing-wizard-sidebar-footer">
        <div className="stocks-onboarding-status">
          <span>Configuration Achats</span>
          <strong>{progress}% prête</strong>
          <p>Produits Stocks recherchés à la demande selon le fournisseur</p>
        </div>
        <div className="purchasing-stock-security">
          <ShieldCheck size={20} />
          <strong>Données sécurisées</strong>
          <p>La clé Resend est masquée et n’est jamais renvoyée au navigateur.</p>
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
            description="Préparez vos commandes, envoyez-les avec Resend et contrôlez chaque livraison avant la mise à jour de Stocks."
            benefits={[
              {
                icon: <FileText size={16} />,
                text: 'Créer des commandes depuis les produits et fournisseurs Stocks',
              },
              {
                icon: <Send size={16} />,
                text: 'Envoyer le PDF par l’API Resend avec une trace de chaque tentative',
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
        <div className="stocks-onboarding-step purchasing-onboarding-step">
          <div>
            <span className="purchasing-stock-step-icon">
              <KeyRound size={22} />
            </span>
            <h2>Connecter Resend</h2>
            <p>
              Resend envoie les bons de commande. Dites-nous simplement si vous avez déjà un compte
              et une clé API.
            </p>
          </div>
          {resendPath === 'choice' && (
            <div className="purchasing-resend-choice">
              <button type="button" onClick={() => setResendPath('existing')}>
                <KeyRound size={23} />
                <strong>Oui, j’ai déjà une clé</strong>
                <span>Je renseigne ma clé et mon adresse d’envoi.</span>
                <ArrowRight size={18} />
              </button>
              <button type="button" onClick={() => setResendPath('guide')}>
                <Globe2 size={23} />
                <strong>Non, guidez-moi</strong>
                <span>Je crée mon compte, mon domaine et ma clé pas à pas.</span>
                <ArrowRight size={18} />
              </button>
            </div>
          )}
          {resendPath === 'guide' && (
            <div className="purchasing-resend-guide">
              <div className="purchasing-resend-guide-heading">
                <div>
                  <strong>Créer Resend en 3 étapes</strong>
                  <span>Gardez cette fenêtre ouverte pendant la configuration.</span>
                </div>
                <button type="button" onClick={() => setResendPath('choice')}>
                  Changer de choix
                </button>
              </div>
              <ol>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Créer votre compte Resend</strong>
                    <p>Inscrivez-vous, puis confirmez votre adresse e-mail.</p>
                    <a href="https://resend.com/signup" target="_blank" rel="noreferrer">
                      Ouvrir l’inscription Resend <ExternalLink size={14} />
                    </a>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Ajouter et vérifier votre domaine</strong>
                    <p>
                      Dans Domains, ajoutez votre domaine puis copiez chez votre hébergeur DNS les
                      enregistrements SPF et DKIM fournis. Attendez le statut « Verified ».
                    </p>
                    <a href="https://resend.com/domains" target="_blank" rel="noreferrer">
                      Ouvrir les domaines Resend <ExternalLink size={14} />
                    </a>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Créer la clé API</strong>
                    <p>
                      Créez une clé avec l’autorisation d’envoi, copiez-la immédiatement et revenez
                      ici. Resend ne l’affichera plus ensuite.
                    </p>
                    <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer">
                      Ouvrir les clés API <ExternalLink size={14} />
                    </a>
                  </div>
                </li>
              </ol>
              <div className="purchasing-resend-callout">
                <ShieldCheck size={20} />
                <div>
                  <strong>Quelle adresse saisir ensuite ?</strong>
                  <span>
                    Une adresse de votre domaine vérifié, par exemple achats@votre-domaine.fr. Elle
                    n’a pas besoin d’être une boîte mail existante ; utilisez « Adresse de réponse »
                    pour recevoir les retours.
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary purchasing-guide-ready"
                onClick={() => setResendPath('existing')}
              >
                J’ai mon domaine et ma clé <ArrowRight size={16} />
              </button>
            </div>
          )}
          {resendPath === 'existing' && (
            <>
              <div className="purchasing-resend-callout">
                <ShieldCheck size={20} />
                <div>
                  <strong>Connexion API sécurisée</strong>
                  <span>
                    Le test utilise delivered@resend.dev et ne sollicite aucun destinataire réel.
                  </span>
                </div>
              </div>
              <div className="form-row">
                <Field label="Clé API Resend">
                  <input
                    type="password"
                    value={resend.apiKey}
                    onInput={(event) => setResend({ ...resend, apiKey: event.currentTarget.value })}
                    autoComplete="off"
                    placeholder={
                      bootstrap.settings.resendApiKeyConfigured
                        ? 'Clé déjà enregistrée · saisir pour la remplacer'
                        : 're_…'
                    }
                  />
                </Field>
                <Field label="Adresse d’envoi vérifiée">
                  <input
                    type="email"
                    value={resend.fromEmail}
                    onChange={(event) => setResend({ ...resend, fromEmail: event.target.value })}
                    placeholder="achats@votre-domaine.fr"
                  />
                </Field>
                <Field label="Nom d’envoi">
                  <input
                    value={resend.fromName}
                    onChange={(event) => setResend({ ...resend, fromName: event.target.value })}
                  />
                </Field>
                <Field label="Adresse de réponse">
                  <input
                    type="email"
                    value={resend.replyTo}
                    onChange={(event) => setResend({ ...resend, replyTo: event.target.value })}
                    placeholder="Facultatif"
                  />
                </Field>
              </div>
              <p className="purchasing-stock-help">
                Le domaine de l’adresse d’envoi doit afficher « Verified » dans Resend.
                <button type="button" onClick={() => setResendPath('guide')}>
                  Voir le guide
                </button>
              </p>
              {resendError && (
                <div className="alert-modern error dismissible">
                  <AlertTriangle size={18} />
                  <span>{resendError}</span>
                  <button
                    className="icon-btn"
                    onClick={() => setResendError(undefined)}
                    aria-label="Fermer"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="stocks-onboarding-step purchasing-onboarding-step">
          <div>
            <span className="purchasing-stock-step-icon">
              <ShoppingCart size={22} />
            </span>
            <h2>Créer la première commande</h2>
            <p>
              Préparez une commande réelle. Elle reste privée et modifiable tant qu’un utilisateur
              autorisé ne l’a pas envoyée.
            </p>
          </div>
          <div className="purchasing-final-flow">
            <span>Préparer</span>
            <ArrowRight size={17} />
            <span>Envoyer</span>
            <ArrowRight size={17} />
            <span>Suivre</span>
            <ArrowRight size={17} />
            <span>Réceptionner</span>
          </div>
          <div className="purchasing-onboarding-inline-action">
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
      )}

      <div className="stocks-setup-actions purchasing-onboarding-actions">
        <button className="btn btn-secondary" disabled={working} onClick={() => setStep(step - 1)}>
          <ArrowLeft size={16} /> Retour
        </button>
        <div />
        {step === 1 && (
          <button
            className="btn btn-secondary"
            disabled={working}
            onClick={() => void persist(2, { skipEmailSetup: true })}
          >
            Configurer plus tard
          </button>
        )}
        {step === 1 && resendPath === 'existing' ? (
          <button
            className="btn btn-primary"
            disabled={
              working ||
              (!resend.apiKey.trim() && !bootstrap.settings.resendApiKeyConfigured) ||
              !resend.fromEmail ||
              !canManage
            }
            onClick={() => void saveResend()}
          >
            Enregistrer et tester Resend
          </button>
        ) : step === 1 ? null : step < ONBOARDING_STEPS.length - 1 ? (
          <button
            className="btn btn-primary"
            disabled={working || !canManage}
            onClick={() => void persist(step + 1)}
          >
            Continuer <ArrowRight size={16} />
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={working || !canManage || !hasOrder}
            onClick={() => void persist(step, { complete: true })}
          >
            Terminer et ouvrir Achats <Check size={16} />
          </button>
        )}
      </div>
    </GuidedWizard>
  );
}

function PurchasingCycleIllustration() {
  return (
    <div className="guided-welcome-card">
      <div>
        <strong>Cycle d’achat</strong>
        <span>Prêt</span>
      </div>
      {[
        ['Préparer la commande', 'Actif'],
        ['Envoyer avec Resend', 'Sécurisé'],
        ['Contrôler la réception', 'Traçable'],
      ].map(([label, status]) => (
        <article key={label}>
          <div>
            <strong>{label}</strong>
            <span>{status}</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" />
          </div>
        </article>
      ))}
    </div>
  );
}

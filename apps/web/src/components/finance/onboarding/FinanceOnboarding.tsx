import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Database,
  KeyRound,
  Landmark,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  WalletCards,
} from 'lucide-react';
import { api } from '../../../api/client';
import { useLanguage } from '../../../i18n';
import type { FinanceBootstrap } from '../../../types';
import { GuidedWelcome } from '../../ui/GuidedWelcome';
import { GuidedWizard } from '../../ui/GuidedWizard';

type CashService = 'LOYVERSE' | 'PAYPAL_POS' | 'FLATPAY';
type BusyAction = 'fennoa' | CashService;

const STEPS = [
  { label: 'Bienvenue', icon: Sparkles },
  { label: 'Vérité comptable', icon: Landmark },
  { label: 'Services de caisse', icon: WalletCards },
  { label: 'Configuration', icon: KeyRound },
  { label: 'Validation', icon: CheckCircle2 },
] as const;

const CASH_SERVICES: Array<{
  id: CashService;
  name: string;
  shortName: string;
  description: string;
  tone: string;
}> = [
  {
    id: 'LOYVERSE',
    name: 'Loyverse',
    shortName: 'L',
    description: 'Tickets, produits, TVA, remboursements et moyens de paiement.',
    tone: 'loyverse',
  },
  {
    id: 'PAYPAL_POS',
    name: 'PayPal / Zettle',
    shortName: 'P',
    description: 'Reçus, ventes, TVA et détail des paiements PayPal POS.',
    tone: 'paypal',
  },
  {
    id: 'FLATPAY',
    name: 'FlatPay',
    shortName: 'F',
    description: 'Rapports de caisse, commandes, ventes produits et affluence.',
    tone: 'flatpay',
  },
];

const DEFAULT_SCHEDULE = ['07:00', '15:00', '19:00', '23:00'];

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function posConnection(
  configuration: FinanceBootstrap['settings']['pos']['loyverse'],
  siteId: string,
) {
  return (
    configuration.connections?.find((connection) => connection.defaultSite?.id === siteId) ??
    (configuration.defaultSite?.id === siteId ? configuration : null)
  );
}

function flatpayConnection(configuration: FinanceBootstrap['settings']['flatpay'], siteId: string) {
  if (!configuration) return null;
  return (
    configuration.connections?.find((connection) => connection.defaultSite?.id === siteId) ??
    (configuration.defaultSite?.id === siteId ? configuration : null)
  );
}

function firstConfiguredSite(
  configuration:
    | FinanceBootstrap['settings']['pos']['loyverse']
    | FinanceBootstrap['settings']['flatpay'],
  fallback: string,
) {
  return (
    configuration?.connections?.find((connection) => connection.configured)?.defaultSite?.id ??
    (configuration?.configured ? configuration.defaultSite?.id : undefined) ??
    fallback
  );
}

export function FinanceOnboarding({
  token,
  data,
  onClose,
  onChanged,
  onComplete,
}: {
  token: string;
  data: FinanceBootstrap;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onComplete: () => Promise<void> | void;
}) {
  const { language } = useLanguage();
  const defaultSiteId = data.sites[0]?.id ?? '';
  const configuredServices = useMemo<CashService[]>(() => {
    const services: CashService[] = [];
    if (
      data.settings.pos.loyverse.configured ||
      data.settings.pos.loyverse.connections?.some(({ configured }) => configured)
    ) {
      services.push('LOYVERSE');
    }
    if (
      data.settings.pos.paypalPos.configured ||
      data.settings.pos.paypalPos.connections?.some(({ configured }) => configured)
    ) {
      services.push('PAYPAL_POS');
    }
    if (
      data.settings.flatpay?.configured ||
      data.settings.flatpay?.connections?.some(({ configured }) => configured)
    ) {
      services.push('FLATPAY');
    }
    return services;
  }, [data.settings.flatpay, data.settings.pos.loyverse, data.settings.pos.paypalPos]);

  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [showFennoaGuide, setShowFennoaGuide] = useState(false);
  const [fennoaConfigured, setFennoaConfigured] = useState(
    Boolean(data.settings.fennoa?.apiKeyConfigured),
  );
  const [fennoa, setFennoa] = useState({
    username: data.settings.fennoa?.username ?? '',
    apiKey: '',
    baseUrl: data.settings.fennoa?.baseUrl ?? 'https://app.fennoa.com/api',
    apiVersion: data.settings.fennoa?.apiVersion === 'v2' ? ('v2' as const) : ('v1' as const),
  });
  const [selectedServices, setSelectedServices] = useState<CashService[]>(configuredServices);
  const [serviceIndex, setServiceIndex] = useState(0);
  const [configuredNow, setConfiguredNow] = useState<string[]>([]);
  const [busy, setBusy] = useState<BusyAction>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const loyverseSiteId = firstConfiguredSite(data.settings.pos.loyverse, defaultSiteId);
  const paypalSiteId = firstConfiguredSite(data.settings.pos.paypalPos, defaultSiteId);
  const flatpaySiteId = firstConfiguredSite(data.settings.flatpay, defaultSiteId);
  const loyverseExisting = posConnection(data.settings.pos.loyverse, loyverseSiteId);
  const paypalExisting = posConnection(data.settings.pos.paypalPos, paypalSiteId);
  const flatpayExisting = flatpayConnection(data.settings.flatpay, flatpaySiteId);
  const defaultHistoryStart = `${new Date().getFullYear()}-01-01`;

  const [loyverse, setLoyverse] = useState({
    siteId: loyverseSiteId,
    secret: '',
    historyStart: loyverseExisting?.historyStart?.slice(0, 10) ?? defaultHistoryStart,
    schedule: loyverseExisting?.schedule?.length
      ? [...loyverseExisting.schedule].sort()
      : DEFAULT_SCHEDULE,
  });
  const [paypal, setPaypal] = useState({
    siteId: paypalSiteId,
    clientId: paypalExisting?.clientId ?? '',
    secret: '',
    historyStart: paypalExisting?.historyStart?.slice(0, 10) ?? defaultHistoryStart,
    schedule: paypalExisting?.schedule?.length
      ? [...paypalExisting.schedule].sort()
      : DEFAULT_SCHEDULE,
  });
  const [flatpay, setFlatpay] = useState({
    siteId: flatpaySiteId,
    username: flatpayExisting?.username ?? '',
    password: '',
    portalUrl: flatpayExisting?.portalUrl ?? 'https://portal.flatpay.com',
    historyStart: flatpayExisting?.historyStart?.slice(0, 10) ?? defaultHistoryStart,
    schedule: flatpayExisting?.automationSchedule?.length
      ? [...flatpayExisting.automationSchedule].sort()
      : DEFAULT_SCHEDULE,
  });

  const activeService = selectedServices[serviceIndex];
  const goTo = (next: number) => {
    setError(undefined);
    setSuccess(undefined);
    setStep(next);
    setFurthestStep((current) => Math.max(current, next));
  };

  const toggleService = (service: CashService) => {
    setSelectedServices((current) =>
      current.includes(service)
        ? current.filter((candidate) => candidate !== service)
        : CASH_SERVICES.map(({ id }) => id).filter(
            (candidate) => candidate === service || current.includes(candidate),
          ),
    );
  };

  const toggleSchedule = (
    time: string,
    current: string[],
    update: (schedule: string[]) => void,
  ) => {
    update(
      current.includes(time)
        ? current.filter((candidate) => candidate !== time)
        : [...current, time].sort(),
    );
  };

  const saveFennoa = async () => {
    if (!fennoa.username.trim()) {
      setError('Saisissez l’utilisateur ou l’alias API Fennoa.');
      return;
    }
    if (!fennoaConfigured && !fennoa.apiKey.trim()) {
      setError('Saisissez la clé API Fennoa pour la première connexion.');
      return;
    }
    setBusy('fennoa');
    setError(undefined);
    setSuccess(undefined);
    try {
      await api.configureFennoa(token, {
        username: fennoa.username.trim(),
        apiKey: fennoa.apiKey.trim() || undefined,
        baseUrl: fennoa.baseUrl.trim(),
        apiVersion: fennoa.apiVersion,
      });
      setFennoaConfigured(true);
      setFennoa((current) => ({ ...current, apiKey: '' }));
      try {
        const result = await api.testFennoa(token);
        setSuccess(
          language === 'en'
            ? `Connection verified · ${result.accountsCount} account(s) · ${result.periodsCount ?? 0} financial year(s).`
            : `Connexion validée · ${result.accountsCount} compte(s) · ${result.periodsCount ?? 0} exercice(s).`,
        );
      } catch (reason) {
        setError(
          language === 'en'
            ? `The connection was saved, but the Fennoa test failed: ${errorMessage(reason, 'check the API key permissions.')}`
            : `La connexion est enregistrée, mais le test Fennoa a échoué : ${errorMessage(reason, 'vérifiez les droits de la clé API.')}`,
        );
      }
      await onChanged();
    } catch (reason) {
      setError(errorMessage(reason, 'Impossible d’enregistrer la connexion Fennoa.'));
    } finally {
      setBusy(undefined);
    }
  };

  const serviceIsConfigured = (service: CashService, siteId: string) => {
    if (configuredNow.includes(`${service}:${siteId}`)) return true;
    if (service === 'LOYVERSE')
      return Boolean(posConnection(data.settings.pos.loyverse, siteId)?.configured);
    if (service === 'PAYPAL_POS')
      return Boolean(posConnection(data.settings.pos.paypalPos, siteId)?.configured);
    return Boolean(flatpayConnection(data.settings.flatpay, siteId)?.configured);
  };

  const saveActiveService = async () => {
    if (!activeService) {
      goTo(4);
      return;
    }
    setBusy(activeService);
    setError(undefined);
    setSuccess(undefined);
    try {
      if (activeService === 'LOYVERSE') {
        const existing = serviceIsConfigured(activeService, loyverse.siteId);
        if (!loyverse.siteId) throw new Error('Choisissez un établissement pour Loyverse.');
        if (!existing && !loyverse.secret.trim()) {
          throw new Error('Saisissez le jeton d’accès personnel Loyverse.');
        }
        if (!loyverse.schedule.length) throw new Error('Choisissez au moins un horaire Loyverse.');
        await api.configureFinancePos(token, 'loyverse', {
          siteId: loyverse.siteId,
          secret: loyverse.secret.trim() || undefined,
          historyStart: loyverse.historyStart,
          schedule: loyverse.schedule,
        });
        const result = await api.testFinancePos(token, 'loyverse', loyverse.siteId);
        setSuccess(result.message);
        setLoyverse((current) => ({ ...current, secret: '' }));
        setConfiguredNow((current) => [...current, `LOYVERSE:${loyverse.siteId}`]);
      } else if (activeService === 'PAYPAL_POS') {
        const existing = serviceIsConfigured(activeService, paypal.siteId);
        if (!paypal.siteId) throw new Error('Choisissez un établissement pour PayPal / Zettle.');
        if (!paypal.clientId.trim()) throw new Error('Saisissez le Client ID PayPal / Zettle.');
        if (!existing && !paypal.secret.trim())
          throw new Error('Saisissez la clé API PayPal / Zettle.');
        if (!paypal.schedule.length) throw new Error('Choisissez au moins un horaire PayPal.');
        await api.configureFinancePos(token, 'paypal_pos', {
          siteId: paypal.siteId,
          clientId: paypal.clientId.trim(),
          secret: paypal.secret.trim() || undefined,
          historyStart: paypal.historyStart,
          schedule: paypal.schedule,
        });
        const result = await api.testFinancePos(token, 'paypal_pos', paypal.siteId);
        setSuccess(result.message);
        setPaypal((current) => ({ ...current, secret: '' }));
        setConfiguredNow((current) => [...current, `PAYPAL_POS:${paypal.siteId}`]);
      } else {
        const existing = serviceIsConfigured(activeService, flatpay.siteId);
        if (!flatpay.siteId) throw new Error('Choisissez un établissement pour FlatPay.');
        if (!flatpay.username.trim()) throw new Error('Saisissez le compte FlatPay.');
        if (!existing && !flatpay.password) throw new Error('Saisissez le mot de passe FlatPay.');
        if (!flatpay.schedule.length) throw new Error('Choisissez au moins un horaire FlatPay.');
        await api.configureFlatpay(token, {
          siteId: flatpay.siteId,
          username: flatpay.username.trim(),
          password: flatpay.password || undefined,
          portalUrl: flatpay.portalUrl.trim(),
        });
        await api.installFlatpayAutomation(token, {
          siteId: flatpay.siteId,
          historyStart: flatpay.historyStart,
          schedule: flatpay.schedule,
        });
        setSuccess('Connexion FlatPay et synchronisations enregistrées.');
        setFlatpay((current) => ({ ...current, password: '' }));
        setConfiguredNow((current) => [...current, `FLATPAY:${flatpay.siteId}`]);
      }
      await onChanged();
      if (serviceIndex < selectedServices.length - 1) {
        setServiceIndex((current) => current + 1);
        setError(undefined);
        setSuccess(undefined);
      } else {
        goTo(4);
      }
    } catch (reason) {
      setError(errorMessage(reason, 'Impossible d’enregistrer ce service de caisse.'));
    } finally {
      setBusy(undefined);
    }
  };

  const sidebar = (
    <div className="finance-onboarding-sidebar">
      <div>
        <span>Installation guidée</span>
        <h3>Assistant Finance</h3>
      </div>
      <div className="finance-onboarding-step-list">
        {STEPS.map(({ label, icon: Icon }, index) => {
          const done = index < step || (index === 1 && fennoaConfigured);
          const active = index === step;
          return (
            <button
              type="button"
              key={label}
              className={`${active ? 'active' : ''} ${done ? 'done' : ''}`}
              disabled={index > furthestStep}
              onClick={() => index <= furthestStep && goTo(index)}
            >
              <span>{done ? <Check size={14} /> : <Icon size={14} />}</span>
              {label}
            </button>
          );
        })}
      </div>
      <div className="finance-onboarding-security">
        <ShieldCheck size={21} />
        <div>
          <strong>Secrets chiffrés</strong>
          <small>Les clés et mots de passe ne sont jamais renvoyés au navigateur.</small>
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
                Configurez votre <span>pilotage financier</span>
              </>
            }
            description="Reliez la comptabilité qui fait foi, puis les caisses qui apportent le détail opérationnel. L’assistant vous accompagne sans remplacer votre logiciel comptable."
            benefits={[
              {
                icon: <Landmark size={16} />,
                text: 'Connecter Fennoa comme vérité comptable par API sécurisée',
              },
              {
                icon: <Store size={16} />,
                text: 'Choisir Loyverse, PayPal / Zettle et FlatPay selon vos établissements',
              },
              {
                icon: <RefreshCw size={16} />,
                text: 'Valider les accès et planifier les synchronisations automatiquement',
              },
            ]}
            illustration={
              <div className="finance-onboarding-illustration" aria-hidden="true">
                <div>
                  <Landmark size={34} />
                  <span>Comptabilité</span>
                </div>
                <i>
                  <ArrowRight size={22} />
                </i>
                <div className="primary">
                  <WalletCards size={38} />
                  <span>ToqueHub Finance</span>
                </div>
                <i>
                  <ArrowLeft size={22} />
                </i>
                <div>
                  <Store size={34} />
                  <span>Caisses</span>
                </div>
              </div>
            }
            onNext={() => goTo(1)}
            onClose={onClose}
          />
        ) : undefined
      }
      sidebar={sidebar}
      step={step + 1}
      totalSteps={STEPS.length}
      onClose={onClose}
    >
      {step === 1 ? (
        <div className="finance-onboarding-page">
          <header className="finance-onboarding-heading">
            <span>Source de référence</span>
            <h2>Ajoutez votre vérité comptable</h2>
            <p>
              Fennoa reste la source officielle pour les comptes, écritures, exercices, soldes et
              budgets. ToqueHub lit ces données, sans créer d’écriture comptable.
            </p>
          </header>
          <section className="finance-onboarding-fennoa-card">
            <div className="finance-onboarding-provider-heading">
              <div className="finance-onboarding-logo fennoa">
                <Building2 size={23} />
              </div>
              <div>
                <strong>Fennoa</strong>
                <span>API comptable · Recommandé</span>
              </div>
              <span className={fennoaConfigured ? 'ready' : ''}>
                {fennoaConfigured ? <CheckCircle2 size={14} /> : <KeyRound size={14} />}
                {fennoaConfigured ? 'Déjà configuré' : 'À connecter'}
              </span>
            </div>
            <button
              type="button"
              className="finance-onboarding-help"
              aria-expanded={showFennoaGuide}
              onClick={() => setShowFennoaGuide((current) => !current)}
            >
              <KeyRound size={16} /> Comment obtenir une clé API Fennoa ?
              <ChevronDown size={17} className={showFennoaGuide ? 'open' : ''} />
            </button>
            {showFennoaGuide ? (
              <ol className="finance-onboarding-api-guide">
                <li>
                  <span>1</span>
                  <div>
                    <strong>Ouvrez Fennoa</strong>
                    <p>
                      Connectez-vous avec un compte autorisé à gérer les utilisateurs et les
                      intégrations.
                    </p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Créez un utilisateur API</strong>
                    <p>
                      Dans les paramètres Fennoa, ouvrez la gestion des utilisateurs ou des accès
                      API, puis créez un accès dédié à ToqueHub.
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Autorisez la lecture comptable</strong>
                    <p>
                      Accordez au minimum l’accès en lecture aux comptes, exercices, écritures,
                      soldes et budgets.
                    </p>
                  </div>
                </li>
                <li>
                  <span>4</span>
                  <div>
                    <strong>Copiez les deux valeurs</strong>
                    <p>
                      Collez ci-dessous l’utilisateur ou alias API, puis la clé générée. La clé sera
                      chiffrée côté serveur.
                    </p>
                  </div>
                </li>
              </ol>
            ) : null}
            <div className="finance-onboarding-form-grid">
              <label>
                <span>Utilisateur / alias API</span>
                <input
                  value={fennoa.username}
                  onChange={(event) => setFennoa({ ...fennoa, username: event.target.value })}
                  placeholder="Utilisateur API Fennoa"
                />
              </label>
              <label>
                <span>Clé API Fennoa</span>
                <input
                  type="password"
                  value={fennoa.apiKey}
                  onChange={(event) => setFennoa({ ...fennoa, apiKey: event.target.value })}
                  placeholder={
                    fennoaConfigured
                      ? 'Laisser vide pour conserver la clé'
                      : 'Clé créée dans Fennoa'
                  }
                  autoComplete="new-password"
                />
              </label>
              <label>
                <span>URL de l’API</span>
                <input
                  value={fennoa.baseUrl}
                  onChange={(event) => setFennoa({ ...fennoa, baseUrl: event.target.value })}
                />
              </label>
              <label>
                <span>Adaptateur</span>
                <select
                  value={fennoa.apiVersion}
                  onChange={(event) =>
                    setFennoa({ ...fennoa, apiVersion: event.target.value as 'v1' | 'v2' })
                  }
                >
                  <option value="v1">Fennoa API v1</option>
                  <option value="v2">Fennoa API v2</option>
                </select>
              </label>
            </div>
          </section>
          {error ? <div className="alert-modern error">{error}</div> : null}
          {success ? (
            <div className="alert-modern success">
              <CheckCircle2 size={16} /> {success}
            </div>
          ) : null}
          <footer className="finance-onboarding-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={Boolean(busy)}
              onClick={() => goTo(2)}
            >
              Configurer plus tard
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(busy)}
              onClick={() => void saveFennoa()}
            >
              {busy === 'fennoa' ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <ShieldCheck size={16} />
              )}
              Enregistrer et vérifier
            </button>
            {fennoaConfigured ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(busy)}
                onClick={() => goTo(2)}
              >
                Continuer <ArrowRight size={16} />
              </button>
            ) : null}
          </footer>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="finance-onboarding-page">
          <header className="finance-onboarding-heading">
            <span>Détail opérationnel</span>
            <h2>Quels services de caisse utilisez-vous ?</h2>
            <p>
              Cochez une ou plusieurs applications. Seules les configurations choisies seront
              ouvertes à l’étape suivante.
            </p>
          </header>
          <div className="finance-onboarding-services" role="group" aria-label="Services de caisse">
            {CASH_SERVICES.map((service) => {
              const selected = selectedServices.includes(service.id);
              const alreadyConfigured = configuredServices.includes(service.id);
              return (
                <button
                  type="button"
                  key={service.id}
                  className={selected ? 'selected' : ''}
                  aria-pressed={selected}
                  onClick={() => toggleService(service.id)}
                >
                  <span className={`finance-onboarding-brand ${service.tone}`}>
                    {service.shortName}
                  </span>
                  <span>
                    <strong>{service.name}</strong>
                    <small>{service.description}</small>
                    {alreadyConfigured ? (
                      <em>
                        <CheckCircle2 size={13} /> Déjà configuré
                      </em>
                    ) : null}
                  </span>
                  <i>{selected ? <Check size={16} /> : null}</i>
                </button>
              );
            })}
          </div>
          <div className="finance-onboarding-selection-note">
            <ShieldCheck size={17} />
            <span>
              Vous pourrez ajouter, retirer ou rattacher un autre compte depuis l’onglet{' '}
              <strong>Sources</strong>.
            </span>
          </div>
          <footer className="finance-onboarding-actions">
            <button type="button" className="btn btn-secondary" onClick={() => goTo(1)}>
              <ArrowLeft size={16} /> Retour
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setServiceIndex(0);
                goTo(selectedServices.length ? 3 : 4);
              }}
            >
              {selectedServices.length
                ? language === 'en'
                  ? `Set up ${selectedServices.length} ${selectedServices.length === 1 ? 'service' : 'services'}`
                  : `Configurer ${selectedServices.length} ${selectedServices.length === 1 ? 'service' : 'services'}`
                : 'Aucun service pour le moment'}{' '}
              <ArrowRight size={16} />
            </button>
          </footer>
        </div>
      ) : null}

      {step === 3 && activeService ? (
        <div className="finance-onboarding-page">
          <header className="finance-onboarding-heading service">
            <span>
              {language === 'en'
                ? `Service ${serviceIndex + 1} of ${selectedServices.length}`
                : `Service ${serviceIndex + 1} sur ${selectedServices.length}`}
            </span>
            <h2>
              {language === 'en' ? 'Set up' : 'Configurez'}{' '}
              {CASH_SERVICES.find(({ id }) => id === activeService)?.name}
            </h2>
            <p>
              Associez le compte à un établissement et choisissez les horaires de récupération
              automatique.
            </p>
          </header>
          <div className="finance-onboarding-service-progress">
            {selectedServices.map((service, index) => (
              <span key={service} className={index <= serviceIndex ? 'active' : ''} />
            ))}
          </div>
          <section className="finance-onboarding-configuration">
            <div className="finance-onboarding-provider-heading compact">
              <span
                className={`finance-onboarding-brand ${CASH_SERVICES.find(({ id }) => id === activeService)?.tone}`}
              >
                {CASH_SERVICES.find(({ id }) => id === activeService)?.shortName}
              </span>
              <div>
                <strong>{CASH_SERVICES.find(({ id }) => id === activeService)?.name}</strong>
                <span>Connexion sécurisée</span>
              </div>
            </div>
            {activeService === 'LOYVERSE' ? (
              <ServiceFields
                sites={data.sites}
                siteId={loyverse.siteId}
                onSiteId={(siteId) => setLoyverse({ ...loyverse, siteId })}
                historyStart={loyverse.historyStart}
                onHistoryStart={(historyStart) => setLoyverse({ ...loyverse, historyStart })}
                schedule={loyverse.schedule}
                onToggleSchedule={(time) =>
                  toggleSchedule(time, loyverse.schedule, (schedule) =>
                    setLoyverse({ ...loyverse, schedule }),
                  )
                }
              >
                <label className="wide">
                  <span>Jeton d’accès personnel Loyverse</span>
                  <input
                    type="password"
                    value={loyverse.secret}
                    onChange={(event) => setLoyverse({ ...loyverse, secret: event.target.value })}
                    placeholder={
                      serviceIsConfigured('LOYVERSE', loyverse.siteId)
                        ? 'Laisser vide pour conserver le jeton'
                        : 'Jeton Loyverse'
                    }
                    autoComplete="new-password"
                  />
                </label>
              </ServiceFields>
            ) : null}
            {activeService === 'PAYPAL_POS' ? (
              <ServiceFields
                sites={data.sites}
                siteId={paypal.siteId}
                onSiteId={(siteId) => setPaypal({ ...paypal, siteId })}
                historyStart={paypal.historyStart}
                onHistoryStart={(historyStart) => setPaypal({ ...paypal, historyStart })}
                schedule={paypal.schedule}
                onToggleSchedule={(time) =>
                  toggleSchedule(time, paypal.schedule, (schedule) =>
                    setPaypal({ ...paypal, schedule }),
                  )
                }
              >
                <label>
                  <span>Client ID PayPal / Zettle</span>
                  <input
                    value={paypal.clientId}
                    onChange={(event) => setPaypal({ ...paypal, clientId: event.target.value })}
                    placeholder="Client ID du compte marchand"
                  />
                </label>
                <label>
                  <span>Clé API PayPal / Zettle</span>
                  <input
                    type="password"
                    value={paypal.secret}
                    onChange={(event) => setPaypal({ ...paypal, secret: event.target.value })}
                    placeholder={
                      serviceIsConfigured('PAYPAL_POS', paypal.siteId)
                        ? 'Laisser vide pour conserver la clé'
                        : 'Clé API signée'
                    }
                    autoComplete="new-password"
                  />
                </label>
              </ServiceFields>
            ) : null}
            {activeService === 'FLATPAY' ? (
              <ServiceFields
                sites={data.sites}
                siteId={flatpay.siteId}
                onSiteId={(siteId) => setFlatpay({ ...flatpay, siteId })}
                historyStart={flatpay.historyStart}
                onHistoryStart={(historyStart) => setFlatpay({ ...flatpay, historyStart })}
                schedule={flatpay.schedule}
                onToggleSchedule={(time) =>
                  toggleSchedule(time, flatpay.schedule, (schedule) =>
                    setFlatpay({ ...flatpay, schedule }),
                  )
                }
              >
                <label>
                  <span>Compte FlatPay</span>
                  <input
                    value={flatpay.username}
                    onChange={(event) => setFlatpay({ ...flatpay, username: event.target.value })}
                    autoComplete="username"
                  />
                </label>
                <label>
                  <span>Mot de passe FlatPay</span>
                  <input
                    type="password"
                    value={flatpay.password}
                    onChange={(event) => setFlatpay({ ...flatpay, password: event.target.value })}
                    placeholder={
                      serviceIsConfigured('FLATPAY', flatpay.siteId)
                        ? 'Laisser vide pour conserver'
                        : 'Mot de passe FlatPay'
                    }
                    autoComplete="new-password"
                  />
                </label>
                <label className="wide">
                  <span>Portail FlatPay</span>
                  <input
                    value={flatpay.portalUrl}
                    onChange={(event) => setFlatpay({ ...flatpay, portalUrl: event.target.value })}
                  />
                </label>
              </ServiceFields>
            ) : null}
          </section>
          {error ? <div className="alert-modern error">{error}</div> : null}
          {success ? (
            <div className="alert-modern success">
              <CheckCircle2 size={16} /> {success}
            </div>
          ) : null}
          <footer className="finance-onboarding-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={Boolean(busy)}
              onClick={() => (serviceIndex ? setServiceIndex((current) => current - 1) : goTo(2))}
            >
              <ArrowLeft size={16} /> Retour
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(busy)}
              onClick={() => void saveActiveService()}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}
              {serviceIndex < selectedServices.length - 1
                ? 'Enregistrer et continuer'
                : 'Enregistrer et valider'}
            </button>
          </footer>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="finance-onboarding-complete">
          <div className="finance-onboarding-complete-icon">
            <CheckCircle2 size={39} />
          </div>
          <span>Configuration terminée</span>
          <h2>Votre espace Finance est prêt</h2>
          <p>
            La vérité comptable et les services sélectionnés sont enregistrés. Les premières
            synchronisations peuvent maintenant alimenter le cockpit.
          </p>
          <div className="finance-onboarding-summary">
            <div>
              <Landmark size={19} />
              <span>
                <strong>Vérité comptable</strong>
                <small>{fennoaConfigured ? 'Fennoa connecté' : 'À configurer plus tard'}</small>
              </span>
              <em className={fennoaConfigured ? 'ready' : ''}>
                {fennoaConfigured ? <Check size={14} /> : '—'}
              </em>
            </div>
            <div>
              <WalletCards size={19} />
              <span>
                <strong>Services de caisse</strong>
                <small>
                  {selectedServices.length
                    ? selectedServices
                        .map((service) => CASH_SERVICES.find(({ id }) => id === service)?.name)
                        .join(' · ')
                    : 'Aucun pour le moment'}
                </small>
              </span>
              <em className={selectedServices.length ? 'ready' : ''}>
                {selectedServices.length ? <Check size={14} /> : '—'}
              </em>
            </div>
            <div>
              <Database size={19} />
              <span>
                <strong>Gestion des sources</strong>
                <small>Disponible à tout moment dans Finance</small>
              </span>
              <em className="ready">
                <Check size={14} />
              </em>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary finance-onboarding-dashboard-button"
            onClick={() => void onComplete()}
          >
            <CircleDollarSign size={18} /> Retour au dashboard
          </button>
        </div>
      ) : null}
    </GuidedWizard>
  );
}

function ServiceFields({
  sites,
  siteId,
  onSiteId,
  historyStart,
  onHistoryStart,
  schedule,
  onToggleSchedule,
  children,
}: {
  sites: FinanceBootstrap['sites'];
  siteId: string;
  onSiteId: (siteId: string) => void;
  historyStart: string;
  onHistoryStart: (value: string) => void;
  schedule: string[];
  onToggleSchedule: (time: string) => void;
  children: ReactNode;
}) {
  const { language } = useLanguage();
  return (
    <>
      <div className="finance-onboarding-form-grid">
        <label className="wide">
          <span>Établissement ToqueHub</span>
          <select value={siteId} onChange={(event) => onSiteId(event.target.value)}>
            <option value="" disabled>
              Choisir un établissement
            </option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        {children}
        <label className="wide">
          <span>Récupérer l’historique depuis</span>
          <input
            type="date"
            value={historyStart}
            onChange={(event) => onHistoryStart(event.target.value)}
          />
        </label>
      </div>
      <div className="finance-onboarding-schedule">
        <span>Horaires de synchronisation</span>
        <div>
          {DEFAULT_SCHEDULE.map((time) => (
            <button
              type="button"
              key={time}
              className={schedule.includes(time) ? 'active' : ''}
              onClick={() => onToggleSchedule(time)}
            >
              {language === 'en' ? time : time.replace(':00', 'h')}
            </button>
          ))}
        </div>
        <small>
          Deux jours sont rejoués à chaque passage pour intégrer les corrections tardives sans
          doublon.
        </small>
      </div>
    </>
  );
}

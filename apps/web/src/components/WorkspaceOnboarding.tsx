import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChefHat,
  Factory,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Thermometer,
  TrendingUp,
  UsersRound,
  Utensils,
  X,
} from 'lucide-react';
import type {
  WorkspaceOnboardingState,
  WorkspaceOnboardingStep,
} from '../types';

type StarterAppId = 'stocks' | 'technical-sheets' | 'haccp';
type InstallStatus = 'pending' | 'installing' | 'done' | 'failed';

const assistantSteps: WorkspaceOnboardingStep[] = [
  'WELCOME',
  'ECOSYSTEM',
  'STARTER_BUNDLE',
  'INSTALLATION',
  'MINI_TOUR',
];

const starterApps: Array<{
  id: StarterAppId;
  title: string;
  stepTag: string;
  description: string;
  icon: typeof Package;
  tone: string;
  tags: string[];
}> = [
  {
    id: 'stocks',
    title: 'Stocks',
    stepTag: 'Socle Matière',
    description: 'Gestion centralisée des produits, unités, fournisseurs et mouvements de stock auditables.',
    icon: Package,
    tone: 'emerald',
    tags: ['Produits & Unités', 'Fournisseurs', 'Emplacements'],
  },
  {
    id: 'technical-sheets',
    title: 'Fiches Techniques',
    stepTag: 'Rentabilité Cuisine',
    description: 'Création de recettes, calcul des portions, gestion des allergènes et coûts matière réels.',
    icon: ChefHat,
    tone: 'amber',
    tags: ['Recettes & Portions', 'Allergènes', 'Marge & Coûts'],
  },
  {
    id: 'haccp',
    title: 'HACCP & Capteurs',
    stepTag: 'Hygiène & Sécurité',
    description: 'Suivi automatisé 24/7, températures via capteurs IoT, plan de nettoyage et traçabilité.',
    icon: Thermometer,
    tone: 'purple',
    tags: ['Capteurs IoT 24/7', 'Checklists', 'Alertes Température'],
  },
];

const extraApps: Array<{
  id: string;
  title: string;
  category: string;
  description: string;
  icon: typeof Package;
  tone: string;
  tag: string;
}> = [
  {
    id: 'production',
    title: 'Production',
    category: 'Orchestration Cuisine',
    description: 'Ordres de fabrication, recalcul des besoins et déstockage automatique.',
    icon: Factory,
    tone: 'indigo',
    tag: 'Ordres & Fabrications',
  },
  {
    id: 'purchasing',
    title: 'Achats',
    category: 'Approvisionnement',
    description: 'Commandes fournisseurs, envoi de PDF et contrôles de réception BL.',
    icon: ShoppingCart,
    tone: 'emerald',
    tag: 'Commandes & BL',
  },
  {
    id: 'planning',
    title: 'Planning',
    category: 'Planification',
    description: 'Plannings d’équipe par service, affectations par poste et heures.',
    icon: CalendarCheck,
    tone: 'cyan',
    tag: 'Planning & Équipe',
  },
  {
    id: 'hr',
    title: 'RH',
    category: 'Ressources Humaines',
    description: 'Référentiel collaborateurs, services, postes et organigramme.',
    icon: UsersRound,
    tone: 'purple',
    tag: 'Collaborateurs',
  },
  {
    id: 'menus',
    title: 'Menus',
    category: 'Cartes & Menus',
    description: 'Création de plans de menus, grilles de service et déclinaisons.',
    icon: Utensils,
    tone: 'amber',
    tag: 'Grilles & Cartes',
  },
  {
    id: 'rnm-prices',
    title: 'Cours des Produits',
    category: 'Veille Marché',
    description: 'Indices de prix agricoles RNM et tendances des cours de marché.',
    icon: TrendingUp,
    tone: 'emerald',
    tag: 'Mercuriales & Prix',
  },
];

const ecosystemGroups = [
  {
    id: 'matiere',
    title: 'Matière & cuisine',
    icon: ChefHat,
    tone: 'emerald',
    badge: 'Socle Central',
    path: ['Stocks', 'Fiches Techniques', 'Production', 'Menus'],
    detail: 'Un seul catalogue matière, de la réception au menu servi.',
  },
  {
    id: 'appro',
    title: 'Approvisionnement',
    icon: ShoppingCart,
    tone: 'cyan',
    badge: 'Flux Direct',
    path: ['Stocks', 'Achats'],
    detail: 'Les commandes et réceptions réutilisent produits et fournisseurs.',
  },
  {
    id: 'equipe',
    title: 'Équipe',
    icon: UsersRound,
    tone: 'purple',
    badge: 'Ressources',
    path: ['RH', 'Planning'],
    detail: 'Les personnes, services et postes alimentent les plannings.',
  },
  {
    id: 'haccp-capteurs',
    title: 'HACCP & Capteurs',
    icon: Thermometer,
    tone: 'amber',
    badge: 'IoT & Hygiène',
    path: ['HACCP', 'Capteurs IoT', 'Relevés & Alertes'],
    detail: 'Relevés de températures automatiques 24/7 par capteurs sans fil, alertes instantanées et traçabilité hygiène.',
  },
];

const miniTourSteps = [
  {
    target: 'dashboard',
    title: 'Votre poste de pilotage',
    description:
      'Le dashboard rassemble les indicateurs, les priorités et les raccourcis utiles à votre établissement.',
  },
  {
    target: 'installed-apps',
    title: 'Vos applications installées',
    description:
      'Les modules actifs apparaissent ici. Chacun conserve son propre guide de configuration.',
  },
  {
    target: 'app-store',
    title: 'Le Toque Store',
    description:
      'Ajoutez ensuite Production, Menus, Achats, RH ou Planning quand votre socle est prêt.',
  },
  {
    target: 'help',
    title: 'Documentation et aide',
    description:
      'Retrouvez la documentation complète et relancez cette visite depuis l’espace d’aide.',
  },
] as const;

interface WorkspaceOnboardingProps {
  state: WorkspaceOnboardingState;
  firstName: string;
  organizationName: string;
  installedApps: string[];
  replay?: boolean;
  onProgress: (step: WorkspaceOnboardingStep) => Promise<void>;
  onDefer: () => Promise<void>;
  onCloseReplay: () => void;
  onInstallApp: (appId: string) => Promise<void>;
  onFinish: (configureStocks: boolean) => Promise<void>;
  onPrepareMiniTour: () => void;
}

export function WorkspaceOnboarding({
  state,
  firstName,
  organizationName,
  installedApps,
  replay = false,
  onProgress,
  onDefer,
  onCloseReplay,
  onInstallApp,
  onFinish,
  onPrepareMiniTour,
}: WorkspaceOnboardingProps) {
  const initialStep =
    replay || !state.currentStep || !assistantSteps.includes(state.currentStep)
      ? 'WELCOME'
      : state.currentStep;
  const [step, setStep] = useState<WorkspaceOnboardingStep>(initialStep);
  const [selectedExtraAppIds, setSelectedExtraAppIds] = useState<string[]>(() =>
    extraApps.filter((app) => installedApps.includes(app.id)).map((app) => app.id),
  );

  const allSelectedAppIds = useMemo(() => {
    const starter = starterApps.map((a) => a.id);
    return Array.from(new Set([...starter, ...selectedExtraAppIds]));
  }, [selectedExtraAppIds]);

  const [installStatuses, setInstallStatuses] = useState<Record<string, InstallStatus>>(() => {
    const initial: Record<string, InstallStatus> = {};
    ['stocks', 'technical-sheets', 'haccp', ...extraApps.map((a) => a.id)].forEach((id) => {
      initial[id] = installedApps.includes(id) ? 'done' : 'pending';
    });
    return initial;
  });

  const [installError, setInstallError] = useState<string>();
  const [flowError, setFlowError] = useState<string>();
  const installationRunningRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);

  const stepIndex = assistantSteps.indexOf(step);
  const progress = Math.round(((stepIndex + 1) / assistantSteps.length) * 100);
  const installationComplete = allSelectedAppIds.every(
    (appId) => installStatuses[appId] === 'done',
  );

  const toggleExtraApp = (appId: string) => {
    setSelectedExtraAppIds((current) =>
      current.includes(appId)
        ? current.filter((id) => id !== appId)
        : [...current, appId],
    );
  };

  useEffect(() => {
    dialogRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step === 'MINI_TOUR') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (replay) onCloseReplay();
      else void onDefer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCloseReplay, onDefer, replay, step]);

  useEffect(() => {
    if (step !== 'INSTALLATION' || replay) return;
    void startInstallation();
  }, [step, replay]);

  async function goTo(nextStep: WorkspaceOnboardingStep) {
    setFlowError(undefined);
    try {
      if (!replay) await onProgress(nextStep);
    } catch (error) {
      setFlowError(
        error instanceof Error ? error.message : 'Impossible d’enregistrer la progression.',
      );
      return;
    }
    if (nextStep === 'MINI_TOUR') onPrepareMiniTour();
    setStep(nextStep);
  }

  async function close() {
    setFlowError(undefined);
    try {
      if (replay) onCloseReplay();
      else await onDefer();
    } catch (error) {
      setFlowError(
        error instanceof Error ? error.message : 'Impossible de reporter la visite.',
      );
    }
  }

  async function installStarterBundle() {
    setInstallError(undefined);
    for (const appId of allSelectedAppIds) {
      const appMeta =
        starterApps.find((a) => a.id === appId) ||
        extraApps.find((a) => a.id === appId);
      const appTitle = appMeta ? appMeta.title : appId;

      if (
        installStatuses[appId] === 'done' ||
        installedApps.includes(appId)
      ) {
        setInstallStatuses((current) => ({ ...current, [appId]: 'done' }));
        continue;
      }
      setInstallStatuses((current) => ({ ...current, [appId]: 'installing' }));
      try {
        await onInstallApp(appId);
        setInstallStatuses((current) => ({ ...current, [appId]: 'done' }));
      } catch (error) {
        setInstallStatuses((current) => ({ ...current, [appId]: 'failed' }));
        setInstallError(
          error instanceof Error
            ? error.message
            : `L’installation de ${appTitle} a échoué.`,
        );
        return;
      }
    }
  }

  async function startInstallation() {
    if (installationRunningRef.current) return;
    installationRunningRef.current = true;
    try {
      await installStarterBundle();
    } finally {
      installationRunningRef.current = false;
    }
  }

  if (step === 'MINI_TOUR') {
    return (
      <WorkspaceMiniTour
        onClose={() => void close()}
        onFinish={onFinish}
      />
    );
  }

  return (
    <div className="workspace-onboarding-overlay">
      <div
        className="workspace-onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-onboarding-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <aside className="workspace-onboarding-rail">
          <div className="workspace-onboarding-brand">
            <span><Rocket size={18} /></span>
            <div>
              <strong>Mise en route</strong>
              <small>ToqueHub · {organizationName}</small>
            </div>
          </div>
          <div className="workspace-onboarding-steps">
            {assistantSteps.slice(0, -1).map((item, index) => {
              const current = index === stepIndex;
              const done = index < stepIndex;
              return (
                <div className={`${current ? 'current' : ''} ${done ? 'done' : ''}`} key={item}>
                  <span>{done ? <Check size={14} /> : index + 1}</span>
                  <div>
                    <strong>{stepLabel(item)}</strong>
                    <small>{stepHint(item)}</small>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="workspace-onboarding-rail-note">
            <ShieldCheck size={18} />
            <p>Vos données restent locales et chaque action métier reste traçable.</p>
          </div>
        </aside>

        <main className="workspace-onboarding-main">
          <header className="workspace-onboarding-header">
            <div>
              <span>Étape {stepIndex + 1} / 5</span>
              <strong>{progress}%</strong>
            </div>
            <div className="workspace-onboarding-progress">
              <i style={{ width: `${progress}%` }} />
            </div>
            <button type="button" onClick={() => void close()} aria-label="Fermer la visite">
              <X size={20} />
            </button>
          </header>

          <section className="workspace-onboarding-content">
            {flowError ? (
              <div className="workspace-install-error workspace-flow-error" role="alert">
                <strong>La progression n’a pas pu être enregistrée</strong>
                <span>{flowError}</span>
              </div>
            ) : null}
            <div key={step} className="workspace-step-animated">
              {step === 'WELCOME' ? (
                <WelcomeStep
                  firstName={firstName}
                  organizationName={organizationName}
                  onNext={() => void goTo('ECOSYSTEM')}
                  onLater={() => void close()}
                />
              ) : null}

              {step === 'ECOSYSTEM' ? (
                <EcosystemStep
                  onBack={() => void goTo('WELCOME')}
                  onNext={() => void goTo('STARTER_BUNDLE')}
                />
              ) : null}

              {step === 'STARTER_BUNDLE' ? (
                <StarterBundleStep
                  installedApps={installedApps}
                  selectedExtraAppIds={selectedExtraAppIds}
                  onToggleExtraApp={toggleExtraApp}
                  replay={replay}
                  onBack={() => void goTo('ECOSYSTEM')}
                  onInstall={() => void goTo('INSTALLATION')}
                  onLater={() => void close()}
                />
              ) : null}

              {step === 'INSTALLATION' ? (
                <InstallationStep
                  statuses={installStatuses}
                  selectedAppIds={allSelectedAppIds}
                  error={installError}
                  replay={replay}
                  complete={installationComplete}
                  onBack={() => void goTo('STARTER_BUNDLE')}
                  onRetry={() => void startInstallation()}
                  onNext={() => void goTo('MINI_TOUR')}
                />
              ) : null}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function WelcomeStep({
  firstName,
  organizationName,
  onNext,
  onLater,
}: {
  firstName: string;
  organizationName: string;
  onNext: () => void;
  onLater: () => void;
}) {
  return (
    <div className="workspace-onboarding-welcome">
      <div>
        <span className="workspace-onboarding-kicker"><Sparkles size={15} /> Environnement prêt</span>
        <h1 id="workspace-onboarding-title">
          Bienvenue {firstName}, <span>{organizationName}</span> est prêt.
        </h1>
        <p>
          En quelques minutes, découvrez comment ToqueHub relie vos produits, vos recettes,
          votre production et vos contrôles sans dupliquer les informations.
        </p>
        <div className="workspace-onboarding-benefits">
          <div><CheckCircle2 size={18} /><span>Un référentiel partagé entre tous les modules</span></div>
          <div><ShieldCheck size={18} /><span>Des actions attribuées et auditables</span></div>
          <div><Store size={18} /><span>Des applications activées progressivement</span></div>
        </div>
      </div>
      <div className="workspace-onboarding-hero-visual" aria-hidden="true">
        <div className="hero-pulse-glow" />
        <div className="hero-orbit-ring" />
        <div className="hero-orbit orbit-one" title="Stocks"><Package /></div>
        <div className="hero-orbit orbit-two" title="Fiches Techniques"><ChefHat /></div>
        <div className="hero-orbit orbit-three" title="HACCP"><Thermometer /></div>
        <div className="hero-core"><img src="/logo-toque.png" alt="" /></div>
      </div>
      <footer>
        <button className="btn btn-secondary" type="button" onClick={onLater}>Faire plus tard</button>
        <button className="btn btn-primary" type="button" onClick={onNext}>
          Découvrir ToqueHub <ArrowRight size={17} />
        </button>
      </footer>
    </div>
  );
}

function EcosystemStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  return (
    <div>
      <div className="workspace-ecosystem-header-row">
        <div>
          <span className="workspace-onboarding-kicker"><Factory size={15} /> Écosystème connecté</span>
          <h2>Chaque donnée a une source unique</h2>
          <p className="workspace-onboarding-lead">
            Les modules se complètent dans un ordre clair. Vous pouvez avancer progressivement,
            sans changer toutes vos habitudes le premier jour.
          </p>
        </div>
      </div>

      <div className="workspace-ecosystem-grid">
        {ecosystemGroups.map((group) => {
          const Icon = group.icon;
          const isActive = activeGroupId === group.id;
          return (
            <article
              key={group.id}
              className={`tone-${group.tone} ${isActive ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveGroupId(group.id)}
              onMouseLeave={() => setActiveGroupId(null)}
            >
              <header className="workspace-ecosystem-card-header">
                <div className="workspace-ecosystem-icon-wrapper">
                  <Icon size={20} />
                </div>
                <div>
                  <strong>{group.title}</strong>
                  <span className="workspace-ecosystem-badge">{group.badge}</span>
                </div>
              </header>

              <div className="workspace-ecosystem-path">
                {group.path.map((item, index) => (
                  <span key={item} className="workspace-ecosystem-step-pill">
                    <em>{item}</em>
                    {index < group.path.length - 1 ? (
                      <ArrowRight size={13} className="workspace-ecosystem-arrow" />
                    ) : null}
                  </span>
                ))}
              </div>

              <p>{group.detail}</p>
            </article>
          );
        })}
      </div>

      <div className="workspace-callout-hero">
        <div className="callout-hero-left">
          <span className="callout-hero-icon-box">
            <Package size={24} />
          </span>
          <div className="callout-hero-content">
            <span className="callout-hero-kicker">
              <Sparkles size={13} /> Source Unique & Centralisée
            </span>
            <strong>Stocks reste le socle matière universel de votre établissement</strong>
            <p>
              Produits, unités, fournisseurs et emplacements sont automatiquement synchronisés et
              réutilisés dans tous vos modules sans aucune double saisie.
            </p>
            <div className="callout-hero-chips">
              <span className="callout-chip"><Check size={12} /> Catalogue Produits</span>
              <span className="callout-chip"><Check size={12} /> Fiches & Recettes</span>
              <span className="callout-chip"><Check size={12} /> Commandes Achats</span>
              <span className="callout-chip accent"><ShieldCheck size={12} /> Zéro Double Saisie</span>
            </div>
          </div>
        </div>
      </div>

      <StepActions onBack={onBack} onNext={onNext} nextLabel="Choisir mon socle" />
    </div>
  );
}

function StarterBundleStep({
  installedApps,
  selectedExtraAppIds,
  onToggleExtraApp,
  replay,
  onBack,
  onInstall,
  onLater,
}: {
  installedApps: string[];
  selectedExtraAppIds: string[];
  onToggleExtraApp: (appId: string) => void;
  replay: boolean;
  onBack: () => void;
  onInstall: () => void;
  onLater: () => void;
}) {
  const totalCount = 3 + selectedExtraAppIds.length;

  return (
    <div>
      <div className="workspace-starter-header-row">
        <div>
          <span className="workspace-onboarding-kicker"><Store size={15} /> Pack & Sur-Mesure</span>
          <h2>Composez votre environnement ToqueHub</h2>
          <p className="workspace-onboarding-lead">
            Le socle fondamental est pré-sélectionné. Vous pouvez ajouter directement d’autres
            modules métier ci-dessous pour les installer en une seule fois.
          </p>
        </div>
      </div>

      <div className="workspace-section-label">
        <span className="workspace-section-badge primary">1. Socle Fondamental Recommandé (Inclus)</span>
      </div>

      <div className="workspace-starter-grid">
        {starterApps.map((app, index) => {
          const Icon = app.icon;
          const installed = installedApps.includes(app.id);
          return (
            <article className={`starter-card tone-${app.tone}`} key={app.id}>
              <header className="starter-card-top">
                <span className="starter-step-badge">{app.stepTag}</span>
                <span className="starter-card-number">0{index + 1}</span>
              </header>

              <div className="starter-card-icon-box">
                <Icon size={26} />
              </div>

              <div className="starter-card-body">
                <h3>{app.title}</h3>
                <p>{app.description}</p>
              </div>

              <div className="starter-card-tags">
                {app.tags.map((tag) => (
                  <span key={tag} className="starter-chip">
                    <Check size={11} /> {tag}
                  </span>
                ))}
              </div>

              <footer className="starter-card-footer">
                {installed ? (
                  <span className="starter-status-badge installed">
                    <CheckCircle2 size={14} /> Déjà active
                  </span>
                ) : (
                  <span className="starter-status-badge ready">
                    <CheckCircle2 size={14} /> Inclus par défaut
                  </span>
                )}
              </footer>
            </article>
          );
        })}
      </div>

      <div className="workspace-section-label extra-section-margin">
        <span className="workspace-section-badge secondary"><Plus size={14} /> 2. Ajouter d’autres modules (Optionnel)</span>
        <small className="workspace-section-sub">Cliquez pour inclure immédiatement ces applications dans votre socle</small>
      </div>

      <div className="workspace-extra-apps-grid">
        {extraApps.map((app) => {
          const Icon = app.icon;
          const isSelected = selectedExtraAppIds.includes(app.id);
          const isAlreadyInstalled = installedApps.includes(app.id);

          return (
            <div
              key={app.id}
              className={`extra-app-card tone-${app.tone} ${isSelected ? 'is-selected' : ''} ${
                isAlreadyInstalled ? 'is-disabled' : ''
              }`}
              onClick={() => {
                if (!isAlreadyInstalled) onToggleExtraApp(app.id);
              }}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
            >
              <div className="extra-app-header">
                <span className="extra-app-icon-wrapper">
                  <Icon size={20} />
                </span>
                <span className="extra-app-tag">{app.tag}</span>
              </div>

              <div className="extra-app-content">
                <strong>{app.title}</strong>
                <p>{app.description}</p>
              </div>

              <div className="extra-app-action">
                {isAlreadyInstalled ? (
                  <span className="extra-badge installed">
                    <CheckCircle2 size={13} /> Active
                  </span>
                ) : isSelected ? (
                  <span className="extra-badge selected">
                    <Check size={13} /> Sélectionnée
                  </span>
                ) : (
                  <span className="extra-badge add">
                    <Plus size={13} /> Ajouter
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="workspace-onboarding-actions">
        <button className="btn btn-secondary" type="button" onClick={onBack}>
          <ArrowLeft size={17} /> Retour
        </button>
        <div>
          {!replay ? (
            <button className="btn btn-secondary" type="button" onClick={onLater}>
              Faire plus tard
            </button>
          ) : null}
          <button className="btn btn-primary btn-pulse-glow" type="button" onClick={onInstall}>
            {replay
              ? 'Continuer la découverte'
              : `Activer mon socle (${totalCount} module${totalCount > 1 ? 's' : ''})`}{' '}
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

function InstallationStep({
  statuses,
  selectedAppIds,
  error,
  replay,
  complete,
  onBack,
  onRetry,
  onNext,
}: {
  statuses: Record<string, InstallStatus>;
  selectedAppIds: string[];
  error?: string;
  replay: boolean;
  complete: boolean;
  onBack: () => void;
  onRetry: () => void;
  onNext: () => void;
}) {
  const appsToRender = useMemo(() => {
    return selectedAppIds.map((id) => {
      const meta =
        starterApps.find((a) => a.id === id) ||
        extraApps.find((a) => a.id === id) || {
          id,
          title: id,
          description: 'Module métier ToqueHub',
          icon: Package,
          tone: 'emerald',
          tag: 'Module',
        };
      return meta;
    });
  }, [selectedAppIds]);

  const installedCount = useMemo(() => {
    return selectedAppIds.filter((id) =>
      replay ? statuses[id] === 'done' : statuses[id] === 'done',
    ).length;
  }, [selectedAppIds, statuses, replay]);

  const progressPercent = Math.round((installedCount / selectedAppIds.length) * 100);

  return (
    <div>
      <div className="workspace-install-header">
        <div>
          <span className="workspace-onboarding-kicker">
            {complete || replay ? <CheckCircle2 size={15} /> : <LoaderCircle className="spin" size={15} />}
            {replay ? 'Mode Découverte' : complete ? 'Installation Terminée' : 'Déploiement en cours...'}
          </span>
          <h2>{replay ? 'Votre socle actuellement actif' : 'Installation de votre socle sur-mesure'}</h2>
          <p className="workspace-onboarding-lead">
            {replay
              ? 'Cette démonstration n’impacte aucun de vos répertoires ou applications déjà configurées.'
              : `ToqueHub prépare et sécurise automatiquement les ${selectedAppIds.length} modules choisis pour votre cuisine.`}
          </p>
        </div>

        <div className="install-progress-card">
          <div className="install-progress-circle">
            <svg viewBox="0 0 36 36">
              <path
                className="circle-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="circle-fill"
                strokeDasharray={`${progressPercent}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span>{progressPercent}%</span>
          </div>
          <div className="install-progress-text">
            <strong>{installedCount} sur {selectedAppIds.length} modules</strong>
            <small>{complete || replay ? 'Tous les modules sont prêts' : 'Synchronisation...'}</small>
          </div>
        </div>
      </div>

      <div className="workspace-install-grid">
        {appsToRender.map((app, index) => {
          const Icon = app.icon;
          const status = replay
            ? statuses[app.id] === 'done' ? 'done' : 'pending'
            : statuses[app.id] || 'pending';

          return (
            <article key={app.id} className={`install-card tone-${app.tone} status-${status}`}>
              <div className="install-card-header">
                <span className="install-card-step">0{index + 1}</span>
                <div className="install-card-status">
                  {status === 'installing' ? (
                    <span className="install-status-pill installing">
                      <LoaderCircle className="spin" size={13} /> En cours...
                    </span>
                  ) : null}
                  {status === 'done' ? (
                    <span className="install-status-pill done">
                      <CheckCircle2 size={13} /> Active & Prête
                    </span>
                  ) : null}
                  {status === 'pending' ? (
                    <span className="install-status-pill pending">
                      En attente
                    </span>
                  ) : null}
                  {status === 'failed' ? (
                    <span className="install-status-pill failed">
                      <X size={13} /> Échec
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="install-card-main">
                <div className="install-card-icon-box">
                  <Icon size={24} />
                  {status === 'done' ? <span className="icon-check-badge"><Check size={11} /></span> : null}
                </div>
                <div>
                  <h3>{app.title}</h3>
                  <p>{app.description}</p>
                </div>
              </div>

              <div className="install-card-progress-bar">
                <div
                  className="install-card-progress-fill"
                  style={{
                    width: status === 'done' ? '100%' : status === 'installing' ? '65%' : '0%',
                  }}
                />
              </div>
            </article>
          );
        })}
      </div>

      {error ? (
        <div className="workspace-install-error">
          <strong>Installation interrompue</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <div className="workspace-onboarding-actions">
        <button className="btn btn-secondary" type="button" onClick={onBack}>
          <ArrowLeft size={17} /> Retour
        </button>
        <div>
          {error ? (
            <button className="btn btn-secondary" type="button" onClick={onRetry}>
              <RefreshCw size={16} /> Réessayer
            </button>
          ) : null}
          <button
            className="btn btn-primary btn-pulse-glow"
            type="button"
            disabled={!replay && !complete}
            onClick={onNext}
          >
            <Sparkles size={17} /> Découvrir mon espace <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceMiniTour({
  onClose,
  onFinish,
}: {
  onClose: () => void;
  onFinish: (configureStocks: boolean) => Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string>();
  const cardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(cardRef);
  const item = miniTourSteps[index];
  const isLast = index === miniTourSteps.length - 1;

  const refreshRect = () => {
    if (window.innerWidth < 760) {
      setRect(null);
      return;
    }
    const target = document.querySelector<HTMLElement>(`[data-tour="${item.target}"]`);
    if (!target) {
      setRect(null);
      return;
    }
    const next = target.getBoundingClientRect();
    setRect(next.width && next.height ? next : null);
  };

  useEffect(() => {
    refreshRect();
    const target = document.querySelector<HTMLElement>(`[data-tour="${item.target}"]`);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refreshRect) : null;
    if (target) observer?.observe(target);
    window.addEventListener('resize', refreshRect);
    window.addEventListener('scroll', refreshRect, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', refreshRect);
      window.removeEventListener('scroll', refreshRect, true);
    };
  }, [item.target]);

  useEffect(() => {
    cardRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && !isLast) setIndex((current) => current + 1);
      if (event.key === 'ArrowLeft' && index > 0) setIndex((current) => current - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, isLast, onClose]);

  const cardStyle = useMemo(() => {
    if (!rect) return undefined;
    const width = 440;
    const gap = 18;
    const left = Math.min(
      window.innerWidth - width - 20,
      Math.max(20, rect.left + rect.width / 2 - width / 2),
    );
    const below = rect.bottom + 230 < window.innerHeight;
    return {
      left,
      top: below ? rect.bottom + gap : Math.max(20, rect.top - 220 - gap),
      transform: 'none',
    };
  }, [rect, index]);

  async function finish(configureStocks: boolean) {
    setFinishing(true);
    setFinishError(undefined);
    try {
      await onFinish(configureStocks);
    } catch (error) {
      setFinishError(
        error instanceof Error ? error.message : 'Impossible de terminer la visite.',
      );
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="workspace-mini-tour" aria-live="polite">
      {rect ? (
        <div
          className="workspace-mini-tour-highlight"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      ) : (
        <div className="workspace-mini-tour-backdrop" />
      )}
      <div
        className={`workspace-mini-tour-card ${rect ? '' : 'centered'}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mini-tour-title"
        tabIndex={-1}
        ref={cardRef}
      >
        <button className="workspace-mini-tour-close" type="button" onClick={onClose} aria-label="Fermer">
          <X size={18} />
        </button>
        <span className="workspace-onboarding-kicker">
          {item.target === 'help' ? <BookOpen size={14} /> : <Sparkles size={14} />}
          Repère {index + 1} / {miniTourSteps.length}
        </span>
        <h2 id="mini-tour-title">{item.title}</h2>
        <p>{item.description}</p>
        {finishError ? (
          <div className="workspace-install-error" role="alert">
            <strong>La visite reste ouverte</strong>
            <span>{finishError}</span>
          </div>
        ) : null}
        <div className="workspace-mini-tour-dots">
          {miniTourSteps.map((step, dotIndex) => (
            <i className={dotIndex === index ? 'active' : ''} key={step.target} />
          ))}
        </div>
        <footer>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={index === 0 || finishing}
            onClick={() => setIndex((current) => current - 1)}
          >
            <ArrowLeft size={16} /> Retour
          </button>
          {!isLast ? (
            <button className="btn btn-primary" type="button" onClick={() => setIndex((current) => current + 1)}>
              Suivant <ArrowRight size={16} />
            </button>
          ) : (
            <div>
              <button className="btn btn-secondary" type="button" disabled={finishing} onClick={() => void finish(false)}>
                Retour au dashboard
              </button>
              <button className="btn btn-primary" type="button" disabled={finishing} onClick={() => void finish(true)}>
                {finishing ? <LoaderCircle className="spin" size={16} /> : <Package size={16} />}
                Configurer Stocks
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

function StepActions({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="workspace-onboarding-actions">
      <button className="btn btn-secondary" type="button" onClick={onBack}>
        <ArrowLeft size={17} /> Retour
      </button>
      <button className="btn btn-primary" type="button" onClick={onNext}>
        {nextLabel} <ArrowRight size={17} />
      </button>
    </div>
  );
}

function stepLabel(step: WorkspaceOnboardingStep) {
  return {
    WELCOME: 'Bienvenue',
    ECOSYSTEM: 'Écosystème',
    STARTER_BUNDLE: 'Socle initial',
    INSTALLATION: 'Installation',
    MINI_TOUR: 'Visite',
  }[step];
}

function stepHint(step: WorkspaceOnboardingStep) {
  return {
    WELCOME: 'Votre environnement',
    ECOSYSTEM: 'Les modules connectés',
    STARTER_BUNDLE: 'Les premières applications',
    INSTALLATION: 'Préparation du socle',
    MINI_TOUR: 'Les repères essentiels',
  }[step];
}

function installStatusLabel(status: InstallStatus, replay: boolean) {
  if (replay && status === 'pending') return 'Non installée · aucune modification';
  if (status === 'installing') return 'Installation en cours…';
  if (status === 'done') return 'Prête';
  if (status === 'failed') return 'À réessayer';
  return 'En attente';
}

function useFocusTrap(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'));
      if (!focusable.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [ref]);
}

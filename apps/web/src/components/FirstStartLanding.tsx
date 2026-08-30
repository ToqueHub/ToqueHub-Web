import { activeLocale, type AppLanguage } from '../i18n/runtime';
import { useLanguage } from '../i18n';
import type { ChangeEvent, DragEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Clock,
  Database,
  Eye,
  EyeOff,
  FileArchive,
  Files,
  HelpCircle,
  ImagePlus,
  LockKeyhole,
  LockKeyholeOpen,
  RefreshCcw,
  Server,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UsersRound,
  AlertCircle,
  X,
  Utensils,
  Heart,
  School,
  Hotel,
  ConciergeBell,
  CookingPot,
  MoreHorizontal,
  Check,
  Store,
  Network,
  MapPin,
  Key,
  Lock,
  Package,
  BarChart3,
  MessageSquare,
  ScanLine,
} from 'lucide-react';
import { api } from '../api/client';
import type { BackupInspection, EstablishmentType, RegulatoryCountryCode, SystemStatus, TeamSize, UserSession } from '../types';

interface FirstStartLandingProps {
  status?: SystemStatus;
  loading?: boolean;
  error?: string;
  onRefreshStatus: () => Promise<void> | void;
  onLoginRequested: () => void;
  onBootstrapComplete: (session: UserSession) => void;
}

type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type AdminForm = { username: string; firstName: string; lastName: string; email: string; password: string; confirm: string };
type OrganizationForm = { name: string; type: string; regulatoryCountryCode: RegulatoryCountryCode | ''; teamSize: TeamSize; logo?: string; primarySiteName: string; secondarySiteNames: string[] };

const establishmentTypes = ['Restaurant', 'EHPAD', 'Collectivité', 'Hôtel', 'Traiteur', 'Cuisine centrale', 'Autre'];
const regulatoryCountries: Array<{ label: string; value: RegulatoryCountryCode }> = [
  { label: 'France', value: 'FR' },
  { label: 'Finlande', value: 'FI' },
];
const teamSizes: Array<{ label: string; value: TeamSize }> = [
  { label: '1 à 5 personnes', value: '1-5' },
  { label: '6 à 10 personnes', value: '6-10' },
  { label: '11 à 20 personnes', value: '11-20' },
  { label: 'Plus de 20 personnes', value: '20+' },
];
const creationSteps = ['Création de l’organisation', 'Création du site principal', 'Configuration de l’administrateur', 'Préparation OCR IA', 'Finalisation'];
const volunteerAppointmentUrl = '';
const usernamePattern = /^[a-zA-Z0-9._-]+$/;

function getUsernameError(username: string) {
  const value = username.trim();
  if (!value) return 'Le nom d’utilisateur est requis.';
  if (value.length < 3) return 'Le nom d’utilisateur doit contenir au moins 3 caractères.';
  if (value.length > 40) return 'Le nom d’utilisateur ne peut pas dépasser 40 caractères.';
  if (!usernamePattern.test(value)) {
    return 'Utilisez uniquement des lettres sans accent, des chiffres, un point (.), un tiret (-) ou un tiret bas (_). Les espaces, accents, apostrophes et @ ne sont pas autorisés.';
  }
  return undefined;
}

function passwordScore(password: string) {
  let score = 0;
  if (password.length >= 10) score += 25;
  if (/[a-z]/.test(password)) score += 20;
  if (/[A-Z]/.test(password)) score += 20;
  if (/\d/.test(password)) score += 15;
  if (/[^A-Za-z\d]/.test(password)) score += 20;
  return Math.min(score, 100);
}

function cleanSecondarySiteNames(value: string[]) {
  const seen = new Set<string>();
  return value
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function FirstStartLanding({
  status,
  loading,
  error,
  onRefreshStatus,
  onLoginRequested,
  onBootstrapComplete,
}: FirstStartLandingProps) {
  const { language, setLanguage } = useLanguage();
  const [step, setStep] = useState<OnboardingStep>(0);
  const [miniStep, setMiniStep] = useState(0);
  const [isMultiSite, setIsMultiSite] = useState<boolean | null>(null);

  const changeStep = (nextStep: OnboardingStep) => {
    if (nextStep === 2) {
      if (step === 3) {
        setMiniStep(2);
      } else {
        setMiniStep(0);
      }
    }
    setStep(nextStep);
  };

  const [admin, setAdmin] = useState<AdminForm>({ username: '', firstName: '', lastName: '', email: '', password: '', confirm: '' });
  const [organization, setOrganization] = useState<OrganizationForm>({ name: '', type: '', regulatoryCountryCode: '', teamSize: '1-5', primarySiteName: '', secondarySiteNames: [] });
  const [showPassword, setShowPassword] = useState(false);
  const [mistralApiKey, setMistralApiKey] = useState('');
  const [formError, setFormError] = useState<string>();
  const [usernameError, setUsernameError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [completedCreationSteps, setCompletedCreationSteps] = useState(0);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreInspection, setRestoreInspection] = useState<BackupInspection | null>(null);
  const [restorePhrase, setRestorePhrase] = useState('');
  const [restoreError, setRestoreError] = useState<string>();
  const [restoreMessage, setRestoreMessage] = useState<string>();
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreDone, setRestoreDone] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const score = useMemo(() => passwordScore(admin.password), [admin.password]);
  const allowLogin = Boolean(status?.hasOrganization || status?.hasAdmin);
  const allowCreate = !status?.hasAdmin && !status?.hasOrganization;

  const progress = useMemo(() => {
    if (step === 2) {
      return ((2 + (miniStep / 3)) / 6) * 100;
    }
    return ((Math.min(step, 5) + 1) / 6) * 100;
  }, [step, miniStep]);

  function goNext() {
    setFormError(undefined);
    if (step === 1 && !validateAdmin()) return;
    if (step === 2) {
      if (isMultiSite === null) {
        setFormError('Veuillez sélectionner si votre établissement est un site unique ou multi-site.');
        return;
      }
      if (miniStep === 0) {
        setMiniStep(1);
        return;
      }
      if (miniStep === 1) {
        if (!organization.name.trim()) {
          setFormError('Le nom de l’établissement est requis.');
          return;
        }
        if (isMultiSite && !organization.primarySiteName.trim()) {
          setFormError('Le nom du site principal est requis pour une configuration multi-site.');
          return;
        }
        setMiniStep(2);
        return;
      }
      if (miniStep === 2) {
        if (!organization.regulatoryCountryCode) {
          setFormError('Le pays RH est requis.');
          return;
        }
      }
    }
    if (step < 5) changeStep((step + 1) as OnboardingStep);
  }

  document.title = "Bienvenue sur ToqueHub - Onboarding";

  function goBack() {
    setFormError(undefined);
    if (step === 2 && miniStep > 0) {
      setMiniStep(miniStep - 1);
      return;
    }
    if (step > 0 && !submitting) changeStep((step - 1) as OnboardingStep);
  }

  function validateAdmin() {
    const currentUsernameError = getUsernameError(admin.username);
    setUsernameError(currentUsernameError);
    if (currentUsernameError) {
      setFormError(undefined);
      return false;
    }
    if (Object.values(admin).some((value) => !value.trim())) {
      setFormError('Tous les champs administrateur sont requis.');
      return false;
    }
    if (admin.password !== admin.confirm) {
      setFormError('La confirmation du mot de passe ne correspond pas.');
      return false;
    }
    if (score < 100) {
      setFormError('Utilisez au moins 10 caractères avec majuscule, minuscule, chiffre et symbole.');
      return false;
    }
    return true;
  }

  function updateAdmin(field: keyof AdminForm) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setAdmin((prev) => ({ ...prev, [field]: value }));
      if (field === 'username' && usernameError) {
        setUsernameError(getUsernameError(value));
      }
    };
  }

  document.title = "Bienvenue sur ToqueHub";

  function updateOrganization(field: keyof Omit<OrganizationForm, 'logo'>) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setOrganization((prev) => {
      const value = event.target.value;
      if (field === 'name') {
        const previousName = prev.name.trim();
        const siteWasSynced = !prev.primarySiteName.trim() || prev.primarySiteName.trim() === previousName || prev.primarySiteName.trim() === `${previousName} — Site principal`;
        return { ...prev, name: value, primarySiteName: siteWasSynced ? value : prev.primarySiteName };
      }
      return { ...prev, [field]: value };
    });
  }

  async function handleLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Choisissez un fichier image pour le logo.');
      return;
    }

    setFormError(undefined);
    try {
      const logo = await resizeLogo(file);
      setOrganization((prev) => ({ ...prev, logo }));
    } catch {
      setFormError('Impossible de préparer ce logo. Essayez une autre image PNG ou JPG.');
      if (event.target) event.target.value = '';
    }
  }

  async function createEnvironment() {
    setFormError(undefined);
    if (!validateAdmin()) {
      changeStep(1);
      return;
    }
    if (!organization.name.trim()) {
      setFormError('Le nom de l’établissement est requis.');
      changeStep(2);
      setMiniStep(1);
      return;
    }
    if (!organization.regulatoryCountryCode) {
      setFormError('Le pays RH est requis.');
      changeStep(2);
      setMiniStep(2);
      return;
    }

    setSubmitting(true);
    changeStep(6);
    setCompletedCreationSteps(0);
    try {
      await pause(350);
      const finalSession = await api.completeOnboarding({
        username: admin.username.trim(),
        firstName: admin.firstName.trim(),
        lastName: admin.lastName.trim(),
        email: admin.email.trim(),
        password: admin.password,
        organizationName: organization.name.trim(),
        establishmentType: (organization.type || undefined) as EstablishmentType | undefined,
        regulatoryCountryCode: organization.regulatoryCountryCode || undefined,
        teamSize: (organization.teamSize || undefined) as TeamSize | undefined,
        logoDataUrl: organization.logo,
        primarySiteName: organization.primarySiteName.trim() || organization.name.trim(),
        secondarySiteNames: cleanSecondarySiteNames(organization.secondarySiteNames),
        mistralApiKey: mistralApiKey.trim() || undefined,
      });
      setCompletedCreationSteps(1);
      await pause(300);
      setCompletedCreationSteps(2);
      await pause(300);
      setCompletedCreationSteps(3);
      await pause(300);
      setCompletedCreationSteps(4);
      await onRefreshStatus();
      await pause(450);
      setCompletedCreationSteps(5);
      await pause(250);
      onBootstrapComplete(finalSession);
    } catch (err) {
      setSubmitting(false);
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('username')) {
        const isAlreadyUsed = message.toLowerCase().includes('already exists');
        setUsernameError(
          isAlreadyUsed
            ? 'Ce nom d’utilisateur est déjà utilisé. Choisissez-en un autre.'
            : getUsernameError(admin.username) ??
              'Ce nom d’utilisateur n’est pas accepté. Utilisez uniquement des lettres sans accent, des chiffres, un point, un tiret ou un tiret bas.',
        );
        setFormError(undefined);
        changeStep(1);
        return;
      }
      setFormError(message || 'Nous n’avons pas pu créer l’environnement. Vérifiez les informations puis réessayez.');
      changeStep(5);
    }
  }

  async function inspectBootstrapBackup(file?: File) {
    if (!file) return;
    setRestoreBusy(true);
    setRestoreError(undefined);
    setRestoreMessage(undefined);
    try {
      const inspection = await api.inspectBootstrapBackup(file);
      setRestoreInspection(inspection);
      setRestorePhrase('');
      setRestoreMessage('Archive inspectée. Vérifiez le manifeste avant de restaurer.');
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Inspection de la sauvegarde impossible.');
    } finally {
      setRestoreBusy(false);
    }
  }

  async function restoreBootstrapBackup() {
    if (!restoreInspection) return;
    setRestoreBusy(true);
    setRestoreError(undefined);
    setRestoreMessage(undefined);
    try {
      const result = await api.restoreBootstrapBackup(restoreInspection.uploadId, normalizeRestorePhrase(restorePhrase));
      setRestoreMessage(result.message || 'Restauration terminée. Vous pouvez vous connecter.');
      setRestoreDone(true);
      await onRefreshStatus();
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restauration impossible.');
    } finally {
      setRestoreBusy(false);
    }
  }

  const isFullWidth = step === 0 || step === 6;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 10% 20%, rgba(16, 185, 129, 0.08) 0%, transparent 60%), radial-gradient(circle at 90% 80%, rgba(59, 130, 246, 0.08) 0%, transparent 50%), linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
      }}
    >
      {/* Decorative Blur Spheres */}
      <div style={{ position: 'absolute', width: '560px', height: '560px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.05)', filter: 'blur(100px)', right: '-180px', top: '-180px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: '420px', height: '420px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.05)', filter: 'blur(80px)', left: '-160px', bottom: '20px', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: isFullWidth ? '920px' : '1080px', zIndex: 10 }}>
        {/* Onboarding Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src="/toquehub-logo-wide-transparent.png"
              alt="ToqueHub Logo"
              style={{ height: '36px', objectFit: 'contain' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="badge badge-reception" style={{ border: '1px solid var(--light-border)', textTransform: 'none', background: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
              <Server size={14} style={{ marginRight: '0.35rem' }} /> Instance Locale
            </span>
            {allowLogin && (
              <button className="btn btn-secondary" onClick={onLoginRequested} style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
                Se connecter
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="alert-modern error" style={{ marginBottom: '1.5rem' }}>
            <AlertCircleIcon />
            <div>{error}</div>
          </div>
        )}

        {loading ? (
          <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5rem 2rem', gap: '1rem' }}>
            <div className="spinner" style={{ width: '36px', height: '36px', borderWidth: '3px' }}></div>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Lecture du statut système...</span>
          </div>
        ) : restoreOpen ? (
          <BootstrapRestorePanel
            inspection={restoreInspection}
            phrase={restorePhrase}
            error={restoreError}
            message={restoreMessage}
            busy={restoreBusy}
            done={restoreDone}
            onPhraseChange={setRestorePhrase}
            onFile={inspectBootstrapBackup}
            onRestore={restoreBootstrapBackup}
            onBack={() => {
              setRestoreOpen(false);
              setRestoreError(undefined);
              setRestoreMessage(undefined);
              setRestoreInspection(null);
              setRestorePhrase('');
            }}
            onLoginRequested={onLoginRequested}
          />
        ) : !allowCreate ? (
          <AlreadyInitialized
            onLoginRequested={onLoginRequested}
            onRestore={() => setRestoreOpen(true)}
          />
        ) : (
          <div
            className="card-modern"
            style={{
              padding: 0,
              borderRadius: '24px',
              overflow: 'hidden',
              display: isFullWidth ? 'block' : 'grid',
              gridTemplateColumns: isFullWidth ? 'none' : '1.1fr 2fr',
              background: 'white',
              boxShadow: '0 30px 80px rgba(9, 13, 22, 0.08)',
              minHeight: '600px',
            }}
          >
            {/* Left Sidebar */}
            {!isFullWidth && (
              <div
                style={{
                  background: 'var(--dark-bg)',
                  color: 'white',
                  padding: '2.5rem 2rem',
                }}
              >
                <OnboardingAside step={step} organization={organization} />
              </div>
            )}

            {/* Right Form Area */}
            <div
              style={{
                padding: isFullWidth ? '3.5rem 3rem' : '3rem 2.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '560px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flexGrow: 1, justifyContent: 'center' }}>
                {/* Step Progress Top Bar */}
                {!isFullWidth && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge badge-reception" style={{ background: 'var(--primary-bg-light)', color: 'var(--primary)' }}>
                        Étape {step + 1} / 6
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{Math.round(progress)}%</span>
                    </div>
                    <div className="progress-bar-bg" style={{ height: '6px' }}>
                      <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                )}

                {formError && (
                  <div className="alert-modern error" style={{ margin: 0 }}>
                    <AlertCircleIcon />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Animated Views */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.16 }}
                    style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                  >
                    {step === 0 && (
                      <WelcomeStep
                        language={language}
                        onLanguageChange={setLanguage}
                        onStart={() => changeStep(1)}
                        onRestore={() => setRestoreOpen(true)}
                        onHelp={() => setHelpOpen(true)}
                      />
                    )}
                    {step === 1 && (
                      <AdminStep
                        admin={admin}
                        updateAdmin={updateAdmin}
                        showPassword={showPassword}
                        setShowPassword={setShowPassword}
                        score={score}
                        usernameError={usernameError}
                        onUsernameBlur={() => setUsernameError(getUsernameError(admin.username))}
                      />
                    )}
                    {step === 2 && (
                      <OrganizationStep
                        organization={organization}
                        updateOrganization={updateOrganization}
                        setOrganization={setOrganization}
                        miniStep={miniStep}
                        setMiniStep={setMiniStep}
                        isMultiSite={isMultiSite}
                        setIsMultiSite={setIsMultiSite}
                      />
                    )}
                    {step === 3 && (
                      <TeamStep
                        teamSize={organization.teamSize}
                        onSelect={(teamSize) => setOrganization((prev) => ({ ...prev, teamSize }))}
                      />
                    )}
                    {step === 4 && (
                      <LogoStep
                        organization={organization}
                        fileInputRef={fileInputRef}
                        onFile={handleLogo}
                        onSkip={() => changeStep(5)}
                      />
                    )}
                    {step === 5 && (
                      <MistralKeyStep
                        value={mistralApiKey}
                        onChange={setMistralApiKey}
                        onSkip={createEnvironment}
                        submitting={submitting}
                      />
                    )}
                    {step === 6 && <CreationStep completed={completedCreationSteps} />}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Step Navigation Actions */}
              {!isFullWidth && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--light-border)' }}>
                  <button className="btn btn-secondary" onClick={goBack} disabled={submitting}>
                    <ArrowLeft size={16} /> Retour
                  </button>
                  {step < 5 ? (
                    <button className="btn btn-primary" onClick={goNext} style={{ marginLeft: 'auto' }}>
                      Continuer <ArrowRight size={16} />
                    </button>
                  ) : (
                    <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.65rem' }}>
                      <button className="btn btn-primary" onClick={createEnvironment} disabled={submitting}>
                        {submitting ? 'Création de l\'instance...' : 'Créer mon environnement'} <Sparkles size={16} />
                      </button>
                      <button className="btn btn-secondary" onClick={() => setRestoreOpen(true)} disabled={submitting}>
                        <UploadCloud size={16} /> Restaurer depuis une sauvegarde
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <HelpVolunteerModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

// =========================================================================
// REUSABLE SUB-COMPONENTS
// =========================================================================

// Alert icon helper
function AlertCircleIcon() {
  return <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />;
}

const RESTORE_CONFIRMATION_PHRASE = 'RESTAURER TOQUEHUB';

function normalizeRestorePhrase(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function BootstrapRestorePanel({
  inspection,
  phrase,
  error,
  message,
  busy,
  done,
  onPhraseChange,
  onFile,
  onRestore,
  onBack,
  onLoginRequested,
}: {
  inspection: BackupInspection | null;
  phrase: string;
  error?: string;
  message?: string;
  busy: boolean;
  done: boolean;
  onPhraseChange: (value: string) => void;
  onFile: (file?: File) => void | Promise<void>;
  onRestore: () => void | Promise<void>;
  onBack: () => void;
  onLoginRequested: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const normalizedPhrase = normalizeRestorePhrase(phrase);
  const isValidated = normalizedPhrase === RESTORE_CONFIRMATION_PHRASE;
  const isTyping = phrase.length > 0 && !isValidated;

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!busy && !done) setDragging(true);
  }
  function handleDragLeave() {
    setDragging(false);
  }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (busy || done) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void onFile(file);
  }

  return (
    <div
      className="card-modern"
      style={{
        padding: '2.5rem',
        borderRadius: '28px',
        background: 'white',
        boxShadow: '0 30px 80px rgba(9, 13, 22, 0.08)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <span
            className="badge badge-reception"
            style={{ display: 'inline-flex', gap: '0.35rem', marginBottom: '0.85rem', padding: '0.35rem 0.85rem', borderRadius: '999px' }}
          >
            <UploadCloud size={13} /> RESTAURATION PREMIER DÉMARRAGE
          </span>
          <h1 style={{ fontSize: '2.35rem', fontWeight: 900, letterSpacing: '-0.05em', margin: 0, lineHeight: 1.1 }}>
            Restaurer une sauvegarde
          </h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: '620px', marginTop: '0.75rem', fontSize: '0.95rem' }}>
            Importez une archive ToqueHub complète pour recréer l'environnement depuis sa base PostgreSQL et ses documents métier.
          </p>
        </div>
        {!done ? (
          <button
            className="btn btn-secondary"
            onClick={onBack}
            disabled={busy}
            style={{ flexShrink: 0, marginTop: '0.25rem' }}
          >
            <ArrowLeft size={16} /> Retour
          </button>
        ) : null}
      </div>

      {/* Alerts */}
      <AnimatePresence>
        {error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="alert-modern error"
            style={{ marginBottom: '1.25rem' }}
          >
            <AlertCircleIcon /> {error}
          </motion.div>
        ) : null}
        {message ? (
          <motion.div
            key="message"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="alert-modern success"
            style={{ marginBottom: '1.25rem' }}
          >
            <CheckCircle2 size={18} /> {message}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Two-column grid */}
      <div className="restore-grid">

        {/* Left: Archive upload card */}
        <div className="restore-card-modern">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
            <span
              style={{
                width: 38, height: 38, borderRadius: 12,
                background: 'rgba(16, 185, 129, 0.08)',
                color: 'var(--primary)',
                display: 'grid', placeItems: 'center',
              }}
            >
              <FileArchive size={20} />
            </span>
            <div>
              <p style={{ margin: 0, fontWeight: 750, fontSize: '1.05rem', color: 'var(--text-main)' }}>Archive de sauvegarde</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Fichier <code style={{ background: '#f1f5f9', padding: '0 4px', borderRadius: 4 }}>toquehub-backup-*.tar.gz</code>
              </p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!inspection ? (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".gz,.tgz,.tar.gz,application/gzip"
                  style={{ display: 'none' }}
                  disabled={busy || done}
                  onChange={(event) => void onFile(event.target.files?.[0])}
                />
                {/* Drag & Drop Zone */}
                <div
                  className={`restore-drag-zone${dragging ? ' drag-active' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !busy && !done && fileInputRef.current?.click()}
                >
                  <div className="restore-drag-icon-wrapper">
                    <UploadCloud size={28} />
                  </div>
                  <p className="restore-drag-title">{dragging ? 'Déposez ici !' : 'Déposez votre archive ici'}</p>
                  <p className="restore-drag-sub">ou <span style={{ color: 'var(--primary)', fontWeight: 600 }}>cliquez pour parcourir</span></p>
                  <p className="restore-drag-sub" style={{ marginTop: '-0.25rem' }}>.tar.gz · .tgz · .gz</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="inspection"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <div className="restore-file-details-card">
                  <div className="restore-file-header">
                    <div className="restore-file-icon"><FileArchive size={22} /></div>
                    <div className="restore-file-meta">
                      <p className="restore-file-name">{inspection.filename}</p>
                      <span className="restore-file-status">
                        <CheckCircle2 size={12} /> Archive valide – manifeste lu
                      </span>
                    </div>
                    {!busy && !done ? (
                      <button
                        title="Changer le fichier"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', padding: '4px', borderRadius: 8,
                          transition: 'color 0.2s',
                          flexShrink: 0,
                        }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <RefreshCcw size={16} />
                      </button>
                    ) : null}
                  </div>

                  {/* Inspection specs grid */}
                  <div className="restore-specs-grid">
                    <div className="restore-spec-item">
                      <span className="restore-spec-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Clock size={12} /> Créée le
                      </span>
                      <span className="restore-spec-value">
                        {new Date(inspection.manifest.createdAt).toLocaleString(activeLocale())}
                      </span>
                    </div>
                    <div className="restore-spec-item">
                      <span className="restore-spec-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Database size={12} /> Base PostgreSQL
                      </span>
                      <span className="restore-spec-value">{formatBackupBytes(inspection.manifest.database.sizeBytes)}</span>
                    </div>
                    <div className="restore-spec-item">
                      <span className="restore-spec-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Files size={12} /> Documents
                      </span>
                      <span className="restore-spec-value">{inspection.manifest.files.totalFileCount} fichier(s)</span>
                    </div>
                    <div className="restore-spec-item">
                      <span className="restore-spec-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <FileArchive size={12} /> Volume total
                      </span>
                      <span className="restore-spec-value">{formatBackupBytes(inspection.manifest.files.totalSizeBytes)}</span>
                    </div>
                  </div>

                  {/* Hidden file input for replacement */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".gz,.tgz,.tar.gz,application/gzip"
                    style={{ display: 'none' }}
                    disabled={busy || done}
                    onChange={(event) => void onFile(event.target.files?.[0])}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Confirmation card */}
        <div
          className="restore-card-modern"
          style={{
            borderColor: isValidated
              ? 'rgba(16, 185, 129, 0.3)'
              : isTyping
              ? 'rgba(239, 68, 68, 0.25)'
              : undefined,
            transition: 'border-color 0.3s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
            <span
              style={{
                width: 38, height: 38, borderRadius: 12,
                background: isValidated
                  ? 'rgba(16, 185, 129, 0.08)'
                  : isTyping
                  ? 'rgba(239, 68, 68, 0.08)'
                  : 'rgba(100, 116, 139, 0.08)',
                color: isValidated ? 'var(--primary)' : isTyping ? '#ef4444' : '#64748b',
                display: 'grid', placeItems: 'center',
                transition: 'all 0.3s',
              }}
            >
              <ShieldCheck size={20} />
            </span>
            <div>
              <p style={{ margin: 0, fontWeight: 750, fontSize: '1.05rem', color: 'var(--text-main)' }}>Confirmation requise</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cette action est irréversible</p>
            </div>
          </div>

          <div className="restore-confirm-container">
            {/* Lock icon with animation */}
            <motion.div
              className={`restore-lock-shield${isValidated ? ' validated' : isTyping ? ' active' : ''}`}
              animate={isValidated ? { scale: [1, 1.15, 1] } : {}}
              transition={{ duration: 0.4 }}
            >
              {isValidated ? <LockKeyholeOpen size={32} /> : <LockKeyhole size={32} />}
            </motion.div>

            <div style={{ width: '100%' }}>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Saisissez exactement la phrase ci-dessous pour débloquer la restauration :
              </p>
              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: 10,
                  padding: '0.6rem 1rem',
                  marginBottom: '0.75rem',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  fontSize: '0.95rem',
                  color: 'var(--text-main)',
                  textAlign: 'center',
                  border: '1px dashed rgba(16,185,129,0.2)',
                  userSelect: 'all',
                }}
              >
                RESTAURER TOQUEHUB
              </div>
              <div className="restore-input-secure-container">
                <input
                  className={`restore-input-secure${isValidated ? ' validated' : isTyping ? ' active' : ''}`}
                  placeholder="Saisissez la phrase..."
                  value={phrase}
                  disabled={busy || done || !inspection}
                  onChange={(event) => onPhraseChange(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                className="btn btn-danger"
                style={{ width: '100%', padding: '0.9rem', fontSize: '0.95rem', fontWeight: 700, gap: '0.5rem' }}
                disabled={busy || done || !inspection || !isValidated}
                onClick={() => void onRestore()}
              >
                {busy ? (
                  <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Restauration en cours...</>
                ) : (
                  <><UploadCloud size={17} /> Restaurer cette sauvegarde</>
                )}
              </button>
              {done ? (
                <motion.button
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.9rem', fontSize: '0.95rem' }}
                  onClick={onLoginRequested}
                >
                  <CheckCircle2 size={17} /> Se connecter
                </motion.button>
              ) : null}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// 0. Welcome Screen
function WelcomeStep({
  language,
  onLanguageChange,
  onStart,
  onRestore,
  onHelp,
}: {
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  onStart: () => void;
  onRestore?: () => void;
  onHelp: () => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '3rem', alignItems: 'center', padding: '1rem 0' }}>
      <div>
        <div
          className="first-start-language-picker"
          role="group"
          aria-label={language === 'en' ? 'Choose the environment setup language' : 'Choisir la langue de création de l’environnement'}
        >
          <span>{language === 'en' ? 'Environment setup language' : 'Langue de création de l’environnement'}</span>
          <div>
            <button
              type="button"
              className={language === 'fr' ? 'active' : ''}
              onClick={() => onLanguageChange('fr')}
              aria-pressed={language === 'fr'}
              title="Afficher la création de l’environnement en français"
            >
              <span className="first-start-language-flag" aria-hidden="true">🇫🇷</span>
              <strong>Français</strong>
              {language === 'fr' ? <Check size={14} aria-hidden="true" /> : null}
            </button>
            <button
              type="button"
              className={language === 'en' ? 'active' : ''}
              onClick={() => onLanguageChange('en')}
              aria-pressed={language === 'en'}
              title="Display environment setup in English"
            >
              <span className="first-start-language-flag" aria-hidden="true">🇬🇧</span>
              <strong>English</strong>
              {language === 'en' ? <Check size={14} aria-hidden="true" /> : null}
            </button>
          </div>
        </div>
        <span className="badge badge-reception" style={{ marginBottom: '1.25rem', display: 'inline-flex', fontSize: '0.8rem', gap: '0.35rem' }}>
          <Sparkles size={14} /> Premier Démarrage
        </span>
        <h1 style={{ fontSize: '3.25rem', fontWeight: 900, lineHeight: 1.0, letterSpacing: '-0.05em', marginBottom: '1.5rem' }}>
          Bienvenue sur <span style={{ color: 'var(--primary)' }}>ToqueHub</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1.65, marginBottom: '2rem' }}>
          L'ERP de cuisine open source souverain pour gérer vos produits, vos fournisseurs, et tracer vos stocks locaux en toute simplicité. Configurez votre environnement de travail en moins d'une minute.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onStart} style={{ padding: '0.85rem 1.75rem', fontSize: '0.95rem' }}>
            Commencer la configuration <ArrowRight size={18} />
          </button>
          {onRestore ? (
            <button className="btn btn-secondary" onClick={onRestore} style={{ padding: '0.85rem 1.35rem', fontSize: '0.9rem' }}>
              <UploadCloud size={17} /> Restaurer une sauvegarde
            </button>
          ) : null}
          <button className="btn btn-secondary" onClick={onHelp} style={{ padding: '0.85rem 1.25rem', fontSize: '0.9rem' }}>
            <HelpCircle size={17} /> Besoin d'aide ?
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <KitchenIllustration />
      </div>
    </div>
  );
}

function HelpVolunteerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const canBookAppointment = Boolean(volunteerAppointmentUrl);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-wrapper modal-md" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--primary-bg-light)',
                color: 'var(--primary)',
                flexShrink: 0,
              }}
            >
              <HelpCircle size={20} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)' }}>Besoin d'aide ?</h2>
              <p style={{ margin: '0.15rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Accompagnement au premier démarrage</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
            Une équipe de bénévoles ToqueHub peut vous aider à préparer votre instance, restaurer une sauvegarde ou vérifier les premières informations de votre établissement.
          </p>
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.25rem' }}>
            {['Configuration initiale', 'Restauration de sauvegarde', 'Vérification des accès'].map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: 'var(--text-main)', fontWeight: 700 }}>
                <CheckCircle2 size={17} color="var(--primary)" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
          <button
            className="btn btn-primary"
            disabled={!canBookAppointment}
            title={canBookAppointment ? 'Ouvrir Calendly' : 'Lien Calendly à ajouter'}
            onClick={() => {
              if (canBookAppointment) window.open(volunteerAppointmentUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            <CalendarDays size={16} /> Prendre rendez-vous
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBackupBytes(value?: number | null) {
  if (!value) return '0 Ko';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} Ko`;
  return `${(value / 1024 / 1024).toFixed(1)} Mo`;
}

// 1. Admin setup Step
interface AdminStepProps {
  admin: AdminForm;
  updateAdmin: (field: keyof AdminForm) => (event: ChangeEvent<HTMLInputElement>) => void;
  showPassword: boolean;
  setShowPassword: (val: boolean) => void;
  score: number;
  usernameError?: string;
  onUsernameBlur: () => void;
}

function AdminStep({ admin, updateAdmin, showPassword, setShowPassword, score, usernameError, onUsernameBlur }: AdminStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <span className="badge badge-reception" style={{ marginBottom: '0.5rem', display: 'inline-flex', gap: '0.35rem' }}>
          <LockKeyhole size={14} /> Sécurisé
        </span>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Créer le compte pilote</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
          Cet administrateur configurera les données de base de l'établissement.
        </p>
      </div>

      <label>
        Nom d'utilisateur *
        <input
          className={usernameError ? 'onboarding-field-invalid' : undefined}
          placeholder="ex: chef_mario"
          value={admin.username}
          onChange={updateAdmin('username')}
          onBlur={onUsernameBlur}
          required
          autoFocus
          minLength={3}
          maxLength={40}
          pattern="[a-zA-Z0-9._-]+"
          aria-invalid={Boolean(usernameError)}
          aria-describedby={usernameError ? 'onboarding-username-error' : undefined}
        />
        {usernameError ? (
          <span id="onboarding-username-error" className="onboarding-field-error" role="alert">
            <AlertCircle size={15} />
            {usernameError}
          </span>
        ) : (
          <small className="onboarding-field-help">3 à 40 caractères, sans espace ni accent.</small>
        )}
      </label>

      <div className="form-row">
        <label>
          Prénom *
          <input placeholder="ex: Mario" value={admin.firstName} onChange={updateAdmin('firstName')} required />
        </label>
        <label>
          Nom de famille *
          <input placeholder="ex: Rossi" value={admin.lastName} onChange={updateAdmin('lastName')} required />
        </label>
      </div>

      <label>
        Adresse e-mail *
        <input type="email" placeholder="chef@monrestaurant.com" value={admin.email} onChange={updateAdmin('email')} required />
      </label>

      <div className="form-row">
        <label style={{ position: 'relative' }}>
          Mot de passe *
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={admin.password}
              onChange={updateAdmin('password')}
              required
              style={{ paddingRight: '2.5rem' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '0.5rem',
                background: 'transparent',
                border: 0,
                color: 'var(--text-muted)',
                padding: '0.25rem',
                boxShadow: 'none',
                height: 'auto',
                width: 'auto',
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="progress-bar-bg" style={{ height: '5px', marginTop: '0.4rem' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${score}%`,
                background: score === 100 ? 'var(--primary)' : score >= 50 ? 'var(--warning)' : 'var(--danger)',
              }}
            />
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            Fiabilité : {score === 100 ? 'Excellente' : 'À renforcer (10 car. requis + maj/min/chiffre/symb)'}
          </span>
        </label>

        <label>
          Confirmer le mot de passe *
          <input
            type="password"
            placeholder="••••••••"
            value={admin.confirm}
            onChange={updateAdmin('confirm')}
            required
          />
        </label>
      </div>
    </div>
  );
}

// 2. Organization Info Step
const establishmentTypeIcons: Record<string, React.ComponentType<any>> = {
  'Restaurant': Utensils,
  'EHPAD': Heart,
  'Collectivité': School,
  'Hôtel': Hotel,
  'Traiteur': ConciergeBell,
  'Cuisine centrale': CookingPot,
  'Autre': MoreHorizontal,
};

const regulatoryCountryFlags: Record<RegulatoryCountryCode, string> = {
  'FR': '🇫🇷',
  'FI': '🇫🇮',
};

// 2. Organization Info Step
interface OrganizationStepProps {
  organization: OrganizationForm;
  updateOrganization: (field: keyof Omit<OrganizationForm, 'logo'>) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  setOrganization: React.Dispatch<React.SetStateAction<OrganizationForm>>;
  miniStep: number;
  setMiniStep: (val: number) => void;
  isMultiSite: boolean | null;
  setIsMultiSite: (val: boolean | null) => void;
}

function OrganizationStep({
  organization,
  updateOrganization,
  setOrganization,
  miniStep,
  setMiniStep,
  isMultiSite,
  setIsMultiSite,
}: OrganizationStepProps) {
  function addSecondarySite() {
    setOrganization((prev) => ({ ...prev, secondarySiteNames: [...prev.secondarySiteNames, ''] }));
  }

  function updateSecondarySite(index: number, value: string) {
    setOrganization((prev) => ({
      ...prev,
      secondarySiteNames: prev.secondarySiteNames.map((item, itemIndex) => itemIndex === index ? value : item),
    }));
  }

  function removeSecondarySite(index: number) {
    setOrganization((prev) => ({ ...prev, secondarySiteNames: prev.secondarySiteNames.filter((_, itemIndex) => itemIndex !== index) }));
  }

  const syncSingleSiteName = (nameValue: string) => {
    setOrganization((prev) => ({
      ...prev,
      name: nameValue,
      primarySiteName: nameValue,
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '380px' }}>
      {/* Mini Onboarding Sub-Progress Navigation indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.85rem', marginBottom: '0.5rem', background: '#f8fafc', padding: '0.65rem 1rem', borderRadius: '12px', border: '1px solid var(--light-border)' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: miniStep === 0 ? 'var(--primary)' : 'var(--text-muted)', transition: 'color 0.2s' }}>1. Structure</span>
        <div style={{ width: '20px', height: '1.5px', background: 'var(--light-border)' }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: miniStep === 1 ? 'var(--primary)' : 'var(--text-muted)', transition: 'color 0.2s' }}>2. Identité & Activité</span>
        <div style={{ width: '20px', height: '1.5px', background: 'var(--light-border)' }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: miniStep === 2 ? 'var(--primary)' : 'var(--text-muted)', transition: 'color 0.2s' }}>3. Législation</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={miniStep}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', flexGrow: 1 }}
        >
          {miniStep === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <span className="badge badge-reception" style={{ marginBottom: '0.5rem', display: 'inline-flex', gap: '0.35rem' }}>
                  <Building2 size={14} /> Structure
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-main)' }}>Votre organisation</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  Sélectionnez le mode de déploiement adapté à votre établissement.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginTop: '0.5rem' }}>
                {/* Site Unique Card */}
                <motion.div
                  whileHover={{ y: -5, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)', borderColor: isMultiSite === false ? 'var(--primary)' : '#cbd5e1' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setIsMultiSite(false);
                    setOrganization(prev => ({ ...prev, secondarySiteNames: [] }));
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '1.5rem',
                    borderRadius: '20px',
                    border: isMultiSite === false ? '2px solid var(--primary)' : '1.5px solid var(--light-border)',
                    background: isMultiSite === false ? 'rgba(16, 185, 129, 0.03)' : '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    position: 'relative',
                    transition: 'border-color 0.2s, background-color 0.2s',
                    boxShadow: isMultiSite === false ? '0 10px 25px rgba(16, 185, 129, 0.08)' : 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: isMultiSite === false ? 'var(--primary)' : '#f1f5f9', color: isMultiSite === false ? '#ffffff' : 'var(--text-muted)', display: 'grid', placeItems: 'center', transition: 'all 0.2s' }}>
                      <Store size={22} />
                    </div>
                    {isMultiSite === false && (
                      <div style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'grid', placeItems: 'center' }}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>Site unique</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.45 }}>
                      Idéal si vous gérez un seul point de vente, restaurant ou cuisine. Vos stocks, plannings et HACCP sont centralisés au même endroit.
                    </p>
                  </div>
                </motion.div>

                {/* Multi-site Card */}
                <motion.div
                  whileHover={{ y: -5, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)', borderColor: isMultiSite === true ? 'var(--primary)' : '#cbd5e1' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setIsMultiSite(true);
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '1.5rem',
                    borderRadius: '20px',
                    border: isMultiSite === true ? '2px solid var(--primary)' : '1.5px solid var(--light-border)',
                    background: isMultiSite === true ? 'rgba(16, 185, 129, 0.03)' : '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    position: 'relative',
                    transition: 'border-color 0.2s, background-color 0.2s',
                    boxShadow: isMultiSite === true ? '0 10px 25px rgba(16, 185, 129, 0.08)' : 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: isMultiSite === true ? 'var(--primary)' : '#f1f5f9', color: isMultiSite === true ? '#ffffff' : 'var(--text-muted)', display: 'grid', placeItems: 'center', transition: 'all 0.2s' }}>
                      <Network size={22} />
                    </div>
                    {isMultiSite === true && (
                      <div style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'grid', placeItems: 'center' }}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>Multi-site</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.45 }}>
                      Conçu pour les structures disposant de plusieurs établissements, cuisines ou points de vente. Permet de gérer et consolider l'activité de vos différents sites.
                    </p>
                  </div>
                </motion.div>
              </div>
            </div>
          )}

          {miniStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <span className="badge badge-reception" style={{ marginBottom: '0.5rem', display: 'inline-flex', gap: '0.35rem' }}>
                  <Utensils size={14} /> Identité & Activité
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-main)' }}>Identité de l'établissement</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  Renseignez le nom de votre établissement ainsi que son type d'activité culinaire.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontWeight: 600, fontSize: '0.88rem', color: '#334155' }}>
                  Nom de l'établissement *
                  <input
                    placeholder="ex: Bistrot des Cocottes, Resto Scolaire..."
                    value={organization.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!isMultiSite) {
                        syncSingleSiteName(val);
                      } else {
                        setOrganization(prev => {
                          const previousName = prev.name.trim();
                          const siteWasSynced = !prev.primarySiteName.trim() || prev.primarySiteName.trim() === previousName || prev.primarySiteName.trim() === `${previousName} — Site principal`;
                          return {
                            ...prev,
                            name: val,
                            primarySiteName: siteWasSynced ? val : prev.primarySiteName
                          };
                        });
                      }
                    }}
                    required
                    autoFocus
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '12px',
                      border: '1.5px solid var(--light-border)',
                      fontSize: '0.95rem',
                      outline: 'none',
                      transition: 'all 0.2s',
                      background: '#ffffff',
                    }}
                  />
                </label>

                {isMultiSite && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '16px', border: '1.5px solid var(--light-border)' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <MapPin size={15} color="var(--primary)" /> Gestion des différents sites
                    </h3>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem', color: '#475569' }}>
                      Nom du site principal *
                      <input
                        placeholder="ex: Cuisine Centrale, Site A..."
                        value={organization.primarySiteName}
                        onChange={updateOrganization('primarySiteName')}
                        required
                        style={{
                          padding: '0.65rem 0.85rem',
                          borderRadius: '10px',
                          border: '1px solid var(--light-border)',
                          fontSize: '0.9rem',
                          outline: 'none',
                          background: '#ffffff',
                        }}
                      />
                    </label>

                    {organization.secondarySiteNames.map((siteName, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <input
                          placeholder={`Nom du site secondaire #${index + 1}`}
                          value={siteName}
                          onChange={(event) => updateSecondarySite(index, event.target.value)}
                          style={{
                            flex: 1,
                            padding: '0.65rem 0.85rem',
                            borderRadius: '10px',
                            border: '1px solid var(--light-border)',
                            fontSize: '0.9rem',
                            outline: 'none',
                            background: '#ffffff',
                          }}
                        />
                        <button
                          type="button"
                          aria-label="Retirer ce site secondaire"
                          onClick={() => removeSecondarySite(index)}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '10px',
                            border: '1px solid var(--light-border)',
                            background: '#fff',
                            color: '#e11d48',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                          }}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}

                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.01, borderColor: 'var(--primary)', background: 'rgba(16, 185, 129, 0.04)' }}
                      whileTap={{ scale: 0.99 }}
                      onClick={addSecondarySite}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.65rem',
                        borderRadius: '10px',
                        border: '2px dashed #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        transition: 'border-color 0.2s ease, background-color 0.2s ease',
                        marginTop: '0.25rem'
                      }}
                    >
                      <span style={{ fontSize: '1.1rem', lineHeight: 1, color: 'var(--primary)', fontWeight: 800 }}>+</span>
                      Ajouter un site secondaire
                    </motion.button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155' }}>
                  Type d'activité *
                </span>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: '0.65rem',
                }}>
                  {establishmentTypes.map((type) => {
                    const Icon = establishmentTypeIcons[type] || HelpCircle;
                    const isSelected = organization.type === type;
                    return (
                      <motion.div
                        key={type}
                        whileHover={{ y: -2, scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setOrganization(prev => ({ ...prev, type }));
                        }}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0.65rem',
                          borderRadius: '12px',
                          border: isSelected ? '2px solid var(--primary)' : '1.5px solid var(--light-border)',
                          background: isSelected ? 'rgba(16, 185, 129, 0.03)' : '#ffffff',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'all 0.2s',
                          minHeight: '76px',
                          textAlign: 'center',
                          boxShadow: isSelected ? '0 4px 12px rgba(16, 185, 129, 0.06)' : 'none'
                        }}
                      >
                        <div style={{
                          color: isSelected ? 'var(--primary)' : '#64748b',
                          marginBottom: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Icon size={18} strokeWidth={isSelected ? 2.5 : 2} />
                        </div>
                        <span style={{
                          fontSize: '0.74rem',
                          fontWeight: isSelected ? 800 : 550,
                          color: isSelected ? '#0f172a' : '#475569',
                          lineHeight: 1.2
                        }}>
                          {type}
                        </span>
                        {isSelected && (
                          <div style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: 'var(--primary)',
                            color: 'white',
                            borderRadius: '50%',
                            width: '14px',
                            height: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Check size={8} strokeWidth={3} />
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {miniStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <span className="badge badge-reception" style={{ marginBottom: '0.5rem', display: 'inline-flex', gap: '0.35rem' }}>
                  <ShieldCheck size={14} /> Législation
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-main)' }}>Réglementation RH</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  Sélectionnez le pays dont dépend le droit du travail de vos collaborateurs.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginTop: '0.5rem' }}>
                {/* France Card */}
                <motion.div
                  whileHover={{ y: -5, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)', borderColor: organization.regulatoryCountryCode === 'FR' ? 'var(--primary)' : '#cbd5e1' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setOrganization(prev => ({ ...prev, regulatoryCountryCode: 'FR' }));
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '1.5rem',
                    borderRadius: '20px',
                    border: organization.regulatoryCountryCode === 'FR' ? '2px solid var(--primary)' : '1.5px solid var(--light-border)',
                    background: organization.regulatoryCountryCode === 'FR' ? 'rgba(16, 185, 129, 0.03)' : '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    position: 'relative',
                    transition: 'border-color 0.2s, background-color 0.2s',
                    boxShadow: organization.regulatoryCountryCode === 'FR' ? '0 10px 25px rgba(16, 185, 129, 0.08)' : 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '2.8rem', lineHeight: 1 }}>🇫🇷</span>
                    {organization.regulatoryCountryCode === 'FR' && (
                      <div style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'grid', placeItems: 'center' }}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>France</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.45 }}>
                      Gestion réglementaire conforme au Code du Travail français et conventions HCR (heures supplémentaires, congés payés standards, repos hebdomadaires, modulation).
                    </p>
                  </div>
                </motion.div>

                {/* Finlande Card */}
                <motion.div
                  whileHover={{ y: -5, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)', borderColor: organization.regulatoryCountryCode === 'FI' ? 'var(--primary)' : '#cbd5e1' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setOrganization(prev => ({ ...prev, regulatoryCountryCode: 'FI' }));
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '1.5rem',
                    borderRadius: '20px',
                    border: organization.regulatoryCountryCode === 'FI' ? '2px solid var(--primary)' : '1.5px solid var(--light-border)',
                    background: organization.regulatoryCountryCode === 'FI' ? 'rgba(16, 185, 129, 0.03)' : '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    position: 'relative',
                    transition: 'border-color 0.2s, background-color 0.2s',
                    boxShadow: organization.regulatoryCountryCode === 'FI' ? '0 10px 25px rgba(16, 185, 129, 0.08)' : 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '2.8rem', lineHeight: 1 }}>🇫🇮</span>
                    {organization.regulatoryCountryCode === 'FI' && (
                      <div style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'grid', placeItems: 'center' }}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>Finlande</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.45 }}>
                      Réglementation et droit du travail finlandais. Adapté aux établissements opérant en Finlande (gestion des congés annuels spécifiques, conventions TES locales).
                    </p>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// 3. Team Size Step
interface TeamStepProps {
  teamSize: TeamSize;
  onSelect: (val: TeamSize) => void;
}

function TeamStep({ teamSize, onSelect }: TeamStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <span className="badge badge-reception" style={{ marginBottom: '0.5rem', display: 'inline-flex', gap: '0.35rem' }}>
          <UsersRound size={14} /> Dimensionnement
        </span>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Taille de l'équipe</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
          Indiquez le nombre de collaborateurs en cuisine pour adapter les vues.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
        {teamSizes.map(({ label, value }) => {
          const selected = teamSize === value;
          return (
            <div
              key={value}
              className={`card-modern card-hover-effect ${selected ? 'selected' : ''}`}
              style={{
                cursor: 'pointer',
                padding: '1.25rem',
                border: selected ? '2px solid var(--primary)' : '1px solid var(--light-border)',
                background: selected ? 'var(--primary-bg-light)' : 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                borderRadius: '16px',
                boxShadow: selected ? '0 10px 25px rgba(16,185,129,0.1)' : 'var(--shadow-sm)',
              }}
              onClick={() => onSelect(value)}
            >
              <UsersRound size={18} color={selected ? 'var(--primary)' : 'var(--text-muted)'} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: selected ? 'var(--text-main)' : 'var(--text-muted)' }}>
                {label}
              </span>
              {selected && <CheckCircle2 size={18} color="var(--primary)" style={{ marginLeft: 'auto' }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 4. Logo Step
interface LogoStepProps {
  organization: OrganizationForm;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onSkip: () => void;
}

function LogoStep({ organization, fileInputRef, onFile, onSkip }: LogoStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <span className="badge badge-reception" style={{ marginBottom: '0.5rem', display: 'inline-flex', gap: '0.35rem' }}>
          <ImagePlus size={14} /> Personnalisation
        </span>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Logo de l'établissement</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
          Étape facultative. Vous pourrez modifier le logo à tout moment depuis le profil.
        </p>
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed #cbd5e1',
          borderRadius: '20px',
          padding: '3rem 1.5rem',
          textAlign: 'center',
          background: 'rgba(248, 250, 252, 0.5)',
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = 'var(--primary)';
          e.currentTarget.style.background = 'rgba(16,185,129,0.01)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = '#cbd5e1';
          e.currentTarget.style.background = 'rgba(248, 250, 252, 0.5)';
        }}
      >
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFile} />
        {organization.logo ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <img
              src={organization.logo}
              alt="Logo Etablissement"
              style={{
                width: '100px',
                height: '100px',
                objectFit: 'contain',
                borderRadius: '12px',
                background: 'white',
                border: '1px solid var(--light-border)',
                padding: '0.25rem',
              }}
            />
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Logo importé avec succès !</span>
          </div>
        ) : (
          <>
            <UploadCloud size={44} color="var(--primary)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Importer une image</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>PNG ou JPG — le logo est optimisé automatiquement</span>
            </div>
          </>
        )}
      </div>

      <button className="btn btn-secondary" onClick={onSkip} style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
        Passer cette étape
      </button>
    </div>
  );
}

interface MistralKeyStepProps {
  value: string;
  onChange: (value: string) => void;
  onSkip: () => void;
  submitting: boolean;
}

interface MistralKeyStepProps {
  value: string;
  onChange: (value: string) => void;
  onSkip: () => void;
  submitting: boolean;
}

function MistralKeyStep({ value, onChange, onSkip, submitting }: MistralKeyStepProps) {
  const [showKey, setShowKey] = useState(false);
  
  return (
    <div style={{
      width: '100%',
      maxWidth: '620px',
      margin: '0 auto',
      background: 'linear-gradient(135deg, #ffffff 0%, #f4fbf7 100%)',
      border: '1px solid #d1fae5',
      borderRadius: '24px',
      padding: '2.5rem 2rem',
      color: '#0f172a',
      boxShadow: '0 20px 40px rgba(16, 185, 129, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.75rem',
      textAlign: 'left'
    }}>
      {/* Glowing background accent behind the robot */}
      <div style={{
        position: 'absolute',
        width: '320px',
        height: '320px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%)',
        filter: 'blur(30px)',
        right: '-60px',
        top: '-60px',
        zIndex: 1,
        pointerEvents: 'none'
      }} />

      {/* Top Header Section (Badge + Titles on left, Robot on right) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: '1.5rem',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2
      }}>
        {/* Left text column */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          {/* Badge */}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(16, 185, 129, 0.08)',
            color: '#047857',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '0.25rem 0.65rem',
            borderRadius: '20px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.75rem',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.05)'
          }}>
            Kokki · Assistant IA ✦
          </span>

          <h2 style={{
            fontSize: '1.75rem',
            fontWeight: 900,
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
            margin: 0,
            color: '#0f172a'
          }}>
            Découvrez <span style={{
              background: 'linear-gradient(90deg, #10b981, #047857)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 950
            }}>Kokki</span>
          </h2>

          <p style={{
            color: '#475569',
            fontSize: '0.82rem',
            lineHeight: 1.45,
            margin: '0.5rem 0 0',
            fontWeight: 500
          }}>
            L'<span style={{ color: '#10b981', fontWeight: 700 }}>assistant IA</span> de ToqueHub. Il vous accompagne dans vos stocks, vos documents et vos fiches techniques pour vous faire gagner du temps au quotidien.
          </p>
        </div>

        {/* Right floating robot column (Kokki Image LARGER) */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
            style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
          >
            <img
              src="/kokki-transparent.png"
              alt="Kokki Chatbot"
              style={{
                width: '100%',
                maxHeight: '230px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 15px 35px rgba(16, 185, 129, 0.25))'
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* Bullet features list */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1.25rem',
        position: 'relative',
        zIndex: 2
      }}>
        {/* Bullet 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            flexShrink: 0
          }}>
            <ScanLine size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>Analyse intelligente</span>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Factures, bons de livraison...</span>
          </div>
        </div>

        {/* Bullet 2 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            flexShrink: 0
          }}>
            <Package size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>Gestion des stocks</span>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Suivi, alertes et prévisions</span>
          </div>
        </div>

        {/* Bullet 3 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            flexShrink: 0
          }}>
            <BarChart3 size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>Insights puissants</span>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Tableaux de bord et rapports</span>
          </div>
        </div>

        {/* Bullet 4 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            flexShrink: 0
          }}>
            <MessageSquare size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>À vos côtés 24/7</span>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Posez vos questions à votre assistant IA</span>
          </div>
        </div>
      </div>

      {/* Input Box Card */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        position: 'relative',
        zIndex: 2,
        boxShadow: '0 4px 20px rgba(16, 185, 129, 0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#047857', fontSize: '0.85rem', fontWeight: 800 }}>
          <Key size={14} />
          <span>Connectez votre clé API</span>
        </div>

        {/* Mistral AI Info Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          background: 'rgba(16, 185, 129, 0.04)',
          border: '1px solid rgba(16, 185, 129, 0.12)',
          borderRadius: '12px',
          padding: '0.65rem 0.85rem',
          fontSize: '0.76rem',
          lineHeight: 1.4,
          color: '#374151'
        }}>
          <img 
            src="/mistral-logo.png" 
            alt="Mistral AI" 
            style={{ height: '18px', objectFit: 'contain', flexShrink: 0 }} 
          />
          <div>
            Propulsé par <strong>Mistral AI</strong>, le fleuron de l’IA française. Toutes vos requêtes restent sécurisées et vos données sont <strong>hébergées en Europe</strong> (conformité RGPD totale).
          </div>
        </div>

        {/* Input field */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', left: '0.85rem', display: 'flex', alignItems: 'center', color: '#94a3b8' }}>
            <Key size={15} />
          </div>
          <input
            type={showKey ? 'text' : 'password'}
            placeholder="Entrez votre clé API ToqueHub"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            style={{
              width: '100%',
              paddingLeft: '2.5rem',
              paddingRight: '2.5rem',
              height: '44px',
              borderRadius: '10px',
              border: '1.5px solid #cbd5e1',
              background: '#f8fafc',
              color: '#0f172a',
              fontSize: '0.88rem',
              outline: 'none',
              transition: 'all 0.2s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#10b981';
              e.target.style.background = '#ffffff';
              e.target.style.boxShadow = '0 0 0 2px rgba(16, 185, 129, 0.15)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#cbd5e1';
              e.target.style.background = '#f8fafc';
              e.target.style.boxShadow = 'none';
            }}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            style={{
              position: 'absolute',
              right: '0.85rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* Info label secure */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#94a3b8', fontSize: '0.74rem', fontWeight: 500 }}>
          <Lock size={12} />
          <span>Vos données sont chiffrées et sécurisées.</span>
        </div>

        {/* Action Connect button */}
        <button
          type="button"
          disabled={submitting}
          onClick={onSkip}
          style={{
            width: '100%',
            height: '44px',
            borderRadius: '10px',
            background: submitting 
              ? '#94a3b8' 
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '0.9rem',
            border: 'none',
            cursor: submitting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.25)',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            if (!submitting) {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 18px rgba(16, 185, 129, 0.35)';
            }
          }}
          onMouseOut={(e) => {
            if (!submitting) {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.25)';
            }
          }}
        >
          {submitting ? 'Création de l\'instance...' : 'Connecter l’assistant IA'} <ArrowRight size={14} />
        </button>

        {/* Link and skip */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: '0.76rem',
          color: '#64748b',
          marginTop: '0.25rem'
        }}>
          <span>Vous n'avez pas encore de clé API ? </span>
          <a
            href="https://console.mistral.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#059669', fontWeight: 700, marginLeft: '4px', textDecoration: 'underline' }}
          >
            Obtenir ma clé
          </a>
        </div>
      </div>

      {/* Skip configuration link */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <span 
          onClick={onSkip}
          style={{
            fontSize: '0.78rem',
            color: '#64748b',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontWeight: 600,
            transition: 'color 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.color = '#0f172a'}
          onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
        >
          Configurer plus tard (Passer cette étape)
        </span>
      </div>
    </div>
  );
}

// 5. Creation Seeding Step
function CreationStep({ completed }: { completed: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2rem 1rem' }}>
      <div className="spinner" style={{ width: '48px', height: '48px', borderWidth: '4px', marginBottom: '1.5rem' }}></div>
      <h2 style={{ fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '0.5rem' }}>
        Création de votre environnement
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '2rem' }}>
        Nous préparons votre espace ToqueHub professionnel.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '380px' }}>
        {creationSteps.map((label, index) => {
          const isDone = index < completed;
          const isCurrent = index === completed;
          return (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                padding: '0.85rem 1.1rem',
                borderRadius: '12px',
                background: isDone ? 'rgba(16, 185, 129, 0.04)' : isCurrent ? 'white' : 'rgba(241, 245, 249, 0.4)',
                border: isDone ? '1px solid rgba(16, 185, 129, 0.12)' : isCurrent ? '1px solid var(--light-border)' : '1px solid transparent',
                textAlign: 'left',
              }}
            >
              {isDone ? (
                <CheckCircle2 size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
              ) : isCurrent ? (
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#e2e8f0', flexShrink: 0 }} />
              )}
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  color: isDone ? 'var(--text-main)' : isCurrent ? 'var(--text-main)' : 'var(--text-muted)',
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sidebar workflow stepper
function OnboardingAside({ step, organization }: { step: OnboardingStep; organization: OrganizationForm }) {
  const steps = ['Bienvenue', 'Administrateur', 'Établissement', 'Équipe', 'Personnalisation', 'IA Mistral'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', height: '100%', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src="/toquehub-logo-wide-transparent-white.png"
            alt="ToqueHub Logo"
            style={{ height: '32px', objectFit: 'contain' }}
          />
        </div>

        <div>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '0.15em' }}>
            Installation guidée
          </span>
          <h3 style={{ color: 'white', fontSize: '1.35rem', marginTop: '0.3rem', fontWeight: 800, lineHeight: 1.25 }}>
            {organization.name.trim() || 'Votre Cuisine Connectée'}
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {steps.map((label, idx) => {
            const isPast = idx < step;
            const isCurrent = idx === step;
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                  color: isPast || isCurrent ? 'white' : 'rgba(255, 255, 255, 0.35)',
                  fontWeight: isCurrent ? 700 : 500,
                  fontSize: '0.9rem',
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
                    background: isPast ? 'var(--primary)' : isCurrent ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    border: isCurrent ? '1.5px solid var(--primary)' : '1px solid transparent',
                    color: isPast ? 'white' : isCurrent ? 'var(--primary)' : 'inherit',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                  }}
                >
                  {isPast ? '✓' : idx + 1}
                </div>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '1.25rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <ShieldCheck size={20} color="var(--primary)" style={{ marginBottom: '0.4rem' }} />
        <h4 style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700 }}>Données locales et souveraines</h4>
        <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', lineHeight: 1.45 }}>
          Votre instance démarre en local. Vous gardez la propriété et la maîtrise complète de vos fiches et stocks.
        </p>
      </div>
    </div>
  );
}

// 6. Already Initialized Safeguard View
function AlreadyInitialized({
  onLoginRequested,
  onRestore,
}: {
  onLoginRequested: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="card-modern" style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center', padding: '4rem 2rem' }}>
      <CheckCircle2 size={56} color="var(--primary)" style={{ margin: '0 auto 1.5rem' }} />
      <h2 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '0.75rem' }}>
        Instance déjà initialisée
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.6, marginBottom: '2rem' }}>
        Un compte administrateur ou un établissement a déjà été configuré. Le protocole de démarrage guidé initial est verrouillé pour protéger votre base de données locale.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={onLoginRequested}>
          Accéder à la connexion
        </button>
        <button className="btn btn-secondary" onClick={onRestore}>
          <UploadCloud size={16} /> Restaurer une sauvegarde
        </button>
      </div>
    </div>
  );
}

// 7. Landing Kitchen Illustration
function KitchenIllustration() {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
      <div
        className="card-modern"
        style={{
          background: 'var(--dark-bg)',
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
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Cuisine Centrale</span>
            <span className="badge badge-reception" style={{ fontSize: '0.72rem', textTransform: 'none' }}>Prêt</span>
          </div>

          {[
            { label: 'Inventaire des stocks', val: 82, color: 'var(--primary)' },
            { label: 'Fiches techniques', val: 56, color: '#3b82f6' },
            { label: 'Traçabilité HACCP', val: 44, color: '#f59e0b' },
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{item.label}</span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{item.val}%</span>
              </div>
              <div className="progress-bar-bg" style={{ height: '5px', background: 'rgba(255, 255, 255, 0.1)' }}>
                <div className="progress-bar-fill" style={{ width: `${item.val}%`, background: item.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function resizeLogo(file: File) {
  const maxSize = 512;
  const maxDataUrlLength = 700_000;
  const targetTypes = ['image/webp', 'image/jpeg'];
  const imageUrl = URL.createObjectURL(file);

  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      URL.revokeObjectURL(imageUrl);
      try {
        const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas indisponible');
        context.drawImage(image, 0, 0, width, height);

        for (const type of targetTypes) {
          for (const quality of [0.86, 0.76, 0.66, 0.56]) {
            const dataUrl = await canvasToDataUrl(canvas, type, quality);
            if (dataUrl.length <= maxDataUrlLength) {
              resolve(dataUrl);
              return;
            }
          }
        }

        resolve(await canvasToDataUrl(canvas, 'image/jpeg', 0.45));
      } catch (err) {
        reject(err);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error('Image invalide'));
    };
    image.src = imageUrl;
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Compression impossible'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Lecture impossible'));
        reader.readAsDataURL(blob);
      },
      type,
      quality,
    );
  });
}

function pause(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

import type { ChangeEvent, CSSProperties, DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UsersRound,
  AlertCircle,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type { BackupInspection, EstablishmentRightsRecommendationsResponse, EstablishmentType, RegulatoryCountryCode, RegulatorySector, SystemStatus, TeamSize, UserSession } from '../types';

interface FirstStartLandingProps {
  status?: SystemStatus;
  loading?: boolean;
  error?: string;
  onRefreshStatus: () => Promise<void> | void;
  onLoginRequested: () => void;
  onBootstrapComplete: (session: UserSession) => void;
}

type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type AdminForm = { username: string; firstName: string; lastName: string; email: string; password: string; confirm: string };
type OrganizationForm = { name: string; type: string; regulatoryCountryCode: RegulatoryCountryCode | ''; regulatorySector: RegulatorySector | ''; teamSize: TeamSize; logo?: string };

const establishmentTypes = ['Restaurant', 'EHPAD', 'Collectivité', 'Hôtel', 'Traiteur', 'Cuisine centrale', 'Autre'];
const regulatoryCountries: Array<{ label: string; value: RegulatoryCountryCode }> = [
  { label: 'France', value: 'FR' },
  { label: 'Finlande', value: 'FI' },
];
const regulatorySectors: Array<{ label: string; value: RegulatorySector }> = [
  { label: 'Secteur privé', value: 'PRIVATE' },
  { label: 'Secteur public', value: 'PUBLIC' },
];
const teamSizes: Array<{ label: string; value: TeamSize }> = [
  { label: '1 à 5 personnes', value: '1-5' },
  { label: '6 à 10 personnes', value: '6-10' },
  { label: '11 à 20 personnes', value: '11-20' },
  { label: 'Plus de 20 personnes', value: '20+' },
];
const creationSteps = ['Création de l’organisation', 'Activation des droits établissement', 'Création du site principal', 'Configuration de l’administrateur', 'Préparation OCR IA', 'Finalisation'];
const onboardingHiddenLegalCodes = new Set(['CP', 'CP_MALADIE', 'HS', 'PAUSE_6H', 'REPOS_QUOTIDIEN', 'REPOS_HEBDOMADAIRE', 'JF', 'JF_1MAI', 'RECUP_PONT']);
const volunteerAppointmentUrl = '';

function passwordScore(password: string) {
  let score = 0;
  if (password.length >= 10) score += 25;
  if (/[a-z]/.test(password)) score += 20;
  if (/[A-Z]/.test(password)) score += 20;
  if (/\d/.test(password)) score += 15;
  if (/[^A-Za-z\d]/.test(password)) score += 20;
  return Math.min(score, 100);
}

export function FirstStartLanding({
  status,
  loading,
  error,
  onRefreshStatus,
  onLoginRequested,
  onBootstrapComplete,
}: FirstStartLandingProps) {
  const [step, setStep] = useState<OnboardingStep>(0);
  const [admin, setAdmin] = useState<AdminForm>({ username: '', firstName: '', lastName: '', email: '', password: '', confirm: '' });
  const [organization, setOrganization] = useState<OrganizationForm>({ name: '', type: '', regulatoryCountryCode: '', regulatorySector: '', teamSize: '1-5' });
  const [showPassword, setShowPassword] = useState(false);
  const [mistralApiKey, setMistralApiKey] = useState('');
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [completedCreationSteps, setCompletedCreationSteps] = useState(0);
  const [showOnboardingPreview, setShowOnboardingPreview] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreInspection, setRestoreInspection] = useState<BackupInspection | null>(null);
  const [restorePhrase, setRestorePhrase] = useState('');
  const [restoreError, setRestoreError] = useState<string>();
  const [restoreMessage, setRestoreMessage] = useState<string>();
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreDone, setRestoreDone] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [rightsQuery, setRightsQuery] = useState('');
  const [rightsRecommendations, setRightsRecommendations] = useState<EstablishmentRightsRecommendationsResponse | null>(null);
  const [rightsLoading, setRightsLoading] = useState(false);
  const [rightsError, setRightsError] = useState<string>();
  const [selectedLegalRightIds, setSelectedLegalRightIds] = useState<Set<string>>(new Set());
  const [selectedManualTemplateCodes, setSelectedManualTemplateCodes] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const score = useMemo(() => passwordScore(admin.password), [admin.password]);
  const allowLogin = Boolean(status?.hasOrganization || status?.hasAdmin);
  const allowCreate = !status?.hasAdmin && !status?.hasOrganization;
  const progress = (Math.min(step, 6) / 6) * 100;

  useEffect(() => {
    if (step !== 3 || !organization.regulatoryCountryCode || !organization.regulatorySector) return;
    let cancelled = false;
    async function loadRights() {
      setRightsLoading(true);
      setRightsError(undefined);
      try {
        const response = await api.establishmentRightsRecommendations({
          country: organization.regulatoryCountryCode || undefined,
          sector: organization.regulatorySector || undefined,
          establishmentType: organization.type || undefined,
          query: rightsQuery.trim() || undefined,
        });
        if (cancelled) return;
        setRightsRecommendations(response);
      } catch (err) {
        if (!cancelled) setRightsError(err instanceof Error ? err.message : 'Droits établissement indisponibles.');
      } finally {
        if (!cancelled) setRightsLoading(false);
      }
    }
    void loadRights();
    return () => {
      cancelled = true;
    };
  }, [step, organization.regulatoryCountryCode, organization.regulatorySector, organization.type, rightsQuery]);

  function goNext() {
    setFormError(undefined);
    if (step === 1 && !validateAdmin()) return;
    if (step === 2 && !organization.name.trim()) {
      setFormError('Le nom de l’établissement est requis.');
      return;
    }
    if (step === 2 && !organization.regulatoryCountryCode) {
      setFormError('Le pays de réglementation est requis.');
      return;
    }
    if (step === 2 && !organization.regulatorySector) {
      setFormError('Le secteur est requis.');
      return;
    }
    if (step < 6) setStep((step + 1) as OnboardingStep);
  }

  document.title = "Bienvenue sur ToqueHub - Onboarding";

  function goBack() {
    setFormError(undefined);
    if (step > 0 && !submitting) setStep((step - 1) as OnboardingStep);
  }

  function validateAdmin() {
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
    return (event: ChangeEvent<HTMLInputElement>) => setAdmin((prev) => ({ ...prev, [field]: event.target.value }));
  }

  document.title = "Bienvenue sur ToqueHub";

  function updateOrganization(field: keyof Omit<OrganizationForm, 'logo'>) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setOrganization((prev) => {
      const value = event.target.value;
      return {
        ...prev,
        [field]: value,
        ...(field === 'regulatoryCountryCode' && !value ? { regulatorySector: '' } : {}),
      };
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

  function toggleLegalRight(id: string) {
    setSelectedLegalRightIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleManualTemplate(code: string) {
    setSelectedManualTemplateCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function activateSelectedEstablishmentRights(session: UserSession) {
    const token = session.accessToken;
    const legalIds = Array.from(selectedLegalRightIds);
    const manualCodes = Array.from(selectedManualTemplateCodes);
    for (const legalId of legalIds) await api.activateLegalRight(token, legalId);
    if (manualCodes.length && organization.regulatoryCountryCode) {
      const catalog = await api.prepareHrEntitlementCatalog(token, {
        countryCode: organization.regulatoryCountryCode,
        employmentFramework: organization.regulatorySector || undefined,
        organizationType: organization.type || undefined,
      });
      const catalogItemIds = (catalog.items ?? []).filter((item) => manualCodes.includes(item.code)).map((item) => item.id);
      if (catalogItemIds.length) await api.activateHrEntitlementCatalogSelection(token, { catalogItemIds, targetMode: 'NONE' });
    }
  }

  async function createEnvironment() {
    setFormError(undefined);
    if (!validateAdmin()) {
      setStep(1);
      return;
    }
    if (!organization.name.trim()) {
      setFormError('Le nom de l’établissement est requis.');
      setStep(2);
      return;
    }
    if (!organization.regulatoryCountryCode || !organization.regulatorySector) {
      setFormError('Le pays de réglementation et le secteur sont requis.');
      setStep(2);
      return;
    }

    setSubmitting(true);
    setStep(7);
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
        regulatorySector: organization.regulatorySector || undefined,
        teamSize: (organization.teamSize || undefined) as TeamSize | undefined,
        logoDataUrl: organization.logo,
        mistralApiKey: mistralApiKey.trim() || undefined,
      });
      setCompletedCreationSteps(1);
      try {
        await activateSelectedEstablishmentRights(finalSession);
      } catch (err) {
        console.warn('Activation des droits établissement incomplète', err);
      }
      setCompletedCreationSteps(2);
      await pause(300);
      setCompletedCreationSteps(3);
      await pause(300);
      setCompletedCreationSteps(4);
      await onRefreshStatus();
      await pause(450);
      setCompletedCreationSteps(5);
      await pause(250);
      setCompletedCreationSteps(6);
      await pause(250);
      onBootstrapComplete(finalSession);
    } catch (err) {
      setSubmitting(false);
      setFormError('Nous n’avons pas pu créer l’environnement. Vérifiez les informations puis réessayez.');
      if (err instanceof Error && err.message) setFormError(err.message);
      setStep(6);
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
      const result = await api.restoreBootstrapBackup(restoreInspection.uploadId, restorePhrase);
      setRestoreMessage(result.message || 'Restauration terminée. Vous pouvez vous connecter.');
      setRestoreDone(true);
      await onRefreshStatus();
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restauration impossible.');
    } finally {
      setRestoreBusy(false);
    }
  }

  const isFullWidth = step === 0 || step === 7;

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ChefHat size={32} color="#10b981" />
            <span style={{ fontWeight: 900, fontSize: '1.4rem', color: 'var(--text-main)', letterSpacing: '-0.04em' }}>TOQUE<span style={{ color: 'var(--primary)' }}>HUB</span></span>
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
        ) : !allowCreate && !showOnboardingPreview ? (
          <AlreadyInitialized
            onLoginRequested={onLoginRequested}
            onShowOnboarding={() => {
              setStep(0);
              setFormError(undefined);
              setShowOnboardingPreview(true);
            }}
          />
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
                        Étape {step} / 6
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
                        onStart={() => setStep(1)}
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
                      />
                    )}
                    {step === 2 && (
                      <OrganizationStep
                        organization={organization}
                        updateOrganization={updateOrganization}
                      />
                    )}
                    {step === 3 && (
                      <EstablishmentRightsStep
                        organization={organization}
                        recommendations={rightsRecommendations}
                        query={rightsQuery}
                        loading={rightsLoading}
                        error={rightsError}
                        selectedLegalRightIds={selectedLegalRightIds}
                        selectedManualTemplateCodes={selectedManualTemplateCodes}
                        onQuery={setRightsQuery}
                        onToggleLegal={toggleLegalRight}
                        onToggleManual={toggleManualTemplate}
                      />
                    )}
                    {step === 4 && (
                      <TeamStep
                        teamSize={organization.teamSize}
                        onSelect={(teamSize) => setOrganization((prev) => ({ ...prev, teamSize }))}
                      />
                    )}
                    {step === 5 && (
                      <LogoStep
                        organization={organization}
                        fileInputRef={fileInputRef}
                        onFile={handleLogo}
                        onSkip={() => setStep(6)}
                      />
                    )}
                    {step === 6 && (
                      <MistralKeyStep
                        value={mistralApiKey}
                        onChange={setMistralApiKey}
                        onSkip={createEnvironment}
                      />
                    )}
                    {step === 7 && <CreationStep completed={completedCreationSteps} />}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Step Navigation Actions */}
              {!isFullWidth && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--light-border)' }}>
                  <button className="btn btn-secondary" onClick={goBack} disabled={submitting}>
                    <ArrowLeft size={16} /> Retour
                  </button>
                  {step < 6 ? (
                    <button className="btn btn-primary" onClick={goNext} style={{ marginLeft: 'auto' }}>
                      {step === 3 ? 'Valider les droits' : 'Continuer'} <ArrowRight size={16} />
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

  const isValidated = phrase === 'RESTAURER TOQUEHUB';
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
                        {new Date(inspection.manifest.createdAt).toLocaleString('fr-FR')}
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
function WelcomeStep({ onStart, onRestore, onHelp }: { onStart: () => void; onRestore?: () => void; onHelp: () => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '3rem', alignItems: 'center', padding: '1rem 0' }}>
      <div>
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
}

function AdminStep({ admin, updateAdmin, showPassword, setShowPassword, score }: AdminStepProps) {
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
        <input placeholder="ex: chef_mario" value={admin.username} onChange={updateAdmin('username')} required autoFocus />
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
interface OrganizationStepProps {
  organization: OrganizationForm;
  updateOrganization: (field: keyof Omit<OrganizationForm, 'logo'>) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

function OrganizationStep({ organization, updateOrganization }: OrganizationStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <span className="badge badge-reception" style={{ marginBottom: '0.5rem', display: 'inline-flex', gap: '0.35rem' }}>
          <Building2 size={14} /> Établissement
        </span>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Votre établissement</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
          Identité de la structure rattachée à l'administrateur.
        </p>
      </div>

      <label>
        Nom de l'établissement *
        <input
          placeholder="ex: Bistrot des Cocottes, Resto Scolaire..."
          value={organization.name}
          onChange={updateOrganization('name')}
          required
          autoFocus
        />
      </label>

      <label>
        Type d'établissement
        <select value={organization.type} onChange={updateOrganization('type')}>
          <option value="">Sélectionner un type...</option>
          {establishmentTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </label>

      <label>
        Pays de réglementation *
        <select value={organization.regulatoryCountryCode} onChange={updateOrganization('regulatoryCountryCode')} required>
          <option value="">Choisir le pays de réglementation...</option>
          {regulatoryCountries.map((country) => (
            <option key={country.value} value={country.value}>{country.label}</option>
          ))}
        </select>
      </label>

      {organization.regulatoryCountryCode ? (
        <label>
          Secteur *
          <select value={organization.regulatorySector} onChange={updateOrganization('regulatorySector')} required>
            <option value="">Choisir le secteur...</option>
            {regulatorySectors.map((sector) => (
              <option key={sector.value} value={sector.value}>{sector.label}</option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

interface EstablishmentRightsStepProps {
  organization: OrganizationForm;
  recommendations: EstablishmentRightsRecommendationsResponse | null;
  query: string;
  loading: boolean;
  error?: string;
  selectedLegalRightIds: Set<string>;
  selectedManualTemplateCodes: Set<string>;
  onQuery: (value: string) => void;
  onToggleLegal: (id: string) => void;
  onToggleManual: (code: string) => void;
}

function EstablishmentRightsStep({
  organization,
  recommendations,
  query,
  loading,
  error,
  selectedLegalRightIds,
  selectedManualTemplateCodes,
  onQuery,
  onToggleLegal,
  onToggleManual,
}: EstablishmentRightsStepProps) {
  const legalRights = (recommendations?.recommendedRights ?? []).filter((right) => !onboardingHiddenLegalCodes.has(right.code));
  const manualTemplates = recommendations?.manualTemplates ?? [];
  const selectedCount = legalRights.filter((right) => selectedLegalRightIds.has(right.id)).length + manualTemplates.filter((template) => selectedManualTemplateCodes.has(template.code)).length;
  const context = `${countryLabel(organization.regulatoryCountryCode)} · ${sectorLabel(organization.regulatorySector)} · ${organization.type || 'Type à préciser'}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <span className="badge badge-reception" style={{ marginBottom: '0.5rem', display: 'inline-flex', gap: '0.35rem' }}>
          <ShieldCheck size={14} /> Droits
        </span>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: 0 }}>Droits de l’établissement</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
          Les droits obligatoires sont déjà inclus automatiquement. Sélectionnez ici uniquement les droits spécifiques à votre établissement.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
        <span className="badge badge-reception" style={{ textTransform: 'none' }}>{context}</span>
        <span className="badge" style={{ textTransform: 'none', background: '#f1f5f9', color: '#475569' }}>
          {selectedCount} droit{selectedCount > 1 ? 's' : ''} sélectionné{selectedCount > 1 ? 's' : ''}
        </span>
        {recommendations?.hiddenAutoIncludedCount ? (
          <span className="badge" style={{ textTransform: 'none', background: '#ecfdf5', color: '#047857' }}>
            {recommendations.hiddenAutoIncludedCount} inclus automatiquement masqué{recommendations.hiddenAutoIncludedCount > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      <label style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '2.55rem', color: '#94a3b8' }} />
        Rechercher
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="HCR, restauration collective, RTT, récupération..." style={{ paddingLeft: '2.4rem' }} />
      </label>

      {error ? <div className="alert-modern error" style={{ margin: 0 }}><AlertCircleIcon /><span>{error}</span></div> : null}
      {recommendations?.warnings?.length ? (
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          {recommendations.warnings.map((warning) => <small key={warning.code} style={{ color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.55rem 0.7rem' }}>{warning.message}</small>)}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', maxHeight: '320px', overflow: 'auto', paddingRight: '0.15rem' }}>
        {loading ? <div className="card-modern" style={{ padding: '1rem' }}>Chargement des droits...</div> : null}
        {!loading && legalRights.map((right) => {
          const selected = selectedLegalRightIds.has(right.id);
          return (
            <button key={right.id} type="button" className={`hr-catalog-card ${selected ? 'selected' : ''}`} onClick={() => onToggleLegal(right.id)} style={rightsCardStyle(selected)}>
              <span className="hr-catalog-check" style={rightsCheckStyle(selected)}>{selected ? <CheckCircle2 size={14} /> : null}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', textAlign: 'left', minWidth: 0 }}>
                <small style={{ color: '#64748b', fontWeight: 800 }}>{right.recommendation ?? sourceLabel(right.sourceLayer)}</small>
                <strong style={{ color: '#1e293b' }}>{right.name}</strong>
                <small style={{ color: '#64748b', lineHeight: 1.35 }}>{right.description ?? right.category}</small>
                {right.validationStatus === 'requires_review' ? <small style={{ color: '#b45309' }}>À valider juridiquement</small> : null}
              </span>
            </button>
          );
        })}
        {!loading && manualTemplates.map((template) => {
          const selected = selectedManualTemplateCodes.has(template.code);
          return (
            <button key={template.code} type="button" className={`hr-catalog-card ${selected ? 'selected' : ''}`} onClick={() => onToggleManual(template.code)} style={rightsCardStyle(selected)}>
              <span className="hr-catalog-check" style={rightsCheckStyle(selected)}>{selected ? <CheckCircle2 size={14} /> : null}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', textAlign: 'left', minWidth: 0 }}>
                <small style={{ color: '#64748b', fontWeight: 800 }}>Droit interne configurable</small>
                <strong style={{ color: '#1e293b' }}>{template.label}</strong>
                <small style={{ color: '#64748b', lineHeight: 1.35 }}>{template.shortDescription}</small>
              </span>
            </button>
          );
        })}
        {!loading && !legalRights.length && !manualTemplates.length ? (
          <div className="rights-empty-state" style={{ gridColumn: '1 / -1' }}>
            <strong>{organization.regulatoryCountryCode === 'FI' ? 'Base Finlande en préparation' : 'Aucun droit spécifique proposé'}</strong>
            <span>Les droits obligatoires restent inclus automatiquement et ne sont pas proposés à la sélection.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function rightsCardStyle(selected: boolean): CSSProperties {
  return {
    border: selected ? '2px solid #10b981' : '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.9rem',
    background: selected ? 'rgba(16, 185, 129, 0.04)' : 'white',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    minHeight: '132px',
  };
}

function rightsCheckStyle(selected: boolean): CSSProperties {
  return {
    background: selected ? '#10b981' : '#f1f5f9',
    color: selected ? 'white' : 'transparent',
    borderRadius: '8px',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: selected ? 'none' : '2px solid #cbd5e1',
    flexShrink: 0,
    marginTop: '2px',
  };
}

function countryLabel(value?: string | null) {
  if (value === 'FR') return 'France';
  if (value === 'FI') return 'Finlande';
  return 'Pays à choisir';
}

function sectorLabel(value?: string | null) {
  if (value === 'PRIVATE') return 'secteur privé';
  if (value === 'PUBLIC') return 'secteur public';
  return 'secteur à choisir';
}

function sourceLabel(value?: string | null) {
  if (value === 'collective_agreement') return 'Convention probable';
  if (value === 'public_regime' || value === 'public_status') return 'Statut public';
  if (value === 'establishment_manual' || value === 'manual_template') return 'Droit interne';
  return 'Droit spécifique';
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
}

function MistralKeyStep({ value, onChange, onSkip }: MistralKeyStepProps) {
  const [showKey, setShowKey] = useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '2.5rem', alignItems: 'center', padding: '0.5rem 0' }}>
      {/* Left Column - Presentation & Tech highlights */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: 'rgba(59, 130, 246, 0.08)',
              color: '#2563eb',
              border: '1px solid rgba(59, 130, 246, 0.15)',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.3rem 0.65rem',
              borderRadius: '20px',
              textTransform: 'none',
            }}
          >
            <span style={{ display: 'inline-flex', borderRadius: '1.5px', overflow: 'hidden', width: '15px', height: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
              <span style={{ width: '33.3%', background: '#002395', height: '100%' }}></span>
              <span style={{ width: '33.3%', background: '#FFFFFF', height: '100%' }}></span>
              <span style={{ width: '33.3%', background: '#ED2939', height: '100%' }}></span>
            </span>
            Souveraineté Française
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: 'rgba(16, 185, 129, 0.08)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.3rem 0.65rem',
              borderRadius: '20px',
              textTransform: 'none',
            }}
          >
            <Sparkles size={12} /> IA 100% Française
          </span>
        </div>

        <div>
          <h2 style={{ fontSize: '1.85rem', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.15, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            Intelligence Artificielle <span style={{ color: '#f97316' }}>Mistral AI</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
            ToqueHub intègre nativement Mistral, le fleuron de l'IA française. Toutes les requêtes et fichiers restent localisés et traités sur des serveurs hébergés en France (conformité RGPD totale).
          </p>
        </div>

        {/* Animated Mistral Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0' }}>
          <div style={{ position: 'relative', width: '100%', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div
              style={{
                position: 'absolute',
                width: '120px',
                height: '60px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(249, 115, 22, 0.2) 0%, transparent 70%)',
                filter: 'blur(12px)',
              }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            />
            <motion.img
              src="/mistral-logo.png"
              alt="Mistral AI"
              width="180"
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              style={{
                filter: 'drop-shadow(0 6px 16px rgba(249, 115, 22, 0.25))',
                objectFit: 'contain',
                maxWidth: '100%',
                zIndex: 2,
              }}
            />
          </div>
        </div>

        {/* Feature Highlights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'start' }}>
            <div style={{ display: 'grid', placeItems: 'center', width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.08)', color: '#2563eb', flexShrink: 0, marginTop: '2px' }}>
              <Server size={13} />
            </div>
            <div>
              <strong style={{ fontSize: '0.82rem', color: 'var(--text-main)', display: 'block' }}>Hébergement en France</strong>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>Aucun transfert de données hors du territoire français. Vos données financières et d'achats restent strictement privées.</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'start' }}>
            <div style={{ display: 'grid', placeItems: 'center', width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', flexShrink: 0, marginTop: '2px' }}>
              <ImagePlus size={13} />
            </div>
            <div>
              <strong style={{ fontSize: '0.82rem', color: 'var(--text-main)', display: 'block' }}>OCR Intelligent & Analyse d'images</strong>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>Analyse les photos et PDFs de vos factures / bons de livraison et en extrait instantanément les lignes et prix.</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'start' }}>
            <div style={{ display: 'grid', placeItems: 'center', width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b', flexShrink: 0, marginTop: '2px' }}>
              <ShieldCheck size={13} />
            </div>
            <div>
              <strong style={{ fontSize: '0.82rem', color: 'var(--text-main)', display: 'block' }}>Évite la saisie manuelle et les erreurs</strong>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>L'IA remplit les réceptions de stock à votre place. Vous n'avez plus qu'à vérifier et valider en 1 clic.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Input form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', borderRadius: '18px', background: '#f8fafc', border: '1px solid var(--light-border)' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 0.35rem 0', color: 'var(--text-main)' }}>Activer l'OCR intelligent</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.45, margin: 0 }}>
            Saisissez votre clé API ci-dessous. ToqueHub s'occupe de la connexion sécurisée aux services de Mistral AI.
          </p>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)' }}>
          Clé API Mistral
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showKey ? 'text' : 'password'}
              placeholder="mistral-..."
              value={value}
              onChange={(event) => onChange(event.target.value)}
              style={{
                width: '100%',
                paddingRight: '2.5rem',
                height: '42px',
                borderRadius: '10px',
                border: '1px solid var(--light-border)',
                background: 'white',
                fontSize: '0.88rem',
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              style={{
                position: 'absolute',
                right: '0.75rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '-0.5rem' }}>
          Obtenez une clé gratuite sur <a href="https://console.mistral.ai" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'underline' }}>console.mistral.ai</a>
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSkip}
            style={{
              height: '42px',
              borderRadius: '10px',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
              background: 'white',
              border: '1px solid var(--light-border)',
              color: 'var(--text-main)',
            }}
          >
            Passer cette étape
          </button>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>
            L'IA est optionnelle. Vous pourrez également configurer ou modifier votre clé plus tard dans vos paramètres.
          </span>
        </div>
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
  const steps = ['Bienvenue', 'Administrateur', 'Établissement', 'Droits', 'Équipe', 'Personnalisation', 'IA Mistral'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', height: '100%', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ChefHat size={28} color="#10b981" />
          <span style={{ fontWeight: 850, fontSize: '1.2rem', color: 'white', letterSpacing: '-0.03em' }}>
            TOQUE<span style={{ color: 'var(--primary)' }}>HUB</span>
          </span>
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
function AlreadyInitialized({ onLoginRequested, onShowOnboarding }: { onLoginRequested: () => void; onShowOnboarding: () => void }) {
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
        <button className="btn btn-secondary" onClick={onShowOnboarding}>
          Voir la création d’environnement
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

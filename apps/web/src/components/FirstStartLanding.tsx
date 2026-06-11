import type { ChangeEvent, FormEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChefHat,
  Eye,
  EyeOff,
  ImagePlus,
  LockKeyhole,
  Server,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UsersRound,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api/client';
import type { EstablishmentType, SystemStatus, TeamSize, UserSession } from '../types';

interface FirstStartLandingProps {
  status?: SystemStatus;
  loading?: boolean;
  error?: string;
  onRefreshStatus: () => Promise<void> | void;
  onLoginRequested: () => void;
  onBootstrapComplete: (session: UserSession) => void;
}

type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5;
type AdminForm = { username: string; firstName: string; lastName: string; email: string; password: string; confirm: string };
type OrganizationForm = { name: string; type: string; teamSize: TeamSize; logo?: string };

const establishmentTypes = ['Restaurant', 'EHPAD', 'Collectivité', 'Hôtel', 'Traiteur', 'Cuisine centrale', 'Autre'];
const teamSizes: Array<{ label: string; value: TeamSize }> = [
  { label: '1 à 5 personnes', value: '1-5' },
  { label: '6 à 10 personnes', value: '6-10' },
  { label: '11 à 20 personnes', value: '11-20' },
  { label: 'Plus de 20 personnes', value: '20+' },
];
const creationSteps = ['Création de l’organisation', 'Création du site principal', 'Configuration de l’administrateur', 'Finalisation'];

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
  const [organization, setOrganization] = useState<OrganizationForm>({ name: '', type: '', teamSize: '1-5' });
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [completedCreationSteps, setCompletedCreationSteps] = useState(0);
  const [showOnboardingPreview, setShowOnboardingPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const score = useMemo(() => passwordScore(admin.password), [admin.password]);
  const allowLogin = Boolean(status?.hasOrganization || status?.hasAdmin);
  const allowCreate = !status?.hasAdmin && !status?.hasOrganization;
  const progress = (step / 4) * 100;

  function goNext() {
    setFormError(undefined);
    if (step === 1 && !validateAdmin()) return;
    if (step === 2 && !organization.name.trim()) {
      setFormError('Le nom de l’établissement est requis.');
      return;
    }
    if (step < 4) setStep((step + 1) as OnboardingStep);
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
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setOrganization((prev) => ({ ...prev, [field]: event.target.value }));
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
      setStep(1);
      return;
    }
    if (!organization.name.trim()) {
      setFormError('Le nom de l’établissement est requis.');
      setStep(2);
      return;
    }

    setSubmitting(true);
    setStep(5);
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
        teamSize: (organization.teamSize || undefined) as TeamSize | undefined,
        logoDataUrl: organization.logo,
      });
      setCompletedCreationSteps(1);
      await pause(300);
      setCompletedCreationSteps(2);
      await pause(300);
      setCompletedCreationSteps(3);
      await onRefreshStatus();
      await pause(450);
      setCompletedCreationSteps(4);
      await pause(250);
      onBootstrapComplete(finalSession);
    } catch (err) {
      setSubmitting(false);
      setFormError('Nous n’avons pas pu créer l’environnement. Vérifiez les informations puis réessayez.');
      if (err instanceof Error && err.message) setFormError(err.message);
      setStep(4);
    }
  }

  const isFullWidth = step === 0 || step === 5;

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
                        Étape {step} / 4
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
                    {step === 0 && <WelcomeStep onStart={() => setStep(1)} />}
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
                        onSkip={createEnvironment}
                      />
                    )}
                    {step === 5 && <CreationStep completed={completedCreationSteps} />}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Step Navigation Actions */}
              {!isFullWidth && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--light-border)' }}>
                  <button className="btn btn-secondary" onClick={goBack} disabled={submitting}>
                    <ArrowLeft size={16} /> Retour
                  </button>
                  {step < 4 ? (
                    <button className="btn btn-primary" onClick={goNext} style={{ marginLeft: 'auto' }}>
                      Continuer <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={createEnvironment} disabled={submitting} style={{ marginLeft: 'auto' }}>
                      {submitting ? 'Création de l\'instance...' : 'Créer mon environnement'} <Sparkles size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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

// 0. Welcome Screen
function WelcomeStep({ onStart }: { onStart: () => void }) {
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
        <button className="btn btn-primary" onClick={onStart} style={{ padding: '0.85rem 1.75rem', fontSize: '0.95rem' }}>
          Commencer la configuration <ArrowRight size={18} />
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <KitchenIllustration />
      </div>
    </div>
  );
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
  const steps = ['Bienvenue', 'Administrateur', 'Établissement', 'Équipe', 'Personnalisation'];
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

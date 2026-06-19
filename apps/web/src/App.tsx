import { useEffect, useState } from 'react';
import { api } from './api/client';
import { Dashboard } from './components/Dashboard';
import { FirstStartLanding } from './components/FirstStartLanding';
import { LoginPage } from './components/LoginPage';
import type { SystemStatus, UserSession } from './types';
import './styles.css';

const STORAGE_KEY = 'toquehub.session';

type Route = 'landing' | 'login' | 'dashboard' | 'setup-organization';

function routeFromPath(): Route {
  if (window.location.pathname === '/login') return 'login';
  if (window.location.pathname === '/setup/organization') return 'setup-organization';
  return 'landing';
}

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [status, setStatus] = useState<SystemStatus>();
  const [statusError, setStatusError] = useState<string>();
  const [statusLoading, setStatusLoading] = useState(true);
  const [loginError, setLoginError] = useState<string>();
  const [route, setRoute] = useState<Route>(() => routeFromPath());

  async function refreshStatus() {
    setStatusError(undefined);
    setStatusLoading(true);
    try {
      setStatus(await api.status());
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Statut système indisponible');
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const storedSession = JSON.parse(raw) as UserSession;
        void api.me(storedSession.accessToken)
          .then((freshUser) => {
            const refreshedSession = { ...storedSession, user: { ...storedSession.user, ...freshUser } };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(refreshedSession));
            setSession(refreshedSession);
          })
          .catch(() => {
            localStorage.removeItem(STORAGE_KEY);
            setSession(null);
          });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    void refreshStatus();

    const listener = () => setRoute(routeFromPath());
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, []);

  async function handleLogin(email: string, password: string) {
    setLoginError(undefined);
    try {
      const nextSession = await api.login(email, password);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      navigate(nextSession.user.organizationId ? '/app' : '/setup/organization');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Connexion impossible');
    }
  }

  async function handleSetupOrganization(payload: { name: string; code?: string; establishmentType?: string; teamSize?: string; logoDataUrl?: string }) {
    if (!session) throw new Error('Session administrateur introuvable');
    const nextSession = await api.setupOrganization(session.accessToken, payload);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    await refreshStatus();
    navigate('/app');
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    navigate('/');
    void refreshStatus();
  }

  if (route === 'setup-organization') {
    return <SetupOrganizationPage session={session} onSubmit={handleSetupOrganization} onBackHome={() => navigate('/')} />;
  }

  if (session && route !== 'login') {
    return         <Dashboard session={session} onLogout={handleLogout} onSessionSwitch={(nextSession) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
          setSession(nextSession);
        }} />;
  }

  if (route === 'login') {
    return <LoginPage onLogin={handleLogin} error={loginError} onBack={() => navigate('/')} />;
  }

  return (
    <FirstStartLanding
      status={status}
      loading={statusLoading}
      error={statusError}
      onRefreshStatus={refreshStatus}
      onLoginRequested={() => navigate('/login')}
        onBootstrapComplete={(nextSession) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
          setSession(nextSession);
          void refreshStatus();
          navigate('/app');
        }}
    />
  );
}

function SetupOrganizationPage({
  session,
  onSubmit,
  onBackHome,
}: {
  session: UserSession | null;
  onSubmit: (payload: { name: string; code?: string; establishmentType?: string; teamSize?: string; logoDataUrl?: string }) => Promise<void>;
  onBackHome: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (!session) {
      setError('Connecte-toi avec le compte administrateur pour créer l’établissement.');
      return;
    }

    if (!name.trim()) {
      setError('Le nom de l’établissement est requis.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), code: code.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création de l’établissement impossible');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="setup-placeholder">
      <section>
        <p className="eyebrow">Étape 2 / Établissement</p>
        <h1>Configuration de l’établissement</h1>
        <p className="muted">
          Crée l’établissement rattaché à l’administrateur. Les unités de base seront ajoutées automatiquement.
        </p>

        {error ? <div className="alert">{error}</div> : null}

        <form onSubmit={submit} className="setup-form">
          <label>
            Nom de l’établissement
            <input placeholder="Bistrot des Halles" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Code optionnel
            <input placeholder="bistrot-halles" value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <div className="setup-actions">
            <button type="submit" disabled={submitting || !session}>
              {submitting ? 'Création…' : 'Créer l’établissement'}
            </button>
            <button type="button" className="secondary" onClick={onBackHome} disabled={submitting}>
              Retour à l’accueil
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

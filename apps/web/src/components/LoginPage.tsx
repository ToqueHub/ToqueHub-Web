import type { FormEvent } from 'react';
import { useState } from 'react';

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  error?: string;
  onBack?: () => void;
}

export function LoginPage({ onLogin, error, onBack }: LoginPageProps) {
  const [email, setEmail] = useState('admin@toquehub.local');
  const [password, setPassword] = useState('toquehub');
  const [isSubmitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">ERP cuisine open source</p>
        <h1>ToqueHub</h1>
        <p className="muted">
          Connectez-vous à votre instance locale pour gérer produits, fournisseurs et stocks.
        </p>
        <form onSubmit={handleSubmit} className="stack">
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
          </label>
          <label>
            Mot de passe
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
            />
          </label>
          {error ? <div className="alert">{error}</div> : null}
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p className="hint">Démo seed : admin@toquehub.local / toquehub</p>
        {onBack ? (
          <button className="secondary" type="button" onClick={onBack}>
            Retour à l’accueil
          </button>
        ) : null}
      </section>
    </main>
  );
}

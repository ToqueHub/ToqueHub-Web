import { useState } from 'react';
import { ChevronDown, ExternalLink, KeyRound } from 'lucide-react';

export function ZettleApiKeyGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="finance-onboarding-zettle-guide">
      <button
        type="button"
        className="finance-onboarding-help"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <KeyRound size={16} /> Comment obtenir une clé API Zettle ?
        <ChevronDown size={17} className={open ? 'open' : ''} />
      </button>
      {open ? (
        <ol className="finance-onboarding-api-guide zettle">
          <li>
            <span>1</span>
            <div>
              <strong>Connectez-vous à MyZettle</strong>
              <p>
                Ouvrez{' '}
                <a href="https://my.zettle.com" target="_blank" rel="noreferrer">
                  my.zettle.com <ExternalLink size={11} />
                </a>{' '}
                avec le compte marchand à connecter à ToqueHub.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Ouvrez Intégrations</strong>
              <p>
                Dans le menu principal, choisissez « Intégrations » — « Integraatiot » si votre
                interface est en finnois.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Accédez aux clés API</strong>
              <p>
                Dans « Outils d’intégration », ouvrez « Clés API » — « API-avaimet » en finnois.
              </p>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <strong>Créez et copiez la clé</strong>
              <p>
                Créez une clé dédiée à ToqueHub, puis copiez le Client ID et la clé API dans les
                champs ci-dessous. Conservez la clé en lieu sûr.
              </p>
            </div>
          </li>
        </ol>
      ) : null}
    </div>
  );
}

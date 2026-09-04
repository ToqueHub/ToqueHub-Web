import type { ReactNode } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';

type Benefit = { icon: ReactNode; text: ReactNode; tone?: 'success' | 'warning' };

export function GuidedWelcome({
  title,
  description,
  benefits,
  illustration,
  onNext,
  onClose,
}: {
  title: ReactNode;
  description: ReactNode;
  benefits: Benefit[];
  illustration: ReactNode;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="guided-welcome">
      <button className="guided-welcome-close" aria-label="Fermer" onClick={onClose}>
        <X size={20} />
      </button>
      <div>
        <span className="badge badge-reception guided-welcome-badge">
          <Sparkles size={14} /> Configuration guidée
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="guided-welcome-benefits">
          {benefits.map((benefit, index) => (
            <div key={index}>
              <span className={benefit.tone === 'warning' ? 'warning' : ''}>{benefit.icon}</span>
              {benefit.text}
            </div>
          ))}
        </div>
        <div className="guided-welcome-actions">
          <button className="btn btn-primary" onClick={onNext}>
            Démarrer la configuration <ArrowRight size={18} />
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Faire plus tard</button>
        </div>
      </div>
      <div className="guided-welcome-illustration">{illustration}</div>
    </div>
  );
}

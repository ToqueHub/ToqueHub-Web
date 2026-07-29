import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export function GuidedWizard({
  welcome,
  sidebar,
  step,
  totalSteps,
  onClose,
  children,
}: {
  welcome?: ReactNode;
  sidebar: ReactNode;
  step: number;
  totalSteps: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const progress = Math.round((step / totalSteps) * 100);
  return (
    <div className="modal-overlay hr-wizard-overlay guided-wizard-overlay">
      <i className="guided-wizard-orb right" />
      <i className="guided-wizard-orb left" />
      <motion.div
        className="modal-card hr-wizard-modal guided-wizard-modal"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 24, stiffness: 220 }}
        style={{ maxWidth: welcome ? 1080 : 1320 }}
      >
        {welcome ?? (
          <div className="guided-wizard-layout">
            <aside className="guided-wizard-rail">{sidebar}</aside>
            <main className="guided-wizard-main">
              <header className="guided-wizard-progress">
                <div>
                  <span className="badge badge-reception">
                    Étape {step} / {totalSteps}
                  </span>
                  <strong>{progress}%</strong>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={onClose}
                  aria-label="Fermer"
                >
                  <X size={20} />
                </button>
              </header>
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  className="guided-wizard-content"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.16 }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        )}
      </motion.div>
    </div>
  );
}

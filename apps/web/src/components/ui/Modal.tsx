import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'product';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  bodyClassName = '',
  overlayClassName = '',
  hideHeader = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  size?: ModalSize;
  bodyClassName?: string;
  overlayClassName?: string;
  hideHeader?: boolean;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className={`modal-overlay ${overlayClassName}`.trim()}
          onClick={onClose}
          style={{ pointerEvents: 'auto' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={`modal-content-wrapper modal-${size}`}
            onClick={(event) => event.stopPropagation()}
          >
            {!hideHeader ? (
              <div className="modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{title}</h3>
                  {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={onClose}
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>
            ) : null}
            <div className={`modal-body ${bodyClassName}`.trim()}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

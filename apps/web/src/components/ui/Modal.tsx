import { cloneElement, isValidElement, useEffect, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useLanguage } from '../../i18n';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'product';

let bodyScrollLockCount = 0;
let bodyOverflowBeforeModal = '';

function lockBodyScroll() {
  if (bodyScrollLockCount === 0) {
    bodyOverflowBeforeModal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyScrollLockCount += 1;

  return () => {
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
    if (bodyScrollLockCount === 0) {
      document.body.style.overflow = bodyOverflowBeforeModal;
    }
  };
}

const MODAL_TEXT_ATTRIBUTES = [
  'placeholder',
  'title',
  'aria-label',
  'aria-description',
  'alt',
] as const;

function translateModalNode(node: ReactNode, t: (value: string) => string): ReactNode {
  if (typeof node === 'string') return t(node);
  if (Array.isArray(node)) return node.map((child) => translateModalNode(child, t));
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<Record<string, unknown>>;
  if (element.props['data-i18n-ignore']) return element;
  const translatedProps: Record<string, unknown> = {};
  for (const attribute of MODAL_TEXT_ATTRIBUTES) {
    const value = element.props[attribute];
    if (typeof value === 'string') translatedProps[attribute] = t(value);
  }
  if (element.props.children !== undefined && element.type !== 'textarea') {
    translatedProps.children = translateModalNode(element.props.children as ReactNode, t);
  }
  return cloneElement(element, translatedProps);
}

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
  const { language, t } = useLanguage();

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    return lockBodyScroll();
  }, [isOpen]);

  if (typeof document === 'undefined') return null;

  const translatedTitle = translateModalNode(title, t);
  const translatedSubtitle = translateModalNode(subtitle, t);
  const translatedChildren = translateModalNode(children, t);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className={`modal-overlay ${overlayClassName}`.trim()}
          lang={language}
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
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                    {translatedTitle}
                  </h3>
                  {translatedSubtitle ? (
                    <p className="modal-subtitle">{translatedSubtitle}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={onClose}
                  aria-label={t('Fermer')}
                >
                  <X size={18} />
                </button>
              </div>
            ) : null}
            <div className={`modal-body ${bodyClassName}`.trim()}>{translatedChildren}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

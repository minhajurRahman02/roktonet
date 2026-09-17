import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Generic modal for admin actions (edit, confirm, create). Closes on
 * backdrop click and Escape. Same Framer Motion timing as the rest of the
 * shell (0.35s dropdowns) so it feels native.
 */
export default function Modal({ isOpen, onClose, title, subtitle, children, footer, wide = false }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className={`bg-white dark:bg-surface-dark rounded-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} border border-gray-200 dark:border-white/10 shadow-xl max-h-[90vh] flex flex-col`}
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} transition={{ duration: 0.25 }}
            role="dialog" aria-modal="true" aria-label={title}
          >
            <div className="flex items-start justify-between px-5 pt-5 pb-3">
              <div>
                <h3 className="font-display font-semibold text-lg dark:text-textprimary-dark">{title}</h3>
                {subtitle && <p className="text-sm text-gray-500 dark:text-textsecondary-dark mt-0.5">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="px-5 pb-4 overflow-y-auto">{children}</div>
            {footer && <div className="px-5 py-4 border-t border-gray-200 dark:border-white/10 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.node,
  children: PropTypes.node,
  footer: PropTypes.node,
  wide: PropTypes.bool,
};

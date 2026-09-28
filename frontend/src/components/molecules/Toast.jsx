import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X as XIcon } from 'lucide-react';

// The auto-dismissing confirmation for a low-stakes action -- dispatching a
// unit, starting a drive, logging one donation. See
// context/FeedbackContext.jsx: this is toastSuccess()'s output, never
// shown for a failure. A failure always gets the FeedbackPopup instead,
// because something that needs the person's attention should not clear
// itself off the screen while they're not looking.
//
// Static icons here, not the popup's animated draw-in. The draw-in is
// meant to be noticed; a toast's whole point is to confirm without asking
// for a moment of attention, so drawing the eye to it would work against
// what it is for.

const ICON = { success: Check, error: XIcon };
const TONE = {
  success: 'bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext',
  error: 'bg-critical-bg dark:bg-critical-dbg text-critical-text dark:text-critical-dtext',
};

function ToastItem({ toast, onDismiss }) {
  const Icon = ICON[toast.tone] || Check;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className={`flex items-center gap-2.5 rounded-lg border border-black/5 dark:border-white/10 shadow-lg px-3.5 py-2.5 text-sm font-medium max-w-xs ${TONE[toast.tone]}`}
      role="status"
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <XIcon size={13} />
      </button>
    </motion.div>
  );
}
ToastItem.propTypes = {
  toast: PropTypes.shape({ id: PropTypes.number, tone: PropTypes.string, message: PropTypes.node }).isRequired,
  onDismiss: PropTypes.func.isRequired,
};

/** The stack. Newest on top, below the sticky TopBar rather than over it. */
export default function ToastHost({ toasts, onDismiss }) {
  return (
    <div className="fixed top-20 right-4 z-[90] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

ToastHost.propTypes = {
  toasts: PropTypes.arrayOf(PropTypes.object).isRequired,
  onDismiss: PropTypes.func.isRequired,
};

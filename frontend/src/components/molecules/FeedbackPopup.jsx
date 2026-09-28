import PropTypes from 'prop-types';
import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Button from '../atoms/Button';

// The animated check/cross popup. See context/FeedbackContext.jsx for how
// this gets triggered -- nothing in the app should import this file
// directly, only useFeedback().
//
// WHY AN SVG DRAW-IN RATHER THAN AN ICON LIBRARY SWAP
//
// lucide-react's Check and X render instantly, same as any static icon.
// The brief asked for something with motion to it, so the circle and the
// mark inside it are each one stroked path animated by stroke-dashoffset --
// the same technique the Roktim launch section uses for its curve, not a
// new one introduced just for this.
//
// Colors come from the existing elective (success) and critical (error)
// tokens, the same ones "Saved.", the password-changed message, and every
// red inline error banner in the app already used -- this popup is meant
// to look like the rest of the system caught up to it, not like a new
// design language landed on top of it.

const TONE = {
  success: {
    ring: 'text-elective-text dark:text-elective-dtext',
    ringBg: 'bg-elective-bg dark:bg-elective-dbg',
    mark: 'M8 12.5l2.5 2.5 5.5-6', // a check
  },
  error: {
    ring: 'text-critical-text dark:text-critical-dtext',
    ringBg: 'bg-critical-bg dark:bg-critical-dbg',
    mark: 'M8 8l8 8M16 8l-8 8', // a cross
  },
};

function AnimatedIcon({ tone }) {
  const t = TONE[tone];
  // Same rule the rest of the app already follows for the Roktim curve and
  // the scroll reveal: prefers-reduced-motion gets the finished state
  // immediately, not a disabled-but-still-invisible-until-JS-runs circle.
  const reduce = useReducedMotion();
  const draw = reduce
    ? { initial: { pathLength: 1 }, animate: { pathLength: 1 }, transition: { duration: 0 } }
    : undefined;

  return (
    <div className={`w-14 h-14 rounded-full grid place-items-center shrink-0 ${t.ringBg}`}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className={t.ring} aria-hidden="true">
        <motion.circle
          cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6"
          initial={draw?.initial ?? { pathLength: 0 }} animate={draw?.animate ?? { pathLength: 1 }}
          transition={draw?.transition ?? { duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        />
        <motion.path
          d={t.mark} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          initial={draw?.initial ?? { pathLength: 0 }} animate={draw?.animate ?? { pathLength: 1 }}
          transition={draw?.transition ?? { duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.32 }}
        />
      </svg>
    </div>
  );
}
AnimatedIcon.propTypes = { tone: PropTypes.oneOf(['success', 'error']).isRequired };

/**
 * One popup at a time, rendered by FeedbackProvider. `tone` picks the icon
 * and color; `message` is the only required content -- this is meant for a
 * short confirmation or failure line, not a form.
 */
export default function FeedbackPopup({ isOpen, tone, message, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Enter' || e.key === 'Escape' ? onClose() : undefined;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="bg-white dark:bg-surface-dark rounded-xl w-full max-w-sm border border-gray-200 dark:border-white/10 shadow-xl p-6 flex flex-col items-center text-center gap-4"
            initial={{ opacity: 0, scale: 0.94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.22 }}
            role="alertdialog" aria-modal="true" aria-label={tone === 'success' ? 'Success' : 'Error'}
          >
            <AnimatedIcon tone={tone} />
            <p className="text-sm text-textprimary dark:text-textprimary-dark leading-relaxed">{message}</p>
            <Button variant="primary" onClick={onClose} className="w-full mt-1" autoFocus>
              OK
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

FeedbackPopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  tone: PropTypes.oneOf(['success', 'error']),
  message: PropTypes.node,
  onClose: PropTypes.func.isRequired,
};

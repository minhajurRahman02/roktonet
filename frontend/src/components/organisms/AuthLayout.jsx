import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

// Two soft circles drifting in opposite directions -- purely decorative,
// but grounded in the same primary-green identity used everywhere else.
// Kept subtle (low opacity, slow, small movement) so it reads as "alive"
// rather than distracting from the form.
function DriftingCircles() {
  return (
    <>
      <motion.div
        className="absolute w-72 h-72 rounded-full bg-primary-light dark:bg-primary opacity-40 -top-16 -left-16"
        animate={{ x: [0, 24, 0], y: [0, -18, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-48 h-48 rounded-full bg-primary-light dark:bg-primary opacity-30 -bottom-12 -right-8"
        animate={{ x: [0, -18, 0], y: [0, 16, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
    </>
  );
}

/**
 * Shared split-screen layout for every auth page (login, register, verify,
 * forgot/reset password) -- same brand panel system throughout so the
 * whole auth flow feels like one coherent product, not disconnected
 * screens. `panelWidth` lets a longer form (register) claim more space
 * without changing the visual language.
 */
export default function AuthLayout({ headline, tagline, panelWidth = 'half', children }) {
  const panelClass = panelWidth === 'twoFifths' ? 'md:w-2/5' : 'md:w-1/2';
  const formClass = panelWidth === 'twoFifths' ? 'md:w-3/5' : 'md:w-1/2';

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper dark:bg-paper-dark transition-colors duration-300">
      <div className={`${panelClass} bg-primary dark:bg-primary-dark relative overflow-hidden px-8 md:px-12 py-10 md:py-0 flex flex-col justify-center shrink-0`}>
        <DriftingCircles />
        <div className="relative z-10">
          <Link to="/" className="font-display font-bold text-2xl text-white block mb-6 md:mb-8">
            RoktoNet
          </Link>
          {headline && (
            <p className="font-display font-bold text-3xl md:text-4xl text-white leading-tight mb-4 max-w-sm">
              {headline}
            </p>
          )}
          {tagline && <p className="text-white/70 text-sm max-w-xs">{tagline}</p>}
        </div>
      </div>

      <div className={`${formClass} flex items-center justify-center px-6 py-10 md:py-0`}>
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

AuthLayout.propTypes = {
  headline: PropTypes.node,
  tagline: PropTypes.string,
  panelWidth: PropTypes.oneOf(['half', 'twoFifths']),
  children: PropTypes.node.isRequired,
};

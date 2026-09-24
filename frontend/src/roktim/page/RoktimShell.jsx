import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowUp, Menu, X } from 'lucide-react';
import { RoktimMark, RoktimDefs, RoktimMesh, BetaBadge } from '../RoktimBrand';

// The frame every Roktim page renders inside.
//
// It deliberately does NOT use AppShell. Roktim's page takes the full viewport
// with no RoktoNet sidebar, because the point of the page is that it is a
// different room: dark by default whatever the app theme is set to, its own
// palette, its own navigation. Reusing AppShell would have meant fighting it
// on every one of those.
//
// The cost of that choice is that the way back must be unmissable, which is
// what the gradient pill is for. It is the only control in the entire project
// styled unlike the rest of RoktoNet, and that is the point: it marks the
// boundary between the two worlds.

/**
 * Hide on scroll down, reappear on scroll up. The top nav is a convenience,
 * not a fixture, so it gets out of the way while someone is reading and comes
 * back the moment they look for it.
 */
function useScrollDirection() {
  const [showBar, setShowBar] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setScrolled(y > 24);
      // The 8px deadband stops the bar flickering on trackpad jitter and on
      // the rubber-band bounce at the top of the page.
      if (Math.abs(y - lastY.current) > 8) {
        setShowBar(y < lastY.current || y < 80);
        lastY.current = y;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return { showBar, scrolled };
}

export default function RoktimShell({ sections, activeId, onNavigate, children }) {
  const { showBar, scrolled } = useScrollDirection();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    function onScroll() {
      setAtTop(window.scrollY < 500);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Escape closes the drawer, and the body stops scrolling behind it. Without
  // the scroll lock, flicking inside an open overlay drags the page underneath
  // and the drawer appears to drift.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const go = useCallback(
    (id) => {
      setDrawerOpen(false);
      onNavigate?.(id);
    },
    [onNavigate],
  );

  return (
    <div className="min-h-screen bg-roktim-void text-roktim-ink font-body relative">
      <RoktimDefs id="rk-page" />
      <RoktimMesh />

      {/* --- Back to RoktoNet. Fixed, always visible, gradient ring. ------- */}
      <Link
        to="/admin"
        style={{ '--rk-pill-bg': '#0B0912' }}
        className="rk-gradient-ring fixed top-4 left-4 z-50 flex items-center gap-2
                   pl-3 pr-4 py-2 text-[13px] font-medium text-roktim-ink
                   hover:text-white transition-colors"
      >
        <ArrowLeft size={15} />
        Back to dashboard
      </Link>

      {/* --- Glass top nav. Hides going down, returns coming up. ---------- */}
      <AnimatePresence>
        {showBar && (
          <motion.header
            initial={{ y: -72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -72, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
            className={`fixed top-0 inset-x-0 z-40 ${
              scrolled
                ? 'backdrop-blur-xl bg-roktim-void/70 border-b border-roktim-hairline'
                : ''
            }`}
          >
            <div className="h-[60px] flex items-center justify-end gap-2 pl-[230px] pr-4">
              <nav className="hidden lg:flex items-center gap-1" aria-label="Roktim sections">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => go(s.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors ${
                      activeId === s.id
                        ? 'text-roktim-ink bg-white/[0.07]'
                        : 'text-roktim-muted hover:text-roktim-ink hover:bg-white/[0.04]'
                    }`}
                  >
                    <s.icon size={14} />
                    {s.short || s.label}
                  </button>
                ))}
              </nav>

              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open Roktim navigation"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-roktim-muted
                           hover:text-roktim-ink hover:bg-white/[0.06] transition-colors"
              >
                <Menu size={17} />
                <span className="lg:hidden text-[12.5px]">Sections</span>
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* --- Side drawer. OVERLAYS the page; the content never reflows. --- */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]"
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 w-[272px] bg-roktim-surface/95
                         backdrop-blur-xl border-r border-roktim-hairline p-4 flex flex-col"
              aria-label="Roktim navigation"
            >
              <div className="flex items-center justify-between mb-6 pt-1">
                <span className="flex items-center gap-2">
                  <RoktimMark size={20} id="rk-page" />
                  <span className="font-display font-semibold rk-gradient-text">Roktim</span>
                  <BetaBadge tone="own" />
                </span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation"
                  className="text-roktim-muted hover:text-roktim-ink p-1"
                >
                  <X size={17} />
                </button>
              </div>

              <nav className="flex flex-col gap-1">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => go(s.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                      activeId === s.id
                        ? 'bg-roktim-brand/25 text-roktim-ink'
                        : 'text-roktim-muted hover:text-roktim-ink hover:bg-white/[0.05]'
                    }`}
                  >
                    <s.icon size={16} className="shrink-0" />
                    {s.label}
                  </button>
                ))}
              </nav>

              <Link
                to="/admin"
                style={{ '--rk-pill-bg': '#141220' }}
                className="rk-gradient-ring mt-auto flex items-center justify-center gap-2
                           px-4 py-2.5 text-[13px] font-medium text-roktim-ink"
              >
                <ArrowLeft size={15} />
                Back to dashboard
              </Link>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="relative z-10">{children}</main>

      {/* Roktim's own back-to-top rather than the shared atom, which is
          bg-primary green. Restyling the shared one would have meant Roktim
          reaching into a component it does not own, and removing the module
          would then have to undo that. */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
        style={{ opacity: atTop ? 0 : 1, pointerEvents: atTop ? 'none' : 'auto' }}
        className="fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full rk-glow
                   bg-roktim-brand text-white flex items-center justify-center
                   hover:bg-[#6455A8] hover:-translate-y-0.5 transition-all duration-300"
      >
        <ArrowUp size={18} />
      </button>
    </div>
  );
}

RoktimShell.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      short: PropTypes.string,
      icon: PropTypes.elementType.isRequired,
    }),
  ).isRequired,
  activeId: PropTypes.string,
  onNavigate: PropTypes.func,
  children: PropTypes.node.isRequired,
};

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';
import SectionLink from '../molecules/SectionLink';

// `section` is a section of the landing page, `to` is a real route.
//
// The sections used to be bare '#impact' anchors, which worked on the
// landing page and did nothing at all on the three pages that share this
// nav: the browser resolved them against the current page, where no such
// anchor exists. SectionLink writes them landing-relative and scrolls on
// arrival.
const NAV_LINKS = [
  { to: '/how-it-works', label: 'How it works' },
  { section: 'impact', label: 'Impact' },
  { section: 'become-donor', label: 'Become a donor' },
  { to: '/about', label: 'About us' },
];

const NAV_LINK_CLASS = 'hover:text-primary dark:hover:text-white transition-colors duration-300';

export default function LandingNav() {
  const [isDark, setIsDark] = useDarkMode();
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  // Hides the nav on scroll-down, reveals it on scroll-up. Ignored near the
  // very top (< 120px) so it doesn't flicker while someone's just settling
  // onto the page.
  useEffect(() => {
    function handleScroll() {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current && currentY > 120) {
        setHidden(true);
      } else {
        setHidden(false);
      }
      lastScrollY.current = currentY;
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className="sticky top-0 z-50 bg-paper/50 dark:bg-paper-dark/90 backdrop-blur border-b border-gray-200 dark:border-white/10 transition-transform duration-300"
      style={{ transform: hidden ? 'translateY(-100%)' : 'translateY(0)' }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* The wordmark goes to the top of the LANDING page, not the top of
            whatever page you happen to be on. As a bare '#top' anchor it
            did the latter, which on /about read as a broken home link. */}
        <SectionLink id="top" className="flex items-center gap-2.5">
          {/* LOGO SLOT.
              Swap the <svg> below for <img src="/logo.svg" alt="" className="w-full h-full object-contain" />
              once the real mark exists. The 32px rounded square and the
              dashed border are the placeholder's own styling and should go
              with it; the sizing on the wrapper is what the layout depends
              on. */}
          <span className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-white/10 border border-dashed border-primary/40 dark:border-white/25 grid place-items-center shrink-0 overflow-hidden">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#A9382F" aria-hidden="true">
              <path d="M12 2C12 2 5 11.5 5 16a7 7 0 0 0 14 0c0-4.5-7-14-7-14z" />
            </svg>
          </span>
          <span className="font-display font-bold text-xl text-primary dark:text-textprimary-dark">RoktoNet</span>
        </SectionLink>

        <div className="hidden md:flex items-center gap-7 text-sm font-medium text-gray-600 dark:text-textsecondary-dark">
          {NAV_LINKS.map((link) => (link.to ? (
            <Link key={link.label} to={link.to} className={NAV_LINK_CLASS}>
              {link.label}
            </Link>
          ) : (
            <SectionLink key={link.label} id={link.section} className={NAV_LINK_CLASS}>
              {link.label}
            </SectionLink>
          )))}

          {/* Roktim carries its own colour here, which nothing else in the
              nav does. That is the point: it is a different world inside
              RoktoNet, and the link should say so before you click it. The
              sparks are positioned rather than laid out so they can sit
              outside the text box without affecting the nav's spacing. */}
          <SectionLink id="roktim" className="rkl-nav-link relative font-semibold">
            <span className="rkl-grad-text">Roktim</span>
            <span className="rk-sparkle" style={{ width: 3, height: 3, top: -3, left: 6, animationDelay: '0s' }} />
            <span className="rk-sparkle" style={{ width: 2, height: 2, top: 2, right: -4, animationDelay: '.9s' }} />
            <span className="rk-sparkle" style={{ width: 2.5, height: 2.5, bottom: -2, left: 22, animationDelay: '1.7s' }} />
          </SectionLink>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle dark mode"
            className="p-2 rounded-lg text-gray-500 dark:text-textsecondary-dark hover:bg-gray-100 dark:hover:bg-white/5 transition-colors duration-300"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link
            to="/login"
            className="text-sm font-medium text-gray-600 dark:text-textsecondary-dark hover:text-primary dark:hover:text-white transition-colors duration-300 px-3 py-2"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="text-sm font-medium bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition-colors duration-300"
          >
            Register
          </Link>
        </div>
      </div>
    </nav>
  );
}

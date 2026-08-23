import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#impact', label: 'Impact' },
  { href: '#become-donor', label: 'Become a donor' },
  { href: '#', label: 'About us' }, // placeholder -- no dedicated About page yet
];

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
        <a href="#top" className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#A9382F">
            <path d="M12 2C12 2 5 11 5 15.5C5 19.09 8.13 22 12 22C15.87 22 19 19.09 19 15.5C19 11 12 2 12 2Z" />
          </svg>
          <span className="font-display font-bold text-xl text-primary dark:text-textprimary-dark">RoktoNet</span>
        </a>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600 dark:text-textsecondary-dark">
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href} className="hover:text-primary dark:hover:text-white transition-colors duration-300">
              {link.label}
            </a>
          ))}
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

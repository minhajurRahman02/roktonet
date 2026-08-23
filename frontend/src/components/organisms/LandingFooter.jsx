import { Link } from 'react-router-dom';

const SOCIALS = [
  {
    label: 'GitHub',
    href: '#',
    path: 'M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.42.36.78 1.08.78 2.17 0 1.57-.01 2.83-.01 3.22 0 .3.2.66.79.55A10.5 10.5 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5z',
  },
  {
    label: 'Facebook',
    href: '#',
    path: 'M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z',
  },
  {
    label: 'LinkedIn',
    href: '#',
    path: 'M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.44-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.11 20.45H3.56V9h3.55v11.45z',
  },
  {
    label: 'Instagram',
    href: '#',
    path: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.8.31-1.47.72-2.14 1.39C1.32 2.7.91 3.37.6 4.16c-.3.76-.5 1.64-.56 2.91C-.01 8.34 0 8.75 0 12s-.01 3.66.04 4.93c.06 1.27.26 2.15.56 2.91.31.8.72 1.47 1.39 2.14.67.67 1.34 1.08 2.14 1.39.76.3 1.64.5 2.91.56 1.27.06 1.68.07 4.93.07s3.66-.01 4.93-.07c1.27-.06 2.15-.26 2.91-.56.8-.31 1.47-.72 2.14-1.39.67-.67 1.08-1.34 1.39-2.14.3-.76.5-1.64.56-2.91.06-1.27.07-1.68.07-4.93s-.01-3.66-.07-4.93c-.06-1.27-.26-2.15-.56-2.91-.31-.8-.72-1.47-1.39-2.14C21.3 1.32 20.63.91 19.84.6c-.76-.3-1.64-.5-2.91-.56C15.66-.01 15.25 0 12 0zm0 5.84A6.16 6.16 0 1 0 12 18.16 6.16 6.16 0 0 0 12 5.84zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z',
  },
];

const PRODUCT_LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Impact', href: '#impact' },
  { label: 'Become a donor', href: '#become-donor' },
];

const COMPANY_LINKS = [
  { label: 'About us', href: '#' },
  { label: 'GitHub repository', href: '#' },
  { label: 'Contact', href: '#' },
];

const RESOURCE_LINKS = [
  { label: 'Documentation', href: '#' },
  { label: 'Privacy policy', href: '#' },
  { label: 'Terms of service', href: '#' },
];

export default function LandingFooter() {
  return (
    <footer className="bg-footergreen text-white">
      <div className="max-w-6xl mx-auto px-6 py-14 grid sm:grid-cols-2 md:grid-cols-4 gap-10">
        <div>
          <a href="#top" className="flex items-center gap-2 mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#E8938C">
              <path d="M12 2C12 2 5 11 5 15.5C5 19.09 8.13 22 12 22C15.87 22 19 19.09 19 15.5C19 11 12 2 12 2Z" />
            </svg>
            <span className="font-display font-bold text-lg">RoktoNet</span>
          </a>
          <p className="text-white/60 text-sm leading-relaxed mb-4">
            Centralized blood inventory &amp; allocation optimization for Bangladesh.
          </p>
          <div className="flex gap-3">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors duration-300"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d={s.path} />
                </svg>
              </a>
            ))}
            <a
              href="#"
              aria-label="X"
              className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors duration-300"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
                <path d="M3 3l18 18M21 3L3 21" />
              </svg>
            </a>
          </div>
        </div>

        <div>
          <p className="mono text-xs text-white/40 mb-4">PRODUCT</p>
          <ul className="space-y-2.5 text-sm text-white/70">
            {PRODUCT_LINKS.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="hover:text-white transition-colors duration-300">
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <Link to="/login" className="hover:text-white transition-colors duration-300">
                Log in
              </Link>
            </li>
            <li>
              <Link to="/register" className="hover:text-white transition-colors duration-300">
                Register
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="mono text-xs text-white/40 mb-4">COMPANY</p>
          <ul className="space-y-2.5 text-sm text-white/70">
            {COMPANY_LINKS.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="hover:text-white transition-colors duration-300">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mono text-xs text-white/40 mb-4">RESOURCES</p>
          <ul className="space-y-2.5 text-sm text-white/70">
            {RESOURCE_LINKS.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="hover:text-white transition-colors duration-300">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-5 text-center text-xs text-white/50">
          © {new Date().getFullYear()} RoktoNet. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

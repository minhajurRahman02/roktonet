import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

// Only GitHub, because only GitHub is real. Facebook, LinkedIn, Instagram
// and X were all '#'. An icon row that goes nowhere reads as an abandoned
// product; add each one back when there is an account behind it.
const SOCIALS = [
  {
    label: 'GitHub',
    href: 'https://github.com/minhajurRahman02/roktonet',
    path: 'M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.42.36.78 1.08.78 2.17 0 1.57-.01 2.83-.01 3.22 0 .3.2.66.79.55A10.5 10.5 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5z',
  },
];

// Every destination here is real. The previous version pointed nine links
// at '#', which on a page a supervisor will click through is worse than
// not having the links at all.
//
// Terms of service was deleted rather than written: it would have been
// boilerplate describing obligations that do not exist for a course
// project. Privacy policy was kept and written properly, because RoktoNet
// does hold patient names and a dead link next to that fact is the thread
// an examiner pulls first.
const REPO_URL = 'https://github.com/minhajurRahman02/roktonet';

const PRODUCT_LINKS = [
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Impact', href: '#impact' },
  { label: 'Roktim', href: '#roktim' },
  { label: 'Become a donor', href: '#become-donor' },
];

const PROJECT_LINKS = [
  { label: 'About us', to: '/about' },
  { label: 'Contact', to: '/about#contact' },
  { label: 'GitHub repository', external: REPO_URL },
];

const RESOURCE_LINKS = [
  { label: 'Documentation', external: `${REPO_URL}#readme` },
  { label: 'Privacy policy', to: '/privacy' },
];


/**
 * One link, whichever of the three kinds it is.
 *
 * `to` routes inside the app, `external` leaves it, and a bare `href` is an
 * anchor on the landing page itself. Keeping the three apart matters: an
 * <a href="/about"> would full-page reload and throw away the SPA, and an
 * external link without rel="noopener" hands the new tab a reference back
 * to this window.
 */
function FooterLink({ link }) {
  const cls = 'hover:text-white transition-colors duration-300';
  if (link.external) {
    return <a href={link.external} target="_blank" rel="noopener noreferrer" className={cls}>{link.label}</a>;
  }
  if (link.to) {
    return <Link to={link.to} className={cls}>{link.label}</Link>;
  }
  return <a href={link.href} className={cls}>{link.label}</a>;
}
FooterLink.propTypes = { link: PropTypes.object.isRequired };

export default function LandingFooter() {
  return (
    <footer className="bg-footergreen text-white">
      <div className="max-w-6xl mx-auto px-6 py-14 grid sm:grid-cols-2 md:grid-cols-4 gap-10">
        <div>
          <a href="#top" className="flex items-center gap-2 mb-3">
            {/* <svg width="20" height="20" viewBox="0 0 24 24" fill="#E8938C">
              <path d="M12 2C12 2 5 11 5 15.5C5 19.09 8.13 22 12 22C15.87 22 19 19.09 19 15.5C19 11 12 2 12 2Z" />
            </svg> */}
            <span className="font-display font-bold text-lg">RoktoNet</span>
          </a>
          <p className="text-white/60 text-sm leading-relaxed mb-4">
            Centralized blood inventory &amp; allocation optimization for Bangladesh.
          </p>
          <div className="flex gap-3">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href} target="_blank" rel="noopener noreferrer"
                aria-label={s.label}
                className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors duration-300"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d={s.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>

        <div>
          <p className="mono text-xs text-white/40 mb-4">PRODUCT</p>
          <ul className="space-y-2.5 text-sm text-white/70">
            {PRODUCT_LINKS.map((l) => (
              <li key={l.label}>
                <FooterLink link={l} />
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
          <p className="mono text-xs text-white/40 mb-4">PROJECT</p>
          <ul className="space-y-2.5 text-sm text-white/70">
            {PROJECT_LINKS.map((l) => (
              <li key={l.label}>
                <FooterLink link={l} />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mono text-xs text-white/40 mb-4">RESOURCES</p>
          <ul className="space-y-2.5 text-sm text-white/70">
            {RESOURCE_LINKS.map((l) => (
              <li key={l.label}>
                <FooterLink link={l} />
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

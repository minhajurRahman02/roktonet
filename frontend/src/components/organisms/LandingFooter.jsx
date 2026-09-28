import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import SectionLink from '../molecules/SectionLink';

// GitHub is real; the other four are placeholders held open for accounts
// that do not exist yet.
//
// A placeholder has no `href`, and the renderer below gives it an inert
// click rather than href="#". That one detail matters: href="#" on a footer
// icon scrolls the reader back to the top of the page, so the row would
// feel actively broken rather than simply unfinished. Give an entry a real
// `href` and it becomes an ordinary external link with no other change.
const SOCIALS = [
  {
    label: 'GitHub',
    href: 'https://github.com/minhajurRahman02/roktonet',
    path: 'M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.42.36.78 1.08.78 2.17 0 1.57-.01 2.83-.01 3.22 0 .3.2.66.79.55A10.5 10.5 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5z',
  },
  {
    label: 'Facebook',
    path: 'M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z',
  },
  {
    label: 'Instagram',
    path: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.8.31-1.47.72-2.14 1.39C1.32 2.7.91 3.37.6 4.16c-.3.76-.5 1.64-.56 2.91C-.01 8.34 0 8.75 0 12s-.01 3.66.04 4.93c.06 1.27.26 2.15.56 2.91.31.8.72 1.47 1.39 2.14.67.67 1.34 1.08 2.14 1.39.76.3 1.64.5 2.91.56 1.27.06 1.68.07 4.93.07s3.66-.01 4.93-.07c1.27-.06 2.15-.26 2.91-.56.8-.31 1.47-.72 2.14-1.39.67-.67 1.08-1.34 1.39-2.14.3-.76.5-1.64.56-2.91.06-1.27.07-1.68.07-4.93s-.01-3.66-.07-4.93c-.06-1.27-.26-2.15-.56-2.91-.31-.8-.72-1.47-1.39-2.14C21.3 1.32 20.63.91 19.84.6c-.76-.3-1.64-.5-2.91-.56C15.66-.01 15.25 0 12 0zm0 5.84A6.16 6.16 0 1 0 12 18.16 6.16 6.16 0 0 0 12 5.84zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z',
  },
  {
    label: 'LinkedIn',
    path: 'M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.44-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.11 20.45H3.56V9h3.55v11.45z',
  },
  {
    label: 'X',
    path: 'M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23zm-1.16 17.52h1.83L7.01 4.13H5.04l12.04 15.64z',
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
  { label: 'Impact', section: 'impact' },
  { label: 'Roktim', section: 'roktim' },
  { label: 'Become a donor', section: 'become-donor' },
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
 * `to` routes inside the app, `external` leaves it, and `section` is a
 * section of the landing page. Keeping the three apart matters: an
 * <a href="/about"> would full-page reload and throw away the SPA, and an
 * external link without rel="noopener" hands the new tab a reference back
 * to this window.
 *
 * `section` used to be a bare <a href="#impact">, which was dead on the
 * three pages that share this footer, since it resolved against whichever
 * page the reader was on rather than against the landing page.
 */
function FooterLink({ link }) {
  const cls = 'hover:text-white transition-colors duration-300';
  if (link.external) {
    return <a href={link.external} target="_blank" rel="noopener noreferrer" className={cls}>{link.label}</a>;
  }
  if (link.to) {
    return <Link to={link.to} className={cls}>{link.label}</Link>;
  }
  return <SectionLink id={link.section} className={cls}>{link.label}</SectionLink>;
}
FooterLink.propTypes = { link: PropTypes.object.isRequired };

/**
 * One social icon, real or held open.
 *
 * A placeholder renders as a real anchor for the sake of hover and focus,
 * but swallows the click instead of jumping to the top of the page.
 */
function SocialIcon({ social }) {
  const placeholder = !social.href;
  const common = {
    'aria-label': placeholder ? `${social.label}, coming soon` : social.label,
    title: placeholder ? `${social.label}, coming soon` : social.label,
    className: 'w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors duration-300',
  };
  const icon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d={social.path} />
    </svg>
  );

  if (placeholder) {
    return (
      <a href="#top" onClick={(e) => e.preventDefault()} {...common}>
        {icon}
      </a>
    );
  }
  return (
    <a href={social.href} target="_blank" rel="noopener noreferrer" {...common}>
      {icon}
    </a>
  );
}
SocialIcon.propTypes = { social: PropTypes.object.isRequired };

export default function LandingFooter() {
  return (
    <footer className="bg-footergreen text-white">
      <div className="max-w-6xl mx-auto px-6 py-14 grid sm:grid-cols-2 md:grid-cols-4 gap-10">
        <div>
          <SectionLink id="top" className="flex items-center gap-2 mb-3">
            {/* <svg width="20" height="20" viewBox="0 0 24 24" fill="#E8938C">
              <path d="M12 2C12 2 5 11 5 15.5C5 19.09 8.13 22 12 22C15.87 22 19 19.09 19 15.5C19 11 12 2 12 2Z" />
            </svg> */}
            <span className="font-display font-bold text-lg">RoktoNet</span>
          </SectionLink>
          <p className="text-white/60 text-sm leading-relaxed mb-4">
            Centralized blood inventory &amp; allocation optimization for Bangladesh.
          </p>
          <div className="flex gap-3">
            {SOCIALS.map((s) => <SocialIcon key={s.label} social={s} />)}
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

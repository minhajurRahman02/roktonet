import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import LandingNav from './LandingNav';
import LandingFooter from './LandingFooter';
import { useReveal } from '../../hooks/useReveal';

// Nav, hero band and footer for the public pages that are not the landing
// page itself: How it works, About, Privacy.
//
// These three share a shell rather than each repeating it so that a change
// to the nav lands everywhere at once. That matters more than it looks:
// the nav holds the Roktim link and the logo slot, and having three copies
// drift apart is exactly how a placeholder logo survives into a demo on one
// page and not another.
//
// The back link is an explicit Link to '/' rather than a history-based
// back. Somebody who opened /about from a shared URL has no history to go
// back to, and a dead back button on a page that is mostly read by
// outsiders is worse than a slightly redundant one.
export default function PublicPageShell({ title, lead, children, wide }) {
  const heroRef = useReveal();

  return (
    <div id="top" className="bg-paper dark:bg-paper-dark text-textprimary dark:text-textprimary-dark min-h-screen flex flex-col">
      <LandingNav />

      <section className="bg-primary text-white relative overflow-hidden">
        <div className="blob-a absolute w-96 h-96 rounded-full bg-primary-light opacity-25 -top-32 -right-20" />
        <div className={`${wide ? 'max-w-5xl' : 'max-w-4xl'} mx-auto px-6 py-16 md:py-20 relative`}>
          <Link
            to="/"
            className="mono text-xs text-white/50 hover:text-white mb-6 inline-flex items-center gap-1.5 transition-colors duration-300"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            Back to RoktoNet
          </Link>
          <div ref={heroRef}>
            <h1 className="font-display font-bold text-3xl md:text-4xl mb-4">{title}</h1>
            {lead && <p className="text-white/75 leading-relaxed max-w-xl">{lead}</p>}
          </div>
        </div>
      </section>

      <main className="flex-1">{children}</main>

      <LandingFooter />
    </div>
  );
}

PublicPageShell.propTypes = {
  title: PropTypes.string.isRequired,
  lead: PropTypes.string,
  children: PropTypes.node,
  wide: PropTypes.bool,
};

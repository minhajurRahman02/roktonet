import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';

// A link to a section of the landing page, from anywhere in the app.
//
// THE BUG THIS EXISTS TO KILL
//
// The nav and the footer are shared by four pages, and they used bare
// anchors: <a href="#impact">. On the landing page that works. On
// /how-it-works the browser resolves it to /how-it-works#impact, an anchor
// that does not exist on that page, so the click does nothing at all. Every
// section link in the nav and the footer was dead on three of the four
// public pages.
//
// So the target is always written landing-relative, '/#impact', and the
// component splits on where it is being clicked from:
//
//   Not on the landing page  the router navigates to '/', and ScrollToHash
//                            scrolls once the section has mounted.
//   On the landing page      the router is skipped entirely and the element
//                            is scrolled to directly.
//
// The second branch is not an optimisation. Letting the router handle a
// same-page navigation pushes a history entry for every anchor click, so
// the back button walks the reader backwards through their own scrolling
// before it ever leaves the page. replaceState keeps the URL honest without
// adding an entry.
export default function SectionLink({ id, className, children, onNavigate }) {
  const { pathname } = useLocation();

  function handleClick(event) {
    // Let the router do the work from any other page.
    if (pathname !== '/') return;

    const el = document.getElementById(id);
    if (!el) return;

    event.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', id === 'top' ? '/' : `/#${id}`);
    if (onNavigate) onNavigate();
  }

  return (
    <Link to={id === 'top' ? '/' : `/#${id}`} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}

SectionLink.propTypes = {
  /** The id of the section on the landing page, without the '#'. */
  id: PropTypes.string.isRequired,
  className: PropTypes.string,
  children: PropTypes.node,
  /** Called after a same-page scroll, for closing a menu. */
  onNavigate: PropTypes.func,
};

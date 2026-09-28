import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// React Router does not scroll. It swaps the component tree and leaves the
// window exactly where it was, which means two things go wrong on their own:
//
//   1. Navigating to '/#impact' from another page lands at the top of the
//      landing page and stays there, because nothing acts on the hash.
//   2. Navigating to '/' from halfway down /how-it-works lands halfway down
//      the landing page.
//
// This component fixes both. It is rendered once, inside the router.

// Deliberately not every route. On a dashboard, forcing the window to the
// top on each navigation is a behaviour change nobody asked for, and some
// of those pages are long tables people move around inside. These four are
// the public pages, where landing at the top is what a visitor expects.
const SCROLL_TOP_ROUTES = ['/', '/how-it-works', '/about', '/privacy'];

// WHY THIS WAITS FOR TWO THINGS RATHER THAN ONE
//
// The obvious version scrolls as soon as the element exists. That is wrong
// here, and measurably so. The landing page's live section renders nothing
// until GET /api/public/stats resolves, which lands about 200ms after the
// route mounts and adds roughly 1,300px to the page. So:
//
//   '#impact'         does not exist yet, so waiting for the element is
//                     enough and the naive version happens to work.
//   '#become-donor'   exists immediately, at a position 1,300px above where
//                     it will end up. The naive version scrolls straight to
//                     the stale position and lands a screen and a half short.
//
// So it waits for the element AND for the document height to hold still for
// a few frames, which is the same signal for any late-mounting section, not
// just this one. If the page never settles it scrolls anyway rather than
// never scrolling at all.
const MAX_FRAMES = 120;          // about two seconds at 60fps
const STABLE_FRAMES_REQUIRED = 3;

export default function ScrollToHash() {
  const { pathname, hash, key } = useLocation();

  useEffect(() => {
    if (!hash) {
      if (SCROLL_TOP_ROUTES.includes(pathname)) {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      return undefined;
    }

    const id = decodeURIComponent(hash.slice(1));
    let frames = 0;
    let stable = 0;
    let lastHeight = -1;
    let raf = 0;

    function attempt() {
      frames += 1;
      const el = document.getElementById(id);
      const height = document.body.scrollHeight;

      stable = height === lastHeight ? stable + 1 : 0;
      lastHeight = height;

      const ready = el && stable >= STABLE_FRAMES_REQUIRED;
      if (ready || (el && frames >= MAX_FRAMES)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (frames < MAX_FRAMES) raf = requestAnimationFrame(attempt);
    }

    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
    // `key` is in here so that clicking the same link twice scrolls twice.
    // Without it the hash is unchanged and the effect never re-runs.
  }, [pathname, hash, key]);

  return null;
}

import { useEffect, useRef } from 'react';

// Slides a block up into place the first time it is scrolled to.
//
// WHY AN OBSERVER RATHER THAN A SCROLL HANDLER
//
// A scroll listener fires on every frame of every scroll and has to measure
// each watched element itself, which is a layout read per element per frame.
// IntersectionObserver does the same job off the main thread and hands back
// only the elements that actually crossed the threshold.
//
// WHY IT UNOBSERVES
//
// The reveal is a first-impression effect, not a state. Leaving elements
// observed would re-run it every time somebody scrolled back up, which turns
// a piece of polish into a twitch.
//
// ON REDUCED MOTION
//
// index.css neutralises the transform and opacity under
// prefers-reduced-motion. That matters more than usual here: the rule that
// switches transitions off is the same rule that would otherwise strand
// every revealed element at opacity 0, leaving a blank page for anyone who
// has the setting on.

const THRESHOLD = 0.12;
const ROOT_MARGIN = '0px 0px -40px 0px';
const STAGGER_MS = 70;
// Past this many steps the last card in a long grid arrives well after the
// reader has scrolled by it, so the delay stops growing.
const MAX_STAGGER_STEPS = 6;

/**
 * Returns a ref to put on a container.
 *
 * @param {{ stagger?: boolean }} [options] - stagger: reveal the
 *   container's direct children one after another instead of the container
 *   as a single block. Use it for card grids; leave it off for a heading.
 */
export function useReveal(options = {}) {
  const { stagger = false } = options;
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const targets = stagger ? Array.from(node.children) : [node];

    targets.forEach((el, i) => {
      el.classList.add('reveal');
      if (stagger) {
        el.style.transitionDelay = `${Math.min(i, MAX_STAGGER_STEPS) * STAGGER_MS}ms`;
      }
    });

    // Jump straight to the revealed state when the browser cannot animate
    // it, rather than observing elements whose transition has been disabled.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.classList.add('is-in'));
      return undefined;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: THRESHOLD, rootMargin: ROOT_MARGIN });

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [stagger]);

  return ref;
}

export default useReveal;

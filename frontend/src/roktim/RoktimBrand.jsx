import PropTypes from 'prop-types';

// Roktim's identity pieces, shared by all three surfaces so the strip, the
// card and the page are unmistakably the same voice.
//
// ON THE MARK
// -----------
// The glyph below is PROVISIONAL. The logo exploration was paused under time
// pressure with the shape still open, and this is the option that was leading:
// a district's dengue year drawn as one stroke, flat winter, steep monsoon
// climb, September crest, shorter fall. It is here so the module can ship
// looking finished, and it is isolated in this one component so swapping it
// later means editing a single path.
//
// ON THE BETA BADGE
// -----------------
// Not decoration and not a disclaimer reflex. The module ships a documented
// negative result (nothing beat naive persistence across 72 evaluations) and a
// known data gap (no live admissions feed, dengue only). The badge is the
// honest signal of that, and ROKTIM_UI_SPEC.md section 1 makes it
// non-negotiable on every surface.

/** The gradient and glow defs. Rendered once per surface that uses them. */
export function RoktimDefs({ id = 'rk' }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-stroke`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#4A3F7A" />
          <stop offset="42%" stopColor="#8474CE" />
          <stop offset="68%" stopColor="#C4B8F5" />
          <stop offset="100%" stopColor="#7A6BC0" />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            values="-.12 0; .12 0; -.12 0"
            dur="7s"
            repeatCount="indefinite"
          />
        </linearGradient>
        <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>
    </svg>
  );
}
RoktimDefs.propTypes = { id: PropTypes.string };

/**
 * The glyph. `glow` is off below ~24px because the blur swallows a stroke that
 * thin and the mark turns into a smudge.
 */
export function RoktimMark({ size = 24, glow = false, id = 'rk', className = '' }) {
  const sw = size < 30 ? 9 : 7;
  const d = 'M8 80 C28 78 38 74 48 62 C58 50 62 24 74 24 C84 24 88 46 92 58';
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="Roktim"
    >
      {glow && (
        <path
          d={d}
          fill="none"
          stroke={`url(#${id}-stroke)`}
          strokeWidth={sw + 2.4}
          strokeLinecap="round"
          filter={`url(#${id}-glow)`}
          opacity="0.85"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={`url(#${id}-stroke)`}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </svg>
  );
}
RoktimMark.propTypes = {
  size: PropTypes.number,
  glow: PropTypes.bool,
  id: PropTypes.string,
  className: PropTypes.string,
};

/**
 * The BETA badge.
 *
 * `tone="app"` is for the strip and card, which sit inside RoktoNet's own
 * light and dark themes and must not shout. `tone="own"` is for Roktim's page,
 * where the violet is the room's colour rather than a guest in someone else's.
 */
export function BetaBadge({ tone = 'app', className = '' }) {
  const styles =
    tone === 'own'
      ? 'border-roktim-brand text-roktim-hi'
      : 'border-[#574B90]/45 text-[#574B90] dark:border-[#A493E6]/40 dark:text-[#A493E6]';
  return (
    <span
      className={`font-mono text-[9.5px] leading-none tracking-[0.12em] border rounded px-1.5 py-[3px] ${styles} ${className}`}
    >
      BETA
    </span>
  );
}
BetaBadge.propTypes = { tone: PropTypes.string, className: PropTypes.string };

/**
 * Name plus badge, the lockup that opens every Roktim surface.
 * `subject` is the district or division the reading is about.
 */
export function RoktimLabel({ subject, tone = 'app', size = 'sm', id = 'rk' }) {
  const nameClass =
    tone === 'own'
      ? 'rk-gradient-text'
      : 'text-[#574B90] dark:text-[#A493E6]';
  const textSize = size === 'lg' ? 'text-base' : 'text-sm';
  return (
    <span className="flex items-center gap-2 min-w-0">
      <RoktimMark size={size === 'lg' ? 20 : 16} id={id} />
      <span className={`font-display font-semibold ${textSize} ${nameClass}`}>Roktim</span>
      <BetaBadge tone={tone} />
      {subject && (
        <>
          <span className="text-gray-300 dark:text-white/20" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-gray-500 dark:text-textsecondary-dark truncate">
            {subject}
          </span>
        </>
      )}
    </span>
  );
}
RoktimLabel.propTypes = {
  subject: PropTypes.string,
  tone: PropTypes.string,
  size: PropTypes.string,
  id: PropTypes.string,
};

/**
 * The drifting gradient mesh. Fixed, blurred, behind everything, and never
 * under a chart plot area: backdrop movement under data marks that are already
 * near the contrast floor is exactly the wrong place for it.
 */
export function RoktimMesh() {
  return (
    <div className="rk-mesh" aria-hidden="true">
      <i className="rk-b1" />
      <i className="rk-b2" />
      <i className="rk-b3" />
    </div>
  );
}

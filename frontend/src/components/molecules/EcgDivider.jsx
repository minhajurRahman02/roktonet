import PropTypes from 'prop-types';

// The seam between the Roktim section and whatever sits next to it.
//
// A hard cut from RoktoNet's green to Roktim's near-black read as two
// unrelated pages stapled together, and a soft gradient blend read as a
// mistake. This is the third answer: a line that belongs to Roktim, drawn
// in Roktim's own colours, sitting exactly on the boundary.
//
// HOW THE SHINE WORKS, AND WHY IT IS DONE THIS WAY
//
// The trace never moves. What travels is a gradient: a linearGradient that
// is transparent except for a narrow bright band, with animateTransform
// sliding it across. That is the same mechanism RoktimBrand.jsx uses on the
// logo stroke, which is the point — the two should look like one idea.
//
// The alternative, animating stroke-dashoffset to draw the line in, was
// rejected. It reads as the line being created over and over, and a
// heartbeat that keeps restarting is the wrong thing to put on a page about
// blood.
//
// THREE STROKES OF ONE PATH
//
//   base    always visible, so the seam never disappears between shines
//   glow    blurred copy of the shine, for the bloom around the bright band
//   shine   the sharp highlight itself
//
// vector-effect="non-scaling-stroke" keeps the line 1.6px at any width.
// Without it, preserveAspectRatio="none" scales the stroke along with the
// box, so the trace would thin to a hair on a wide monitor and go heavy on
// a phone.

const ECG_PATH = 'M0 32h60q12 -7 24 0h18l7 9l9 -26l9 26l7 -9h22q16 -11 32 0h52h60q12 -7 24 0h18l7 9l9 -26l9 26l7 -9h22q16 -11 32 0h52h60q12 -7 24 0h18l7 9l9 -26l9 26l7 -9h22q16 -11 32 0h52h60q12 -7 24 0h18l7 9l9 -26l9 26l7 -9h22q16 -11 32 0h52h60q12 -7 24 0h18l7 9l9 -26l9 26l7 -9h22q16 -11 32 0h52h60q12 -7 24 0h18l7 9l9 -26l9 26l7 -9h22q16 -11 32 0h52';

export default function EcgDivider({ position }) {
  // Two instances of this component appear on one page, so every id inside
  // the SVG has to be unique. Duplicate gradient ids would make the second
  // divider silently adopt the first one's fill.
  const uid = `ecg-${position}`;

  return (
    <div
      className={`absolute inset-x-0 ${position === 'top' ? 'top-0' : 'bottom-0'} pointer-events-none`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1440 64" preserveAspectRatio="none" className="w-full block" style={{ height: 58 }}>
        <defs>
          <linearGradient id={`${uid}-base`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4A3F7A" />
            <stop offset="50%" stopColor="#6455A8" />
            <stop offset="100%" stopColor="#4A3F7A" />
          </linearGradient>

          <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8474CE" stopOpacity="0" />
            <stop offset="38%" stopColor="#8474CE" stopOpacity="0" />
            <stop offset="47%" stopColor="#A493E6" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#C4B8F5" stopOpacity="1" />
            <stop offset="53%" stopColor="#A493E6" stopOpacity="0.85" />
            <stop offset="62%" stopColor="#8474CE" stopOpacity="0" />
            <stop offset="100%" stopColor="#8474CE" stopOpacity="0" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              values="-1 0; 1 0"
              dur="4.5s"
              repeatCount="indefinite"
            />
          </linearGradient>

          <filter id={`${uid}-glow`} x="-10%" y="-120%" width="120%" height="340%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        <path
          d={ECG_PATH} fill="none" stroke={`url(#${uid}-base)`} strokeWidth="1.6"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.75"
        />
        <path
          d={ECG_PATH} fill="none" stroke={`url(#${uid}-shine)`} strokeWidth="3.2"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          filter={`url(#${uid}-glow)`}
        />
        <path
          d={ECG_PATH} fill="none" stroke={`url(#${uid}-shine)`} strokeWidth="1.7"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

EcgDivider.propTypes = {
  position: PropTypes.oneOf(['top', 'bottom']).isRequired,
};

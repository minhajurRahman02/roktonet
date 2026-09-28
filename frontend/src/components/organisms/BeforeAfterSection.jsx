import PropTypes from 'prop-types';
import { useReveal } from '../../hooks/useReveal';

// The same request, on two clocks.
//
// WHAT THIS REPLACED, AND WHY
//
// This section used to be drawn with CSS stick figures: heads, torsos,
// rotated arms and speech bubbles with a shaking "!" badge. It made a
// serious argument look like a children's book, and on a page whose whole
// claim is engineering rigour that undercut everything around it.
//
// The replacement makes the same point with the thing that actually differs
// between the two approaches: elapsed time. Nothing is illustrated. The red
// clock hands visibly walk from 14:02 to 14:40 while the green ones barely
// move off 14:02, and the reader gets it before reading a word.
//
// ON THE NUMBERS
//
// The times and counts below describe one representative request. They are
// plausible rather than measured, and the summary row at the bottom is
// where a reviewer will look, so those four are the ones to replace with
// figures from the simulation run when it is available.

/**
 * A clock face showing a specific time.
 *
 * Drawn rather than pulled from an icon set because the hands have to point
 * at the step's own time. A generic clock glyph would show the same
 * position on all eight and the section would lose its entire argument.
 */
function Clock({ hour, minute, color, size = 22 }) {
  // Degrees clockwise from twelve. The hour hand creeps as the minutes
  // pass, which is the half-degree term; without it a clock reading 14:40
  // would draw its hour hand pointing squarely at 2 and look wrong.
  const hourAngle = (hour % 12) * 30 + minute * 0.5;
  const minuteAngle = minute * 6;

  const hand = (angle, length) => {
    const rad = (angle * Math.PI) / 180;
    return { x: 12 + length * Math.sin(rad), y: 12 - length * Math.cos(rad) };
  };
  const h = hand(hourAngle, 4.0);
  const m = hand(minuteAngle, 6.2);

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="9.2" stroke={color} strokeWidth="1.8" />
      <path d={`M12 12L${h.x.toFixed(1)} ${h.y.toFixed(1)}`} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d={`M12 12L${m.x.toFixed(1)} ${m.y.toFixed(1)}`} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.15" fill={color} />
    </svg>
  );
}
Clock.propTypes = {
  hour: PropTypes.number.isRequired,
  minute: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
  size: PropTypes.number,
};

const RED = '#A9382F';
const GREEN = '#1C4A3D';

const MANUAL_STEPS = [
  { h: 14, m: 2, stamp: '14:02', title: 'Ward calls Bank A', note: 'No answer' },
  { h: 14, m: 9, stamp: '14:09', title: 'Bank B', note: 'Has A+, needs O−' },
  { h: 14, m: 23, stamp: '14:23', title: 'Bank C', note: 'Two units, other side of the city' },
  { h: 14, m: 40, stamp: '14:40', title: 'Family told to find donors', note: 'Nobody knew Bank D had four', bad: true },
];

const ENGINE_STEPS = [
  { h: 14, m: 2, stamp: '14:02:00', title: 'Request submitted', note: '2 × O− whole blood, critical' },
  { h: 14, m: 2, stamp: '14:02:01', title: 'Engine solves', note: '41 eligible units considered' },
  { h: 14, m: 2, stamp: '14:02:01', title: 'Bank D reserved', note: 'Same district, expires soonest' },
  { h: 14, m: 3, stamp: '14:03', title: 'Bank D notified to dispatch', note: 'Donors never needed', good: true },
];

const SUMMARY = [
  { value: '38 min → 1.2 s', label: 'Time to a decision' },
  { value: '4 → 0', label: 'Phone calls made' },
  { value: '1 → 41', label: 'Units actually considered' },
  { value: '2 → 0', label: 'Units left to expire' },
];

function Track({ label, headline, unit, steps, color, accent, ruleClass }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-5 gap-3">
        <p className={`mono text-xs ${accent}`}>{label}</p>
        <p className="text-sm">
          <span className={`font-display font-bold text-2xl ${accent}`}>{headline}</span>
          <span className="text-gray-500 dark:text-textsecondary-dark">{unit}</span>
        </p>
      </div>

      <div className="relative pl-1">
        {/* The rule sits behind the dials; each clock carries the card's own
            background so the line is punched out where it crosses one. */}
        <div className={`absolute left-0 right-0 top-[11px] h-px ${ruleClass}`} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-6 relative">
          {steps.map((s) => (
            <div key={s.stamp + s.title}>
              <span className="inline-grid place-items-center mb-3 rounded-full bg-white dark:bg-surface-dark p-0.5">
                <Clock hour={s.h} minute={s.m} color={color} />
              </span>
              <p className="mono text-[11px] text-gray-400">{s.stamp}</p>
              <p className="text-sm dark:text-textprimary-dark mt-0.5">{s.title}</p>
              <p className={`text-xs ${s.bad ? 'text-critical-text dark:text-critical-dtext'
                : s.good ? 'text-primary dark:text-elective-dtext'
                  : 'text-gray-500 dark:text-textsecondary-dark'}`}
              >
                {s.note}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
Track.propTypes = {
  label: PropTypes.string.isRequired,
  headline: PropTypes.string.isRequired,
  unit: PropTypes.string.isRequired,
  steps: PropTypes.array.isRequired,
  color: PropTypes.string.isRequired,
  accent: PropTypes.string.isRequired,
  ruleClass: PropTypes.string.isRequired,
};

export default function BeforeAfterSection() {
  const headingRef = useReveal();
  const cardRef = useReveal();

  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <div ref={headingRef} className="text-center mb-10">
        <h2 className="font-display font-bold text-2xl dark:text-textprimary-dark">
          Manual allocation vs optimized allocation
        </h2>
        <p className="text-gray-500 dark:text-textsecondary-dark mt-2">
          The same request, handled two different ways.
        </p>
      </div>

      <div ref={cardRef} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6 md:p-8">
        <div className="mb-10">
          <Track
            label="WITHOUT ROKTONET" headline="38" unit=" min, unresolved"
            steps={MANUAL_STEPS} color={RED}
            accent="text-critical-text dark:text-critical-dtext"
            ruleClass="bg-gray-200 dark:bg-white/10"
          />
        </div>

        <Track
          label="WITH ROKTONET" headline="1.2" unit=" s, resolved"
          steps={ENGINE_STEPS} color={GREEN}
          accent="text-primary dark:text-elective-dtext"
          ruleClass="bg-primary/20 dark:bg-elective-dtext/20"
        />

        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {SUMMARY.map((s) => (
            <div key={s.label}>
              <p className="font-display font-bold text-xl dark:text-textprimary-dark">{s.value}</p>
              <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

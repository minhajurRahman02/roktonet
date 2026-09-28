import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import PublicPageShell from '../components/organisms/PublicPageShell';
import { useReveal } from '../hooks/useReveal';

// One request, followed from the ward to the bag arriving.
//
// WHY THERE IS NO THREE.JS HERE
//
// The brief asked for 3D diagrams. This is built from layered SVG and CSS
// perspective transforms instead, and the reason is weight: three.js is
// roughly 600KB against a bundle that already warns at 978KB, on a landing
// page whose whole job is to load fast for someone who has never heard of
// RoktoNet. The depth here comes from perspective() and rotateY on the
// right-hand panels, which costs nothing and degrades to flat cards on a
// browser that cannot do it.
//
// Every step below is a real step in the system, named the way the code
// names it, so the page and the event log agree.

function Step({ n, tone, title, body, footnote, children, last }) {
  const ref = useReveal();
  return (
    <li ref={ref} className="grid md:grid-cols-[auto_1fr_1fr] gap-6 items-center">
      <div className="flex md:flex-col items-center gap-3 self-stretch">
        <span className={`w-11 h-11 rounded-full ${tone} text-white grid place-items-center font-display font-bold shrink-0`}>
          {n}
        </span>
        {!last && <span className="hidden md:block w-px flex-1 bg-gray-200 dark:bg-white/10" />}
      </div>

      <div>
        <p className="font-display font-semibold text-lg dark:text-textprimary-dark mb-2">{title}</p>
        <p className="text-sm text-gray-600 dark:text-textsecondary-dark leading-relaxed">{body}</p>
        {footnote && <p className="mono text-[11px] text-gray-400 mt-3">{footnote}</p>}
      </div>

      {/* The depth. A single perspective on the wrapper rather than one per
          child, so the panels in a column share a vanishing point instead
          of each having their own. */}
      <div style={{ transform: 'perspective(900px) rotateY(-9deg) rotateX(2deg)' }}>
        {children}
      </div>
    </li>
  );
}
Step.propTypes = {
  n: PropTypes.number.isRequired,
  tone: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  body: PropTypes.string.isRequired,
  footnote: PropTypes.string,
  children: PropTypes.node,
  last: PropTypes.bool,
};

const CARD = 'bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl';

export default function HowItWorks() {
  const outroRef = useReveal();

  return (
    <PublicPageShell
      wide
      title="How RoktoNet works"
      lead="One request, followed from the ward to the bag arriving. Every step here is a real step in the system, in the order it happens."
    >
      <section className="max-w-5xl mx-auto px-6 py-20">
        <ol className="space-y-8">
          <Step
            n={1} tone="bg-primary"
            title="A hospital files a request"
            body="Blood type, component, quantity and urgency. Patient name and phone are recorded for the ward's own tracking, and go no further than the requesting hospital."
          >
            <div className={`${CARD} p-4 space-y-2 text-xs`}>
              <div className="flex justify-between"><span className="text-gray-400">Blood type</span><span className="mono dark:text-textprimary-dark">O−</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Component</span><span className="mono dark:text-textprimary-dark">whole_blood</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Quantity</span><span className="mono dark:text-textprimary-dark">2</span></div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Urgency</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext">critical</span>
              </div>
            </div>
          </Step>

          <Step
            n={2} tone="bg-primary"
            title="Every eligible unit is gathered"
            body="Not the nearest bank. Every available unit held by every blood bank and NGO on the network, with its expiry date and district. Hospitals consume blood; they never supply it."
          >
            <div className="relative h-32">
              <div className={`${CARD} absolute inset-x-0 p-2.5 text-[11px] mono dark:text-textprimary-dark`} style={{ top: 0 }}>Bank D · O− ×4 · exp 12d</div>
              <div className={`${CARD} absolute inset-x-2 p-2.5 text-[11px] mono dark:text-textprimary-dark`} style={{ top: 30 }}>Bank C · O− ×2 · exp 26d</div>
              <div className={`${CARD} absolute inset-x-4 p-2.5 text-[11px] mono text-gray-400`} style={{ top: 60 }}>NGO A · O+ ×6 · incompatible</div>
              <div className={`${CARD} absolute inset-x-6 p-2.5 text-[11px] mono text-gray-400`} style={{ top: 90 }}>+ 38 more considered</div>
            </div>
          </Step>

          <Step
            n={3} tone="bg-critical-text"
            title="The engine weighs five things at once"
            body="A mixed-integer linear program. Unmet demand weighted by urgency always wins; the rest are tie-breaks that only matter between otherwise equal answers."
            footnote="PuLP · CBC solver · solved in about a second"
          >
            <div className="bg-[#12332A] text-white rounded-xl p-5">
              <p className="mono text-[10px] text-white/40 mb-3">OBJECTIVE</p>
              <div className="space-y-2.5 text-xs">
                {[
                  ['bg-critical-dtext', 'Unmet demand × urgency', '1000'],
                  ['bg-urgent-dtext', 'Distance across districts', 'tie-break'],
                  ['bg-routine-dtext', 'Expiry, soonest first', 'tie-break'],
                  ['bg-elective-dtext', 'Fairness across suppliers', 'tie-break'],
                  ['bg-white/50', 'ABO / Rh compatibility', 'hard'],
                ].map(([dot, label, weight]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    <span className="flex-1">{label}</span>
                    <span className="mono text-white/50">{weight}</span>
                  </div>
                ))}
              </div>
            </div>
          </Step>

          <Step
            n={4} tone="bg-primary"
            title="Units are reserved and the supplier is told"
            body="Reservation happens inside one transaction, under a database lock, with each unit re-checked before it is taken. The bank gets a notification saying it has units to dispatch."
          >
            <div className={`${CARD} p-4`}>
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-elective-bg dark:bg-elective-dbg grid place-items-center shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3F5B4E" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  </svg>
                </span>
                <div>
                  <p className="text-xs font-medium dark:text-textprimary-dark">2 units of your stock matched</p>
                  <p className="text-[11px] text-gray-500 dark:text-textsecondary-dark mt-0.5">Waiting for you to dispatch them.</p>
                </div>
              </div>
            </div>
          </Step>

          <Step
            n={5} tone="bg-urgent-border"
            title="Donors are called only if stock cannot cover it"
            body="A small targeted batch, nearest thana first, filtered by real cooldown rules and annual donation caps. Never a blanket alert. For a critical request this runs in parallel rather than after."
          >
            <div className={`${CARD} p-4 space-y-2`}>
              {[
                ['Same thana', '3 invited', true],
                ['Same district', '2 invited', true],
                ['In cooldown', '11 skipped', false],
                ['At annual cap', '4 skipped', false],
              ].map(([label, value, on]) => (
                <div key={label} className="flex items-center justify-between text-[11px]">
                  <span className={on ? 'dark:text-textprimary-dark' : 'text-gray-400'}>{label}</span>
                  <span className={`mono ${on ? 'text-primary dark:text-elective-dtext' : 'text-gray-400'}`}>{value}</span>
                </div>
              ))}
            </div>
          </Step>

          <Step
            last
            n={6} tone="bg-primary"
            title="Delivery is confirmed, and the trail is kept"
            body="The hospital confirms receipt. Every step above is written to an event log, so months later you can still answer which unit went where, and why the engine chose it."
          >
            <div className={`${CARD} p-4`}>
              <div className="space-y-1.5 mono text-[10px] text-gray-500 dark:text-textsecondary-dark">
                {['request_created', 'engine_resolved_inventory', 'dispatch_needed', 'delivery_confirmed'].map((e) => (
                  <p key={e}><span className="text-primary dark:text-elective-dtext">✓</span> {e}</p>
                ))}
              </div>
            </div>
          </Step>
        </ol>

        <div ref={outroRef} className="mt-16 text-center">
          <p className="text-gray-500 dark:text-textsecondary-dark mb-5">Want to see it running?</p>
          <Link
            to="/#impact"
            className="inline-block bg-primary text-white font-medium px-6 py-3 rounded-lg text-sm hover:bg-primary-light transition-colors duration-300"
          >
            See the live system
          </Link>
        </div>
      </section>
    </PublicPageShell>
  );
}

import { useState } from 'react';
import { Sparkles, Droplets, ClipboardCheck, Users, Heart, Bell, BarChart3 } from 'lucide-react';
import { useReveal } from '../../hooks/useReveal';

// What is running, module by module.
//
// This was a flat grid of six unexplained one-liners. The problem with that
// shape is that it reads as a feature list, and a feature list invites the
// question "yes, but what did you actually build". Eight modules, each
// owning one job and each able to say four concrete things about itself,
// answers that question instead of restating it.
//
// The Roktim card is last and carries its BETA badge here as well as in its
// own section. ROKTIM_UI_SPEC.md §1 makes the badge non-negotiable on every
// surface, and a module card is a surface.

const MODULES = [
  {
    key: 'engine',
    name: 'Optimization engine',
    blurb: 'The decision itself. MILP over every eligible unit.',
    tech: 'Python · PuLP · CBC · Flask',
    icon: Sparkles,
    dot: '#A9382F',
    chip: 'bg-critical-bg dark:bg-critical-dbg',
    stroke: '#A9382F',
    lead: 'The part that actually decides. Everything else exists to feed it, or to carry out what it says.',
    points: [
      'Solves a mixed-integer linear program across every eligible unit in the network at once',
      'Unmet demand weighted by urgency dominates; distance, expiry and fairness break ties beneath it',
      'ABO and Rh compatibility are hard constraints, never trade-offs',
      'Runs under a database lock, so two batches can never allocate the same unit twice',
    ],
  },
  {
    key: 'inventory',
    name: 'Inventory',
    blurb: 'Every unit, its expiry, and who may hold it.',
    tech: 'PostgreSQL · Express',
    icon: Droplets,
    dot: '#6B9080',
    chip: 'bg-elective-bg dark:bg-elective-dbg',
    stroke: '#3F5B4E',
    lead: 'A live picture of every unit of blood on the network, and the rules about who is allowed to hold one.',
    points: [
      'Each unit carries its blood type, component, collection and expiry dates, and current status',
      'Only blood banks and NGOs may hold stock; hospitals consume blood and never supply it',
      'Units move available, reserved, dispatched, delivered, and a dispatched unit is never released',
      'Expiry is visible everywhere, because a unit nobody uses in time is a unit wasted',
    ],
  },
  {
    key: 'requests',
    name: 'Requests & allocation',
    blurb: 'Five urgency tiers, and the audit trail behind each.',
    tech: 'Express · PostgreSQL',
    icon: ClipboardCheck,
    dot: '#B8811F',
    chip: 'bg-urgent-bg dark:bg-urgent-dbg',
    stroke: '#8C6117',
    lead: 'Five urgency tiers, from critical down to a bank restocking its own shelves.',
    points: [
      'Critical and urgent requests solve immediately; routine and elective wait for the next batch',
      'An elective request can reserve stock now and hold it for a scheduled date',
      'Patient name and phone are recorded for ward tracking and visible only to the requesting hospital',
      'Every state change is written to an event log that can be read back months later',
    ],
  },
  {
    key: 'donors',
    name: 'Donor mobilization',
    blurb: 'The fallback, with real eligibility rules.',
    tech: 'Express · Brevo email',
    icon: Users,
    dot: '#5B7A8C',
    chip: 'bg-routine-bg dark:bg-routine-dbg',
    stroke: '#42606F',
    lead: 'What happens when stock genuinely cannot cover a request. Never the first move.',
    points: [
      'Invites a small targeted batch, nearest thana first, then district, then wider',
      'Enforces real cooldown periods that differ by component and by donor sex',
      'Respects annual donation caps rather than asking the same willing people repeatedly',
      'For a critical request, donors are contacted in parallel with the inventory search, not after it',
    ],
  },
  {
    key: 'drives',
    name: 'NGO blood drives',
    blurb: 'Live collection sessions that feed the same pool.',
    tech: 'React · Express',
    icon: Heart,
    dot: '#A9382F',
    chip: 'bg-critical-bg dark:bg-critical-dbg',
    stroke: '#A9382F',
    lead: 'Collection sessions run by NGOs, feeding the same pool the engine allocates from.',
    points: [
      'A live session where each donation is logged as it happens and becomes an inventory unit immediately',
      'Collection pace charted against real clock time, at whatever interval you choose',
      'A month calendar for planning, with notes on any date',
      'Reports and raw logs downloadable as CSV, Excel or PDF',
    ],
  },
  {
    key: 'notify',
    name: 'Notifications',
    blurb: 'In-app always, email when minutes matter.',
    tech: 'PostgreSQL · Brevo',
    icon: Bell,
    dot: '#B8811F',
    chip: 'bg-urgent-bg dark:bg-urgent-dbg',
    stroke: '#8C6117',
    lead: 'In-app is the record. Email is reserved for the cases where minutes matter.',
    points: [
      'A bank is told the moment the engine reserves its units, so a dispatch nobody knows about cannot happen',
      'An invited donor is notified directly and always by email, because they are not sitting in the app',
      'Critical and urgent events escalate to email; everything else stays in the app',
      'An NGO is reminded once, not repeatedly, when a scheduled drive was never started',
    ],
  },
  {
    key: 'admin',
    name: 'Admin & audit',
    blurb: 'Oversight, exports, and a record of every action.',
    tech: 'Express · ExcelJS · PDFKit',
    icon: BarChart3,
    dot: '#5B7A8C',
    chip: 'bg-routine-bg dark:bg-routine-dbg',
    stroke: '#42606F',
    lead: 'Oversight across every organization, and a record of everything an administrator did.',
    points: [
      'System-wide view of requests, inventory, organizations and donors',
      'Any dataset exportable as CSV, Excel or PDF, or the whole system in one file',
      'Broadcasts to any role, or to named users',
      'Every administrative action recorded with who, what and when',
    ],
  },
  {
    key: 'roktim',
    name: 'Roktim',
    beta: true,
    blurb: 'Demand advisory. Advises, never decides.',
    tech: 'Python · scikit-learn · Flask',
    dot: '#8474CE',
    chip: '',
    stroke: '#8474CE',
    lead: 'A demand advisory module. It advises, and it never decides.',
    points: [
      'Forecasts dengue hospital admissions per district and converts them to an expected demand band',
      'Currently seasonal only: it reads historical patterns, not today’s ward, and says so on every advisory',
      'Cannot block, delay or change an allocation. The engine’s decision is final',
      'Removable by design: one table, one route file, one folder, and nothing else changes',
    ],
  },
];

export default function FeaturesSection() {
  const [active, setActive] = useState('engine');
  const headingRef = useReveal();
  const gridRef = useReveal({ stagger: true });

  const mod = MODULES.find((m) => m.key === active) || MODULES[0];

  return (
    <section className="bg-white dark:bg-surface-dark border-y border-gray-200 dark:border-white/10">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div ref={headingRef} className="text-center mb-10">
          <h2 className="font-display font-bold text-2xl dark:text-textprimary-dark">
            What&apos;s actually running under the hood
          </h2>
          <p className="text-gray-500 dark:text-textsecondary-dark mt-2 max-w-xl mx-auto">
            Eight modules, each owning one job. Pick any one to see what it does.
          </p>
        </div>

        <div ref={gridRef} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULES.map((m, i) => {
            const Icon = m.icon;
            const on = m.key === active;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setActive(m.key)}
                aria-pressed={on}
                className={`text-left rounded-xl p-5 border transition-all duration-300 bg-paper dark:bg-paper-dark
                  ${on ? 'shadow-md bg-white dark:bg-surface-dark' : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'}`}
                style={on ? { borderColor: m.dot } : undefined}
              >
                <div className="flex items-start justify-between mb-3">
                  <span
                    className={`w-9 h-9 rounded-lg grid place-items-center ${m.chip}`}
                    style={m.key === 'roktim' ? { background: '#1D1A2E' } : undefined}
                  >
                    {Icon ? (
                      <Icon size={17} style={{ color: m.stroke }} />
                    ) : (
                      // Roktim's own mark, not a lucide icon, so the card
                      // carries the module's identity rather than a stand-in.
                      <svg width="17" height="17" viewBox="0 0 100 100" fill="none" aria-hidden="true">
                        <path
                          d="M8 80 C28 78 38 74 48 62 C58 50 62 24 74 24 C84 24 88 46 92 58"
                          stroke="#8474CE" strokeWidth="9" strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="mono text-[10px] text-gray-400">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <p className="font-display font-semibold text-sm dark:text-textprimary-dark">
                  {m.name}
                  {m.beta && (
                    <span className="mono text-[9px] align-middle ml-1.5 px-1.5 py-0.5 rounded" style={{ background: '#2A2640', color: '#C4B8F5' }}>
                      BETA
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">{m.blurb}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-xl border border-gray-200 dark:border-white/10 bg-paper dark:bg-paper-dark p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <p className="font-display font-semibold text-lg dark:text-textprimary-dark">
                {mod.name}
                {mod.beta && (
                  <span className="mono text-[10px] align-middle ml-2 px-1.5 py-0.5 rounded" style={{ background: '#2A2640', color: '#C4B8F5' }}>
                    BETA
                  </span>
                )}
              </p>
              <p className="text-sm text-gray-500 dark:text-textsecondary-dark mt-1 max-w-xl leading-relaxed">
                {mod.lead}
              </p>
            </div>
            <span className="mono text-[10px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-white/10 text-gray-500 dark:text-textsecondary-dark shrink-0">
              {mod.tech}
            </span>
          </div>

          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5 mt-5">
            {mod.points.map((p) => (
              <li key={p} className="flex gap-2.5 text-sm text-gray-600 dark:text-textsecondary-dark leading-relaxed">
                <span className="shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full" style={{ background: mod.dot }} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

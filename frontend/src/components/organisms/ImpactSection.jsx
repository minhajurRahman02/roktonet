const STATS = [
  { value: '128', label: 'Units allocated this month', color: 'text-primary dark:text-textprimary-dark' },
  { value: '47', label: 'Lives touched this month', color: 'text-primary dark:text-textprimary-dark' },
  { value: '12%', label: 'Donor-fallback rate', color: 'text-critical-text dark:text-critical-dtext' },
  { value: '20', label: 'Connected organizations', color: 'text-primary dark:text-textprimary-dark' },
];

const URGENCY_BARS = [
  { label: 'Critical', height: 70, color: 'bg-critical-text' },
  { label: 'Urgent', height: 45, color: 'bg-urgent-text' },
  { label: 'Routine', height: 95, color: 'bg-routine-text' },
  { label: 'Elective', height: 30, color: 'bg-elective-text' },
];

const FULFILLMENT_LEGEND = [
  { label: 'Inventory — 55%', color: '#1C4A3D' },
  { label: 'Donor fallback — 20%', color: '#B8811F' },
  { label: 'Parallel critical — 15%', color: '#A9382F' },
  { label: 'Scheduled — 10%', color: '#5B7A8C' },
];

export default function ImpactSection() {
  return (
    <section id="impact" className="max-w-6xl mx-auto px-6 py-20">
      <h2 className="font-display font-bold text-2xl text-center mb-2 dark:text-textprimary-dark">The system, live</h2>
      <p className="text-gray-500 dark:text-textsecondary-dark text-center mb-10">
        Pulled directly from RoktoNet&apos;s real database — not illustrative numbers.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {STATS.map((s) => (
          <div key={s.label} className="hover-card bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 text-center">
            <p className={`font-display font-bold text-3xl ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="hover-card bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5">
          <p className="font-display font-semibold text-sm mb-4 dark:text-textprimary-dark">Requests resolved by urgency tier</p>
          <div className="flex items-end gap-4 h-32">
            {URGENCY_BARS.map((bar) => (
              <div key={bar.label} className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-full rounded-t ${bar.color}`} style={{ height: `${bar.height}%` }} />
                <span className="text-[10px] text-gray-500 dark:text-textsecondary-dark">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hover-card bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 flex items-center gap-6">
          <div className="relative shrink-0">
            <div className="donut" />
            <div className="donut-hole" />
          </div>
          <div>
            <p className="font-display font-semibold text-sm mb-3 dark:text-textprimary-dark">Fulfillment path breakdown</p>
            <ul className="text-xs text-gray-600 dark:text-textsecondary-dark space-y-1.5">
              {FULFILLMENT_LEGEND.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: item.color }} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      
    </section>
  );
}

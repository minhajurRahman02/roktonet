export default function PositioningSection() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div className="grid md:grid-cols-2 gap-10">
        <div className="hover-card bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6">
          <p className="mono text-xs text-gray-400 dark:text-textsecondary-dark mb-3">WHAT DONOR APPS DO</p>
          <p className="font-display font-semibold text-lg mb-2 dark:text-textprimary-dark">
            Connect a patient to a nearby donor
          </p>
          <ul className="text-sm text-gray-600 dark:text-textsecondary-dark space-y-2">
            <li>· Search/notify donors by blood type</li>
            <li>· No inventory tracking</li>
            <li>· No allocation decision — just introductions</li>
          </ul>
        </div>

        <div className="hover-card bg-primary dark:bg-primary-dark text-white rounded-xl p-6">
          <p className="mono text-xs text-white/60 mb-3">WHAT ROKTONET DOES</p>
          <p className="font-display font-semibold text-lg mb-2">
            Decide where every unit of stored blood should go
          </p>
          <ul className="text-sm text-white/80 space-y-2">
            <li>· Tracks real inventory: type, quantity, expiry, location</li>
            <li>· Optimization engine: compatibility + urgency + expiry + distance + fairness</li>
            <li>· Donor matching only as a fallback when inventory can't cover it</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

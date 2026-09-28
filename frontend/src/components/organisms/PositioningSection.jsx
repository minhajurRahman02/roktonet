import { useReveal } from '../../hooks/useReveal';

// Both kinds of product matter. This section exists because people arrive
// assuming RoktoNet is a donor-finding app with extra steps, and the
// distinction is the entire premise: one connects a patient to a stranger,
// the other decides where the blood already on a shelf should go.
export default function PositioningSection() {
  const headingRef = useReveal();
  const cardsRef = useReveal({ stagger: true });

  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div ref={headingRef} className="text-center mb-10">
        <h2 className="font-display font-bold text-2xl dark:text-textprimary-dark">
          Not another donor-finding app
        </h2>
        <p className="text-gray-500 dark:text-textsecondary-dark mt-2 max-w-xl mx-auto">
          Both matter. They solve different halves of the problem, and only one of them looks at the
          blood already sitting on a shelf.
        </p>
      </div>

      <div ref={cardsRef} className="grid md:grid-cols-2 gap-6">
        <div className="hover-card bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6">
          <p className="mono text-xs text-gray-400 dark:text-textsecondary-dark mb-3">WHAT DONOR APPS DO</p>
          <p className="font-display font-semibold text-lg mb-3 dark:text-textprimary-dark">
            Connect a patient to a nearby donor
          </p>
          <ul className="text-sm text-gray-600 dark:text-textsecondary-dark space-y-2">
            <li className="flex gap-2"><span className="text-gray-300 dark:text-white/20">·</span> Search and notify donors by blood type</li>
            <li className="flex gap-2"><span className="text-gray-300 dark:text-white/20">·</span> No inventory tracking</li>
            <li className="flex gap-2"><span className="text-gray-300 dark:text-white/20">·</span> No allocation decision, just introductions</li>
          </ul>
        </div>

        <div className="hover-card bg-primary dark:bg-primary-dark text-white rounded-xl p-6 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/5" />
          <p className="mono text-xs text-white/60 mb-3">WHAT ROKTONET DOES</p>
          <p className="font-display font-semibold text-lg mb-3">
            Decide where every unit of stored blood should go
          </p>
          <ul className="text-sm text-white/85 space-y-2 relative">
            <li className="flex gap-2"><span className="text-white/30">·</span> Tracks real inventory: type, quantity, expiry, location</li>
            <li className="flex gap-2"><span className="text-white/30">·</span> Optimization engine: compatibility, urgency, expiry, distance, fairness</li>
            <li className="flex gap-2"><span className="text-white/30">·</span> Donor matching only as a fallback when inventory cannot cover it</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

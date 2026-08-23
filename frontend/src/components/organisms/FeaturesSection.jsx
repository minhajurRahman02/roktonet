const FEATURES = [
  { title: 'Constrained optimization', desc: 'MILP engine balancing compatibility, urgency, expiry, distance, and fairness.' },
  { title: 'Real-time inventory', desc: 'Every unit tracked across every connected hospital and bank.' },
  { title: 'Donor fallback', desc: "Targeted alerts only when inventory genuinely can't cover a request." },
  { title: 'Role-based dashboards', desc: 'Hospital, bank, NGO, donor, and admin — each sees only what they need.' },
  { title: 'Full auth & security', desc: 'JWT sessions, email verification, invite-code-gated org access.' },
  { title: 'Fairness, provably', desc: 'The engine spreads sourcing across orgs instead of draining one repeatedly.' },
];

export default function FeaturesSection() {
  return (
    <section className="bg-white dark:bg-surface-dark border-y border-gray-200 dark:border-white/10">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="font-display font-bold text-2xl text-center mb-10 dark:text-textprimary-dark">
          What&apos;s actually running under the hood
        </h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="hover-card border border-gray-200 dark:border-white/10 rounded-xl p-5">
              <p className="font-display font-semibold text-sm mb-1 dark:text-textprimary-dark">{f.title}</p>
              <p className="text-xs text-gray-500 dark:text-textsecondary-dark">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

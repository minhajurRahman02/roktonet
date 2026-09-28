import PublicPageShell from '../components/organisms/PublicPageShell';
import { useReveal } from '../hooks/useReveal';

// Privacy.
//
// This page exists because RoktoNet stores patient names and phone numbers.
// A footer link pointing at '#' next to that fact is the first thread an
// examiner pulls, and the honest answer is genuinely good: the guarantees
// below are structural, not promises. Each of the three rules for patient
// data is enforced by the shape of a query rather than by a policy somebody
// could forget.

const PATIENT_RULES = [
  {
    title: 'Only the hospital that entered it can see it',
    body: 'The supplying blood bank sees blood type, quantity and where to send it. It never receives the '
      + "patient's name or number, because the query that serves it does not select those columns.",
  },
  {
    title: 'The optimizer never reads it',
    body: 'The engine that decides allocations is handed an explicit list of columns, and the patient fields '
      + 'are not in it. No allocation decision can depend on who the patient is, by construction rather than '
      + 'by policy.',
  },
  {
    title: 'It is never searched on the server',
    body: 'Looking up a patient filters records already in the browser, so a name is never sent as a query '
      + 'parameter where it would land in request logs, proxy logs or browser history.',
  },
];

export default function Privacy() {
  const patientRef = useReveal();
  const rulesRef = useReveal({ stagger: true });
  const restRef = useReveal();

  return (
    <PublicPageShell
      title="Privacy"
      lead="What RoktoNet stores, who can see it, and what never leaves the hospital that entered it."
    >
      <section className="max-w-3xl mx-auto px-6 py-14 space-y-12">
        <div>
          <div ref={patientRef}>
            <h2 className="font-display font-semibold text-lg mb-3 dark:text-textprimary-dark">
              Patient information
            </h2>
            <p className="text-sm text-gray-600 dark:text-textsecondary-dark leading-relaxed mb-5">
              When a hospital files a request it records a patient name and contact number. This exists so
              ward staff can match a delivered bag to the right person when several requests are open at
              once. It is the most sensitive thing RoktoNet holds, so three rules govern it.
            </p>
          </div>

          <div ref={rulesRef} className="space-y-3">
            {PATIENT_RULES.map((r) => (
              <div key={r.title} className="border-l-2 border-primary dark:border-elective-dtext pl-4 py-1">
                <p className="text-sm font-medium dark:text-textprimary-dark mb-1">{r.title}</p>
                <p className="text-xs text-gray-500 dark:text-textsecondary-dark leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div ref={restRef} className="space-y-12">
          <div>
            <h2 className="font-display font-semibold text-lg mb-3 dark:text-textprimary-dark">Donors</h2>
            <p className="text-sm text-gray-600 dark:text-textsecondary-dark leading-relaxed">
              A donor record holds a name, contact number, blood type, district and last donation date. The
              last of these exists to protect the donor: it is what enforces the cooldown between donations
              and the annual cap. Donor details are visible to the NGO a donor is registered with, and to
              administrators. They are never shown to hospitals or to other donors.
            </p>
          </div>

          <div>
            <h2 className="font-display font-semibold text-lg mb-3 dark:text-textprimary-dark">What is logged</h2>
            <p className="text-sm text-gray-600 dark:text-textsecondary-dark leading-relaxed">
              RoktoNet keeps an event trail for each request and an audit record of administrator actions, so
              a decision can be explained months later. Roktim&apos;s advisory log records the organization
              that was advised and never the individual member of staff who was using the system.
            </p>
          </div>

          <div>
            <h2 className="font-display font-semibold text-lg mb-3 dark:text-textprimary-dark">
              What the public page shows
            </h2>
            <p className="text-sm text-gray-600 dark:text-textsecondary-dark leading-relaxed">
              The live figures on the home page come from a single read-only endpoint that returns counts,
              rates and district names. It carries no organization names, no request or unit identifiers, and
              nothing about a patient or a donor. Allocation routes are shown at district level, which is a
              unit of roughly two million people.
            </p>
          </div>

          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5">
            <p className="text-xs text-gray-500 dark:text-textsecondary-dark leading-relaxed">
              RoktoNet is a university project and is not currently deployed in a clinical setting. If that
              changes, this page changes with it, and any real deployment would need a data protection review
              beyond what a course project can offer.
            </p>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}

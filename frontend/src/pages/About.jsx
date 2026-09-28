import PublicPageShell from '../components/organisms/PublicPageShell';
import { useReveal } from '../hooks/useReveal';

// About RoktoNet.
//
// The section on what the system does NOT do is the point of this page, not
// a disclaimer at the end of it. A project that lists its own limits is
// easier to trust than one that does not, and every item there is something
// an examiner would find anyway.

// TODO: replace with the five real names. The supervisor is confirmed.
const TEAM = ['Member name', 'Member name', 'Member name', 'Member name', 'Member name'];
const SUPERVISOR = 'Md. Muhaiminul Islam Nafi';
const TEAM_EMAIL = 'teamhoneybadgeruiu@gmail.com';
const REPO_URL = 'https://github.com/minhajurRahman02/roktonet';

const STACK = [
  { name: 'Optimization engine', desc: 'Python and PuLP, solving a mixed-integer linear program over every eligible unit.' },
  { name: 'Application backend', desc: 'Node and Express over PostgreSQL, holding inventory, requests and the audit trail.' },
  { name: 'Web application', desc: 'React, with a separate dashboard for hospitals, banks, NGOs, donors and administrators.' },
  { name: 'Roktim forecast service', desc: 'A separate Python service producing district demand advisories. Advisory only, and labelled beta.' },
];

const LIMITS = [
  'Roktim reads seasonal history, not live ward admissions, and only for dengue.',
  'Distance is measured at district level, not in real road kilometres.',
  'The network is as complete as the organizations that have joined it.',
  'RoktoNet has not been deployed in a live hospital. It is a working system, not a proven one.',
];

export default function About() {
  const problemRef = useReveal();
  const stackRef = useReveal({ stagger: true });
  const limitsRef = useReveal();
  const teamRef = useReveal();
  const contactRef = useReveal();

  return (
    <PublicPageShell
      title="About RoktoNet"
      lead="Bangladesh does not have a blood shortage so much as a coordination problem. RoktoNet is an attempt at the coordination."
    >
      <section className="max-w-3xl mx-auto px-6 py-16 space-y-16">
        <div ref={problemRef}>
          <p className="mono text-xs text-gray-400 mb-3">THE PROBLEM</p>
          <h2 className="font-display font-semibold text-xl mb-4 dark:text-textprimary-dark">
            Blood expires in one place while a patient waits in another
          </h2>
          <div className="space-y-4 text-[15px] text-gray-600 dark:text-textsecondary-dark leading-relaxed">
            <p>
              When a hospital needs blood it does not have, somebody picks up a phone. They call the banks
              they happen to know, in the order they happen to think of them, and they learn only what those
              banks tell them. Meanwhile a bag of exactly the right type sits four kilometres away, three days
              from expiry, in a bank nobody called.
            </p>
            <p>
              Donor-finding apps do not solve this. They connect a patient to a stranger with the right blood
              type, which is valuable, but it treats every request as though no stored blood exists. Most
              requests should never reach a donor at all.
            </p>
            <p>
              RoktoNet works on the stored blood first. It keeps a live picture of every unit across every
              connected bank and NGO, and when a request arrives it decides where that blood should go,
              weighing compatibility, urgency, expiry, distance and fairness across suppliers at the same
              time. Donors are the fallback, not the front door.
            </p>
          </div>
        </div>

        <div>
          <p className="mono text-xs text-gray-400 mb-3">HOW IT IS BUILT</p>
          <h2 className="font-display font-semibold text-xl mb-5 dark:text-textprimary-dark">
            Four services, one decision
          </h2>
          <div ref={stackRef} className="grid sm:grid-cols-2 gap-4">
            {STACK.map((s) => (
              <div key={s.name} className="hover-card border border-gray-200 dark:border-white/10 rounded-xl p-5">
                <p className="font-display font-semibold text-sm mb-1.5 dark:text-textprimary-dark">{s.name}</p>
                <p className="text-xs text-gray-500 dark:text-textsecondary-dark leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div ref={limitsRef} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-6">
          <p className="mono text-xs text-gray-400 mb-3">WHAT IT DOES NOT DO YET</p>
          <ul className="space-y-2.5 text-sm text-gray-600 dark:text-textsecondary-dark">
            {LIMITS.map((l) => (
              <li key={l} className="flex gap-2.5">
                <span className="text-gray-300 dark:text-white/20 shrink-0">·</span>
                {l}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400 mt-5 leading-relaxed">
            Listing these is deliberate. A system that hides what it cannot do is harder to trust than one
            that says so.
          </p>
        </div>

        <div ref={teamRef}>
          <p className="mono text-xs text-gray-400 mb-3">THE TEAM</p>
          <h2 className="font-display font-semibold text-xl mb-2 dark:text-textprimary-dark">Team Honey Badger</h2>
          <p className="text-sm text-gray-600 dark:text-textsecondary-dark mb-6 leading-relaxed">
            Five Computer Science and Engineering students at United International University, built as a
            Software Engineering Lab project.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {TEAM.map((name, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="border border-gray-200 dark:border-white/10 rounded-lg p-4 text-center">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 mx-auto mb-2" />
                <p className="text-xs font-medium dark:text-textprimary-dark">{name}</p>
              </div>
            ))}
          </div>

          <div className="bg-primary dark:bg-primary-dark text-white rounded-xl p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/10 shrink-0" />
            <div>
              <p className="mono text-[11px] text-white/50 mb-1">SUPERVISOR</p>
              <p className="font-display font-semibold">{SUPERVISOR}</p>
              <p className="text-xs text-white/60 mt-0.5">United International University</p>
            </div>
          </div>
        </div>

        {/* scroll-mt clears the sticky nav when the footer's Contact link
            lands on this anchor. */}
        <div ref={contactRef} id="contact" className="scroll-mt-24">
          <p className="mono text-xs text-gray-400 mb-3">CONTACT</p>
          <h2 className="font-display font-semibold text-xl mb-4 dark:text-textprimary-dark">Get in touch</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <a href={`mailto:${TEAM_EMAIL}`} className="hover-card border border-gray-200 dark:border-white/10 rounded-xl p-5 block">
              <p className="mono text-[11px] text-gray-400 mb-1.5">EMAIL</p>
              <p className="text-sm font-medium dark:text-textprimary-dark break-all">{TEAM_EMAIL}</p>
            </a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover-card border border-gray-200 dark:border-white/10 rounded-xl p-5 block">
              <p className="mono text-[11px] text-gray-400 mb-1.5">SOURCE</p>
              <p className="text-sm font-medium dark:text-textprimary-dark break-all">github.com/minhajurRahman02/roktonet</p>
            </a>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}

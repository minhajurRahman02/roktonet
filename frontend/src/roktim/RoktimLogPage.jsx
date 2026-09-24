import { ScrollText } from 'lucide-react';
import RoktimShell from './page/RoktimShell';
import AdvisoryLog from './page/AdvisoryLog';
import { Section, SeeMore } from './page/primitives';

// The full advisory log, filterable. The main page carries the ten most
// recent; this is everything.

const SECTIONS = [{ id: 'log', label: 'Advisory log', short: 'Log', icon: ScrollText }];

export default function RoktimLogPage() {
  return (
    <RoktimShell sections={SECTIONS} activeId="log">
      <div className="pt-20">
        <Section
          id="log"
          eyebrow="Audit record"
          title="Advisory log"
          blurb="One row per elective request Roktim advised on. Organisation rather than user, because the question worth answering is which hospital was advised what, not which member of staff clicked. Every row carries the model artefact that produced it, so a recalibration cannot silently rewrite the history."
          action={
            <SeeMore to="/admin/roktim" back>
              Back to Roktim
            </SeeMore>
          }
        >
          <AdvisoryLog showFilters />
        </Section>
      </div>
    </RoktimShell>
  );
}

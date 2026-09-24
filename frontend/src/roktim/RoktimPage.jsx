import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, LineChart, Map, Grid3x3, ListChecks, ScrollText, FileText } from 'lucide-react';
import { health, units as fetchUnits, warmRoktim } from '../api/roktim';
import { toModelName } from './districts';
import { useAuth } from '../context/AuthContext';
import RoktimShell from './page/RoktimShell';
import Hero from './page/Hero';
import CurveExplorer from './page/CurveExplorer';
import RegionalOutlook from './page/RegionalOutlook';
import DistrictGrid from './page/DistrictGrid';
import LiveRequests from './page/LiveRequests';
import AdvisoryLog from './page/AdvisoryLog';
import ModelCard from './page/ModelCard';
import { Section, SeeMore, Unreachable, Skeleton } from './page/primitives';

// Roktim's own page. Admin only, full viewport, dark regardless of the app's
// theme setting.
//
// Two sections are previews rather than the whole thing: the district grid
// shows one row with a link to all 64, and the advisory log shows the ten most
// recent with a link to the filterable table. Both were full-height blocks in
// the first pass and the page became a scroll marathon in which the model card,
// which is the most important section on it, was never reached.

const SECTIONS = [
  { id: 'overview', label: 'Overview', short: 'Overview', icon: Sparkles },
  { id: 'seasonal', label: 'Seasonal curve', short: 'Curve', icon: LineChart },
  { id: 'regional', label: 'Regional outlook', short: 'Regions', icon: Map },
  { id: 'districts', label: 'All districts', short: 'Districts', icon: Grid3x3 },
  { id: 'requests', label: 'Live elective requests', short: 'Requests', icon: ListChecks },
  { id: 'log', label: 'Advisory log', short: 'Log', icon: ScrollText },
  { id: 'model', label: 'Model card', short: 'Model', icon: FileText },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const inWeeks = (n) => new Date(Date.now() + n * 7 * 86400000).toISOString().slice(0, 10);

export default function RoktimPage() {
  const { user } = useAuth();
  // The districts page hands a choice back through ?district=, which is also
  // what makes a particular district's curve a shareable link.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('district');
  const [service, setService] = useState(null); // null = still asking
  const [districts, setDistricts] = useState(null);
  const [selected, setSelected] = useState(null);
  const [targetDate, setTargetDate] = useState(inWeeks(2));
  const [activeId, setActiveId] = useState('overview');
  const [attempt, setAttempt] = useState(0);
  const sectionRefs = useRef({});

  // Wake the service before asking it anything. On a free tier the first call
  // after 15 idle minutes is the slow one, and a page whose whole content
  // comes from that service should not spend its first minute as skeletons.
  useEffect(() => {
    warmRoktim();
  }, []);

  useEffect(() => {
    let live = true;
    setService(null);
    health().then((h) => {
      if (!live) return;
      setService(h);
      if (!h.ok) return;
      fetchUnits('district').then((u) => {
        if (!live || !u) return;
        setDistricts(u.units);
        // Open on the admin's own district when they have one, which is the
        // curve they are most likely to want. Dhaka otherwise, because it
        // carries most of the national signal.
        const known = (name) => name && u.units.some((x) => x.unit === name);
        const own = user?.district ? toModelName(user.district) : null;
        const match = known(requested) ? requested : known(own) ? own : 'Dhaka';
        setSelected((s) => s || match);
      });
    });
    return () => {
      live = false;
    };
  }, [user?.district, requested, attempt]);

  // Scroll spy. IntersectionObserver rather than a scroll handler doing
  // getBoundingClientRect on seven nodes per frame.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveId(visible.target.id);
      },
      // The top margin accounts for the fixed nav so a section counts as
      // current once it clears the bar, not once it touches the viewport.
      { rootMargin: '-72px 0px -55% 0px', threshold: [0.05, 0.25] },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) {
        sectionRefs.current[s.id] = el;
        observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, [districts]);

  const navigate = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <RoktimShell sections={SECTIONS} activeId={activeId} onNavigate={navigate}>
      <div id="overview">
        <Hero
          status={service?.ok ? 'ok' : service ? 'down' : undefined}
          generated={service?.generated}
          schemaVersion={service?.schema_version}
        />
      </div>

      {service && !service.ok ? (
        <div className="px-5 sm:px-8 py-10 max-w-[1180px] mx-auto">
          <Unreachable onRetry={() => setAttempt((a) => a + 1)} />
        </div>
      ) : (
        <>
          <Section
            id="seasonal"
            eyebrow="The shape behind every advisory"
            title="One district's dengue year"
            blurb="Every seasonal advisory anywhere in RoktoNet is a single point on one of these curves. Pick a district and a date to see which point."
          >
            {districts && selected ? (
              <CurveExplorer
                districts={districts}
                selected={selected}
                onSelect={setSelected}
                targetDate={targetDate}
                onTargetDate={setTargetDate}
              />
            ) : (
              <Skeleton height={380} />
            )}
          </Section>

          <Section
            id="regional"
            eyebrow="Two weeks out"
            title="Expected demand by division"
            blurb="What history expects across the eight divisions at this point in the year. Magnitude as bars, or the same eight values as one shape."
          >
            <RegionalOutlook />
          </Section>

          <Section
            id="districts"
            eyebrow="Small multiples"
            title="All 64 districts"
            blurb="The same 52-week axis for every district, each scaled to its own maximum. Pick one to load it into the curve above."
            action={<SeeMore to="/admin/roktim/districts">Show all 64 districts</SeeMore>}
          >
            <DistrictGrid
              limit={10}
              selected={selected}
              onSelect={(unit) => {
                setSelected(unit);
                navigate('seasonal');
              }}
            />
          </Section>

          <Section
            id="requests"
            eyebrow="Assessed just now"
            title="Live elective requests"
            blurb="Scheduled requests currently in the system, with where each one's needed-by date falls in its own district's year. Peak dates first."
          >
            <LiveRequests limit={6} />
          </Section>

          <Section
            id="log"
            eyebrow="What was actually said"
            title="Advisory log"
            blurb="One row per elective request Roktim advised on, stamped with the model artefact that produced it."
            action={<SeeMore to="/admin/roktim/log">Open the full log</SeeMore>}
          >
            <AdvisoryLog limit={10} />
          </Section>

          <Section
            id="model"
            eyebrow="How it was built, and where it stops"
            title="Model card"
            blurb="The measured accuracy, the negative result, and every limitation worth knowing before anyone acts on a Roktim advisory."
          >
            <ModelCard />
          </Section>
        </>
      )}

      <footer className="px-5 sm:px-8 py-10 max-w-[1180px] mx-auto border-t border-roktim-hairline mt-6">
        <p className="text-[12px] text-roktim-muted leading-relaxed max-w-[80ch]">
          Roktim is the advisory half of RoktoNet and is marked Beta deliberately. The
          optimization engine decides what happens to a request; Roktim only ever adds context
          alongside that decision, and the system works exactly as it does today if this
          service is switched off.
        </p>
        <p className="font-mono text-[10px] text-roktim-dim mt-3">
          RoktoNet · Roktim · advisory module · {todayIso()}
        </p>
      </footer>
    </RoktimShell>
  );
}

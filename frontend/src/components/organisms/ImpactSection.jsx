import { useAsync } from '../../hooks/useAsync';
import { useReveal } from '../../hooks/useReveal';
import { getPublicStats } from '../../api/publicStats';
import { relativeTime } from '../../utils/relativeTime';
import AllocationMap from './AllocationMap';

// The live section.
//
// THIS USED TO BE A LIE, AND THAT IS WHY IT CHANGED
//
// The heading said "summarized data, pulled directly from RoktoNet's
// database" and every number beneath it was a string literal: 128, 47, 12%,
// 20, with the bar heights hardcoded too. On a page a supervisor can check
// against the database in thirty seconds, that was the worst kind of claim
// to leave standing.
//
// Everything here now comes from GET /api/public/stats, which is
// unauthenticated, cached for a minute, and returns aggregates only. If it
// cannot be reached the section renders nothing at all rather than falling
// back to invented figures.
//
// A NOTE ON THE MEDIAN TILE
//
// The endpoint returns null for median time to allocation when it does not
// have enough real samples to compute one, and the tile below is hidden in
// that case. It fills in by itself once the deployed system has handled
// requests end to end. Showing a number computed from fixture rows would
// have put "24 h" on the page, which is what the raw query produces from
// seed data and is pure artefact.

const URGENCY_ORDER = ['critical', 'urgent', 'routine', 'elective'];
const URGENCY_BAR = {
  critical: 'bg-critical-text', urgent: 'bg-urgent-border',
  routine: 'bg-routine-border', elective: 'bg-elective-border',
};
const FULFILLMENT_LABEL = {
  inventory: 'From inventory',
  donor_fallback: 'Donor fallback',
  parallel_critical: 'Parallel critical',
  scheduled_reservation: 'Scheduled reservation',
  scheduled_donor_mobilization: 'Scheduled mobilization',
  restock: 'Restock',
};
const FULFILLMENT_COLOR = {
  inventory: '#1C4A3D', donor_fallback: '#B8811F', parallel_critical: '#A9382F',
  scheduled_reservation: '#5B7A8C', scheduled_donor_mobilization: '#6B9080', restock: '#9CA8A3',
};

function Stat({ value, suffix, label, tone = 'text-primary dark:text-textprimary-dark', muted }) {
  return (
    <div className="hover-card bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5">
      <p className={`font-display font-bold text-3xl ${tone}`}>
        {value}
        {suffix && <span className="text-lg text-gray-400">{suffix}</span>}
        {muted && <span className="text-gray-300 dark:text-white/20 text-xl">{muted}</span>}
      </p>
      <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">{label}</p>
    </div>
  );
}

export default function ImpactSection() {
  const stats = useAsync(getPublicStats, []);
  const headingRef = useReveal();
  const statsRef = useReveal({ stagger: true });
  const chartsRef = useReveal({ stagger: true });
  const mapRef = useReveal();

  // Renders nothing at all while loading or on failure. A marketing section
  // is the wrong place for a skeleton or a red error box: the page simply
  // does not claim anything it cannot currently back up.
  if (stats.status !== 'success' || !stats.data) return null;

  const { totals, by_urgency: byUrgency, by_fulfillment: byFulfillment, flows, generated_at: generatedAt } = stats.data;

  const urgencyRows = URGENCY_ORDER
    .map((tier) => ({ tier, resolved: (byUrgency.find((u) => u.tier === tier) || {}).resolved || 0 }))
    .filter((r) => r.resolved > 0);
  const urgencyMax = Math.max(1, ...urgencyRows.map((r) => r.resolved));

  // The donut is drawn as one circle per slice with stroke-dasharray on a
  // 100-unit circumference, so each slice's length IS its percentage.
  let offset = 25; // start at twelve o'clock rather than three
  const slices = byFulfillment.filter((f) => f.share > 0).map((f) => {
    const s = { ...f, dash: `${f.share} ${100 - f.share}`, offset: -offset + 25 };
    offset += f.share;
    return s;
  });

  return (
    <section id="impact" className="max-w-6xl mx-auto px-6 py-20">
      <div ref={headingRef} className="text-center mb-10">
        <h2 className="font-display font-bold text-2xl dark:text-textprimary-dark">The system, live</h2>
        <p className="text-gray-500 dark:text-textsecondary-dark mt-2">
          Read from RoktoNet&apos;s database
          <span className="inline-flex items-center gap-1.5 ml-2 align-middle">
            <span className="w-1.5 h-1.5 rounded-full bg-elective-border animate-pulse" />
            <span className="mono text-[11px] text-gray-400">{relativeTime(generatedAt)}</span>
          </span>
        </p>
      </div>

      <div ref={statsRef} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat value={totals.units_allocated} label="Units allocated" />
        <Stat value={totals.requests_resolved} label="Requests resolved" />
        <Stat value={totals.organizations} label="Connected organizations" />
        <Stat value={totals.districts_covered} muted={` / ${totals.districts_total}`} label="Districts covered" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {totals.median_seconds_to_allocation !== null && (
          <Stat
            value={totals.median_seconds_to_allocation}
            suffix=" s"
            label="Median request to allocation"
          />
        )}
        {totals.donor_fallback_rate !== null && (
          <Stat
            value={totals.donor_fallback_rate}
            suffix="%"
            label="Donor fallback rate"
            tone="text-urgent-text dark:text-urgent-dtext"
          />
        )}
        <Stat
          value={totals.units_expiring_soon}
          label="Units expiring within 7 days"
          tone="text-critical-text dark:text-critical-dtext"
        />
      </div>

      <div ref={chartsRef} className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="hover-card bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5">
          <p className="font-display font-semibold text-sm mb-5 dark:text-textprimary-dark">
            Requests resolved by urgency tier
          </p>
          {/* items-stretch plus h-full on each column is load-bearing. With
              the column left at auto height, the bar's percentage height
              resolves against zero and every bar collapses to nothing,
              which is what the previous version did. */}
          <div className="flex items-stretch gap-4 h-32">
            {urgencyRows.map((r) => (
              <div key={r.tier} className="flex flex-col justify-end items-center gap-1.5 flex-1 h-full">
                <span className="text-[10px] text-gray-400 mono">{r.resolved}</span>
                <div
                  className={`w-full rounded-t ${URGENCY_BAR[r.tier]}`}
                  style={{ height: `${Math.max(4, (r.resolved / urgencyMax) * 100)}%` }}
                />
                <span className="text-[10px] text-gray-500 dark:text-textsecondary-dark capitalize">{r.tier}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hover-card bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5">
          <p className="font-display font-semibold text-sm mb-5 dark:text-textprimary-dark">
            How requests were fulfilled
          </p>
          <div className="flex items-center gap-6 flex-wrap">
            <svg width="112" height="112" viewBox="0 0 42 42" className="shrink-0" role="img" aria-label="Fulfillment path breakdown">
              {slices.map((s) => (
                <circle
                  key={s.path}
                  cx="21" cy="21" r="15.9" fill="none"
                  stroke={FULFILLMENT_COLOR[s.path] || '#9CA8A3'}
                  strokeWidth="7"
                  strokeDasharray={s.dash}
                  strokeDashoffset={s.offset}
                />
              ))}
            </svg>
            <ul className="text-xs space-y-2 text-gray-600 dark:text-textsecondary-dark">
              {slices.map((s) => (
                <li key={s.path} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: FULFILLMENT_COLOR[s.path] || '#9CA8A3' }} />
                  {FULFILLMENT_LABEL[s.path] || s.path} · {s.share}%
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {flows.length > 0 && (
        <div ref={mapRef} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display font-semibold text-sm dark:text-textprimary-dark">Allocation map</p>
              <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-0.5">
                Where blood moved, as the engine assigned it
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-gray-500 dark:text-textsecondary-dark">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" />Supplier</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-critical-text" />Requester</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_300px]">
            <AllocationMap flows={flows} />

            <aside className="border-t lg:border-t-0 lg:border-l border-gray-100 dark:border-white/10 p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-critical-text animate-pulse" />
                <p className="mono text-[11px] text-gray-400">MOST RECENT</p>
              </div>
              <ol className="space-y-4">
                {flows.slice(0, 5).map((f) => (
                  <li
                    key={`${f.from_district}-${f.to_district}-${f.urgency_tier}`}
                    className="pl-4 border-l-2"
                    style={{ borderColor: `${FULFILLMENT_COLOR.parallel_critical}33` }}
                  >
                    <p className="text-xs font-medium dark:text-textprimary-dark">
                      {f.from_district} → {f.to_district}
                    </p>
                    {/* capitalize only on the tier. On the whole line it
                        also hits "units", giving "2 Units · Elective". */}
                    <p className="text-[11px] text-gray-500 dark:text-textsecondary-dark mt-0.5">
                      {f.units} unit{f.units === 1 ? '' : 's'} · <span className="capitalize">{f.urgency_tier}</span>
                    </p>
                    {f.last_at && (
                      <p className="mono text-[10px] text-gray-400 mt-1">{relativeTime(f.last_at)}</p>
                    )}
                  </li>
                ))}
              </ol>
              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-white/10">
                <p className="text-[11px] text-gray-500 dark:text-textsecondary-dark leading-relaxed">
                  Every line is one allocation the engine made. Districts only, never the organizations
                  involved.
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}
    </section>
  );
}

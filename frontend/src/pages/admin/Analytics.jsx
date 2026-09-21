import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Bar, Line, Doughnut, PolarArea } from 'react-chartjs-2';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import Button from '../../components/atoms/Button';
import StatCard from '../../components/admin/StatCard';
import DateRangeFilter, { rangeToQuery, defaultRange } from '../../components/admin/DateRangeFilter';
import ChartExportPanel from '../../components/admin/ChartExportPanel';
import { baseOptions, radialOptions, polarOptions, PALETTE, SERIES, URGENCY_COLOR, STATUS_COLOR, PATH_COLOR, weekLabel } from '../../components/admin/chartTheme';
import { useAsync } from '../../hooks/useAsync';
import { getWastage, getShortage, getFairness, getFallback, getActivity } from '../../api/admin';
import { logChartExport } from '../../api/reports';
import { BLOOD_TYPES } from '../../constants/blood';

const pct = (x) => `${(x * 100).toFixed(1)}%`;

// 7.7b (bug 9): `id` and `section` are what the export panel finds the
// chart by. They are plain data attributes rather than a ref registry
// because the sections render their charts inside render-prop children,
// and because a chart that is still loading or whose section errored is
// simply absent from the DOM -- which gives the panel availability
// detection for free.
function Card({ title, note, children, span = 1, id, section }) {
  return (
    <div
      className={`bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 sm:p-5 ${span === 2 ? 'lg:col-span-2' : ''}`}
      {...(id ? { 'data-chart-id': id, 'data-chart-title': title, 'data-chart-section': section } : {})}
    >
      <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">{title}</p>
      {note && <p className="text-xs text-gray-400 mb-3">{note}</p>}
      {children}
    </div>
  );
}

function Section({ n, title, state, children }) {
  return (
    <section className="mb-8">
      <h2 className="font-display font-semibold text-base mb-3 dark:text-textprimary-dark">{n} · {title}</h2>
      {state.status === 'loading' && <LoadingState rows={4} />}
      {state.status === 'error' && <ErrorState message={state.error} onRetry={state.reload} />}
      {state.status === 'success' && state.data && children(state.data)}
    </section>
  );
}

// Pivot [{key, group, count}] rows into stacked datasets keyed by `group`.
function pivot(rows, keyField, groupField, keys, groups, colorOf) {
  return {
    labels: keys,
    datasets: groups.map((g, i) => ({
      label: g,
      data: keys.map((k) => rows.filter((r) => r[keyField] === k && r[groupField] === g).reduce((s, r) => s + r.count, 0)),
      backgroundColor: colorOf ? colorOf(g, i) : SERIES[i % SERIES.length],
      stack: 's',
    })),
  };
}

const OUTCOME_COLOR = { fully_covered: PALETTE.g3, partially_covered: PALETTE.a2, unmet: PALETTE.r, pending: PALETTE.gray, cancelled: '#D1D5DB' };
const OUTCOMES = ['fully_covered', 'partially_covered', 'unmet', 'pending', 'cancelled'];

const prettyDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminAnalytics() {
  const [range, setRange] = useState(defaultRange(90));
  const [applied, setApplied] = useState(rangeToQuery(range));
  const [exportOpen, setExportOpen] = useState(false);
  const wastage = useAsync(() => getWastage(applied), [applied]);
  const shortage = useAsync(() => getShortage(applied), [applied]);
  const fairness = useAsync(() => getFairness(applied), [applied]);
  const fallback = useAsync(() => getFallback(applied), [applied]);
  const activity = useAsync(() => getActivity(applied), [applied]);

  // Derived from `applied`, not `range`: the filename and the PDF header
  // must describe the window the charts were actually fetched for, not
  // whatever is currently typed into the date boxes but not yet applied.
  const { rangeLabel, rangeText } = useMemo(() => {
    const { from, to } = applied;
    if (!from && !to) return { rangeLabel: 'all_time', rangeText: 'All time' };
    const f = from || 'start';
    const t = to || new Date().toISOString().slice(0, 10);
    return {
      rangeLabel: `${f}_to_${t}`,
      rangeText: `${from ? prettyDate(from) : 'the beginning'} to ${to ? prettyDate(to) : 'now'}`,
    };
  }, [applied]);

  // Changes exactly when a section finishes loading, errors, or refetches,
  // which is when the set of mounted charts can differ.
  const revision = [wastage, shortage, fairness, fallback, activity].map((s) => s.status).join('|');

  return (
    <div className="p-6">
      <PageHeader
        title="Analytics"
        subtitle="The five claims the engine has to prove: wastage, shortage, fairness, fallback, activity."
        action={
          <form className="flex items-center gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); setApplied(rangeToQuery(range)); }}>
            <DateRangeFilter value={range} onChange={setRange} compact />
            <Button type="submit" variant="secondary">Apply</Button>
            <Button type="button" variant="secondary" onClick={() => setExportOpen((v) => !v)}>Export charts</Button>
            <Link to="/admin/reports"><Button variant="secondary">Data →</Button></Link>
          </form>
        }
      />

      <ChartExportPanel
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        revision={revision}
        rangeLabel={rangeLabel}
        rangeText={rangeText}
        onExported={({ count, format }) => logChartExport({ charts: count, format, ...applied })}
      />

      <Section n={1} title="Wastage" state={wastage}>
        {(d) => {
          const weeks = [...new Set(d.by_week.map((r) => r.week))];
          const atRisk = d.expiring_within_7_days.reduce((s, r) => s + r.count, 0);
          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <StatCard value={d.summary.total_units} label="Units in window" />
                <StatCard value={d.summary.expired} label="Expired (wasted)" tone="critical" />
                <StatCard value={pct(d.summary.wastage_rate)} label="Wastage rate" />
                <StatCard value={atRisk} label="At risk ≤ 7 days (now)" tone="urgent" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card id="wastage-by-blood-type" section="Wastage" title="Outcome by blood type" note="Expired vs delivered vs still available."><div style={{ height: 220 }}><Bar data={pivot(d.by_blood_type, 'blood_type', 'status', BLOOD_TYPES, ['available', 'reserved', 'dispatched', 'delivered', 'expired'], (g) => STATUS_COLOR[g])} options={baseOptions({ stacked: true })} /></div></Card>
                <Card id="wastage-per-week" section="Wastage" title="Units collected per week, by outcome" note="Stacked. A rising red band is the problem this engine exists to shrink."><div style={{ height: 220 }}><Bar data={{ ...pivot(d.by_week, 'week', 'status', weeks, ['available', 'reserved', 'dispatched', 'delivered', 'expired'], (g) => STATUS_COLOR[g]), labels: weeks.map(weekLabel) }} options={baseOptions({ stacked: true })} /></div></Card>
              </div>
            </>
          );
        }}
      </Section>

      <Section n={2} title="Shortage" state={shortage}>
        {(d) => {
          const districts = [...new Set(d.by_district.map((r) => r.district))].filter(Boolean);
          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <StatCard value={d.summary.total_requests} label="Requests in window" />
                <StatCard value={d.summary.unmet_or_partial} label="Unmet or partially covered" tone="critical" />
                <StatCard value={pct(d.summary.shortage_rate)} label="Shortage rate" />
                <StatCard value={d.by_tier.filter((r) => r.outcome === 'cancelled').reduce((s, r) => s + r.count, 0)} label="Cancelled" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card id="shortage-by-tier" section="Shortage" title="Outcome by urgency tier" note="Critical should be fully covered first — this is where the weights show."><div style={{ height: 220 }}><Bar data={pivot(d.by_tier, 'urgency_tier', 'outcome', ['critical', 'urgent', 'routine', 'elective', 'restock'], OUTCOMES, (g) => OUTCOME_COLOR[g])} options={baseOptions({ stacked: true })} /></div></Card>
                <Card id="shortage-by-district" section="Shortage" title="Outcome by district" note="Where the gaps are geographically."><div style={{ height: 220 }}><Bar data={pivot(d.by_district, 'district', 'outcome', districts, OUTCOMES, (g) => OUTCOME_COLOR[g])} options={baseOptions({ stacked: true, horizontal: true })} /></div></Card>
              </div>
            </>
          );
        }}
      </Section>

      <Section n={3} title="Fairness" state={fairness}>
        {(d) => {
          const orgs = d.by_source_org;
          const top = orgs.slice(0, 6);
          const others = orgs.slice(6).reduce((s, o) => s + o.units_contributed, 0);
          const largest = orgs[0]?.share || 0;
          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <StatCard value={d.summary.total_units_allocated} label="Units allocated" />
                <StatCard value={d.summary.source_orgs} label="Source organizations" />
                <StatCard value={d.summary.gini_coefficient.toFixed(2)} label="Gini coefficient (0 = perfectly even)" />
                <StatCard value={pct(largest)} label="Largest single-org share" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card id="fairness-by-org" section="Fairness" span={2} title="Contribution per source organization" note="Units allocated out of each bank/NGO, with what they still hold. No single org is being drained — the fairness objective, made visible.">
                  <div style={{ height: 260 }}><Bar data={{ labels: orgs.map((o) => o.name), datasets: [{ label: 'units allocated out', data: orgs.map((o) => o.units_contributed), backgroundColor: PALETTE.g1, borderRadius: 4 }, { label: 'still available', data: orgs.map((o) => o.current_available), backgroundColor: PALETTE.g4, borderRadius: 4 }] }} options={baseOptions()} /></div>
                </Card>
                <Card id="fairness-share" section="Fairness" title="Share of all allocations" note="Nightingale rose — top 6 + others. Radius = share.">
                  <div style={{ height: 260 }}><PolarArea data={{ labels: [...top.map((o) => o.name), ...(others ? ['others'] : [])], datasets: [{ data: [...top.map((o) => o.units_contributed), ...(others ? [others] : [])], backgroundColor: [...SERIES.slice(0, 6), PALETTE.gray].map((c) => `${c}CC`), borderWidth: 0 }] }} options={polarOptions()} /></div>
                </Card>
              </div>
            </>
          );
        }}
      </Section>

      <Section n={4} title="Fallback" state={fallback}>
        {(d) => {
          const weeks = [...new Set(d.by_week.map((r) => r.week))];
          const paths = [...new Set(d.by_week.map((r) => r.fulfillment_path))];
          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <StatCard value={d.summary.resolved_total} label="Requests resolved" />
                <StatCard value={pct(d.summary.fallback_rate)} label="Needed donor fallback" />
                <StatCard value={d.summary.invites_total} label="Donor invites sent" />
                <StatCard value={pct(d.summary.invite_confirm_rate)} label="Invite confirm rate" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card id="fallback-per-week" section="Fallback" title="Resolution path per week" note="Inventory vs each fallback path.">
                  <div style={{ height: 220 }}><Line data={{ labels: weeks.map(weekLabel), datasets: paths.map((p, i) => ({ label: p, data: weeks.map((w) => d.by_week.filter((r) => r.week === w && r.fulfillment_path === p).reduce((s, r) => s + r.count, 0)), borderColor: PATH_COLOR[p] || SERIES[i], backgroundColor: PATH_COLOR[p] || SERIES[i], tension: 0.35 })) }} options={baseOptions()} /></div>
                </Card>
                <Card id="fallback-invite-outcomes" section="Fallback" title="Donor invite outcomes" note="Confirmed / declined / no answer yet.">
                  <div style={{ height: 220 }}><Doughnut data={{ labels: d.invites_by_status.map((r) => r.invite_status), datasets: [{ data: d.invites_by_status.map((r) => r.count), backgroundColor: d.invites_by_status.map((r) => ({ confirmed: PALETTE.g3, declined: PALETTE.r, invited: PALETTE.gray })[r.invite_status] || PALETTE.s1), borderWidth: 0 }] }} options={radialOptions({ cutout: '60%' })} /></div>
                </Card>
              </div>
            </>
          );
        }}
      </Section>

      <Section n={5} title="Activity" state={activity}>
        {(d) => {
          const days = [...new Set([...d.requests_per_day.map((r) => r.day), ...d.manual_batches_per_day.map((r) => r.day)])].sort();
          const fmt = (x) => new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card id="activity-requests-per-day" section="Activity" title="Requests per day, by urgency"><div style={{ height: 200 }}><Bar data={{ ...pivot(d.requests_per_day, 'day', 'urgency_tier', days, ['critical', 'urgent', 'routine', 'elective', 'restock'], (g) => URGENCY_COLOR[g]), labels: days.map(fmt) }} options={baseOptions({ stacked: true })} /></div></Card>
              <Card id="activity-manual-batches" section="Activity" title="Manual engine runs per day" note="Admin-triggered batches (the scheduler's own runs aren't audit-logged)."><div style={{ height: 200 }}><Bar data={{ labels: days.map(fmt), datasets: [{ label: 'manual (admin)', data: days.map((day) => d.manual_batches_per_day.filter((r) => r.day === day).reduce((s, r) => s + r.count, 0)), backgroundColor: PALETTE.g1, borderRadius: 4 }] }} options={baseOptions({ legend: false })} /></div></Card>
            </div>
          );
        }}
      </Section>
    </div>
  );
}

Card.propTypes = { title: PropTypes.string.isRequired, note: PropTypes.string, children: PropTypes.node, span: PropTypes.number, id: PropTypes.string, section: PropTypes.string };
Section.propTypes = { n: PropTypes.number.isRequired, title: PropTypes.string.isRequired, state: PropTypes.object.isRequired, children: PropTypes.func.isRequired };

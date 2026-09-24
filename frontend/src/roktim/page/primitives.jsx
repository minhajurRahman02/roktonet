import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { BarChart3, Table2, ArrowRight, ArrowLeft } from 'lucide-react';

// The shared furniture of the Roktim page: section wrapper, stat tile, and
// the chart/table frame that gives every chart its accessible twin.

/** A section of the page, with an anchor the nav scrolls to. */
export function Section({ id, eyebrow, title, blurb, action, children }) {
  return (
    <section id={id} className="scroll-mt-20 px-5 sm:px-8 py-10 max-w-[1180px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div className="min-w-0">
          {eyebrow && (
            <p className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-roktim-dim mb-1.5">
              {eyebrow}
            </p>
          )}
          <h2 className="font-display font-bold text-[22px] sm:text-[25px] tracking-[-0.02em] text-roktim-ink">
            {title}
          </h2>
          {blurb && (
            <p className="text-[13.5px] text-roktim-muted mt-1.5 max-w-[68ch] leading-relaxed">
              {blurb}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
Section.propTypes = {
  id: PropTypes.string.isRequired,
  eyebrow: PropTypes.string,
  title: PropTypes.string.isRequired,
  blurb: PropTypes.string,
  action: PropTypes.node,
  children: PropTypes.node,
};

/**
 * The "see more" affordance, used wherever a section is a preview of a page.
 * `back` flips the arrow to the left and puts it first, for the return trip.
 */
export function SeeMore({ to, back = false, children }) {
  const Arrow = back ? ArrowLeft : ArrowRight;
  return (
    <Link
      to={to}
      className="group shrink-0 flex items-center gap-1.5 text-[13px] font-medium
                 text-roktim-mark hover:text-roktim-hi transition-colors"
    >
      {back && (
        <Arrow size={14} className="group-hover:-translate-x-0.5 transition-transform" />
      )}
      {children}
      {!back && (
        <Arrow size={14} className="group-hover:translate-x-0.5 transition-transform" />
      )}
    </Link>
  );
}
SeeMore.propTypes = {
  to: PropTypes.string.isRequired,
  back: PropTypes.bool,
  children: PropTypes.node,
};

export function Card({ className = '', children }) {
  return (
    <div
      className={`rk-glow bg-roktim-surface/85 backdrop-blur-[2px] border border-roktim-hairline rounded-2xl ${className}`}
    >
      {children}
    </div>
  );
}
Card.propTypes = { className: PropTypes.string, children: PropTypes.node };

/**
 * A single number. No plot, because a one-bar bar chart is not a chart.
 * Proportional figures, not tabular-nums: equal-width digits make a large
 * standalone number look loose.
 */
export function StatTile({ value, label, sub }) {
  return (
    <div className="px-4 py-3.5">
      <p className="font-body font-semibold text-[26px] leading-none text-roktim-ink">{value}</p>
      <p className="text-[12.5px] text-roktim-muted mt-1.5">{label}</p>
      {sub && <p className="font-mono text-[10px] text-roktim-dim mt-1">{sub}</p>}
    </div>
  );
}
StatTile.propTypes = {
  value: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
  sub: PropTypes.string,
};

/**
 * Wraps a chart with its table-view twin.
 *
 * Every chart on this page has one. It is not a nicety: the marks sit on a
 * dark surface near the contrast floor, and colour is doing real work in the
 * demand ramp, so there has to be a route to every value that does not depend
 * on seeing the chart at all. The toggle is also the fastest way to read an
 * exact number, which is why it earns its place for sighted readers too.
 */
export function ChartFrame({ title, note, table, height = 300, children }) {
  const [view, setView] = useState('chart');
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-roktim-ink">{title}</p>
          {note && <p className="text-[11.5px] text-roktim-muted mt-0.5">{note}</p>}
        </div>
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-roktim-hairline"
          role="group"
          aria-label="View as"
        >
          {[
            ['chart', BarChart3, 'Chart'],
            ['table', Table2, 'Table'],
          ].map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] transition-colors ${
                view === key
                  ? 'bg-roktim-brand/35 text-roktim-ink'
                  : 'text-roktim-muted hover:text-roktim-ink'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        // Sized to include the axis band, not just the plot. A fixed height
        // that excludes it is how a chart card ends up with its own tiny
        // nested scrollbar.
        <div className="px-3 pb-4" style={{ height }}>
          {children}
        </div>
      ) : (
        <div className="px-4 pb-4 max-h-[420px] overflow-auto">{table}</div>
      )}
    </Card>
  );
}
ChartFrame.propTypes = {
  title: PropTypes.string.isRequired,
  note: PropTypes.string,
  table: PropTypes.node,
  height: PropTypes.number,
  children: PropTypes.node,
};

/** The table half of ChartFrame. tabular-nums here, where digits do align. */
export function DataTable({ columns, rows }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 bg-roktim-surface">
        <tr className="text-left text-roktim-dim font-mono text-[10px] tracking-[0.08em] uppercase">
          {columns.map((c) => (
            <th key={c.key} className={`py-2 pr-3 font-normal ${c.align === 'right' ? 'text-right' : ''}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key ?? i} className="border-t border-roktim-hairline/60">
            {columns.map((c) => (
              <td
                key={c.key}
                className={`py-1.5 pr-3 text-roktim-ink ${
                  c.align === 'right' ? 'text-right tabular-nums' : ''
                }`}
              >
                {r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
DataTable.propTypes = {
  columns: PropTypes.arrayOf(
    PropTypes.shape({ key: PropTypes.string, label: PropTypes.string, align: PropTypes.string }),
  ).isRequired,
  rows: PropTypes.array.isRequired,
};

/** Loading placeholder. The page gets skeletons; the strip and card do not. */
export function Skeleton({ height = 300 }) {
  return (
    <div
      className="rounded-2xl border border-roktim-hairline bg-roktim-surface/60 animate-pulse"
      style={{ height }}
    />
  );
}
Skeleton.propTypes = { height: PropTypes.number };

/**
 * The page's one honest empty state.
 *
 * Roktim's in-app surfaces render nothing when the service is unreachable,
 * because a caution that cannot be computed is better absent than wrong. A
 * page ABOUT Roktim cannot do that: a blank screen would read as broken. So
 * this is the documented exception, and it says which of the two things went
 * wrong rather than a generic failure.
 */
export function Unreachable({ onRetry }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-[15px] text-roktim-ink">Roktim is not answering right now.</p>
      <p className="text-[13px] text-roktim-muted mt-2 max-w-[52ch] mx-auto leading-relaxed">
        The forecast service runs on a free tier that sleeps after 15 minutes idle and takes
        about a minute to wake. Nothing in RoktoNet depends on it, so requests and allocation
        are unaffected either way.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{ '--rk-pill-bg': '#141220' }}
          className="rk-gradient-ring mt-5 px-5 py-2 text-[13px] font-medium text-roktim-ink"
        >
          Try again
        </button>
      )}
    </Card>
  );
}
Unreachable.propTypes = { onRetry: PropTypes.func };

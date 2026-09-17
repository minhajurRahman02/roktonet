import PropTypes from 'prop-types';
import Input from '../atoms/Input';

/**
 * The shared ?from=&to= control every admin list/analytics/report page
 * uses. `allTime` (user change #2 on the mockup) is a first-class option,
 * not just "leave both blank" -- it's explicit so the report filename and
 * the audit entry both say "all time" rather than an empty window.
 *
 * value: { from: 'YYYY-MM-DD'|'', to: 'YYYY-MM-DD'|'', allTime: boolean }
 */
export default function DateRangeFilter({ value, onChange, showAllTime = true, compact = false }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const disabled = showAllTime && value.allTime;
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'flex-wrap'}`}>
      {showAllTime && (
        <label className={`flex items-center gap-1.5 text-sm cursor-pointer select-none dark:text-textprimary-dark ${compact ? '' : 'basis-full'}`}>
          <input type="checkbox" checked={!!value.allTime} onChange={(e) => set({ allTime: e.target.checked })} className="accent-primary" />
          All time
        </label>
      )}
      <Input type="date" value={value.from} disabled={disabled} onChange={(e) => set({ from: e.target.value })} className="!w-auto" aria-label="From date" />
      <span className="text-gray-400 text-sm">to</span>
      <Input type="date" value={value.to} disabled={disabled} onChange={(e) => set({ to: e.target.value })} className="!w-auto" aria-label="To date" />
    </div>
  );
}

DateRangeFilter.propTypes = {
  value: PropTypes.shape({ from: PropTypes.string, to: PropTypes.string, allTime: PropTypes.bool }).isRequired,
  onChange: PropTypes.func.isRequired,
  showAllTime: PropTypes.bool,
  compact: PropTypes.bool,
};

/** Turns the filter value into the {from, to} query the API expects. */
export function rangeToQuery(value) {
  if (value.allTime) return {};
  const q = {};
  if (value.from) q.from = value.from;
  if (value.to) q.to = value.to;
  return q;
}

export function defaultRange(daysBack = 90) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), allTime: false };
}

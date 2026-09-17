import PropTypes from 'prop-types';
import { URGENCY_COLOR } from './chartTheme';

/**
 * Schematic map of Bangladesh's 8 divisions (spec 2.11): node size =
 * available units, animated arcs = allocations source -> destination
 * colored by urgency. Positions come from the backend (`x`,`y` on a
 * 0-100 grid) so the frontend has no copy of the district->division
 * table to keep in sync. Not geographic -- 7.7a's own iteration room
 * will refine that.
 */
export default function DivisionMap({ divisions, flows }) {
  const byName = Object.fromEntries(divisions.map((d) => [d.division, d]));
  const max = Math.max(1, ...divisions.map((d) => d.available_units));
  const radius = (n) => 2.2 + 5 * Math.sqrt(n / max);

  // Curve each arc slightly so opposite-direction flows don't overlap.
  const arc = (a, b) => {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx - (dy / len) * 6, cy = my + (dx / len) * 6;
    // stop the line at the destination node's edge so the arrowhead sits on it
    const rb = radius(b.available_units);
    const ex = b.x - (dx / len) * (rb + 1), ey = b.y - (dy / len) * (rb + 1);
    return `M${a.x} ${a.y} Q${cx} ${cy} ${ex} ${ey}`;
  };

  const visibleFlows = flows.filter((f) => !f.intra_division && byName[f.source] && byName[f.destination]);
  const totalUnits = flows.reduce((s, f) => s + f.units, 0);

  return (
    <div>
      <svg viewBox="0 0 100 92" className="w-full" style={{ maxHeight: 380 }} role="img" aria-label="Allocation flow between divisions">
        <defs>
          {Object.entries(URGENCY_COLOR).map(([tier, color]) => (
            <marker key={tier} id={`ah-${tier}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="3.2" markerHeight="3.2" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M0 0L10 5L0 10z" fill={color} />
            </marker>
          ))}
        </defs>
        <style>{`.rk-flow{stroke-dasharray:6 4;animation:rk-dash 1.6s linear infinite}@keyframes rk-dash{to{stroke-dashoffset:-20}}`}</style>
        {visibleFlows.map((f) => (
          <path
            key={`${f.source}-${f.destination}-${f.urgency_tier}`}
            d={arc(byName[f.source], byName[f.destination])}
            fill="none"
            stroke={URGENCY_COLOR[f.urgency_tier] || URGENCY_COLOR.routine}
            strokeWidth={0.5 + Math.min(1.2, f.units / 8)}
            className="rk-flow"
            markerEnd={`url(#ah-${f.urgency_tier in URGENCY_COLOR ? f.urgency_tier : 'routine'})`}
          >
            <title>{`${f.source} → ${f.destination}: ${f.units} unit(s), ${f.urgency_tier}`}</title>
          </path>
        ))}
        <g fontFamily="IBM Plex Sans" fontSize="2.6" textAnchor="middle">
          {divisions.map((d) => {
            const r = radius(d.available_units);
            const empty = d.available_units === 0;
            return (
              <g key={d.division}>
                <circle cx={d.x} cy={d.y} r={r} fill={empty ? '#9CA3AF' : '#1C4A3D'} opacity={empty ? 0.6 : 0.9}>
                  <title>{`${d.division}: ${d.available_units} available unit(s)`}</title>
                </circle>
                <text x={d.x} y={d.y - r - 1.6} fill="currentColor" className="text-textprimary dark:text-textprimary-dark">{d.division}</text>
                <text x={d.x} y={d.y + 0.9} fill="#fff" fontSize={r > 5 ? 3 : 2.2}>{d.available_units}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-textsecondary-dark mt-2">
        {['critical', 'urgent', 'routine', 'elective'].map((t) => (
          <span key={t} className="flex items-center gap-1.5 capitalize">
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: URGENCY_COLOR[t] }} />{t}
          </span>
        ))}
        <span className="ml-auto">{visibleFlows.length} flows · {totalUnits} units</span>
      </div>
    </div>
  );
}

DivisionMap.propTypes = {
  divisions: PropTypes.arrayOf(PropTypes.shape({ division: PropTypes.string, x: PropTypes.number, y: PropTypes.number, available_units: PropTypes.number })).isRequired,
  flows: PropTypes.arrayOf(PropTypes.shape({ source: PropTypes.string, destination: PropTypes.string, urgency_tier: PropTypes.string, units: PropTypes.number, intra_division: PropTypes.bool })).isRequired,
};

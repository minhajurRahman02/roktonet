import PropTypes from 'prop-types';
import { useMemo } from 'react';

// Where blood actually moved, drawn on the country.
//
// ============================ READ THIS FIRST ============================
// THE GEOMETRY BELOW IS A PLACEHOLDER AND IS LABELLED AS ONE ON SCREEN.
//
// RoktoNet stores no coordinates. bd_thanas is (thana_id, name, district)
// and nothing anywhere holds a latitude. So the map needs geometry from
// outside the system, and until that file exists this component places each
// flow at its DIVISION, of which there are eight and whose relative
// positions are not in dispute.
//
// TO SWAP IN THE REAL MAP
//
//   1. Put a district GeoJSON at frontend/public/bd-districts.json
//   2. It needs a FeatureCollection whose features carry a district name
//      property matching organizations.district, with Polygon or
//      MultiPolygon geometry in [lon, lat]
//   3. Replace DIVISION_POINTS with centroids derived from that file, and
//      render the polygons behind the nodes
//   4. Delete the placeholder banner in the parent component
//
// Nothing else changes: flows already arrive as district names, and the arc
// drawing works off whatever point lookup it is given.
// =========================================================================

// The eight divisional capitals, in a normalised 0..1 box over the country.
// Positions are relative rather than projected: what has to be true is that
// Rangpur reads as north, Chattogram as south-east, Khulna as south-west,
// and Dhaka as central. It is not a projection and does not pretend to be.
const DIVISION_POINTS = {
  Rangpur: { x: 0.33, y: 0.14 },
  Mymensingh: { x: 0.49, y: 0.28 },
  Sylhet: { x: 0.74, y: 0.25 },
  Rajshahi: { x: 0.24, y: 0.34 },
  Dhaka: { x: 0.46, y: 0.47 },
  Khulna: { x: 0.30, y: 0.72 },
  Barishal: { x: 0.47, y: 0.76 },
  Chattogram: { x: 0.68, y: 0.71 },
};

// Districts whose name is not its own division. Only the ones RoktoNet's
// own seed and thana data actually use are listed; anything unlisted falls
// through to a name match against the divisions above, and anything that
// still fails to place is counted and reported rather than dropped.
const DISTRICT_TO_DIVISION = {
  Gazipur: 'Dhaka', Narayanganj: 'Dhaka', Tangail: 'Dhaka', Munshiganj: 'Dhaka',
  Manikganj: 'Dhaka', Narsingdi: 'Dhaka', Faridpur: 'Dhaka', Kishoreganj: 'Dhaka',
  Bogra: 'Rajshahi', Bogura: 'Rajshahi', Pabna: 'Rajshahi', Natore: 'Rajshahi',
  Sirajganj: 'Rajshahi', Naogaon: 'Rajshahi',
  Jessore: 'Khulna', Jashore: 'Khulna', Kushtia: 'Khulna', Satkhira: 'Khulna',
  Bagerhat: 'Khulna',
  Comilla: 'Chattogram', Cumilla: 'Chattogram', Coxsbazar: 'Chattogram',
  "Cox's Bazar": 'Chattogram', Feni: 'Chattogram', Noakhali: 'Chattogram',
  Dinajpur: 'Rangpur', Lalmonirhat: 'Rangpur', Nilphamari: 'Rangpur',
  Moulvibazar: 'Sylhet', Habiganj: 'Sylhet', Sunamganj: 'Sylhet',
  Patuakhali: 'Barishal', Bhola: 'Barishal', Jhalakathi: 'Barishal',
  Jhalokati: 'Barishal', Barisal: 'Barishal',
};

const VB = { w: 420, h: 480 };

function pointFor(district) {
  const division = DISTRICT_TO_DIVISION[district] || district;
  const p = DIVISION_POINTS[division];
  if (!p) return null;
  return { x: p.x * VB.w, y: p.y * VB.h };
}

// An indicative national outline. Deliberately simple: a wrong-but-detailed
// coastline would look like a real map and invite the reader to trust it.
const OUTLINE = 'M150,40 L205,34 L238,52 L262,44 L286,62 L300,96 L288,126 L300,150 L292,182 '
  + 'L312,196 L322,232 L300,258 L308,288 L286,316 L300,352 L286,392 L262,420 '
  + 'L236,406 L210,420 L186,404 L160,414 L140,390 L150,356 L130,330 L142,300 '
  + 'L120,272 L132,240 L112,210 L126,178 L108,148 L124,116 L112,86 L134,62 Z';

const URGENCY_STROKE = {
  critical: '#A9382F', urgent: '#B8811F', routine: '#5B7A8C', elective: '#6B9080', restock: '#5B7A8C',
};

export default function AllocationMap({ flows }) {
  const { arcs, nodes, unplaced } = useMemo(() => {
    const placed = [];
    let missed = 0;
    const seen = new Map();

    flows.forEach((f, i) => {
      const from = pointFor(f.from_district);
      const to = pointFor(f.to_district);
      if (!from || !to) { missed += 1; return; }

      // A flow inside one district has no line to draw; it still counts as
      // an allocation and its node should light up, so it is registered as
      // a node without an arc.
      const sameNode = from.x === to.x && from.y === to.y;
      if (!sameNode) {
        // Bow each arc away from the straight line so two flows between the
        // same pair do not draw on top of each other.
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        const bow = 0.18 * (i % 2 === 0 ? 1 : -1);
        placed.push({
          id: `arc-${i}`,
          d: `M${from.x},${from.y} Q${mx - (to.y - from.y) * bow},${my + (to.x - from.x) * bow} ${to.x},${to.y}`,
          stroke: URGENCY_STROKE[f.urgency_tier] || '#5B7A8C',
          dur: 3 + (i % 4) * 0.35,
          delay: (i % 5) * 0.7,
        });
      }
      seen.set(f.from_district, { ...from, role: seen.get(f.from_district)?.role === 'to' ? 'both' : 'from', label: f.from_district });
      seen.set(f.to_district, { ...to, role: seen.get(f.to_district)?.role === 'from' ? 'both' : 'to', label: f.to_district });
    });

    return { arcs: placed, nodes: Array.from(seen.values()), unplaced: missed };
  }, [flows]);

  return (
    <div className="relative bg-paper dark:bg-paper-dark">
      <div className="absolute top-3 left-3 z-10 mono text-[10px] px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50">
        PLACEHOLDER GEOMETRY
      </div>

      <svg
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        className="w-full mx-auto"
        style={{ maxHeight: 470 }}
        role="img"
        aria-label={`Allocation map showing ${arcs.length} transfers between districts`}
      >
        <defs>
          <linearGradient id="alloc-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1C4A3D" />
            <stop offset="100%" stopColor="#A9382F" />
          </linearGradient>
        </defs>

        <path d={OUTLINE} fill="#1C4A3D" fillOpacity="0.07" stroke="#1C4A3D" strokeOpacity="0.3" strokeWidth="1.5" />

        {arcs.map((a) => (
          <path key={a.id} id={a.id} d={a.d} fill="none" stroke="url(#alloc-arc)" strokeWidth="1.6" strokeOpacity="0.75" />
        ))}

        {nodes.map((n) => (
          <g key={n.label}>
            <circle
              cx={n.x} cy={n.y}
              r={n.role === 'both' ? 8 : 6}
              fill={n.role === 'from' ? '#1C4A3D' : '#A9382F'}
            />
            <text
              x={n.x} y={n.y - 13} textAnchor="middle" fontSize="9"
              fill="#6B7280" fontFamily="IBM Plex Mono"
            >
              {n.label}
            </text>
          </g>
        ))}

        {/* A dot travelling each arc. SMIL rather than CSS offset-path:
            offset-path support for an external reference is patchier, and
            animateMotion with mpath reuses the exact path already drawn
            rather than a duplicated copy that could drift out of sync. */}
        {arcs.map((a) => (
          <circle key={`${a.id}-dot`} r="3.2" fill={a.stroke}>
            <animateMotion dur={`${a.dur}s`} begin={`${a.delay}s`} repeatCount="indefinite">
              <mpath href={`#${a.id}`} />
            </animateMotion>
          </circle>
        ))}
      </svg>

      {unplaced > 0 && (
        <p className="absolute bottom-3 left-3 mono text-[10px] text-gray-400">
          {unplaced} transfer{unplaced === 1 ? '' : 's'} not shown, district not yet mapped
        </p>
      )}
    </div>
  );
}

AllocationMap.propTypes = {
  flows: PropTypes.arrayOf(PropTypes.shape({
    from_district: PropTypes.string,
    to_district: PropTypes.string,
    urgency_tier: PropTypes.string,
    units: PropTypes.number,
  })).isRequired,
};

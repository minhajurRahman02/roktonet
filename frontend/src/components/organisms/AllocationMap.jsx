import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';
import { loadDistrictGeo, makeProjector, projectFeatures, buildCentroids } from '../../utils/districtGeo';

// Where blood actually moved, drawn on the country.
//
// ============================ READ THIS FIRST ============================
// WHY THE NODES ARE STILL DIVISION-LEVEL EVEN WITH A REAL GEOJSON LOADED
//
// organizations.district holds one of 8 division names ("Dhaka",
// "Chittagong", ...), not a real district. migration_location.sql added
// the 64-district table (bd_thanas) and the thana columns, but deliberately
// did NOT reseed organizations.district down to that granularity -- it is
// flagged in that migration as a separate coordinated reseed, not done
// there. Confirmed live: `select distinct district from organizations`
// returns exactly 8 rows.
//
// So a flow's from_district/to_district will only ever be one of those 8
// names until that reseed happens, whatever precision the map underneath
// them has. This component draws the real district boundaries once the
// geo file is present -- genuinely more honest than the hand-drawn outline
// it replaces -- and uses real geometric centroids for the 8 division
// points instead of eyeballed ones. It does not invent district-level
// nodes the underlying data cannot back up.
//
// TO GO FULLY DISTRICT-LEVEL
//
// Reseed organizations.district (and request/allocation records that
// reference it) to real district names, coordinated with the team per
// Section 15's TRUNCATE norm. Nothing in this component would need to
// change afterward -- pointFor() already prefers an exact district match
// over the division fallback.
// =========================================================================

// The eight divisional capitals, in a normalised 0..1 box over the country.
// Used only until frontend/public/bd-districts.json loads successfully;
// once it does, these are replaced by centroids computed from the real
// file. Kept as the fallback so the map still renders something sensible
// if the file is missing, slow, or fails to parse.
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

// All 64 official districts mapped to their division, sourced from the
// same seed_bd_thanas.sql list bd_thanas is built from. A district whose
// name equals its division's ("Dhaka" district in Dhaka division, and
// likewise for Rajshahi, Khulna, Sylhet, Rangpur, Mymensingh, Chattogram)
// is intentionally listed too, so buildCentroids() folds it into the
// average along with every other district rather than needing a separate
// identity rule.
const DISTRICT_TO_DIVISION = {
  // Dhaka
  Dhaka: 'Dhaka', Faridpur: 'Dhaka', Gazipur: 'Dhaka', Gopalganj: 'Dhaka',
  Kishoreganj: 'Dhaka', Madaripur: 'Dhaka', Manikganj: 'Dhaka', Munshiganj: 'Dhaka',
  Narayanganj: 'Dhaka', Narsingdi: 'Dhaka', Rajbari: 'Dhaka', Shariatpur: 'Dhaka',
  Tangail: 'Dhaka',
  // Chattogram
  Chattogram: 'Chattogram', Bandarban: 'Chattogram', Brahmanbaria: 'Chattogram',
  Chandpur: 'Chattogram', Comilla: 'Chattogram', Cumilla: 'Chattogram',
  Coxsbazar: 'Chattogram', "Cox's Bazar": 'Chattogram', Feni: 'Chattogram',
  Khagrachhari: 'Chattogram', Lakshmipur: 'Chattogram', Noakhali: 'Chattogram',
  Rangamati: 'Chattogram',
  // Rajshahi
  Rajshahi: 'Rajshahi', Bogra: 'Rajshahi', Bogura: 'Rajshahi', Chapainawabganj: 'Rajshahi',
  Joypurhat: 'Rajshahi', Naogaon: 'Rajshahi', Natore: 'Rajshahi', Pabna: 'Rajshahi',
  Sirajganj: 'Rajshahi',
  // Khulna
  Khulna: 'Khulna', Bagerhat: 'Khulna', Chuadanga: 'Khulna', Jessore: 'Khulna',
  Jashore: 'Khulna', Jhenaidah: 'Khulna', Kushtia: 'Khulna', Magura: 'Khulna',
  Meherpur: 'Khulna', Narail: 'Khulna', Satkhira: 'Khulna',
  // Barishal (division name spelled with 'h'; the district itself is "Barisal")
  Barisal: 'Barishal', Barguna: 'Barishal', Bhola: 'Barishal',
  Jhalakathi: 'Barishal', Jhalokati: 'Barishal', Patuakhali: 'Barishal', Pirojpur: 'Barishal',
  // Sylhet
  Sylhet: 'Sylhet', Habiganj: 'Sylhet', Moulvibazar: 'Sylhet', Sunamganj: 'Sylhet',
  // Rangpur
  Rangpur: 'Rangpur', Dinajpur: 'Rangpur', Gaibandha: 'Rangpur', Kurigram: 'Rangpur',
  Lalmonirhat: 'Rangpur', Nilphamari: 'Rangpur', Panchagarh: 'Rangpur', Thakurgaon: 'Rangpur',
  // Mymensingh
  Mymensingh: 'Mymensingh', Jamalpur: 'Mymensingh', Netrokona: 'Mymensingh', Sherpur: 'Mymensingh',
};

const VB = { w: 420, h: 480 };

// The hand-drawn placeholder outline. Deliberately simple: a wrong-but-
// detailed coastline would look like a real map and invite the reader to
// trust it more than a rough approximation deserves. Used only as long as
// the real geo file has not loaded.
const PLACEHOLDER_OUTLINE = 'M150,40 L205,34 L238,52 L262,44 L286,62 L300,96 L288,126 L300,150 L292,182 '
  + 'L312,196 L322,232 L300,258 L308,288 L286,316 L300,352 L286,392 L262,420 '
  + 'L236,406 L210,420 L186,404 L160,414 L140,390 L150,356 L130,330 L142,300 '
  + 'L120,272 L132,240 L112,210 L126,178 L108,148 L124,116 L112,86 L134,62 Z';

const URGENCY_STROKE = {
  critical: '#A9382F', urgent: '#B8811F', routine: '#5B7A8C', elective: '#6B9080', restock: '#5B7A8C',
};

/**
 * Loads and projects the district geo once, independent of any particular
 * set of flows. Returns null (not an error state) until it either finishes
 * or gives up, so the map can render immediately off DIVISION_POINTS and
 * upgrade in place if the file shows up.
 */
function useDistrictGeo() {
  const [geo, setGeo] = useState(null); // { paths, divisionPoints } | null

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await loadDistrictGeo();
      if (!raw || cancelled) return;

      const project = makeProjector(raw.bbox, raw.meanLat, VB.w, VB.h);
      const paths = projectFeatures(raw, project);
      const { divisionCentroids } = buildCentroids(raw, project, DISTRICT_TO_DIVISION);

      // Need every one of the 8 divisions represented, or a flow could
      // point at a division the file's district set didn't produce a
      // centroid for. Falls back to the hand-placed point for any that are
      // missing rather than dropping the whole upgrade over one gap.
      const complete = Object.keys(DIVISION_POINTS).every((d) => divisionCentroids[d]);
      if (!complete) return;

      if (!cancelled) setGeo({ paths, divisionPoints: divisionCentroids });
    })();
    return () => { cancelled = true; };
  }, []);

  return geo;
}

export default function AllocationMap({ flows }) {
  const geo = useDistrictGeo();
  const divisionPoints = geo?.divisionPoints || DIVISION_POINTS;

  function pointFor(district) {
    const division = DISTRICT_TO_DIVISION[district] || district;
    const p = divisionPoints[division];
    if (!p) return null;
    // The hand-placed fallback is normalised 0..1; real centroids from
    // buildCentroids() already come back in VB units.
    return geo ? p : { x: p.x * VB.w, y: p.y * VB.h };
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flows, geo]);

  return (
    <div className="relative bg-paper dark:bg-paper-dark">
      {/* Two different honest labels rather than one that disappears once
          a file exists. Precision changed; the nodes' real granularity did
          not, and organizations.district is why -- see the header comment. */}
      <div className="absolute top-3 left-3 z-10 mono text-[10px] px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50">
        {geo ? 'DIVISION-LEVEL ALLOCATION DATA' : 'PLACEHOLDER GEOMETRY'}
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

        {geo ? (
          geo.paths.map((p) => (
            <path key={p.district} d={p.d} fill="#1C4A3D" fillOpacity="0.06" stroke="#1C4A3D" strokeOpacity="0.22" strokeWidth="0.8" />
          ))
        ) : (
          <path d={PLACEHOLDER_OUTLINE} fill="#1C4A3D" fillOpacity="0.07" stroke="#1C4A3D" strokeOpacity="0.3" strokeWidth="1.5" />
        )}

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

import { useId, useMemo } from 'react';
import PropTypes from 'prop-types';

// Hand-rolled SVG, not Chart.js, and the reason is the district grid: 64
// Chart.js canvas instances on one page to draw what is a 52-point polyline
// each would cost far more than the chart library earns back. The big curve on
// the explorer IS Chart.js, matching the admin analytics page, so the project
// still has exactly one charting library.
//
// The same component serves the 40px strip thumbnail, the 120px card curve and
// the 64 grid sparklines, because they are the same picture at three sizes.

/**
 * @param {{weeks: Array<{week:number, admissions:number, lower?:number, upper?:number}>,
 *          markerWeek?: number, width?: number, height?: number, band?: boolean,
 *          muted?: boolean, draw?: boolean, strokeWidth?: number}} props
 */
export default function MicroCurve({
  weeks,
  markerWeek,
  width = 120,
  height = 34,
  band = false,
  muted = false,
  draw = false,
  strokeWidth = 1.6,
}) {
  const uid = useId().replace(/:/g, '');

  const geom = useMemo(() => {
    if (!weeks?.length) return null;
    const pad = strokeWidth + 0.5;
    const xs = weeks.length - 1 || 1;
    // Scaled against the band's ceiling when the band is drawn, so the fill
    // never clips at the top of the viewbox.
    const ceiling = Math.max(
      ...weeks.map((w) => (band && w.upper != null ? w.upper : w.admissions)),
      1,
    );
    const x = (i) => pad + (i / xs) * (width - pad * 2);
    const y = (v) => height - pad - (Math.max(0, v) / ceiling) * (height - pad * 2);

    const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(w.admissions).toFixed(2)}`).join(' ');

    let area = null;
    if (band && weeks[0].upper != null) {
      const up = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(w.upper).toFixed(2)}`).join(' ');
      const down = [...weeks]
        .reverse()
        .map((w, i) => `L${x(weeks.length - 1 - i).toFixed(2)} ${y(w.lower ?? 0).toFixed(2)}`)
        .join(' ');
      area = `${up} ${down} Z`;
    }

    const fill = `${line} L${x(weeks.length - 1).toFixed(2)} ${height - pad} L${x(0).toFixed(2)} ${height - pad} Z`;

    const mi = markerWeek != null ? weeks.findIndex((w) => w.week === markerWeek) : -1;
    const marker = mi >= 0 ? { x: x(mi), y: y(weeks[mi].admissions) } : null;

    return { line, area, fill, marker, pad };
  }, [weeks, markerWeek, width, height, band, strokeWidth]);

  if (!geom) return null;

  const stroke = muted ? '#6455A8' : '#8474CE';
  // Seasonal mode is visibly quieter than live, per the spec's mode table: the
  // reader should sense which estimator produced this before reading a word.
  const fillOpacity = muted ? 0.15 : 0.35;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {geom.area && <path d={geom.area} fill="#6455A8" fillOpacity="0.22" />}
      <path d={geom.fill} fill={`url(#${uid}-f)`} />
      <path
        d={geom.line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...(draw
          ? {
              // pathLength normalises the dash maths, so one value works at
              // every size instead of measuring the real path length per
              // instance.
              pathLength: 1,
              strokeDasharray: 1,
              strokeDashoffset: 1,
              className: 'rk-draw',
            }
          : {})}
      />
      {geom.marker && (
        <>
          <line
            x1={geom.marker.x}
            y1={geom.pad - 1}
            x2={geom.marker.x}
            y2={height - geom.pad}
            stroke="#C4B8F5"
            strokeWidth="1"
            strokeOpacity="0.45"
          />
          <circle cx={geom.marker.x} cy={geom.marker.y} r={strokeWidth * 1.7} fill="#C4B8F5" />
        </>
      )}
    </svg>
  );
}

MicroCurve.propTypes = {
  weeks: PropTypes.arrayOf(
    PropTypes.shape({
      week: PropTypes.number.isRequired,
      admissions: PropTypes.number.isRequired,
      lower: PropTypes.number,
      upper: PropTypes.number,
    }),
  ),
  markerWeek: PropTypes.number,
  width: PropTypes.number,
  height: PropTypes.number,
  band: PropTypes.bool,
  muted: PropTypes.bool,
  draw: PropTypes.bool,
  strokeWidth: PropTypes.number,
};

import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { seasonalGrid } from '../../api/roktim';
import { toAppName } from '../districts';
import MicroCurve from '../MicroCurve';
import { isoWeek } from '../copy';
import { Card, Skeleton, DataTable } from './primitives';

// Section 4: all 64 districts as small multiples.
//
// Small multiples rather than one chart with 64 series, because 64 lines on
// one axis is a hairball and there is no colour scheme that separates 64
// categories. Here every district gets its own identical axis, so the only
// thing that varies between cells is the shape, which is exactly the
// comparison worth making: how differently the dengue year runs across the
// country.
//
// HAND-ROLLED SVG, NOT CHART.JS
// -----------------------------
// 64 canvas instances to draw what is a 52-point polyline each would cost far
// more than the library earns back at this size. The explorer above IS
// Chart.js, so the project still has one charting library and this is one
// component drawing 64 polylines.
//
// The cells are sorted by annual total, descending, so the districts that
// carry the national signal are the ones visible in the preview row rather
// than whichever happen to come first alphabetically.

function Cell({ row, todayWeek, onSelect, selected }) {
  const weeks = useMemo(
    () => row.weeks.map((v, i) => ({ week: i + 1, admissions: v })),
    [row.weeks],
  );

  return (
    <motion.button
      onClick={() => onSelect?.(row.unit)}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18 }}
      className={`text-left p-3 rounded-xl border transition-colors ${
        selected
          ? 'border-roktim-mark bg-roktim-brand/15'
          : 'border-roktim-hairline bg-roktim-surface/70 hover:bg-roktim-raised hover:border-roktim-brand/60'
      }`}
      title={`${toAppName(row.unit)} · peaks week ${row.peak_week} · ${Math.round(row.peak).toLocaleString('en-GB')} admissions at peak`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[12.5px] text-roktim-ink truncate">{toAppName(row.unit)}</span>
        <span className="font-mono text-[9.5px] text-roktim-dim shrink-0">w{row.peak_week}</span>
      </div>
      <MicroCurve weeks={weeks} markerWeek={todayWeek} width={132} height={34} muted />
      <p className="font-mono text-[9.5px] text-roktim-dim mt-1">
        peak {Math.round(row.peak).toLocaleString('en-GB')}
      </p>
    </motion.button>
  );
}
Cell.propTypes = {
  row: PropTypes.object.isRequired,
  todayWeek: PropTypes.number,
  onSelect: PropTypes.func,
  selected: PropTypes.bool,
};

/**
 * @param {{limit?: number, onSelect?: Function, selected?: string,
 *          showTable?: boolean}} props
 *   `limit` renders a preview row on the main page; the dedicated districts
 *   page passes nothing and gets all 64.
 */
export default function DistrictGrid({ limit, onSelect, selected, showTable = false }) {
  const [grid, setGrid] = useState(null);
  const [query, setQuery] = useState('');
  const todayWeek = isoWeek(new Date());

  useEffect(() => {
    let live = true;
    seasonalGrid('district').then((g) => live && setGrid(g));
    return () => {
      live = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (!grid) return [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? grid.units.filter((u) => toAppName(u.unit).toLowerCase().includes(q))
      : grid.units;
    return limit ? filtered.slice(0, limit) : filtered;
  }, [grid, query, limit]);

  if (!grid) return <Skeleton height={limit ? 140 : 420} />;

  return (
    <div className="space-y-3">
      {!limit && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter districts"
          aria-label="Filter districts"
          className="bg-roktim-surface border border-roktim-hairline rounded-lg px-3 py-2
                     text-[13.5px] text-roktim-ink w-full sm:w-[260px] placeholder:text-roktim-dim
                     focus:outline-none focus:border-roktim-mark transition-colors"
        />
      )}

      <div
        className={`grid gap-2.5 ${
          limit
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
        }`}
      >
        {rows.map((row) => (
          <Cell
            key={row.unit}
            row={row}
            todayWeek={todayWeek}
            onSelect={onSelect}
            selected={selected === row.unit}
          />
        ))}
      </div>

      {rows.length === 0 && (
        <p className="text-[13px] text-roktim-muted py-6 text-center">
          No district matches that.
        </p>
      )}

      {showTable && (
        <Card className="p-4 mt-4">
          <p className="text-[13px] font-medium text-roktim-ink mb-3">
            The same 64 districts as numbers
          </p>
          <div className="max-h-[420px] overflow-auto">
            <DataTable
              columns={[
                { key: 'unit', label: 'District' },
                { key: 'tier', label: 'Tier' },
                { key: 'peakWeek', label: 'Peak week', align: 'right' },
                { key: 'peak', label: 'Peak admissions', align: 'right' },
                { key: 'median', label: 'Median week', align: 'right' },
                { key: 'total', label: 'Annual total', align: 'right' },
              ]}
              rows={rows.map((r) => ({
                key: r.unit,
                unit: toAppName(r.unit),
                tier: r.tier,
                peakWeek: r.peak_week,
                peak: Math.round(r.peak).toLocaleString('en-GB'),
                median: Math.round(r.median).toLocaleString('en-GB'),
                total: Math.round(r.annual_total).toLocaleString('en-GB'),
              }))}
            />
          </div>
        </Card>
      )}

      <p className="text-[12px] text-roktim-muted leading-relaxed max-w-[86ch]">
        Every cell shares the same 52-week axis but is scaled to its own maximum, so the
        shapes are comparable and the heights are not. Dhaka alone is roughly seven times
        the next district by annual total, and on a shared scale the other 63 would be flat
        lines.
      </p>
    </div>
  );
}

DistrictGrid.propTypes = {
  limit: PropTypes.number,
  onSelect: PropTypes.func,
  selected: PropTypes.string,
  showTable: PropTypes.bool,
};

import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Line } from 'react-chartjs-2';
import { seasonalCurve } from '../../api/roktim';
import { toAppName } from '../districts';
import { isoWeek, seasonalPosition, bagBand, BAND_LABEL, spanYears } from '../copy';
import { ChartFrame, DataTable, Card, Skeleton, StatTile } from './primitives';
import { RK, lineOptions, weekLabel } from './roktimChart';

// Section 2 of the page: one district's whole dengue year, with the calibrated
// band around it and a date the reader chooses marked on it.
//
// This is the section that makes the rest of the module legible. Every
// seasonal-mode advisory anywhere in RoktoNet is one point on one of these
// curves, and seeing the shape is the difference between "the system said
// peak season" and understanding why.
//
// ON THE BAND, WHICH IS THE HONEST PART AND ALSO THE AWKWARD PART
// ---------------------------------------------------------------
// Residuals are pooled across the whole year and calibrated per volume tier,
// not per week, so the band has the SAME WIDTH in January as in September.
// Coverage is therefore right on average and wrong in both directions
// seasonally: too tight at the peak, where it matters most, and too wide off
// season. That is stated under the chart rather than left for someone to
// notice, because a band that looks narrow at the crest is exactly the kind of
// thing a reader would otherwise take as precision.

export default function CurveExplorer({ districts, selected, onSelect, targetDate, onTargetDate }) {
  const [curve, setCurve] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    seasonalCurve({ unit: selected, grain: 'district' }).then((c) => {
      if (!live) return;
      setCurve(c);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [selected]);

  const target = targetDate ? new Date(`${targetDate}T00:00:00`) : null;
  const targetWeek = target && !Number.isNaN(target.getTime()) ? isoWeek(target) : null;
  const todayWeek = isoWeek(new Date());
  const position = curve && target ? seasonalPosition(curve, target) : null;

  const data = useMemo(() => {
    if (!curve) return null;
    const labels = curve.weeks.map((w) => weekLabel(w.week));
    return {
      labels,
      datasets: [
        // Band first so it sits behind the line. Two datasets with `fill` set
        // to the index of the other is how Chart.js draws a range; the upper
        // edge is invisible and only the fill between them reads.
        {
          label: 'Upper 80%',
          data: curve.weeks.map((w) => w.upper),
          borderColor: 'transparent',
          pointRadius: 0,
          fill: '+1',
          backgroundColor: RK.band,
          tension: 0.35,
          order: 3,
        },
        {
          label: 'Lower 80%',
          data: curve.weeks.map((w) => w.lower),
          borderColor: 'transparent',
          pointRadius: 0,
          fill: false,
          tension: 0.35,
          order: 3,
        },
        {
          label: 'Typical admissions',
          data: curve.weeks.map((w) => w.admissions),
          borderColor: RK.mark,
          borderWidth: 2,
          pointRadius: 0,
          // Only the two marked weeks get a dot. A number, or a point, on
          // every one of 52 weeks is chaos and goes unread.
          pointHoverRadius: 4,
          pointHoverBackgroundColor: RK.hi,
          fill: true,
          backgroundColor: (ctx) => {
            const { ctx: c, chartArea } = ctx.chart;
            if (!chartArea) return 'transparent';
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, 'rgba(132,116,206,0.30)');
            g.addColorStop(1, 'rgba(132,116,206,0)');
            return g;
          },
          tension: 0.35,
          order: 1,
        },
      ],
    };
  }, [curve]);

  // Vertical rules for today and the chosen date, drawn as a tiny plugin
  // rather than a dataset so they cannot be picked up by the tooltip or
  // shift the y-scale.
  const markerPlugin = useMemo(
    () => ({
      id: 'rk-markers',
      afterDatasetsDraw(chart) {
        if (!curve) return;
        const { ctx, chartArea, scales } = chart;
        const rules = [
          { week: todayWeek, color: RK.dim, label: 'today' },
          ...(targetWeek ? [{ week: targetWeek, color: RK.marker, label: 'needed by' }] : []),
        ];
        rules.forEach(({ week, color, label }) => {
          const i = curve.weeks.findIndex((w) => w.week === week);
          if (i < 0) return;
          const x = scales.x.getPixelForValue(i);
          ctx.save();
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = color;
          ctx.font = '10px "IBM Plex Mono", monospace';
          ctx.textAlign = x > chartArea.right - 60 ? 'right' : 'left';
          ctx.fillText(label, x + (x > chartArea.right - 60 ? -4 : 4), chartArea.top + 10);
          ctx.restore();
        });
      },
    }),
    [curve, todayWeek, targetWeek],
  );

  if (loading) return <Skeleton height={380} />;
  if (!curve) return null;

  const tw = targetWeek ? curve.weeks.find((w) => w.week === targetWeek) : null;
  const unitCoverage = curve.interval.measured_coverage_unit;
  // Below 0.70 against an 0.80 claim, the band is not doing the job it says it
  // is for this district, and a reader looking at a narrow ribbon on a steep
  // curve deserves to be told rather than left to assume precision.
  const coverageShort = unitCoverage?.quotable && unitCoverage.coverage < 0.7;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-roktim-dim mb-1.5">
            District
          </span>
          <select
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
            className="bg-roktim-surface border border-roktim-hairline rounded-lg px-3 py-2
                       text-[13.5px] text-roktim-ink min-w-[190px] focus:outline-none
                       focus:border-roktim-mark transition-colors"
          >
            {districts.map((d) => (
              <option key={d.unit} value={d.unit}>
                {toAppName(d.unit)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-roktim-dim mb-1.5">
            Needed by
          </span>
          <input
            type="date"
            value={targetDate || ''}
            onChange={(e) => onTargetDate(e.target.value)}
            className="bg-roktim-surface border border-roktim-hairline rounded-lg px-3 py-2
                       text-[13.5px] text-roktim-ink focus:outline-none
                       focus:border-roktim-mark transition-colors [color-scheme:dark]"
          />
        </label>

        {position && (
          <span className="mb-1.5 font-mono text-[10px] tracking-[0.1em] uppercase px-2 py-1.5 rounded border border-roktim-brand/50 text-roktim-hi bg-roktim-brand/15">
            {BAND_LABEL[position.band]} · rank {position.rank} of 52
          </span>
        )}
      </div>

      <ChartFrame
        title={`${toAppName(curve.unit)} · typical dengue admissions by week`}
        note={`Seasonal history, ${spanYears(curve.data_span)}. Shaded band is the calibrated 80% interval. Volume tier: ${curve.tier}.`}
        height={340}
        table={
          <DataTable
            columns={[
              { key: 'w', label: 'Week' },
              { key: 'date', label: 'Starts' },
              { key: 'adm', label: 'Admissions', align: 'right' },
              { key: 'lo', label: 'Lower 80%', align: 'right' },
              { key: 'hi', label: 'Upper 80%', align: 'right' },
              { key: 'bags', label: 'Blood demand', align: 'right' },
            ]}
            rows={curve.weeks.map((w) => ({
              key: w.week,
              w: w.week,
              date: weekLabel(w.week),
              adm: Math.round(w.admissions).toLocaleString('en-GB'),
              lo: Math.round(w.lower).toLocaleString('en-GB'),
              hi: Math.round(w.upper).toLocaleString('en-GB'),
              bags: bagBand(w.bags),
            }))}
          />
        }
      >
        {data && <Line data={data} options={lineOptions()} plugins={[markerPlugin]} />}
      </ChartFrame>

      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-roktim-hairline">
          <StatTile
            value={`Week ${curve.peak_week}`}
            label="Busiest week here"
            sub={`${Math.round(curve.peak_admissions).toLocaleString('en-GB')} admissions`}
          />
          <StatTile
            value={Math.round(curve.annual_median).toLocaleString('en-GB')}
            label="Median week"
            sub="admissions"
          />
          <StatTile
            value={tw ? Math.round(tw.admissions).toLocaleString('en-GB') : '·'}
            label="Typical on your date"
            sub={tw ? bagBand(tw.bags) : 'pick a date'}
          />
          {/* The DISTRICT's own coverage, not the tier average. Quoting the
              tier figure next to one district's curve is true about the tier
              and false about the district: the same bounds cover 80.0% of the
              high tier overall and 41.1% of Dhaka. */}
          <StatTile
            value={
              unitCoverage?.quotable
                ? `${(unitCoverage.coverage * 100).toFixed(1)}%`
                : `${(curve.interval.measured_coverage_tier * 100).toFixed(1)}%`
            }
            label={unitCoverage?.quotable ? 'Coverage here' : 'Coverage, tier average'}
            sub={
              unitCoverage?.quotable
                ? `claim 80% · tier average ${(curve.interval.measured_coverage_tier * 100).toFixed(0)}%`
                : 'against an 80% claim'
            }
          />
        </div>
      </Card>

      {coverageShort && (
        <div className="rounded-xl border border-roktim-brand/45 bg-roktim-brand/[0.12] p-4">
          <p className="text-[13px] text-roktim-ink leading-relaxed">
            The band is too narrow for {toAppName(curve.unit)}. It is calibrated across every
            district in the {curve.tier} tier at once, and that tier holds districts whose
            weekly admissions differ by orders of magnitude, so one fixed width of{' '}
            {Math.round(curve.interval.residual_bounds.hi - curve.interval.residual_bounds.lo)}{' '}
            admissions has to serve all of them.
          </p>
          <p className="text-[12.5px] text-roktim-muted leading-relaxed mt-2">
            Measured against held-out weeks, it contains the true value{' '}
            {(unitCoverage.coverage * 100).toFixed(1)}% of the time here, against the 80% it
            claims. Read the centre line as the seasonal shape, which is what this chart is
            for, and treat the ribbon as optimistic. Fixing it means recalibrating on
            proportional rather than additive residuals, which is stage 6F work.
          </p>
        </div>
      )}

      <p className="text-[12px] text-roktim-muted leading-relaxed max-w-[86ch]">
        The band is the same width all year and the same width for every district in the tier.
        Residuals were pooled across both, so tier coverage is right on average while
        individual districts run from{' '}
        {unitCoverage?.quotable ? `${(unitCoverage.coverage * 100).toFixed(0)}% here` : 'well below'}{' '}
        to nearly 100% for the smallest. Accuracy on this path is the seasonal path&apos;s
        (MAE {curve.accuracy.walkforward_mae.toFixed(1)}), roughly 2.5 times worse than the
        observed path RoktoNet cannot currently use.
      </p>
    </div>
  );
}

CurveExplorer.propTypes = {
  districts: PropTypes.array.isRequired,
  selected: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  targetDate: PropTypes.string,
  onTargetDate: PropTypes.func.isRequired,
};

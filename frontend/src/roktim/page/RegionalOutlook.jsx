import { useState, useEffect, useMemo } from 'react';
import { Bar, Radar } from 'react-chartjs-2';
import { regionalDemand } from '../../api/roktim';
import { toAppName } from '../districts';
import { bagBand } from '../copy';
import { ChartFrame, DataTable, Skeleton } from './primitives';
import { RK, barOptions, radarOptions, rampFor } from './roktimChart';

// Section 3: expected demand across the eight divisions, two weeks out.
//
// WHY ONE HUE AND NOT EIGHT
// -------------------------
// The job this chart does is magnitude, not identity. Eight categorical hues
// on a dark surface would be at the limit of colour-vision-deficient
// separability, and they would encode nothing the bar length does not already
// show. So the bars share one hue and take their position on the sequential
// ramp from their own value: reinforcement of the length, never the only
// channel carrying it.
//
// THE RADAR, AND WHY IT IS A SECOND VIEW RATHER THAN THE VIEW
// -----------------------------------------------------------
// A radar makes eight values into one shape, which is genuinely useful here:
// it shows at a glance how lopsided the country is, with Dhaka dominating and
// the rest clustered near the middle. What it does badly is let you compare
// two similar divisions, because area grows as the square of the radius and
// the eye reads area. So the bar chart is the default and answers "how much",
// and the radar is the alternate view and answers "what shape". Both are on
// one axis, both are one series, and the table view carries the exact numbers
// for either.
//
// No 3D. Perspective distorts magnitude and occludes marks, and for a module
// whose whole claim is calibrated honesty, a chart that misrepresents
// magnitude would undercut the argument it exists to make.

export default function RegionalOutlook() {
  const [data, setData] = useState(null);
  const [view, setView] = useState('bar');

  useEffect(() => {
    let live = true;
    regionalDemand({ horizon: 2, grain: 'division' }).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);

  const rows = data?.units || [];
  const max = useMemo(
    () => Math.max(...rows.map((r) => r.admissions.point), 1),
    [rows],
  );

  const barData = useMemo(
    () => ({
      labels: rows.map((r) => toAppName(r.unit)),
      datasets: [
        {
          label: 'Expected admissions',
          data: rows.map((r) => r.admissions.point),
          backgroundColor: rows.map((r) => rampFor(r.admissions.point, max)),
          borderWidth: 0,
          borderRadius: 3,
          barThickness: 18,
        },
      ],
    }),
    [rows, max],
  );

  const radarData = useMemo(
    () => ({
      labels: rows.map((r) => toAppName(r.unit)),
      datasets: [
        {
          label: 'Expected admissions',
          data: rows.map((r) => r.admissions.point),
          borderColor: RK.mark,
          borderWidth: 2,
          backgroundColor: 'rgba(132,116,206,0.18)',
          pointBackgroundColor: RK.hi,
          pointBorderColor: RK.surface,
          pointBorderWidth: 2,
          pointRadius: 3,
        },
      ],
    }),
    [rows],
  );

  if (!data) return <Skeleton height={340} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-roktim-hairline w-fit">
        {[
          ['bar', 'Magnitude'],
          ['radar', 'Shape'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`px-3 py-1.5 rounded-md text-[12px] transition-colors ${
              view === key ? 'bg-roktim-brand/35 text-roktim-ink' : 'text-roktim-muted hover:text-roktim-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ChartFrame
        title={`Expected dengue admissions by division, ${data.horizon_weeks} weeks out`}
        note={
          view === 'bar'
            ? `Seasonal expectation as of ${data.as_of}, sorted. Bar length carries the value; colour reinforces it.`
            : `The same eight values as one shape. Good for seeing how lopsided the country is, poor for comparing two similar divisions, because the eye reads area.`
        }
        height={view === 'bar' ? 300 : 340}
        table={
          <DataTable
            columns={[
              { key: 'unit', label: 'Division' },
              { key: 'tier', label: 'Tier' },
              { key: 'point', label: 'Expected', align: 'right' },
              { key: 'range', label: '80% interval', align: 'right' },
              { key: 'bags', label: 'Blood demand', align: 'right' },
            ]}
            rows={rows.map((r) => ({
              key: r.unit,
              unit: toAppName(r.unit),
              tier: r.tier,
              point: Math.round(r.admissions.point).toLocaleString('en-GB'),
              range: `${Math.round(r.admissions.lower).toLocaleString('en-GB')} to ${Math.round(r.admissions.upper).toLocaleString('en-GB')}`,
              bags: bagBand(r.bags.point),
            }))}
          />
        }
      >
        {view === 'bar' ? (
          <Bar data={barData} options={barOptions({ horizontal: true })} />
        ) : (
          <Radar data={radarData} options={radarOptions()} />
        )}
      </ChartFrame>

      <p className="text-[12px] text-roktim-muted leading-relaxed max-w-[86ch]">
        Every division here is on the seasonal path, because no live admissions feed is
        connected. This is what history expects for this point in the year, not a reading of
        what is happening now, and it is materially less accurate than the observed path.
      </p>
    </div>
  );
}

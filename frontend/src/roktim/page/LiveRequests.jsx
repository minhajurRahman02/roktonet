import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { listRequests } from '../../api/requests';
import { seasonalGrid } from '../../api/roktim';
import { toModelName, toAppName } from '../districts';
import { isoWeek, parseDate, formatShort, BAND_LABEL } from '../copy';
import MicroCurve from '../MicroCurve';
import { Card, Skeleton } from './primitives';

// Section 5: the elective requests currently in the system, each with where
// its needed-by date falls in its own district's dengue year.
//
// LABELLED A CURRENT ASSESSMENT, NOT HISTORY, AND THE DISTINCTION IS REAL
// -----------------------------------------------------------------------
// This is computed NOW, against the model as it stands now. The advisory log
// below is the opposite: what was actually said at the time, with the version
// of the artefact that said it. The two will disagree after any
// recalibration, and that is correct rather than a bug. Putting them next to
// each other without saying so would make one of them look wrong.
//
// COMPUTED FROM THE GRID, NOT BY CALLING THE SERVICE PER REQUEST
// ---------------------------------------------------------------
// The seasonal position of a date is a lookup in a profile this page has
// already downloaded. Asking the service once per request would be dozens of
// cross-origin calls to produce numbers already in memory.

const BAND_STYLE = {
  peak: 'border-[#8474CE]/55 text-[#C4B8F5] bg-[#8474CE]/15',
  rising: 'border-[#6455A8]/45 text-[#A493E6] bg-[#6455A8]/15',
  typical: 'border-roktim-hairline text-roktim-muted bg-white/[0.03]',
};

function positionFromSeries(series, week) {
  if (!series?.length) return null;
  const value = series[week - 1];
  if (value == null) return null;
  const rank = series.filter((v) => v > value).length + 1;
  const ordered = [...series].sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)] || 0;
  return {
    band: rank <= 8 ? 'peak' : rank <= 20 ? 'rising' : 'typical',
    rank,
    value,
    ratio: median > 0 ? value / median : 0,
  };
}

export default function LiveRequests({ limit }) {
  const [requests, setRequests] = useState(null);
  const [grid, setGrid] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      // The list endpoint returns a bare array for admins and throws on
      // failure; Roktim must not take the page down if it does.
      listRequests({ urgency_tier: 'elective' }).catch(() => []),
      seasonalGrid('district'),
    ]).then(([r, g]) => {
      if (!live) return;
      setRequests(Array.isArray(r) ? r : r?.data || []);
      setGrid(g);
    });
    return () => {
      live = false;
    };
  }, []);

  const byUnit = useMemo(() => {
    const map = new Map();
    (grid?.units || []).forEach((u) => map.set(u.unit, u));
    return map;
  }, [grid]);

  const rows = useMemo(() => {
    if (!requests) return [];
    const out = requests
      .filter((r) => r.needed_by_date)
      .map((r) => {
        // `org_district` is what GET /api/requests aliases the requesting
        // organisation's district to; the fallback is only for safety if that
        // alias ever changes.
        const district = r.org_district || r.district;
        const unit = district ? byUnit.get(toModelName(district)) : null;
        const date = parseDate(String(r.needed_by_date).slice(0, 10));
        const week = date ? isoWeek(date) : null;
        return {
          ...r,
          district,
          unit,
          date,
          week,
          position: unit && week ? positionFromSeries(unit.weeks, week) : null,
        };
      })
      // Peak first: the whole point of the section is which scheduled
      // requests land in a busy window.
      .sort((a, b) => (a.position?.rank ?? 999) - (b.position?.rank ?? 999));
    return limit ? out.slice(0, limit) : out;
  }, [requests, byUnit, limit]);

  if (!requests || !grid) return <Skeleton height={220} />;

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-[14px] text-roktim-ink">No elective requests are open right now.</p>
        <p className="text-[12.5px] text-roktim-muted mt-1.5">
          Roktim only ever looks at scheduled requests, so there is nothing for it to read.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <Card key={r.request_id} className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-medium text-roktim-ink">
                  {r.blood_type} {String(r.component || '').replace('_', ' ')} · {r.quantity} unit
                  {r.quantity === 1 ? '' : 's'}
                </span>
                {r.position && (
                  <span
                    className={`font-mono text-[9.5px] tracking-[0.1em] uppercase border rounded px-1.5 py-[3px] ${BAND_STYLE[r.position.band]}`}
                  >
                    {BAND_LABEL[r.position.band]}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-roktim-muted mt-1">
                {r.org_name || 'Hospital'}
                {r.district ? ` · ${toAppName(r.district)}` : ''} · needed by{' '}
                {formatShort(r.date)}
                {r.position ? ` · week ${r.week} of 52, rank ${r.position.rank}` : ''}
              </p>
            </div>

            {r.unit && r.week && (
              <div className="shrink-0">
                <MicroCurve
                  weeks={r.unit.weeks.map((v, i) => ({ week: i + 1, admissions: v }))}
                  markerWeek={r.week}
                  width={116}
                  height={30}
                  muted
                />
              </div>
            )}
          </div>
        </Card>
      ))}

      <p className="text-[12px] text-roktim-muted leading-relaxed max-w-[86ch]">
        This is a current assessment, computed just now against the model as it stands. It is
        not what these hospitals were told at the time. That is in the advisory log below,
        stamped with the artefact version that produced it, and the two will differ after any
        recalibration.
      </p>
    </div>
  );
}

LiveRequests.propTypes = { limit: PropTypes.number };

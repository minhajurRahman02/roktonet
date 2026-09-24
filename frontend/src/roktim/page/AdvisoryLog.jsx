import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { listAdvisories } from '../../api/roktimLog';
import { toAppName } from '../districts';
import { OUTLOOK_LABEL } from '../copy';
import { Card, Skeleton, DataTable } from './primitives';

// Section 6: what Roktim actually said, when, and which artefact said it.
//
// WHY EVERY ROW CARRIES A MODEL VERSION
// -------------------------------------
// Without it, regenerating forecast_model.json would silently rewrite the
// meaning of the whole history: rows produced by the old calibration would
// read as though the new one had produced them. With it, a recalibration shows
// up as a change of version partway down this table, and an advisory from
// before it can be read against the artefact that actually existed.
//
// WHY basis IS A COLUMN AND NOT A FOOTNOTE
// ----------------------------------------
// In production every row says `seasonal_historical`, because no live
// admissions feed is connected. That is the module's central limitation, and a
// log that did not show it would let a reader assume these were live readings.
// When demand_outlook reads "Not available", it is because the pressure signal
// genuinely does not exist on that path, not because something failed.

const OUTLOOK_STYLE = {
  high: 'text-[#C4B8F5]',
  elevated: 'text-[#A493E6]',
  normal: 'text-roktim-muted',
  unavailable: 'text-roktim-dim',
};

const BASIS_LABEL = {
  seasonal_historical: 'Seasonal',
  observed_recent: 'Live',
};

const EMPTY_FILTERS = { district: '', basis: '', outlook: '', from: '', to: '' };

export default function AdvisoryLog({ limit, showFilters = false }) {
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    listAdvisories(showFilters ? filters : {})
      .then((r) => setRows(Array.isArray(r) ? r : r?.data || []))
      .catch(() => {
        // Unlike the forecast service, this is our own backend, so a failure
        // here is a genuine fault rather than a sleeping free-tier service.
        // It still must not take the page down.
        setRows([]);
        setFailed(true);
      });
  }, [filters, showFilters]);

  useEffect(load, [load]);

  if (!rows) return <Skeleton height={240} />;

  const shown = limit ? rows.slice(0, limit) : rows;

  const field =
    'bg-roktim-surface border border-roktim-hairline rounded-lg px-2.5 py-1.5 text-[12.5px] text-roktim-ink focus:outline-none focus:border-roktim-mark transition-colors [color-scheme:dark]';

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={filters.district}
            onChange={(e) => setFilters((f) => ({ ...f, district: e.target.value }))}
            placeholder="District (model spelling)"
            aria-label="Filter by district"
            className={`${field} w-[200px] placeholder:text-roktim-dim`}
          />
          <select
            value={filters.basis}
            onChange={(e) => setFilters((f) => ({ ...f, basis: e.target.value }))}
            aria-label="Filter by basis"
            className={field}
          >
            <option value="">Any basis</option>
            <option value="seasonal_historical">Seasonal</option>
            <option value="observed_recent">Live</option>
          </select>
          <select
            value={filters.outlook}
            onChange={(e) => setFilters((f) => ({ ...f, outlook: e.target.value }))}
            aria-label="Filter by outlook"
            className={field}
          >
            <option value="">Any outlook</option>
            {Object.entries(OUTLOOK_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            aria-label="From date"
            className={field}
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            aria-label="To date"
            className={field}
          />
          {Object.values(filters).some(Boolean) && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-[12.5px] text-roktim-mark hover:text-roktim-hi transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-[14px] text-roktim-ink">
            {failed ? 'The advisory log could not be read.' : 'No advisories recorded yet.'}
          </p>
          <p className="text-[12.5px] text-roktim-muted mt-1.5 max-w-[56ch] mx-auto leading-relaxed">
            {failed
              ? 'Roktim keeps working regardless; the log is audit material, not part of the advisory path.'
              : 'A row is written each time an elective request is submitted and Roktim has something to say about it.'}
          </p>
        </Card>
      ) : (
        <Card className="p-4">
          <div className={limit ? '' : 'max-h-[560px] overflow-auto'}>
            <DataTable
              columns={[
                { key: 'when', label: 'Logged' },
                { key: 'org', label: 'Organisation' },
                { key: 'district', label: 'District' },
                { key: 'needed', label: 'Needed by' },
                { key: 'horizon', label: 'Horizon', align: 'right' },
                { key: 'basis', label: 'Basis' },
                { key: 'outlook', label: 'Outlook' },
                { key: 'ratio', label: 'Pressure', align: 'right' },
                { key: 'model', label: 'Model' },
              ]}
              rows={shown.map((r) => ({
                key: r.id,
                when: new Date(r.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                org: r.org_name || '·',
                district: toAppName(r.district),
                needed: new Date(r.needed_by_date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                }),
                horizon: `${r.horizon_weeks}w`,
                basis: (
                  <span className="font-mono text-[10.5px] text-roktim-muted">
                    {BASIS_LABEL[r.basis] || r.basis}
                  </span>
                ),
                outlook: (
                  <span className={OUTLOOK_STYLE[r.demand_outlook] || ''}>
                    {OUTLOOK_LABEL[r.demand_outlook] || r.demand_outlook}
                  </span>
                ),
                // A dash, not 0: the pressure signal does not exist on the
                // seasonal path, and zero would read as "no pressure".
                ratio: r.pressure_ratio == null ? '·' : `${Number(r.pressure_ratio).toFixed(2)}x`,
                model: (
                  <span className="font-mono text-[10.5px] text-roktim-dim">
                    v{r.model_schema_version} · {r.model_generated?.slice(0, 10)}
                  </span>
                ),
              }))}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

AdvisoryLog.propTypes = { limit: PropTypes.number, showFilters: PropTypes.bool };

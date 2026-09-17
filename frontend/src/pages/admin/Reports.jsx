import { useState } from 'react';
import PropTypes from 'prop-types';
import PageHeader from '../../components/molecules/PageHeader';
import LoadingState from '../../components/molecules/LoadingState';
import ErrorState from '../../components/molecules/ErrorState';
import EmptyState from '../../components/molecules/EmptyState';
import Button from '../../components/atoms/Button';
import DateRangeFilter, { rangeToQuery, defaultRange } from '../../components/admin/DateRangeFilter';
import { Table, Th, Td } from '../../components/admin/Table';
import { useAsync } from '../../hooks/useAsync';
import { getReportCatalog, downloadReport } from '../../api/reports';
import { listAudit } from '../../api/admin';
import { relativeTime } from '../../utils/relativeTime';

const FORMATS = [['csv', 'CSV'], ['xlsx', 'XLSX'], ['pdf', 'PDF']];

function FormatPicker({ value, onChange, csvLabel = 'CSV' }) {
  return (
    <div className="flex gap-1">
      {FORMATS.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={`flex-1 text-center text-sm border rounded-lg py-2 dark:text-textprimary-dark ${value === k ? 'border-primary bg-elective-bg/40 dark:bg-elective-dbg/40 font-medium' : 'border-gray-300 dark:border-white/10'}`}>
          {k === 'csv' ? csvLabel : label}
        </button>
      ))}
    </div>
  );
}

function filename(dataset, format, range) {
  const f = range.allTime || !range.from ? 'all' : range.from;
  const t = range.allTime || !range.to ? new Date().toISOString().slice(0, 10) : range.to;
  const ext = format === 'csv' && dataset === 'snapshot' ? 'zip' : format;
  return `roktonet_${dataset}_${f}_to_${t}.${ext}`;
}

export default function AdminReports() {
  const catalog = useAsync(getReportCatalog, []);
  const recent = useAsync(() => listAudit({ action_type: 'report_generated', limit: 10 }), []);
  const [dataset, setDataset] = useState('requests');
  const [format, setFormat] = useState('csv');
  // Mockup change #2: "All time" is a first-class option next to the pickers.
  const [range, setRange] = useState({ ...defaultRange(90), allTime: false });
  const [snapFormat, setSnapFormat] = useState('xlsx');
  const [snapRange, setSnapRange] = useState({ ...defaultRange(365), allTime: true });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ ok: '', err: '' });

  const run = async (which, ds, fmt, rng) => {
    setBusy(which); setMsg({ ok: '', err: '' });
    try {
      const name = await downloadReport(ds, { format: fmt, ...rangeToQuery(rng) });
      setMsg({ ok: `Downloaded ${name}. Logged to audit.`, err: '' });
      recent.refresh();
    } catch (err) { setMsg({ ok: '', err: err.message }); } finally { setBusy(''); }
  };

  return (
    <div className="p-6">
      <PageHeader title="Reports" subtitle="Generate and download any dataset, or the whole system in one file." />
      {msg.ok && <div className="mb-4 text-sm rounded-lg px-4 py-3 bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext">{msg.ok}</div>}
      {msg.err && <div className="mb-4"><ErrorState message={msg.err} /></div>}

      {catalog.status === 'loading' && <LoadingState rows={5} />}
      {catalog.status === 'error' && <ErrorState message={catalog.error} onRetry={catalog.reload} />}
      {catalog.status === 'success' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 lg:col-span-2">
            <p className="text-sm font-medium mb-3 dark:text-textprimary-dark">Single dataset</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
              {catalog.data.datasets.map((d) => (
                <button key={d.key} type="button" onClick={() => setDataset(d.key)} title={d.columns.join(', ')} className={`text-sm border rounded-lg px-3 py-2 text-left dark:text-textprimary-dark ${dataset === d.key ? 'border-primary bg-elective-bg/40 dark:bg-elective-dbg/40 font-medium' : 'border-gray-300 dark:border-white/10'}`}>{d.title}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div><label className="text-xs text-gray-500">Format</label><div className="mt-1"><FormatPicker value={format} onChange={setFormat} /></div></div>
              <div className="sm:col-span-2"><label className="text-xs text-gray-500">Window</label><div className="mt-1"><DateRangeFilter value={range} onChange={setRange} /></div></div>
            </div>
            <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
              <p className="text-xs text-gray-400">Will download <span className="font-mono">{filename(dataset, format, range)}</span></p>
              <Button onClick={() => run('single', dataset, format, range)} loading={busy === 'single'}>Generate &amp; download</Button>
            </div>
          </div>

          <div className="bg-white dark:bg-surface-dark border border-primary/40 rounded-xl p-5">
            <p className="text-sm font-medium mb-1 dark:text-textprimary-dark">System snapshot</p>
            <p className="text-xs text-gray-400 mb-4">Everything, in one file. XLSX → one sheet per dataset ({catalog.data.snapshot.includes.length}). PDF → one section each with a summary page. CSV → a ZIP of {catalog.data.snapshot.includes.length} CSVs.</p>
            <div className="mb-3"><FormatPicker value={snapFormat} onChange={setSnapFormat} csvLabel="CSV (zip)" /></div>
            <div className="mb-4"><DateRangeFilter value={snapRange} onChange={setSnapRange} /></div>
            <Button className="w-full" onClick={() => run('snapshot', 'snapshot', snapFormat, snapRange)} loading={busy === 'snapshot'}>Generate snapshot</Button>
            <p className="text-xs text-gray-400 mt-2 font-mono">{filename('snapshot', snapFormat, snapRange)}</p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5">
        <p className="text-sm font-medium mb-3 dark:text-textprimary-dark">Recent downloads</p>
        {recent.status === 'loading' && <LoadingState rows={3} />}
        {recent.status === 'error' && <ErrorState message={recent.error} onRetry={recent.reload} />}
        {recent.status === 'success' && recent.data.length === 0 && <EmptyState message="No reports generated yet." />}
        {recent.status === 'success' && recent.data.length > 0 && (
          <Table className="!border-0">
            <thead><tr><Th>When</Th><Th>Report</Th><Th>Format</Th><Th>Window</Th><Th>Rows</Th><Th>By</Th></tr></thead>
            <tbody>
              {recent.data.map((a) => (
                <tr key={a.action_id}>
                  <Td muted>{relativeTime(a.created_at)}</Td>
                  <Td>{a.details?.report}</Td>
                  <Td><span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-textsecondary-dark">{a.details?.format}</span></Td>
                  <Td muted>{a.details?.from ? a.details.from.slice(0, 10) : 'all time'} → {a.details?.to ? a.details.to.slice(0, 10) : 'now'}</Td>
                  <Td>{a.details?.rows}</Td>
                  <Td>{a.admin_name || a.admin_email}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

FormatPicker.propTypes = { value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, csvLabel: PropTypes.string };

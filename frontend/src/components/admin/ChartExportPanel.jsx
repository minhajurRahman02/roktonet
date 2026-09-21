import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Download, X } from 'lucide-react';
import Button from '../atoms/Button';
import { exportCharts, discoverCharts, EXPORT_FORMATS } from '../../utils/chartExport';

/**
 * The export control panel for the Analytics page (bug 9).
 *
 * The chart list is derived from the DOM on every open rather than from a
 * hardcoded manifest. That is deliberate: a manifest would drift the first
 * time someone adds or renames a chart, and it would also have to model
 * "this section errored" and "this section is still loading" by hand. The
 * DOM already knows all of that, because a chart that has not rendered
 * simply is not there.
 *
 * `revision` is how the panel learns to re-probe: Analytics bumps it when
 * any of the five sections changes load state.
 */
export default function ChartExportPanel({ open, onClose, revision, rangeLabel, rangeText, onExported }) {
  const [charts, setCharts] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [format, setFormat] = useState('png');
  const [separate, setSeparate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });

  // Which chart ids this panel has already offered. Kept apart from
  // `selected` on purpose: if "seen" markers lived in the same Set, then
  // clicking None and having a slow section arrive a second later would
  // re-tick boxes the admin had just cleared.
  const seen = useRef(new Set());
  // Cleared explicitly means "I want none of these", and a late arrival
  // must not quietly undo that.
  const clearedAll = useRef(false);

  const probe = useCallback(() => {
    const found = [...discoverCharts().values()].map(({ id, title, section }) => ({ id, title, section }));
    setCharts(found);
    // A chart the panel has never shown before starts ticked, so an admin
    // who opens this while section 5 is still loading does not silently
    // export nine of ten.
    const fresh = found.filter((c) => !seen.current.has(c.id));
    for (const c of found) seen.current.add(c.id);
    if (fresh.length && !clearedAll.current) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const c of fresh) next.add(c.id);
        return next;
      });
    }
  }, []);

  useEffect(() => { if (open) probe(); }, [open, revision, probe]);

  const chosen = useMemo(() => charts.filter((c) => selected.has(c.id)).map((c) => c.id), [charts, selected]);

  // A PNG holds one picture, so "one combined file" is only meaningful for
  // PDF. For image formats with more than one chart selected, a zip is the
  // only possible answer and the checkbox is shown as forced rather than
  // quietly ignored.
  const zipForced = format !== 'pdf' && chosen.length > 1;
  const willZip = zipForced || (separate && chosen.length > 1);

  const grouped = useMemo(() => {
    const out = [];
    for (const c of charts) {
      const last = out[out.length - 1];
      if (last && last.section === c.section) last.items.push(c);
      else out.push({ section: c.section, items: [c] });
    }
    return out;
  }, [charts]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else { next.add(id); clearedAll.current = false; }
    return next;
  });

  const setAll = (on) => {
    clearedAll.current = !on;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of charts) { if (on) next.add(c.id); else next.delete(c.id); }
      return next;
    });
  };

  async function run() {
    setBusy(true);
    setMsg({ ok: '', err: '' });
    try {
      const { filename, count } = await exportCharts({
        chartIds: chosen, format, separate, rangeLabel, rangeText,
      });
      setMsg({ ok: `Downloaded ${filename} (${count} chart${count === 1 ? '' : 's'}).`, err: '' });
      // The audit ping is fired after the file is already in the user's
      // hands, and never blocks or fails the export -- a logging outage
      // must not cost someone their download.
      onExported?.({ count, format, filename });
    } catch (err) {
      setMsg({ ok: '', err: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="bg-white dark:bg-surface-dark border border-primary/40 rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-sm font-medium dark:text-textprimary-dark">Export charts</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Rendered in your browser from the charts on this page, using the window you have applied. Always exported on a white background so they read in a document.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close export panel" className="text-gray-400 hover:text-primary dark:hover:text-textprimary-dark shrink-0">
          <X size={18} />
        </button>
      </div>

      {msg.ok && <p className="mt-3 text-sm rounded-lg px-3 py-2 bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext">{msg.ok}</p>}
      {msg.err && <p className="mt-3 text-sm rounded-lg px-3 py-2 bg-red-50 dark:bg-critical-dbg text-red-600 dark:text-critical-dtext">{msg.err}</p>}

      {charts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-textsecondary-dark mt-4">
          No charts have finished loading yet. They will appear here as the sections come in.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mt-4 mb-2">
            <p className="text-xs text-gray-500 dark:text-textsecondary-dark">
              {chosen.length} of {charts.length} selected
            </p>
            <div className="flex gap-1">
              <button type="button" onClick={() => setAll(true)} className="text-xs text-primary dark:text-textprimary-dark underline">All</button>
              <span className="text-xs text-gray-300">/</span>
              <button type="button" onClick={() => setAll(false)} className="text-xs text-primary dark:text-textprimary-dark underline">None</button>
            </div>
          </div>

          <div className="border border-gray-200 dark:border-white/10 rounded-lg divide-y divide-gray-100 dark:divide-white/5 max-h-64 overflow-y-auto mb-4">
            {grouped.map((g) => (
              <div key={g.section || 'ungrouped'} className="p-2">
                {g.section && <p className="text-[11px] uppercase tracking-wide text-gray-400 px-1 pb-1">{g.section}</p>}
                {g.items.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm px-1 py-1.5 cursor-pointer select-none dark:text-textprimary-dark">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-primary" />
                    {c.title}
                  </label>
                ))}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div>
              <label className="text-xs text-gray-500 dark:text-textsecondary-dark">Format</label>
              <div className="flex gap-1 mt-1">
                {EXPORT_FORMATS.map(([k, label]) => (
                  <button
                    key={k} type="button" onClick={() => setFormat(k)}
                    className={`flex-1 text-center text-sm border rounded-lg py-2 dark:text-textprimary-dark ${format === k ? 'border-primary bg-elective-bg/40 dark:bg-elective-dbg/40 font-medium' : 'border-gray-300 dark:border-white/10'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 dark:text-textsecondary-dark">Packaging</label>
              <label className={`flex items-center gap-2 text-sm mt-2 select-none dark:text-textprimary-dark ${zipForced ? 'opacity-60' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={willZip}
                  disabled={zipForced || chosen.length < 2}
                  onChange={(e) => setSeparate(e.target.checked)}
                  className="accent-primary"
                />
                Separate (zipped) download
              </label>
              <p className="text-xs text-gray-400 mt-1">
                {chosen.length < 2
                  ? 'One chart selected, so it downloads as a single file.'
                  : zipForced
                    ? 'Image formats can only hold one chart each, so several charts always come as a zip. Choose PDF for one combined file.'
                    : willZip
                      ? 'One PDF per chart, in a zip.'
                      : 'One PDF, one chart per page, with a header on each.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <p className="text-xs text-gray-400">{rangeText}</p>
            <Button onClick={run} loading={busy} disabled={chosen.length === 0}>
              <Download size={16} />
              {chosen.length === 0 ? 'Select a chart' : `Download ${chosen.length} chart${chosen.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

ChartExportPanel.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  // A string, not a number: Analytics builds it by joining the five
  // section statuses, so it changes exactly when a section finishes
  // loading, errors, or is refetched after Apply.
  revision: PropTypes.string,
  rangeLabel: PropTypes.string.isRequired,
  rangeText: PropTypes.string.isRequired,
  onExported: PropTypes.func,
};

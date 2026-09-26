import { useState } from 'react';
import PropTypes from 'prop-types';
import Button from '../atoms/Button';
import Select from '../atoms/Select';

// A format picker and a download button, with the busy and error states
// a file download actually needs.
//
// WHY THIS IS A COMPONENT
//
// Downloading a file is slower and more failure-prone than it looks. The
// server builds a PDF or a spreadsheet before the first byte arrives, so
// a plain button appears to do nothing for a second or two and people
// click it again. And when it fails, it fails after the click with
// nothing on screen to say so, because the browser's download tray shows
// successes and stays silent about a 400.
//
// Both drive downloads need that handling, and so will the next one, so
// it lives here rather than twice inside a page.
//
// The formats deliberately read as what someone is going to do with the
// file, not as file extensions: "Excel" rather than "XLSX", because the
// person choosing is picking a program to open it in.

const FORMAT_LABELS = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'pdf', label: 'PDF' },
];

// Defaults in the parameter list rather than defaultProps, which React
// 19 ignores for function components. Without this, defaultFormat came
// through as undefined and the format <select> started uncontrolled.
export default function DownloadControl({
  label,
  onDownload,
  defaultFormat = 'xlsx',
  disabled = false,
  hint = '',
}) {
  const [format, setFormat] = useState(defaultFormat);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      await onDownload(format);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {/* Width lives on the wrapper: Select sets w-full itself, and
            two width utilities on one element resolve by stylesheet
            order rather than by intent. */}
        <div className="w-24 shrink-0">
          <Select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            disabled={disabled || busy}
            aria-label={`${label} format`}
          >
            {FORMAT_LABELS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          onClick={run}
          loading={busy}
          disabled={disabled || busy}
          className="shrink-0"
        >
          {busy ? 'Preparing…' : label}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-critical-text dark:text-critical-dtext max-w-xs text-right">{error}</p>
      )}
      {!error && hint && (
        <p className="text-xs text-gray-400 max-w-xs text-right">{hint}</p>
      )}
    </div>
  );
}

DownloadControl.propTypes = {
  label: PropTypes.string.isRequired,
  onDownload: PropTypes.func.isRequired,
  defaultFormat: PropTypes.oneOf(['csv', 'xlsx', 'pdf']),
  disabled: PropTypes.bool,
  hint: PropTypes.string,
};

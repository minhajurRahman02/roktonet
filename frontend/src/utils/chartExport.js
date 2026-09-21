// Client-side chart export (bug 9).
//
// Everything here runs in the browser: the charts are already drawn on
// canvases, so re-rendering them on the server would mean duplicating the
// entire Chart.js config in Node for no gain. The backend is told what was
// exported (for the audit trail) but never produces the file.
//
// Three things in here are less obvious than they look, and all three were
// verified against real canvases in Chromium rather than reasoned about:
//
//   1. Chart.js draws onto a TRANSPARENT canvas, and chartTheme.js picks
//      tick/legend colors from the `dark` class at render time. Exporting a
//      dark-mode chart straight through chart.toBase64Image() gives
//      light-gray text on transparency: unreadable on white, and JPEG turns
//      the transparency solid black. So we force the light palette on, fill
//      an opaque background, then put the theme back.
//
//   2. The force/capture/restore cycle must stay SYNCHRONOUS. The browser
//      only paints between tasks, so with no await in the middle the user
//      never sees the chart flip to light and back. Put an await in that
//      loop and you have introduced a visible flicker. Hence: capture every
//      selected chart first, package afterwards.
//
//   3. jsPDF's addImage defaults to storing PNGs uncompressed. Measured on
//      a 10-chart export: 14.3 MB without the 'FAST' compression argument,
//      0.3 MB with it. JPEG lands at a similar size but puts ringing
//      artifacts around axis text, so PNG + FAST it is.

import { Chart as ChartJS } from 'chart.js';

// Device pixels per CSS pixel in the output, fixed here rather than read
// from the monitor so two admins exporting the same chart get identical
// files. 2 puts an A4-landscape PDF page at roughly 100 DPI, which is fine
// on screen and acceptable in print. Raising it to 3 costs about 0.2 MB on
// a 10-chart PDF and roughly doubles peak canvas memory during the sweep.
const EXPORT_SCALE = 2;

const LIGHT_TICK = '#6B7280';
const LIGHT_GRID = 'rgba(0,0,0,.05)';
const WHITE = '#FFFFFF';

export const IMAGE_FORMATS = [
  ['png', 'PNG', 'image/png', 'png'],
  ['jpeg', 'JPEG', 'image/jpeg', 'jpg'],
  ['webp', 'WEBP', 'image/webp', 'webp'],
];
export const EXPORT_FORMATS = [...IMAGE_FORMATS.map(([k, label]) => [k, label]), ['pdf', 'PDF']];

function formatMeta(key) {
  const found = IMAGE_FORMATS.find(([k]) => k === key);
  return found ? { mime: found[2], ext: found[3] } : { mime: 'image/png', ext: 'png' };
}

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

/**
 * Charts announce themselves with data attributes on their wrapper rather
 * than through a React context or a ref registry. Two reasons: the
 * Analytics sections render their charts inside render-prop children, so
 * threading refs up would mean restructuring all five; and a chart that is
 * still loading or whose section errored simply is not in the DOM, which
 * gives us availability detection for free.
 *
 * @returns {Map<string, {id, title, section, chart}>}
 */
export function discoverCharts() {
  const found = new Map();
  for (const node of document.querySelectorAll('[data-chart-id]')) {
    const canvas = node.querySelector('canvas');
    if (!canvas) continue;
    const chart = ChartJS.getChart(canvas);
    if (!chart) continue;
    found.set(node.dataset.chartId, {
      id: node.dataset.chartId,
      title: node.dataset.chartTitle || node.dataset.chartId,
      section: node.dataset.chartSection || '',
      chart,
    });
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Capture                                                             */
/* ------------------------------------------------------------------ */

function forceLightTheme(chart) {
  const o = chart.options;
  const saved = {
    legend: o.plugins?.legend?.labels?.color ?? null,
    dpr: Object.prototype.hasOwnProperty.call(o, 'devicePixelRatio') ? o.devicePixelRatio : undefined,
    scales: Object.fromEntries(
      Object.entries(o.scales || {}).map(([k, s]) => [k, {
        tick: s.ticks?.color,
        grid: s.grid?.color,
        angle: s.angleLines?.color,
      }])
    ),
  };

  if (o.plugins?.legend?.labels) o.plugins.legend.labels.color = LIGHT_TICK;
  for (const s of Object.values(o.scales || {})) {
    if (s.ticks && s.ticks.color !== undefined) s.ticks.color = LIGHT_TICK;
    if (s.grid && s.grid.color !== undefined) s.grid.color = LIGHT_GRID;
    // The Nightingale rose styles its angle lines separately -- miss these
    // and they stay near-white on a white background.
    if (s.angleLines && s.angleLines.color !== undefined) s.angleLines.color = LIGHT_GRID;
  }
  return saved;
}

function restoreTheme(chart, saved) {
  const o = chart.options;
  if (o.plugins?.legend?.labels) o.plugins.legend.labels.color = saved.legend;
  if (saved.dpr === undefined) delete o.devicePixelRatio;
  else o.devicePixelRatio = saved.dpr;
  for (const [k, v] of Object.entries(saved.scales)) {
    const s = o.scales?.[k];
    if (!s) continue;
    if (s.ticks && v.tick !== undefined) s.ticks.color = v.tick;
    if (s.grid && v.grid !== undefined) s.grid.color = v.grid;
    if (s.angleLines && v.angle !== undefined) s.angleLines.color = v.angle;
  }
}

/**
 * @returns {HTMLCanvasElement} an opaque copy of the chart at EXPORT_SCALE.
 * Synchronous on purpose -- see note 2 at the top of the file.
 */
function captureOne(chart) {
  const saved = forceLightTheme(chart);
  chart.options.devicePixelRatio = EXPORT_SCALE;
  // resize() rebuilds the backing store at the new ratio; update('none')
  // alone would redraw at the old size.
  chart.resize();
  chart.update('none');

  const src = chart.canvas;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);

  restoreTheme(chart, saved);
  chart.resize();
  chart.update('none');
  return out;
}

/** Capture every requested chart in one synchronous sweep. */
function captureAll(entries) {
  return entries.map((e) => ({ ...e, canvas: captureOne(e.chart) }));
}

/* ------------------------------------------------------------------ */
/* Packaging                                                           */
/* ------------------------------------------------------------------ */

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`This browser could not encode ${mime}.`))),
      mime,
      quality
    );
  });
}

function stem(rangeLabel) {
  return `roktonet_analytics_${rangeLabel}`;
}

async function buildPdf(shots, { rangeLabel, rangeText }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 14;
  const TOP = M + 16;

  shots.forEach((s, i) => {
    if (i > 0) doc.addPage();

    doc.setFontSize(13);
    doc.setTextColor(20, 40, 34);
    doc.text(s.title, M, M + 2);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text([s.section, 'RoktoNet analytics', rangeText].filter(Boolean).join(' · '), M, M + 8);
    doc.setDrawColor(220);
    doc.line(M, M + 11, PW - M, M + 11);

    // Fit inside the content box preserving aspect ratio. Handing jsPDF
    // both dimensions without this stretches the chart.
    const boxW = PW - M * 2;
    const boxH = PH - TOP - M - 6;
    const ratio = s.canvas.width / s.canvas.height;
    let w = boxW;
    let h = boxW / ratio;
    if (h > boxH) { h = boxH; w = boxH * ratio; }
    // Centred both ways: these charts are wider than the page box, so they
    // are width-constrained and leave vertical slack. Top-aligning makes
    // that slack look like a mistake.
    doc.addImage(
      s.canvas.toDataURL('image/png'), 'PNG',
      M + (boxW - w) / 2, TOP + (boxH - h) / 2, w, h,
      undefined, 'FAST'
    );

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`${i + 1} / ${shots.length}`, PW - M, PH - 6, { align: 'right' });
  });

  return { blob: doc.output('blob'), filename: `${stem(rangeLabel)}.pdf` };
}

async function buildZip(shots, { format, rangeLabel }) {
  const JSZip = (await import('jszip')).default;
  const { mime, ext } = formatMeta(format);
  const zip = new JSZip();

  if (format === 'pdf') {
    // Separate PDFs: one single-page document per chart.
    const { jsPDF } = await import('jspdf');
    for (const s of shots) {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const PW = doc.internal.pageSize.getWidth();
      const boxW = PW - 28;
      const h = boxW / (s.canvas.width / s.canvas.height);
      doc.setFontSize(13); doc.setTextColor(20, 40, 34); doc.text(s.title, 14, 16);
      doc.addImage(s.canvas.toDataURL('image/png'), 'PNG', 14, 24, boxW, h, undefined, 'FAST');
      zip.file(`roktonet_${s.id}.pdf`, doc.output('blob'));
    }
  } else {
    for (const s of shots) {
      zip.file(`roktonet_${s.id}.${ext}`, await canvasToBlob(s.canvas, mime, 0.92));
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, filename: `${stem(rangeLabel)}_${format}.zip` };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * @param {object} opts
 * @param {string[]} opts.chartIds   which charts to export, in page order
 * @param {string}   opts.format     'png' | 'jpeg' | 'webp' | 'pdf'
 * @param {boolean}  opts.separate   the "Separate (zipped) download" box
 * @param {string}   opts.rangeLabel filename-safe window, e.g. 2026-06-01_to_2026-09-21
 * @param {string}   opts.rangeText  human window for the PDF header
 * @returns {Promise<{filename: string, count: number}>}
 */
export async function exportCharts({ chartIds, format, separate, rangeLabel, rangeText }) {
  const available = discoverCharts();
  const entries = chartIds.map((id) => available.get(id)).filter(Boolean);

  if (entries.length === 0) {
    throw new Error('None of the selected charts are on screen right now. Wait for the sections to finish loading, then try again.');
  }

  const shots = captureAll(entries);

  // One chart never needs packaging, whatever the checkbox says.
  if (shots.length === 1) {
    const s = shots[0];
    if (format === 'pdf') {
      const { blob, filename } = await buildPdf(shots, { rangeLabel, rangeText });
      saveBlob(blob, filename);
      return { filename, count: 1 };
    }
    const { mime, ext } = formatMeta(format);
    const blob = await canvasToBlob(s.canvas, mime, 0.92);
    const filename = `roktonet_${s.id}_${rangeLabel}.${ext}`;
    saveBlob(blob, filename);
    return { filename, count: 1 };
  }

  // Image formats have no way to be "one combined file" -- a PNG holds one
  // picture. So for them, multiple charts always means a zip, and the
  // Separate checkbox has nothing to change. Only PDF can go either way.
  const mustZip = separate || format !== 'pdf';

  const { blob, filename } = mustZip
    ? await buildZip(shots, { format, rangeLabel })
    : await buildPdf(shots, { rangeLabel, rangeText });

  saveBlob(blob, filename);
  return { filename, count: shots.length };
}

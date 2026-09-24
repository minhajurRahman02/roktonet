import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Roktim's Chart.js styling.
//
// WHY THIS IS NOT components/admin/chartTheme.js
// ----------------------------------------------
// It is the same library, configured for a different room. The admin theme's
// palette is RoktoNet's greens, ambers and reds, and those are exactly the
// colours Roktim must not use: critical red, urgent amber, routine blue and
// elective green all carry reserved meaning in this product, and a user who
// has learned them must never read a Roktim curve as an urgency tier. The
// admin theme also switches on the app's light/dark class, while Roktim's page
// is dark whatever the app theme says.
//
// So: same library, same registration, separate options. Importing the admin
// theme and overriding it would have left Roktim one careless default away
// from drawing a demand curve in critical red.
ChartJS.register(
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Tooltip,
  Legend,
  Filler,
);

export const RK = {
  mark: '#8474CE',
  hi: '#A493E6',
  band: 'rgba(100, 85, 168, 0.28)',
  marker: '#C4B8F5',
  ink: '#E8E3FB',
  muted: '#9A93B8',
  dim: '#6E6790',
  surface: '#141220',
  hairline: '#2A2640',
};

/** The sequential ramp. Single hue, monotone lightness; validated ordinal. */
export const RAMP = ['#4A3F7A', '#6455A8', '#8474CE', '#A493E6', '#C4B8F5'];

/**
 * Ramp position for a value against the series maximum.
 *
 * The ramp encodes magnitude, which the bar length already shows, so this is
 * reinforcement rather than the only channel. r1 is skipped for marks read on
 * their own: it clears the surface at 2.01:1, below the 3:1 floor.
 */
export function rampFor(value, max) {
  if (!max || value <= 0) return RAMP[1];
  const i = Math.min(RAMP.length - 1, 1 + Math.floor((value / max) * (RAMP.length - 1.001)));
  return RAMP[i];
}

// Solid hairlines, one shade off the surface. Never dashed: dashing reads as
// "projection" or "threshold" when it is only a grid.
const grid = { color: RK.hairline, lineWidth: 1, drawTicks: false };
const ticks = { color: RK.muted, font: { size: 10.5, family: 'IBM Plex Sans' } };

export const TOOLTIP = {
  backgroundColor: '#1D1A2E',
  borderColor: RK.hairline,
  borderWidth: 1,
  padding: 10,
  titleColor: RK.ink,
  bodyColor: RK.muted,
  titleFont: { family: 'Sora', size: 12 },
  bodyFont: { family: 'IBM Plex Sans', size: 12 },
  displayColors: false,
};

export function lineOptions({ legend = false, onPoint } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    // A hit area that includes the gap between points, rather than demanding a
    // direct hit on a 3px dot.
    interaction: { mode: 'index', intersect: false },
    onClick: onPoint,
    plugins: {
      legend: { display: legend, labels: { color: RK.muted, boxWidth: 10, font: { size: 11 } } },
      tooltip: TOOLTIP,
    },
    scales: {
      x: { ticks: { ...ticks, maxRotation: 0, autoSkipPadding: 18 }, grid: { display: false }, border: { color: RK.hairline } },
      y: { ticks, grid, border: { display: false }, beginAtZero: true },
    },
  };
}

export function barOptions({ horizontal = true } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: TOOLTIP },
    scales: {
      x: {
        ticks,
        grid: horizontal ? grid : { display: false },
        border: { display: false },
        beginAtZero: true,
      },
      y: {
        ticks: { ...ticks, font: { size: 11, family: 'IBM Plex Sans' } },
        grid: horizontal ? { display: false } : grid,
        border: { color: RK.hairline },
        beginAtZero: true,
      },
    },
  };
}

export function radarOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: TOOLTIP },
    scales: {
      r: {
        angleLines: { color: RK.hairline },
        grid: { color: RK.hairline },
        pointLabels: { color: RK.muted, font: { size: 10.5, family: 'IBM Plex Sans' } },
        ticks: {
          color: RK.dim,
          backdropColor: 'transparent',
          font: { size: 9 },
          showLabelBackdrop: false,
        },
        beginAtZero: true,
      },
    },
  };
}

/** Week number to a readable month label for the seasonal x-axis. */
export function weekLabel(week) {
  const d = new Date(Date.UTC(2025, 0, 1 + (week - 1) * 7));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

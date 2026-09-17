// Chart.js styling shared by every admin chart. Same palette and tooltip
// as blood-bank/Overview.jsx so admin charts read as the same product.
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, ArcElement, RadialLinearScale, Filler } from 'chart.js';

ChartJS.register(BarElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, ArcElement, RadialLinearScale, Filler);

export const PALETTE = {
  g1: '#1C4A3D', g2: '#2E6B57', g3: '#3F5B4E', g4: '#6B9080',
  s1: '#5B7A8C', s2: '#42606F', a1: '#8C6117', a2: '#B8811F',
  r: '#A9382F', gray: '#9CA3AF',
};
export const SERIES = [PALETTE.g1, PALETTE.g2, PALETTE.g3, PALETTE.g4, PALETTE.s1, PALETTE.s2, PALETTE.a1, PALETTE.a2, PALETTE.r, PALETTE.gray];
export const URGENCY_COLOR = { critical: PALETTE.r, urgent: PALETTE.a2, routine: PALETTE.s1, elective: PALETTE.g4, restock: PALETTE.gray };
export const STATUS_COLOR = { available: PALETTE.g3, reserved: PALETTE.a2, dispatched: PALETTE.s2, delivered: PALETTE.gray, expired: PALETTE.r };
export const PATH_COLOR = { inventory: PALETTE.g1, donor_fallback: PALETTE.a2, parallel_critical: PALETTE.r, scheduled_reservation: PALETTE.s1, scheduled_donor_mobilization: PALETTE.s2 };

export const TOOLTIP = { backgroundColor: '#12332A', padding: 10, titleFont: { family: 'Sora' }, bodyFont: { family: 'IBM Plex Sans' } };

const isDark = () => document.documentElement.classList.contains('dark');
const tick = () => ({ color: isDark() ? '#9CA8A3' : '#6B7280', font: { size: 11 } });
const grid = () => ({ color: isDark() ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)' });

export function baseOptions({ stacked = false, horizontal = false, legend = true } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: {
      legend: { display: legend, labels: { color: tick().color, boxWidth: 10, font: { size: 11 } } },
      tooltip: TOOLTIP,
    },
    scales: {
      x: { stacked, ticks: tick(), grid: horizontal ? grid() : { display: false } },
      y: { stacked, ticks: tick(), grid: horizontal ? { display: false } : grid(), beginAtZero: true },
    },
  };
}

export function radialOptions({ cutout } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    ...(cutout ? { cutout } : {}),
    plugins: {
      legend: { position: 'bottom', labels: { color: tick().color, boxWidth: 10, font: { size: 11 } } },
      tooltip: TOOLTIP,
    },
    scales: {},
  };
}

// Nightingale (polar area) -- the r axis must be styled too, or it renders
// black-on-dark. Same chart type Blood Bank's overview already uses.
export function polarOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: tick().color, boxWidth: 10, font: { size: 11 } } },
      tooltip: TOOLTIP,
    },
    scales: {
      r: { ticks: { display: false }, grid: grid(), angleLines: grid() },
    },
  };
}

export const weekLabel = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

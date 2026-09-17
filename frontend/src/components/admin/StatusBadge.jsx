import PropTypes from 'prop-types';

// Status pills for everything that isn't an urgency tier (which has its
// own UrgencyBadge atom). Same shape/size so they sit side by side.
const STYLES = {
  // inventory
  available: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
  reserved: 'bg-urgent-bg text-urgent-text dark:bg-urgent-dbg dark:text-urgent-dtext',
  dispatched: 'bg-routine-bg text-routine-text dark:bg-routine-dbg dark:text-routine-dtext',
  delivered: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-textsecondary-dark',
  expired: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  // fulfillment paths
  inventory: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
  donor_fallback: 'bg-urgent-bg text-urgent-text dark:bg-urgent-dbg dark:text-urgent-dtext',
  parallel_critical: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  scheduled_reservation: 'bg-routine-bg text-routine-text dark:bg-routine-dbg dark:text-routine-dtext',
  scheduled_donor_mobilization: 'bg-routine-bg text-routine-text dark:bg-routine-dbg dark:text-routine-dtext',
  pending: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-textsecondary-dark',
  cancelled: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  // accounts
  active: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
  deactivated: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  // roles
  hospital: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
  bank: 'bg-routine-bg text-routine-text dark:bg-routine-dbg dark:text-routine-dtext',
  blood_bank: 'bg-routine-bg text-routine-text dark:bg-routine-dbg dark:text-routine-dtext',
  ngo: 'bg-urgent-bg text-urgent-text dark:bg-urgent-dbg dark:text-urgent-dtext',
  donor: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-textsecondary-dark',
  admin: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  // eligibility / invites / drives
  eligible: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
  ineligible: 'bg-urgent-bg text-urgent-text dark:bg-urgent-dbg dark:text-urgent-dtext',
  confirmed: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
  declined: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  invited: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-textsecondary-dark',
  planned: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-textsecondary-dark',
  completed: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
};

export default function StatusBadge({ value, label }) {
  const cls = STYLES[value] || STYLES.pending;
  return <span className={`text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap ${cls}`}>{label || value}</span>;
}

StatusBadge.propTypes = { value: PropTypes.string.isRequired, label: PropTypes.string };

import PropTypes from 'prop-types';

const STYLES = {
  critical: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  urgent: 'bg-urgent-bg text-urgent-text dark:bg-urgent-dbg dark:text-urgent-dtext',
  routine: 'bg-routine-bg text-routine-text dark:bg-routine-dbg dark:text-routine-dtext',
  elective: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
  // Deliberately its own neutral gray, not a reuse of elective's green --
  // restock isn't "another patient urgency tier below elective", it's a
  // different category of request entirely (a bank topping up its own
  // stock), so it shouldn't borrow a color that already carries meaning.
  restock: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-textsecondary-dark',
};

const LABELS = { critical: 'Critical', urgent: 'Urgent', routine: 'Routine', elective: 'Elective', restock: 'Restock' };

export default function UrgencyBadge({ urgencyTier }) {
  return (
    <span className={`text-xs font-medium px-3 py-1 rounded-full ${STYLES[urgencyTier] || STYLES.routine}`}>
      {LABELS[urgencyTier] || urgencyTier}
    </span>
  );
}

UrgencyBadge.propTypes = {
  urgencyTier: PropTypes.oneOf(['critical', 'urgent', 'routine', 'elective', 'restock']).isRequired,
};
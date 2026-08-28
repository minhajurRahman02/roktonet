import PropTypes from 'prop-types';

const STYLES = {
  critical: 'bg-critical-bg text-critical-text dark:bg-critical-dbg dark:text-critical-dtext',
  urgent: 'bg-urgent-bg text-urgent-text dark:bg-urgent-dbg dark:text-urgent-dtext',
  routine: 'bg-routine-bg text-routine-text dark:bg-routine-dbg dark:text-routine-dtext',
  elective: 'bg-elective-bg text-elective-text dark:bg-elective-dbg dark:text-elective-dtext',
};

const LABELS = { critical: 'Critical', urgent: 'Urgent', routine: 'Routine', elective: 'Elective' };

export default function UrgencyBadge({ urgencyTier }) {
  return (
    <span className={`text-xs font-medium px-3 py-1 rounded-full ${STYLES[urgencyTier] || STYLES.routine}`}>
      {LABELS[urgencyTier] || urgencyTier}
    </span>
  );
}

UrgencyBadge.propTypes = {
  urgencyTier: PropTypes.oneOf(['critical', 'urgent', 'routine', 'elective']).isRequired,
};

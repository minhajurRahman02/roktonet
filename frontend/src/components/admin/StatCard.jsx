import PropTypes from 'prop-types';

// Same KPI card every existing Overview page hand-writes inline; lifted
// into a component because the admin module has ~30 of them.
const TONES = {
  default: 'dark:text-textprimary-dark',
  critical: 'text-critical-text dark:text-critical-dtext',
  urgent: 'text-urgent-text dark:text-urgent-dtext',
  ok: 'text-elective-text dark:text-elective-dtext',
};

export default function StatCard({ value, label, tone = 'default', suffix }) {
  return (
    <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4">
      <p className={`font-display font-bold text-2xl ${TONES[tone]}`}>
        {value}
        {suffix && <span className="text-sm font-body font-normal text-gray-400 ml-1">{suffix}</span>}
      </p>
      <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-1">{label}</p>
    </div>
  );
}

StatCard.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  label: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(['default', 'critical', 'urgent', 'ok']),
  suffix: PropTypes.string,
};

import PropTypes from 'prop-types';

/**
 * Generic loading skeleton -- part of the 5-state matrix (frontend_standards.md
 * §5) every dashboard data view must implement. `rows` controls how many
 * placeholder lines to show, roughly matching the expected content shape.
 */
export default function LoadingState({ rows = 3 }) {
  return (
    <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-4 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-100 dark:bg-white/10 rounded animate-pulse"
          style={{ width: `${70 - i * 10}%` }}
        />
      ))}
    </div>
  );
}

LoadingState.propTypes = {
  rows: PropTypes.number,
};

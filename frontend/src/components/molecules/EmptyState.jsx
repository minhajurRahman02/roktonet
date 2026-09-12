import PropTypes from 'prop-types';

export default function EmptyState({ message, actionLabel, onAction }) {
  return (
    <div className="bg-white dark:bg-surface-dark border border-dashed border-gray-300 dark:border-white/20 rounded-xl p-4 text-center">
      <p className="text-sm text-gray-500 dark:text-textsecondary-dark">{message}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="text-xs text-primary dark:text-textprimary-dark font-medium mt-2">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

EmptyState.propTypes = {
  message: PropTypes.string.isRequired,
  actionLabel: PropTypes.string,
  onAction: PropTypes.func,
};

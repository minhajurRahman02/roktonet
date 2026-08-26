import PropTypes from 'prop-types';

export default function ErrorState({ message, onRetry }) {
  return (
    <div className="bg-red-50 dark:bg-critical-dbg border border-red-200 dark:border-critical-text/30 rounded-xl p-4">
      <p className="text-sm text-red-700 dark:text-critical-dtext font-medium">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs text-red-700 dark:text-critical-dtext font-medium mt-2 underline">
          Retry
        </button>
      )}
    </div>
  );
}

ErrorState.propTypes = {
  message: PropTypes.string.isRequired,
  onRetry: PropTypes.func,
};

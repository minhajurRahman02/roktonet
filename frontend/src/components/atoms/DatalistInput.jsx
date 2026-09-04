import PropTypes from 'prop-types';

// A free-typing input backed by a native <datalist> of suggestions --
// lets someone pick from a known-good list (prevents most typos at the
// source) while still allowing free text for whatever isn't in the list.
// Used for district/thana entry: the backend has its own fuzzy-matching
// fallback (locationResolver.js) for whatever doesn't come from here,
// so this doesn't need to force a selection, just guide toward one.
const DatalistInput = ({ error, className = '', options = [], id, ...props }) => {
  const listId = `${id}-datalist`;
  return (
    <>
      <input
        id={id}
        list={listId}
        className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-surface-dark
          text-textprimary dark:text-textprimary-dark
          focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary
          disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-white/5
          ${error ? 'border-red-400' : 'border-gray-300 dark:border-white/10'}
          ${className}`}
        {...props}
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  );
};

DatalistInput.propTypes = {
  error: PropTypes.bool,
  className: PropTypes.string,
  options: PropTypes.arrayOf(PropTypes.string),
  id: PropTypes.string.isRequired,
};

export default DatalistInput;

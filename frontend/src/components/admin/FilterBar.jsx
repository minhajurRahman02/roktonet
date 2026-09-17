import PropTypes from 'prop-types';

/** The rounded filter strip above every admin table. */
export default function FilterBar({ children, cols = 6 }) {
  const grid = { 4: 'md:grid-cols-4', 5: 'md:grid-cols-5', 6: 'md:grid-cols-6', 7: 'md:grid-cols-7' }[cols] || 'md:grid-cols-6';
  return (
    <div className={`bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-3 mb-4 grid grid-cols-2 ${grid} gap-2`}>
      {children}
    </div>
  );
}
FilterBar.propTypes = { children: PropTypes.node.isRequired, cols: PropTypes.number };

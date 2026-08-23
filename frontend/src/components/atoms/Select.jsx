import PropTypes from 'prop-types';

const Select = ({ error, className = '', children, ...props }) => (
  <select
    className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-surface-dark
      text-textprimary dark:text-textprimary-dark
      focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary
      ${error ? 'border-red-400' : 'border-gray-300 dark:border-white/10'}
      ${className}`}
    {...props}
  >
    {children}
  </select>
);

Select.propTypes = {
  error: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
};

export default Select;

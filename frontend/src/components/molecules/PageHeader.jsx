import PropTypes from 'prop-types';

export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="font-display font-bold text-2xl dark:text-textprimary-dark">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 dark:text-textsecondary-dark mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  action: PropTypes.node,
};

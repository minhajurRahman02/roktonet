import PropTypes from 'prop-types';

/**
 * Thin table primitives so every admin list page shares one header/cell
 * style. Deliberately not a "DataTable" with sorting/pagination baked in
 * -- the pages are small enough that plain rows keep them readable.
 */
export function Table({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl overflow-x-auto ${className}`}>
      <table className="w-full">{children}</table>
    </div>
  );
}
Table.propTypes = { children: PropTypes.node.isRequired, className: PropTypes.string };

export function Th({ children, className = '' }) {
  return <th className={`text-left text-xs font-medium text-gray-500 dark:text-textsecondary-dark uppercase tracking-wide px-4 py-2.5 border-b border-gray-200 dark:border-white/10 whitespace-nowrap ${className}`}>{children}</th>;
}
Th.propTypes = { children: PropTypes.node, className: PropTypes.string };

export function Td({ children, className = '', mono = false, muted = false }) {
  return <td className={`text-sm px-4 py-3 border-b border-gray-100 dark:border-white/5 dark:text-textprimary-dark ${mono ? 'font-mono text-xs' : ''} ${muted ? 'text-gray-500 dark:text-textsecondary-dark' : ''} ${className}`}>{children}</td>;
}
Td.propTypes = { children: PropTypes.node, className: PropTypes.string, mono: PropTypes.bool, muted: PropTypes.bool };

export function TableFooter({ children }) {
  return <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-500 dark:text-textsecondary-dark">{children}</div>;
}
TableFooter.propTypes = { children: PropTypes.node };

export function shortId(id) {
  return id ? `${id.slice(0, 4)}…${id.slice(-4)}` : '—';
}

export function fmtDate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '—';
}

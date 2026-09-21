import PropTypes from 'prop-types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS } from '../../hooks/usePaginatedAsync';

const SMALLEST_PAGE_SIZE = Math.min(...PAGE_SIZE_OPTIONS);

/**
 * The one pagination control, used by every list in the project (7.7a) --
 * admin tables, role tables, and the card lists that are not tables at
 * all.
 *
 * Deliberately presentational: it owns no state. The page and
 * rows-per-page live in usePaginatedAsync, so a page can drive this from
 * a URL param or a parent later without rewriting the control.
 */
export default function Pagination({ page, pageCount, total, perPage, onPageChange, onPerPageChange, noun = 'row', className = '' }) {
  // The two controls answer different questions, and conflating them was
  // a real bug (7.7a rev 2).
  //
  // Rev 1 hid BOTH behind a single `total > perPage`. On a 39-row table
  // with 100 per page that is false, so the rows-per-page selector
  // vanished -- taking with it the only way to set the value back down.
  // localStorage then made the trap persist across refresh and re-login.
  // The user could not escape without clearing site data.
  //
  // So:
  //   page buttons  -- only meaningful when there is more than one page.
  //   rows selector -- meaningful whenever a DIFFERENT option would change
  //                    what is on screen, i.e. whenever the row count
  //                    exceeds the smallest option. That keeps the
  //                    original intent (a donor with 3 donations still
  //                    sees just a count) without ever being a one-way
  //                    door.
  const showPageButtons = pageCount > 1;
  const showRowsSelector = total > SMALLEST_PAGE_SIZE;

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-gray-500 dark:text-textsecondary-dark ${className}`}>
      <span>
        {showPageButtons
          ? <>Showing <b className="text-textprimary dark:text-textprimary-dark">{from}–{to}</b> of {total} {plural(noun, total)}</>
          : <>{total} {plural(noun, total)}</>}
      </span>

      {(showRowsSelector || showPageButtons) && (
        <div className="flex items-center gap-3">
          {showRowsSelector && (
            <label className="flex items-center gap-1.5">
              <span className="hidden sm:inline">Rows</span>
              <select
                value={perPage}
                onChange={(e) => onPerPageChange(Number(e.target.value))}
                className="border border-gray-300 dark:border-white/10 rounded-md bg-white dark:bg-surface-dark
                           text-textprimary dark:text-textprimary-dark px-2 py-1
                           focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}

          {showPageButtons && (
            <div className="flex items-center gap-1">
              <PageButton onClick={() => onPageChange(page - 1)} disabled={page <= 1} label="Previous page">
                <ChevronLeft size={14} />
              </PageButton>

              {pageNumbers(page, pageCount).map((p, i) => (
                p === GAP
                  ? <span key={`gap-${i}`} className="px-1.5 text-gray-400 select-none">…</span>
                  : (
                    <button
                      key={p}
                      onClick={() => onPageChange(p)}
                      aria-current={p === page ? 'page' : undefined}
                      className={`min-w-[1.75rem] px-1.5 py-1 rounded-md border transition-colors ${
                        p === page
                          ? 'border-primary bg-primary text-white font-medium'
                          : 'border-gray-300 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 dark:text-textprimary-dark'
                      }`}
                    >
                      {p}
                    </button>
                  )
              ))}

              <PageButton onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} label="Next page">
                <ChevronRight size={14} />
              </PageButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PageButton({ onClick, disabled, label, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="p-1.5 rounded-md border border-gray-300 dark:border-white/10
                 hover:bg-gray-50 dark:hover:bg-white/5 dark:text-textprimary-dark
                 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
PageButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

const GAP = Symbol('gap');

/**
 * First page, last page, and a window around the current one, with gaps
 * for the rest.
 *
 * 30 pages of audit log is a realistic number here, and rendering 30
 * buttons wraps the footer onto three lines on a laptop and off the
 * screen on a phone. The window is what keeps the control one line wide
 * regardless of how much data there is.
 */
function pageNumbers(current, count) {
  if (count <= 7) return range(1, count);

  const out = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);

  if (start > 2) out.push(GAP);
  out.push(...range(start, end));
  if (end < count - 1) out.push(GAP);
  out.push(count);
  return out;
}

function range(a, b) {
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
}

// "1 donor" / "2 donors", without dragging in a pluralisation library for
// the handful of nouns this project actually uses.
function plural(noun, n) {
  if (n === 1) return noun;
  if (noun.endsWith('y') && !/[aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

Pagination.propTypes = {
  page: PropTypes.number.isRequired,
  pageCount: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  perPage: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
  onPerPageChange: PropTypes.func.isRequired,
  noun: PropTypes.string,
  className: PropTypes.string,
};

export { plural };
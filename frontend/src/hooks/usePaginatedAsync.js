import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * useAsync's sibling for paginated endpoints (7.7a).
 *
 * The backend's pagination is opt-in: an endpoint called without
 * ?per_page= returns a bare array exactly as before, and only a caller
 * that asks gets { data, page }. This hook is the thing that asks.
 *
 * It owns three pieces of state the pages should not each reimplement:
 * the current page, the rows-per-page choice, and the localStorage
 * memory of that choice.
 *
 * @param {(params: {page: number, per_page: number}) => Promise} loader
 *   Called with the paging params; must pass them through to the API.
 * @param {Array} deps  Re-runs the loader AND resets to page 1 (see below).
 * @param {{ storageKey: string, defaultPerPage?: number }} options
 *   storageKey identifies this table for the rows-per-page memory. Use a
 *   stable, human-readable name ('admin.donors', 'ngo.myDonors') -- it
 *   ends up in the user's localStorage and outlives any refactor.
 */
export function usePaginatedAsync(loader, deps = [], { storageKey, defaultPerPage = 25 } = {}) {
  const [perPage, setPerPageState] = useState(() => readStoredPerPage(storageKey, defaultPerPage));
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [pageInfo, setPageInfo] = useState(null);
  const [error, setError] = useState('');

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // deps is spread into the dependency arrays below. Memoising on a
  // JSON key rather than the array identity means a page can pass a
  // freshly-built filters object every render (which every one of them
  // does) without causing an infinite fetch loop.
  const depsKey = JSON.stringify(deps);

  const run = useCallback((background = false) => {
    if (!background) setStatus('loading');
    return loaderRef.current({ page, per_page: perPage })
      .then((res) => {
        // Tolerates both shapes on purpose. During the rollout some
        // endpoints are called by pages that have been converted and some
        // by pages that have not, and a page being converted before its
        // endpoint (or after) should degrade to "one big page", not crash.
        if (Array.isArray(res)) {
          setData(res);
          setPageInfo({ total: res.length, per_page: res.length || 1, offset: 0, page_count: 1, current_page: 1, has_more: false });
        } else {
          setData(res.data);
          setPageInfo(res.page);
        }
        setStatus('success');
      })
      .catch((err) => { setError(err.message); if (!background) setStatus('error'); });
  }, [page, perPage]);

  useEffect(() => { run(false); }, [run, depsKey]);

  // Filters changing must send you back to page 1. Without this, applying
  // a filter while on page 7 of 30 asks for page 7 of a result set that
  // may only have 2 pages, and the table comes back empty for no visible
  // reason -- one of those bugs users report as "the filter is broken".
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    setPage(1);
  }, [depsKey]);

  const setPerPage = useCallback((next) => {
    setPerPageState(next);
    setPage(1); // 50-per-page page 3 is not 25-per-page page 3
    writeStoredPerPage(storageKey, next);
  }, [storageKey]);

  // The 5-state matrix (frontend_standards.md §5) still applies: empty is
  // distinct from success-with-rows, and it is the page's job to render
  // the difference.
  const isEmpty = status === 'success' && (!data || data.length === 0);

  return useMemo(() => ({
    status, data, error, isEmpty,
    page, setPage,
    perPage, setPerPage,
    pageInfo,
    total: pageInfo?.total ?? 0,
    pageCount: pageInfo?.page_count ?? 1,
    reload: () => run(false),
    // 7.7a rev 2: `refresh` exists because useAsync has it and five pages
    // already called it after a save (Organizations, Inventory, Requests,
    // Users, Reports). Omitting it turned every one of those into a
    // TypeError the moment someone saved something. Same background
    // semantics as useAsync's: re-fetch without flipping back to the
    // loading state, so the table does not blank out mid-edit.
    refresh: () => run(true),
  }), [status, data, error, isEmpty, page, perPage, pageInfo, run, setPerPage]);
}

const KEY_PREFIX = 'roktonet.perPage.';

/**
 * localStorage, not sessionStorage: this is a durable UI preference, and
 * losing it every time a tab closes would defeat the point. It is also
 * per-device and never sent to the server, which is correct for something
 * this trivial -- it does not belong in the users table.
 *
 * Wrapped in try/catch because localStorage throws outright in Safari
 * private mode rather than failing quietly, and a rows-per-page
 * preference is never worth crashing a page over.
 */
function readStoredPerPage(storageKey, fallback) {
  if (!storageKey) return fallback;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + storageKey);
    const n = Number(raw);
    // Validated against the offered options rather than merely being a
    // number: a hand-edited localStorage value of 100000 would otherwise
    // be sent to the server on every request until the user noticed.
    return PAGE_SIZE_OPTIONS.includes(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredPerPage(storageKey, value) {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(KEY_PREFIX + storageKey, String(value));
  } catch {
    // Quota exceeded or storage disabled. The choice still applies for
    // this session; it just will not be remembered.
  }
}

// Mirrors PAGE_SIZE_OPTIONS in backend/utils/pagination.js. 'All' is
// deliberately absent: on a table that has grown, it is how a page
// becomes unusable with no warning, and the backend clamps at 200 anyway.
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
/**
 * Client-side paging over a list that is ALREADY in memory (7.7a).
 *
 * Most lists page on the server, which is the point of the whole feature.
 * Two do not, and both for correctness rather than convenience:
 *
 *   blood-bank/OutgoingAllocations groups allocation ROWS into request
 *   GROUPS before rendering. Paging the rows server-side would split a
 *   request's units across a page boundary -- you would see 2 of 3 units,
 *   and the Dispatch button, which acts on group.units, would dispatch
 *   only the ones that happened to land on the visible page. A quietly
 *   wrong action is worse than a long list.
 *
 *   ngo/DriveLog draws a cumulative-collection chart by counting the
 *   entire log array into time buckets. Give it one page and every point
 *   on the chart is wrong, in the same way paginating the Overview pages
 *   would break their KPIs.
 *
 * So those two fetch everything (as they always did) and page what is on
 * screen. No payload saving, but the same controls and the same
 * rows-per-page memory as everywhere else, and nothing silently
 * miscounts. Both lists are bounded by one bank's allocations or one
 * drive's log, so the full fetch is not a concern at this scale.
 *
 * @param {Array} items    the full, already-loaded list
 * @param {{ storageKey: string, defaultPerPage?: number }} options
 */
export function useClientPagination(items, { storageKey, defaultPerPage = 25 } = {}) {
  const [perPage, setPerPageState] = useState(() => readStoredPerPage(storageKey, defaultPerPage));
  const [page, setPage] = useState(1);

  const total = items?.length || 0;
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  // If the list shrinks under us (a filter, a refetch after dispatch),
  // the current page can fall off the end and render as empty for no
  // visible reason. Clamp instead.
  const safePage = Math.min(page, pageCount);

  const setPerPage = useCallback((next) => {
    setPerPageState(next);
    setPage(1); // 50-per-page page 3 is not 25-per-page page 3
    writeStoredPerPage(storageKey, next);
  }, [storageKey]);

  const pageItems = useMemo(
    () => (items || []).slice((safePage - 1) * perPage, safePage * perPage),
    [items, safePage, perPage]
  );

  return {
    pageItems, total, pageCount, perPage, setPerPage,
    page: safePage,
    setPage,
  };
}


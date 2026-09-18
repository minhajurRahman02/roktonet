// Shared pagination for every list endpoint.
//
// DESIGN DECISION: pagination is OPT-IN, and the response shape changes
// only when the caller asks for it.
//
//   GET /api/donors              -> [ {...}, {...} ]            (unchanged)
//   GET /api/donors?limit=25     -> { data: [...], page: {...} }
//
// The reason is blast radius. Five role dashboards (hospital, bank, ngo,
// donor, plus the shared profile pages) already consume these endpoints
// and expect a bare array. Changing every endpoint to always return an
// envelope would have meant touching and re-testing every one of those
// pages for a feature only the admin tables asked for.
//
// It also keeps the genuinely-unbounded reads working: the filter
// dropdowns on the admin pages fetch the full organizations and districts
// lists to populate <select> options, and those want everything, not page
// one of everything.
//
// So: admin tables pass ?limit= and get an envelope with a real total;
// everything else carries on exactly as before.
//
// The `total` is a second COUNT query against the same WHERE clause. At
// this project's data volumes that is cheaper and far simpler than
// window-function tricks, and unlike COUNT(*) OVER () it stays correct
// when the main query has a LIMIT.

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

// Offered in the rows-per-page selector. 'all' is deliberately absent:
// an admin on a slow connection selecting "all" against a table that has
// grown is exactly how a page becomes unusable with no warning.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Reads ?limit= and ?offset= (or ?page=, 1-based) off a request.
 *
 * @returns {{ paginated: boolean, limit: number, offset: number, error: string|null }}
 *   paginated is false when the caller did not ask for pagination, in
 *   which case limit/offset should be ignored and a plain array returned.
 */
function parsePagination(query) {
  const out = { paginated: false, limit: DEFAULT_LIMIT, offset: 0, error: null };

  if (query.limit === undefined && query.page === undefined) return out;
  out.paginated = true;

  if (query.limit !== undefined) {
    const limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      return { ...out, error: 'limit must be a positive integer' };
    }
    // Clamped rather than rejected: a client asking for 10000 rows gets
    // the largest page we are willing to serve, not an error it has to
    // handle. The envelope's `limit` tells it what it actually got.
    out.limit = Math.min(limit, MAX_LIMIT);
  }

  if (query.offset !== undefined) {
    const offset = Number(query.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      return { ...out, error: 'offset must be a non-negative integer' };
    }
    out.offset = offset;
  } else if (query.page !== undefined) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
      return { ...out, error: 'page must be a positive integer (1-based)' };
    }
    out.offset = (page - 1) * out.limit;
  }

  return out;
}

/**
 * Appends LIMIT/OFFSET to a query using the next two bind parameters.
 * Mutates `values`, returns the SQL fragment.
 *
 *   const sql = `SELECT ... ${where} ORDER BY x ${limitClause(p, values)}`;
 */
function limitClause(pagination, values) {
  values.push(pagination.limit, pagination.offset);
  return `LIMIT $${values.length - 1} OFFSET $${values.length}`;
}

/**
 * The response envelope. `total` is the full count ignoring LIMIT, so the
 * UI can render "showing 26-50 of 214" and a correct page count.
 */
function paginated(rows, total, pagination) {
  const totalNum = Number(total) || 0;
  return {
    data: rows,
    page: {
      total: totalNum,
      limit: pagination.limit,
      offset: pagination.offset,
      page_count: Math.max(1, Math.ceil(totalNum / pagination.limit)),
      current_page: Math.floor(pagination.offset / pagination.limit) + 1,
      has_more: pagination.offset + rows.length < totalNum,
    },
  };
}

/**
 * Runs the count and the page in one go. `countSql` and `rowsSql` must
 * share the same WHERE clause and the same leading bind values.
 *
 * Kept as a helper because getting this wrong in one route out of eleven
 * (counting with different filters than you select with) produces a page
 * count that is subtly incorrect and very hard to notice.
 */
async function queryPage(pool, { countSql, rowsSql, values, pagination }) {
  const countResult = await pool.query(countSql, values);
  const pageValues = [...values];
  const sql = `${rowsSql} ${limitClause(pagination, pageValues)}`;
  const rowsResult = await pool.query(sql, pageValues);
  return paginated(rowsResult.rows, countResult.rows[0].total, pagination);
}

module.exports = {
  parsePagination,
  limitClause,
  paginated,
  queryPage,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  PAGE_SIZE_OPTIONS,
};

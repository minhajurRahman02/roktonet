// Small shared helpers for the admin routes. Every admin list/analytics/
// report endpoint accepts the same ?from=&to= date range, so the parsing
// and validation live in one place.

// Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD into SQL-safe bounds. `to` is made
// inclusive of its whole day (end of day), since a user picking "to
// 2026-09-15" means "including the 15th", not "up to midnight starting it".
// Returns { from: Date|null, to: Date|null, error: string|null }.
function parseDateRange(query) {
  const { from, to } = query;
  const out = { from: null, to: null, error: null };

  if (from) {
    const d = new Date(from);
    if (Number.isNaN(d.getTime())) return { ...out, error: `Invalid 'from' date: ${from}` };
    out.from = d;
  }
  if (to) {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) return { ...out, error: `Invalid 'to' date: ${to}` };
    d.setHours(23, 59, 59, 999);
    out.to = d;
  }
  if (out.from && out.to && out.from > out.to) {
    return { ...out, error: "'from' must be on or before 'to'" };
  }
  return out;
}

// Incrementally builds a parameterized WHERE clause. Usage:
//   const w = new WhereBuilder();
//   w.add('role = ?', role);            // only added when value is truthy
//   w.range('created_at', from, to);
//   pool.query(`SELECT ... ${w.clause()}`, w.values)
// Every '?' is replaced with the correct $N placeholder. Never string-
// concatenates a user value into SQL.
class WhereBuilder {
  constructor() {
    this.conditions = [];
    this.values = [];
  }

  add(template, value) {
    if (value === undefined || value === null || value === '') return this;
    this.values.push(value);
    this.conditions.push(template.replace('?', `$${this.values.length}`));
    return this;
  }

  // Adds a raw condition with no bound value (e.g. 'cancelled_at IS NULL').
  raw(condition) {
    this.conditions.push(condition);
    return this;
  }

  range(column, from, to) {
    if (from) this.add(`${column} >= ?`, from);
    if (to) this.add(`${column} <= ?`, to);
    return this;
  }

  clause() {
    return this.conditions.length ? `WHERE ${this.conditions.join(' AND ')}` : '';
  }
}

module.exports = { parseDateRange, WhereBuilder };

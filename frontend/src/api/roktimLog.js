import { apiFetch } from './client';

// Roktim's ONLY contact with the RoktoNet backend.
//
// Kept separate from api/roktim.js on purpose: that file talks to the forecast
// service on its own domain with plain fetch and no credentials, this one talks
// to our backend through apiFetch with the session cookie. Two different bases,
// two different auth models, two different failure policies. Putting them in
// one file would make it easy to reach for the wrong helper.

/**
 * Persist one advisory. Fire and forget: resolves to null on any failure and
 * never throws.
 *
 * Silence is the point. The log exists so an examiner can ask "what was this
 * hospital told, and by which version of the model" months later. It is not
 * part of the hospital's workflow, so a failed write must not produce an error
 * state, a retry prompt, or anything the user has to notice. The request still
 * happened; only the audit row is missing.
 *
 * @param {object} row
 * @returns {Promise<object|null>}
 */
export async function logAdvisory(row) {
  try {
    return await apiFetch('/api/roktim/advisories', {
      method: 'POST',
      body: JSON.stringify(row),
    });
  } catch {
    return null;
  }
}

/**
 * Read the log. Admin only, server-enforced.
 * @param {{district?: string, basis?: string, outlook?: string,
 *          from?: string, to?: string, page?: number, per_page?: number}} filters
 */
export function listAdvisories(filters = {}) {
  const clean = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== '' && v != null),
  );
  const params = new URLSearchParams(clean).toString();
  return apiFetch(`/api/roktim/advisories${params ? `?${params}` : ''}`);
}

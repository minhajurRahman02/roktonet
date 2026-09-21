import { apiFetch } from './client';

export function getMobilizationsForRequest(requestId) {
  return apiFetch(`/api/mobilizations/${requestId}`);
}

/**
 * @param {{page?: number, per_page?: number}} [filters]
 * @returns {Promise<Array>} all mobilizations involving the caller's own
 * donors (NGO), or the caller's own invites (donor), across every request.
 *
 * 7.7a: this took no arguments at all before, so there was no way to pass
 * page/per_page through -- the params would have been dropped silently and
 * both NGO Mobilizations and donor My Invites would have shown page 1
 * forever while claiming to be paginated.
 */
export function listMobilizations(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiFetch(`/api/mobilizations${params ? `?${params}` : ''}`);
}

/**
 * @param {'confirmed'|'declined'} inviteStatus
 */
export function respondToMobilization(mobilizationId, inviteStatus) {
  return apiFetch(`/api/mobilizations/${mobilizationId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ invite_status: inviteStatus }),
  });
}

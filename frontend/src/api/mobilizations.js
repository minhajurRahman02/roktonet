import { apiFetch } from './client';

export function getMobilizationsForRequest(requestId) {
  return apiFetch(`/api/mobilizations/${requestId}`);
}

/**
 * @returns {Promise<Array>} all mobilizations involving the caller's own
 * donors (NGO), across every request.
 */
export function listMobilizations() {
  return apiFetch('/api/mobilizations');
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
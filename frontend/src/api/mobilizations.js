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
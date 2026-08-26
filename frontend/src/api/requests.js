import { apiFetch } from './client';

/**
 * @param {{urgency_tier?: string, fulfillment_path?: string}} [filters]
 * @returns {Promise<Array>} list of requests -- backend auto-scopes to the
 * caller's own org for hospital users (Phase 7.7 security fix), so no
 * org_id needs to be passed here.
 */
export function listRequests(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiFetch(`/api/requests${params ? `?${params}` : ''}`);
}

export function getRequest(id) {
  return apiFetch(`/api/requests/${id}`);
}

/**
 * @param {{org_id: string, blood_type: string, component: string, quantity: number, urgency_tier: string, needed_by_date?: string}} data
 */
export function createRequest(data) {
  return apiFetch('/api/requests', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

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

/**
 * @returns {Promise<Array>} per-unit allocation rows (org, district, blood
 * type, component, status) for a resolved-via-inventory request.
 */
export function getAllocation(requestId) {
  return apiFetch(`/api/requests/${requestId}/allocation`);
}

/**
 * Confirms physical receipt of one source org's dispatched units on this
 * request. Scoped per org, not the whole request -- a request can be
 * fulfilled by multiple banks/NGOs arriving separately.
 * @param {string} requestId
 * @param {string} orgId - the source org whose delivery is being confirmed
 */
export function confirmDelivery(requestId, orgId) {
  return apiFetch(`/api/requests/${requestId}/confirm-delivery`, {
    method: 'POST',
    body: JSON.stringify({ org_id: orgId }),
  });
}
import { apiFetch } from './client';

/**
 * @param {{org_type?: string, search?: string}} [filters]
 * @returns {Promise<Array>} orgs, never includes invite_code
 */
export function listOrganizations(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiFetch(`/api/organizations${params ? `?${params}` : ''}`);
}

export function getOrganization(id) {
  return apiFetch(`/api/organizations/${id}`);
}

/**
 * @param {{contact_phone?: string, contact_email?: string}} data
 */
export function updateOrganization(id, data) {
  return apiFetch(`/api/organizations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * @returns {Promise<{total_drives: number, total_units: number, units_by_blood_type: object}>}
 */
export function getOrganizationStats(id) {
  return apiFetch(`/api/organizations/${id}/stats`);
}

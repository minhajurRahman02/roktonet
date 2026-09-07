import { apiFetch } from './client';

/**
 * @param {{phone?: string}} [filters]
 * @returns {Promise<Array>} roster, auto-scoped to the caller's own org
 */
export function listDonors(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiFetch(`/api/donors${params ? `?${params}` : ''}`);
}

export function getDonor(id) {
  return apiFetch(`/api/donors/${id}`);
}

/**
 * Assisted registration -- creates a donor with no login access.
 * @param {{org_id: string, full_name: string, phone_number: string, blood_type: string, email?: string, current_district?: string, current_thana?: string, last_donation_date?: string}} data
 */
export function registerDonor(data) {
  return apiFetch('/api/donors', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateDonor(id, data) {
  return apiFetch(`/api/donors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Sends a "set your password" link to a donor who was assisted-registered
 * without a login. Requires an email already on file.
 */
export function inviteDonorLogin(id) {
  return apiFetch(`/api/donors/${id}/invite-login`, { method: 'POST' });
}

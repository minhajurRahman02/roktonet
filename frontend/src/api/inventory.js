import { apiFetch } from './client';

/**
 * @param {{blood_type?: string, component?: string}} [filters]
 * @returns {Promise<Array>} inventory units, auto-scoped to the caller's
 * own org for bank/ngo users -- no org_id needs to be passed here.
 */
export function listInventory(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiFetch(`/api/inventory${params ? `?${params}` : ''}`);
}

/**
 * @param {{org_id: string, blood_type: string, component: string, collection_date: string, expiry_date: string, donor_id?: string}} data
 */
export function addInventoryUnit(data) {
  return apiFetch('/api/inventory', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Confirms physical dispatch of a single unit already allocated to a
 * request (reserved -> dispatched).
 */
export function dispatchUnit(unitId) {
  return apiFetch(`/api/inventory/${unitId}/dispatch`, { method: 'POST' });
}

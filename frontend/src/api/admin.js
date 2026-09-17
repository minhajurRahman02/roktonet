// Admin module service layer (Phase 7.7). One file per the service-layer
// rule; grouped by backend router. Reports live in reports.js because they
// download files rather than return JSON.

import { apiFetch } from './client';

function qs(filters = {}) {
  const clean = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const params = new URLSearchParams(clean).toString();
  return params ? `?${params}` : '';
}

// ---------------------------------------------------------------- users
/** @param {{role?, org_id?, is_verified?, is_active?, search?, from?, to?}} [filters] */
export function listUsers(filters) {
  return apiFetch(`/api/admin/users${qs(filters)}`);
}

/** @returns {Promise<{user: object, requests?, inventory?, outgoing_allocations?, drives?, restock_requests?, donor?, donation_history?, invites?, recent_actions?, notifications}>} */
export function getUser(id) {
  return apiFetch(`/api/admin/users/${id}`);
}

/** @param {{full_name?, email?, org_id?, is_active?}} data -- never role */
export function updateUser(id, data) {
  return apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

/** Primary admin only. */
export function createAdmin({ email, full_name }) {
  return apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ email, full_name }) });
}

/** @returns {Promise<{token: string, expires_in: string, viewing: object}>} */
export function requestViewToken(userId) {
  return apiFetch(`/api/admin/users/${userId}/view-token`, { method: 'POST' });
}

// ------------------------------------------------------------ analytics
export function getOverview() {
  return apiFetch('/api/admin/analytics/overview');
}
export function getActivityFeed(limit = 30) {
  return apiFetch(`/api/admin/analytics/activity-feed?limit=${limit}`);
}
export function getMap(range) {
  return apiFetch(`/api/admin/analytics/map${qs(range)}`);
}
export function getWastage(range) {
  return apiFetch(`/api/admin/analytics/wastage${qs(range)}`);
}
export function getShortage(range) {
  return apiFetch(`/api/admin/analytics/shortage${qs(range)}`);
}
export function getFairness(range) {
  return apiFetch(`/api/admin/analytics/fairness${qs(range)}`);
}
export function getFallback(range) {
  return apiFetch(`/api/admin/analytics/fallback${qs(range)}`);
}
export function getActivity(range) {
  return apiFetch(`/api/admin/analytics/activity${qs(range)}`);
}

// ----------------------------------------------------------- run batch
export function runBatch() {
  return apiFetch('/api/admin/run-batch', { method: 'POST' });
}

// ------------------------------------------------- requests / inventory
export function cancelRequest(id, reason) {
  return apiFetch(`/api/requests/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}

/** @param {{expiry_date?, status?, blood_type?, component?}} data */
export function updateInventoryUnit(unitId, data) {
  return apiFetch(`/api/inventory/${unitId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ------------------------------------------------------- organizations
/** Admin create -- backend generates the invite_code. */
export function createOrganization(data) {
  return apiFetch('/api/organizations', { method: 'POST', body: JSON.stringify(data) });
}

// ---------------------------------------------------------- broadcasts
export function previewBroadcast({ roles, user_ids }) {
  return apiFetch('/api/admin/broadcasts/preview', { method: 'POST', body: JSON.stringify({ roles, user_ids }) });
}
export function sendBroadcast({ message, roles, user_ids }) {
  return apiFetch('/api/admin/broadcasts', { method: 'POST', body: JSON.stringify({ message, roles, user_ids }) });
}
export function listBroadcasts(range) {
  return apiFetch(`/api/admin/broadcasts${qs(range)}`);
}

// --------------------------------------------------------------- audit
/** @param {{action_type?, admin_user_id?, target_type?, from?, to?, limit?}} [filters] */
export function listAudit(filters) {
  return apiFetch(`/api/admin/audit${qs(filters)}`);
}

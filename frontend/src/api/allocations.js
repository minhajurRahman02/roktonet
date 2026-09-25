import { apiFetch } from './client';

/**
 * @returns {Promise<Array>} all allocations where the caller's org is the
 * SOURCE, across every request -- the "outgoing" direction, as opposed to
 * getAllocation(requestId) in api/requests.js which looks up one
 * request's sources.
 */
export function listOutgoingAllocations(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiFetch(`/api/allocations${params ? `?${params}` : ''}`);
}

/**
 * The mirror direction: units allocated TO this org's own requests, for the
 * hospital allocation log. Same endpoint, same joins, filtered on the other
 * side of them.
 *
 * This is the only response in the system that carries patient_name /
 * patient_phone / patient_note. The outgoing direction above deliberately
 * does not select them -- a supplying bank or NGO has no clinical
 * involvement with the recipient.
 *
 * @returns {Promise<Array>} one row per allocated unit, newest request first
 */
export function listIncomingAllocations(filters = {}) {
  const params = new URLSearchParams({ ...filters, direction: 'incoming' }).toString();
  return apiFetch(`/api/allocations?${params}`);
}
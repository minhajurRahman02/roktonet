import { apiFetch } from './client';

/**
 * @returns {Promise<Array>} all allocations where the caller's org is the
 * SOURCE, across every request -- the "outgoing" direction, as opposed to
 * getAllocation(requestId) in api/requests.js which looks up one
 * request's sources.
 */
export function listOutgoingAllocations() {
  return apiFetch('/api/allocations');
}

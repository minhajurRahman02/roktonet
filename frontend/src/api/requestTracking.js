import { apiFetch } from './client';

export function getRequestEvents(id) {
  return apiFetch(`/api/requests/${id}/events`);
}

export function getRequestAllocation(id) {
  return apiFetch(`/api/requests/${id}/allocation`);
}

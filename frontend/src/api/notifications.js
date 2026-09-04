import { apiFetch } from './client';

/**
 * @returns {Promise<Array>} the caller's org's notifications (or all, if admin), newest first
 */
export function getNotifications() {
  return apiFetch('/api/notifications');
}

export function markNotificationRead(id) {
  return apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
}

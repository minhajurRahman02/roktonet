import { apiFetch } from './client';

/**
 * @param {{org_id?: string, district?: string, status?: string}} [filters]
 * For ngo/admin: the caller's own drives (filters ignored). For donor:
 * browse across every NGO, optionally filtered.
 */
export function listDrives(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiFetch(`/api/drives${params ? `?${params}` : ''}`);
}

export function getDrive(id) {
  return apiFetch(`/api/drives/${id}`);
}

/**
 * @param {{org_id: string, title: string, location: string, drive_date: string, target_units?: number}} data
 */
export function createDrive(data) {
  return apiFetch('/api/drives', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function startDrive(id) {
  return apiFetch(`/api/drives/${id}/start`, { method: 'POST' });
}

export function finishDrive(id) {
  return apiFetch(`/api/drives/${id}/finish`, { method: 'POST' });
}

/**
 * @param {string} driveId
 * @param {{donor_id: string, blood_type: string, component: string, quantity?: number}} data
 */
export function logUnit(driveId, data) {
  return apiFetch(`/api/drives/${driveId}/log-unit`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * @returns {Promise<Array>} every unit logged against this drive, joined
 * to donor names, ordered chronologically.
 */
export function getDriveLog(driveId) {
  return apiFetch(`/api/drives/${driveId}/log`);
}
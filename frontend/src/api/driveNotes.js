import { apiFetch } from './client';

/**
 * Notes an NGO keeps against dates on its scheduler calendar.
 *
 * Scoped to the caller's own organization by the server; there is no
 * org_id parameter anywhere in this file, which is what makes it
 * impossible to read another NGO's notes by accident.
 */

/**
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @returns {Promise<Array<{note_id, note_date, body, updated_at}>>}
 */
export function listDriveNotes(from, to) {
  return apiFetch(`/api/drive-notes?from=${from}&to=${to}`);
}

/**
 * Saves the note for one date. An empty or whitespace-only body deletes
 * it, which is what clearing the box and pressing save means.
 *
 * @param {string} date - YYYY-MM-DD
 * @param {string} body
 */
export function saveDriveNote(date, body) {
  return apiFetch(`/api/drive-notes/${date}`, {
    method: 'PUT',
    body: JSON.stringify({ body }),
  });
}

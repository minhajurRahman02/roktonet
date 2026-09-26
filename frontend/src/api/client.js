// The one place that knows HOW to talk to the backend -- base URL,
// credentials, and error handling. Every other api/*.js file calls this
// instead of using fetch() directly (per frontend_standards.md's service
// layer rule).

// In dev, requests go to '/api/...' and Vite's proxy (vite.config.js)
// forwards them to localhost:3000, making them same-origin. In a
// production build there's no dev server to proxy through, so we need
// the real deployed backend URL -- set via VITE_API_URL at build time.
import { getViewAs } from '../utils/viewAs';

const API_BASE = import.meta.env.VITE_API_URL || '';

export { API_BASE };

// Admin view-as (Phase 7.7): when a read-only token is active it is sent
// as a Bearer header on every request. The backend gives Bearer precedence
// over the cookie, so every page renders as the viewed user while the
// admin's own cookie session stays untouched underneath.
export function authHeaders() {
  const viewAs = getViewAs();
  return viewAs ? { Authorization: `Bearer ${viewAs.token}` } : {};
}

/**
 * @param {string} path - e.g. '/api/auth/login'
 * @param {RequestInit} [options]
 * @returns {Promise<any>} the parsed JSON response body
 * @throws {Error} with a human-readable message on any non-2xx response
 */
export async function apiFetch(path, options = {}) {
  // A FormData body (file uploads) must NOT get a manually-set
  // Content-Type -- the browser sets one itself, including the
  // multipart boundary, which is impossible to construct correctly by
  // hand. Every other call still gets the JSON default, unchanged.
  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${API_BASE}${path}`, {
    // Required for httpOnly cookies to be sent/received on cross-origin
    // requests (production). Harmless on same-origin (dev via proxy).
    credentials: 'include',
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...options.headers,
    },
  });

  // Some endpoints (e.g. logout) may return no body at all.
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    // Every backend error response has a plain-language `error` field
    // (per our route conventions) -- surface that directly rather than
    // a generic "Request failed" message.
    const message = data?.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
/**
 * Fetches a file-streaming endpoint and hands the result to the browser
 * as a download.
 *
 * Endpoints that stream a file cannot go through apiFetch, which parses
 * every response as JSON. They still belong behind the service layer
 * though, which is why this lives here rather than as a fetch() call
 * inside a component: same base URL, same credentials, same auth
 * headers, same error shape.
 *
 * The filename comes from the server's Content-Disposition rather than
 * being guessed, so what lands in the Downloads folder matches what the
 * server thinks it sent, including the .zip that a multi-table CSV
 * export actually produces.
 *
 * @param {string} path - e.g. '/api/drives/<id>/report?format=pdf'
 * @param {string} fallbackName - used only if the server sends no filename
 * @returns {Promise<string>} the filename the browser saved
 */
export async function downloadFile(path, fallbackName) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: authHeaders(),
  });

  if (!res.ok) {
    // A failed download still returns JSON, so the real message is
    // recoverable. Falling back to the status code matters for the
    // cases where it is not, such as a proxy error page.
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // body was not JSON; keep the status message
    }
    throw new Error(message);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match ? match[1] : fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked immediately: the click has already handed the blob to the
  // browser's download manager, and leaving object URLs alive pins the
  // whole file in memory for the life of the tab.
  URL.revokeObjectURL(url);
  return filename;
}

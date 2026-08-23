// The one place that knows HOW to talk to the backend -- base URL,
// credentials, and error handling. Every other api/*.js file calls this
// instead of using fetch() directly (per frontend_standards.md's service
// layer rule).

// In dev, requests go to '/api/...' and Vite's proxy (vite.config.js)
// forwards them to localhost:3000, making them same-origin. In a
// production build there's no dev server to proxy through, so we need
// the real deployed backend URL -- set via VITE_API_URL at build time.
const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * @param {string} path - e.g. '/api/auth/login'
 * @param {RequestInit} [options]
 * @returns {Promise<any>} the parsed JSON response body
 * @throws {Error} with a human-readable message on any non-2xx response
 */
export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    // Required for httpOnly cookies to be sent/received on cross-origin
    // requests (production). Harmless on same-origin (dev via proxy).
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
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

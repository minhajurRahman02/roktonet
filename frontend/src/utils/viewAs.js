// Admin "view as user" session storage (Phase 7.7, spec 2.5).
//
// The view-as token is a short-lived (10 min) read-only JWT minted FOR the
// target user. It is deliberately kept OUT of the auth cookie: the cookie
// stays the admin's real session, so exiting view-as is just "stop sending
// the Bearer header" -- nothing to re-login. sessionStorage (not
// localStorage) so it dies with the tab and never leaks across tabs.
//
// client.js reads this on every request and adds `Authorization: Bearer`
// when present; the backend gives Bearer precedence over the cookie.

const KEY = 'roktonet_view_as';

/** @returns {{token: string, viewing: object, expiresAt: number}|null} */
export function getViewAs() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.token || Date.now() >= parsed.expiresAt) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {string} token
 * @param {object} viewing - { user_id, full_name, email, role, org_id }
 * @param {string} expiresIn - e.g. '10m' (from the backend); parsed loosely
 */
export function setViewAs(token, viewing, expiresIn = '10m') {
  const match = /^(\d+)([smh])$/.exec(expiresIn);
  const mult = { s: 1000, m: 60000, h: 3600000 };
  const ms = match ? Number(match[1]) * mult[match[2]] : 10 * 60000;
  sessionStorage.setItem(KEY, JSON.stringify({ token, viewing, expiresAt: Date.now() + ms }));
}

export function clearViewAs() {
  sessionStorage.removeItem(KEY);
}

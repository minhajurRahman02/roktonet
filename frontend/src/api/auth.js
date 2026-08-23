import { apiFetch } from './client';

/**
 * @param {{email: string, password: string, role: string, full_name?: string, invite_code?: string}} data
 * @returns {Promise<{user: object, message: string}>}
 */
export function register(data) {
  return apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * @returns {Promise<{message: string, email?: string}>}
 */
export function verifyEmail(token) {
  return apiFetch(`/api/auth/verify?token=${encodeURIComponent(token)}`);
}

/**
 * @returns {Promise<{user: {user_id: string, email: string, role: string, org_id: string|null, full_name: string|null}}>}
 */
export function login(email, password) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return apiFetch('/api/auth/logout', { method: 'POST' });
}

/**
 * @returns {Promise<object>} the current user, joined with org info -- or throws (401) if not logged in
 */
export function getMe() {
  return apiFetch('/api/auth/me');
}

export function forgotPassword(email) {
  return apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token, newPassword) {
  return apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

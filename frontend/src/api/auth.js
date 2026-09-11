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

/**
 * @param {{full_name?: string, avatar_url?: string}} data
 */
export function updateMe(data) {
  return apiFetch('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * For a logged-in user changing their own password (distinct from the
 * forgot-password flow above, which is for someone who can't log in at all).
 */
export function changePassword(currentPassword, newPassword) {
  return apiFetch('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

/**
 * @param {File} file
 * @returns {Promise<{avatar_url: string}>}
 */
export function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);
  return apiFetch('/api/auth/me/avatar', {
    method: 'POST',
    body: formData,
  });
}
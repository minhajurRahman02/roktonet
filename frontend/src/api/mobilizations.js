import { apiFetch } from './client';

export function getMobilizationsForRequest(requestId) {
  return apiFetch(`/api/mobilizations/${requestId}`);
}

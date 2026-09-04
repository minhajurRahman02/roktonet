import { apiFetch } from './client';

/**
 * @returns {Promise<string[]>} all 64 real district names, alphabetically sorted
 */
export function getDistricts() {
  return apiFetch('/api/locations/districts');
}

/**
 * @param {string} district
 * @returns {Promise<string[]>} thana/upazila names for that district only
 */
export function getThanas(district) {
  return apiFetch(`/api/locations/thanas?district=${encodeURIComponent(district)}`);
}

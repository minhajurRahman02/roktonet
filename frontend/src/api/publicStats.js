import { API_BASE } from './client';

/**
 * Aggregate figures for the landing page's live section.
 *
 * Deliberately NOT routed through apiFetch. apiFetch sends credentials and
 * the admin view-as bearer header, and this is the one endpoint in RoktoNet
 * that is meant to answer an anonymous visitor. Sending a session cookie to
 * it would be harmless but wrong: it would suggest the response depends on
 * who is asking, and it does not.
 *
 * The response carries counts, rates and district names only. No
 * organization names, no request or unit ids, and nothing about a patient
 * or a donor. backend/routes/publicStats.js states the rule and the
 * reasoning for it.
 *
 * @returns {Promise<{
 *   generated_at: string,
 *   totals: object,
 *   by_urgency: Array<{tier: string, resolved: number}>,
 *   by_fulfillment: Array<{path: string, count: number, share: number}>,
 *   flows: Array<{from_district: string, to_district: string, urgency_tier: string, units: number, last_at: string}>
 * }>}
 */
export async function getPublicStats() {
  const res = await fetch(`${API_BASE}/api/public/stats`, { credentials: 'omit' });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // not JSON; keep the status message
    }
    throw new Error(message);
  }
  return res.json();
}

export default getPublicStats;

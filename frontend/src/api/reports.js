// Admin reports (Phase 7.7). These endpoints stream files, not JSON, so
// they can't go through apiFetch's JSON parsing -- but they still go
// through the same base URL, credentials and auth headers, so the
// service-layer rule holds: no component ever calls fetch() directly.

import { API_BASE, authHeaders } from './client';

/** @returns {Promise<{formats: string[], datasets: {key, title, columns}[], snapshot: {key, title, includes}}>} */
export async function getReportCatalog() {
  const res = await fetch(`${API_BASE}/api/admin/reports`, { credentials: 'include', headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

/**
 * Downloads a report and hands it to the browser as a file. The filename
 * comes from the backend's Content-Disposition so it matches exactly what
 * the audit log records.
 *
 * @param {string} dataset - a dataset key, or 'snapshot'
 * @param {{format: 'csv'|'xlsx'|'pdf', from?: string, to?: string}} opts -- omit from/to for all time
 */
export async function downloadReport(dataset, { format, from, to }) {
  const params = new URLSearchParams({ format });
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const res = await fetch(`${API_BASE}/api/admin/reports/${dataset}?${params}`, {
    credentials: 'include',
    headers: authHeaders(),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // body wasn't JSON; keep the status message
    }
    throw new Error(message);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match ? match[1] : `roktonet_${dataset}.${format === 'csv' && dataset === 'snapshot' ? 'zip' : format}`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return filename;
}

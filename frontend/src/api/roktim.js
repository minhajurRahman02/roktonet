// Roktim's client module -- the ONLY place in the frontend that knows the
// forecast service's address.
//
// WHY THIS DOESN'T USE client.js
// ------------------------------
// Same reason engine.js doesn't: client.js is hardcoded to the backend's base
// URL (VITE_API_URL), and the forecast service is a separate Render service on
// its own domain. But the deeper reason is architectural, not mechanical --
// the Roktim design puts the backend OUTSIDE the advisory path entirely
// (ROKTIM_UI_SPEC.md section 2). The browser asks the forecast service
// directly, and the backend is involved afterwards only to persist the log.
// That is what keeps Roktim removable: drop one table, one route file, one
// folder, and nothing else in RoktoNet changes.
//
// EVERY FUNCTION HERE RETURNS null ON FAILURE AND NEVER THROWS
// ------------------------------------------------------------
// This is a deliberate, documented deviation from frontend_standards.md
// section 5's 5-state matrix, which mandates a visible error state with Retry.
// The justification is in ROKTIM_UI_SPEC.md section 8: Roktim is optional and
// runs on a free tier that sleeps after 15 minutes idle. A red "Roktim
// unavailable" box would be the state a supervisor sees most often, and it
// would imply the system is broken when it is behaving exactly as designed.
// So callers get null and render nothing.
//
// The Roktim PAGE is the one exception to "render nothing": it is a page ABOUT
// Roktim, so a blank page would be worse than an honest empty state. It reads
// the same null and decides for itself.

const ROKTIM_BASE = import.meta.env.VITE_ROKTIM_URL || '';

// Cold-start tolerance, per ROKTIM_UI_SPEC.md section 8. The strip is typed
// against live, so it must never make the form feel slow; the card and page
// are already a "result" moment where a wait is acceptable.
export const TIMEOUT_STRIP = 8000;
export const TIMEOUT_CARD = 25000;

/**
 * One fetch with a hard timeout that resolves to null instead of throwing.
 *
 * AbortController rather than Promise.race: racing leaves the real request
 * running in the background, and on a free tier that means a queue of
 * abandoned cold-start requests behind every timeout.
 */
async function ask(path, { timeout = TIMEOUT_CARD, method = 'GET', body } = {}) {
  if (!ROKTIM_BASE) return null; // not configured -> Roktim is simply absent

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${ROKTIM_BASE}${path}`, {
      method,
      signal: controller.signal,
      // No cookies, ever. The forecast service holds no session and reads no
      // credentials; sending them would be the only thing making this a
      // credentialed cross-origin request.
      credentials: 'omit',
      ...(body
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Abort, network failure, CORS rejection, malformed JSON -- all the same
    // outcome as far as the UI is concerned: Roktim has nothing to say.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wake-up ping, mirroring warmEngine(). Free-tier services sleep after 15
 * minutes and take 30-60s to wake; a user reading the request form should not
 * be the one paying that cost.
 * @returns {Promise<void>} always resolves
 */
export async function warmRoktim() {
  if (!ROKTIM_BASE) return;
  try {
    await fetch(`${ROKTIM_BASE}/health`, { method: 'GET', credentials: 'omit' });
  } catch {
    // A service mid-wake refuses connections outright. Expected; ignored.
  }
}

/**
 * Service readiness. Unlike the rest of this module the page WANTS to
 * distinguish "down" from "never asked", so this returns a shape rather than
 * null-on-failure.
 * @returns {Promise<{ok: boolean, schema_version?: number, generated?: string}>}
 */
export async function health() {
  const data = await ask('/health', { timeout: TIMEOUT_CARD });
  if (!data || data.status !== 'ok') return { ok: false };
  return { ok: true, schema_version: data.schema_version, generated: data.generated };
}

// Which artefact is answering. Cached because it is a property of the running
// service and cannot change while the page is open.
//
// This is fetched by the BROWSER and passed through to the log write, rather
// than looked up by the Node backend when it stores the row. If the backend
// looked it up, the backend would have to call the forecast service, which is
// precisely the coupling the whole design avoids. The cost is that provenance
// arrives as client-supplied data; the backend validates its shape and the
// trade is recorded in routes/roktim.js.
let metaPromise = null;

/**
 * @returns {Promise<{schema_version: number, generated: string}|null>}
 */
export function modelMeta() {
  if (!metaPromise) {
    metaPromise = health().then((h) =>
      h.ok && h.schema_version != null && h.generated
        ? { schema_version: h.schema_version, generated: h.generated }
        : null,
    );
    // Never cache a failure: one cold start would otherwise leave every
    // advisory for the rest of the session unloggable.
    metaPromise = metaPromise.then((m) => {
      if (!m) metaPromise = null;
      return m;
    });
  }
  return metaPromise;
}

/**
 * The advisory itself.
 *
 * ON current_stock_units
 * ----------------------
 * The service's risk rule needs stock to compute headroom. A hospital holds no
 * RoktoNet inventory by design -- inventory_units belong to blood banks and
 * NGOs -- so 0 here is a FACT about the schema, not a placeholder. It is
 * declared as `organization` scope so the response carries the caveat saying
 * so.
 *
 * The consequence has to be understood rather than hidden: in production there
 * is no live admissions feed, so `demand_outlook` comes back `unavailable` and
 * the service's `at_risk` reduces to the headroom test alone -- which, with
 * zero stock, is always true. That is why no Roktim surface renders `at_risk`
 * as a risk claim when the outlook is unavailable (see isRiskClaimMeaningful).
 * The field is still logged verbatim, next to the basis that explains it.
 *
 * @param {{district: string, unitsRequired: number, neededByDate: string,
 *          recentAdmissions?: number[], currentStockUnits?: number,
 *          timeout?: number}} args
 * @returns {Promise<object|null>}
 */
export function riskCheck({
  district,
  unitsRequired,
  neededByDate,
  recentAdmissions,
  currentStockUnits = 0,
  timeout = TIMEOUT_CARD,
}) {
  if (!district || !neededByDate || !unitsRequired) return Promise.resolve(null);
  return ask('/forecast/risk-check', {
    method: 'POST',
    timeout,
    body: {
      district,
      units_required: Number(unitsRequired),
      current_stock_units: Number(currentStockUnits),
      needed_by_date: neededByDate,
      stock_scope: 'organization',
      ...(recentAdmissions?.length ? { recent_admissions: recentAdmissions } : {}),
    },
  });
}

/**
 * `at_risk` only carries information when the demand-pressure signal actually
 * ran. With outlook `unavailable` it is the headroom fallback talking, which
 * says nothing about dengue and everything about the caller's stock figure.
 *
 * Exported so every surface applies the same test rather than each deciding.
 */
export function isRiskClaimMeaningful(advisory) {
  return !!advisory && advisory.decision?.demand_outlook !== 'unavailable';
}

/** One unit's full 52-week seasonal profile with its calibrated band. */
export function seasonalCurve({ unit, grain = 'district', horizon = 2, level = '0.80' }) {
  if (!unit) return Promise.resolve(null);
  const q = new URLSearchParams({ unit, grain, horizon: String(horizon), level });
  return ask(`/forecast/seasonal-curve?${q}`);
}

/**
 * Every unit's seasonal profile in one response, as bare weekly numbers.
 * This is what the 64-sparkline grid runs on; fetching 64 full curves
 * instead would be roughly 1.5 MB against 25 KB.
 */
export function seasonalGrid(grain = 'district') {
  return ask(`/forecast/seasonal-grid?grain=${grain}`);
}

/** Every district (or division) the model covers, with its volume tier. */
export function units(grain = 'district') {
  return ask(`/forecast/units?grain=${grain}`);
}

/** Expected demand across the 8 divisions (or 64 districts) at one horizon. */
export function regionalDemand({ horizon = 2, grain = 'division', level = '0.80' } = {}) {
  const q = new URLSearchParams({ horizon: String(horizon), grain, level });
  return ask(`/forecast/regional-demand?${q}`);
}

/** Provenance, measured accuracy, and the stated limitations. */
export function modelInfo() {
  return ask('/model-info');
}

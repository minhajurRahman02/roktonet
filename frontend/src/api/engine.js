// The optimization engine is the ONE service the frontend talks to
// directly instead of going through the Node backend, and only ever for
// this single purpose: waking it up.
//
// Why it can't use client.js like every other api/*.js file: client.js is
// hardcoded to the BACKEND base URL (VITE_API_URL). The engine is a
// separate Render service on its own domain, so it needs its own base URL
// (VITE_ENGINE_URL). Everything else about the service-layer rule still
// holds -- no component calls fetch() directly, this file is the only
// place that knows the engine's address.
//
// Why this exists at all: on Render's free tier a web service spins down
// after 15 minutes idle and takes ~30-60s to wake. The backend is already
// woken on every page load by AuthContext's getMe() call, but NOTHING
// touches the engine until someone actually submits a request -- which is
// exactly the moment you don't want a 60-second wait, since that's the
// allocation the whole project exists to demonstrate. Pinging it on app
// mount means it wakes in parallel with the backend, during the time a
// real user spends reading the landing page and logging in.
const ENGINE_BASE = import.meta.env.VITE_ENGINE_URL || '';

/**
 * Fire-and-forget wake-up ping to the optimization engine.
 *
 * Deliberately swallows every error and never throws: this is a
 * background optimization, not a feature. If the engine is down, or
 * VITE_ENGINE_URL isn't set (local dev, where nothing sleeps anyway),
 * the app must behave exactly as it did before -- no error state, no
 * console noise, no impact on render.
 *
 * @returns {Promise<void>} always resolves, never rejects
 */
export async function warmEngine() {
  // No URL configured -> local dev or a misconfigured build. Either way
  // there's nothing to wake, so do nothing rather than fetch('/health')
  // against our own origin and 404.
  if (!ENGINE_BASE) return;

  try {
    await fetch(`${ENGINE_BASE}/health`, {
      method: 'GET',
      // No cookies are sent or wanted here. This also keeps the request a
      // simple CORS request, so the browser sends no preflight -- one
      // round trip instead of two, which matters when the whole point is
      // reaching a sleeping server as fast as possible.
      credentials: 'omit',
    });
  } catch {
    // Expected and ignored: a service mid-wake can refuse the connection
    // outright. The next real call will wake it anyway; this ping only
    // ever makes things faster, never worse.
  }
}

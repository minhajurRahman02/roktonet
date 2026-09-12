// Single helper for writing to request_events -- every real pipeline
// stage that wants to log something calls this, rather than each file
// building its own INSERT. Keeps the event shape consistent everywhere.

const pool = require('../db');

/**
 * @param {string} requestId
 * @param {string} eventType - one of the documented event_type values (see migration)
 * @param {string} message - human-readable, generated from real data -- never fabricated
 * @param {object|null} [metadata] - optional structured data (counts, ids, etc.)
 */

}

module.exports = { logRequestEvent };

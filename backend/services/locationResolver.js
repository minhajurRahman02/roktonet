// Resolves a freely-typed thana/upazila name to a canonical bd_thanas row,
// scoped to the district the person already selected (via the cascading
// datalist on the frontend). Shared by donor registration and organization
// registration -- same resolution rules for both, so donor-side and
// org-side location data end up comparable.
//
// Design (see project chat log for the full Tier 1/2/3 discussion):
//   - The datalist prevents most typos at the source by suggesting real
//     thana names filtered to the selected district.
//   - This resolver is the safety net for whatever still gets typed
//     freely -- normalizes the input, then ranks candidates within that
//     district by trigram similarity (pg_trgm), not exact string equality.
//   - Below the confidence threshold, we deliberately return no match
//     rather than guess -- a wrong resolution (matching the wrong thana)
//     is worse than an honest "couldn't resolve" that falls back to
//     district-level matching. See known limitation below.
//
// Known limitation (disclosed, not silently assumed away): this only
// resolves typos/variants of REAL thana names. It cannot translate a
// neighborhood name to its parent thana (e.g. "Matuail" -- a real
// neighborhood inside Jatrabari thana -- won't resolve, because it isn't
// itself a thana name in bd_thanas). That would need a separate
// neighborhood-alias dataset, out of scope for this pass. The mitigation
// is the datalist itself: it lists real thana names, so people select
// "Jatrabari" rather than free-type "Matuail" in the first place.

const pool = require('../db');

// Below this similarity score, we don't trust the match enough to use it.
// Chosen from real testing during this migration's build: genuine typos of
// the right thana scored 0.5-0.6+ and clearly separated from the next
// candidate; neighborhood names that aren't thanas at all scored well
// under 0.15 (noise). 0.3 sits safely between those two clusters.
const SIMILARITY_THRESHOLD = 0.3;

function normalize(raw) {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * @param {string} rawThana - freely-typed thana/upazila text
 * @param {string} district - the district already selected (scopes the search)
 * @returns {Promise<{thana_id: string, name: string, score: number} | null>}
 */
async function resolveThana(rawThana, district) {
  if (!rawThana || !district) return null;

  const normalized = normalize(rawThana);

  const result = await pool.query(
    `SELECT thana_id, name, similarity(name, $1) AS score
     FROM bd_thanas
     WHERE district = $2
     ORDER BY score DESC
     LIMIT 1`,
    [normalized, district]
  );

  if (result.rows.length === 0) return null;

  const best = result.rows[0];
  if (best.score < SIMILARITY_THRESHOLD) return null;

  return { thana_id: best.thana_id, name: best.name, score: best.score };
}

module.exports = { resolveThana, SIMILARITY_THRESHOLD };

// District name translation between RoktoNet and the forecast model.
//
// THE PROBLEM THIS EXISTS TO FIX
// ------------------------------
// The two halves of the project learned their district names from different
// sources and they do not agree on five of the sixty-four:
//
//   RoktoNet (seed_bd_thanas.sql)      forecast model (geoBoundaries + DGHS)
//   ---------------------------------  ------------------------------------
//   Barisal                            Barishal
//   Chapainawabganj                    Chapai Nawabganj
//   Comilla                            Cumilla
//   Coxsbazar                          Cox's Bazar
//   Jhalakathi                         Jhalokati
//
// Plus one division: Barisal / Barishal.
//
// WHY IT HAD TO BE CAUGHT BEFORE SHIPPING
// ---------------------------------------
// The forecast service rejects an unknown district with a 400, and Roktim's
// client turns every failure into null, and every Roktim surface renders
// nothing on null. So a hospital in Comilla would have seen no advisory, ever,
// and it would have looked exactly like the free-tier service being asleep.
// The fail-silent policy that makes Roktim safe would also have hidden this
// permanently. It was found by diffing the two name lists, not by using the
// app.
//
// WHY TRANSLATE RATHER THAN RENAME EITHER SIDE
// --------------------------------------------
// Renaming in RoktoNet would mean editing seed_bd_thanas.sql and migrating
// every organizations.district and donors.current_district value already in
// the live database. Renaming in the model would mean regenerating
// forecast_model.json, which changes its sha256 and breaks the provenance
// chain recorded in PHASE6C_SETUP.md. Neither is worth it for a naming
// disagreement, and both spellings are legitimate: RoktoNet uses the older
// anglicisations, the dataset uses the current official ones.
//
// So the disagreement is recorded here, in one place, and translated at the
// boundary. This file is also the report's evidence that the mismatch was
// found and handled rather than discovered during the viva.

/** RoktoNet spelling -> forecast model spelling. Only the five that differ. */
const TO_MODEL = {
  Barisal: 'Barishal',
  Chapainawabganj: 'Chapai Nawabganj',
  Comilla: 'Cumilla',
  Coxsbazar: "Cox's Bazar",
  Jhalakathi: 'Jhalokati',
};

/** The inverse, built from the same object so the two can never drift apart. */
const TO_APP = Object.fromEntries(Object.entries(TO_MODEL).map(([a, m]) => [m, a]));

/**
 * A RoktoNet district or division name as the forecast model spells it.
 * Names that already agree pass through untouched, which is 59 of 64.
 * @param {string} name
 * @returns {string}
 */
export function toModelName(name) {
  if (!name) return name;
  const trimmed = String(name).trim();
  return TO_MODEL[trimmed] || trimmed;
}

/**
 * A forecast model name as RoktoNet spells it. Used when the model's output
 * is displayed next to RoktoNet's own data, so one screen never shows both
 * "Comilla" and "Cumilla" and looks like it has two districts.
 * @param {string} name
 * @returns {string}
 */
export function toAppName(name) {
  if (!name) return name;
  const trimmed = String(name).trim();
  return TO_APP[trimmed] || trimmed;
}

/** The five disagreements, for the model card's data-provenance note. */
export const NAME_DISAGREEMENTS = Object.entries(TO_MODEL).map(([app, model]) => ({
  app,
  model,
}));

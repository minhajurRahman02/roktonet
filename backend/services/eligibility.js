// Single source of truth for donor eligibility cooldowns. Previously this
// lived only inside donorFallback.js (used to decide who to INVITE for a
// patient request) -- it was never actually wired into the log-unit
// endpoint that records a REAL donation, which meant nothing stopped a
// donor from being logged for another donation five minutes after their
// last one. Extracted here so both places check the exact same rule
// instead of drifting apart the way donorFallback.js's location-ranking
// logic already did once (see project history).
//
// Cooldown windows sourced from real donation-interval guidelines, not
// invented: whole blood from Bangladesh Specialized Hospital's published
// blood bank guideline (4-month male interval used as a single blanket
// figure -- the source splits by donor sex, which this schema doesn't
// track, a disclosed simplification); platelets and plasma from
// consistently-cited international intervals (7 and 28 days respectively).
const ELIGIBILITY_COOLDOWN_DAYS = { whole_blood: 120, platelets: 7, plasma: 28 };

/**
 * @param {string|Date|null} lastDonationDate
 * @param {string} component - 'whole_blood' | 'platelets' | 'plasma'
 * @returns {{ eligible: boolean, eligibleDate: Date|null }}
 */
function getEligibility(lastDonationDate, component) {
  if (!lastDonationDate) return { eligible: true, eligibleDate: null };

  const cooldownDays = ELIGIBILITY_COOLDOWN_DAYS[component] || ELIGIBILITY_COOLDOWN_DAYS.whole_blood;
  const eligibleDate = new Date(lastDonationDate);
  eligibleDate.setDate(eligibleDate.getDate() + cooldownDays);

  return { eligible: new Date() >= eligibleDate, eligibleDate };
}

module.exports = { ELIGIBILITY_COOLDOWN_DAYS, getEligibility };

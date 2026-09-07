// Mirrors backend/services/eligibility.js -- kept in sync manually, same
// pattern already used for the blood-compatibility chart between
// donorFallback.js and compatibility.py. This is a live preview only;
// the real enforcement happens server-side in drives.js's log-unit
// endpoint, which is what actually stops an ineligible submission.
const ELIGIBILITY_COOLDOWN_DAYS = { whole_blood: 120, platelets: 7, plasma: 28 };

export function getEligibility(lastDonationDate, component) {
  if (!lastDonationDate) return { eligible: true, eligibleDate: null };

  const cooldownDays = ELIGIBILITY_COOLDOWN_DAYS[component] || ELIGIBILITY_COOLDOWN_DAYS.whole_blood;
  const eligibleDate = new Date(lastDonationDate);
  eligibleDate.setDate(eligibleDate.getDate() + cooldownDays);

  return { eligible: new Date() >= eligibleDate, eligibleDate };
}

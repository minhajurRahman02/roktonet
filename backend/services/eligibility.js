// Donor eligibility, rewritten after reviewing a real Bangladesh blood
// donation protocol document plus independent research. The previous
// version checked a single flat cooldown per component against
// last_donation_date -- this version tracks two more real dimensions:
// donor sex (whole blood's interval genuinely differs by sex) and which
// component was last donated (the wait before the NEXT donation depends
// on both what was just given and what's being asked for next -- these
// are NOT symmetric).
//
// Sourcing, and where sources genuinely disagreed:
//   - Whole blood base interval: 120 days (male) / 180 days (female).
//     Independently verified against two separate real Bangladesh
//     sources (a hospital's published blood bank guideline and an
//     academic medical journal) that agree with each other. A
//     user-provided reference document claimed 90/120 days instead --
//     rejected after those numbers didn't match anything independently
//     verifiable, alongside other signs the document may not be
//     authentic (see project history for the full reasoning).
//   - Platelets: 7 days, plasma: 28 days -- consistently cited across
//     every source checked, no real dispute.
//   - The crossover matrix below: real sources disagreed even with each
//     other here (a US blood center says whole-blood-to-platelets is 7
//     days; the UK's official JPAC guidelines say 4 weeks). Resolved by
//     taking the more conservative (longer) credible figure at each
//     crossover, since patient/donor safety was judged to matter more
//     than matching any single source exactly.
//   - Platelets-to-plasma specifically: no clean source found for this
//     exact direction. Defaulted to plasma's own 28-day interval (the
//     conservative choice) rather than a 48-hour figure found on a
//     commercial US plasma-donation site, which reflects a much more
//     permissive context (for-profit plasma collection) than the
//     hospital/NGO blood banking this system models.
//
// Explicitly out of scope: Double Red Cell (2RBC) apheresis as a fourth
// component -- not clearly relevant to what an NGO blood drive in
// Bangladesh realistically collects, and a real further scope expansion
// on top of everything else here.

const WHOLE_BLOOD_INTERVAL_DAYS = { male: 120, female: 180 };

// CROSSOVER_DAYS[lastComponent][nextComponent] = days to wait, EXCEPT
// whole_blood -> whole_blood, which is sex-specific (see
// WHOLE_BLOOD_INTERVAL_DAYS above) and handled as a special case in
// getEligibility rather than a fixed number here.
const CROSSOVER_DAYS = {
  whole_blood: { platelets: 28, plasma: 28 },
  platelets: { whole_blood: 7, platelets: 7, plasma: 28 },
  plasma: { whole_blood: 28, platelets: 28, plasma: 28 },
};

// Rolling 365-day window, not calendar year -- consistent with every
// other part of this eligibility model already being pure date
// arithmetic rather than calendar-boundary-based.
const ANNUAL_MAX = {
  whole_blood: { male: 3, female: 2 },
  platelets: 24,
  plasma: 12,
};

/**
 * @param {object} donor - needs last_donation_date, last_donation_component, sex
 * @param {string} requestedComponent - 'whole_blood' | 'platelets' | 'plasma'
 * @returns {{ eligible: boolean, eligibleDate: Date|null, reason?: string }}
 */
function getEligibility(donor, requestedComponent) {
  const { last_donation_date: lastDate, last_donation_component: lastComponent, sex } = donor;

  if (!lastDate || !lastComponent) {
    return { eligible: true, eligibleDate: null };
  }

  let cooldownDays;
  if (lastComponent === 'whole_blood' && requestedComponent === 'whole_blood') {
    // The only cell in the matrix that depends on sex. A legacy donor
    // with no sex on file (predates this field) gets the longer, safer
    // interval rather than guessing -- never the shorter one.
    cooldownDays = WHOLE_BLOOD_INTERVAL_DAYS[sex] || WHOLE_BLOOD_INTERVAL_DAYS.female;
  } else {
    cooldownDays = CROSSOVER_DAYS[lastComponent]?.[requestedComponent];
    if (cooldownDays === undefined) cooldownDays = WHOLE_BLOOD_INTERVAL_DAYS.female; // unknown pairing -- fail safe, not permissive
  }

  const eligibleDate = new Date(lastDate);
  eligibleDate.setDate(eligibleDate.getDate() + cooldownDays);

  if (new Date() < eligibleDate) {
    return { eligible: false, eligibleDate, reason: 'cooldown' };
  }
  return { eligible: true, eligibleDate: null };
}

/**
 * The annual cap check is separate from getEligibility because it needs
 * a donation COUNT, which only the database can answer -- callers fetch
 * this themselves (a single COUNT query, cheap) and pass it in, rather
 * than this module reaching into the database directly.
 *
 * @param {number} donationsInPastYear - count of this donor's donations
 *   of `component` within the trailing 365 days
 * @param {string} component
 * @param {string} sex
 */
function isUnderAnnualCap(donationsInPastYear, component, sex) {
  const max = component === 'whole_blood' ? ANNUAL_MAX.whole_blood[sex] || ANNUAL_MAX.whole_blood.female : ANNUAL_MAX[component];
  return donationsInPastYear < max;
}

module.exports = { getEligibility, isUnderAnnualCap, WHOLE_BLOOD_INTERVAL_DAYS, CROSSOVER_DAYS, ANNUAL_MAX };
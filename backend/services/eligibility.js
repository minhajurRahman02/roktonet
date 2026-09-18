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
//
// ---------------------------------------------------------------------
// 7.7a: this module is now the ONLY source of truth for eligibility.
//
// donors.eligibility_status used to sit alongside it in the database. It
// was written once at INSERT, hardcoded to 'eligible' by both
// registration paths, and never updated by anything, so it was wrong from
// the moment each row was created. Six separate places read it and
// reported the same falsehood. It has been dropped
// (migration_drop_eligibility_status.sql).
//
// Everything that used to read that column now derives the answer here.
// That includes SQL-level filtering, which is why this module also emits
// a SQL expression: the alternative was hand-writing the cooldown rules a
// third time inside a query, which is exactly how the two copies would
// drift apart again. The SQL is GENERATED from the same constants the
// JavaScript uses, so there is one place to change a number.
// ---------------------------------------------------------------------

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

const COMPONENTS = ['whole_blood', 'platelets', 'plasma'];

// Short labels for the compact roster display, e.g. "WB:128, Plat:5, Plas:21".
const SHORT_LABELS = { whole_blood: 'WB', platelets: 'Plat', plasma: 'Plas' };

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

  const cooldownDays = cooldownFor(lastComponent, requestedComponent, sex);

  const eligibleDate = new Date(lastDate);
  eligibleDate.setDate(eligibleDate.getDate() + cooldownDays);

  if (new Date() < eligibleDate) {
    return { eligible: false, eligibleDate, reason: 'cooldown' };
  }
  return { eligible: true, eligibleDate: null };
}

/**
 * The single cooldown lookup, extracted so getEligibility, the breakdown
 * below, and the SQL generator all agree by construction.
 */
function cooldownFor(lastComponent, requestedComponent, sex) {
  if (lastComponent === 'whole_blood' && requestedComponent === 'whole_blood') {
    // The only cell in the matrix that depends on sex. A legacy donor
    // with no sex on file (predates this field) gets the longer, safer
    // interval rather than guessing -- never the shorter one.
    return WHOLE_BLOOD_INTERVAL_DAYS[sex] || WHOLE_BLOOD_INTERVAL_DAYS.female;
  }
  const days = CROSSOVER_DAYS[lastComponent]?.[requestedComponent];
  // Unknown pairing -- fail safe, not permissive.
  return days === undefined ? WHOLE_BLOOD_INTERVAL_DAYS.female : days;
}

/**
 * All three components at once, which is what a roster view actually
 * needs. Replaces the old "show whichever clears soonest" behaviour,
 * which hid real information: a donor who just gave platelets read as
 * "eligible in 7 days" with no indication that whole blood was still
 * months away.
 *
 * @returns {{
 *   eligible: boolean,              // true if ANY component is available now
 *   components: Array<{ component, label, eligible, daysRemaining, eligibleDate }>,
 *   soonest: object|null            // the next component to clear, null if any are open
 * }}
 */
function getEligibilityBreakdown(donor) {
  const components = COMPONENTS.map((component) => {
    const { eligible, eligibleDate } = getEligibility(donor, component);
    return {
      component,
      label: SHORT_LABELS[component],
      eligible,
      eligibleDate,
      daysRemaining: eligible ? 0 : daysBetween(new Date(), eligibleDate),
    };
  });

  const blocked = components.filter((c) => !c.eligible);
  return {
    eligible: blocked.length < components.length,
    components,
    soonest: blocked.length
      ? blocked.reduce((min, c) => (c.daysRemaining < min.daysRemaining ? c : min))
      : null,
  };
}

/**
 * The compact roster string: "WB:128, Plat:5, Plas:21", with "now" in
 * place of a number for anything currently available.
 *
 * Deliberately shows all three every time, in a fixed order, so the
 * column is scannable down a table and a donor who is partially
 * available cannot be mistaken for one who is fully available.
 */
function formatEligibilityShort(donor) {
  return getEligibilityBreakdown(donor)
    .components.map((c) => `${c.label}:${c.eligible ? 'now' : c.daysRemaining}`)
    .join(', ');
}

function daysBetween(from, to) {
  return Math.max(0, Math.ceil((to - from) / 86400000));
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

// ---------------------------------------------------------------------
// SQL generation
//
// Needed because the admin Donors page filters by eligibility across the
// whole donor table, and pulling every donor into Node to filter them in
// JavaScript would defeat the pagination added in the same pass.
//
// The key simplification: "eligible" at roster level means "eligible for
// at least ONE component", so only the SHORTEST cooldown out of each row
// matters. Working that out from the matrices above:
//
//   last gave whole_blood -> min(120|180 wb, 28 plt, 28 plas) = 28
//   last gave platelets   -> min(7 wb, 7 plt, 28 plas)        = 7
//   last gave plasma      -> min(28, 28, 28)                  = 28
//
// Sex drops out entirely, because the sex-dependent cell
// (whole_blood -> whole_blood) is never the minimum. That is why the
// generated SQL has no sex branch, and it is derived below rather than
// asserted, so it stays correct if the numbers above ever change.
// ---------------------------------------------------------------------

const EARLIEST_COOLDOWN_DAYS = Object.fromEntries(
  COMPONENTS.map((lastComponent) => [
    lastComponent,
    Math.min(
      // Both sexes considered, so the minimum is honest no matter which
      // one the sex-dependent cell resolves to.
      ...COMPONENTS.flatMap((next) => [
        cooldownFor(lastComponent, next, 'male'),
        cooldownFor(lastComponent, next, 'female'),
      ])
    ),
  ])
);

/**
 * A SQL boolean expression that is true when the donor is eligible for at
 * least one component right now.
 *
 * @param {string} alias - the donors table alias in the caller's query
 * @returns {string} safe to interpolate: contains only generated integers
 *   and the caller's own alias, never user input
 */
function eligibleSql(alias = 'd') {
  const branches = COMPONENTS.map(
    (c) => `WHEN ${alias}.last_donation_component = '${c}' THEN ${EARLIEST_COOLDOWN_DAYS[c]}`
  ).join('\n         ');

  return `(
    ${alias}.last_donation_date IS NULL
    OR ${alias}.last_donation_component IS NULL
    OR ${alias}.last_donation_date + (
         CASE ${branches}
              ELSE ${WHOLE_BLOOD_INTERVAL_DAYS.female}
         END
       ) * INTERVAL '1 day' <= NOW()
  )`;
}

/**
 * The same thing as a text value rather than a boolean, for SELECT lists
 * and report exports that want a word instead of true/false.
 */
function eligibilityStatusSql(alias = 'd') {
  return `CASE WHEN ${eligibleSql(alias)} THEN 'eligible' ELSE 'ineligible' END`;
}

module.exports = {
  getEligibility,
  getEligibilityBreakdown,
  formatEligibilityShort,
  isUnderAnnualCap,
  eligibleSql,
  eligibilityStatusSql,
  cooldownFor,
  WHOLE_BLOOD_INTERVAL_DAYS,
  CROSSOVER_DAYS,
  ANNUAL_MAX,
  EARLIEST_COOLDOWN_DAYS,
  COMPONENTS,
  SHORT_LABELS,
};
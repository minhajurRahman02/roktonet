// Mirrors backend/services/eligibility.js -- kept in sync manually, same
// pattern already used for the blood-compatibility chart between
// donorFallback.js and compatibility.py. This is a live preview only;
// the real enforcement happens server-side, which is what actually stops
// an ineligible submission (including the annual-cap check, which needs
// a database count this file can't compute -- that's server-only).
//
// See backend/services/eligibility.js for the full sourcing notes on
// every number here (a real Bangladesh protocol document was checked
// against independent research; several of its numbers didn't hold up
// and were replaced with better-sourced ones).
//
// ---------------------------------------------------------------------
// 7.7a: donors.eligibility_status was dropped from the database.
//
// It was written once at INSERT, hardcoded to 'eligible', and never
// updated by anything, so it was wrong from the moment each row was
// created. The admin Donors page compounded that by rendering the stale
// column as the badge while separately computing the date from THIS
// file, which is where "eligible until 2026-10-09" came from: two
// different sources of truth concatenated into one table cell.
//
// Everything now derives from last_donation_date +
// last_donation_component + sex. formatEligibilityShort below is the
// compact roster format, and it deliberately shows all three components
// every time (see the note on getEarliestEligibility).
// ---------------------------------------------------------------------

const WHOLE_BLOOD_INTERVAL_DAYS = { male: 120, female: 180 };

const CROSSOVER_DAYS = {
  whole_blood: { platelets: 28, plasma: 28 },
  platelets: { whole_blood: 7, platelets: 7, plasma: 28 },
  plasma: { whole_blood: 28, platelets: 28, plasma: 28 },
};

/**
 * @param {{last_donation_date: string|null, last_donation_component: string|null, sex: string|null}} donor
 * @param {string} requestedComponent
 */
export function getEligibility(donor, requestedComponent) {
  const lastDate = donor.last_donation_date;
  const lastComponent = donor.last_donation_component;

  if (!lastDate || !lastComponent) {
    return { eligible: true, eligibleDate: null };
  }

  let cooldownDays;
  if (lastComponent === 'whole_blood' && requestedComponent === 'whole_blood') {
    cooldownDays = WHOLE_BLOOD_INTERVAL_DAYS[donor.sex] || WHOLE_BLOOD_INTERVAL_DAYS.female;
  } else {
    cooldownDays = CROSSOVER_DAYS[lastComponent]?.[requestedComponent];
    if (cooldownDays === undefined) cooldownDays = WHOLE_BLOOD_INTERVAL_DAYS.female;
  }

  const eligibleDate = new Date(lastDate);
  eligibleDate.setDate(eligibleDate.getDate() + cooldownDays);

  return { eligible: new Date() >= eligibleDate, eligibleDate: new Date() >= eligibleDate ? null : eligibleDate };
}

// For glance views (My Donors, Donor Detail) that don't have a specific
// requested component in context -- checks all three possible next
// components against the donor's actual last donation, and reports
// whichever clears soonest. "Eligible now" fires the moment ANY
// component is available again, not just once the longest one has passed.
//
// 7.7a CAUTION: this returns eligible:true as soon as ONE component
// clears, which is correct for "can this donor give anything at all"
// but badly misleading as a roster badge. A donor who gave whole blood
// last week reads as "eligible" here because plasma clears in 28 days,
// while whole blood is still 113 days away. That is exactly why the
// admin Donors column now uses formatEligibilityShort instead.
export function getEarliestEligibility(donor) {
  if (!donor.last_donation_date || !donor.last_donation_component) {
    return { eligible: true, component: null, eligibleDate: null };
  }

  const results = ['whole_blood', 'platelets', 'plasma'].map((component) => ({
    component,
    ...getEligibility(donor, component),
  }));

  if (results.some((r) => r.eligible)) {
    return { eligible: true, component: null, eligibleDate: null };
  }

  const soonest = results.reduce((min, r) => (r.eligibleDate < min.eligibleDate ? r : min));
  return { eligible: false, component: soonest.component, eligibleDate: soonest.eligibleDate };
}

const COMPONENT_LABELS = { whole_blood: 'whole blood', platelets: 'platelets', plasma: 'plasma' };
const COMPONENT_ORDER = ['whole_blood', 'platelets', 'plasma'];

// Short labels for the compact roster column. Matches SHORT_LABELS in
// backend/services/eligibility.js.
const SHORT_LABELS = { whole_blood: 'WB', platelets: 'Plat', plasma: 'Plas' };

function daysUntil(date) {
  return Math.max(0, Math.ceil((date - new Date()) / 86400000));
}

/**
 * All three components with days remaining, in a fixed order.
 *
 * @returns {{
 *   eligible: boolean,
 *   components: Array<{ component, label, eligible, daysRemaining, eligibleDate }>
 * }}
 */
export function getEligibilityBreakdown(donor) {
  const components = COMPONENT_ORDER.map((component) => {
    const { eligible, eligibleDate } = getEligibility(donor, component);
    return {
      component,
      label: SHORT_LABELS[component],
      eligible,
      eligibleDate,
      daysRemaining: eligible ? 0 : daysUntil(eligibleDate),
    };
  });

  return { eligible: components.some((c) => c.eligible), components };
}

/**
 * The compact roster string: "WB:128, Plat:5, Plas:21", with "now" in
 * place of a number for anything currently available.
 *
 * Shows all three every time, in a fixed order, so the column is
 * scannable down a table and a partially-available donor cannot be
 * mistaken for a fully-available one. That mistake is precisely what the
 * old single-badge rendering made easy.
 */
export function formatEligibilityShort(donor) {
  return getEligibilityBreakdown(donor)
    .components.map((c) => `${c.label}:${c.eligible ? 'now' : c.daysRemaining}`)
    .join(', ');
}

/**
 * Full breakdown across all three components, in a fixed order --
 * replaces showing only the soonest-clearing one, since that hid real
 * information about the other two (a donor who just gave platelets
 * would only ever see "eligible in 7 days", with no visibility into
 * when their whole-blood/plasma eligibility comes back too).
 * @returns {"Eligible for all components" | "Eligible for whole blood in Nd, eligible for platelets now, ..."}
 */
export function formatEligibility(donor) {
  const results = COMPONENT_ORDER.map((component) => ({ component, ...getEligibility(donor, component) }));

  if (results.every((r) => r.eligible)) {
    return 'Eligible for all components';
  }

  const parts = results.map((r) => {
    const label = COMPONENT_LABELS[r.component];
    if (r.eligible) return `eligible for ${label} now`;
    const days = Math.ceil((r.eligibleDate - new Date()) / (1000 * 60 * 60 * 24));
    return `eligible for ${label} in ${days} day${days === 1 ? '' : 's'}`;
  });

  const joined = parts.join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
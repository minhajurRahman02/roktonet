// Roktim's voice, in one place.
//
// Every user-facing sentence Roktim says is built here, so the rules from
// ROKTIM_UI_SPEC.md section 6 are enforced once instead of being re-remembered
// in each component:
//
//   - named third person, never "I", never a persona
//   - never "will", always "likely" / "historically" / "expects"
//   - always name the source of the claim
//   - never repeat or appear to contradict the engine's decision
//   - bag figures as a band, never a single number
//
// A note on punctuation, because it was a specific review point: no em dashes
// in anything a user reads. They pile up fast and make written text read as
// machine-generated. Commas, full stops and brackets do the same work and
// sound like a person wrote them.

/**
 * ISO week number, matching Python's `date.isocalendar()[1]` exactly, because
 * that is what keyed the seasonal profile when the model was exported.
 *
 * Clamped to 52: an ISO year can have 53 weeks, the profile has 52, and week
 * 53 is always the dead of winter where the curve is flat. Clamping there is
 * safe in a way that clamping in September would not be.
 */
export function isoWeek(date) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return Math.min(52, Math.max(1, week));
}

export function parseDate(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const formatDate = (d) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '';

export const formatShort = (d) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

/**
 * Where a given week sits in a district's own dengue year.
 *
 * This is descriptive statistics on the seasonal profile, not a prediction:
 * it ranks the target week against the other 51 and compares it to the
 * district's annual median. Nothing is inferred and nothing is modelled here,
 * which is why it is safe to state plainly even in seasonal mode where the
 * demand-pressure signal is unavailable.
 *
 * @returns {{band: 'peak'|'rising'|'typical', rank: number, ratio: number,
 *            week: object, weeksToPeak: number}|null}
 */
export function seasonalPosition(curve, targetDate) {
  if (!curve?.weeks?.length || !targetDate) return null;

  const wk = isoWeek(targetDate);
  const week = curve.weeks.find((w) => w.week === wk);
  if (!week) return null;

  const sorted = [...curve.weeks].sort((a, b) => b.admissions - a.admissions);
  const rank = sorted.findIndex((w) => w.week === wk) + 1; // 1 = busiest week
  const median = curve.annual_median || 0;
  const ratio = median > 0 ? week.admissions / median : 0;

  // Top 8 of 52 is roughly the top 15% of the year, which for every district
  // in this dataset is the monsoon shoulder through to the post-monsoon crest.
  // Top 20 is the broader rising limb. Thresholds are on rank rather than on
  // an absolute count so they mean the same thing in Dhaka and in Bandarban.
  const band = rank <= 8 ? 'peak' : rank <= 20 ? 'rising' : 'typical';

  return { band, rank, ratio, week, weeksToPeak: curve.peak_week - wk };
}

/** "2022 to 2026" from the model's ISO date span. Years are what a reader
 *  needs here; the exact first and last week are on the model card. */
export function spanYears(span) {
  if (!span?.length) return 'the dataset span';
  const years = span.map((d) => String(d).slice(0, 4));
  return years[0] === years[years.length - 1]
    ? years[0]
    : `${years[0]} to ${years[years.length - 1]}`;
}

const MONTH_OF_WEEK = (w) => {
  const d = new Date(Date.UTC(2025, 0, 1 + (w - 1) * 7));
  return d.toLocaleDateString('en-GB', { month: 'long' });
};

/**
 * The headline sentence, in the mode the data actually supports.
 *
 * Seasonal mode is the production default because no live admissions feed
 * exists. The limitation line it returns is mandatory and belongs in body
 * text, never a tooltip: it is the module's central caveat and hiding it would
 * make the interface dishonest.
 *
 * @returns {{mode: 'live'|'seasonal', headline: string, detail: string,
 *            limitation: string|null, source: string}}
 */
export function advisoryText({ district, neededByDate, curve, advisory }) {
  const date = parseDate(neededByDate);
  const when = formatDate(date);
  const pos = seasonalPosition(curve, date);
  const live = advisory?.forecast?.basis === 'observed_recent';

  if (live) {
    const ratio = advisory.decision?.pressure_ratio;
    const outlook = advisory.decision?.demand_outlook;
    const asOf = advisory.forecast?.as_of;
    return {
      mode: 'live',
      headline:
        outlook === 'normal'
          ? `Dengue admissions in ${district} are close to the usual level for this time of year.`
          : `Dengue admissions in ${district} are running ${ratio?.toFixed(1)} times the usual level for this point in the season.`,
      detail:
        outlook === 'normal'
          ? `Demand around ${when} looks ordinary for the district.`
          : `Demand is likely to stay ${outlook === 'high' ? 'well above' : 'above'} normal through ${when}.`,
      limitation: null,
      source: `Based on admissions reported${asOf ? ` to ${asOf}` : ''}, 80% interval`,
    };
  }

  if (!pos) return null;

  const headline =
    pos.band === 'peak'
      ? `${when} falls inside ${district}'s peak dengue season.`
      : pos.band === 'rising'
        ? `${when} falls on the rising side of ${district}'s dengue season.`
        : `${when} sits outside ${district}'s usual dengue season.`;

  const detail =
    pos.band === 'peak'
      ? `Admissions in this district have historically been at their highest around ${MONTH_OF_WEEK(curve.peak_week)}, typically about ${pos.ratio.toFixed(1)} times a normal week.`
      : pos.band === 'rising'
        ? `Admissions usually climb from here, peaking about ${Math.max(0, pos.weeksToPeak)} weeks later in ${MONTH_OF_WEEK(curve.peak_week)}.`
        : `Admissions in this district are typically at their lowest in this part of the year.`;

  return {
    mode: 'seasonal',
    headline,
    detail,
    // Mandatory in seasonal mode. See ROKTIM_UI_SPEC.md section 6.
    limitation:
      'Roktim cannot tell whether a surge is happening right now. No live admissions feed is connected, so this reads history, not today.',
    source: `Based on seasonal history, ${spanYears(curve.data_span)}`,
  };
}

/**
 * Options, never instructions, and only when the season or the signal warrants
 * them. Three at most, per the spec, because a list of six reads as noise and
 * gets skipped entirely.
 */
export function suggestions({ advisory, position, component }) {
  const outlook = advisory?.decision?.demand_outlook;
  const elevated = outlook === 'elevated' || outlook === 'high';
  const seasonalPeak = position?.band === 'peak';
  if (!elevated && !seasonalPeak) return [];

  const out = [
    'Consider arranging donors in advance rather than reserving from stock.',
    'Check whether the procedure can be scheduled outside the peak window.',
  ];
  if (component !== 'platelets') {
    out.push('Review O negative and platelet holdings. Dengue demand is platelet-heavy.');
  } else {
    out.push('Platelet demand is the first thing to tighten in a dengue season. Confirm holdings early.');
  }
  return out.slice(0, 3);
}

/** Human label for the service's outlook enum. */
export const OUTLOOK_LABEL = {
  normal: 'Normal',
  elevated: 'Elevated',
  high: 'High',
  unavailable: 'Not available',
};

/** Human label for the seasonal band. */
export const BAND_LABEL = {
  peak: 'Peak season',
  rising: 'Season rising',
  typical: 'Off season',
};

/**
 * A bag band, never a single figure. The central value rests on a transfusion
 * rate the team chose rather than cited, and the cited band around it spans a
 * factor of more than four, so a lone number here would be the interface
 * hiding the largest single uncertainty in the dataset.
 */
export function bagBand(bags) {
  if (!bags) return null;
  const n = (v) => Math.round(v).toLocaleString('en-GB');
  return `${n(bags.low)} to ${n(bags.high)} bags`;
}

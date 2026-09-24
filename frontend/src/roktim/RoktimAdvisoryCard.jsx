import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { RoktimLabel, RoktimDefs } from './RoktimBrand';
import MicroCurve from './MicroCurve';
import useRoktimAdvisory from './useRoktimAdvisory';
import { isoWeek, parseDate, bagBand, BAND_LABEL, OUTLOOK_LABEL } from './copy';
import { isRiskClaimMeaningful, modelMeta } from '../api/roktim';
import { logAdvisory } from '../api/roktimLog';
import { toModelName } from './districts';
import { useAuth } from '../context/AuthContext';

// Surface 2 of 3: the card on an elective request's confirmation.
//
// This is where Roktim gets room to explain itself: the reading, the curve
// with the target date marked, the expected demand as a band, and up to three
// suggestions phrased as options. It is also the only surface that writes to
// the advisory log, because it is the only one that corresponds to a request
// that actually exists.
//
// WHAT THIS CARD MUST NEVER DO
// ----------------------------
// It never repeats or contradicts the engine's decision. The fulfilment path
// is already on the page above it, decided by exact arithmetic; Roktim sits
// alongside that with a different question ("will this still be comfortable on
// the day") and no authority over the answer.

export default function RoktimAdvisoryCard({ request }) {
  const { user } = useAuth();
  const logged = useRef(null);

  const neededBy = request?.needed_by_date
    ? String(request.needed_by_date).slice(0, 10)
    : null;

  const { curve, advisory, text, position, tips, loading } = useRoktimAdvisory({
    district: user?.district,
    neededByDate: neededBy,
    urgencyTier: request?.urgency_tier,
    quantity: request?.quantity,
    component: request?.component,
    withRiskCheck: true,
  });

  // One row per submitted elective request. Guarded by request_id rather than
  // a mount flag so a remount (navigating away and back) does not write a
  // second row for the same request, and a genuinely different request does.
  useEffect(() => {
    if (!advisory || !request?.request_id || !user?.org_id) return;
    if (logged.current === request.request_id) return;
    logged.current = request.request_id;

    // Fire and forget. A failure here is silent by design: the log is for
    // audit, and losing a row must never be something the hospital sees or has
    // to act on.
    modelMeta().then((meta) => {
      // No provenance, no row. The backend rejects a row that cannot say which
      // artefact produced it, and it is right to: an undated advisory would
      // silently take on the meaning of whatever calibration is current when
      // someone eventually reads it.
      if (!meta) return;
      logAdvisory({
        request_id: request.request_id,
        org_id: user.org_id,
        district: toModelName(user.district),
        needed_by_date: neededBy,
        horizon_weeks: advisory.decision?.horizon_weeks_used,
        basis: advisory.forecast?.basis,
        demand_outlook: advisory.decision?.demand_outlook,
        pressure_ratio: advisory.decision?.pressure_ratio,
        seasonal_normal_adm: advisory.decision?.seasonal_normal_admissions,
        projected_upper_adm: advisory.decision?.projected_upper_admissions,
        at_risk: advisory.at_risk,
        model_schema_version: meta.schema_version,
        model_generated: meta.generated,
      });
    });
  }, [advisory, request?.request_id, user?.org_id, user?.district, neededBy]);

  if (loading || !curve || !text || !position) return null;

  const week = isoWeek(parseDate(neededBy));
  const targetWeek = curve.weeks.find((w) => w.week === week);
  const riskMeaningful = isRiskClaimMeaningful(advisory);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="mt-4 max-w-2xl rounded-xl border border-[#574B90]/25 dark:border-[#A493E6]/20
                 bg-gradient-to-br from-[#574B90]/[0.06] to-transparent
                 dark:from-[#A493E6]/[0.08] dark:to-transparent overflow-hidden"
      aria-label="Roktim advisory"
    >
      <RoktimDefs id="rk-card" />

      <div className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <RoktimLabel subject={user?.district} size="lg" id="rk-card" />
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-gray-400 dark:text-textsecondary-dark">
            {BAND_LABEL[position.band]}
            {riskMeaningful && ` · ${OUTLOOK_LABEL[advisory.decision.demand_outlook]}`}
          </span>
        </div>

        <p className="mt-3 text-[15px] font-medium text-textprimary dark:text-textprimary-dark leading-snug">
          {text.headline}
        </p>
        <p className="mt-1.5 text-sm text-gray-600 dark:text-textsecondary-dark leading-relaxed">
          {text.detail}
        </p>

        {/* Mandatory in seasonal mode, in body text rather than a tooltip. It
            is the module's central limitation and tucking it away would make
            the card quietly dishonest. */}
        {text.limitation && (
          <p className="mt-3 text-sm text-gray-600 dark:text-textsecondary-dark leading-relaxed border-l-2 border-[#574B90]/35 dark:border-[#A493E6]/30 pl-3">
            {text.limitation}
          </p>
        )}
      </div>

      {/* The curve. Full width, target date marked, drawn in on arrival. */}
      <div className="px-5 pb-1">
        <div className="rounded-lg bg-white/60 dark:bg-black/20 border border-gray-100 dark:border-white/10 p-3">
          <MicroCurve
            weeks={curve.weeks}
            markerWeek={week}
            width={560}
            height={86}
            band
            muted={text.mode === 'seasonal'}
            draw
            strokeWidth={2}
          />
          <div className="flex items-center justify-between mt-1.5 font-mono text-[10px] text-gray-400 dark:text-textsecondary-dark">
            <span>Jan</span>
            <span className="text-[#574B90] dark:text-[#A493E6]">
              needed by · week {week}
            </span>
            <span>Dec</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-400 mb-1">Typical that week</p>
          <p className="font-medium dark:text-textprimary-dark">
            {targetWeek ? Math.round(targetWeek.admissions).toLocaleString('en-GB') : '·'}
            <span className="text-xs font-normal text-gray-400"> admissions</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">District blood demand</p>
          <p className="font-medium dark:text-textprimary-dark">
            {targetWeek ? bagBand(targetWeek.bags) : '·'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Busiest week here</p>
          <p className="font-medium dark:text-textprimary-dark">
            Week {curve.peak_week}
            <span className="text-xs font-normal text-gray-400">
              {' '}
              · {Math.round(curve.peak_admissions).toLocaleString('en-GB')}
            </span>
          </p>
        </div>
      </div>

      {tips.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-xs font-medium text-gray-500 dark:text-textsecondary-dark mb-2">
            Worth considering
          </p>
          <ul className="space-y-1.5">
            {tips.map((t) => (
              <li
                key={t}
                className="text-sm text-gray-700 dark:text-textprimary-dark flex gap-2 leading-snug"
              >
                <span className="text-[#8474CE] shrink-0" aria-hidden="true">
                  ·
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-5 py-3 border-t border-[#574B90]/15 dark:border-[#A493E6]/15 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-gray-400 dark:text-textsecondary-dark leading-snug">
          {text.source}. Dengue only, so this is a floor on demand, not a ceiling.
          Roktim advises and never changes a request.
        </p>
        {user?.role === 'admin' && (
          <Link
            to="/admin/roktim"
            className="text-xs font-medium text-[#574B90] dark:text-[#A493E6] hover:underline shrink-0"
          >
            Open Roktim →
          </Link>
        )}
      </div>
    </motion.section>
  );
}

RoktimAdvisoryCard.propTypes = {
  request: PropTypes.shape({
    request_id: PropTypes.string,
    urgency_tier: PropTypes.string,
    needed_by_date: PropTypes.string,
    quantity: PropTypes.number,
    component: PropTypes.string,
  }),
};

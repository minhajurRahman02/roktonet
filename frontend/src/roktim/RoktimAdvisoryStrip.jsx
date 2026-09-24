import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { RoktimLabel, RoktimDefs } from './RoktimBrand';
import MicroCurve from './MicroCurve';
import useRoktimAdvisory from './useRoktimAdvisory';
import { isoWeek, parseDate, BAND_LABEL } from './copy';
import { useAuth } from '../context/AuthContext';

// Surface 1 of 3: the live strip on the request form.
//
// It appears the moment an elective request has a district and a needed-by
// date, and it is the cheapest possible read: one line, one thumbnail curve,
// no decision, no suggestions. Its whole job is to let someone notice they
// have picked a date in the middle of dengue season BEFORE they submit, while
// changing the date still costs nothing.
//
// RENDERS null ON EVERY FAILURE, INCLUDING WHILE LOADING
// ------------------------------------------------------
// No skeleton here, deliberately. A skeleton on a form field the user is
// actively typing into is a flicker of grey blocks under the cursor on every
// keystroke. The strip either has something to say or it is not there, and it
// fades in so its arrival reads as an addition rather than a layout jump.
// This is the documented deviation from frontend_standards.md section 5; the
// reasoning is in ROKTIM_UI_SPEC.md section 8.
//
// NO LINK TO THE ROKTIM PAGE FROM HERE
// ------------------------------------
// The page is admin-only, and the only people who see this strip are hospital
// staff filling in a request. A "see more" link would send every one of them
// to /unauthorized. The card gets the link instead, and only for admins.

const CHIP = {
  peak: 'border-[#8474CE]/50 text-[#574B90] bg-[#8474CE]/10 dark:text-[#C4B8F5] dark:bg-[#8474CE]/15',
  rising: 'border-[#6455A8]/40 text-[#574B90] bg-[#6455A8]/[0.07] dark:text-[#A493E6] dark:bg-[#6455A8]/15',
  typical: 'border-gray-300 text-gray-500 bg-gray-50 dark:border-white/15 dark:text-textsecondary-dark dark:bg-white/5',
};

export default function RoktimAdvisoryStrip({ urgencyTier, neededByDate, quantity, component }) {
  const { user } = useAuth();
  const { curve, text, position, loading } = useRoktimAdvisory({
    district: user?.district,
    neededByDate,
    urgencyTier,
    quantity,
    component,
  });

  if (loading || !curve || !text || !position) return null;

  const week = isoWeek(parseDate(neededByDate));

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="rounded-lg border border-[#574B90]/25 dark:border-[#A493E6]/20
                 bg-[#574B90]/[0.055] dark:bg-[#A493E6]/[0.07] px-3.5 py-3"
    >
      <RoktimDefs id="rk-strip" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <RoktimLabel subject={user?.district} id="rk-strip" />
            <span
              className={`font-mono text-[9.5px] leading-none tracking-[0.1em] uppercase border rounded px-1.5 py-[3px] ${CHIP[position.band]}`}
            >
              {BAND_LABEL[position.band]}
            </span>
          </div>

          <p className="mt-2 text-sm text-textprimary dark:text-textprimary-dark leading-snug">
            {text.headline}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-textsecondary-dark leading-snug">
            {text.source}. Roktim reads history, not today.
          </p>
        </div>

        <div className="shrink-0 pt-0.5">
          <MicroCurve weeks={curve.weeks} markerWeek={week} width={92} height={30} muted />
          <p className="mt-1 font-mono text-[9.5px] text-right text-gray-400 dark:text-textsecondary-dark">
            52-week profile
          </p>
        </div>
      </div>
    </motion.div>
  );
}

RoktimAdvisoryStrip.propTypes = {
  urgencyTier: PropTypes.string.isRequired,
  neededByDate: PropTypes.string,
  quantity: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  component: PropTypes.string,
};

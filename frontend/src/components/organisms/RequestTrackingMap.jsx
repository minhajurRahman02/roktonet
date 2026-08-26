import PropTypes from 'prop-types';
import { motion } from 'framer-motion';

const FALLBACK_PATHS = ['donor_fallback', 'parallel_critical', 'scheduled_donor_mobilization'];

/**
 * Three honest visual states, matching the reviewed mockup:
 * - Pending: pulsing search ring, no location claims at all.
 * - Resolved via inventory: a REAL two-point flow line between the source
 *   org's district and the hospital's district (both real data).
 * - Resolved via donor fallback: donor icons clustered near the hospital
 *   node, deliberately NOT placed on a map -- donors' locations aren't
 *   tracked in the schema, so drawing a flow line from an invented origin
 *   would be the same kind of fabrication ruled out earlier for the
 *   "searched 13 banks" narrative.
 */
export default function RequestTrackingMap({ request, allocation, mobilizations }) {
  if (!request.fulfillment_path) {
    return (
      <div className="flex flex-col items-center py-6">
        <div className="relative w-20 h-20 flex items-center justify-center">
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary dark:border-primary-light"
            animate={{ scale: [0.9, 1.6], opacity: [0.6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center text-white">
            <HospitalIcon />
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-2">{request.org_name}</p>
      </div>
    );
  }

  if (request.fulfillment_path === 'inventory') {
    const distinctOrgs = [...new Map(allocation.map((a) => [a.org_id, a])).values()];

    return (
      <div>
        <svg viewBox="0 0 260 90" className="w-full h-24">
          {distinctOrgs.map((org, i) => {
            const yOffset = distinctOrgs.length > 1 ? 20 + i * 30 : 60;
            const path = `M30,${yOffset} C90,20 170,20 230,60`;
            return (
              <g key={org.org_id}>
                <path d={path} fill="none" stroke="#9CA8A3" strokeWidth="1.5" strokeDasharray="3,3" />
                <motion.circle
                  r="4"
                  fill="#1C4A3D"
                  style={{ offsetPath: `path('${path}')` }}
                  animate={{ offsetDistance: ['0%', '100%'] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
                />
                <g transform={`translate(30,${yOffset})`}>
                  <circle r="16" fill="#2E6B57" />
                  <HospitalIconSvg />
                </g>
              </g>
            );
          })}
          <g transform="translate(230,60)">
            <circle r="16" fill="#1C4A3D" />
            <HospitalIconSvg />
          </g>
        </svg>
        <div className="flex justify-between text-xs text-gray-500 dark:text-textsecondary-dark px-2 mt-1">
          <span>
            {distinctOrgs.map((o) => o.org_name).join(', ') || '—'}
            <br />
            <span className="text-[10px] text-gray-400">source · real district</span>
          </span>
          <span className="text-right">
            {request.org_name}
            <br />
            <span className="text-[10px] text-gray-400">requesting hospital</span>
          </span>
        </div>
      </div>
    );
  }

  if (FALLBACK_PATHS.includes(request.fulfillment_path)) {
    return (
      <div className="flex flex-col items-center py-4">
        <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center text-white">
          <HospitalIcon />
        </div>
        <p className="text-xs text-gray-500 dark:text-textsecondary-dark mt-2">{request.org_name}</p>

        <div className="flex gap-3 mt-4 flex-wrap justify-center">
          {mobilizations.map((m) => (
            <DonorIcon key={m.mobilization_id} status={m.invite_status} />
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2 text-center max-w-xs">
          Not shown by location — donor addresses aren&apos;t tracked in the system
        </p>
      </div>
    );
  }

  return null;
}

function DonorIcon({ status }) {
  const styles = {
    invited: 'bg-urgent-bg dark:bg-urgent-dbg border-2 border-dashed border-urgent-text dark:border-urgent-dtext text-urgent-text dark:text-urgent-dtext',
    confirmed: 'bg-elective-bg dark:bg-elective-dbg border-2 border-elective-text dark:border-elective-dtext text-elective-text dark:text-elective-dtext',
    declined: 'bg-gray-100 dark:bg-white/10 border-2 border-gray-300 dark:border-white/20 text-gray-400',
  };
  return (
    <motion.div
      className={`w-8 h-8 rounded-full flex items-center justify-center ${styles[status] || styles.invited}`}
      animate={status === 'invited' ? { scale: [1, 1.15, 1] } : {}}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
      </svg>
    </motion.div>
  );
}
DonorIcon.propTypes = { status: PropTypes.oneOf(['invited', 'confirmed', 'declined']).isRequired };

function HospitalIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function HospitalIconSvg() {
  return (
    <>
      <rect x="-6" y="-6" width="12" height="12" rx="2" fill="none" />
      <rect x="-1" y="-4" width="2" height="8" fill="white" />
      <rect x="-4" y="-1" width="8" height="2" fill="white" />
    </>
  );
}

RequestTrackingMap.propTypes = {
  request: PropTypes.shape({
    fulfillment_path: PropTypes.string,
    org_name: PropTypes.string,
  }).isRequired,
  allocation: PropTypes.array.isRequired,
  mobilizations: PropTypes.array.isRequired,
};

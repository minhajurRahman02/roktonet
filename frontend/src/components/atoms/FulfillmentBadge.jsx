import PropTypes from 'prop-types';

/**
 * `fulfillment_path` in the database is one of five real enum values
 * (inventory / donor_fallback / parallel_critical / scheduled_reservation /
 * scheduled_donor_mobilization) OR NULL. "Pending" is NOT a database
 * value -- it's a UI-derived label meaning "fulfillment_path is still
 * NULL." This component keeps that distinction explicit rather than
 * treating "pending" as if it were a sixth enum option.
 */
export default function FulfillmentBadge({ fulfillmentPath }) {
  if (!fulfillmentPath) {
    return (
      <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-textsecondary-dark">
        Pending
      </span>
    );
  }

  return (
    <span className="mono text-xs font-medium px-3 py-1 rounded-full bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext">
      {fulfillmentPath}
    </span>
  );
}

FulfillmentBadge.propTypes = {
  fulfillmentPath: PropTypes.string, // null/undefined means still pending
};

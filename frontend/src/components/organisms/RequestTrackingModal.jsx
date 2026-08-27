import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { getRequest } from '../../api/requests';
import { getRequestEvents, getRequestAllocation } from '../../api/requestTracking';
import { getMobilizationsForRequest } from '../../api/mobilizations';
import RequestTrackingMap from './RequestTrackingMap';

const POLL_INTERVAL_MS = 2000;
const FALLBACK_PATHS = ['donor_fallback', 'parallel_critical', 'scheduled_donor_mobilization'];

/**
 * Polls while open and the request is still unresolved (fulfillment_path
 * is null). Once resolved, does one final fetch to catch anything from the
 * exact moment of transition, then stops -- matches the reviewed mockup's
 * Live/Resolved model. Known scoping limitation, deliberate: for donor-
 * fallback paths, a donor could technically still respond after this
 * point; that response is real and stored, but won't appear live unless
 * the modal is reopened (which does a fresh fetch).
 */
export default function RequestTrackingModal({ requestId, isOpen, onClose }) {
  const [request, setRequest] = useState(null);
  const [events, setEvents] = useState([]);
  const [allocation, setAllocation] = useState([]);
  const [mobilizations, setMobilizations] = useState([]);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [requestData, eventsData] = await Promise.all([
        getRequest(requestId),
        getRequestEvents(requestId),
      ]);
      setRequest(requestData);
      setEvents(eventsData);

      if (requestData.fulfillment_path === 'inventory') {
        setAllocation(await getRequestAllocation(requestId));
      } else if (FALLBACK_PATHS.includes(requestData.fulfillment_path)) {
        setMobilizations(await getMobilizationsForRequest(requestId));
      }

      if (requestData.fulfillment_path && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } catch (err) {
      setError(err.message);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [requestId]);

  useEffect(() => {
    if (!isOpen) return undefined;

    setRequest(null);
    setEvents([]);
    setAllocation([]);
    setMobilizations([]);
    setError(null);

    fetchAll();
    intervalRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen, fetchAll]);

  const isLive = request && !request.fulfillment_path;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-surface-dark rounded-xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10 shrink-0">
              <div>
                <p className="font-display font-semibold dark:text-textprimary-dark">
                  {isLive ? 'Tracking request' : 'Request log'}
                </p>
                <p className="mono text-xs text-gray-400">req_{requestId.slice(0, 8)}</p>
              </div>
              <div className="flex items-center gap-3">
                {request &&
                  (isLive ? (
                    <div className="flex items-center gap-2">
                      <motion.span
                        className="w-2 h-2 rounded-full bg-critical-text"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                      />
                      <span className="text-xs font-medium text-critical-text dark:text-critical-dtext">Live</span>
                    </div>
                  ) : (
                    <span className="text-xs font-medium bg-elective-bg dark:bg-elective-dbg text-elective-text dark:text-elective-dtext px-2.5 py-1 rounded-full">
                      Resolved
                    </span>
                  ))}
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                  <X size={18} />
                </button>
              </div>
            </div>

            {error && (
              <p className="p-5 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load tracking info: {error}</p>
            )}

            {!error && !request && <p className="p-5 text-sm text-gray-400">Loading…</p>}

            {!error && request && (
              <>
                <div className="px-5 py-4 bg-gray-50 dark:bg-white/5 shrink-0">
                  <RequestTrackingMap request={request} allocation={allocation} mobilizations={mobilizations} />
                </div>

                <div className="p-5 space-y-2 overflow-auto">
                  {events.map((event, i) => (
                    <motion.div
                      key={event.event_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i === events.length - 1 ? 0.1 : 0 }}
                      className="flex gap-3 text-sm"
                    >
                      <span
                        className={`w-1 shrink-0 rounded-full ${
                          event.event_type.includes('shortfall') ||
                          event.event_type.includes('donor_search') ||
                          event.event_type.includes('escalation')
                            ? 'bg-urgent-text'
                            : event.event_type.includes('resolved') || event.event_type === 'donor_responded'
                              ? 'bg-elective-text dark:bg-elective-dtext'
                              : 'bg-gray-300 dark:bg-white/20'
                        }`}
                      />
                      <div>
                        <p className="dark:text-textprimary-dark">{event.message}</p>
                        <p className="text-[10px] text-gray-400 mono">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                  {isLive && (
                    <p className="text-sm text-gray-400 italic flex gap-3">
                      <span className="w-1 shrink-0 rounded-full bg-gray-200 dark:bg-white/10" />
                      Waiting for the next update…
                    </p>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

RequestTrackingModal.propTypes = {
  requestId: PropTypes.string.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

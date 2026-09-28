import { createContext, useContext, useState, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import FeedbackPopup from '../components/molecules/FeedbackPopup';
import ToastHost from '../components/molecules/Toast';

// The single place every save, create, cancel, dispatch and delete in the
// app reports its outcome through, so a save on the profile page and a
// broadcast send on the admin console look like the same system rather
// than two different developers' guesses at what "it worked" should look
// like.
//
// THE RULE THIS ENCODES (system-wide UI refinement, item 1)
//
//   popupSuccess() -- a generic, page-level success. Requires the OK
//     click, because the thing it is confirming was a deliberate action
//     the person is waiting to hear back on: saving a profile, cancelling
//     a request, sending a broadcast.
//   popupError()   -- every failure, everywhere, no exceptions. A failure
//     is exactly the case where clearing itself off screen unread would
//     be the wrong call.
//   toastSuccess() -- a generic success for a frequent, low-stakes action
//     (dispatching units, starting a drive, logging a donation) where
//     making the person click OK just to acknowledge their own click
//     would be a tax on the common path. Clears itself after a few
//     seconds, or on demand.
//
// What this deliberately does NOT cover: per-field validation messages
// (FormField's own `error` prop, or Register.jsx's per-field `errors`
// object) stay exactly where they are, next to the field that's wrong --
// turning five empty-field errors into five stacked popups would be a
// regression, not a fix. It also does not touch the three auth pages that
// already replace their form with a dedicated full-panel success screen
// (Register, ResetPassword, ForgotPassword): those are purpose-built
// closure screens with their own icon and a next step, which a generic
// "OK" popup would be a downgrade from, not an improvement to.

const FeedbackContext = createContext(undefined);

const TOAST_MS = 3200;

export function FeedbackProvider({ children }) {
  const [popup, setPopup] = useState(null); // { tone, message } | null
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const popupSuccess = useCallback((message) => setPopup({ tone: 'success', message }), []);
  const popupError = useCallback((message) => setPopup({ tone: 'error', message }), []);
  const closePopup = useCallback(() => setPopup(null), []);

  const dismissToast = useCallback((id) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const toastSuccess = useCallback((message) => {
    const id = nextId.current += 1;
    setToasts((ts) => [...ts, { id, tone: 'success', message }]);
    setTimeout(() => dismissToast(id), TOAST_MS);
  }, [dismissToast]);

  return (
    <FeedbackContext.Provider value={{ popupSuccess, popupError, toastSuccess }}>
      {children}
      <FeedbackPopup
        isOpen={!!popup}
        tone={popup?.tone}
        message={popup?.message}
        onClose={closePopup}
      />
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </FeedbackContext.Provider>
  );
}

FeedbackProvider.propTypes = { children: PropTypes.node };

/**
 * @returns {{
 *   popupSuccess: (message: string) => void,
 *   popupError: (message: string) => void,
 *   toastSuccess: (message: string) => void,
 * }}
 */
export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback() must be called within a FeedbackProvider');
  return ctx;
}

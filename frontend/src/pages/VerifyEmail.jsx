import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import AuthLayout from '../components/organisms/AuthLayout';
import { verifyEmail } from '../api/auth';

const iconMotion = {
  initial: { scale: 0.5, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: { type: 'spring', stiffness: 200, damping: 15 },
};

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  // Verification tokens are single-use -- a ref guard ensures only the
  // FIRST effect invocation actually calls the API, even though React's
  // StrictMode intentionally double-invokes effects in development. Without
  // this, the second call would fail ("already used") and could overwrite
  // a true success with a false error on screen.
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found in this link.');
      return;
    }
    if (hasAttempted.current) return;
    hasAttempted.current = true;

    verifyEmail(token)
      .then((result) => {
        setStatus('success');
        setMessage(result.message);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message);
      });
  }, [token]);

  return (
    <AuthLayout headline="Confirming who you are, so the network can trust you.">
      <div className="text-center py-2">
        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto text-primary dark:text-textprimary-dark mb-3 animate-spin" size={40} />
            <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark">
              Verifying your email…
            </h1>
          </>
        )}

        {status === 'success' && (
          <>
            <motion.div {...iconMotion}>
              <CheckCircle2 className="mx-auto text-primary dark:text-textprimary-dark mb-3" size={40} />
            </motion.div>
            <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark mb-2">
              Email verified
            </h1>
            <p className="text-sm text-textsecondary dark:text-textsecondary-dark">{message}</p>
            <Link
              to="/login"
              className="inline-block mt-6 text-sm text-primary dark:text-textprimary-dark font-medium underline"
            >
              Go to login
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <motion.div {...iconMotion}>
              <XCircle className="mx-auto text-critical-text dark:text-critical-dtext mb-3" size={40} />
            </motion.div>
            <h1 className="font-display font-semibold text-lg text-textprimary dark:text-textprimary-dark mb-2">
              Verification failed
            </h1>
            <p className="text-sm text-textsecondary dark:text-textsecondary-dark">{message}</p>
            <Link
              to="/register"
              className="inline-block mt-6 text-sm text-primary dark:text-textprimary-dark font-medium underline"
            >
              Back to register
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}

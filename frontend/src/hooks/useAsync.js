import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * The 5-state matrix (frontend_standards.md §5) as a hook: loading /
 * success / error / empty, with retry. `deps` re-runs the loader (e.g.
 * when filters change). `pollMs` re-fetches in the background without
 * flipping back to the loading state -- for the admin Overview's live
 * KPIs and activity feed.
 */
export function useAsync(loader, deps = [], { pollMs = 0 } = {}) {
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback((background = false) => {
    if (!background) setStatus('loading');
    return loaderRef.current()
      .then((d) => { setData(d); setLastUpdated(new Date()); setStatus('success'); })
      .catch((err) => { setError(err.message); if (!background) setStatus('error'); });
  }, []);

  useEffect(() => { run(false); }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pollMs) return undefined;
    const i = setInterval(() => run(true), pollMs);
    return () => clearInterval(i);
  }, [pollMs, run]);

  return { status, data, error, lastUpdated, reload: () => run(false), refresh: () => run(true) };
}

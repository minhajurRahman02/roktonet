import { useState, useEffect } from 'react';

const STORAGE_KEY = 'roktonet-theme';

/**
 * Shared dark-mode logic so the public landing page and the logged-in
 * dashboard shell (App.jsx's NavShell) stay in sync -- both read/write the
 * same localStorage key, so a preference set on one carries over to the
 * other rather than each having its own independent toggle state.
 */
export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  return [isDark, setIsDark];
}

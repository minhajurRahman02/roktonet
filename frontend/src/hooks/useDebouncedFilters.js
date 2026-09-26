import { useEffect, useRef, useState } from 'react';

// Turns a filter object that changes on every keystroke into one that
// changes only once typing pauses.
//
// WHY A DEBOUNCE AND NOT JUST PASSING THE FILTERS THROUGH
//
// Search results now update as you type, which is the point. But the
// naive version of that fires one HTTP request per keystroke: typing
// "Rahman" is six queries, five of whose answers are thrown away before
// anyone reads them, against a free-tier Postgres. Worse, they can land
// out of order, so the list you are left looking at is the answer to
// "Rahm" rather than "Rahman".
//
// 300ms is the usual resting point for this: below about 200ms a normal
// typing rhythm still slips requests through between keystrokes, and
// above about 400ms the list visibly lags behind the cursor.
//
// WHY EMPTY VALUES ARE STRIPPED
//
// Every page using this built its query object with
// Object.fromEntries(entries.filter(v !== '')) on submit, so that an
// untouched dropdown does not become ?blood_type= and get treated as a
// filter for the empty string. That behaviour has to survive the move
// away from a submit button, so it lives here instead of being
// repeated.
//
// The returned object is referentially stable while the filters are
// unchanged, which matters because it goes into a dependency array. A
// fresh object every render would re-fetch forever.
export function useDebouncedFilters(filters, delay = 300) {
  const clean = (obj) => Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );

  const [applied, setApplied] = useState(() => clean(filters));
  const appliedRef = useRef(applied);

  const serialised = JSON.stringify(clean(filters));

  useEffect(() => {
    const next = JSON.parse(serialised);
    // Nothing actually changed, so do not hand back a new object and
    // send every consumer round the fetch loop again.
    if (JSON.stringify(appliedRef.current) === serialised) return undefined;

    const timer = setTimeout(() => {
      appliedRef.current = next;
      setApplied(next);
    }, delay);
    return () => clearTimeout(timer);
  }, [serialised, delay]);

  return applied;
}

// The same idea for a single value, where a whole filter object would be
// overkill: a donor picker whose only input is one search box.
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedFilters;

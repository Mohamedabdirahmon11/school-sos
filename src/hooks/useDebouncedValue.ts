import { useEffect, useState } from 'react';

/** Debounce a changing search/filter value without delaying the input itself. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), Math.max(0, delayMs));
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

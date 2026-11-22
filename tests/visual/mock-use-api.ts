import { useCallback, useEffect, useState } from 'react';

export function useApi<T>(load: () => Promise<T>, dependencies: unknown[] = [], enabled = true) {
  const [state, setState] = useState<{ data?: T; loading: boolean; error: Error | null }>({ loading: enabled, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!enabled) { setState({ loading: false, error: null }); return () => { active = false; }; }
    setState(previous => ({ ...previous, loading: true, error: null }));
    Promise.resolve().then(load).then(data => {
      if (active) setState({ data, loading: false, error: null });
    }).catch(error => {
      if (active) setState({ loading: false, error: error instanceof Error ? error : new Error('Mock request failed') });
    });
    return () => { active = false; };
    // Visual harness deliberately follows the hook's caller-provided dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, enabled, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { ...state, retry };
}

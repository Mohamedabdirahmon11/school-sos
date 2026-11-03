import { DependencyList, useCallback, useEffect, useState } from 'react';

export interface ApiLoadError extends Error {
  status?: number;
  code?: string;
}

const SCREEN_CACHE_MS = 60_000;
const screenCache = new Map<string, { data: unknown; expiresAt: number }>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function loadOnce<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;
  const request = Promise.resolve().then(load).finally(() => {
    if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, request);
  return request;
}

function readCache<T>(key: string): T | undefined {
  const entry = screenCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) { screenCache.delete(key); return undefined; }
  return entry.data as T;
}

function writeCache<T>(key: string, data: T) {
  screenCache.set(key, { data, expiresAt: Date.now() + SCREEN_CACHE_MS });
  if (screenCache.size > 100) {
    const now = Date.now();
    for (const [entryKey, entry] of screenCache) if (entry.expiresAt <= now) screenCache.delete(entryKey);
    while (screenCache.size > 100) screenCache.delete(screenCache.keys().next().value!);
  }
}

export function useApi<T>(load: () => Promise<T>, dependencies: DependencyList = [], enabled = true) {
  const key = `${load.toString()}::${JSON.stringify(dependencies)}`;
  const cached = readCache<T>(key);
  const [result, setResult] = useState<{ key: string; data?: T; loading: boolean; error: ApiLoadError | null }>(() => ({ key, data: cached, loading: enabled && cached === undefined, error: null }));
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    const freshCached = attempt === 0 ? readCache<T>(key) : undefined;
    if (!enabled) { setResult({ key, data: freshCached, loading: false, error: null }); return; }
    if (freshCached !== undefined) { setResult({ key, data: freshCached, loading: false, error: null }); return; }
    let current = true;
    setResult({ key, loading: true, error: null });
    void loadOnce(key, load).then(result => {
      if (current) { writeCache(key, result); setResult({ key, data: result, loading: false, error: null }); }
    }).catch(reason => {
      if (!current) return;
      setResult({ key, loading: false, error: reason instanceof Error ? reason as ApiLoadError : new Error('Unable to load this screen.') });
    });
    return () => { current = false; };
    // Dependencies are caller-defined inputs to the request; attempt triggers Retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, attempt, enabled, key]);

  const current = result.key === key;
  return { data: current ? result.data : cached, loading: !enabled ? false : current ? result.loading : cached === undefined, error: current ? result.error : null, retry };
}

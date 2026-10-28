import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './lib/errors';
import type { Snapshot } from './lib/types';

export type SnapshotState =
  | { state: 'loading' }
  | { state: 'ready'; snapshot: Snapshot; sample: boolean }
  | { state: 'error'; message: string };

async function fetchJson(url: string): Promise<Snapshot | null> {
  const response = await fetch(url, { cache: 'no-cache' });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }

  // Some hosts answer a missing file with an HTML page: treat it as missing.
  if (!response.headers.get('content-type')?.includes('json')) {
    return null;
  }

  const snapshot = (await response.json()) as Snapshot;

  return snapshot;
}

/**
 * Loads data.json, written every 30 minutes by the snapshot workflow. During
 * development (or a preview build) it falls back on the made-up sample.
 */
export function useSnapshot(): SnapshotState {
  const [result, setResult] = useState<SnapshotState>({ state: 'loading' });

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const allowSample = import.meta.env.DEV || import.meta.env.VITE_ALLOW_SAMPLE === 'true';
    (async () => {
      const live = await fetchJson(`${base}data.json`);

      if (live) {
        return setResult({ state: 'ready', snapshot: live, sample: false });
      }

      const sample = allowSample ? await fetchJson(`${base}data.sample.json`) : null;

      if (sample) {
        return setResult({ state: 'ready', snapshot: sample, sample: true });
      }

      setResult({ state: 'error', message: 'data.json is missing. Run the snapshot workflow, or `npm run snapshot` locally.' });
    })().catch((error: unknown) => setResult({ state: 'error', message: errorMessage(error) }));
  }, []);

  return result;
}

/**
 * State kept in this browser only (setup, drafts). Storage can be missing or
 * throw (private mode, blocked site data): the page then works without it.
 */
export function useStoredState<T extends object>(key: string, initial: T): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : ({ ...initial, ...JSON.parse(raw) } as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable: keep the value in memory only.
    }
  }, [key, value]);

  return [value, setValue];
}

/** The PR number in the URL hash (`#28148`), so a PR can be linked directly. */
export function useHashSelection(): [number | null, (number: number | null) => void] {
  const read = () => {
    const n = Number(window.location.hash.replace(/^#/, ''));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const [selected, setSelected] = useState<number | null>(read);

  useEffect(() => {
    const onHashChange = () => setSelected(read());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const select = useCallback((number: number | null) => {
    if (number === null) {
      history.pushState(null, '', window.location.pathname + window.location.search);
    } else {
      window.location.hash = String(number);
    }

    setSelected(number);
  }, []);

  return [selected, select];
}

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { HostedTracker, activeBuild } from './lib/hosted';

export function useHostedBuilds(connected: boolean, selectedKey: string | null, instance = 'unconfigured') {
  const tracker = useMemo(() => {
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      /* In-memory operation remains available. */
    }
    return new HostedTracker(storage, undefined, navigator.locks ? (name, run) => navigator.locks.request(name, run) : undefined, instance);
  }, [instance]);
  const tasks = useSyncExternalStore(tracker.subscribe, tracker.snapshot);
  const selectedID = selectedKey ? tasks[selectedKey]?.id : undefined;
  useEffect(() => {
    const sync = () => tracker.sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [tracker]);
  useEffect(() => {
    if (!connected || !selectedKey || !selectedID) {
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await tracker.poll(selectedKey, controller.signal);
      if (!controller.signal.aborted) {
        const current = tracker.snapshot()[selectedKey];
        if (current?.missing) {
          return;
        }
        const delay = current?.build && !activeBuild(current.build) ? 30000 : 5000;
        timer = setTimeout(() => {
          void poll();
        }, delay);
      }
    };
    void poll();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [connected, selectedKey, selectedID, tracker]);
  return { tracker, tasks };
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostedTracker, hostedProgress, taskKey } from '../src/lib/hosted';
import { APIError } from '../src/lib/tc9';
import type { Build, BuildInput, BuildPage, request } from '../src/lib/tc9';

type MockRequest = (path: string, options?: Parameters<typeof request>[1]) => Promise<unknown>;
const repository = 'azerothcore/azerothcore-wotlk';
const input: BuildInput = { repository, pr_number: 42, build_server: 'auto', modules: [], characters: [] };
const key = taskKey(repository, 42);
function build(id = 'build-42', pr = 42, status = 'queued'): Build {
  return { id, repository, pr_number: pr, status, sha: 'a'.repeat(40), created_at: '2026-11-03T00:00:00Z' };
}
function page(builds: Build[] = [], total = builds.length): BuildPage {
  return { builds, total, limit: 100, offset: 0 };
}
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      values.set(name, value);
    },
    values,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => vi.useRealTimers());

describe('hosted compilation requests', () => {
  it('blocks same-frame repeated clicks, then reuses the accepted operation instead of posting again', async () => {
    const pending = deferred<Build>();
    const send = vi
      .fn<MockRequest>()
      .mockResolvedValueOnce(page())
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(build());
    const tracker = new HostedTracker(storage(), send as typeof request);
    const first = tracker.submit(input, 'csrf');
    expect(tracker.snapshot()[key].submitting).toBe(true);
    await tracker.submit(input, 'csrf');
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    pending.resolve(build());
    await first;
    await tracker.submit(input, 'csrf');
    expect(send.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    expect(tracker.snapshot()[key].id).toBe('build-42');
  });
  it('reuses the same request key and original input after a lost response, changed form and page reload', async () => {
    const saved = storage();
    const first = vi.fn<MockRequest>().mockResolvedValueOnce(page()).mockRejectedValueOnce(new TypeError('Network disconnected'));
    const tracker = new HostedTracker(saved, first as typeof request);
    await tracker.submit(input, 'csrf');
    const intent = tracker.snapshot()[key].intent;
    expect(intent?.input).toEqual(input);
    expect(hostedProgress(tracker.snapshot()[key]).label).toBe('Submission not confirmed');
    const recovered = vi.fn<MockRequest>().mockResolvedValueOnce(build());
    const reloaded = new HostedTracker(saved, recovered as typeof request);
    await reloaded.submit({ ...input, modules: ['mod-autobalance'] }, 'new-csrf');
    expect(recovered).toHaveBeenCalledWith('v1/builds', expect.objectContaining({ key: intent?.key, data: input, csrf: 'new-csrf' }));
    expect(reloaded.snapshot()[key].id).toBe('build-42');
    expect(reloaded.snapshot()[key].intent).toBeUndefined();
  });
  it('retries an ambiguous 5xx with the same key, but allows fixing explicitly rejected input', async () => {
    const send = vi
      .fn<MockRequest>()
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(new APIError('Gateway unavailable', 502, 0))
      .mockResolvedValueOnce(build());
    const tracker = new HostedTracker(storage(), send as typeof request);
    await tracker.submit(input, 'csrf');
    const original = tracker.snapshot()[key].intent?.key;
    await tracker.submit(input, 'csrf');
    expect(send.mock.calls.at(-1)?.[1]?.key).toBe(original);
    const rejected = vi
      .fn<MockRequest>()
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(new APIError('Bad fixture', 400, 0))
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(build());
    const other = new HostedTracker(storage(), rejected as typeof request);
    await other.submit(input, 'csrf');
    expect(other.snapshot()[key].intent).toBeUndefined();
    await other.submit({ ...input, modules: ['mod-autobalance'] }, 'csrf');
    expect(rejected.mock.calls.at(-1)?.[1]?.data).toMatchObject({ modules: ['mod-autobalance'] });
  });
  it('honors Retry-After before allowing another submission', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
    const send = vi
      .fn<MockRequest>()
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(new APIError('Queue full', 429, 30))
      .mockResolvedValueOnce(build());
    const tracker = new HostedTracker(storage(), send as typeof request);
    await tracker.submit(input, 'csrf');
    await tracker.submit(input, 'csrf');
    expect(send).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30000);
    await tracker.submit(input, 'csrf');
    expect(send).toHaveBeenCalledTimes(3);
  });
  it('finds a running build for the exact repository and PR, including later library pages', async () => {
    const send = vi
      .fn<MockRequest>()
      .mockResolvedValueOnce(page([build('other-pr', 99)], 101))
      .mockResolvedValueOnce(page([build()], 101));
    const tracker = new HostedTracker(storage(), send as typeof request);
    await tracker.submit(input, 'csrf');
    expect(tracker.snapshot()[key].id).toBe('build-42');
    expect(send).toHaveBeenCalledWith('v1/builds?limit=100&offset=100');
    expect(send.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
  it('does not submit when checking existing builds fails', async () => {
    const send = vi.fn<MockRequest>().mockRejectedValueOnce(new TypeError('Offline'));
    const tracker = new HostedTracker(storage(), send as typeof request);
    await tracker.submit(input, 'csrf');
    expect(send).toHaveBeenCalledTimes(1);
    expect(tracker.snapshot()[key].error).toBe('Offline');
    expect(tracker.snapshot()[key].submitting).toBe(false);
  });
  it('serializes two tabs and adopts the accepted build when the second tab acquires its lock', async () => {
    const saved = storage();
    let tail = Promise.resolve();
    const lock = (_name: string, run: () => Promise<void>) => {
      const next = tail.then(run);
      tail = next;
      return next;
    };
    const send = vi.fn<MockRequest>().mockResolvedValueOnce(page()).mockResolvedValueOnce(build()).mockResolvedValueOnce(build());
    const tab1 = new HostedTracker(saved, send as typeof request, lock);
    const tab2 = new HostedTracker(saved, send as typeof request, lock);
    await Promise.all([tab1.submit(input, 'csrf'), tab2.submit(input, 'csrf')]);
    expect(send.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    expect(tab1.snapshot()[key].id).toBe(tab2.snapshot()[key].id);
  });
  it('only creates a fresh request after an explicitly requested retry of a terminal failure', async () => {
    const send = vi
      .fn<MockRequest>()
      .mockResolvedValueOnce(build('failed', 42, 'failed'))
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(build('replacement'));
    const tracker = new HostedTracker(storage(), send as typeof request);
    tracker.accept(build('failed', 42, 'failed'));
    await tracker.submit(input, 'csrf', true);
    expect(tracker.snapshot()[key].id).toBe('replacement');
    expect(send.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });
});

describe('per-PR progress and recovery', () => {
  it('keeps the exact tracked operation when list pagination contains other builds of the same PR', async () => {
    const send = vi.fn<MockRequest>().mockResolvedValue({ ...build(), build: { status: 'building', progress_percent: 47 } });
    const tracker = new HostedTracker(storage(), send as typeof request);
    tracker.accept(build());
    tracker.accept(build('other-build'));
    tracker.accept(build('pr-99', 99));
    await tracker.poll(key);
    expect(tracker.snapshot()[key].id).toBe('build-42');
    expect(hostedProgress(tracker.snapshot()[key])).toMatchObject({ label: 'Compiling', percent: 47 });
    expect(tracker.snapshot()[taskKey(repository, 99)].id).toBe('pr-99');
  });
  it('persists IDs without realm credentials and restores authoritative progress after reload', async () => {
    const saved = storage();
    const ready = {
      ...build(),
      realm: {
        id: 'realm',
        repository,
        pr_number: 42,
        commit_sha: 'abc',
        state: 'running',
        realm_name: 'Test',
        admin_password: 'never-store-me',
      },
    };
    const tracker = new HostedTracker(saved);
    tracker.accept(ready);
    expect([...saved.values.values()].join()).not.toContain('never-store-me');
    const send = vi.fn<MockRequest>().mockResolvedValue({ ...ready, status: 'completed' });
    const reloaded = new HostedTracker(saved, send as typeof request);
    expect(reloaded.snapshot()[key].build).toBeUndefined();
    await reloaded.poll(key);
    expect(hostedProgress(reloaded.snapshot()[key]).label).toBe('Test realm ready');
  });
  it('keeps last known progress during failures, respects backoff and clears the error on recovery', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
    const send = vi
      .fn<MockRequest>()
      .mockRejectedValueOnce(new APIError('Limited', 429, 30))
      .mockResolvedValueOnce({ ...build(), build: { status: 'building', progress_percent: 61 } });
    const tracker = new HostedTracker(storage(), send as typeof request);
    tracker.accept({ ...build(), build: { status: 'building', progress_percent: 35 } });
    await tracker.poll(key);
    await tracker.poll(key);
    expect(send).toHaveBeenCalledTimes(1);
    expect(hostedProgress(tracker.snapshot()[key]).percent).toBe(35);
    expect(tracker.snapshot()[key].pollError).toMatch(/Progress temporarily unavailable/);
    vi.advanceTimersByTime(30000);
    await tracker.poll(key);
    expect(hostedProgress(tracker.snapshot()[key]).percent).toBe(61);
    expect(tracker.snapshot()[key].pollError).toBeUndefined();
  });
  it('ignores aborted and stale requests after another compilation has been selected', async () => {
    const pending = deferred<Build>();
    const send = vi.fn<MockRequest>().mockImplementationOnce(() => pending.promise);
    const tracker = new HostedTracker(storage(), send as typeof request);
    tracker.accept(build());
    const controller = new AbortController();
    const polling = tracker.poll(key, controller.signal);
    controller.abort();
    pending.resolve({ ...build(), status: 'failed' });
    await polling;
    expect(tracker.snapshot()[key].build?.status).toBe('queued');
  });
  it('remains usable when storage is blocked or corrupt', async () => {
    const blocked = {
      getItem: () => {
        throw new Error('Blocked');
      },
      setItem: () => {
        throw new Error('Blocked');
      },
    };
    const send = vi.fn<MockRequest>().mockResolvedValueOnce(page()).mockResolvedValueOnce(build());
    const tracker = new HostedTracker(blocked, send as typeof request);
    await tracker.submit(input, 'csrf');
    expect(tracker.snapshot()[key].id).toBe('build-42');
    const corrupt = new HostedTracker({ getItem: () => '{invalid', setItem: () => undefined });
    expect(corrupt.snapshot()).toEqual({});
  });
});

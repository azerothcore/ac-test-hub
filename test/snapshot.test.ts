import { describe, expect, it } from 'vitest';
import { createClient, mapWithConcurrency, type FetchLike } from '../src/lib/github';
import { buildSnapshot } from '../src/lib/snapshot';
import { SNAPSHOT_VERSION, type Snapshot } from '../src/lib/types';
import { filledTemplate } from './fixtures/bodies';

const REPO = 'azerothcore/azerothcore-wotlk';
const API = 'https://api.github.com';

function searchItem(number: number, extra: Record<string, unknown> = {}) {
  return {
    number,
    title: `fix(Core/Spells): PR ${number}`,
    html_url: `https://github.com/${REPO}/pull/${number}`,
    user: { login: 'dev' },
    labels: [{ name: 'DB' }, { name: 'file-cpp' }],
    draft: false,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    comments: 2,
    body: filledTemplate, // links issues #12345 and #12346
    ...extra,
  };
}

const comment = (login: string, body: string, id: number) => ({
  user: { login, type: 'User' },
  body,
  html_url: `https://github.com/${REPO}/pull/1#issuecomment-${id}`,
  created_at: '2026-10-03T00:00:00Z',
});

interface FakeOptions {
  routes: Record<string, unknown>;
  calls?: string[];
  /** Value of x-ratelimit-remaining on every non-search answer. */
  remaining?: number;
}

/** A fake GitHub API answering from a route table (longest matching prefix wins). */
function fakeFetch({ routes, calls = [], remaining = 5000 }: FakeOptions): FetchLike {
  return async (url) => {
    calls.push(url);
    const path = url.replace(API, '');
    const key = Object.keys(routes)
      .filter((route) => path.startsWith(route))
      .sort((a, b) => b.length - a.length)[0];
    const body = key ? routes[key] : undefined;
    const ok = body !== undefined;
    return {
      ok,
      status: ok ? 200 : 404,
      headers: { get: (name: string) => (name === 'x-ratelimit-remaining' ? String(remaining) : null) },
      json: async () => body,
      text: async () => (ok ? JSON.stringify(body) : 'Not Found'),
    };
  };
}

const fullRoutes = {
  '/search/issues': { total_count: 3, items: [searchItem(1), searchItem(2), searchItem(3, { draft: true })] },
  [`/repos/${REPO}/pulls/1/files`]: [{ filename: 'data/sql/updates/pending_db_world/rev_1.sql', raw_url: 'raw1' }],
  // PR 2 has no files route: it falls back on its labels.
  [`/repos/${REPO}/issues/1/comments`]: [
    comment('dev', 'Tested it myself, works.', 1), // the author: not a report
    comment('tester', 'Tested in game on a local server, works as intended.', 2),
  ],
  [`/repos/${REPO}/issues/2/comments`]: [],
  [`/repos/${REPO}/issues/12345`]: { labels: [{ name: 'Class - Death Knight' }, { name: 'Confirmed' }, { name: '80' }] },
  [`/repos/${REPO}/issues/12346`]: { labels: [{ name: 'Instance - Raid - Northrend' }] },
};

describe('buildSnapshot', () => {
  it('reads files, comments and linked issues of each PR', async () => {
    const calls: string[] = [];
    const client = createClient('token', fakeFetch({ routes: fullRoutes, calls }));

    const { snapshot, stats } = await buildSnapshot(client, { repository: REPO, now: new Date('2026-10-15T12:00:00Z') });

    expect(snapshot.version).toBe(SNAPSHOT_VERSION);
    expect(snapshot.generatedAt).toBe('2026-10-15T12:00:00.000Z');
    expect(snapshot.pulls.map((p) => [p.number, p.kind, p.kindSource, p.status])).toEqual([
      [1, 'sql-only', 'files', 'open'],
      [2, 'build', 'labels', 'open'],
      [3, 'build', 'labels', 'wip'],
    ]);
    const [first] = snapshot.pulls;
    expect(first.sqlFiles[0]).toMatchObject({ database: 'world', rawUrl: 'raw1' });
    expect(first.area).toEqual({ group: 'Core', topic: 'Spells' });
    expect(first.topics).toEqual(['Class - Death Knight', '80', 'Instance - Raid - Northrend']);
    expect(first.reports).toEqual([
      expect.objectContaining({ author: 'tester', kind: 'in-game', result: 'works', url: expect.stringContaining('#issuecomment-2') }),
    ]);
    expect(stats).toEqual({ pulls: 3, reused: 0, fetched: 1, partial: 1 });
    // Drafts are skipped, and the two PRs share their linked issues: fetched once each.
    expect(calls.some((url) => url.includes('/pulls/3/') || url.includes('/issues/3/'))).toBe(false);
    expect(calls.filter((url) => url.endsWith('/issues/12345'))).toHaveLength(1);
  });

  it('reuses the previous snapshot for PRs that did not change', async () => {
    const first = await buildSnapshot(createClient('token', fakeFetch({ routes: fullRoutes })), { repository: REPO });

    const calls: string[] = [];
    const routes = {
      ...fullRoutes,
      '/search/issues': {
        total_count: 2,
        items: [searchItem(1), searchItem(2, { updated_at: '2026-10-05T00:00:00Z' })],
      },
      [`/repos/${REPO}/pulls/2/files`]: [{ filename: 'src/server/game/Spells/Spell.cpp', raw_url: 'raw2' }],
    };
    const { snapshot, stats } = await buildSnapshot(createClient('token', fakeFetch({ routes, calls })), {
      repository: REPO,
      previous: first.snapshot,
    });

    // PR 1 is unchanged: nothing fetched for it, same details as before.
    expect(calls.some((url) => /\/(pulls|issues)\/1\//.test(url))).toBe(false);
    expect(snapshot.pulls[0].reports).toEqual(first.snapshot.pulls[0].reports);
    expect(snapshot.pulls[0].kindSource).toBe('files');
    // PR 2 changed: fetched again, now classified from its files.
    expect(snapshot.pulls[1]).toMatchObject({ kind: 'build', kindSource: 'files' });
    expect(stats).toMatchObject({ reused: 1, fetched: 1 });
  });

  it('ignores a previous snapshot of another version or repository', async () => {
    const previous: Snapshot = { version: 1, generatedAt: '', repository: REPO, pulls: [] };
    const calls: string[] = [];
    await buildSnapshot(createClient('token', fakeFetch({ routes: fullRoutes, calls })), { repository: REPO, previous });
    expect(calls.some((url) => url.includes('/pulls/1/files'))).toBe(true);
  });

  it('stops fetching details when the API budget runs low, keeping what was known', async () => {
    const first = await buildSnapshot(createClient('token', fakeFetch({ routes: fullRoutes })), { repository: REPO });
    const changed = {
      ...fullRoutes,
      '/search/issues': { total_count: 1, items: [searchItem(1, { updated_at: '2026-10-09T00:00:00Z' })] },
      // One REST call is needed to learn the budget; the search does not count.
      [`/repos/${REPO}/issues/99`]: { labels: [] },
    };
    const client = createClient('token', fakeFetch({ routes: changed, remaining: 40 }));
    await client.get(`/repos/${REPO}/issues/99`);

    const messages: string[] = [];
    const { snapshot, stats } = await buildSnapshot(client, {
      repository: REPO,
      previous: first.snapshot,
      log: (message) => messages.push(message),
    });

    expect(stats).toMatchObject({ partial: 1, fetched: 0 });
    expect(snapshot.pulls[0].kindSource).toBe('labels');
    expect(snapshot.pulls[0].reports).toEqual(first.snapshot.pulls[0].reports);
    expect(messages.some((m) => m.includes('API requests left'))).toBe(true);
  });

  it('pages through search results', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => searchItem(i + 1, { draft: true }));
    const calls: string[] = [];
    const client = createClient(undefined, async (url) => {
      calls.push(url);
      const page = Number(new URL(url).searchParams.get('page'));
      const body = url.includes('/search/') ? { total_count: 101, items: page === 1 ? page1 : [searchItem(101, { draft: true })] } : [];
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => '' };
    });

    const { snapshot } = await buildSnapshot(client, { repository: REPO });
    expect(snapshot.pulls).toHaveLength(101);
    expect(calls.filter((url) => url.includes('/search/'))).toHaveLength(2);
  });

  it('fails loudly when the search itself fails, so the last deployment stays up', async () => {
    const client = createClient(undefined, fakeFetch({ routes: {} }));
    await expect(buildSnapshot(client, { repository: REPO })).rejects.toThrow(/failed with 404/);
  });
});

describe('mapWithConcurrency', () => {
  it('keeps the order and never exceeds the limit', async () => {
    let running = 0;
    let peak = 0;
    const result = await mapWithConcurrency([5, 1, 3, 2, 4], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, n));
      running--;
      return n * 10;
    });
    expect(result).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBe(2);
  });
});

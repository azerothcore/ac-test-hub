import { describe, expect, it } from 'vitest';
import { decodeResponse, parseCharacters, retryAfter } from '../src/lib/tc9';

describe('TC9 character fixtures', () => {
  it('supports no characters and a complete valid testing fixture', () => {
    expect(parseCharacters('[]')).toEqual([]);
    const fixture = [
      {
        name: 'Tester',
        race: 'human',
        class: 'warrior',
        level: 80,
        money_gold: 10000,
        items: [{ id: 6948, count: 1 }],
        active_quests: [7],
        completed_quests: [783],
      },
    ];
    expect(parseCharacters(JSON.stringify(fixture))).toEqual(fixture);
  });
  it('rejects wrong race/class combinations, duplicate names and out of range values', () => {
    const character = { name: 'Tester', race: 'human', class: 'warrior', level: 80 };
    for (const change of [{ race: 'human', class: 'druid' }, { level: 81 }, { money_gold: 10001 }, { name: 'x' }, { dangerous: true }]) {
      expect(() => parseCharacters(JSON.stringify([{ ...character, ...change }]))).toThrow(/./);
    }
    expect(() => parseCharacters(JSON.stringify([character, { ...character, name: 'tester' }]))).toThrow(/./);
    expect(() => parseCharacters(JSON.stringify(Array.from({ length: 4 }, () => character)))).toThrow(/./);
  });
  it('rejects overlapping quests, duplicate items, invalid counts and malformed JSON', () => {
    const character = { name: 'Tester', race: 'human', class: 'warrior', level: 80 };
    for (const change of [
      { active_quests: [7], completed_quests: [7] },
      { active_quests: Array.from({ length: 26 }, (_, n) => n + 1) },
      { items: [{ id: 1, count: 0 }] },
      {
        items: [
          { id: 1, count: 1 },
          { id: 1, count: 2 },
        ],
      },
    ]) {
      expect(() => parseCharacters(JSON.stringify([{ ...character, ...change }]))).toThrow(/./);
    }
    expect(() => parseCharacters('{')).toThrow(/./);
    expect(() => parseCharacters('{}')).toThrow(/./);
  });
});

// A provider outage, old schema or proxy error must not escape into render-time exceptions.
describe('TC9 response boundary', () => {
  it('accepts nullable provider phases and modules, while stripping legacy shared credentials', () => {
    const realm = {
      id: 'realm-42',
      repository: 'owner/core',
      pr_number: 42,
      commit_sha: 'abc',
      state: 'running',
      realm_name: 'PR 42',
      admin_password: 'shared-secret',
      admin_username: 'admin',
    };
    const payload = {
      id: 'build-42',
      repository: 'owner/core',
      pr_number: 42,
      sha: 'abc',
      status: 'completed',
      created_at: '2026-11-03T00:00:00Z',
      modules: null,
      build: null,
      database: null,
      error: null,
      realm,
    };
    const decoded = decodeResponse('v1/builds/build-42', payload);
    expect(decoded).toMatchObject({ id: 'build-42', realm: { state: 'running' } });
    expect(JSON.stringify(decoded)).not.toContain('shared-secret');
    expect(decodeResponse('v1/builds?limit=20', { builds: [payload], total: 1, offset: 0, limit: 20 })).toMatchObject({ total: 1 });
  });
  it('rejects malformed arrays, phases, capacity and configuration before UI state is updated', () => {
    for (const [path, value] of [
      ['config', { sharedAccount: true }],
      ['connection', { connected: true }],
      ['v1/status', { available: true, builds_available: true, build_servers: null }],
      ['v1/builds', { builds: null, total: 0, offset: 0, limit: 20 }],
      ['v1/builds/id', { id: 'id', status: 12 }],
      ['v1/realms', { realms: [] }],
      ['v1/modules', [{ name: 'module', description: '', url: 'javascript:alert(1)' }]],
      ['v1/realms/id/account', { realm_id: 'id', state: 'ready' }],
    ] as [string, unknown][]) {
      expect(() => decodeResponse(path, value)).toThrow(/incompatible response/);
    }
  });
  it('tolerates additional fields and unknown build states for forward compatibility', () => {
    const value = {
      id: 'id',
      repository: 'owner/core',
      pr_number: 1,
      sha: '',
      status: 'new-provider-phase',
      created_at: '',
      build: { state: 'new-provider-phase', progress_percent: -1, extra: true },
      extra: {},
    };
    expect(decodeResponse('v1/builds/id', value)).toMatchObject({ status: 'new-provider-phase' });
    expect(decodeResponse('v1/realms/id/account', { realm_id: 'id', state: 'pending' }, 'POST')).toMatchObject({ state: 'pending' });
  });
  it('honors both Retry-After formats and ignores malformed or past dates', () => {
    const now = Date.parse('2026-11-03T00:00:00Z');
    expect(retryAfter('30', now)).toBe(30);
    expect(retryAfter('Tue, 03 Nov 2026 00:00:45 GMT', now)).toBe(45);
    expect(retryAfter('Tue, 03 Nov 2026 00:00:00 GMT', now + 1000)).toBe(0);
    expect(retryAfter('invalid', now)).toBe(0);
    expect(retryAfter(null, now)).toBe(0);
  });
});

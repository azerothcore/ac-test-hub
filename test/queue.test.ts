import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterPulls, sortPulls, wantsTesters } from '../src/lib/queue';
import { makePull } from './fixtures/pulls';

describe('wantsTesters', () => {
  it('is true for the label or the "requires further testing" box', () => {
    expect(wantsTesters(makePull({ number: 1, status: 'waiting' }))).toBe(true);
    expect(wantsTesters(makePull({ number: 2, testing: { needsMoreTesting: true } }))).toBe(true);
    expect(wantsTesters(makePull({ number: 3 }))).toBe(false);
  });

  it('is false once tested, even if the box is ticked', () => {
    expect(wantsTesters(makePull({ number: 4, status: 'tested', testing: { needsMoreTesting: true } }))).toBe(false);
  });
});

describe('filterPulls', () => {
  const pulls = [
    makePull({ number: 1, status: 'waiting', kind: 'sql-only', title: 'fix(DB/SAI): naga overseers' }),
    makePull({ number: 2, status: 'tested' }),
    makePull({ number: 3, status: 'wip' }),
    makePull({ number: 4, status: 'open', testing: { instructions: null }, author: { login: 'Nossiffe' } }),
  ];

  it('shows only testable PRs by default', () => {
    expect(filterPulls(pulls, DEFAULT_FILTERS).map((p) => p.number)).toEqual([1, 4]);
  });

  it('filters by status, kind, instructions and text', () => {
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, status: 'tested' }).map((p) => p.number)).toEqual([2]);
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, status: 'all', kind: 'sql-only' }).map((p) => p.number)).toEqual([1]);
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, withInstructionsOnly: true }).map((p) => p.number)).toEqual([1]);
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, query: 'naga' }).map((p) => p.number)).toEqual([1]);
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, query: '#4' }).map((p) => p.number)).toEqual([4]);
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, query: 'nossiffe' }).map((p) => p.number)).toEqual([4]);
  });
});

describe('sortPulls', () => {
  const pulls = [
    makePull({ number: 1, createdAt: '2026-09-01T00:00:00Z', comments: 5 }),
    makePull({ number: 2, status: 'waiting', createdAt: '2026-10-05T00:00:00Z', comments: 1 }),
    makePull({ number: 3, createdAt: '2026-08-01T00:00:00Z', testing: { needsMoreTesting: true }, comments: 0 }),
    makePull({ number: 4, createdAt: '2026-07-01T00:00:00Z', testing: { needsMoreTesting: true, instructions: null } }),
  ];

  it('puts labelled PRs first, then PRs asking for testers with steps', () => {
    expect(sortPulls(pulls, 'priority').map((p) => p.number)).toEqual([2, 3, 4, 1]);
  });

  it('sorts by age, activity and discussion', () => {
    expect(sortPulls(pulls, 'oldest').map((p) => p.number)).toEqual([4, 3, 1, 2]);
    expect(sortPulls(pulls, 'quiet').map((p) => p.number)[0]).toBe(4);
  });
});

describe('test reports in the queue', () => {
  const report = { author: 'tester', url: '', createdAt: '2026-10-10T00:00:00Z', kind: 'in-game' as const, result: 'works' as const };
  const pulls = [
    makePull({ number: 1, status: 'waiting', reports: [report], createdAt: '2026-09-01T00:00:00Z' }),
    makePull({ number: 2, status: 'waiting', reports: [], createdAt: '2026-10-01T00:00:00Z' }),
    makePull({ number: 3, status: 'waiting', reports: null, createdAt: '2026-10-02T00:00:00Z' }),
  ];

  it('puts PRs nobody reported on before those already tested', () => {
    expect(sortPulls(pulls, 'priority').map((p) => p.number)).toEqual([2, 3, 1]);
  });

  it('can show only PRs without a report', () => {
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, unreportedOnly: true }).map((p) => p.number)).toEqual([2, 3]);
  });
});

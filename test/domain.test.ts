import { describe, expect, it } from 'vitest';
import { compareDomainLabels, domainGroup, isDomainLabel, parseArea } from '../src/lib/domain';
import { DEFAULT_FILTERS, domainOptions, filterPulls, matchesDomain } from '../src/lib/queue';
import { makePull } from './fixtures/pulls';

describe('parseArea', () => {
  it('reads the scope of conventional titles', () => {
    expect(parseArea('fix(Scripts/DeathKnight): Move Blood Tap handling')).toEqual({ group: 'Scripts', topic: 'DeathKnight' });
    expect(parseArea('fix(DB/SmartAI): Make naga overseers call a slave')).toEqual({ group: 'DB', topic: 'SmartAI' });
    expect(parseArea('refactor(scripts/Instance/Naxx): tidy up')).toEqual({ group: 'Scripts', topic: 'Instance/Naxx' });
    expect(parseArea('chore(Docker): bump base image')).toEqual({ group: 'Docker', topic: null });
    expect(parseArea('feat!(Core/Spells): breaking')).toEqual({ group: 'Core', topic: 'Spells' });
    expect(parseArea('Revert "fix(Scripts/Ulduar): shatter constructs"')).toEqual({ group: 'Scripts', topic: 'Ulduar' });
  });

  it('returns null without a scope', () => {
    expect(parseArea('Fix the trapped crates')).toBeNull();
    expect(parseArea('fix: crates')).toBeNull();
  });
});

describe('domain labels', () => {
  it('keeps the labels that say which part of the game an issue is about', () => {
    expect(domainGroup('Class - Death Knight')).toBe('Class');
    expect(domainGroup('Instance - Raid - Northrend')).toBe('Instance');
    expect(domainGroup('1-19')).toBe('Level');
    expect(domainGroup('80')).toBe('Level');
    expect(domainGroup('Quest')).toBe('Topic');
    expect(isDomainLabel('Confirmed')).toBe(false);
    expect(isDomainLabel('ChromieCraft Generic')).toBe(false);
  });

  it('sorts level ranges by their first level', () => {
    expect(['80', '1-19', '61-64', '20-29'].sort(compareDomainLabels)).toEqual(['1-19', '20-29', '61-64', '80']);
  });
});

describe('domain filter', () => {
  const pulls = [
    makePull({ number: 1, topics: ['Class - Death Knight', '80'], area: { group: 'Scripts', topic: 'DeathKnight' } }),
    makePull({ number: 2, topics: ['Instance - Raid - Northrend', '80'], area: { group: 'Scripts', topic: 'Ulduar' } }),
    makePull({ number: 3, area: { group: 'Core', topic: 'Spells' } }),
    makePull({ number: 4 }),
  ];

  it('matches linked-issue labels and code areas', () => {
    expect(matchesDomain(pulls[0], 'topic:Class - Death Knight')).toBe(true);
    expect(matchesDomain(pulls[2], 'topic:Class - Death Knight')).toBe(false);
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, domain: 'topic:80' }).map((p) => p.number)).toEqual([1, 2]);
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, domain: 'area:Scripts' }).map((p) => p.number)).toEqual([1, 2]);
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, domain: 'area:Scripts/Ulduar' }).map((p) => p.number)).toEqual([2]);
    expect(filterPulls(pulls, { ...DEFAULT_FILTERS, domain: '' })).toHaveLength(4);
  });

  it('builds the choices from the PRs, with counts', () => {
    const groups = domainOptions(pulls);
    expect(groups.map((g) => g.label)).toEqual(['Class', 'Instance', 'Level', 'Code area']);
    expect(groups[0].options).toEqual([{ value: 'topic:Class - Death Knight', label: 'Death Knight', count: 1 }]);
    expect(groups[2].options).toEqual([{ value: 'topic:80', label: '80', count: 2 }]);
    expect(groups[3].options.map((o) => [o.label, o.count])).toEqual([
      ['Core (all)', 1],
      ['Core/Spells', 1],
      ['Scripts (all)', 2],
      ['Scripts/DeathKnight', 1],
      ['Scripts/Ulduar', 1],
    ]);
  });
});

describe('domainOptions with a selection', () => {
  it('keeps the selected choice even when no PR matches it', () => {
    const groups = domainOptions([], 'topic:Class - Mage');
    expect(groups).toEqual([{ label: 'Class', options: [{ value: 'topic:Class - Mage', label: 'Mage', count: 0 }] }]);
  });
});

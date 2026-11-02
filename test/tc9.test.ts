import { describe, expect, it } from 'vitest';
import { parseCharacters } from '../src/lib/tc9';

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

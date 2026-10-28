import type { CodeArea } from './types';

/**
 * Reads the scope of a conventional PR title, as AzerothCore's commit
 * guidelines ask: `fix(Scripts/Ulduar): ...` gives { group: 'Scripts', topic: 'Ulduar' }.
 */
export function parseArea(title: string): CodeArea | null {
  // A revert keeps the scope of the PR it reverts: Revert "fix(Scripts/Ulduar): ...".
  const match = /^\s*(?:Revert\s+["“])?[a-z]+!?\(([^)]+)\)/i.exec(title);

  if (!match) {
    return null;
  }

  const [group, ...rest] = match[1].split('/').map((part) => part.trim()).filter(Boolean);

  if (!group) {
    return null;
  }

  return {
    group: group.charAt(0).toUpperCase() + group.slice(1),
    topic: rest.length ? rest.join('/') : null,
  };
}

export type DomainGroup = 'Class' | 'Instance' | 'Level' | 'Topic';

/**
 * Labels AzerothCore puts on issues to say which part of the game they are
 * about. PRs rarely carry them, so the snapshot reads them from linked issues.
 */
const DOMAIN_LABELS: ReadonlyArray<[RegExp, DomainGroup]> = [
  [/^Class - /, 'Class'],
  [/^Instance - /, 'Instance'],
  [/^\d{1,2}(?:-\d{1,2})?$/, 'Level'],
  [/^(?:Battlegrounds|DB Spawns|GM Commands|Loot|Profession|PvP|Quest|Translation|World Event)$/, 'Topic'],
];

export function domainGroup(label: string): DomainGroup | null {
  return DOMAIN_LABELS.find(([pattern]) => pattern.test(label))?.[1] ?? null;
}

export const isDomainLabel = (label: string) => domainGroup(label) !== null;

/** A topic without its group prefix: "Class - Death Knight" gives "Death Knight". */
export const shortTopic = (label: string) => label.replace(/^(Class|Instance) - /, '');

/** Level labels sort by their first number ("1-19" before "60"), others alphabetically. */
export function compareDomainLabels(a: string, b: string): number {
  const level = (label: string) => (domainGroup(label) === 'Level' ? Number(label.split('-')[0]) : NaN);
  const [la, lb] = [level(a), level(b)];

  if (!Number.isNaN(la) && !Number.isNaN(lb)) {
    return la - lb;
  }

  return a.localeCompare(b);
}

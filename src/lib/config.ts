import type { PullStatus } from './types';

export const REPOSITORY = 'azerothcore/azerothcore-wotlk';

export const issueUrl = (repository: string, number: number) => `https://github.com/${repository}/issues/${number}`;

/** The databases of a default AzerothCore install. */
export const DATABASES = { world: 'acore_world', characters: 'acore_characters', auth: 'acore_auth' } as const;

export const WIKI = {
  howToTestPr: 'https://www.azerothcore.org/wiki/how-to-test-a-pr',
  howToTestDbOnly: 'https://www.azerothcore.org/wiki/how-to-test-db-only-changes',
} as const;

/**
 * Labels that set a PR's status, in priority order: the first rule that
 * matches wins. Label names are compared case-insensitively, because the
 * repository uses "Waiting to be Tested" while the wiki writes "tested".
 */
export const STATUS_RULES: ReadonlyArray<{ status: PullStatus; labels: readonly string[] }> = [
  { status: 'wip', labels: ['WIP', 'SENSITIVE WIP'] },
  { status: 'conflicts', labels: ['Merge Conflicts'] },
  { status: 'to-merge', labels: ['To Be Merged', 'To Be Merged - Later'] },
  { status: 'tested', labels: ['Tested'] },
  { status: 'in-progress', labels: ['Testing in Progress'] },
  { status: 'needs-info', labels: ['Waiting For More Info from Author'] },
  { status: 'waiting', labels: ['Waiting to be Tested'] },
];

/** Statuses a tester can usefully pick up. */
export const TESTABLE_STATUSES: readonly PullStatus[] = ['waiting', 'in-progress', 'open'];

/** Labels the AzerothCore labeler adds for C++ / CMake changes (fallback when files are unavailable). */
export const BUILD_LABELS = ['file-cpp', 'CORE', 'Script', 'CMake', 'UnitTests'] as const;
export const DB_LABEL = 'DB';

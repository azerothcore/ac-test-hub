import type { PullSummary, TestingInfo } from '../../src/lib/types';

type PullOverrides = Partial<Omit<PullSummary, 'testing'>> & { number: number; testing?: Partial<TestingInfo> };

export function makePull({ testing, ...overrides }: PullOverrides): PullSummary {
  return {
    title: `fix: pull ${overrides.number}`,
    url: `https://github.com/azerothcore/azerothcore-wotlk/pull/${overrides.number}`,
    author: { login: 'author' },
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    labels: [],
    status: 'open',
    kind: 'build',
    kindSource: 'files',
    sqlFiles: [],
    comments: 0,
    issues: [],
    area: null,
    topics: [],
    reports: [],
    ...overrides,
    testing: {
      instructions: '1. Do it.',
      instructionsHeading: 'How to Test the Changes',
      authorTests: null,
      reproStepsInIssue: false,
      needsMoreTesting: false,
      testedByAuthor: true,
      testedByOthers: false,
      ...testing,
    },
  };
}

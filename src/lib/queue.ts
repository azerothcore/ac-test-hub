import { TESTABLE_STATUSES } from './config';
import { compareDomainLabels, domainGroup, shortTopic, type DomainGroup } from './domain';
import type { ChangeKind, PullStatus, PullSummary } from './types';

export type StatusFilter = 'testable' | 'all' | PullStatus;
export type SortKey = 'priority' | 'oldest' | 'updated' | 'quiet';

export interface QueueFilters {
  status: StatusFilter;
  kind: 'all' | ChangeKind;
  withInstructionsOnly: boolean;
  testersWantedOnly: boolean;
  /** Only PRs nobody has reported on yet. */
  unreportedOnly: boolean;
  /** `''` for any, `topic:<label>` for a linked issue label, `area:<Group>` or `area:<Group>/<Topic>` for the title scope. */
  domain: string;
  query: string;
}

export const DEFAULT_FILTERS: QueueFilters = {
  status: 'testable',
  kind: 'all',
  withInstructionsOnly: false,
  testersWantedOnly: false,
  unreportedOnly: false,
  domain: '',
  query: '',
};

/** Number of test reports, 0 when the comments could not be read. */
export const reportCount = (pull: PullSummary) => pull.reports?.length ?? 0;

/** The author wrote test steps, or says the linked issue's reproduction steps apply. */
export const hasTestSteps = (pull: Pick<PullSummary, 'testing'>) =>
  pull.testing.instructions !== null || pull.testing.reproStepsInIssue;

const areaKey = (pull: PullSummary) => (pull.area ? `${pull.area.group}${pull.area.topic ? `/${pull.area.topic}` : ''}` : null);

export function matchesDomain(pull: PullSummary, domain: string): boolean {
  if (!domain) {
    return true;
  }

  if (domain.startsWith('topic:')) {
    return pull.topics.includes(domain.slice('topic:'.length));
  }

  if (domain.startsWith('area:')) {
    const wanted = domain.slice('area:'.length);
    const key = areaKey(pull);
    return key !== null && (key === wanted || key.startsWith(`${wanted}/`));
  }

  return true;
}

export interface DomainOption {
  value: string;
  label: string;
  count: number;
}

export type DomainOptionGroup = { label: DomainGroup | 'Code area'; options: DomainOption[] };

/**
 * The domain filter's choices, built from the PRs at hand, with how many PRs
 * each one keeps. `selected` stays in the list even when no PR matches it
 * any more, so the select never shows a choice that isn't the active one.
 */
export function domainOptions(pulls: readonly PullSummary[], selected = ''): DomainOptionGroup[] {
  const topics = new Map<string, number>();
  const areas = new Map<string, number>();

  if (selected.startsWith('topic:')) {
    topics.set(selected.slice('topic:'.length), 0);
  }

  if (selected.startsWith('area:')) {
    areas.set(selected.slice('area:'.length), 0);
  }

  for (const pull of pulls) {
    for (const topic of pull.topics) {
      topics.set(topic, (topics.get(topic) ?? 0) + 1);
    }

    if (pull.area) {
      areas.set(pull.area.group, (areas.get(pull.area.group) ?? 0) + 1);

      if (pull.area.topic) {
        const key = `${pull.area.group}/${pull.area.topic}`;
        areas.set(key, (areas.get(key) ?? 0) + 1);
      }
    }
  }

  const groups: DomainOptionGroup[] = (['Class', 'Instance', 'Level', 'Topic'] as const).map((group) => ({
    label: group,
    options: [...topics]
      .filter(([label]) => domainGroup(label) === group)
      .sort(([a], [b]) => compareDomainLabels(a, b))
      .map(([label, count]) => ({ value: `topic:${label}`, label: shortTopic(label), count })),
  }));
  groups.push({
    label: 'Code area',
    options: [...areas]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ value: `area:${key}`, label: key.includes('/') ? key : `${key} (all)`, count })),
  });
  return groups.filter((group) => group.options.length > 0);
}

/** Labelled "Waiting to be Tested", or the author ticked "requires further testing". */
export function wantsTesters(pull: PullSummary): boolean {
  return pull.status === 'waiting' || ((pull.status === 'open' || pull.status === 'in-progress') && pull.testing.needsMoreTesting);
}

function matchesQuery(pull: PullSummary, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, '');

  if (!q) {
    return true;
  }

  return (
    String(pull.number).includes(q) ||
    pull.title.toLowerCase().includes(q) ||
    pull.author.login.toLowerCase().includes(q) ||
    pull.labels.some((label) => label.toLowerCase().includes(q)) ||
    pull.topics.some((topic) => topic.toLowerCase().includes(q))
  );
}

export function filterPulls(pulls: readonly PullSummary[], filters: QueueFilters): PullSummary[] {
  return pulls.filter((pull) => {
    if (filters.status === 'testable' && !TESTABLE_STATUSES.includes(pull.status)) {
      return false;
    }

    if (filters.status !== 'testable' && filters.status !== 'all' && pull.status !== filters.status) {
      return false;
    }

    if (filters.kind !== 'all' && pull.kind !== filters.kind) {
      return false;
    }

    if (filters.withInstructionsOnly && !hasTestSteps(pull)) {
      return false;
    }

    if (filters.testersWantedOnly && !wantsTesters(pull)) {
      return false;
    }

    if (filters.unreportedOnly && reportCount(pull) > 0) {
      return false;
    }

    if (!matchesDomain(pull, filters.domain)) {
      return false;
    }

    return matchesQuery(pull, filters.query);
  });
}

const STATUS_RANK: Record<PullStatus, number> = {
  waiting: 0,
  open: 1,
  'in-progress': 2,
  'needs-info': 3,
  tested: 4,
  'to-merge': 5,
  conflicts: 6,
  wip: 7,
};

/**
 * Lower is more urgent: labelled first, then PRs asking for testers. Within
 * each, PRs nobody has reported on come before those already tested, and PRs
 * with test steps before those without.
 */
export function priorityRank(pull: PullSummary): number {
  const base = STATUS_RANK[pull.status] * 10;
  const testers = wantsTesters(pull) ? 0 : 5;
  const reported = reportCount(pull) > 0 ? 2 : 0;
  const steps = hasTestSteps(pull) ? 0 : 1;
  return base + testers + reported + steps;
}

const time = (iso: string) => new Date(iso).getTime();

export function sortPulls(pulls: readonly PullSummary[], key: SortKey): PullSummary[] {
  const sorted = [...pulls];

  switch (key) {
    case 'priority':
      return sorted.sort((a, b) => priorityRank(a) - priorityRank(b) || time(a.createdAt) - time(b.createdAt));
    case 'oldest':
      return sorted.sort((a, b) => time(a.createdAt) - time(b.createdAt));
    case 'updated':
      return sorted.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    case 'quiet':
      return sorted.sort((a, b) => a.comments - b.comments || time(a.createdAt) - time(b.createdAt));
  }
}

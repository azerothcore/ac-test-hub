import type { ChangeKind, CodeArea, PullStatus, TestReport, TestReportKind, TestReportResult } from './lib/types';

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;

  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit);
    }
  }

  return 'just now';
}

export const STATUS_TEXT: Record<PullStatus, string> = {
  waiting: 'Waiting to be tested',
  'in-progress': 'Testing in progress',
  open: 'Open',
  'needs-info': 'Waiting for the author',
  tested: 'Tested',
  'to-merge': 'To be merged',
  conflicts: 'Merge conflicts',
  wip: 'Work in progress',
};

export const KIND_TEXT: Record<ChangeKind, string> = {
  'sql-only': 'SQL only',
  build: 'Rebuild',
  other: 'Other',
};

export const KIND_HINT: Record<ChangeKind, string> = {
  'sql-only': 'Only SQL changes: import the files and restart, no rebuild.',
  build: 'C++ or CMake changes: the server must be rebuilt.',
  other: 'No C++ change, and not only SQL: tooling, configuration, tests…',
};

export const REPORT_RESULT_TEXT: Record<TestReportResult, string> = {
  works: 'Works',
  partial: 'Partly works',
  broken: 'Problem found',
  unknown: 'No verdict',
};

export const REPORT_KIND_TEXT: Record<TestReportKind, string> = {
  'in-game': 'Tested in game',
  sniffs: 'Checked against sniffs',
};

/** Short text for the list: "2 reports", plus whether one of them found a problem. */
export function reportsSummary(reports: TestReport[] | null): { text: string; problem: boolean } | null {
  if (!reports || reports.length === 0) {
    return null;
  }

  return {
    text: `${reports.length} report${reports.length > 1 ? 's' : ''}`,
    problem: reports.some((report) => report.result === 'broken'),
  };
}

export const areaText = (area: CodeArea | null) => (area ? `${area.group}${area.topic ? ` / ${area.topic}` : ''}` : null);

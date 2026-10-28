export type TestResult = 'works' | 'partial' | 'broken' | 'cannot-test';
export type ServerSetup = 'docker' | 'traditional';

export interface ReportInput {
  result: TestResult;
  setup: ServerSetup;
  os: string;
  /** Branch, commit or date shown by `server info`, so maintainers know what was tested. */
  revision: string;
  tested: string;
  beforeAfter: string;
  regressions: string;
  notes: string;
}

export const RESULT_LABELS: Record<TestResult, string> = {
  works: '✅ Works as intended',
  partial: '⚠️ Partially works',
  broken: '❌ Does not work',
  'cannot-test': '🚧 Could not test',
};

export const SETUP_LABELS: Record<ServerSetup, string> = {
  docker: 'Docker',
  traditional: 'Traditional (compiled from sources)',
};

export const EMPTY_REPORT: ReportInput = {
  result: 'works',
  setup: 'docker',
  os: '',
  revision: '',
  tested: '',
  beforeAfter: '',
  regressions: '',
  notes: '',
};

const block = (title: string, text: string) => (text.trim() ? `**${title}**\n\n${text.trim()}\n` : null);
const oneLine = (text: string) => text.trim().replace(/\s*\n+\s*/g, ' ');

/**
 * Builds a test report to paste as a comment on the PR. It follows the wiki's
 * guidance: what was tested, whether it works, before/after, as many details as possible.
 */
export function buildReport(input: ReportInput): string {
  const facts = [
    ['Setup', SETUP_LABELS[input.setup]],
    ['OS', oneLine(input.os)],
    ['Server revision', input.revision.trim() ? `\`${oneLine(input.revision).replace(/`/g, '')}\`` : ''],
  ].filter(([, value]) => value);

  const parts = [
    `### Test report\n`,
    `**Result:** ${RESULT_LABELS[input.result]}\n`,
    facts.map(([label, value]) => `- **${label}:** ${value}`).join('\n') + '\n',
    block('What I tested', input.tested),
    block('Before / after', input.beforeAfter),
    block('Regression checks', input.regressions),
    block('Notes', input.notes),
  ];
  return parts.filter((part): part is string => part !== null).join('\n').trimEnd() + '\n';
}

/** A report is worth posting once it says what was tested. */
export function isReportReady(input: ReportInput): boolean {
  return input.tested.trim().length > 0;
}

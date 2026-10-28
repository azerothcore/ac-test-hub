import type { TestReport, TestReportKind, TestReportResult } from './types';

/** The fields we use from a GitHub issue comment (`GET /repos/{repo}/issues/{n}/comments`). */
export interface IssueComment {
  user: { login: string; type?: string } | null;
  body: string | null;
  html_url: string;
  created_at: string;
}

/** Header written by the hub's report generator. */
const HUB_REPORT = /^#{1,4}\s*Test report\b/im;
const HUB_RESULT: Array<[RegExp, TestReportResult]> = [
  [/\*\*Result:\*\*\s*✅/, 'works'],
  [/\*\*Result:\*\*\s*⚠️?/, 'partial'],
  [/\*\*Result:\*\*\s*❌/, 'broken'],
  [/\*\*Result:\*\*\s*🚧/, 'unknown'],
];

/** A sentence saying the PR was checked against sniffs (packet captures of the original game). */
const SNIFF_CHECK = /\b(?:checked|ran|compared|verified|validated|cross-checked)\b[^.?]*\bsniffs?\b/i;

/** A sentence that claims a test was done. Checked one sentence at a time, questions excluded. */
const CLAIMS: readonly RegExp[] = [
  /^(?:i\s+(?:have\s+|just\s+|also\s+)?|i'?ve\s+(?:just\s+|also\s+)?|just\s+|also\s+)?(?:re-?)?tested\b/i,
  /\b(?:tested|checked|verified)\s+(?:it\s+|this\s+|the (?:pr|fix|changes?)\s+)?(?:in[- ]game|on (?:my|a) (?:local\s+)?(?:server|realm|build)|locally)\b/i,
  /\bcan confirm\b/i,
  /\b(?:works|working|worked)\s+(?:as intended|as expected|fine|correctly|perfectly)\b/i,
];

/** Sentences that talk about testing without claiming it. */
const NOT_A_CLAIM = /\b(?:not|un|never|wasn'?t|haven'?t|hasn'?t)[- ]?tested\b|\bneeds? (?:to be |more |further )?test|\b(?:please|could|can|would) (?:you |someone |anyone )?(?:re-?)?test\b|\bwaiting (?:to be|for) test/i;

const BROKEN = /\b(?:doesn'?t|does not|didn'?t|did not|isn'?t|is not)\s+work|\bnot working\b|\bstill (?:happens|bugged|broken|occurs|there)\b|\bbroken\b|\bcrash(?:es|ed)?\b|\bregression\b/i;
const PARTIAL = /\bpartially\b|\bmostly works\b|\bsome issues\b|\bworks,? but\b/i;
const WORKS = /\b(?:works|working|worked|fixed)\b|\bno issues?\b|\bas (?:intended|expected)\b|\bcan confirm\b|\blgtm\b/i;

function cleanText(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .filter((line) => !/^\s*>/.test(line)) // quoted replies
    .join('\n');
}

function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!])\s+/)
    .map((s) => s.replace(/^[\s#*_-]+/, '').trim())
    .filter(Boolean);
}

/** Classifies a free-form report from its wording. */
export function resultOf(text: string): TestReportResult {
  if (BROKEN.test(text)) {
    return 'broken';
  }

  if (PARTIAL.test(text)) {
    return 'partial';
  }

  if (WORKS.test(text)) {
    return 'works';
  }

  return 'unknown';
}

type ReadReport = { kind: TestReportKind; result: TestReportResult };

/** Reads a comment as a test report, or returns null when it isn't one. */
export function readReport(body: string): ReadReport | null {
  const text = cleanText(body);

  if (HUB_REPORT.test(text)) {
    const match = HUB_RESULT.find(([pattern]) => pattern.test(text));

    return { kind: 'in-game', result: match ? match[1] : 'unknown' };
  }

  for (const sentence of sentences(text)) {
    if (sentence.endsWith('?') || NOT_A_CLAIM.test(sentence)) {
      continue;
    }

    // The first claim decides the kind: a tester may mention sniffs in passing later on.
    if (SNIFF_CHECK.test(sentence)) {
      return { kind: 'sniffs', result: 'unknown' };
    }

    if (CLAIMS.some((pattern) => pattern.test(sentence))) {
      return { kind: 'in-game', result: resultOf(text) };
    }
  }

  return null;
}

const isBot = (user: { login: string; type?: string }) => user.type === 'Bot' || user.login.endsWith('[bot]');

/**
 * Test reports among a PR's comments: written by someone other than the
 * author (who already says whether they tested) and not by a bot.
 */
export function findTestReports(comments: readonly IssueComment[], prAuthor: string): TestReport[] {
  const author = prAuthor.toLowerCase();
  const reports: TestReport[] = [];

  for (const comment of comments) {
    if (!comment.user || isBot(comment.user) || comment.user.login.toLowerCase() === author) {
      continue;
    }

    const report = readReport(comment.body ?? '');

    if (report) {
      reports.push({
        author: comment.user.login,
        url: comment.html_url,
        createdAt: comment.created_at,
        kind: report.kind,
        result: report.result,
      });
    }
  }

  return reports;
}

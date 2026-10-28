import type { TestingInfo } from './types';

export interface Section {
  /** Heading text without the leading `##` and trailing colon. Empty for the text before the first heading. */
  heading: string;
  content: string;
}

/** Normalizes line endings and removes HTML comments (the template's hints). */
export function normalizeBody(body: string | null | undefined): string {
  return (body ?? '').replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
}

/** Splits a PR body on its level-2 headings (`## ...`). Level-3 headings stay inside their section. */
export function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: '', content: '' };
  const lines: string[] = [];

  const flush = () => {
    current.content = lines.join('\n').trim();

    if (current.heading || current.content) {
      sections.push(current);
    }

    lines.length = 0;
  };

  for (const line of body.split('\n')) {
    const match = /^##[ \t]+(?!#)(.+?)[ \t]*:?[ \t]*#*[ \t]*$/.exec(line);

    if (match) {
      flush();
      current = { heading: match[1].trim(), content: '' };
    } else {
      lines.push(line);
    }
  }

  flush();
  return sections;
}

/** Headings that hold test steps, most specific first. The template's generic footer is excluded. */
const INSTRUCTION_HEADINGS: readonly RegExp[] = [
  /^how to test the changes/i,
  /^how to test(?!\s+azerothcore)/i,
  /^(steps to test|testing steps|test steps|test plan|testing instructions)/i,
  /in-game (checks|testing)/i,
  /^how to reproduce/i,
];

const ISSUE_HEADINGS: readonly RegExp[] = [/^issues?\b/i, /^related issues?/i, /^fixes\b/i];

const AUTHOR_TESTS_HEADINGS: readonly RegExp[] = [/^tests? performed/i, /^validation/i, /^testing$/i];

/** Template lines that are flags, not content. */
const TEMPLATE_LINE =
  /^\s*[-*]\s*\[[ xX]\]\s*(This pull request (can be tested by following|requires further testing)|Tested in-game by)\b.*$/;
const TEMPLATE_INTRO = /^\s*This PR has been:\s*$/;

function isChecked(body: string, phrase: RegExp): boolean {
  const source = String.raw`^\s*[-*]\s*\[[xX]\]\s*` + phrase.source;
  return new RegExp(source, 'im').test(body);
}

export function findSection(sections: Section[], patterns: readonly RegExp[]): Section | null {
  for (const pattern of patterns) {
    const found = sections.find((s) => pattern.test(s.heading));

    if (found) {
      return found;
    }
  }

  return null;
}

/** Removes the template's flag lines and empty placeholders (`1.`, `- [ ]`) from a section. */
export function cleanInstructions(content: string): string | null {
  const kept = content
    .split('\n')
    .filter((line) => !TEMPLATE_LINE.test(line) && !TEMPLATE_INTRO.test(line))
    .filter((line) => !/^\s*\d+[.)]\s*$/.test(line))
    .filter((line) => !/^\s*[-*]\s*(\[[ xX]\])?\s*$/.test(line));
  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > 0 ? text : null;
}

/** Issue numbers referenced in the "Issues Addressed" section, as `#123` or full issue URLs. */
export function extractIssues(sections: Section[], repository: string): number[] {
  const section = findSection(sections, ISSUE_HEADINGS);

  if (!section) {
    return [];
  }

  const escaped = repository.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const pattern = new RegExp(String.raw`(?:github\.com/${escaped}/(?:issues|pull)/|(?<![\w/])#)(\d+)`, 'gi');
  const numbers = new Set<number>();

  for (const match of section.content.matchAll(pattern)) {
    numbers.add(Number(match[1]));
  }

  return [...numbers];
}

export interface ParsedBody {
  testing: TestingInfo;
  issues: number[];
}

export function parsePullBody(rawBody: string | null | undefined, repository: string): ParsedBody {
  const body = normalizeBody(rawBody);
  const sections = splitSections(body);
  const section = findSection(sections, INSTRUCTION_HEADINGS);
  const instructions = section ? cleanInstructions(section.content) : null;
  const authorSection = findSection(sections, AUTHOR_TESTS_HEADINGS);

  return {
    testing: {
      instructions,
      instructionsHeading: instructions && section ? section.heading : null,
      authorTests: authorSection ? cleanInstructions(authorSection.content) : null,
      reproStepsInIssue: isChecked(body, /This pull request can be tested by following the reproduction steps/),
      needsMoreTesting: isChecked(body, /This pull request requires further testing/),
      testedByAuthor: isChecked(body, /Tested in-game by the author/),
      testedByOthers: isChecked(body, /Tested in-game by other community members/),
    },
    issues: extractIssues(sections, repository),
  };
}

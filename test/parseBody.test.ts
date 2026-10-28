import { describe, expect, it } from 'vitest';
import { cleanInstructions, normalizeBody, parsePullBody, splitSections } from '../src/lib/parseBody';
import { filledTemplate, freeForm, noTestSection, reproInIssue, untouchedTemplate } from './fixtures/bodies';

const REPO = 'azerothcore/azerothcore-wotlk';

describe('normalizeBody', () => {
  it('converts line endings and removes HTML comments', () => {
    expect(normalizeBody('a\r\n<!-- hint\nover lines -->b\r\n')).toBe('a\nb\n');
  });

  it('accepts a missing body', () => {
    expect(normalizeBody(null)).toBe('');
  });
});

describe('splitSections', () => {
  it('splits on level-2 headings and keeps level-3 headings inside', () => {
    const sections = splitSections('intro\n## First:\none\n### Sub\ntwo\n## Second\nthree');
    expect(sections.map((s) => s.heading)).toEqual(['', 'First', 'Second']);
    expect(sections[1].content).toBe('one\n### Sub\ntwo');
  });
});

describe('cleanInstructions', () => {
  it('drops the template flags and the empty placeholders', () => {
    const content = [
      '- [ ] This pull request can be tested by following the reproduction steps provided in the linked issue',
      '- [x] This pull request requires further testing. Provide steps.',
      '',
      '1.',
      '2. Pull the boss.',
      '3.',
      '- [ ]',
    ].join('\n');
    expect(cleanInstructions(content)).toBe('2. Pull the boss.');
  });

  it('returns null when nothing is left', () => {
    expect(cleanInstructions('1.\n2.\n3.\n')).toBeNull();
  });
});

describe('parsePullBody', () => {
  it('reads the steps and flags of a filled-in template', () => {
    const { testing, issues } = parsePullBody(filledTemplate, REPO);
    expect(testing.instructionsHeading).toBe('How to Test the Changes');
    expect(testing.instructions).toBe(
      [
        '1. `.go creature 12345` and pull the boss.',
        '2. Check that the adds spawn at 50% health.',
        '3. Wipe and pull again: the adds must not stay in combat.',
      ].join('\n'),
    );
    expect(testing).toMatchObject({
      reproStepsInIssue: false,
      needsMoreTesting: true,
      testedByAuthor: true,
      testedByOthers: false,
    });
    expect(issues).toEqual([12345, 12346]);
    expect(testing.authorTests).toBeNull(); // only template checkboxes there
  });

  it('finds no steps and no flags in an untouched template', () => {
    const { testing, issues } = parsePullBody(untouchedTemplate, REPO);
    expect(testing).toEqual({
      instructions: null,
      instructionsHeading: null,
      authorTests: null,
      reproStepsInIssue: false,
      needsMoreTesting: false,
      testedByAuthor: false,
      testedByOthers: false,
    });
    expect(issues).toEqual([]);
  });

  it('flags steps that live in the linked issue', () => {
    const { testing, issues } = parsePullBody(reproInIssue, REPO);
    expect(testing.instructions).toBeNull();
    expect(testing.reproStepsInIssue).toBe(true);
    expect(issues).toEqual([13937, 4091]);
  });

  it('reads a free-form "in-game checks" section and ignores cross-repo references', () => {
    const { testing, issues } = parsePullBody(freeForm, REPO);
    expect(testing.instructionsHeading).toBe('In-game checks still required');
    expect(testing.instructions).toContain('1. Open each trapped crate');
    expect(issues).toEqual([2222]);
  });

  it('never takes the template footer for test steps, but keeps what the author tested', () => {
    const { testing } = parsePullBody(noTestSection, REPO);
    expect(testing.instructions).toBeNull();
    expect(testing.instructionsHeading).toBeNull();
    expect(testing.authorTests).toBe('Verified in game before and after the change.');
  });
});

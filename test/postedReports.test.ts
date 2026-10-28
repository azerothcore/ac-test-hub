import { describe, expect, it } from 'vitest';
import { findTestReports, readReport } from '../src/lib/postedReports';
import { buildReport, EMPTY_REPORT } from '../src/lib/draftReport';

const comment = (login: string, body: string, type = 'User') => ({
  user: { login, type },
  body,
  html_url: `https://github.com/azerothcore/azerothcore-wotlk/pull/1#issuecomment-${login}`,
  created_at: '2026-10-10T00:00:00Z',
});

describe('readReport', () => {
  it('reads reports written with the hub, with their result', () => {
    const body = buildReport({ ...EMPTY_REPORT, result: 'broken', tested: 'Pulled the boss.' });
    expect(readReport(body)).toEqual({ kind: 'in-game', result: 'broken' });
    expect(readReport(buildReport({ ...EMPTY_REPORT, result: 'works', tested: 'x' }))?.result).toBe('works');
    expect(readReport(buildReport({ ...EMPTY_REPORT, result: 'partial', tested: 'x' }))?.result).toBe('partial');
  });

  it('reads free-form in-game reports', () => {
    expect(readReport('Tested and works as per the .conf description, 0 despawns instantly.')).toEqual({
      kind: 'in-game',
      result: 'works',
    });
    // A protocol without a verdict still counts as a report.
    expect(readReport('Tested in game on a local server: master abc123 without and with this PR, Ulduar 10-man.')).toMatchObject({
      kind: 'in-game',
      result: 'unknown',
    });
    expect(readReport("I've tested this on my server. The adds still don't despawn, it doesn't work.")?.result).toBe('broken');
    expect(readReport('Can confirm, the quest completes now.')?.result).toBe('works');
  });

  it('reads checks against sniffs as their own kind', () => {
    expect(readReport('Checked this against retail Classic Wrath sniffs: builds 3.4.1 and 3.4.3.')).toMatchObject({ kind: 'sniffs' });
    expect(readReport('I ran a retail sniff of this encounter against the claims in this PR.')).toMatchObject({ kind: 'sniffs' });
  });

  it('ignores comments that only talk about testing', () => {
    expect(readReport('Bench is this ready to be tested?')).toBeNull();
    expect(readReport('Has anyone tested this in game?')).toBeNull();
    expect(readReport('Not tested yet, I will try this weekend.')).toBeNull();
    expect(readReport('This needs to be tested on a 25-man raid.')).toBeNull();
    expect(readReport('Please test with a pet as well.')).toBeNull();
    expect(readReport("I'm unable to test the changes currently, but the timers look off.")).toBeNull();
    expect(readReport('> Tested in game, works.\n\nThanks, I will merge it then.')).toBeNull();
    expect(readReport('The core change looks good, the loops match what DestroyGate does.')).toBeNull();
  });
});

describe('findTestReports', () => {
  it('skips the PR author and bots, and keeps a link to each report', () => {
    const reports = findTestReports(
      [
        comment('author', 'Tested in game, works.'),
        comment('coderabbitai[bot]', 'Tested: all checks pass.', 'Bot'),
        comment('helper', 'Tested in game, works as intended.'),
        comment('reviewer', 'Looks good to me.'),
      ],
      'Author',
    );
    expect(reports).toEqual([
      {
        author: 'helper',
        url: 'https://github.com/azerothcore/azerothcore-wotlk/pull/1#issuecomment-helper',
        createdAt: '2026-10-10T00:00:00Z',
        kind: 'in-game',
        result: 'works',
      },
    ]);
  });
});

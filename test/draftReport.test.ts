import { describe, expect, it } from 'vitest';
import { buildReport, EMPTY_REPORT, isReportReady } from '../src/lib/draftReport';
import { testSteps } from '../src/lib/commands';

describe('buildReport', () => {
  it('writes a complete report', () => {
    const report = buildReport({
      result: 'works',
      setup: 'docker',
      os: 'Windows 11',
      revision: 'pr-28148 (2026-10-15)',
      tested: '- Pulled the four overseers listed in the PR.',
      beforeAfter: 'Before: slaves ignored the fight. After: the closest slave attacks.',
      regressions: '- Slaves alone still behave as before.',
      notes: '',
    });
    expect(report).toBe(
      [
        '### Test report',
        '',
        '**Result:** ✅ Works as intended',
        '',
        '- **Setup:** Docker',
        '- **OS:** Windows 11',
        '- **Server revision:** `pr-28148 (2026-10-15)`',
        '',
        '**What I tested**',
        '',
        '- Pulled the four overseers listed in the PR.',
        '',
        '**Before / after**',
        '',
        'Before: slaves ignored the fight. After: the closest slave attacks.',
        '',
        '**Regression checks**',
        '',
        '- Slaves alone still behave as before.',
        '',
      ].join('\n'),
    );
  });

  it('leaves out empty parts and keeps each fact on one line', () => {
    const report = buildReport({ ...EMPTY_REPORT, result: 'broken', os: 'Ubuntu 24.04\n on WSL', tested: 'x' });
    expect(report).toContain('**Result:** ❌ Does not work');
    expect(report).toContain('- **OS:** Ubuntu 24.04 on WSL');
    expect(report).not.toContain('Server revision');
    expect(report).not.toContain('**Notes**');
  });

  it('is ready once it says what was tested', () => {
    expect(isReportReady(EMPTY_REPORT)).toBe(false);
    expect(isReportReady({ ...EMPTY_REPORT, tested: 'Blood Tap rotation' })).toBe(true);
  });
});

describe('testSteps', () => {
  const sqlPull = {
    number: 28148,
    kind: 'sql-only' as const,
    sqlFiles: [{ path: 'data/sql/updates/pending_db_world/rev_1.sql', database: 'world' as const, rawUrl: '' }],
  };

  it('uses the simplified DB procedure for SQL-only PRs', () => {
    const steps = testSteps(sqlPull, { setup: 'docker', fork: false });
    expect(steps[0].title).toBe('Import the SQL');
    expect(steps[0].note).toContain('`acore_world`');
    expect(steps[1].commands).toEqual(['docker compose restart ac-worldserver']);
  });

  it('fills the PR number in the git commands and follows the fork remote', () => {
    const steps = testSteps({ number: 27895, kind: 'build', sqlFiles: [] }, { setup: 'traditional', fork: true });
    expect(steps[0].commands).toEqual(['git checkout master', 'git pull', 'git checkout -b pr-27895', 'git pull upstream pull/27895/head']);
    expect(steps.at(-1)?.commands).toContain('git clean -fd');
  });
});

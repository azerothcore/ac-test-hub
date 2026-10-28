import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CASES = 'lint/cases/no-await-in-return.ts';
const CONFIG = 'lint/cases/cases.oxlintrc.json';

interface Diagnostic {
  code: string;
  labels: Array<{ span: { line: number } }>;
}

describe('lint/no-await-in-return.js', () => {
  it('reports exactly the lines marked "flagged"', () => {
    const run = spawnSync('node_modules/.bin/oxlint', ['-c', CONFIG, '-f', 'json', CASES], { encoding: 'utf8' });
    const output = JSON.parse(run.stdout) as { diagnostics: Diagnostic[] };

    const reported = output.diagnostics
      .filter((diagnostic) => diagnostic.code === 'local(no-await-in-return)')
      .map((diagnostic) => diagnostic.labels[0].span.line);

    const expected = readFileSync(CASES, 'utf8')
      .split('\n')
      .flatMap((line, index) => (line.includes('// flagged') ? [index + 1] : []));

    expect(expected.length).toBeGreaterThan(0);
    expect(reported).toEqual(expected);
  });
});

import { describe, expect, it } from 'vitest';
import { classifyFiles, classifyLabels, databaseOf, statusFromLabels } from '../src/lib/classify';

const file = (filename: string) => ({ filename, raw_url: `https://github.com/raw/${filename}` });

describe('classifyFiles', () => {
  it('treats SQL-only changes as testable without a rebuild', () => {
    const result = classifyFiles([file('data/sql/updates/pending_db_world/rev_1.sql')]);
    expect(result.kind).toBe('sql-only');
    expect(result.sqlFiles).toEqual([
      {
        path: 'data/sql/updates/pending_db_world/rev_1.sql',
        database: 'world',
        rawUrl: 'https://github.com/raw/data/sql/updates/pending_db_world/rev_1.sql',
      },
    ]);
  });

  it('keeps SQL-only when documentation changes too', () => {
    expect(classifyFiles([file('data/sql/updates/pending_db_world/rev_1.sql'), file('doc/notes.md')]).kind).toBe('sql-only');
  });

  it('requires a build as soon as C++ or CMake changes', () => {
    expect(classifyFiles([file('data/sql/updates/pending_db_world/rev_1.sql'), file('src/server/game/Spells/Spell.cpp')]).kind).toBe('build');
    expect(classifyFiles([file('src/server/scripts/Northrend/boss.h')]).kind).toBe('build');
    expect(classifyFiles([file('src/server/CMakeLists.txt')]).kind).toBe('build');
  });

  it('classifies tooling-only changes as other', () => {
    expect(classifyFiles([file('.github/workflows/build.yml')]).kind).toBe('other');
    expect(classifyFiles([file('apps/installer/main.sh'), file('data/sql/updates/pending_db_world/rev_1.sql')]).kind).toBe('other');
    expect(classifyFiles([]).kind).toBe('other');
  });
});

describe('databaseOf', () => {
  it('reads the target database from the folder name', () => {
    expect(databaseOf('data/sql/updates/pending_db_characters/rev_2.sql')).toBe('characters');
    expect(databaseOf('data/sql/updates/db_auth/2026_01_01_00.sql')).toBe('auth');
    expect(databaseOf('data/sql/custom/fix.sql')).toBeNull();
  });
});

describe('classifyLabels', () => {
  it('falls back on the labeler labels', () => {
    expect(classifyLabels(['DB'])).toBe('sql-only');
    expect(classifyLabels(['DB', 'file-cpp'])).toBe('build');
    expect(classifyLabels(['Script'])).toBe('build');
    expect(classifyLabels(['Documentation'])).toBe('other');
  });
});

describe('statusFromLabels', () => {
  it('reads the testing labels case-insensitively', () => {
    expect(statusFromLabels(['DB', 'Waiting to be Tested'], false)).toBe('waiting');
    expect(statusFromLabels(['waiting to be tested'], false)).toBe('waiting');
    expect(statusFromLabels(['Testing in Progress'], false)).toBe('in-progress');
    expect(statusFromLabels(['Ready to be Reviewed'], false)).toBe('open');
  });

  it('applies the rules in priority order', () => {
    expect(statusFromLabels(['Waiting to be Tested', 'Tested'], false)).toBe('tested');
    expect(statusFromLabels(['Waiting to be Tested', 'Merge Conflicts'], false)).toBe('conflicts');
  });

  it('treats drafts as work in progress', () => {
    expect(statusFromLabels(['Waiting to be Tested'], true)).toBe('wip');
  });
});

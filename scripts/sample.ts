/**
 * Writes public/data.sample.json, made-up data for working on the front
 * without a GitHub token: `npm run sample`, then `npm run dev`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { REPOSITORY } from '../src/lib/config';
import { classifyFiles } from '../src/lib/classify';
import { toPullSummary, type SearchItem } from '../src/lib/transform';
import { SNAPSHOT_VERSION, type Snapshot, type TestReport } from '../src/lib/types';
import { filledTemplate, freeForm, noTestSection, reproInIssue, untouchedTemplate } from '../test/fixtures/bodies';

const now = new Date('2026-10-15T20:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const sql = (n: number, db = 'world') => ({
  filename: `data/sql/updates/pending_db_${db}/rev_${n}.sql`,
  raw_url: `https://github.com/${REPOSITORY}/raw/sample/data/sql/updates/pending_db_${db}/rev_${n}.sql`,
});
const file = (path: string) => ({ filename: path, raw_url: `https://github.com/${REPOSITORY}/raw/sample/${path}` });
const report = (number: number, author: string, days: number, result: TestReport['result'], kind: TestReport['kind'] = 'in-game'): TestReport => ({
  author,
  url: `https://github.com/${REPOSITORY}/pull/${number}#issuecomment-${number}${Math.round(days * 10)}`,
  createdAt: daysAgo(days),
  kind,
  result,
});

/** Made-up reports and linked-issue labels, keyed by PR number. */
const extras: Record<number, { reports?: TestReport[]; topics?: string[] }> = {
  90001: { topics: ['61-64', 'Quest'] },
  90002: { topics: ['Class - Death Knight', '80'], reports: [report(90002, 'stormrider', 2, 'works')] },
  90004: { topics: ['Instance - Dungeon - Vanilla', '50-59'], reports: [report(90004, 'quelfrost', 5, 'broken'), report(90004, 'snifftracker', 4, 'unknown', 'sniffs')] },
  90007: { topics: ['Loot', 'ChromieCraft Generic'] },
  90008: { reports: [report(90008, 'stormrider', 8, 'works'), report(90008, 'oakenshield', 7, 'works')] },
  90012: { topics: ['71-74', 'Quest'] },
};

const samples: Array<[Partial<SearchItem> & { number: number; title: string }, ReturnType<typeof sql>[] | null]> = [
  [{ number: 90001, title: 'fix(DB/SAI): Make the overseers call a nearby slave on aggro', labels: [{ name: 'DB' }, { name: 'Waiting to be Tested' }], body: filledTemplate, created_at: daysAgo(3), comments: 2 }, [sql(1)]],
  [{ number: 90002, title: 'fix(Scripts/Spells): Move rune refresh handling to a spell script', labels: [{ name: 'CORE' }, { name: 'Script' }, { name: 'file-cpp' }, { name: 'Waiting to be Tested' }], body: filledTemplate, created_at: daysAgo(14), comments: 4 }, [file('src/server/scripts/Spells/spell_dk.cpp'), sql(2)]],
  [{ number: 90003, title: 'fix(DB/Spell): Chain buff ranks so every rank is consumed', labels: [{ name: 'DB' }], body: reproInIssue, created_at: daysAgo(1), comments: 1 }, [sql(3)]],
  [{ number: 90004, title: 'fix(Core/Instance): Correct trapped supply crates', labels: [{ name: 'DB' }, { name: 'CORE' }, { name: 'file-cpp' }], body: freeForm, created_at: daysAgo(52), comments: 8 }, [file('src/server/game/Entities/GameObject/GameObject.cpp'), sql(4)]],
  [{ number: 90005, title: 'fix(DB/SAI): Hydra closes to melee when silenced', labels: [{ name: 'DB' }], body: noTestSection, created_at: daysAgo(0.5), comments: 0 }, [sql(5)]],
  [{ number: 90006, title: 'feat(Core/Commands): Add a command to list pending respawns', labels: [{ name: 'CORE' }, { name: 'file-cpp' }], body: untouchedTemplate, created_at: daysAgo(30), comments: 3 }, [file('src/server/scripts/Commands/cs_misc.cpp')]],
  [{ number: 90007, title: 'fix(DB/Loot): Remove a duplicated drop from the quartermaster', labels: [{ name: 'DB' }, { name: 'Testing in Progress' }], body: filledTemplate, created_at: daysAgo(6), comments: 5 }, [sql(7)]],
  [{ number: 90008, title: 'fix(Core/Movement): Stop pets from stuttering on stairs', labels: [{ name: 'CORE' }, { name: 'file-cpp' }, { name: 'Tested' }], body: filledTemplate, created_at: daysAgo(20), comments: 9 }, [file('src/server/game/Movement/MotionMaster.cpp')]],
  [{ number: 90009, title: 'chore(CI): Cache the tools build', labels: [{ name: 'Workflow' }], body: untouchedTemplate, created_at: daysAgo(2), comments: 0 }, [file('.github/workflows/tools_build.yml')]],
  [{ number: 90010, title: 'fix(DB/Creature): Fix the patroller path along the canal', labels: [{ name: 'DB' }, { name: 'Merge Conflicts' }], body: filledTemplate, created_at: daysAgo(40), comments: 6 }, [sql(10)]],
  [{ number: 90011, title: 'refactor(Scripts/Instance): Modernize the tournament scripts', labels: [{ name: 'Script' }, { name: 'file-cpp' }], body: filledTemplate, created_at: daysAgo(9), comments: 1, draft: true }, null],
  [{ number: 90012, title: 'fix(DB/Quest): Correct the reward text of a Northrend quest chain', labels: [{ name: 'DB' }, { name: 'Waiting For More Info from Author' }], body: reproInIssue, created_at: daysAgo(11), comments: 4 }, [sql(12, 'world'), sql(13, 'characters')]],
];

const snapshot: Snapshot = {
  version: SNAPSHOT_VERSION,
  generatedAt: now.toISOString(),
  repository: REPOSITORY,
  pulls: samples.map(([item, files], index) =>
    toPullSummary(
      {
        html_url: `https://github.com/${REPOSITORY}/pull/${item.number}`,
        user: { login: ['frostwhisper', 'runeweaver', 'tidecaller', 'emberforge'][index % 4] },
        labels: [],
        draft: false,
        created_at: daysAgo(1),
        updated_at: daysAgo(0.2 + index / 3),
        comments: 0,
        body: '',
        ...item,
      },
      {
        files: files ? classifyFiles(files) : null,
        reports: item.draft ? null : (extras[item.number]?.reports ?? []),
        topics: (extras[item.number]?.topics ?? []).filter((t) => t !== 'ChromieCraft Generic'),
      },
      REPOSITORY,
    ),
  ),
};

await mkdir('public', { recursive: true });
await writeFile('public/data.sample.json', JSON.stringify(snapshot, null, 2));
console.log(`Wrote public/data.sample.json (${snapshot.pulls.length} made-up PRs)`);

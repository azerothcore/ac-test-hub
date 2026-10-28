import { DATABASES } from './config';
import type { ServerSetup } from './draftReport';
import type { PullSummary } from './types';

export interface CommandStep {
  title: string;
  /** Shell commands to copy, one per line. */
  commands?: string[];
  /** Plain-language guidance shown under the title. */
  note?: string;
}

export interface CommandOptions {
  setup: ServerSetup;
  /** True when the local clone is a fork: the wiki then uses the `upstream` remote. */
  fork: boolean;
}

/** What the tester told the page about their server, kept in this browser. */
export interface ServerPrefs extends CommandOptions {
  os: string;
}

/**
 * The steps from the wiki's "How to test a PR" (or "How to test DB only
 * changes" for SQL-only PRs), with the PR number filled in.
 */
export function testSteps(pull: Pick<PullSummary, 'number' | 'kind' | 'sqlFiles'>, options: CommandOptions): CommandStep[] {
  const remote = options.fork ? 'upstream' : 'origin';
  const n = pull.number;

  if (pull.kind === 'sql-only') {
    const targets = [...new Set(pull.sqlFiles.map((f) => (f.database ? DATABASES[f.database] : null)))]
      .filter((name) => name !== null);
    return [
      {
        title: 'Import the SQL',
        note:
          `No rebuild needed: run the SQL file${pull.sqlFiles.length > 1 ? 's' : ''} below in ` +
          `${targets.length ? targets.map((t) => `\`${t}\``).join(', ') : 'the matching database'} with your database client.`,
      },
      {
        title: 'Reload the data',
        commands:
          options.setup === 'docker' ? ['docker compose restart ac-worldserver'] : [],
        note:
          options.setup === 'docker'
            ? 'Or use `.reload <table>` in game when the table supports it.'
            : 'Restart `worldserver`, or use `.reload <table>` in game when the table supports it.',
      },
      {
        title: 'Clean up afterwards',
        note:
          options.setup === 'docker'
            ? `Drop \`${DATABASES.world}\`, then run \`docker compose up\` and accept to re-create it.`
            : `Delete \`${DATABASES.world}\` and re-create it with the DB assembler.`,
      },
    ];
  }

  const build: CommandStep =
    options.setup === 'docker'
      ? {
          title: 'Rebuild and restart',
          commands: ['./acore.sh docker build', 'docker compose down', 'docker compose up'],
          note: 'On Linux you can also run `./bin/acore-docker-build`. The Docker setup updates the database for you.',
        }
      : {
          title: 'Rebuild and update the database',
          note: 'Recompile as in the core installation guide, then import the PR\'s files from `data/sql/updates/pending_db_*`.',
        };

  return [
    {
      title: 'Get the PR code',
      commands: ['git checkout master', 'git pull', `git checkout -b pr-${n}`, `git pull ${remote} pull/${n}/head`],
      note: 'Save the merge message when the editor opens. If git reports a merge conflict, say so on the PR instead of testing.',
    },
    build,
    {
      title: 'Check the version',
      commands: ['server info'],
      note: 'Run it in the worldserver console: the branch should be `pr-' + n + '`.',
    },
    {
      title: 'Clean up afterwards',
      commands: ['git reset --hard', 'git checkout master', 'git clean -fd', 'git status'],
    },
  ];
}

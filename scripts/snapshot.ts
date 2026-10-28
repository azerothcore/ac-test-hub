/**
 * Writes public/data.json: the open pull requests of AzerothCore, ready for the front.
 *
 *   GITHUB_TOKEN=... npm run snapshot
 *
 * Environment:
 * - GITHUB_TOKEN: without one GitHub allows 60 requests an hour, not enough
 *   for a full snapshot. In GitHub Actions the workflow token is used.
 * - PREVIOUS_SNAPSHOT_URL: the published data.json. PRs that did not change
 *   since then are not fetched again.
 * - FULL_REFRESH=true: ignore the previous snapshot and fetch everything.
 * - AC_REPOSITORY, SNAPSHOT_OUT: repository to read and file to write.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { REPOSITORY } from '../src/lib/config';
import { errorMessage } from '../src/lib/errors';
import { createClient } from '../src/lib/github';
import { buildSnapshot } from '../src/lib/snapshot';
import type { Snapshot } from '../src/lib/types';

const repository = process.env.AC_REPOSITORY ?? REPOSITORY;
const output = process.env.SNAPSHOT_OUT ?? 'public/data.json';

async function loadPrevious(): Promise<Snapshot | null> {
  const url = process.env.PREVIOUS_SNAPSHOT_URL;

  if (process.env.FULL_REFRESH === 'true') {
    console.log('Full refresh: the previous snapshot is ignored.');
    return null;
  }

  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });

    if (!response.ok) {
      throw new Error(`answered ${response.status}`);
    }

    const previous = (await response.json()) as Snapshot;
    console.log(`Previous snapshot from ${previous.generatedAt} (version ${previous.version}).`);
    return previous;
  } catch (error) {
    console.log(`No previous snapshot (${errorMessage(error)}): fetching everything.`);
    return null;
  }
}

const client = createClient(process.env.GITHUB_TOKEN);
const { snapshot, stats } = await buildSnapshot(client, {
  repository,
  previous: await loadPrevious(),
  log: (message) => console.log(message),
});

await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(snapshot));

const byKind = Object.groupBy(snapshot.pulls, (p) => p.kind);
const fallback = snapshot.pulls.filter((p) => p.kindSource === 'labels').length;
const withReports = snapshot.pulls.filter((p) => p.reports && p.reports.length > 0).length;
console.log(
  `Wrote ${output}: ${snapshot.pulls.length} PRs ` +
    `(${byKind['sql-only']?.length ?? 0} SQL only, ${byKind.build?.length ?? 0} need a build, ` +
    `${byKind.other?.length ?? 0} other; ${fallback} classified from labels; ${withReports} with test reports)`,
);
console.log(
  `Details: ${stats.reused} reused, ${stats.fetched} fetched, ${stats.partial} partial. ` +
    `API requests left: ${client.remaining() ?? 'unknown'}.`,
);

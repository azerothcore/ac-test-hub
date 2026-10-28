import { BUILD_LABELS, DB_LABEL, STATUS_RULES } from './config';
import type { ChangeKind, DatabaseName, PullStatus, SqlFile } from './types';

export interface ChangedFile {
  filename: string;
  raw_url: string;
}

/** A label as the API gives it: an object, or its bare name. */
export type ApiLabel = { name: string } | string;

export const labelName = (label: ApiLabel) => (typeof label === 'string' ? label : label.name);

const BUILD_FILE = [
  /^(src|deps|modules)\/.+\.(c|cc|cpp|cxx|h|hh|hpp)$/i,
  /(^|\/)CMakeLists\.txt$/i,
  /\.cmake$/i,
];
const SQL_FILE = /^data\/sql\/.+\.sql$/i;
const DOC_FILE = /\.(md|txt)$/i;

const lower = (values: readonly string[]) => new Set(values.map((v) => v.toLowerCase()));

export function statusFromLabels(labels: readonly string[], draft: boolean): PullStatus {
  if (draft) {
    return 'wip';
  }

  const present = lower(labels);

  for (const rule of STATUS_RULES) {
    if (rule.labels.some((label) => present.has(label.toLowerCase()))) {
      return rule.status;
    }
  }

  return 'open';
}

export function databaseOf(path: string): DatabaseName | null {
  const match = /(?:^|\/)(?:pending_)?db_(world|characters|auth)\//i.exec(path);
  return match ? (match[1].toLowerCase() as DatabaseName) : null;
}

/**
 * Classifies a PR from its changed files, following the wiki's rule:
 * a PR whose changes are only `.sql` files can be tested without rebuilding.
 * Documentation files don't change that.
 */
export function classifyFiles(files: readonly ChangedFile[]): { kind: ChangeKind; sqlFiles: SqlFile[] } {
  const sqlFiles: SqlFile[] = files
    .filter((f) => SQL_FILE.test(f.filename))
    .map((f) => ({ path: f.filename, database: databaseOf(f.filename), rawUrl: f.raw_url }));

  if (files.some((f) => BUILD_FILE.some((pattern) => pattern.test(f.filename)))) {
    return { kind: 'build', sqlFiles };
  }

  const onlySqlAndDocs = files.every((f) => SQL_FILE.test(f.filename) || DOC_FILE.test(f.filename));

  if (sqlFiles.length > 0 && onlySqlAndDocs) {
    return { kind: 'sql-only', sqlFiles };
  }

  return { kind: 'other', sqlFiles };
}

/**
 * Fallback when the changed files could not be read. Less reliable: the
 * AzerothCore labeler only ever adds labels, so a label can outlive the file
 * that triggered it.
 */
export function classifyLabels(labels: readonly string[]): ChangeKind {
  const present = lower(labels);

  if (BUILD_LABELS.some((label) => present.has(label.toLowerCase()))) {
    return 'build';
  }

  if (present.has(DB_LABEL.toLowerCase())) {
    return 'sql-only';
  }

  return 'other';
}

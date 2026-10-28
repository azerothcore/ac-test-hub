import { classifyLabels, labelName, statusFromLabels, type ApiLabel } from './classify';
import { parseArea } from './domain';
import { parsePullBody } from './parseBody';
import type { ChangeKind, PullSummary, SqlFile, TestReport } from './types';

/** The fields we use from a GitHub search result item (`GET /search/issues`). */
export interface SearchItem {
  number: number;
  title: string;
  html_url: string;
  user: { login: string } | null;
  labels: ApiLabel[];
  draft?: boolean;
  created_at: string;
  updated_at: string;
  comments: number;
  body: string | null;
}

/** What the snapshot learns from the changed files (`classifyFiles`). */
export interface FileInfo {
  kind: ChangeKind;
  sqlFiles: SqlFile[];
}

/** Everything the snapshot fetched about a PR beyond the search result. Each part can be missing. */
export interface PullDetails {
  /** Null when the files could not be read: the kind is then guessed from the labels. */
  files: FileInfo | null;
  /** Null when the comments could not be read. */
  reports: TestReport[] | null;
  topics: string[];
}

export const NO_DETAILS: PullDetails = { files: null, reports: null, topics: [] };

/** Builds the summary the front displays. */
export function toPullSummary(item: SearchItem, details: PullDetails, repository: string): PullSummary {
  const labels = item.labels.map(labelName);
  const parsed = parsePullBody(item.body, repository);
  const { files } = details;

  return {
    number: item.number,
    title: item.title,
    url: item.html_url,
    author: { login: item.user?.login ?? 'ghost' },
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    labels,
    status: statusFromLabels(labels, item.draft ?? false),
    kind: files ? files.kind : classifyLabels(labels),
    kindSource: files ? 'files' : 'labels',
    sqlFiles: files ? files.sqlFiles : [],
    comments: item.comments,
    issues: parsed.issues,
    testing: parsed.testing,
    area: parseArea(item.title),
    topics: details.topics,
    reports: details.reports,
  };
}

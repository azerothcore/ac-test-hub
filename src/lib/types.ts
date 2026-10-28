/**
 * Where a pull request stands in the AzerothCore review and testing flow,
 * derived from its labels (see `statusFromLabels`).
 */
export type PullStatus =
  | 'waiting' // "Waiting to be Tested": reviewed, testers wanted
  | 'in-progress' // "Testing in Progress": someone is on it
  | 'open' // no testing label yet
  | 'needs-info' // "Waiting For More Info from Author"
  | 'tested' // "Tested"
  | 'to-merge' // "To Be Merged" / "To Be Merged - Later"
  | 'conflicts' // "Merge Conflicts": cannot be tested as is
  | 'wip'; // draft, "WIP" or "SENSITIVE WIP"

/**
 * What a tester has to do to run the change locally.
 * - `sql-only`: import SQL files and restart, no rebuild (the wiki's simplified procedure)
 * - `build`: C++ or CMake changes, the server must be rebuilt
 * - `other`: anything else (tooling, CI, Docker, config...)
 */
export type ChangeKind = 'sql-only' | 'build' | 'other';

export type DatabaseName = 'world' | 'characters' | 'auth';

export interface SqlFile {
  path: string;
  /** Target database, inferred from the `db_<name>` folder. */
  database: DatabaseName | null;
  /** Link to the raw file at the PR's commit. */
  rawUrl: string;
}

export interface TestingInfo {
  /** Markdown of the PR's test steps, template boilerplate removed. Null when the author gave none. */
  instructions: string | null;
  /** Heading the steps were found under, for transparency in the UI. */
  instructionsHeading: string | null;
  /** What the author says they tested ("Tests Performed"), template checkboxes removed. */
  authorTests: string | null;
  /** "This pull request can be tested by following the reproduction steps provided in the linked issue" is checked. */
  reproStepsInIssue: boolean;
  /** One of the "requires further testing" boxes is checked. */
  needsMoreTesting: boolean;
  /** "Tested in-game by the author" is checked. */
  testedByAuthor: boolean;
  /** "Tested in-game by other community members" is checked. */
  testedByOthers: boolean;
}

export type TestReportResult = 'works' | 'partial' | 'broken' | 'unknown';

/** `in-game`: someone ran the PR. `sniffs`: someone checked it against packet captures of the original game. */
export type TestReportKind = 'in-game' | 'sniffs';

/** A comment on the PR, by someone other than its author, that reads as a test report. */
export interface TestReport {
  author: string;
  /** Link to the comment itself (anchored). */
  url: string;
  createdAt: string;
  kind: TestReportKind;
  /** From the wording; `unknown` when the comment gives no verdict. */
  result: TestReportResult;
}

/** The scope of a conventional PR title: `fix(Scripts/Ulduar): ...` gives Scripts / Ulduar. */
export interface CodeArea {
  group: string;
  topic: string | null;
}

export interface PullSummary {
  number: number;
  title: string;
  url: string;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
  labels: string[];
  status: PullStatus;
  kind: ChangeKind;
  /** `files` when the changed files were read, `labels` when we fell back on the labeler's labels. */
  kindSource: 'files' | 'labels';
  sqlFiles: SqlFile[];
  comments: number;
  issues: number[];
  testing: TestingInfo;
  area: CodeArea | null;
  /** Domain labels (class, instance, level range, topic) of the linked issues. */
  topics: string[];
  /** Test reports found in the comments. Null when the comments could not be read. */
  reports: TestReport[] | null;
}

/** Bumped when the shape changes, so an older data.json is never reused as a cache. */
export const SNAPSHOT_VERSION = 3;

export interface Snapshot {
  version: number;
  generatedAt: string;
  repository: string;
  pulls: PullSummary[];
}

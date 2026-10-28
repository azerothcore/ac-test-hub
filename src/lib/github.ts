import { labelName, type ApiLabel, type ChangedFile } from './classify';
import type { IssueComment } from './postedReports';
import type { SearchItem } from './transform';

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface GitHubClient {
  get<T>(path: string): Promise<T>;
  /** Requests left in the REST budget, from the last non-search response. Null before the first one. */
  remaining(): number | null;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

const API = 'https://api.github.com';

/** How much of an error response is kept in the message. */
const ERROR_DETAIL_LENGTH = 200;

export function createClient(token: string | undefined, fetchImpl: FetchLike = fetch): GitHubClient {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ac-test-hub',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let remaining: number | null = null;

  return {
    remaining: () => remaining,
    async get<T>(path: string): Promise<T> {
      const response = await fetchImpl(`${API}${path}`, { headers });
      // The search API has its own, separate budget.
      const left = response.headers.get('x-ratelimit-remaining');

      if (left !== null && !path.startsWith('/search/')) {
        remaining = Number(left);
      }

      if (!response.ok) {
        const hint = left === '0' ? ' (rate limit reached: set GITHUB_TOKEN)' : '';
        const text = await response.text();
        const detail = text.slice(0, ERROR_DETAIL_LENGTH);
        throw new GitHubError(`GET ${path} failed with ${response.status}${hint}: ${detail}`, response.status);
      }

      const body = (await response.json()) as T;

      return body;
    },
  };
}

const PER_PAGE = 100;

/** All open pull requests of the repository, oldest first. The search API stops at 1,000 results. */
export async function searchOpenPulls(client: GitHubClient, repository: string): Promise<SearchItem[]> {
  const q = encodeURIComponent(`repo:${repository} is:pr is:open`);
  const items: SearchItem[] = [];

  for (let page = 1; page <= 10; page++) {
    const result = await client.get<{ total_count: number; items: SearchItem[] }>(
      `/search/issues?q=${q}&sort=created&order=asc&per_page=${PER_PAGE}&page=${page}`,
    );
    items.push(...result.items);

    if (result.items.length < PER_PAGE || items.length >= result.total_count) {
      break;
    }
  }

  return items;
}

/** Every page of a list endpoint, at most `maxPages` of them. */
async function listAll<T>(client: GitHubClient, path: string, maxPages: number): Promise<T[]> {
  const items: T[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const batch = await client.get<T[]>(`${path}?per_page=${PER_PAGE}&page=${page}`);
    items.push(...batch);

    if (batch.length < PER_PAGE) {
      break;
    }
  }

  return items;
}

/** Changed files of a pull request (GitHub lists up to 3,000). */
export async function listPullFiles(client: GitHubClient, repository: string, number: number): Promise<ChangedFile[]> {
  const files = await listAll<ChangedFile>(client, `/repos/${repository}/pulls/${number}/files`, 30);

  return files.map(({ filename, raw_url }) => ({ filename, raw_url }));
}

/** Issue comments of a pull request, where test reports are posted. */
export async function listComments(client: GitHubClient, repository: string, number: number): Promise<IssueComment[]> {
  const comments = await listAll<IssueComment>(client, `/repos/${repository}/issues/${number}/comments`, 10);

  return comments.map(({ user, body, html_url, created_at }) => ({ user, body, html_url, created_at }));
}

/** Label names of an issue (or a PR: the issues endpoint serves both). */
export async function getIssueLabels(client: GitHubClient, repository: string, number: number): Promise<string[]> {
  const issue = await client.get<{ labels: ApiLabel[] }>(`/repos/${repository}/issues/${number}`);

  return issue.labels.map(labelName);
}

/** Runs `task` over `items` with at most `limit` calls in flight, keeping the input order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return results;
}

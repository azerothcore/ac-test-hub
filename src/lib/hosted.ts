import { APIError, parseCharacters, request } from './tc9';
import type { Build, BuildInput } from './tc9';

export interface HostedTask {
  repository: string;
  prNumber: number;
  id?: string;
  build?: Build;
  intent?: { key: string; input: BuildInput };
  submitting?: boolean;
  error?: string;
  pollError?: string;
  missing?: boolean;
  retryAt?: number;
}
export type HostedTasks = Record<string, HostedTask>;
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type Transport = typeof request;
type Lock = (name: string, run: () => Promise<void>) => Promise<void>;
const STORAGE_KEY = 'ac-test-hub:hosted:v2';
const TERMINAL = new Set(['completed', 'failed', 'expired', 'deleted', 'cancelled', 'canceled']);
export const taskKey = (repository: string, prNumber: number) => `${repository.toLowerCase()}#${prNumber}`;
export const activeBuild = (build: Build) => !TERMINAL.has(build.status);
export const canCompileAgain = (task?: HostedTask) => !!task?.missing || (!!task?.build && TERMINAL.has(task.build.status));

/** A single current phase, without inventing an overall percentage for parallel work. */
export function hostedProgress(task?: HostedTask): { label: string; button: string; percent?: number; detail?: string; failed?: boolean } {
  if (!task) {
    return { label: '', button: 'Configure hosted realm' };
  }
  if (task.submitting) {
    return { label: 'Submitting compilation…', button: 'Submitting…' };
  }
  if (task.missing) {
    return { label: 'Compilation no longer available', button: 'Compile again', failed: true, detail: task.pollError };
  }
  if (task.intent) {
    return {
      label: 'Submission not confirmed',
      button: 'Retry submission',
      detail: task.error || 'Retry the same request safely; it will not create another build.',
    };
  }
  if (!task.build) {
    return {
      label: task.error ? 'Compilation could not start' : 'Checking compilation…',
      button: task.id ? 'View progress' : 'Try again',
      detail: task.error,
      failed: !!task.error,
    };
  }
  const build = task.build;
  if (build.status === 'failed') {
    return {
      label: 'Hosted realm failed',
      button: 'Review & retry',
      detail: build.error || build.realm?.failure || build.build?.failure || build.realm?.progress_detail || build.build?.progress_detail,
      failed: true,
    };
  }
  if (['expired', 'deleted', 'cancelled', 'canceled'].includes(build.status)) {
    return { label: `Compilation ${build.status}`, button: 'Compile again', detail: build.error, failed: true };
  }
  if (build.status === 'completed') {
    return {
      label: build.realm?.state === 'offline' ? 'Test realm ready (stopped)' : 'Test realm ready',
      button: 'Open test realm',
      percent: 100,
    };
  }
  if (build.realm) {
    return {
      label: 'Preparing test realm',
      button: 'View progress',
      percent: progress(build.realm.progress_percent),
      detail: build.realm.progress_detail,
    };
  }
  if (['ready', 'completed'].includes(build.build?.state ?? build.build?.status ?? '')) {
    return {
      label: 'Preparing database',
      button: 'View progress',
      percent: progress(build.database?.progress_percent),
      detail: build.database?.progress_detail,
    };
  }
  if (build.build && !['queued', 'pending'].includes(build.build.state ?? build.build.status ?? 'queued')) {
    return {
      label: 'Compiling',
      button: 'View progress',
      percent: progress(build.build.progress_percent),
      detail: build.build.progress_detail,
    };
  }
  return { label: 'Waiting for compilation', button: 'View progress', detail: build.build?.progress_detail };
}
function progress(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(100, value) : undefined;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'The provisioning service could not be reached.';
}

/** Only operation IDs and unresolved request inputs/keys are persisted, never API responses or credentials. */
export class HostedTracker {
  private tasks: HostedTasks = {};
  private listeners = new Set<() => void>();
  private locks = new Set<string>();
  constructor(
    private storage?: Storage,
    private transport: Transport = request,
    private lock?: Lock,
    private instance = 'default',
  ) {
    this.sync();
  }
  snapshot = () => this.tasks;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private stored(): HostedTasks {
    try {
      const raw: unknown = JSON.parse(this.storage?.getItem(`${STORAGE_KEY}:${this.instance}`) ?? '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
      }
      const result: HostedTasks = {};
      for (const value of Object.values(raw).slice(-100) as HostedTask[]) {
        if (
          !value ||
          typeof value.repository !== 'string' ||
          !/^[\w.-]+\/[\w.-]+$/.test(value.repository) ||
          !Number.isInteger(value.prNumber) ||
          value.prNumber < 1
        ) {
          continue;
        }
        const id = typeof value.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.id) ? value.id : undefined;
        const intent =
          value.intent &&
          typeof value.intent.key === 'string' &&
          /^[A-Za-z0-9._:-]{1,128}$/.test(value.intent.key) &&
          value.intent.input?.repository === value.repository &&
          value.intent.input.pr_number === value.prNumber &&
          typeof value.intent.input.build_server === 'string' &&
          /^[A-Za-z0-9_-]{1,128}$/.test(value.intent.input.build_server) &&
          Array.isArray(value.intent.input.modules) &&
          value.intent.input.modules.length <= 5 &&
          value.intent.input.modules.every((name) => typeof name === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(name))
            ? value.intent
            : undefined;
        if (intent) {
          try {
            const characters = parseCharacters(JSON.stringify(intent.input.characters ?? []));
            intent.input = {
              repository: value.repository,
              pr_number: value.prNumber,
              build_server: intent.input.build_server,
              modules: [...intent.input.modules],
              characters,
            };
          } catch {
            continue;
          }
        }
        if (id || intent) {
          result[taskKey(value.repository, value.prNumber)] = {
            repository: value.repository,
            prNumber: value.prNumber,
            id,
            intent,
            retryAt: typeof value.retryAt === 'number' ? value.retryAt : undefined,
          };
        }
      }
      return result;
    } catch {
      return {};
    }
  }
  sync = () => {
    const stored = this.stored();
    let changed = false;
    const next = { ...this.tasks };
    for (const [key, task] of Object.entries(stored)) {
      if (!this.locks.has(key) && (next[key]?.id !== task.id || next[key]?.intent?.key !== task.intent?.key)) {
        next[key] = task;
        changed = true;
      }
    }
    if (changed) {
      this.tasks = next;
      for (const listener of this.listeners) {
        listener();
      }
    }
  };
  private update(key: string, task: HostedTask) {
    this.tasks = { ...this.tasks, [key]: task };
    try {
      const records = { ...this.stored() };
      if (task.id || task.intent) {
        records[key] = { repository: task.repository, prNumber: task.prNumber, id: task.id, intent: task.intent, retryAt: task.retryAt };
      } else {
        delete records[key];
      }
      this.storage?.setItem(`${STORAGE_KEY}:${this.instance}`, JSON.stringify(records));
    } catch {
      /* Keep working in memory when storage is unavailable. */
    }
    for (const listener of this.listeners) {
      listener();
    }
  }
  accept(build: Build) {
    const key = taskKey(build.repository, build.pr_number);
    const current = this.tasks[key];
    // A list refresh must not replace the exact operation a visitor is following.
    if (current?.intent || current?.submitting || (current?.error && !current.id) || (current?.id && current.id !== build.id)) {
      return;
    }
    this.update(key, { ...current, repository: build.repository, prNumber: build.pr_number, id: build.id, build });
  }
  async poll(key: string, signal?: AbortSignal) {
    const task = this.tasks[key];
    if (!task?.id || task.missing || task.submitting || Date.now() < (task.retryAt ?? 0)) {
      return;
    }
    try {
      const build = await this.transport<Build>(`v1/builds/${encodeURIComponent(task.id)}`, { signal });
      if (build.id !== task.id || taskKey(build.repository, build.pr_number) !== key) {
        throw new Error('The service returned progress for another compilation.');
      }
      if (!signal?.aborted && this.tasks[key]?.id === task.id && !this.tasks[key]?.submitting) {
        this.update(key, { ...this.tasks[key], build, pollError: undefined, retryAt: undefined });
      }
    } catch (error) {
      if (signal?.aborted || this.tasks[key]?.id !== task.id) {
        return;
      }
      this.update(key, {
        ...this.tasks[key],
        missing: error instanceof APIError && error.status === 404,
        pollError:
          error instanceof APIError && error.status === 404
            ? 'This compilation no longer exists in the provider account. You can deliberately start a new one.'
            : `Progress temporarily unavailable. ${message(error)}`,
        retryAt: Date.now() + Math.max(15000, error instanceof APIError ? error.retryAfter * 1000 : 0),
      });
    }
  }
  /** Synchronous guard + cross-tab Web Lock + upstream idempotency cover clicks, reloads and uncertain responses. */
  async submit(input: BuildInput, csrf: string, again = false) {
    const key = taskKey(input.repository, input.pr_number);
    if (this.locks.has(key) || Date.now() < (this.tasks[key]?.retryAt ?? 0)) {
      return;
    }
    this.sync();
    this.locks.add(key);
    const before = this.tasks[key] ?? { repository: input.repository, prNumber: input.pr_number };
    this.update(key, { ...before, submitting: true });
    const run = async () => {
      // A different tab may have finished while this tab waited for the Web Lock.
      const fromStorage = this.stored()[key];
      let current = this.tasks[key];
      if (fromStorage && (fromStorage.id !== current?.id || fromStorage.intent?.key !== current?.intent?.key)) {
        current = fromStorage;
      }
      const base: HostedTask = current ?? { repository: input.repository, prNumber: input.pr_number };
      this.update(key, { ...base, submitting: true, error: undefined });
      try {
        if (base.id && !base.missing) {
          const existing = await this.transport<Build>(`v1/builds/${encodeURIComponent(base.id)}`);
          if (existing.id !== base.id || taskKey(existing.repository, existing.pr_number) !== key) {
            throw new Error('The service returned another compilation.');
          }
          if (!again || !canCompileAgain({ ...base, build: existing })) {
            this.update(key, { ...base, build: existing, submitting: false });
            return;
          }
        }
        // Only the provider can compare fixtures, selected builder and pinned revision atomically.
        // The gateway requests exact active-build reuse; the durable key recovers uncertain submissions.
        const intent = base.intent ?? { key: crypto.randomUUID(), input };
        this.update(key, { repository: input.repository, prNumber: input.pr_number, intent, submitting: true });
        const build = await this.transport<Build>('v1/builds', {
          method: 'POST',
          data: intent.input,
          csrf,
          key: intent.key,
          signal: AbortSignal.timeout(90000),
        });
        if (!build.id || taskKey(build.repository, build.pr_number) !== key) {
          throw new Error('The compilation response was incomplete. Retry the same submission to recover it safely.');
        }
        this.update(key, { repository: input.repository, prNumber: input.pr_number, id: build.id, build });
      } catch (error) {
        const task = this.tasks[key];
        // An explicit rejection means no operation was accepted; network/5xx outcomes remain uncertain.
        const rejected = !base.intent && error instanceof APIError && [400, 401, 403, 404, 422].includes(error.status);
        this.update(key, {
          ...task,
          submitting: false,
          intent: rejected ? undefined : task.intent,
          error: message(error),
          retryAt: error instanceof APIError && error.retryAfter > 0 ? Date.now() + error.retryAfter * 1000 : undefined,
        });
      }
    };
    try {
      if (this.lock) {
        await this.lock(`tc9-build:${this.instance}:${key}`, run);
      } else {
        await run();
      }
    } catch (error) {
      // Storage/Web Locks may be denied before run() starts. Do not leave the PR stuck submitting.
      this.update(key, { ...this.tasks[key], submitting: false, error: message(error) });
    } finally {
      this.locks.delete(key);
    }
  }
}

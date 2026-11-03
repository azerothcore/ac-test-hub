/// <reference types="vite/client" />
export const HOSTED_ENABLED = import.meta.env.VITE_TC9_ENABLED === 'true';

export interface TC9Config {
  upstream: string;
  sharedAccount: boolean;
  instance: string;
  capabilities: { management: boolean; personalAccounts: boolean };
}
export interface Connection {
  connected: boolean;
  csrf?: string;
  expiresAt?: number;
}
export interface ServiceStatus {
  available: boolean;
  builds_available: boolean;
  build_servers: string[];
  maintenance_message?: string;
  queued_operations: number;
  running_realms: number;
  max_running_realms: number;
}
export interface Module {
  name: string;
  description: string;
  url: string;
}
export interface Repository {
  id: string;
  label: string;
}
export interface Realm {
  id: string;
  repository: string;
  pr_number: number;
  commit_sha: string;
  state: string;
  realm_name: string;
  address?: string;
  port?: number;
  realmlist_id?: number;
  progress_percent?: number;
  progress_detail?: string;
  failure?: string;
}
export interface GameAccount {
  realm_id: string;
  state: 'pending' | 'ready' | 'failed';
  username?: string;
  password?: string;
  error?: string;
}
export interface Artifact {
  state: 'waiting_for_build' | 'unavailable' | 'queued' | 'exporting' | 'failed' | 'ready';
  detail?: string;
  sha?: string;
  artifact_sha256?: string;
  artifact_size?: number;
}
export interface Phase {
  failure?: string;
  state?: string;
  status?: string;
  progress_percent?: number;
  progress_detail?: string;
  detail?: string;
}
export interface Build {
  id: string;
  status: string;
  repository: string;
  pr_number: number;
  sha: string;
  modules?: string[];
  created_at: string;
  queue_expires_at?: string;
  error?: string;
  realm?: Realm;
  build?: Phase;
  database?: Phase;
}
export interface BuildPage {
  builds: Build[];
  total: number;
  limit: number;
  offset: number;
}
export interface Character {
  name: string;
  race: string;
  class: string;
  level: number;
  money_gold?: number;
  items?: { id: number; count: number }[];
  active_quests?: number[];
  completed_quests?: number[];
}
export interface BuildInput {
  repository: string;
  pr_number: number;
  build_server: string;
  modules: string[];
  characters?: Character[];
}
export const RACE_CLASSES: Record<string, readonly string[]> = {
  human: ['warrior', 'paladin', 'rogue', 'priest', 'death knight', 'mage', 'warlock'],
  orc: ['warrior', 'hunter', 'rogue', 'death knight', 'shaman', 'warlock'],
  dwarf: ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'death knight'],
  'night elf': ['warrior', 'hunter', 'rogue', 'priest', 'death knight', 'druid'],
  undead: ['warrior', 'rogue', 'priest', 'death knight', 'mage', 'warlock'],
  tauren: ['warrior', 'hunter', 'death knight', 'shaman', 'druid'],
  gnome: ['warrior', 'rogue', 'death knight', 'mage', 'warlock'],
  troll: ['warrior', 'hunter', 'rogue', 'priest', 'death knight', 'shaman', 'mage'],
  'blood elf': ['paladin', 'hunter', 'rogue', 'priest', 'death knight', 'mage', 'warlock'],
  draenei: ['warrior', 'paladin', 'hunter', 'priest', 'death knight', 'shaman', 'mage'],
};

/** Optional advanced fixtures. Unconfirmed requests retain these inputs for safe retry. */
export function parseCharacters(text: string): Character[] {
  const value: unknown = JSON.parse(text || '[]');
  if (!Array.isArray(value) || value.length > 3) {
    throw new Error('Enter an array of at most 3 characters.');
  }
  const names = new Set<string>();
  const integer = (n: unknown, low: number, high: number): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= low && n <= high;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('Each character must be an object.');
    }
    const c = candidate as Record<string, unknown>;
    if (
      Object.keys(c).some(
        (key) => !['name', 'race', 'class', 'level', 'money_gold', 'items', 'active_quests', 'completed_quests'].includes(key),
      )
    ) {
      throw new Error('Unknown character field.');
    }
    if (typeof c.name !== 'string' || !/^[A-Za-z]{2,12}$/.test(c.name) || names.has(c.name.toLowerCase())) {
      throw new Error('Use unique character names of 2–12 letters.');
    }
    names.add(c.name.toLowerCase());
    if (typeof c.race !== 'string' || typeof c.class !== 'string' || !RACE_CLASSES[c.race]?.includes(c.class)) {
      throw new Error('Select a valid WoW 3.3.5a race and class combination.');
    }
    if (!integer(c.level, 1, 80) || (c.money_gold !== undefined && !integer(c.money_gold, 0, 10000))) {
      throw new Error('Levels must be 1–80 and gold 0–10000.');
    }
    if (c.items !== undefined) {
      if (!Array.isArray(c.items) || c.items.length > 40) {
        throw new Error('Use at most 40 items.');
      }
      const ids = new Set<number>();
      for (const item of c.items as { id?: unknown; count?: unknown }[]) {
        if (!item || !integer(item.id, 1, 4294967295) || !integer(item.count, 1, 200) || ids.has(item.id)) {
          throw new Error('Use distinct item IDs and counts of 1–200.');
        }
        ids.add(item.id);
      }
    }
    const quests = new Set<number>();
    for (const field of ['active_quests', 'completed_quests']) {
      const list = c[field] ?? [];
      if (!Array.isArray(list)) {
        throw new Error('Quest IDs must be arrays.');
      }
      for (const quest of list as unknown[]) {
        if (!integer(quest, 1, 4294967295) || quests.has(quest)) {
          throw new Error('Quest IDs must be distinct positive integers across both arrays.');
        }
        quests.add(quest);
      }
    }
    if (quests.size > 25) {
      throw new Error('Use at most 25 active and completed quests combined.');
    }
  }
  return value as Character[];
}

function invalid(): never {
  throw new Error('The provisioning service returned an incompatible response. Contact the site operator.');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid();
  }
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}
function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : invalid();
}
function bool(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid();
}
function list<T>(value: unknown, decode: (entry: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(decode) : invalid();
}
function optional<T>(value: unknown, decode: (entry: unknown) => T): T | undefined {
  return value === null || value === undefined ? undefined : decode(value);
}
function phase(value: unknown): Phase {
  const v = object(value);
  return {
    state: optional(v.state, text),
    status: optional(v.status, text),
    failure: optional(v.failure, text),
    progress_percent: optional(v.progress_percent, number),
    progress_detail: optional(v.progress_detail, text),
    detail: optional(v.detail, text),
  };
}
function realm(value: unknown): Realm {
  const v = object(value);
  return {
    ...phase(v),
    id: text(v.id),
    repository: text(v.repository),
    pr_number: number(v.pr_number),
    commit_sha: text(v.commit_sha),
    state: text(v.state),
    realm_name: text(v.realm_name),
    address: optional(v.address, text),
    port: optional(v.port, number),
    realmlist_id: optional(v.realmlist_id, number),
  };
}
function build(value: unknown): Build {
  const v = object(value);
  return {
    id: text(v.id),
    repository: text(v.repository),
    pr_number: number(v.pr_number),
    status: text(v.status),
    sha: text(v.sha),
    created_at: text(v.created_at),
    queue_expires_at: optional(v.queue_expires_at, text),
    error: optional(v.error, text),
    modules: optional(v.modules, (entry) => list(entry, text)),
    realm: optional(v.realm, realm),
    build: optional(v.build, phase),
    database: optional(v.database, phase),
  };
}
/** Unknown additional fields are tolerated; missing/wrong required fields fail within the request boundary. */
export function decodeResponse(path: string, value: unknown, method = 'GET'): unknown {
  const route = path.split('?')[0];
  if (route === 'config') {
    const v = object(value);
    const capabilities = object(v.capabilities);
    return {
      upstream: text(v.upstream),
      sharedAccount: bool(v.sharedAccount),
      instance: text(v.instance),
      capabilities: { management: bool(capabilities.management), personalAccounts: bool(capabilities.personalAccounts) },
    } satisfies TC9Config;
  }
  if (route === 'connection') {
    const v = object(value);
    return { connected: bool(v.connected), csrf: text(v.csrf), expiresAt: number(v.expiresAt) } satisfies Connection;
  }
  if (route === 'v1/status') {
    const v = object(value);
    return {
      available: bool(v.available),
      builds_available: bool(v.builds_available),
      build_servers: list(v.build_servers, text),
      maintenance_message: optional(v.maintenance_message, text),
      queued_operations: number(v.queued_operations),
      running_realms: number(v.running_realms),
      max_running_realms: number(v.max_running_realms),
    } satisfies ServiceStatus;
  }
  if (route === 'v1/modules') {
    return list(value, (entry) => {
      const v = object(entry);
      const url = text(v.url);
      if (!url.startsWith('https://')) {
        return invalid();
      }
      return { name: text(v.name), description: text(v.description), url } satisfies Module;
    });
  }
  if (route === 'v1/repositories') {
    return list(value, (entry) => {
      const v = object(entry);
      return { id: text(v.id), label: text(v.label) } satisfies Repository;
    });
  }
  if (route === 'v1/realms') {
    return list(value, realm);
  }
  if (/^v1\/realms\/[^/]+\/account$/.test(route)) {
    const v = object(value);
    if (!['pending', 'ready', 'failed'].includes(text(v.state))) {
      return invalid();
    }
    if (v.state === 'ready' && (!v.username || !v.password)) {
      return invalid();
    }
    return {
      realm_id: text(v.realm_id),
      state: v.state as GameAccount['state'],
      username: optional(v.username, text),
      password: optional(v.password, text),
      error: optional(v.error, text),
    } satisfies GameAccount;
  }
  if (route.endsWith('/artifact')) {
    const v = object(value);
    if (!['waiting_for_build', 'unavailable', 'queued', 'exporting', 'failed', 'ready'].includes(text(v.state))) {
      return invalid();
    }
    return {
      state: v.state as Artifact['state'],
      detail: optional(v.detail, text),
      sha: optional(v.sha, text),
      artifact_sha256: optional(v.artifact_sha256, text),
      artifact_size: optional(v.artifact_size, number),
    } satisfies Artifact;
  }
  if (route === 'v1/builds' && method === 'GET') {
    const v = object(value);
    return { builds: list(v.builds, build), total: number(v.total), limit: number(v.limit), offset: number(v.offset) } satisfies BuildPage;
  }
  if ((route === 'v1/builds' && method === 'POST') || (/^v1\/builds\/[^/]+$/.test(route) && method === 'GET')) {
    return build(value);
  }
  return value;
}
export function retryAfter(value: string | null, now = Date.now()): number {
  if (!value) {
    return 0;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const until = Date.parse(value);
  return Number.isFinite(until) ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

export const API_BASE = `${import.meta.env.BASE_URL}tc9-api/`;
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: { method?: string; data?: unknown; csrf?: string; key?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.method && options.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }
  if (options.csrf) {
    headers['X-CSRF-Token'] = options.csrf;
  }
  if (options.key) {
    headers['Idempotency-Key'] = options.key;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: options.data === undefined ? undefined : JSON.stringify(options.data),
    signal: AbortSignal.any([AbortSignal.timeout(90000), ...(options.signal ? [options.signal] : [])]),
  });
  let result: unknown = {};
  try {
    if (response.status !== 204) {
      result = await response.json();
    }
  } catch {
    if (response.ok) {
      throw new Error('The provisioning service returned an invalid response.');
    }
  }
  if (!response.ok) {
    const message =
      result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'API request failed';
    const scope = response.status === 403 ? ' Contact the site operator if you need access to this operation.' : '';
    throw new APIError(`${message}${scope}`, response.status, retryAfter(response.headers.get('Retry-After')));
  }
  return decodeResponse(path, result, options.method ?? 'GET') as T;
}

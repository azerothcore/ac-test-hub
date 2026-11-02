/// <reference types="vite/client" />
export interface TC9Config {
  upstream: string;
  sharedAccount: boolean;
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
  admin_username?: string;
  admin_password?: string;
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

/** Optional advanced fixtures; nothing from this form is persisted in the browser. */
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
    const scope = response.status === 403 ? ' Check the token scopes in Account & API (read, build, manage, download).' : '';
    throw new APIError(`${message}${scope}`, response.status, Number(response.headers.get('Retry-After')) || 0);
  }
  return result as T;
}

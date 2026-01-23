/**
 * In-Memory Cache Client
 *
 * Provides a Redis-compatible in-memory cache for local development.
 * Implements the same interface used by the application with Redis.
 */

interface StoredValue {
  value: string;
  expiresAt: number | null;
}

class MemoryCacheClient {
  private store: Map<string, StoredValue> = new Map();
  private _isOpen = false;

  get isOpen(): boolean {
    return this._isOpen;
  }

  async connect(): Promise<void> {
    this._isOpen = true;
    console.log('Memory cache client connected');
  }

  async quit(): Promise<void> {
    this._isOpen = false;
    this.store.clear();
    console.log('Memory cache client disconnected');
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async get(key: string): Promise<string | null> {
    this.cleanupExpired();
    const item = this.store.get(key);
    if (!item) return null;

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: string): Promise<string> {
    this.store.set(key, { value, expiresAt: null });
    return 'OK';
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<string> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];
    let deleted = 0;
    for (const k of keys) {
      if (this.store.delete(k)) {
        deleted++;
      }
    }
    return deleted;
  }

  async keys(pattern: string): Promise<string[]> {
    this.cleanupExpired();
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const result: string[] = [];
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        result.push(key);
      }
    }
    return result;
  }

  async exists(key: string | string[]): Promise<number> {
    this.cleanupExpired();
    const keys = Array.isArray(key) ? key : [key];
    let count = 0;
    for (const k of keys) {
      if (this.store.has(k)) {
        count++;
      }
    }
    return count;
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;

    item.expiresAt = Date.now() + ttlSeconds * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return -2;
    if (!item.expiresAt) return -1;

    const remaining = Math.floor((item.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (parseInt(current || '0', 10) + 1).toString();
    const item = this.store.get(key);
    if (item) {
      item.value = newValue;
    } else {
      this.store.set(key, { value: newValue, expiresAt: null });
    }
    return parseInt(newValue, 10);
  }

  async incrBy(key: string, increment: number): Promise<number> {
    const current = await this.get(key);
    const newValue = (parseInt(current || '0', 10) + increment).toString();
    const item = this.store.get(key);
    if (item) {
      item.value = newValue;
    } else {
      this.store.set(key, { value: newValue, expiresAt: null });
    }
    return parseInt(newValue, 10);
  }

  async hSet(key: string, field: string, value: string): Promise<number> {
    const existing = await this.get(key);
    let hash: Record<string, string> = {};
    if (existing) {
      try {
        hash = JSON.parse(existing);
      } catch {
        hash = {};
      }
    }
    const isNew = !(field in hash);
    hash[field] = value;
    await this.set(key, JSON.stringify(hash));
    return isNew ? 1 : 0;
  }

  async hGet(key: string, field: string): Promise<string | null> {
    const existing = await this.get(key);
    if (!existing) return null;
    try {
      const hash = JSON.parse(existing);
      return hash[field] || null;
    } catch {
      return null;
    }
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    const existing = await this.get(key);
    if (!existing) return {};
    try {
      return JSON.parse(existing);
    } catch {
      return {};
    }
  }

  async hIncrBy(key: string, field: string, increment: number): Promise<number> {
    const existing = await this.get(key);
    let hash: Record<string, string> = {};
    if (existing) {
      try {
        hash = JSON.parse(existing);
      } catch {
        hash = {};
      }
    }
    const currentValue = parseInt(hash[field] || '0', 10);
    const newValue = currentValue + increment;
    hash[field] = newValue.toString();
    await this.set(key, JSON.stringify(hash));
    return newValue;
  }

  // Sorted set operations
  private sortedSets: Map<string, Map<string, number>> = new Map();

  async zAdd(
    key: string,
    options: { score: number; value: string } | Array<{ score: number; value: string }>
  ): Promise<number> {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, new Map());
    }
    const set = this.sortedSets.get(key)!;
    const items = Array.isArray(options) ? options : [options];
    let added = 0;
    for (const item of items) {
      if (!set.has(item.value)) {
        added++;
      }
      set.set(item.value, item.score);
    }
    return added;
  }

  async zCard(key: string): Promise<number> {
    const set = this.sortedSets.get(key);
    return set ? set.size : 0;
  }

  async zRange(
    key: string,
    start: number,
    stop: number,
    _options?: { REV?: boolean }
  ): Promise<string[]> {
    const set = this.sortedSets.get(key);
    if (!set) return [];

    const entries = Array.from(set.entries()).sort((a, b) => a[1] - b[1]);
    const end = stop === -1 ? entries.length : stop + 1;
    return entries.slice(start, end).map(([value]) => value);
  }

  async zRemRangeByScore(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<number> {
    const set = this.sortedSets.get(key);
    if (!set) return 0;

    const minScore = typeof min === 'string' ? (min === '-inf' ? -Infinity : parseFloat(min)) : min;
    const maxScore = typeof max === 'string' ? (max === '+inf' ? Infinity : parseFloat(max)) : max;

    let removed = 0;
    for (const [value, score] of set.entries()) {
      if (score >= minScore && score <= maxScore) {
        set.delete(value);
        removed++;
      }
    }
    return removed;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    this.cleanupExpired();
    return this.store.size;
  }
}

let memoryClient: MemoryCacheClient | null = null;

export function getMemoryCacheClient(): MemoryCacheClient {
  if (!memoryClient) {
    memoryClient = new MemoryCacheClient();
  }
  return memoryClient;
}

export async function initMemoryCacheClient(): Promise<MemoryCacheClient> {
  const client = getMemoryCacheClient();
  if (!client.isOpen) {
    await client.connect();
  }
  return client;
}

export async function disconnectMemoryCache(): Promise<void> {
  if (memoryClient && memoryClient.isOpen) {
    await memoryClient.quit();
    memoryClient = null;
  }
}

export type { MemoryCacheClient };

/** 단순 인메모리 TTL 캐시. 프로세스 수명 동안만 유효. */

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V = unknown> {
  private store = new Map<string, Entry<V>>();

  constructor(private readonly maxEntries = 500) {}

  get(key: string): V | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // LRU 흉내: 최근 사용을 맨 뒤로
    this.store.delete(key);
    this.store.set(key, e);
    return e.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    if (this.store.size >= this.maxEntries) {
      // 가장 오래된 항목 제거
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** 캐시 미스면 factory 로 채운다. */
  async getOrSet(
    key: string,
    ttlMs: number,
    factory: () => Promise<V>,
  ): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  clear(): void {
    this.store.clear();
  }
}

export interface Storage {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** 可选批量写入，实现方可以合并成一次落盘。 */
  putMany?(entries: [string, string][]): Promise<void>;
}

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Cloudflare KV 适配。 */
export class KVStorage implements Storage {
  constructor(private readonly kv: KVNamespaceLike) {}

  get(key: string): Promise<string | null> {
    return this.kv.get(key);
  }

  put(key: string, value: string): Promise<void> {
    return this.kv.put(key, value);
  }

  delete(key: string): Promise<void> {
    return this.kv.delete(key);
  }

  async putMany(entries: [string, string][]): Promise<void> {
    for (const [key, value] of entries) {
      await this.kv.put(key, value);
    }
  }
}

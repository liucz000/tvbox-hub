import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Storage } from "../storage";

/**
 * Docker / 本地模式：单文件 JSON 存储。
 * - 全量数据常驻内存
 * - 每次 put 串行落盘，先写临时文件再 rename，避免半截文件
 */
export class JsonFileStorage implements Storage {
  private data: Record<string, string> = {};
  private loaded = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        this.data = parsed as Record<string, string>;
      }
    } catch {
      this.data = {};
    }
  }

  private async flush(): Promise<void> {
    const tmp = `${this.file}.tmp`;
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(tmp, JSON.stringify(this.data), "utf8");
    await rename(tmp, this.file);
  }

  async get(key: string): Promise<string | null> {
    await this.load();
    return this.data[key] ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    await this.load();
    this.data[key] = value;
    this.queue = this.queue.then(() => this.flush());
    await this.queue;
  }

  async putMany(entries: [string, string][]): Promise<void> {
    await this.load();
    for (const [key, value] of entries) {
      this.data[key] = value;
    }
    this.queue = this.queue.then(() => this.flush());
    await this.queue;
  }

  async delete(key: string): Promise<void> {
    await this.load();
    delete this.data[key];
    this.queue = this.queue.then(() => this.flush());
    await this.queue;
  }
}

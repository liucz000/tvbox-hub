import type { SourceEntry, SourcedConfig, TVBoxConfig } from "../types";
import { asString, isRecord, parseLooseJson } from "../util/json";
import { isHttpUrl, isPrivateHost, hostOf, resolveRef, toAsciiUrl } from "../util/url";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_MULTI_REPO = 15;

const USER_AGENTS = [
  "okhttp/3.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
];

export interface SourceFetchResult {
  entry: SourceEntry;
  ok: boolean;
  url: string;
  ms: number;
  error?: string;
  configs: SourcedConfig[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertFetchable(url: string): void {
  if (!isHttpUrl(url)) throw new Error("不是 http/https 地址");
  const host = hostOf(url);
  if (!host) throw new Error("无法解析主机名");
  if (isPrivateHost(host)) throw new Error("拒绝访问内网地址");
}

export async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const target = toAsciiUrl(url);
  assertFetchable(target);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < USER_AGENTS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(target, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENTS[attempt],
          Accept: "application/json, text/plain, */*",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const length = Number(res.headers.get("content-length") ?? "0");
      if (length > MAX_BODY_BYTES) throw new Error("响应过大");
      const text = await res.text();
      if (text.length > MAX_BODY_BYTES) throw new Error("响应过大");
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < USER_AGENTS.length - 1) await sleep(300);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("抓取失败");
}

function readUrls(config: TVBoxConfig): string[] {
  const raw = config.urls;
  if (!Array.isArray(raw)) return [];
  const urls: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) urls.push(item.trim());
    else if (isRecord(item)) {
      const url = asString(item.url);
      if (url) urls.push(url);
    }
  }
  return urls;
}

async function expandConfig(
  config: TVBoxConfig,
  sourceUrl: string,
  sourceName: string,
  depth: number,
  timeoutMs: number,
  seen: Set<string>,
): Promise<SourcedConfig[]> {
  const out: SourcedConfig[] = [];
  if (Array.isArray(config.sites) && config.sites.length > 0) {
    out.push({ name: sourceName, url: sourceUrl, config });
  }
  if (depth >= 2) return out;

  const urls = readUrls(config)
    .map((u) => resolveRef(u, sourceUrl))
    .filter((u) => isHttpUrl(u) && !seen.has(u))
    .slice(0, MAX_MULTI_REPO);

  for (const childUrl of urls) {
    seen.add(childUrl);
    try {
      const text = await fetchText(childUrl, timeoutMs);
      const child = parseLooseJson(text);
      if (!isRecord(child)) continue;
      const children = await expandConfig(
        child as TVBoxConfig,
        childUrl,
        `${sourceName}·子源`,
        depth + 1,
        timeoutMs,
        seen,
      );
      out.push(...children);
    } catch {
      // 单个子源失败不影响整体
    }
  }
  return out;
}

export async function loadSource(entry: SourceEntry, timeoutMs = 12000): Promise<SourceFetchResult> {
  const started = Date.now();
  const candidates = [entry.url, ...(entry.backups ?? [])];
  const seen = new Set<string>();
  const configs: SourcedConfig[] = [];
  let lastError = "";

  for (const candidate of candidates) {
    const url = toAsciiUrl(candidate);
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const text = await fetchText(url, timeoutMs);
      const parsed = parseLooseJson(text);
      if (!isRecord(parsed)) {
        lastError = "响应不是 JSON 对象";
        continue;
      }
      const expanded = await expandConfig(
        parsed as TVBoxConfig,
        url,
        entry.name,
        0,
        timeoutMs,
        seen,
      );
      if (expanded.length === 0) {
        lastError = "配置里没有站点";
        continue;
      }
      configs.push(...expanded);
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    entry,
    ok: configs.length > 0,
    url: toAsciiUrl(entry.url),
    ms: Date.now() - started,
    error: configs.length > 0 ? undefined : lastError || "抓取失败",
    configs,
  };
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));

  async function run(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: size }, () => run()));
  return results;
}

export async function loadSources(
  entries: SourceEntry[],
  timeoutMs = 12000,
  concurrency = 5,
): Promise<SourceFetchResult[]> {
  return mapLimit(entries, concurrency, (entry) => loadSource(entry, timeoutMs));
}

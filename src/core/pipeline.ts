import { BASE_PLACEHOLDER, KEYS } from "../config";
import { DEFAULT_LIVE_SOURCES, DEFAULT_SOURCES } from "../defaults";
import type { Storage } from "../storage";
import type {
  RuntimeConfig,
  SourceEntry,
  SourcedConfig,
  Status,
  TVBoxConfig,
  TVBoxLive,
} from "../types";
import { asString, isRecord } from "../util/json";
import { isHttpUrl, isPrivateHost, hostOf, toAsciiUrl } from "../util/url";
import { fetchText, loadSources, mapLimit, type SourceFetchResult } from "./fetch";
import { rewriteJars } from "./jar";
import { countChannels, mergeLiveGroups, parseLive, toM3u, toTxt, type LiveGroup } from "./live";
import { mergeConfigs } from "./merge";
import { probeSites } from "./probe";

let running = false;

const EMPTY_COUNTS: Status["counts"] = {
  sources: 0,
  sourcesOk: 0,
  sites: 0,
  parses: 0,
  lives: 0,
  liveChannels: 0,
  jars: 0,
};

export function isRefreshing(): boolean {
  return running;
}

export async function getStatus(storage: Storage): Promise<Status | null> {
  const raw = await storage.get(KEYS.status);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Status;
  } catch {
    return null;
  }
}

export async function shouldRefresh(storage: Storage, intervalMinutes: number): Promise<boolean> {
  const status = await getStatus(storage);
  if (!status) return true;
  if (!status.ok) return true;
  const generated = Date.parse(status.generatedAt);
  if (!Number.isFinite(generated)) return true;
  return Date.now() - generated >= intervalMinutes * 60_000;
}

function isPublicHttpUrl(value: string): boolean {
  if (!isHttpUrl(value)) return false;
  const host = hostOf(value);
  if (!host) return false;
  return !isPrivateHost(host);
}

export function validateSourceEntry(input: unknown): SourceEntry {
  if (!isRecord(input)) throw new Error("参数格式错误");
  const url = toAsciiUrl(asString(input.url));
  if (!isPublicHttpUrl(url)) throw new Error("必须是公开可访问的 http/https 地址");
  const name = asString(input.name) || hostOf(url) || "自定义源";
  if (name.length > 40) throw new Error("名称过长");
  const backups = Array.isArray(input.backups)
    ? input.backups
        .map((item) => toAsciiUrl(asString(item)))
        .filter((item) => isPublicHttpUrl(item))
        .slice(0, 3)
    : undefined;
  return backups && backups.length > 0 ? { name, url, backups } : { name, url };
}

export async function loadExtraSources(storage: Storage): Promise<SourceEntry[]> {
  const raw = await storage.get(KEYS.extraSources);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SourceEntry[] = [];
    for (const item of parsed) {
      try {
        out.push(validateSourceEntry(item));
      } catch {
        // 跳过损坏条目
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function saveExtraSources(storage: Storage, entries: SourceEntry[]): Promise<void> {
  await storage.put(KEYS.extraSources, JSON.stringify(entries));
}

export async function loadDisabledSources(storage: Storage): Promise<string[]> {
  const raw = await storage.get(KEYS.disabledSources);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").map((item) => toAsciiUrl(item));
  } catch {
    return [];
  }
}

async function saveDisabledSources(storage: Storage, urls: string[]): Promise<void> {
  await storage.put(KEYS.disabledSources, JSON.stringify(urls));
}

/** 内置源不物理删除，只记录停用名单，聚合时跳过。 */
export async function setBuiltinSourceEnabled(
  storage: Storage,
  input: string,
  enabled: boolean,
): Promise<string[]> {
  const target = toAsciiUrl(asString(input));
  const builtin = new Set(DEFAULT_SOURCES.map((item) => toAsciiUrl(item.url)));
  if (!builtin.has(target)) throw new Error("不是内置源");
  const current = await loadDisabledSources(storage);
  const next = enabled
    ? current.filter((url) => url !== target)
    : current.includes(target)
      ? current
      : [...current, target];
  await saveDisabledSources(storage, next);
  return next;
}

export async function addExtraSource(
  storage: Storage,
  input: unknown,
  maxSources: number,
): Promise<SourceEntry[]> {
  const entry = validateSourceEntry(input);
  const existing = await loadExtraSources(storage);
  const all = [...DEFAULT_SOURCES, ...existing];
  if (all.some((item) => item.url === entry.url)) throw new Error("该源已存在");
  if (all.length >= maxSources) throw new Error(`最多 ${maxSources} 个源`);
  const next = [...existing, entry];
  await saveExtraSources(storage, next);
  return next;
}

export async function removeExtraSource(storage: Storage, url: string): Promise<SourceEntry[]> {
  const target = toAsciiUrl(url);
  if (DEFAULT_SOURCES.some((item) => item.url === target)) {
    throw new Error("内置源不能删除");
  }
  const existing = await loadExtraSources(storage);
  const next = existing.filter((item) => item.url !== target);
  await saveExtraSources(storage, next);
  return next;
}

async function collectSourceEntries(storage: Storage, maxSources: number): Promise<SourceEntry[]> {
  const extras = await loadExtraSources(storage);
  const disabled = new Set(await loadDisabledSources(storage));
  const seen = new Set<string>();
  const out: SourceEntry[] = [];
  for (const entry of [...DEFAULT_SOURCES, ...extras]) {
    const url = toAsciiUrl(entry.url);
    if (seen.has(url) || disabled.has(url)) continue;
    seen.add(url);
    out.push(entry);
  }
  return out.slice(0, maxSources);
}

function collectLiveUrls(lives: TVBoxLive[]): string[] {
  const urls = new Set<string>();
  for (const source of DEFAULT_LIVE_SOURCES) {
    if (isPublicHttpUrl(source.url)) urls.add(source.url);
  }
  for (const live of lives) {
    const target = live.url ?? live.api;
    if (target && isPublicHttpUrl(target)) urls.add(target);
  }
  return [...urls].slice(0, 24);
}

async function loadLiveGroups(urls: string[]): Promise<LiveGroup[]> {
  const groups = await mapLimit(urls, 4, async (url) => {
    try {
      const text = await fetchText(url, 9000);
      return parseLive(text);
    } catch {
      return [];
    }
  });
  return mergeLiveGroups(groups);
}

async function putAll(storage: Storage, entries: [string, string][]): Promise<void> {
  if (storage.putMany) {
    await storage.putMany(entries);
    return;
  }
  for (const [key, value] of entries) await storage.put(key, value);
}

async function readJarIndex(storage: Storage): Promise<string[]> {
  const raw = await storage.get(KEYS.jarIndex);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toStatusSources(fetched: SourceFetchResult[]): Status["sources"] {
  return fetched.map((item) => ({
    name: item.entry.name,
    url: item.url,
    ok: item.ok,
    error: item.error,
    ms: item.ms,
  }));
}

export async function refresh(storage: Storage, config: RuntimeConfig): Promise<Status> {
  if (running) {
    const status = await getStatus(storage);
    if (status) return status;
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      durationMs: 0,
      counts: EMPTY_COUNTS,
      sources: [],
      error: "刷新进行中",
    };
  }

  running = true;
  const started = Date.now();
  let fetched: SourceFetchResult[] = [];
  let entries: SourceEntry[] = [];

  try {
    entries = await collectSourceEntries(storage, config.maxSources);
    fetched = await loadSources(entries, 12000, 5);
    const sourced: SourcedConfig[] = fetched.filter((item) => item.ok).flatMap((item) => item.configs);
    if (sourced.length === 0) throw new Error("所有源都不可用");

    const merged = mergeConfigs(sourced).config;
    let sites = merged.sites ?? [];
    if (config.probeMode !== "off") {
      const probed = await probeSites(sites, {
        mode: config.probeMode,
        concurrency: config.isWorker ? 4 : 6,
        budgetMs: config.isWorker ? 15000 : 40000,
      });
      sites = probed.sites;
    }

    let lives = merged.lives ?? [];
    let liveChannels = 0;
    const liveGroups = await loadLiveGroups(collectLiveUrls(lives));
    liveChannels = countChannels(liveGroups);

    if (liveChannels > 0) {
      await putAll(storage, [
        [KEYS.liveM3u, toM3u(liveGroups)],
        [KEYS.liveTxt, toTxt(liveGroups)],
        [KEYS.liveGroups, JSON.stringify(liveGroups)],
      ]);
      lives = [{ name: "聚合直播", type: 0, url: `${BASE_PLACEHOLDER}/live.m3u` }];
    }

    const draft: TVBoxConfig = { ...merged, sites, lives };
    const { config: finalConfig, jars } = await rewriteJars(draft, BASE_PLACEHOLDER);

    const previousJarKeys = new Set<string>(await readJarIndex(storage));
    const jarWrites: [string, string][] = [];
    for (const [key, url] of jars) {
      jarWrites.push([`${KEYS.jarPrefix}${key}`, url]);
      previousJarKeys.delete(key);
    }
    jarWrites.push([KEYS.jarIndex, JSON.stringify([...jars.keys()])]);
    jarWrites.push([KEYS.config, JSON.stringify(finalConfig)]);
    await putAll(storage, jarWrites);
    for (const key of previousJarKeys) await storage.delete(`${KEYS.jarPrefix}${key}`);

    const status: Status = {
      ok: true,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      counts: {
        sources: entries.length,
        sourcesOk: fetched.filter((item) => item.ok).length,
        sites: sites.length,
        parses: finalConfig.parses?.length ?? 0,
        lives: finalConfig.lives?.length ?? 0,
        liveChannels,
        jars: jars.size,
      },
      sources: toStatusSources(fetched),
    };
    await storage.put(KEYS.status, JSON.stringify(status));
    return status;
  } catch (err) {
    const status: Status = {
      ok: false,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      counts: { ...EMPTY_COUNTS, sources: entries.length },
      sources: toStatusSources(fetched),
      error: err instanceof Error ? err.message : String(err),
    };
    await storage.put(KEYS.status, JSON.stringify(status));
    return status;
  } finally {
    running = false;
  }
}

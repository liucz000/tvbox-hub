import type {
  SourcedConfig,
  TVBoxConfig,
  TVBoxLive,
  TVBoxParse,
  TVBoxSite,
} from "../types";
import { asString, isRecord } from "../util/json";
import { isHttpUrl, isPrivateHost, hostOf, resolveRef } from "../util/url";
import { splitSpider } from "./spider";

export interface MergeStats {
  sites: number;
  parses: number;
  lives: number;
  duplicateSites: number;
  localSitesDropped: number;
  sitesWithOwnJar: number;
}

export interface MergeResult {
  config: TVBoxConfig;
  stats: MergeStats;
  globalSpider: string | null;
}

function normalizeSpider(value: unknown, baseUrl: string): string | undefined {
  const text = asString(value);
  if (!text) return undefined;
  const parts = splitSpider(text);
  const resolved = resolveRef(parts.url, baseUrl);
  return `${parts.prefix}${resolved}${parts.md5 ? `;md5;${parts.md5}` : ""}`;
}

function isLocalUrl(value: string): boolean {
  if (!isHttpUrl(value)) return false;
  const host = hostOf(value);
  return !host || isPrivateHost(host);
}

function normalizeSite(raw: unknown, baseUrl: string): TVBoxSite | null {
  if (!isRecord(raw)) return null;
  const api = asString(raw.api);
  const key = asString(raw.key) || asString(raw.name);
  if (!api || !key) return null;

  const site = { ...raw } as TVBoxSite;
  site.key = key;
  site.api = api.startsWith("./") || api.startsWith("/") ? resolveRef(api, baseUrl) : api;
  site.name = asString(raw.name) || key;

  const type = Number(raw.type);
  if (Number.isFinite(type)) site.type = type;

  if (typeof raw.jar === "string" && raw.jar.trim()) {
    site.jar = normalizeSpider(raw.jar, baseUrl);
  }
  return site;
}

function normalizeParse(raw: unknown, baseUrl: string, index: number): TVBoxParse | null {
  if (!isRecord(raw)) return null;
  const url = resolveRef(asString(raw.url), baseUrl);
  if (!url || !isHttpUrl(url)) return null;
  const parse = { ...raw } as TVBoxParse;
  parse.url = url;
  parse.name = asString(raw.name) || `解析${index + 1}`;
  const type = Number(raw.type);
  if (Number.isFinite(type)) parse.type = type;
  return parse;
}

function normalizeLive(raw: unknown, baseUrl: string): TVBoxLive | null {
  if (!isRecord(raw)) return null;
  const live = { ...raw } as TVBoxLive;
  const url = asString(raw.url);
  const api = asString(raw.api);
  if (url) live.url = resolveRef(url, baseUrl);
  if (api) live.api = resolveRef(api, baseUrl);
  if (!live.url && !live.api) return null;
  return live;
}

export function normalizeConfig(config: TVBoxConfig, baseUrl: string): TVBoxConfig {
  const normalized: TVBoxConfig = { ...config };
  const spider = normalizeSpider(config.spider, baseUrl);
  if (spider) normalized.spider = spider;
  else delete normalized.spider;

  normalized.sites = (Array.isArray(config.sites) ? config.sites : [])
    .map((site) => normalizeSite(site, baseUrl))
    .filter((site): site is TVBoxSite => site !== null);

  normalized.parses = (Array.isArray(config.parses) ? config.parses : [])
    .map((parse, index) => normalizeParse(parse, baseUrl, index))
    .filter((parse): parse is TVBoxParse => parse !== null);

  normalized.lives = (Array.isArray(config.lives) ? config.lives : [])
    .map((live) => normalizeLive(live, baseUrl))
    .filter((live): live is TVBoxLive => live !== null);

  return normalized;
}

function addStrings(target: Set<string>, values: unknown[]): void {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) target.add(text);
  }
}

/** 选择引用次数最多的 spider 作为全局 spider。 */
function pickGlobalSpider(configs: TVBoxConfig[]): string | null {
  const votes = new Map<string, { count: number; raw: string }>();
  for (const config of configs) {
    const raw = asString(config.spider);
    if (!raw) continue;
    const parts = splitSpider(raw);
    if (!isHttpUrl(parts.url)) continue;
    const current = votes.get(parts.url);
    if (current) current.count++;
    else votes.set(parts.url, { count: 1, raw });
  }
  let best: { count: number; raw: string } | null = null;
  for (const item of votes.values()) {
    if (!best || item.count > best.count) best = item;
  }
  return best?.raw ?? null;
}

export function mergeConfigs(inputs: SourcedConfig[]): MergeResult {
  const configs = inputs.map((input) => normalizeConfig(input.config, input.url));
  const globalSpider = pickGlobalSpider(configs);
  const globalUrl = globalSpider ? splitSpider(globalSpider).url : null;

  const sites: TVBoxSite[] = [];
  const parses: TVBoxParse[] = [];
  const lives: TVBoxLive[] = [];
  const seenKeys = new Map<string, string>();
  const seenParses = new Set<string>();
  const seenLives = new Set<string>();
  const hosts = new Set<string>();
  const ads = new Set<string>();
  const flags = new Set<string>();
  const rules: unknown[] = [];
  const seenRules = new Set<string>();
  const doh: unknown[] = [];
  const seenDoh = new Set<string>();

  let duplicateSites = 0;
  let localSitesDropped = 0;
  let sitesWithOwnJar = 0;
  let wallpaper: string | undefined;
  let logo: string | undefined;

  for (const config of configs) {
    wallpaper = wallpaper || asString(config.wallpaper);
    logo = logo || asString(config.logo);

    const sourceSpider = asString(config.spider);
    const sourceSpiderUrl = sourceSpider ? splitSpider(sourceSpider).url : null;

    for (const site of config.sites ?? []) {
      if (isLocalUrl(site.api)) {
        localSitesDropped++;
        continue;
      }

      if (site.type === 3 && !site.jar && sourceSpider && sourceSpiderUrl && sourceSpiderUrl !== globalUrl) {
        site.jar = sourceSpider;
        sitesWithOwnJar++;
      }

      const existingApi = seenKeys.get(site.key);
      if (existingApi !== undefined) {
        if (existingApi === site.api) {
          duplicateSites++;
          continue;
        }
        let candidate = `${site.key}_2`;
        let n = 2;
        while (seenKeys.has(candidate)) {
          n++;
          candidate = `${site.key}_${n}`;
        }
        site.key = candidate;
        site.name = `${site.name ?? candidate}（${n}）`;
      }
      seenKeys.set(site.key, site.api);
      sites.push(site);
    }

    for (const parse of config.parses ?? []) {
      const key = `${parse.url}|${parse.type ?? ""}`;
      if (seenParses.has(key)) continue;
      seenParses.add(key);
      parses.push(parse);
    }

    for (const live of config.lives ?? []) {
      const target = live.url ?? live.api ?? "";
      if (!target) continue;
      if (isLocalUrl(target)) continue;
      const key = `${live.type ?? ""}|${target}`;
      if (seenLives.has(key)) continue;
      seenLives.add(key);
      lives.push(live);
    }

    addStrings(hosts, Array.isArray(config.hosts) ? config.hosts : []);
    addStrings(ads, Array.isArray(config.ads) ? config.ads : []);
    addStrings(flags, Array.isArray(config.flags) ? config.flags : []);

    for (const rule of Array.isArray(config.rules) ? config.rules : []) {
      const key = JSON.stringify(rule);
      if (seenRules.has(key) || key.length > 4000) continue;
      seenRules.add(key);
      rules.push(rule);
    }
    for (const item of Array.isArray(config.doh) ? config.doh : []) {
      const key = JSON.stringify(item);
      if (seenDoh.has(key)) continue;
      seenDoh.add(key);
      doh.push(item);
    }
  }

  const merged: TVBoxConfig = {
    sites,
    parses,
    lives,
  };
  if (globalSpider) merged.spider = globalSpider;
  if (wallpaper) merged.wallpaper = wallpaper;
  if (logo) merged.logo = logo;
  if (hosts.size > 0) merged.hosts = [...hosts];
  if (ads.size > 0) merged.ads = [...ads];
  if (flags.size > 0) merged.flags = [...flags];
  if (rules.length > 0) merged.rules = rules;
  if (doh.length > 0) merged.doh = doh;

  return {
    config: merged,
    globalSpider,
    stats: {
      sites: sites.length,
      parses: parses.length,
      lives: lives.length,
      duplicateSites,
      localSitesDropped,
      sitesWithOwnJar,
    },
  };
}

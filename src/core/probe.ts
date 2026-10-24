import type { TVBoxSite, ProbeMode } from "../types";
import { parseLooseJson } from "../util/json";
import { isHttpUrl, isPrivateHost, hostOf } from "../util/url";
import { mapLimit } from "./fetch";

export interface ProbeOptions {
  mode: ProbeMode;
  timeoutMs?: number;
  concurrency?: number;
  budgetMs?: number;
}

export interface ProbeStats {
  checked: number;
  alive: number;
  dropped: number;
  skipped: boolean;
}

export interface ProbeResult {
  sites: TVBoxSite[];
  stats: ProbeStats;
}

function probeUrl(site: TVBoxSite): string | null {
  if (!isHttpUrl(site.api)) return null;
  const host = hostOf(site.api);
  if (!host || isPrivateHost(host)) return null;
  if ((site.type === 0 || site.type === 1) && !site.api.includes("?")) {
    return `${site.api}?ac=list`;
  }
  return site.api;
}

function validates(type: number | undefined, body: string): boolean {
  if (body.length < 16) return false;
  if (type === 1) {
    const json = parseLooseJson(body);
    if (json && typeof json === "object") {
      const record = json as Record<string, unknown>;
      return Array.isArray(record.list) || Array.isArray(record.class) || "list" in record;
    }
    return /"(list|class)"\s*:/.test(body);
  }
  if (type === 0) {
    return /<(list|class)\b/i.test(body);
  }
  return body.length > 200;
}

async function probeOne(site: TVBoxSite, url: string, mode: ProbeMode, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "okhttp/3.15", Accept: "*/*" },
    });
    if (!res.ok) return false;
    const body = await res.text();
    if (mode === "shallow") return body.trim().length > 0;
    return validates(site.type, body);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 站点探活：
 * - shallow：只验证可达
 * - deep：type 0/1 校验返回结构，type 3 校验非空
 * - 存活率低于 10% 时放弃过滤（安全阀），避免一次网络抖动清空站点
 */
export async function probeSites(sites: TVBoxSite[], options: ProbeOptions): Promise<ProbeResult> {
  if (options.mode === "off") {
    return { sites, stats: { checked: 0, alive: 0, dropped: 0, skipped: true } };
  }

  const timeoutMs = options.timeoutMs ?? 4000;
  const concurrency = options.concurrency ?? 6;
  const budgetMs = options.budgetMs ?? 30000;
  const started = Date.now();

  const targets: { site: TVBoxSite; url: string }[] = [];
  for (const site of sites) {
    const url = probeUrl(site);
    if (url) targets.push({ site, url });
  }

  const alive = new Set<TVBoxSite>();
  const unchecked = new Set<TVBoxSite>();
  let checked = 0;

  await mapLimit(targets, concurrency, async (target) => {
    if (Date.now() - started > budgetMs) {
      unchecked.add(target.site);
      return;
    }
    checked++;
    if (await probeOne(target.site, target.url, options.mode, timeoutMs)) {
      alive.add(target.site);
    }
  });

  if (checked === 0) {
    return { sites, stats: { checked: 0, alive: 0, dropped: 0, skipped: true } };
  }

  const ratio = alive.size / checked;
  if (ratio < 0.1) {
    return { sites, stats: { checked, alive: alive.size, dropped: 0, skipped: true } };
  }

  const filtered = sites.filter((site) => {
    if (!probeUrl(site) || unchecked.has(site)) return true;
    return alive.has(site);
  });

  return {
    sites: filtered,
    stats: {
      checked,
      alive: alive.size,
      dropped: sites.length - filtered.length,
      skipped: false,
    },
  };
}

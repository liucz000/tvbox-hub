import type { RuntimeConfig, ProbeMode } from "./types";

/** 配置里的占位符，返回给客户端时替换成实际站点地址。 */
export const BASE_PLACEHOLDER = "__TVBOX_HUB_BASE__";

export const KEYS = {
  config: "config",
  status: "status",
  liveM3u: "live:m3u",
  liveTxt: "live:txt",
  liveGroups: "live:groups",
  extraSources: "sources:extra",
  disabledSources: "sources:disabled",
  jarPrefix: "jar:",
  jarIndex: "jars:index",
} as const;

export const DEFAULT_REFRESH_MINUTES = 720;
export const DEFAULT_MAX_SOURCES = 30;

export function parseProbeMode(value: string | undefined): ProbeMode {
  const mode = (value ?? "").trim().toLowerCase();
  if (mode === "shallow" || mode === "deep") return mode;
  return "off";
}

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function makeRuntimeConfig(input: {
  adminToken?: string;
  adminPassword?: string;
  refreshIntervalMinutes?: string;
  probeMode?: string;
  maxSources?: string;
  baseUrl?: string;
  isWorker: boolean;
  version: string;
}): RuntimeConfig {
  return {
    adminToken: (input.adminToken ?? "").trim(),
    adminPassword: (input.adminPassword ?? "").trim(),
    refreshIntervalMinutes: parsePositiveInt(input.refreshIntervalMinutes, DEFAULT_REFRESH_MINUTES),
    probeMode: parseProbeMode(input.probeMode),
    maxSources: parsePositiveInt(input.maxSources, DEFAULT_MAX_SOURCES),
    baseUrl: (input.baseUrl ?? "").trim().replace(/\/+$/, ""),
    isWorker: input.isWorker,
    version: input.version,
  };
}

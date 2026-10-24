export interface SourceEntry {
  name: string;
  url: string;
  backups?: string[];
}

export interface TVBoxSite {
  key: string;
  name?: string;
  type?: number;
  api: string;
  jar?: string;
  ext?: unknown;
  searchable?: number;
  quickSearch?: boolean;
  filter?: boolean;
  playerType?: number;
  categories?: string[];
  [key: string]: unknown;
}

export interface TVBoxParse {
  name: string;
  type?: number;
  url: string;
  ext?: unknown;
  [key: string]: unknown;
}

export interface TVBoxLive {
  name?: string;
  type?: number;
  url?: string;
  api?: string;
  ext?: unknown;
  ua?: string;
  playerType?: number;
  [key: string]: unknown;
}

export interface TVBoxConfig {
  spider?: string;
  wallpaper?: string;
  logo?: string;
  sites?: TVBoxSite[];
  parses?: TVBoxParse[];
  lives?: TVBoxLive[];
  hosts?: string[];
  rules?: unknown[];
  ads?: string[];
  flags?: string[];
  doh?: unknown[];
  [key: string]: unknown;
}

export interface SourcedConfig {
  name: string;
  url: string;
  config: TVBoxConfig;
}

export type ProbeMode = "off" | "shallow" | "deep";

export interface RuntimeConfig {
  adminToken: string;
  adminPassword: string;
  refreshIntervalMinutes: number;
  probeMode: ProbeMode;
  maxSources: number;
  baseUrl: string;
  isWorker: boolean;
  version: string;
}

export interface SourceStatus {
  name: string;
  url: string;
  ok: boolean;
  error?: string;
  ms: number;
}

export interface Status {
  ok: boolean;
  generatedAt: string;
  durationMs: number;
  counts: {
    sources: number;
    sourcesOk: number;
    sites: number;
    parses: number;
    lives: number;
    liveChannels: number;
    jars: number;
  };
  sources: SourceStatus[];
  error?: string;
}

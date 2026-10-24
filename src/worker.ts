import { createApp } from "./app";
import { makeRuntimeConfig } from "./config";
import { refresh, shouldRefresh } from "./core/pipeline";
import { KVStorage, type KVNamespaceLike } from "./storage";
import type { RuntimeConfig } from "./types";
import { VERSION } from "./version";

export interface Env {
  KV: KVNamespaceLike;
  ADMIN_TOKEN?: string;
  ADMIN_PASSWORD?: string;
  REFRESH_INTERVAL_MINUTES?: string;
  PROBE?: string;
  MAX_SOURCES?: string;
  BASE_URL?: string;
}

interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

const BOOT = Date.now();

function runtimeFrom(env: Env): RuntimeConfig {
  return makeRuntimeConfig({
    adminToken: env.ADMIN_TOKEN,
    adminPassword: env.ADMIN_PASSWORD,
    refreshIntervalMinutes: env.REFRESH_INTERVAL_MINUTES,
    probeMode: env.PROBE,
    maxSources: env.MAX_SOURCES,
    baseUrl: env.BASE_URL,
    isWorker: true,
    version: VERSION,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
    const runtime = runtimeFrom(env);
    const app = createApp({
      storage: new KVStorage(env.KV),
      runtime,
      startedAt: BOOT,
      background: (promise) => ctx.waitUntil(promise),
    });
    return app.fetch(request);
  },

  async scheduled(_event: unknown, env: Env, ctx: WorkerContext): Promise<void> {
    const runtime = runtimeFrom(env);
    const storage = new KVStorage(env.KV);
    if (await shouldRefresh(storage, runtime.refreshIntervalMinutes)) {
      ctx.waitUntil(refresh(storage, runtime));
    }
  },
};

import { Hono } from "hono";
import type { Context } from "hono";
import { BASE_PLACEHOLDER, KEYS } from "./config";
import { adminPage } from "./admin";
import {
  addExtraSource,
  getStatus,
  isRefreshing,
  loadExtraSources,
  refresh,
  removeExtraSource,
} from "./core/pipeline";
import { DEFAULT_SOURCES } from "./defaults";
import type { Storage } from "./storage";
import type { RuntimeConfig } from "./types";
import { sha256Hex } from "./util/url";

interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface JarEntry {
  body: ArrayBuffer;
  at: number;
}

const JAR_MAX_BYTES = 12 * 1024 * 1024;
const JAR_MEMORY_TTL = 6 * 60 * 60 * 1000;
const JAR_MEMORY_MAX = 6;
const jarMemory = new Map<string, JarEntry>();

function edgeCache(): CacheLike | null {
  const holder = globalThis as unknown as { caches?: { default?: CacheLike } };
  return holder.caches?.default ?? null;
}

function baseFor(c: Context, runtime: RuntimeConfig): string {
  if (runtime.baseUrl) return runtime.baseUrl;
  return new URL(c.req.url).origin;
}

async function tokenMatches(provided: string, expected: string): Promise<boolean> {
  if (!provided || !expected) return false;
  const [a, b] = await Promise.all([sha256Hex(provided, 32), sha256Hex(expected, 32)]);
  return a === b;
}

async function requireAuth(c: Context, runtime: RuntimeConfig): Promise<Response | null> {
  if (!runtime.adminToken) {
    return c.json({ error: "ADMIN_TOKEN 未配置，管理接口已关闭" }, 503);
  }
  const header = c.req.header("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "").trim();
  if (await tokenMatches(provided, runtime.adminToken)) return null;
  return c.json({ error: "未授权" }, 401);
}

function cachedByKey(key: string): JarEntry | null {
  const entry = jarMemory.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > JAR_MEMORY_TTL) {
    jarMemory.delete(key);
    return null;
  }
  return entry;
}

function rememberJar(key: string, body: ArrayBuffer): void {
  if (jarMemory.size >= JAR_MEMORY_MAX) {
    const oldest = jarMemory.keys().next().value;
    if (oldest) jarMemory.delete(oldest);
  }
  jarMemory.set(key, { body, at: Date.now() });
}

export interface AppDeps {
  storage: Storage;
  runtime: RuntimeConfig;
  /** 进程启动时间，用于健康检查 */
  startedAt: number;
  /** 后台任务调度：Worker 用 waitUntil，Node 直接执行 */
  background?: (promise: Promise<unknown>) => void;
}

export function createApp(deps: AppDeps): Hono {
  const { storage, runtime } = deps;
  const background = deps.background ?? ((promise: Promise<unknown>) => void promise);
  const app = new Hono();

  async function serveCached(
    c: Context,
    body: string,
    contentType: string,
    maxAge: number,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const cache = runtime.isWorker ? edgeCache() : null;
    const key = new Request(c.req.url, { method: "GET" });

    if (cache) {
      try {
        const hit = await cache.match(key);
        if (hit) return hit;
      } catch {
        // 缓存不可用时忽略
      }
    }

    const res = new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `public, max-age=${maxAge}`,
        "Access-Control-Allow-Origin": "*",
        ...extra,
      },
    });

    if (cache) {
      background(cache.put(key, res.clone()).catch(() => undefined));
    }
    return res;
  }

  app.get("/", async (c) => {
    const raw = await storage.get(KEYS.config);
    if (!raw) {
      return c.json(
        {
          error: "配置尚未生成",
          hint: runtime.adminToken ? "先 POST /refresh 触发一次聚合" : "等待定时任务或配置 ADMIN_TOKEN 后手动刷新",
        },
        503,
      );
    }
    const base = baseFor(c, runtime);
    return serveCached(c, raw.replaceAll(BASE_PLACEHOLDER, base), "application/json; charset=utf-8", 1800);
  });

  app.get("/index.json", async (c) => {
    const raw = await storage.get(KEYS.config);
    if (!raw) return c.json({ error: "配置尚未生成" }, 503);
    const base = baseFor(c, runtime);
    return serveCached(
      c,
      raw.replaceAll(BASE_PLACEHOLDER, base),
      "application/json; charset=utf-8",
      1800,
      { "Content-Disposition": 'attachment; filename="tvbox.json"' },
    );
  });

  app.get("/live.m3u", async (c) => {
    const body = await storage.get(KEYS.liveM3u);
    if (!body) return c.json({ error: "直播源尚未生成，请先触发聚合" }, 404);
    return serveCached(c, body, "audio/x-mpegurl; charset=utf-8", 1800);
  });

  app.get("/live.txt", async (c) => {
    const body = await storage.get(KEYS.liveTxt);
    if (!body) return c.json({ error: "直播源尚未生成，请先触发聚合" }, 404);
    return serveCached(c, body, "text/plain; charset=utf-8", 1800);
  });

  app.get("/live.json", async (c) => {
    const base = baseFor(c, runtime);
    const body = JSON.stringify({
      lives: [{ name: "聚合直播", type: 0, url: `${base}/live.m3u` }],
    });
    return serveCached(c, body, "application/json; charset=utf-8", 1800);
  });

  app.get("/healthz", (c) =>
    c.json({ ok: true, version: runtime.version, uptimeMs: Date.now() - deps.startedAt }),
  );

  app.get("/version", (c) => c.json({ version: runtime.version }));

  app.get("/status-data", async (c) => {
    const status = await getStatus(storage);
    if (!status) return c.json({ ok: false, hint: "尚未完成首次聚合" });
    return c.json({
      ok: status.ok,
      generatedAt: status.generatedAt,
      durationMs: status.durationMs,
      counts: status.counts,
      failed: status.sources.filter((item) => !item.ok).map((item) => item.name),
      error: status.error,
    });
  });

  app.get("/jar/:key", async (c) => {
    const key = c.req.param("key");
    if (!/^[a-f0-9]{16,32}$/i.test(key)) return c.json({ error: "非法 key" }, 400);

    const memory = cachedByKey(key);
    if (memory) {
      return new Response(memory.body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const cache = runtime.isWorker ? edgeCache() : null;
    const cacheKey = new Request(c.req.url, { method: "GET" });
    if (cache) {
      try {
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
      } catch {
        // 忽略
      }
    }

    const origin = await storage.get(`${KEYS.jarPrefix}${key}`);
    if (!origin) return c.json({ error: "JAR 不存在" }, 404);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(origin, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "okhttp/3.15" },
      });
      if (!res.ok) return c.json({ error: `上游返回 ${res.status}` }, 502);
      const length = Number(res.headers.get("content-length") ?? "0");
      if (length > JAR_MAX_BYTES) return c.json({ error: "JAR 过大" }, 413);
      const body = await res.arrayBuffer();
      if (body.byteLength > JAR_MAX_BYTES) return c.json({ error: "JAR 过大" }, 413);

      rememberJar(key, body);
      const response = new Response(body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
      if (cache) {
        background(cache.put(cacheKey, response.clone()).catch(() => undefined));
      }
      return response;
    } catch {
      return c.json({ error: "JAR 拉取失败" }, 502);
    } finally {
      clearTimeout(timer);
    }
  });

  app.get("/admin", () => {
    return new Response(adminPage(runtime.version), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
      },
    });
  });

  app.get("/admin/status", async (c) => {
    const denied = await requireAuth(c, runtime);
    if (denied) return denied;
    const status = await getStatus(storage);
    return c.json({ running: isRefreshing(), status });
  });

  app.get("/admin/sources", async (c) => {
    const denied = await requireAuth(c, runtime);
    if (denied) return denied;
    const extra = await loadExtraSources(storage);
    return c.json({ builtin: DEFAULT_SOURCES, extra });
  });

  app.post("/admin/sources", async (c) => {
    const denied = await requireAuth(c, runtime);
    if (denied) return denied;
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "请求体必须是 JSON" }, 400);
    }
    try {
      const extra = await addExtraSource(storage, payload, runtime.maxSources);
      return c.json({ ok: true, extra });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.delete("/admin/sources", async (c) => {
    const denied = await requireAuth(c, runtime);
    if (denied) return denied;
    const url = c.req.query("url");
    if (!url) return c.json({ error: "缺少 url 参数" }, 400);
    try {
      const extra = await removeExtraSource(storage, url);
      return c.json({ ok: true, extra });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/refresh", async (c) => {
    const denied = await requireAuth(c, runtime);
    if (denied) return denied;
    if (isRefreshing()) return c.json({ ok: true, running: true }, 202);

    background(refresh(storage, runtime));
    return c.json({ ok: true, started: true }, 202);
  });

  app.notFound((c) => c.json({ error: "Not Found" }, 404));

  app.onError((err, c) => {
    console.error("unhandled error", err);
    return c.json({ error: "服务内部错误" }, 500);
  });

  return app;
}

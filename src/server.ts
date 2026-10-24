import "dotenv/config";
import { serve } from "@hono/node-server";
import cron from "node-cron";
import { join } from "node:path";
import { createApp } from "./app";
import { makeRuntimeConfig } from "./config";
import { refresh, shouldRefresh } from "./core/pipeline";
import { JsonFileStorage } from "./storage/json-file";
import { VERSION } from "./version";

const port = Number(process.env.PORT ?? "5678");
const dataDir = process.env.DATA_DIR ?? join(process.cwd(), "data");
const storage = new JsonFileStorage(join(dataDir, "tvbox-hub.json"));

const runtime = makeRuntimeConfig({
  adminToken: process.env.ADMIN_TOKEN,
  refreshIntervalMinutes: process.env.REFRESH_INTERVAL_MINUTES ?? process.env.REFRESH_MINUTES,
  probeMode: process.env.PROBE,
  maxSources: process.env.MAX_SOURCES,
  baseUrl: process.env.BASE_URL,
  isWorker: false,
  version: VERSION,
});

const app = createApp({ storage, runtime, startedAt: Date.now() });

const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`[tvbox-hub] listening on http://0.0.0.0:${info.port}`);
  console.log(`[tvbox-hub] base url: ${runtime.baseUrl || "(来自请求 Host)"}`);
  console.log(`[tvbox-hub] admin: ${runtime.adminToken ? "enabled" : "disabled (ADMIN_TOKEN 为空)"}`);
  console.log(`[tvbox-hub] probe: ${runtime.probeMode}, refresh interval: ${runtime.refreshIntervalMinutes}min`);
});

void (async () => {
  try {
    if (await shouldRefresh(storage, runtime.refreshIntervalMinutes)) {
      console.log("[tvbox-hub] 开始首次聚合…");
      const status = await refresh(storage, runtime);
      console.log(
        status.ok
          ? `[tvbox-hub] 聚合完成：${status.counts.sites} 站点 / ${status.counts.liveChannels} 频道，耗时 ${status.durationMs}ms`
          : `[tvbox-hub] 聚合失败：${status.error}`,
      );
    }
  } catch (err) {
    console.error("[tvbox-hub] 首次聚合异常", err);
  }
})();

const schedule = process.env.CRON_SCHEDULE?.trim() || "0 */6 * * *";
if (cron.validate(schedule)) {
  const task = cron.schedule(schedule, () => {
    void refresh(storage, runtime).then((status) => {
      if (!status.ok) console.error(`[tvbox-hub] 定时聚合失败：${status.error}`);
    });
  });
  console.log(`[tvbox-hub] cron: ${schedule}`);
  const shutdown = () => {
    console.log("[tvbox-hub] 正在退出…");
    task.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} else {
  console.error(`[tvbox-hub] 非法 CRON_SCHEDULE: ${schedule}，定时任务未启用`);
}

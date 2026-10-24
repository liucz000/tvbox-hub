import type { TVBoxConfig } from "../types";
import { hostOf, isHttpUrl, isPrivateHost, isValidMd5, sha256Hex } from "../util/url";
import { joinSpider, splitSpider } from "./spider";

export interface JarRewriteResult {
  config: TVBoxConfig;
  jars: Map<string, string>;
}

async function keyFor(url: string, md5: string | null): Promise<string> {
  if (md5 && isValidMd5(md5)) return md5.toLowerCase();
  return sha256Hex(url, 8);
}

async function rewriteOne(
  spider: string,
  base: string,
  jars: Map<string, string>,
): Promise<string> {
  const parts = splitSpider(spider);
  if (!isHttpUrl(parts.url)) return spider;
  const host = hostOf(parts.url);
  if (!host || isPrivateHost(host)) return spider;
  const key = await keyFor(parts.url, parts.md5);
  if (!jars.has(key)) jars.set(key, parts.url);
  return joinSpider({ ...parts, url: `${base}/jar/${key}` });
}

/**
 * 把所有 jar 地址改写成本服务的 /jar/<key>，并记录 key → 原始地址映射。
 * 客户端只和本服务通信，jar 换域名 / 挂 CDN 时配置不用重新下发。
 */
export async function rewriteJars(config: TVBoxConfig, base: string): Promise<JarRewriteResult> {
  const jars = new Map<string, string>();
  const sites = (config.sites ?? []).map((site) => ({ ...site }));
  const next: TVBoxConfig = { ...config, sites };

  if (config.spider) next.spider = await rewriteOne(config.spider, base, jars);

  for (const site of sites) {
    if (site.jar) site.jar = await rewriteOne(site.jar, base, jars);
  }

  return { config: next, jars };
}

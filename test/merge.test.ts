import { describe, expect, it } from "vitest";
import { mergeConfigs } from "../src/core/merge";
import type { TVBoxConfig } from "../src/types";

const MD5_A = "a".repeat(32);
const MD5_B = "b".repeat(32);

describe("mergeConfigs", () => {
  const sourceA: TVBoxConfig = {
    spider: `https://a.com/a.jar;md5;${MD5_A}`,
    sites: [
      { key: "s1", name: "A站", type: 3, api: "csp_A" },
      { key: "dup", name: "重复站", type: 0, api: "http://a.com/api.php" },
    ],
    parses: [{ name: "解析1", type: 1, url: "http://p.com/api.php" }],
    lives: [{ name: "直播", type: 0, url: "http://live.com/list.txt" }],
  };

  const sourceB: TVBoxConfig = {
    spider: `https://b.com/b.jar;md5;${MD5_B}`,
    sites: [
      { key: "s2", name: "B站", type: 3, api: "csp_B" },
      { key: "s3", name: "B站2", type: 3, api: "csp_C", jar: "./own.jar" },
      { key: "dup", name: "重复站", type: 0, api: "http://b.com/api.php" },
      { key: "local", name: "本地", type: 0, api: "http://127.0.0.1:9978/api" },
    ],
    parses: [{ name: "解析1", type: 1, url: "http://p.com/api.php" }],
    lives: [{ name: "直播", type: 0, url: "http://live.com/list.txt" }],
  };

  it("按引用次数分配全局 spider，并为不同 jar 的站点单独挂 jar", () => {
    const result = mergeConfigs([
      { name: "A", url: "https://a.com/tvbox.json", config: sourceA },
      { name: "B", url: "https://b.com/tvbox.json", config: sourceB },
    ]);

    expect(result.globalSpider).toContain("a.com/a.jar");
    const s2 = result.config.sites?.find((site) => site.key === "s2");
    expect(s2?.jar).toContain("b.com/b.jar");
    const s3 = result.config.sites?.find((site) => site.key === "s3");
    expect(s3?.jar).toBe("https://b.com/own.jar");
  });

  it("同 key 不同 api 时改名保留，同 key 同 api 去重", () => {
    const result = mergeConfigs([
      { name: "A", url: "https://a.com/tvbox.json", config: sourceA },
      { name: "B", url: "https://b.com/tvbox.json", config: sourceB },
    ]);
    const keys = result.config.sites?.map((site) => site.key) ?? [];
    expect(keys).toContain("dup");
    expect(keys).toContain("dup_2");

    const duplicated = mergeConfigs([
      { name: "A", url: "https://a.com/tvbox.json", config: sourceA },
      { name: "A2", url: "https://a2.com/tvbox.json", config: sourceA },
    ]);
    expect(duplicated.stats.duplicateSites).toBeGreaterThan(0);
  });

  it("剔除内网/回环站点并去重解析与直播", () => {
    const result = mergeConfigs([
      { name: "A", url: "https://a.com/tvbox.json", config: sourceA },
      { name: "B", url: "https://b.com/tvbox.json", config: sourceB },
    ]);
    expect(result.config.sites?.some((site) => site.key === "local")).toBe(false);
    expect(result.config.parses?.length).toBe(1);
    expect(result.config.lives?.length).toBe(1);
    expect(result.stats.localSitesDropped).toBe(1);
  });
});

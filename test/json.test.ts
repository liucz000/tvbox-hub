import { describe, expect, it } from "vitest";
import { parseLooseJson } from "../src/util/json";

describe("parseLooseJson", () => {
  it("解析带 BOM、行注释与尾逗号的配置", () => {
    const raw = `\uFEFF{
      // 头部说明
      "spider": "./fty.jar;md5;3d161697458ecbcd2651a749db761ba1",
      "sites": [
        { "key": "a", "api": "csp_A" },
      ],
    }`;
    const parsed = parseLooseJson(raw) as Record<string, unknown>;
    expect(parsed.spider).toBe("./fty.jar;md5;3d161697458ecbcd2651a749db761ba1");
    expect(Array.isArray(parsed.sites)).toBe(true);
  });

  it("解析 JSONP 包装", () => {
    const parsed = parseLooseJson('callback({"sites":[]});') as Record<string, unknown>;
    expect(parsed.sites).toEqual([]);
  });

  it("从夹带说明文字中提取 JSON", () => {
    const raw = '以下为配置：{"sites":[],"parses":[]} 请勿修改';
    const parsed = parseLooseJson(raw) as Record<string, unknown>;
    expect(parsed.parses).toEqual([]);
  });

  it("不会把注释符号误删到字符串里", () => {
    const parsed = parseLooseJson('{"url":"https://a.com//path","x":1,}') as Record<string, unknown>;
    expect(parsed.url).toBe("https://a.com//path");
  });
});

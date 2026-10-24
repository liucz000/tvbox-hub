import { describe, expect, it } from "vitest";
import { isPrivateHost, resolveRef, toAsciiUrl } from "../src/util/url";
import { joinSpider, splitSpider } from "../src/core/spider";

describe("url utils", () => {
  it("把中文域名转成 punycode", () => {
    const url = toAsciiUrl("http://饭太硬.top/tv");
    expect(url).toContain("xn--");
    expect(url).not.toContain("饭太硬");
  });

  it("按源地址补全相对路径", () => {
    expect(resolveRef("./x.jar", "https://a.com/box/m.json")).toBe("https://a.com/box/x.jar");
    expect(resolveRef("/tv/x.json", "https://a.com/box/m.json")).toBe("https://a.com/tv/x.json");
    expect(resolveRef("https://cdn.com/x.jar", "https://a.com/box/m.json")).toBe("https://cdn.com/x.jar");
  });

  it("识别内网地址", () => {
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("192.168.1.2")).toBe(true);
    expect(isPrivateHost("10.0.0.5")).toBe(true);
    expect(isPrivateHost("172.16.0.1")).toBe(true);
    expect(isPrivateHost("::1")).toBe(true);
    expect(isPrivateHost("example.com")).toBe(false);
    expect(isPrivateHost("8.8.8.8")).toBe(false);
  });
});

describe("spider", () => {
  it("解析并还原 md5 后缀与 img+ 前缀", () => {
    const parts = splitSpider("img+https://a.com/x.png;md5;abc");
    expect(parts).toEqual({ prefix: "img+", url: "https://a.com/x.png", md5: "abc" });
    expect(joinSpider(parts)).toBe("img+https://a.com/x.png;md5;abc");
  });
});

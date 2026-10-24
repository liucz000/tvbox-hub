import { describe, expect, it } from "vitest";
import { mergeLiveGroups, parseLive, toM3u, toTxt } from "../src/core/live";

describe("live", () => {
  const txt = `# 注释行
CCTV,#genre#
CCTV1,http://a.com/1.m3u8
CCTV1,http://b.com/1.m3u8
卫视,#genre#
湖南卫视,http://a.com/hn.m3u8`;

  const m3u = `#EXTM3U
#EXTINF:-1 tvg-name="CCTV1" group-title="CCTV",CCTV1
http://c.com/1.m3u8
#EXTINF:-1 group-title="央视",CCTV2
http://c.com/2.m3u8`;

  it("解析 DIYP TXT 与 M3U", () => {
    const fromTxt = parseLive(txt);
    expect(fromTxt[0].group).toBe("CCTV");
    expect(fromTxt[0].channels[0].urls).toHaveLength(2);

    const fromM3u = parseLive(m3u);
    expect(fromM3u[0].channels[0].name).toBe("CCTV1");
    expect(fromM3u[0].channels[0].urls[0]).toBe("http://c.com/1.m3u8");
  });

  it("按频道合并多个源并去重线路", () => {
    const merged = mergeLiveGroups([parseLive(txt), parseLive(m3u)]);
    const cctv = merged.find((group) => group.group === "CCTV");
    const cctv1 = cctv?.channels.find((channel) => channel.name === "CCTV1");
    expect(cctv1?.urls).toEqual([
      "http://a.com/1.m3u8",
      "http://b.com/1.m3u8",
      "http://c.com/1.m3u8",
    ]);
  });

  it("能导出 M3U 与 TXT", () => {
    const merged = mergeLiveGroups([parseLive(txt)]);
    expect(toM3u(merged)).toContain("group-title=\"CCTV\",CCTV1");
    expect(toTxt(merged)).toContain("CCTV,#genre#");
  });
});

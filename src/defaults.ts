import type { SourceEntry } from "./types";

/**
 * 内置候选源。也可以在管理后台追加源（写入 KV / 数据文件），无需重新部署。
 * 每个源支持 backups，按顺序回退。
 */
export const DEFAULT_SOURCES: SourceEntry[] = [
  {
    name: "肥猫",
    url: "http://肥猫.net/tv",
    backups: ["http://肥猫.com/"],
  },
  {
    name: "王二小",
    url: "https://9280.kstore.vip/newwex.json",
    backups: ["https://9280.kstore.space/newwex.json"],
  },
  {
    name: "老刘备",
    url: "https://raw.liucn.cc/box/m.json",
  },
  {
    name: "小马",
    url: "https://szyyds.cn/tv/x.json",
  },
  {
    name: "4K小盒子",
    url: "http://xhztv.top/4k.json",
    backups: ["http://xhztv.top/xhz"],
  },
];

/** 直播源：聚合时下载、按频道合并，再输出 /live.m3u 与 /live.txt。 */
export const DEFAULT_LIVE_SOURCES: SourceEntry[] = [
  {
    name: "饭太硬·综合",
    url: "https://raw.githubusercontent.com/qist/tvbox/master/list.txt",
  },
  {
    name: "饭太硬·卫视",
    url: "https://raw.githubusercontent.com/qist/tvbox/master/zb.txt",
  },
  {
    name: "范明明·IPv6",
    url: "https://raw.githubusercontent.com/fanmingming/live/main/tv/m3u/ipv6.m3u",
  },
];

export const APP_NAME = "tvbox-hub";

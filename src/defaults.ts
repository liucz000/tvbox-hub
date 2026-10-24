import type { SourceEntry } from "./types";

/**
 * 内置候选源：汇总 tvbox-ysc-config / tvbox-source / tvbox-hub / tvbox-feed 四个项目
 * 公开使用的上游入口（tvbox-source-aggregator 没有内置上游，源由用户自行添加）。
 *
 * 同一站点的多个镜像合并为一条：可用地址放首位，其余按顺序回退。
 * 也可以在管理后台追加源（写入 KV / 数据文件），无需重新部署。
 */
export const DEFAULT_SOURCES: SourceEntry[] = [
  {
    // tvbox-ysc-config + tvbox-source + tvbox-feed
    name: "肥猫",
    url: "http://肥猫.net/tv",
    backups: [
      "http://肥猫.net/",
      "http://肥猫.com/",
      "https://6296.kstore.vip/facat.json",
      "http://肥猫.live",
      "http://xn--wxtr44c.com/",
    ],
  },
  {
    // tvbox-source（饭太硬·fty，当前唯一可用入口）+ 其余项目的历史入口
    name: "饭太硬",
    url: "https://qist.wyfc.qzz.io/fty.json",
    backups: [
      "http://饭太硬.top/tv",
      "http://www.xn--4kq62z5rby2qupq9ub.com/tv",
      "http://www.饭太硬.net/tv",
      "http://www.饭太硬.cc/tv",
      "http://www.饭太硬.xyz/tv",
      "http://www.xn--sss604efuw.net/tv",
    ],
  },
  {
    // tvbox-ysc-config + tvbox-source（牛二为同一入口）
    name: "王二小",
    url: "https://9280.kstore.vip/newwex.json",
    backups: [
      "https://9280.kstore.space/newwex.json",
      "https://d.kstore.dev/download/9280/wex.json",
      "http://new.王二小放牛娃.top",
    ],
  },
  {
    // tvbox-ysc-config + tvbox-source（ok线路）
    name: "老刘备",
    url: "https://raw.liucn.cc/box/m.json",
  },
  {
    // tvbox-ysc-config
    name: "小马",
    url: "https://szyyds.cn/tv/x.json",
  },
  {
    // tvbox-ysc-config（xhz 即「小盒子单仓」）
    name: "4K小盒子",
    url: "http://xhztv.top/4k.json",
    backups: ["http://xhztv.top/xhz"],
  },
  {
    // tvbox-ysc-config
    name: "讴歌",
    url: "http://tv.nxog.top/m/",
    backups: ["https://欧歌.v.nxog.top/m/"],
  },
  {
    // tvbox-source（拾光·svip）+ tvbox-ysc-config（拾光多仓）
    name: "拾光",
    url: "https://gh-proxy.com/https://raw.githubusercontent.com/xmbjm/svip/refs/heads/main/svip.json",
    backups: ["http://xmbjm.fh4u.org/dc.txt"],
  },
  {
    // tvbox-ysc-config（多仓配置）
    name: "挺好分享",
    url: "http://ztha.top/TVBox/GYCK.json",
  },
  {
    // tvbox-source
    name: "影视仓内置",
    url: "https://raw.githubusercontent.com/jinenge/tvbox/main/tvbox.json",
  },
  {
    // tvbox-source
    name: "菜妮丝",
    url: "https://tv.xn--yhqu5zs87a.top",
  },
  {
    // tvbox-source
    name: "俊哥",
    url: "http://home.jundie.top:81/top98.json",
  },
  {
    // tvbox-source
    name: "二月红",
    url: "https://700sjro44343.vicp.fun/eggp/0211/tv.json",
  },
  {
    // tvbox-source
    name: "潇洒",
    url: "https://qist.wyfc.qzz.io/xiaosa/api.json",
  },
  {
    // tvbox-source
    name: "新接口",
    url: "https://www.iyouhun.com/tv/wex",
  },
  {
    // tvbox-source
    name: "金鹰",
    url: "http://550.3vcn.work/wdjyys.json",
  },
  {
    // tvbox-hub
    name: "纯净电视精选",
    url: "https://raw.githubusercontent.com/sylvan97/tvbox-hub/main/dist/index.json",
  },
  {
    // tvbox-hub
    name: "Qist整合仓",
    url: "https://raw.githubusercontent.com/qist/tvbox/master/0821.json",
  },
  {
    // tvbox-hub
    name: "高天流云",
    url: "https://raw.githubusercontent.com/gaotianliuyun/gao/master/0821.json",
  },
  {
    // tvbox-hub
    name: "运输车",
    url: "https://weixine.net/ysc.json",
  },
];

/**
 * 直播源：聚合时下载、按「分组 → 频道」合并多线路，再输出 /live.m3u 与 /live.txt。
 * 顺序即优先级：中文频道在前，容量上限先满足中文源。
 */
export const DEFAULT_LIVE_SOURCES: SourceEntry[] = [
  // tvbox-source（饭太硬）
  {
    name: "饭太硬·综合直播",
    url: "https://raw.githubusercontent.com/qist/tvbox/master/list.txt",
  },
  {
    name: "饭太硬·卫视直播",
    url: "https://raw.githubusercontent.com/qist/tvbox/master/zb.txt",
  },
  {
    name: "饭太硬·电视直播",
    url: "https://raw.githubusercontent.com/qist/tvbox/master/tvlive.txt",
  },
  // tvbox-source（范明明）
  {
    name: "范明明·IPv6",
    url: "https://raw.githubusercontent.com/fanmingming/live/main/tv/m3u/ipv6.m3u",
  },
  // tvbox-hub（Guovin 探活源）
  {
    name: "Guovin·TXT",
    url: "https://raw.githubusercontent.com/Guovin/iptv-api/gd/output/result.txt",
  },
  {
    name: "Guovin·M3U",
    url: "https://raw.githubusercontent.com/Guovin/iptv-api/gd/output/result.m3u",
  },
  // tvbox-feed
  {
    name: "PG优质网盘",
    url: "https://raw.githubusercontent.com/guxiangbin/tvbox2/main/PG.txt",
  },
  {
    name: "ABC综合",
    url: "https://raw.githubusercontent.com/guxiangbin/tvbox2/main/ABC.txt",
  },
  // tvbox-source
  {
    name: "IPTV4测试源",
    url: "https://raw.githubusercontent.com/songlees355-wq/okay/main/IPTV4测试.txt",
  },
  {
    name: "国外电视台2026",
    url: "https://raw.githubusercontent.com/songlees355-wq/okay/main/国外电视台2026.txt",
  },
  // tvbox-source（iptv-org）
  {
    name: "iptv-org·中国",
    url: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/cn.m3u",
  },
  {
    name: "iptv-org·香港",
    url: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/hk.m3u",
  },
  {
    name: "iptv-org·澳门",
    url: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/mo.m3u",
  },
  {
    name: "iptv-org·台湾",
    url: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/tw.m3u",
  },
  {
    name: "iptv-org·美国",
    url: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us.m3u",
  },
  {
    name: "iptv-org·英国",
    url: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/uk.m3u",
  },
  {
    name: "iptv-org·日本",
    url: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/jp.m3u",
  },
  {
    name: "iptv-org·韩国",
    url: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/kr.m3u",
  },
];

export const APP_NAME = "tvbox-hub";

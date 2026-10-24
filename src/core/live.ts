import { isHttpUrl } from "../util/url";

export interface LiveChannel {
  name: string;
  urls: string[];
}

export interface LiveGroup {
  group: string;
  channels: LiveChannel[];
}

const DEFAULT_GROUP = "其他";
const MAX_URLS_PER_CHANNEL = 6;
const MAX_CHANNELS = 2000;

interface MutableGroup {
  group: string;
  channels: Map<string, { name: string; urls: string[]; seen: Set<string> }>;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function channelKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

function addChannel(
  bucket: Map<string, MutableGroup>,
  groupName: string,
  channelName: string,
  urls: string[],
): void {
  const groupKey = normalizeName(groupName) || DEFAULT_GROUP;
  let group = bucket.get(groupKey);
  if (!group) {
    group = { group: groupKey, channels: new Map() };
    bucket.set(groupKey, group);
  }
  const key = channelKey(channelName);
  if (!key) return;
  let channel = group.channels.get(key);
  if (!channel) {
    channel = { name: normalizeName(channelName), urls: [], seen: new Set() };
    group.channels.set(key, channel);
  }
  for (const url of urls) {
    if (!isHttpUrl(url) || channel.seen.has(url)) continue;
    channel.seen.add(url);
    channel.urls.push(url);
  }
}

function parseM3u(text: string): LiveGroup[] {
  const bucket = new Map<string, MutableGroup>();
  let pending: { name: string; group: string } | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#EXTM3U")) continue;

    if (line.startsWith("#EXTINF")) {
      const attrs: Record<string, string> = {};
      const attrRe = /([\w-]+)="([^"]*)"/g;
      let match: RegExpExecArray | null;
      while ((match = attrRe.exec(line)) !== null) {
        attrs[match[1].toLowerCase()] = match[2];
      }
      const commaIndex = line.lastIndexOf(",");
      const display = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : "";
      pending = {
        name: display || attrs["tvg-name"] || "未命名频道",
        group: attrs["group-title"] || DEFAULT_GROUP,
      };
      continue;
    }

    if (line.startsWith("#EXTGRP:") && pending) {
      pending.group = line.slice(8).trim() || DEFAULT_GROUP;
      continue;
    }

    if (line.startsWith("#")) continue;

    if (pending && isHttpUrl(line)) {
      addChannel(bucket, pending.group, pending.name, [line]);
      pending = null;
    }
  }

  return finalize(bucket);
}

function parseTxt(text: string): LiveGroup[] {
  const bucket = new Map<string, MutableGroup>();
  let groupName = DEFAULT_GROUP;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const comma = line.indexOf(",");
    if (comma <= 0) continue;
    const left = line.slice(0, comma).trim();
    const right = line.slice(comma + 1).trim();

    if (right === "#genre#" || right.startsWith("#genre#")) {
      groupName = left || DEFAULT_GROUP;
      continue;
    }

    const urls = right
      .split("#")
      .map((part) => part.trim())
      .filter((part) => isHttpUrl(part));
    if (urls.length > 0) addChannel(bucket, groupName, left, urls);
  }

  return finalize(bucket);
}

function finalize(bucket: Map<string, MutableGroup>): LiveGroup[] {
  const groups: LiveGroup[] = [];
  for (const item of bucket.values()) {
    const channels: LiveChannel[] = [];
    for (const channel of item.channels.values()) {
      if (channel.urls.length === 0) continue;
      channels.push({
        name: channel.name,
        urls: channel.urls.slice(0, MAX_URLS_PER_CHANNEL),
      });
    }
    if (channels.length > 0) groups.push({ group: item.group, channels });
  }
  return groups;
}

export function parseLive(text: string): LiveGroup[] {
  const content = text.replace(/^\uFEFF/, "").trim();
  if (!content) return [];
  if (content.toUpperCase().startsWith("#EXTM3U")) return parseM3u(content);
  return parseTxt(content);
}

/** 按「分组 → 频道」合并多个直播源，同频道保留多个线路。 */
export function mergeLiveGroups(inputs: LiveGroup[][]): LiveGroup[] {
  const bucket = new Map<string, MutableGroup>();

  for (const groups of inputs) {
    for (const group of groups) {
      for (const channel of group.channels) {
        addChannel(bucket, group.group, channel.name, channel.urls);
      }
    }
  }

  const merged = finalize(bucket);
  const capped: LiveGroup[] = [];
  let total = 0;
  for (const group of merged) {
    const channels: LiveChannel[] = [];
    for (const channel of group.channels) {
      if (total >= MAX_CHANNELS) break;
      channels.push(channel);
      total++;
    }
    if (channels.length > 0) capped.push({ group: group.group, channels });
  }
  return capped;
}

export function toM3u(groups: LiveGroup[]): string {
  const lines: string[] = ["#EXTM3U"];
  for (const group of groups) {
    for (const channel of group.channels) {
      for (const url of channel.urls) {
        lines.push(
          `#EXTINF:-1 tvg-name="${channel.name}" group-title="${group.group}",${channel.name}`,
        );
        lines.push(url);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export function toTxt(groups: LiveGroup[]): string {
  const lines: string[] = [];
  for (const group of groups) {
    lines.push(`${group.group},#genre#`);
    for (const channel of group.channels) {
      for (const url of channel.urls) {
        lines.push(`${channel.name},${url}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export function countChannels(groups: LiveGroup[]): number {
  return groups.reduce((sum, group) => sum + group.channels.length, 0);
}

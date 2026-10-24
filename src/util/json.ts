/**
 * 上游配置经常带 BOM、// 注释、块注释、尾逗号、JSONP 包装，甚至前后夹带说明文字。
 * 这里做尽量保守的容错解析，不引入 eval。
 */

const NOT_FOUND = Symbol("not-found");

function tryParse(text: string): unknown | typeof NOT_FOUND {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return NOT_FOUND;
  }
}

function stripComments(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

function stripTrailingCommas(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      if (input[j] === "}" || input[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

function extractBalanced(input: string): string | null {
  const start = input.search(/[{[]/);
  if (start < 0) return null;

  const opener = input[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

export function parseLooseJson(raw: string): unknown | null {
  if (!raw) return null;
  let text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return null;

  const jsonp = text.match(/^[\w$.]+\s*\(([\s\S]*)\)\s*;?$/);
  if (jsonp) text = jsonp[1].trim();

  const direct = tryParse(text);
  if (direct !== NOT_FOUND) return direct;

  const cleaned = stripTrailingCommas(stripComments(text));
  const parsed = tryParse(cleaned);
  if (parsed !== NOT_FOUND) return parsed;

  const extracted = extractBalanced(cleaned);
  if (extracted) {
    const result = tryParse(extracted);
    if (result !== NOT_FOUND) return result;
  }
  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

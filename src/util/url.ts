const PRIVATE_PREFIXES = [
  "10.",
  "127.",
  "0.",
  "169.254.",
  "192.168.",
  "198.18.",
  "198.19.",
];

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

/** 拦截回环、内网、链路本地、CGNAT 等地址，避免把服务变成 SSRF 跳板。 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;

  const v4 = parseIpv4(host);
  if (v4) {
    if (PRIVATE_PREFIXES.some((prefix) => host.startsWith(prefix))) return true;
    if (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) return true;
    if (v4[0] === 100 && v4[1] >= 64 && v4[1] <= 127) return true;
    if (v4[0] === 192 && v4[1] === 0 && v4[2] === 0) return true;
    return false;
  }

  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")) return true;
  return false;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** WHATWG URL 会自动把中文域名转成 punycode，并规范化路径。 */
export function toAsciiUrl(raw: string): string {
  const text = raw.trim();
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return text;
    return url.href;
  } catch {
    return text;
  }
}

export function isRef(value: string): boolean {
  return value.startsWith("./") || value.startsWith("../") || value.startsWith("/");
}

/** 把上游配置里的相对地址按源地址补全。 */
export function resolveRef(value: string, baseUrl: string): string {
  const text = value.trim();
  if (!text) return text;
  if (isHttpUrl(text)) return toAsciiUrl(text);
  if (text.startsWith("//")) {
    try {
      return toAsciiUrl(`${new URL(baseUrl).protocol}${text}`);
    } catch {
      return text;
    }
  }
  if (!isRef(text)) return text;
  try {
    return toAsciiUrl(new URL(text, baseUrl).href);
  } catch {
    return text;
  }
}

export function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export async function sha256Hex(input: string | ArrayBuffer, bytes = 8): Promise<string> {
  const data =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, bytes * 2);
}

export function isValidMd5(value: string): boolean {
  return /^[a-f0-9]{32}$/i.test(value);
}

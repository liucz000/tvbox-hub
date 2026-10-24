export interface SpiderParts {
  prefix: string;
  url: string;
  md5: string | null;
}

/**
 * TVBox 的 spider 字符串可能是：
 *   url
 *   url;md5;hash
 *   img+url;md5;hash
 */
export function splitSpider(input: string): SpiderParts {
  let rest = input.trim();
  let prefix = "";
  if (rest.startsWith("img+")) {
    prefix = "img+";
    rest = rest.slice(4);
  }
  const index = rest.indexOf(";md5;");
  if (index > 0) {
    return {
      prefix,
      url: rest.slice(0, index).trim(),
      md5: rest.slice(index + 5).trim() || null,
    };
  }
  return { prefix, url: rest, md5: null };
}

export function joinSpider(parts: SpiderParts): string {
  const base = `${parts.prefix}${parts.url}`;
  return parts.md5 ? `${base};md5;${parts.md5}` : base;
}

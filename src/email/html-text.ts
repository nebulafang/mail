const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  zwnj: "",
  zwj: "",
  shy: "",
  middot: "·",
  bull: "•",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  yen: "¥",
  euro: "€",
  pound: "£",
  times: "×",
};

function decodeEntity(entity: string, body: string) {
  if (body[0] !== "#") return ENTITIES[body] ?? ENTITIES[body.toLowerCase()] ?? entity;
  const hex = body[1] === "x" || body[1] === "X";
  const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return entity;
  try {
    return String.fromCodePoint(code);
  } catch {
    return entity;
  }
}

export function htmlToText(html: string) {
  return (
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(head|style|script|title|template|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/\s+/g, " ")
      .replace(/<br\b[^>]*>/gi, "\n")
      .replace(/<\/(td|th)\s*>/gi, " ")
      .replace(/<\/?(p|div|tr|table|ul|ol|li|h[1-6]|blockquote|pre|section|article|header|footer|hr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, decodeEntity)
      .replace(/[ \t ]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

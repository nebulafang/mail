const KEYWORD =
  /验证码|校验码|动态码|确认码|激活码|安全码|登录码|verification code|security code|login code|one[- ]time (?:pass)?code|passcode|otp|\bcode\b|\bpin\b/gi;
const TOKEN = /(?<![A-Za-z0-9])[A-Za-z0-9]{4,8}(?![A-Za-z0-9])/g;

function isCode(token: string) {
  if (/^(19|20)\d{2}$/.test(token)) return false;
  return /^\d+$/.test(token) || (/\d/.test(token) && /^[A-Z0-9]+$/.test(token));
}

function firstCodeIn(text: string) {
  for (const match of text.matchAll(TOKEN)) if (isCode(match[0])) return match[0];
  return null;
}

export function extractCode(subject: string | null | undefined, text: string | null | undefined): string | null {
  for (const source of [subject ?? "", (text ?? "").slice(0, 3000)]) {
    for (const keyword of source.matchAll(KEYWORD)) {
      const start = keyword.index ?? 0;
      const after = firstCodeIn(source.slice(start + keyword[0].length, start + keyword[0].length + 40));
      if (after) return after;
      const before = firstCodeIn(source.slice(Math.max(0, start - 20), start));
      if (before) return before;
    }
  }
  return subject?.match(/(?<!\d)\d{6}(?!\d)/)?.[0] ?? null;
}

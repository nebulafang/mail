export type ActionLink = { href: string; label: string; host: string; kind: "verify" | "login" | "reset" | "open" };

const GOOD: [RegExp, ActionLink["kind"], number][] = [
  [/verif|验证|確認|确认|confirm|validate|activat|激活|启用|complete.?registration|完成注册/i, "verify", 6],
  [/magic|sign.?in|log.?in|登录|登入|access.?your|continue/i, "login", 4],
  [/reset|重置|找回|change.?password|修改密码/i, "reset", 5],
  [/get.?started|开始使用|join|accept|接受邀请|invite|立即/i, "open", 2],
];

const BAD =
  /unsubscribe|退订|取消订阅|privacy|隐私|terms|条款|help|support|帮助|preferences|facebook|twitter|x\.com|instagram|linkedin|youtube|weibo|weixin|apple\.com\/app|play\.google|mailto:|tel:|view.?in.?browser|在浏览器中查看|report|举报/i;

function scoreOf(text: string, href: string) {
  if (BAD.test(text) || BAD.test(href)) return null;
  let best: { kind: ActionLink["kind"]; score: number } | null = null;
  for (const [re, kind, weight] of GOOD) {
    const s = (re.test(text) ? weight * 2 : 0) + (re.test(href) ? weight : 0);
    if (s && (!best || s > best.score)) best = { kind, score: s };
  }
  if (best && /token|code|key|auth|otp|signature|sig=|[?&](t|k)=/i.test(href)) best.score += 3;
  return best;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function findActionLink(html: string | null, text: string | null): ActionLink | null {
  const candidates: { href: string; text: string }[] = [];
  if (html && typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("a[href]").forEach((a) => {
      candidates.push({ href: a.getAttribute("href") ?? "", text: clean(a.textContent || a.getAttribute("title") || "") });
    });
  } else if (text) {
    for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/g)) candidates.push({ href: match[0], text: "" });
  }
  let best: (ActionLink & { score: number }) | null = null;
  for (const c of candidates) {
    if (!/^https?:\/\//i.test(c.href)) continue;
    const s = scoreOf(c.text, c.href);
    if (!s) continue;
    if (!best || s.score > best.score) {
      let host = "";
      try {
        host = new URL(c.href).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      best = { href: c.href, label: c.text.slice(0, 40), host, kind: s.kind, score: s.score };
    }
  }
  if (!best || best.score < 4) return null;
  return { href: best.href, label: best.label, host: best.host, kind: best.kind };
}

export function linkify(text: string) {
  const parts: ({ type: "text"; value: string } | { type: "link"; value: string; href: string })[] = [];
  const re = /(https?:\/\/[^\s<>"')]+)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ type: "text", value: text.slice(last, i) });
    const value = m[0].replace(/[.,;:!?。，；：！？]+$/, "");
    parts.push({ type: "link", value, href: m[1] ? value : `mailto:${value}` });
    last = i + value.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

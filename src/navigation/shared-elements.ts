import { zoomMotion, zoomPhases } from "@/design-system/motion";

export type Card = { x: number; y: number; k: number };
type Flight = { el: HTMLElement; frames: Keyframe[] };
type Reveal = { el: HTMLElement; from: number; to: number };
type Settle = { el: HTMLElement; from: Keyframe; to: Keyframe };
export type Shared = { flights: Flight[]; reveals: Reveal[]; settles: Settle[] };

export const NO_SHARED: Shared = { flights: [], reveals: [], settles: [] };

const mix = (from: number, to: number, p: number) => from + (to - from) * p;
const at = (x: number, y: number, sx: number, sy = sx) =>
  `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
const REST = at(0, 0, 1);
const SOLID = 0.95;

type Point = { x: number; y: number };

function picture(el: HTMLElement, twin: HTMLElement) {
  const img = el.querySelector("img");
  const other = twin.querySelector("img");
  if (!img) return null;
  const sized = img.naturalWidth ? img : other?.naturalWidth && other.src === img.src ? other : null;
  if (!sized?.naturalHeight) return null;
  const fit = getComputedStyle(img).objectFit;
  if (fit !== "cover" && fit !== "contain") return null;
  const r = img.getBoundingClientRect();
  const scale = (fit === "cover" ? Math.max : Math.min)(r.width / sized.naturalWidth, r.height / sized.naturalHeight);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: sized.naturalWidth * scale };
}

function poseOf(el: HTMLElement): Keyframe {
  const { opacity, transform } = getComputedStyle(el);
  return { opacity, transform };
}

function opacityWithin(el: HTMLElement, root: HTMLElement) {
  let opacity = 1;
  for (let p = el.parentElement; p && p !== root; p = p.parentElement) opacity *= parseFloat(getComputedStyle(p).opacity);
  return opacity;
}

export function measureShared(source: HTMLElement, page: HTMLElement, card: Card, view: DOMRect): Shared {
  const px = (x: number) => view.left + (x - card.x) / card.k;
  const py = (y: number) => view.top + (y - card.y) / card.k;
  const flights: Flight[] = [];
  const drifting = [...page.querySelectorAll<HTMLElement>("[data-zoom-settle]")].map((el) => ({ el, from: poseOf(el) }));
  for (const { el } of drifting) el.style.animation = "none";

  for (const src of source.querySelectorAll<HTMLElement>("[data-shared]")) {
    const s = src.getBoundingClientRect();
    if (!s.width || !s.height) continue;
    for (const el of page.querySelectorAll<HTMLElement>(`[data-shared="${src.dataset.shared}"]`)) {
      const d = el.getBoundingClientRect();
      if (!d.width || !d.height || d.bottom <= view.top || d.top >= view.bottom) continue;
      const a = d.width / (el.offsetWidth || d.width);
      const pin = (u: number, anchor: Point, target: Point) => ({
        u,
        x: (px(target.x) - d.left - u * (anchor.x - d.left)) / a,
        y: (py(target.y) - d.top - u * (anchor.y - d.top)) / a,
      });

      if (src.dataset.shared === "title") {
        const from = parseFloat(getComputedStyle(src).fontSize) * (s.width / (src.offsetWidth || s.width));
        const to = parseFloat(getComputedStyle(el).fontSize) * a;
        const { u, x, y } = pin(from / card.k / to, { x: d.left, y: d.top }, { x: s.left, y: s.top });
        if (Number.isFinite(u) && u > 0) flights.push({ el, frames: [{ transform: at(x, y, u) }, { transform: REST }] });
        continue;
      }

      const box = { x: (px(s.left) - d.left) / a, y: (py(s.top) - d.top) / a, sx: s.width / card.k / d.width, sy: s.height / card.k / d.height };
      const from = picture(src, el);
      const to = picture(el, src);
      const content = el.firstElementChild;
      if (!from || !to || !(content instanceof HTMLElement)) {
        flights.push({ el, frames: [{ transform: at(box.x, box.y, box.sx, box.sy) }, { transform: REST }] });
        continue;
      }

      const { u, x, y } = pin(from.w / card.k / to.w, to, from);
      const outer: Keyframe[] = [];
      const inner: Keyframe[] = [];
      for (let i = 0; i <= zoomMotion.morphSteps; i++) {
        const p = i / zoomMotion.morphSteps;
        const tx = mix(box.x, 0, p);
        const ty = mix(box.y, 0, p);
        const sx = mix(box.sx, 1, p);
        const sy = mix(box.sy, 1, p);
        const v = mix(u, 1, p);
        outer.push({ transform: at(tx, ty, sx, sy) });
        inner.push({ transform: at((mix(x, 0, p) - tx) / sx, (mix(y, 0, p) - ty) / sy, v / sx, v / sy) });
      }
      flights.push({ el, frames: outer }, { el: content, frames: inner });
    }
  }

  const settles = drifting
    .map(({ el, from }) => ({ el, from, to: poseOf(el) }))
    .filter(({ from, to }) => flights.length > 0 && (from.opacity !== to.opacity || from.transform !== to.transform));
  for (const { el } of drifting) el.style.animation = "";

  const reveals: Reveal[] = [];
  for (const el of page.querySelectorAll<HTMLElement>("[data-zoom-fade]")) {
    const phase = zoomPhases[el.dataset.zoomFade ?? ""];
    if (!phase || (!phase.always && !flights.length)) continue;
    reveals.push({ el, from: phase.span[0], to: phase.span[1] });
  }
  if (!flights.length && !reveals.length) return NO_SHARED;
  return { flights, reveals, settles };
}

export function stageShared({ flights, reveals, settles }: Shared) {
  for (const { el } of flights) {
    el.style.transformOrigin = "0 0";
    el.style.willChange = "transform";
  }
  for (const { el } of reveals) el.style.willChange = "opacity";
  for (const { el } of settles) el.style.willChange = "transform, opacity";
}

export function clearShared({ flights, reveals, settles }: Shared) {
  for (const { el } of flights) {
    el.style.transformOrigin = "";
    el.style.willChange = "";
  }
  for (const { el } of [...reveals, ...settles]) el.style.willChange = "";
}

export function decoded({ flights }: Shared) {
  const images = flights.flatMap((f) => [...f.el.querySelectorAll("img")]);
  if (!images.length) return Promise.resolve();
  return Promise.race([
    Promise.allSettled(images.map((img) => img.decode())),
    new Promise((resolve) => setTimeout(resolve, zoomMotion.decodeWait)),
  ]).then(() => {});
}

type Piece = {
  node: HTMLElement;
  from: string;
  to: string;
  fade: "in" | "out" | null;
  blend: [HTMLElement, HTMLElement] | null;
};
export type Relay = { src: HTMLElement; el: HTMLElement; pieces: Piece[]; hide: Animation | null };

type Glyph = { rect: DOMRect | null; line: number };

function textOf(el: HTMLElement) {
  const node = el.firstChild;
  return el.childNodes.length === 1 && node instanceof Text ? node : null;
}

function glyphsOf(node: Text): Glyph[] {
  const range = document.createRange();
  const out: Glyph[] = [];
  let offset = 0;
  let line = 0;
  let last: DOMRect | null = null;
  for (const ch of node.data) {
    range.setStart(node, offset);
    range.setEnd(node, (offset += ch.length));
    const r = /\s/.test(ch) ? undefined : range.getClientRects()[0];
    const rect = r?.width ? r : null;
    if (rect) {
      if (last && rect.top > last.top + last.height / 2) line++;
      last = rect;
    }
    out.push({ rect, line });
  }
  return out;
}

function typeOf(el: HTMLElement, size: number) {
  const cs = getComputedStyle(el);
  const tracking = parseFloat(cs.letterSpacing);
  return {
    fontFamily: cs.fontFamily,
    fontWeight: cs.fontWeight,
    fontStyle: cs.fontStyle,
    fontFeatureSettings: cs.fontFeatureSettings,
    fontVariationSettings: cs.fontVariationSettings,
    letterSpacing: Number.isFinite(tracking) ? `${(tracking * size) / parseFloat(cs.fontSize)}px` : "normal",
    color: cs.color,
    textShadow: cs.textShadow,
  };
}

export function planRelay(src: HTMLElement, el: HTMLElement, page: HTMLElement, view: DOMRect, atRest: <T>(read: () => T) => T): Relay | null {
  const a = textOf(el);
  const b = textOf(src);
  if (!a || !b || !a.data.trim() || a.data !== b.data) return null;
  const box = el.getBoundingClientRect();
  if (!box.width || box.bottom <= view.top || box.top >= view.bottom) return null;
  if (!(opacityWithin(el, page) > SOLID)) return null;

  const from = glyphsOf(a);
  const { to, card } = atRest(() => ({ to: glyphsOf(b), card: src.getBoundingClientRect() }));
  const first = from.find((g) => g.rect)?.rect;
  if (!first || !card.width || !to.some((g) => g.rect)) return null;

  const sizeA = parseFloat(getComputedStyle(el).fontSize) * (box.width / (el.offsetWidth || box.width));
  const sizeB = parseFloat(getComputedStyle(src).fontSize) * (card.width / (src.offsetWidth || card.width));
  const s = sizeB / sizeA;
  const typeA = typeOf(el, sizeA);
  const typeB = typeOf(src, sizeA);

  const gone = to.map((g, i) => !!from[i].rect && (!g.rect || g.rect.top >= card.bottom - 1));
  let dots: { at: Point; line: number } | null = null;
  if (gone.some(Boolean) && !gone.every(Boolean)) {
    const line = Math.max(...to.filter((_, i) => !gone[i]).map((g) => g.line));
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) ctx.font = `${typeB.fontStyle} ${typeB.fontWeight} ${sizeB}px ${typeB.fontFamily}`;
    const width = ctx?.measureText("…").width ?? sizeB;
    let edge: DOMRect | undefined;
    to.forEach((g, i) => {
      if (gone[i] || g.line !== line || !g.rect) return;
      if (g.rect.right > card.right - width + 0.5) gone[i] = true;
      else edge = g.rect;
    });
    const kept = edge as DOMRect | undefined;
    if (kept) dots = { at: { x: kept.right - view.left, y: kept.top - view.top }, line };
  }

  type Run = { text: string; a: Point; b: Point; lineA: number; lineB: number; gone: boolean; head: boolean };
  const runs: Run[] = [];
  let key = "";
  [...a.data].forEach((ch, i) => {
    const ra = from[i].rect;
    const rb = to[i].rect;
    const current = runs[runs.length - 1];
    if (!ra) {
      if (current) current.text += ch;
      return;
    }
    const next = `${from[i].line}|${gone[i] ? "x" : to[i].line}`;
    if (current && next === key) {
      current.text += ch;
      return;
    }
    key = next;
    const at = { x: ra.left - view.left, y: ra.top - view.top };
    runs.push({
      text: ch,
      a: at,
      b: rb ? { x: rb.left - view.left, y: rb.top - view.top } : at,
      lineA: from[i].line,
      lineB: to[i].line,
      gone: gone[i],
      head: !current || current.lineA !== from[i].line,
    });
  });
  const heads = runs.filter((r) => r.head && !r.gone);
  if (!heads.length) return null;

  const place = (p: Point, scale: number) => `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  const anchorFor = (lineB: number, order: number) =>
    heads.findLast((h) => h.lineB === lineB && runs.indexOf(h) < order) ??
    heads.find((h) => h.lineB === lineB) ??
    heads.findLast((h) => runs.indexOf(h) < order) ??
    heads[0];
  const arriving = (to: Point, lineB: number, order: number) => {
    const g = anchorFor(lineB, order);
    return { x: g.a.x + (to.x - g.b.x) / s, y: g.a.y + (to.y - g.b.y) / s };
  };

  const make = (text: string, styles: ReturnType<typeof typeOf>[]) => {
    const node = document.createElement("div");
    Object.assign(node.style, {
      position: "absolute",
      left: "0",
      top: "0",
      whiteSpace: "pre",
      fontSize: `${sizeA}px`,
      lineHeight: `${first.height}px`,
      transformOrigin: "0 0",
      willChange: "transform, opacity",
    });
    const parts = styles.map((style, i) => {
      const span = document.createElement("span");
      span.textContent = text;
      Object.assign(span.style, style, { willChange: "opacity" }, i ? { position: "absolute", left: "0", top: "0" } : { display: "block" });
      node.appendChild(span);
      return span;
    });
    return { node, parts };
  };

  const pieces: Piece[] = [];
  runs.forEach((r, order) => {
    if (r.head) {
      const { node, parts } = make(r.text, r.gone ? [typeA] : [typeA, typeB]);
      pieces.push({ node, from: place(r.a, 1), to: place(r.b, s), fade: r.gone ? "out" : null, blend: r.gone ? null : [parts[0], parts[1]] });
      return;
    }
    const head = runs.findLast((h, i) => i < order && h.head)!;
    const leave = { x: head.b.x + (r.a.x - head.a.x) * s, y: head.b.y + (r.a.y - head.a.y) * s };
    pieces.push({ node: make(r.text, [typeA]).node, from: place(r.a, 1), to: place(leave, s), fade: "out", blend: null });
    if (!r.gone) pieces.push({ node: make(r.text, [typeB]).node, from: place(arriving(r.b, r.lineB, order), 1), to: place(r.b, s), fade: "in", blend: null });
  });
  if (dots) pieces.push({ node: make("…", [typeB]).node, from: place(arriving(dots.at, dots.line, runs.length), 1), to: place(dots.at, s), fade: "in", blend: null });
  return { src, el, pieces, hide: null };
}

export function mountRelay(relay: Relay, host: HTMLElement) {
  for (const p of relay.pieces) {
    p.node.style.transform = p.from;
    if (p.fade === "in") p.node.style.opacity = "0";
    if (p.blend) p.blend[1].style.opacity = "0";
    host.appendChild(p.node);
  }
  relay.el.style.opacity = "0";
  relay.hide = relay.src.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 80, fill: "forwards" });
}

export function endRelay(relay: Relay | null) {
  if (!relay) return;
  for (const p of relay.pieces) p.node.remove();
  relay.hide?.cancel();
  relay.el.style.opacity = "";
}

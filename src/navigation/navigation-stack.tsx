"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { SceneBackdrop } from "@/components/scene";
import { gesture, PUSH_DIM, PUSH_PARALLAX, zoomMotion } from "@/design-system/motion";
import { springTiming, translateY } from "@/design-system/timing";
import { useEnvironment } from "@/environment/environment";
import { iosSpring, run } from "@/lib/press-spring";
import { cn } from "@/lib/utils";
import { RouteContext, useNavigator } from "./context";
import { clearShared, decoded, endRelay, measureShared, mountRelay, NO_SHARED, planRelay, stageShared, type Card, type Shared } from "./shared-elements";
import type { Route } from "./types";

type Part = "el" | "clipA" | "clipB" | "body" | "dim" | "shadow";
type Layer = Record<Part, HTMLDivElement | null> & {
  x: number;
  s: number;
  rho: number;
  a: number;
  b: number;
  source: HTMLElement | null;
  warm: Promise<void> | null;
};
type Box = { w: number; h: number };
type Frame = { transform: string; rho: number; b: number; card: Card };

const PRIME_MS = 1500;
const FADE: KeyframeAnimationOptions = { duration: 200, easing: "ease-out" };
const ZOOM_REST = { restDelta: 0.001, restSpeed: 0.01 };
const LINEAR_FALLBACK_MS = 420;
const settled = (anims: (Animation | undefined)[]) =>
  Promise.all(anims.filter((a): a is Animation => !!a).map((a) => a.finished)).then(
    () => true,
    () => false,
  );

const lowPerf = () => document.documentElement.dataset.perf === "low";
const SEE_THROUGH = "0.999";
const WARM_OPACITY = "0.01";

function transformOf(x: number, s: number, box: Box) {
  if (!x && s === 1) return "none";
  return `translate3d(${x + ((1 - s) * box.w) / 2}px, ${((1 - s) * box.h) / 2}px, 0) scale(${s})`;
}

function zoomSpring(kind: "open" | "close" | "cancel", velocity = 0) {
  const { response, damping } = zoomMotion[kind];
  const spring = run(0, 1, velocity, iosSpring(response, damping), ZOOM_REST);
  const exact = spring.easing.startsWith("linear");
  const duration = exact ? spring.duration : Math.min(spring.duration, LINEAR_FALLBACK_MS);
  const reach = (p: number) => {
    if (!exact) return duration * p ** 2.5;
    for (let t = 0; t < duration; t += 4) if (spring.at(t).value >= p) return t;
    return duration;
  };
  const span = (from: number, to: number) => {
    const delay = reach(from);
    return { delay, duration: Math.max(1, reach(to) - delay), easing: "linear" };
  };
  const timing: KeyframeAnimationOptions = { easing: spring.easing, duration };
  return { timing, span };
}

function atRest<T>(layers: (Layer | undefined)[], read: () => T): T {
  const els = layers.flatMap((l) => (l?.el ? [l.el] : []));
  const saved = els.map((el) => el.style.transform);
  for (const el of els) el.style.transform = "none";
  const result = read();
  els.forEach((el, i) => (el.style.transform = saved[i]));
  return result;
}

function place(l: Layer, x: number, s: number, box: Box) {
  l.x = x;
  l.s = s;
  if (l.el) l.el.style.transform = transformOf(x, s, box);
}

function move(l: Layer, x: number, s: number, box: Box, timing: KeyframeAnimationOptions) {
  const from = transformOf(l.x, l.s, box);
  const to = transformOf(x, s, box);
  place(l, x, s, box);
  if (!l.el || from === to) return undefined;
  return l.el.animate([{ transform: from }, { transform: to }], timing);
}

function clip(l: Layer, rho: number, a: number, b: number) {
  const on = rho > 0;
  if (!on && !l.rho) return;
  if (l.clipA && l.clipB && l.body && l.rho !== rho) {
    const pad = on ? `${2 * rho}px` : "";
    for (const el of [l.clipA, l.clipB]) {
      el.style.overflow = on ? "hidden" : "";
      el.style.borderRadius = on ? `${rho}px` : "";
    }
    for (const el of [l.clipA, l.clipB, l.body]) el.style.willChange = on ? "transform" : "";
    l.clipA.style.bottom = on ? `-${pad}` : "";
    l.clipB.style.top = on ? `-${pad}` : "";
    l.clipB.style.bottom = pad;
    l.body.style.top = pad;
  }
  l.rho = rho;
  l.a = on ? a : 0;
  l.b = on ? b : 0;
  if (l.clipA) l.clipA.style.transform = on ? translateY(l.a) : "";
  if (l.clipB) l.clipB.style.transform = on ? translateY(l.b - l.a) : "";
  if (l.body) l.body.style.transform = on ? translateY(-l.b) : "";
}

function clipMove(l: Layer, a: number, b: number, mid: number, aMid: number, timing: KeyframeAnimationOptions) {
  const as = [l.a, aMid, a];
  const bs = [l.b, l.b + (b - l.b) * mid, b];
  const offsets = [0, mid, 1];
  const frames = (y: (i: number) => number) => offsets.map((offset, i) => ({ transform: translateY(y(i)), offset }));
  clip(l, l.rho, a, b);
  return [
    l.clipA?.animate(frames((i) => as[i]), timing),
    l.clipB?.animate(frames((i) => bs[i] - as[i]), timing),
    l.body?.animate(frames((i) => -bs[i]), timing),
  ];
}

function fadeTo(el: HTMLElement | null, to: number, timing: KeyframeAnimationOptions) {
  if (!el) return undefined;
  const from = getComputedStyle(el).opacity;
  el.style.opacity = String(to);
  return el.animate([{ opacity: from }, { opacity: String(to) }], timing);
}

function warm(l: Layer | undefined) {
  if (!l?.el) return Promise.resolve();
  if (!l.warm) {
    l.el.style.visibility = "visible";
    l.el.style.willChange = "transform";
    l.warm = new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  return l.warm;
}

function cool(l: Layer | undefined) {
  if (!l) return;
  l.warm = null;
  if (!l.el) return;
  l.el.style.visibility = "";
  l.el.style.willChange = "";
}

function seeThrough(l: Layer | undefined, on: boolean) {
  if (l?.el) l.el.style.opacity = on ? SEE_THROUGH : "";
}

function lift(l: Layer | undefined, on: boolean) {
  if (l?.shadow) l.shadow.style.opacity = on ? "1" : "0";
}

function zoomFrame(source: HTMLElement | null, container: HTMLElement, under: Layer | undefined, box: Box): Frame | null {
  if (!source?.isConnected || !under) return null;
  const [sr, cr] = atRest([under], () => [source.getBoundingClientRect(), container.getBoundingClientRect()]);
  const left = sr.left - cr.left;
  const top = sr.top - cr.top;
  if (sr.width < 24 || sr.height < 24 || top + sr.height < 0 || top > box.h) return null;
  const k = sr.width / box.w;
  // 几乎和屏幕一样宽又很高的卡片，缩放只剩“略缩小 + 往下挪”，退出时会和下层页面叠在一起；
  // 没有共享元素可以飞的话，改走标准的推入 / 返回
  const { width: wideShare, height: tallShare } = zoomMotion.maxSource;
  if (k > wideShare && sr.height > box.h * tallShare && !source.querySelector("[data-shared]")) return null;
  const radius = Math.min(parseFloat(getComputedStyle(source).borderTopLeftRadius) || zoomMotion.fallbackRadius, sr.width / 2, sr.height / 2);
  return {
    transform: `translate3d(${left}px, ${top}px, 0) scale(${k})`,
    rho: radius / k,
    b: -Math.max(0, box.h - sr.height / k),
    card: { x: sr.left, y: sr.top, k },
  };
}

const fading = (closing: boolean) => ({ opacity: closing ? [1, 0] : [0, 1] });

function zoomShared(frame: Frame | null, top: Layer, under: Layer | undefined, container: HTMLElement): Shared {
  const { source, el } = top;
  if (!frame || !source || !el) return NO_SHARED;
  return atRest([top, under], () => measureShared(source, el, frame.card, container.getBoundingClientRect()));
}

const SWIPE_OWNERS = "[data-swipe-owner], input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='slider']";

function ownsSwipe(target: Element | null, root: HTMLElement) {
  const owner = target?.closest(SWIPE_OWNERS);
  if (owner && owner !== root && root.contains(owner)) return true;
  for (let el = target; el && el !== root; el = el.parentElement) {
    if (el.scrollLeft > 0 && el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

function refusesTouch(target: Element | null, root: HTMLElement) {
  for (let el = target; el && el !== root; el = el.parentElement) {
    if (getComputedStyle(el).touchAction === "none") return true;
  }
  return false;
}

export function NavigationStack({ tab }: { tab: string }) {
  "use no memo";
  const { store, config, primers } = useNavigator();
  const env = useEnvironment();
  const routes = useStore(store, (s) => s.stacks[tab]);
  const change = useStore(store, (s) => s.change);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const primed = useRef<string | null>(null);
  const settling = useRef(false);
  const [layers] = useState(() => new Map<string, Layer>());
  const layer = (key: string) => {
    let l = layers.get(key);
    if (!l) {
      l = { el: null, clipA: null, clipB: null, body: null, dim: null, shadow: null, x: 0, s: 1, rho: 0, a: 0, b: 0, source: null, warm: null };
      layers.set(key, l);
    }
    return l;
  };
  const register = (key: string, part: Part, el: HTMLDivElement | null) => {
    layer(key)[part] = el;
  };
  const box = (): Box => ({ w: containerRef.current?.clientWidth ?? 0, h: containerRef.current?.clientHeight ?? 0 });
  const restUnder = (l: Layer, b: Box) =>
    l.source ? { x: 0, s: zoomMotion.underScale } : { x: -b.w * PUSH_PARALLAX, s: 1 };

  const moving = useRef(0);
  const hold = () => {
    if (moving.current++ === 0) containerRef.current?.setAttribute("data-transitioning", "");
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--moving.current === 0) containerRef.current?.removeAttribute("data-transitioning");
    };
  };

  const [prevRoutes, setPrevRoutes] = useState(routes);
  const [exiting, setExiting] = useState<Route | null>(null);
  const [entering, setEntering] = useState<string | null>(null);
  if (prevRoutes !== routes) {
    setPrevRoutes(routes);
    const animated = !!change?.animated && change.tab === tab;
    const removed = prevRoutes.filter((r) => !routes.some((n) => n.key === r.key));
    const added = routes.filter((r) => !prevRoutes.some((p) => p.key === r.key));
    if (animated && added.length === 1 && removed.length === 0) {
      layer(added[0].key).source = change?.kind === "push" ? (change.source ?? null) : null;
      setEntering(added[0].key);
    } else if (animated && removed.length > 0 && added.length === 0) {
      setExiting(removed[removed.length - 1]);
    }
    if (removed.some((r) => r.key === entering)) setEntering(null);
  }

  const rendered = exiting ? [...routes, exiting] : routes;
  const topKey = rendered[rendered.length - 1].key;
  const underKey = rendered[rendered.length - 2]?.key;

  useLayoutEffect(() => {
    if (!entering) return;
    const release = hold();
    const index = routes.findIndex((r) => r.key === entering);
    const top = layer(entering);
    const under = routes[index - 1] ? layer(routes[index - 1].key) : undefined;
    const b = box();
    const container = containerRef.current!;
    let anims: (Animation | undefined)[] = [];
    let shared = NO_SHARED;
    let live = true;
    const frame = !env.reduceMotion && !lowPerf() ? zoomFrame(top.source, container, under, b) : null;
    if (!frame) top.source = null;
    const finish = () => {
      lift(top, false);
      clip(top, 0, 0, 0);
      clearShared(shared);
      cool(top);
      seeThrough(top, false);
      cool(under);
      release();
    };
    const conclude = () =>
      settled(anims).then(() => {
        if (!live) return;
        finish();
        setEntering(null);
      });
    if (env.reduceMotion) {
      place(top, 0, 1, b);
      anims = [top.el?.animate([{ opacity: 0 }, { opacity: 1 }], FADE)];
      conclude();
    } else if (frame && under) {
      const { timing, span } = zoomSpring("open");
      const { fadeIn, hold: wait, squareAfter, underScale } = zoomMotion;
      const late: KeyframeAnimationOptions = { ...timing, delay: wait, fill: "backwards" };
      const during = (from: number, to: number): KeyframeAnimationOptions => {
        const part = span(from, to);
        return { ...part, delay: wait + part.delay, fill: "backwards" };
      };
      shared = zoomShared(frame, top, under, container);
      place(top, 0, 1, b);
      clip(top, frame.rho, -frame.rho, frame.rho);
      if (top.el) {
        top.el.style.opacity = WARM_OPACITY;
        top.el.style.willChange = "transform, opacity";
      }
      stageShared(shared);
      Promise.all([warm(under), decoded(shared)]).then(() => {
        if (!live) return;
        clip(top, frame.rho, 0, frame.b);
        if (top.el) top.el.style.opacity = "";
        anims = [
          top.el?.animate({ opacity: [0, 1] }, { duration: fadeIn, easing: "ease-out" }),
          top.el?.animate([{ transform: frame.transform }, { transform: "none" }], late),
          ...clipMove(top, -frame.rho, frame.rho, squareAfter, 0, late),
          ...shared.flights.map((f) => f.el.animate(f.frames, late)),
          ...shared.reveals.map((r) => r.el.animate(fading(false), during(r.from, r.to))),
          move(under, 0, underScale, b, late),
          fadeTo(under.dim, PUSH_DIM, late),
        ];
        conclude();
      });
    } else {
      const timing = springTiming("push");
      top.x = b.w;
      lift(top, true);
      warm(under);
      anims = [
        move(top, 0, 1, b, timing),
        under && move(under, -b.w * PUSH_PARALLAX, 1, b, timing),
        under && fadeTo(under.dim, PUSH_DIM, timing),
      ];
      conclude();
    }
    return () => {
      live = false;
      anims.forEach((a) => a?.finish());
      finish();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entering]);

  useLayoutEffect(() => {
    if (!exiting) return;
    const top = layer(exiting.key);
    const under = layer(routes[routes.length - 1].key);
    const container = containerRef.current!;
    let anims: (Animation | undefined)[] = [];
    let live = true;
    const release = hold();
    primed.current = null;
    seeThrough(top, true);
    const b = box();
    const frame = !env.reduceMotion && !lowPerf() ? zoomFrame(top.source, container, under, b) : null;
    const shared = zoomShared(frame, top, under, container);
    stageShared(shared);
    const title = frame ? top.el?.querySelector<HTMLElement>('[data-shared="title"]') : null;
    const cardTitle = top.source?.querySelector<HTMLElement>('[data-shared="title"]');
    const relay =
      title && cardTitle && top.el && overlayRef.current
        ? planRelay(cardTitle, title, top.el, container.getBoundingClientRect(), (read) => atRest([under], read))
        : null;
    if (relay && overlayRef.current) mountRelay(relay, overlayRef.current);
    const flights = relay ? shared.flights.filter((f) => f.el !== relay.el) : shared.flights;
    warm(under).then(() => {
      if (!live) return;
      if (env.reduceMotion) {
        place(under, 0, 1, b);
        if (under.dim) under.dim.style.opacity = "0";
        anims = [top.el?.animate([{ opacity: SEE_THROUGH }, { opacity: 0 }], { ...FADE, fill: "forwards" })];
      } else if (frame) {
        const { timing, span } = zoomSpring("close");
        const held: KeyframeAnimationOptions = { ...timing, fill: "forwards" };
        const { fadeOut, settle, squareAfter, relay: steps } = zoomMotion;
        const fade = (el: HTMLElement, to: number, [a, z]: readonly [number, number]) =>
          el.animate([{ opacity: 1 - to }, { opacity: to }], { ...span(a, z), fill: "both" });
        lift(top, false);
        if (!top.rho) clip(top, frame.rho, -frame.rho, frame.rho);
        anims = [
          top.el?.animate([{ transform: transformOf(top.x, top.s, b) }, { transform: frame.transform }], held),
          top.el?.animate([{ opacity: SEE_THROUGH }, { opacity: 0 }], { ...span(fadeOut[0], fadeOut[1]), fill: "both" }),
          ...clipMove(top, 0, frame.b, 1 - squareAfter, 0, timing),
          ...flights.map((f) => f.el.animate([...f.frames].reverse(), held)),
          ...shared.reveals.map((r) => r.el.animate(fading(true), { ...span(1 - r.to, 1 - r.from), fill: "both" })),
          ...shared.settles.map((s) => s.el.animate([s.from, s.to], { ...span(0, settle), fill: "both" })),
          ...(relay?.pieces ?? []).flatMap((p) => [
            p.node.animate([{ transform: p.from }, { transform: p.to }], held),
            p.fade === "out" ? fade(p.node, 0, steps.leave) : undefined,
            p.fade === "in" ? fade(p.node, 1, steps.arrive) : undefined,
            p.blend ? fade(p.blend[0], 0, steps.restyle) : undefined,
            p.blend ? fade(p.blend[1], 1, steps.restyle) : undefined,
          ]),
          move(under, 0, 1, b, timing),
          fadeTo(under.dim, 0, timing),
        ];
      } else {
        const timing = springTiming("push");
        lift(top, true);
        anims = [move(top, b.w, top.s, b, timing), move(under, 0, 1, b, timing), fadeTo(under.dim, 0, timing)];
      }
      settled(anims).then(() => {
        if (!live) return;
        layers.delete(exiting.key);
        endRelay(relay);
        release();
        setExiting(null);
      });
    });
    return () => {
      live = false;
      anims.forEach((a) => a?.finish());
      clearShared(shared);
      endRelay(relay);
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);

  useLayoutEffect(() => {
    for (const key of [...layers.keys()]) {
      if (!rendered.some((r) => r.key === key)) layers.delete(key);
    }
    if (!exiting && !entering && !dragging.current) {
      const top = layer(topKey);
      place(top, 0, 1, box());
      if (!settling.current) clip(top, 0, 0, 0);
      lift(top, false);
      cool(top);
      seeThrough(top, false);
      if (top.dim) top.dim.style.opacity = "0";
      if (underKey && underKey !== primed.current && !settling.current) cool(layer(underKey));
    }
  });

  const busy = useRef({ entering, exiting, routes });
  useLayoutEffect(() => {
    busy.current = { entering, exiting, routes };
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const prime = (on: boolean) => {
      clearTimeout(timer);
      const { entering, exiting, routes } = busy.current;
      if (entering || exiting || dragging.current || routes.length < 2) return;
      const top = layer(routes[routes.length - 1].key);
      const under = layer(routes[routes.length - 2].key);
      primed.current = on ? routes[routes.length - 2].key : null;
      if (on) {
        warm(under);
        seeThrough(top, true);
        timer = setTimeout(() => prime(false), PRIME_MS);
      } else {
        cool(under);
        seeThrough(top, false);
      }
    };
    primers.set(tab, prime);
    return () => {
      clearTimeout(timer);
      if (primers.get(tab) === prime) primers.delete(tab);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primers, tab]);

  useEffect(() => {
    const root = containerRef.current!;
    const cfg = gesture.swipeBack;
    let start: { x: number; y: number; id: number; target: Element | null } | null = null;
    let locked = false;
    let top: Layer | undefined;
    let under: Layer | undefined;
    let b: Box = { w: 0, h: 0 };
    let samples: { x: number; t: number }[] = [];
    let suppressClick = false;
    let dragRelease: (() => void) | null = null;
    let rho = 0;

    const apply = (dx: number) => {
      if (!top || !under) return;
      const p = Math.min(1, Math.max(0, dx / b.w));
      const rest = restUnder(top, b);
      if (top.source) {
        const open = rho * (1 - Math.min(1, p * 5));
        place(top, Math.max(0, dx) * zoomMotion.dragFollow, 1 - zoomMotion.dragScale * p, b);
        clip(top, rho, -open, open);
      } else {
        place(top, Math.max(0, dx), 1, b);
      }
      place(under, rest.x * (1 - p), rest.s + (1 - rest.s) * p, b);
      if (under.dim) under.dim.style.opacity = String(PUSH_DIM * (1 - p));
    };

    const reset = () => {
      start = null;
      locked = false;
      samples = [];
    };

    const onDown = (e: PointerEvent) => {
      const { entering, exiting, routes } = busy.current;
      suppressClick = false;
      if (e.button !== 0 || !e.isPrimary || entering || exiting || routes.length < 2 || dragging.current) return;
      const cr = root.getBoundingClientRect();
      if (e.clientX - cr.left < cfg.edge) return;
      const target = e.target instanceof Element ? e.target : null;
      if (ownsSwipe(target, root)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, target };
      samples = [{ x: e.clientX, t: e.timeStamp }];
    };

    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!locked) {
        if (Math.abs(dx) < cfg.slop && Math.abs(dy) < cfg.slop) return;
        if (dx <= 0 || dx < Math.abs(dy) * cfg.ratio || refusesTouch(start.target, root)) return reset();
        locked = true;
        dragging.current = true;
        dragRelease = hold();
        const { routes } = busy.current;
        top = layer(routes[routes.length - 1].key);
        under = layer(routes[routes.length - 2].key);
        b = box();
        warm(under);
        seeThrough(top, true);
        if (top.source) rho = zoomFrame(top.source, root, under, b)?.rho ?? zoomMotion.radius;
        else lift(top, true);
        try {
          root.setPointerCapture(e.pointerId);
        } catch {}
        getSelection()?.removeAllRanges();
      }
      samples.push({ x: e.clientX, t: e.timeStamp });
      if (samples.length > 5) samples.shift();
      apply(dx);
    };

    const onUp = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const wasLocked = locked;
      const dx = e.clientX - start.x;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last && first ? last.t - first.t : 0;
      const v = dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0;
      reset();
      if (!wasLocked || !top || !under) return;
      suppressClick = true;
      const t = top;
      const u = under;
      const commit = e.type === "pointerup" && dx > cfg.minTravel && (dx / b.w > cfg.commit || v > cfg.velocity) && v > -cfg.velocity;
      dragging.current = false;
      if (commit) {
        store.getState().pop();
        dragRelease?.();
        return;
      }
      const { timing } = zoomSpring("cancel", Math.max(-8, Math.min(8, -v / Math.max(dx, 48))));
      const rest = restUnder(t, b);
      const anims = [
        move(t, 0, 1, b, timing),
        ...(t.rho ? clipMove(t, -t.rho, t.rho, 0.5, (t.a - t.rho) / 2, timing) : []),
        move(u, rest.x, rest.s, b, timing),
        fadeTo(u.dim, PUSH_DIM, timing),
      ];
      settling.current = true;
      settled(anims).then(() => {
        settling.current = false;
        dragRelease?.();
        if (dragging.current || busy.current.exiting) return;
        clip(t, 0, 0, 0);
        lift(t, false);
        cool(u);
        seeThrough(t, false);
      });
    };

    const onClick = (e: MouseEvent) => {
      if (suppressClick) {
        suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
      }
    };

    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", onUp);
    root.addEventListener("click", onClick, true);
    return () => {
      dragRelease?.();
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      root.removeEventListener("click", onClick, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      {rendered.map((route, index) => {
        const role = route.key === topKey ? "top" : route.key === underKey ? "under" : "buried";
        return (
          <StackLayer key={route.key} id={route.key} role={role} register={register}>
            <RouteContext value={{ route, tab, index, settled: route.key !== entering }}>
              <RouteScreen route={route} Screen={config.routes[route.name].screen} />
            </RouteContext>
          </StackLayer>
        );
      })}
      <div ref={overlayRef} aria-hidden className="pointer-events-none absolute inset-0" />
    </div>
  );
}

function RouteScreen({ route, Screen }: { route: Route; Screen: React.ComponentType<{ params: Route["params"]; route: Route }> }) {
  return <Screen params={route.params} route={route} />;
}

function StackLayer({
  id,
  role,
  register,
  children,
}: {
  id: string;
  role: "top" | "under" | "buried";
  register: (key: string, part: Part, el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={(el) => register(id, "el", el)}
      inert={role !== "top"}
      className={cn(
        "absolute inset-0 origin-top-left",
        role !== "top" && "invisible",
        role === "buried" && "[content-visibility:hidden]",
      )}
    >
      <div
        ref={(el) => register(id, "shadow", el)}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-(--push-shadow-w) w-(--push-shadow-w) bg-gradient-to-l from-(--push-shadow) to-transparent opacity-0"
      />
      <div ref={(el) => register(id, "clipA", el)} className="absolute inset-0">
        <div ref={(el) => register(id, "clipB", el)} className="absolute inset-0">
          <div ref={(el) => register(id, "body", el)} className="absolute inset-0 bg-canvas">
            {role !== "buried" && <SceneBackdrop />}
            {children}
            <div
              ref={(el) => register(id, "dim", el)}
              aria-hidden
              className="pointer-events-none absolute inset-0 z-(--z-dim) bg-scrim-push opacity-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

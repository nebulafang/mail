export type SpringCurve = "push" | "smooth" | "snappy" | "list-remove" | "segment";

const FALLBACK_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const cache = new Map<SpringCurve, { easing: string; duration: number }>();

function toMs(value: string) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 500;
  return value.trim().endsWith("ms") ? n : n * 1000;
}

function read(name: SpringCurve) {
  const style = getComputedStyle(document.documentElement);
  const easing = style.getPropertyValue(`--spring-${name}`).trim();
  const duration = toMs(style.getPropertyValue(`--spring-${name}-dur`));
  if (easing && CSS.supports("animation-timing-function", easing)) return { easing, duration };
  return { easing: FALLBACK_EASING, duration: duration * 0.6 };
}

export function springTiming(name: SpringCurve, scale = 1): KeyframeAnimationOptions {
  let base = cache.get(name);
  if (!base) {
    base = read(name);
    cache.set(name, base);
  }
  return { easing: base.easing, duration: Math.max(120, base.duration * scale) };
}

export const translateY = (y: number) => (y ? `translate3d(0, ${y}px, 0)` : "none");

export function currentTranslate(el: Element, axis: "x" | "y") {
  const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
  return axis === "x" ? matrix.m41 : matrix.m42;
}

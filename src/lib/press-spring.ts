import { calcGeneratorDuration, generateLinearEasing, spring } from "motion";

export type PressSpring = { stiffness: number; damping: number; mass: number };

export const iosSpring = (response: number, dampingFraction: number): PressSpring => ({
  stiffness: ((2 * Math.PI) / response) ** 2,
  damping: (4 * Math.PI * dampingFraction) / response,
  mass: 1,
});

export type SpringRun = {
  easing: string;
  duration: number;
  at: (t: number) => { value: number; velocity: number };
};

type Rest = { restDelta: number; restSpeed: number };

const FALLBACK = "cubic-bezier(0.32, 0.72, 0, 1)";
const PRESS_REST: Rest = { restDelta: 0.0002, restSpeed: 0.004 };
const CACHE_LIMIT = 64;
const cache = new Map<string, SpringRun>();
let linearSupported: boolean | undefined;

export function run(from: number, to: number, velocity: number, cfg: PressSpring, rest: Rest = PRESS_REST): SpringRun {
  const key = velocity ? "" : `${from}:${to}:${cfg.stiffness}:${cfg.damping}:${cfg.mass}:${rest.restDelta}`;
  const hit = key && cache.get(key);
  if (hit) return hit;

  const gen = spring({ keyframes: [from, to], velocity, ...rest, ...cfg });
  const duration = Math.max(1, Math.min(calcGeneratorDuration(gen, 10), 2000));
  const span = to - from;
  linearSupported ??= typeof CSS === "undefined" || CSS.supports("animation-timing-function", "linear(0, 1)");
  const easing =
    linearSupported && span
      ? generateLinearEasing((p) => (gen.next(p * duration).value - from) / span, duration, 12)
      : FALLBACK;
  const result: SpringRun = {
    easing,
    duration,
    at: (t) => {
      const c = Math.min(t, duration);
      return { value: c >= duration ? to : gen.next(c).value, velocity: c >= duration ? 0 : (gen.velocity?.(c) ?? 0) };
    },
  };
  if (key) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
  }
  return result;
}

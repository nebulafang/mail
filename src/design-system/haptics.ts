"use client";

export type HapticKind = "selection" | "light" | "medium" | "success" | "warning" | "error";

const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  selection: 8,
  light: 12,
  medium: 20,
  success: [12, 60, 18],
  warning: [18, 80, 18],
  error: [24, 60, 24, 60, 24],
};

const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export function haptic(kind: HapticKind = "light") {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(HAPTIC_PATTERNS[kind]);
  } catch {}
}

const refs = new Map<HapticKind, (el: HTMLElement | null) => void | (() => void)>();

export function hapticRef(kind: HapticKind = "light") {
  let ref = refs.get(kind);
  if (ref) return ref;
  ref = (el: HTMLElement | null) => {
    if (!el || !canVibrate()) return;
    const onClick = () => haptic(kind);
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  };
  refs.set(kind, ref);
  return ref;
}

"use client";

import { useSyncExternalStore } from "react";
import { DARK_QUERY, THEME_KEY as KEY } from "./theme-script";

export type ThemePreference = "system" | "light" | "dark";
export type ColorScheme = "light" | "dark";

const SWITCH_ATTR = "data-theme-switch";

const isPreference = (v: unknown): v is ThemePreference => v === "system" || v === "light" || v === "dark";

let preference: ThemePreference = "system";
let systemDark = false;
let started = false;
let themeColors: Record<ColorScheme, string> | null = null;
let switching: object | null = null;
const listeners = new Set<() => void>();
const appliedListeners = new Set<(scheme: ColorScheme) => void>();

const resolve = (): ColorScheme => (preference === "system" ? (systemDark ? "dark" : "light") : preference);

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(KEY);
    return isPreference(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  preference = readPreference();
  const mq = window.matchMedia(DARK_QUERY);
  systemDark = mq.matches;
  if (document.documentElement.classList.contains("dark") !== (resolve() === "dark")) apply(resolve());
  mq.addEventListener("change", (e) => update(preference, e.matches));
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) update(isPreference(e.newValue) ? e.newValue : "system", systemDark);
  });
}

function reducedMotion() {
  const setting = document.documentElement.getAttribute("data-reduce-motion");
  if (setting) return setting === "on";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function paintMeta(scheme: ColorScheme) {
  if (!themeColors) return;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = themeColors[scheme];
}

function apply(scheme: ColorScheme) {
  const html = document.documentElement;
  html.classList.toggle("dark", scheme === "dark");
  html.style.colorScheme = scheme;
  paintMeta(scheme);
  for (const fn of appliedListeners) fn(scheme);
}

function switchTo(scheme: ColorScheme) {
  const html = document.documentElement;
  const token = {};
  switching = token;
  const done = () => {
    if (switching === token) html.removeAttribute(SWITCH_ATTR);
  };
  const update = () => {
    html.setAttribute(SWITCH_ATTR, "");
    apply(scheme);
  };
  const animate = !!document.startViewTransition && document.visibilityState === "visible" && !reducedMotion();
  if (!animate) {
    update();
    requestAnimationFrame(() => requestAnimationFrame(done));
    return;
  }
  const transition = document.startViewTransition(update);
  transition.ready.catch(() => {});
  transition.finished.then(done, done);
}

function update(nextPreference: ThemePreference, nextSystemDark: boolean) {
  const before = resolve();
  preference = nextPreference;
  systemDark = nextSystemDark;
  const after = resolve();
  if (after !== before) switchTo(after);
  for (const fn of listeners) fn();
}

export function setThemePreference(next: ThemePreference) {
  start();
  if (next === preference) return;
  try {
    localStorage.setItem(KEY, next);
  } catch {}
  update(next, systemDark);
}

export function getColorScheme(): ColorScheme {
  start();
  return resolve();
}

export function setThemeColors(colors: Record<ColorScheme, string>) {
  themeColors = colors;
  paintMeta(getColorScheme());
}

export function onThemeApplied(fn: (scheme: ColorScheme) => void) {
  appliedListeners.add(fn);
  return () => void appliedListeners.delete(fn);
}

function subscribe(fn: () => void) {
  start();
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribe,
    () => (start(), preference),
    () => "system",
  );
}

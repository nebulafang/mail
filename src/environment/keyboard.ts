"use client";

import { useSyncExternalStore } from "react";
import { layoutPx } from "@/design-system/motion";

let visible = false;
const listeners = new Set<() => void>();

export function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  let last = -1;
  const update = () => {
    const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    if (inset === last) return;
    last = inset;
    document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
    const next = inset > layoutPx.keyboardVisible;
    if (next === visible) return;
    visible = next;
    listeners.forEach((notify) => notify());
  };
  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  return () => {
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
  };
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => void listeners.delete(notify);
};
const getVisible = () => visible;
const getServerVisible = () => false;

export const useKeyboardVisible = () => useSyncExternalStore(subscribe, getVisible, getServerVisible);

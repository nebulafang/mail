"use client";

import { animate, type AnimationPlaybackControls } from "motion/react";
import { useRef } from "react";
import { haptic } from "@/design-system/haptics";
import { gesture, scales, springs } from "@/design-system/motion";
import { useEnvironment } from "@/environment/environment";
import type { MenuPointer } from "@/presentation/store";

const { delay: DELAY, slop: SLOP } = gesture.longPress;

export type LongPressInfo = {
  pointer?: MenuPointer;
  fromScale: number;
};

export function useLongPress(onLongPress: (element: HTMLElement, info: LongPressInfo) => void, { pressFeedback = true } = {}) {
  const { reduceMotion } = useEnvironment();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const target = useRef<HTMLElement | null>(null);
  const press = useRef<AnimationPlaybackControls | null>(null);
  const firedAt = useRef(0);
  const feedback = pressFeedback && !reduceMotion;

  const cancel = (release = true) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
    press.current?.stop();
    press.current = null;
    if (release && target.current && feedback) animate(target.current, { scale: 1 }, springs.press);
    target.current = null;
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      const pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      start.current = { x: e.clientX, y: e.clientY };
      target.current = el;
      if (feedback) {
        press.current = animate(el, { scale: scales.contextHold }, { type: "spring", visualDuration: DELAY / 1000, bounce: 0 });
      }
      timer.current = setTimeout(() => {
        firedAt.current = Date.now();
        const fromScale = feedback ? currentScale(el) : 1;
        cancel(false);
        haptic("medium");
        onLongPress(el, { pointer, fromScale });
      }, DELAY);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > SLOP) cancel();
    },
    onPointerUp: () => cancel(),
    onPointerCancel: () => cancel(),
    onPointerLeave: () => cancel(),
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (Date.now() - firedAt.current < 600) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      if (firedAt.current && Date.now() - firedAt.current < 800) return;
      firedAt.current = Date.now();
      cancel();
      onLongPress(e.currentTarget, { fromScale: 1 });
    },
  };

  return {
    handlers,
    fired: () => Date.now() - firedAt.current < 600,
  };
}

export function releasePress(el: HTMLElement) {
  animate(el, { scale: 1 }, { duration: 0 });
}

function currentScale(el: HTMLElement) {
  const t = getComputedStyle(el).transform;
  return t && t !== "none" ? new DOMMatrix(t).a : 1;
}

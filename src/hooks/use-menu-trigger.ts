"use client";

import { useEffect, useRef } from "react";
import { haptic } from "@/design-system/haptics";
import { gesture } from "@/design-system/motion";
import { triggerPress } from "@/presentation/menu-layout";
import type { MenuPointer } from "@/presentation/store";

const { holdDelay: HOLD_DELAY, slop: SLOP } = gesture.menuTrigger;

export function useMenuTrigger(open: (anchor: HTMLElement, pointer?: MenuPointer) => void) {
  const openedByPointer = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ id: number; x: number; y: number } | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => cancel, []);

  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      const pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      openedByPointer.current = false;
      cancel();
      if (triggerPress(e.pointerType) === "hold") {
        start.current = pointer;
        timer.current = setTimeout(() => {
          cancel();
          openedByPointer.current = true;
          haptic("light");
          open(el, pointer);
        }, HOLD_DELAY);
        return;
      }
      e.preventDefault();
      openedByPointer.current = true;
      open(el, pointer);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (s && e.pointerId === s.id && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const keyboard = e.detail === 0;
      if (openedByPointer.current && !keyboard) {
        openedByPointer.current = false;
        return;
      }
      openedByPointer.current = false;
      open(e.currentTarget);
    },
  };
}

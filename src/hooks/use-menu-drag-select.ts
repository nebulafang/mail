"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/design-system/haptics";
import { gesture } from "@/design-system/motion";
import type { MenuPointer } from "@/presentation/store";

type Session = { id: number; x: number; y: number; moved: boolean };

let holding = false;

const blockTouchMove = (e: TouchEvent) => {
  if (e.cancelable) e.preventDefault();
};
const blockContextMenu = (e: Event) => e.preventDefault();

function setHolding(next: boolean) {
  if (next === holding) return;
  holding = next;
  if (next) {
    document.addEventListener("touchmove", blockTouchMove, { passive: false });
    document.addEventListener("contextmenu", blockContextMenu, true);
  } else {
    document.removeEventListener("touchmove", blockTouchMove);
    document.removeEventListener("contextmenu", blockContextMenu, true);
  }
}

export function useMenuDragSelect({
  initial,
  enabled,
  onSelect,
}: {
  initial?: MenuPointer;
  enabled: boolean;
  onSelect: (id: string) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const session = useRef<Session | null>(initial ? { ...initial, moved: false } : null);
  const overRef = useRef<string | null>(null);
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  });

  useEffect(() => {
    if (!enabled) return;
    if (session.current && initial?.released) session.current = null;
    setHolding(!!session.current);

    const setHighlighted = (id: string | null) => {
      if (id === overRef.current) return;
      overRef.current = id;
      setOver(id);
      if (id) haptic("selection");
    };

    const track = (x: number, y: number) => {
      const s = session.current;
      if (!s) return;
      if (!s.moved && Math.hypot(x - s.x, y - s.y) < gesture.menuDrag.slop) return;
      if (!s.moved) setDragging(true);
      s.moved = true;
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-menu-item]");
      setHighlighted(el && !el.hasAttribute("data-disabled") ? (el.dataset.menuItem ?? null) : null);
    };

    const finish = (commit: boolean) => {
      const s = session.current;
      if (!s) return;
      session.current = null;
      setHolding(false);
      const picked = commit && s.moved ? overRef.current : null;
      setHighlighted(null);
      setDragging(false);
      if (picked) select.current(picked);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId === session.current?.id) track(e.clientX, e.clientY);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId === session.current?.id) finish(true);
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && e.pointerId === session.current?.id) finish(false);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (session.current && t) track(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (session.current && e.touches.length === 0) finish(true);
    };
    const onTouchCancel = () => finish(false);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchCancel);
    return () => {
      setHolding(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, initial]);

  return {
    over,
    dragging,
    onPointerDown: (e: React.PointerEvent, options: { scrollable?: boolean } = {}) => {
      if (e.button !== 0) return;
      if (options.scrollable && e.pointerType !== "mouse") return;
      session.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      setHolding(true);
    },
  };
}

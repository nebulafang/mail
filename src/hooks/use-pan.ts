"use client";

import { useEffect, useRef } from "react";

export type PanInfo = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  downX: number;
  downY: number;
  canceled: boolean;
};

export type PanOptions = {
  axis?: "x" | "y";
  slop?: number;
  enabled?: boolean;
  onStart?: (info: PanInfo) => boolean | void;
  onMove?: (info: PanInfo) => void;
  onEnd?: (info: PanInfo) => void;
  onTap?: (info: PanInfo) => void;
};

type Sample = { x: number; y: number; t: number };

const VELOCITY_WINDOW_MS = 100;

export function usePan<T extends HTMLElement>(ref: React.RefObject<T | null>, options: PanOptions) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const enabled = options.enabled !== false;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let id = -1;
    let downX = 0;
    let downY = 0;
    let originX = 0;
    let originY = 0;
    let active = false;
    let suppressClick = false;
    let samples: Sample[] = [];

    const info = (x: number, y: number, canceled: boolean): PanInfo => {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = first && last ? last.t - first.t : 0;
      const moving = dt > 0 && !canceled;
      return {
        x,
        y,
        dx: x - originX,
        dy: y - originY,
        vx: moving ? ((last.x - first.x) / dt) * 1000 : 0,
        vy: moving ? ((last.y - first.y) / dt) * 1000 : 0,
        downX,
        downY,
        canceled,
      };
    };

    const stop = () => {
      id = -1;
      active = false;
      samples = [];
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    const abort = () => {
      if (id === -1) return;
      const last = samples[samples.length - 1];
      const wasActive = active;
      const result = info(last?.x ?? downX, last?.y ?? downY, true);
      stop();
      if (wasActive) latest.current.onEnd?.(result);
    };

    function onMove(e: PointerEvent) {
      if (e.pointerId !== id) return;
      samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      while (samples.length > 2 && e.timeStamp - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
      if (!active) {
        const dx = e.clientX - downX;
        const dy = e.clientY - downY;
        const { axis, slop = 6, onStart } = latest.current;
        if (Math.hypot(dx, dy) < slop) return;
        if ((axis === "x" && Math.abs(dx) < Math.abs(dy)) || (axis === "y" && Math.abs(dy) < Math.abs(dx))) return stop();
        originX = e.clientX;
        originY = e.clientY;
        if (onStart?.(info(e.clientX, e.clientY, false)) === false) return stop();
        active = true;
      }
      latest.current.onMove?.(info(e.clientX, e.clientY, false));
    }

    function onUp(e: PointerEvent) {
      if (e.pointerId !== id) return;
      const wasActive = active;
      const released = e.type === "pointerup";
      const result = info(e.clientX, e.clientY, !released);
      stop();
      if (wasActive) {
        suppressClick = released;
        latest.current.onEnd?.(result);
      } else if (released) {
        latest.current.onTap?.(result);
      }
    }

    const onDown = (e: PointerEvent) => {
      suppressClick = false;
      if (id !== -1) return abort();
      if (!e.isPrimary || e.button !== 0) return;
      id = e.pointerId;
      downX = originX = e.clientX;
      downY = originY = e.clientY;
      samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    };

    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick, true);
    return () => {
      stop();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick, true);
    };
  }, [ref, enabled]);
}

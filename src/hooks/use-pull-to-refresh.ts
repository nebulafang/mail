"use client";

import { animate, useMotionValue } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { haptic } from "@/design-system/haptics";
import { gesture, springs } from "@/design-system/motion";
import { currentTranslate, springTiming, translateY, type SpringCurve } from "@/design-system/timing";
import { useEnvironment } from "@/environment/environment";

const { threshold, hold, maxPull, resistance, releaseRatio } = gesture.pullToRefresh;

export const REFRESH_THRESHOLD = threshold;

const resist = (distance: number) => (distance < 1 ? 0 : maxPull * (1 - Math.exp(-distance / resistance)));
const unresist = (offset: number) => (offset > 0 ? -resistance * Math.log(1 - Math.min(offset, maxPull - 1) / maxPull) : 0);

export function usePullToRefresh(
  scroller: React.RefObject<HTMLDivElement | null>,
  onRefresh: (() => Promise<unknown>) | undefined,
  { elastic = false }: { elastic?: boolean } = {},
) {
  const env = useEnvironment();
  const content = useRef<HTMLDivElement>(null);
  const pull = useMotionValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const armed = useRef(false);
  const shift = useRef(0);
  const running = useRef<Animation | null>(null);
  const enabled = !!onRefresh || elastic;

  const place = (y: number) => {
    shift.current = y;
    const el = content.current;
    if (el) el.style.transform = translateY(y);
  };

  const halt = () => {
    const el = content.current;
    const anim = running.current;
    if (!el || !anim) return;
    const y = currentTranslate(el, "y");
    running.current = null;
    anim.cancel();
    place(y);
  };

  const glide = (to: number, curve: SpringCurve) =>
    new Promise<void>((resolve) => {
      const el = content.current;
      halt();
      const from = shift.current;
      place(to);
      if (!el || from === to || env.reduceMotion) {
        if (el && !to) el.style.willChange = "";
        return resolve();
      }
      el.style.willChange = "transform";
      const anim = el.animate([{ transform: translateY(from) }, { transform: translateY(to) }], springTiming(curve));
      running.current = anim;
      const done = () => {
        if (running.current === anim) {
          running.current = null;
          if (!shift.current) el.style.willChange = "";
        }
        resolve();
      };
      anim.onfinish = done;
      anim.oncancel = done;
    });

  const start = async () => {
    if (busy.current || !onRefresh) return;
    busy.current = true;
    setRefreshing(true);
    try {
      await Promise.all([onRefresh(), glide(hold, "smooth")]);
    } finally {
      busy.current = false;
      armed.current = false;
      setRefreshing(false);
      glide(0, "smooth");
      animate(pull, 0, springs.smooth);
    }
  };

  const track = (distance: number) => {
    if (!onRefresh) return;
    const past = distance >= threshold * releaseRatio;
    if (past !== armed.current) {
      armed.current = past;
      if (past) haptic("medium");
    }
  };

  const seize = useEffectEvent(() => {
    halt();
    if (content.current) content.current.style.willChange = "transform";
    return unresist(shift.current);
  });

  const drag = useEffectEvent((y: number) => {
    place(y);
    pull.set(y);
    track(y);
  });

  const release = useEffectEvent(() => {
    if (onRefresh && shift.current >= threshold * releaseRatio) start();
    else {
      armed.current = false;
      glide(0, "snappy");
      animate(pull, 0, springs.snappy);
    }
  });

  useEffect(() => {
    const el = scroller.current;
    if (!el || !enabled) return;
    let tracking = false;
    let pulling = false;
    let originX = 0;
    let originY = 0;
    let lift = 0;
    let frame = 0;
    let latest = 0;

    const flush = () => {
      frame = 0;
      drag(latest);
    };

    const begin = (x: number, y: number) => {
      tracking = !busy.current && el.scrollTop <= 0;
      pulling = false;
      originX = x;
      originY = y;
    };

    const move = (x: number, y: number, cancelable: boolean) => {
      if (!tracking) return false;
      if (pulling && el.scrollTop > 0) {
        end();
        return false;
      }
      const dy = y - originY;
      if (!pulling) {
        if (dy <= 0 || Math.abs(x - originX) > dy || el.scrollTop > 0 || !cancelable) {
          tracking = false;
          return false;
        }
        pulling = true;
        lift = seize();
      }
      latest = resist(Math.max(0, dy + lift));
      if (!frame) frame = requestAnimationFrame(flush);
      return true;
    };

    const end = () => {
      tracking = false;
      if (!pulling) return;
      pulling = false;
      if (frame) {
        cancelAnimationFrame(frame);
        flush();
      }
      release();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      begin(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return end();
      move(e.touches[0].clientX, e.touches[0].clientY, true);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button === 0) begin(e.clientX, e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && tracking) move(e.clientX, e.clientY, true);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") end();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [scroller, enabled]);

  useEffect(() => () => running.current?.cancel(), []);

  return { content, pull, refreshing };
}

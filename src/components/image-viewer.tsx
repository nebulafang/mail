"use client";

import { Download, X } from "lucide-react";
import { animate, m, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/design-system/haptics";
import { springs } from "@/design-system/motion";
import { useEnvironment } from "@/environment/environment";
import { usePan } from "@/hooks/use-pan";

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 4;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 600;
const DOUBLE_TAP_MS = 280;

export function ImageViewer({ src, alt, download, from, onClose }: { src: string; alt: string; download?: string; from?: DOMRect; onClose: () => void }) {
  const { reduceMotion } = useEnvironment();
  const stage = useRef<HTMLDivElement>(null);
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const drag = useMotionValue(0);
  const backdrop = useTransform(drag, [0, DISMISS_DISTANCE * 2], [1, 0]);
  const shrink = useTransform(drag, [0, DISMISS_DISTANCE * 3], [1, 0.8]);
  const imgScale = useTransform(() => scale.get() * shrink.get());
  const closing = useRef(false);
  const lastTap = useRef(0);
  const travel = useRef({ x: 0, y: 0 });
  const closeRef = useRef<() => void>(null);
  const settleRef = useRef<(s: number) => void>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current?.();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function close() {
    if (closing.current) return;
    closing.current = true;
    const t = reduceMotion ? { duration: 0 } : springs.dismiss;
    animate(drag, DISMISS_DISTANCE * 2, t);
    animate(scale, 0.9, t).then(onClose);
  }

  function clampPan(s: number) {
    const el = stage.current;
    if (!el) return;
    const maxX = ((s - 1) * el.clientWidth) / 2;
    const maxY = ((s - 1) * el.clientHeight) / 2;
    animate(x, Math.max(-maxX, Math.min(maxX, x.get())), springs.snappy);
    animate(y, Math.max(-maxY, Math.min(maxY, y.get())), springs.snappy);
  }

  function zoomTo(s: number, cx = 0, cy = 0) {
    const next = Math.max(1, Math.min(MAX_ZOOM, s));
    haptic("light");
    animate(scale, next, springs.snappy);
    if (next === 1) {
      animate(x, 0, springs.snappy);
      animate(y, 0, springs.snappy);
    } else {
      animate(x, -cx * (next - 1), springs.snappy);
      animate(y, -cy * (next - 1), springs.snappy);
    }
  }

  function recenter() {
    animate(drag, 0, springs.snappy);
    animate(x, 0, springs.snappy);
    animate(y, 0, springs.snappy);
  }

  useEffect(() => {
    closeRef.current = close;
    settleRef.current = (s) => (s < 1.02 ? zoomTo(1) : clampPan(s));
  });

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const points = new Map<number, { x: number; y: number }>();
    let base: { distance: number; scale: number } | null = null;
    const distance = () => {
      const [a, b] = [...points.values()];
      return Math.hypot(a.x - b.x, a.y - b.y) || 1;
    };
    const onDown = (e: PointerEvent) => {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 2) base = { distance: distance(), scale: scale.get() };
    };
    const onMove = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (base && points.size === 2) scale.set(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (base.scale * distance()) / base.distance)));
    };
    const onUp = (e: PointerEvent) => {
      if (!points.delete(e.pointerId) || !base) return;
      base = null;
      settleRef.current?.(scale.get());
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [scale]);

  usePan(stage, {
    slop: 3,
    onStart: () => {
      travel.current = { x: 0, y: 0 };
    },
    onMove: ({ dx, dy }) => {
      const stepX = dx - travel.current.x;
      const stepY = dy - travel.current.y;
      travel.current = { x: dx, y: dy };
      if (scale.get() > 1.02) {
        x.set(x.get() + stepX);
        y.set(y.get() + stepY);
        return;
      }
      const down = Math.max(0, dy);
      drag.set(down);
      x.set(dx * 0.4);
      y.set(down);
    },
    onEnd: ({ dy, vy, canceled }) => {
      if (scale.get() > 1.02) return clampPan(scale.get());
      if (!canceled && (Math.max(0, dy) > DISMISS_DISTANCE || vy > DISMISS_VELOCITY)) {
        haptic("light");
        close();
      } else {
        recenter();
      }
    },
    onTap: (tap) => {
      const now = performance.now();
      if (now - lastTap.current >= DOUBLE_TAP_MS) {
        lastTap.current = now;
        return;
      }
      lastTap.current = 0;
      const rect = stage.current!.getBoundingClientRect();
      zoomTo(scale.get() > 1.05 ? 1 : 2.5, tap.x - rect.left - rect.width / 2, tap.y - rect.top - rect.height / 2);
    },
  });

  const origin = from
    ? {
        x: from.left + from.width / 2 - window.innerWidth / 2,
        y: from.top + from.height / 2 - window.innerHeight / 2,
        scale: Math.min(from.width / window.innerWidth, 0.4),
      }
    : { scale: 0.9, x: 0, y: 0 };

  return createPortal(
    <div className="fixed inset-0 z-(--z-alert) touch-none select-none" role="dialog" aria-label={alt}>
      <m.div className="absolute inset-0 bg-black" style={{ opacity: backdrop }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springs.smooth} />
      <div ref={stage} className="absolute inset-0 grid place-items-center overflow-hidden">
        <m.div
          initial={reduceMotion ? { opacity: 0 } : { ...origin, opacity: 0 }}
          animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          transition={springs.present}
          className="layer-keep"
        >
          <m.img
            src={src}
            alt={alt}
            draggable={false}
            referrerPolicy="no-referrer"
            style={{ x, y, scale: imgScale }}
            className="max-h-dvh max-w-[100vw] object-contain"
          />
        </m.div>
      </div>
      <m.div
        style={{ opacity: backdrop }}
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-(--margin) pt-[calc(env(safe-area-inset-top)+12px)]"
      >
        <button
          type="button"
          aria-label="关闭"
          onClick={close}
          className="pointer-events-auto grid size-(--control-h) place-items-center rounded-full bg-white/16 text-white backdrop-blur-xl lowperf:bg-black/45 lowperf:backdrop-blur-none"
        >
          <X className="size-5" strokeWidth={2.4} />
        </button>
        <span className="min-w-0 truncate type-subheadline font-semibold text-white/90">{alt}</span>
        {download ? (
          <a
            href={download}
            aria-label="下载"
            className="pointer-events-auto grid size-(--control-h) place-items-center rounded-full bg-white/16 text-white backdrop-blur-xl lowperf:bg-black/45 lowperf:backdrop-blur-none"
          >
            <Download className="size-5" strokeWidth={2.4} />
          </a>
        ) : (
          <span className="size-(--control-h)" />
        )}
      </m.div>
    </div>,
    document.body,
  );
}

"use client";

import { animate, useMotionValue, type Transition } from "motion/react";
import { useEffect, useRef } from "react";
import { haptic } from "@/design-system/haptics";
import { springs } from "@/design-system/motion";
import { useEnvironment } from "@/environment/environment";
import { usePan } from "@/hooks/use-pan";

export function useLensDrag({
  count,
  activeIndex,
  onCommit,
  spring,
  lensScale,
  onlyFromActive = false,
  enabled = true,
}: {
  count: number;
  activeIndex: number;
  onCommit: (index: number) => void;
  spring: Transition;
  lensScale: number;
  onlyFromActive?: boolean;
  enabled?: boolean;
}) {
  const { reduceMotion } = useEnvironment();
  const containerRef = useRef<HTMLDivElement>(null);
  const pos = useMotionValue(activeIndex);
  const lens = useMotionValue(1);
  const lastSnapped = useRef(activeIndex);
  const metrics = useRef({ left: 0, item: 1 });

  useEffect(() => {
    if (reduceMotion) return pos.jump(activeIndex);
    const controls = animate(pos, activeIndex, spring);
    return () => controls.stop();
  }, [pos, activeIndex, spring, reduceMotion]);

  const toPos = (x: number) => Math.min(Math.max((x - metrics.current.left) / metrics.current.item - 0.5, 0), count - 1);

  usePan(containerRef, {
    axis: "x",
    slop: 3,
    enabled,
    onStart: ({ downX }) => {
      const el = containerRef.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      metrics.current = { left: rect.left + pad, item: (rect.width - pad * 2) / count };
      if (onlyFromActive && Math.round(toPos(downX)) !== activeIndex) return false;
      lastSnapped.current = activeIndex;
      if (!reduceMotion) animate(lens, lensScale, spring);
    },
    onMove: ({ x }) => {
      const p = toPos(x);
      const nearest = Math.round(p);
      pos.set(p);
      if (nearest !== lastSnapped.current) {
        lastSnapped.current = nearest;
        haptic("selection");
      }
    },
    onEnd: ({ x }) => {
      const nearest = Math.round(toPos(x));
      if (reduceMotion) {
        lens.jump(1);
        pos.jump(nearest);
      } else {
        animate(lens, 1, springs.bouncy);
        animate(pos, nearest, spring);
      }
      if (nearest !== activeIndex) onCommit(nearest);
    },
  });

  return { containerRef, pos, lens };
}

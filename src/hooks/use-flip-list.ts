"use client";

import { useEffect, useRef } from "react";
import { springTiming } from "@/design-system/timing";
import { useEnvironment } from "@/environment/environment";

type Spot = { x: number; y: number };

export function useFlipList<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { reduceMotion } = useEnvironment();

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const running = new WeakMap<Element, Animation>();
    const measure = () => {
      const next = new Map<Element, Spot>();
      for (const child of container.children) {
        const el = child as HTMLElement;
        next.set(child, { x: el.offsetLeft, y: el.offsetTop });
      }
      return next;
    };
    let positions = measure();

    const reflow = () => {
      const next = measure();
      if (!reduceMotion && container.offsetParent) {
        for (const [child, spot] of next) {
          const before = positions.get(child);
          if (!before || (before.x === spot.x && before.y === spot.y)) continue;
          running.get(child)?.cancel();
          running.set(
            child,
            child.animate(
              [{ translate: `${before.x - spot.x}px ${before.y - spot.y}px` }, { translate: "0 0" }],
              springTiming("list-remove"),
            ),
          );
        }
      }
      positions = next;
    };

    const children = new MutationObserver(reflow);
    children.observe(container, { childList: true });
    const popped = new MutationObserver(reflow);
    popped.observe(container, { subtree: true, attributes: true, attributeFilter: ["data-motion-pop-id"] });
    const resize = new ResizeObserver(() => (positions = measure()));
    resize.observe(container);
    return () => {
      children.disconnect();
      popped.disconnect();
      resize.disconnect();
    };
  }, [reduceMotion]);

  return ref;
}

"use client";

import { useEffect, useRef } from "react";
import { springTiming } from "@/design-system/timing";
import { useEnvironment } from "@/environment/environment";

const CONTENT_DELAY_MS = 90;

export function useSheetEntrance() {
  const { reduceMotion } = useEnvironment();
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduceMotion) return;
    const entrance = content.current?.animate([{ opacity: 0, translate: "0 14px" }, { opacity: 1, translate: "0 0" }], {
      ...springTiming("smooth", 0.6),
      delay: CONTENT_DELAY_MS,
      fill: "backwards",
    });
    return () => entrance?.cancel();
  }, [reduceMotion]);

  return { content };
}

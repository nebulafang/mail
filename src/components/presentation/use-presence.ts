"use client";

import { useEffect, useState } from "react";
import { exitFallbackMs } from "@/design-system/motion";
import { usePresentation, type Presentation } from "@/presentation/store";

export function usePresence(item: Presentation, exitMs: number = exitFallbackMs.sheet) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (item.open) return;
    const timer = setTimeout(() => usePresentation.getState().remove(item.id), exitMs);
    return () => clearTimeout(timer);
  }, [item.open, item.id, exitMs]);

  return {
    open: item.open && mounted,
    onOpenChangeComplete: (open: boolean) => {
      if (!open && !item.open) usePresentation.getState().remove(item.id);
    },
  };
}

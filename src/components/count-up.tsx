"use client";

import { animate, m, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";
import { counterTransition } from "@/design-system/motion";
import { useEnvironment } from "@/environment/environment";
import { formatCount } from "@/lib/format";

// 首次出现直接显示最终值，只有数值变化时才从旧值滚动过去，避免“先 1 再 5”的跳变
export function CountUp({ value, format = (v) => formatCount(Math.round(v)) }: { value: number; format?: (v: number) => string }) {
  const { reduceMotion } = useEnvironment();
  const mv = useMotionValue(value);
  const text = useTransform(mv, format);
  useEffect(() => {
    if (mv.get() === value) return;
    if (reduceMotion) return mv.jump(value);
    const controls = animate(mv, value, counterTransition);
    return () => controls.stop();
  }, [mv, value, reduceMotion]);
  return <m.span className="tabular-nums">{text}</m.span>;
}

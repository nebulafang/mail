"use client";

import { useRef } from "react";
import { haptic } from "@/design-system/haptics";
import { useEnvironment } from "@/environment/environment";

const SHAKE: Keyframe[] = [0, -10, 8, -5, 3, 0].map((x) => ({ translate: `${x}px 0` }));

export function useShake<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { reduceMotion } = useEnvironment();
  const shake = () => {
    haptic("error");
    if (!reduceMotion) ref.current?.animate(SHAKE, { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  };
  return { ref, shake };
}

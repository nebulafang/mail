"use client";

import type { SceneId } from "@/design-system/scenes";
import { cn } from "@/lib/utils";
import { useScene } from "./context";
import { SakuraArt } from "./sakura";
import { StarryArt } from "./starry";
import { SummerArt } from "./summer";

export function SceneBackdrop({ scene, still = false, className }: { scene?: SceneId; still?: boolean; className?: string }) {
  const current = useScene();
  const id = scene ?? current;
  if (id === "none") return null;
  return (
    <div aria-hidden data-scene={id} className={cn("scene", className)}>
      <div className="scene-sky absolute inset-0" />
      {id === "sakura" ? <SakuraArt still={still} /> : id === "starry" ? <StarryArt still={still} /> : <SummerArt still={still} />}
      <div className="scene-veil absolute inset-0" />
    </div>
  );
}
